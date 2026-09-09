import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { expect, it } from 'vitest'
import type { DigitalEmployeeStudioView, SpawnDigitalEmployeeResult } from '../src/types.ts'
import { profile, target, workflow } from './fixtures/host-workflow.ts'

it('cold-resumes the same fixed-route employee through the v2 Session codec', async () => {
  const first = await workflow('json')
  first.lead.agent.followup(createUserMessage({
    content: [{ type: 'text', text: 'Start the upgraded Team.' }],
    source: { kind: 'plugin', plugin: 'phase-c-team-test' },
  }))
  await first.lead.agent.whenIdle()
  await expect(first.invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target }))
    .resolves.toMatchObject({ ok: true })
  await expect(first.invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 }))
    .resolves.toMatchObject({ ok: true })
  const launched = await first.invoke('spawn', {
    launchRequestId: '39393939-3939-4939-8939-393939393939',
    profileId: profile.id, assignment: 'Retain the selected route on the new Session codec.',
  }) as SpawnDigitalEmployeeResult
  if (!launched.ok || !launched.value.memberId) throw new Error('fixed-route employee was not launched')
  const memberId = SessionId(launched.value.memberId)
  await expect.poll(() => first.ctx.agents.get(memberId)).toBeUndefined()
  await first.ctx.sessionPersistence.flush()
  await expect(first.ctx.sessionPersistence.stat(first.lead.agent.id))
    .resolves.toMatchObject({ header: { version: 2, id: first.lead.agent.id } })
  await expect(first.ctx.sessionPersistence.stat(memberId))
    .resolves.toMatchObject({ header: { version: 2, id: memberId } })
  await first.ctx.fiber.dispose()

  const recovered = await workflow('json', { root: first.root, resumeLead: true })
  const view = await recovered.invoke('view') as DigitalEmployeeStudioView
  expect(view.instances).toMatchObject([{
    memberId, profileRevision: 1, runtimeTarget: target, resolvedRuntimeTarget: target,
  }])
  await expect(recovered.ctx.agentTeams.sendMessage(recovered.lead.agent, {
    target: profile.employeeName,
    content: [{ type: 'text', text: 'Continue on the original fixed route after cold recovery.' }],
    signal: new AbortController().signal,
  })).resolves.toMatchObject({ status: 'accepted' })
  await expect.poll(() => recovered.ctx.agents.get(memberId)).toBeUndefined()
  const final = await recovered.invoke('view') as DigitalEmployeeStudioView
  expect(final.instances).toMatchObject([{ memberId, profileRevision: 1, resolvedRuntimeTarget: target }])
  expect(final.runs).toHaveLength(2)
})
