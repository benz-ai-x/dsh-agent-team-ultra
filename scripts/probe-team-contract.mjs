/** Run the same public Team contract against one independently built Harness. */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

const root = resolve(process.argv[2])
const load = path => import(pathToFileURL(join(root, path, 'lib/index.js')).href)
const [cordis, loop, testkit, llm, session, projection, persistence, query, subagents, spawn, team] = await Promise.all([
  'vendor/cordis', 'packages/core/agent-loop', 'packages/test-support/agent-loop-testkit',
  'packages/llm/llm', 'packages/core/session', 'packages/session/session-projection',
  'packages/session/session-persistence-jsonl', 'packages/session-query/session-query',
  'packages/subagent/subagent', 'packages/subagent/subagent-spawn-in-process', 'packages/experimental/agent-team',
].map(load))

class ControlledModel extends llm.LlmAdapter {
  providerInfo(provider) { return { id: provider, name: 'Contract probe' } }
  async listModels(provider) { return [{ provider, id: 'probe', name: 'Probe' }] }
  async resolveModel(provider, id) { return { provider, id, name: 'Probe' } }
  async *stream({ signal }) {
    await new Promise((_, reject) => {
      if (signal.aborted) reject(signal.reason)
      else signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  }
}

class SessionReader extends query.default {
  async searchSessions() { throw new Error('Search is outside this contract probe') }
  async searchEvents() { throw new Error('Search is outside this contract probe') }
}

const storage = await mkdtemp(join(tmpdir(), 'ultra-team-contract-'))
const ctx = new cordis.Context()
const signal = new AbortController().signal
const content = text => [{ type: 'text', text }]
const checked = []
async function until(test) {
  const deadline = Date.now() + 5000
  while (!test()) {
    if (Date.now() >= deadline) throw new Error('Team contract probe timed out')
    await delay(5)
  }
}

try {
  await testkit.mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(projection.default)
  await ctx.plugin(persistence.default, { root: storage })
  await ctx.plugin(SessionReader)
  await ctx.plugin(loop.default, { agents: [] })
  await ctx.plugin(subagents.default)
  await ctx.plugin(spawn, { providerName: 'spawn' })
  const fiber = await ctx.plugin(team.default)
  const service = ctx.agentTeams
  ctx.llm.registerAdapter(['probe'], new ControlledModel())
  const lead = await ctx.agentLoop.create(session.SessionId('contract-lead'), { provider: 'probe', model: 'probe' })
  const launch = name => service.spawnTeammate(lead, {
    name, description: `${name} responsibility`, prompt: content(`${name} work`),
    context: 'fresh', provider: 'spawn', signal,
  })
  const first = await launch('alpha')
  const second = await launch('beta')
  await until(() => ctx.agents.get(first.member.id)?.status === 'running' && ctx.agents.get(second.member.id)?.status === 'running')
  const alpha = ctx.agents.get(first.member.id)
  const beta = ctx.agents.get(second.member.id)
  assert.equal(service.membership(lead).role, 'lead')
  assert.equal(service.membership(alpha).role, 'teammate')
  assert.equal(service.membership(beta).root, lead)
  assert.equal(service.tryMembership({ ...lead }), undefined)
  await assert.rejects(service.spawnTeammate(alpha, {
    name: 'nested', description: 'unauthorized', prompt: content('nested'), context: 'fresh', provider: 'spawn', signal,
  }), { code: 'TEAM_LEAD_REQUIRED' })
  checked.push('roles-and-exact-live-authority')

  const task = await service.createTask(alpha, { subject: 'first', description: 'first task' })
  const dependent = await service.createTask(beta, { subject: 'second', description: 'dependent task', blockedBy: [task.id] })
  await assert.rejects(service.updateTask(lead, {
    taskId: task.id, expectedRevision: task.revision, action: 'set_dependencies', blockedBy: [dependent.id],
  }), { code: 'TEAM_TASK_DEPENDENCY_CYCLE' })
  await assert.rejects(service.updateTask(beta, {
    taskId: dependent.id, expectedRevision: dependent.revision, action: 'claim',
  }), { code: 'TEAM_TASK_BLOCKED' })
  const claimed = await service.updateTask(alpha, { taskId: task.id, expectedRevision: task.revision, action: 'claim' })
  await assert.rejects(service.updateTask(beta, {
    taskId: task.id, expectedRevision: claimed.revision, action: 'edit', subject: 'stolen',
  }), { code: 'TEAM_TASK_UNAUTHORIZED' })
  await assert.rejects(service.updateTask(alpha, {
    taskId: task.id, expectedRevision: task.revision, action: 'complete',
  }), { code: 'TEAM_TASK_STALE_REVISION' })
  await service.updateTask(alpha, { taskId: task.id, expectedRevision: claimed.revision, action: 'complete' })
  assert.equal(service.getTask(beta, dependent.id).ready, true)
  checked.push('task-cas-dag-and-ownership')

  const waiting = service.waitForChange(lead, 10000, signal)
  const leaf = await service.createTask(lead, { subject: 'wake', description: 'wake the waiter' })
  assert.deepEqual(await waiting, { timedOut: false })
  await service.updateTask(lead, { taskId: leaf.id, expectedRevision: leaf.revision, action: 'delete' })
  assert.equal(service.getTask(lead, leaf.id).status, 'deleted')
  assert.equal(service.listTasks(lead).some(candidate => candidate.id === leaf.id), false)
  const successor = await service.createTask(lead, { subject: 'successor', description: 'does not reuse tombstone identity' })
  assert.equal(successor.id, 'task-4')
  const cancel = new AbortController()
  const cancelled = service.waitForChange(lead, 10000, cancel.signal)
  cancel.abort('contract cancellation')
  await assert.rejects(cancelled, { code: 'TEAM_WAIT_ABORTED' })
  checked.push('task-tombstones-and-wait-cancellation')

  lead.followup(llm.createUserMessage({ content: content('keep lead busy'), source: { kind: 'user' } }))
  await until(() => lead.status === 'running')
  const accepted = await service.sendMessage(alpha, { target: 'lead', content: content('durable peer report'), signal })
  assert.equal(accepted.status, 'accepted')
  const reader = await ctx.sessionPersistence.open(lead.id, 'read')
  try {
    const events = await reader.read()
    const edges = events.flatMap(event => {
      if (event.type === 'agent/inbox/spliced' && event.data.inserted.some(message =>
        message.source.kind === 'team-message' && message.source.messageId === accepted.messageId)) return ['receipt']
      if (event.type === 'team/message/delivered' && event.data.messageId === accepted.messageId) return ['delivered']
      return []
    })
    assert.deepEqual(edges, ['receipt', 'delivered'])
  } finally { await reader.close() }
  checked.push('durable-receipt-before-delivered')

  service.interrupt(lead, 'alpha')
  await until(() => ctx.agents.get(alpha.id) === undefined)
  await assert.rejects(launch('alpha'), { code: 'TEAM_MEMBER_NAME_TAKEN' })
  checked.push('permanent-member-names')

  const disposing = service.waitForChange(lead, 10000, signal)
  await fiber.dispose()
  assert.deepEqual(await disposing, { timedOut: false })
  assert.equal(ctx.get('agentTeams'), undefined)
  assert.equal(ctx.agents.get(beta.id), undefined)
  checked.push('team-fiber-disposal')
  console.log(JSON.stringify({ sessionFormat: session.SESSION_FORMAT_VERSION, checked }))
} finally {
  try { await ctx.fiber.dispose() }
  finally { await rm(storage, { recursive: true, force: true }) }
}
