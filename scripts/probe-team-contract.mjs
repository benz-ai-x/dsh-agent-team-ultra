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
let ctx = new cordis.Context()
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

async function mount() {
  await testkit.mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(projection.default)
  await ctx.plugin(persistence.default, { root: storage })
  await ctx.plugin(SessionReader)
  await ctx.plugin(loop.default, { agents: [] })
  await ctx.plugin(subagents.default)
  await ctx.plugin(spawn, { providerName: 'spawn' })
  const fiber = await ctx.plugin(team.default)
  ctx.llm.registerAdapter(['probe'], new ControlledModel())
  return fiber
}

async function storedEvents(id) {
  const reader = await ctx.sessionPersistence.open(id, 'read')
  try { return await reader.read() }
  finally { await reader.close() }
}

try {
  const fiber = await mount()
  const service = ctx.agentTeams
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
  // A public durability subscriber holds the queued flush open. Delivery must
  // wait for every subscriber, including this one, before touching the inbox.
  const releaseFlush = Promise.withResolvers()
  let flushingMessage
  const stopFlush = ctx.on('session/flush', async subject => {
    if (subject !== lead.session || flushingMessage !== undefined) return
    const queued = subject.snapshotEvents().find(event => event.type === 'team/message/queued')
    if (!queued) return
    flushingMessage = queued.data.message.id
    await releaseFlush.promise
  })
  const sending = service.sendMessage(alpha, { target: 'lead', content: content('first report'), signal })
  try {
    await until(() => flushingMessage !== undefined)
    assert.equal(lead.inbox.nextStep.some(message => message.source.kind === 'team-message'), false)
  } finally {
    releaseFlush.resolve()
    stopFlush()
  }
  const receipts = [await sending]
  for (const text of ['second report', 'third report']) {
    receipts.push(await service.sendMessage(alpha, { target: 'lead', content: content(text), signal }))
  }
  assert.deepEqual(receipts.map(receipt => receipt.status), ['accepted', 'accepted', 'accepted'])
  const events = await storedEvents(lead.id)
  const messages = events.flatMap(event => event.type === 'agent/inbox/spliced'
    ? event.data.inserted.filter(message => message.source.kind === 'team-message') : [])
  assert.deepEqual(messages.map(message => message.content.at(-1).text), ['first report', 'second report', 'third report'])
  assert.deepEqual(messages.map(message => [message.source.messageId, message.source.senderId, message.source.senderName]),
    receipts.map(receipt => [receipt.messageId, alpha.id, 'alpha']))
  for (const receipt of receipts) {
    const edges = events.flatMap(event => {
      if (event.type === 'team/message/queued' && event.data.message.id === receipt.messageId) return ['queued']
      if (event.type === 'agent/inbox/spliced' && event.data.inserted.some(message =>
        message.source.kind === 'team-message' && message.source.messageId === receipt.messageId)) return ['receipt']
      if (event.type === 'team/message/delivered' && event.data.messageId === receipt.messageId) return ['delivered']
      return []
    })
    assert.deepEqual(edges, ['queued', 'receipt', 'delivered'])
  }
  checked.push('queued-flush-before-delivery', 'message-order-and-sender-attribution', 'durable-receipt-before-delivered')

  const owned = await service.createTask(alpha, { subject: 'retained', description: 'survives interruption and restart' })
  const working = await service.updateTask(alpha, { taskId: owned.id, expectedRevision: owned.revision, action: 'claim' })
  service.interrupt(lead, 'alpha')
  await until(() => ctx.agents.get(alpha.id) === undefined)
  await assert.rejects(launch('alpha'), { code: 'TEAM_MEMBER_NAME_TAKEN' })
  assert.equal(service.getTask(lead, owned.id).ownerName, 'alpha')
  assert.equal(service.getTask(lead, owned.id).status, 'in_progress')
  assert.equal(service.getTask(lead, owned.id).revision, working.revision)
  checked.push('permanent-member-names', 'interrupted-task-owner-retained')

  const disposing = service.waitForChange(lead, 10000, signal)
  await fiber.dispose()
  assert.deepEqual(await disposing, { timedOut: false })
  assert.equal(ctx.get('agentTeams'), undefined)
  assert.equal(ctx.agents.get(beta.id), undefined)
  checked.push('team-fiber-disposal')
  await ctx.fiber.dispose()
  ctx = new cordis.Context()
  await mount()
  const resumed = await ctx.agents.resume({
    resumeSessionId: lead.id, agentOptions: { provider: 'probe', model: 'probe' },
  })
  const restoredLead = resumed.agent
  const restored = ctx.agentTeams
  assert.deepEqual(restored.listMembers(restoredLead).map(member => [member.name, member.id]),
    [['lead', lead.id], ['alpha', alpha.id], ['beta', beta.id]])
  assert.equal(restored.getTask(restoredLead, owned.id).ownerName, 'alpha')
  assert.equal(restored.getTask(restoredLead, owned.id).status, 'in_progress')
  assert.equal(restored.getTask(restoredLead, owned.id).revision, working.revision)
  assert.equal(ctx.agents.get(alpha.id), undefined)
  assert.equal(ctx.agents.get(beta.id), undefined)
  const created = []
  ctx.on('agent/created', ({ agent }) => { created.push(agent.id) })
  assert.deepEqual(await restored.waitForChange(restoredLead, 10000, signal), { timedOut: true })
  assert.deepEqual(created, [])
  assert.equal(ctx.agents.get(alpha.id), undefined)
  assert.equal(ctx.agents.get(beta.id), undefined)
  checked.push('cold-wait-timeout-without-wake')

  const wake = await restored.sendMessage(restoredLead, { target: 'alpha', content: content('resume retained work'), signal })
  assert.equal(wake.status, 'accepted')
  await until(() => ctx.agents.get(alpha.id)?.status === 'running')
  const restoredAlpha = ctx.agents.get(alpha.id)
  assert.notEqual(restoredAlpha, alpha)
  assert.equal(restored.membership(restoredAlpha).root, restoredLead)
  assert.deepEqual(created, [alpha.id])
  const coldMessages = (await storedEvents(alpha.id)).flatMap(event => event.type === 'agent/inbox/spliced'
    ? event.data.inserted.filter(message => message.source.kind === 'team-message') : [])
  assert.deepEqual(coldMessages.map(message => [message.source.messageId, message.source.senderId,
    message.source.senderName, message.content.at(-1).text]), [[wake.messageId, lead.id, 'lead', 'resume retained work']])
  assert.equal(restored.getTask(restoredAlpha, owned.id).ownerName, 'alpha')
  assert.equal(restored.getTask(restoredAlpha, owned.id).revision, working.revision)
  checked.push('cold-restart-resume-and-task-owner-retained')
  console.log(JSON.stringify({ sessionFormat: session.SESSION_FORMAT_VERSION, checked }))
} finally {
  try { await ctx.fiber.dispose() }
  finally { await rm(storage, { recursive: true, force: true }) }
}
