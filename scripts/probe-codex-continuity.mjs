/** Exercise installed archives through Loader, generated Remote, durable storage and the native transport boundary. */
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import yaml from 'js-yaml'
import { requirePreparedHarness } from './harness-source.mjs'
import { NativeProduct } from '../packages/codex/tests/fixtures/native-product.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { harnessRoot } = requirePreparedHarness(root)
const [profileDirectory, phase, stateDirectory, backend = 'json'] = process.argv.slice(2)
assert.ok(profileDirectory && stateDirectory && ['before', 'after'].includes(phase))
assert.ok(['json', 'sqlite'].includes(backend))
mkdirSync(stateDirectory, { recursive: true })
const installed = createRequire(join(profileDirectory, 'package.json'))
const imported = name => import(pathToFileURL(installed.resolve(name)).href)
const harness = path => import(pathToFileURL(join(harnessRoot, path, 'lib/index.js')).href)
await imported('@benz-ai-x/dsh-agent-team-ultra-profile')
const patches = yaml.load(readFileSync(installed.resolve('@benz-ai-x/dsh-agent-team-ultra-profile/cordis.patch.yml'), 'utf8'))
const entries = patches.flatMap(patch => patch.insert ?? []).flatMap(entry => entry.group ? entry.config : [entry])
const runtimeEntry = entries.find(entry => entry.id === 'agent-team-codex')
const hostEntry = entries.find(entry => entry.id === 'agent-team-ultra')
assert.ok(runtimeEntry && hostEntry)
assert.equal(runtimeEntry.name, phase === 'before'
  ? '@deepseek-ai/dsh-experimental-agent-team-codex' : '@benz-ai-x/dsh-agent-team-codex')
const runtimeRequire = createRequire(installed.resolve(runtimeEntry.name))
const sdkManifestPath = runtimeRequire.resolve('@openai/codex/package.json')
const sdkManifest = JSON.parse(readFileSync(sdkManifestPath, 'utf8'))
assert.equal(sdkManifest.version, '0.149.1')
const native = new NativeProduct(join(stateDirectory, 'native.json'), resolve(dirname(sdkManifestPath), sdkManifest.bin.codex))
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
  resolveExecutable() { throw new Error('Codex must not search PATH') }
  spawnTerminal() { throw new Error('Codex must use the qualified app-server transport') }
  spawn(spec) { return native.open(spec) }
}
const ctx = new Context()
const identity = instance => Object.fromEntries([
  'teamId', 'memberName', 'memberId', 'launchRequestId', 'profileId', 'profileRevision',
  'runtimeTarget', 'resolvedRuntimeTarget', 'nativeRuntimeHandle', 'requiredCapabilities', 'provisioningPhase',
].map(key => [key, instance[key]]))
const request = { launchRequestId: '55555555-5555-4555-8555-555555555555', profileId: 'codex-reviewer', assignment: 'Review this immutable change.' }
const checkpointPath = join(stateDirectory, 'checkpoint.json')
const checkpoint = phase === 'after' ? JSON.parse(readFileSync(checkpointPath, 'utf8')) : undefined
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
  const lead = phase === 'before'
    ? await ctx.agents.create({ sessionId: SessionId('codex-upgrade-lead') })
    : await ctx.agents.resume({ resumeSessionId: SessionId('codex-upgrade-lead') })
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
  assert.equal(view.runtimeCatalog.backends.filter(row => row.provider === 'codex' && row.availability === 'available').length, 1)
  if (phase === 'before') {
    const saved = await invoke('save', { expectedHeadRevision: null, runtimeTarget: { kind: 'external-agent', provider: 'codex' }, profile: {
      id: 'codex-reviewer', employeeName: 'codex-reviewer', displayName: 'Codex reviewer', description: 'Retain the original employee.',
      continuationProvider: '', contextMode: 'fresh', persona: 'Review carefully.', mission: 'Report findings.',
      toolPolicy: { mode: 'inherit', names: [] }, context: [], memory: [], hooks: [],
    } })
    assert.equal(saved.ok, true, JSON.stringify(saved))
    const activated = await invoke('activate', { profileId: request.profileId, revision: 1, expectedHeadRevision: 1 })
    assert.equal(activated.ok, true, JSON.stringify(activated))
  }
  const launched = await invoke('spawn', request)
  assert.equal(launched.ok, true, JSON.stringify(launched))
  assert.equal(launched.value.profileRevision, 1)
  assert.ok(launched.value.nativeRuntimeHandle)
  native.complete()
  const live = await until(current, value => value.instances[0]?.runtimePresence === 'idle')
  if (checkpoint) assert.deepEqual(identity(live.instances[0]), checkpoint.identity)
  const member = ctx.agentTeams.listMembers(lead.agent).find(row => row.name === 'codex-reviewer')
  assert.equal(member.id, live.instances[0].memberId)
  assert.equal(member.externalRuntime.nativeHandle, live.instances[0].nativeRuntimeHandle)
  const sent = await ctx.agentTeams.sendMessage(lead.agent, {
    target: 'codex-reviewer', content: [{ type: 'text', text: `Follow-up ${phase} package upgrade.` }],
    signal: new AbortController().signal,
  })
  assert.equal(sent.status, 'accepted', JSON.stringify(sent))
  native.complete()
  await until(current, value => value.instances[0]?.runtimePresence === 'idle')
  assert.equal(Object.keys(native.data.threads).length, 1)
  const thread = native.data.threads[live.instances[0].nativeRuntimeHandle]
  assert.equal(thread.turns.length, phase === 'before' ? 2 : 3)
  assert.equal(native.starts, phase === 'before' ? 1 : 0)
  if (phase === 'before') writeFileSync(checkpointPath, `${JSON.stringify({ identity: identity(live.instances[0]) }, null, 2)}\n`)
  await ctx.loader.remove('agent-team-codex')
  assert.equal(native.live.size, 0)
  const removed = await current()
  assert.equal(removed.runtimeCatalog.backends.filter(row => row.provider === 'codex' && row.availability === 'available').length, 0)
  assert.deepEqual(identity(removed.instances[0]), identity(live.instances[0]))
  await assert.rejects(ctx.agentTeams.readTeammateRuntimeEvidence(lead.agent, 'codex-reviewer', {
    limit: 10, signal: new AbortController().signal,
  }), error => error.code === 'TEAM_RUNTIME_UNAVAILABLE')
  await ctx.loader.root.update([loaderRow(hostEntry), loaderRow(runtimeEntry)])
  await ctx.loader.await()
  const restored = await until(current, value => value.instances[0]?.runtimePresence === 'idle')
  assert.deepEqual(identity(restored.instances[0]), identity(live.instances[0]))
  assert.equal(Object.keys(native.data.threads).length, 1)
  await loaderFiber.dispose()
  assert.equal(native.live.size, 0)
  console.log(JSON.stringify({ phase, backend, package: runtimeEntry.name, profileRevision: 1,
    memberId: member.id, nativeRuntimeHandle: member.externalRuntime.nativeHandle, turns: thread.turns.length,
    preserved: true, registrationsReleased: true, nativeBoundary: 'controlled-app-server' }))
} finally {
  await ctx.fiber.dispose()
  assert.equal(native.live.size, 0)
}
