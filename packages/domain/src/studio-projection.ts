import { DigitalEmployeeHostContext } from './host-context.ts'
import { ProfileLifecycle } from './profile-lifecycle.ts'
import { EvaluationWorkflow } from './evaluation-workflow.ts'
import { TEAM_OWN_TOOL_NAMES } from './profile-capabilities.ts'
import { authorityRemoteError } from './host-errors.ts'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { SessionId } from '@deepseek-ai/dsh-session'
import { snapshotRequiredCapabilities } from './runtime.ts'
import { legacyInheritLeadRuntimeTarget, type DigitalEmployeeBindingV1 } from './storage.ts'
import { bindingRuntimePresence } from './launch.ts'
import type {
  DigitalEmployeeInstanceView,
  DigitalEmployeeRunIndexRecord,
  DigitalEmployeeStudioView,
  DigitalEmployeeStudioFrame,
  ProfileToolOption,
} from './types.ts'
import { StudioSnapshotFeed } from './studio-feed.ts'
import { summarizeEvalRun } from './evaluation.ts'

function snapshotRunIndex(run: DigitalEmployeeRunIndexRecord): DigitalEmployeeRunIndexRecord {
  return Object.freeze({
    ...run,
    canonicalSource: Object.freeze({ ...run.canonicalSource }),
    owner: Object.freeze({ ...run.owner }),
    selectedRuntimeTarget: run.selectedRuntimeTarget.kind === 'legacy-inherit-lead'
      ? legacyInheritLeadRuntimeTarget
      : Object.freeze({ ...run.selectedRuntimeTarget }),
    ...(run.actualRuntimeTarget === undefined
      ? {}
      : { actualRuntimeTarget: Object.freeze({ ...run.actualRuntimeTarget }) }),
    ...(run.usage === undefined ? {} : { usage: Object.freeze({ ...run.usage }) }),
    completeness: Object.freeze({
      ...run.completeness,
      redactions: Object.freeze([...run.completeness.redactions]),
    }),
  })
}

export function snapshotInstance(host: DigitalEmployeeHostContext, caller: Agent, binding: DigitalEmployeeBindingV1): DigitalEmployeeInstanceView {
  const rosterMember = binding.memberId === undefined
    ? undefined
    : host.ctx.agentTeams.listMembers(caller).find(member =>
        member.id === binding.memberId && member.name === binding.memberName)
  return Object.freeze({
    teamId: binding.teamId,
    memberName: binding.memberName,
    ...(binding.memberId === undefined ? {} : { memberId: binding.memberId }),
    ...(binding.launchRequestId === undefined ? {} : { launchRequestId: binding.launchRequestId }),
    profileId: binding.profileId,
    profileRevision: binding.profileRevision,
    runtimeTarget: binding.runtimeTarget.kind === 'legacy-inherit-lead'
      ? legacyInheritLeadRuntimeTarget
      : Object.freeze({ ...binding.runtimeTarget }),
    ...(binding.resolvedRuntimeTarget === undefined
      ? {}
      : { resolvedRuntimeTarget: Object.freeze({ ...binding.resolvedRuntimeTarget }) }),
    ...(binding.nativeRuntimeHandle === undefined
      ? {}
      : { nativeRuntimeHandle: binding.nativeRuntimeHandle }),
    requiredCapabilities: snapshotRequiredCapabilities(binding.requiredCapabilities),
    provisioningPhase: binding.provisioningPhase,
    runtimeAvailability: host.runtimeBackends.availability(
      binding.profile,
      binding.runtimeTarget,
      binding.requiredCapabilities,
    ),
    runtimePresence: binding.runtimeTarget.kind === 'external-agent'
      && binding.nativeRuntimeHandle !== undefined
      ? rosterMember?.status === 'running' || rosterMember?.status === 'idle'
        ? rosterMember.status
        : 'inactive'
      : bindingRuntimePresence(
        binding,
        binding.memberId === undefined ? undefined : host.ctx.agents.get(SessionId(binding.memberId)),
      ),
    ...(binding.error === undefined ? {} : { error: binding.error }),
  })
}

/** Owns complete browser-safe snapshots and their replaceable stream generation. */
export class StudioProjection {
  private readonly snapshots = new StudioSnapshotFeed<DigitalEmployeeStudioView>()

  constructor(
    private readonly host: DigitalEmployeeHostContext,
    private readonly profiles: ProfileLifecycle,
    private readonly evaluationWorkflow: EvaluationWorkflow,
  ) {}

  invalidate(): void { this.snapshots.invalidate() }

  close(): void { this.snapshots.close() }

  follow(caller: Agent, signal: AbortSignal): AsyncIterable<DigitalEmployeeStudioFrame> {
    return this.snapshots.follow(() => this.view(caller), signal)
  }

  /** Build the complete replaceable Studio view for one exact live Team Lead. */
  view(caller: Agent): DigitalEmployeeStudioView {
    const authorityFailure = this.host.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) throw authorityRemoteError(authorityFailure, 'view')
    const membership = this.host.ctx.agentTeams.membership(caller)
    const profiles = [...this.host.storage.profileHeadEntries()]
      .map(([, head]) => this.profiles.catalogEntry(caller, membership.id, head))
      .sort((left, right) => left.latest.profile.displayName.localeCompare(right.latest.profile.displayName)
        || left.head.profileId.localeCompare(right.head.profileId))
    const tools: ProfileToolOption[] = this.host.ctx.tools.schemas(caller)
      .filter(tool => !TEAM_OWN_TOOL_NAMES.has(tool.name))
      .map(tool => Object.freeze({ name: tool.name, description: tool.description }))
      .sort((left, right) => left.name.localeCompare(right.name))
    const instances = [...this.host.storage.bindingEntries()]
      .map(([, binding]) => binding)
      .filter(binding => binding.teamId === membership.id)
      .map(binding => snapshotInstance(this.host, caller, binding))
      .sort((left, right) => left.memberName.localeCompare(right.memberName))
    const runs = [...this.host.storage.runEntries()]
      .map(([, run]) => run)
      .filter(run => run.teamId === membership.id)
      .sort((left, right) => right.startedAt - left.startedAt || right.runId.localeCompare(left.runId))
      .map(snapshotRunIndex)
    const evalSets = [...this.host.storage.evalSetHeadEntries()]
      .map(([, head]) => this.evaluationWorkflow.catalogEntry(head))
      .sort((left, right) => left.latest.evalSet.displayName.localeCompare(right.latest.evalSet.displayName)
        || left.head.evalSetId.localeCompare(right.head.evalSetId))
    const evalRuns = [...this.host.storage.evalRunEntries()]
      .map(([, run]) => run)
      .filter(run => run.teamId === membership.id)
      .sort((left, right) => right.startedAt - left.startedAt
        || right.evalRunId.localeCompare(left.evalRunId))
      .map(summarizeEvalRun)
    const historicalTargets = profiles.flatMap(entry =>
      [...this.host.storage.profileRevisionEntries(entry.head.profileId)]
        .map(([, revision]) => revision.runtimeTarget))
    for (const [, binding] of this.host.storage.bindingEntries()) {
      if (binding.teamId === membership.id) historicalTargets.push(binding.runtimeTarget)
    }
    for (const run of evalRuns) historicalTargets.push(run.runtimeTarget)
    return Object.freeze({
      profiles: Object.freeze(profiles),
      runtimeCatalog: this.host.runtimeBackends.snapshot(historicalTargets),
      tools: Object.freeze(tools),
      instances: Object.freeze(instances),
      runs: Object.freeze(runs),
      evalSets: Object.freeze(evalSets),
      evalRuns: Object.freeze(evalRuns),
    })
  }
}
