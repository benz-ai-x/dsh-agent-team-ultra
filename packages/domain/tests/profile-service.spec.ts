import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import DigitalEmployeeService, {
  digitalEmployeeProfileDraftSchema,
  snapshotProfile,
} from '../lib/index.js'
import type {
  DigitalEmployeeProfile,
  DigitalEmployeeProfileDraft,
  ProfileHook,
} from '../src/types.ts'

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
    provider: 'spawn',
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
  readonly profiles: MemoryTable<string, DigitalEmployeeProfile>
  readonly bindings: MemoryTable<string, unknown>
  readonly close: ReturnType<typeof vi.fn>
  readonly restriction: ReturnType<typeof vi.fn>
  readonly sections: ReturnType<typeof vi.fn>
  readonly contexts: ReturnType<typeof vi.fn>
  readonly scopeDisposals: Array<ReturnType<typeof vi.fn>>
  readonly childEvents: string[]
  readonly spawn: ReturnType<typeof vi.fn>
  readonly setRole: (role: 'lead' | 'teammate') => void
}

async function harness(options: { readonly spawnGate?: Promise<void> } = {}): Promise<Harness> {
  const ctx = new Context()
  const profiles = new MemoryTable<string, DigitalEmployeeProfile>()
  const bindings = new MemoryTable<string, unknown>()
  const close = vi.fn(async () => undefined)
  let role: 'lead' | 'teammate' = 'lead'
  const roster = [{ id: 'lead', name: 'lead', role: 'lead' }]
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
  const leader = { id: 'lead', session: { header: {} }, ctx }

  ctx.provide('agents', {
    get: (id: string) => id === 'lead' ? leader : undefined,
    list: () => [leader],
  } as never)
  ctx.provide('storageDomain', {
    open: vi.fn(async () => ({
      table: (name: string) => name === 'profiles' ? profiles : bindings,
      close,
    })),
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

  const spawn = vi.fn(async (_caller: unknown, request: { name: string; signal?: AbortSignal }) => {
    const pending = [...bindings.records.values()].find(value =>
      (value as { phase?: string }).phase === 'pending')
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
    roster.push({ id: 'child', name: request.name, role: 'teammate' })
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
      session: { header: { parentSession: 'lead' } },
      ctx: childCtx,
    }
    ctx.emit('agent/created', { agent: child as never })
    return { member: { id: 'child', name: request.name } }
  })
  ctx.provide('agentTeams', {
    membership: () => ({ id: 'lead', root: leader, role, name: role === 'lead' ? 'lead' : 'worker' }),
    listMembers: () => roster,
    spawnTeammate: spawn,
  } as never)

  const fiber = ctx.plugin(DigitalEmployeeService)
  await fiber
  return {
    ctx,
    fiber,
    profiles,
    bindings,
    close,
    restriction,
    sections,
    contexts,
    scopeDisposals,
    childEvents,
    spawn,
    setRole: value => { role = value },
  }
}

describe('Digital Employee profile contract', () => {
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

  it('serializes CAS writes so one stale concurrent editor loses', async () => {
    const runtime = await harness()
    const first = await runtime.ctx.digitalEmployees.saveProfile({ expectedRevision: null, profile: draft() })
    expect(first).toMatchObject({ ok: true, value: { revision: 1 } })
    const [left, right] = await Promise.all([
      runtime.ctx.digitalEmployees.saveProfile({ expectedRevision: 1, profile: draft({ displayName: 'Reviewer A' }) }),
      runtime.ctx.digitalEmployees.saveProfile({ expectedRevision: 1, profile: draft({ displayName: 'Reviewer B' }) }),
    ])
    expect([left, right].filter(result => result.ok)).toHaveLength(1)
    expect([left, right].find(result => !result.ok)).toMatchObject({
      ok: false,
      error: { code: 'profile-conflict', current: { revision: 2 } },
    })
    await runtime.fiber.dispose()
  })

  it('persists the binding before provisioning and composes the immutable child scope', async () => {
    const runtime = await harness()
    const saved = await runtime.ctx.digitalEmployees.saveProfile({ expectedRevision: null, profile: draft() })
    expect(saved.ok).toBe(true)
    const result = await runtime.ctx.digitalEmployees.spawnProfile(
      'lead',
      { profileId: 'code-reviewer', assignment: 'Review the storage transaction.' },
      new AbortController().signal,
    )
    expect(result).toMatchObject({
      ok: true,
      value: { memberName: 'code-reviewer', memberId: 'child', profileRevision: 1, phase: 'active' },
    })
    expect(runtime.spawn).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      name: 'code-reviewer',
      context: 'fresh',
      provider: 'spawn',
    }))
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
      phase: 'active',
      profile: { revision: 1, displayName: 'Code Reviewer' },
    })
    await runtime.fiber.dispose()
    expect(runtime.scopeDisposals).toHaveLength(8)
    expect(runtime.scopeDisposals.every(dispose => dispose.mock.calls.length === 1)).toBe(true)
    expect(runtime.close).toHaveBeenCalledOnce()
  })

  it('rejects a non-Lead before Agent Team provisioning', async () => {
    const runtime = await harness()
    await runtime.ctx.digitalEmployees.saveProfile({ expectedRevision: null, profile: draft() })
    runtime.setRole('teammate')
    await expect(runtime.ctx.digitalEmployees.spawnProfile(
      'lead',
      { profileId: 'code-reviewer' },
      new AbortController().signal,
    )).resolves.toMatchObject({ ok: false, error: { code: 'team-lead-required' } })
    expect(runtime.spawn).not.toHaveBeenCalled()
    await runtime.fiber.dispose()
  })

  it('rejects an oversized assignment before reserving a Team member name', async () => {
    const runtime = await harness()
    await runtime.ctx.digitalEmployees.saveProfile({ expectedRevision: null, profile: draft() })
    await expect(runtime.ctx.digitalEmployees.spawnProfile(
      'lead',
      { profileId: 'code-reviewer', assignment: 'x'.repeat(32_769) },
      new AbortController().signal,
    )).resolves.toMatchObject({ ok: false, error: { code: 'assignment-too-large' } })
    expect(runtime.bindings.size).toBe(0)
    expect(runtime.spawn).not.toHaveBeenCalled()
    await runtime.fiber.dispose()
  })

  it('closes admission but lets an admitted launch record its terminal edge before storage closes', async () => {
    const gate = Promise.withResolvers<void>()
    const runtime = await harness({ spawnGate: gate.promise })
    await runtime.ctx.digitalEmployees.saveProfile({ expectedRevision: null, profile: draft() })
    const launch = runtime.ctx.digitalEmployees.spawnProfile(
      'lead',
      { profileId: 'code-reviewer' },
      new AbortController().signal,
    )
    await vi.waitFor(() => {
      expect([...runtime.bindings.records.values()][0]).toMatchObject({ phase: 'pending' })
    })

    const disposal = runtime.fiber.dispose()
    await expect(launch).rejects.toThrow('Agent Team Ultra service disposed')
    await disposal
    expect([...runtime.bindings.records.values()][0]).toMatchObject({ phase: 'failed' })
    expect(runtime.close).toHaveBeenCalledOnce()
    gate.resolve()
  })
})
