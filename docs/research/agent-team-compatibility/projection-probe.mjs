import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const [officialRoot, forkRoot] = process.argv.slice(2)
const load = async root => (await import(pathToFileURL(join(root, 'packages/experimental/agent-team/src/projection.ts')).href)).teamProjectionDefinition
const official = await load(officialRoot)
const fork = await load(forkRoot)
const root = 'compat-team'
const header = { version: 2, id: root, createdAt: 0, isSeeded: false }
const base = { id: 'compat-child', name: 'worker', description: 'compatibility fixture', provider: 'spawn', context: 'fresh', phase: 'provisioning' }
const event = (type, data, seq) => ({ type, data: { version: 2, teamId: root, ...data }, seq, time: seq })
const members = (initial, active) => [event('team/member', { member: initial }, 0), event('team/member', { member: { ...initial, phase: 'active', ...active } }, 1)]
const baseline = members(base, {})
const route = { provider: 'fixture-model-provider', model: 'fixture-model' }
const external = {
  kind: 'external-agent', launchRequestId: '11111111-1111-4111-8111-111111111111',
  requestFingerprint: 'a'.repeat(64),
  requirements: { contextMode: 'fresh', profileCapabilities: ['persona', 'mission'], runtimeCapabilities: [] },
}
const cases = {
  ordinary_team: baseline,
  pinned_dsh_route: members({ ...base, requestedRoute: route }, { resolvedRoute: route }),
  external_runtime: members({ ...base, provider: 'fixture-native', externalRuntime: external }, {
    externalRuntime: { ...external, nativeHandle: 'fixture-native-handle', initialTurnId: 'fixture-native-turn' },
  }),
  native_delivery_receipt: [...baseline,
    event('team/message/queued', { message: { id: 'fixture-message', senderId: root, senderName: 'lead', targetId: base.id, content: [{ type: 'text', text: 'fixture' }] } }, 2),
    event('team/message/delivered', { messageId: 'fixture-message', targetId: base.id, nativeTurnId: 'fixture-native-turn' }, 3),
  ],
}
const project = (definition, events) => events.reduce((state, item) => definition.apply(state, structuredClone(item)), definition.init(header))
const results = []
for (const [name, events] of Object.entries(cases)) {
  const current = project(fork, events)
  const upstream = project(official, events)
  assert.equal(current.failure, undefined, `${name} must be valid on the locked fork`)
  if (name === 'ordinary_team') assert.equal(upstream.failure, undefined)
  else assert.match(upstream.failure, /persisted Agent Teams .* payload is invalid/)
  const checkpoint = official.stateSchema.safeParse(structuredClone(current))
  results.push({ case: name, fork: 'accepted', official: upstream.failure ?? 'accepted', officialAcceptsForkCheckpoint: checkpoint.success })
}
console.log(JSON.stringify({ officialStateVersion: official.stateVersion, forkStateVersion: fork.stateVersion, results }, null, 2))
