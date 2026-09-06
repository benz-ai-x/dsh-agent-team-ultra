import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import Subprocess, { type SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { TeammateLaunchRequestId } from '@deepseek-ai/dsh-experimental-agent-team'
import { expect, it } from 'vitest'
import { profile, workflow } from '../../domain/tests/fixtures/host-workflow.ts'
import type { DigitalEmployeeStudioView, SpawnDigitalEmployeeResult } from '../../domain/src/types.ts'
import * as codex from '../lib/index.js'
import { NativeProduct } from './fixtures/native-product.mjs'

async function queryWorkflow(configure?: (native: NativeProduct) => void, backend: 'json' | 'sqlite' = 'json',
  options: { root?: string; resumeLead?: boolean } = {}) {
  const host = await workflow(backend, options)
  const require = createRequire(import.meta.url)
  const manifestPath = require.resolve('@openai/codex/package.json')
  const native = new NativeProduct(join(host.root, 'native.json'), resolve(dirname(manifestPath), 'bin/codex.js'))
  configure?.(native)
  class NativeTransport extends Subprocess {
    override resolveExecutable(): never { throw new Error('the adapter must not search PATH') }
    override spawnTerminal(): never { throw new Error('the adapter must use the app-server transport') }
    override spawn(spec: SubprocessSpawnSpec) { return native.open(spec) }
  }
  await host.ctx.plugin(NativeTransport)
  const runtime = host.ctx.plugin(codex, { catalogOwnerService: 'digitalEmployees', cwd: host.root, sandbox: 'read-only' })
  await runtime
  if (options.resumeLead) {
    const member = host.ctx.agentTeams.listMembers(host.lead.agent).find(value => value.name === 'codex-reviewer')!
    const handle = member.externalRuntime!.nativeHandle!
    await expect.poll(() => native.channels.has(handle)).toBe(true)
    return { ...host, native, runtime, member, handle }
  }
  const launched = await host.ctx.agentTeams.spawnTeammate(host.lead.agent, {
    name: 'codex-reviewer', description: 'Query the shared Team.', context: 'fresh',
    prompt: [{ type: 'text', text: 'Read the shared task board.' }], signal: new AbortController().signal,
    runtime: {
      kind: 'external-agent', provider: 'codex', launchRequestId: TeammateLaunchRequestId('codex-query-boundary'),
      profile: { persona: 'Be precise.', mission: 'Review source.', context: [], memory: [], toolPolicy: { mode: 'inherit', names: [] }, hooks: [] },
      requirements: { contextMode: 'fresh', profileCapabilities: ['persona', 'mission'], runtimeCapabilities: ['sandbox'] },
    },
  })
  return { ...host, native, runtime, member: launched.member, handle: launched.member.externalRuntime!.nativeHandle! }
}

function errorResult(code: string, message: string) {
  return { success: false, contentItems: [{ type: 'inputText', text: JSON.stringify({ ok: false, error: { code, message } }) }] }
}

it('delivers the final Codex answer through the durable member mailbox', async () => {
  const { ctx, lead, native, runtime, handle, member } = await queryWorkflow()
  const turnId = native.data.threads[handle].turns[0].id
  native.complete('completed', 'The shared source has one reviewed finding.')
  const stored = await ctx.sessionPersistence.open(lead.agent.id, 'read')
  try {
    await expect.poll(async () => (await stored.read(0)).filter(event =>
      event.type === 'team/native-operation/committed')).toHaveLength(1)
    const event = (await stored.read(0)).find(event => event.type === 'team/native-operation/committed')!
    expect(event.data).toEqual(expect.objectContaining({
      message: expect.objectContaining({ senderId: member.id, targetId: lead.agent.id,
        content: [{ type: 'text', text: 'The shared source has one reviewed finding.' }] }),
      receipt: expect.objectContaining({ source: { kind: 'settlement', turnId },
        result: { ok: true, operation: 'turns.settle', value: {
          messageId: expect.any(String), status: 'queued', outcome: 'completed',
        } } }),
    }))
    expect(JSON.stringify(event)).not.toMatch(/PRIVATE_REASONING|PRIVATE_COMMENTARY/)
  } finally {
    await stored.close()
  }
  await runtime.dispose()
  expect(native.live.size).toBe(0)
})

it.each(['failed', 'interrupted'] as const)('labels a %s Codex turn in the message received by the Lead', async outcome => {
  const { ctx, lead, native, runtime } = await queryWorkflow()
  native.complete(outcome, 'Partial review only.')
  const stored = await ctx.sessionPersistence.open(lead.agent.id, 'read')
  try {
    await expect.poll(async () => (await stored.read(0)).filter(event =>
      event.type === 'team/native-operation/committed')).toHaveLength(1)
    const event = (await stored.read(0)).find(event => event.type === 'team/native-operation/committed')!
    expect(event.data.message.content).toEqual([{ type: 'text', text: `Codex work ${outcome}.\n\nPartial review only.` }])
    expect(event.data.receipt.result.value.outcome).toBe(outcome)
  } finally { await stored.close() }
  await runtime.dispose()
})

it('marks a large final answer as truncated within the complete Team request byte limit', async () => {
  const { ctx, lead, native, runtime } = await queryWorkflow()
  native.complete('completed', '审阅😀"\\\n'.repeat(1_000))
  const stored = await ctx.sessionPersistence.open(lead.agent.id, 'read')
  try {
    await expect.poll(async () => (await stored.read(0)).filter(event =>
      event.type === 'team/native-operation/committed')).toHaveLength(1)
    const event = (await stored.read(0)).find(event => event.type === 'team/native-operation/committed')!
    const text = event.data.message.content[0].text
    expect(text).toMatch(/^审阅😀/)
    expect(text).toMatch(/\n\[Result truncated to the Team message limit\.\]$/)
    expect(text).not.toContain('\uFFFD')
    expect(Buffer.byteLength(JSON.stringify({ operation: 'turns.settle', outcome: 'completed', text }), 'utf8')).toBeLessThanOrEqual(4096)
  } finally { await stored.close() }
  await runtime.dispose()
})

it.each(['json', 'sqlite'] as const)('recovers an offline Codex terminal once through %s Host restart', async backend => {
  const first = await queryWorkflow(undefined, backend)
  const turnId = first.native.data.threads[first.handle].turns[0].id
  first.native.dropNextCompletion = true
  first.native.complete('completed', 'The offline review is ready.')
  await first.ctx.fiber.dispose()
  const second = await queryWorkflow(undefined, backend, { root: first.root, resumeLead: true })
  expect(second.member.id).toBe(first.member.id)
  expect(second.handle).toBe(first.handle)
  expect(second.native.starts).toBe(0)
  const stored = await second.ctx.sessionPersistence.open(second.lead.agent.id, 'read')
  try {
    await expect.poll(async () => (await stored.read(0)).filter(event =>
      event.type === 'team/native-operation/committed')).toHaveLength(1)
    const event = (await stored.read(0)).find(event => event.type === 'team/native-operation/committed')!
    expect(event.data).toEqual(expect.objectContaining({
      message: expect.objectContaining({ content: [{ type: 'text', text: 'The offline review is ready.' }] }),
      receipt: expect.objectContaining({ source: { kind: 'settlement', turnId } }),
    }))
  } finally { await stored.close() }
  await second.ctx.fiber.dispose()
  const third = await queryWorkflow(undefined, backend, { root: first.root, resumeLead: true })
  const replay = await third.ctx.sessionPersistence.open(third.lead.agent.id, 'read')
  try {
    expect((await replay.read(0)).filter(event => event.type === 'team/native-operation/committed')).toHaveLength(1)
  } finally { await replay.close() }
  await third.ctx.fiber.dispose()
  expect(third.native.live.size).toBe(0)
})

it('reauthorizes a crashed Codex connection before delivering follow-up work', async () => {
  const { ctx, lead, native, runtime, handle, member } = await queryWorkflow()
  native.complete('completed', 'First review finished.')
  await expect.poll(() => ctx.agentTeams.listMembers(lead.agent).find(value => value.id === member.id)?.status).toBe('idle')
  for (const process of native.live) process.terminate()
  await expect.poll(() => ctx.agentTeams.listMembers(lead.agent).find(value => value.id === member.id)?.status).toBe('inactive')
  const delivered = await ctx.agentTeams.sendMessage(lead.agent, {
    target: member.name, content: [{ type: 'text', text: 'Review the follow-up.' }], signal: new AbortController().signal,
  })
  expect(delivered.status).toBe('accepted')
  await expect.poll(() => native.data.threads[handle].turns).toHaveLength(2)
  expect((await native.query(handle, 'team_message_send', { target: 'lead', text: 'Follow-up accepted.' })).success).toBe(true)
  native.complete('completed', 'Follow-up review finished.')
  const stored = await ctx.sessionPersistence.open(lead.agent.id, 'read')
  try {
    await expect.poll(async () => (await stored.read(0)).filter(event =>
      event.type === 'team/native-operation/committed' && event.data.receipt.source.kind === 'settlement')).toHaveLength(2)
    expect((await stored.read(0)).filter(event => event.type === 'team/native-operation/committed')
      .map(event => event.data.message.content[0].text)).toContain('Follow-up review finished.')
  } finally { await stored.close() }
  expect(native.starts).toBe(1)
  await runtime.dispose()
  expect(native.live.size).toBe(0)
})

it('retries a lost live tool receipt and settles its interrupted turn once after cold restart', async () => {
  const first = await queryWorkflow()
  const input = { target: 'lead', text: 'One durable progress message.' }
  const correlation = { callId: 'lost-native-reply' }
  first.native.dropNextToolReply = true
  await expect(first.native.query(first.handle, 'team_message_send', input, correlation)).rejects.toThrow('reply lost')
  const before = await first.ctx.sessionPersistence.open(first.lead.agent.id, 'read')
  let receipt: unknown
  try {
    const events = (await before.read(0)).filter(event => event.type === 'team/native-operation/committed')
    expect(events).toHaveLength(1)
    receipt = events[0].data.receipt.result
  } finally { await before.close() }
  const response = await first.native.query(first.handle, 'team_message_send', input, correlation)
  expect(response.success).toBe(true)
  expect(JSON.parse(response.contentItems[0].text)).toEqual(receipt)
  const conflict = await first.native.query(first.handle, 'team_message_send', { ...input, text: 'Changed input.' }, correlation)
  expect(JSON.parse(conflict.contentItems[0].text).error.code).toBe('TEAM_NATIVE_OPERATION_CONFLICT')
  first.native.dropNextToolReply = true
  await expect(first.native.query(first.handle, 'team_message_send', input, correlation)).rejects.toThrow('reply lost')
  await first.ctx.fiber.dispose()
  const second = await queryWorkflow(undefined, 'json', { root: first.root, resumeLead: true })
  expect(second.native.data.threads[second.handle].turns[0].status).toBe('interrupted')
  const after = await second.ctx.sessionPersistence.open(second.lead.agent.id, 'read')
  try {
    await expect.poll(async () => (await after.read(0)).filter(event => event.type === 'team/native-operation/committed')).toHaveLength(2)
    const events = (await after.read(0)).filter(event => event.type === 'team/native-operation/committed')
    expect(events[0].data.receipt.result).toEqual(receipt)
    expect(events[1].data.receipt.result.value.outcome).toBe('interrupted')
    expect(events[1].data.message.content).toEqual([{ type: 'text', text: 'Codex work interrupted without a final response.' }])
  } finally { await after.close() }
  expect(second.member.id).toBe(first.member.id)
  expect(second.native.starts).toBe(0)
  await second.ctx.fiber.dispose()
  const third = await queryWorkflow(undefined, 'json', { root: first.root, resumeLead: true })
  const replay = await third.ctx.sessionPersistence.open(third.lead.agent.id, 'read')
  try {
    expect((await replay.read(0)).filter(event => event.type === 'team/native-operation/committed')).toHaveLength(2)
  } finally { await replay.close() }
  expect((await third.ctx.agentTeams.sendMessage(third.lead.agent, {
    target: third.member.name, content: [{ type: 'text', text: 'Continue the interrupted review.' }], signal: new AbortController().signal,
  })).status).toBe('accepted')
  expect((await third.native.query(third.handle, 'team_message_send', { target: 'lead', text: 'The new turn can reply.' })).success).toBe(true)
  await third.ctx.fiber.dispose()
})

it('keeps multiple native Team calls and the final result in one bound employee Run', async () => {
  const { ctx, invoke, native, runtime, lead } = await queryWorkflow()
  await expect(invoke('save', { expectedHeadRevision: null, profile: { ...profile, continuationProvider: '' },
    runtimeTarget: { kind: 'external-agent', provider: 'codex' } })).resolves.toMatchObject({ ok: true })
  await expect(invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 })).resolves.toMatchObject({ ok: true })
  const launched = await invoke('spawn', {
    launchRequestId: '77777777-7777-4777-8777-777777777777', profileId: profile.id,
  }) as SpawnDigitalEmployeeResult
  expect(launched.ok).toBe(true)
  if (!launched.ok || !launched.value.nativeRuntimeHandle) throw new Error('native employee must launch')
  const handle = launched.value.nativeRuntimeHandle
  for (const text of ['First deliberate progress.', 'Second deliberate progress.']) {
    expect((await native.query(handle, 'team_message_send', { target: 'lead', text })).success).toBe(true)
  }
  expect((await native.query(handle, 'team_tasks_list', {})).success).toBe(true)
  native.complete('completed', 'INTENTIONAL_FINAL_RESULT')
  await expect.poll(() => ctx.agentTeams.listMembers(lead.agent).find(member => member.id === launched.value.memberId)?.status).toBe('idle')
  const view = await invoke('view') as DigitalEmployeeStudioView
  expect(view.runs).toHaveLength(1)
  expect(view.runs[0]).toMatchObject({
    canonicalTurnId: native.data.threads[handle].turns[0].id, profileRevision: 1,
  })
  const detail = await invoke('run', { runId: view.runs[0].runId })
  expect(detail).toMatchObject({ ok: true, value: { run: {
    terminal: 'completed', usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
  } } })
  expect(JSON.stringify([view, detail])).not.toMatch(/INTENTIONAL_FINAL_RESULT|deliberate progress|PRIVATE_REASONING|PRIVATE_COMMENTARY/)
  await runtime.dispose()
  expect(native.live.size).toBe(0)
  await ctx.fiber.dispose()
})

it('exchanges attributed messages with a DSH peer while keeping the same native thread', async () => {
  const { ctx, lead, native, runtime, handle, member } = await queryWorkflow()
  const peer = await ctx.agentTeams.spawnTeammate(lead.agent, {
    name: 'dsh-peer', description: 'A DSH review peer.', provider: 'spawn', context: 'fresh',
    prompt: [{ type: 'text', text: 'Review the shared source.' }],
    agentOptions: { provider: 'workflow', model: 'reviewer' }, signal: new AbortController().signal,
  })
  const result = await native.query(handle, 'team_message_send', { target: 'dsh-peer', text: 'Please verify my finding.' })
  expect(result.success).toBe(true)
  const messageId = JSON.parse(result.contentItems[0].text).value.messageId
  const stored = await ctx.sessionPersistence.open(peer.member.id, 'read')
  try {
    await expect.poll(async () => (await stored.read(0)).filter(event => event.type === 'user/message'
      && event.data.source?.kind === 'team-message' && event.data.source.messageId === messageId)).toHaveLength(1)
    const message = (await stored.read(0)).find(event => event.type === 'user/message'
      && event.data.source?.kind === 'team-message' && event.data.source.messageId === messageId)!
    expect(message.data.source).toMatchObject({ senderId: member.id, senderName: 'codex-reviewer' })
  } finally { await stored.close() }
  native.complete()
  await expect.poll(() => ctx.agentTeams.listMembers(lead.agent).find(value => value.id === member.id)?.status).toBe('idle')
  await expect.poll(() => ctx.agents.get(peer.member.id)).toBeUndefined()
  const resumedPeer = await ctx.agents.resume({ resumeSessionId: peer.member.id, agentOptions: { provider: 'workflow', model: 'reviewer' } })
  await expect(ctx.agentTeams.sendMessage(resumedPeer.agent, {
    target: 'codex-reviewer', content: [{ type: 'text', text: 'The finding is verified.' }], signal: new AbortController().signal,
  })).resolves.toMatchObject({ status: 'accepted' })
  expect(Object.keys(native.data.threads)).toEqual([handle])
  expect(native.data.threads[handle].turns).toHaveLength(2)
  expect((await native.query(handle, 'team_message_send', { target: 'lead', text: 'Peer verification is complete.' })).success).toBe(true)
  native.complete()
  await resumedPeer.dispose()
  await runtime.dispose()
  expect(native.live.size).toBe(0)
})

it('persists a Codex member message before returning its original receipt on replay', async () => {
  const { ctx, lead, native, runtime, handle, member } = await queryWorkflow()
  const input = { target: 'lead', text: 'I am reviewing the shared source.' }
  const correlation = { callId: 'durable-progress-call' }
  const response = await native.query(handle, 'team_message_send', input, correlation)
  expect(response.success).toBe(true)
  const receipt = JSON.parse(response.contentItems[0].text)
  expect(receipt).toEqual({ ok: true, operation: 'messages.send', value: { messageId: expect.any(String), status: 'queued' } })
  expect(await native.query(handle, 'team_message_send', { text: input.text, target: ' lead ' }, correlation)).toEqual(response)
  const conflict = await native.query(handle, 'team_message_send', { ...input, text: 'Different input.' }, correlation)
  expect(conflict.success).toBe(false)
  expect(JSON.parse(conflict.contentItems[0].text).error.code).toBe('TEAM_NATIVE_OPERATION_CONFLICT')
  const stored = await ctx.sessionPersistence.open(lead.agent.id, 'read')
  try {
    const operations = (await stored.read(0)).filter(event => event.type === 'team/native-operation/committed')
    expect(operations).toHaveLength(1)
    expect(operations[0]?.data).toEqual(expect.objectContaining({
      version: 3,
      message: expect.objectContaining({
        id: receipt.value.messageId, senderId: member.id, senderName: 'codex-reviewer', targetId: lead.agent.id,
        content: [{ type: 'text', text: input.text }],
      }),
      receipt: expect.objectContaining({
        memberId: member.id, provider: 'codex', nativeHandle: handle, result: receipt,
        source: { kind: 'tool', turnId: native.data.threads[handle].turns[0].id, callId: correlation.callId },
      }),
    }))
  } finally {
    await stored.close()
  }
  native.complete()
  await runtime.dispose()
  expect(native.live.size).toBe(0)
})

it('answers a Codex dynamic tool call with the actual Team task board', async () => {
  const { ctx, lead, observer, native, runtime, handle } = await queryWorkflow()
  await ctx.agentTeams.createTask(lead.agent, { subject: 'Review source', description: 'Inspect the shared source.' })
  await ctx.agentTeams.createTask(observer.agent, { subject: 'Private elsewhere', description: 'Do not expose this task.' })
  const response = await native.query(handle, 'team_tasks_list', { limit: 1 })
  expect(response).toEqual({ success: true, contentItems: [{ type: 'inputText', text: JSON.stringify({
    ok: true, operation: 'tasks.list', value: { tasks: [{
      id: 'task-1', revision: 1, subject: 'Review source', description: 'Inspect the shared source.', status: 'pending',
      blockedBy: [], writeScopes: [], ready: true, writeScopeWarnings: [],
    }] },
  }) }] })
  expect(native.data.threads[handle].dynamicTools.map((tool: { name: string }) => tool.name))
    .toEqual(['team_members_list', 'team_tasks_list', 'team_tasks_get', 'team_message_send'])
  expect(JSON.stringify(response)).not.toContain('Private elsewhere')
  native.complete()
  await runtime.dispose()
  expect(native.live.size).toBe(0)
})

it('rejects model-supplied authority and malformed native query envelopes with stable errors', async () => {
  const { ctx, lead, native, runtime, handle } = await queryWorkflow()
  const invalidArguments = errorResult('TEAM_NATIVE_INVALID_REQUEST', 'The Team query arguments are invalid.')
  for (const args of [
    { operation: 'tasks.list' }, { role: 'lead' }, { teamId: 'observer-lead' },
    { memberId: 'someone-else' }, { nativeHandle: 'guessed-handle' },
    { taskId: 'task-1' }, [], null,
  ]) expect(await native.query(handle, 'team_members_list', args)).toEqual(invalidArguments)
  const invalidEnvelope = errorResult('CODEX_TEAM_INVALID_REQUEST', 'The native Team tool request is invalid.')
  for (const envelope of [
    { threadId: 'guessed-thread' }, { turnId: 'guessed-turn' }, { callId: '' },
    { callId: 'x'.repeat(201) }, { namespace: 'other-tools' }, { rpc: 'tasks.delete' },
  ]) expect(await native.query(handle, 'team_members_list', {}, envelope)).toEqual(invalidEnvelope)
  for (const tool of ['toString', 'constructor', '__proto__', 'tasks.delete', 'shell', 'mcp']) {
    expect(await native.query(handle, tool, {})).toEqual(errorResult('CODEX_TEAM_UNAVAILABLE', 'This Team operation is unavailable.'))
  }
  expect(ctx.agentTeams.listTasks(lead.agent)).toEqual([])
  native.complete()
  await runtime.dispose()
})

it('waits for durable member acceptance when Codex requests a tool during turn startup', async () => {
  let earlyQuery: Promise<unknown> | undefined
  const { native, runtime } = await queryWorkflow(product => {
    product.onTurnStart = (handle: string) => {
      earlyQuery = product.query(handle, 'team_tasks_list', {})
    }
  })
  expect(earlyQuery).toBeDefined()
  expect(await earlyQuery).toEqual({ success: true, contentItems: [{ type: 'inputText',
    text: '{"ok":true,"operation":"tasks.list","value":{"tasks":[]}}' }] })
  native.complete()
  await runtime.dispose()
})

it('bounds the complete native tool response after JSON text escaping', async () => {
  const { ctx, lead, native, runtime, handle } = await queryWorkflow()
  await ctx.agentTeams.createTask(lead.agent, { subject: 'Escaped output', description: '"'.repeat(16_384) })
  const response = await native.query(handle, 'team_tasks_list', { limit: 1 })
  expect(response).toEqual(errorResult('CODEX_TEAM_RESULT_LIMIT', 'The native Team tool result exceeds 65536 UTF-8 bytes; request a smaller task page.'))
  expect(Buffer.byteLength(JSON.stringify(response), 'utf8')).toBeLessThanOrEqual(65_536)
  expect(ctx.agentTeams.listTasks(lead.agent)[0]?.description).toHaveLength(16_384)
  native.complete()
  await runtime.dispose()
})

it('cancels an in-flight query immediately when the Lead interrupts its native turn', async () => {
  const { ctx, lead, native, runtime, handle } = await queryWorkflow()
  const pending = native.query(handle, 'team_tasks_list', {})
  expect(ctx.agentTeams.interrupt(lead.agent, 'codex-reviewer')).toEqual({ previousStatus: 'running' })
  const cancelled = errorResult('TEAM_NATIVE_CANCELLED', 'The Team operation was cancelled.')
  expect(await pending).toEqual(cancelled)
  expect(await native.query(handle, 'team_members_list', {})).toEqual(cancelled)
  native.complete()
  await runtime.dispose()
})

it('bounds native request size and query count without exhausting a later turn', async () => {
  const { ctx, lead, native, runtime, handle } = await queryWorkflow()
  const empty = { success: true, contentItems: [{ type: 'inputText',
    text: '{"ok":true,"operation":"tasks.list","value":{"tasks":[]}}' }] }
  for (let index = 0; index < 64; index += 1) {
    expect(await native.query(handle, 'team_tasks_list', {})).toEqual(empty)
  }
  expect(await native.query(handle, 'team_tasks_list', {}))
    .toEqual(errorResult('CODEX_TEAM_RATE_LIMIT', 'The native turn has reached its limit of 64 Team operations.'))
  native.complete()
  expect(await ctx.agentTeams.sendMessage(lead.agent, {
    target: 'codex-reviewer', content: [{ type: 'text', text: 'Continue reading.' }], signal: new AbortController().signal,
  })).toEqual(expect.objectContaining({ status: 'accepted' }))
  expect(await native.query(handle, 'team_tasks_list', {})).toEqual(empty)
  expect(await native.query(handle, 'team_tasks_get', { taskId: 'x'.repeat(4_096) }))
    .toEqual(errorResult('TEAM_NATIVE_REQUEST_LIMIT', 'The Team query request exceeds 4096 UTF-8 bytes.'))
  expect(await native.query(handle, 'team_tasks_get', { taskId: 'x'.repeat(16_384) }))
    .toEqual(errorResult('CODEX_TEAM_REQUEST_LIMIT', 'The native Team tool request exceeds 16384 UTF-8 bytes.'))
  native.complete()
  await runtime.dispose()
})

it('revokes a disposed Lead and restores the same native member with a new live owner and provider', async () => {
  const { ctx, lead, native, runtime, handle, member, root } = await queryWorkflow()
  let pending: Promise<unknown> | undefined
  const unobserve = ctx.on('agent/disposed', ({ agent }) => {
    if (agent === lead.agent) pending = native.query(handle, 'team_tasks_list', {})
  })
  await lead.dispose()
  unobserve()
  const revoked = errorResult('TEAM_NATIVE_GRANT_REVOKED', 'This Team authorization is no longer active.')
  expect(pending).toBeDefined()
  expect(await pending).toEqual(revoked)
  expect(await native.query(handle, 'team_tasks_list', {})).toEqual(revoked)
  const resumed = await ctx.agents.resume({ resumeSessionId: lead.agent.id, agentOptions: {} })
  const empty = { success: true, contentItems: [{ type: 'inputText',
    text: '{"ok":true,"operation":"tasks.list","value":{"tasks":[]}}' }] }
  await expect.poll(() => native.query(handle, 'team_tasks_list', {})).toEqual(empty)
  native.complete()
  await runtime.dispose()
  expect(native.live.size).toBe(0)
  expect(native.channels.size).toBe(0)
  const replacement = ctx.plugin(codex, { catalogOwnerService: 'digitalEmployees', cwd: root, sandbox: 'read-only' })
  await replacement
  await expect.poll(() => ctx.agentTeams.listMembers(resumed.agent).find(value => value.id === member.id)?.status).toBe('idle')
  expect(await ctx.agentTeams.sendMessage(resumed.agent, {
    target: 'codex-reviewer', content: [{ type: 'text', text: 'Read after recovery.' }], signal: new AbortController().signal,
  })).toEqual(expect.objectContaining({ status: 'accepted' }))
  expect(await native.query(handle, 'team_tasks_list', {})).toEqual(empty)
  expect(native.starts).toBe(1)
  expect(Object.keys(native.data.threads)).toEqual([handle])
  expect(native.data.threads[handle].dynamicTools.map((tool: { name: string }) => tool.name))
    .toEqual(['team_members_list', 'team_tasks_list', 'team_tasks_get', 'team_message_send'])
  native.complete()
  await replacement.dispose()
  await resumed.dispose()
  expect(native.live.size).toBe(0)
  expect(native.calls.size).toBe(0)
})

it('ends an ungranted startup query at its deadline and permits a later authorized call', async () => {
  let timedOut: unknown
  const { native, runtime, handle } = await queryWorkflow(product => {
    product.onTurnStart = async (threadId: string) => {
      // The external product withholds turn acceptance until this request is answered.
      timedOut = await product.query(threadId, 'team_tasks_list', {})
      product.onTurnStart = undefined
    }
  })
  expect(timedOut).toEqual(errorResult('CODEX_TEAM_UNAVAILABLE', 'This Team operation is unavailable.'))
  expect(await native.query(handle, 'team_tasks_list', {})).toEqual({ success: true, contentItems: [{ type: 'inputText',
    text: '{"ok":true,"operation":"tasks.list","value":{"tasks":[]}}' }] })
  native.complete()
  await runtime.dispose()
  expect(native.live.size).toBe(0)
  expect(native.calls.size).toBe(0)
}, 10_000)

it('retains approval, filesystem, network and arbitrary forwarding restrictions alongside Team tools', async () => {
  const { native, runtime, handle, root } = await queryWorkflow()
  for (const method of ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval']) {
    expect(await native.request(handle, method, {
      itemId: 'restricted-item', command: 'touch denied', cwd: root, availableDecisions: ['accept', 'decline', 'cancel'],
    })).toEqual({ decision: 'cancel' })
  }
  expect(await native.request(handle, 'item/permissions/requestApproval', {
    permissions: { network: { enabled: true }, fileSystem: { write: [root] } },
  })).toEqual({ permissions: {}, scope: 'turn' })
  expect(await native.request(handle, 'item/tool/requestUserInput', { questions: [] })).toEqual({ answers: {} })
  expect(await native.request(handle, 'mcpServer/elicitation/request', {}, { turnId: null }))
    .toEqual({ action: 'decline', content: null, _meta: null })
  expect(await native.request(handle, 'host/rpc', { method: 'createTask' }))
    .toEqual({ error: { code: -32603, message: 'agent-team-codex: unsupported native request' } })
  expect(await native.query(handle, 'team_tasks_list', {})).toEqual({ success: true, contentItems: [{ type: 'inputText',
    text: '{"ok":true,"operation":"tasks.list","value":{"tasks":[]}}' }] })
  native.complete()
  await runtime.dispose()
  expect(native.calls.size).toBe(0)
})
