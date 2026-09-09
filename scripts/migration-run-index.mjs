/** Rebuild derived Run rows without starting Agents, models or native processes. */
import { join } from 'node:path'
import { imported, refuse } from './migration-audit-input.mjs'

export async function rebuildMigrationRuns(ultra, logs, ultraRoot) {
  const [{ foldDshRunEvidence }, { externalRunIndexesFromTeamEvents, runFoldBinding }, { resolveConfig }] = await Promise.all([
    imported(join(ultraRoot, 'packages/domain/lib/types/run.js')),
    imported(join(ultraRoot, 'packages/domain/lib/types/run-binding.js')),
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
    const persist = async record => {
      await ultra.putRun(record, retention)
      rebuilt.add(record.runId)
    }
    if (binding.runtimeTarget.kind === 'dsh-model') {
      const log = byId.get(binding.memberId)
      if (!log) refuse('MIGRATION_RUN_SOURCE_MISSING', 'A Run Binding has no authoritative child Session')
      for (const run of foldDshRunEvidence(runFoldBinding(binding), binding.memberId,
        log.events.slice(log.inheritedEventCount), maxRunEvidenceItems, retention)) {
        await persist(run.index)
      }
    } else if (binding.runtimeTarget.kind === 'external-agent' && binding.nativeRuntimeHandle !== undefined) {
      const log = byId.get(binding.teamId)
      if (!log) refuse('MIGRATION_RUN_SOURCE_MISSING', 'A native Run Binding has no authoritative Team Session')
      const events = log.events.slice(log.inheritedEventCount)
      for (const run of externalRunIndexesFromTeamEvents(binding, events)) await persist(run)
    }
  }
  return rebuilt.size
}
