/** Version-1 durable storage generation and v0 migration primitives. */

import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { Domain, DomainFacility, KvTable } from '@deepseek-ai/dsh-storage-domain'
import {
  digitalEmployeeDomainSpec,
  digitalEmployeeEvalSetDraftSchema,
  type DigitalEmployeeBinding,
  digitalEmployeeProfileDraftSchema,
  digitalEmployeeProfileSchema,
  digitalEmployeeRuntimeTargetSchema,
  launchRequestIdSchema,
  nativeRuntimeHandleSchema,
  legacyDigitalEmployeeProfileDraftSchema,
  legacyDigitalEmployeeProfileSchema,
  type LegacyDigitalEmployeeProfile,
  type LegacyDigitalEmployeeProfileDraft,
} from './spec.ts'
import { requiredCapabilitiesForProfile } from './runtime.ts'
import { evalSetContentFingerprint } from './evaluation.ts'
import type {
  DigitalEmployeeEvalCaseResult,
  DigitalEmployeeEvalRunId,
  DigitalEmployeeEvalRunRecord,
  DigitalEmployeeEvalSetHead,
  DigitalEmployeeEvalSetRevision,
  DigitalEmployeeProfile,
  DigitalEmployeeProfileDraft,
  DigitalEmployeeProfileHead,
  DigitalEmployeeProvisioningPhase,
  DigitalEmployeeProfileRevision,
  DigitalEmployeeRunId,
  DigitalEmployeeRunIndexRecord,
  DigitalEmployeeRunNativeHandle,
  DigitalEmployeeRequiredCapabilities,
  DigitalEmployeeRuntimeTarget,
  LaunchRequestId,
  NativeRuntimeHandle,
  SelectableDigitalEmployeeRuntimeTarget,
} from './types.ts'

/** Marker committed only after every deterministic v0 copy is durable. */
export type DigitalEmployeeMigrationMarker =
  | { readonly formatVersion: 1; readonly status: 'pending'; readonly sourceVersion: 0 }
  | { readonly formatVersion: 1; readonly status: 'complete'; readonly sourceVersion: 0 }

export const pendingMigrationMarker: DigitalEmployeeMigrationMarker = Object.freeze({
  formatVersion: 1,
  status: 'pending',
  sourceVersion: 0,
})

export const completeMigrationMarker: DigitalEmployeeMigrationMarker = Object.freeze({
  formatVersion: 1,
  status: 'complete',
  sourceVersion: 0,
})

export type MigratedRuntimeTarget = DigitalEmployeeRuntimeTarget

export const legacyInheritLeadRuntimeTarget = Object.freeze({
  kind: 'legacy-inherit-lead',
} as const)

type StoredDigitalEmployeeProfileRevisionV1 =
  Omit<DigitalEmployeeProfileRevision, 'fingerprint' | 'requiredCapabilities'>
  & {
    readonly fingerprint?: string
    readonly requiredCapabilities?: DigitalEmployeeRequiredCapabilities
  }

/** Host-owned durable launch correlation; legacy migrated rows omit idempotency fields. */
export interface DigitalEmployeeBindingV1 {
  readonly schemaVersion: 1
  readonly teamId: string
  readonly memberName: string
  readonly memberId?: string
  readonly launchRequestId?: LaunchRequestId
  readonly requestFingerprint?: string
  readonly assignmentHash?: string
  readonly profileId: string
  readonly profileRevision: number
  readonly profileFingerprint?: string
  readonly profile: DigitalEmployeeProfile
  readonly runtimeTarget: DigitalEmployeeRuntimeTarget
  readonly preflightRuntimeTarget?: SelectableDigitalEmployeeRuntimeTarget
  readonly resolvedRuntimeTarget?: SelectableDigitalEmployeeRuntimeTarget
  readonly nativeRuntimeHandle?: NativeRuntimeHandle
  readonly requiredCapabilities: DigitalEmployeeRequiredCapabilities
  readonly capabilityGeneration?: number
  readonly provisioningPhase: DigitalEmployeeProvisioningPhase
  readonly error?: string
}

const safeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const boundedId = z.string().min(1).max(256)
const nonEmptyText = z.string().min(1)
const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/u)

export const migrationMarkerSchema = z.union([
  z.object({ formatVersion: z.literal(1), status: z.literal('pending'), sourceVersion: z.literal(0) }).strict(),
  z.object({ formatVersion: z.literal(1), status: z.literal('complete'), sourceVersion: z.literal(0) }).strict(),
]) as z.ZodType<DigitalEmployeeMigrationMarker>

export const migratedRuntimeTargetSchema = digitalEmployeeRuntimeTargetSchema

const resolvedRuntimeTargetSchema = digitalEmployeeRuntimeTargetSchema.refine(
  (target): target is SelectableDigitalEmployeeRuntimeTarget => target.kind !== 'legacy-inherit-lead',
  { message: 'resolved runtime target cannot inherit the Lead route' },
)

const profileCapabilitySchema = z.union([
  z.literal('persona'),
  z.literal('mission'),
  z.literal('context'),
  z.literal('memory'),
  z.literal('tool-policy'),
  z.literal('hooks'),
])

const requiredCapabilitiesSchema = z.object({
  contextMode: z.union([z.literal('fresh'), z.literal('fork')]),
  profileCapabilities: z.array(profileCapabilitySchema).max(6),
}).strict() as z.ZodType<DigitalEmployeeRequiredCapabilities>

function migratedProfileDraftVocabulary(
  profile: DigitalEmployeeProfileDraft | LegacyDigitalEmployeeProfileDraft,
): DigitalEmployeeProfileDraft {
  if ('continuationProvider' in profile) return profile
  const { provider, ...rest } = profile
  return { ...rest, continuationProvider: provider }
}

function migratedProfileVocabulary(
  profile: DigitalEmployeeProfile | LegacyDigitalEmployeeProfile,
): DigitalEmployeeProfile {
  if ('continuationProvider' in profile) return profile
  const { provider, ...rest } = profile
  return { ...rest, continuationProvider: provider }
}

const storedProfileDraftSchema = z.union([
  digitalEmployeeProfileDraftSchema,
  legacyDigitalEmployeeProfileDraftSchema,
]).transform(migratedProfileDraftVocabulary) as z.ZodType<DigitalEmployeeProfileDraft>

const storedProfileSchema = z.union([
  digitalEmployeeProfileSchema,
  legacyDigitalEmployeeProfileSchema,
]).transform(migratedProfileVocabulary) as z.ZodType<DigitalEmployeeProfile>

const requiredEvalSetReferenceSchema = z.object({
  evalSetId: boundedId,
  revision: positiveInteger,
}).strict()

export const digitalEmployeeProfileHeadV1Schema = z.object({
  schemaVersion: z.literal(1),
  profileId: boundedId,
  headRevision: positiveInteger,
  latestRevision: positiveInteger,
  activeRevision: positiveInteger.optional(),
  historyStartsAtRevision: positiveInteger,
  requiredEvalSet: requiredEvalSetReferenceSchema.optional(),
  archivedAt: safeInteger.optional(),
  createdAt: safeInteger,
  updatedAt: safeInteger,
}).strict().superRefine((head, ctx) => {
  if (head.historyStartsAtRevision > head.latestRevision) {
    ctx.addIssue({ code: 'custom', path: ['historyStartsAtRevision'], message: 'history start exceeds latest revision' })
  }
  if (head.activeRevision !== undefined && head.activeRevision > head.latestRevision) {
    ctx.addIssue({ code: 'custom', path: ['activeRevision'], message: 'active revision exceeds latest revision' })
  }
  if (head.updatedAt < head.createdAt) {
    ctx.addIssue({ code: 'custom', path: ['updatedAt'], message: 'updatedAt precedes createdAt' })
  }
  if (head.archivedAt !== undefined && head.archivedAt < head.createdAt) {
    ctx.addIssue({ code: 'custom', path: ['archivedAt'], message: 'archivedAt precedes createdAt' })
  }
}) as z.ZodType<DigitalEmployeeProfileHead>

export const digitalEmployeeProfileRevisionV1Schema = z.object({
  schemaVersion: z.literal(1),
  profileId: boundedId,
  revision: positiveInteger,
  profile: storedProfileDraftSchema,
  runtimeTarget: migratedRuntimeTargetSchema,
  requiredCapabilities: requiredCapabilitiesSchema.optional(),
  fingerprint: fingerprintSchema.optional(),
  createdAt: safeInteger,
  updatedAt: safeInteger,
}).strict().refine(record => record.updatedAt >= record.createdAt, {
  path: ['updatedAt'],
  message: 'updatedAt must not precede createdAt',
}) as z.ZodType<StoredDigitalEmployeeProfileRevisionV1>

const provisioningPhaseSchema = z.union([z.literal('pending'), z.literal('active'), z.literal('failed')])
const digitalEmployeeBindingV1InputSchema = z.object({
  schemaVersion: z.literal(1),
  teamId: nonEmptyText,
  memberName: z.string().min(1).max(64),
  memberId: nonEmptyText.optional(),
  launchRequestId: launchRequestIdSchema.optional(),
  requestFingerprint: fingerprintSchema.optional(),
  assignmentHash: fingerprintSchema.optional(),
  profileId: z.string().min(1).max(64),
  profileRevision: positiveInteger,
  profileFingerprint: fingerprintSchema.optional(),
  profile: storedProfileSchema,
  runtimeTarget: migratedRuntimeTargetSchema,
  preflightRuntimeTarget: resolvedRuntimeTargetSchema.optional(),
  resolvedRuntimeTarget: resolvedRuntimeTargetSchema.optional(),
  nativeRuntimeHandle: nativeRuntimeHandleSchema.optional(),
  requiredCapabilities: requiredCapabilitiesSchema.optional(),
  capabilityGeneration: safeInteger.optional(),
  provisioningPhase: provisioningPhaseSchema.optional(),
  phase: provisioningPhaseSchema.optional(),
  error: z.string().max(2048).optional(),
}).strict().superRefine((binding, ctx) => {
  if ((binding.provisioningPhase === undefined) === (binding.phase === undefined)) {
    ctx.addIssue({ code: 'custom', message: 'binding requires exactly one provisioning phase field' })
  }
  const idempotency = [
    binding.launchRequestId,
    binding.requestFingerprint,
    binding.assignmentHash,
    binding.profileFingerprint,
    binding.capabilityGeneration,
    binding.preflightRuntimeTarget,
  ]
  const present = idempotency.filter(value => value !== undefined).length
  if (present !== 0 && present !== idempotency.length) {
    ctx.addIssue({ code: 'custom', message: 'binding launch identity fields must be present together' })
  }
  if (binding.runtimeTarget.kind === 'external-agent') {
    if (present !== idempotency.length) {
      ctx.addIssue({ code: 'custom', message: 'external binding requires its complete launch identity tuple' })
    }
    const phase = binding.provisioningPhase ?? binding.phase
    if (phase === 'pending'
      && (binding.nativeRuntimeHandle !== undefined || binding.resolvedRuntimeTarget !== undefined)) {
      ctx.addIssue({ code: 'custom', message: 'pending external binding cannot own resolved native identity' })
    }
    if (phase === 'active'
      && (binding.memberId === undefined
        || binding.nativeRuntimeHandle === undefined
        || binding.resolvedRuntimeTarget?.kind !== 'external-agent'
        || binding.resolvedRuntimeTarget.provider !== binding.runtimeTarget.provider)) {
      ctx.addIssue({ code: 'custom', message: 'active external binding requires its member, native handle, and resolved provider' })
    }
  } else if (binding.nativeRuntimeHandle !== undefined) {
    ctx.addIssue({ code: 'custom', message: 'only external bindings may retain a native runtime handle' })
  }
}).transform(({ phase, ...binding }) => ({
  ...binding,
  provisioningPhase: binding.provisioningPhase ?? phase!,
  requiredCapabilities: binding.requiredCapabilities ?? requiredCapabilitiesForProfile(binding.profile),
}))

export const digitalEmployeeBindingV1Schema = digitalEmployeeBindingV1InputSchema as z.ZodType<DigitalEmployeeBindingV1>

const runTerminalSchema = z.enum([
  'completed',
  'cancelled',
  'blocked',
  'failed',
  'max-tokens',
  'interrupted',
  'unknown-terminal',
])
const runUsageSchema = z.object({
  inputTokens: safeInteger,
  outputTokens: safeInteger,
  totalTokens: safeInteger.optional(),
  cacheReadTokens: safeInteger.optional(),
  cacheWriteTokens: safeInteger.optional(),
  reasoningTokens: safeInteger.optional(),
}).strict()
const runCompletenessSchema = z.object({
  status: z.enum(['complete', 'incomplete', 'unavailable']),
  diagnostic: z.string().max(2048).optional(),
  redactions: z.array(z.enum(['content', 'tool-arguments', 'tool-results', 'raw-payloads'])).length(4),
}).strict()
const runOwnerSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('team-member'),
    memberId: nonEmptyText,
    memberName: z.string().min(1).max(64),
  }).strict(),
  z.object({
    kind: z.literal('evaluation-worker'),
    evalRunId: boundedId,
    caseId: boundedId,
  }).strict(),
])
const runCanonicalSourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('dsh-session'),
    sessionId: nonEmptyText,
    turn: safeInteger,
  }).strict(),
  z.object({
    kind: z.literal('external-native'),
    provider: z.string().min(1).max(200),
    nativeHandle: nativeRuntimeHandleSchema
      .transform(value => brandString<DigitalEmployeeRunNativeHandle>(value)),
    nativeTurnId: z.string().min(1).max(256).optional(),
  }).strict(),
])
export const digitalEmployeeRunIndexRecordSchema = z.object({
  schemaVersion: z.literal(1),
  runId: boundedId.transform(value => brandString<DigitalEmployeeRunId>(value)),
  source: z.enum(['dsh-session', 'external-native']),
  canonicalTurnId: z.string().min(1).max(512),
  canonicalSource: runCanonicalSourceSchema,
  teamId: nonEmptyText,
  owner: runOwnerSchema,
  profileId: z.string().min(1).max(64),
  profileRevision: positiveInteger,
  profileFingerprint: fingerprintSchema,
  selectedRuntimeTarget: migratedRuntimeTargetSchema,
  actualRuntimeTarget: resolvedRuntimeTargetSchema.optional(),
  capabilityGeneration: safeInteger,
  terminal: runTerminalSchema,
  usage: runUsageSchema.optional(),
  startedAt: safeInteger,
  endedAt: safeInteger.optional(),
  completeness: runCompletenessSchema,
}).strict().superRefine((record, ctx) => {
  if ((record.source === 'dsh-session') !== (record.canonicalSource.kind === 'dsh-session')) {
    ctx.addIssue({ code: 'custom', path: ['canonicalSource'], message: 'Run source and canonical source differ' })
  }
  if (record.endedAt !== undefined && record.endedAt < record.startedAt) {
    ctx.addIssue({ code: 'custom', path: ['endedAt'], message: 'Run endedAt precedes startedAt' })
  }
}) as z.ZodType<DigitalEmployeeRunIndexRecord>
const evalSetRecordSchema = z.object({
  schemaVersion: z.literal(1),
  evalSetId: boundedId,
  profileId: z.string().min(1).max(64),
  headRevision: positiveInteger,
  latestRevision: positiveInteger,
  createdAt: safeInteger,
  updatedAt: safeInteger,
}).strict().refine(record => record.updatedAt >= record.createdAt, {
  path: ['updatedAt'],
  message: 'Eval Set updatedAt precedes createdAt',
}) as z.ZodType<DigitalEmployeeEvalSetHead>

const evalSetRevisionRecordSchema = z.object({
  schemaVersion: z.literal(1),
  evalSetId: boundedId,
  profileId: z.string().min(1).max(64),
  revision: positiveInteger,
  evalSet: digitalEmployeeEvalSetDraftSchema,
  fingerprint: fingerprintSchema,
  createdAt: safeInteger,
  updatedAt: safeInteger,
}).strict().superRefine((record, ctx) => {
  if (record.evalSet.id !== record.evalSetId || record.evalSet.profileId !== record.profileId) {
    ctx.addIssue({ code: 'custom', message: 'Eval Set Revision identity is inconsistent' })
  }
  if (record.updatedAt < record.createdAt) {
    ctx.addIssue({ code: 'custom', path: ['updatedAt'], message: 'updatedAt precedes createdAt' })
  }
}) as z.ZodType<DigitalEmployeeEvalSetRevision>

const evalAssertionResultSchema = z.object({
  kind: z.enum([
    'terminal',
    'required-tool',
    'forbidden-tool',
    'required-output',
    'forbidden-output',
    'max-steps',
    'max-reported-tokens',
    'max-elapsed-ms',
  ]),
  subject: z.string().max(1024).optional(),
  passed: z.boolean(),
  diagnostic: z.string().max(2048),
}).strict()

const runTimelineItemSchema = z.object({
  kind: z.enum(['turn', 'step', 'tool', 'approval', 'usage', 'diagnostic']),
  timestamp: safeInteger,
  step: positiveInteger.optional(),
  name: z.string().max(256).optional(),
  callId: z.string().max(256).optional(),
  approvalId: z.string().max(256).optional(),
  policyId: z.string().max(256).optional(),
  policy: z.string().max(4096).optional(),
  outcome: z.enum([
    'started', 'asked', 'waiting-approval', 'orphaned', 'allowed-once', 'rejected', 'unavailable',
    'completed', 'cancelled', 'blocked', 'failed', 'max-tokens', 'interrupted', 'unknown-terminal',
  ]).optional(),
  usage: runUsageSchema.optional(),
}).strict()

const runDetailSchema = z.object({
  run: digitalEmployeeRunIndexRecordSchema,
  timeline: z.array(runTimelineItemSchema),
  timelineTruncated: z.boolean(),
}).strict()

const evalCaseResultSchema = z.object({
  caseId: boundedId,
  status: z.enum([
    'pending', 'running', 'passed', 'failed', 'cancelled', 'interrupted', 'environment-unavailable',
  ]),
  assertions: z.array(evalAssertionResultSchema),
  run: runDetailSchema.optional(),
  diagnostic: z.string().max(2048).optional(),
  startedAt: safeInteger.optional(),
  endedAt: safeInteger.optional(),
}).strict().refine(result => result.startedAt === undefined
  || result.endedAt === undefined
  || result.endedAt >= result.startedAt, {
  path: ['endedAt'],
  message: 'Eval Case endedAt precedes startedAt',
}) as z.ZodType<DigitalEmployeeEvalCaseResult>

const evalRunRecordSchema = z.object({
  schemaVersion: z.literal(1),
  evalRunId: boundedId.transform(value => brandString<DigitalEmployeeEvalRunId>(value)),
  requestFingerprint: fingerprintSchema,
  teamId: nonEmptyText,
  profileId: z.string().min(1).max(64),
  profileRevision: positiveInteger,
  profileFingerprint: fingerprintSchema,
  runtimeTarget: resolvedRuntimeTargetSchema,
  capabilityGeneration: safeInteger,
  evalSetId: boundedId,
  evalSetRevision: positiveInteger,
  evalSetFingerprint: fingerprintSchema,
  assertionSchemaVersion: z.literal(1),
  environmentFingerprint: fingerprintSchema,
  effectiveToolAllowlist: z.array(z.string().min(1).max(128)).max(256),
  status: z.enum(['running', 'passed', 'failed', 'cancelled', 'interrupted', 'environment-unavailable']),
  cases: z.array(evalCaseResultSchema).max(64),
  startedAt: safeInteger,
  updatedAt: safeInteger,
  endedAt: safeInteger.optional(),
}).strict().superRefine((record, ctx) => {
  if (record.updatedAt < record.startedAt
    || (record.endedAt !== undefined && record.endedAt < record.startedAt)) {
    ctx.addIssue({ code: 'custom', message: 'Eval Run timestamps are inconsistent' })
  }
  const caseIds = record.cases.map(testCase => testCase.caseId)
  if (new Set(caseIds).size !== caseIds.length) {
    ctx.addIssue({ code: 'custom', path: ['cases'], message: 'Eval Run Case ids must be unique' })
  }
}) as z.ZodType<DigitalEmployeeEvalRunRecord>

/** New, independently versioned per-record generation; v0 remains untouched. */
export const digitalEmployeeV1DomainSpec = defineDomain({
  name: 'agent_team_ultra_v1',
  version: 1,
  layout: 'per-record',
  global: {
    schema: migrationMarkerSchema,
    initial: pendingMigrationMarker,
  },
  tables: {
    profile_heads: domainTable<string, DigitalEmployeeProfileHead>(digitalEmployeeProfileHeadV1Schema),
    profile_revisions: domainTable<string, StoredDigitalEmployeeProfileRevisionV1>(digitalEmployeeProfileRevisionV1Schema),
    bindings: domainTable<string, DigitalEmployeeBindingV1>(digitalEmployeeBindingV1Schema),
    run_index: domainTable<string, DigitalEmployeeRunIndexRecord>(digitalEmployeeRunIndexRecordSchema),
    eval_sets: domainTable<string, DigitalEmployeeEvalSetHead | DigitalEmployeeEvalSetRevision>(
      z.union([evalSetRecordSchema, evalSetRevisionRecordSchema]),
    ),
    eval_runs: domainTable<string, DigitalEmployeeEvalRunRecord>(evalRunRecordSchema),
  },
})

type DigitalEmployeeV1Domain = Domain<typeof digitalEmployeeV1DomainSpec>

export interface MigrationRecordBoundary {
  readonly table: 'profile_revisions' | 'profile_heads' | 'bindings'
  readonly key: string
  readonly copiedRecords: number
}

/** Internal fault boundaries used by crash-recovery integration tests. */
export interface DigitalEmployeeMigrationHooks {
  afterRecord?(boundary: MigrationRecordBoundary): void | Promise<void>
  beforeCompletion?(): void | Promise<void>
}

export interface OpenDigitalEmployeeStorageOptions {
  readonly resolveBindingRuntimeTarget?: (binding: DigitalEmployeeBinding) => MigratedRuntimeTarget
  readonly migrationHooks?: DigitalEmployeeMigrationHooks
}

/** Clear migration failure distinct from backend/schema failures. */
export class DigitalEmployeeMigrationError extends Error {
  constructor(
    message: string,
    readonly code: 'source-inconsistent' | 'target-diverged' | 'target-inconsistent',
  ) {
    super(`Digital Employee storage migration: ${message}`)
    this.name = 'DigitalEmployeeMigrationError'
  }
}

/** Deterministic immutable Revision key. */
export function profileRevisionKey(profileId: string, revision: number): string {
  return durableIdentityKey('profile', [profileId, revision])
}

/** Path-safe mutable Eval Set Head key. */
export function evalSetHeadKey(evalSetId: string): string {
  return durableIdentityKey('eval-set-head', [evalSetId])
}

/** Deterministic immutable Eval Set Revision key. */
export function evalSetRevisionKey(evalSetId: string, revision: number): string {
  return durableIdentityKey('eval-set-revision', [evalSetId, revision])
}

/** Path-safe v1 Binding key; identity fields remain visible inside the record. */
export function digitalEmployeeBindingKey(teamId: string, memberName: string): string {
  return durableIdentityKey('binding', [teamId, memberName])
}

/** Fixed-length key suitable for JSON per-record paths even when a valid v0 identity is long. */
function durableIdentityKey(
  prefix: 'profile' | 'binding' | 'eval-set-head' | 'eval-set-revision',
  identity: readonly unknown[],
): string {
  const digest = createHash('sha256').update(JSON.stringify(identity), 'utf8').digest('base64url')
  return `${prefix}_${digest}`
}

function legacyBindingKey(teamId: string, memberName: string): string {
  return JSON.stringify([teamId, memberName])
}

/** Canonical JSON: object keys sort lexically while array order remains semantic. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .filter(key => record[key] !== undefined)
    .sort()
    .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`
}

/**
 * Hash one normalized assignment without retaining its text.
 * @param assignment - trimmed assignment, or undefined for no assignment.
 * @returns canonical SHA-256 digest used by launch idempotency.
 */
export function assignmentContentHash(assignment: string | undefined): string {
  return createHash('sha256')
    .update(canonicalJson({ assignment: assignment ?? null }), 'utf8')
    .digest('hex')
}

/** Immutable values that distinguish one accepted launch request. */
export interface LaunchRequestFingerprintInput {
  readonly profileId: string
  readonly profileRevision: number
  readonly profileFingerprint: string
  readonly runtimeTarget: DigitalEmployeeRuntimeTarget
  readonly preflightRuntimeTarget: SelectableDigitalEmployeeRuntimeTarget
  readonly requiredCapabilities: DigitalEmployeeRequiredCapabilities
  readonly capabilityGeneration: number
  readonly assignmentHash: string
}

/**
 * Fingerprint one normalized launch intent without its Team-scoped request id.
 * @param input - immutable Revision, selected/preflight routes, capability generation, and assignment digest.
 * @returns canonical SHA-256 digest used to reject changed retries.
 */
export function launchRequestFingerprint(input: LaunchRequestFingerprintInput): string {
  return createHash('sha256').update(canonicalJson(input), 'utf8').digest('hex')
}

/** Fingerprint only immutable normalized content, never counters or operational timestamps. */
export function profileContentFingerprint(
  profile: DigitalEmployeeProfileDraft,
  runtimeTarget: DigitalEmployeeRuntimeTarget,
  requiredCapabilities: DigitalEmployeeRequiredCapabilities = requiredCapabilitiesForProfile(profile),
): string {
  return createHash('sha256')
    .update(canonicalJson({ profile, runtimeTarget, requiredCapabilities }), 'utf8')
    .digest('hex')
}

/** Issue #4 fingerprint spelling, accepted only while enriching transitional v1 rows. */
function legacyProfileContentFingerprint(
  profile: DigitalEmployeeProfileDraft,
  runtimeTarget: DigitalEmployeeRuntimeTarget,
): string {
  const { continuationProvider, ...rest } = profile
  return createHash('sha256')
    .update(canonicalJson({ profile: { ...rest, provider: continuationProvider }, runtimeTarget }), 'utf8')
    .digest('hex')
}

function deepFreeze<T>(borrowed: T): T {
  const value = structuredClone(borrowed)
  const visit = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== 'object' || Object.isFrozen(candidate)) return
    for (const child of Object.values(candidate)) visit(child)
    Object.freeze(candidate)
  }
  visit(value)
  return value
}

function profileDraft(profile: LegacyDigitalEmployeeProfile): DigitalEmployeeProfileDraft {
  return deepFreeze({
    id: profile.id,
    employeeName: profile.employeeName,
    displayName: profile.displayName,
    description: profile.description,
    continuationProvider: profile.provider,
    contextMode: profile.contextMode,
    persona: profile.persona,
    mission: profile.mission,
    toolPolicy: profile.toolPolicy,
    context: profile.context,
    memory: profile.memory,
    hooks: profile.hooks,
  })
}

function revisionRecord(
  profile: LegacyDigitalEmployeeProfile,
  runtimeTarget: MigratedRuntimeTarget = legacyInheritLeadRuntimeTarget,
): DigitalEmployeeProfileRevision {
  const draft = profileDraft(profile)
  const requiredCapabilities = requiredCapabilitiesForProfile(draft)
  return deepFreeze({
    schemaVersion: 1,
    profileId: profile.id,
    revision: profile.revision,
    profile: draft,
    runtimeTarget,
    requiredCapabilities,
    fingerprint: profileContentFingerprint(draft, runtimeTarget, requiredCapabilities),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  })
}

function migratedHead(profile: LegacyDigitalEmployeeProfile): DigitalEmployeeProfileHead {
  return Object.freeze({
    schemaVersion: 1,
    profileId: profile.id,
    headRevision: 1,
    latestRevision: profile.revision,
    activeRevision: profile.revision,
    historyStartsAtRevision: profile.revision,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  })
}

function profileFromRevision(record: DigitalEmployeeProfileRevision): DigitalEmployeeProfile {
  return deepFreeze({
    ...record.profile,
    revision: record.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  })
}

function bindingLaunchFields(binding: DigitalEmployeeBindingV1): Pick<
  DigitalEmployeeBindingV1,
  | 'launchRequestId'
  | 'requestFingerprint'
  | 'assignmentHash'
  | 'profileFingerprint'
  | 'capabilityGeneration'
  | 'preflightRuntimeTarget'
> {
  if (binding.launchRequestId === undefined) return {}
  if (binding.requestFingerprint === undefined
    || binding.assignmentHash === undefined
    || binding.profileFingerprint === undefined
    || binding.capabilityGeneration === undefined
    || binding.preflightRuntimeTarget === undefined) {
    throw new TypeError('a launch-correlated Binding requires every identity fingerprint')
  }
  return {
    launchRequestId: binding.launchRequestId,
    requestFingerprint: binding.requestFingerprint,
    assignmentHash: binding.assignmentHash,
    profileFingerprint: binding.profileFingerprint,
    capabilityGeneration: binding.capabilityGeneration,
    preflightRuntimeTarget: binding.preflightRuntimeTarget,
  }
}

function bindingRecord(
  binding: DigitalEmployeeBinding | DigitalEmployeeBindingV1,
  fallbackTarget: MigratedRuntimeTarget = legacyInheritLeadRuntimeTarget,
): DigitalEmployeeBindingV1 {
  const runtimeTarget = 'runtimeTarget' in binding ? binding.runtimeTarget : fallbackTarget
  const provisioningPhase = 'provisioningPhase' in binding ? binding.provisioningPhase : binding.phase
  const profile = migratedProfileVocabulary(binding.profile)
  const requiredCapabilities = 'requiredCapabilities' in binding
    ? binding.requiredCapabilities
    : requiredCapabilitiesForProfile(profile)
  return deepFreeze({
    schemaVersion: 1,
    teamId: binding.teamId,
    memberName: binding.memberName,
    ...(binding.memberId === undefined ? {} : { memberId: binding.memberId }),
    ...('launchRequestId' in binding ? bindingLaunchFields(binding) : {}),
    profileId: binding.profileId,
    profileRevision: binding.profileRevision,
    profile,
    runtimeTarget,
    ...('resolvedRuntimeTarget' in binding && binding.resolvedRuntimeTarget !== undefined
      ? { resolvedRuntimeTarget: binding.resolvedRuntimeTarget }
      : {}),
    ...('nativeRuntimeHandle' in binding && binding.nativeRuntimeHandle !== undefined
      ? { nativeRuntimeHandle: binding.nativeRuntimeHandle }
      : {}),
    requiredCapabilities,
    provisioningPhase,
    ...(binding.error === undefined ? {} : { error: binding.error }),
  })
}

async function putImmutable<V>(
  table: KvTable<string, V>,
  tableName: MigrationRecordBoundary['table'],
  key: string,
  value: V,
  state: { copiedRecords: number },
  hooks: DigitalEmployeeMigrationHooks,
): Promise<void> {
  const current = table.get(key)
  if (current !== undefined) {
    if (!isDeepStrictEqual(current, value)) {
      throw new DigitalEmployeeMigrationError(
        `${tableName} record ${JSON.stringify(key)} differs from its deterministic v0 projection`,
        'target-diverged',
      )
    }
    return
  }
  await table.put(key, value)
  state.copiedRecords += 1
  await hooks.afterRecord?.({ table: tableName, key, copiedRecords: state.copiedRecords })
}

function completeRevision(record: StoredDigitalEmployeeProfileRevisionV1): DigitalEmployeeProfileRevision {
  if (record.fingerprint === undefined || record.requiredCapabilities === undefined) {
    throw new DigitalEmployeeMigrationError(
      `Profile Revision ${record.profileId}@${record.revision} has incomplete normalized content`,
      'target-inconsistent',
    )
  }
  return record as DigitalEmployeeProfileRevision
}

/** Enrich transitional v1 records from Issues #3/#4 before any mutation is admitted. */
async function ensureRevisionContracts(v1: DigitalEmployeeV1Domain): Promise<void> {
  const revisions = v1.table('profile_revisions')
  for (const [key, stored] of revisions.entries()) {
    if (key !== profileRevisionKey(stored.profileId, stored.revision)
      || stored.profile.id !== stored.profileId) {
      throw new DigitalEmployeeMigrationError(
        `Profile Revision ${JSON.stringify(key)} has inconsistent key or Profile identity`,
        'target-inconsistent',
      )
    }
    const canonicalRequiredCapabilities = requiredCapabilitiesForProfile(stored.profile)
    if (stored.requiredCapabilities !== undefined
      && !isDeepStrictEqual(stored.requiredCapabilities, canonicalRequiredCapabilities)) {
      throw new DigitalEmployeeMigrationError(
        `Profile Revision ${stored.profileId}@${stored.revision} has non-canonical required capabilities`,
        'target-inconsistent',
      )
    }
    const requiredCapabilities = stored.requiredCapabilities ?? canonicalRequiredCapabilities
    const fingerprint = profileContentFingerprint(stored.profile, stored.runtimeTarget, requiredCapabilities)
    const transitionalFingerprint = legacyProfileContentFingerprint(stored.profile, stored.runtimeTarget)
    if (stored.fingerprint !== undefined
      && stored.fingerprint !== fingerprint
      && !(stored.requiredCapabilities === undefined && stored.fingerprint === transitionalFingerprint)) {
      throw new DigitalEmployeeMigrationError(
        `Profile Revision ${stored.profileId}@${stored.revision} has a non-canonical fingerprint`,
        'target-inconsistent',
      )
    }
    if (stored.fingerprint !== fingerprint || stored.requiredCapabilities === undefined) {
      await revisions.put(key, deepFreeze({ ...stored, requiredCapabilities, fingerprint }))
    }
  }
}

async function migrateV0(
  v0: Domain<typeof digitalEmployeeDomainSpec>,
  v1: DigitalEmployeeV1Domain,
  options: OpenDigitalEmployeeStorageOptions,
): Promise<void> {
  const hooks = options.migrationHooks ?? {}
  const state = { copiedRecords: 0 }
  const heads = v1.table('profile_heads')
  const revisions = v1.table('profile_revisions')
  const bindings = v1.table('bindings')

  for (const [key, profile] of [...v0.table('profiles').entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (key !== profile.id) {
      throw new DigitalEmployeeMigrationError(
        `v0 Profile key ${JSON.stringify(key)} does not match id ${JSON.stringify(profile.id)}`,
        'source-inconsistent',
      )
    }
    const revision = revisionRecord(profile)
    await putImmutable(
      revisions,
      'profile_revisions',
      profileRevisionKey(profile.id, profile.revision),
      revision,
      state,
      hooks,
    )
    await putImmutable(heads, 'profile_heads', profile.id, migratedHead(profile), state, hooks)
  }

  for (const [key, binding] of [...v0.table('bindings').entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (key !== legacyBindingKey(binding.teamId, binding.memberName)
      || binding.profile.id !== binding.profileId
      || binding.profile.revision !== binding.profileRevision) {
      throw new DigitalEmployeeMigrationError(
        `v0 Binding ${JSON.stringify(key)} has inconsistent key or Profile identity`,
        'source-inconsistent',
      )
    }
    const migratedKey = digitalEmployeeBindingKey(binding.teamId, binding.memberName)
    // Route proof depends on live Agent activation. Once a prior attempt has
    // durably chosen a valid route, retain it so a cold retry cannot oscillate
    // between exact and legacy merely because the child is not live yet.
    const current = bindings.get(migratedKey)
    const target = current?.runtimeTarget
      ?? migratedRuntimeTargetSchema.parse(
        options.resolveBindingRuntimeTarget?.(binding) ?? legacyInheritLeadRuntimeTarget,
      )
    await putImmutable(
      bindings,
      'bindings',
      migratedKey,
      bindingRecord(binding, target),
      state,
      hooks,
    )
  }

  assertV1Consistency(v1)
}

function assertV1Consistency(v1: DigitalEmployeeV1Domain): void {
  const revisions = v1.table('profile_revisions')
  for (const [key, head] of v1.table('profile_heads').entries()) {
    if (key !== head.profileId) {
      throw new DigitalEmployeeMigrationError(
        `Profile Head key ${JSON.stringify(key)} does not match id ${JSON.stringify(head.profileId)}`,
        'target-inconsistent',
      )
    }
    if (head.activeRevision !== undefined && head.activeRevision < head.historyStartsAtRevision) {
      throw new DigitalEmployeeMigrationError(
        `Profile Head ${JSON.stringify(head.profileId)} points outside retained history`,
        'target-inconsistent',
      )
    }
    const retained = [...revisions.entries()]
      .map(([, revision]) => revision)
      .filter(revision => revision.profileId === head.profileId
        && revision.revision >= head.historyStartsAtRevision
        && revision.revision <= head.latestRevision)
    const expectedCount = head.latestRevision - head.historyStartsAtRevision + 1
    if (retained.length !== expectedCount) {
      throw new DigitalEmployeeMigrationError(
        `Profile Head ${JSON.stringify(head.profileId)} has a gap in retained Revision history`,
        'target-inconsistent',
      )
    }
    const referenced = head.activeRevision === undefined
      ? [head.latestRevision]
      : [head.latestRevision, head.activeRevision]
    for (const revision of new Set(referenced)) {
      const record = revisions.get(profileRevisionKey(head.profileId, revision))
      if (record === undefined || record.fingerprint === undefined
        || record.profileId !== head.profileId || record.revision !== revision) {
        throw new DigitalEmployeeMigrationError(
          `Profile Head ${JSON.stringify(head.profileId)} points to missing Revision ${revision}`,
          'target-inconsistent',
        )
      }
    }
  }
  const launchRequests = new Set<string>()
  const externalHandles = new Set<string>()
  for (const [key, binding] of v1.table('bindings').entries()) {
    if (key !== digitalEmployeeBindingKey(binding.teamId, binding.memberName)
      || binding.profile.id !== binding.profileId
      || binding.profile.revision !== binding.profileRevision) {
      throw new DigitalEmployeeMigrationError(
        `Binding ${JSON.stringify(key)} has inconsistent key or Profile identity`,
        'target-inconsistent',
      )
    }
    if (!isDeepStrictEqual(binding.requiredCapabilities, requiredCapabilitiesForProfile(binding.profile))) {
      throw new DigitalEmployeeMigrationError(
        `Binding ${JSON.stringify(key)} has non-canonical required capabilities`,
        'target-inconsistent',
      )
    }
    if (binding.runtimeTarget.kind === 'external-agent' && binding.nativeRuntimeHandle !== undefined) {
      const providerHandle = canonicalJson([binding.runtimeTarget.provider, binding.nativeRuntimeHandle])
      if (externalHandles.has(providerHandle)) {
        throw new DigitalEmployeeMigrationError(
          `Binding ${JSON.stringify(key)} reuses an external provider native handle`,
          'target-inconsistent',
        )
      }
      externalHandles.add(providerHandle)
    }
    if (binding.launchRequestId !== undefined) {
      const scopedRequest = canonicalJson([binding.teamId, binding.launchRequestId])
      if (launchRequests.has(scopedRequest)) {
        throw new DigitalEmployeeMigrationError(
          `Binding ${JSON.stringify(key)} reuses a Team-scoped launch request id`,
          'target-inconsistent',
        )
      }
      launchRequests.add(scopedRequest)
      const { revision: _revision, createdAt: _createdAt, updatedAt: _updatedAt, ...profile } = binding.profile
      const profileFingerprint = profileContentFingerprint(
        profile,
        binding.runtimeTarget,
        binding.requiredCapabilities,
      )
      if (!isDeepStrictEqual(binding.preflightRuntimeTarget, binding.runtimeTarget)
        || binding.profileFingerprint !== profileFingerprint
        || binding.requestFingerprint !== launchRequestFingerprint({
          profileId: binding.profileId,
          profileRevision: binding.profileRevision,
          profileFingerprint,
          runtimeTarget: binding.runtimeTarget,
          preflightRuntimeTarget: binding.preflightRuntimeTarget!,
          requiredCapabilities: binding.requiredCapabilities,
          capabilityGeneration: binding.capabilityGeneration!,
          assignmentHash: binding.assignmentHash!,
        })) {
        throw new DigitalEmployeeMigrationError(
          `Binding ${JSON.stringify(key)} has inconsistent launch fingerprints`,
          'target-inconsistent',
        )
      }
    }
  }
  for (const [key, run] of v1.table('run_index').entries()) {
    if (key !== run.runId) {
      throw new DigitalEmployeeMigrationError(
        `Run index key ${JSON.stringify(key)} does not match Run identity ${JSON.stringify(run.runId)}`,
        'target-inconsistent',
      )
    }
  }
  const evalSets = v1.table('eval_sets')
  for (const [key, record] of evalSets.entries()) {
    if ('headRevision' in record) {
      if (key !== evalSetHeadKey(record.evalSetId)) {
        throw new DigitalEmployeeMigrationError(
          `Eval Set Head key ${JSON.stringify(key)} does not match its identity`,
          'target-inconsistent',
        )
      }
      const latest = evalSets.get(evalSetRevisionKey(record.evalSetId, record.latestRevision))
      if (latest === undefined || !('revision' in latest)
        || latest.profileId !== record.profileId) {
        throw new DigitalEmployeeMigrationError(
          `Eval Set Head ${JSON.stringify(record.evalSetId)} points to a missing Revision`,
          'target-inconsistent',
        )
      }
    } else if (key !== evalSetRevisionKey(record.evalSetId, record.revision)
      || record.fingerprint !== evalSetContentFingerprint(record.evalSet)) {
      throw new DigitalEmployeeMigrationError(
        `Eval Set Revision ${JSON.stringify(key)} has inconsistent identity or fingerprint`,
        'target-inconsistent',
      )
    }
  }
  for (const [, head] of v1.table('profile_heads').entries()) {
    if (head.requiredEvalSet === undefined) continue
    const required = evalSets.get(evalSetRevisionKey(
      head.requiredEvalSet.evalSetId,
      head.requiredEvalSet.revision,
    ))
    if (required === undefined || !('revision' in required) || required.profileId !== head.profileId) {
      throw new DigitalEmployeeMigrationError(
        `Profile Head ${JSON.stringify(head.profileId)} points to an invalid required Eval Set`,
        'target-inconsistent',
      )
    }
  }
  for (const [key, run] of v1.table('eval_runs').entries()) {
    if (key !== run.evalRunId) {
      throw new DigitalEmployeeMigrationError(
        `Eval Run key ${JSON.stringify(key)} does not match Eval Run identity ${JSON.stringify(run.evalRunId)}`,
        'target-inconsistent',
      )
    }
    const evalSet = evalSets.get(evalSetRevisionKey(run.evalSetId, run.evalSetRevision))
    const profile = revisions.get(profileRevisionKey(run.profileId, run.profileRevision))
    if (evalSet === undefined || !('revision' in evalSet)
      || evalSet.fingerprint !== run.evalSetFingerprint
      || profile === undefined || profile.fingerprint !== run.profileFingerprint
      || !isDeepStrictEqual(run.runtimeTarget, profile.runtimeTarget)) {
      throw new DigitalEmployeeMigrationError(
        `Eval Run ${JSON.stringify(key)} points to inconsistent immutable inputs`,
        'target-inconsistent',
      )
    }
  }
}

async function closeAfterFailure(
  primary: unknown,
  domains: readonly { close(): Promise<void> }[],
): Promise<never> {
  const settled = await Promise.allSettled(domains.map(domain => domain.close()))
  const failures = settled.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
  if (failures.length > 0) {
    throw new AggregateError([primary, ...failures], 'Digital Employee migration and storage cleanup failed')
  }
  throw primary
}

/**
 * Host-owned v1 store. The opening sequence is the migration transaction:
 * v1 first, optional read-only v0 copy, v0 close, and completion marker last.
 */
export class DigitalEmployeeStorage {
  /** Serializes cross-record Binding invariants before the domain write chain. */
  private bindingWriteTail: Promise<void> = Promise.resolve()
  /** Serializes bounded Run upserts and retention trimming. */
  private runWriteTail: Promise<void> = Promise.resolve()
  /** Serializes immutable Eval Set history publication. */
  private evalSetWriteTail: Promise<void> = Promise.resolve()
  /** Serializes Eval Run state transitions and bounded retention. */
  private evalRunWriteTail: Promise<void> = Promise.resolve()

  constructor(private readonly domain: DigitalEmployeeV1Domain) {}

  getProfileHead(id: string): DigitalEmployeeProfileHead | undefined {
    return this.domain.table('profile_heads').get(id)
  }

  profileHeadEntries(): IterableIterator<[string, DigitalEmployeeProfileHead]> {
    return this.domain.table('profile_heads').entries()
  }

  getProfileRevision(id: string, revision: number): DigitalEmployeeProfileRevision | undefined {
    const record = this.domain.table('profile_revisions').get(profileRevisionKey(id, revision))
    return record === undefined ? undefined : completeRevision(record)
  }

  profileRevisionEntries(id: string): IterableIterator<[string, DigitalEmployeeProfileRevision]> {
    const entries = [...this.domain.table('profile_revisions').entries()]
      .filter(([, record]) => record.profileId === id)
      .map(([key, record]): [string, DigitalEmployeeProfileRevision] => [key, completeRevision(record)])
    return entries[Symbol.iterator]()
  }

  getProfile(id: string): DigitalEmployeeProfile | undefined {
    const head = this.domain.table('profile_heads').get(id)
    if (head === undefined) return undefined
    const revision = this.getProfileRevision(id, head.latestRevision)
    if (revision === undefined) {
      throw new DigitalEmployeeMigrationError(
        `Profile Head ${JSON.stringify(id)} points to missing latest Revision ${head.latestRevision}`,
        'target-inconsistent',
      )
    }
    return profileFromRevision(revision)
  }

  getProfileAtRevision(id: string, revision: number): DigitalEmployeeProfile | undefined {
    const record = this.getProfileRevision(id, revision)
    return record === undefined ? undefined : profileFromRevision(record)
  }

  getActiveProfile(id: string): DigitalEmployeeProfile | undefined {
    const head = this.getProfileHead(id)
    return head?.activeRevision === undefined
      ? undefined
      : this.getProfileAtRevision(id, head.activeRevision)
  }

  profileEntries(): IterableIterator<[string, DigitalEmployeeProfile]> {
    const entries = [...this.domain.table('profile_heads').keys()].map((id): [string, DigitalEmployeeProfile] => {
      const profile = this.getProfile(id)
      if (profile === undefined) {
        throw new DigitalEmployeeMigrationError(`Profile Head ${JSON.stringify(id)} disappeared`, 'target-inconsistent')
      }
      return [id, profile]
    })
    return entries[Symbol.iterator]()
  }

  get profileCount(): number {
    return this.domain.table('profile_heads').size
  }

  putProfileRevision(revision: DigitalEmployeeProfileRevision): Promise<void> {
    return putImmutable(
      this.domain.table('profile_revisions'),
      'profile_revisions',
      profileRevisionKey(revision.profileId, revision.revision),
      revision,
      { copiedRecords: 0 },
      {},
    )
  }

  putProfileHead(head: DigitalEmployeeProfileHead): Promise<void> {
    return this.domain.table('profile_heads').put(head.profileId, head)
  }

  getEvalSetHead(evalSetId: string): DigitalEmployeeEvalSetHead | undefined {
    const record = this.domain.table('eval_sets').get(evalSetHeadKey(evalSetId))
    return record !== undefined && 'headRevision' in record ? record : undefined
  }

  evalSetHeadEntries(): IterableIterator<[string, DigitalEmployeeEvalSetHead]> {
    return [...this.domain.table('eval_sets').entries()]
      .filter((entry): entry is [string, DigitalEmployeeEvalSetHead] => 'headRevision' in entry[1])
      [Symbol.iterator]()
  }

  getEvalSetRevision(evalSetId: string, revision: number): DigitalEmployeeEvalSetRevision | undefined {
    const record = this.domain.table('eval_sets').get(evalSetRevisionKey(evalSetId, revision))
    return record !== undefined && 'revision' in record ? record : undefined
  }

  evalSetRevisionEntries(evalSetId: string): IterableIterator<[string, DigitalEmployeeEvalSetRevision]> {
    return [...this.domain.table('eval_sets').entries()]
      .filter((entry): entry is [string, DigitalEmployeeEvalSetRevision] => (
        'revision' in entry[1] && entry[1].evalSetId === evalSetId
      ))
      [Symbol.iterator]()
  }

  get evalSetCount(): number {
    return [...this.evalSetHeadEntries()].length
  }

  putEvalSetRevision(revision: DigitalEmployeeEvalSetRevision): Promise<void> {
    const operation = this.evalSetWriteTail.then(async () => {
      const table = this.domain.table('eval_sets')
      const key = evalSetRevisionKey(revision.evalSetId, revision.revision)
      const current = table.get(key)
      if (current !== undefined) {
        if (!isDeepStrictEqual(current, revision)) {
          throw new DigitalEmployeeMigrationError(
            `Eval Set Revision ${JSON.stringify(key)} cannot be rewritten`,
            'target-diverged',
          )
        }
        return
      }
      await table.put(key, revision)
    })
    this.evalSetWriteTail = operation.catch(() => undefined)
    return operation
  }

  putEvalSetHead(head: DigitalEmployeeEvalSetHead): Promise<void> {
    const operation = this.evalSetWriteTail.then(async () => {
      await this.domain.table('eval_sets').put(evalSetHeadKey(head.evalSetId), head)
    })
    this.evalSetWriteTail = operation.catch(() => undefined)
    return operation
  }

  getBinding(key: string): DigitalEmployeeBindingV1 | undefined {
    return this.domain.table('bindings').get(key)
  }

  bindingEntries(): IterableIterator<[string, DigitalEmployeeBindingV1]> {
    return this.domain.table('bindings').entries()
  }

  /** Find the only Binding for one Team-scoped caller launch identity. */
  findBindingByLaunchRequest(
    teamId: string,
    launchRequestId: LaunchRequestId,
  ): [string, DigitalEmployeeBindingV1] | undefined {
    const matches = [...this.domain.table('bindings').entries()]
      .filter(([, binding]) => binding.teamId === teamId && binding.launchRequestId === launchRequestId)
    if (matches.length > 1) {
      throw new DigitalEmployeeMigrationError(
        `Team ${JSON.stringify(teamId)} has duplicate launch request ${JSON.stringify(launchRequestId)}`,
        'target-inconsistent',
      )
    }
    return matches[0]
  }

  putBinding(key: string, binding: DigitalEmployeeBinding | DigitalEmployeeBindingV1): Promise<void> {
    const record = bindingRecord(binding)
    const operation = this.bindingWriteTail.then(async () => {
      const bindings = this.domain.table('bindings')
      if (record.runtimeTarget.kind === 'external-agent' && record.nativeRuntimeHandle !== undefined) {
        for (const [ownerKey, owner] of bindings.entries()) {
          if (ownerKey !== key
            && owner.runtimeTarget.kind === 'external-agent'
            && owner.runtimeTarget.provider === record.runtimeTarget.provider
            && owner.nativeRuntimeHandle === record.nativeRuntimeHandle) {
            throw new DigitalEmployeeMigrationError(
              `Binding ${JSON.stringify(key)} reuses the external provider native handle owned by ${JSON.stringify(ownerKey)}`,
              'target-inconsistent',
            )
          }
        }
      }
      await bindings.put(key, record)
    })
    this.bindingWriteTail = operation.catch(() => undefined)
    return operation
  }

  getRun(runId: DigitalEmployeeRunId): DigitalEmployeeRunIndexRecord | undefined {
    return this.domain.table('run_index').get(runId)
  }

  runEntries(): IterableIterator<[string, DigitalEmployeeRunIndexRecord]> {
    return this.domain.table('run_index').entries()
  }

  /** Upsert one deterministic Run and retain only the newest bounded index rows. */
  putRun(record: DigitalEmployeeRunIndexRecord, maxEntries: number): Promise<void> {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      return Promise.reject(new TypeError('Run index limit must be a positive safe integer'))
    }
    const detached = deepFreeze(record)
    const operation = this.runWriteTail.then(async () => {
      const runs = this.domain.table('run_index')
      await runs.put(detached.runId, detached)
      const overflow = [...runs.entries()]
        .sort(([, left], [, right]) => right.startedAt - left.startedAt
          || right.runId.localeCompare(left.runId))
        .slice(maxEntries)
      for (const [key] of overflow) await runs.delete(key)
    })
    this.runWriteTail = operation.catch(() => undefined)
    return operation
  }

  getEvalRun(evalRunId: DigitalEmployeeEvalRunId): DigitalEmployeeEvalRunRecord | undefined {
    return this.domain.table('eval_runs').get(evalRunId)
  }

  evalRunEntries(): IterableIterator<[string, DigitalEmployeeEvalRunRecord]> {
    return this.domain.table('eval_runs').entries()
  }

  putEvalRun(record: DigitalEmployeeEvalRunRecord, maxEntries: number): Promise<void> {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      return Promise.reject(new TypeError('Eval Run retention limit must be a positive safe integer'))
    }
    const detached = deepFreeze(record)
    const operation = this.evalRunWriteTail.then(async () => {
      const runs = this.domain.table('eval_runs')
      const current = runs.get(detached.evalRunId)
      if (current !== undefined) {
        const immutable = [
          'requestFingerprint', 'teamId', 'profileId', 'profileRevision', 'profileFingerprint',
          'runtimeTarget', 'capabilityGeneration', 'evalSetId', 'evalSetRevision',
          'evalSetFingerprint', 'assertionSchemaVersion', 'environmentFingerprint',
          'effectiveToolAllowlist', 'startedAt',
        ] as const
        if (immutable.some(field => !isDeepStrictEqual(current[field], detached[field]))) {
          throw new DigitalEmployeeMigrationError(
            `Eval Run ${JSON.stringify(detached.evalRunId)} changed immutable identity`,
            'target-diverged',
          )
        }
        if (current.status !== 'running' && !isDeepStrictEqual(current, detached)) {
          throw new DigitalEmployeeMigrationError(
            `terminal Eval Run ${JSON.stringify(detached.evalRunId)} cannot transition`,
            'target-diverged',
          )
        }
      }
      await runs.put(detached.evalRunId, detached)
      const overflow = [...runs.entries()]
        .filter(([, candidate]) => candidate.status !== 'running')
        .sort(([, left], [, right]) => right.startedAt - left.startedAt
          || right.evalRunId.localeCompare(left.evalRunId))
        .slice(maxEntries)
      for (const [key] of overflow) await runs.delete(key)
    })
    this.evalRunWriteTail = operation.catch(() => undefined)
    return operation
  }

  async close(): Promise<void> {
    await Promise.all([
      this.bindingWriteTail,
      this.runWriteTail,
      this.evalSetWriteTail,
      this.evalRunWriteTail,
    ])
    await this.domain.close()
  }
}

/** Open v1 and migrate v0 exactly once before returning a mutation-capable store. */
export async function openDigitalEmployeeStorage(
  facility: DomainFacility,
  options: OpenDigitalEmployeeStorageOptions = {},
): Promise<DigitalEmployeeStorage> {
  const v1 = await facility.open(digitalEmployeeV1DomainSpec)
  try {
    await ensureRevisionContracts(v1)
  } catch (error: unknown) {
    return await closeAfterFailure(error, [v1])
  }
  if (v1.global.get().status === 'complete') {
    try {
      assertV1Consistency(v1)
      return new DigitalEmployeeStorage(v1)
    } catch (error: unknown) {
      return await closeAfterFailure(error, [v1])
    }
  }

  let v0: Domain<typeof digitalEmployeeDomainSpec> | undefined
  try {
    v0 = await facility.open(digitalEmployeeDomainSpec)
    await migrateV0(v0, v1, options)
    await v0.close()
    v0 = undefined
    await options.migrationHooks?.beforeCompletion?.()
    await v1.global.set(completeMigrationMarker)
    return new DigitalEmployeeStorage(v1)
  } catch (error: unknown) {
    return await closeAfterFailure(error, v0 === undefined ? [v1] : [v0, v1])
  }
}
