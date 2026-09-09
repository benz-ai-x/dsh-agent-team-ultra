import { Logger } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import * as codex from '../lib/index.js'
import { profile } from '../../domain/tests/fixtures/host-workflow.ts'
import type { DigitalEmployeeStudioView, GetDigitalEmployeeRunResult, SpawnDigitalEmployeeResult } from '../../domain/src/types.ts'
import { queryWorkflow } from './fixtures/member-workflow.ts'

it.each(['none', 'warn', 'info'] as const)('reports elapsed cleanup grace and awaits native exit with %s log failure', async loggingFailure => {
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
    export(message) {
      const diagnostic = Logger.format({ colors: false }, message)
      diagnostics.push(diagnostic)
      if (message.type === loggingFailure && diagnostic.startsWith('agent-team-codex:') && diagnostic.includes('cleanup')) {
        throw new Error('cleanup log exporter failure')
      }
    },
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
  expect(diagnostics.join('\n')).not.toContain('cleanup log exporter failure')
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

it.each(['json', 'sqlite'] as const)('does not invent a completion time for a recovered native Run on %s', async backend => {
  const { ctx, lead, invoke, native, runtime, root } = await queryWorkflow(product => {
    product.completedAt = null
  }, backend)
  await expect(invoke('save', {
    expectedHeadRevision: null,
    profile: { ...profile, continuationProvider: '' },
    runtimeTarget: { kind: 'external-agent', provider: 'codex' },
  })).resolves.toMatchObject({ ok: true })
  await expect(invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 }))
    .resolves.toMatchObject({ ok: true })
  const launched = await invoke('spawn', {
    launchRequestId: '62626262-6262-4262-8262-626262626262', profileId: profile.id,
  }) as SpawnDigitalEmployeeResult
  if (!launched.ok || !launched.value.nativeRuntimeHandle) throw new Error('native employee was not launched')
  const handle = launched.value.nativeRuntimeHandle
  native.complete()
  await expect.poll(() => ctx.agentTeams.listMembers(lead.agent)
    .find(member => member.name === profile.employeeName)?.status).toBe('idle')
  const view = await invoke('view') as DigitalEmployeeStudioView
  const runId = view.runs[0]!.runId
  const before = await invoke('run', { runId }) as GetDigitalEmployeeRunResult
  await runtime.dispose()
  await ctx.plugin(codex, { catalogOwnerService: 'digitalEmployees', cwd: root, sandbox: 'read-only' })
  await expect.poll(() => native.channels.has(handle)).toBe(true)
  await expect.poll(() => ctx.agentTeams.listMembers(lead.agent)
    .find(member => member.name === profile.employeeName)?.status).toBe('idle')
  const recovered = await invoke('run', { runId }) as GetDigitalEmployeeRunResult
  for (const result of [before, recovered]) {
    expect(result).toMatchObject({ ok: true, value: { run: { runId, completeness: { status: 'incomplete' } } } })
    if (!result.ok) throw new Error('native Run evidence was not inspectable')
    expect(result.value.run.endedAt).toBeUndefined()
    expect(result.value.timeline.some(item => item.kind === 'turn')).toBe(false)
  }
  expect((await invoke('view') as DigitalEmployeeStudioView).instances).toMatchObject([{
    memberId: launched.value.memberId, nativeRuntimeHandle: handle, profileRevision: 1,
  }])
})

it.each(['json', 'sqlite'] as const)('keeps partial native history incomplete through new work and cold recovery on %s', async backend => {
  const { ctx, lead, invoke, native, runtime, root } = await queryWorkflow(undefined, backend)
  await expect(invoke('save', {
    expectedHeadRevision: null,
    profile: { ...profile, continuationProvider: '' },
    runtimeTarget: { kind: 'external-agent', provider: 'codex' },
  })).resolves.toMatchObject({ ok: true })
  await expect(invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 }))
    .resolves.toMatchObject({ ok: true })
  const launched = await invoke('spawn', {
    launchRequestId: '62626262-6262-4262-8262-626262626263', profileId: profile.id,
  }) as SpawnDigitalEmployeeResult
  if (!launched.ok || !launched.value.nativeRuntimeHandle) throw new Error('native employee was not launched')
  const handle = launched.value.nativeRuntimeHandle
  await expect(native.query(handle, 'team_members_list', {})).resolves.toMatchObject({ success: true })
  // Keep the source-proven second-resolution terminal after Host acceptance.
  native.completedAt = Math.ceil(Date.now() / 1_000) + 1
  native.complete()
  await expect.poll(() => ctx.agentTeams.listMembers(lead.agent)
    .find(member => member.name === profile.employeeName)?.status).toBe('idle')
  const runId = (await invoke('view') as DigitalEmployeeStudioView).runs[0]!.runId
  const before = await invoke('run', { runId }) as GetDigitalEmployeeRunResult
  if (!before.ok) throw new Error('native Run evidence was not inspectable')
  expect(before.value.timeline.filter(item => item.kind === 'tool')).toHaveLength(1)
  expect(before.value.run).toMatchObject({ terminal: 'completed', completeness: { status: 'complete' } })

  await runtime.dispose()
  await ctx.plugin(codex, { catalogOwnerService: 'digitalEmployees', cwd: root, sandbox: 'read-only' })
  await expect.poll(() => native.channels.has(handle)).toBe(true)
  await expect.poll(() => ctx.agentTeams.listMembers(lead.agent)
    .find(member => member.name === profile.employeeName)?.status).toBe('idle')
  const page = await ctx.agentTeams.readTeammateRuntimeEvidence(lead.agent, profile.employeeName, {
    limit: 100, signal: new AbortController().signal,
  })
  expect(page.nextCursor).toBeUndefined()
  expect(page.complete).toBe(false)
  const recovered = await invoke('run', { runId }) as GetDigitalEmployeeRunResult
  expect(recovered).toMatchObject({ ok: true, value: { run: {
    runId, canonicalSource: before.value.run.canonicalSource, endedAt: before.value.run.endedAt,
    terminal: 'completed', completeness: { status: 'incomplete' },
  } } })
  expect(JSON.stringify(recovered)).not.toMatch(/PRIVATE_REASONING|PRIVATE_COMMENTARY|Review complete\./)

  await expect(ctx.agentTeams.sendMessage(lead.agent, {
    target: profile.employeeName, content: [{ type: 'text', text: 'Continue with the same member.' }],
    signal: new AbortController().signal,
  })).resolves.toMatchObject({ status: 'accepted' })
  await expect(native.query(handle, 'team_members_list', {})).resolves.toMatchObject({ success: true })
  native.completedAt = Math.ceil(Date.now() / 1_000) + 1
  native.complete()
  await expect.poll(() => ctx.agentTeams.listMembers(lead.agent)
    .find(member => member.name === profile.employeeName)?.status).toBe('idle')
  const latest = (await invoke('view') as DigitalEmployeeStudioView).runs.find(run => run.runId !== runId)!
  expect(latest).toBeDefined()
  await expect(invoke('run', { runId: latest.runId })).resolves.toMatchObject({
    ok: true, value: { run: { terminal: 'completed', completeness: { status: 'incomplete' } } },
  })
  await ctx.fiber.dispose()

  const cold = await queryWorkflow(undefined, backend, { root, resumeLead: true })
  const coldView = await cold.invoke('view') as DigitalEmployeeStudioView
  expect(coldView.instances).toMatchObject([{
    memberId: launched.value.memberId, nativeRuntimeHandle: handle, profileRevision: 1,
  }])
  expect(coldView.runs.map(run => run.runId).sort()).toEqual([runId, latest.runId].sort())
  await expect(cold.invoke('run', { runId })).resolves.toMatchObject({ ok: true, value: { run: {
    runId, terminal: 'completed', endedAt: before.value.run.endedAt, completeness: { status: 'incomplete' },
  } } })
}, 20_000)

it.each(['json', 'sqlite'] as const)('drops cached completion time when recovered canonical timing is unavailable on %s', async backend => {
  const { ctx, lead, invoke, native, runtime, root } = await queryWorkflow(undefined, backend)
  await expect(invoke('save', {
    expectedHeadRevision: null,
    profile: { ...profile, continuationProvider: '' },
    runtimeTarget: { kind: 'external-agent', provider: 'codex' },
  })).resolves.toMatchObject({ ok: true })
  await expect(invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 }))
    .resolves.toMatchObject({ ok: true })
  const launched = await invoke('spawn', {
    launchRequestId: '62626262-6262-4262-8262-626262626264', profileId: profile.id,
  }) as SpawnDigitalEmployeeResult
  if (!launched.ok || !launched.value.nativeRuntimeHandle) throw new Error('native employee was not launched')
  const handle = launched.value.nativeRuntimeHandle
  native.completedAt = Math.ceil(Date.now() / 1_000) + 1
  native.complete()
  await expect.poll(() => ctx.agentTeams.listMembers(lead.agent)
    .find(member => member.name === profile.employeeName)?.status).toBe('idle')
  const runId = (await invoke('view') as DigitalEmployeeStudioView).runs[0]!.runId
  const before = await invoke('run', { runId }) as GetDigitalEmployeeRunResult
  expect(before).toMatchObject({ ok: true, value: { run: { endedAt: native.completedAt * 1_000 } } })
  await runtime.dispose()
  // Change only the external native response, not the derived Host index.
  for (const turn of native.data.threads[handle].turns) turn.completedAt = null
  await ctx.plugin(codex, { catalogOwnerService: 'digitalEmployees', cwd: root, sandbox: 'read-only' })
  await expect.poll(() => native.channels.has(handle)).toBe(true)
  const recovered = await invoke('run', { runId }) as GetDigitalEmployeeRunResult
  expect(recovered).toMatchObject({ ok: true, value: { run: { runId, completeness: { status: 'incomplete' } } } })
  if (!recovered.ok) throw new Error('native Run evidence was not inspectable')
  expect(recovered.value.run.endedAt).toBeUndefined()
})
