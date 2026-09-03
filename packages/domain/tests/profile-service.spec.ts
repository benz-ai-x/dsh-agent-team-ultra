import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import {
  TeamError,
  TeammateEvaluationHandle,
  TeammateRuntimeError,
  TeammateRuntimeHandle,
  TeammateRuntimeTurnId,
  type TeammateRuntimeMetadata,
  type TeammateRuntimeProvider,
  type TeammateRuntimeRegistration,
} from '@deepseek-ai/dsh-experimental-agent-team'
import { describe, expect, it, vi } from 'vitest'
import { SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import DigitalEmployeeService, {
  digitalEmployeeProfileDraftSchema,
  launchRequestIdSchema,
  snapshotProfile,
} from '../lib/index.js'
import {
  assignmentContentHash,
  digitalEmployeeBindingKey,
  launchRequestFingerprint,
} from '../src/storage.ts'
import type {
  DigitalEmployeeProfile,
  DigitalEmployeeProfileDraft,
  DigitalEmployeeRuntimeTarget,
  ProfileHook,
} from '../src/types.ts'

const DEFAULT_RUNTIME_TARGET = Object.freeze({
  kind: 'dsh-model',
  provider: 'test-provider',
  model: 'test-model',
} as const satisfies DigitalEmployeeRuntimeTarget)
const LAUNCH_REQUEST_ID = launchRequestIdSchema.parse('11111111-1111-4111-8111-111111111111')

function catalogExternalProvider(
  metadata: Pick<
    TeammateRuntimeProvider,
    'id' | 'displayName' | 'contextModes' | 'profileCapabilities' | 'runtimeCapabilities'
  > & Record<string, unknown>,
): TeammateRuntimeProvider {
  return {
    ...metadata,
    create: async () => ({ nativeHandle: TeammateRuntimeHandle('catalog-runtime'), presence: 'idle' }),
    resume: async () => ({ nativeHandle: TeammateRuntimeHandle('catalog-runtime'), presence: 'idle' }),
    deliver: async () => ({ turnId: TeammateRuntimeTurnId('catalog-turn'), presence: 'idle' }),
    interrupt: () => ({ previousStatus: 'idle' }),
    evidence: async request => ({
      nativeHandle: request.nativeHandle,
      items: [],
      complete: true,
    }),
    createEvaluationHandle: async () => ({ evaluationHandle: TeammateEvaluationHandle('catalog-evaluation') }),
    dispose: async () => undefined,
  }
}

interface FakeLlmRoute {
  readonly provider: string
  readonly providerName: string
  readonly model: string
  readonly modelName: string
  readonly reasoning?: {
    readonly efforts: readonly { readonly id: string; readonly name: string; readonly description?: string }[]
    readonly defaultEffort?: string
  }
  readonly resolvedProvider?: string
  readonly resolvedModel?: string
  readonly secret?: string
}

const DEFAULT_LLM_ROUTE: FakeLlmRoute = Object.freeze({
  provider: DEFAULT_RUNTIME_TARGET.provider,
  providerName: 'Test Provider',
  model: DEFAULT_RUNTIME_TARGET.model,
  modelName: 'Test Model',
  reasoning: {
    efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }],
    defaultEffort: 'low',
  },
})

class MemoryTable<K extends string, V> implements KvTable<K, V> {
  readonly records = new Map<K, V>()

  get size(): number { return this.records.size }
  get(key: K): V | undefined { return this.records.get(key) }
  entries(): IterableIterator<[K, V]> { return new Map(this.records).entries() }
  keys(): IterableIterator<K> { return new Map(this.records).keys() }
  async put(key: K, value: V): Promise<void> { this.records.set(key, value) }
  async delete(key: K): Promise<boolean> { return this.records.delete(key) }
  async update(key: K, fn: (current: V) => V): Promise<V> {
    const current = this.records.get(key)
    if (current === undefined) throw new Error('missing-key')
    const next = fn(current)
    this.records.set(key, next)
    return next
  }
}

function draft(overrides: Partial<DigitalEmployeeProfileDraft> = {}): DigitalEmployeeProfileDraft {
  return {
    id: 'code-reviewer',
    employeeName: 'code-reviewer',
    displayName: 'Code Reviewer',
    description: 'Reviews code and reports actionable findings.',
    continuationProvider: 'spawn',
    contextMode: 'fresh',
    persona: 'Be precise, skeptical, and evidence-driven.',
    mission: 'Find correctness and maintainability risks before merge.',
    toolPolicy: { mode: 'allow', names: ['read'] },
    context: [{ id: 'standards', title: 'Standards', content: 'Prefer causal explanations.', enabled: true }],
    memory: [{ id: 'preferences', title: 'Preferences', content: 'Lead prefers concise findings.', enabled: true }],
    hooks: [
      { id: 'start', point: 'session-start', effect: 'context', text: 'Load the review rubric.', enabled: true },
      { id: 'step', point: 'before-step', effect: 'context', text: 'Re-check evidence.', enabled: true },
      { id: 'guard', point: 'before-tool', effect: 'deny', matcher: 'bash*', text: 'No shell mutations.', enabled: true },
      { id: 'observe', point: 'after-tool', effect: 'context', matcher: 'read', text: 'Relate evidence to a finding.', enabled: true },
    ],
    ...overrides,
  }
}

interface Harness {
  readonly ctx: Context
  readonly fiber: ReturnType<Context['plugin']>
  readonly profiles: MemoryTable<string, unknown>
  readonly revisions: MemoryTable<string, unknown>
  readonly bindings: MemoryTable<string, unknown>
  readonly runs: MemoryTable<string, unknown>
  readonly close: ReturnType<typeof vi.fn>
  readonly restriction: ReturnType<typeof vi.fn>
  readonly sections: ReturnType<typeof vi.fn>
  readonly contexts: ReturnType<typeof vi.fn>
  readonly scopeDisposals: Array<ReturnType<typeof vi.fn>>
  readonly childEvents: string[]
  readonly spawn: ReturnType<typeof vi.fn>
  readonly listMembers: ReturnType<typeof vi.fn>
  readonly roster: Array<Record<string, unknown>>
  readonly leader: Agent
  readonly teammate: Agent
  readonly staleLeader: Agent
  readonly foreignRoot: Agent
  readonly agent: (id: string) => Agent | undefined
  readonly disposeAgent: (agent: Agent) => void
  readonly replaceLlmRoutes: (routes: readonly FakeLlmRoute[]) => void
  readonly gateNextLlmRefresh: () => { readonly entered: Promise<void>; release(): void }
  readonly setTeammateRuntimeAvailable: (providerId: string, available: boolean) => void
  readonly readTeammateRuntimeEvidence: ReturnType<typeof vi.fn>
  readonly appendSessionEvent: (
    sessionId: string,
    type: SessionEvent['type'],
    data: unknown,
    time: number,
  ) => void
}

async function harness(options: {
  readonly spawnGate?: Promise<void>
  readonly serviceConfig?: { readonly maxRevisionHistory?: number; readonly maxDiffEntries?: number }
  readonly llmRoutes?: readonly FakeLlmRoute[]
  readonly childResolvedRoute?: { readonly provider?: string; readonly model?: string; readonly reasoningEffort?: string }
  readonly spawnFaultAfter?: 'roster-reservation' | 'initial-work-acceptance'
  readonly spawnErrorBeforeRosterOnce?: Error
  readonly teammateReplaceError?: Error
} = {}): Promise<Harness> {
  const ctx = new Context()
  const profiles = new MemoryTable<string, unknown>()
  const revisions = new MemoryTable<string, unknown>()
  const bindings = new MemoryTable<string, unknown>()
  const runs = new MemoryTable<string, unknown>()
  const v0Profiles = new MemoryTable<string, unknown>()
  const v0Bindings = new MemoryTable<string, unknown>()
  const emptyV1Tables = new Map([
    ['run_index', runs],
    ['eval_sets', new MemoryTable<string, unknown>()],
    ['eval_runs', new MemoryTable<string, unknown>()],
  ])
  let migrationMarker: unknown = { formatVersion: 1, status: 'pending', sourceVersion: 0 }
  const close = vi.fn(async () => undefined)
  const roster: Array<Record<string, unknown>> = [
    { id: 'lead', name: 'lead', role: 'lead', status: 'idle', diagnostics: [] },
    { id: 'teammate', name: 'worker', role: 'teammate', status: 'inactive', diagnostics: [] },
  ]
  const scopeDisposals: Array<ReturnType<typeof vi.fn>> = []
  const scopeDisposer = (): ReturnType<typeof vi.fn> => {
    const dispose = vi.fn()
    scopeDisposals.push(dispose)
    return dispose
  }
  const sections = vi.fn(scopeDisposer)
  const contexts = vi.fn(scopeDisposer)
  const restriction = vi.fn(scopeDisposer)
  const childEvents: string[] = []
  const sessionEvents = new Map<string, SessionEvent[]>([
    ['lead', []],
    ['teammate', []],
  ])
  const session = (id: string, header: Record<string, unknown>) => ({
    header,
    ownEvents: () => [...sessionEvents.get(id) ?? []],
  })
  const leader = { id: 'lead', session: session('lead', {}), ctx } as unknown as Agent
  const teammate = {
    id: 'teammate',
    session: session('teammate', { parentSession: 'lead' }),
    ctx,
  } as unknown as Agent
  const staleLeader = { id: 'lead', session: session('lead', {}), ctx } as unknown as Agent
  const foreignRoot = { id: 'foreign', session: session('foreign', {}), ctx } as unknown as Agent
  const agents = new Map<string, Agent>([['lead', leader], ['teammate', teammate]])
  let llmRoutes = [...options.llmRoutes ?? [DEFAULT_LLM_ROUTE]]
  let nextLlmRefreshGate: {
    readonly entered: PromiseWithResolvers<void>
    readonly release: PromiseWithResolvers<void>
  } | undefined
  const gateNextLlmRefresh = () => {
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const gate = { entered, release }
    nextLlmRefreshGate = gate
    return {
      entered: entered.promise,
      release: () => {
        if (nextLlmRefreshGate === gate) nextLlmRefreshGate = undefined
        release.resolve()
      },
    }
  }

  ctx.provide('agents', {
    get: (id: string) => agents.get(id),
    list: () => [...agents.values()],
  } as never)
  ctx.provide('sessionPersistence', {
    inspect: async (id: string) => ({
      header: { id },
      events: [...sessionEvents.get(id) ?? []],
      inheritedEventCount: 0,
    }),
  } as never)
  ctx.provide('storageDomain', {
    open: vi.fn(async (spec: { readonly name: string }) => {
      if (spec.name === 'agent_team_ultra') {
        return {
          table: (name: string) => name === 'profiles' ? v0Profiles : v0Bindings,
          close: async () => undefined,
        }
      }
      return {
        global: {
          get: () => migrationMarker,
          set: async (value: unknown) => { migrationMarker = value },
        },
        table: (name: string) => {
          if (name === 'profile_heads') return profiles
          if (name === 'profile_revisions') return revisions
          if (name === 'bindings') return bindings
          const table = emptyV1Tables.get(name)
          if (table === undefined) throw new Error(`unexpected v1 table ${name}`)
          return table
        },
        close,
      }
    }),
  } as never)
  ctx.provide('systemPrompt', {} as never)
  ctx.provide('tools', {
    schemas: () => [
      { name: 'read', description: 'Read files' },
      { name: 'bash', description: 'Run a shell' },
      { name: 'send_message', description: 'Team message' },
    ],
    get: (name: string) => name === 'read' || name === 'bash' ? { name } : undefined,
  } as never)
  ctx.provide('llm', {
    listProviders: () => [...new Map(llmRoutes.map(route => [route.provider, {
      id: route.provider,
      name: route.providerName,
    }])).values()],
    listModels: async (provider: string) => {
      const gate = nextLlmRefreshGate
      if (gate !== undefined) {
        gate.entered.resolve()
        await gate.release.promise
      }
      return llmRoutes
        .filter(route => route.provider === provider)
        .map(route => ({
          provider: route.provider,
          id: route.model,
          name: route.modelName,
          ...(route.secret === undefined ? {} : { apiKey: route.secret, endpoint: `https://${route.secret}` }),
        }))
    },
    resolveModelInfo: async (provider: string, model: string) => {
      const route = llmRoutes.find(candidate => candidate.provider === provider && candidate.model === model)
      if (route === undefined) throw new Error('unknown fake model route')
      return {
        provider: route.resolvedProvider ?? provider,
        id: route.resolvedModel ?? model,
        name: route.modelName,
        ...(route.reasoning === undefined ? {} : { reasoning: route.reasoning }),
        ...(route.secret === undefined ? {} : { credential: route.secret, nativePath: `/tmp/${route.secret}` }),
      }
    },
  } as never)
  const continuationProviders = new Map([
    ['spawn', {
      name: 'spawn',
      inheritsParentContext: false,
      capabilities: {},
      prepareContinuable: async () => ({}),
    }],
    ['fork', {
      name: 'fork',
      inheritsParentContext: true,
      capabilities: {},
      prepareContinuable: async () => ({}),
    }],
    ['codex', {
      name: 'codex',
      inheritsParentContext: false,
      capabilities: {},
    }],
    ['claude-code', {
      name: 'claude-code',
      inheritsParentContext: false,
      capabilities: {},
    }],
  ])
  ctx.provide('subagents', {
    list: () => [...continuationProviders.keys()],
    getProvider: (name: string) => continuationProviders.get(name),
  } as never)

  let spawnErrorBeforeRoster = options.spawnErrorBeforeRosterOnce
  const spawn = vi.fn(async (_caller: unknown, request: {
    name: string
    agentOptions?: { readonly provider?: string; readonly model?: string; readonly reasoningEffort?: string }
    runtime?: {
      readonly provider: string
      readonly launchRequestId: string
      readonly requirements: {
        readonly contextMode: 'fresh' | 'fork'
        readonly profileCapabilities: readonly string[]
        readonly runtimeCapabilities: readonly string[]
      }
    }
    signal?: AbortSignal
  }) => {
    const pending = [...bindings.records.values()].find(value =>
      (value as { provisioningPhase?: string }).provisioningPhase === 'pending')
    expect(pending).toBeDefined()
    if (options.spawnGate !== undefined) {
      await Promise.race([
        options.spawnGate,
        new Promise<never>((_resolve, reject) => {
          const signal = request.signal
          if (signal?.aborted === true) reject(signal.reason)
          else signal?.addEventListener('abort', () => { reject(signal.reason) }, { once: true })
        }),
      ])
    }
    if (spawnErrorBeforeRoster !== undefined) {
      const error = spawnErrorBeforeRoster
      spawnErrorBeforeRoster = undefined
      throw error
    }
    const externalRuntime = request.runtime === undefined ? undefined : {
      kind: 'external-agent',
      launchRequestId: request.runtime.launchRequestId,
      requestFingerprint: 'fake-provider-request',
      requirements: request.runtime.requirements,
    }
    const rosterMember: Record<string, unknown> = {
      id: 'child',
      name: request.name,
      role: 'teammate',
      status: 'provisioning',
      requestedRoute: request.agentOptions ?? {},
      ...(request.runtime === undefined ? {} : {
        provider: request.runtime.provider,
        context: request.runtime.requirements.contextMode,
        externalRuntime,
      }),
      diagnostics: [],
    }
    roster.push(rosterMember)
    if (options.spawnFaultAfter === 'roster-reservation') {
      throw new Error('fault after permanent roster reservation')
    }
    const resolvedRoute = options.childResolvedRoute ?? request.agentOptions ?? {}
    rosterMember.status = 'idle'
    rosterMember.resolvedRoute = resolvedRoute
    if (externalRuntime !== undefined) {
      Object.assign(externalRuntime, {
        nativeHandle: TeammateRuntimeHandle('catalog-runtime'),
        initialTurnId: TeammateRuntimeTurnId('catalog-initial-turn'),
      })
    }
    const childCtx = {
      systemPrompt: { section: sections, context: contexts },
      tools: { restrict: restriction },
      on: (event: string) => {
        childEvents.push(event)
        return scopeDisposer()
      },
    } as unknown as Context
    const child = {
      id: 'child',
      status: 'idle',
      session: session('child', { parentSession: 'lead' }),
      options: resolvedRoute,
      ctx: childCtx,
    } as unknown as Agent
    Object.defineProperty(childCtx, 'agent', { value: child })
    agents.set('child', child)
    ctx.emit('agent/created', { agent: child })
    if (options.spawnFaultAfter === 'initial-work-acceptance') {
      throw new Error('fault after durable initial-work acceptance')
    }
    return {
      member: {
        id: 'child',
        name: request.name,
        requestedRoute: request.agentOptions ?? {},
        resolvedRoute,
        ...(request.runtime === undefined ? {} : {
          provider: request.runtime.provider,
          externalRuntime,
        }),
        ...(resolvedRoute.model === undefined ? {} : { model: resolvedRoute.model }),
      },
    }
  })
  const tryMembership = (agent: Agent) => {
    if (agents.get(agent.id) !== agent) return undefined
    if (agent.session.header.parentSession === leader.id) {
      const name = roster.find(member => member.id === agent.id)?.name
      if (typeof name !== 'string') return undefined
      return { id: 'lead', root: leader, role: 'teammate', name } as const
    }
    return { id: agent.id, root: agent, role: 'lead', name: 'lead' } as const
  }
  const listMembers = vi.fn(() => roster)
  const readTeammateRuntimeEvidence = vi.fn(async (_caller, _targetName, request) => ({
    nativeHandle: TeammateRuntimeHandle('catalog-runtime'),
    items: [],
    complete: true,
    limit: request.limit,
  }))
  const teammateRegistrations = new Map<string, { setAvailable(available: boolean): void }>()
  const teammateMetadata = (provider: TeammateRuntimeProvider): TeammateRuntimeMetadata => Object.freeze({
    id: provider.id,
    displayName: provider.displayName,
    contextModes: Object.freeze(['fresh', 'fork'].filter(value => provider.contextModes.includes(value as never))) as never,
    profileCapabilities: Object.freeze([
      'persona', 'mission', 'context', 'memory', 'tool-policy', 'hooks',
    ].filter(value => provider.profileCapabilities.includes(value as never))) as never,
    runtimeCapabilities: Object.freeze([
      'exact-call-approval', 'sandbox', 'evaluation', 'evidence', 'usage',
    ].filter(value => provider.runtimeCapabilities.includes(value as never))) as never,
  })
  const registerTeammateRuntimeProvider = (provider: TeammateRuntimeProvider): TeammateRuntimeRegistration => {
    let available = true
    let metadata = teammateMetadata(provider)
    const listeners = new Set<() => void>()
    const setAvailable = (next: boolean): void => {
      if (next === available) return
      available = next
      for (const listener of [...listeners]) listener()
    }
    const registration = (async () => { setAvailable(false) }) as TeammateRuntimeRegistration
    registration.available = () => available
    registration.metadata = () => metadata
    registration.onAvailabilityChanged = (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    }
    registration.replace = async (replacement) => {
      if (options.teammateReplaceError !== undefined) {
        setAvailable(false)
        throw options.teammateReplaceError
      }
      metadata = teammateMetadata(replacement)
      setAvailable(true)
    }
    teammateRegistrations.set(provider.id, { setAvailable })
    return registration
  }
  ctx.provide('agentTeams', {
    tryMembership,
    membership: (agent: Agent) => {
      const membership = tryMembership(agent)
      if (membership === undefined) {
        throw new TeamError(`agent "${agent.id}" is not a member of an active Agent Team`, 'TEAM_NOT_MEMBER')
      }
      return membership
    },
    listMembers,
    spawnTeammate: spawn,
    registerTeammateRuntimeProvider,
    readTeammateRuntimeEvidence,
  } as never)

  const fiber = ctx.plugin(DigitalEmployeeService, options.serviceConfig)
  await fiber
  return {
    ctx,
    fiber,
    profiles,
    revisions,
    bindings,
    runs,
    close,
    restriction,
    sections,
    contexts,
    scopeDisposals,
    childEvents,
    spawn,
    listMembers,
    roster,
    leader,
    teammate,
    staleLeader,
    foreignRoot,
    agent: id => agents.get(id),
    disposeAgent: (agent) => {
      if (agents.get(agent.id) === agent) agents.delete(agent.id)
      ctx.emit('agent/disposed', { agent })
    },
    replaceLlmRoutes: (routes) => {
      llmRoutes = [...routes]
      ctx.emit('llm/adapters-updated')
    },
    gateNextLlmRefresh,
    setTeammateRuntimeAvailable: (providerId, available) => {
      const registration = teammateRegistrations.get(providerId)
      if (registration === undefined) throw new Error(`missing teammate runtime ${providerId}`)
      registration.setAvailable(available)
    },
    readTeammateRuntimeEvidence,
    appendSessionEvent: (sessionId, type, data, time) => {
      const events = sessionEvents.get(sessionId) ?? []
      sessionEvents.set(sessionId, events)
      const next = { type, seq: SessionSeq(events.length), time, data } as SessionEvent
      events.push(next)
      const owner = agents.get(sessionId)
      if (owner !== undefined) runtimeEmitSessionEvent(ctx, owner, next)
    },
  }
}

function runtimeEmitSessionEvent(ctx: Context, agent: Agent, event: SessionEvent): void {
  ctx.emit('session/event', agent.session, event)
}

describe('Digital Employee profile contract', () => {
  it('creates immutable candidates and no-ops unchanged normalized saves with Head CAS', async () => {
    const runtime = await harness()
    const service = runtime.ctx.digitalEmployees as unknown as {
      saveProfile: (
        caller: Agent,
        request: { readonly expectedHeadRevision: number | null; readonly profile: DigitalEmployeeProfileDraft },
      ) => Promise<{
        readonly ok: boolean
        readonly value?: {
          readonly unchanged: boolean
          readonly head: { readonly headRevision: number; readonly latestRevision: number; readonly activeRevision?: number }
          readonly revision: { readonly revision: number; readonly fingerprint: string }
        }
      }>
    }

    const created = await service.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    expect(created).toMatchObject({
      ok: true,
      value: {
        unchanged: false,
        head: { headRevision: 1, latestRevision: 1 },
        revision: { revision: 1, fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u) },
      },
    })
    expect(created.value?.head).not.toHaveProperty('activeRevision')

    const unchanged = await service.saveProfile(runtime.leader, {
      expectedHeadRevision: 1,
      profile: { ...draft(), displayName: '  Code Reviewer  ' },
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    expect(unchanged).toMatchObject({
      ok: true,
      value: {
        unchanged: true,
        head: { headRevision: 1, latestRevision: 1 },
        revision: { revision: 1, fingerprint: created.value?.revision.fingerprint },
      },
    })
    expect(runtime.revisions.size).toBe(1)

    const changed = await service.saveProfile(runtime.leader, {
      expectedHeadRevision: 1,
      profile: draft({ displayName: 'Reviewer Candidate' }),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    expect(changed).toMatchObject({
      ok: true,
      value: {
        unchanged: false,
        head: { headRevision: 2, latestRevision: 2 },
        revision: { revision: 2, fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u) },
      },
    })
    expect(changed.value?.revision.fingerprint).not.toBe(created.value?.revision.fingerprint)
    expect(runtime.revisions.size).toBe(2)

    await runtime.fiber.dispose()
  })

  it('reuses an orphan Revision when the first Head publication is retried after a crash', async () => {
    const runtime = await harness()
    const publishHead = vi.spyOn(runtime.profiles, 'put')
      .mockRejectedValueOnce(new Error('simulated crash before Head publication'))

    await expect(runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })).rejects.toThrow('simulated crash before Head publication')
    expect(runtime.profiles.size).toBe(0)
    expect(runtime.revisions.size).toBe(1)

    await expect(runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })).resolves.toMatchObject({
      ok: true,
      value: { head: { latestRevision: 1 }, revision: { revision: 1 } },
    })
    expect(runtime.revisions.size).toBe(1)
    expect(publishHead).toHaveBeenCalledTimes(2)

    await runtime.fiber.dispose()
  })

  it('rejects an invalid Head CAS value before writing a candidate', async () => {
    const runtime = await harness()
    const service = runtime.ctx.digitalEmployees as unknown as {
      saveProfile: (
        caller: Agent,
        request: { readonly expectedHeadRevision: number | null; readonly profile: DigitalEmployeeProfileDraft },
      ) => Promise<unknown>
    }

    await expect(service.saveProfile(runtime.leader, {
      expectedHeadRevision: -1,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })).resolves.toMatchObject({ ok: false, error: { code: 'profile-invalid' } })
    expect(runtime.profiles.size).toBe(0)
    expect(runtime.revisions.size).toBe(0)

    await runtime.fiber.dispose()
  })

  it('activates and rolls back existing Revisions while launch resolves only activeRevision', async () => {
    const runtime = await harness()
    const service = runtime.ctx.digitalEmployees as unknown as {
      saveProfile: (
        caller: Agent,
        request: { readonly expectedHeadRevision: number | null; readonly profile: DigitalEmployeeProfileDraft },
      ) => Promise<{ readonly ok: boolean; readonly value?: { readonly head: { readonly headRevision: number } } }>
      activateProfile: (
        caller: Agent,
        request: { readonly profileId: string; readonly revision: number; readonly expectedHeadRevision: number },
      ) => Promise<unknown>
      rollbackProfile: (
        caller: Agent,
        request: { readonly profileId: string; readonly revision: number; readonly expectedHeadRevision: number },
      ) => Promise<unknown>
      spawnProfile: DigitalEmployeeService['spawnProfile']
      studioView: DigitalEmployeeService['studioView']
    }

    await service.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    await expect(service.spawnProfile(
      runtime.leader,
      { launchRequestId: LAUNCH_REQUEST_ID, profileId: 'code-reviewer' },
      new AbortController().signal,
    )).resolves.toMatchObject({ ok: false, error: { code: 'profile-not-active' } })

    await expect(service.activateProfile(runtime.leader, {
      profileId: 'code-reviewer',
      revision: 1,
      expectedHeadRevision: 1,
    })).resolves.toMatchObject({
      ok: true,
      value: { head: { headRevision: 2, latestRevision: 1, activeRevision: 1 } },
    })

    await service.saveProfile(runtime.leader, {
      expectedHeadRevision: 2,
      profile: draft({ displayName: 'Candidate Reviewer' }),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    expect(service.studioView(runtime.leader).profiles[0]?.head).toMatchObject({
      headRevision: 3,
      latestRevision: 2,
      activeRevision: 1,
    })

    await expect(service.activateProfile(runtime.leader, {
      profileId: 'code-reviewer',
      revision: 2,
      expectedHeadRevision: 3,
    })).resolves.toMatchObject({ ok: true, value: { head: { headRevision: 4, activeRevision: 2 } } })
    await expect(service.rollbackProfile(runtime.leader, {
      profileId: 'code-reviewer',
      revision: 1,
      expectedHeadRevision: 4,
    })).resolves.toMatchObject({
      ok: true,
      value: { head: { headRevision: 5, latestRevision: 2, activeRevision: 1 } },
    })

    await expect(service.spawnProfile(
      runtime.leader,
      { launchRequestId: LAUNCH_REQUEST_ID, profileId: 'code-reviewer' },
      new AbortController().signal,
    )).resolves.toMatchObject({
      ok: true,
      value: { profileRevision: 1 },
    })
    expect([...runtime.bindings.records.values()][0]).toMatchObject({
      profileRevision: 1,
      profile: { displayName: 'Code Reviewer' },
    })

    await runtime.fiber.dispose()
  })

  it('archives and restores a Profile through Head CAS without deleting history', async () => {
    const runtime = await harness()
    const service = runtime.ctx.digitalEmployees as unknown as {
      saveProfile: (
        caller: Agent,
        request: { readonly expectedHeadRevision: number | null; readonly profile: DigitalEmployeeProfileDraft },
      ) => Promise<unknown>
      activateProfile: (
        caller: Agent,
        request: { readonly profileId: string; readonly revision: number; readonly expectedHeadRevision: number },
      ) => Promise<unknown>
      archiveProfile: (
        caller: Agent,
        request: { readonly profileId: string; readonly expectedHeadRevision: number },
      ) => Promise<unknown>
      restoreProfile: (
        caller: Agent,
        request: { readonly profileId: string; readonly expectedHeadRevision: number },
      ) => Promise<unknown>
      spawnProfile: DigitalEmployeeService['spawnProfile']
    }

    await service.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    await service.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })
    await expect(service.archiveProfile(runtime.leader, {
      profileId: 'code-reviewer', expectedHeadRevision: 2,
    })).resolves.toMatchObject({
      ok: true,
      value: { head: { headRevision: 3, activeRevision: 1, archivedAt: expect.any(Number) } },
    })
    expect(runtime.revisions.size).toBe(1)

    await expect(service.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 3,
    })).resolves.toMatchObject({ ok: false, error: { code: 'profile-archived' } })
    await expect(service.spawnProfile(
      runtime.leader,
      { launchRequestId: LAUNCH_REQUEST_ID, profileId: 'code-reviewer' },
      new AbortController().signal,
    )).resolves.toMatchObject({ ok: false, error: { code: 'profile-archived' } })

    await expect(service.restoreProfile(runtime.leader, {
      profileId: 'code-reviewer', expectedHeadRevision: 2,
    })).resolves.toMatchObject({
      ok: false,
      error: { code: 'profile-conflict', currentHead: { headRevision: 3 } },
    })
    const restored = await service.restoreProfile(runtime.leader, {
      profileId: 'code-reviewer', expectedHeadRevision: 3,
    }) as { readonly ok: boolean; readonly value?: { readonly head: object } }
    expect(restored).toMatchObject({ ok: true, value: { head: { headRevision: 4, activeRevision: 1 } } })
    expect(restored.value?.head).not.toHaveProperty('archivedAt')

    await expect(service.spawnProfile(
      runtime.leader,
      { launchRequestId: LAUNCH_REQUEST_ID, profileId: 'code-reviewer' },
      new AbortController().signal,
    )).resolves.toMatchObject({ ok: true, value: { profileRevision: 1 } })

    await runtime.fiber.dispose()
  })

  it('returns bounded history and a bounded structured diff against the active Revision', async () => {
    const runtime = await harness({ serviceConfig: { maxRevisionHistory: 2, maxDiffEntries: 1 } })
    const service = runtime.ctx.digitalEmployees as unknown as {
      saveProfile: (
        caller: Agent,
        request: { readonly expectedHeadRevision: number | null; readonly profile: DigitalEmployeeProfileDraft },
      ) => Promise<unknown>
      activateProfile: (
        caller: Agent,
        request: { readonly profileId: string; readonly revision: number; readonly expectedHeadRevision: number },
      ) => Promise<unknown>
      profileRevision: (
        caller: Agent,
        request: { readonly profileId: string; readonly revision: number },
      ) => Promise<unknown>
      studioView: DigitalEmployeeService['studioView']
    }

    await service.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    await service.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })
    await service.saveProfile(runtime.leader, {
      expectedHeadRevision: 2,
      profile: draft({ displayName: 'Candidate Two', persona: 'Candidate persona two.' }),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    await service.saveProfile(runtime.leader, {
      expectedHeadRevision: 3,
      profile: draft({ displayName: 'Candidate Three', persona: 'Candidate persona three.' }),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })

    const entry = service.studioView(runtime.leader).profiles[0]
    expect(entry).toMatchObject({
      head: { headRevision: 4, latestRevision: 3, activeRevision: 1 },
      latest: { revision: 3, profile: { displayName: 'Candidate Three' } },
      history: [{ revision: 3 }, { revision: 2 }],
      historyTruncated: true,
    })
    expect(Object.isFrozen(entry?.history)).toBe(true)

    await expect(service.profileRevision(runtime.leader, {
      profileId: 'code-reviewer', revision: 3,
    })).resolves.toMatchObject({
      ok: true,
      value: {
        comparedToRevision: 1,
        revision: { revision: 3, fingerprint: entry?.latest.fingerprint },
        diff: [{ path: 'profile.displayName', kind: 'changed', before: '"Code Reviewer"', after: '"Candidate Three"' }],
        diffTruncated: true,
      },
    })
    await expect(service.profileRevision(runtime.teammate, {
      profileId: 'code-reviewer', revision: 3,
    })).resolves.toMatchObject({ ok: false, error: { code: 'team-lead-required' } })

    await runtime.fiber.dispose()
  })

  it('rejects executable or internally inconsistent hooks', () => {
    const invalid: ProfileHook = {
      id: 'unsafe',
      point: 'before-tool',
      effect: 'context',
      text: 'run arbitrary code',
      enabled: true,
    }
    const parsed = digitalEmployeeProfileDraftSchema.safeParse(draft({ hooks: [invalid] }))
    expect(parsed.success).toBe(false)
  })

  it('deeply detaches and freezes snapshots', () => {
    const source: DigitalEmployeeProfile = {
      ...draft(),
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    }
    const frozen = snapshotProfile(source)
    expect(Object.isFrozen(frozen)).toBe(true)
    expect(Object.isFrozen(frozen.context)).toBe(true)
    expect(Object.isFrozen(frozen.context[0])).toBe(true)
    expect(Object.isFrozen(frozen.toolPolicy.names)).toBe(true)
    expect(frozen.context).not.toBe(source.context)
  })

  it('installs one immutable Profile capability layer with idempotent cleanup', async () => {
    const runtime = await harness()
    const disposals: Array<ReturnType<typeof vi.fn>> = []
    const registration = () => {
      const dispose = vi.fn()
      disposals.push(dispose)
      return dispose
    }
    const section = vi.fn(registration)
    const context = vi.fn(registration)
    const restrict = vi.fn(registration)
    const events: string[] = []
    const childCtx = {
      systemPrompt: { section, context },
      tools: { restrict },
      on: (event: string) => {
        events.push(event)
        return registration()
      },
    } as unknown as Context
    const child = {
      id: 'profile-worker',
      session: { header: {} },
      ctx: childCtx,
    } as unknown as Agent
    Object.defineProperty(childCtx, 'agent', { value: child })
    const source: DigitalEmployeeProfile = {
      ...draft(),
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    }

    const service = runtime.ctx.digitalEmployees as unknown as {
      installProfileCapabilities: (
        caller: Agent,
        target: Agent,
        profile: DigitalEmployeeProfile,
      ) => () => void
    }
    const dispose = service.installProfileCapabilities(runtime.leader, child, source)
    ;(source.toolPolicy.names as string[]).push('bash')

    expect(section).toHaveBeenCalledWith(expect.objectContaining({
      name: 'deployment:persona',
      text: 'Be precise, skeptical, and evidence-driven.',
    }))
    expect(context).toHaveBeenCalledTimes(2)
    expect(restrict).toHaveBeenCalledWith({ allow: ['read'] })
    expect(events).toEqual([
      'agent/session-start',
      'agent/pre-step',
      'tools/pre-execute',
      'tools/post-execute',
    ])

    dispose()
    dispose()
    expect(disposals).toHaveLength(8)
    expect(disposals.every(candidate => candidate.mock.calls.length === 1)).toBe(true)

    await runtime.fiber.dispose()
  })

  it('rejects a teammate before the exported capability installer mutates a target scope', async () => {
    const runtime = await harness()
    const section = vi.fn(() => vi.fn())
    const childCtx = {
      systemPrompt: { section, context: vi.fn(() => vi.fn()) },
      tools: { restrict: vi.fn(() => vi.fn()) },
      on: vi.fn(() => vi.fn()),
    } as unknown as Context
    const child = {
      id: 'profile-worker',
      session: { header: {} },
      ctx: childCtx,
    } as unknown as Agent
    Object.defineProperty(childCtx, 'agent', { value: child })
    const profile: DigitalEmployeeProfile = {
      ...draft(),
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    }

    const service = runtime.ctx.digitalEmployees as unknown as {
      installProfileCapabilities: (
        caller: Agent,
        target: Agent,
        profile: DigitalEmployeeProfile,
      ) => () => void
    }
    let rejected: unknown
    try {
      service.installProfileCapabilities(runtime.teammate, child, profile)
    } catch (error: unknown) {
      rejected = remoteErrorOf(error)
    }
    expect(rejected).toMatchObject({
      code: 'digital-employees/team-lead-required',
      details: { operation: 'install-profile-capabilities' },
    })
    expect(section).not.toHaveBeenCalled()

    await runtime.fiber.dispose()
  })

  it('serializes CAS writes so one stale concurrent editor loses', async () => {
    const runtime = await harness()
    const first = await runtime.ctx.digitalEmployees.saveProfile(
      runtime.leader,
      { expectedHeadRevision: null, profile: draft(), runtimeTarget: DEFAULT_RUNTIME_TARGET },
    )
    expect(first).toMatchObject({
      ok: true,
      value: { head: { headRevision: 1 }, revision: { revision: 1 } },
    })
    const [left, right] = await Promise.all([
      runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
        expectedHeadRevision: 1,
        profile: draft({ displayName: 'Reviewer A' }),
        runtimeTarget: DEFAULT_RUNTIME_TARGET,
      }),
      runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
        expectedHeadRevision: 1,
        profile: draft({ displayName: 'Reviewer B' }),
        runtimeTarget: DEFAULT_RUNTIME_TARGET,
      }),
    ])
    expect([left, right].filter(result => result.ok)).toHaveLength(1)
    expect([left, right].find(result => !result.ok)).toMatchObject({
      ok: false,
      error: { code: 'profile-conflict', currentHead: { headRevision: 2, latestRevision: 2 } },
    })
    await runtime.fiber.dispose()
  })

  it('rejects an exact teammate at the exported save seam without writing', async () => {
    const runtime = await harness()

    const service = runtime.ctx.digitalEmployees as unknown as {
      saveProfile: (
        caller: Agent,
        request: { readonly expectedHeadRevision: null; readonly profile: DigitalEmployeeProfileDraft },
      ) => Promise<unknown>
    }
    await expect(service.saveProfile(runtime.teammate, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    }))
      .resolves.toMatchObject({ ok: false, error: { code: 'team-lead-required' } })
    expect(runtime.profiles.size).toBe(0)

    await runtime.fiber.dispose()
  })

  it('rejects an exact teammate at the exported archive seam without changing the Head', async () => {
    const runtime = await harness()
    const saved = await runtime.ctx.digitalEmployees.saveProfile(
      runtime.leader,
      { expectedHeadRevision: null, profile: draft(), runtimeTarget: DEFAULT_RUNTIME_TARGET },
    )
    expect(saved).toMatchObject({ ok: true, value: { head: { headRevision: 1 } } })

    const archive = runtime.ctx.digitalEmployees.archiveProfile as unknown as (
      caller: Agent,
      request: { readonly profileId: string; readonly expectedHeadRevision: number },
    ) => Promise<unknown>
    await expect(archive.call(runtime.ctx.digitalEmployees, runtime.teammate, {
      profileId: 'code-reviewer',
      expectedHeadRevision: 1,
    })).resolves.toMatchObject({ ok: false, error: { code: 'team-lead-required' } })
    expect(runtime.profiles.size).toBe(1)
    expect(runtime.profiles.get('code-reviewer')).not.toHaveProperty('archivedAt')

    await runtime.fiber.dispose()
  })

  it('rejects an exact teammate from the Host-owned Studio snapshot seam', async () => {
    const runtime = await harness()

    const service = runtime.ctx.digitalEmployees as unknown as {
      studioView: (caller: Agent) => unknown
    }
    let rejected: unknown
    try {
      service.studioView(runtime.teammate)
    } catch (error: unknown) {
      rejected = remoteErrorOf(error)
    }
    expect(rejected).toMatchObject({
      code: 'digital-employees/team-lead-required',
      details: { operation: 'view' },
    })

    await runtime.fiber.dispose()
  })

  it.each(['staleLeader', 'foreignRoot'] as const)(
    'rejects the %s identity from every exported Host operation',
    async (identity) => {
      const runtime = await harness()
      const caller = runtime[identity]
      let viewFailure: unknown
      try {
        runtime.ctx.digitalEmployees.studioView(caller)
      } catch (error: unknown) {
        viewFailure = remoteErrorOf(error)
      }
      expect(viewFailure).toMatchObject({ code: 'digital-employees/team-rejected' })
      await expect(runtime.ctx.digitalEmployees.saveProfile(
        caller,
        { expectedHeadRevision: null, profile: draft(), runtimeTarget: DEFAULT_RUNTIME_TARGET },
      )).resolves.toMatchObject({ ok: false, error: { code: 'team-rejected' } })
      await expect(runtime.ctx.digitalEmployees.profileRevision(
        caller,
        { profileId: 'code-reviewer', revision: 1 },
      )).resolves.toMatchObject({ ok: false, error: { code: 'team-rejected' } })
      await expect(runtime.ctx.digitalEmployees.activateProfile(
        caller,
        { profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1 },
      )).resolves.toMatchObject({ ok: false, error: { code: 'team-rejected' } })
      await expect(runtime.ctx.digitalEmployees.rollbackProfile(
        caller,
        { profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1 },
      )).resolves.toMatchObject({ ok: false, error: { code: 'team-rejected' } })
      await expect(runtime.ctx.digitalEmployees.archiveProfile(
        caller,
        { profileId: 'code-reviewer', expectedHeadRevision: 1 },
      )).resolves.toMatchObject({ ok: false, error: { code: 'team-rejected' } })
      await expect(runtime.ctx.digitalEmployees.restoreProfile(
        caller,
        { profileId: 'code-reviewer', expectedHeadRevision: 1 },
      )).resolves.toMatchObject({ ok: false, error: { code: 'team-rejected' } })
      await expect(runtime.ctx.digitalEmployees.spawnProfile(
        caller,
        { launchRequestId: LAUNCH_REQUEST_ID, profileId: 'code-reviewer' },
        new AbortController().signal,
      )).resolves.toMatchObject({ ok: false, error: { code: 'team-rejected' } })
      expect(runtime.profiles.size).toBe(0)
      expect(runtime.bindings.size).toBe(0)

      await runtime.fiber.dispose()
    },
  )

  it('returns one deeply detached browser-safe Studio snapshot to the exact live Lead', async () => {
    const runtime = await harness()
    await runtime.ctx.digitalEmployees.saveProfile(
      runtime.leader,
      { expectedHeadRevision: null, profile: draft(), runtimeTarget: DEFAULT_RUNTIME_TARGET },
    )

    const view = runtime.ctx.digitalEmployees.studioView(runtime.leader)
    expect(view).toMatchObject({
      profiles: [{
        head: { profileId: 'code-reviewer', headRevision: 1, latestRevision: 1 },
        latest: { revision: 1, profile: { id: 'code-reviewer' } },
        history: [{ revision: 1 }],
      }],
      tools: [
        { name: 'bash', description: 'Run a shell' },
        { name: 'read', description: 'Read files' },
      ],
      instances: [],
    })
    expect(Object.isFrozen(view)).toBe(true)
    expect(Object.isFrozen(view.profiles)).toBe(true)
    expect(Object.isFrozen(view.profiles[0])).toBe(true)
    expect(Object.isFrozen(view.profiles[0]!.latest.profile.context[0])).toBe(true)
    expect(Object.isFrozen(view.tools)).toBe(true)
    expect(Object.isFrozen(view.tools[0])).toBe(true)
    expect(view.profiles[0]!.head).not.toBe(runtime.profiles.get('code-reviewer'))
    expect(view.profiles[0]!.latest).not.toBe([...runtime.revisions.records.values()][0])
    expect(structuredClone(view)).toEqual(view)

    await runtime.fiber.dispose()
  })

  it('persists the binding before provisioning and composes the immutable child scope', async () => {
    const runtime = await harness()
    const selectedTarget = { ...DEFAULT_RUNTIME_TARGET, reasoningEffort: 'high' } as const
    const saved = await runtime.ctx.digitalEmployees.saveProfile(
      runtime.leader,
      { expectedHeadRevision: null, profile: draft(), runtimeTarget: selectedTarget },
    )
    expect(saved.ok).toBe(true)
    await runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })
    const result = await runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader,
      {
        launchRequestId: LAUNCH_REQUEST_ID,
        profileId: 'code-reviewer',
        assignment: 'Review the storage transaction.',
      },
      new AbortController().signal,
    )
    expect(result).toMatchObject({
      ok: true,
      value: {
        memberName: 'code-reviewer',
        memberId: 'child',
        profileRevision: 1,
        runtimeTarget: selectedTarget,
        resolvedRuntimeTarget: selectedTarget,
        requiredCapabilities: {
          contextMode: 'fresh',
          profileCapabilities: ['persona', 'mission', 'context', 'memory', 'tool-policy', 'hooks'],
        },
        launchRequestId: LAUNCH_REQUEST_ID,
        provisioningPhase: 'active',
        runtimeAvailability: 'available',
        runtimePresence: 'idle',
      },
    })
    if (!result.ok) throw new Error('expected a successful launch')
    expect(Object.isFrozen(result.value.runtimeTarget)).toBe(true)
    expect(Object.isFrozen(result.value.resolvedRuntimeTarget)).toBe(true)
    expect(Object.isFrozen(result.value.requiredCapabilities)).toBe(true)
    expect(Object.isFrozen(result.value.requiredCapabilities.profileCapabilities)).toBe(true)
    expect(runtime.spawn).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      name: 'code-reviewer',
      context: 'fresh',
      provider: 'spawn',
      agentOptions: {
        provider: 'test-provider',
        model: 'test-model',
        reasoningEffort: 'high',
      },
    }))
    expect(runtime.agent('child')?.options).toMatchObject({
      provider: 'test-provider',
      model: 'test-model',
      reasoningEffort: 'high',
    })
    expect(runtime.sections).toHaveBeenCalledWith(expect.objectContaining({
      name: 'deployment:persona',
      text: 'Be precise, skeptical, and evidence-driven.',
    }))
    expect(runtime.contexts).toHaveBeenCalledTimes(2)
    expect(runtime.restriction).toHaveBeenCalledWith({ allow: ['read'] })
    expect(runtime.childEvents).toEqual([
      'agent/session-start',
      'agent/pre-step',
      'tools/pre-execute',
      'tools/post-execute',
    ])
    expect([...runtime.bindings.records.values()][0]).toMatchObject({
      launchRequestId: LAUNCH_REQUEST_ID,
      requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
      assignmentHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      profileFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
      capabilityGeneration: 1,
      provisioningPhase: 'active',
      profile: { revision: 1, displayName: 'Code Reviewer' },
      runtimeTarget: selectedTarget,
      preflightRuntimeTarget: selectedTarget,
      resolvedRuntimeTarget: selectedTarget,
      requiredCapabilities: {
        contextMode: 'fresh',
        profileCapabilities: ['persona', 'mission', 'context', 'memory', 'tool-policy', 'hooks'],
      },
    })
    expect(JSON.stringify([...runtime.bindings.records.values()][0])).not.toContain('Review the storage transaction.')
    await runtime.fiber.dispose()
    expect(runtime.scopeDisposals).toHaveLength(8)
    expect(runtime.scopeDisposals.every(dispose => dispose.mock.calls.length === 1)).toBe(true)
    expect(runtime.close).toHaveBeenCalledOnce()
  })

  it('requires a canonical caller-minted launch request UUID before durable work', async () => {
    const runtime = await harness()
    await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    await runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })

    await expect(runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader,
      { profileId: 'code-reviewer' } as never,
      new AbortController().signal,
    )).resolves.toMatchObject({ ok: false, error: { code: 'profile-invalid' } })
    expect(runtime.bindings.size).toBe(0)
    expect(runtime.spawn).not.toHaveBeenCalled()
    await runtime.fiber.dispose()
  })

  it('repairs and serves one safe Run from each accepted DSH child turn', async () => {
    const runtime = await harness()
    await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    await runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })
    await runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader,
      { launchRequestId: LAUNCH_REQUEST_ID, profileId: 'code-reviewer' },
      new AbortController().signal,
    )
    runtime.appendSessionEvent('child', 'turn/start', { turn: 1 }, 100)
    runtime.appendSessionEvent('child', 'assistant/message', {
      turn: 1,
      step: 0,
      message: { role: 'assistant', content: [{ type: 'text', text: 'SECRET_RUN_REPLY' }] },
      usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
    }, 101)
    runtime.appendSessionEvent('child', 'turn/end', { turn: 1, reason: { kind: 'completed' } }, 102)

    const view = await runtime.ctx.digitalEmployees.remoteView(runtime.leader)
    expect(view.runs).toHaveLength(1)
    expect(view.runs[0]).toMatchObject({
      source: 'dsh-session',
      canonicalTurnId: 'child:1',
      terminal: 'completed',
      usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
      completeness: { status: 'complete' },
    })
    const runId = view.runs[0]!.runId
    await expect(runtime.ctx.digitalEmployees.runEvidence(
      runtime.leader,
      { runId },
      new AbortController().signal,
    )).resolves.toMatchObject({
      ok: true,
      value: {
        run: { runId },
        timeline: [
          { kind: 'turn', outcome: 'started' },
          { kind: 'usage', usage: { totalTokens: 6 } },
          { kind: 'turn', outcome: 'completed' },
        ],
      },
    })
    expect(JSON.stringify([...runtime.runs.records.values()])).not.toContain('SECRET_RUN_REPLY')
    await runtime.fiber.dispose()
  })

  it('repairs external launch and delivery Runs and lazily folds exact native evidence', async () => {
    const runtime = await harness()
    const registration = runtime.ctx.digitalEmployees.registerExternalRuntimeProvider(catalogExternalProvider({
      id: 'native-reviewer',
      displayName: 'Native Reviewer',
      contextModes: ['fresh'],
      profileCapabilities: ['persona', 'mission', 'context', 'memory', 'tool-policy', 'hooks'],
      runtimeCapabilities: ['evidence', 'usage'],
    }))
    await runtime.ctx.digitalEmployees.whenRuntimeCatalogSettled()
    await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: { kind: 'external-agent', provider: 'native-reviewer' },
    })
    await runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })
    await runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader,
      { launchRequestId: LAUNCH_REQUEST_ID, profileId: 'code-reviewer' },
      new AbortController().signal,
    )
    const externalRuntime = runtime.roster.find(member => member.id === 'child')?.externalRuntime
    runtime.appendSessionEvent('lead', 'team/member', {
      version: 1,
      teamId: 'lead',
      member: {
        id: 'child',
        name: 'code-reviewer',
        phase: 'active',
        externalRuntime,
      },
    }, 200)
    runtime.appendSessionEvent('lead', 'team/message/delivered', {
      version: 1,
      teamId: 'lead',
      messageId: 'message-1',
      targetId: 'child',
      nativeTurnId: 'catalog-delivery-turn',
    }, 210)

    const view = await runtime.ctx.digitalEmployees.remoteView(runtime.leader)
    expect(view.runs).toHaveLength(2)
    expect(view.runs.map(run => run.canonicalTurnId).sort()).toEqual([
      'catalog-delivery-turn',
      'catalog-initial-turn',
    ])
    const delivery = view.runs.find(run => run.canonicalTurnId === 'catalog-delivery-turn')!
    runtime.readTeammateRuntimeEvidence.mockResolvedValueOnce({
      nativeHandle: TeammateRuntimeHandle('catalog-runtime'),
      complete: true,
      items: [
        {
          id: 'usage-1',
          kind: 'usage',
          timestamp: 211,
          turnId: TeammateRuntimeTurnId('catalog-delivery-turn'),
          usage: { inputTokens: 8, outputTokens: 3, totalTokens: 11 },
          privatePayload: 'SECRET_NATIVE_PAYLOAD',
        },
        {
          id: 'turn-1',
          kind: 'turn',
          timestamp: 212,
          turnId: TeammateRuntimeTurnId('catalog-delivery-turn'),
          outcome: 'completed',
        },
      ],
    })
    const detail = await runtime.ctx.digitalEmployees.runEvidence(
      runtime.leader,
      { runId: delivery.runId },
      new AbortController().signal,
    )
    expect(detail).toMatchObject({
      ok: true,
      value: {
        run: {
          terminal: 'completed',
          usage: { inputTokens: 8, outputTokens: 3, totalTokens: 11 },
          completeness: { status: 'complete' },
        },
      },
    })
    expect(JSON.stringify(detail)).not.toContain('SECRET_NATIVE_PAYLOAD')
    await registration()
    await runtime.fiber.dispose()
  })

  it('retains only the configured newest Run index rows', async () => {
    const runtime = await harness({ serviceConfig: { maxRuns: 1 } })
    await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    await runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })
    await runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader,
      { launchRequestId: LAUNCH_REQUEST_ID, profileId: 'code-reviewer' },
      new AbortController().signal,
    )
    runtime.appendSessionEvent('child', 'turn/start', { turn: 1 }, 100)
    runtime.appendSessionEvent('child', 'turn/end', { turn: 1, reason: { kind: 'completed' } }, 101)
    runtime.appendSessionEvent('child', 'turn/start', { turn: 2 }, 200)
    runtime.appendSessionEvent('child', 'turn/end', {
      turn: 2,
      reason: { kind: 'error', error: { message: 'bounded failure', code: 'TEST' } },
    }, 201)

    const view = await runtime.ctx.digitalEmployees.remoteView(runtime.leader)
    expect(view.runs).toHaveLength(1)
    expect(view.runs[0]).toMatchObject({ canonicalTurnId: 'child:2', terminal: 'failed' })
    expect(runtime.runs.size).toBe(1)
    await runtime.fiber.dispose()
  })

  it('returns one Binding for identical launch replay and rejects changed input', async () => {
    const runtime = await harness()
    await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    await runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })
    const request = {
      launchRequestId: LAUNCH_REQUEST_ID,
      profileId: 'code-reviewer',
      assignment: 'Review the same normalized assignment.',
    }

    const first = await runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader, request, new AbortController().signal,
    )
    const replay = await runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader, { ...request, assignment: `  ${request.assignment}  ` }, new AbortController().signal,
    )
    const conflict = await runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader, { ...request, assignment: 'A changed assignment.' }, new AbortController().signal,
    )

    expect(first).toMatchObject({ ok: true, value: { memberId: 'child' } })
    expect(replay).toEqual(first)
    expect(conflict).toMatchObject({ ok: false, error: { code: 'launch-request-conflict' } })
    expect(runtime.spawn).toHaveBeenCalledOnce()
    expect(runtime.bindings.size).toBe(1)
    await runtime.fiber.dispose()
  })

  it('coalesces concurrent identical launch calls before the roster reservation', async () => {
    const gate = Promise.withResolvers<void>()
    const runtime = await harness({ spawnGate: gate.promise })
    await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    await runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })
    const request = { launchRequestId: LAUNCH_REQUEST_ID, profileId: 'code-reviewer' }

    const first = runtime.ctx.digitalEmployees.spawnProfile(runtime.leader, request, new AbortController().signal)
    await vi.waitFor(() => {
      expect([...runtime.bindings.records.values()][0]).toMatchObject({
        runtimeTarget: DEFAULT_RUNTIME_TARGET,
        preflightRuntimeTarget: DEFAULT_RUNTIME_TARGET,
        provisioningPhase: 'pending',
      })
      expect([...runtime.bindings.records.values()][0]).not.toHaveProperty('resolvedRuntimeTarget')
    })
    const replay = runtime.ctx.digitalEmployees.spawnProfile(runtime.leader, request, new AbortController().signal)
    expect(runtime.spawn).toHaveBeenCalledOnce()
    gate.resolve()
    await expect(Promise.all([first, replay])).resolves.toEqual([
      expect.objectContaining({ ok: true }),
      expect.objectContaining({ ok: true }),
    ])
    expect(runtime.spawn).toHaveBeenCalledOnce()
    await runtime.fiber.dispose()
  })

  it('recovers one launch after a fault immediately following the pending Binding commit', async () => {
    const runtime = await harness()
    await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    await runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })
    const fault = new Error('fault after pending commit')
    const put = runtime.bindings.put.bind(runtime.bindings)
    const injected = vi.spyOn(runtime.bindings, 'put').mockImplementation(async (key, value) => {
      await put(key, value)
      if ((value as { provisioningPhase?: string }).provisioningPhase === 'pending') throw fault
    })
    const request = {
      launchRequestId: LAUNCH_REQUEST_ID,
      profileId: 'code-reviewer',
      assignment: 'Resume the committed intent.',
    }

    await expect(runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader, request, new AbortController().signal,
    )).rejects.toBe(fault)
    expect(runtime.spawn).not.toHaveBeenCalled()
    expect([...runtime.bindings.records.values()][0]).toMatchObject({
      launchRequestId: LAUNCH_REQUEST_ID,
      provisioningPhase: 'pending',
    })
    injected.mockRestore()
    await runtime.fiber.dispose()

    const replacement = runtime.ctx.plugin(DigitalEmployeeService)
    await replacement
    await expect(runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader, request, new AbortController().signal,
    )).resolves.toMatchObject({ ok: true, value: { provisioningPhase: 'active', memberId: 'child' } })
    expect(runtime.spawn).toHaveBeenCalledOnce()
    expect(runtime.roster.filter(member => member.name === 'code-reviewer')).toHaveLength(1)
    expect([...runtime.bindings.records.values()]).toHaveLength(1)
    await replacement.dispose()
  })

  it('repairs one launch after the roster becomes active but the active Binding commit faults', async () => {
    const runtime = await harness()
    await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    await runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })
    const put = runtime.bindings.put.bind(runtime.bindings)
    const injected = vi.spyOn(runtime.bindings, 'put').mockImplementation(async (key, value) => {
      if ((value as { provisioningPhase?: string }).provisioningPhase === 'active') {
        throw new Error('fault before active Binding commit')
      }
      await put(key, value)
    })

    await expect(runtime.ctx.digitalEmployees.spawnProfile(runtime.leader, {
      launchRequestId: LAUNCH_REQUEST_ID,
      profileId: 'code-reviewer',
    }, new AbortController().signal)).rejects.toBeInstanceOf(AggregateError)
    expect(runtime.spawn).toHaveBeenCalledOnce()
    expect(runtime.roster.filter(member => member.name === 'code-reviewer')).toHaveLength(1)
    expect([...runtime.bindings.records.values()][0]).toMatchObject({ provisioningPhase: 'pending' })
    await runtime.fiber.dispose()
    injected.mockRestore()

    const replacement = runtime.ctx.plugin(DigitalEmployeeService)
    await replacement
    expect([...runtime.bindings.records.values()][0]).toMatchObject({
      memberId: 'child',
      provisioningPhase: 'active',
      resolvedRuntimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    expect(runtime.roster.filter(member => member.name === 'code-reviewer')).toHaveLength(1)
    expect([...runtime.bindings.records.values()]).toHaveLength(1)
    await replacement.dispose()
  })

  it('reconciles an injected post-reservation fault without creating a replacement member', async () => {
    const runtime = await harness({ spawnFaultAfter: 'roster-reservation' })
    await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    await runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })
    await expect(runtime.ctx.digitalEmployees.spawnProfile(runtime.leader, {
      launchRequestId: LAUNCH_REQUEST_ID,
      profileId: 'code-reviewer',
    }, new AbortController().signal)).rejects.toThrow('fault after permanent roster reservation')
    const bindingKey = digitalEmployeeBindingKey('lead', 'code-reviewer')
    const rosterMember = runtime.roster.find(member => member.name === 'code-reviewer')!
    expect(runtime.bindings.get(bindingKey)).toMatchObject({
      memberId: 'child',
      provisioningPhase: 'pending',
    })
    await runtime.fiber.dispose()

    const replacement = runtime.ctx.plugin(DigitalEmployeeService)
    await replacement
    expect(runtime.bindings.get(bindingKey)).toMatchObject({
      memberId: 'child',
      provisioningPhase: 'pending',
    })
    expect(runtime.spawn).toHaveBeenCalledOnce()

    rosterMember.status = 'idle'
    rosterMember.resolvedRoute = DEFAULT_RUNTIME_TARGET
    await runtime.ctx.digitalEmployees.remoteView(runtime.leader)
    expect(runtime.bindings.get(bindingKey)).toMatchObject({
      memberId: 'child',
      provisioningPhase: 'active',
    })
    expect(runtime.roster.filter(member => member.name === 'code-reviewer')).toHaveLength(1)
    expect([...runtime.bindings.records.values()]).toHaveLength(1)
    expect(runtime.spawn).toHaveBeenCalledOnce()
    await replacement.dispose()
  })

  it('reconciles an injected post-acceptance fault and replays one permanent member after restart', async () => {
    const runtime = await harness({ spawnFaultAfter: 'initial-work-acceptance' })
    await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    await runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })
    const request = { launchRequestId: LAUNCH_REQUEST_ID, profileId: 'code-reviewer' }

    await expect(runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader, request, new AbortController().signal,
    )).resolves.toMatchObject({ ok: true, value: { memberId: 'child', provisioningPhase: 'active' } })
    expect(runtime.spawn).toHaveBeenCalledOnce()
    await runtime.fiber.dispose()

    const replacement = runtime.ctx.plugin(DigitalEmployeeService)
    await replacement
    await expect(runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader, request, new AbortController().signal,
    )).resolves.toMatchObject({ ok: true, value: { memberId: 'child', provisioningPhase: 'active' } })
    expect(runtime.spawn).toHaveBeenCalledOnce()
    expect(runtime.roster.filter(member => member.name === 'code-reviewer')).toHaveLength(1)
    expect([...runtime.bindings.records.values()]).toHaveLength(1)
    await replacement.dispose()
  })

  it('returns the active Binding after response delivery is lost and the service restarts', async () => {
    const runtime = await harness()
    await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    await runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })
    const request = { launchRequestId: LAUNCH_REQUEST_ID, profileId: 'code-reviewer' }
    const delivered = await runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader, request, new AbortController().signal,
    )
    await runtime.fiber.dispose()

    const replacement = runtime.ctx.plugin(DigitalEmployeeService)
    await replacement
    await expect(runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader, request, new AbortController().signal,
    )).resolves.toEqual(delivered)
    expect(runtime.spawn).toHaveBeenCalledOnce()
    expect(runtime.roster.filter(member => member.name === 'code-reviewer')).toHaveLength(1)
    expect([...runtime.bindings.records.values()]).toHaveLength(1)
    await replacement.dispose()
  })

  it('continues a pre-roster pending Binding only when the identical caller request is replayed', async () => {
    const runtime = await harness()
    const saved = await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    if (!saved.ok) throw new Error(saved.error.message)
    await runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })
    const assignment = 'Resume this exact pending launch.'
    const assignmentHash = assignmentContentHash(assignment)
    const capabilityGeneration = runtime.ctx.digitalEmployees.studioView(runtime.leader).runtimeCatalog.generation
    const profile = snapshotProfile({
      ...saved.value.revision.profile,
      revision: saved.value.revision.revision,
      createdAt: saved.value.revision.createdAt,
      updatedAt: saved.value.revision.updatedAt,
    })
    const requestFingerprint = launchRequestFingerprint({
      profileId: profile.id,
      profileRevision: profile.revision,
      profileFingerprint: saved.value.revision.fingerprint,
      runtimeTarget: saved.value.revision.runtimeTarget,
      preflightRuntimeTarget: saved.value.revision.runtimeTarget,
      requiredCapabilities: saved.value.revision.requiredCapabilities,
      capabilityGeneration,
      assignmentHash,
    })
    await runtime.bindings.put(digitalEmployeeBindingKey('lead', profile.employeeName), {
      schemaVersion: 1,
      teamId: 'lead',
      memberName: profile.employeeName,
      launchRequestId: LAUNCH_REQUEST_ID,
      requestFingerprint,
      assignmentHash,
      profileId: profile.id,
      profileRevision: profile.revision,
      profileFingerprint: saved.value.revision.fingerprint,
      profile,
      runtimeTarget: saved.value.revision.runtimeTarget,
      preflightRuntimeTarget: saved.value.revision.runtimeTarget,
      requiredCapabilities: saved.value.revision.requiredCapabilities,
      capabilityGeneration,
      provisioningPhase: 'pending',
    })
    await runtime.fiber.dispose()
    const replacement = runtime.ctx.plugin(DigitalEmployeeService)
    await replacement

    const resumed = await runtime.ctx.digitalEmployees.spawnProfile(runtime.leader, {
      launchRequestId: LAUNCH_REQUEST_ID,
      profileId: profile.id,
      assignment,
    }, new AbortController().signal)
    expect(resumed).toMatchObject({
      ok: true,
      value: { memberId: 'child', provisioningPhase: 'active' },
    })
    expect(runtime.spawn).toHaveBeenCalledOnce()
    await replacement.dispose()
  })

  it('keeps a pre-roster external reservation pending when the provider becomes unavailable and resumes it', async () => {
    const runtime = await harness({
      spawnErrorBeforeRosterOnce: new TeammateRuntimeError(
        'native reviewer temporarily unavailable',
        'TEAM_RUNTIME_UNAVAILABLE',
      ),
    })
    const registration = runtime.ctx.digitalEmployees.registerExternalRuntimeProvider(catalogExternalProvider({
      id: 'native-reviewer',
      displayName: 'Native Reviewer',
      contextModes: ['fresh'],
      profileCapabilities: ['persona', 'mission', 'context', 'memory', 'tool-policy', 'hooks'],
      runtimeCapabilities: [],
    }))
    await runtime.ctx.digitalEmployees.whenRuntimeCatalogSettled()
    await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: { kind: 'external-agent', provider: 'native-reviewer' },
    })
    await runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })
    const request = { launchRequestId: LAUNCH_REQUEST_ID, profileId: 'code-reviewer' }

    await expect(runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader, request, new AbortController().signal,
    )).resolves.toMatchObject({ ok: false, error: { code: 'runtime-target-unavailable' } })
    expect([...runtime.bindings.records.values()][0]).toMatchObject({ provisioningPhase: 'pending' })
    expect([...runtime.bindings.records.values()][0]).not.toHaveProperty('memberId')

    await expect(runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader, request, new AbortController().signal,
    )).resolves.toMatchObject({
      ok: true,
      value: {
        memberId: 'child',
        nativeRuntimeHandle: 'catalog-runtime',
        provisioningPhase: 'active',
      },
    })
    expect(runtime.spawn).toHaveBeenCalledTimes(2)
    expect(runtime.roster.filter(member => member.name === 'code-reviewer')).toHaveLength(1)

    await registration()
    await runtime.fiber.dispose()
  })

  it('repairs a contradictory Binding from the authoritative roster on service restart', async () => {
    const runtime = await harness()
    await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    await runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })
    await runtime.ctx.digitalEmployees.spawnProfile(runtime.leader, {
      launchRequestId: LAUNCH_REQUEST_ID,
      profileId: 'code-reviewer',
    }, new AbortController().signal)
    const key = digitalEmployeeBindingKey('lead', 'code-reviewer')
    const active = runtime.bindings.get(key) as Record<string, unknown>
    await runtime.bindings.put(key, {
      ...active,
      provisioningPhase: 'failed',
      error: 'simulated crash before the active Binding commit',
    })

    await runtime.fiber.dispose()
    const replacement = runtime.ctx.plugin(DigitalEmployeeService)
    await replacement
    expect(runtime.bindings.get(key)).toMatchObject({
      memberId: 'child',
      provisioningPhase: 'active',
      resolvedRuntimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    expect(runtime.ctx.digitalEmployees.studioView(runtime.leader).instances[0]).toMatchObject({
      provisioningPhase: 'active',
      runtimeAvailability: 'available',
      runtimePresence: 'idle',
    })
    expect(runtime.spawn).toHaveBeenCalledOnce()
    await replacement.dispose()
  })

  it('derives runtime availability and presence without rewriting durable provisioning', async () => {
    const runtime = await harness()
    await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    await runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })
    await runtime.ctx.digitalEmployees.spawnProfile(runtime.leader, {
      launchRequestId: LAUNCH_REQUEST_ID,
      profileId: 'code-reviewer',
    }, new AbortController().signal)
    const child = runtime.agent('child')!

    runtime.replaceLlmRoutes([])
    await runtime.ctx.digitalEmployees.whenRuntimeCatalogSettled()
    runtime.disposeAgent(child)

    expect(runtime.ctx.digitalEmployees.studioView(runtime.leader).instances[0]).toMatchObject({
      provisioningPhase: 'active',
      runtimeAvailability: 'unavailable',
      runtimePresence: 'inactive',
    })
    expect([...runtime.bindings.records.values()][0]).toMatchObject({ provisioningPhase: 'active' })
    await runtime.fiber.dispose()
  })

  it('rejects an adapter-resolved route mismatch before writing a Binding', async () => {
    const runtime = await harness()
    await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    await runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })
    runtime.replaceLlmRoutes([{ ...DEFAULT_LLM_ROUTE, resolvedModel: 'other-model' }])
    await runtime.ctx.digitalEmployees.whenRuntimeCatalogSettled()

    await expect(runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader,
      { launchRequestId: LAUNCH_REQUEST_ID, profileId: 'code-reviewer' },
      new AbortController().signal,
    )).resolves.toMatchObject({ ok: false, error: { code: 'runtime-route-invalid' } })
    expect(runtime.bindings.size).toBe(0)
    expect(runtime.spawn).not.toHaveBeenCalled()
    await runtime.fiber.dispose()
  })

  it('records a stable failure when the child reports a different actual route', async () => {
    const runtime = await harness({
      childResolvedRoute: { provider: 'test-provider', model: 'other-model' },
    })
    await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    await runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })

    await expect(runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader,
      { launchRequestId: LAUNCH_REQUEST_ID, profileId: 'code-reviewer' },
      new AbortController().signal,
    )).resolves.toMatchObject({ ok: false, error: { code: 'runtime-route-invalid' } })
    expect([...runtime.bindings.records.values()][0]).toMatchObject({
      provisioningPhase: 'failed',
      resolvedRuntimeTarget: { kind: 'dsh-model', provider: 'test-provider', model: 'other-model' },
    })
    await runtime.fiber.dispose()
  })

  it('removes an exact Agent installation once across Agent and Fiber disposal', async () => {
    const runtime = await harness()
    await runtime.ctx.digitalEmployees.saveProfile(
      runtime.leader,
      { expectedHeadRevision: null, profile: draft(), runtimeTarget: DEFAULT_RUNTIME_TARGET },
    )
    await runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })
    await runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader,
      { launchRequestId: LAUNCH_REQUEST_ID, profileId: 'code-reviewer' },
      new AbortController().signal,
    )
    const child = runtime.agent('child')
    expect(child).toBeDefined()
    expect(runtime.scopeDisposals).toHaveLength(8)

    runtime.disposeAgent(child!)
    runtime.disposeAgent(child!)
    await runtime.fiber.dispose()

    expect(runtime.scopeDisposals.every(dispose => dispose.mock.calls.length === 1)).toBe(true)
    expect(runtime.close).toHaveBeenCalledOnce()
  })

  it('removes every reconciliation listener on Fiber disposal', async () => {
    const runtime = await harness()
    runtime.listMembers.mockClear()
    runtime.ctx.emit('agent/session-start', { agent: runtime.leader, source: 'resume' })
    runtime.ctx.emit('session/event', { id: runtime.leader.id } as never, { type: 'team/member' } as never)
    await vi.waitFor(() => { expect(runtime.listMembers).toHaveBeenCalled() })

    await runtime.fiber.dispose()
    runtime.listMembers.mockClear()
    runtime.ctx.emit('agent/session-start', { agent: runtime.leader, source: 'resume' })
    runtime.ctx.emit('session/event', { id: runtime.leader.id } as never, { type: 'team/member' } as never)
    await Promise.resolve()
    expect(runtime.listMembers).not.toHaveBeenCalled()
  })

  it('reinstalls one capability layer without duplicates after service replacement', async () => {
    const runtime = await harness()
    await runtime.ctx.digitalEmployees.saveProfile(
      runtime.leader,
      { expectedHeadRevision: null, profile: draft(), runtimeTarget: DEFAULT_RUNTIME_TARGET },
    )
    await runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })
    await runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader,
      { launchRequestId: LAUNCH_REQUEST_ID, profileId: 'code-reviewer' },
      new AbortController().signal,
    )
    const child = runtime.agent('child')
    expect(child).toBeDefined()
    const firstInstallation = [...runtime.scopeDisposals]

    await runtime.fiber.dispose()
    expect(firstInstallation).toHaveLength(8)
    expect(firstInstallation.every(dispose => dispose.mock.calls.length === 1)).toBe(true)

    const replacement = runtime.ctx.plugin(DigitalEmployeeService)
    await replacement
    runtime.ctx.emit('agent/created', { agent: child! })
    expect(runtime.scopeDisposals).toHaveLength(16)

    await replacement.dispose()
    expect(runtime.scopeDisposals.every(dispose => dispose.mock.calls.length === 1)).toBe(true)
    expect(runtime.close).toHaveBeenCalledTimes(2)
  })

  it('rejects an exact teammate at the exported launch seam before provisioning', async () => {
    const runtime = await harness()
    await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    await expect(runtime.ctx.digitalEmployees.spawnProfile(
      runtime.teammate,
      { launchRequestId: LAUNCH_REQUEST_ID, profileId: 'code-reviewer' },
      new AbortController().signal,
    )).resolves.toMatchObject({ ok: false, error: { code: 'team-lead-required' } })
    expect(runtime.bindings.size).toBe(0)
    expect(runtime.spawn).not.toHaveBeenCalled()
    await runtime.fiber.dispose()
  })

  it('rejects an oversized assignment before reserving a Team member name', async () => {
    const runtime = await harness()
    await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    await expect(runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader,
      { launchRequestId: LAUNCH_REQUEST_ID, profileId: 'code-reviewer', assignment: 'x'.repeat(32_769) },
      new AbortController().signal,
    )).resolves.toMatchObject({ ok: false, error: { code: 'assignment-too-large' } })
    expect(runtime.bindings.size).toBe(0)
    expect(runtime.spawn).not.toHaveBeenCalled()
    await runtime.fiber.dispose()
  })

  it('closes admission while preserving a pre-roster launch intent for an identical replay', async () => {
    const gate = Promise.withResolvers<void>()
    const runtime = await harness({ spawnGate: gate.promise })
    await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    await runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })
    const launch = runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader,
      { launchRequestId: LAUNCH_REQUEST_ID, profileId: 'code-reviewer' },
      new AbortController().signal,
    )
    await vi.waitFor(() => {
      expect([...runtime.bindings.records.values()][0]).toMatchObject({ provisioningPhase: 'pending' })
    })

    const disposal = runtime.fiber.dispose()
    await expect(launch).rejects.toThrow('Agent Team Ultra service disposed')
    await disposal
    expect([...runtime.bindings.records.values()][0]).toMatchObject({ provisioningPhase: 'pending' })
    expect(runtime.close).toHaveBeenCalledOnce()
    gate.resolve()
  })

  it('keeps service disposal pending until an in-flight runtime catalog refresh settles', async () => {
    const runtime = await harness()
    const gate = runtime.gateNextLlmRefresh()
    runtime.replaceLlmRoutes([{ ...DEFAULT_LLM_ROUTE, modelName: 'Refreshed Model' }])
    await gate.entered

    let disposed = false
    const disposal = runtime.fiber.dispose().then(() => { disposed = true })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(disposed).toBe(false)

    gate.release()
    await disposal
    expect(runtime.close).toHaveBeenCalledOnce()
  })

  it('publishes a detached capability-aware catalog with stable route ids and safe topology generations', async () => {
    const secret = 'catalog-secret-that-must-not-cross-remote'
    const runtime = await harness({
      llmRoutes: [{
        ...DEFAULT_LLM_ROUTE,
        providerName: 'Duplicate Label',
        modelName: 'Duplicate Label',
        secret,
      }, {
        provider: 'second-provider',
        providerName: 'Duplicate Label',
        model: 'second-model',
        modelName: 'Duplicate Label',
      }],
    })
    await runtime.ctx.digitalEmployees.whenRuntimeCatalogSettled()

    const initial = runtime.ctx.digitalEmployees.studioView(runtime.leader).runtimeCatalog
    expect(initial.generation).toBe(1)
    expect(initial.backends.find(backend => backend.routingId === 'dsh-model/test-provider/test-model'))
      .toMatchObject({
          routingId: 'dsh-model/test-provider/test-model',
          family: 'dsh-model',
          availability: 'available',
          provider: 'test-provider',
          model: 'test-model',
          providerDisplayName: 'Duplicate Label',
          displayName: 'Duplicate Label',
          contextModes: ['fresh', 'fork'],
          profileCapabilities: ['persona', 'mission', 'context', 'memory', 'tool-policy', 'hooks'],
          reasoning: {
            efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }],
            defaultEffort: 'low',
          },
      })
    expect(initial.backends.find(backend => backend.routingId === 'dsh-model/second-provider/second-model'))
      .toMatchObject({
        providerDisplayName: 'Duplicate Label',
        displayName: 'Duplicate Label',
      })
    expect(initial.backends.find(backend => backend.routingId === 'external-agent/codex'))
      .toMatchObject({
          routingId: 'external-agent/codex',
          family: 'external-agent',
          availability: 'unsupported',
          provider: 'codex',
      })
    expect(initial.backends.find(backend => backend.routingId === 'external-agent/claude-code'))
      .toMatchObject({
          routingId: 'external-agent/claude-code',
          family: 'external-agent',
          availability: 'unsupported',
          provider: 'claude-code',
      })
    expect(Object.isFrozen(initial)).toBe(true)
    expect(Object.isFrozen(initial.backends)).toBe(true)
    expect(JSON.stringify(initial)).not.toContain(secret)
    expect(JSON.stringify(initial)).not.toContain('apiKey')
    expect(JSON.stringify(initial)).not.toContain('endpoint')
    expect(JSON.stringify(initial)).not.toContain('nativePath')

    runtime.replaceLlmRoutes([{ ...DEFAULT_LLM_ROUTE, providerName: 'Renamed Provider', modelName: 'Renamed Model' }])
    await runtime.ctx.digitalEmployees.whenRuntimeCatalogSettled()
    const replaced = runtime.ctx.digitalEmployees.studioView(runtime.leader).runtimeCatalog
    expect(replaced.generation).toBeGreaterThan(initial.generation)
    expect(replaced.backends).toContainEqual(expect.objectContaining({
      routingId: 'dsh-model/test-provider/test-model',
      providerDisplayName: 'Renamed Provider',
      displayName: 'Renamed Model',
    }))

    await runtime.fiber.dispose()
  })

  it('atomically replaces durable external metadata and removes it with the contributor Fiber', async () => {
    const runtime = await harness()
    let registration: ReturnType<typeof runtime.ctx.digitalEmployees.registerExternalRuntimeProvider> | undefined
    const contributor = runtime.ctx.plugin({
      inject: ['digitalEmployees'],
      apply(pluginCtx: Context) {
        registration = pluginCtx.digitalEmployees.registerExternalRuntimeProvider(catalogExternalProvider({
          id: 'native-reviewer',
          displayName: 'Native Reviewer',
          contextModes: ['fresh'],
          profileCapabilities: ['persona', 'mission'],
          runtimeCapabilities: ['evidence'],
          apiKey: 'never-copy-this',
          endpoint: 'https://secret.invalid',
        }))
      },
    })
    await contributor
    await runtime.ctx.digitalEmployees.whenRuntimeCatalogSettled()

    const first = runtime.ctx.digitalEmployees.studioView(runtime.leader).runtimeCatalog
    expect(first.backends).toContainEqual(expect.objectContaining({
      routingId: 'external-agent/native-reviewer',
      family: 'external-agent',
      availability: 'available',
      provider: 'native-reviewer',
      displayName: 'Native Reviewer',
      contextModes: ['fresh'],
      profileCapabilities: ['persona', 'mission'],
      runtimeCapabilities: ['evidence'],
    }))
    expect(JSON.stringify(first)).not.toContain('never-copy-this')
    expect(JSON.stringify(first)).not.toContain('secret.invalid')

    const refreshGate = runtime.gateNextLlmRefresh()
    let replacementSettled = false
    const replacing = registration?.replace(catalogExternalProvider({
      id: 'native-reviewer',
      displayName: 'Native Reviewer v2',
      contextModes: ['fork', 'fresh'],
      profileCapabilities: ['persona', 'mission', 'context', 'memory'],
      runtimeCapabilities: ['evaluation', 'evidence'],
    })).then(() => { replacementSettled = true })
    await refreshGate.entered
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(replacementSettled).toBe(false)
    refreshGate.release()
    await replacing
    const replaced = runtime.ctx.digitalEmployees.studioView(runtime.leader).runtimeCatalog
    expect(replaced.generation).toBeGreaterThan(first.generation)
    expect(replaced.backends).toContainEqual(expect.objectContaining({
      routingId: 'external-agent/native-reviewer',
      displayName: 'Native Reviewer v2',
      contextModes: ['fresh', 'fork'],
    }))

    await contributor.dispose()
    await runtime.ctx.digitalEmployees.whenRuntimeCatalogSettled()
    const removed = runtime.ctx.digitalEmployees.studioView(runtime.leader).runtimeCatalog
    expect(removed.backends).not.toContainEqual(expect.objectContaining({
      routingId: 'external-agent/native-reviewer',
    }))
    expect(removed.generation).toBeGreaterThan(replaced.generation)

    await runtime.fiber.dispose()
  })

  it('removes durable external metadata when the underlying provider replacement fails closed', async () => {
    const runtime = await harness({ teammateReplaceError: new Error('native retirement failed') })
    const registration = runtime.ctx.digitalEmployees.registerExternalRuntimeProvider(catalogExternalProvider({
      id: 'native-reviewer',
      displayName: 'Native Reviewer',
      contextModes: ['fresh'],
      profileCapabilities: ['persona', 'mission'],
      runtimeCapabilities: ['evidence'],
    }))
    await runtime.ctx.digitalEmployees.whenRuntimeCatalogSettled()
    expect(runtime.ctx.digitalEmployees.studioView(runtime.leader).runtimeCatalog.backends)
      .toContainEqual(expect.objectContaining({ routingId: 'external-agent/native-reviewer' }))

    await expect(registration.replace(catalogExternalProvider({
      id: 'native-reviewer',
      displayName: 'Native Reviewer v2',
      contextModes: ['fresh'],
      profileCapabilities: ['persona', 'mission'],
      runtimeCapabilities: ['evidence'],
    }))).rejects.toThrow('native retirement failed')
    await runtime.ctx.digitalEmployees.whenRuntimeCatalogSettled()
    expect(runtime.ctx.digitalEmployees.studioView(runtime.leader).runtimeCatalog.backends)
      .not.toContainEqual(expect.objectContaining({ routingId: 'external-agent/native-reviewer' }))

    await registration()
    await runtime.fiber.dispose()
  })

  it('immediately projects upstream-quarantined external providers as unavailable and blocks launch', async () => {
    const runtime = await harness()
    const registration = runtime.ctx.digitalEmployees.registerExternalRuntimeProvider(catalogExternalProvider({
      id: 'native-reviewer',
      displayName: 'Native Reviewer',
      contextModes: ['fresh'],
      profileCapabilities: ['persona', 'mission', 'context', 'memory', 'tool-policy', 'hooks'],
      runtimeCapabilities: [],
    }))
    await runtime.ctx.digitalEmployees.whenRuntimeCatalogSettled()
    await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: { kind: 'external-agent', provider: 'native-reviewer' },
    })
    await runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })

    runtime.setTeammateRuntimeAvailable('native-reviewer', false)
    expect(runtime.ctx.digitalEmployees.studioView(runtime.leader).runtimeCatalog.backends)
      .toContainEqual(expect.objectContaining({
        routingId: 'external-agent/native-reviewer',
        availability: 'unavailable',
      }))
    await expect(runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader,
      { launchRequestId: LAUNCH_REQUEST_ID, profileId: 'code-reviewer' },
      new AbortController().signal,
    )).resolves.toMatchObject({ ok: false, error: { code: 'runtime-target-unavailable' } })
    expect(runtime.bindings.size).toBe(0)

    await registration()
    await runtime.fiber.dispose()
  })

  it('pins the selected target and normalized required capabilities into immutable Revision content', async () => {
    const runtime = await harness()
    const first = await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    expect(first).toMatchObject({
      ok: true,
      value: {
        revision: {
          runtimeTarget: DEFAULT_RUNTIME_TARGET,
          requiredCapabilities: {
            contextMode: 'fresh',
            profileCapabilities: ['persona', 'mission', 'context', 'memory', 'tool-policy', 'hooks'],
          },
        },
      },
    })

    await runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })

    const second = await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: 2,
      profile: draft(),
      runtimeTarget: { ...DEFAULT_RUNTIME_TARGET, reasoningEffort: 'high' },
    })
    expect(second).toMatchObject({ ok: true, value: { unchanged: false, revision: { revision: 2 } } })
    if (!first.ok || !second.ok) throw new Error('expected successful saves')
    expect(second.value.revision.fingerprint).not.toBe(first.value.revision.fingerprint)

    const detail = await runtime.ctx.digitalEmployees.profileRevision(runtime.leader, {
      profileId: 'code-reviewer',
      revision: 2,
    })
    expect(detail).toMatchObject({
      ok: true,
      value: { diff: expect.arrayContaining([{ path: 'runtimeTarget.reasoningEffort', kind: 'added', after: '"high"' }]) },
    })
    await runtime.fiber.dispose()
  })

  it('rejects legacy selection and live route/capability mismatches without creating a Revision', async () => {
    const runtime = await harness()
    await expect(runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: { kind: 'legacy-inherit-lead' },
    })).resolves.toMatchObject({ ok: false, error: { code: 'runtime-route-invalid' } })
    await expect(runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: { ...DEFAULT_RUNTIME_TARGET, reasoningEffort: 'imaginary' },
    })).resolves.toMatchObject({ ok: false, error: { code: 'runtime-route-invalid' } })
    await expect(runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft({ continuationProvider: 'spawn', contextMode: 'fork' }),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })).resolves.toMatchObject({ ok: false, error: { code: 'runtime-capability-mismatch' } })
    await expect(runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: { kind: 'dsh-model', provider: 'missing-provider', model: 'missing-model' },
    })).resolves.toMatchObject({ ok: false, error: { code: 'runtime-target-unavailable' } })
    expect(runtime.revisions.size).toBe(0)
    await runtime.fiber.dispose()
  })

  it('validates external initial-context and Profile policy capabilities without using one-shot fallbacks', async () => {
    const runtime = await harness()
    const registration = runtime.ctx.digitalEmployees.registerExternalRuntimeProvider(catalogExternalProvider({
      id: 'native-minimal',
      displayName: 'Native Minimal',
      contextModes: ['fresh'],
      profileCapabilities: ['persona', 'mission'],
      runtimeCapabilities: [],
    }))
    await runtime.ctx.digitalEmployees.whenRuntimeCatalogSettled()

    await expect(runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: { kind: 'external-agent', provider: 'native-minimal' },
    })).resolves.toMatchObject({ ok: false, error: { code: 'runtime-capability-mismatch' } })
    await expect(runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft({
        contextMode: 'fork',
        toolPolicy: { mode: 'inherit', names: [] },
        context: [],
        memory: [],
        hooks: [],
      }),
      runtimeTarget: { kind: 'external-agent', provider: 'native-minimal' },
    })).resolves.toMatchObject({ ok: false, error: { code: 'runtime-capability-mismatch' } })
    await expect(runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft({ toolPolicy: { mode: 'inherit', names: [] }, context: [], memory: [], hooks: [] }),
      runtimeTarget: { kind: 'external-agent', provider: 'codex' },
    })).resolves.toMatchObject({ ok: false, error: { code: 'runtime-capability-mismatch' } })

    const saved = await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft({ toolPolicy: { mode: 'inherit', names: [] }, context: [], memory: [], hooks: [] }),
      runtimeTarget: { kind: 'external-agent', provider: 'native-minimal' },
    })
    expect(saved).toMatchObject({ ok: true, value: { revision: { requiredCapabilities: {
      contextMode: 'fresh', profileCapabilities: ['persona', 'mission'],
    } } } })
    await expect(runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })).resolves.toMatchObject({ ok: true })

    await registration()
    await runtime.ctx.digitalEmployees.whenRuntimeCatalogSettled()
    await expect(runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 2,
    })).resolves.toMatchObject({ ok: false, error: { code: 'runtime-target-unavailable' } })

    await runtime.fiber.dispose()
  })

  it('keeps a missing historical target visible but blocks activation and launch without fallback', async () => {
    const runtime = await harness()
    await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: null,
      profile: draft(),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })
    await expect(runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 1,
    })).resolves.toMatchObject({ ok: true })
    runtime.replaceLlmRoutes([])
    await runtime.ctx.digitalEmployees.whenRuntimeCatalogSettled()

    const unavailable = runtime.ctx.digitalEmployees.studioView(runtime.leader).runtimeCatalog.backends
      .find(backend => backend.routingId === 'dsh-model/test-provider/test-model')
    expect(unavailable).toMatchObject({
      family: 'dsh-model',
      availability: 'unavailable',
      provider: 'test-provider',
      model: 'test-model',
    })
    await expect(runtime.ctx.digitalEmployees.activateProfile(runtime.leader, {
      profileId: 'code-reviewer', revision: 1, expectedHeadRevision: 2,
    })).resolves.toMatchObject({ ok: false, error: { code: 'runtime-target-unavailable' } })
    await expect(runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader,
      { launchRequestId: LAUNCH_REQUEST_ID, profileId: 'code-reviewer' },
      new AbortController().signal,
    )).resolves.toMatchObject({ ok: false, error: { code: 'runtime-target-unavailable' } })
    expect(runtime.spawn).not.toHaveBeenCalled()

    await expect(runtime.ctx.digitalEmployees.saveProfile(runtime.leader, {
      expectedHeadRevision: 2,
      profile: draft({ description: 'Retains its temporarily unavailable historical route.' }),
      runtimeTarget: DEFAULT_RUNTIME_TARGET,
    })).resolves.toMatchObject({
      ok: true,
      value: { unchanged: false, head: { headRevision: 3 }, revision: { revision: 2 } },
    })

    await runtime.fiber.dispose()
  })
})
