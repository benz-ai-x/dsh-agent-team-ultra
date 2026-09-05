import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it, vi } from 'vitest'
import DigitalEmployeeService from '../lib/index.js'
import { digitalEmployeeV1DomainSpec } from '../src/storage.ts'
import type { DigitalEmployeeStudioView, SpawnDigitalEmployeeResult } from '../src/types.ts'
import { cleanups, profile, target, WorkflowAdapter, workflow } from './fixtures/host-workflow.ts'

const request = {
  launchRequestId: '44444444-4444-4444-8444-444444444444',
  profileId: profile.id,
  assignment: 'Review the fixed route.',
}

describe('Launch and recovery through generated Remote and durable storage', () => {
  it.each(['new', 'pending-replay'] as const)('rejects a %s launch when the exact Lead retires during preflight', async (intent) => {
    const { ctx, lead, invoke } = await workflow()
    lead.agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'Prepare the team.' }],
      source: { kind: 'plugin', plugin: 'workflow-test' },
    }))
    await lead.agent.whenIdle()
    await ctx.sessions.flush(lead.agent.session)
    await invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target })
    await invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 })
    if (intent === 'pending-replay') {
      const controller = new AbortController()
      const stop = ctx.on('domain/changed', change => {
        if (change.domain === 'agent_team_ultra_v1' && change.table === 'bindings' && change.operation === 'put') {
          controller.abort(new Error('keep the original pending reservation'))
        }
      })
      await expect(invoke('spawn', request, lead.agent.id, controller.signal)).rejects.toMatchObject({ code: 'gateway/cancelled' })
      stop()
    }
    const refresh = new WorkflowAdapter()
    const gate = Promise.withResolvers<void>()
    refresh.catalogGate = gate.promise
    cleanups.push(async () => { gate.resolve() })
    ctx.llm.registerAdapter(['refresh'], refresh)
    await refresh.catalogEntered.promise
    const starting = invoke('spawn', request)
    await invoke('view')
    await lead.dispose()
    gate.resolve()

    await expect(starting).resolves.toMatchObject({ ok: false, error: { code: 'team-rejected' } })
    const resumed = await ctx.agents.resume({ resumeSessionId: lead.agent.id })
    const restored = await invoke('view') as DigitalEmployeeStudioView
    if (intent === 'new') expect(restored.instances).toEqual([])
    else expect(restored.instances).toMatchObject([{ launchRequestId: request.launchRequestId, provisioningPhase: 'pending' }])
    expect(ctx.agentTeams.listMembers(resumed.agent).map(member => member.name)).toEqual(['lead'])
  })

  it.each(['json', 'sqlite'] as const)('preserves one fixed launch and rebuilds safe snapshots after a %s Host restart', async (backend) => {
    const { ctx, lead, invoke, root, fiber } = await workflow(backend)
    lead.agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'Prepare the team.' }],
      source: { kind: 'plugin', plugin: 'workflow-test' },
    }))
    await lead.agent.whenIdle()
    const original = { ...profile, persona: 'ORIGINAL_PERSONA', toolPolicy: { mode: 'allow' as const, names: ['read'] } }
    await invoke('save', { expectedHeadRevision: null, profile: original, runtimeTarget: target })
    await invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 })
    const stream = await ctx.typertGateway.stream({
      namespace: 'digitalEmployees', method: 'watch', args: { agentId: lead.agent.id },
    })
    const frames = stream[Symbol.asyncIterator]()
    await expect(frames.next()).resolves.toMatchObject({
      done: false, value: { type: 'baseline', value: { instances: [], runs: [] } },
    })
    const reservations: unknown[] = []
    ctx.on('domain/changed', change => {
      if (change.domain !== 'agent_team_ultra_v1' || change.table !== 'bindings' || change.operation !== 'put') return
      if ((change.value as { provisioningPhase: string }).provisioningPhase !== 'pending') return
      reservations.push({ binding: change.value, roster: ctx.agentTeams.listMembers(lead.agent).map(member => member.name) })
    })
    const [first, concurrent] = await Promise.all([invoke('spawn', request), invoke('spawn', request)]) as SpawnDigitalEmployeeResult[]
    expect(first).toEqual(concurrent)
    expect(first).toMatchObject({
      ok: true, value: { launchRequestId: request.launchRequestId, profileRevision: 1, runtimeTarget: target, resolvedRuntimeTarget: target },
    })
    if (first === undefined || !first.ok || first.value.memberId === undefined) throw new Error('launch did not return a member')
    const childId = SessionId(first.value.memberId)
    expect(reservations[0]).toEqual({
      binding: expect.objectContaining({ launchRequestId: request.launchRequestId, provisioningPhase: 'pending', profileRevision: 1 }),
      roster: ['lead'],
    })
    expect(ctx.agentTeams.listMembers(lead.agent).map(member => member.name)).toEqual(['lead', profile.employeeName])
    await ctx.agents.get(childId)?.whenIdle()
    const before = await invoke('view') as DigitalEmployeeStudioView
    expect(before.runs).toHaveLength(1)
    expect(before.runs[0]).toMatchObject({ terminal: 'completed', usage: { inputTokens: 10, outputTokens: 2 }, completeness: { status: 'complete' } })
    expect(JSON.stringify(before)).not.toContain('PRIVATE_OUTPUT')
    await expect(frames.next()).resolves.toMatchObject({
      done: false, value: { type: 'replace', value: before },
    })
    await invoke('save', {
      expectedHeadRevision: 2, profile: { ...original, persona: 'NEW_PERSONA' }, runtimeTarget: target,
    })
    await invoke('activate', { profileId: profile.id, revision: 2, expectedHeadRevision: 3 })
    await expect(invoke('spawn', request)).resolves.toMatchObject({ ok: true, value: { memberId: childId, profileRevision: 1 } })
    await expect(invoke('spawn', { ...request, assignment: 'Changed intent.' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'launch-request-conflict' } })
    await fiber.dispose()
    // Remove only the disposable index through the real Domain handle after its owner closes.
    const stored = await ctx.storageDomain.open(digitalEmployeeV1DomainSpec)
    try {
      for (const [key] of stored.table('run_index').entries()) await stored.table('run_index').delete(key)
      expect([...stored.table('run_index').entries()]).toEqual([])
    } finally { await stored.close() }
    await ctx.fiber.dispose()
    await expect(frames.next()).resolves.toEqual({ done: true, value: undefined })

    const recovered = await workflow(backend, { root, resumeLead: true })
    const restored = await recovered.invoke('view') as DigitalEmployeeStudioView
    expect(restored.profiles[0]?.head.activeRevision).toBe(2)
    expect(restored.instances).toMatchObject([{ memberId: childId, profileRevision: 1, runtimeTarget: target, runtimePresence: 'inactive' }])
    expect(restored.runs).toEqual(before.runs)
    expect(recovered.ctx.agents.get(childId)).toBeUndefined()
    await expect(recovered.invoke('spawn', request)).resolves.toMatchObject({ ok: true, value: { memberId: childId, profileRevision: 1 } })
    expect(recovered.ctx.agents.get(childId)).toBeUndefined()
    await expect(recovered.invoke('run', { runId: before.runs[0]!.runId })).resolves.toMatchObject({
      ok: true, value: { run: before.runs[0] },
    })
    await recovered.ctx.agentTeams.sendMessage(recovered.lead.agent, {
      target: profile.employeeName, content: [{ type: 'text', text: 'Continue the existing employee.' }],
      signal: new AbortController().signal,
    })
    await vi.waitFor(() => { expect(recovered.adapter.requests).toHaveLength(1) })
    await recovered.ctx.agents.get(childId)?.whenIdle()
    expect(recovered.adapter.requests[0]).toMatchObject({ provider: target.provider, model: target.model })
    expect(recovered.adapter.requests[0]?.system).toContain('ORIGINAL_PERSONA')
    expect(recovered.adapter.requests[0]?.system).not.toContain('NEW_PERSONA')
    expect(recovered.ctx.tools.schemas(recovered.ctx.agents.get(childId)!).map(tool => tool.name)).toEqual(['read'])
    const continued = await recovered.invoke('view') as DigitalEmployeeStudioView
    expect(continued.instances).toHaveLength(1)
    expect(continued.runs).toHaveLength(2)
    expect(continued.runs.every(run => run.profileRevision === 1)).toBe(true)
    expect(new Set(continued.runs.map(run => run.runId)).size).toBe(2)
    expect(JSON.stringify(continued)).not.toContain('PRIVATE_OUTPUT')
  })

  it.each(['binding', 'team'] as const)('keeps cancellation ownership at the durable %s boundary', async (boundary) => {
    const { ctx, lead, invoke } = await workflow()
    await invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target })
    await invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 })
    const controller = new AbortController()
    if (boundary === 'binding') {
      ctx.on('domain/changed', change => {
        if (change.domain === 'agent_team_ultra_v1' && change.table === 'bindings'
          && change.operation === 'put' && (change.value as { provisioningPhase: string }).provisioningPhase === 'pending') {
          controller.abort(new Error('caller cancelled before Team acceptance'))
        }
      })
    } else {
      ctx.on('session/event', (session, event) => {
        if (session.id === lead.agent.id && event.type === 'team/member'
          && event.data.member.name === profile.employeeName && event.data.member.phase === 'active') {
          controller.abort(new Error('caller cancelled after Team acceptance'))
        }
      })
    }
    const starting = invoke('spawn', request, lead.agent.id, controller.signal)
    if (boundary === 'binding') {
      await expect(starting).rejects.toMatchObject({ code: 'gateway/cancelled' })
      expect(ctx.agentTeams.listMembers(lead.agent).map(member => member.name)).toEqual(['lead'])
      expect((await invoke('view') as DigitalEmployeeStudioView).instances).toMatchObject([
        { launchRequestId: request.launchRequestId, provisioningPhase: 'pending', profileRevision: 1 },
      ])
    } else {
      await expect(starting).resolves.toMatchObject({ ok: true, value: { provisioningPhase: 'active' } })
    }
    expect(controller.signal.aborted).toBe(true)
    const replayed = await invoke('spawn', request)
    expect(replayed).toMatchObject({ ok: true, value: { provisioningPhase: 'active', profileRevision: 1 } })
    expect(ctx.agentTeams.listMembers(lead.agent).map(member => member.name)).toEqual(['lead', profile.employeeName])
    expect((await invoke('view') as DigitalEmployeeStudioView).instances).toHaveLength(1)
  })

  it('drains a reserved launch before Fiber disposal and replays its original intent', async () => {
    const { ctx, fiber, lead, invoke } = await workflow()
    await invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target })
    await invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 })
    let disposing: Promise<void> | undefined
    const stop = ctx.on('domain/changed', change => {
      if (change.domain === 'agent_team_ultra_v1' && change.table === 'bindings'
        && change.operation === 'put' && (change.value as { provisioningPhase: string }).provisioningPhase === 'pending') {
        disposing ??= fiber.dispose()
      }
    })
    await expect(invoke('spawn', request)).rejects.toThrow('Agent Team Ultra service disposed')
    expect(disposing).toBeDefined()
    await disposing
    stop()
    expect(ctx.agentTeams.listMembers(lead.agent).map(member => member.name)).toEqual(['lead'])
    await ctx.plugin(DigitalEmployeeService)
    expect((await invoke('view') as DigitalEmployeeStudioView).instances).toMatchObject([
      { launchRequestId: request.launchRequestId, provisioningPhase: 'pending', profileRevision: 1 },
    ])
    await expect(invoke('spawn', request)).resolves.toMatchObject({ ok: true, value: { provisioningPhase: 'active', profileRevision: 1 } })
    expect(ctx.agentTeams.listMembers(lead.agent).map(member => member.name)).toEqual(['lead', profile.employeeName])
  })
})
