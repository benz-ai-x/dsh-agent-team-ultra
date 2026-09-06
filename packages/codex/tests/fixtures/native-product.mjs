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
    this.channels = new Map()
    this.calls = new Map()
    this.nextCall = 0
  }

  query(threadId, tool, args, overrides = {}) {
    return this.request(threadId, 'item/tool/call', { tool, arguments: args }, overrides)
  }

  request(threadId, method, args, overrides = {}) {
    const channel = this.channels.get(threadId)
    assert.ok(channel, 'a query requires the exact attached native thread')
    const turn = this.data.threads[threadId].turns.findLast(value => value.status === 'inProgress')
    assert.ok(turn, 'a query requires an active native turn')
    const id = `server-query-${++this.nextCall}`
    const completion = Promise.withResolvers()
    const params = { threadId, turnId: turn.id, ...(method === 'item/tool/call' ? { callId: id } : {}), ...args, ...overrides }
    this.calls.set(id, { completion, params, turn, method, channel })
    void completion.promise.catch(() => {})
    channel.send({ id, method, params })
    return completion.promise
  }

  complete(outcome = 'completed', text = 'Review complete.') {
    for (const finish of this.pending.splice(0)) finish(outcome, text)
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
        if (frame.method === undefined) {
          const call = this.calls.get(frame.id)
          assert.ok(call, 'the adapter must answer a known native request')
          this.calls.delete(frame.id)
          if (call.method === 'item/tool/call' && this.dropNextToolReply) {
            this.dropNextToolReply = false
            call.completion.reject(new Error('native tool reply lost after Host acceptance'))
            continue
          }
          if (frame.error !== undefined) call.completion.resolve({ error: frame.error })
          else if (call.method === 'item/tool/call') {
            const item = { type: 'dynamicToolCall', id: call.params.callId, tool: call.params.tool,
              arguments: call.params.arguments, ...frame.result,
              status: frame.result.success ? 'completed' : 'failed' }
            call.turn.items.push(item)
            persist()
            send({ method: 'item/completed', params: { threadId: call.params.threadId, turnId: call.params.turnId, item } })
            call.completion.resolve(frame.result)
          } else call.completion.resolve(frame.result)
          continue
        }
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
            const thread = { id: randomUUID(), projectId: params.projectId, ephemeral: false, status: { type: 'idle' }, turns: [],
              dynamicTools: params.dynamicTools ?? [] }
            this.data.threads[thread.id] = thread
            this.channels.set(thread.id, { send, completion })
            this.starts += 1
            persist()
            reply(frame, policy(thread))
            break
          }
          case 'thread/resume':
            assert.equal(params.approvalPolicy, 'never')
            assert.equal(params.sandbox, 'read-only')
            assert.ok(this.data.threads[params.threadId], 'resume must use an existing native handle')
            this.channels.set(params.threadId, { send, completion })
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
            thread.status = { type: 'active' }
            persist()
            const acceptance = this.onTurnStart?.(thread.id)
            if (acceptance === undefined) reply(frame, { turn: { id: turn.id } })
            else void acceptance.then(() => reply(frame, { turn: { id: turn.id } }), completion.reject)
            this.pending.push((outcome, text) => {
              turn.status = outcome
              thread.status = { type: 'idle' }
              turn.completedAt = Math.floor(Date.now() / 1000)
              turn.items.push(
                { type: 'reasoning', id: randomUUID(), summary: ['PRIVATE_REASONING'], content: [] },
                { type: 'agentMessage', id: randomUUID(), text: 'PRIVATE_COMMENTARY', phase: 'commentary' },
                { type: 'agentMessage', id: randomUUID(), text, phase: 'final_answer' },
              )
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
        for (const [id, call] of this.calls) {
          if (call.channel.completion !== completion) continue
          this.calls.delete(id)
          call.completion.reject(new Error('external app-server disconnected'))
        }
        for (const [id, channel] of this.channels) {
          if (channel.completion === completion) this.channels.delete(id)
        }
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
