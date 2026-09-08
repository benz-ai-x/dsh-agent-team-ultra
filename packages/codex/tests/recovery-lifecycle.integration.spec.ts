import { Logger } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { profile } from '../../domain/tests/fixtures/host-workflow.ts'
import type { DigitalEmployeeStudioView, SpawnDigitalEmployeeResult } from '../../domain/src/types.ts'
import { queryWorkflow } from './fixtures/member-workflow.ts'

it('reports elapsed cleanup grace without completing disposal before the native process exits', async () => {
  const { ctx, runtime, native } = await queryWorkflow(undefined, 'json', { disposalTimeoutMs: 25 })
  const terminating = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  native.onTerminate = () => {
    terminating.resolve()
    return release.promise
  }
  const diagnostics: string[] = []
  ctx.logger.exporter({
    levels: { default: 3 },
    export(message) { diagnostics.push(Logger.format({ colors: false }, message)) },
  })
  let disposed = false
  const retiring = runtime.dispose().then(() => { disposed = true })
  try {
    await terminating.promise
    await expect.poll(() => diagnostics).toContain(
      'agent-team-codex: cleanup abort grace elapsed; still waiting for native process exit',
    )
    expect(disposed).toBe(false)
    expect(native.live.size).toBe(1)
  } finally {
    release.resolve()
    await retiring
  }
  expect(native.live.size).toBe(0)
  await runtime.dispose()
  expect(diagnostics).toContain('agent-team-codex: native cleanup reached quiescence after abort grace')
})

it('refuses native Run evidence after its exact Lead retires without replacing the employee', async () => {
  const { ctx, lead, invoke, native } = await queryWorkflow()
  await expect(invoke('save', {
    expectedHeadRevision: null,
    profile: { ...profile, continuationProvider: '' },
    runtimeTarget: { kind: 'external-agent', provider: 'codex' },
  })).resolves.toMatchObject({ ok: true })
  await expect(invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 }))
    .resolves.toMatchObject({ ok: true })
  const launched = await invoke('spawn', {
    launchRequestId: '38383838-3838-4838-8838-383838383838', profileId: profile.id,
  }) as SpawnDigitalEmployeeResult
  if (!launched.ok || !launched.value.nativeRuntimeHandle) throw new Error('native employee was not launched')
  const before = await invoke('view') as DigitalEmployeeStudioView
  expect(before.runs).toHaveLength(1)
  const runId = before.runs[0]!.runId
  const reading = ctx.digitalEmployees.runEvidence(lead.agent, { runId }, new AbortController().signal)
  await lead.dispose()
  await expect(reading).resolves.toMatchObject({ ok: false, error: { code: 'team-rejected' } })

  await ctx.agents.resume({ resumeSessionId: lead.agent.id })
  await expect(invoke('run', { runId })).resolves.toMatchObject({ ok: true, value: { run: { runId } } })
  expect((await invoke('view') as DigitalEmployeeStudioView).instances).toMatchObject([{
    memberId: launched.value.memberId, nativeRuntimeHandle: launched.value.nativeRuntimeHandle,
  }])
  native.complete()
})
