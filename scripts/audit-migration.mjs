#!/usr/bin/env node
/** Operator-only, read-only audit of the fixed Phase A source formats. */
import { join, resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { requirePreparedHarness } from './harness-source.mjs'
import { migrationPlan } from './migration-audit-plan.mjs'
import { digest, files, imported, readCheckpoints, readJsonUnits, readSqliteUnits, readSessions, refuse, snapshotSqlite, sqliteFiles, validateUnits } from './migration-audit-input.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let sqlite
try {
  const options = new Map()
  const args = process.argv.slice(2)
  for (let index = 0; index < args.length; index += 2) {
    if (!['--sessions', '--json', '--sqlite'].includes(args[index]) || !args[index + 1] || options.has(args[index])) {
      refuse('AUDIT_ARGUMENTS', 'Use --sessions <Session root> and either --json <storage root> or --sqlite <database>')
    }
    options.set(args[index], resolve(args[index + 1]))
  }
  if (!options.has('--sessions') || options.has('--json') === options.has('--sqlite')) refuse('AUDIT_ARGUMENTS', 'Both Session and storage roots are required')
  const { harnessRoot, lock, proof } = requirePreparedHarness(root)
  const sourcePaths = () => [
    ...files(options.get('--sessions')).map(path => [`sessions/${relative(options.get('--sessions'), path)}`, path]),
    ...(options.has('--json')
      ? files(options.get('--json')).map(path => [`json/${relative(options.get('--json'), path)}`, path])
      : sqliteFiles(options.get('--sqlite')).map(path => [`sqlite/source${path.slice(options.get('--sqlite').length)}`, path])),
  ].sort(([left], [right]) => left.localeCompare(right))
  const before = digest(sourcePaths())
  if (options.has('--sqlite')) sqlite = snapshotSqlite(options.get('--sqlite'))
  const [storage, { digitalEmployeeDomainSpec }, runtime] = await Promise.all([
    imported(join(root, 'packages/domain/lib/types/storage.js')),
    imported(join(root, 'packages/domain/lib/types/spec.js')),
    imported(join(root, 'packages/domain/lib/types/runtime.js')),
  ])
  const specs = [digitalEmployeeDomainSpec, storage.digitalEmployeeV1DomainSpec]
  const units = options.has('--json')
    ? readJsonUnits(options.get('--json'), specs) : readSqliteUnits(sqlite.path, specs)
  validateUnits(units)
  const cached = options.has('--json') ? readCheckpoints(options.get('--json'), 'json') : readCheckpoints(sqlite.path, 'sqlite')
  const { sessions, checkpoints, nativeCorrelations } = await readSessions(options.get('--sessions'), harnessRoot, cached)
  const observedV1 = units.get('agent_team_ultra_v1')
  const v0 = units.get('agent_team_ultra')
  const v1 = { tables: Object.fromEntries(Object.keys(storage.digitalEmployeeV1DomainSpec.tables)
    .map(name => [name, { ...observedV1?.tables[name] }])) }
  const ultraMigration = {
    status: observedV1?.global?.status === 'complete' ? 'complete' : observedV1 ? 'pending' : v0 ? 'required' : 'empty',
    sourceVersion: v0 ? 0 : null, targetVersion: 1,
  }
  try {
    for (const [key, revision] of Object.entries(v1.tables.profile_revisions)) {
      v1.tables.profile_revisions[key] = storage.projectDigitalEmployeeProfileRevision(key, revision)
    }
  } catch { refuse('AUDIT_ULTRA_CONFLICT', 'A Profile Revision has inconsistent identity, required capabilities or fingerprint') }
  if (ultraMigration.status !== 'complete' && v0) {
    const merge = (table, key, value) => {
      if (Object.hasOwn(v1.tables[table], key) && !isDeepStrictEqual(v1.tables[table][key], value)) {
        refuse('AUDIT_MIGRATION_CONFLICT', 'An incomplete target differs from the deterministic source projection')
      }
      Object.defineProperty(v1.tables[table], key, { value, enumerable: true, configurable: true })
    }
    for (const [key, profile] of Object.entries(v0.tables.profiles ?? {}).sort()) {
      if (key !== profile.id) refuse('AUDIT_ULTRA_CONFLICT', 'A legacy Profile key conflicts with its identity')
      merge('profile_revisions', storage.profileRevisionKey(profile.id, profile.revision), storage.projectLegacyProfileRevision(profile))
      merge('profile_heads', profile.id, storage.projectLegacyProfileHead(profile))
    }
    for (const [key, binding] of Object.entries(v0.tables.bindings ?? {}).sort()) {
      if (key !== JSON.stringify([binding.teamId, binding.memberName])) refuse('AUDIT_ULTRA_CONFLICT', 'A legacy Binding key conflicts with its identity')
      const targetKey = storage.digitalEmployeeBindingKey(binding.teamId, binding.memberName)
      merge('bindings', targetKey, storage.projectLegacyBinding(binding, v1.tables.bindings[targetKey]?.runtimeTarget))
    }
  }
  try {
    storage.assertDigitalEmployeeV1Consistency(Object.fromEntries(Object.keys(storage.digitalEmployeeV1DomainSpec.tables)
      .map(name => [name, new Map(Object.entries(v1.tables[name]))])))
  } catch { refuse('AUDIT_ULTRA_CONFLICT', 'Ultra records contain inconsistent identities, immutable references or fingerprints') }
  for (const binding of Object.values(v1?.tables.bindings ?? {})) {
    const member = sessions.get(binding.teamId)?.team.members.find(row => row.name === binding.memberName)
    if ((binding.memberId !== undefined && member?.id !== binding.memberId)
      || (binding.provisioningPhase === 'active' && member?.phase !== 'active')) {
      refuse('AUDIT_BINDING_IDENTITY', 'A Binding conflicts with its authoritative Team member')
    }
    if (member && binding.resolvedRuntimeTarget?.kind === 'dsh-model') {
      const { kind, ...resolvedRoute } = binding.resolvedRuntimeTarget
      if (!isDeepStrictEqual(resolvedRoute, member.resolvedRoute)) {
        refuse('AUDIT_BINDING_ROUTE', 'A Binding conflicts with the resolved route in the Team log')
      }
    }
    if (member && (member.externalRuntime || binding.runtimeTarget.kind === 'external-agent')) {
      const external = member.externalRuntime
      if (binding.runtimeTarget.kind !== 'external-agent' || !external
        || binding.runtimeTarget.provider !== member.provider
        || binding.launchRequestId !== external.launchRequestId
        || !isDeepStrictEqual(external.requirements, {
          ...binding.requiredCapabilities, runtimeCapabilities: runtime.requiredRuntimeCapabilitiesForProfile(binding.profile),
        })
        || (binding.nativeRuntimeHandle !== undefined && binding.nativeRuntimeHandle !== external.nativeHandle)
        || (binding.provisioningPhase === 'active' && binding.nativeRuntimeHandle === undefined)) {
        refuse('AUDIT_NATIVE_IDENTITY', 'A Binding conflicts with the provider, launch request or native handle in the Team log')
      }
    }
  }
  const bindings = Object.values(v1?.tables.bindings ?? {}).map(binding => ({
    teamId: binding.teamId, memberName: binding.memberName, memberId: binding.memberId,
    launchRequestId: binding.launchRequestId, profileId: binding.profileId, profileRevision: binding.profileRevision,
    runtimeTarget: binding.runtimeTarget, nativeRuntimeHandle: binding.nativeRuntimeHandle,
  }))
  if (before !== digest(sourcePaths())) refuse('AUDIT_SOURCE_CHANGED', 'The source changed during audit; retry against a quiescent snapshot')
  console.log(JSON.stringify({
    ok: true,
    sourceFormats: { session: 0, teamEvent: 2, teamProjection: 3, ultraDomain: observedV1 ? 'agent_team_ultra_v1' : v0 ? 'agent_team_ultra' : null, ultraVersion: observedV1 ? 1 : v0 ? 0 : null },
    sourceDigest: before,
    sourceCompatibility: {
      repository: proof.repository, commit: proof.commit, version: proof.version, docsDigest: proof.docsDigest,
      extensionApi: lock.compatibility.extensionApi, nativeProducts: lock.compatibility.nativeProducts,
    },
    ultraGenerations: [...units.values()].map(unit => ({ name: unit.spec.name, version: unit.spec.version })),
    ultraMigration,
    sessionCount: sessions.size,
    checkpoints,
    nativeCorrelations,
    bindings,
    migration: {
      ...migrationPlan,
      targetCompatibility: { officialFoundation: lock.compatibility.officialComparison, integrationCommit: null, qualified: false },
    },
  }, null, 2))
} catch (error) {
  console.log(JSON.stringify({ ok: false, code: error.code?.startsWith('AUDIT_') ? error.code : 'AUDIT_UNREADABLE_SOURCE',
    message: error.code?.startsWith('AUDIT_') ? error.message : 'The source cannot be read with the qualified format and schemas', sourcePreserved: true }))
  process.exitCode = 1
} finally {
  sqlite?.dispose()
}
