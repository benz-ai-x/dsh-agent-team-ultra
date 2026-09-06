import { snapshotRequiredCapabilities } from './runtime.ts'
import { legacyInheritLeadRuntimeTarget } from './storage.ts'
import type {
  DigitalEmployeeProfileHead,
  DigitalEmployeeProfile,
  DigitalEmployeeProfileDraft,
  DigitalEmployeeProfileRevision,
  DigitalEmployeeRuntimeTarget,
  ProfileHook,
  ProfileTextBlock,
  ProfileToolPolicy,
} from './types.ts'

/** Freeze one text block before it crosses or enters a public boundary. */
function freezeTextBlock(block: ProfileTextBlock): ProfileTextBlock {
  return Object.freeze({
    id: block.id,
    title: block.title,
    content: block.content,
    enabled: block.enabled,
  })
}

/** Freeze one declarative hook before storage retains it by reference. */
function freezeHook(hook: ProfileHook): ProfileHook {
  return Object.freeze({
    id: hook.id,
    point: hook.point,
    effect: hook.effect,
    ...(hook.matcher === undefined ? {} : { matcher: hook.matcher }),
    text: hook.text,
    enabled: hook.enabled,
  })
}

/** Deep-detach the full profile snapshot. */
export function snapshotProfile(profile: DigitalEmployeeProfile): DigitalEmployeeProfile {
  return Object.freeze({
    ...snapshotProfileDraft(profile),
    revision: profile.revision,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  })
}

/** Deep-detach normalized editable content from storage or caller ownership. */
export function snapshotProfileDraft(profile: DigitalEmployeeProfileDraft): DigitalEmployeeProfileDraft {
  const names = Object.freeze([...profile.toolPolicy.names])
  const toolPolicy: ProfileToolPolicy = Object.freeze({ mode: profile.toolPolicy.mode, names })
  return Object.freeze({
    id: profile.id,
    employeeName: profile.employeeName,
    displayName: profile.displayName,
    description: profile.description,
    continuationProvider: profile.continuationProvider,
    contextMode: profile.contextMode,
    persona: profile.persona,
    mission: profile.mission,
    toolPolicy,
    context: Object.freeze(profile.context.map(freezeTextBlock)),
    memory: Object.freeze(profile.memory.map(freezeTextBlock)),
    hooks: Object.freeze(profile.hooks.map(freezeHook)),
  })
}

export function snapshotProfileHead(head: DigitalEmployeeProfileHead): DigitalEmployeeProfileHead {
  return Object.freeze({
    schemaVersion: 1,
    profileId: head.profileId,
    headRevision: head.headRevision,
    latestRevision: head.latestRevision,
    ...(head.activeRevision === undefined ? {} : { activeRevision: head.activeRevision }),
    historyStartsAtRevision: head.historyStartsAtRevision,
    ...(head.requiredEvalSet === undefined
      ? {}
      : { requiredEvalSet: Object.freeze({ ...head.requiredEvalSet }) }),
    ...(head.archivedAt === undefined ? {} : { archivedAt: head.archivedAt }),
    createdAt: head.createdAt,
    updatedAt: head.updatedAt,
  })
}

export function snapshotProfileRevision(revision: DigitalEmployeeProfileRevision): DigitalEmployeeProfileRevision {
  const target: DigitalEmployeeRuntimeTarget = revision.runtimeTarget.kind === 'legacy-inherit-lead'
    ? legacyInheritLeadRuntimeTarget
    : Object.freeze({ ...revision.runtimeTarget })
  return Object.freeze({
    schemaVersion: 1,
    profileId: revision.profileId,
    revision: revision.revision,
    profile: snapshotProfileDraft(revision.profile),
    runtimeTarget: target,
    requiredCapabilities: snapshotRequiredCapabilities(revision.requiredCapabilities),
    fingerprint: revision.fingerprint,
    createdAt: revision.createdAt,
    updatedAt: revision.updatedAt,
  })
}

export function profileFromRevision(revision: DigitalEmployeeProfileRevision): DigitalEmployeeProfile {
  return snapshotProfile({
    ...revision.profile,
    revision: revision.revision,
    createdAt: revision.createdAt,
    updatedAt: revision.updatedAt,
  })
}
