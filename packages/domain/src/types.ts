/** Browser-safe public values for Digital Employee profiles and instances. */

import type { Branded } from '@deepseek-ai/dsh-brand'
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

/** Team-scoped identity of one Client launch intent. */
export type LaunchRequestId = Branded<'LaunchRequestId'>

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
  readonly effect: 'context' | 'deny' | 'ask'
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

/** Durable launch progress owned by one Binding. */
export type DigitalEmployeeProvisioningPhase = 'pending' | 'active' | 'failed'

/** Current ability of the selected runtime to honor the immutable Binding. */
export type DigitalEmployeeRuntimeAvailability = 'available' | 'unavailable' | 'capability-mismatch'

/** Process-local residency of an already provisioned employee. */
export type DigitalEmployeeRuntimePresence = 'running' | 'idle' | 'inactive'

/** Stable opaque native identity returned by a durable external provider. */
export type NativeRuntimeHandle = Branded<'NativeRuntimeHandle'>

/** Deterministic identity of one accepted Digital Employee work turn. */
export type DigitalEmployeeRunId = Branded<'DigitalEmployeeRunId'>

/** Opaque provider-owned evidence handle shared by teammate and evaluation runtimes. */
export type DigitalEmployeeRunNativeHandle = Branded<'DigitalEmployeeRunNativeHandle'>

/** Team Lead-minted idempotency identity of one candidate evaluation. */
export type DigitalEmployeeEvalRunId = Branded<'DigitalEmployeeEvalRunId'>

/** Profile behavior a runtime must be able to enforce, not merely advertise. */
export type DigitalEmployeeProfileCapability =
  | 'persona'
  | 'mission'
  | 'context'
  | 'memory'
  | 'tool-policy'
  | 'hooks'

/** Operational guarantees a Runtime Backend can enforce and prove. */
export type DigitalEmployeeRuntimeCapability =
  | 'exact-call-approval'
  | 'sandbox'
  | 'evaluation'
  | 'evidence'
  | 'usage'

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
  readonly promotionGate: DigitalEmployeePromotionGate
}

/** Current evidence-backed activation eligibility for one Profile candidate. */
export interface DigitalEmployeePromotionGate {
  readonly status: 'not-required' | 'pending' | 'passed' | 'invalidated'
  readonly requiredEvalSet?: RequiredEvalSetReference
  readonly satisfiedByEvalRunId?: DigitalEmployeeEvalRunId
  readonly diagnostic?: string
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
  readonly runtimeCapabilities: readonly DigitalEmployeeRuntimeCapability[]
  readonly evaluationTools?: readonly string[]
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
  /** Caller-minted identity reused for every retry of one launch intent. */
  readonly launchRequestId?: LaunchRequestId
  readonly profileId: DigitalEmployeeProfileId
  readonly profileRevision: number
  /** Runtime Target selected by the immutable Profile Revision. */
  readonly runtimeTarget: DigitalEmployeeRuntimeTarget
  /** Exact route reported by the child runtime after teammate provisioning. */
  readonly resolvedRuntimeTarget?: SelectableDigitalEmployeeRuntimeTarget
  /** Stable opaque provider-native identity; present only for external employees. */
  readonly nativeRuntimeHandle?: NativeRuntimeHandle
  readonly requiredCapabilities: DigitalEmployeeRequiredCapabilities
  readonly provisioningPhase: DigitalEmployeeProvisioningPhase
  readonly runtimeAvailability: DigitalEmployeeRuntimeAvailability
  readonly runtimePresence: DigitalEmployeeRuntimePresence
  readonly error?: string
}

/** Runtime family whose canonical evidence owns one Run. */
export type DigitalEmployeeRunSource = 'dsh-session' | 'external-native'

/** Exact production member or isolated evaluation Case that accepted the work turn. */
export type DigitalEmployeeRunOwner =
  | {
    readonly kind: 'team-member'
    readonly memberId: string
    readonly memberName: string
  }
  | {
    readonly kind: 'evaluation-worker'
    readonly evalRunId: string
    readonly caseId: string
  }

/** Normalized terminal class shared by DSH and provider-native turns. */
export type DigitalEmployeeRunTerminal =
  | 'completed'
  | 'cancelled'
  | 'blocked'
  | 'failed'
  | 'max-tokens'
  | 'interrupted'
  | 'unknown-terminal'

/** Latest provider-reported cumulative accounting only; missing counters are never inferred. */
export interface DigitalEmployeeRunUsage {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly totalTokens?: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
  readonly reasoningTokens?: number
}

/** Explicit evidence health and default redaction policy for one Run. */
export interface DigitalEmployeeRunCompleteness {
  readonly status: 'complete' | 'incomplete' | 'unavailable'
  readonly diagnostic?: string
  readonly redactions: readonly ('content' | 'tool-arguments' | 'tool-results' | 'raw-payloads')[]
}

/** Safe pointer back to the canonical evidence owner; never a file-system path. */
export type DigitalEmployeeRunCanonicalSource =
  | { readonly kind: 'dsh-session'; readonly sessionId: string; readonly turn: number }
  | {
    readonly kind: 'external-native'
    readonly provider: string
    readonly nativeHandle: DigitalEmployeeRunNativeHandle
    readonly nativeTurnId?: string
  }

/** Durable bounded Run index row used by Studio lists and startup repair. */
export interface DigitalEmployeeRunIndexRecord {
  readonly schemaVersion: 1
  readonly runId: DigitalEmployeeRunId
  readonly source: DigitalEmployeeRunSource
  readonly canonicalTurnId: string
  readonly canonicalSource: DigitalEmployeeRunCanonicalSource
  readonly teamId: string
  readonly owner: DigitalEmployeeRunOwner
  readonly profileId: DigitalEmployeeProfileId
  readonly profileRevision: number
  readonly profileFingerprint: string
  readonly selectedRuntimeTarget: DigitalEmployeeRuntimeTarget
  readonly actualRuntimeTarget?: SelectableDigitalEmployeeRuntimeTarget
  readonly capabilityGeneration: number
  readonly terminal: DigitalEmployeeRunTerminal
  readonly usage?: DigitalEmployeeRunUsage
  readonly startedAt: number
  readonly endedAt?: number
  readonly completeness: DigitalEmployeeRunCompleteness
}

/** One normalized evidence edge; raw model and tool payloads cannot be represented. */
export interface DigitalEmployeeRunTimelineItem {
  readonly kind: 'turn' | 'step' | 'tool' | 'approval' | 'usage' | 'diagnostic'
  readonly timestamp: number
  readonly step?: number
  readonly name?: string
  readonly callId?: string
  readonly approvalId?: string
  readonly policyId?: string
  readonly policy?: string
  readonly outcome?:
    | 'started'
    | 'asked'
    | 'waiting-approval'
    | 'orphaned'
    | 'allowed-once'
    | 'rejected'
    | 'unavailable'
    | DigitalEmployeeRunTerminal
  readonly usage?: DigitalEmployeeRunUsage
}

/** Lazily folded bounded detail for one Run. */
export interface DigitalEmployeeRunDetail {
  readonly run: DigitalEmployeeRunIndexRecord
  readonly timeline: readonly DigitalEmployeeRunTimelineItem[]
  readonly timelineTruncated: boolean
}

/** One declared immutable text fixture available only to an evaluation Case. */
export interface DigitalEmployeeEvalFixture {
  readonly id: string
  readonly content: string
}

/** Hard per-Case ceilings enforced by the selected evaluation runtime. */
export interface DigitalEmployeeEvalResourceCeilings {
  readonly maxSteps: number
  readonly maxOutputTokens: number
  readonly maxElapsedMs: number
}

/** Deterministic assertions computed from normalized evidence and transient output. */
export interface DigitalEmployeeEvalAssertions {
  readonly acceptedTerminals: readonly DigitalEmployeeRunTerminal[]
  readonly requiredTools: readonly string[]
  readonly forbiddenTools: readonly string[]
  readonly requiredOutputSubstrings: readonly string[]
  readonly forbiddenOutputSubstrings: readonly string[]
  readonly maxSteps?: number
  readonly maxReportedTokens?: number
  readonly maxElapsedMs?: number
}

/** One stable Case inside an immutable Eval Set Revision. */
export interface DigitalEmployeeEvalCase {
  readonly id: string
  readonly title: string
  readonly input: string
  readonly fixtures: readonly DigitalEmployeeEvalFixture[]
  readonly assertions: DigitalEmployeeEvalAssertions
}

/** Set-level rule deciding whether the completed Cases pass. */
export type DigitalEmployeeEvalPassPolicy =
  | { readonly kind: 'all' }
  | { readonly kind: 'minimum'; readonly minimumPassed: number }

/** User-authored content versioned independently from Profile Revisions. */
export interface DigitalEmployeeEvalSetDraft {
  readonly id: string
  readonly profileId: DigitalEmployeeProfileId
  readonly displayName: string
  readonly toolAllowlist: readonly string[]
  readonly resourceCeilings: DigitalEmployeeEvalResourceCeilings
  readonly passPolicy: DigitalEmployeeEvalPassPolicy
  readonly cases: readonly DigitalEmployeeEvalCase[]
}

/** Mutable CAS pointer for one Eval Set's immutable history. */
export interface DigitalEmployeeEvalSetHead {
  readonly schemaVersion: 1
  readonly evalSetId: string
  readonly profileId: DigitalEmployeeProfileId
  readonly headRevision: number
  readonly latestRevision: number
  readonly createdAt: number
  readonly updatedAt: number
}

/** Complete immutable normalized Eval Set content. */
export interface DigitalEmployeeEvalSetRevision {
  readonly schemaVersion: 1
  readonly evalSetId: string
  readonly profileId: DigitalEmployeeProfileId
  readonly revision: number
  readonly evalSet: DigitalEmployeeEvalSetDraft
  readonly fingerprint: string
  readonly createdAt: number
  readonly updatedAt: number
}

export interface DigitalEmployeeEvalSetRevisionSummary {
  readonly revision: number
  readonly fingerprint: string
  readonly createdAt: number
  readonly updatedAt: number
}

/** Bounded Studio row for one versioned Eval Set. */
export interface DigitalEmployeeEvalSetCatalogEntry {
  readonly head: DigitalEmployeeEvalSetHead
  readonly latest: DigitalEmployeeEvalSetRevision
  readonly history: readonly DigitalEmployeeEvalSetRevisionSummary[]
  readonly historyTruncated: boolean
}

export type DigitalEmployeeEvalAssertionKind =
  | 'terminal'
  | 'required-tool'
  | 'forbidden-tool'
  | 'required-output'
  | 'forbidden-output'
  | 'max-steps'
  | 'max-reported-tokens'
  | 'max-elapsed-ms'

/** Safe assertion result; output and raw tool payloads are never retained. */
export interface DigitalEmployeeEvalAssertionResult {
  readonly kind: DigitalEmployeeEvalAssertionKind
  readonly subject?: string
  readonly passed: boolean
  readonly diagnostic: string
}

export type DigitalEmployeeEvalCaseStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
  | 'environment-unavailable'

/** Durable bounded result and evidence projection for one isolated Case. */
export interface DigitalEmployeeEvalCaseResult {
  readonly caseId: string
  readonly status: DigitalEmployeeEvalCaseStatus
  readonly assertions: readonly DigitalEmployeeEvalAssertionResult[]
  readonly run?: DigitalEmployeeRunDetail
  readonly diagnostic?: string
  readonly startedAt?: number
  readonly endedAt?: number
}

export type DigitalEmployeeEvalRunStatus =
  | 'running'
  | 'passed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
  | 'environment-unavailable'

/** Exact immutable identities reserved before any evaluator is published. */
export interface DigitalEmployeeEvalRunRecord {
  readonly schemaVersion: 1
  readonly evalRunId: DigitalEmployeeEvalRunId
  readonly requestFingerprint: string
  readonly teamId: string
  readonly profileId: DigitalEmployeeProfileId
  readonly profileRevision: number
  readonly profileFingerprint: string
  readonly runtimeTarget: SelectableDigitalEmployeeRuntimeTarget
  readonly capabilityGeneration: number
  readonly evalSetId: string
  readonly evalSetRevision: number
  readonly evalSetFingerprint: string
  readonly assertionSchemaVersion: 1
  readonly environmentFingerprint: string
  readonly effectiveToolAllowlist: readonly string[]
  readonly status: DigitalEmployeeEvalRunStatus
  readonly cases: readonly DigitalEmployeeEvalCaseResult[]
  readonly startedAt: number
  readonly updatedAt: number
  readonly endedAt?: number
}

export type DigitalEmployeeEvalRunSummary = Omit<DigitalEmployeeEvalRunRecord, 'cases'> & {
  readonly passedCases: number
  readonly totalCases: number
}

export interface DigitalEmployeeEvalRunDetail {
  readonly run: DigitalEmployeeEvalRunRecord
  readonly evalSet: DigitalEmployeeEvalSetRevision
}

/** Complete replaceable Studio baseline. */
export interface DigitalEmployeeStudioView {
  readonly profiles: readonly DigitalEmployeeProfileCatalogEntry[]
  readonly runtimeCatalog: DigitalEmployeeRuntimeCatalog
  readonly tools: readonly ProfileToolOption[]
  readonly instances: readonly DigitalEmployeeInstanceView[]
  readonly runs: readonly DigitalEmployeeRunIndexRecord[]
  readonly evalSets: readonly DigitalEmployeeEvalSetCatalogEntry[]
  readonly evalRuns: readonly DigitalEmployeeEvalRunSummary[]
}

/** One physical stream generation opens with a baseline, then replaces whole snapshots. */
export type DigitalEmployeeStudioFrame =
  | { readonly type: 'baseline'; readonly revision: number; readonly value: DigitalEmployeeStudioView }
  | { readonly type: 'replace'; readonly revision: number; readonly value: DigitalEmployeeStudioView }

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

/** Fetch one Run through its deterministic opaque identity. */
export interface GetDigitalEmployeeRunRequest {
  readonly runId: DigitalEmployeeRunId
}

/** Version one Eval Set through its independent CAS head. */
export interface SaveDigitalEmployeeEvalSetRequest {
  readonly expectedHeadRevision: number | null
  readonly evalSet: DigitalEmployeeEvalSetDraft
}

/** Attach or clear the exact Eval Set Revision required for activation. */
export interface SetDigitalEmployeeEvalGateRequest {
  readonly profileId: DigitalEmployeeProfileId
  readonly expectedHeadRevision: number
  readonly requiredEvalSet?: RequiredEvalSetReference
}

/** Start one idempotent exact candidate evaluation. */
export interface StartDigitalEmployeeEvalRunRequest {
  readonly evalRunId: DigitalEmployeeEvalRunId
  readonly profileId: DigitalEmployeeProfileId
  readonly profileRevision: number
  readonly evalSetId: string
  readonly evalSetRevision: number
}

export interface CancelDigitalEmployeeEvalRunRequest {
  readonly evalRunId: DigitalEmployeeEvalRunId
}

export interface GetDigitalEmployeeEvalRunRequest {
  readonly evalRunId: DigitalEmployeeEvalRunId
}

/** Launch one profile with an optional assignment specific to this Team. */
export interface SpawnDigitalEmployeeRequest {
  readonly launchRequestId: LaunchRequestId
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
    | 'run-not-found'
    | 'evidence-unavailable'
    | 'promotion-gate-failed'
    | 'eval-invalid'
    | 'eval-conflict'
    | 'eval-environment-unavailable'
    | 'eval-in-progress'
    | 'eval-not-found'
    | 'runtime-target-unavailable'
    | 'runtime-route-invalid'
    | 'runtime-capability-mismatch'
    | 'tool-unavailable'
    | 'team-lead-required'
    | 'team-rejected'
    | 'assignment-too-large'
    | 'launch-request-conflict'
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

/** Lazy Run evidence result used by the Studio inspector. */
export type GetDigitalEmployeeRunResult =
  | { readonly ok: true; readonly value: DigitalEmployeeRunDetail }
  | { readonly ok: false; readonly error: DigitalEmployeeFailure }

export type SaveDigitalEmployeeEvalSetResult =
  | {
    readonly ok: true
    readonly value: {
      readonly unchanged: boolean
      readonly head: DigitalEmployeeEvalSetHead
      readonly revision: DigitalEmployeeEvalSetRevision
    }
  }
  | { readonly ok: false; readonly error: DigitalEmployeeFailure }

export type StartDigitalEmployeeEvalRunResult =
  | {
    readonly ok: true
    readonly value: { readonly replayed: boolean; readonly run: DigitalEmployeeEvalRunSummary }
  }
  | { readonly ok: false; readonly error: DigitalEmployeeFailure }

export type CancelDigitalEmployeeEvalRunResult =
  | { readonly ok: true; readonly value: { readonly run: DigitalEmployeeEvalRunSummary } }
  | { readonly ok: false; readonly error: DigitalEmployeeFailure }

export type GetDigitalEmployeeEvalRunResult =
  | { readonly ok: true; readonly value: DigitalEmployeeEvalRunDetail }
  | { readonly ok: false; readonly error: DigitalEmployeeFailure }

/** Launch result after the Team roster and Ultra binding both reach a terminal edge. */
export type SpawnDigitalEmployeeResult =
  | { readonly ok: true; readonly value: DigitalEmployeeInstanceView }
  | { readonly ok: false; readonly error: DigitalEmployeeFailure }
