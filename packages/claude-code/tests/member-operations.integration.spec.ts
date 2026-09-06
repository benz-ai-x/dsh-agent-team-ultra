import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import Subprocess, { type SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { TeammateLaunchRequestId } from '@deepseek-ai/dsh-experimental-agent-team'
import { describe, expect, it, vi } from 'vitest'
import { profile, workflow } from '../../domain/tests/fixtures/host-workflow.ts'
import type { DigitalEmployeeStudioView, SpawnDigitalEmployeeResult } from '../../domain/src/types.ts'
import { NativeProduct } from './fixtures/native-product.mjs'
import { claudeCodePackageBin } from '../src/product.ts'
import * as claude from '../lib/index.js'
import * as codex from '../../codex/lib/index.js'
import { NativeProduct as CodexProduct } from '../../codex/tests/fixtures/native-product.mjs'

const sdk = vi.hoisted(() => ({ native: undefined as NativeProduct | undefined }))
vi.mock('@anthropic-ai/claude-agent-sdk', async (original) => ({
  ...await original<typeof import('@anthropic-ai/claude-agent-sdk')>(),
  query: (...args: Parameters<NativeProduct['query']>) => sdk.native!.query(...args),
  getSessionInfo: (...args: Parameters<NativeProduct['getSessionInfo']>) => sdk.native!.getSessionInfo(...args),
  getSessionMessages: (...args: Parameters<NativeProduct['getSessionMessages']>) => sdk.native!.getSessionMessages(...args),
}))

async function claudeWorkflow(backend: 'json' | 'sqlite' = 'json', options: { root?: string; resumeLead?: boolean } = {},
  configure?: (native: NativeProduct, host: Awaited<ReturnType<typeof workflow>>) => void) {
  const host = await workflow(backend, options)
  const native = new NativeProduct(join(host.root, 'claude-native.json'), claudeCodePackageBin, { teamTools: true })
  const codexRequire = createRequire(new URL('../../codex/package.json', import.meta.url))
  const codexBin = resolve(dirname(codexRequire.resolve('@openai/codex/package.json')), 'bin/codex.js')
  const codexNative = new CodexProduct(join(host.root, 'codex-native.json'), codexBin)
  sdk.native = native
  configure?.(native, host)
  class NativeTransport extends Subprocess {
    override resolveExecutable(): never { throw new Error('the adapter must not search PATH') }
    override spawnTerminal(): never { throw new Error('the adapter must use the SDK process bridge') }
    override spawn(spec: SubprocessSpawnSpec) {
      return spec.argv[1] === codexBin ? codexNative.open(spec) : native.open(spec)
    }
  }
  await host.ctx.plugin(NativeTransport)
  const runtime = host.ctx.plugin(claude, { catalogOwnerService: 'digitalEmployees', cwd: host.root })
  await runtime
  if (options.resumeLead) {
    await expect.poll(() => host.ctx.agentTeams.listMembers(host.lead.agent).find(member => member.name === 'claude-reviewer')?.status).toBe('idle')
    const member = host.ctx.agentTeams.listMembers(host.lead.agent).find(member => member.name === 'claude-reviewer')!
    return { ...host, native, codexNative, runtime, member, handle: member.externalRuntime!.nativeHandle!, client: undefined }
  }
  const launched = await host.ctx.agentTeams.spawnTeammate(host.lead.agent, {
    name: 'claude-reviewer', description: 'Query the shared Team.', context: 'fresh',
    prompt: [{ type: 'text', text: 'Read the shared task board.' }], signal: new AbortController().signal,
    runtime: {
      kind: 'external-agent', provider: 'claude-code', launchRequestId: TeammateLaunchRequestId('claude-query-boundary'),
      profile: { persona: 'Be precise.', mission: 'Review source.', context: [], memory: [], toolPolicy: { mode: 'inherit', names: [] }, hooks: [] },
      requirements: { contextMode: 'fresh', profileCapabilities: ['persona', 'mission'], runtimeCapabilities: ['sandbox'] },
    },
  })
  const handle = launched.member.externalRuntime!.nativeHandle!
  const channel = native.channels.get(handle)!
  await channel.ready
  return { ...host, native, codexNative, runtime, member: launched.member, handle, client: channel.client }
}

describe('Claude Code authorized Team operations', () => {
  it('enforces UTF-8 request limits and the complete escaped MCP response limit', async () => {
    const { ctx, lead, client } = await claudeWorkflow()
    const empty = { operation: 'messages.send', target: 'lead', text: '' }
    const budget = 4096 - Buffer.byteLength(JSON.stringify(empty), 'utf8')
    const text = '🙂'.repeat(Math.floor(budget / 4)) + 'a'.repeat(budget % 4)
    expect(Buffer.byteLength(JSON.stringify({ ...empty, text }), 'utf8')).toBe(4096)
    const sent = await client!.callTool({ name: 'team_message_send', arguments: { target: 'lead', text },
      _meta: { 'claudecode/toolUseId': 'toolu_exact_utf8' } })
    expect(sent.isError).toBe(false)
    const oversized = await client!.callTool({ name: 'team_message_send', arguments: { target: 'lead', text: text + 'a' },
      _meta: { 'claudecode/toolUseId': 'toolu_over_utf8' } })
    expect(JSON.parse((oversized.content as Array<{ text: string }>)[0]!.text)).toMatchObject({
      ok: false, error: { code: 'TEAM_NATIVE_REQUEST_LIMIT' },
    })
    for (const subject of ['First task', 'Second task']) {
      await ctx.agentTeams.createTask(lead.agent, { subject, description: '\\'.repeat(12_000) })
    }
    const large = await client!.callTool({ name: 'team_tasks_list', arguments: { limit: 2 },
      _meta: { 'claudecode/toolUseId': 'toolu_escaped_result' } })
    expect(JSON.parse((large.content as Array<{ text: string }>)[0]!.text)).toMatchObject({
      ok: false, error: { code: 'CLAUDE_TEAM_RESULT_LIMIT' },
    })
    const smaller = await client!.callTool({ name: 'team_tasks_list', arguments: { limit: 1 },
      _meta: { 'claudecode/toolUseId': 'toolu_smaller_page' } })
    expect(smaller.isError).toBe(false)
    expect(Buffer.byteLength(JSON.stringify(smaller), 'utf8')).toBeLessThanOrEqual(65_536)
    const stored = await ctx.sessionPersistence.open(lead.agent.id, 'read')
    try {
      const events = (await stored.read(0)).filter(event => event.type === 'team/native-operation/committed')
      expect(events).toHaveLength(1)
      expect(events[0]!.data.message.content).toEqual([{ type: 'text', text }])
    } finally { await stored.close() }
  })

  it('bounds a final result without splitting Unicode or exceeding the escaped Host request limit', async () => {
    const { ctx, lead, native } = await claudeWorkflow()
    const original = '汉🙂"\\'.repeat(2_000)
    native.complete(original)
    const stored = await ctx.sessionPersistence.open(lead.agent.id, 'read')
    try {
      await expect.poll(async () => (await stored.read(0)).filter(event =>
        event.type === 'team/native-operation/committed')).toHaveLength(1)
      const event = (await stored.read(0)).find(event => event.type === 'team/native-operation/committed')!
      const text = event.data.message.content[0].text
      const suffix = '\n[Result truncated to the Team message limit.]'
      expect(text.endsWith(suffix)).toBe(true)
      expect(text.isWellFormed()).toBe(true)
      expect(original.startsWith(text.slice(0, -suffix.length))).toBe(true)
      const bytes = Buffer.byteLength(JSON.stringify({ operation: 'turns.settle', outcome: 'completed', text }), 'utf8')
      expect(bytes).toBeLessThanOrEqual(4096)
      expect(bytes).toBeGreaterThan(4092)
    } finally { await stored.close() }
  })

  it.each(['json', 'sqlite'] as const)('recovers an offline native API failure once through %s without forwarding diagnostics', async backend => {
    const first = await claudeWorkflow(backend)
    // This is the public history shape verified by the real locked SDK test.
    first.native.recordFinal(first.handle, 'API Error: 400 PRIVATE_NATIVE_ERROR', 'failed')
    await first.ctx.fiber.dispose()
    const second = await claudeWorkflow(backend, { root: first.root, resumeLead: true })
    expect(second.member.id).toBe(first.member.id)
    expect(second.handle).toBe(first.handle)
    expect(second.native.starts).toBe(0)
    const stored = await second.ctx.sessionPersistence.open(second.lead.agent.id, 'read')
    try {
      await expect.poll(async () => (await stored.read(0)).filter(event =>
        event.type === 'team/native-operation/committed')).toHaveLength(1)
      const event = (await stored.read(0)).find(event => event.type === 'team/native-operation/committed')!
      expect(event.data.message.content).toEqual([{ type: 'text', text: 'Claude Code work failed without a final response.' }])
      expect(event.data.receipt.result).toMatchObject({ operation: 'turns.settle', value: { outcome: 'failed' } })
      expect(JSON.stringify(event)).not.toContain('PRIVATE_NATIVE_ERROR')
    } finally { await stored.close() }
    await second.ctx.fiber.dispose()
    const third = await claudeWorkflow(backend, { root: first.root, resumeLead: true })
    const replay = await third.ctx.sessionPersistence.open(third.lead.agent.id, 'read')
    try {
      expect((await replay.read(0)).filter(event => event.type === 'team/native-operation/committed')).toHaveLength(1)
    } finally { await replay.close() }
  })

  it('keeps SDK API-error result text out of durable Team messages', async () => {
    const { ctx, lead, native } = await claudeWorkflow()
    // Locked payload 2.1.241 reports an HTTP 400 as success + is_error, with diagnostics in result.
    native.complete('API Error: 400 PRIVATE_NATIVE_ERROR', 'api-error')
    const stored = await ctx.sessionPersistence.open(lead.agent.id, 'read')
    try {
      await expect.poll(async () => (await stored.read(0)).filter(event =>
        event.type === 'team/native-operation/committed')).toHaveLength(1)
      const event = (await stored.read(0)).find(event => event.type === 'team/native-operation/committed')!
      expect(event.data.message.content).toEqual([{ type: 'text', text: 'Claude Code work failed without a final response.' }])
      expect(event.data.receipt.result).toMatchObject({ operation: 'turns.settle', value: { outcome: 'failed', status: 'queued' } })
      expect(JSON.stringify(event)).not.toContain('PRIVATE_NATIVE_ERROR')
    } finally { await stored.close() }
  })

  it.each(['failed', 'interrupted'] as const)('reports %s work to the Lead without exposing SDK diagnostics', async outcome => {
    const { ctx, lead, native, member } = await claudeWorkflow()
    if (outcome === 'failed') native.complete(undefined, 'failed')
    else expect(ctx.agentTeams.interrupt(lead.agent, member.name)).toEqual({ previousStatus: 'running' })
    const stored = await ctx.sessionPersistence.open(lead.agent.id, 'read')
    try {
      await expect.poll(async () => (await stored.read(0)).filter(event =>
        event.type === 'team/native-operation/committed')).toHaveLength(1)
      const event = (await stored.read(0)).find(event => event.type === 'team/native-operation/committed')!
      expect(event.data.message.content).toEqual([{ type: 'text', text: `Claude Code work ${outcome} without a final response.` }])
      expect(event.data.receipt.result).toMatchObject({ operation: 'turns.settle', value: { outcome, status: 'queued' } })
      expect(JSON.stringify(event)).not.toContain('PRIVATE_NATIVE_ERROR')
    } finally { await stored.close() }
  })

  it('bounds a query before durable member acceptance and permits a later authorized call', async () => {
    let early: unknown
    const { client } = await claudeWorkflow('json', {}, native => {
      native.onTurnStart = async handle => {
        const channel = native.channels.get(handle)!
        await channel.ready
        early = await channel.client.callTool({ name: 'team_members_list', arguments: {},
          _meta: { 'claudecode/toolUseId': 'toolu_before_acceptance' } })
        native.onTurnStart = undefined
      }
    })
    expect(early).toMatchObject({ isError: true, content: [{ type: 'text', text: JSON.stringify({
      ok: false, error: { code: 'CLAUDE_TEAM_UNAVAILABLE', message: 'This Team operation is unavailable.' },
    }) }] })
    expect((await client!.callTool({ name: 'team_members_list', arguments: {},
      _meta: { 'claudecode/toolUseId': 'toolu_after_acceptance' } })).isError).toBe(false)
  }, 10_000)

  it('revokes a departed Lead and retires the old MCP channel before restoring the same member in a new provider generation', async () => {
    const { ctx, lead, native, runtime, client, member, handle, root } = await claudeWorkflow()
    await lead.dispose()
    const refused = await client!.callTool({ name: 'team_members_list', arguments: {},
      _meta: { 'claudecode/toolUseId': 'toolu_revoked' } })
    expect(JSON.parse((refused.content as Array<{ text: string }>)[0]!.text)).toMatchObject({
      ok: false, error: { code: 'TEAM_NATIVE_GRANT_REVOKED' },
    })
    const resumed = await ctx.agents.resume({ resumeSessionId: lead.agent.id, agentOptions: {} })
    await expect.poll(async () => (await client!.callTool({ name: 'team_members_list', arguments: {},
      _meta: { 'claudecode/toolUseId': 'toolu_new_owner' } })).isError).toBe(false)
    await runtime.dispose()
    expect(native.live.size).toBe(0)
    await expect(client!.callTool({ name: 'team_members_list', arguments: {},
      _meta: { 'claudecode/toolUseId': 'toolu_old_process' } })).rejects.toThrow(/closed|connected/i)
    const replacement = ctx.plugin(claude, { catalogOwnerService: 'digitalEmployees', cwd: root })
    await replacement
    await expect.poll(() => ctx.agentTeams.listMembers(resumed.agent).find(value => value.id === member.id)?.status).toBe('idle')
    await expect(ctx.agentTeams.sendMessage(resumed.agent, {
      target: member.name, content: [{ type: 'text', text: 'Continue with the new generation.' }], signal: new AbortController().signal,
    })).resolves.toMatchObject({ status: 'accepted' })
    const restored = native.channels.get(handle)!
    await restored.ready
    expect((await restored.client.callTool({ name: 'team_members_list', arguments: {},
      _meta: { 'claudecode/toolUseId': 'toolu_current_process' } })).isError).toBe(false)
    expect(Object.keys(native.data.sessions)).toEqual([handle])
    await replacement.dispose()
    await resumed.dispose()
    expect(native.live.size).toBe(0)
  })

  it('retries a terminal that completed between old-grant revocation and same-provider rebinding', async () => {
    const { ctx, lead, native, member } = await claudeWorkflow()
    await lead.dispose()
    native.complete('Completed while the Team owner was changing.')
    await expect.poll(() => native.live.size).toBe(0)

    const resumed = await ctx.agents.resume({ resumeSessionId: lead.agent.id, agentOptions: {} })
    await expect.poll(() => ctx.agentTeams.listMembers(resumed.agent)
      .find(candidate => candidate.id === member.id)?.status).toBe('idle')
    const stored = await ctx.sessionPersistence.open(resumed.agent.id, 'read')
    try {
      await expect.poll(async () => (await stored.read(0)).filter(event =>
        event.type === 'team/native-operation/committed')).toHaveLength(1)
      const event = (await stored.read(0)).find(event => event.type === 'team/native-operation/committed')!
      expect(event.data).toMatchObject({
        message: { senderId: member.id,
          content: [{ type: 'text', text: 'Completed while the Team owner was changing.' }] },
        receipt: { source: { kind: 'settlement', turnId: member.externalRuntime!.initialTurnId },
          result: { operation: 'turns.settle', value: { outcome: 'completed' } } },
      })
    } finally {
      await stored.close()
      await resumed.dispose()
    }
  })

  it('retries failed native recovery after the same provider receives a new Team grant', async () => {
    const first = await claudeWorkflow()
    first.native.complete('Committed before the Team owner restarted.')
    await expect.poll(() => first.ctx.agentTeams.listMembers(first.lead.agent)
      .find(candidate => candidate.id === first.member.id)?.status).toBe('idle')
    await first.ctx.fiber.dispose()

    let flush: ReturnType<typeof vi.spyOn> | undefined
    const second = await claudeWorkflow('json', { root: first.root, resumeLead: true }, (_native, host) => {
      flush = vi.spyOn(host.ctx.sessions, 'flush')
        .mockRejectedValueOnce(new Error('injected first recovery flush failure'))
    })
    await expect.poll(() => flush?.mock.calls.length ?? 0).toBe(1)
    await second.lead.dispose()
    const resumed = await second.ctx.agents.resume({
      resumeSessionId: second.lead.agent.id,
      agentOptions: { provider: 'changed-lead', model: 'reviewer' },
    })
    await expect.poll(() => second.ctx.agentTeams.listMembers(resumed.agent)
      .find(candidate => candidate.id === first.member.id)?.status).toBe('idle')
    await expect.poll(() => flush?.mock.calls.length ?? 0).toBeGreaterThanOrEqual(2)
    const evidence = await second.ctx.agentTeams.readTeammateRuntimeEvidence(resumed.agent, first.member.name, {
      limit: 100, signal: new AbortController().signal,
    })
    expect(evidence.items.filter(item => item.kind === 'turn')).toEqual([
      expect.objectContaining({ turnId: first.member.externalRuntime!.initialTurnId, outcome: 'completed' }),
    ])
    await expect(second.ctx.agentTeams.sendMessage(resumed.agent, {
      target: first.member.name,
      content: [{ type: 'text', text: 'Continue after recovery was retried.' }],
      signal: new AbortController().signal,
    })).resolves.toMatchObject({ status: 'accepted' })
    await expect.poll(() => second.native.data.sessions[second.handle].messages
      .filter(message => message.type === 'user')).toHaveLength(2)
    second.native.complete('Recovery retry kept delivery available.')
    flush?.mockRestore()
    await resumed.dispose()
  })

  it('keeps later deliveries blocked while native recovery remains rejected', async () => {
    const first = await claudeWorkflow()
    first.native.replaceLatestTurnMarker(first.handle, '[dsh-agent-team:turn:malformed-native-identity]')
    await first.ctx.fiber.dispose()

    const second = await claudeWorkflow('json', { root: first.root, resumeLead: true })
    await expect(second.ctx.agentTeams.readTeammateRuntimeEvidence(second.lead.agent, second.member.name, {
      limit: 100, signal: new AbortController().signal,
    })).rejects.toThrow(/native turn marker conflicts with Team history/)
    const send = (text: string) => second.ctx.agentTeams.sendMessage(second.lead.agent, {
      target: second.member.name,
      content: [{ type: 'text', text }],
      signal: new AbortController().signal,
    })
    expect(await send('First follow-up after failed recovery.')).toMatchObject({ status: 'queued' })
    let unexpectedStarts = 0
    second.native.onTurnStart = async () => {
      unexpectedStarts += 1
      second.native.complete('This work must remain blocked by failed recovery.')
    }
    try {
      expect(await send('Second follow-up after failed recovery.')).toMatchObject({ status: 'queued' })
      expect(unexpectedStarts, 'No native turn may start after recovery rejected the Session identity').toBe(0)
      expect(second.native.data.sessions[second.handle].messages.filter(message => message.type === 'user')).toHaveLength(1)
    } finally {
      await second.ctx.fiber.dispose()
    }
  })

  it('keeps duplicate native terminal notifications in one bound Run with one usage occurrence and immutable Profile', async () => {
    const { ctx, lead, native, invoke } = await claudeWorkflow()
    await expect(invoke('save', { expectedHeadRevision: null, profile: { ...profile, continuationProvider: '' },
      runtimeTarget: { kind: 'external-agent', provider: 'claude-code' } })).resolves.toMatchObject({ ok: true })
    await expect(invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 })).resolves.toMatchObject({ ok: true })
    const launched = await invoke('spawn', { launchRequestId: '77777777-7777-4777-8777-777777777729', profileId: profile.id }) as SpawnDigitalEmployeeResult
    if (!launched.ok || !launched.value.nativeRuntimeHandle) throw new Error('the bound native employee must launch')
    const handle = launched.value.nativeRuntimeHandle
    native.duplicateResults.add(handle)
    const channel = native.channels.get(handle)!
    await channel.ready
    expect((await channel.client.callTool({ name: 'team_members_list', arguments: {},
      _meta: { 'claudecode/toolUseId': 'toolu_bound_read' } })).isError).toBe(false)
    await expect(invoke('save', { expectedHeadRevision: 2, profile: { ...profile, continuationProvider: '', persona: 'Changed for future launches.' },
      runtimeTarget: { kind: 'external-agent', provider: 'claude-code' } })).resolves.toMatchObject({ ok: true })
    native.complete('INTENTIONAL_CLAUDE_FINAL_RESULT')
    await expect.poll(() => ctx.agentTeams.listMembers(lead.agent).find(member => member.id === launched.value.memberId)?.status).toBe('idle')
    const view = await invoke('view') as DigitalEmployeeStudioView
    expect(view.runs).toHaveLength(1)
    expect(view.runs[0]).toMatchObject({ profileRevision: 1 })
    const detail = await invoke('run', { runId: view.runs[0]!.runId })
    expect(detail).toMatchObject({ ok: true, value: { run: { terminal: 'completed', usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 } } } })
    expect((detail as { value: { timeline: Array<{ kind: string }> } }).value.timeline.filter(item => item.kind === 'usage')).toHaveLength(1)
    expect(JSON.stringify([view, detail])).not.toContain('INTENTIONAL_CLAUDE_FINAL_RESULT')
    const stored = await ctx.sessionPersistence.open(lead.agent.id, 'read')
    try {
      expect((await stored.read(0)).filter(event => event.type === 'team/native-operation/committed'
        && event.data.message.senderId === launched.value.memberId)).toHaveLength(1)
    } finally { await stored.close() }
  })

  it('keeps the first native terminal authoritative when a later terminal conflicts', async () => {
    const { ctx, lead, native, member, handle } = await claudeWorkflow()
    native.followupResults.set(handle, {
      subtype: 'success', is_error: false, result: 'PRIVATE_CONFLICTING_LATE_RESULT',
      usage: { input_tokens: 99, output_tokens: 99 },
    })
    native.complete('The first terminal result.')
    const stored = await ctx.sessionPersistence.open(lead.agent.id, 'read')
    try {
      await expect.poll(async () => (await stored.read(0)).filter(event =>
        event.type === 'team/native-operation/committed')).toHaveLength(1)
      const events = (await stored.read(0)).filter(event => event.type === 'team/native-operation/committed')
      expect(events[0]!.data.message.content).toEqual([{ type: 'text', text: 'The first terminal result.' }])
      expect(JSON.stringify(events)).not.toContain('PRIVATE_CONFLICTING_LATE_RESULT')
      const evidence = await ctx.agentTeams.readTeammateRuntimeEvidence(lead.agent, member.name, {
        limit: 100, signal: new AbortController().signal,
      })
      expect(evidence.items.filter(item => item.kind === 'usage')).toEqual([
        expect.objectContaining({ usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 } }),
      ])
    } finally { await stored.close() }
  })

  it('keeps the first native terminal authoritative when the SDK iterator later fails', async () => {
    const { ctx, lead, native, member, handle } = await claudeWorkflow()
    native.failAfterResults.add(handle)
    native.complete('The accepted terminal result.')
    const stored = await ctx.sessionPersistence.open(lead.agent.id, 'read')
    try {
      await expect.poll(async () => (await stored.read(0)).filter(event =>
        event.type === 'team/native-operation/committed')).toHaveLength(1)
      const events = (await stored.read(0)).filter(event => event.type === 'team/native-operation/committed')
      expect(events[0]!.data.message.content).toEqual([{ type: 'text', text: 'The accepted terminal result.' }])
      expect(events[0]!.data.receipt.result).toMatchObject({
        operation: 'turns.settle', value: { outcome: 'completed' },
      })
      expect(JSON.stringify(events)).not.toContain('PRIVATE_FAILURE_AFTER_TERMINAL')
      const evidence = await ctx.agentTeams.readTeammateRuntimeEvidence(lead.agent, member.name, {
        limit: 100, signal: new AbortController().signal,
      })
      expect(evidence.items.filter(item => item.kind === 'turn')).toEqual([
        expect.objectContaining({ outcome: 'completed' }),
      ])
      expect(evidence.items.filter(item => item.kind === 'usage')).toHaveLength(1)
    } finally { await stored.close() }
  })

  it('restores complete Run evidence from an already committed native turn after restart', async () => {
    const first = await claudeWorkflow()
    await expect(first.invoke('save', { expectedHeadRevision: null, profile: { ...profile, continuationProvider: '' },
      runtimeTarget: { kind: 'external-agent', provider: 'claude-code' } })).resolves.toMatchObject({ ok: true })
    await expect(first.invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 }))
      .resolves.toMatchObject({ ok: true })
    const launched = await first.invoke('spawn', {
      launchRequestId: '77777777-7777-4777-8777-777777777730', profileId: profile.id,
    }) as SpawnDigitalEmployeeResult
    if (!launched.ok || !launched.value.nativeRuntimeHandle) throw new Error('the bound native employee must launch')
    const member = first.ctx.agentTeams.listMembers(first.lead.agent)
      .find(candidate => candidate.id === launched.value.memberId)!
    first.native.complete('The original committed review is complete.')
    await expect.poll(() => first.ctx.agentTeams.listMembers(first.lead.agent)
      .find(candidate => candidate.id === member.id)?.status).toBe('idle')
    await first.ctx.fiber.dispose()

    const second = await claudeWorkflow('json', { root: first.root, resumeLead: true })
    expect(second.ctx.agentTeams.listMembers(second.lead.agent).find(candidate => candidate.id === member.id)
      ?.externalRuntime?.nativeHandle).toBe(launched.value.nativeRuntimeHandle)
    expect(second.native.starts).toBe(0)
    await expect.poll(async () => ((await second.invoke('view')) as DigitalEmployeeStudioView).runs.length).toBe(1)
    const view = await second.invoke('view') as DigitalEmployeeStudioView
    expect(view.runs).toHaveLength(1)
    const detail = await second.invoke('run', { runId: view.runs[0]!.runId })
    expect(detail).toMatchObject({ ok: true, value: { run: {
      canonicalTurnId: member.externalRuntime!.initialTurnId,
      terminal: 'completed',
      usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
      completeness: { status: 'complete' },
    } } })
    expect((detail as { value: { timeline: Array<{ kind: string }> } }).value.timeline
      .filter(item => item.kind === 'turn')).toHaveLength(1)
  })

  it('shrinks oversized Host recovery pages and restores every committed turn', async () => {
    const first = await claudeWorkflow()
    const text = '界'.repeat(1300)
    for (let index = 0; index < 17; index += 1) {
      first.native.complete(text)
      await expect.poll(() => first.ctx.agentTeams.listMembers(first.lead.agent)
        .find(member => member.id === first.member.id)?.status).toBe('idle')
      if (index === 16) break
      await first.ctx.agentTeams.sendMessage(first.lead.agent, {
        target: first.member.name,
        content: [{ type: 'text', text: `Continue recovery page work ${index}.` }],
        signal: new AbortController().signal,
      })
    }
    await first.ctx.fiber.dispose()

    const second = await claudeWorkflow('json', { root: first.root, resumeLead: true })
    const evidence = await second.ctx.agentTeams.readTeammateRuntimeEvidence(second.lead.agent, second.member.name, {
      limit: 100, signal: new AbortController().signal,
    })
    expect(evidence.complete).toBe(true)
    expect(evidence.items.filter(item => item.kind === 'turn')).toHaveLength(17)
    expect(evidence.items.filter(item => item.kind === 'usage')).toHaveLength(17)
    expect(second.native.starts).toBe(0)
  }, 20_000)

  it('keeps a committed Host terminal authoritative over a late old-generation native reply', async () => {
    const first = await claudeWorkflow()
    first.native.complete('The original generation result.')
    await expect.poll(() => first.ctx.agentTeams.listMembers(first.lead.agent)
      .find(member => member.id === first.member.id)?.status).toBe('idle')
    first.native.recordFinal(first.handle, 'PRIVATE_LATE_OLD_GENERATION_RESULT')
    await first.ctx.fiber.dispose()

    const second = await claudeWorkflow('json', { root: first.root, resumeLead: true })
    const evidence = await second.ctx.agentTeams.readTeammateRuntimeEvidence(second.lead.agent, second.member.name, {
      limit: 100, signal: new AbortController().signal,
    })
    expect(evidence.items.filter(item => item.kind === 'turn')).toEqual([
      expect.objectContaining({ turnId: first.member.externalRuntime!.initialTurnId, outcome: 'completed' }),
    ])
    expect(evidence.items.filter(item => item.kind === 'usage')).toEqual([
      expect.objectContaining({ usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 } }),
    ])
    const stored = await second.ctx.sessionPersistence.open(second.lead.agent.id, 'read')
    try {
      const events = (await stored.read(0)).filter(event => event.type === 'team/native-operation/committed')
      expect(events).toHaveLength(1)
      expect(events[0]!.data.message.content).toEqual([{ type: 'text', text: 'The original generation result.' }])
      expect(JSON.stringify(events)).not.toContain('PRIVATE_LATE_OLD_GENERATION_RESULT')
    } finally { await stored.close() }
  })

  it('refuses a recognized Host work marker paired with a malformed native turn identity', async () => {
    const first = await claudeWorkflow()
    first.native.replaceLatestTurnMarker(first.handle, '[dsh-agent-team:turn:malformed-native-identity]')
    await first.ctx.fiber.dispose()

    const second = await claudeWorkflow('json', { root: first.root, resumeLead: true })
    await expect(second.ctx.agentTeams.readTeammateRuntimeEvidence(second.lead.agent, second.member.name, {
      limit: 100, signal: new AbortController().signal,
    })).rejects.toThrow(/native turn marker conflicts with Team history/)
    const stored = await second.ctx.sessionPersistence.open(second.lead.agent.id, 'read')
    try {
      expect((await stored.read(0)).filter(event => event.type === 'team/native-operation/committed')).toHaveLength(0)
    } finally { await stored.close() }
  })

  it('refuses a Host work marker followed by a noncanonical legacy boundary', async () => {
    const first = await claudeWorkflow()
    first.native.replaceLatestTurnMarker(first.handle, 'PRIVATE_NONCANONICAL_BOUNDARY')
    first.native.recordFinal(first.handle, 'PRIVATE_FORGED_TERMINAL')
    await first.ctx.fiber.dispose()

    const second = await claudeWorkflow('json', { root: first.root, resumeLead: true })
    await expect(second.ctx.agentTeams.readTeammateRuntimeEvidence(second.lead.agent, second.member.name, {
      limit: 100, signal: new AbortController().signal,
    })).rejects.toThrow(/native turn marker conflicts with Team history/)
    const stored = await second.ctx.sessionPersistence.open(second.lead.agent.id, 'read')
    try {
      expect((await stored.read(0)).filter(event =>
        event.type === 'team/native-operation/committed')).toHaveLength(0)
    } finally { await stored.close() }
  })

  it('refuses a repeated canonical work boundary before it can adopt a forged terminal', async () => {
    const first = await claudeWorkflow()
    const original = first.native.data.sessions[first.handle].messages
      .find(message => message.type === 'user')!.message.content
    first.native.recordHistory(first.handle, {
      type: 'user', session_id: first.handle, parent_tool_use_id: null,
      message: { content: original },
    })
    first.native.recordFinal(first.handle, 'PRIVATE_REPEATED_BOUNDARY_RESULT')
    await first.ctx.fiber.dispose()

    const second = await claudeWorkflow('json', { root: first.root, resumeLead: true })
    await expect(second.ctx.agentTeams.readTeammateRuntimeEvidence(second.lead.agent, second.member.name, {
      limit: 100, signal: new AbortController().signal,
    })).rejects.toThrow(/repeats a Team work marker/)
    const stored = await second.ctx.sessionPersistence.open(second.lead.agent.id, 'read')
    try {
      const encoded = JSON.stringify((await stored.read(0)).filter(event => event.type === 'team/native-operation/committed'))
      expect(encoded).not.toContain('PRIVATE_REPEATED_BOUNDARY_RESULT')
      expect(JSON.parse(encoded)).toHaveLength(0)
    } finally { await stored.close() }
  })

  it('settles an accepted turn without a native terminal as interrupted after restart', async () => {
    const first = await claudeWorkflow()
    await first.ctx.fiber.dispose()

    const second = await claudeWorkflow('json', { root: first.root, resumeLead: true })
    const evidence = await second.ctx.agentTeams.readTeammateRuntimeEvidence(second.lead.agent, second.member.name, {
      limit: 100, signal: new AbortController().signal,
    })
    expect(evidence.items.filter(item => item.kind === 'turn')).toEqual([
      expect.objectContaining({ turnId: first.member.externalRuntime!.initialTurnId, outcome: 'interrupted' }),
    ])
    const stored = await second.ctx.sessionPersistence.open(second.lead.agent.id, 'read')
    try {
      const events = (await stored.read(0)).filter(event => event.type === 'team/native-operation/committed')
      expect(events).toHaveLength(1)
      expect(events[0]!.data).toMatchObject({
        message: { senderId: first.member.id,
          content: [{ type: 'text', text: 'Claude Code work interrupted without a final response.' }] },
        receipt: { source: { kind: 'settlement', turnId: first.member.externalRuntime!.initialTurnId },
          result: { operation: 'turns.settle', value: { outcome: 'interrupted' } } },
      })
    } finally { await stored.close() }
  })

  it('ignores a completed native reply that arrives after recovery committed interruption', async () => {
    const first = await claudeWorkflow()
    await first.ctx.fiber.dispose()

    const second = await claudeWorkflow('json', { root: first.root, resumeLead: true })
    await second.ctx.agentTeams.readTeammateRuntimeEvidence(second.lead.agent, second.member.name, {
      limit: 100, signal: new AbortController().signal,
    })
    second.native.recordFinal(second.handle, 'PRIVATE_REPLY_AFTER_INTERRUPTION')
    await second.ctx.fiber.dispose()

    const third = await claudeWorkflow('json', { root: first.root, resumeLead: true })
    const evidence = await third.ctx.agentTeams.readTeammateRuntimeEvidence(third.lead.agent, third.member.name, {
      limit: 100, signal: new AbortController().signal,
    })
    expect(evidence.items.filter(item => item.kind === 'turn')).toEqual([
      expect.objectContaining({ turnId: first.member.externalRuntime!.initialTurnId, outcome: 'interrupted' }),
    ])
    expect(evidence.items.filter(item => item.kind === 'usage')).toHaveLength(0)
    const stored = await third.ctx.sessionPersistence.open(third.lead.agent.id, 'read')
    try {
      const events = (await stored.read(0)).filter(event => event.type === 'team/native-operation/committed')
      expect(events).toHaveLength(1)
      expect(events[0]!.data.receipt.result).toMatchObject({ operation: 'turns.settle', value: { outcome: 'interrupted' } })
      expect(JSON.stringify(events)).not.toContain('PRIVATE_REPLY_AFTER_INTERRUPTION')
    } finally { await stored.close() }
  })

  it('folds multiple historical assistant stages into one usage snapshot and terminal', async () => {
    const first = await claudeWorkflow()
    first.native.complete('Initial review finished.')
    await expect.poll(() => first.ctx.agentTeams.listMembers(first.lead.agent)
      .find(member => member.id === first.member.id)?.status).toBe('idle')
    await first.ctx.agentTeams.sendMessage(first.lead.agent, {
      target: first.member.name, content: [{ type: 'text', text: 'Inspect the second file.' }],
      signal: new AbortController().signal,
    })
    first.native.recordHistory(first.handle, {
      type: 'assistant', session_id: first.handle, parent_tool_use_id: null, uuid: 'history-tool-stage',
      timestamp: '2026-09-07T00:00:00.000Z',
      message: { role: 'assistant', model: 'claude-sonnet-4-6', stop_reason: 'tool_use',
        content: [{ type: 'text', text: 'Checking.' }, { type: 'tool_use', id: 'toolu_history_read', name: 'Read', input: {} }],
        usage: { input_tokens: 3, output_tokens: 1 } },
    })
    first.native.recordHistory(first.handle, {
      type: 'user', session_id: first.handle, parent_tool_use_id: null, uuid: 'history-tool-result',
      timestamp: '2026-09-07T00:00:00.500Z',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_history_read', content: 'file data' }] },
    })
    first.native.recordHistory(first.handle, {
      type: 'assistant', session_id: first.handle, parent_tool_use_id: null, uuid: 'history-final-stage',
      timestamp: '2026-09-07T00:00:01.000Z',
      message: { role: 'assistant', model: 'claude-sonnet-4-6', stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Second file' }, { type: 'text', text: 'is correct.' }],
        usage: { input_tokens: 2, output_tokens: 1 } },
    })
    await first.ctx.fiber.dispose()

    const second = await claudeWorkflow('json', { root: first.root, resumeLead: true })
    const evidence = await second.ctx.agentTeams.readTeammateRuntimeEvidence(second.lead.agent, second.member.name, {
      limit: 100, signal: new AbortController().signal,
    })
    expect(evidence.items.filter(item => item.kind === 'usage')).toHaveLength(2)
    expect(evidence.items.filter(item => item.kind === 'usage').at(-1)).toMatchObject({
      usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
    })
    expect(evidence.items.filter(item => item.kind === 'tool')).toEqual([
      expect.objectContaining({ name: 'read' }),
    ])
    expect(evidence.items.filter(item => item.kind === 'turn')).toHaveLength(2)
    const stored = await second.ctx.sessionPersistence.open(second.lead.agent.id, 'read')
    try {
      expect((await stored.read(0)).filter(event => event.type === 'team/native-operation/committed')
        .map(event => event.data.message.content[0].text)).toEqual([
        'Initial review finished.', 'Second file\nis correct.',
      ])
    } finally { await stored.close() }
  })

  it('does not adopt an unbranded historical end-turn as a completed Team result', async () => {
    const first = await claudeWorkflow()
    first.native.recordHistory(first.handle, {
      type: 'assistant', session_id: first.handle, parent_tool_use_id: null, uuid: 'history-unbranded-terminal',
      timestamp: '1960-01-01T00:00:00.000Z',
      message: { role: 'assistant', stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'PRIVATE_UNBRANDED_RESULT' }], usage: { input_tokens: 3, output_tokens: 1 } },
    })
    await first.ctx.fiber.dispose()

    const second = await claudeWorkflow('json', { root: first.root, resumeLead: true })
    const evidence = await second.ctx.agentTeams.readTeammateRuntimeEvidence(second.lead.agent, second.member.name, {
      limit: 100, signal: new AbortController().signal,
    })
    expect(evidence.items.filter(item => item.kind === 'turn')).toEqual([
      expect.objectContaining({ turnId: first.member.externalRuntime!.initialTurnId, outcome: 'interrupted' }),
    ])
    expect(evidence.items.every(item => item.timestamp >= 0)).toBe(true)
    const stored = await second.ctx.sessionPersistence.open(second.lead.agent.id, 'read')
    try {
      const events = (await stored.read(0)).filter(event => event.type === 'team/native-operation/committed')
      expect(events).toHaveLength(1)
      expect(events[0]!.data.message.content).toEqual([
        { type: 'text', text: 'Claude Code work interrupted without a final response.' },
      ])
      expect(JSON.stringify(events)).not.toContain('PRIVATE_UNBRANDED_RESULT')
    } finally { await stored.close() }
  })


  it('retains a usage occurrence without publishing unsafe cumulative counters', async () => {
    const first = await claudeWorkflow()
    first.native.recordHistory(first.handle, {
      type: 'assistant', session_id: first.handle, parent_tool_use_id: null, uuid: 'history-large-usage-stage',
      timestamp: '2026-09-07T00:00:00.000Z',
      message: { role: 'assistant', model: 'claude-sonnet-4-6', stop_reason: 'tool_use', content: [],
        usage: { input_tokens: Number.MAX_SAFE_INTEGER, output_tokens: 0 } },
    })
    first.native.recordHistory(first.handle, {
      type: 'assistant', session_id: first.handle, parent_tool_use_id: null, uuid: 'history-overflow-terminal',
      timestamp: '2026-09-07T00:00:01.000Z',
      message: { role: 'assistant', model: 'claude-sonnet-4-6', stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Recovered without unsafe counters.' }], usage: { input_tokens: 1, output_tokens: 0 } },
    })
    await first.ctx.fiber.dispose()

    const second = await claudeWorkflow('json', { root: first.root, resumeLead: true })
    const evidence = await second.ctx.agentTeams.readTeammateRuntimeEvidence(second.lead.agent, second.member.name, {
      limit: 100, signal: new AbortController().signal,
    })
    expect(evidence.items.filter(item => item.kind === 'usage')).toEqual([
      expect.not.objectContaining({ usage: expect.anything() }),
    ])
    expect(evidence.items.filter(item => item.kind === 'turn')).toEqual([
      expect.objectContaining({ outcome: 'completed' }),
    ])
  })

  it('excludes nested and unowned native history from the recovered Team turn', async () => {
    const first = await claudeWorkflow()
    first.native.recordHistory(first.handle, {
      type: 'assistant', session_id: first.handle, parent_tool_use_id: null, parent_agent_id: 'foreign-agent',
      uuid: 'nested-private-stage', timestamp: '2026-09-07T00:00:00.000Z',
      message: { role: 'assistant', model: 'claude-sonnet-4-6', stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'PRIVATE_NESTED_RESULT' }], usage: { input_tokens: 99, output_tokens: 99 } },
    })
    first.native.recordHistory(first.handle, {
      type: 'user', session_id: first.handle, parent_tool_use_id: null,
      message: { content: `[dsh-agent-team:delivery:${'a'.repeat(64)}]\n[dsh-agent-team:turn:claude-turn:${'b'.repeat(64)}]\n\nPRIVATE_UNOWNED_PROMPT` },
    })
    first.native.recordFinal(first.handle, 'PRIVATE_UNOWNED_RESULT')
    await first.ctx.fiber.dispose()

    const second = await claudeWorkflow('json', { root: first.root, resumeLead: true })
    const evidence = await second.ctx.agentTeams.readTeammateRuntimeEvidence(second.lead.agent, second.member.name, {
      limit: 100, signal: new AbortController().signal,
    })
    expect(evidence.items.filter(item => item.kind === 'turn')).toEqual([
      expect.objectContaining({ turnId: first.member.externalRuntime!.initialTurnId, outcome: 'interrupted' }),
    ])
    expect(evidence.items.filter(item => item.kind === 'usage' || item.kind === 'tool')).toHaveLength(0)
    const stored = await second.ctx.sessionPersistence.open(second.lead.agent.id, 'read')
    try {
      const encoded = JSON.stringify((await stored.read(0)).filter(event => event.type === 'team/native-operation/committed'))
      expect(encoded).not.toContain('PRIVATE_')
    } finally { await stored.close() }
  })

  it('exchanges durable peer messages between Claude and Codex without replacing either native identity', async () => {
    const { ctx, lead, native, codexNative, client, member, handle, root } = await claudeWorkflow()
    const codexRuntime = ctx.plugin(codex, { catalogOwnerService: 'digitalEmployees', cwd: root, sandbox: 'read-only' })
    await codexRuntime
    const peer = await ctx.agentTeams.spawnTeammate(lead.agent, {
      name: 'codex-peer', description: 'Verify findings.', context: 'fresh',
      prompt: [{ type: 'text', text: 'Review the shared source.' }], signal: new AbortController().signal,
      runtime: {
        kind: 'external-agent', provider: 'codex', launchRequestId: TeammateLaunchRequestId('codex-claude-peer'),
        profile: { persona: 'Be precise.', mission: 'Verify findings.', context: [], memory: [], toolPolicy: { mode: 'inherit', names: [] }, hooks: [] },
        requirements: { contextMode: 'fresh', profileCapabilities: ['persona', 'mission'], runtimeCapabilities: ['sandbox'] },
      },
    })
    const peerHandle = peer.member.externalRuntime!.nativeHandle!
    codexNative.complete('completed', 'Ready to verify.')
    await expect.poll(() => ctx.agentTeams.listMembers(lead.agent).find(value => value.id === peer.member.id)?.status).toBe('idle')
    expect((await client!.callTool({ name: 'team_message_send',
      arguments: { target: peer.member.name, text: 'Please verify the Claude finding.' },
      _meta: { 'claudecode/toolUseId': 'toolu_codex_peer' } })).isError).toBe(false)
    await expect.poll(() => codexNative.data.threads[peerHandle].turns).toHaveLength(2)
    const sent = await codexNative.query(peerHandle, 'team_message_send', { target: member.name, text: 'Codex verified the finding.' })
    expect(sent.success).toBe(true)
    native.complete('Waiting for the Codex response.')
    await expect.poll(() => native.data.sessions[handle].messages.filter(message => message.type === 'user')).toHaveLength(2)
    const transcript = await native.getSessionMessages(handle)
    expect(transcript.at(-1)!.message.content).toContain('Sender: codex-peer')
    expect(transcript.at(-1)!.message.content).toContain('Codex verified the finding.')
    const stored = await ctx.sessionPersistence.open(lead.agent.id, 'read')
    try {
      const messages = (await stored.read(0)).filter(event => event.type === 'team/native-operation/committed'
        && event.data.receipt.result.operation === 'messages.send')
      expect(messages.map(event => event.data.message)).toEqual([
        expect.objectContaining({ senderId: member.id, targetId: peer.member.id, content: [{ type: 'text', text: 'Please verify the Claude finding.' }] }),
        expect.objectContaining({ senderId: peer.member.id, targetId: member.id, content: [{ type: 'text', text: 'Codex verified the finding.' }] }),
      ])
    } finally { await stored.close() }
    expect(Object.keys(native.data.sessions)).toEqual([handle])
    expect(Object.keys(codexNative.data.threads)).toEqual([peerHandle])
    native.complete('Both native reviews are complete.')
    codexNative.complete('completed', 'Peer verification complete.')
  })

  it('exchanges attributed messages with a DSH peer through its unchanged native Session', async () => {
    const { ctx, lead, native, client, member, handle } = await claudeWorkflow()
    const peer = await ctx.agentTeams.spawnTeammate(lead.agent, {
      name: 'dsh-peer', description: 'Verify findings.', provider: 'spawn', context: 'fresh',
      prompt: [{ type: 'text', text: 'Review the shared source.' }],
      agentOptions: { provider: 'workflow', model: 'reviewer' }, signal: new AbortController().signal,
    })
    const sent = await client!.callTool({ name: 'team_message_send',
      arguments: { target: peer.member.name, text: 'Please verify my finding.' },
      _meta: { 'claudecode/toolUseId': 'toolu_peer' } })
    expect(sent.isError).toBe(false)
    const receipt = JSON.parse((sent.content as Array<{ text: string }>)[0]!.text)
    const stored = await ctx.sessionPersistence.open(peer.member.id, 'read')
    try {
      await expect.poll(async () => (await stored.read(0)).filter(event => event.type === 'user/message'
        && event.data.source?.kind === 'team-message' && event.data.source.messageId === receipt.value.messageId)).toHaveLength(1)
      const message = (await stored.read(0)).find(event => event.type === 'user/message'
        && event.data.source?.kind === 'team-message' && event.data.source.messageId === receipt.value.messageId)!
      expect(message.data.source).toMatchObject({ senderId: member.id, senderName: member.name })
    } finally { await stored.close() }
    native.complete('Waiting for peer verification.')
    await expect.poll(() => ctx.agentTeams.listMembers(lead.agent).find(value => value.id === member.id)?.status).toBe('idle')
    await expect.poll(() => ctx.agents.get(peer.member.id)).toBeUndefined()
    const resumed = await ctx.agents.resume({ resumeSessionId: peer.member.id, agentOptions: { provider: 'workflow', model: 'reviewer' } })
    try {
      await expect(ctx.agentTeams.sendMessage(resumed.agent, {
        target: member.name, content: [{ type: 'text', text: 'The finding is verified.' }], signal: new AbortController().signal,
      })).resolves.toMatchObject({ status: 'accepted' })
      const transcript = await native.getSessionMessages(handle)
      expect(transcript.filter(message => message.type === 'user')).toHaveLength(2)
      expect(transcript.at(-1)!.message.content).toContain('Sender: dsh-peer')
      expect(transcript.at(-1)!.message.content).toContain('The finding is verified.')
      expect(Object.keys(native.data.sessions)).toEqual([handle])
      const next = native.channels.get(handle)!
      await next.ready
      const reply = await next.client.callTool({ name: 'team_message_send', arguments: { target: 'lead', text: 'Peer verification complete.' },
        _meta: { 'claudecode/toolUseId': 'toolu_peer_final' } })
      expect(reply.isError).toBe(false)
    } finally { await resumed.dispose() }
  })

  it('rejects missing native identity, model-supplied authority, Lead tools and oversized requests without a durable mutation', async () => {
    const { ctx, lead, client } = await claudeWorkflow()
    const attempts = [
      { name: 'team_message_send', arguments: { target: 'lead', text: 'No trusted identity.' }, code: 'TEAM_NATIVE_CORRELATION_REQUIRED' },
      { name: 'team_message_send', arguments: { target: 'lead', text: 'Impersonation.', role: 'lead' }, code: 'TEAM_NATIVE_INVALID_REQUEST', callId: 'toolu_forged' },
      { name: 'team_message_send', arguments: { target: 'lead', text: 'Impersonation.', operation: 'turns.settle' }, code: 'TEAM_NATIVE_INVALID_REQUEST', callId: 'toolu_operation' },
      { name: 'teammate_spawn', arguments: {}, code: 'CLAUDE_TEAM_UNAVAILABLE', callId: 'toolu_spawn' },
      { name: 'team_task_update', arguments: {}, code: 'CLAUDE_TEAM_UNAVAILABLE', callId: 'toolu_task' },
      { name: 'team_message_send', arguments: { target: 'lead', text: 'x'.repeat(4096) }, code: 'TEAM_NATIVE_REQUEST_LIMIT', callId: 'toolu_host_limit' },
      { name: 'team_message_send', arguments: { target: 'lead', text: 'x'.repeat(16384) }, code: 'CLAUDE_TEAM_REQUEST_LIMIT', callId: 'toolu_native_limit' },
    ]
    for (const attempt of attempts) {
      const result = await client!.callTool({ name: attempt.name, arguments: attempt.arguments,
        ...(attempt.callId ? { _meta: { 'claudecode/toolUseId': attempt.callId } } : {}) })
      expect(result.isError).toBe(true)
      expect(JSON.parse((result.content as Array<{ text: string }>)[0]!.text)).toMatchObject({ ok: false, error: { code: attempt.code } })
    }
    const stored = await ctx.sessionPersistence.open(lead.agent.id, 'read')
    try {
      expect((await stored.read(0)).filter(event => event.type === 'team/native-operation/committed')).toHaveLength(0)
    } finally { await stored.close() }
  })

  it('recovers a lost 64th MCP receipt without spending another call identity or committing twice', async () => {
    const { ctx, lead, native, client, member } = await claudeWorkflow()
    for (let index = 0; index < 63; index += 1) {
      expect((await client!.callTool({ name: 'team_members_list', arguments: {},
        _meta: { 'claudecode/toolUseId': `toolu_read_${index}` } })).isError).toBe(false)
    }
    const request = { name: 'team_message_send', arguments: { target: 'lead', text: 'One durable progress message.' },
      _meta: { 'claudecode/toolUseId': 'toolu_message_64' } }
    native.dropNextToolReply = true
    await expect(client!.callTool(request, undefined, { timeout: 50 })).rejects.toThrow(/timed out/i)
    const stored = await ctx.sessionPersistence.open(lead.agent.id, 'read')
    try {
      const events = (await stored.read(0)).filter(event => event.type === 'team/native-operation/committed')
      expect(events).toHaveLength(1)
      expect(events[0]!.data).toMatchObject({
        message: { senderId: member.id, targetId: lead.agent.id, content: [{ type: 'text', text: request.arguments.text }] },
        receipt: { source: { kind: 'tool', callId: 'toolu_message_64', turnId: member.externalRuntime!.initialTurnId } },
      })
      const retry = await client!.callTool(request)
      expect(JSON.parse((retry.content as Array<{ text: string }>)[0]!.text)).toEqual(events[0]!.data.receipt.result)
      const conflict = await client!.callTool({ ...request, arguments: { ...request.arguments, text: 'Changed input.' } })
      expect(JSON.parse((conflict.content as Array<{ text: string }>)[0]!.text)).toMatchObject({
        ok: false, error: { code: 'TEAM_NATIVE_OPERATION_CONFLICT' },
      })
      const limited = await client!.callTool({ ...request, _meta: { 'claudecode/toolUseId': 'toolu_message_65' } })
      expect(JSON.parse((limited.content as Array<{ text: string }>)[0]!.text)).toMatchObject({
        ok: false, error: { code: 'CLAUDE_TEAM_RATE_LIMIT' },
      })
      expect((await stored.read(0)).filter(event => event.type === 'team/native-operation/committed')).toHaveLength(1)
    } finally { await stored.close() }
  })

  it.each(['json', 'sqlite'] as const)('recovers an offline follow-up result once from the same native Session on %s', async backend => {
    const first = await claudeWorkflow(backend)
    first.native.complete('Initial review finished.')
    await expect.poll(() => first.ctx.agentTeams.listMembers(first.lead.agent).find(member => member.id === first.member.id)?.status).toBe('idle')
    await first.ctx.agentTeams.sendMessage(first.lead.agent, {
      target: first.member.name, content: [{ type: 'text', text: 'Please continue the review.' }], signal: new AbortController().signal,
    })
    first.native.removeLatestTurnMarker(first.handle)
    first.native.recordFinal(first.handle, 'The offline follow-up found a second issue.')
    await first.ctx.fiber.dispose()
    const second = await claudeWorkflow(backend, { root: first.root, resumeLead: true })
    expect(second.member.id).toBe(first.member.id)
    expect(second.handle).toBe(first.handle)
    expect(second.native.starts).toBe(0)
    const stored = await second.ctx.sessionPersistence.open(second.lead.agent.id, 'read')
    try {
      await expect.poll(async () => (await stored.read(0)).filter(event =>
        event.type === 'team/native-operation/committed')).toHaveLength(2)
      const events = (await stored.read(0)).filter(event => event.type === 'team/native-operation/committed')
      expect(events.map(event => event.data.message.content[0].text)).toEqual([
        'Initial review finished.', 'The offline follow-up found a second issue.',
      ])
      expect(new Set(events.map(event => event.data.receipt.source.turnId)).size).toBe(2)
    } finally { await stored.close() }
    const evidence = await second.ctx.agentTeams.readTeammateRuntimeEvidence(second.lead.agent, second.member.name, {
      limit: 100, signal: new AbortController().signal,
    })
    expect(evidence.items.filter(item => item.kind === 'turn')).toHaveLength(2)
    await second.ctx.fiber.dispose()
    const third = await claudeWorkflow(backend, { root: first.root, resumeLead: true })
    const replay = await third.ctx.sessionPersistence.open(third.lead.agent.id, 'read')
    try {
      expect((await replay.read(0)).filter(event => event.type === 'team/native-operation/committed')).toHaveLength(2)
    } finally { await replay.close() }
  })

  it('persists the final Claude reply in the Lead mailbox under the original member and turn', async () => {
    const { ctx, lead, native, member } = await claudeWorkflow()
    native.complete('The shared source has one reviewed finding.')
    const stored = await ctx.sessionPersistence.open(lead.agent.id, 'read')
    try {
      await expect.poll(async () => (await stored.read(0)).filter(event =>
        event.type === 'team/native-operation/committed')).toHaveLength(1)
      const event = (await stored.read(0)).find(event => event.type === 'team/native-operation/committed')!
      expect(event.data).toMatchObject({
        message: { senderId: member.id, targetId: lead.agent.id,
          content: [{ type: 'text', text: 'The shared source has one reviewed finding.' }] },
        receipt: { source: { kind: 'settlement', turnId: member.externalRuntime!.initialTurnId },
          result: { ok: true, operation: 'turns.settle', value: { status: 'queued', outcome: 'completed' } } },
      })
    } finally { await stored.close() }
  })

  it('reads its canonical Team through the real SDK MCP server without acquiring Lead tools', async () => {
    const { ctx, lead, client, member } = await claudeWorkflow()
    const listed = await client!.listTools()
    expect(listed.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'team_members_list', 'team_tasks_list', 'team_tasks_get', 'team_message_send',
    ])
    const response = await client!.callTool({ name: 'team_members_list', arguments: {},
      _meta: { 'claudecode/toolUseId': 'toolu_members_1' } })
    expect(response.isError).toBe(false)
    const result = JSON.parse((response.content as Array<{ text: string }>)[0]!.text)
    expect(result).toEqual({ ok: true, operation: 'members.list', value: { members: expect.arrayContaining([
      expect.objectContaining({ name: 'claude-reviewer', id: member.id }),
    ]) } })
    expect(ctx.agentTeams.listMembers(lead.agent).map(member => member.name)).toEqual(['lead', 'claude-reviewer'])
  })
})
