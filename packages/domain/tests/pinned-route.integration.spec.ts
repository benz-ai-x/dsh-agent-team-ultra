import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import TeamService, {
  TeammateEvaluationHandle,
  TeammateRuntimeApprovalId,
  TeammateRuntimeHandle,
  TeammateRuntimeEvidenceId,
  TeammateRuntimeToolCallId,
  TeammateRuntimeTurnId,
  type TeammateRuntimeDisposeRequest,
  type TeammateRuntimeProvider,
} from '@deepseek-ai/dsh-experimental-agent-team'
import {
  LlmAdapter,
  ReasoningEffortId,
  ToolCallId,
  type GenerateOptions,
  type LlmModelInfo,
  type LlmResolvedModelInfo,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SessionQueryEngine from '@deepseek-ai/dsh-session-query'
import SandboxPolicyService from '@deepseek-ai/dsh-sandbox-policy'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import SubagentService, { foldSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import * as SubagentSpawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import ApprovalService, {
  type ApprovalOutcome,
  type ApprovalRequest,
} from '@deepseek-ai/dsh-user-approval'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import DigitalEmployeeService, { evalRunIdSchema, launchRequestIdSchema } from '../lib/index.js'
import type { DigitalEmployeeEvalSetDraft, DigitalEmployeeProfileDraft } from '../src/types.ts'

const SIGNAL = new AbortController().signal
const SELECTED_PROVIDER = 'employee-provider'
const SELECTED_MODEL = 'employee-model'
const SELECTED_EFFORT = ReasoningEffortId('high')
const LAUNCH_REQUEST_ID = launchRequestIdSchema.parse('22222222-2222-4222-8222-222222222222')
const DSH_EVAL_RUN_ID = evalRunIdSchema.parse('33333333-3333-4333-8333-333333333333')
const EXTERNAL_EVAL_RUN_ID = evalRunIdSchema.parse('44444444-4444-4444-8444-444444444444')
const CANCELLED_EVAL_RUN_ID = evalRunIdSchema.parse('55555555-5555-4555-8555-555555555555')

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

class EvaluationAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  override providerInfo(provider: string) {
    return { id: provider, name: 'Evaluation Provider' }
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve([{ provider, id: SELECTED_MODEL, name: 'Evaluation Model' }])
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: 'Evaluation Model' })
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    for (const chunk of completedResponse('evaluation finding PRIVATE_OUTPUT')) yield chunk
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
  readonly initialTurnId: ReturnType<typeof TeammateRuntimeTurnId>
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
  readonly id: string
  readonly displayName: string
  readonly contextModes = ['fresh'] as const
  readonly profileCapabilities = ['persona', 'mission', 'context', 'memory', 'tool-policy', 'hooks'] as const
  readonly runtimeCapabilities: TeammateRuntimeProvider['runtimeCapabilities']
  readonly evaluationTools = ['read'] as const
  readonly apiKey = 'never-cross-the-host-boundary'
  readonly sandboxMode = 'read-only'
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
        initialTurnId: TeammateRuntimeTurnId(`fake-initial-${this.store.nextSession - 1}`),
        turns: new Map(),
        status: 'idle',
      }
      this.store.sessions.set(key, session)
    }
    this.attached.add(session.nativeHandle)
    return { nativeHandle: session.nativeHandle, turnId: session.initialTurnId, presence: session.status }
  })
  readonly resume = vi.fn<TeammateRuntimeProvider['resume']>(async (request) => {
    request.signal.throwIfAborted()
    const session = [...this.store.sessions.values()].find(candidate =>
      candidate.launchRequestId === request.launchRequestId
      && candidate.memberId === request.memberId
      && (request.nativeHandle === undefined || candidate.nativeHandle === request.nativeHandle))
    if (session === undefined) return undefined
    this.attached.add(session.nativeHandle)
    return { nativeHandle: session.nativeHandle, turnId: session.initialTurnId, presence: session.status }
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
  readonly evidence = vi.fn<TeammateRuntimeProvider['evidence']>(async (request) => {
    const session = this.session(request.nativeHandle)
    const turns = [session.initialTurnId, ...session.turns.values()]
    return {
      nativeHandle: request.nativeHandle,
      items: turns.flatMap((turnId, index) => {
        const suffix = index + 1
        const usage = {
          id: TeammateRuntimeEvidenceId(`fake-usage-${suffix}`),
          kind: 'usage' as const,
          timestamp: index * 10 + 4,
          turnId,
          usage: { inputTokens: 10 + index, outputTokens: 2, totalTokens: 12 + index },
        }
        const terminal = {
          id: TeammateRuntimeEvidenceId(`fake-evidence-${suffix}`),
          kind: 'turn' as const,
          timestamp: index * 10 + 5,
          turnId,
          outcome: 'completed' as const,
        }
        if (!this.exactCallApproval) return [usage, terminal]
        const approvalId = TeammateRuntimeApprovalId(`fake-approval-${suffix}`)
        const callId = TeammateRuntimeToolCallId(`fake-call-${suffix}`)
        return [
          {
            id: TeammateRuntimeEvidenceId(`fake-approval-asked-${suffix}`),
            kind: 'approval' as const,
            timestamp: index * 10 + 1,
            turnId,
            name: 'write_file',
            outcome: 'asked' as const,
            approvalId,
            callId,
            policyId: 'confirm-write',
          },
          {
            id: TeammateRuntimeEvidenceId(`fake-approval-decided-${suffix}`),
            kind: 'approval' as const,
            timestamp: index * 10 + 2,
            turnId,
            name: 'write_file',
            outcome: 'allowed-once' as const,
            approvalId,
            callId,
            policyId: 'confirm-write',
          },
          {
            id: TeammateRuntimeEvidenceId(`fake-tool-${suffix}`),
            kind: 'tool' as const,
            timestamp: index * 10 + 3,
            turnId,
            name: 'write_file',
            outcome: 'blocked' as const,
            callId,
          },
          usage,
          terminal,
        ]
      }),
      complete: true,
    }
  })
  readonly createEvaluationHandle = vi.fn<TeammateRuntimeProvider['createEvaluationHandle']>(async (request) => {
    let handle = this.store.evaluations.get(request.evaluationId)
    if (handle === undefined) {
      handle = TeammateEvaluationHandle(`fake-eval-${this.store.nextEvaluation++}`)
      this.store.evaluations.set(request.evaluationId, handle)
    }
    const turnId = TeammateRuntimeTurnId(`${handle}-turn`)
    return {
      evaluationHandle: handle,
      turnId,
      terminal: 'completed',
      output: [{ type: 'text', text: 'finding' }],
      evidence: [
        {
          id: TeammateRuntimeEvidenceId(`${handle}-step`),
          kind: 'step',
          timestamp: 2,
          turnId,
          step: 1,
          outcome: 'completed',
        },
        {
          id: TeammateRuntimeEvidenceId(`${handle}-tool`),
          kind: 'tool',
          timestamp: 3,
          turnId,
          step: 1,
          name: 'read',
          callId: TeammateRuntimeToolCallId(`${handle}-call`),
          outcome: 'completed',
        },
        {
          id: TeammateRuntimeEvidenceId(`${handle}-usage`),
          kind: 'usage',
          timestamp: 4,
          turnId,
          usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
        },
        {
          id: TeammateRuntimeEvidenceId(`${handle}-terminal`),
          kind: 'turn',
          timestamp: 5,
          turnId,
          outcome: 'completed',
        },
      ],
      complete: true,
      startedAt: 1,
      endedAt: 5,
    }
  })
  readonly dispose = vi.fn<TeammateRuntimeProvider['dispose']>(async (request: TeammateRuntimeDisposeRequest) => {
    if (request.kind === 'runtime') this.attached.delete(request.nativeHandle)
  })

  constructor(
    private readonly store: FakeNativeStore,
    options: { readonly id?: string; readonly exactCallApproval?: boolean } = {},
  ) {
    this.id = options.id ?? 'fake-native'
    this.displayName = this.id === 'fake-native' ? 'Fake Native' : `Fake Native ${this.id}`
    this.exactCallApproval = options.exactCallApproval === true
    this.runtimeCapabilities = this.exactCallApproval
      ? ['exact-call-approval', 'sandbox', 'evaluation', 'evidence', 'usage']
      : ['evaluation', 'evidence', 'usage']
  }

  private readonly exactCallApproval: boolean

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

function evalSet(profileId: string, overrides: Partial<DigitalEmployeeEvalSetDraft> = {}): DigitalEmployeeEvalSetDraft {
  return {
    id: 'release-gate',
    profileId,
    displayName: 'Release gate',
    toolAllowlist: ['read'],
    resourceCeilings: { maxSteps: 2, maxOutputTokens: 256, maxElapsedMs: 5_000 },
    passPolicy: { kind: 'all' },
    cases: [{
      id: 'find-risk',
      title: 'Find one risk',
      input: 'Review the immutable fixture.',
      fixtures: [{ id: 'source', content: 'export const value = 1' }],
      assertions: {
        acceptedTerminals: ['completed'],
        requiredTools: [],
        forbiddenTools: ['write_file'],
        requiredOutputSubstrings: ['finding'],
        forbiddenOutputSubstrings: ['unsafe-marker'],
        maxSteps: 2,
        maxReportedTokens: 1_000,
        maxElapsedMs: 5_000,
      },
    }],
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
  it('routes Profile ask through the stock Tool runtime and approval service, then removes only Ultra state', async () => {
    const ctx = new Context()
    activeContext = ctx
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(SessionProjectionRegistry)
    const sessionRoot = mkdtempSync(join(tmpdir(), 'dsh-ultra-stock-approval-'))
    temporaryRoots.push(sessionRoot)
    await ctx.plugin(JsonlSessionPersistence, { root: sessionRoot })
    await ctx.plugin(TestSessionQuery)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(ApprovalService)
    await ctx.plugin(SubagentService)
    await ctx.plugin(TeamService)
    installMemoryStorageDomain(ctx)
    const leadHandle = await ctx.agents.create({ sessionId: SessionId('approval-lead') })
    const employeeHandle = await ctx.agents.create({ sessionId: SessionId('approval-employee') })
    const lead = leadHandle.agent
    const employee = employeeHandle.agent
    const ultraFiber = ctx.plugin(DigitalEmployeeService)
    await ultraFiber
    let executions = 0
    ctx.tools.register(defineContentToolFixture({
      name: 'write_file',
      description: 'Synthetic exact write',
      parameters: {},
      async execute() {
        executions += 1
        return [{ type: 'text', text: 'written' }]
      },
    }))
    const seen: ApprovalRequest[] = []
    ctx.on('approval/request', (request) => {
      seen.push(request)
      return Promise.resolve<ApprovalOutcome>('allowed-once')
    })
    const service = ctx.digitalEmployees as unknown as {
      installProfileCapabilities(caller: Agent, target: Agent, source: DigitalEmployeeProfileDraft & {
        revision: number
        createdAt: number
        updatedAt: number
      }): () => void
    }
    service.installProfileCapabilities(lead, employee, {
      ...profile({
        toolPolicy: { mode: 'inherit', names: [] },
        context: [],
        memory: [],
        hooks: [{
          id: 'confirm-write',
          point: 'before-tool',
          effect: 'ask',
          matcher: 'write*',
          text: 'Confirm this exact write call.',
          enabled: true,
        }],
      }),
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    employee.session.append('turn/start', { turn: 1 })

    const first = await ctx.tools.execute({
      agent: employee,
      signal: SIGNAL,
      callId: ToolCallId('profile-call-1'),
      name: 'write_file',
      arguments: {},
    })
    expect(first.isError).toBe(false)
    expect(executions).toBe(1)
    expect(seen[0]?.agent).toBe(employee)
    expect(seen[0]).toMatchObject({
      toolName: 'write_file',
      callId: 'profile-call-1',
      reason: 'Confirm this exact write call.',
    })

    const removeSandboxGuard = employee.ctx.tools.guard(exec =>
      exec.name === 'write_file' ? 'native sandbox remains read-only' : undefined)
    const guarded = await ctx.tools.execute({
      agent: employee,
      signal: SIGNAL,
      callId: ToolCallId('profile-call-2'),
      name: 'write_file',
      arguments: {},
    })
    expect(guarded).toMatchObject({ isError: true, error: { message: 'native sandbox remains read-only' } })
    expect(executions).toBe(1)
    expect(seen.map(request => request.callId)).toEqual(['profile-call-1', 'profile-call-2'])
    const audit = employee.session.ownEvents().filter(event =>
      String(event.type) === 'approval/asked' || String(event.type) === 'approval/decided')
    expect(audit.map(event => event.type)).toEqual([
      'approval/asked',
      'approval/decided',
      'approval/asked',
      'approval/decided',
    ])
    expect((audit[0]?.data as { callId?: string }).callId).toBe('profile-call-1')
    expect((audit[1]?.data as { outcome?: string }).outcome).toBe('allowed-once')
    expect((audit[2]?.data as { callId?: string }).callId).toBe('profile-call-2')
    expect((audit[3]?.data as { outcome?: string }).outcome).toBe('allowed-once')

    removeSandboxGuard()
    await ultraFiber.dispose()
    expect(ctx.get('approval')).toBeDefined()
    const afterUltra = await ctx.tools.execute({
      agent: employee,
      signal: SIGNAL,
      callId: ToolCallId('profile-call-3'),
      name: 'write_file',
      arguments: {},
    })
    expect(afterUltra.isError).toBe(false)
    expect(executions).toBe(2)
    expect(seen).toHaveLength(2)
    employee.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    await employeeHandle.dispose()
    await leadHandle.dispose()
    await ctx.fiber.dispose()
    activeContext = undefined
  }, 20_000)

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
    const lead = await ctx.agentLoop.create(SessionId('pinned-route-lead'), {
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

    const durable = await ctx.sessionPersistence.open(childId, 'read', { signal: SIGNAL })
    try {
      const events = await durable.read(durable.inheritedEventCount, undefined, { signal: SIGNAL })
      expect(foldSubagentDescriptor(events)).toMatchObject({
        agentProvider: SELECTED_PROVIDER,
        agentModel: SELECTED_MODEL,
        agentReasoningEffort: 'high',
      })
    } finally {
      await durable.close()
    }
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
  it('proves exact native approval identity while preserving independent sandbox denial', async () => {
    const ctx = new Context()
    activeContext = ctx
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(SessionProjectionRegistry)
    const sessionRoot = mkdtempSync(join(tmpdir(), 'dsh-ultra-external-approval-'))
    temporaryRoots.push(sessionRoot)
    await ctx.plugin(JsonlSessionPersistence, { root: sessionRoot })
    await ctx.plugin(TestSessionQuery)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(SubagentService)
    await ctx.plugin(TeamService)
    installMemoryStorageDomain(ctx)
    const lead = await ctx.agentLoop.create(SessionId('external-approval-lead'), {})
    const ultraFiber = ctx.plugin(DigitalEmployeeService)
    await ultraFiber
    const provider = new FakeNativeProvider(fakeNativeStore(), { exactCallApproval: true })
    const providerFiber = ctx.plugin({
      inject: ['digitalEmployees'],
      apply(pluginCtx: Context) {
        pluginCtx.digitalEmployees.registerExternalRuntimeProvider(provider)
      },
    })
    const other = new FakeNativeProvider(fakeNativeStore(), { id: 'other-native' })
    const otherFiber = ctx.plugin({
      inject: ['digitalEmployees'],
      apply(pluginCtx: Context) {
        pluginCtx.digitalEmployees.registerExternalRuntimeProvider(other)
      },
    })
    await Promise.all([providerFiber, otherFiber])
    await ctx.digitalEmployees.whenRuntimeCatalogSettled()
    const approvalProfile = profile({
      toolPolicy: { mode: 'inherit', names: [] },
      hooks: [{
        id: 'confirm-write',
        point: 'before-tool',
        effect: 'ask',
        matcher: 'write*',
        text: 'Confirm this exact write call.',
        enabled: true,
      }],
    })
    const saved = await ctx.digitalEmployees.saveProfile(lead, {
      expectedHeadRevision: null,
      profile: approvalProfile,
      runtimeTarget: { kind: 'external-agent', provider: 'fake-native' },
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
    }, SIGNAL)
    if (!launched.ok) throw new Error(launched.error.message)

    expect(provider.create).toHaveBeenCalledWith(expect.objectContaining({
      profile: expect.objectContaining({
        hooks: [{
          id: 'confirm-write',
          point: 'before-tool',
          effect: 'ask',
          matcher: 'write*',
          text: 'Confirm this exact write call.',
        }],
      }),
      requirements: expect.objectContaining({
        runtimeCapabilities: ['exact-call-approval'],
      }),
    }))
    const run = (await ctx.digitalEmployees.remoteView(lead)).runs
      .find(candidate => candidate.canonicalTurnId === 'fake-initial-1')
    if (run === undefined) throw new Error('external approval Run is missing')
    const evidence = await ctx.digitalEmployees.runEvidence(lead, { runId: run.runId }, SIGNAL)
    expect(evidence).toMatchObject({
      ok: true,
      value: {
        timeline: [
          {
            kind: 'approval',
            approvalId: 'fake-approval-1',
            callId: 'fake-call-1',
            policyId: 'confirm-write',
            outcome: 'asked',
          },
          {
            kind: 'approval',
            approvalId: 'fake-approval-1',
            callId: 'fake-call-1',
            policyId: 'confirm-write',
            outcome: 'allowed-once',
          },
          { kind: 'tool', callId: 'fake-call-1', outcome: 'blocked' },
          { kind: 'usage' },
          { kind: 'turn', outcome: 'completed' },
        ],
      },
    })
    expect(provider.sandboxMode).toBe('read-only')

    await providerFiber.dispose()
    await ctx.digitalEmployees.whenRuntimeCatalogSettled()
    expect(provider.attached).toHaveLength(0)
    expect(ctx.digitalEmployees.studioView(lead).runtimeCatalog.backends).toContainEqual(
      expect.objectContaining({ routingId: 'external-agent/other-native', availability: 'available' }),
    )
    await otherFiber.dispose()
    await ultraFiber.dispose()
  }, 20_000)

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
    const lead = await ctx.agentLoop.create(leadId, {})
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
      runtimeCapabilities: ['evaluation', 'evidence', 'usage'],
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
          { id: 'start-v1', point: 'session-start', effect: 'context', text: 'START HOOK V1' },
          { id: 'step-v1', point: 'before-step', effect: 'context', text: 'STEP HOOK V1' },
        ],
      },
    }))
    expect(JSON.stringify(firstProvider.create.mock.calls[0]?.[0].profile)).not.toContain('MUST NOT CROSS')
    expect(store.sessions).toHaveLength(1)
    expect(oneShot).not.toHaveBeenCalled()

    await expect(ctx.agentTeams.sendMessage(lead, {
      target: 'route-reviewer',
      content: [{ type: 'text', text: 'First work turn.' }],
      signal: SIGNAL,
    })).resolves.toMatchObject({ status: 'accepted' })
    const beforeRestartRuns = (await ctx.digitalEmployees.remoteView(lead)).runs
    expect(beforeRestartRuns.map(run => run.canonicalTurnId).sort()).toEqual([
      'fake-initial-1',
      'fake-turn-1',
    ])
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
    storageState.v1Tables.get('run_index')!.records.clear()
    expect(storageState.v1Tables.get('run_index')!.size).toBe(0)

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
      runtimeCapabilities: ['evaluation', 'evidence', 'usage'],
    }))
    expect(remote.runs.map(run => run.canonicalTurnId).sort()).toEqual([
      'fake-initial-1',
      'fake-turn-1',
      'fake-turn-2',
    ])
    const latestRun = remote.runs.find(run => run.canonicalTurnId === 'fake-turn-2')
    if (latestRun === undefined) throw new Error('restarted delivery Run is missing')
    await expect(resumedCtx.digitalEmployees.runEvidence(
      leadHandle.agent,
      { runId: latestRun.runId },
      SIGNAL,
    )).resolves.toMatchObject({
      ok: true,
      value: {
        run: {
          terminal: 'completed',
          usage: { inputTokens: 12, outputTokens: 2, totalTokens: 14 },
          completeness: { status: 'complete' },
        },
      },
    })
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

describe('isolated candidate evaluation integration', () => {
  it('evaluates a DSH candidate in a fresh parentless Agent and gates activation on the exact pass', async () => {
    const ctx = new Context()
    activeContext = ctx
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(SessionProjectionRegistry)
    const sessionRoot = mkdtempSync(join(tmpdir(), 'dsh-ultra-eval-dsh-'))
    temporaryRoots.push(sessionRoot)
    await ctx.plugin(JsonlSessionPersistence, { root: sessionRoot })
    await ctx.plugin(TestSessionQuery)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(ApprovalService)
    await ctx.plugin(SandboxPolicyService)
    await ctx.plugin(SubagentService)
    await ctx.plugin(SubagentSpawn, { providerName: 'spawn' })
    await ctx.plugin(TeamService)
    const storage = installMemoryStorageDomain(ctx)
    ctx.tools.register(defineContentToolFixture({
      name: 'read',
      description: 'Read immutable evidence',
      parameters: {},
      async execute() { return [] },
    }))
    const adapter = new EvaluationAdapter()
    ctx.llm.registerAdapter([SELECTED_PROVIDER], adapter)
    const lead = await ctx.agentLoop.create(SessionId('dsh-evaluation-lead'), {})
    const ultraFiber = ctx.plugin(DigitalEmployeeService)
    await ultraFiber
    const saved = await ctx.digitalEmployees.saveProfile(lead, {
      expectedHeadRevision: null,
      profile: profile(),
      runtimeTarget: { kind: 'dsh-model', provider: SELECTED_PROVIDER, model: SELECTED_MODEL },
    })
    if (!saved.ok) throw new Error(saved.error.message)
    const set = await ctx.digitalEmployees.saveEvalSet(lead, {
      expectedHeadRevision: null,
      evalSet: evalSet(saved.value.head.profileId),
    })
    if (!set.ok) throw new Error(set.error.message)
    const gated = await ctx.digitalEmployees.setEvalGate(lead, {
      profileId: saved.value.head.profileId,
      expectedHeadRevision: saved.value.head.headRevision,
      requiredEvalSet: { evalSetId: set.value.head.evalSetId, revision: set.value.revision.revision },
    })
    if (!gated.ok) throw new Error(gated.error.message)
    await expect(ctx.digitalEmployees.activateProfile(lead, {
      profileId: saved.value.head.profileId,
      revision: saved.value.revision.revision,
      expectedHeadRevision: gated.value.head.headRevision,
    })).resolves.toMatchObject({ ok: false, error: { code: 'promotion-gate-failed' } })

    const evalRows = storage.v1Tables.get('eval_runs')!
    let evaluatorDisposedAfterCommit = false
    ctx.on('agent/disposed', ({ agent }) => {
      if (!String(agent.id).startsWith('eval_')) return
      const record = [...evalRows.records.values()][0] as {
        readonly status?: string
        readonly cases?: readonly { readonly status?: string }[]
      } | undefined
      evaluatorDisposedAfterCommit = record?.status === 'running' && record.cases?.[0]?.status === 'passed'
    })
    const started = await ctx.digitalEmployees.startEvalRun(lead, {
      evalRunId: DSH_EVAL_RUN_ID,
      profileId: saved.value.head.profileId,
      profileRevision: saved.value.revision.revision,
      evalSetId: set.value.head.evalSetId,
      evalSetRevision: set.value.revision.revision,
    })
    expect(started).toMatchObject({ ok: true, value: { replayed: false, run: { status: 'running' } } })
    await vi.waitFor(() => {
      expect(ctx.digitalEmployees.studioView(lead).evalRuns[0]?.status).toBe('passed')
    }, { timeout: 5_000 })
    const inspected = await ctx.digitalEmployees.evalRun(lead, { evalRunId: DSH_EVAL_RUN_ID })
    expect(inspected).toMatchObject({
      ok: true,
      value: {
        run: {
          status: 'passed',
          cases: [{
            status: 'passed',
            run: { run: { terminal: 'completed', completeness: { status: 'complete' } } },
          }],
        },
      },
    })
    expect(JSON.stringify(inspected)).not.toContain('PRIVATE_OUTPUT')
    expect(evaluatorDisposedAfterCommit).toBe(true)
    expect(ctx.agents.list()).toEqual([lead])
    expect(ctx.agentTeams.listMembers(lead).map(member => member.name)).toEqual(['lead'])
    expect(adapter.requests[0]).toMatchObject({
      provider: SELECTED_PROVIDER,
      model: SELECTED_MODEL,
      maxTokens: 256,
    })
    expect(adapter.requests[0]?.tools?.map(tool => tool.name)).toEqual(['read'])
    expect(JSON.stringify(adapter.requests[0])).toContain('read-only')
    expect(JSON.stringify(adapter.requests[0])).toContain('Approval prompts are disabled')
    expect(ctx.digitalEmployees.studioView(lead).profiles[0]?.promotionGate).toMatchObject({
      status: 'passed',
      satisfiedByEvalRunId: DSH_EVAL_RUN_ID,
    })
    await expect(ctx.digitalEmployees.activateProfile(lead, {
      profileId: saved.value.head.profileId,
      revision: saved.value.revision.revision,
      expectedHeadRevision: gated.value.head.headRevision,
    })).resolves.toMatchObject({ ok: true, value: { head: { activeRevision: 1 } } })
    await ultraFiber.dispose()
    await ctx.fiber.dispose()
    activeContext = undefined
  }, 20_000)

  it('evaluates and cancels fake external handles without publishing Team identity', async () => {
    const ctx = new Context()
    activeContext = ctx
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(SessionProjectionRegistry)
    const sessionRoot = mkdtempSync(join(tmpdir(), 'dsh-ultra-eval-external-'))
    temporaryRoots.push(sessionRoot)
    await ctx.plugin(JsonlSessionPersistence, { root: sessionRoot })
    await ctx.plugin(TestSessionQuery)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(SubagentService)
    await ctx.plugin(TeamService)
    const storage = installMemoryStorageDomain(ctx)
    const lead = await ctx.agentLoop.create(SessionId('external-evaluation-lead'), {})
    const ultraFiber = ctx.plugin(DigitalEmployeeService)
    await ultraFiber
    const provider = new FakeNativeProvider(fakeNativeStore(), { exactCallApproval: true })
    const evalRows = storage.v1Tables.get('eval_runs')!
    provider.dispose.mockImplementation(async (request) => {
      if (request.kind !== 'evaluation') return
      const stored = [...evalRows.records.values()].find(value => (
        value as { evalRunId?: string }
      ).evalRunId === EXTERNAL_EVAL_RUN_ID) as {
        readonly status?: string
        readonly cases?: readonly { readonly status?: string }[]
      } | undefined
      expect(stored?.status, JSON.stringify(stored)).toBe('running')
      expect(stored?.cases?.[0]?.status, JSON.stringify(stored)).toBe('passed')
    })
    const providerFiber = ctx.plugin({
      inject: ['digitalEmployees'],
      apply(pluginCtx: Context) {
        pluginCtx.digitalEmployees.registerExternalRuntimeProvider(provider)
      },
    })
    await providerFiber
    await ctx.digitalEmployees.whenRuntimeCatalogSettled()
    const saved = await ctx.digitalEmployees.saveProfile(lead, {
      expectedHeadRevision: null,
      profile: profile({ hooks: [] }),
      runtimeTarget: { kind: 'external-agent', provider: provider.id },
    })
    if (!saved.ok) throw new Error(saved.error.message)
    const set = await ctx.digitalEmployees.saveEvalSet(lead, {
      expectedHeadRevision: null,
      evalSet: evalSet(saved.value.head.profileId, {
        cases: [{
          ...evalSet(saved.value.head.profileId).cases[0]!,
          assertions: {
            ...evalSet(saved.value.head.profileId).cases[0]!.assertions,
            requiredTools: ['read'],
          },
        }],
      }),
    })
    if (!set.ok) throw new Error(set.error.message)
    const gated = await ctx.digitalEmployees.setEvalGate(lead, {
      profileId: saved.value.head.profileId,
      expectedHeadRevision: saved.value.head.headRevision,
      requiredEvalSet: { evalSetId: set.value.head.evalSetId, revision: set.value.revision.revision },
    })
    if (!gated.ok) throw new Error(gated.error.message)
    const started = await ctx.digitalEmployees.startEvalRun(lead, {
      evalRunId: EXTERNAL_EVAL_RUN_ID,
      profileId: saved.value.head.profileId,
      profileRevision: saved.value.revision.revision,
      evalSetId: set.value.head.evalSetId,
      evalSetRevision: set.value.revision.revision,
    })
    expect(started).toMatchObject({ ok: true, value: { run: { status: 'running' } } })
    await vi.waitFor(() => {
      expect(ctx.digitalEmployees.studioView(lead).evalRuns[0]?.status).not.toBe('running')
    }, { timeout: 5_000 })
    const externalRun = await ctx.digitalEmployees.evalRun(lead, { evalRunId: EXTERNAL_EVAL_RUN_ID })
    expect(
      externalRun.ok ? externalRun.value.run.status : externalRun.error.code,
      JSON.stringify(externalRun),
    ).toBe('passed')
    expect(provider.createEvaluationHandle).toHaveBeenCalledWith(expect.objectContaining({
      environment: {
        sandbox: 'read-only',
        approval: 'never',
        toolAllowlist: ['read'],
        fixtures: [{ id: 'source', content: 'export const value = 1' }],
        maxSteps: 2,
        maxOutputTokens: 256,
        maxElapsedMs: 5_000,
      },
    }))
    expect(provider.dispose).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'evaluation',
      evaluationHandle: 'fake-eval-1',
    }))
    expect(ctx.agentTeams.listMembers(lead).map(member => member.name)).toEqual(['lead'])

    const entered = Promise.withResolvers<void>()
    provider.createEvaluationHandle.mockImplementationOnce(async (request) => {
      entered.resolve()
      return await new Promise<never>((_resolve, reject) => {
        const abort = (): void => { reject(request.signal.reason) }
        if (request.signal.aborted) abort()
        else request.signal.addEventListener('abort', abort, { once: true })
      })
    })
    const cancelling = await ctx.digitalEmployees.startEvalRun(lead, {
      evalRunId: CANCELLED_EVAL_RUN_ID,
      profileId: saved.value.head.profileId,
      profileRevision: saved.value.revision.revision,
      evalSetId: set.value.head.evalSetId,
      evalSetRevision: set.value.revision.revision,
    })
    expect(cancelling.ok).toBe(true)
    await entered.promise
    const cancelled = await ctx.digitalEmployees.cancelEvalRun(lead, { evalRunId: CANCELLED_EVAL_RUN_ID })
    expect(cancelled).toMatchObject({ ok: true, value: { run: { status: 'cancelled' } } })
    expect(ctx.digitalEmployees.studioView(lead).evalRuns.find(run => (
      run.evalRunId === CANCELLED_EVAL_RUN_ID
    ))?.status).toBe('cancelled')
    expect(ctx.digitalEmployees.studioView(lead).profiles[0]?.promotionGate.status).toBe('passed')

    await providerFiber.dispose()
    await ultraFiber.dispose()
    await ctx.fiber.dispose()
    activeContext = undefined
  }, 20_000)
})
