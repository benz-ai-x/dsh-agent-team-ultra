import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import type { DigitalEmployeeStudioView, SpawnDigitalEmployeeResult } from '../src/types.ts'
import { profile, target, workflow } from './fixtures/host-workflow.ts'

describe('Run inspection across Host generations', () => {
  it('refuses a cold Run response when its exact Lead retires during the read', async () => {
    const { ctx, lead, invoke } = await workflow()
    await invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target })
    await invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 })
    const launched = await invoke('spawn', {
      launchRequestId: '39383838-3838-4838-8838-383838383838',
      profileId: profile.id,
      assignment: 'Retain evidence for the exact live Lead.',
    }) as SpawnDigitalEmployeeResult
    if (!launched.ok || launched.value.memberId === undefined) throw new Error('employee was not launched')
    await expect.poll(() => ctx.agents.get(SessionId(launched.value.memberId!))).toBeUndefined()
    const before = await invoke('view') as DigitalEmployeeStudioView
    expect(before.runs).toMatchObject([{ terminal: 'completed' }])
    const runId = before.runs[0]!.runId
    const reading = ctx.digitalEmployees.runEvidence(lead.agent, { runId }, new AbortController().signal)
    await lead.dispose()
    await expect(reading).resolves.toMatchObject({ ok: false, error: { code: 'team-rejected' } })
    await ctx.agents.resume({ resumeSessionId: lead.agent.id })
    await expect(invoke('run', { runId })).resolves.toMatchObject({ ok: true, value: { run: { runId } } })
  })

  it.each([
    ['json', 'run'], ['sqlite', 'run'],
    ['json', 'view'], ['sqlite', 'view'],
    ['json', 'watch'], ['sqlite', 'watch'],
  ] as const)(
    'settles an admitted cold %s %s read before Host disposal finishes', async (backend, method) => {
    const first = await workflow(backend)
    first.lead.agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'Prepare the durable Team.' }],
      source: { kind: 'plugin', plugin: 'run-lifecycle-test' },
    }))
    await first.lead.agent.whenIdle()
    await first.invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target })
    await first.invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 })
    const launched = await first.invoke('spawn', {
      launchRequestId: '38383838-3838-4838-8838-383838383838',
      profileId: profile.id,
      assignment: 'Produce durable Run evidence.',
    }) as SpawnDigitalEmployeeResult
    if (!launched.ok || launched.value.memberId === undefined) throw new Error('employee was not launched')
    await first.ctx.agents.get(SessionId(launched.value.memberId))?.whenIdle()
    const before = await first.invoke('view') as DigitalEmployeeStudioView
    expect(before.runs).toMatchObject([{ terminal: 'completed' }])
    await first.ctx.fiber.dispose()

    const recovered = await workflow(backend, { root: first.root, resumeLead: true })
    expect(recovered.ctx.agents.get(SessionId(launched.value.memberId))).toBeUndefined()
    const runId = before.runs[0]!.runId
    await expect(recovered.invoke('run', { runId })).resolves.toMatchObject({ ok: true })

    // Enter the public Host seam synchronously so disposal races an admitted
    // real Session read, not Remote transport dispatch or a mocked storage handle.
    const watch = method === 'watch'
      ? recovered.ctx.digitalEmployees.watch(recovered.lead.agent, new AbortController().signal)[Symbol.asyncIterator]()
      : undefined
    const operation = method === 'run'
      ? recovered.ctx.digitalEmployees.runEvidence(recovered.lead.agent, { runId }, new AbortController().signal)
      : watch === undefined ? recovered.ctx.digitalEmployees.remoteView(recovered.lead.agent) : watch.next()
    const reading = operation.then(
      result => ({ kind: 'read' as const, result }),
      error => ({ kind: 'cancelled' as const, error }),
    )
    if (method !== 'run') await recovered.invoke('revision', { profileId: profile.id, revision: 1 })
    const disposing = recovered.fiber.dispose().then(() => ({ kind: 'disposed' as const }))
    try {
      expect((await Promise.race([reading, disposing])).kind).not.toBe('disposed')
    } finally {
      await Promise.all([reading, disposing])
      await watch?.return?.()
    }
  })
})
