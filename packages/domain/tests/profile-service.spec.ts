import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { TeamError } from '@deepseek-ai/dsh-experimental-agent-team'
import { describe, expect, it, vi } from 'vitest'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
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
  readonly leader: Agent
  readonly teammate: Agent
  readonly staleLeader: Agent
  readonly foreignRoot: Agent
  readonly agent: (id: string) => Agent | undefined
  readonly disposeAgent: (agent: Agent) => void
}

async function harness(options: { readonly spawnGate?: Promise<void> } = {}): Promise<Harness> {
  const ctx = new Context()
  const profiles = new MemoryTable<string, DigitalEmployeeProfile>()
  const bindings = new MemoryTable<string, unknown>()
  const close = vi.fn(async () => undefined)
  const roster = [
    { id: 'lead', name: 'lead', role: 'lead' },
    { id: 'teammate', name: 'worker', role: 'teammate' },
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
  const leader = { id: 'lead', session: { header: {} }, ctx } as unknown as Agent
  const teammate = {
    id: 'teammate',
    session: { header: { parentSession: 'lead' } },
    ctx,
  } as unknown as Agent
  const staleLeader = { id: 'lead', session: { header: {} }, ctx } as unknown as Agent
  const foreignRoot = { id: 'foreign', session: { header: {} }, ctx } as unknown as Agent
  const agents = new Map<string, Agent>([['lead', leader], ['teammate', teammate]])

  ctx.provide('agents', {
    get: (id: string) => agents.get(id),
    list: () => [...agents.values()],
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
    } as unknown as Agent
    Object.defineProperty(childCtx, 'agent', { value: child })
    agents.set('child', child)
    ctx.emit('agent/created', { agent: child })
    return { member: { id: 'child', name: request.name } }
  })
  ctx.provide('agentTeams', {
    membership: (agent: Agent) => {
      if (agents.get(agent.id) !== agent) {
        throw new TeamError(`agent "${agent.id}" is not a member of an active Agent Team`, 'TEAM_NOT_MEMBER')
      }
      if (agent === teammate) return { id: 'lead', root: leader, role: 'teammate', name: 'worker' }
      return { id: agent.id, root: agent, role: 'lead', name: 'lead' }
    },
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
    leader,
    teammate,
    staleLeader,
    foreignRoot,
    agent: id => agents.get(id),
    disposeAgent: (agent) => {
      if (agents.get(agent.id) === agent) agents.delete(agent.id)
      ctx.emit('agent/disposed', { agent })
    },
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
    const first = await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, { expectedRevision: null, profile: draft() })
    expect(first).toMatchObject({ ok: true, value: { revision: 1 } })
    const [left, right] = await Promise.all([
      runtime.ctx.digitalEmployees.saveProfile(runtime.leader, { expectedRevision: 1, profile: draft({ displayName: 'Reviewer A' }) }),
      runtime.ctx.digitalEmployees.saveProfile(runtime.leader, { expectedRevision: 1, profile: draft({ displayName: 'Reviewer B' }) }),
    ])
    expect([left, right].filter(result => result.ok)).toHaveLength(1)
    expect([left, right].find(result => !result.ok)).toMatchObject({
      ok: false,
      error: { code: 'profile-conflict', current: { revision: 2 } },
    })
    await runtime.fiber.dispose()
  })

  it('rejects an exact teammate at the exported save seam without writing', async () => {
    const runtime = await harness()

    const service = runtime.ctx.digitalEmployees as unknown as {
      saveProfile: (
        caller: Agent,
        request: { readonly expectedRevision: null; readonly profile: DigitalEmployeeProfileDraft },
      ) => Promise<unknown>
    }
    await expect(service.saveProfile(runtime.teammate, { expectedRevision: null, profile: draft() }))
      .resolves.toMatchObject({ ok: false, error: { code: 'team-lead-required' } })
    expect(runtime.profiles.size).toBe(0)

    await runtime.fiber.dispose()
  })

  it('rejects an exact teammate at the exported delete seam without deleting', async () => {
    const runtime = await harness()
    const saved = await runtime.ctx.digitalEmployees.saveProfile(
      runtime.leader,
      { expectedRevision: null, profile: draft() },
    )
    expect(saved).toMatchObject({ ok: true, value: { revision: 1 } })

    const remove = runtime.ctx.digitalEmployees.deleteProfile as unknown as (
      caller: Agent,
      request: { readonly profileId: string; readonly expectedRevision: number },
    ) => Promise<unknown>
    await expect(remove.call(runtime.ctx.digitalEmployees, runtime.teammate, {
      profileId: 'code-reviewer',
      expectedRevision: 1,
    })).resolves.toMatchObject({ ok: false, error: { code: 'team-lead-required' } })
    expect(runtime.profiles.size).toBe(1)

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
        { expectedRevision: null, profile: draft() },
      )).resolves.toMatchObject({ ok: false, error: { code: 'team-rejected' } })
      await expect(runtime.ctx.digitalEmployees.deleteProfile(
        caller,
        { profileId: 'code-reviewer', expectedRevision: 1 },
      )).resolves.toMatchObject({ ok: false, error: { code: 'team-rejected' } })
      await expect(runtime.ctx.digitalEmployees.spawnProfile(
        caller,
        { profileId: 'code-reviewer' },
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
      { expectedRevision: null, profile: draft() },
    )

    const view = runtime.ctx.digitalEmployees.studioView(runtime.leader)
    expect(view).toMatchObject({
      profiles: [{ id: 'code-reviewer', revision: 1 }],
      tools: [
        { name: 'bash', description: 'Run a shell' },
        { name: 'read', description: 'Read files' },
      ],
      instances: [],
    })
    expect(Object.isFrozen(view)).toBe(true)
    expect(Object.isFrozen(view.profiles)).toBe(true)
    expect(Object.isFrozen(view.profiles[0])).toBe(true)
    expect(Object.isFrozen(view.profiles[0]!.context[0])).toBe(true)
    expect(Object.isFrozen(view.tools)).toBe(true)
    expect(Object.isFrozen(view.tools[0])).toBe(true)
    expect(view.profiles[0]).not.toBe(runtime.profiles.get('code-reviewer'))
    expect(structuredClone(view)).toEqual(view)

    await runtime.fiber.dispose()
  })

  it('persists the binding before provisioning and composes the immutable child scope', async () => {
    const runtime = await harness()
    const saved = await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, { expectedRevision: null, profile: draft() })
    expect(saved.ok).toBe(true)
    const result = await runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader,
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

  it('removes an exact Agent installation once across Agent and Fiber disposal', async () => {
    const runtime = await harness()
    await runtime.ctx.digitalEmployees.saveProfile(
      runtime.leader,
      { expectedRevision: null, profile: draft() },
    )
    await runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader,
      { profileId: 'code-reviewer' },
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

  it('reinstalls one capability layer without duplicates after service replacement', async () => {
    const runtime = await harness()
    await runtime.ctx.digitalEmployees.saveProfile(
      runtime.leader,
      { expectedRevision: null, profile: draft() },
    )
    await runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader,
      { profileId: 'code-reviewer' },
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
    await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, { expectedRevision: null, profile: draft() })
    await expect(runtime.ctx.digitalEmployees.spawnProfile(
      runtime.teammate,
      { profileId: 'code-reviewer' },
      new AbortController().signal,
    )).resolves.toMatchObject({ ok: false, error: { code: 'team-lead-required' } })
    expect(runtime.bindings.size).toBe(0)
    expect(runtime.spawn).not.toHaveBeenCalled()
    await runtime.fiber.dispose()
  })

  it('rejects an oversized assignment before reserving a Team member name', async () => {
    const runtime = await harness()
    await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, { expectedRevision: null, profile: draft() })
    await expect(runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader,
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
    await runtime.ctx.digitalEmployees.saveProfile(runtime.leader, { expectedRevision: null, profile: draft() })
    const launch = runtime.ctx.digitalEmployees.spawnProfile(
      runtime.leader,
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
