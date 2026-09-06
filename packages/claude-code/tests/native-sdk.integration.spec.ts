import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getSessionMessages } from '@anthropic-ai/claude-agent-sdk'
import { TeammateLaunchRequestId } from '@deepseek-ai/dsh-experimental-agent-team'
import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { expect, it, vi } from 'vitest'
import { workflow } from '../../domain/tests/fixtures/host-workflow.ts'
import * as claude from '../lib/index.js'

it('uses the locked SDK and native process for authorized tools, durable replies and API-error confinement', async () => {
  const { ctx, lead, root } = await workflow()
  const configDir = join(root, 'claude-config')
  await mkdir(configDir)
  const outside = await mkdtemp(join(tmpdir(), 'claude-outside-workspace-'))
  await writeFile(join(outside, 'private.txt'), 'OUTSIDE_CWD_SENTINEL')
  await writeFile(join(root, 'allowed.txt'), 'INSIDE_CWD_SENTINEL')
  await symlink(join(outside, 'private.txt'), join(root, 'outside-link.txt'))
  vi.stubEnv('CLAUDE_CONFIG_DIR', configDir)
  const tools = [
    { name: 'Read', input: { file_path: join(root, 'allowed.txt') } },
    { name: 'Read', input: { file_path: join(outside, 'private.txt') } },
    { name: 'Read', input: { file_path: join(root, 'outside-link.txt') } },
    { name: 'Glob', input: { pattern: '**/*', path: outside } },
    { name: 'Grep', input: { pattern: 'OUTSIDE_CWD_SENTINEL', path: outside, output_mode: 'content' } },
    { name: 'Grep', input: { pattern: 'OUTSIDE_CWD_SENTINEL', path: root, output_mode: 'content' } },
    { name: 'mcp__dsh_team__team_members_list', input: {} },
    { name: 'mcp__dsh_team__team_tasks_list', input: { limit: 1 } },
    { name: 'mcp__dsh_team__team_tasks_get', input: { taskId: 'absent-task' } },
    { name: 'mcp__dsh_team__team_message_send', input: { target: 'lead', text: 'Native tool message.' } },
  ]
  const offered = new Set<string>()
  const replies: Array<{ tool_use_id: string; content: unknown; is_error?: boolean }> = []
  let step = 0
  let failing = false
  let nativeDiagnostics = ''
  const server = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk
    response.setHeader('Content-Type', 'application/json')
    if (request.url?.includes('count_tokens')) { response.end(JSON.stringify({ input_tokens: 10 })); return }
    if (!request.url?.includes('/messages')) { response.writeHead(404); response.end('{}'); return }
    if (failing) {
      response.writeHead(400)
      response.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'PRIVATE_NATIVE_ERROR' } }))
      return
    }
    const input = JSON.parse(body)
    for (const tool of input.tools ?? []) offered.add(tool.name)
    for (const message of input.messages ?? []) {
      if (message.role !== 'user' || !Array.isArray(message.content)) continue
      for (const block of message.content) {
        if (block.type === 'tool_result' && !replies.some(reply => reply.tool_use_id === block.tool_use_id)) replies.push(block)
      }
    }
    const tool = tools[step++]
    const content = tool === undefined
      ? [{ type: 'text', text: 'Native final answer.' }]
      : [{ type: 'tool_use', id: `toolu_native_${step}`, ...tool }]
    const message = { id: `msg_${randomUUID().replaceAll('-', '')}`, type: 'message', role: 'assistant', model: input.model,
      content, stop_reason: tool === undefined ? 'end_turn' : 'tool_use', stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 4 } }
    if (!input.stream) { response.end(JSON.stringify(message)); return }
    response.setHeader('Content-Type', 'text/event-stream')
    const emit = (type: string, value: object) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`)
    emit('message_start', { message: { ...message, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })
    for (const [index, block] of content.entries()) {
      emit('content_block_start', { index, content_block: block.type === 'text'
        ? { type: 'text', text: '' } : { ...block, input: {} } })
      emit('content_block_delta', { index, delta: block.type === 'text'
        ? { type: 'text_delta', text: block.text }
        : { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } })
      emit('content_block_stop', { index })
    }
    emit('message_delta', { delta: { stop_reason: message.stop_reason, stop_sequence: null }, usage: { output_tokens: 4 } })
    emit('message_stop', {})
    response.end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  class ControlledModelTransport extends LocalSubprocessRuntime {
    override spawn(spec: SubprocessSpawnSpec) {
      // Isolate HOME/config and supply only a local model endpoint with dummy
      // authentication. SDK, payload, process management and permissions stay real.
      const child = super.spawn({ ...spec, env: {
        PATH: process.env.PATH!, HOME: root, TMPDIR: root, CLAUDE_CONFIG_DIR: configDir,
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`, ANTHROPIC_API_KEY: 'local-fixture-key',
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1',
        HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '', NO_PROXY: '127.0.0.1',
      } })
      child.stderr?.on('data', chunk => { nativeDiagnostics = (nativeDiagnostics + String(chunk)).slice(-4000) })
      return child
    }
  }
  try {
    await ctx.plugin(ControlledModelTransport)
    const runtime = ctx.plugin(claude, { catalogOwnerService: 'digitalEmployees', cwd: root, model: 'claude-sonnet-4-6' })
    await runtime
    const launched = await ctx.agentTeams.spawnTeammate(lead.agent, {
      name: 'native-claude', description: 'Use the authorized Team channel.', context: 'fresh',
      prompt: [{ type: 'text', text: 'Read Team members and tasks, then send your result.' }], signal: new AbortController().signal,
      runtime: {
        kind: 'external-agent', provider: 'claude-code', launchRequestId: TeammateLaunchRequestId('claude-real-sdk'),
        profile: { persona: 'Be precise.', mission: 'Review source.', context: [], memory: [], toolPolicy: { mode: 'inherit', names: [] }, hooks: [] },
        requirements: { contextMode: 'fresh', profileCapabilities: ['persona', 'mission'], runtimeCapabilities: ['sandbox'] },
      },
    })
    const stored = await ctx.sessionPersistence.open(lead.agent.id, 'read')
    try {
      await expect.poll(() => ctx.agentTeams.listMembers(lead.agent).find(member => member.id === launched.member.id)?.status,
        { timeout: 25_000 }).toBe('idle')
      const accepted = (await stored.read(0)).filter(event => event.type === 'team/native-operation/committed')
      expect(accepted, JSON.stringify({ offered: [...offered], replies, accepted, nativeDiagnostics })).toHaveLength(2)
      expect([...offered].sort()).toEqual([...new Set(['Read', 'Glob', 'Grep', ...tools.map(tool => tool.name)])].sort())
      expect(replies.map(reply => reply.tool_use_id)).toEqual([
        'toolu_native_1', 'toolu_native_2', 'toolu_native_3', 'toolu_native_4', 'toolu_native_5',
        'toolu_native_6', 'toolu_native_7', 'toolu_native_8', 'toolu_native_9', 'toolu_native_10',
      ])
      expect(JSON.stringify(replies[0]!.content)).toContain('INSIDE_CWD_SENTINEL')
      for (const reply of replies.slice(1, 5)) expect(reply.is_error).toBe(true)
      for (const reply of replies.slice(1, 6)) expect(JSON.stringify(reply.content)).not.toContain('OUTSIDE_CWD_SENTINEL')
      expect(JSON.stringify(replies[6]!.content)).toContain('native-claude')
      expect(JSON.stringify(replies[8]!.content)).toContain('TEAM_TASK_NOT_FOUND')
      const events = (await stored.read(0)).filter(event => event.type === 'team/native-operation/committed')
      expect(events.map(event => event.data.message.content)).toEqual([
        [{ type: 'text', text: 'Native tool message.' }], [{ type: 'text', text: 'Native final answer.' }],
      ])
      expect(events[0]!.data.receipt.source).toEqual({ kind: 'tool', turnId: launched.member.externalRuntime!.initialTurnId, callId: 'toolu_native_10' })
      expect(events.every(event => event.data.message.senderId === launched.member.id)).toBe(true)
      const history = await getSessionMessages(launched.member.externalRuntime!.nativeHandle!, { dir: root })
      expect(history.at(-1)?.message).toMatchObject({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Native final answer.' }] })
      failing = true
      await ctx.agentTeams.sendMessage(lead.agent, {
        target: launched.member.name, content: [{ type: 'text', text: 'Continue the review.' }], signal: new AbortController().signal,
      })
      await expect.poll(async () => (await stored.read(0)).filter(event =>
        event.type === 'team/native-operation/committed'), { timeout: 15_000 }).toHaveLength(3)
      const terminal = (await stored.read(0)).filter(event => event.type === 'team/native-operation/committed').at(-1)!
      expect(terminal.data.receipt.result).toMatchObject({ operation: 'turns.settle', value: { outcome: 'failed' } })
      expect(terminal.data.message.content).toEqual([{ type: 'text', text: 'Claude Code work failed without a final response.' }])
      expect(JSON.stringify(await stored.read(0))).not.toContain('PRIVATE_NATIVE_ERROR')
      const failedHistory = await getSessionMessages(launched.member.externalRuntime!.nativeHandle!, { dir: root })
      expect(failedHistory.at(-1)?.message).toMatchObject({ model: '<synthetic>', stop_reason: 'stop_sequence' })
      const modelSteps = step
      await runtime.dispose()
      const replacement = ctx.plugin(claude, {
        catalogOwnerService: 'digitalEmployees', cwd: root, model: 'claude-sonnet-4-6',
      })
      await replacement
      await expect.poll(() => ctx.agentTeams.listMembers(lead.agent)
        .find(member => member.id === launched.member.id)?.status).toBe('idle')
      const evidence = await ctx.agentTeams.readTeammateRuntimeEvidence(lead.agent, launched.member.name, {
        limit: 100, signal: new AbortController().signal,
      })
      expect(evidence.items.filter(item => item.kind === 'turn').map(item => item.outcome)).toEqual(['completed', 'failed'])
      expect(step).toBe(modelSteps)
      await replacement.dispose()
    } finally { await stored.close() }
  } finally {
    try { await ctx.fiber.dispose() }
    finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
      vi.unstubAllEnvs()
      await rm(outside, { recursive: true, force: true })
    }
  }
}, 60_000)
