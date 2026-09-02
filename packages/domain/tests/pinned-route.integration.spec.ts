import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import TeamService, {
  TeammateEvaluationHandle,
  TeammateRuntimeHandle,
  TeammateRuntimeEvidenceId,
  TeammateRuntimeTurnId,
  type TeammateRuntimeDisposeRequest,
  type TeammateRuntimeProvider,
} from '@deepseek-ai/dsh-experimental-agent-team'
import {
  LlmAdapter,
  ReasoningEffortId,
  type GenerateOptions,
  type LlmModelInfo,
  type LlmResolvedModelInfo,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SessionQueryEngine from '@deepseek-ai/dsh-session-query'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import SubagentService, { foldSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import * as SubagentSpawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import DigitalEmployeeService, { launchRequestIdSchema } from '../lib/index.js'
import type { DigitalEmployeeProfileDraft } from '../src/types.ts'

const SIGNAL = new AbortController().signal
const SELECTED_PROVIDER = 'employee-provider'
const SELECTED_MODEL = 'employee-model'
const SELECTED_EFFORT = ReasoningEffortId('high')
const LAUNCH_REQUEST_ID = launchRequestIdSchema.parse('22222222-2222-4222-8222-222222222222')

class MemoryTable<K extends string, V> implements KvTable<K, V> {
  readonly records = new Map<K, V>()

  get size(): number { return this.records.size }
  get(key: K): V | undefined { return this.records.get(key) }
  entries(): IterableIterator<[K, V]> { return new Map(this.records).entries() }
  keys(): IterableIterator<K> { return new Map(this.records).keys() }
  async put(key: K, value: V): Promise<void> { this.records.set(key, value) }
  async delete(key: K): Promise<boolean> { return this.records.delete(key) }
  async update(key: K, update: (current: V) => V): Promise<V> {
    const current = this.records.get(key)
    if (current === undefined) throw new Error('missing-key')
    const next = update(current)
    this.records.set(key, next)
    return next
  }
}

function completedResponse(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: text.length } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

class PinnedRouteAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  override providerInfo(provider: string) {
    return { id: provider, name: 'Employee Provider' }
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve([{ provider, id: SELECTED_MODEL, name: 'Employee Model' }])
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({
      provider,
      id: model,
      name: 'Employee Model',
      reasoning: {
        efforts: [{ id: SELECTED_EFFORT, name: 'High' }],
        defaultEffort: SELECTED_EFFORT,
      },
    })
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    if (this.requests.length === 1) {
      for (const chunk of completedResponse('first turn complete')) yield chunk
      return
    }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'resumed' }
    const signal = options.signal
    if (signal === undefined) throw new Error('expected a cancellable Agent request')
    await new Promise<void>((_resolve, reject) => {
      const abort = (): void => { reject(new Error('aborted')) }
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
    })
  }
}

class TestSessionQuery extends SessionQueryEngine {
  override searchSessions(): Promise<never> {
    return Promise.reject(new Error('session search is not configured in this integration test'))
  }

  override searchEvents(): Promise<never> {
    return Promise.reject(new Error('event search is not configured in this integration test'))
  }
}

class LeadAdapter extends LlmAdapter {
  override async * stream(): AsyncIterable<StreamChunk> {
    for (const chunk of completedResponse('lead observed child settlement')) yield chunk
  }
}

interface MemoryStorageDomainState {
  readonly v0Profiles: MemoryTable<string, unknown>
  readonly v0Bindings: MemoryTable<string, unknown>
  readonly v1Tables: Map<string, MemoryTable<string, unknown>>
  migrationMarker: unknown
}

function memoryStorageDomainState(): MemoryStorageDomainState {
  return {
    v0Profiles: new MemoryTable<string, unknown>(),
    v0Bindings: new MemoryTable<string, unknown>(),
    v1Tables: new Map([
      ['profile_heads', new MemoryTable<string, unknown>()],
      ['profile_revisions', new MemoryTable<string, unknown>()],
      ['bindings', new MemoryTable<string, unknown>()],
      ['run_index', new MemoryTable<string, unknown>()],
      ['eval_sets', new MemoryTable<string, unknown>()],
      ['eval_runs', new MemoryTable<string, unknown>()],
    ]),
    migrationMarker: { formatVersion: 1, status: 'pending', sourceVersion: 0 },
  }
}

function installMemoryStorageDomain(ctx: Context, state = memoryStorageDomainState()): MemoryStorageDomainState {
  ctx.provide('storageDomain', {
    open: async (spec: { readonly name: string }) => {
      if (spec.name === 'agent_team_ultra') {
        return {
          table: (name: string) => name === 'profiles' ? state.v0Profiles : state.v0Bindings,
          close: async () => undefined,
        }
      }
      return {
        global: {
          get: () => state.migrationMarker,
          set: async (value: unknown) => { state.migrationMarker = value },
        },
        table: (name: string) => {
          const table = state.v1Tables.get(name)
          if (table === undefined) throw new Error(`unexpected v1 table ${name}`)
          return table
        },
        close: async () => undefined,
      }
    },
  } as never)
  return state
}

interface FakeNativeSession {
  readonly launchRequestId: string
  readonly memberId: SessionId
  readonly nativeHandle: ReturnType<typeof TeammateRuntimeHandle>
  readonly turns: Map<string, ReturnType<typeof TeammateRuntimeTurnId>>
  status: 'running' | 'idle'
}

interface FakeNativeStore {
  readonly sessions: Map<string, FakeNativeSession>
  readonly evaluations: Map<string, ReturnType<typeof TeammateEvaluationHandle>>
  nextSession: number
  nextTurn: number
  nextEvaluation: number
}

function fakeNativeStore(): FakeNativeStore {
  return {
    sessions: new Map(),
    evaluations: new Map(),
    nextSession: 1,
    nextTurn: 1,
    nextEvaluation: 1,
  }
}

class FakeNativeProvider implements TeammateRuntimeProvider {
  readonly id = 'fake-native'
  readonly displayName = 'Fake Native'
  readonly contextModes = ['fresh'] as const
  readonly profileCapabilities = ['persona', 'mission', 'context', 'memory', 'tool-policy', 'hooks'] as const
  readonly runtimeCapabilities = ['evaluation', 'evidence'] as const
  readonly apiKey = 'never-cross-the-host-boundary'
  readonly attached = new Set<ReturnType<typeof TeammateRuntimeHandle>>()
  readonly create = vi.fn<TeammateRuntimeProvider['create']>(async (request) => {
    request.signal.throwIfAborted()
    const key = `${request.launchRequestId}:${request.memberId}`
    let session = this.store.sessions.get(key)
    if (session === undefined) {
      session = {
        launchRequestId: request.launchRequestId,
        memberId: request.memberId,
        nativeHandle: TeammateRuntimeHandle(`fake-session-${this.store.nextSession++}`),
        turns: new Map(),
        status: 'idle',
      }
      this.store.sessions.set(key, session)
    }
    this.attached.add(session.nativeHandle)
    return { nativeHandle: session.nativeHandle, presence: session.status }
  })
  readonly resume = vi.fn<TeammateRuntimeProvider['resume']>(async (request) => {
    request.signal.throwIfAborted()
    const session = [...this.store.sessions.values()].find(candidate =>
      candidate.launchRequestId === request.launchRequestId
      && candidate.memberId === request.memberId
      && (request.nativeHandle === undefined || candidate.nativeHandle === request.nativeHandle))
    if (session === undefined) return undefined
    this.attached.add(session.nativeHandle)
    return { nativeHandle: session.nativeHandle, presence: session.status }
  })
  readonly deliver = vi.fn<TeammateRuntimeProvider['deliver']>(async (request) => {
    request.signal.throwIfAborted()
    const session = this.session(request.nativeHandle)
    let turnId = session.turns.get(request.deliveryId)
    if (turnId === undefined) {
      turnId = TeammateRuntimeTurnId(`fake-turn-${this.store.nextTurn++}`)
      session.turns.set(request.deliveryId, turnId)
    }
    session.status = 'idle'
    return { turnId, presence: session.status }
  })
  readonly interrupt = vi.fn<TeammateRuntimeProvider['interrupt']>((request) => {
    const session = this.session(request.nativeHandle)
    const previousStatus = session.status
    session.status = 'idle'
    return { previousStatus }
  })
  readonly evidence = vi.fn<TeammateRuntimeProvider['evidence']>(async (request) => ({
    nativeHandle: request.nativeHandle,
    items: [...this.session(request.nativeHandle).turns.values()].map((turnId, index) => ({
      id: TeammateRuntimeEvidenceId(`fake-evidence-${index + 1}`),
      kind: 'turn' as const,
      timestamp: index + 1,
      turnId,
      outcome: 'completed' as const,
    })),
    complete: true,
  }))
  readonly createEvaluationHandle = vi.fn<TeammateRuntimeProvider['createEvaluationHandle']>(async (request) => {
    let handle = this.store.evaluations.get(request.evaluationId)
    if (handle === undefined) {
      handle = TeammateEvaluationHandle(`fake-eval-${this.store.nextEvaluation++}`)
      this.store.evaluations.set(request.evaluationId, handle)
    }
    return { evaluationHandle: handle }
  })
  readonly dispose = vi.fn<TeammateRuntimeProvider['dispose']>(async (request: TeammateRuntimeDisposeRequest) => {
    if (request.kind === 'runtime') this.attached.delete(request.nativeHandle)
  })

  constructor(private readonly store: FakeNativeStore) {}

  private session(handle: ReturnType<typeof TeammateRuntimeHandle>): FakeNativeSession {
    const session = [...this.store.sessions.values()].find(candidate => candidate.nativeHandle === handle)
    if (session === undefined) throw new Error(`unknown fake native handle ${handle}`)
    return session
  }
}

function profile(overrides: Partial<DigitalEmployeeProfileDraft> = {}): DigitalEmployeeProfileDraft {
  return {
    id: 'route-reviewer',
    employeeName: 'route-reviewer',
    displayName: 'Pinned Route Reviewer',
    description: 'Exercises a real profile-bound continuable teammate.',
    continuationProvider: 'spawn',
    contextMode: 'fresh',
    persona: 'PERSONA V1: stay on the selected employee route.',
    mission: 'MISSION V1: review the assigned route evidence.',
    toolPolicy: { mode: 'allow', names: ['read'] },
    context: [{ id: 'context-v1', title: 'Context V1', content: 'CONTEXT V1', enabled: true }],
    memory: [{ id: 'memory-v1', title: 'Memory V1', content: 'MEMORY V1', enabled: true }],
    hooks: [
      { id: 'start-v1', point: 'session-start', effect: 'context', text: 'START HOOK V1', enabled: true },
      { id: 'step-v1', point: 'before-step', effect: 'context', text: 'STEP HOOK V1', enabled: true },
    ],
    ...overrides,
  }
}

const temporaryRoots: string[] = []
let activeContext: Context | undefined

afterEach(async () => {
  await activeContext?.fiber.dispose()
  activeContext = undefined
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

async function waitForMissingAgent(ctx: Context, id: SessionId): Promise<void> {
  await vi.waitFor(() => { expect(ctx.agents.get(id)).toBeUndefined() }, { timeout: 5_000 })
}

describe('pinned dsh-model route integration', () => {
  it('keeps the selected route and immutable Profile scope across a real cold resume', async () => {
    const ctx = new Context()
    activeContext = ctx
    const agentErrors: string[] = []
    ctx.on('agent/error', ({ agent, error }) => {
      agentErrors.push(`${agent.id}: ${error instanceof Error ? error.message : String(error)}`)
    })
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(SessionProjectionRegistry)
    const sessionRoot = mkdtempSync(join(tmpdir(), 'dsh-ultra-pinned-route-'))
    temporaryRoots.push(sessionRoot)
    await ctx.plugin(JsonlSessionPersistence, { root: sessionRoot })
    await ctx.plugin(TestSessionQuery)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(SubagentService)
    await ctx.plugin(SubagentSpawn, { providerName: 'spawn' })
    await ctx.plugin(TeamService)
    installMemoryStorageDomain(ctx)

    ctx.tools.register(defineContentToolFixture({
      name: 'read',
      description: 'Read evidence',
      parameters: {},
      async execute() { return [] },
    }))
    ctx.tools.register(defineContentToolFixture({
      name: 'bash',
      description: 'Run commands',
      parameters: {},
      async execute() { return [] },
    }))
    const adapter = new PinnedRouteAdapter()
    ctx.llm.registerAdapter([SELECTED_PROVIDER], adapter)
    ctx.llm.registerAdapter(['lead-provider-before', 'lead-provider-after'], new LeadAdapter())
    const lead = ctx.agentLoop.create(SessionId('pinned-route-lead'), {
      provider: 'lead-provider-before',
      model: 'lead-model-before',
    })
    const ultraFiber = ctx.plugin(DigitalEmployeeService)
    await ultraFiber

    const saved = await ctx.digitalEmployees.saveProfile(lead, {
      expectedHeadRevision: null,
      profile: profile(),
      runtimeTarget: {
        kind: 'dsh-model',
        provider: SELECTED_PROVIDER,
        model: SELECTED_MODEL,
        reasoningEffort: SELECTED_EFFORT,
      },
    })
    if (!saved.ok) throw new Error(saved.error.message)
    const activated = await ctx.digitalEmployees.activateProfile(lead, {
      profileId: saved.value.head.profileId,
      revision: saved.value.revision.revision,
      expectedHeadRevision: saved.value.head.headRevision,
    })
    if (!activated.ok) throw new Error(activated.error.message)

    const launched = await ctx.digitalEmployees.spawnProfile(lead, {
      launchRequestId: LAUNCH_REQUEST_ID,
      profileId: saved.value.head.profileId,
      assignment: 'ASSIGNMENT V1',
    }, SIGNAL)
    if (!launched.ok) throw new Error(launched.error.message)
    const childId = SessionId(launched.value.memberId)
    expect(launched.value).toMatchObject({
      profileRevision: 1,
      runtimeTarget: {
        kind: 'dsh-model',
        provider: SELECTED_PROVIDER,
        model: SELECTED_MODEL,
        reasoningEffort: 'high',
      },
      resolvedRuntimeTarget: {
        kind: 'dsh-model',
        provider: SELECTED_PROVIDER,
        model: SELECTED_MODEL,
        reasoningEffort: 'high',
      },
    })
    await vi.waitFor(() => { expect(adapter.requests).toHaveLength(1) }, { timeout: 5_000 })
    const firstRequest = adapter.requests[0]!
    expect(firstRequest).toMatchObject({
      provider: SELECTED_PROVIDER,
      model: SELECTED_MODEL,
      reasoningEffort: SELECTED_EFFORT,
    })
    expect(firstRequest.system).toContain('PERSONA V1')
    expect(JSON.stringify(firstRequest.messages)).toContain('MISSION V1')
    expect(JSON.stringify(firstRequest.messages)).toContain('ASSIGNMENT V1')
    expect(JSON.stringify(firstRequest.messages)).toContain('CONTEXT V1')
    expect(JSON.stringify(firstRequest.messages)).toContain('MEMORY V1')
    expect(JSON.stringify(firstRequest.messages)).toContain('START HOOK V1')
    expect(JSON.stringify(firstRequest.messages)).toContain('STEP HOOK V1')
    expect(firstRequest.tools?.map(tool => tool.name)).toEqual(['read'])
    await waitForMissingAgent(ctx, childId)

    const durable = await ctx.sessionPersistence.inspect(childId, SIGNAL)
    expect(foldSubagentDescriptor(durable.events.slice(durable.inheritedEventCount))).toMatchObject({
      agentProvider: SELECTED_PROVIDER,
      agentModel: SELECTED_MODEL,
      agentReasoningEffort: 'high',
    })
    expect(ctx.agentTeams.listMembers(lead)[1]).toMatchObject({
      id: childId,
      model: SELECTED_MODEL,
      requestedRoute: {
        provider: SELECTED_PROVIDER,
        model: SELECTED_MODEL,
        reasoningEffort: 'high',
      },
      resolvedRoute: {
        provider: SELECTED_PROVIDER,
        model: SELECTED_MODEL,
        reasoningEffort: 'high',
      },
    })

    const replacement = await ctx.digitalEmployees.saveProfile(lead, {
      expectedHeadRevision: activated.value.head.headRevision,
      profile: profile({
        persona: 'PERSONA V2 MUST NOT REACH THE EXISTING CHILD',
        context: [{ id: 'context-v2', title: 'Context V2', content: 'CONTEXT V2', enabled: true }],
        memory: [],
        hooks: [],
      }),
      runtimeTarget: {
        kind: 'dsh-model',
        provider: SELECTED_PROVIDER,
        model: SELECTED_MODEL,
        reasoningEffort: SELECTED_EFFORT,
      },
    })
    if (!replacement.ok) throw new Error(replacement.error.message)
    const promoted = await ctx.digitalEmployees.activateProfile(lead, {
      profileId: replacement.value.head.profileId,
      revision: replacement.value.revision.revision,
      expectedHeadRevision: replacement.value.head.headRevision,
    })
    if (!promoted.ok) throw new Error(promoted.error.message)

    Object.assign(lead.options, {
      provider: 'lead-provider-after',
      model: 'lead-model-after',
    })
    await ctx.agentTeams.sendMessage(lead, {
      target: 'route-reviewer',
      content: [{ type: 'text', text: 'resume the existing employee' }],
      delivery: 'wakeup',
      signal: SIGNAL,
    })
    await vi.waitFor(() => { expect(adapter.requests).toHaveLength(2) }, { timeout: 5_000 })
    const resumed = ctx.agents.get(childId)
    expect(resumed?.options).toMatchObject({
      provider: SELECTED_PROVIDER,
      model: SELECTED_MODEL,
      reasoningEffort: SELECTED_EFFORT,
    })
    const secondRequest = adapter.requests[1]!
    expect(secondRequest).toMatchObject({
      provider: SELECTED_PROVIDER,
      model: SELECTED_MODEL,
      reasoningEffort: SELECTED_EFFORT,
    })
    expect(secondRequest.system).toContain('PERSONA V1')
    expect(secondRequest.system).not.toContain('PERSONA V2')
    const secondMessages = JSON.stringify(secondRequest.messages)
    expect(secondMessages).toContain('CONTEXT V1')
    expect(secondMessages).toContain('MEMORY V1')
    expect(secondMessages).toContain('START HOOK V1')
    expect(secondMessages).toContain('STEP HOOK V1')
    expect(secondMessages).not.toContain('CONTEXT V2')
    expect(secondRequest.tools?.map(tool => tool.name)).toEqual(['read'])
    expect(ctx.digitalEmployees.studioView(lead).instances[0]).toMatchObject({
      memberId: childId,
      profileRevision: 1,
      runtimeTarget: { provider: SELECTED_PROVIDER, model: SELECTED_MODEL },
      resolvedRuntimeTarget: { provider: SELECTED_PROVIDER, model: SELECTED_MODEL },
    })
    expect(agentErrors).toEqual([])

    if (resumed === undefined) throw new Error('cold-resumed child was not published')
    expect(ctx.tools.schemas(resumed).map(tool => tool.name)).toEqual(['read'])
    await ultraFiber.dispose()
    expect(ctx.get('digitalEmployees')).toBeUndefined()
    expect(ctx.tools.schemas(resumed).map(tool => tool.name).sort()).toEqual(['bash', 'read'])
  }, 20_000)
})

describe('durable external-agent route integration', () => {
  it('keeps one native identity across Ultra restart, provider absence, and multiple turns', async () => {
    const ctx = new Context()
    activeContext = ctx
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(SessionProjectionRegistry)
    const sessionRoot = mkdtempSync(join(tmpdir(), 'dsh-ultra-external-route-'))
    temporaryRoots.push(sessionRoot)
    await ctx.plugin(JsonlSessionPersistence, { root: sessionRoot })
    await ctx.plugin(TestSessionQuery)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(SubagentService)
    await ctx.plugin(TeamService)
    const storageState = installMemoryStorageDomain(ctx)
    const { v1Tables } = storageState
    const leadId = SessionId('external-route-lead')
    const lead = ctx.agentLoop.create(leadId, {})
    const oneShot = vi.spyOn(ctx.subagents, 'startContinuable')
    await ctx.plugin(DigitalEmployeeService)
    const store = fakeNativeStore()
    const firstProvider = new FakeNativeProvider(store)
    const providerFiber = ctx.plugin({
      inject: ['digitalEmployees'],
      apply(pluginCtx: Context) {
        pluginCtx.digitalEmployees.registerExternalRuntimeProvider(firstProvider)
      },
    })
    await providerFiber
    await ctx.digitalEmployees.whenRuntimeCatalogSettled()
    const initialStudio = ctx.digitalEmployees.studioView(lead)
    expect(initialStudio.runtimeCatalog.backends).toContainEqual(expect.objectContaining({
      routingId: 'external-agent/fake-native',
      availability: 'available',
      profileCapabilities: ['persona', 'mission', 'context', 'memory', 'tool-policy', 'hooks'],
      runtimeCapabilities: ['evaluation', 'evidence'],
    }))
    expect(JSON.stringify(initialStudio)).not.toContain('never-cross-the-host-boundary')

    const externalProfile = profile({
      context: [
        { id: 'context-v1', title: 'Context V1', content: 'CONTEXT V1', enabled: true },
        { id: 'disabled-context', title: 'Disabled', content: 'MUST NOT CROSS', enabled: false },
      ],
    })
    const saved = await ctx.digitalEmployees.saveProfile(lead, {
      expectedHeadRevision: null,
      profile: externalProfile,
      runtimeTarget: { kind: 'external-agent', provider: 'fake-native' },
    })
    if (!saved.ok) throw new Error(saved.error.message)
    const activated = await ctx.digitalEmployees.activateProfile(lead, {
      profileId: saved.value.head.profileId,
      revision: saved.value.revision.revision,
      expectedHeadRevision: saved.value.head.headRevision,
    })
    if (!activated.ok) throw new Error(activated.error.message)

    const bindings = v1Tables.get('bindings')!
    const writes = vi.spyOn(bindings, 'put')
    const launched = await ctx.digitalEmployees.spawnProfile(lead, {
      launchRequestId: LAUNCH_REQUEST_ID,
      profileId: saved.value.head.profileId,
      assignment: 'Review the native runtime seam.',
    }, SIGNAL)
    expect(launched).toMatchObject({
      ok: true,
      value: {
        provisioningPhase: 'active',
        runtimeTarget: { kind: 'external-agent', provider: 'fake-native' },
        resolvedRuntimeTarget: { kind: 'external-agent', provider: 'fake-native' },
        nativeRuntimeHandle: 'fake-session-1',
        runtimePresence: 'idle',
      },
    })
    const activeWrites = writes.mock.calls
      .map(([, value]) => value as { provisioningPhase?: string; nativeRuntimeHandle?: string })
      .filter(value => value.provisioningPhase === 'active')
    expect(activeWrites).toHaveLength(1)
    expect(activeWrites[0]?.nativeRuntimeHandle).toBe('fake-session-1')
    expect(firstProvider.create).toHaveBeenCalledWith(expect.objectContaining({
      launchRequestId: LAUNCH_REQUEST_ID,
      memberId: expect.any(String),
      memberName: 'route-reviewer',
      profile: {
        persona: externalProfile.persona,
        mission: externalProfile.mission,
        context: [{ id: 'context-v1', title: 'Context V1', content: 'CONTEXT V1' }],
        memory: [{ id: 'memory-v1', title: 'Memory V1', content: 'MEMORY V1' }],
        toolPolicy: { mode: 'allow', names: ['read'] },
        hooks: [
          { point: 'session-start', effect: 'context', text: 'START HOOK V1' },
          { point: 'before-step', effect: 'context', text: 'STEP HOOK V1' },
        ],
      },
    }))
    expect(JSON.stringify(firstProvider.create.mock.calls[0]?.[0].profile)).not.toContain('MUST NOT CROSS')
    expect(store.sessions).toHaveLength(1)
    expect(oneShot).not.toHaveBeenCalled()

    await expect(ctx.agentTeams.sendMessage(lead, {
      target: 'route-reviewer',
      content: [{ type: 'text', text: 'First work turn.' }],
      delivery: 'wakeup',
      signal: SIGNAL,
    })).resolves.toMatchObject({ status: 'accepted' })
    expect(ctx.agentTeams.interrupt(lead, 'route-reviewer')).toEqual({ previousStatus: 'idle' })
    expect(firstProvider.interrupt).toHaveBeenCalledWith({ nativeHandle: 'fake-session-1' })

    await providerFiber.dispose()
    await ctx.digitalEmployees.whenRuntimeCatalogSettled()
    expect(ctx.digitalEmployees.studioView(lead).instances[0]).toMatchObject({
      provisioningPhase: 'active',
      runtimeAvailability: 'unavailable',
      runtimePresence: 'inactive',
      nativeRuntimeHandle: 'fake-session-1',
    })
    expect(firstProvider.attached).toHaveLength(0)

    await ctx.fiber.dispose()
    activeContext = undefined

    const resumedCtx = new Context()
    activeContext = resumedCtx
    await mountAgentLoopTestDependencies(resumedCtx)
    await resumedCtx.plugin(SessionProjectionRegistry)
    await resumedCtx.plugin(JsonlSessionPersistence, { root: sessionRoot })
    await resumedCtx.plugin(TestSessionQuery)
    await resumedCtx.plugin(AgentLoop, { agents: [] })
    await resumedCtx.plugin(SubagentService)
    await resumedCtx.plugin(TeamService)
    installMemoryStorageDomain(resumedCtx, storageState)
    const replacement = resumedCtx.plugin(DigitalEmployeeService)
    await replacement
    const secondOneShot = vi.spyOn(resumedCtx.subagents, 'startContinuable')
    const leadHandle = await resumedCtx.agents.resume({ resumeSessionId: leadId, agentOptions: {} })
    await resumedCtx.digitalEmployees.whenRuntimeCatalogSettled()
    expect(resumedCtx.digitalEmployees.studioView(leadHandle.agent).instances[0]).toMatchObject({
      provisioningPhase: 'active',
      runtimeAvailability: 'unavailable',
      runtimePresence: 'inactive',
      nativeRuntimeHandle: 'fake-session-1',
    })
    const resumedProvider = new FakeNativeProvider(store)
    const resumedFiber = resumedCtx.plugin({
      inject: ['digitalEmployees'],
      apply(pluginCtx: Context) {
        pluginCtx.digitalEmployees.registerExternalRuntimeProvider(resumedProvider)
      },
    })
    await resumedFiber
    await resumedCtx.digitalEmployees.whenRuntimeCatalogSettled()
    await vi.waitFor(() => {
      expect(resumedCtx.digitalEmployees.studioView(leadHandle.agent).instances[0]).toMatchObject({
        provisioningPhase: 'active',
        runtimeAvailability: 'available',
        runtimePresence: 'idle',
        nativeRuntimeHandle: 'fake-session-1',
      })
    })
    expect(store.sessions).toHaveLength(1)
    expect(resumedProvider.resume).toHaveBeenCalledWith(expect.objectContaining({
      nativeHandle: 'fake-session-1',
    }))
    expect(resumedProvider.create).not.toHaveBeenCalled()
    await expect(resumedCtx.agentTeams.sendMessage(leadHandle.agent, {
      target: 'route-reviewer',
      content: [{ type: 'text', text: 'Second work turn after restart.' }],
      delivery: 'wakeup',
      signal: SIGNAL,
    })).resolves.toMatchObject({ status: 'accepted' })
    expect([...store.sessions.values()][0]?.turns).toHaveLength(2)
    const remote = await resumedCtx.digitalEmployees.remoteView(leadHandle.agent)
    expect(remote.instances[0]).toMatchObject({
      resolvedRuntimeTarget: { kind: 'external-agent', provider: 'fake-native' },
      nativeRuntimeHandle: 'fake-session-1',
      runtimePresence: 'idle',
    })
    expect(remote.runtimeCatalog.backends).toContainEqual(expect.objectContaining({
      routingId: 'external-agent/fake-native',
      runtimeCapabilities: ['evaluation', 'evidence'],
    }))
    expect(JSON.stringify(remote)).not.toContain('never-cross-the-host-boundary')
    expect(oneShot).not.toHaveBeenCalled()
    expect(secondOneShot).not.toHaveBeenCalled()

    await resumedFiber.dispose()
    await replacement.dispose()
    await leadHandle.dispose()
    await resumedCtx.fiber.dispose()
    activeContext = undefined
  }, 20_000)
})
