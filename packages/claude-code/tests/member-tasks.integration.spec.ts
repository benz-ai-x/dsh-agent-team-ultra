import { readdir } from 'node:fs/promises'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { UpdateTeamTaskRequest } from '@deepseek-ai/dsh-experimental-agent-team'
import { expect, it, vi } from 'vitest'
import { claudeWorkflow, operationResult } from './fixtures/member-workflow.ts'

let nextCall = 0

async function call(client: Client, name: string, args: Record<string, unknown>, callId = `toolu_task_${++nextCall}`) {
  return operationResult(await client.callTool({ name, arguments: args, _meta: { 'claudecode/toolUseId': callId } }))
}

it('exposes task mutation and wait through the controlled Claude SDK MCP server', async () => {
  const { client, native, runtime } = await claudeWorkflow()
  try {
    expect((await client!.listTools()).tools.map(tool => tool.name)).toEqual([
      'team_members_list', 'team_tasks_list', 'team_tasks_get', 'team_message_send', 'team_task_update', 'team_wait',
    ])
  } finally {
    native.complete('The task channel is available.')
    await runtime.dispose()
  }
})

it('recovers a committed task receipt at the turn limit while refusing new calls and conflicting retries', async () => {
  const { ctx, lead, client, native, runtime } = await claudeWorkflow()
  try {
    const task = await ctx.agentTeams.createTask(lead.agent, {
      subject: 'Retry at budget', description: 'Commit before losing the Claude MCP receipt.',
    })
    for (let index = 0; index < 63; index += 1) {
      expect((await call(client!, 'team_members_list', {}, `toolu_read_${index}`)).success).toBe(true)
    }
    const request = { name: 'team_task_update', arguments: { taskId: task.id, expectedRevision: 1, action: 'claim' },
      _meta: { 'claudecode/toolUseId': 'toolu_task_64' } }
    native.dropNextToolReply = true
    await expect(client!.callTool(request, undefined, { timeout: 50 })).rejects.toThrow(/timed out/i)
    const stored = await ctx.sessionPersistence.open(lead.agent.id, 'read')
    try {
      const facts = (await stored.read(0)).filter(event => event.type === 'team/native-operation/committed' && event.data.kind === 'task')
      expect(facts).toHaveLength(1)
      expect(operationResult(await client!.callTool(request))).toEqual({ success: true, result: facts[0]!.data.receipt.result })
      expect(await call(client!, 'team_task_update', { ...request.arguments, action: 'complete' }, 'toolu_task_64'))
        .toMatchObject({ success: false, result: { error: { code: 'TEAM_NATIVE_OPERATION_CONFLICT' } } })
      expect(await call(client!, 'team_task_update', { taskId: task.id, expectedRevision: 2, action: 'complete' }, 'toolu_task_65'))
        .toMatchObject({ success: false, result: { error: { code: 'CLAUDE_TEAM_RATE_LIMIT' } } })
      expect((await stored.read(0)).filter(event => event.type === 'team/native-operation/committed' && event.data.kind === 'task'))
        .toHaveLength(1)
    } finally { await stored.close() }
    expect(ctx.agentTeams.getTask(lead.agent, task.id)).toMatchObject({
      revision: 2, status: 'in_progress', ownerName: 'claude-reviewer',
    })
  } finally {
    native.complete('The receipt remained singular.')
    await runtime.dispose()
  }
})

it('applies identical ownership, CAS, DAG and tombstone rules to DSH and Claude teammates', async () => {
  const { ctx, lead, client, native, runtime } = await claudeWorkflow()
  const peer = await ctx.agentTeams.spawnTeammate(lead.agent, {
    name: 'dsh-reviewer', description: 'Compare shared task rules.', provider: 'spawn', context: 'fresh',
    prompt: [{ type: 'text', text: 'Prepare to review tasks.' }],
    agentOptions: { provider: 'workflow', model: 'reviewer' }, signal: new AbortController().signal,
  })
  await expect.poll(() => ctx.agents.get(peer.member.id)).toBeUndefined()
  const dsh = await ctx.agents.resume({
    resumeSessionId: peer.member.id, agentOptions: { provider: 'workflow', model: 'reviewer' },
  })
  try {
    const exercise = async (actor: 'dsh' | 'claude') => {
      const name = actor === 'dsh' ? 'dsh-reviewer' : 'claude-reviewer'
      const update = async (request: UpdateTeamTaskRequest) => {
        let task
        if (actor === 'claude') {
          const response = await call(client!, 'team_task_update', request as unknown as Record<string, unknown>)
          if (!response.success) return {
            code: response.result.error.code, currentRevision: response.result.error.currentRevision,
          }
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
      const next = await ctx.agentTeams.createTask(lead.agent, {
        subject: `${actor} next`, description: 'Dependent task.', blockedBy: [first.id],
      })
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
    expect(await exercise('claude')).toEqual(ordinary)
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
  } finally {
    native.complete('The shared rules match.')
    await dsh.dispose()
    await runtime.dispose()
  }
})

it('observes dependency readiness through Claude wait without starting work or locking overlapping scopes', async () => {
  const { ctx, lead, client, native, runtime, handle, root } = await claudeWorkflow()
  try {
    const first = await ctx.agentTeams.createTask(lead.agent, {
      subject: 'Dependency', description: 'Finish first.', writeScopes: ['src'],
    })
    const next = await ctx.agentTeams.createTask(lead.agent, {
      subject: 'Dependent', description: 'Wait for the dependency.', blockedBy: [first.id], writeScopes: ['src'],
    })
    const overlap = await ctx.agentTeams.createTask(lead.agent, {
      subject: 'Overlapping work', description: 'Scopes are advisory.', writeScopes: ['src'],
    })
    const files = await readdir(root)
    const update = (taskId: string, expectedRevision: number, action: string) =>
      call(client!, 'team_task_update', { taskId, expectedRevision, action })
    expect(await update(next.id, 1, 'claim')).toMatchObject({
      success: false, result: { error: { code: 'TEAM_TASK_BLOCKED' } },
    })
    expect(await update(first.id, 1, 'claim')).toMatchObject({ success: true })
    await expect(ctx.agentTeams.updateTask(lead.agent, {
      taskId: overlap.id, expectedRevision: 1, action: 'claim',
    })).resolves.toMatchObject({ status: 'in_progress', ownerName: 'lead', writeScopeWarnings: [expect.any(String)] })
    const waiting = call(client!, 'team_wait', { timeoutMs: 10_000 })
    expect((await call(client!, 'team_tasks_get', { taskId: first.id })).success).toBe(true)
    expect(await update(first.id, 2, 'complete')).toMatchObject({ success: true })
    expect(await waiting).toEqual({ success: true, result: { ok: true, operation: 'wait', value: { timedOut: false } } })
    expect(ctx.agentTeams.getTask(lead.agent, next.id)).toMatchObject({ revision: 1, status: 'pending', ready: true })
    expect(native.starts).toBe(1)
    expect(Object.keys(native.data.sessions)).toEqual([handle])
    expect(native.data.sessions[handle].messages).toHaveLength(1)
    expect(await readdir(root)).toEqual(files)
  } finally {
    native.complete('Dependency became ready.')
    await runtime.dispose()
  }
})

it('times out Claude wait and retains task ownership when a later wait is interrupted', async () => {
  const { ctx, lead, client, native, runtime, member } = await claudeWorkflow()
  const task = await ctx.agentTeams.createTask(lead.agent, { subject: 'Wait safely', description: 'Keep ownership.' })
  expect((await call(client!, 'team_task_update', { taskId: task.id, expectedRevision: 1, action: 'claim' })).success).toBe(true)
  for (const timeoutMs of [9_999, 3_600_001]) {
    expect(await call(client!, 'team_wait', { timeoutMs })).toMatchObject({
      success: false, result: { error: { code: 'TEAM_INVALID_TIMEOUT' } },
    })
  }
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    const timed = call(client!, 'team_wait', { timeoutMs: 10_000 })
    expect((await call(client!, 'team_tasks_get', { taskId: task.id })).success).toBe(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await timed).toEqual({ success: true, result: { ok: true, operation: 'wait', value: { timedOut: true } } })
  } finally { vi.useRealTimers() }
  const waiting = call(client!, 'team_wait', { timeoutMs: 3_600_000 })
  expect((await call(client!, 'team_tasks_get', { taskId: task.id })).success).toBe(true)
  expect(ctx.agentTeams.interrupt(lead.agent, member.name)).toEqual({ previousStatus: 'running' })
  await expect(waiting).rejects.toThrow(/connection closed/i)
  expect(ctx.agentTeams.getTask(lead.agent, task.id)).toMatchObject({
    revision: 2, status: 'in_progress', ownerName: 'claude-reviewer',
  })
  const stored = await ctx.sessionPersistence.open(lead.agent.id, 'read')
  try {
    const tasks = (await stored.read(0)).filter(event => event.type === 'team/native-operation/committed' && event.data.kind === 'task')
    expect(tasks).toHaveLength(1)
    expect((await stored.read(0)).some(event => event.type === 'team/native-operation/committed'
      && event.data.receipt.result.operation === 'wait')).toBe(false)
  } finally { await stored.close() }
  await runtime.dispose()
  expect(native.live.size).toBe(0)
})

it('replays one task receipt after a Lead generation changes and rejects the old wait callback', async () => {
  const { ctx, lead, client, native, runtime, member } = await claudeWorkflow()
  const task = await ctx.agentTeams.createTask(lead.agent, { subject: 'Generation fence', description: 'Claim exactly once.' })
  const request = { name: 'team_task_update', arguments: { taskId: task.id, expectedRevision: 1, action: 'claim' },
    _meta: { 'claudecode/toolUseId': 'toolu_generation_claim' } }
  native.dropNextToolReply = true
  await expect(client!.callTool(request, undefined, { timeout: 50 })).rejects.toThrow(/timed out/i)
  const waiting = call(client!, 'team_wait', { timeoutMs: 3_600_000 }, 'toolu_old_generation_wait')
  await expect.poll(() => ctx.agentTeams.getTask(lead.agent, task.id).revision).toBe(2)
  await lead.dispose()
  expect(await waiting).toMatchObject({ success: false, result: { error: { code: 'TEAM_NATIVE_GRANT_REVOKED' } } })
  const resumed = await ctx.agents.resume({ resumeSessionId: lead.agent.id, agentOptions: {} })
  try {
    await expect.poll(() => ctx.agentTeams.listMembers(resumed.agent).find(candidate => candidate.id === member.id)?.status)
      .toBe('running')
    const replay = operationResult(await client!.callTool(request))
    expect(replay).toMatchObject({ success: true, result: { ok: true, operation: 'tasks.update' } })
    expect(ctx.agentTeams.getTask(resumed.agent, task.id)).toMatchObject({
      revision: 2, status: 'in_progress', ownerName: member.name,
    })
    const stored = await ctx.sessionPersistence.open(resumed.agent.id, 'read')
    try {
      expect((await stored.read(0)).filter(event => event.type === 'team/native-operation/committed' && event.data.kind === 'task'))
        .toHaveLength(1)
    } finally { await stored.close() }
  } finally {
    native.complete('The generation fence held.')
    await resumed.dispose()
    await runtime.dispose()
  }
})

it.each(['json', 'sqlite'] as const)('preserves a lost Claude task receipt and ownership across %s cold recovery', async backend => {
  const first = await claudeWorkflow(backend)
  const task = await first.ctx.agentTeams.createTask(first.lead.agent, {
    subject: 'Recover task', description: 'Accept the claim once.',
  })
  const request = { name: 'team_task_update', arguments: { taskId: task.id, expectedRevision: 1, action: 'claim' },
    _meta: { 'claudecode/toolUseId': 'toolu_lost_task_receipt' } }
  first.native.dropNextToolReply = true
  await expect(first.client!.callTool(request, undefined, { timeout: 50 })).rejects.toThrow(/timed out/i)
  const before = await first.ctx.sessionPersistence.open(first.lead.agent.id, 'read')
  let receipt: unknown
  try {
    const facts = (await before.read(0)).filter(event => event.type === 'team/native-operation/committed' && event.data.kind === 'task')
    expect(facts).toHaveLength(1)
    receipt = facts[0]!.data.receipt.result
    expect(facts[0]!.data.task).toMatchObject({ id: task.id, revision: 2, ownerId: first.member.id })
  } finally { await before.close() }
  expect(operationResult(await first.client!.callTool(request))).toEqual({ success: true, result: receipt })
  expect(await call(first.client!, 'team_task_update', { ...request.arguments, action: 'complete' }, 'toolu_lost_task_receipt'))
    .toMatchObject({ success: false, result: { error: { code: 'TEAM_NATIVE_OPERATION_CONFLICT' } } })
  first.native.dropNextToolReply = true
  await expect(first.client!.callTool(request, undefined, { timeout: 50 })).rejects.toThrow(/timed out/i)
  await first.ctx.fiber.dispose()

  for (let restart = 0; restart < 2; restart += 1) {
    const recovered = await claudeWorkflow(backend, { root: first.root, resumeLead: true })
    expect(recovered.member.id).toBe(first.member.id)
    expect(recovered.handle).toBe(first.handle)
    expect(recovered.native.starts).toBe(0)
    expect(recovered.ctx.agentTeams.getTask(recovered.lead.agent, task.id)).toMatchObject({
      revision: 2, status: 'in_progress', ownerName: 'claude-reviewer',
    })
    const stored = await recovered.ctx.sessionPersistence.open(recovered.lead.agent.id, 'read')
    try {
      const facts = (await stored.read(0)).filter(event => event.type === 'team/native-operation/committed' && event.data.kind === 'task')
      expect(facts).toHaveLength(1)
      expect(facts[0]!.data.receipt.result).toEqual(receipt)
    } finally { await stored.close() }
    await recovered.ctx.fiber.dispose()
    expect(recovered.native.live.size).toBe(0)
  }
})
