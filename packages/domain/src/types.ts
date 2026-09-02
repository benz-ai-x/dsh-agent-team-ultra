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

/** Initial Lead-history policy for a newly created employee conversation. */
export type DigitalEmployeeContextMode = 'fresh' | 'fork'

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
  readonly continuationProvider: string
  readonly contextMode: DigitalEmployeeContextMode
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

/** Compatibility route retained when migration cannot prove an exact model route. */
export interface LegacyInheritLeadRuntimeTarget {
  readonly kind: 'legacy-inherit-lead'
}

/** Exact DSH provider/model route pinned inside an immutable Revision. */
export interface DshModelRuntimeTarget {
  readonly kind: 'dsh-model'
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

/** Stable identity of one provider implementing the durable native teammate contract. */
export interface ExternalAgentRuntimeTarget {
  readonly kind: 'external-agent'
  readonly provider: string
}

/** Runtime identity that is immutable for one Revision. */
export type DigitalEmployeeRuntimeTarget =
  | LegacyInheritLeadRuntimeTarget
  | DshModelRuntimeTarget
  | ExternalAgentRuntimeTarget

/** Runtime Targets a Team Lead may select for a new candidate Revision. */
export type SelectableDigitalEmployeeRuntimeTarget = DshModelRuntimeTarget | ExternalAgentRuntimeTarget

/** Profile behavior a runtime must be able to enforce, not merely advertise. */
export type DigitalEmployeeProfileCapability =
  | 'persona'
  | 'mission'
  | 'context'
  | 'memory'
  | 'tool-policy'
  | 'hooks'

/** Normalized capability demand stored with immutable Revision content. */
export interface DigitalEmployeeRequiredCapabilities {
  readonly contextMode: DigitalEmployeeContextMode
  readonly profileCapabilities: readonly DigitalEmployeeProfileCapability[]
}

/** Optional activation gate owned by a Profile Head. */
export interface RequiredEvalSetReference {
  readonly evalSetId: string
  readonly revision: number
}

/** Mutable catalog pointer; its CAS revision is distinct from content Revision numbers. */
export interface DigitalEmployeeProfileHead {
  readonly schemaVersion: 1
  readonly profileId: DigitalEmployeeProfileId
  readonly headRevision: number
  readonly latestRevision: number
  readonly activeRevision?: number
  readonly historyStartsAtRevision: number
  readonly requiredEvalSet?: RequiredEvalSetReference
  readonly archivedAt?: number
  readonly createdAt: number
  readonly updatedAt: number
}

/** Complete normalized immutable content and its canonical content fingerprint. */
export interface DigitalEmployeeProfileRevision {
  readonly schemaVersion: 1
  readonly profileId: DigitalEmployeeProfileId
  readonly revision: number
  readonly profile: DigitalEmployeeProfileDraft
  readonly runtimeTarget: DigitalEmployeeRuntimeTarget
  readonly requiredCapabilities: DigitalEmployeeRequiredCapabilities
  readonly fingerprint: string
  readonly createdAt: number
  readonly updatedAt: number
}

/** Bounded history row included in the replaceable Studio baseline. */
export interface DigitalEmployeeProfileRevisionSummary {
  readonly revision: number
  readonly fingerprint: string
  readonly createdAt: number
  readonly updatedAt: number
}

/** One catalog entry backed by a Head and its latest immutable Revision. */
export interface DigitalEmployeeProfileCatalogEntry {
  readonly head: DigitalEmployeeProfileHead
  readonly latest: DigitalEmployeeProfileRevision
  readonly history: readonly DigitalEmployeeProfileRevisionSummary[]
  readonly historyTruncated: boolean
}

/** One deterministic field-level difference against the active Revision. */
export interface DigitalEmployeeProfileDiffEntry {
  readonly path: string
  readonly kind: 'added' | 'removed' | 'changed'
  readonly before?: string
  readonly after?: string
}

/** Lazily loaded Revision body and bounded comparison with the active Revision. */
export interface DigitalEmployeeProfileRevisionDetail {
  readonly head: DigitalEmployeeProfileHead
  readonly revision: DigitalEmployeeProfileRevision
  readonly comparedToRevision?: number
  readonly diff: readonly DigitalEmployeeProfileDiffEntry[]
  readonly diffTruncated: boolean
}

/** One tool visible to the current Team Lead and eligible for inheritance filtering. */
export interface ProfileToolOption {
  readonly name: string
  readonly description: string
}

/** Browser-safe reasoning choice advertised for one exact DSH model route. */
export interface DigitalEmployeeReasoningEffortOption {
  readonly id: string
  readonly name: string
  readonly description?: string
}

/** Detached reasoning metadata for one exact DSH model route. */
export interface DigitalEmployeeReasoningOptions {
  readonly efforts: readonly DigitalEmployeeReasoningEffortOption[]
  readonly defaultEffort?: string
}

/** Common detached metadata for one selectable or diagnostic runtime row. */
export interface DigitalEmployeeRuntimeBackendBase {
  /** Stable routing identity; display labels never participate in routing. */
  readonly routingId: string
  readonly availability: 'available' | 'unavailable' | 'unsupported'
  readonly displayName: string
  readonly contextModes: readonly DigitalEmployeeContextMode[]
  readonly profileCapabilities: readonly DigitalEmployeeProfileCapability[]
  readonly diagnostic?: string
}

/** One exact model route composed from the live DSH LLM registry. */
export interface DigitalEmployeeDshModelBackend extends DigitalEmployeeRuntimeBackendBase {
  readonly family: 'dsh-model'
  readonly provider: string
  readonly providerDisplayName: string
  readonly model: string
  readonly reasoning?: DigitalEmployeeReasoningOptions
}

/** One durable external provider, or an installed one-shot-only diagnostic. */
export interface DigitalEmployeeExternalAgentBackend extends DigitalEmployeeRuntimeBackendBase {
  readonly family: 'external-agent'
  readonly provider: string
}

/** Migration-only diagnostic for a historical Revision without a proven route. */
export interface DigitalEmployeeLegacyRuntimeBackend extends DigitalEmployeeRuntimeBackendBase {
  readonly family: 'legacy-inherit-lead'
  readonly routingId: 'legacy-inherit-lead'
}

/** One row shown by the grouped Runtime Backend selector. */
export type DigitalEmployeeRuntimeBackend =
  | DigitalEmployeeDshModelBackend
  | DigitalEmployeeExternalAgentBackend
  | DigitalEmployeeLegacyRuntimeBackend

/** Replaceable Host-composed runtime topology snapshot. */
export interface DigitalEmployeeRuntimeCatalog {
  readonly generation: number
  readonly backends: readonly DigitalEmployeeRuntimeBackend[]
}

/** One profile-bound Agent Team member as the Studio reads it. */
export interface DigitalEmployeeInstanceView {
  readonly teamId: string
  readonly memberName: string
  readonly memberId?: string
  readonly profileId: DigitalEmployeeProfileId
  readonly profileRevision: number
  readonly runtimeTarget: DigitalEmployeeRuntimeTarget
  readonly requiredCapabilities: DigitalEmployeeRequiredCapabilities
  readonly phase: 'pending' | 'active' | 'failed'
  readonly error?: string
}

/** Complete replaceable Studio baseline. */
export interface DigitalEmployeeStudioView {
  readonly profiles: readonly DigitalEmployeeProfileCatalogEntry[]
  readonly runtimeCatalog: DigitalEmployeeRuntimeCatalog
  readonly tools: readonly ProfileToolOption[]
  readonly instances: readonly DigitalEmployeeInstanceView[]
}

/** Save request with a compare-and-set precondition. */
export interface SaveDigitalEmployeeProfileRequest {
  readonly expectedHeadRevision: number | null
  readonly profile: DigitalEmployeeProfileDraft
  readonly runtimeTarget: SelectableDigitalEmployeeRuntimeTarget
}

/** Promote one existing immutable Revision through Profile Head CAS. */
export interface ActivateDigitalEmployeeProfileRequest {
  readonly profileId: DigitalEmployeeProfileId
  readonly revision: number
  readonly expectedHeadRevision: number
}

/** Move activeRevision back to one existing immutable Revision through Head CAS. */
export interface RollbackDigitalEmployeeProfileRequest {
  readonly profileId: DigitalEmployeeProfileId
  readonly revision: number
  readonly expectedHeadRevision: number
}

/** Archive one Profile without deleting its Head, Revisions, or Bindings. */
export interface ArchiveDigitalEmployeeProfileRequest {
  readonly profileId: DigitalEmployeeProfileId
  readonly expectedHeadRevision: number
}

/** Restore one archived Profile through Head CAS. */
export interface RestoreDigitalEmployeeProfileRequest {
  readonly profileId: DigitalEmployeeProfileId
  readonly expectedHeadRevision: number
}

/** Fetch one immutable Revision and compare it with the active Revision. */
export interface GetDigitalEmployeeProfileRevisionRequest {
  readonly profileId: DigitalEmployeeProfileId
  readonly revision: number
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
    | 'profile-not-active'
    | 'profile-archived'
    | 'revision-not-found'
    | 'runtime-target-unavailable'
    | 'runtime-route-invalid'
    | 'runtime-capability-mismatch'
    | 'tool-unavailable'
    | 'team-lead-required'
    | 'team-rejected'
    | 'assignment-too-large'
    | 'service-disposed'
  readonly message: string
  readonly currentHead?: DigitalEmployeeProfileHead
}

/** Save result preserving validation and stale-revision conflicts as domain data. */
export type SaveDigitalEmployeeProfileResult =
  | {
    readonly ok: true
    readonly value: {
      readonly unchanged: boolean
      readonly head: DigitalEmployeeProfileHead
      readonly revision: DigitalEmployeeProfileRevision
    }
  }
  | { readonly ok: false; readonly error: DigitalEmployeeFailure }

/** Result of activation or rollback; Revisions themselves are never rewritten. */
export type MutateDigitalEmployeeProfileHeadResult =
  | { readonly ok: true; readonly value: { readonly head: DigitalEmployeeProfileHead } }
  | { readonly ok: false; readonly error: DigitalEmployeeFailure }

/** Lazy Revision detail result used by the Studio history inspector. */
export type GetDigitalEmployeeProfileRevisionResult =
  | { readonly ok: true; readonly value: DigitalEmployeeProfileRevisionDetail }
  | { readonly ok: false; readonly error: DigitalEmployeeFailure }

/** Launch result after the Team roster and Ultra binding both reach a terminal edge. */
export type SpawnDigitalEmployeeResult =
  | { readonly ok: true; readonly value: DigitalEmployeeInstanceView }
  | { readonly ok: false; readonly error: DigitalEmployeeFailure }
