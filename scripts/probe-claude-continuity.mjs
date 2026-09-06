/** Exercise installed archives through Loader, generated Remote, durable storage and the controlled SDK boundary. */
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import yaml from 'js-yaml'
import { requirePreparedHarness } from './harness-source.mjs'
import { NativeProduct } from '../packages/claude-code/tests/fixtures/native-product.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [profileDirectory, phase, stateDirectory, backend = 'json', sourceDirectory = root] = process.argv.slice(2)
const { harnessRoot } = requirePreparedHarness(resolve(sourceDirectory))
assert.ok(profileDirectory && stateDirectory && ['before', 'after', 'query-new', 'query-resume'].includes(phase))
assert.ok(['json', 'sqlite'].includes(backend))
const initial = phase === 'before' || phase === 'query-new'
const teamTools = phase !== 'before'
mkdirSync(stateDirectory, { recursive: true })
const installed = createRequire(join(profileDirectory, 'package.json'))
const imported = name => import(pathToFileURL(installed.resolve(name)).href)
const harness = path => import(pathToFileURL(join(harnessRoot, path, 'lib/index.js')).href)
await imported('@benz-ai-x/dsh-agent-team-ultra-profile')
const patches = yaml.load(readFileSync(installed.resolve('@benz-ai-x/dsh-agent-team-ultra-profile/cordis.patch.yml'), 'utf8'))
const entries = patches.flatMap(patch => patch.insert ?? []).flatMap(entry => entry.group ? entry.config : [entry])
const runtimeEntry = entries.find(entry => entry.id === 'agent-team-claude-code')
const hostEntry = entries.find(entry => entry.id === 'agent-team-ultra')
assert.ok(runtimeEntry && hostEntry)
assert.equal(runtimeEntry.name, phase === 'before'
  ? '@deepseek-ai/dsh-experimental-agent-team-claude-code' : '@benz-ai-x/dsh-agent-team-claude-code')
const runtimeRequire = createRequire(installed.resolve(runtimeEntry.name))
const sdkEntry = runtimeRequire.resolve('@anthropic-ai/claude-agent-sdk')
const sdkManifest = JSON.parse(readFileSync(join(dirname(sdkEntry), 'package.json'), 'utf8'))
assert.equal(sdkManifest.version, '0.3.241')
assert.equal(sdkManifest.claudeCodeVersion, '2.1.241')
const libcSuffix = process.platform === 'linux'
  && typeof process.report.getReport().header.glibcVersionRuntime !== 'string' ? '-musl' : ''
const nativePackage = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}${libcSuffix}`
const nativeManifest = createRequire(sdkEntry).resolve(`${nativePackage}/package.json`)
const native = new NativeProduct(join(stateDirectory, 'native.json'),
  join(dirname(nativeManifest), process.platform === 'win32' ? 'claude.exe' : 'claude'), { teamTools })
// Replace only the external SDK API in this isolated probe process. Qualification
// still reads the real installed SDK and executable, and the adapter is unmodified.
const boundaryKey = Symbol.for('ultra-test-claude-sdk')
globalThis[boundaryKey] = native
const sdkHook = registerHooks({
  load(url, context, nextLoad) {
    if (url !== pathToFileURL(sdkEntry).href) return nextLoad(url, context)
    return { format: 'module', shortCircuit: true, source: `
      const boundary = globalThis[Symbol.for('ultra-test-claude-sdk')]
      export const query = request => boundary.query(request)
      export const getSessionInfo = (...args) => boundary.getSessionInfo(...args)
      export const getSessionMessages = (...args) => boundary.getSessionMessages(...args)
      export { createSdkMcpServer } from ${JSON.stringify(`${pathToFileURL(sdkEntry).href}?actual-sdk-helpers`)}
    ` }
  },
})
const [
  { Context }, { Loader }, { default: AgentLoop }, { mountAgentLoopTestDependencies },
  { SessionId }, { default: Persistence }, { default: Projections }, { default: Query },
  { default: Teams }, { default: Subagents }, { default: Storage }, StorageDomain,
  JsonStorage, SqliteStorage, { default: Subprocess }, { default: TypertRegistry },
  { default: Gateway }, { TYPERT },
] = await Promise.all([
  imported('@deepseek-ai/cordis'), imported('@deepseek-ai/cordis-plugin-loader'),
  harness('packages/core/agent-loop'), harness('packages/test-support/agent-loop-testkit'),
  imported('@deepseek-ai/dsh-session'), harness('packages/session/session-persistence-jsonl'),
  harness('packages/session/session-projection'), harness('packages/session-query/session-query'),
  imported('@deepseek-ai/dsh-experimental-agent-team'), imported('@deepseek-ai/dsh-subagent'),
  harness('packages/storage/storage'), imported('@deepseek-ai/dsh-storage-domain'),
  harness('packages/storage/storage-json'), harness('packages/storage/storage-sqlite'),
  imported('@deepseek-ai/dsh-subprocess'), harness('packages/typert/registry'),
  imported('@deepseek-ai/dsh-api-gateway'), imported('@benz-ai-x/dsh-agent-team-ultra/typert'),
])
class UnusedSearch extends Query {
  searchSessions() { throw new Error('unused search') }
  searchEvents() { throw new Error('unused search') }
}
class NativeTransport extends Subprocess {
  resolveExecutable() { throw new Error('Claude Code must not search PATH') }
  spawnTerminal() { throw new Error('Claude Code must use the qualified SDK process bridge') }
  spawn(spec) { return native.open(spec) }
}
const ctx = new Context()
const identity = instance => Object.fromEntries([
  'teamId', 'memberName', 'memberId', 'launchRequestId', 'profileId', 'profileRevision',
  'runtimeTarget', 'resolvedRuntimeTarget', 'nativeRuntimeHandle', 'requiredCapabilities', 'provisioningPhase',
].map(key => [key, instance[key]]))
const request = { launchRequestId: '55555555-5555-4555-8555-555555555555', profileId: 'claude-code-reviewer', assignment: 'Review this immutable change.' }
const checkpointPath = join(stateDirectory, 'checkpoint.json')
const checkpoint = initial ? undefined : JSON.parse(readFileSync(checkpointPath, 'utf8'))
async function until(read, check) {
  const deadline = Date.now() + 10000
  for (;;) {
    const value = await read()
    if (check(value)) return value
    assert.ok(Date.now() < deadline, `condition did not settle: ${JSON.stringify(value)}`)
    await delay(10)
  }
}
try {
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(Projections)
  await ctx.plugin(Persistence, { root: join(stateDirectory, 'sessions') })
  await ctx.plugin(UnusedSearch)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(Subagents)
  await ctx.plugin(Teams)
  await ctx.plugin(Storage)
  await ctx.plugin(backend === 'json' ? JsonStorage : SqliteStorage,
    backend === 'json' ? { root: join(stateDirectory, 'storage') } : { path: join(stateDirectory, 'storage.sqlite'), journalMode: 'delete' })
  await ctx.plugin(StorageDomain, { backend })
  await ctx.plugin(NativeTransport)
  const lead = initial
    ? await ctx.agents.create({ sessionId: SessionId('claude-code-upgrade-lead') })
    : await ctx.agents.resume({ resumeSessionId: SessionId('claude-code-upgrade-lead') })
  const loaderFiber = ctx.plugin(Loader, { baseUrl: pathToFileURL(join(profileDirectory, 'package.json')).href })
  await loaderFiber
  const loaderRow = entry => ({ ...entry, name: pathToFileURL(installed.resolve(entry.name)).href })
  await ctx.loader.root.update([loaderRow(hostEntry), loaderRow(runtimeEntry)])
  await ctx.loader.await()
  await ctx.plugin(TypertRegistry)
  await ctx.plugin(Gateway)
  ctx.typert.register(TYPERT)
  const invoke = (method, request) => ctx.typertGateway.invoke({
    namespace: 'digitalEmployees', method, args: { agentId: lead.agent.id, ...(request === undefined ? {} : { request }) },
  })
  const current = () => invoke('view')
  const view = await current()
  assert.equal(view.runtimeCatalog.backends.filter(row => row.provider === 'claude-code' && row.availability === 'available').length, 1)
  const profile = {
    id: 'claude-code-reviewer', employeeName: 'claude-code-reviewer', displayName: 'Claude Code reviewer', description: 'Retain the original employee.',
    continuationProvider: '', contextMode: 'fresh', persona: 'Review carefully.', mission: 'Report findings.',
    toolPolicy: { mode: 'inherit', names: [] }, context: [], memory: [], hooks: [],
  }
  if (initial) {
    const unsupported = await invoke('save', {
      expectedHeadRevision: null, runtimeTarget: { kind: 'external-agent', provider: 'claude-code' },
      profile: { ...profile, contextMode: 'fork' },
    })
    assert.equal(unsupported.ok, false)
    assert.equal(unsupported.error.code, 'runtime-capability-mismatch')
    assert.equal(native.starts, 0)
    const saved = await invoke('save', {
      expectedHeadRevision: null, runtimeTarget: { kind: 'external-agent', provider: 'claude-code' }, profile,
    })
    assert.equal(saved.ok, true, JSON.stringify(saved))
    const activated = await invoke('activate', { profileId: request.profileId, revision: 1, expectedHeadRevision: 1 })
    assert.equal(activated.ok, true, JSON.stringify(activated))
  }
  if (phase !== 'before') {
    const profileToolNames = ctx.tools.schemas(lead.agent).map(tool => tool.name)
      .filter(name => name.startsWith('ultra_profile_')).sort()
    assert.deepEqual(profileToolNames, ['ultra_profile_detail', 'ultra_profile_launch', 'ultra_profile_list'])
    const listed = await ctx.tools.execute({
      agent: lead.agent, callId: `installed-profile-list-${phase}`, name: 'ultra_profile_list', arguments: {},
      signal: new AbortController().signal,
    })
    assert.equal(listed.isError, false, JSON.stringify(listed))
    assert.deepEqual(listed.value.profiles.map(profile => profile.profileId), [request.profileId])
  }
  const launched = await invoke('spawn', request)
  assert.equal(launched.ok, true, JSON.stringify(launched))
  assert.equal(launched.value.profileRevision, 1)
  assert.ok(launched.value.nativeRuntimeHandle)
  native.complete()
  const live = await until(current, value => value.instances[0]?.runtimePresence === 'idle')
  if (checkpoint) assert.deepEqual(identity(live.instances[0]), checkpoint.identity)
  const member = ctx.agentTeams.listMembers(lead.agent).find(row => row.name === 'claude-code-reviewer')
  assert.equal(member.id, live.instances[0].memberId)
  assert.equal(member.externalRuntime.nativeHandle, live.instances[0].nativeRuntimeHandle)
  const sent = await ctx.agentTeams.sendMessage(lead.agent, {
    target: 'claude-code-reviewer', content: [{ type: 'text', text: `Follow-up ${phase} package upgrade.` }],
    signal: new AbortController().signal,
  })
  assert.equal(sent.status, 'accepted', JSON.stringify(sent))
  if (teamTools) {
    const channel = native.channels.get(live.instances[0].nativeRuntimeHandle)
    await channel.ready
    assert.deepEqual((await channel.client.listTools()).tools.map(tool => tool.name), [
      'team_members_list', 'team_tasks_list', 'team_tasks_get', 'team_message_send', 'team_task_update', 'team_wait',
    ])
    const call = (name, args, id) => channel.client.callTool({ name, arguments: args,
      _meta: { 'claudecode/toolUseId': `toolu_${phase}_${id}` } })
    const members = await call('team_members_list', {}, 'members')
    assert.equal(members.isError, false)
    assert.ok(JSON.parse(members.content[0].text).value.members.some(value => value.id === member.id))
    const visibleTask = ctx.agentTeams.listTasks(lead.agent)[0] ?? await ctx.agentTeams.createTask(lead.agent, {
      subject: 'Read the installed Claude Team', description: 'Retain the shared task across cold recovery.',
    })
    const tasks = await call('team_tasks_list', { limit: 1 }, 'tasks')
    assert.equal(tasks.isError, false)
    assert.equal(JSON.parse(tasks.content[0].text).value.tasks[0].id, visibleTask.id)
    assert.equal((await call('team_tasks_get', { taskId: visibleTask.id }, 'detail')).isError, false)
    const messageRequest = { name: 'team_message_send', arguments: { target: 'lead', text: `Installed Claude message ${phase}.` },
      _meta: { 'claudecode/toolUseId': `toolu_${phase}_message` } }
    native.dropNextToolReply = true
    await assert.rejects(channel.client.callTool(messageRequest, undefined, { timeout: 50 }), /timed out/i)
    const accepted = await channel.client.callTool(messageRequest)
    assert.equal(accepted.isError, false)
    assert.deepEqual(await channel.client.callTool(messageRequest), accepted)
    const changed = await channel.client.callTool({ ...messageRequest, arguments: { ...messageRequest.arguments, text: 'Changed input.' } })
    assert.equal(JSON.parse(changed.content[0].text).error.code, 'TEAM_NATIVE_OPERATION_CONFLICT')
    const task = await ctx.agentTeams.createTask(lead.agent, {
      subject: `Installed Claude task ${phase}`, description: 'Commit and recover the native task receipt.',
    })
    const claimRequest = { name: 'team_task_update', arguments: { taskId: task.id, expectedRevision: 1, action: 'claim' },
      _meta: { 'claudecode/toolUseId': `toolu_${phase}_task_claim` } }
    native.dropNextToolReply = true
    await assert.rejects(channel.client.callTool(claimRequest, undefined, { timeout: 50 }), /timed out/i)
    const claimed = await channel.client.callTool(claimRequest)
    assert.equal(claimed.isError, false)
    assert.deepEqual(await channel.client.callTool(claimRequest), claimed)
    const claimConflict = await channel.client.callTool({ ...claimRequest,
      arguments: { ...claimRequest.arguments, action: 'complete' } })
    assert.equal(JSON.parse(claimConflict.content[0].text).error.code, 'TEAM_NATIVE_OPERATION_CONFLICT')
    const waiting = call('team_wait', { timeoutMs: 10_000 }, 'wait')
    assert.equal((await call('team_tasks_get', { taskId: task.id }, 'task_barrier')).isError, false)
    const completed = await call('team_task_update', { taskId: task.id, expectedRevision: 2, action: 'complete' }, 'task_complete')
    assert.equal(completed.isError, false)
    assert.deepEqual(JSON.parse((await waiting).content[0].text), { ok: true, operation: 'wait', value: { timedOut: false } })
    assert.equal(ctx.agentTeams.getTask(lead.agent, task.id).revision, 3)
    assert.equal(ctx.agentTeams.getTask(lead.agent, task.id).status, 'completed')
    assert.equal(ctx.agentTeams.getTask(lead.agent, task.id).ownerName, 'claude-code-reviewer')
  }
  native.complete(teamTools ? `Installed Claude final ${phase}.` : undefined)
  await until(current, value => value.instances[0]?.runtimePresence === 'idle')
  if (teamTools) {
    const stored = await ctx.sessionPersistence.open(lead.agent.id, 'read')
    try {
      const events = await until(() => stored.read(0), events => events.some(event => event.type === 'team/native-operation/committed'
        && event.data.message?.content[0]?.text === `Installed Claude final ${phase}.`))
      const operations = events.filter(event => event.type === 'team/native-operation/committed')
      const messages = operations.filter(event => event.data.message?.content[0]?.text === `Installed Claude message ${phase}.`)
      const finals = operations.filter(event => event.data.message?.content[0]?.text === `Installed Claude final ${phase}.`)
      assert.equal(messages.length, 1)
      assert.equal(finals.length, 1)
      assert.equal(messages[0].data.message.senderId, member.id)
      assert.equal(messages[0].data.receipt.source.callId, `toolu_${phase}_message`)
      assert.equal(finals[0].data.receipt.source.turnId, messages[0].data.receipt.source.turnId)
      assert.equal(finals[0].data.receipt.result.value.outcome, 'completed')
      const tasks = operations.filter(event => event.data.kind === 'task'
        && event.data.receipt.source.callId?.startsWith(`toolu_${phase}_task_`))
      assert.equal(tasks.length, 2)
      assert.deepEqual(tasks.map(event => [event.data.receipt.source.callId, event.data.task.revision, event.data.task.status]), [
        [`toolu_${phase}_task_claim`, 2, 'in_progress'], [`toolu_${phase}_task_complete`, 3, 'completed'],
      ])
    } finally { await stored.close() }
  }
  assert.equal(Object.keys(native.data.sessions).length, 1)
  const session = native.data.sessions[live.instances[0].nativeRuntimeHandle]
  const workCount = () => session.messages.filter(message => message.type === 'user').length
  assert.equal(workCount(), initial ? 2 : 4)
  assert.equal(native.starts, initial ? 1 : 0)
  if (initial) writeFileSync(checkpointPath, `${JSON.stringify({ identity: identity(live.instances[0]) }, null, 2)}\n`)
  const pending = await ctx.agentTeams.sendMessage(lead.agent, {
    target: 'claude-code-reviewer', content: [{ type: 'text', text: `Work during ${phase} provider removal.` }],
    signal: new AbortController().signal,
  })
  assert.equal(pending.status, 'accepted', JSON.stringify(pending))
  assert.equal(native.live.size, 1)
  await ctx.loader.remove('agent-team-claude-code')
  assert.equal(native.live.size, 0)
  const removed = await current()
  assert.equal(removed.runtimeCatalog.backends.filter(row => row.provider === 'claude-code' && row.availability === 'available').length, 0)
  assert.deepEqual(identity(removed.instances[0]), identity(live.instances[0]))
  await assert.rejects(ctx.agentTeams.readTeammateRuntimeEvidence(lead.agent, 'claude-code-reviewer', {
    limit: 10, signal: new AbortController().signal,
  }), error => error.code === 'TEAM_RUNTIME_UNAVAILABLE')
  await ctx.loader.root.update([loaderRow(hostEntry), loaderRow(runtimeEntry)])
  await ctx.loader.await()
  const restored = await until(current, value => value.instances[0]?.runtimePresence === 'idle')
  assert.deepEqual(identity(restored.instances[0]), identity(live.instances[0]))
  assert.equal(Object.keys(native.data.sessions).length, 1)
  assert.equal(workCount(), initial ? 3 : 5)
  if (teamTools) {
    const stored = await ctx.sessionPersistence.open(lead.agent.id, 'read')
    try {
      const operations = (await stored.read(0)).filter(event => event.type === 'team/native-operation/committed')
      for (const originalPhase of phase === 'query-resume' ? ['query-new', phase] : [phase]) {
        for (const kind of ['message', 'final']) {
          assert.equal(operations.filter(event => event.data.message?.content[0]?.text === `Installed Claude ${kind} ${originalPhase}.`).length, 1)
        }
      }
    } finally { await stored.close() }
  }
  await loaderFiber.dispose()
  assert.equal(native.live.size, 0)
  console.log(JSON.stringify({ phase, backend, package: runtimeEntry.name, profileRevision: 1,
    memberId: member.id, nativeRuntimeHandle: member.externalRuntime.nativeHandle, turns: workCount(), memberOperations: teamTools ? 6 : 0,
    preserved: true, registrationsReleased: true, nativeBoundary: 'controlled-sdk' }))
} finally {
  await ctx.fiber.dispose()
  assert.equal(native.live.size, 0)
  sdkHook.deregister()
  delete globalThis[boundaryKey]
}
