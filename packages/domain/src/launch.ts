/** Host-only launch replay, roster correlation, and runtime-presence decisions. */

import type { Agent } from '@deepseek-ai/dsh-agent'
import type { TeamMemberRouteSnapshot, TeamMemberView } from '@deepseek-ai/dsh-experimental-agent-team'
import { launchRequestFingerprint, type DigitalEmployeeBindingV1 } from './storage.ts'
import type {
  DigitalEmployeeRuntimePresence,
  DshModelRuntimeTarget,
} from './types.ts'

function dshTargetFromRoute(route: TeamMemberRouteSnapshot | undefined): DshModelRuntimeTarget | undefined {
  if (route?.provider === undefined || route.model === undefined) return undefined
  return {
    kind: 'dsh-model',
    provider: route.provider,
    model: route.model,
    ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }),
  }
}

function sameDshTarget(left: DshModelRuntimeTarget, right: DshModelRuntimeTarget): boolean {
  return left.provider === right.provider
    && left.model === right.model
    && left.reasoningEffort === right.reasoningEffort
}

function withoutError(binding: DigitalEmployeeBindingV1): Omit<DigitalEmployeeBindingV1, 'error'> {
  const { error: _error, ...rest } = binding
  return rest
}

/**
 * Locate the permanent Agent Team reservation for one Binding.
 * @param binding - durable Ultra Binding.
 * @param roster - authoritative current Team roster.
 * @returns the teammate row with the reserved name, when present.
 */
export function bindingRosterMember(
  binding: DigitalEmployeeBindingV1,
  roster: readonly TeamMemberView[],
): TeamMemberView | undefined {
  return roster.find(member => member.role === 'teammate' && member.name === binding.memberName)
}

/**
 * Reconcile one Binding lifecycle with its authoritative permanent roster row.
 * @param binding - current durable Ultra Binding.
 * @param roster - current Agent Team roster for the exact live Lead.
 * @returns a detached candidate Binding; callers persist it only when changed.
 */
export function reconcileBindingFromRoster(
  binding: DigitalEmployeeBindingV1,
  roster: readonly TeamMemberView[],
): DigitalEmployeeBindingV1 {
  const member = bindingRosterMember(binding, roster)
  if (member === undefined) {
    if (binding.provisioningPhase !== 'active') return binding
    return {
      ...withoutError(binding),
      provisioningPhase: 'failed',
      error: `authoritative Team roster has no reservation for "${binding.memberName}"`,
    }
  }

  const correlated = { ...withoutError(binding), memberId: member.id }
  if (member.status === 'failed') {
    return {
      ...correlated,
      provisioningPhase: 'failed',
      error: member.diagnostics[0] ?? `Agent Team provisioning failed for "${binding.memberName}"`,
    }
  }
  if (member.status === 'provisioning') {
    return { ...correlated, provisioningPhase: 'pending' }
  }
  if (binding.runtimeTarget.kind !== 'dsh-model') {
    return { ...correlated, provisioningPhase: 'active' }
  }

  const requested = dshTargetFromRoute(member.requestedRoute)
  const resolved = dshTargetFromRoute(member.resolvedRoute)
  if (requested === undefined
    || resolved === undefined
    || !sameDshTarget(binding.runtimeTarget, requested)
    || !sameDshTarget(binding.runtimeTarget, resolved)) {
    return {
      ...correlated,
      ...(resolved === undefined ? {} : { resolvedRuntimeTarget: resolved }),
      provisioningPhase: 'failed',
      error: `Agent Team route for "${binding.memberName}" does not match its selected Runtime Target`,
    }
  }
  return {
    ...correlated,
    resolvedRuntimeTarget: resolved,
    provisioningPhase: 'active',
  }
}

/**
 * Check whether a retry carries the immutable input accepted for one Binding.
 * @param binding - launch-correlated Binding selected by Team and request id.
 * @param profileId - normalized retry Profile identity.
 * @param assignmentHash - digest of the normalized retry assignment.
 * @returns whether the retry is identical to the accepted launch intent.
 */
export function bindingMatchesReplay(
  binding: DigitalEmployeeBindingV1,
  profileId: string,
  assignmentHash: string,
): boolean {
  if (binding.launchRequestId === undefined
    || binding.requestFingerprint === undefined
    || binding.profileFingerprint === undefined
    || binding.capabilityGeneration === undefined
    || binding.preflightRuntimeTarget === undefined
    || binding.assignmentHash !== assignmentHash
    || binding.profileId !== profileId) return false
  return binding.requestFingerprint === launchRequestFingerprint({
    profileId: binding.profileId,
    profileRevision: binding.profileRevision,
    profileFingerprint: binding.profileFingerprint,
    runtimeTarget: binding.runtimeTarget,
    preflightRuntimeTarget: binding.preflightRuntimeTarget,
    requiredCapabilities: binding.requiredCapabilities,
    capabilityGeneration: binding.capabilityGeneration,
    assignmentHash,
  })
}

/**
 * Derive process-local employee residency without mutating durable provisioning.
 * @param binding - durable employee Binding.
 * @param live - exact current Agent registry entry for its member id.
 * @returns running, idle, or inactive runtime presence.
 */
export function bindingRuntimePresence(
  binding: DigitalEmployeeBindingV1,
  live: Agent | undefined,
): DigitalEmployeeRuntimePresence {
  if (binding.provisioningPhase !== 'active' || binding.memberId === undefined || live?.id !== binding.memberId) {
    return 'inactive'
  }
  return live.status
}
