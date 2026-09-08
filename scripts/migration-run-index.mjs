/** Rebuild derived Run rows without starting Agents, models or native processes. */
import { join } from 'node:path'
import { imported, refuse } from './migration-audit-input.mjs'

export async function rebuildMigrationRuns(ultra, logs, ultraRoot) {
  const [{ createExternalRunIndex, foldDshRunEvidence }, { profileContentFingerprint }, { resolveConfig }] = await Promise.all([
    imported(join(ultraRoot, 'packages/domain/lib/types/run.js')),
    imported(join(ultraRoot, 'packages/domain/lib/types/storage.js')),
    imported(join(ultraRoot, 'packages/domain/lib/types/configuration.js')),
  ])
  const byId = new Map(logs.map(log => [log.header.id, log]))
  // Migration must not trim retained history merely because the next Host may
  // choose a smaller operational retention limit. Evidence remains bounded by
  // the Host's default timeline limit; no raw timeline is persisted here.
  const retention = Math.max(1, [...ultra.runEntries()].length + logs.reduce((count, log) => count + log.events.length, 0))
  const { maxRunEvidenceItems } = resolveConfig({})
  const rebuilt = new Set()
  for (const [, binding] of [...ultra.bindingEntries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (binding.provisioningPhase !== 'active' || binding.memberId === undefined) continue
    const { revision: _revision, createdAt: _createdAt, updatedAt: _updatedAt, ...profile } = binding.profile
    const owner = {
      teamId: binding.teamId,
      owner: { kind: 'team-member', memberId: binding.memberId, memberName: binding.memberName },
      profileId: binding.profileId, profileRevision: binding.profileRevision,
      profileFingerprint: binding.profileFingerprint ?? profileContentFingerprint(profile, binding.runtimeTarget, binding.requiredCapabilities),
      selectedRuntimeTarget: binding.runtimeTarget,
      ...(binding.resolvedRuntimeTarget === undefined ? {} : { actualRuntimeTarget: binding.resolvedRuntimeTarget }),
      capabilityGeneration: binding.capabilityGeneration ?? 0,
    }
    const persist = async record => {
      await ultra.putRun(record, retention)
      rebuilt.add(record.runId)
    }
    if (binding.runtimeTarget.kind === 'dsh-model') {
      const log = byId.get(binding.memberId)
      if (!log) refuse('MIGRATION_RUN_SOURCE_MISSING', 'A Run Binding has no authoritative child Session')
      for (const run of foldDshRunEvidence(owner, binding.memberId, log.events.slice(log.inheritedEventCount), maxRunEvidenceItems, retention)) {
        await persist(run.index)
      }
    } else if (binding.runtimeTarget.kind === 'external-agent' && binding.nativeRuntimeHandle !== undefined) {
      const log = byId.get(binding.teamId)
      if (!log) refuse('MIGRATION_RUN_SOURCE_MISSING', 'A native Run Binding has no authoritative Team Session')
      const events = log.events.slice(log.inheritedEventCount)
      const native = { ...owner, nativeHandle: binding.nativeRuntimeHandle }
      const active = events.findLast(event => event.type === 'team/member'
        && event.data.member.id === binding.memberId && event.data.member.phase === 'active'
        && event.data.member.externalRuntime?.nativeHandle === binding.nativeRuntimeHandle)
      if (active) {
        const turn = active.data.member.externalRuntime?.initialTurnId
        const identity = turn ?? (binding.launchRequestId === undefined ? undefined : `launch:${binding.launchRequestId}`)
        if (identity !== undefined) await persist(createExternalRunIndex(native, identity, turn, active.time))
      }
      for (const event of events) {
        if (event.type !== 'team/message/delivered' || event.data.targetId !== binding.memberId) continue
        await persist(createExternalRunIndex(native,
          event.data.nativeTurnId ?? `message:${event.data.messageId}`, event.data.nativeTurnId, event.time))
      }
    }
  }
  return rebuilt.size
}
