/** Version-1 durable storage generation and v0 migration primitives. */

import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { Domain, DomainFacility, KvTable } from '@deepseek-ai/dsh-storage-domain'
import {
  digitalEmployeeDomainSpec,
  type DigitalEmployeeBinding,
  digitalEmployeeProfileDraftSchema,
  digitalEmployeeProfileSchema,
  digitalEmployeeRuntimeTargetSchema,
  legacyDigitalEmployeeProfileDraftSchema,
  legacyDigitalEmployeeProfileSchema,
  type LegacyDigitalEmployeeProfile,
  type LegacyDigitalEmployeeProfileDraft,
} from './spec.ts'
import { requiredCapabilitiesForProfile } from './runtime.ts'
import type {
  DigitalEmployeeProfile,
  DigitalEmployeeProfileDraft,
  DigitalEmployeeProfileHead,
  DigitalEmployeeProfileRevision,
  DigitalEmployeeRequiredCapabilities,
  DigitalEmployeeRuntimeTarget,
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

export const digitalEmployeeBindingV1Schema = z.object({
  schemaVersion: z.literal(1),
  teamId: nonEmptyText,
  memberName: z.string().min(1).max(64),
  memberId: nonEmptyText.optional(),
  profileId: z.string().min(1).max(64),
  profileRevision: positiveInteger,
  profile: storedProfileSchema,
  runtimeTarget: migratedRuntimeTargetSchema,
  resolvedRuntimeTarget: resolvedRuntimeTargetSchema.optional(),
  requiredCapabilities: requiredCapabilitiesSchema.optional(),
  phase: z.union([z.literal('pending'), z.literal('active'), z.literal('failed')]),
  error: z.string().max(2048).optional(),
}).strict().transform(binding => ({
  ...binding,
  requiredCapabilities: binding.requiredCapabilities ?? requiredCapabilitiesForProfile(binding.profile),
}))

export type DigitalEmployeeBindingV1 = z.infer<typeof digitalEmployeeBindingV1Schema>

const runIndexRecordSchema = z.object({ schemaVersion: z.literal(1), runId: boundedId }).strict()
const evalSetRecordSchema = z.object({
  schemaVersion: z.literal(1),
  evalSetId: boundedId,
  revision: positiveInteger,
}).strict()
const evalRunRecordSchema = z.object({ schemaVersion: z.literal(1), evalRunId: boundedId }).strict()

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
    run_index: domainTable<string, z.infer<typeof runIndexRecordSchema>>(runIndexRecordSchema),
    eval_sets: domainTable<string, z.infer<typeof evalSetRecordSchema>>(evalSetRecordSchema),
    eval_runs: domainTable<string, z.infer<typeof evalRunRecordSchema>>(evalRunRecordSchema),
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

/** Path-safe v1 Binding key; identity fields remain visible inside the record. */
export function digitalEmployeeBindingKey(teamId: string, memberName: string): string {
  return durableIdentityKey('binding', [teamId, memberName])
}

/** Fixed-length key suitable for JSON per-record paths even when a valid v0 identity is long. */
function durableIdentityKey(prefix: 'profile' | 'binding', identity: readonly unknown[]): string {
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

function bindingRecord(
  binding: DigitalEmployeeBinding | DigitalEmployeeBindingV1,
  fallbackTarget: MigratedRuntimeTarget = legacyInheritLeadRuntimeTarget,
): DigitalEmployeeBindingV1 {
  const runtimeTarget = 'runtimeTarget' in binding ? binding.runtimeTarget : fallbackTarget
  const profile = migratedProfileVocabulary(binding.profile)
  const requiredCapabilities = 'requiredCapabilities' in binding
    ? binding.requiredCapabilities
    : requiredCapabilitiesForProfile(profile)
  return deepFreeze({
    schemaVersion: 1,
    teamId: binding.teamId,
    memberName: binding.memberName,
    ...(binding.memberId === undefined ? {} : { memberId: binding.memberId }),
    profileId: binding.profileId,
    profileRevision: binding.profileRevision,
    profile,
    runtimeTarget,
    ...('resolvedRuntimeTarget' in binding && binding.resolvedRuntimeTarget !== undefined
      ? { resolvedRuntimeTarget: binding.resolvedRuntimeTarget }
      : {}),
    requiredCapabilities,
    phase: binding.phase,
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

  getBinding(key: string): DigitalEmployeeBindingV1 | undefined {
    return this.domain.table('bindings').get(key)
  }

  bindingEntries(): IterableIterator<[string, DigitalEmployeeBindingV1]> {
    return this.domain.table('bindings').entries()
  }

  putBinding(key: string, binding: DigitalEmployeeBinding | DigitalEmployeeBindingV1): Promise<void> {
    return this.domain.table('bindings').put(key, bindingRecord(binding))
  }

  close(): Promise<void> {
    return this.domain.close()
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
