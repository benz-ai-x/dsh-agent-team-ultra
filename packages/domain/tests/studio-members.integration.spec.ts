import {
  TeammateLaunchRequestId,
  TeammateRuntimeHandle,
  TeammateRuntimeTurnId,
  type TeammateRuntimeProvider,
} from '@deepseek-ai/dsh-experimental-agent-team'
import { expect, it, vi } from 'vitest'
import * as TeamTools from '@deepseek-ai/dsh-experimental-tool-agent-team'
import type { DigitalEmployeeStudioFrame, DigitalEmployeeStudioView } from '../src/types.ts'
import { profile, target, workflow } from './fixtures/host-workflow.ts'

it.each(['ordinary', 'profile-bound'] as const)('replaces %s DSH collaboration facts when the exact member Team tools unload and return', async binding => {
  const host = await workflow()
  host.adapter.stream = async function* (options) {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    await new Promise<void>(resolve => {
      if (options.signal.aborted) resolve()
      else options.signal.addEventListener('abort', () => resolve(), { once: true })
    })
  }
  const teamTools = host.ctx.plugin(TeamTools, { freshProvider: 'spawn', forkProvider: 'fork' })
  await teamTools
  if (binding === 'profile-bound') {
    await host.invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target })
    await host.invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 })
    await host.invoke('spawn', {
      profileId: profile.id, launchRequestId: '00000000-0000-4000-8000-000000000061', assignment: 'Review.',
    })
  } else {
    await host.ctx.agentTeams.spawnTeammate(host.lead.agent, {
      name: 'ordinary-dsh', description: 'Review source.', context: 'fresh', provider: 'spawn',
      prompt: [{ type: 'text', text: 'Review.' }], signal: new AbortController().signal,
    })
  }
  const member = host.ctx.agentTeams.listMembers(host.lead.agent).find(value => value.role === 'teammate')!
  const child = host.ctx.agents.get(member.id)!
  const toolNames = () => child.ctx.tools.schemas(child).map(tool => tool.name)
  const row = (view: DigitalEmployeeStudioView) => view.teamMembers.find(value => value.memberId === member.id)!
  expect(toolNames()).toContain('send_message')
  expect(toolNames()).toContain('team_task_update')
  expect(row(await host.invoke('view') as DigitalEmployeeStudioView).collaborationStatus).toBe('full')
  expect(row(await host.invoke('view') as DigitalEmployeeStudioView).binding).toBe(binding)

  const controller = new AbortController()
  const stream = await host.ctx.typertGateway.stream({
    namespace: 'digitalEmployees', method: 'watch', args: { agentId: host.lead.agent.id }, signal: controller.signal,
  }) as AsyncIterable<DigitalEmployeeStudioFrame>
  const iterator = stream[Symbol.asyncIterator]()
  try {
    expect((await iterator.next()).value?.type).toBe('baseline')
    await teamTools.dispose()
    expect(toolNames()).not.toContain('send_message')
    expect(toolNames()).not.toContain('team_task_update')
    const reduced = row(await host.invoke('view') as DigitalEmployeeStudioView)
    expect(reduced.collaborationStatus).toBe('limited')
    expect(reduced.runtimeCapabilities).not.toContain('full-collaboration')
    const replacement = await iterator.next()
    expect(replacement.value?.type).toBe('replace')
    expect(row(replacement.value!.value).collaborationStatus).toBe('limited')

    await host.ctx.plugin(TeamTools, { freshProvider: 'spawn', forkProvider: 'fork' })
    const restored = await iterator.next()
    expect(restored.value?.type).toBe('replace')
    expect(row(restored.value!.value).collaborationStatus).toBe('full')
    expect(row(restored.value!.value).runtimeCapabilities).toContain('full-collaboration')
  } finally {
    controller.abort()
    await iterator.return?.()
  }
})

function externalProvider(runtimeCapabilities: TeammateRuntimeProvider['runtimeCapabilities']): TeammateRuntimeProvider {
  return {
    id: 'native-reviewer',
    displayName: 'Native Reviewer',
    contextModes: ['fresh'],
    profileCapabilities: ['persona', 'mission'],
    runtimeCapabilities,
    create: async () => ({ nativeHandle: TeammateRuntimeHandle('review-session'), presence: 'idle' }),
    resume: async () => ({ nativeHandle: TeammateRuntimeHandle('review-session'), presence: 'idle' }),
    deliver: vi.fn(async () => ({ turnId: TeammateRuntimeTurnId('review-turn'), presence: 'idle' as const })),
    interrupt: () => ({ previousStatus: 'idle' }),
    evidence: async request => ({ nativeHandle: request.nativeHandle, items: [], complete: true }),
    dispose: async () => undefined,
  }
}

async function spawnOrdinary(
  host: Awaited<ReturnType<typeof workflow>>,
  runtimeCapabilities: readonly ('sandbox' | 'full-collaboration')[] = ['sandbox'],
) {
  return await host.ctx.agentTeams.spawnTeammate(host.lead.agent, {
    name: 'ordinary-native', description: 'Review source.', context: 'fresh',
    prompt: [{ type: 'text', text: 'Review.' }], signal: new AbortController().signal,
    runtime: {
      kind: 'external-agent', provider: 'native-reviewer',
      launchRequestId: TeammateLaunchRequestId('ordinary-capability-drift'),
      profile: { persona: 'Review.', mission: 'Report.', context: [], memory: [], toolPolicy: { mode: 'inherit', names: [] }, hooks: [] },
      requirements: { contextMode: 'fresh', profileCapabilities: ['persona', 'mission'], runtimeCapabilities },
    },
  })
}

it('does not expose a native member as active or available when its required full collaboration is refused', async () => {
  const host = await workflow()
  const native = externalProvider(['sandbox', 'full-collaboration'])
  const dispose = vi.fn(native.dispose)
  host.ctx.digitalEmployees.registerExternalRuntimeProvider({
    ...native,
    memberOperations: ['members.list', 'tasks.list', 'tasks.get', 'messages.send', 'tasks.update', 'wait'],
    bindMemberOperations() {},
    create: async request => ({ ...await native.create(request), memberOperations: [] }),
    dispose,
  })
  await host.ctx.digitalEmployees.whenRuntimeCatalogSettled()
  await expect(spawnOrdinary(host, ['full-collaboration'])).rejects.toMatchObject({
    code: 'TEAM_RUNTIME_CAPABILITY_MISMATCH',
  })
  expect(dispose).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'runtime', nativeHandle: TeammateRuntimeHandle('review-session'),
  }))
  await host.ctx.digitalEmployees.whenRuntimeCatalogSettled()
  const view = await host.invoke('view') as DigitalEmployeeStudioView
  const row = view.teamMembers.find(value => value.memberName === 'ordinary-native')!
  expect(row.provisioningPhase).not.toBe('active')
  expect(row.runtimeAvailability).not.toBe('available')
  expect(row.runtimeCapabilities).not.toContain('full-collaboration')
})

it('withdraws native availability on insufficient resume proof and restores collaboration for the same member', async () => {
  const host = await workflow()
  const native = externalProvider(['sandbox', 'full-collaboration'])
  const operations = ['members.list', 'tasks.list', 'tasks.get', 'messages.send', 'tasks.update', 'wait'] as const
  const capable = {
    ...native, memberOperations: operations, bindMemberOperations() {},
    create: async (request: Parameters<typeof native.create>[0]) => ({
      ...await native.create(request), memberOperations: operations,
    }),
    resume: async (request: Parameters<typeof native.resume>[0]) => {
      const result = await native.resume(request)
      return result === undefined ? undefined : { ...result, memberOperations: operations }
    },
  }
  const registration = host.ctx.digitalEmployees.registerExternalRuntimeProvider(capable)
  await host.ctx.digitalEmployees.whenRuntimeCatalogSettled()
  const { member } = await spawnOrdinary(host, ['full-collaboration'])
  const row = async () => (await host.invoke('view') as DigitalEmployeeStudioView).teamMembers
    .find(value => value.memberId === member.id)!
  expect(await row()).toMatchObject({ collaborationStatus: 'full', runtimeAvailability: 'available' })
  const dispose = vi.fn(native.dispose)
  await registration.replace({
    ...capable, dispose,
    resume: async request => {
      const result = await capable.resume(request)
      return result === undefined ? undefined : { ...result, memberOperations: ['messages.send'] }
    },
  })
  await expect.poll(() => dispose).toHaveBeenCalledWith(expect.objectContaining({ kind: 'runtime' }))
  await host.ctx.digitalEmployees.whenRuntimeCatalogSettled()
  expect((await row()).runtimeAvailability).not.toBe('available')
  expect((await row()).collaborationStatus).not.toBe('full')
  const delivery = await host.ctx.agentTeams.sendMessage(host.lead.agent, {
    target: member.name, content: [{ type: 'text', text: 'Continue.' }], signal: new AbortController().signal,
  })
  expect(delivery.status).toBe('queued')
  expect(native.deliver).not.toHaveBeenCalled()
  await registration()
  host.ctx.digitalEmployees.registerExternalRuntimeProvider(capable)
  await host.ctx.digitalEmployees.whenRuntimeCatalogSettled()
  await expect.poll(() => native.deliver).toHaveBeenCalledOnce()
  expect(await row()).toMatchObject({ collaborationStatus: 'full', runtimeAvailability: 'available' })
  expect(host.ctx.agentTeams.listMembers(host.lead.agent).find(value => value.id === member.id)?.externalRuntime)
    .toEqual(member.externalRuntime)
})

it.each([
  ['runtime', { runtimeCapabilities: [] }],
  ['profile', { profileCapabilities: ['persona'] }],
  ['context', { contextModes: ['fork'] }],
] as const)('reports an ordinary external member mismatch after its provider loses a retained %s requirement', async (_kind, capabilities) => {
  const host = await workflow()
  const registration = host.ctx.digitalEmployees.registerExternalRuntimeProvider(externalProvider(['sandbox']))
  await host.ctx.digitalEmployees.whenRuntimeCatalogSettled()
  const { member } = await spawnOrdinary(host)
  const view = async () => (await host.invoke('view') as DigitalEmployeeStudioView).teamMembers
    .find(value => value.memberId === member.id)
  expect(await view()).toMatchObject({ binding: 'ordinary', provisioningPhase: 'active', runtimeAvailability: 'available' })

  const reduced = { ...externalProvider(['sandbox']), ...capabilities }
  await registration.replace(reduced)
  const delivery = await host.ctx.agentTeams.sendMessage(host.lead.agent, {
    target: member.name, content: [{ type: 'text', text: 'Continue the review.' }], signal: new AbortController().signal,
  })
  expect(delivery.status).toBe('queued')
  expect(reduced.deliver).not.toHaveBeenCalled()
  expect(host.ctx.agentTeams.listMembers(host.lead.agent).find(value => value.id === member.id)?.externalRuntime)
    .toEqual(member.externalRuntime)
  expect(await view()).toMatchObject({
    provisioningPhase: 'active', runtimeAvailability: 'capability-mismatch', runtimePresence: 'inactive',
  })

  const restored = externalProvider(['sandbox'])
  await registration.replace(restored)
  await expect.poll(() => restored.deliver).toHaveBeenCalled()
  expect(await view()).toMatchObject({
    provisioningPhase: 'active', runtimeAvailability: 'available', runtimePresence: 'idle',
  })
  expect(host.ctx.agentTeams.listMembers(host.lead.agent).find(value => value.id === member.id)?.externalRuntime)
    .toEqual(member.externalRuntime)
})

it.each([
  ['limited', ['messages.send']],
  ['limited', []],
  ['unknown', undefined],
] as const)('reports %s collaboration without promoting incomplete per-member proof from a full catalog', async (status, operations) => {
  const host = await workflow()
  const native = externalProvider(['sandbox', 'full-collaboration'])
  host.ctx.digitalEmployees.registerExternalRuntimeProvider({
    ...native,
    memberOperations: ['members.list', 'tasks.list', 'tasks.get', 'messages.send', 'tasks.update', 'wait'],
    bindMemberOperations() {},
    create: async request => ({
      ...await native.create(request),
      ...(operations === undefined ? {} : { memberOperations: operations }),
    }),
  })
  await host.ctx.digitalEmployees.whenRuntimeCatalogSettled()
  const { member } = await spawnOrdinary(host)
  const view = await host.invoke('view') as DigitalEmployeeStudioView
  expect(view.runtimeCatalog.backends.find(value => value.provider === 'native-reviewer')?.runtimeCapabilities)
    .toContain('full-collaboration')
  const row = view.teamMembers.find(value => value.memberId === member.id)!
  expect(row.collaborationStatus).toBe(status)
  expect(row.runtimeCapabilities).not.toContain('full-collaboration')
  expect(row.runtimeAvailability).toBe('available')
})
