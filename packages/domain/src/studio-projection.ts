import { DigitalEmployeeHostContext } from './host-context.ts'
import { ProfileLifecycle } from './profile-lifecycle.ts'
import { EvaluationWorkflow } from './evaluation-workflow.ts'
import { TEAM_OWN_TOOL_NAMES } from './profile-capabilities.ts'
import { authorityRemoteError } from './host-errors.ts'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { TeamMemberView } from '@deepseek-ai/dsh-experimental-agent-team'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { SessionId } from '@deepseek-ai/dsh-session'
import { runtimeTargetRoutingId, snapshotRequiredCapabilities } from './runtime.ts'
import { legacyInheritLeadRuntimeTarget, type DigitalEmployeeBindingV1 } from './storage.ts'
import { bindingRuntimePresence } from './launch.ts'
import type {
  DigitalEmployeeInstanceView,
  DigitalEmployeeRunIndexRecord,
  DigitalEmployeeRuntimeBackend,
  DigitalEmployeeRuntimeCatalog,
  DigitalEmployeeRuntimePresence,
  DigitalEmployeeStudioView,
  DigitalEmployeeStudioFrame,
  DigitalEmployeeTeamMemberRuntimeView,
  DigitalEmployeeTeamMemberView,
  ProfileToolOption,
  SelectableDigitalEmployeeRuntimeTarget,
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
    ...(binding.error === undefined ? {} : { error: 'Teammate provisioning failed.' }),
  })
}

function snapshotOrdinaryRuntimeTarget(
  member: ReturnType<DigitalEmployeeHostContext['ctx']['agentTeams']['listMembers']>[number],
  route: typeof member.requestedRoute,
  includeExternalReservation: boolean,
): SelectableDigitalEmployeeRuntimeTarget | undefined {
  if (member.externalRuntime !== undefined && member.provider !== undefined
    && (includeExternalReservation || member.externalRuntime.nativeHandle !== undefined)) {
    return Object.freeze({ kind: 'external-agent', provider: member.provider })
  }
  if (route?.provider === undefined || route.model === undefined) return undefined
  return Object.freeze({
    kind: 'dsh-model',
    provider: route.provider,
    model: route.model,
    ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: String(route.reasoningEffort) }),
  })
}

function memberProvisioningPhase(
  status: ReturnType<DigitalEmployeeHostContext['ctx']['agentTeams']['listMembers']>[number]['status'],
): DigitalEmployeeTeamMemberView['provisioningPhase'] {
  if (status === 'provisioning') return 'pending'
  if (status === 'failed') return 'failed'
  return 'active'
}

function memberRuntimePresence(
  status: ReturnType<DigitalEmployeeHostContext['ctx']['agentTeams']['listMembers']>[number]['status'],
): DigitalEmployeeRuntimePresence {
  return status === 'running' || status === 'idle' ? status : 'inactive'
}

function backendForTarget(
  catalog: DigitalEmployeeRuntimeCatalog,
  target: SelectableDigitalEmployeeRuntimeTarget | undefined,
): DigitalEmployeeRuntimeBackend | undefined {
  return target === undefined
    ? undefined
    : catalog.backends.find(candidate => candidate.routingId === runtimeTargetRoutingId(target))
}

function hasNativeCollaboration(member: TeamMemberView): boolean {
  return (['members.list', 'tasks.list', 'tasks.get', 'messages.send', 'tasks.update', 'wait'] as const)
    .every(operation => member.memberOperations?.includes(operation))
}

function ordinaryRuntimeAvailability(
  member: ReturnType<DigitalEmployeeHostContext['ctx']['agentTeams']['listMembers']>[number],
  backend: DigitalEmployeeRuntimeBackend | undefined,
): DigitalEmployeeTeamMemberView['runtimeAvailability'] {
  if (backend?.availability === 'unsupported') return 'capability-mismatch'
  if (backend?.availability !== 'available') return 'unavailable'
  const required = member.externalRuntime?.requirements
  if (required !== undefined && (
    !backend.contextModes.includes(required.contextMode)
    || required.profileCapabilities.some(capability => !backend.profileCapabilities.includes(capability))
    || required.runtimeCapabilities.some(capability => !backend.runtimeCapabilities.includes(capability))
    || (member.externalRuntime?.nativeHandle !== undefined
      && required.runtimeCapabilities.includes('full-collaboration') && !hasNativeCollaboration(member))
  )) return 'capability-mismatch'
  return 'available'
}

function runtimeFacts(
  host: DigitalEmployeeHostContext,
  member: ReturnType<DigitalEmployeeHostContext['ctx']['agentTeams']['listMembers']>[number],
  backend: DigitalEmployeeRuntimeBackend | undefined,
  runtimeAvailability: DigitalEmployeeTeamMemberView['runtimeAvailability'],
): DigitalEmployeeTeamMemberRuntimeView {
  const declaredFull = backend?.runtimeCapabilities.includes('full-collaboration') === true
  const operations = member.memberOperations
  const dshAgent = member.externalRuntime === undefined ? host.ctx.agents.get(member.id) : undefined
  const dshTools = dshAgent?.ctx.tools.schemas(dshAgent).map(tool => tool.name)
  const collaborationStatus = backend === undefined
    || (member.externalRuntime !== undefined && operations === undefined)
    || (member.externalRuntime === undefined && dshTools === undefined)
    ? 'unknown'
    : declaredFull && (member.externalRuntime === undefined
      ? ['list_agents', 'team_task_list', 'team_task_get', 'send_message', 'team_task_update', 'wait_agent']
        .every(name => dshTools?.includes(name))
      : hasNativeCollaboration(member)) ? 'full' : 'limited'
  return Object.freeze({
    ...(member.context === undefined ? {} : { contextMode: member.context }),
    provisioningPhase: memberProvisioningPhase(member.status),
    runtimeAvailability,
    runtimePresence: memberRuntimePresence(member.status),
    collaborationStatus,
    supportedContextModes: Object.freeze([...(backend?.contextModes ?? [])]),
    profileCapabilities: Object.freeze([...(backend?.profileCapabilities ?? [])]),
    runtimeCapabilities: Object.freeze((backend?.runtimeCapabilities ?? [])
      .filter(capability => capability !== 'full-collaboration' || collaborationStatus === 'full')),
  })
}

function snapshotTeamMembers(
  host: DigitalEmployeeHostContext,
  roster: ReturnType<DigitalEmployeeHostContext['ctx']['agentTeams']['listMembers']>,
  teamId: string,
  catalog: DigitalEmployeeRuntimeCatalog,
  instances: readonly DigitalEmployeeInstanceView[],
): readonly DigitalEmployeeTeamMemberView[] {
  return Object.freeze(roster
    .filter(member => member.role === 'teammate')
    .map((member): DigitalEmployeeTeamMemberView => {
      const instance = instances.find(candidate =>
        candidate.memberId === member.id && candidate.memberName === member.name)
      if (instance !== undefined) {
        const backend = backendForTarget(catalog, instance.resolvedRuntimeTarget
          ?? (instance.runtimeTarget.kind === 'legacy-inherit-lead' ? undefined : instance.runtimeTarget))
        return Object.freeze({
          ...runtimeFacts(host, member, backend, instance.runtimeAvailability),
          provisioningPhase: instance.provisioningPhase,
          binding: 'profile-bound',
          teamId,
          memberId: member.id,
          memberName: member.name,
          profileId: instance.profileId,
          profileRevision: instance.profileRevision,
          selectedRuntimeTarget: instance.runtimeTarget.kind === 'legacy-inherit-lead'
            ? legacyInheritLeadRuntimeTarget
            : Object.freeze({ ...instance.runtimeTarget }),
          ...(instance.resolvedRuntimeTarget === undefined
            ? {}
            : { actualRuntimeTarget: Object.freeze({ ...instance.resolvedRuntimeTarget }) }),
        })
      }
      const selectedRuntimeTarget = snapshotOrdinaryRuntimeTarget(member, member.requestedRoute, true)
      const actualRuntimeTarget = snapshotOrdinaryRuntimeTarget(member, member.resolvedRoute, false)
      const backend = backendForTarget(catalog, actualRuntimeTarget ?? selectedRuntimeTarget)
      return Object.freeze({
        ...runtimeFacts(host, member, backend, ordinaryRuntimeAvailability(member, backend)),
        binding: 'ordinary',
        teamId,
        memberId: member.id,
        memberName: member.name,
        ...(selectedRuntimeTarget === undefined ? {} : { selectedRuntimeTarget }),
        ...(actualRuntimeTarget === undefined ? {} : { actualRuntimeTarget }),
      })
    }))
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
    const roster = this.host.ctx.agentTeams.listMembers(caller)
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
    for (const member of roster) {
      if (member.role !== 'teammate') continue
      const selected = snapshotOrdinaryRuntimeTarget(member, member.requestedRoute, true)
      const actual = snapshotOrdinaryRuntimeTarget(member, member.resolvedRoute, false)
      if (selected !== undefined) historicalTargets.push(selected)
      if (actual !== undefined) historicalTargets.push(actual)
    }
    const runtimeCatalog = this.host.runtimeBackends.snapshot(historicalTargets)
    const teamMembers = snapshotTeamMembers(this.host, roster, membership.id, runtimeCatalog, instances)
    return Object.freeze({
      profiles: Object.freeze(profiles),
      runtimeCatalog,
      tools: Object.freeze(tools),
      teamMembers,
      instances: Object.freeze(instances),
      runs: Object.freeze(runs),
      evalSets: Object.freeze(evalSets),
      evalRuns: Object.freeze(evalRuns),
    })
  }
}
