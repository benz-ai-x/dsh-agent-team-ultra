import { expect, it } from 'vitest'
import type { DigitalEmployeeStudioView } from '../../domain/src/types.ts'
import { queryWorkflow } from './fixtures/member-workflow.ts'

it.each([
  ['pre-query', ['team_members_list', 'team_tasks_list', 'team_tasks_get', 'team_task_update', 'team_wait']],
  ['pre-task', ['team_task_update', 'team_wait']],
  ['current', []],
])('does not infer installed tools from the catalog when cold-resuming a %s Codex thread', async (_version, removed) => {
  // Only the external product store models an older installed tool set; Host recovery is real.
  const first = await queryWorkflow(native => {
    native.onTurnStart = handle => {
      native.data.threads[handle].dynamicTools = native.data.threads[handle].dynamicTools
        .filter(tool => !removed.includes(tool.name))
    }
  })
  first.native.complete()
  await expect.poll(() => first.ctx.agentTeams.listMembers(first.lead.agent)
    .find(value => value.id === first.member.id)?.status).toBe('idle')
  const original = first.ctx.agentTeams.listMembers(first.lead.agent).find(value => value.id === first.member.id)!
  const installed = first.native.data.threads[first.handle].dynamicTools
  await first.ctx.fiber.dispose()

  const resumed = await queryWorkflow(undefined, 'json', { root: first.root, resumeLead: true })
  const view = await resumed.invoke('view') as DigitalEmployeeStudioView
  const member = view.teamMembers.find(value => value.memberId === resumed.member.id)!
  expect(member.runtimeCapabilities).not.toContain('full-collaboration')
  expect(member).toMatchObject({ collaborationStatus: 'unknown', runtimeAvailability: 'available' })
  expect(resumed.member.id).toBe(first.member.id)
  expect(resumed.handle).toBe(first.handle)
  expect(resumed.native.starts).toBe(0)
  expect(resumed.native.data.threads[resumed.handle].dynamicTools).toEqual(installed)
  expect(resumed.ctx.agentTeams.listMembers(resumed.lead.agent).find(value => value.id === resumed.member.id)?.externalRuntime)
    .toEqual(original.externalRuntime)
  await resumed.ctx.fiber.dispose()
  expect(resumed.native.live.size).toBe(0)
})

it('confirms collaboration for a newly created Codex thread through completion and same-generation reuse', async () => {
  const host = await queryWorkflow()
  const view = async () => (await host.invoke('view') as DigitalEmployeeStudioView).teamMembers
    .find(value => value.memberId === host.member.id)!
  expect((await view()).runtimeCapabilities).toContain('full-collaboration')
  expect(await view()).toMatchObject({ collaborationStatus: 'full' })
  host.native.complete()
  await expect.poll(() => host.ctx.agentTeams.listMembers(host.lead.agent)
    .find(value => value.id === host.member.id)?.status).toBe('idle')
  await host.ctx.agentTeams.sendMessage(host.lead.agent, {
    target: host.member.name, content: [{ type: 'text', text: 'Continue.' }], signal: new AbortController().signal,
  })
  expect(await view()).toMatchObject({ collaborationStatus: 'full' })
  expect(host.native.starts).toBe(1)
  await host.runtime.dispose()
  expect(host.native.live.size).toBe(0)
  expect(await view()).not.toMatchObject({ collaborationStatus: 'full' })
})
