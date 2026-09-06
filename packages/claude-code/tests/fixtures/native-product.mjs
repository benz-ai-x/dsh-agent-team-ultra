/** Deterministic external SDK boundary; Team, Loader and the managed process bridge stay real. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { PassThrough } from 'node:stream'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

export class NativeProduct {
  constructor(path, executable, { teamTools = false } = {}) {
    this.teamTools = teamTools
    this.channels = new Map()
    this.duplicateResults = new Set()
    this.failAfterResults = new Set()
    this.followupResults = new Map()
    this.path = path
    this.executable = executable
    this.data = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { sessions: {} }
    this.live = new Set()
    this.pending = new Set()
    this.starts = 0
  }

  complete(text, outcome = 'completed') {
    for (const finish of this.pending) finish({ text, outcome })
    this.pending.clear()
  }

  getSessionInfo(handle) {
    return Promise.resolve(this.data.sessions[handle] ? { sessionId: handle } : undefined)
  }

  getSessionMessages(handle) {
    return Promise.resolve(structuredClone(this.data.sessions[handle]?.messages ?? []))
  }

  recordFinal(handle, text, outcome = 'completed') {
    const assistant = { type: 'assistant', session_id: handle, parent_tool_use_id: null,
      uuid: randomUUID(), timestamp: new Date().toISOString(),
      message: { role: 'assistant', model: outcome === 'failed' ? '<synthetic>' : 'claude-sonnet-4-6',
        stop_reason: outcome === 'failed' ? 'stop_sequence' : 'end_turn', content: [{ type: 'text', text }],
        usage: { input_tokens: 5, output_tokens: 2 } } }
    this.data.sessions[handle].messages.push(assistant)
    writeFileSync(this.path, `${JSON.stringify(this.data)}\n`)
    return assistant
  }

  recordHistory(handle, entry) {
    this.data.sessions[handle].messages.push(structuredClone(entry))
    writeFileSync(this.path, `${JSON.stringify(this.data)}\n`)
  }

  replaceLatestTurnMarker(handle, marker) {
    const message = this.data.sessions[handle].messages.findLast(entry => entry.type === 'user')
    assert.ok(message, 'native Session must contain an accepted user turn')
    const prior = message.message.content
    const next = prior.replace(/^([^\n]+)\n\[dsh-agent-team:turn:[^\n]+\]/, `$1\n${marker}`)
    assert.notEqual(next, prior, 'accepted user turn must contain a turn marker')
    message.message.content = next
    writeFileSync(this.path, `${JSON.stringify(this.data)}\n`)
  }

  removeLatestTurnMarker(handle) {
    this.replaceLatestTurnMarker(handle, '')
  }

  query({ prompt, options }) {
    assert.equal(options.persistSession, true)
    assert.equal(options.pathToClaudeCodeExecutable, this.executable)
    assert.equal(options.permissionMode, 'dontAsk')
    assert.deepEqual(options.tools, ['Read', 'Glob', 'Grep'])
    const toolNames = ['team_members_list', 'team_tasks_list', 'team_tasks_get', 'team_message_send']
    assert.deepEqual(options.allowedTools, this.teamTools
      ? toolNames.map(name => `mcp__dsh_team__${name}`) : ['Read', 'Glob', 'Grep'])
    assert.deepEqual(options.settingSources, [])
    assert.deepEqual(options.skills, [])
    assert.deepEqual(options.plugins, [])
    assert.deepEqual(Object.keys(options.mcpServers), this.teamTools ? ['dsh_team'] : [])
    assert.equal(options.strictMcpConfig, true)
    assert.deepEqual(options.sandbox, {
      enabled: true, failIfUnavailable: true, autoAllowBashIfSandboxed: false,
      allowUnsandboxedCommands: false,
      network: { allowedDomains: [], strictAllowlist: true, allowLocalBinding: false, allowAllUnixSockets: false },
      filesystem: { denyWrite: ['/'], denyRead: ['/'], allowRead: [options.cwd], disabled: false },
    })
    const handle = options.sessionId ?? options.resume
    assert.match(handle, /^[0-9a-f-]{36}$/)
    if (this.teamTools) {
      const client = new Client({ name: 'claude-native-test', version: '2.1.241' })
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      const send = serverTransport.send.bind(serverTransport)
      serverTransport.send = async message => {
        if (this.dropNextToolReply && message.result?.content) {
          this.dropNextToolReply = false
          return
        }
        await send(message)
      }
      const ready = options.mcpServers.dsh_team.instance.connect(serverTransport).then(() => client.connect(clientTransport))
      this.channels.set(handle, { client, ready })
    }
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
    assert.ok(!messages.some(message => message.type === 'user' && message.message.content.startsWith(marker)), 'accepted work must not be replayed')
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
    const native = this
    return {
      close,
      async *[Symbol.asyncIterator]() {
        try {
          assert.equal((await options.canUseTool('Bash', {}, {})).behavior, 'deny')
          assert.equal((await options.onElicitation({}, {})).action, 'decline')
          assert.equal((await options.onUserDialog({}, {})).behavior, 'cancelled')
          await native.onTurnStart?.(handle)
          yield { type: 'system', subtype: 'init', session_id: handle }
          const completed = await gate.promise
          const text = completed?.text
          if (!closed && completed?.outcome === 'completed' && typeof text === 'string') {
            yield native.recordFinal(handle, text)
          }
          if (!closed && completed?.outcome === 'api-error') yield native.recordFinal(handle, text, 'failed')
          if (!closed) {
            const result = {
              type: 'result', session_id: handle, uuid: randomUUID(),
              ...(completed?.outcome === 'api-error'
                ? { subtype: 'success', is_error: true, result: text }
                : completed?.outcome === 'failed'
                ? { subtype: 'error_during_execution', is_error: true, errors: ['PRIVATE_NATIVE_ERROR'] }
                : { subtype: 'success', is_error: false, result: typeof text === 'string' ? text : '' }),
              usage: { input_tokens: 5, output_tokens: 2 },
            }
            yield result
            if (native.failAfterResults.delete(handle)) {
              throw new Error('PRIVATE_FAILURE_AFTER_TERMINAL')
            }
            if (native.duplicateResults.has(handle)) yield structuredClone(result)
            const followup = native.followupResults.get(handle)
            if (followup !== undefined) {
              native.followupResults.delete(handle)
              yield { ...structuredClone(result), ...structuredClone(followup), uuid: randomUUID() }
            }
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
