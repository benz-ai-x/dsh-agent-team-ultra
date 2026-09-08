import { Logger } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import * as codex from '../../codex/lib/index.js'
import { operationResult as codexResult } from '../../codex/tests/fixtures/member-workflow.ts'
import { cleanups, profile, target, ToolCallId } from '../../domain/tests/fixtures/host-workflow.ts'
import type { DigitalEmployeeEvalSetDraft, DigitalEmployeeStudioView, SpawnDigitalEmployeeResult } from '../../domain/src/types.ts'
import { claudeWorkflow, operationResult } from './fixtures/member-workflow.ts'

it('reports elapsed Claude cleanup grace while awaiting actual process quiescence', async () => {
  const { ctx, runtime, native } = await claudeWorkflow('json', { disposalTimeoutMs: 25 })
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
      'agent-team-claude-code: cleanup abort grace elapsed; still waiting for native process exit',
    )
    expect(disposed).toBe(false)
    expect(native.live.size).toBe(1)
  } finally {
    release.resolve()
    await retiring
  }
  expect(native.live.size).toBe(0)
  await runtime.dispose()
  expect(diagnostics).toContain('agent-team-claude-code: native cleanup reached quiescence after abort grace')
})

it.each(['json', 'sqlite'] as const)('recovers one bound member, receipts and task ownership with evaluation and watches on %s', async (backend) => {
  const first = await claudeWorkflow(backend)
  const { ctx, lead, invoke, codexNative: native } = first
  const codexConfig = { catalogOwnerService: 'digitalEmployees', cwd: first.root, sandbox: 'read-only' as const }
  const provider = ctx.plugin(codex, codexConfig)
  await provider
  await expect(invoke('save', {
    expectedHeadRevision: null, profile: { ...profile, continuationProvider: '' },
    runtimeTarget: { kind: 'external-agent', provider: 'codex' },
  })).resolves.toMatchObject({ ok: true })
  await expect(invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 }))
    .resolves.toMatchObject({ ok: true })
  const stream = await ctx.typertGateway.stream({
    namespace: 'digitalEmployees', method: 'watch', args: { agentId: lead.agent.id },
  })
  const frames = stream[Symbol.asyncIterator]()
  await expect(frames.next()).resolves.toMatchObject({ value: { type: 'baseline', value: { instances: [] } } })
  const teamFrames = ctx.agentTeams.watch(lead.agent, new AbortController().signal)[Symbol.asyncIterator]()
  await expect(teamFrames.next()).resolves.toMatchObject({ value: { type: 'baseline' } })

  const launch = await ctx.tools.execute({
    agent: lead.agent, callId: ToolCallId('recover-bound-employee'), name: 'ultra_profile_launch',
    arguments: { profile_id: profile.id, assignment: 'Keep the same employee across recovery.' },
    signal: new AbortController().signal,
  })
  if (launch.isError) throw new Error(launch.error.message)
  const launched = launch.value as SpawnDigitalEmployeeResult
  if (!launched.ok || !launched.value.nativeRuntimeHandle) throw new Error('bound native employee was not launched')
  const binding = launched.value
  const handle = binding.nativeRuntimeHandle!
  const originalTurn = native.data.threads[handle].turns[0].id
  const oldChannel = native.channels.get(handle)!
  const task = await ctx.agentTeams.createTask(lead.agent, { subject: 'Review first', description: 'Retain native ownership.' })
  const dependent = await ctx.agentTeams.createTask(lead.agent, {
    subject: 'Publish later', description: 'Wait for the review.', blockedBy: [task.id],
  })
  const claim = { taskId: task.id, expectedRevision: 1, action: 'claim' }
  const claimCall = { callId: 'lost-recovery-claim' }
  native.dropNextToolReply = true
  await expect(native.query(handle, 'team_task_update', claim, claimCall)).rejects.toThrow('reply lost')
  expect(ctx.agentTeams.getTask(lead.agent, task.id)).toMatchObject({ revision: 2, ownerName: profile.employeeName, status: 'in_progress' })
  expect(codexResult(await native.query(handle, 'team_task_update', claim, claimCall)))
    .toMatchObject({ success: true, result: { value: { task: { revision: 2 } } } })
  const message = { target: 'lead', text: 'One accepted recovery progress message.' }
  const messageCall = { callId: 'lost-recovery-message' }
  native.dropNextToolReply = true
  await expect(native.query(handle, 'team_message_send', message, messageCall)).rejects.toThrow('reply lost')
  expect(codexResult(await native.query(handle, 'team_message_send', message, messageCall))).toMatchObject({ success: true })
  await lead.agent.whenIdle()

  const evaluator = { ...profile, id: 'recovery-evaluator', employeeName: 'recovery-evaluator', persona: 'RECOVERY_EVAL_MARKER' }
  const evalSet: DigitalEmployeeEvalSetDraft = {
    id: 'recovery-check', profileId: evaluator.id, displayName: 'Recovery check', toolAllowlist: [],
    resourceCeilings: { maxSteps: 2, maxOutputTokens: 256, maxElapsedMs: 20_000 },
    passPolicy: { kind: 'all' }, cases: [{
      id: 'finding', title: 'Report a finding', input: 'Evaluate while the native provider changes.', fixtures: [],
      assertions: { acceptedTerminals: ['completed'], requiredTools: [], forbiddenTools: [],
        requiredOutputSubstrings: ['finding'], forbiddenOutputSubstrings: [], maxSteps: 2, maxReportedTokens: 100, maxElapsedMs: 20_000 },
    }],
  }
  await expect(invoke('save', { expectedHeadRevision: null, profile: evaluator, runtimeTarget: target })).resolves.toMatchObject({ ok: true })
  await expect(invoke('saveEvalSet', { expectedHeadRevision: null, evalSet })).resolves.toMatchObject({ ok: true })
  const evaluationEntered = Promise.withResolvers<void>()
  const releaseEvaluation = Promise.withResolvers<void>()
  cleanups.push(async () => { releaseEvaluation.resolve() })
  first.adapter.beforeStream = async options => {
    if (!options.system?.includes('RECOVERY_EVAL_MARKER')) return
    evaluationEntered.resolve()
    const aborted = Promise.withResolvers<void>()
    const stop = () => { aborted.reject(options.signal?.reason) }
    if (options.signal?.aborted) stop()
    else options.signal?.addEventListener('abort', stop, { once: true })
    try { await Promise.race([releaseEvaluation.promise, aborted.promise]) }
    finally { options.signal?.removeEventListener('abort', stop) }
  }
  const evalRunId = '38383838-3838-4838-8838-383838383838'
  await expect(invoke('startEvalRun', {
    evalRunId, profileId: evaluator.id, profileRevision: 1, evalSetId: evalSet.id, evalSetRevision: 1,
  })).resolves.toMatchObject({ ok: true })
  await evaluationEntered.promise

  const waiting = native.query(handle, 'team_wait', { timeoutMs: 10_000 })
  expect(codexResult(await native.query(handle, 'team_tasks_get', { taskId: task.id })).success).toBe(true)
  expect(ctx.agentTeams.interrupt(lead.agent, profile.employeeName)).toEqual({ previousStatus: 'running' })
  expect(codexResult(await waiting).success).toBe(false)
  expect(ctx.agentTeams.getTask(lead.agent, task.id)).toMatchObject({ revision: 2, ownerName: profile.employeeName })
  expect(operationResult(await first.client!.callTool({ name: 'team_tasks_get', arguments: { taskId: task.id },
    _meta: { 'claudecode/toolUseId': 'toolu_before_codex_removal' },
  }))).toMatchObject({ success: true })
  expect(ctx.agentTeams.listMembers(lead.agent).find(member => member.id === first.member.id)?.status).toBe('running')

  native.dropNextCompletion = true
  // A second-resolution native clock can predate millisecond Host acceptance.
  native.completedAt = Math.floor(Date.now() / 1_000) - 1
  native.complete('completed', 'CANONICAL_RECOVERY_FINAL')
  const releaseExit = Promise.withResolvers<void>()
  const terminating = Promise.withResolvers<void>()
  native.onTerminate = () => { terminating.resolve(); return releaseExit.promise }
  cleanups.push(async () => { releaseExit.resolve() })
  let disposed = false
  const retiring = provider.dispose().then(() => { disposed = true })
  try {
    await terminating.promise
    const absent = await invoke('view') as DigitalEmployeeStudioView
    expect(absent.instances).toMatchObject([{ memberId: binding.memberId, nativeRuntimeHandle: handle, runtimeAvailability: 'unavailable' }])
    expect(disposed).toBe(false)
    await expect(frames.next()).resolves.toMatchObject({ value: { type: 'replace' } })
    await expect(teamFrames.next()).resolves.toMatchObject({ value: { type: 'invalidated' } })
    expect(operationResult(await first.client!.callTool({ name: 'team_tasks_get', arguments: { taskId: task.id },
      _meta: { 'claudecode/toolUseId': 'toolu_during_codex_removal' },
    }))).toMatchObject({ success: true })
  } finally {
    releaseExit.resolve()
    await retiring
    native.onTerminate = undefined
  }
  const replacement = ctx.plugin(codex, codexConfig)
  await replacement
  await expect.poll(() => ctx.agentTeams.listMembers(lead.agent).find(member => member.id === binding.memberId)?.status).toBe('idle')
  await provider.dispose()
  expect(native.channels.has(handle)).toBe(true)
  const current = await invoke('view') as DigitalEmployeeStudioView
  expect(current.runs.filter(run => run.owner.kind === 'team-member')).toMatchObject([{ canonicalTurnId: originalTurn }])
  const run = current.runs.find(value => value.owner.kind === 'team-member')!
  const detail = await invoke('run', { runId: run.runId })
  expect(detail).toMatchObject({ ok: true, value: { run: { terminal: 'completed', completeness: {
    status: 'incomplete', diagnostic: 'provider terminal time precedes Host acceptance; completion time is unavailable',
  } } } })
  expect(detail).not.toHaveProperty('value.run.endedAt')
  await expect(ctx.agentTeams.sendMessage(lead.agent, {
    target: profile.employeeName, content: [{ type: 'text', text: 'Continue with the replacement generation.' }],
    signal: new AbortController().signal,
  })).resolves.toMatchObject({ status: 'accepted' })
  oldChannel.send({ method: 'turn/completed', params: { threadId: handle, turn: {
    id: originalTurn, status: 'failed', items: [{ type: 'agentMessage', text: 'LATE_OLD_GENERATION', phase: 'final_answer' }],
  } } })
  expect(codexResult(await native.query(handle, 'team_tasks_get', { taskId: task.id })))
    .toMatchObject({ success: true, result: { value: { task: { revision: 2, ownerName: profile.employeeName } } } })
  const acceptedRuns = (await invoke('view') as DigitalEmployeeStudioView).runs
    .filter(value => value.owner.kind === 'team-member').map(value => value.runId).sort()
  expect(acceptedRuns).toHaveLength(2)
  await expect(invoke('evalRun', { evalRunId })).resolves.toMatchObject({ ok: true, value: { run: { status: 'running' } } })
  await ctx.fiber.dispose()
  await expect(frames.next()).resolves.toMatchObject({ done: true })
  await expect(teamFrames.next()).resolves.toMatchObject({ done: true })

  const recovered = await claudeWorkflow(backend, { root: first.root, resumeLead: true })
  const cold = await recovered.invoke('view') as DigitalEmployeeStudioView
  expect(cold.instances).toMatchObject([{ memberId: binding.memberId, nativeRuntimeHandle: handle, profileRevision: 1, runtimeAvailability: 'unavailable' }])
  expect(recovered.ctx.agentTeams.getTask(recovered.lead.agent, task.id)).toMatchObject({ revision: 2, ownerName: profile.employeeName, status: 'in_progress' })
  expect(recovered.ctx.agentTeams.getTask(recovered.lead.agent, dependent.id)).toMatchObject({ revision: 1, ready: false })
  await expect(recovered.invoke('evalRun', { evalRunId })).resolves.toMatchObject({ ok: true, value: { run: { status: 'interrupted' } } })
  await recovered.ctx.plugin(codex, codexConfig)
  await expect.poll(() => recovered.codexNative.channels.has(handle)).toBe(true)
  expect(Object.keys(recovered.codexNative.data.threads)).toEqual([handle])
  const restored = await recovered.invoke('view') as DigitalEmployeeStudioView
  expect(restored.instances).toMatchObject([{ memberId: binding.memberId, nativeRuntimeHandle: handle, profileRevision: 1 }])
  expect(restored.runs.filter(value => value.owner.kind === 'team-member').map(value => value.runId).sort()).toEqual(acceptedRuns)
  const page = await recovered.ctx.agentTeams.listMessages(recovered.lead.agent, { limit: 100 })
  const details = await Promise.all(page.items.map(item => recovered.ctx.agentTeams.getMessage(recovered.lead.agent, {
    messageId: item.id, committedCursor: page.committedCursor,
  })))
  const texts = details.flatMap(detail => detail.content.parts.flatMap(part => part.type === 'text' ? [part.text] : []))
  expect(texts.filter(text => text === message.text)).toHaveLength(1)
  expect(texts.filter(text => text === 'CANONICAL_RECOVERY_FINAL')).toHaveLength(1)
  expect(texts).not.toContain('LATE_OLD_GENERATION')
  const restoredFrames = recovered.ctx.agentTeams.watch(recovered.lead.agent, new AbortController().signal)[Symbol.asyncIterator]()
  await expect(restoredFrames.next()).resolves.toMatchObject({ value: { type: 'baseline', value: { tasks: [
    { id: task.id, revision: 2, ownerName: profile.employeeName }, { id: dependent.id, ready: false },
  ] } } })
  await expect(recovered.ctx.agentTeams.sendMessage(recovered.lead.agent, {
    target: profile.employeeName, content: [{ type: 'text', text: 'Complete the original owned review after cold recovery.' }],
    signal: new AbortController().signal,
  })).resolves.toMatchObject({ status: 'accepted' })
  expect(codexResult(await recovered.codexNative.query(handle, 'team_task_update', {
    taskId: task.id, expectedRevision: 2, action: 'complete',
  }))).toMatchObject({ success: true, result: { value: { task: { revision: 3, status: 'completed' } } } })
  expect(recovered.ctx.agentTeams.getTask(recovered.lead.agent, dependent.id)).toMatchObject({ revision: 1, ready: true })
  await expect(restoredFrames.next()).resolves.toMatchObject({ value: { type: 'invalidated' } })
  await restoredFrames.return?.()
}, 20_000)
