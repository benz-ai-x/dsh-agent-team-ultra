import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import TeamService from '@deepseek-ai/dsh-experimental-agent-team'
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
import DigitalEmployeeService from '../lib/index.js'
import type { DigitalEmployeeProfileDraft } from '../src/types.ts'

const SIGNAL = new AbortController().signal
const SELECTED_PROVIDER = 'employee-provider'
const SELECTED_MODEL = 'employee-model'
const SELECTED_EFFORT = ReasoningEffortId('high')

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

function installMemoryStorageDomain(ctx: Context): void {
  const v0Profiles = new MemoryTable<string, unknown>()
  const v0Bindings = new MemoryTable<string, unknown>()
  const v1Tables = new Map([
    ['profile_heads', new MemoryTable<string, unknown>()],
    ['profile_revisions', new MemoryTable<string, unknown>()],
    ['bindings', new MemoryTable<string, unknown>()],
    ['run_index', new MemoryTable<string, unknown>()],
    ['eval_sets', new MemoryTable<string, unknown>()],
    ['eval_runs', new MemoryTable<string, unknown>()],
  ])
  let migrationMarker: unknown = { formatVersion: 1, status: 'pending', sourceVersion: 0 }
  ctx.provide('storageDomain', {
    open: async (spec: { readonly name: string }) => {
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
          const table = v1Tables.get(name)
          if (table === undefined) throw new Error(`unexpected v1 table ${name}`)
          return table
        },
        close: async () => undefined,
      }
    },
  } as never)
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
