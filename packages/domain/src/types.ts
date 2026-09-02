/** Browser-safe public values for Digital Employee profiles and instances. */

import type {} from '@deepseek-ai/dsh-typert-protocol'

/** Stable metadata for Studio authorization failures transported by Typert. */
export interface DigitalEmployeeAuthorityErrorDetails {
  readonly operation: 'view' | 'install-profile-capabilities'
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'digital-employees/team-lead-required': DigitalEmployeeAuthorityErrorDetails
    'digital-employees/team-rejected': DigitalEmployeeAuthorityErrorDetails
  }
}

/** Stable lower-kebab profile identity. */
export type DigitalEmployeeProfileId = string

/** A bounded context or curated-memory fragment. */
export interface ProfileTextBlock {
  readonly id: string
  readonly title: string
  readonly content: string
  readonly enabled: boolean
}

/** How a profile filters tools inherited from its Lead's Agent preset. */
export interface ProfileToolPolicy {
  readonly mode: 'inherit' | 'allow' | 'deny'
  readonly names: readonly string[]
}

/** Safe lifecycle interception points supported by the first Ultra release. */
export type ProfileHookPoint = 'session-start' | 'before-step' | 'before-tool' | 'after-tool'

/** Declarative, non-executable hook owned by one profile. */
export interface ProfileHook {
  readonly id: string
  readonly point: ProfileHookPoint
  readonly effect: 'context' | 'deny'
  readonly matcher?: string
  readonly text: string
  readonly enabled: boolean
}

/** User-editable fields; revisions and timestamps remain Host-owned. */
export interface DigitalEmployeeProfileDraft {
  readonly id: DigitalEmployeeProfileId
  readonly employeeName: string
  readonly displayName: string
  readonly description: string
  readonly provider: string
  readonly contextMode: 'fresh' | 'fork'
  readonly persona: string
  readonly mission: string
  readonly toolPolicy: ProfileToolPolicy
  readonly context: readonly ProfileTextBlock[]
  readonly memory: readonly ProfileTextBlock[]
  readonly hooks: readonly ProfileHook[]
}

/** Whole immutable profile snapshot stored on every revision. */
export interface DigitalEmployeeProfile extends DigitalEmployeeProfileDraft {
  readonly revision: number
  readonly createdAt: number
  readonly updatedAt: number
}

/** One tool visible to the current Team Lead and eligible for inheritance filtering. */
export interface ProfileToolOption {
  readonly name: string
  readonly description: string
}

/** One profile-bound Agent Team member as the Studio reads it. */
export interface DigitalEmployeeInstanceView {
  readonly teamId: string
  readonly memberName: string
  readonly memberId?: string
  readonly profileId: DigitalEmployeeProfileId
  readonly profileRevision: number
  readonly phase: 'pending' | 'active' | 'failed'
  readonly error?: string
}

/** Complete replaceable Studio baseline. */
export interface DigitalEmployeeStudioView {
  readonly profiles: readonly DigitalEmployeeProfile[]
  readonly tools: readonly ProfileToolOption[]
  readonly instances: readonly DigitalEmployeeInstanceView[]
}

/** Save request with a compare-and-set precondition. */
export interface SaveDigitalEmployeeProfileRequest {
  readonly expectedRevision: number | null
  readonly profile: DigitalEmployeeProfileDraft
}

/** Delete request with a compare-and-set precondition. */
export interface DeleteDigitalEmployeeProfileRequest {
  readonly profileId: DigitalEmployeeProfileId
  readonly expectedRevision: number
}

/** Launch one profile with an optional assignment specific to this Team. */
export interface SpawnDigitalEmployeeRequest {
  readonly profileId: DigitalEmployeeProfileId
  readonly assignment?: string
}

/** Stable business rejection returned inside a successful Remote call. */
export interface DigitalEmployeeFailure {
  readonly code:
    | 'profile-invalid'
    | 'profile-not-found'
    | 'profile-conflict'
    | 'profile-limit'
    | 'profile-in-use'
    | 'tool-unavailable'
    | 'team-lead-required'
    | 'team-rejected'
    | 'assignment-too-large'
    | 'service-disposed'
  readonly message: string
  readonly current?: DigitalEmployeeProfile
}

/** Save result preserving validation and stale-revision conflicts as domain data. */
export type SaveDigitalEmployeeProfileResult =
  | { readonly ok: true; readonly value: DigitalEmployeeProfile }
  | { readonly ok: false; readonly error: DigitalEmployeeFailure }

/** Delete result preserving absence and stale-revision conflicts as domain data. */
export type DeleteDigitalEmployeeProfileResult =
  | { readonly ok: true; readonly value: { readonly deleted: true } }
  | { readonly ok: false; readonly error: DigitalEmployeeFailure }

/** Launch result after the Team roster and Ultra binding both reach a terminal edge. */
export type SpawnDigitalEmployeeResult =
  | { readonly ok: true; readonly value: DigitalEmployeeInstanceView }
  | { readonly ok: false; readonly error: DigitalEmployeeFailure }
