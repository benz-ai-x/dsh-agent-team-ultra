import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import Subprocess, { type SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { TeammateLaunchRequestId } from '@deepseek-ai/dsh-experimental-agent-team'
import { expect, it } from 'vitest'
import { workflow } from '../../domain/tests/fixtures/host-workflow.ts'
import * as codex from '../lib/index.js'
import { NativeProduct } from './fixtures/native-product.mjs'

async function queryWorkflow(configure?: (native: NativeProduct) => void) {
  const host = await workflow()
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
    .toEqual(['team_members_list', 'team_tasks_list', 'team_tasks_get'])
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
    expect(await native.query(handle, tool, {})).toEqual(errorResult('CODEX_TEAM_UNAVAILABLE', 'This Team query is unavailable.'))
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
  const cancelled = errorResult('TEAM_NATIVE_CANCELLED', 'The Team query was cancelled.')
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
    .toEqual(errorResult('CODEX_TEAM_RATE_LIMIT', 'The native turn has reached its limit of 64 Team queries.'))
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
    .toEqual(['team_members_list', 'team_tasks_list', 'team_tasks_get'])
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
  expect(timedOut).toEqual(errorResult('CODEX_TEAM_UNAVAILABLE', 'This Team query is unavailable.'))
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
