import {
  TeammateLaunchRequestId,
  TeammateRuntimeHandle,
  TeammateRuntimeTurnId,
  type TeammateRuntimeProvider,
} from '@deepseek-ai/dsh-experimental-agent-team'
import { expect, it, vi } from 'vitest'
import type { DigitalEmployeeStudioView } from '../src/types.ts'
import { workflow } from './fixtures/host-workflow.ts'

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

async function spawnOrdinary(host: Awaited<ReturnType<typeof workflow>>) {
  return await host.ctx.agentTeams.spawnTeammate(host.lead.agent, {
    name: 'ordinary-native', description: 'Review source.', context: 'fresh',
    prompt: [{ type: 'text', text: 'Review.' }], signal: new AbortController().signal,
    runtime: {
      kind: 'external-agent', provider: 'native-reviewer',
      launchRequestId: TeammateLaunchRequestId('ordinary-capability-drift'),
      profile: { persona: 'Review.', mission: 'Report.', context: [], memory: [], toolPolicy: { mode: 'inherit', names: [] }, hooks: [] },
      requirements: { contextMode: 'fresh', profileCapabilities: ['persona', 'mission'], runtimeCapabilities: ['sandbox'] },
    },
  })
}

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
