import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DigitalEmployeeService from '../lib/index.js'
import type { DigitalEmployeeProfileDraft } from '../src/types.ts'

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

function profile(id: string): DigitalEmployeeProfileDraft {
  return {
    id,
    employeeName: id,
    displayName: id === 'reviewer' ? 'Reviewer' : 'Writer',
    description: 'Loader-composed profile.',
    continuationProvider: '',
    contextMode: 'fresh',
    persona: 'Be precise.',
    mission: 'Complete the assigned work.',
    toolPolicy: { mode: 'inherit', names: [] },
    context: [],
    memory: [],
    hooks: [],
  }
}

let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
})

async function loadComposition(): Promise<{
  readonly ctx: Context
  readonly close: ReturnType<typeof vi.fn>
  readonly leader: Agent
}> {
  const profiles = new MemoryTable<string, unknown>()
  const revisions = new MemoryTable<string, unknown>()
  const bindings = new MemoryTable<string, unknown>()
  const v0Profiles = new MemoryTable<string, unknown>()
  const v0Bindings = new MemoryTable<string, unknown>()
  const emptyV1Tables = new Map([
    ['run_index', new MemoryTable<string, unknown>()],
    ['eval_sets', new MemoryTable<string, unknown>()],
    ['eval_runs', new MemoryTable<string, unknown>()],
  ])
  let migrationMarker: unknown = { formatVersion: 1, status: 'pending', sourceVersion: 0 }
  const close = vi.fn(async () => undefined)
  let leader: Agent | undefined
  const runtimePlugin = {
    name: 'fixture-agent-team-runtime',
    apply(ctx: Context) {
      leader = { id: 'lead', session: { header: {} }, ctx } as unknown as Agent
      ctx.provide('agents', {
        get: (id: string) => id === leader?.id ? leader : undefined,
        list: () => leader === undefined ? [] : [leader],
      } as never)
      ctx.provide('agentTeams', {
        tryMembership: (agent: Agent) => agent === leader
          ? { id: agent.id, root: agent, role: 'lead', name: 'lead' }
          : undefined,
        membership: (agent: Agent) => {
          if (agent !== leader) throw new Error('fixture only recognizes the exact live Team Lead')
          return { id: agent.id, root: agent, role: 'lead', name: 'lead' }
        },
        listMembers: () => [{
          id: 'lead',
          name: 'lead',
          role: 'lead',
          status: 'idle',
          diagnostics: [],
        }],
      } as never)
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
              if (name === 'profile_heads') return profiles
              if (name === 'profile_revisions') return revisions
              if (name === 'bindings') return bindings
              const table = emptyV1Tables.get(name)
              if (table === undefined) throw new Error(`unexpected v1 table ${name}`)
              return table
            },
            close,
          }
        },
      } as never)
      ctx.provide('sessionPersistence', {
        inspect: async () => ({ events: [], inheritedEventCount: 0 }),
      } as never)
      ctx.provide('systemPrompt', {} as never)
      ctx.provide('tools', { schemas: () => [], get: () => undefined } as never)
      ctx.provide('llm', {
        listProviders: () => [{ id: 'fixture-llm', name: 'Fixture LLM' }],
        listModels: async () => [{ provider: 'fixture-llm', id: 'fixture-model', name: 'Fixture Model' }],
        resolveModelInfo: async () => ({ provider: 'fixture-llm', id: 'fixture-model', name: 'Fixture Model' }),
      } as never)
      ctx.provide('subagents', {
        list: () => ['fixture-provider'],
        getProvider: (name: string) => name === 'fixture-provider'
          ? {
            name,
            inheritsParentContext: false,
            capabilities: {},
            prepareContinuable: async () => ({}),
          }
          : undefined,
      } as never)
    },
  }

  context = new Context()
  context.baseUrl = new URL('./fixtures/', import.meta.url).href
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@fixture/agent-team-runtime', runtimePlugin],
    ['@benz-ai-x/dsh-agent-team-ultra', DigitalEmployeeService],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      const plugin = modules.get(specifier)
      if (plugin === undefined) throw new Error(`unexpected Loader import: ${specifier}`)
      return plugin
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({
    name: 'cordis:include',
    config: { path: new URL('./fixtures/cordis.yml', import.meta.url).href },
  })
  await context.loader.await()
  if (leader === undefined) throw new Error('fixture runtime did not install its Team Lead')
  return { ctx: context, close, leader }
}

describe('Agent Team Ultra Loader composition', () => {
  it('loads the built public plugin with schema-validated deployment limits', async () => {
    const { ctx, close, leader } = await loadComposition()
    const unloaded = [...ctx.loader.entries()]
      .filter(entry => entry.fiber === undefined && !entry.disabled)
      .map(entry => entry.options.name)
    expect(unloaded).toEqual([])

    const saved = await ctx.digitalEmployees.saveProfile(leader, {
      expectedHeadRevision: null,
      profile: profile('reviewer'),
      runtimeTarget: { kind: 'dsh-model', provider: 'fixture-llm', model: 'fixture-model' },
    })
    expect(saved).toMatchObject({
      ok: true,
      value: {
        head: { headRevision: 1, latestRevision: 1 },
        revision: { revision: 1, profile: { continuationProvider: 'fixture-provider' } },
      },
    })
    await expect(ctx.digitalEmployees.saveProfile(leader, {
      expectedHeadRevision: null,
      profile: profile('writer'),
      runtimeTarget: { kind: 'dsh-model', provider: 'fixture-llm', model: 'fixture-model' },
    })).resolves.toMatchObject({
      ok: false,
      error: { code: 'profile-limit' },
    })

    await ctx.fiber.dispose()
    context = undefined
    expect(close).toHaveBeenCalledOnce()
  })
})
