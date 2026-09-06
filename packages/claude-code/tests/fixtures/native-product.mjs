/** Deterministic external SDK boundary; Team, Loader and the managed process bridge stay real. */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { PassThrough } from 'node:stream'

export class NativeProduct {
  constructor(path, executable) {
    this.path = path
    this.executable = executable
    this.data = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { sessions: {} }
    this.live = new Set()
    this.pending = new Set()
    this.starts = 0
  }

  complete() {
    for (const finish of this.pending) finish()
    this.pending.clear()
  }

  getSessionInfo(handle) {
    return Promise.resolve(this.data.sessions[handle] ? { sessionId: handle } : undefined)
  }

  getSessionMessages(handle) {
    return Promise.resolve(structuredClone(this.data.sessions[handle]?.messages ?? []))
  }

  query({ prompt, options }) {
    assert.equal(options.persistSession, true)
    assert.equal(options.pathToClaudeCodeExecutable, this.executable)
    assert.equal(options.permissionMode, 'dontAsk')
    assert.deepEqual(options.tools, ['Read', 'Glob', 'Grep'])
    assert.deepEqual(options.allowedTools, ['Read', 'Glob', 'Grep'])
    assert.deepEqual(options.settingSources, [])
    assert.deepEqual(options.skills, [])
    assert.deepEqual(options.plugins, [])
    assert.deepEqual(options.mcpServers, {})
    assert.equal(options.strictMcpConfig, true)
    assert.deepEqual(options.sandbox, {
      enabled: true, failIfUnavailable: true, autoAllowBashIfSandboxed: false,
      allowUnsandboxedCommands: false,
      network: { allowedDomains: [], strictAllowlist: true, allowLocalBinding: false, allowAllUnixSockets: false },
      filesystem: { denyWrite: ['/'], denyRead: ['/'], allowRead: [options.cwd], disabled: false },
    })
    const handle = options.sessionId ?? options.resume
    assert.match(handle, /^[0-9a-f-]{36}$/)
    if (options.sessionId) {
      assert.ok(!this.data.sessions[handle], 'new queries must not replace an existing native Session')
      this.data.sessions[handle] = { messages: [] }
      this.starts += 1
    } else {
      assert.ok(this.data.sessions[handle], 'resume must use an existing native Session')
    }
    const messages = this.data.sessions[handle].messages
    const marker = prompt.split('\n')[0]
    assert.match(marker, /^\[dsh-agent-team:(launch|delivery):[0-9a-f]+\]$/)
    assert.ok(!messages.some(message => message.message.content.startsWith(marker)), 'accepted work must not be replayed')
    messages.push({ type: 'user', session_id: handle, message: { content: prompt } })
    writeFileSync(this.path, `${JSON.stringify(this.data)}\n`)
    const child = options.spawnClaudeCodeProcess({
      command: options.pathToClaudeCodeExecutable, args: ['--print'], cwd: options.cwd,
      env: options.env, signal: options.abortController.signal,
    })
    const gate = Promise.withResolvers()
    this.pending.add(gate.resolve)
    let closed = false
    const close = () => {
      closed = true
      this.pending.delete(gate.resolve)
      gate.resolve()
      child.kill('SIGTERM')
    }
    options.abortController.signal.addEventListener('abort', close, { once: true })
    return {
      close,
      async *[Symbol.asyncIterator]() {
        try {
          assert.equal((await options.canUseTool('Bash', {}, {})).behavior, 'deny')
          assert.equal((await options.onElicitation({}, {})).action, 'decline')
          assert.equal((await options.onUserDialog({}, {})).behavior, 'cancelled')
          yield { type: 'system', subtype: 'init', session_id: handle }
          await gate.promise
          if (!closed) yield {
            type: 'result', subtype: 'success', is_error: false, session_id: handle,
            usage: { input_tokens: 5, output_tokens: 2 },
          }
        } finally {
          options.abortController.signal.removeEventListener('abort', close)
        }
      },
    }
  }

  open(spec) {
    assert.deepEqual(spec.argv, [this.executable, '--print'])
    assert.ok(spec.cwd)
    assert.deepEqual(spec.stdio, { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' })
    const completion = Promise.withResolvers()
    const handle = {
      pid: 1234, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
      collected: {}, done: completion.promise,
      terminate: () => {
        this.live.delete(handle)
        completion.resolve({ exitCode: 0, signal: null })
      },
      waitForExit: async () => { await completion.promise; return true },
    }
    this.live.add(handle)
    return handle
  }
}
