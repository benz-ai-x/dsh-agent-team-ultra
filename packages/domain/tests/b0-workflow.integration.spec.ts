import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import { digitalEmployeeBindingKey, profileRevisionKey } from '../src/storage.ts'
import { describe, expect, it, vi } from 'vitest'
import type { DigitalEmployeeStudioView, SpawnDigitalEmployeeResult } from '../src/types.ts'
import { cleanups, profile, workflow, DigitalEmployeeService } from './fixtures/host-workflow.ts'

async function activated(fixture: Awaited<ReturnType<typeof workflow>>) {
  expect(await fixture.invoke('save', { expectedHeadRevision: null, profile })).toMatchObject({ ok: true })
  expect(await fixture.invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 })).toMatchObject({ ok: true })
}

describe('official DSH-only B0 through generated Remote and real storage/Team', () => {
  it('keeps immutable candidates, explicit activation, Head CAS, rollback and archive across service replacement', async () => {
    const { ctx, lead, fiber, invoke } = await workflow()
    expect(await invoke('save', { expectedHeadRevision: null, profile })).toMatchObject({ ok: true, value: { head: { headRevision: 1 } } })
    expect((await invoke('view') as DigitalEmployeeStudioView).profiles[0]?.head.activeRevision).toBeUndefined()
    expect(await invoke('spawn', { profileId: profile.id, launchRequestId: randomUUID() })).toMatchObject({ ok: false, error: { code: 'profile-not-active' } })
    expect(await invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 })).toMatchObject({ ok: true })
    expect(await invoke('save', { expectedHeadRevision: 1, profile: { ...profile, mission: 'stale edit' } })).toMatchObject({ ok: false, error: { code: 'profile-conflict' } })
    expect(await invoke('save', { expectedHeadRevision: 2, profile: { ...profile, mission: 'second' } })).toMatchObject({ ok: true, value: { revision: { revision: 2 } } })
    expect(await invoke('revision', { profileId: profile.id, revision: 1 })).toMatchObject({ ok: true, value: { revision: { profile: { mission: profile.mission } } } })
    expect(await invoke('activate', { profileId: profile.id, revision: 2, expectedHeadRevision: 3 })).toMatchObject({ ok: true })
    expect(await invoke('rollback', { profileId: profile.id, revision: 1, expectedHeadRevision: 4 })).toMatchObject({ ok: true })
    expect(await invoke('archive', { profileId: profile.id, expectedHeadRevision: 5 })).toMatchObject({ ok: true })
    expect(await invoke('spawn', { profileId: profile.id, launchRequestId: randomUUID() })).toMatchObject({ ok: false, error: { code: 'profile-archived' } })
    await fiber.dispose()
    await ctx.plugin(DigitalEmployeeService)
    expect(ctx.digitalEmployees.studioView(lead.agent).profiles[0]?.head).toMatchObject({ headRevision: 6, activeRevision: 1, latestRevision: 2 })
    expect(await ctx.digitalEmployees.restoreProfile(lead.agent, { profileId: profile.id, expectedHeadRevision: 6 })).toMatchObject({ ok: true })
  })

  it('refuses removed runtime/gate fields, unavailable tools and forged/retired callers', async () => {
    const { ctx, lead, invoke } = await workflow()
    for (const extra of [{ runtimeTarget: { kind: 'dsh-model' } }, { requiredEvalSet: {} }]) {
      expect(await invoke('save', { expectedHeadRevision: null, profile, ...extra })).toMatchObject({ ok: false, error: { code: 'profile-invalid' } })
    }
    expect(await invoke('save', { expectedHeadRevision: null, profile: { ...profile, toolPolicy: { mode: 'allow', names: ['not-installed'] } } })).toMatchObject({ ok: false, error: { code: 'tool-unavailable' } })
    expect(await ctx.digitalEmployees.saveProfile({ id: lead.agent.id } as Agent, { expectedHeadRevision: null, profile })).toMatchObject({ ok: false, error: { code: 'team-rejected' } })
    await lead.dispose()
    expect(await ctx.digitalEmployees.saveProfile(lead.agent, { expectedHeadRevision: null, profile })).toMatchObject({ ok: false, error: { code: 'team-rejected' } })
    expect(ctx.digitalEmployees).not.toHaveProperty('runEvidence')
    expect(ctx.digitalEmployees).not.toHaveProperty('registerExternalRuntimeProvider')
    expect(ctx.digitalEmployees).not.toHaveProperty('watch')
  })

  it.each(['missing', 'malformed', 'future'] as const)('refuses %s published history before reopening and recovers only after the original Revision is restored', async mode => {
    const { ctx, lead, fiber, invoke, root } = await workflow()
    expect(await invoke('save', { expectedHeadRevision: null, profile })).toMatchObject({ ok: true })
    expect(await invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 })).toMatchObject({ ok: true })
    expect(await invoke('save', { expectedHeadRevision: 2, profile: { ...profile, mission: 'second' } })).toMatchObject({ ok: true })
    expect(await invoke('save', { expectedHeadRevision: 3, profile: { ...profile, mission: 'third' } })).toMatchObject({ ok: true })
    await fiber.dispose()
    const path = join(root, 'storage/agent_team_ultra_b0/profile_revisions', profileRevisionKey(profile.id, 2) + '.json')
    const original = await readFile(path)
    const altered = mode === 'future' ? JSON.stringify({ ...JSON.parse(original.toString()), version: 2 }) : '{broken'
    if (mode === 'missing') await rm(path)
    else await writeFile(path, altered)
    const refused = ctx.plugin(DigitalEmployeeService)
    await expect(Promise.resolve(refused).then(() => 'admitted')).rejects.toThrow(mode === 'missing' ? /retained Revision history/ : /B0_DATA/)
    expect(ctx.digitalEmployees).toBeUndefined()
    await refused.dispose()
    if (mode === 'missing') await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
    else expect(await readFile(path, 'utf8')).toBe(altered)
    await writeFile(path, original)
    await ctx.plugin(DigitalEmployeeService)
    expect(ctx.digitalEmployees.studioView(lead.agent).profiles[0]?.history.map(row => row.revision)).toEqual([3, 2, 1])
    expect(await ctx.digitalEmployees.saveProfile(lead.agent, {
      expectedHeadRevision: 4, profile: { ...profile, mission: 'fourth' },
    })).toMatchObject({ ok: true, value: { revision: { revision: 4 } } })
  })

  it.each(['malformed', 'future'] as const)('refuses a cold %s Head without losing the Profile or resetting its CAS', async mode => {
    const root = await mkdtemp(join(tmpdir(), 'ultra-b0-head-admission-'))
    cleanups.push(() => rm(root, { recursive: true, force: true }))
    const first = await workflow({ root })
    await activated(first)
    await first.ctx.fiber.dispose()
    const path = join(root, 'storage/agent_team_ultra_b0/profile_heads', profile.id + '.json')
    const original = await readFile(path)
    const altered = mode === 'future' ? JSON.stringify({ ...JSON.parse(original.toString()), version: 2 }) : '{broken'
    await writeFile(path, altered)
    await expect(workflow({ root })).rejects.toThrow(/B0_DATA/)
    expect(await readFile(path, 'utf8')).toBe(altered)
    await writeFile(path, original)
    const second = await workflow({ root })
    expect(second.ctx.digitalEmployees.studioView(second.lead.agent).profiles[0]?.head).toMatchObject({
      profileId: profile.id, headRevision: 2, activeRevision: 1,
    })
    expect(await second.invoke('save', { expectedHeadRevision: null, profile })).toMatchObject({ ok: false, error: { code: 'profile-conflict' } })
  })

  it.each(['malformed', 'future'] as const)('refuses a %s Head on Loader re-enable without replacing the data owner or resetting CAS', async mode => {
    const fixture = await workflow()
    await activated(fixture)
    const { ctx, lead, invoke, root } = fixture
    const dataFiber = ctx.loader.resolve('agent-team-ultra-data')!.fiber
    const path = join(root, 'storage/agent_team_ultra_b0/profile_heads', profile.id + '.json')
    const original = await readFile(path)
    const altered = mode === 'future' ? JSON.stringify({ ...JSON.parse(original.toString()), version: 2 }) : '{broken'
    await ctx.loader.update('agent-team-ultra', { disabled: true })
    expect(ctx.digitalEmployees).toBeUndefined()
    await writeFile(path, altered)
    await expect(ctx.loader.update('agent-team-ultra', { disabled: false })).rejects.toThrow(/B0_DATA/)
    expect(ctx.loader.resolve('agent-team-ultra-data')!.fiber).toBe(dataFiber)
    expect(ctx.digitalEmployees).toBeUndefined()
    expect(await readFile(path, 'utf8')).toBe(altered)
    await writeFile(path, original)
    await ctx.loader.update('agent-team-ultra', { disabled: false })
    expect(ctx.digitalEmployees.studioView(lead.agent).profiles[0]?.head).toMatchObject({
      headRevision: 2, activeRevision: 1, latestRevision: 1,
    })
    expect(await invoke('save', { expectedHeadRevision: null, profile })).toMatchObject({ ok: false, error: { code: 'profile-conflict' } })
    expect(await invoke('save', { expectedHeadRevision: 2, profile: { ...profile, mission: 'after recovery' } })).toMatchObject({
      ok: true, value: { head: { headRevision: 3, latestRevision: 2, activeRevision: 1 } },
    })
  })

  it('withdraws data admission with its Loader owner and restores the same Profile on re-enable', async () => {
    const fixture = await workflow()
    await activated(fixture)
    const { ctx, lead, invoke } = fixture
    const previous = ctx.digitalEmployees
    expect(ctx.ultraBaselineData).toBeDefined()
    await ctx.loader.update('agent-team-ultra-data', { disabled: true })
    expect(ctx.ultraBaselineData).toBeUndefined()
    expect(ctx.digitalEmployees).toBeUndefined()
    expect(await previous.saveProfile(lead.agent, { expectedHeadRevision: 2, profile })).toMatchObject({
      ok: false, error: { code: 'service-disposed' },
    })
    await ctx.loader.update('agent-team-ultra-data', { disabled: false })
    expect(ctx.ultraBaselineData).toBeDefined()
    await vi.waitFor(async () => {
      expect((await invoke('view') as DigitalEmployeeStudioView).profiles[0]?.head).toMatchObject({
        headRevision: 2, activeRevision: 1, latestRevision: 1,
      })
    })
    expect(await invoke('save', { expectedHeadRevision: null, profile })).toMatchObject({
      ok: false, error: { code: 'profile-conflict' },
    })
  })

  it('reuses an unpublished immutable Revision after a cold Head-publication interruption', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ultra-b0-orphan-revision-'))
    cleanups.push(() => rm(root, { recursive: true, force: true }))
    const first = await workflow({ root })
    await activated(first)
    const path = join(root, 'storage/agent_team_ultra_b0/profile_heads', profile.id + '.json')
    const previous = await readFile(path)
    const next = { ...profile, mission: 'unpublished candidate' }
    expect(await first.invoke('save', { expectedHeadRevision: 2, profile: next })).toMatchObject({ ok: true })
    await first.ctx.fiber.dispose()
    // Replay the durable cut after Revision r2, before publishing its Head.
    await writeFile(path, previous)
    const second = await workflow({ root })
    expect(second.ctx.digitalEmployees.studioView(second.lead.agent).profiles[0]?.history.map(row => row.revision)).toEqual([1])
    expect(await second.invoke('save', { expectedHeadRevision: 2, profile: next })).toMatchObject({
      ok: true, value: { head: { latestRevision: 2, headRevision: 3 }, revision: { revision: 2 } },
    })
  })

  it('coalesces retry UUIDs, freezes the active Profile, composes only its child and preserves the official suffix', async () => {
    const fixture = await workflow()
    const { ctx, lead, adapter, invoke, fiber } = fixture
    await activated(fixture)
    const gate = Promise.withResolvers<void>()
    adapter.beforeStream = () => gate.promise
    cleanups.push(async () => { gate.resolve() })
    const request = { profileId: profile.id, launchRequestId: randomUUID(), assignment: 'check once' }
    const [first, retry] = await Promise.all([invoke('spawn', request), invoke('spawn', request)]) as SpawnDigitalEmployeeResult[]
    expect(first).toMatchObject({ ok: true, value: { provisioningPhase: 'active', profileRevision: 1 } })
    expect(retry).toEqual(first)
    if (!first!.ok) throw new Error('launch failed')
    const child = ctx.agents.get(SessionId(first!.value.memberId!))!
    expect(child).toBeDefined()
    expect(ctx.agentTeams.listMembers(lead.agent).filter(member => member.name === profile.employeeName)).toHaveLength(1)
    expect(await invoke('spawn', { ...request, assignment: 'different input' })).toMatchObject({ ok: false, error: { code: 'launch-request-conflict' } })
    expect(await invoke('spawn', { ...request, launchRequestId: randomUUID() })).toMatchObject({ ok: false, error: { code: 'profile-in-use' } })
    expect(await ctx.digitalEmployees.saveProfile(child, { expectedHeadRevision: null, profile })).toMatchObject({ ok: false, error: { code: 'team-lead-required' } })
    await vi.waitFor(() => expect(adapter.requests.length).toBeGreaterThan(0))
    const prompt = JSON.stringify(adapter.requests[0])
    expect(prompt).toContain(profile.persona)
    expect(prompt).toContain('OFFICIAL_WORKSPACE_SUFFIX')
    expect(await invoke('save', { expectedHeadRevision: 2, profile: { ...profile, persona: 'LATER_PERSONA' } })).toMatchObject({ ok: true })
    expect(await invoke('activate', { profileId: profile.id, revision: 2, expectedHeadRevision: 3 })).toMatchObject({ ok: true })
    expect(await invoke('spawn', request)).toMatchObject({ ok: true, value: { memberId: child.id, profileRevision: 1 } })
    await fiber.dispose()
    await expect(ctx.digitalEmployees?.remoteView(lead.agent)).toBeUndefined()
    await ctx.plugin(DigitalEmployeeService)
    expect(await ctx.digitalEmployees.spawnProfile(lead.agent, request, new AbortController().signal)).toMatchObject({ ok: true, value: { memberId: child.id, profileRevision: 1 } })
    gate.resolve()
    await child.whenIdle()
  })

  it('honors cancellation before any reservation and refuses post-disposal admission', async () => {
    const fixture = await workflow()
    await activated(fixture)
    const { ctx, lead, fiber } = fixture
    const service = ctx.digitalEmployees
    const signal = AbortSignal.abort(new Error('cancelled'))
    await expect(service.spawnProfile(lead.agent, { profileId: profile.id, launchRequestId: randomUUID() }, signal)).rejects.toThrow('cancelled')
    expect(service.studioView(lead.agent).instances).toEqual([])
    await fiber.dispose()
    expect(await service.saveProfile(lead.agent, { expectedHeadRevision: 2, profile })).toMatchObject({ ok: false, error: { code: 'service-disposed' } })
  })

  it('snapshots public Host input before queued CAS and launch decisions', async () => {
    const { ctx, lead } = await workflow()
    const saveInput = { expectedHeadRevision: null as number | null, profile: { ...profile } }
    const saved = ctx.digitalEmployees.saveProfile(lead.agent, saveInput)
    saveInput.expectedHeadRevision = 999
    saveInput.profile.mission = 'MUTATED_AFTER_ADMISSION'
    expect(await saved).toMatchObject({ ok: true, value: { revision: { profile: { mission: profile.mission } } } })
    const activeInput = { profileId: profile.id, revision: 1, expectedHeadRevision: 1 }
    const active = ctx.digitalEmployees.activateProfile(lead.agent, activeInput)
    activeInput.profileId = 'different-profile'
    activeInput.expectedHeadRevision = 999
    expect(await active).toMatchObject({ ok: true })
    const archiveInput = { profileId: profile.id, expectedHeadRevision: 2 }
    const archived = ctx.digitalEmployees.archiveProfile(lead.agent, archiveInput)
    archiveInput.profileId = 'different-profile'
    expect(await archived).toMatchObject({ ok: true })
    expect(await ctx.digitalEmployees.restoreProfile(lead.agent, { profileId: profile.id, expectedHeadRevision: 3 })).toMatchObject({ ok: true })
    const launchInput = { profileId: profile.id, launchRequestId: randomUUID(), assignment: 'ORIGINAL_ASSIGNMENT' }
    const retryInput = { ...launchInput }
    const launched = ctx.digitalEmployees.spawnProfile(lead.agent, launchInput, new AbortController().signal)
    launchInput.launchRequestId = randomUUID()
    launchInput.profileId = 'different-profile'
    launchInput.assignment = 'MUTATED_AFTER_ADMISSION'
    const first = await launched
    expect(first).toMatchObject({ ok: true, value: { profileId: profile.id } })
    const retry = await ctx.digitalEmployees.spawnProfile(lead.agent, retryInput, new AbortController().signal)
    if (!first.ok || !retry.ok) throw new Error('launch failed')
    expect(retry.value.memberId).toBe(first.value.memberId)
  })

  it('does not adopt an ordinary same-name teammate', async () => {
    const fixture = await workflow()
    await activated(fixture)
    const { ctx, lead, invoke } = fixture
    await ctx.agentTeams.spawnTeammate(lead.agent, { name: profile.employeeName, description: 'ordinary', provider: 'spawn', context: 'fresh', prompt: [{ type: 'text', text: 'ordinary task' }], signal: new AbortController().signal })
    expect(await invoke('spawn', { profileId: profile.id, launchRequestId: randomUUID() })).toMatchObject({ ok: false, error: { code: 'profile-in-use' } })
    expect((await invoke('view') as DigitalEmployeeStudioView).instances).toEqual([])
  })

  it.each(['active', 'pending', 'unproven'] as const)('recovers a cold %s Binding only with canonical child proof, never a replacement', async phase => {
    const root = await mkdtemp(join(tmpdir(), 'ultra-b0-cold-'))
    cleanups.push(() => rm(root, { recursive: true, force: true }))
    const first = await workflow({ root })
    await activated(first)
    const request = { profileId: profile.id, launchRequestId: randomUUID(), assignment: 'cold proof' }
    const result = await first.invoke('spawn', request) as SpawnDigitalEmployeeResult
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('launch failed')
    const id = result.value.memberId
    await first.ctx.agents.get(SessionId(id!))?.whenIdle()
    await first.ctx.fiber.dispose()
    if (phase !== 'active') {
      const path = join(root, 'storage/agent_team_ultra_b0/bindings', digitalEmployeeBindingKey(first.lead.agent.id, profile.employeeName) + '.json')
      const document = JSON.parse(await readFile(path, 'utf8'))
      document.record.provisioningPhase = 'pending'
      delete document.record.memberId
      if (phase === 'unproven') document.record.initialPromptFingerprint = 'a'.repeat(64)
      await writeFile(path, JSON.stringify(document))
    }
    const second = await workflow({ root, resumeLead: true })
    expect(await second.invoke('spawn', request)).toMatchObject({ ok: true, value: phase === 'unproven'
      ? { provisioningPhase: 'pending', profileRevision: 1 }
      : { memberId: id, profileRevision: 1, provisioningPhase: 'active' } })
    if (phase === 'unproven') expect((await second.invoke('view') as DigitalEmployeeStudioView).instances[0]?.memberId).toBeUndefined()
    expect(second.ctx.agentTeams.listMembers(second.lead.agent).filter(member => member.role === 'teammate')).toHaveLength(1)
  })

  it('applies declarative hooks, memory and inherited-tool policy only to the bound child, then drains and revokes them', async () => {
    const { ctx, lead, observer, adapter, fiber, invoke } = await workflow()
    for (const name of ['write', 'report', 'confirm']) ctx.tools.register(defineContentToolFixture({ name, description: name, parameters: {}, async execute() { return [] } }))
    const layered = { ...profile,
      toolPolicy: { mode: 'deny', names: ['write'] },
      context: [{ id: 'c', title: 'Context', content: 'BOUND_CONTEXT', enabled: true }],
      memory: [{ id: 'm', title: 'Memory', content: 'BOUND_MEMORY', enabled: true }],
      hooks: [
        { id: 'start', point: 'session-start', effect: 'context', text: 'BOUND_START', enabled: true },
        { id: 'step', point: 'before-step', effect: 'context', text: 'BOUND_STEP', enabled: true },
        { id: 'deny', point: 'before-tool', effect: 'deny', matcher: 'read', text: 'BOUND_DENIAL', enabled: true },
        { id: 'ask', point: 'before-tool', effect: 'ask', matcher: 'confirm', text: 'BOUND_ASK', enabled: true },
        { id: 'after', point: 'after-tool', effect: 'context', matcher: 'report', text: 'BOUND_AFTER', enabled: true },
      ],
    }
    expect(await invoke('save', { expectedHeadRevision: null, profile: layered })).toMatchObject({ ok: true })
    expect(await invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 })).toMatchObject({ ok: true })
    const gate = Promise.withResolvers<void>()
    adapter.beforeStream = () => gate.promise
    cleanups.push(async () => { gate.resolve() })
    const result = await invoke('spawn', { profileId: profile.id, launchRequestId: randomUUID() }) as SpawnDigitalEmployeeResult
    if (!result.ok) throw new Error(result.error.message)
    const child = ctx.agents.get(SessionId(result.value.memberId!))!
    expect(child).toBeDefined()
    await vi.waitFor(() => expect(adapter.requests.length).toBeGreaterThan(0))
    const prompt = JSON.stringify(adapter.requests[0])
    for (const text of ['BOUND_CONTEXT', 'BOUND_MEMORY', 'BOUND_START', 'BOUND_STEP', 'OFFICIAL_WORKSPACE_SUFFIX']) expect(prompt).toContain(text)
    expect(ctx.tools.schemas(child).map(tool => tool.name)).not.toContain('write')
    expect(ctx.tools.schemas(lead.agent).map(tool => tool.name)).toContain('write')
    const call = (agent: Agent, name: string) => ctx.tools.execute({ agent, name, arguments: {}, callId: ToolCallId(randomUUID()), signal: new AbortController().signal })
    expect(await call(child, 'read')).toMatchObject({ isError: true, error: { message: 'BOUND_DENIAL' } })
    expect(await call(lead.agent, 'read')).toMatchObject({ isError: false })
    expect(await call(child, 'confirm')).toMatchObject({ isError: true }) // official delegated scope cannot approve
    expect(JSON.stringify(await call(child, 'report'))).toContain('BOUND_AFTER')
    expect(JSON.stringify(await call(observer.agent, 'report'))).not.toContain('BOUND_AFTER')
    expect(JSON.stringify(await ctx.systemPrompt.assemble({ scope: lead.agent }))).not.toContain('BOUND_MEMORY')
    await fiber.dispose()
    expect(ctx.agents.get(child.id)).toBeUndefined()
    expect(ctx.agents.get(lead.agent.id)).toBe(lead.agent)
    expect(ctx.tools.schemas(lead.agent).map(tool => tool.name)).toContain('write')
    expect(JSON.stringify(await ctx.systemPrompt.assemble({ scope: child }))).not.toContain('BOUND_MEMORY')
  })

  it('uses official fork context and continues the same inactive child through official messaging', async () => {
    const { ctx, lead, adapter, invoke } = await workflow()
    lead.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'PARENT_COMPLETED_CONTEXT' }] }))
    await lead.agent.whenIdle()
    expect(await invoke('save', { expectedHeadRevision: null, profile: { ...profile, contextMode: 'fork', continuationProvider: 'fork' } })).toMatchObject({ ok: true })
    expect(await invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 })).toMatchObject({ ok: true })
    const result = await invoke('spawn', { profileId: profile.id, launchRequestId: randomUUID() }) as SpawnDigitalEmployeeResult
    if (!result.ok) throw new Error(result.error.message)
    const id = SessionId(result.value.memberId!)
    await vi.waitFor(() => expect(adapter.requests.length).toBeGreaterThanOrEqual(2))
    expect(JSON.stringify(adapter.requests[1])).toContain('PARENT_COMPLETED_CONTEXT')
    await ctx.agents.get(id)?.whenIdle()
    await ctx.subagents.sendMessage(lead.agent, id, [{ type: 'text', text: 'FOLLOWUP_SAME_CHILD' }], { signal: new AbortController().signal })
    await vi.waitFor(() => expect(adapter.requests.some(request => request.sessionId === id && JSON.stringify(request).includes('FOLLOWUP_SAME_CHILD'))).toBe(true))
    expect((await invoke('view') as DigitalEmployeeStudioView).instances[0]?.memberId).toBe(id)
    expect(ctx.agentTeams.listMembers(lead.agent).filter(member => member.role === 'teammate')).toHaveLength(1)
  })
})
