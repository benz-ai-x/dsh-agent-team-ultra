/** Deterministic external app-server boundary; never substitutes a Team or Ultra service. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { PassThrough } from 'node:stream'

export class NativeProduct {
  constructor(path, wrapper) {
    this.path = path
    this.wrapper = wrapper
    this.data = existsSync(path)
      ? JSON.parse(readFileSync(path, 'utf8')) : { projects: {}, threads: {} }
    this.live = new Set()
    this.starts = 0
    this.pending = []
  }

  complete() {
    for (const finish of this.pending.splice(0)) finish()
  }

  open(spec) {
    assert.deepEqual(spec.argv, [process.execPath, this.wrapper, 'app-server', '--stdio'])
    const input = new PassThrough()
    const output = new PassThrough()
    const stderr = new PassThrough()
    const completion = Promise.withResolvers()
    const send = frame => output.write(`${JSON.stringify(frame)}\n`)
    const reply = (frame, result) => send({ id: frame.id, result })
    const policy = thread => ({ approvalPolicy: 'never', sandbox: { type: 'readOnly', networkAccess: false }, thread })
    const persist = () => writeFileSync(this.path, `${JSON.stringify(this.data)}\n`)
    let buffer = ''
    input.on('data', chunk => {
      buffer += chunk.toString()
      for (;;) {
        const end = buffer.indexOf('\n')
        if (end < 0) break
        const frame = JSON.parse(buffer.slice(0, end))
        buffer = buffer.slice(end + 1)
        const params = frame.params ?? {}
        switch (frame.method) {
          case 'initialize':
            reply(frame, {})
            break
          case 'initialized': break
          case 'project/create': {
            assert.match(params.idempotencyKey, /^dsh-agent-team-codex:/)
            const id = this.data.projects[params.idempotencyKey] ??= randomUUID()
            persist()
            reply(frame, { project: { id } })
            break
          }
          case 'thread/list':
            reply(frame, { data: Object.values(this.data.threads).filter(thread => thread.projectId === params.projectId) })
            break
          case 'thread/start': {
            assert.equal(params.ephemeral, false)
            assert.equal(params.approvalPolicy, 'never')
            assert.equal(params.sandbox, 'read-only')
            const thread = { id: randomUUID(), projectId: params.projectId, ephemeral: false, status: { type: 'idle' }, turns: [] }
            this.data.threads[thread.id] = thread
            this.starts += 1
            persist()
            reply(frame, policy(thread))
            break
          }
          case 'thread/resume':
            assert.equal(params.approvalPolicy, 'never')
            assert.equal(params.sandbox, 'read-only')
            assert.ok(this.data.threads[params.threadId], 'resume must use an existing native handle')
            reply(frame, policy(this.data.threads[params.threadId]))
            break
          case 'turn/start': {
            const thread = this.data.threads[params.threadId]
            assert.ok(thread)
            assert.ok(!thread.turns.some(turn => turn.items.some(item => item.clientId === params.clientUserMessageId)),
              'replay must not start another native turn')
            const turn = {
              id: randomUUID(), status: 'inProgress',
              items: [{ type: 'userMessage', clientId: params.clientUserMessageId, content: [] }],
            }
            thread.turns.push(turn)
            persist()
            reply(frame, { turn: { id: turn.id } })
            this.pending.push(() => {
              turn.status = 'completed'
              turn.completedAt = Math.floor(Date.now() / 1000)
              persist()
              send({ method: 'thread/tokenUsage/updated', params: {
                threadId: thread.id, turnId: turn.id, tokenUsage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
              } })
              send({ method: 'turn/completed', params: { threadId: thread.id, turn } })
            })
            break
          }
          case 'turn/interrupt':
            reply(frame, {})
            break
          default: throw new Error(`Unexpected external protocol request: ${frame.method}`)
        }
      }
    })
    const handle = {
      pid: 1234, stdin: input, stdout: output, stderr, collected: {}, done: completion.promise,
      terminate: () => {
        this.live.delete(handle)
        completion.resolve({ exitCode: 0, signal: null })
      },
      waitForExit: async () => {
        await completion.promise
        return true
      },
    }
    this.live.add(handle)
    return handle
  }
}
