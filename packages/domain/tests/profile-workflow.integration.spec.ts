import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import TypertGateway from '@deepseek-ai/dsh-api-gateway'
import TeamService from '@deepseek-ai/dsh-experimental-agent-team'
import { createUserMessage, LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SessionQueryEngine from '@deepseek-ai/dsh-session-query'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as JsonStorage from '@deepseek-ai/dsh-storage-json'
import * as SqliteStorage from '@deepseek-ai/dsh-storage-sqlite'
import Subagents from '@deepseek-ai/dsh-subagent'
import * as SubagentSpawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import TypertRegistry, { type TypertContribution } from '@deepseek-ai/dsh-typert-registry'
import Approval from '@deepseek-ai/dsh-user-approval'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DigitalEmployeeService from '../lib/index.js'
import { TYPERT } from '../lib/typert.host.js'
import type { DigitalEmployeeEvalRunRecord, DigitalEmployeeEvalSetDraft, DigitalEmployeeProfileDraft, DigitalEmployeeStudioView } from '../src/types.ts'

const target = { kind: 'dsh-model', provider: 'workflow', model: 'reviewer' } as const
const profile: DigitalEmployeeProfileDraft = {
  id: 'reviewer',
  employeeName: 'reviewer',
  displayName: 'Reviewer',
  description: 'Review an immutable candidate.',
  continuationProvider: 'spawn',
  contextMode: 'fresh',
  persona: 'Review carefully.',
  mission: 'Report a finding.',
  toolPolicy: { mode: 'inherit', names: [] },
  context: [],
  memory: [],
  hooks: [],
}

const evalSet: DigitalEmployeeEvalSetDraft = {
  id: 'release-check', profileId: 'reviewer', displayName: 'Release check',
  toolAllowlist: ['read', 'spawn_teammate'],
  resourceCeilings: { maxSteps: 2, maxOutputTokens: 256, maxElapsedMs: 5_000 },
  passPolicy: { kind: 'all' },
  cases: [{
    id: 'finding', title: 'Report a finding', input: 'Review the immutable fixture.',
    fixtures: [{ id: 'source', content: 'export const value = 1' }],
    assertions: {
      acceptedTerminals: ['completed'], requiredTools: [], forbiddenTools: ['spawn_teammate'],
      requiredOutputSubstrings: ['finding'], forbiddenOutputSubstrings: [],
      maxSteps: 2, maxReportedTokens: 100, maxElapsedMs: 5_000,
    },
  }],
}

class WorkflowAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  catalogGate: Promise<void> | undefined
  readonly catalogEntered = Promise.withResolvers<void>()

  override providerInfo(provider: string) { return { id: provider, name: 'Workflow' } }

  override async listModels(provider: string) {
    if (this.catalogGate !== undefined) {
      this.catalogEntered.resolve()
      await this.catalogGate
    }
    return [{ provider, id: 'reviewer', name: 'Reviewer' }]
  }

  override async resolveModel(provider: string, model: string) {
    return { provider, id: model, name: 'Reviewer' }
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'finding PRIVATE_OUTPUT' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'finding PRIVATE_OUTPUT' } }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

class UnusedSessionSearch extends SessionQueryEngine {
  override searchSessions(): Promise<never> { return Promise.reject(new Error('unused session search')) }
  override searchEvents(): Promise<never> { return Promise.reject(new Error('unused event search')) }
}

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function workflow(backend: 'json' | 'sqlite' = 'json') {
  const root = await mkdtemp(join(tmpdir(), 'ultra-profile-workflow-'))
  const ctx = new Context()
  cleanups.push(async () => {
    try { await ctx.fiber.dispose() }
    finally { await rm(root, { recursive: true, force: true }) }
  })
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions') })
  await ctx.plugin(UnusedSessionSearch)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(Approval)
  await ctx.plugin(SandboxPolicy)
  await ctx.plugin(Subagents)
  await ctx.plugin(SubagentSpawn, { providerName: 'spawn' })
  await ctx.plugin(TeamService)
  await ctx.plugin(Storage)
  if (backend === 'json') await ctx.plugin(JsonStorage, { root: join(root, 'storage') })
  else await ctx.plugin(SqliteStorage, { path: join(root, 'storage.sqlite'), journalMode: 'delete' })
  await ctx.plugin(StorageDomain, { backend })
  ctx.tools.register(defineContentToolFixture({
    name: 'read', description: 'Read immutable evidence', parameters: {},
    async execute() { return [] },
  }))
  const adapter = new WorkflowAdapter()
  ctx.llm.registerAdapter(['workflow'], adapter)
  const lead = await ctx.agents.create({
    sessionId: SessionId('workflow-lead'), agentOptions: { provider: target.provider, model: target.model },
  })
  const observer = await ctx.agents.create({ sessionId: SessionId('observer-lead') })
  const fiber = ctx.plugin(DigitalEmployeeService)
  await fiber
  await ctx.plugin(TypertRegistry)
  await ctx.plugin(TypertGateway)
  ctx.typert.register(TYPERT as TypertContribution)
  const invoke = (method: string, request?: unknown, agentId = lead.agent.id) => ctx.typertGateway.invoke({
    namespace: 'digitalEmployees',
    method,
    args: { agentId, ...(request === undefined ? {} : { request }) },
  })
  return { ctx, lead, observer, adapter, fiber, invoke }
}

describe('Profile workflow through generated Remote and durable storage', () => {
  it.each(['save', 'activate'] as const)('refuses %s when its exact Lead retires during runtime preflight', async (operation) => {
    const { ctx, lead, observer, invoke } = await workflow()
    const save = { expectedHeadRevision: null, profile, runtimeTarget: target }
    if (operation === 'activate') await invoke('save', save)
    const refresh = new WorkflowAdapter()
    const gate = Promise.withResolvers<void>()
    refresh.catalogGate = gate.promise
    cleanups.push(async () => { gate.resolve() })
    ctx.llm.registerAdapter(['refresh'], refresh)
    await refresh.catalogEntered.promise
    const saving = invoke(operation, operation === 'save'
      ? save : { profileId: 'reviewer', revision: 1, expectedHeadRevision: 1 })
    // A later completed Remote read places retirement after the save's dispatch.
    await invoke('view')
    await lead.dispose()
    gate.resolve()

    await expect(saving).resolves.toMatchObject({ ok: false, error: { code: 'team-rejected' } })
    const view = await invoke('view', undefined, observer.agent.id) as DigitalEmployeeStudioView
    if (operation === 'save') expect(view.profiles).toEqual([])
    else {
      expect(view.profiles[0]?.head.headRevision).toBe(1)
      expect(view.profiles[0]?.head.activeRevision).toBeUndefined()
    }
  })

  it('rechecks the Lead before a queued archive can change the shared Profile Head', async () => {
    const { ctx, observer, invoke } = await workflow()
    await expect(invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target }))
      .resolves.toMatchObject({ ok: true })
    const refresh = new WorkflowAdapter()
    const gate = Promise.withResolvers<void>()
    refresh.catalogGate = gate.promise
    cleanups.push(async () => { gate.resolve() })
    ctx.llm.registerAdapter(['refresh'], refresh)
    await refresh.catalogEntered.promise
    const activating = invoke('activate', { profileId: 'reviewer', revision: 1, expectedHeadRevision: 1 })
    const archiving = invoke('archive', { profileId: 'reviewer', expectedHeadRevision: 2 }, observer.agent.id)
    await invoke('view')
    await observer.dispose()
    gate.resolve()

    await expect(activating).resolves.toMatchObject({ ok: true })
    await expect(archiving).resolves.toMatchObject({ ok: false, error: { code: 'team-rejected' } })
    const view = await invoke('view') as DigitalEmployeeStudioView
    expect(view.profiles[0]?.head).toMatchObject({ headRevision: 2, activeRevision: 1 })
    expect(view.profiles[0]?.head.archivedAt).toBeUndefined()
  })

  it('refuses an evaluation when its Lead retires before the reservation', async () => {
    const { ctx, lead, invoke } = await workflow()
    lead.agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'Prepare the release review.' }],
      source: { kind: 'plugin', plugin: 'workflow-test' },
    }))
    await lead.agent.whenIdle()
    await ctx.sessions.flush(lead.agent.session)
    await invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target })
    await invoke('saveEvalSet', { expectedHeadRevision: null, evalSet })
    const refresh = new WorkflowAdapter()
    const gate = Promise.withResolvers<void>()
    refresh.catalogGate = gate.promise
    cleanups.push(async () => { gate.resolve() })
    ctx.llm.registerAdapter(['refresh'], refresh)
    await refresh.catalogEntered.promise
    const starting = invoke('startEvalRun', {
      evalRunId: '33333333-3333-4333-8333-333333333333',
      profileId: 'reviewer', profileRevision: 1, evalSetId: 'release-check', evalSetRevision: 1,
    })
    await invoke('view')
    await lead.dispose()
    gate.resolve()

    await expect(starting).resolves.toMatchObject({ ok: false, error: { code: 'team-rejected' } })
    await ctx.agents.resume({ resumeSessionId: lead.agent.id })
    const view = await invoke('view') as DigitalEmployeeStudioView
    expect(view.evalRuns).toEqual([])
  })

  it('settles an accepted evaluation before disposal closes its storage', async () => {
    const { ctx, fiber, invoke } = await workflow()
    await invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target })
    await invoke('saveEvalSet', { expectedHeadRevision: null, evalSet })
    let disposing: Promise<void> | undefined
    let committed: DigitalEmployeeEvalRunRecord | undefined
    ctx.on('domain/changed', change => {
      if (change.domain !== 'agent_team_ultra_v1' || change.table !== 'eval_runs' || change.operation !== 'put') return
      committed = change.value as DigitalEmployeeEvalRunRecord
      // Stop at the real durable reservation, before an Evaluation Worker can start.
      disposing ??= fiber.dispose()
    })
    await expect(invoke('startEvalRun', {
      evalRunId: '33333333-3333-4333-8333-333333333333',
      profileId: 'reviewer', profileRevision: 1, evalSetId: 'release-check', evalSetRevision: 1,
    })).resolves.toMatchObject({ ok: true })
    expect(disposing).toBeDefined()
    await disposing
    expect(committed).toMatchObject({ status: 'interrupted', cases: [{ status: 'interrupted' }] })
    expect(ctx.agents.list().map(agent => agent.id).sort()).toEqual(['observer-lead', 'workflow-lead'])
  })

  it.each(['json', 'sqlite'] as const)('preserves release, exact evaluation, and history across %s service replacement', async (backend) => {
    const { ctx, lead, adapter, fiber, invoke } = await workflow(backend)
    const view = async () => await invoke('view') as DigitalEmployeeStudioView
    await expect(invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target }))
      .resolves.toMatchObject({ ok: true, value: { head: { headRevision: 1, latestRevision: 1 } } })
    expect((await view()).profiles[0]?.head.activeRevision).toBeUndefined()
    const original = await invoke('revision', { profileId: 'reviewer', revision: 1 })
    const saved = await Promise.all(['First edit', 'Second edit'].map(description => invoke('save', {
      expectedHeadRevision: 1, profile: { ...profile, description }, runtimeTarget: target,
    })))
    expect(saved).toEqual(expect.arrayContaining([
      expect.objectContaining({ ok: true }),
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'profile-conflict' }) }),
    ]))
    await expect(invoke('saveEvalSet', { expectedHeadRevision: null, evalSet }))
      .resolves.toMatchObject({ ok: true, value: { head: { headRevision: 1 }, revision: { revision: 1 } } })
    await expect(invoke('saveEvalSet', { expectedHeadRevision: null, evalSet }))
      .resolves.toMatchObject({ ok: false, error: { code: 'eval-conflict' } })
    expect((await view()).profiles[0]?.head.headRevision).toBe(2)
    await expect(invoke('setEvalGate', {
      profileId: 'reviewer', expectedHeadRevision: 2,
      requiredEvalSet: { evalSetId: 'release-check', revision: 1 },
    })).resolves.toMatchObject({ ok: true, value: { head: { headRevision: 3 } } })
    await expect(invoke('activate', { profileId: 'reviewer', revision: 2, expectedHeadRevision: 3 }))
      .resolves.toMatchObject({ ok: false, error: { code: 'promotion-gate-failed' } })
    const evalRunId = '33333333-3333-4333-8333-333333333333'
    await expect(invoke('startEvalRun', {
      evalRunId, profileId: 'reviewer', profileRevision: 2, evalSetId: 'release-check', evalSetRevision: 1,
    })).resolves.toMatchObject({ ok: true, value: { replayed: false } })
    await vi.waitFor(async () => {
      expect((await view()).profiles[0]?.promotionGate).toMatchObject({ status: 'passed', satisfiedByEvalRunId: evalRunId })
    }, { timeout: 5_000 })
    const evaluated = await invoke('evalRun', { evalRunId })
    expect(evaluated).toMatchObject({ ok: true, value: { run: { status: 'passed' } } })
    expect(JSON.stringify(evaluated)).not.toContain('PRIVATE_OUTPUT')
    expect(ctx.agentTeams.listMembers(lead.agent).map(member => member.name)).toEqual(['lead'])
    expect(ctx.agents.list().map(agent => agent.id).sort()).toEqual(['observer-lead', 'workflow-lead'])
    expect(adapter.requests[0]?.tools?.map(tool => tool.name)).toEqual(['read'])
    expect(JSON.stringify(adapter.requests[0])).toContain('read-only')
    expect(JSON.stringify(adapter.requests[0])).toContain('Approval prompts are disabled')
    expect((await view()).profiles[0]?.head.activeRevision).toBeUndefined()
    await expect(invoke('activate', { profileId: 'reviewer', revision: 2, expectedHeadRevision: 3 }))
      .resolves.toMatchObject({ ok: true, value: { head: { headRevision: 4, activeRevision: 2 } } })
    ctx.llm.registerAdapter(['changed-environment'], new WorkflowAdapter())
    await ctx.digitalEmployees.whenRuntimeCatalogSettled()
    expect((await view()).profiles[0]?.promotionGate.status).toBe('invalidated')
    expect(await invoke('evalRun', { evalRunId })).toEqual(evaluated)
    await expect(invoke('archive', { profileId: 'reviewer', expectedHeadRevision: 4 }))
      .resolves.toMatchObject({ ok: true, value: { head: { headRevision: 5, archivedAt: expect.any(Number) } } })
    await expect(invoke('restore', { profileId: 'reviewer', expectedHeadRevision: 5 }))
      .resolves.toMatchObject({ ok: true, value: { head: { headRevision: 6 } } })
    await expect(invoke('rollback', { profileId: 'reviewer', revision: 1, expectedHeadRevision: 6 }))
      .resolves.toMatchObject({ ok: true, value: { head: { headRevision: 7, activeRevision: 1 } } })
    const before = (await view()).profiles[0]
    await fiber.dispose()
    expect(ctx.get('digitalEmployees')).toBeUndefined()
    await ctx.plugin(DigitalEmployeeService)
    expect((await view()).profiles[0]?.head).toEqual(before?.head)
    expect((await view()).profiles[0]?.promotionGate.status).toBe('invalidated')
    expect(await invoke('evalRun', { evalRunId })).toEqual(evaluated)
    const history = await invoke('revision', { profileId: 'reviewer', revision: 1 })
    expect(history).toMatchObject({ ok: true, value: { revision: (original as { value: { revision: unknown } }).value.revision } })
  })
})
