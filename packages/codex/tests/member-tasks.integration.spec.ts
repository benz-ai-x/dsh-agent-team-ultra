import { readdir } from 'node:fs/promises'
import type { UpdateTeamTaskRequest } from '@deepseek-ai/dsh-experimental-agent-team'
import { expect, it, vi } from 'vitest'
import { operationResult, queryWorkflow } from './fixtures/member-workflow.ts'

it('recovers a committed task receipt at the turn limit while refusing new calls and conflicting retries', async () => {
  const { ctx, lead, native, runtime, handle } = await queryWorkflow()
  try {
    const task = await ctx.agentTeams.createTask(lead.agent, { subject: 'Retry at budget', description: 'Commit before losing the native receipt.' })
    for (let index = 0; index < 63; index += 1) {
      expect(operationResult(await native.query(handle, 'team_members_list', {})).success).toBe(true)
    }
    const request = { taskId: task.id, expectedRevision: 1, action: 'claim' }
    const correlation = { callId: 'last-admitted-task-call' }
    native.dropNextToolReply = true
    await expect(native.query(handle, 'team_task_update', request, correlation)).rejects.toThrow('reply lost')
    const stored = await ctx.sessionPersistence.open(lead.agent.id, 'read')
    try {
      const facts = (await stored.read(0)).filter(event => event.type === 'team/native-operation/committed' && event.data.kind === 'task')
      expect(facts).toHaveLength(1)
      expect(operationResult(await native.query(handle, 'team_task_update', request, correlation)))
        .toEqual({ success: true, result: facts[0].data.receipt.result })
      expect(operationResult(await native.query(handle, 'team_task_update', { ...request, action: 'complete' }, correlation)))
        .toMatchObject({ success: false, result: { error: { code: 'TEAM_NATIVE_OPERATION_CONFLICT' } } })
      expect(operationResult(await native.query(handle, 'team_task_update', { ...request, expectedRevision: 2, action: 'complete' })))
        .toMatchObject({ success: false, result: { error: { code: 'CODEX_TEAM_RATE_LIMIT' } } })
      expect((await stored.read(0)).filter(event => event.type === 'team/native-operation/committed' && event.data.kind === 'task')).toHaveLength(1)
    } finally { await stored.close() }
    expect(ctx.agentTeams.getTask(lead.agent, task.id)).toMatchObject({ revision: 2, status: 'in_progress', ownerName: 'codex-reviewer' })
  } finally {
    native.complete()
    await runtime.dispose()
  }
})

it('applies identical task ownership, CAS, DAG and tombstone rules to DSH and Codex teammates', async () => {
  const { ctx, lead, native, runtime, handle } = await queryWorkflow()
  const peer = await ctx.agentTeams.spawnTeammate(lead.agent, {
    name: 'dsh-reviewer', description: 'Compare the shared task rules.', provider: 'spawn', context: 'fresh',
    prompt: [{ type: 'text', text: 'Prepare to review tasks.' }],
    agentOptions: { provider: 'workflow', model: 'reviewer' }, signal: new AbortController().signal,
  })
  await expect.poll(() => ctx.agents.get(peer.member.id)).toBeUndefined()
  const dsh = await ctx.agents.resume({ resumeSessionId: peer.member.id, agentOptions: { provider: 'workflow', model: 'reviewer' } })
  try {
    const exercise = async (actor: 'dsh' | 'codex') => {
      const name = actor === 'dsh' ? 'dsh-reviewer' : 'codex-reviewer'
      const update = async (request: UpdateTeamTaskRequest) => {
        let task
        if (actor === 'codex') {
          const response = operationResult(await native.query(handle, 'team_task_update', request))
          if (!response.success) return { code: response.result.error.code, currentRevision: response.result.error.currentRevision }
          task = response.result.value.task
        } else {
          try { task = await ctx.agentTeams.updateTask(dsh.agent, request) }
          catch (error) {
            expect(error).toHaveProperty('code')
            const failure = error as { code: string; currentRevision?: number }
            return { code: failure.code, currentRevision: failure.currentRevision }
          }
        }
        return { revision: task.revision, status: task.status, owned: task.ownerName === name, ready: task.ready }
      }
      const first = await ctx.agentTeams.createTask(lead.agent, { subject: `${actor} first`, description: 'First task.' })
      const next = await ctx.agentTeams.createTask(lead.agent, { subject: `${actor} next`, description: 'Dependent task.', blockedBy: [first.id] })
      const results = [
        await update({ taskId: first.id, expectedRevision: 1, action: 'edit', subject: 'Unowned' }),
        await update({ taskId: first.id, expectedRevision: 1, action: 'reassign', owner: name }),
        await update({ taskId: next.id, expectedRevision: 1, action: 'claim' }),
        await update({ taskId: first.id, expectedRevision: 1, action: 'claim' }),
        await update({ taskId: first.id, expectedRevision: 1, action: 'complete' }),
        await update({ taskId: first.id, expectedRevision: 2, action: 'set_dependencies', blockedBy: [next.id] }),
        await update({ taskId: first.id, expectedRevision: 2, action: 'delete' }),
        await update({ taskId: first.id, expectedRevision: 2, action: 'edit', subject: '  Reviewed  ', writeScopes: ['./src/', 'src'] }),
        await update({ taskId: first.id, expectedRevision: 3, action: 'complete' }),
        { dependencyReady: ctx.agentTeams.getTask(lead.agent, next.id).ready },
        await update({ taskId: next.id, expectedRevision: 1, action: 'claim' }),
        await update({ taskId: next.id, expectedRevision: 2, action: 'delete' }),
        await update({ taskId: next.id, expectedRevision: 3, action: 'claim' }),
        await update({ taskId: first.id, expectedRevision: 4, action: 'reopen' }),
      ]
      expect(ctx.agentTeams.getTask(lead.agent, first.id)).toMatchObject({ subject: 'Reviewed', writeScopes: ['src'] })
      expect(ctx.agentTeams.getTask(lead.agent, next.id).status).toBe('deleted')
      expect(ctx.agentTeams.listTasks(lead.agent).some(task => task.id === next.id)).toBe(false)
      return results
    }
    const ordinary = await exercise('dsh')
    expect(await exercise('codex')).toEqual(ordinary)
    expect(ordinary).toEqual([
      { code: 'TEAM_TASK_UNAUTHORIZED', currentRevision: undefined },
      { code: 'TEAM_LEAD_REQUIRED', currentRevision: undefined },
      { code: 'TEAM_TASK_BLOCKED', currentRevision: undefined },
      { revision: 2, status: 'in_progress', owned: true, ready: false },
      { code: 'TEAM_TASK_STALE_REVISION', currentRevision: 2 },
      { code: 'TEAM_TASK_DEPENDENCY_CYCLE', currentRevision: undefined },
      { code: 'TEAM_TASK_HAS_DEPENDENTS', currentRevision: undefined },
      { revision: 3, status: 'in_progress', owned: true, ready: false },
      { revision: 4, status: 'completed', owned: true, ready: false },
      { dependencyReady: true },
      { revision: 2, status: 'in_progress', owned: true, ready: false },
      { revision: 3, status: 'deleted', owned: true, ready: false },
      { code: 'TEAM_TASK_DELETED', currentRevision: undefined },
      { revision: 5, status: 'pending', owned: false, ready: true },
    ])
    expect(native.starts).toBe(1)
    native.complete()
  } finally {
    await dsh.dispose()
    await runtime.dispose()
  }
})

it('observes dependency readiness through Codex wait without starting work or locking overlapping scopes', async () => {
  const { ctx, lead, native, runtime, handle, root } = await queryWorkflow()
  const first = await ctx.agentTeams.createTask(lead.agent, { subject: 'Dependency', description: 'Finish first.', writeScopes: ['src'] })
  const next = await ctx.agentTeams.createTask(lead.agent, { subject: 'Dependent', description: 'Wait for the dependency.', blockedBy: [first.id], writeScopes: ['src'] })
  const overlap = await ctx.agentTeams.createTask(lead.agent, { subject: 'Overlapping work', description: 'Scopes are advisory.', writeScopes: ['src'] })
  const files = await readdir(root)
  const update = async (taskId: string, expectedRevision: number, action: string) =>
    operationResult(await native.query(handle, 'team_task_update', { taskId, expectedRevision, action }))
  expect(await update(next.id, 1, 'claim')).toMatchObject({ success: false, result: { error: { code: 'TEAM_TASK_BLOCKED' } } })
  expect(await update(first.id, 1, 'claim')).toMatchObject({ success: true })
  expect(await ctx.agentTeams.updateTask(lead.agent, { taskId: overlap.id, expectedRevision: 1, action: 'claim' }))
    .toMatchObject({ status: 'in_progress', ownerName: 'lead', writeScopeWarnings: [expect.any(String)] })
  const waiting = native.query(handle, 'team_wait', { timeoutMs: 10_000 })
  // A later response on the same transport confirms the wait frame was processed.
  expect(operationResult(await native.query(handle, 'team_tasks_get', { taskId: first.id })).success).toBe(true)
  expect(await update(first.id, 2, 'complete')).toMatchObject({ success: true })
  expect(operationResult(await waiting)).toEqual({ success: true, result: { ok: true, operation: 'wait', value: { timedOut: false } } })
  expect(ctx.agentTeams.getTask(lead.agent, next.id)).toMatchObject({ revision: 1, status: 'pending', ready: true })
  expect(native.starts).toBe(1)
  expect(Object.keys(native.data.threads)).toEqual([handle])
  expect(native.data.threads[handle].turns).toHaveLength(1)
  expect(await readdir(root)).toEqual(files)
  native.complete()
  await runtime.dispose()
})

it('times out a Codex wait and retains task ownership when a later wait is interrupted', async () => {
  const { ctx, lead, native, runtime, handle } = await queryWorkflow()
  const task = await ctx.agentTeams.createTask(lead.agent, { subject: 'Wait safely', description: 'Keep ownership.' })
  expect(operationResult(await native.query(handle, 'team_task_update', { taskId: task.id, expectedRevision: 1, action: 'claim' })).success).toBe(true)
  for (const timeoutMs of [9_999, 3_600_001]) {
    expect(operationResult(await native.query(handle, 'team_wait', { timeoutMs })))
      .toMatchObject({ success: false, result: { error: { code: 'TEAM_INVALID_TIMEOUT' } } })
  }
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    const timed = native.query(handle, 'team_wait', { timeoutMs: 10_000 })
    expect(operationResult(await native.query(handle, 'team_tasks_get', { taskId: task.id })).success).toBe(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(operationResult(await timed)).toEqual({ success: true, result: { ok: true, operation: 'wait', value: { timedOut: true } } })
  } finally { vi.useRealTimers() }
  const waiting = native.query(handle, 'team_wait', { timeoutMs: 3_600_000 })
  expect(operationResult(await native.query(handle, 'team_tasks_get', { taskId: task.id })).success).toBe(true)
  native.complete('interrupted', 'Pause this task.')
  expect(operationResult(await waiting)).toMatchObject({ success: false, result: { error: { code: 'TEAM_NATIVE_CANCELLED' } } })
  expect(ctx.agentTeams.getTask(lead.agent, task.id)).toMatchObject({ revision: 2, status: 'in_progress', ownerName: 'codex-reviewer' })
  const stored = await ctx.sessionPersistence.open(lead.agent.id, 'read')
  try {
    const tasks = (await stored.read(0)).filter(event => event.type === 'team/native-operation/committed' && event.data.kind === 'task')
    expect(tasks).toHaveLength(1)
    expect((await stored.read(0)).some(event => event.type === 'team/native-operation/committed' && event.data.receipt.result.operation === 'wait')).toBe(false)
  } finally { await stored.close() }
  expect(native.starts).toBe(1)
  await runtime.dispose()
  expect(native.calls.size).toBe(0)
})

it.each(['json', 'sqlite'] as const)('preserves a lost Codex task receipt and ownership across %s cold recovery', async backend => {
  const first = await queryWorkflow(undefined, backend)
  const task = await first.ctx.agentTeams.createTask(first.lead.agent, { subject: 'Recover task', description: 'Accept the claim once.' })
  const request = { taskId: task.id, expectedRevision: 1, action: 'claim' }
  const correlation = { callId: 'lost-task-receipt' }
  first.native.dropNextToolReply = true
  await expect(first.native.query(first.handle, 'team_task_update', request, correlation)).rejects.toThrow('reply lost')
  const before = await first.ctx.sessionPersistence.open(first.lead.agent.id, 'read')
  let receipt: unknown
  try {
    const facts = (await before.read(0)).filter(event => event.type === 'team/native-operation/committed' && event.data.kind === 'task')
    expect(facts).toHaveLength(1)
    receipt = facts[0].data.receipt.result
    expect(facts[0].data.task).toMatchObject({ id: task.id, revision: 2, ownerId: first.member.id })
  } finally { await before.close() }
  expect(operationResult(await first.native.query(first.handle, 'team_task_update', request, correlation)))
    .toEqual({ success: true, result: receipt })
  expect(operationResult(await first.native.query(first.handle, 'team_task_update', { ...request, action: 'complete' }, correlation)))
    .toMatchObject({ success: false, result: { error: { code: 'TEAM_NATIVE_OPERATION_CONFLICT' } } })
  first.native.dropNextToolReply = true
  await expect(first.native.query(first.handle, 'team_task_update', request, correlation)).rejects.toThrow('reply lost')
  await first.ctx.fiber.dispose()

  // Cold recovery settles the dead native turn; it does not recreate its RPC callback.
  for (let restart = 0; restart < 2; restart += 1) {
    const recovered = await queryWorkflow(undefined, backend, { root: first.root, resumeLead: true })
    expect(recovered.member.id).toBe(first.member.id)
    expect(recovered.handle).toBe(first.handle)
    expect(recovered.native.starts).toBe(0)
    expect(recovered.native.data.threads[recovered.handle].turns[0].status).toBe('interrupted')
    expect(recovered.ctx.agentTeams.getTask(recovered.lead.agent, task.id)).toMatchObject({
      revision: 2, status: 'in_progress', ownerName: 'codex-reviewer',
    })
    const stored = await recovered.ctx.sessionPersistence.open(recovered.lead.agent.id, 'read')
    try {
      await expect.poll(async () => (await stored.read(0)).filter(event =>
        event.type === 'team/native-operation/committed' && event.data.receipt.result.operation === 'turns.settle'))
        .toHaveLength(1)
      const facts = (await stored.read(0)).filter(event => event.type === 'team/native-operation/committed' && event.data.kind === 'task')
      expect(facts).toHaveLength(1)
      expect(facts[0].data.receipt.result).toEqual(receipt)
    } finally { await stored.close() }
    await recovered.ctx.fiber.dispose()
    expect(recovered.native.live.size).toBe(0)
  }
})
