import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
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
    provider: '',
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

async function loadComposition(): Promise<{ readonly ctx: Context; readonly close: ReturnType<typeof vi.fn> }> {
  const profiles = new MemoryTable<string, never>()
  const bindings = new MemoryTable<string, never>()
  const close = vi.fn(async () => undefined)
  const runtimePlugin = {
    name: 'fixture-agent-team-runtime',
    apply(ctx: Context) {
      ctx.provide('agents', { get: () => undefined, list: () => [] } as never)
      ctx.provide('agentTeams', {} as never)
      ctx.provide('storageDomain', {
        open: async () => ({
          table: (name: string) => name === 'profiles' ? profiles : bindings,
          close,
        }),
      } as never)
      ctx.provide('subagents', {
        registerContinuableSetup: () => () => undefined,
      } as never)
      ctx.provide('systemPrompt', {} as never)
      ctx.provide('tools', {} as never)
    },
  }

  context = new Context()
  context.baseUrl = new URL('./fixtures/', import.meta.url).href
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@fixture/agent-team-runtime', runtimePlugin],
    ['@deepseek-ai/dsh-agent-team-ultra', DigitalEmployeeService],
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
  return { ctx: context, close }
}

describe('Agent Team Ultra Loader composition', () => {
  it('loads the built public plugin with schema-validated deployment limits', async () => {
    const { ctx, close } = await loadComposition()
    const unloaded = [...ctx.loader.entries()]
      .filter(entry => entry.fiber === undefined && !entry.disabled)
      .map(entry => entry.options.name)
    expect(unloaded).toEqual([])

    const saved = await ctx.digitalEmployees.saveProfile({
      expectedRevision: null,
      profile: profile('reviewer'),
    })
    expect(saved).toMatchObject({
      ok: true,
      value: { provider: 'fixture-provider', revision: 1 },
    })
    await expect(ctx.digitalEmployees.saveProfile({
      expectedRevision: null,
      profile: profile('writer'),
    })).resolves.toMatchObject({
      ok: false,
      error: { code: 'profile-limit' },
    })

    await ctx.fiber.dispose()
    context = undefined
    expect(close).toHaveBeenCalledOnce()
  })
})
