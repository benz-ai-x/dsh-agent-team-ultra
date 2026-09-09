/** Pure Run identity projection shared by Host recovery and offline migration. */
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { profileContentFingerprint, type DigitalEmployeeBindingV1 } from './storage.ts'
import { createExternalRunIndex, type DshRunFoldBinding, type ExternalRunFoldBinding } from './run.ts'
import type { DigitalEmployeeRunIndexRecord } from './types.ts'

/** Translate one durable Binding into the narrow Run fold interface. */
export function runFoldBinding(binding: DigitalEmployeeBindingV1): DshRunFoldBinding {
  if (binding.memberId === undefined) throw new Error('Run Binding has no member identity')
  const { revision: _revision, createdAt: _createdAt, updatedAt: _updatedAt, ...profile } = binding.profile
  return Object.freeze({
    teamId: binding.teamId,
    owner: Object.freeze({ kind: 'team-member' as const, memberId: binding.memberId, memberName: binding.memberName }),
    profileId: binding.profileId,
    profileRevision: binding.profileRevision,
    profileFingerprint: binding.profileFingerprint
      ?? profileContentFingerprint(profile, binding.runtimeTarget, binding.requiredCapabilities),
    selectedRuntimeTarget: binding.runtimeTarget,
    ...(binding.resolvedRuntimeTarget === undefined ? {} : { actualRuntimeTarget: binding.resolvedRuntimeTarget }),
    capabilityGeneration: binding.capabilityGeneration ?? 0,
  })
}

function externalRunBinding(binding: DigitalEmployeeBindingV1): ExternalRunFoldBinding {
  if (binding.runtimeTarget.kind !== 'external-agent'
    || binding.memberId === undefined || binding.nativeRuntimeHandle === undefined) {
    throw new Error('external Run Binding lacks its exact runtime identity')
  }
  const { actualRuntimeTarget: _actualRuntimeTarget, ...common } = runFoldBinding(binding)
  return Object.freeze({
    ...common,
    selectedRuntimeTarget: binding.runtimeTarget,
    ...(binding.resolvedRuntimeTarget?.kind === 'external-agent'
      ? { actualRuntimeTarget: binding.resolvedRuntimeTarget } : {}),
    nativeHandle: binding.nativeRuntimeHandle,
  })
}

/** Derive initial and delivery Runs from the Team Session's owned event suffix. */
export function* externalRunIndexesFromTeamEvents(
  binding: DigitalEmployeeBindingV1,
  events: readonly SessionEvent[],
): Generator<DigitalEmployeeRunIndexRecord> {
  const owner = externalRunBinding(binding)
  const active = events.findLast((event): event is SessionEvent<'team/member'> => event.type === 'team/member'
    && event.data.member.id === binding.memberId && event.data.member.phase === 'active'
    && event.data.member.externalRuntime?.nativeHandle === binding.nativeRuntimeHandle)
  if (active !== undefined) {
    const turn = active.data.member.externalRuntime?.initialTurnId
    const identity = turn ?? (binding.launchRequestId === undefined ? undefined : `launch:${binding.launchRequestId}`)
    if (identity !== undefined) yield createExternalRunIndex(owner, identity, turn, active.time)
  }
  for (const event of events) {
    if (event.type !== 'team/message/delivered' || event.data.targetId !== binding.memberId) continue
    yield createExternalRunIndex(owner,
      event.data.nativeTurnId ?? `message:${event.data.messageId}`, event.data.nativeTurnId, event.time)
  }
}
