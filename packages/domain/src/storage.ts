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
} from './spec.ts'
import type { DigitalEmployeeProfile, DigitalEmployeeProfileDraft } from './types.ts'

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

/** Compatibility target attached only where v0 could not prove an exact route. */
export interface LegacyInheritLeadRuntimeTarget {
  readonly kind: 'legacy-inherit-lead'
}

/** Exact DSH route recovered from an authoritative child descriptor. */
export interface MigratedDshModelRuntimeTarget {
  readonly kind: 'dsh-model'
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

export type MigratedRuntimeTarget = LegacyInheritLeadRuntimeTarget | MigratedDshModelRuntimeTarget

export const legacyInheritLeadRuntimeTarget: LegacyInheritLeadRuntimeTarget = Object.freeze({
  kind: 'legacy-inherit-lead',
})

export interface DigitalEmployeeProfileHeadV1 {
  readonly schemaVersion: 1
  readonly profileId: string
  readonly headRevision: number
  readonly latestRevision: number
  readonly activeRevision: number
  readonly historyStartsAtRevision: number
  readonly createdAt: number
  readonly updatedAt: number
}

export interface DigitalEmployeeProfileRevisionV1 {
  readonly schemaVersion: 1
  readonly profileId: string
  readonly revision: number
  readonly profile: DigitalEmployeeProfileDraft
  readonly runtimeTarget: MigratedRuntimeTarget
  readonly createdAt: number
  readonly updatedAt: number
}

const safeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const boundedId = z.string().min(1).max(256)
const nonEmptyText = z.string().min(1)

export const migrationMarkerSchema = z.union([
  z.object({ formatVersion: z.literal(1), status: z.literal('pending'), sourceVersion: z.literal(0) }).strict(),
  z.object({ formatVersion: z.literal(1), status: z.literal('complete'), sourceVersion: z.literal(0) }).strict(),
]) as z.ZodType<DigitalEmployeeMigrationMarker>

export const migratedRuntimeTargetSchema = z.union([
  z.object({ kind: z.literal('legacy-inherit-lead') }).strict(),
  z.object({
    kind: z.literal('dsh-model'),
    provider: nonEmptyText,
    model: nonEmptyText,
    reasoningEffort: nonEmptyText.optional(),
  }).strict(),
]) as z.ZodType<MigratedRuntimeTarget>

export const digitalEmployeeProfileHeadV1Schema = z.object({
  schemaVersion: z.literal(1),
  profileId: boundedId,
  headRevision: positiveInteger,
  latestRevision: positiveInteger,
  activeRevision: positiveInteger,
  historyStartsAtRevision: positiveInteger,
  createdAt: safeInteger,
  updatedAt: safeInteger,
}).strict().superRefine((head, ctx) => {
  if (head.historyStartsAtRevision > head.latestRevision) {
    ctx.addIssue({ code: 'custom', path: ['historyStartsAtRevision'], message: 'history start exceeds latest revision' })
  }
  if (head.activeRevision > head.latestRevision) {
    ctx.addIssue({ code: 'custom', path: ['activeRevision'], message: 'active revision exceeds latest revision' })
  }
  if (head.updatedAt < head.createdAt) {
    ctx.addIssue({ code: 'custom', path: ['updatedAt'], message: 'updatedAt precedes createdAt' })
  }
}) as z.ZodType<DigitalEmployeeProfileHeadV1>

export const digitalEmployeeProfileRevisionV1Schema = z.object({
  schemaVersion: z.literal(1),
  profileId: boundedId,
  revision: positiveInteger,
  profile: digitalEmployeeProfileDraftSchema,
  runtimeTarget: migratedRuntimeTargetSchema,
  createdAt: safeInteger,
  updatedAt: safeInteger,
}).strict().refine(record => record.updatedAt >= record.createdAt, {
  path: ['updatedAt'],
  message: 'updatedAt must not precede createdAt',
}) as z.ZodType<DigitalEmployeeProfileRevisionV1>

export const digitalEmployeeBindingV1Schema = z.object({
  schemaVersion: z.literal(1),
  teamId: nonEmptyText,
  memberName: z.string().min(1).max(64),
  memberId: nonEmptyText.optional(),
  profileId: z.string().min(1).max(64),
  profileRevision: positiveInteger,
  profile: digitalEmployeeProfileSchema,
  runtimeTarget: migratedRuntimeTargetSchema,
  phase: z.union([z.literal('pending'), z.literal('active'), z.literal('failed')]),
  error: z.string().max(2048).optional(),
}).strict()

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
    profile_heads: domainTable<string, DigitalEmployeeProfileHeadV1>(digitalEmployeeProfileHeadV1Schema),
    profile_revisions: domainTable<string, DigitalEmployeeProfileRevisionV1>(digitalEmployeeProfileRevisionV1Schema),
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

function profileDraft(profile: DigitalEmployeeProfile): DigitalEmployeeProfileDraft {
  return deepFreeze({
    id: profile.id,
    employeeName: profile.employeeName,
    displayName: profile.displayName,
    description: profile.description,
    provider: profile.provider,
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
  profile: DigitalEmployeeProfile,
  runtimeTarget: MigratedRuntimeTarget = legacyInheritLeadRuntimeTarget,
): DigitalEmployeeProfileRevisionV1 {
  return deepFreeze({
    schemaVersion: 1,
    profileId: profile.id,
    revision: profile.revision,
    profile: profileDraft(profile),
    runtimeTarget,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  })
}

function migratedHead(profile: DigitalEmployeeProfile): DigitalEmployeeProfileHeadV1 {
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

function profileFromRevision(record: DigitalEmployeeProfileRevisionV1): DigitalEmployeeProfile {
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
  return deepFreeze({
    schemaVersion: 1,
    teamId: binding.teamId,
    memberName: binding.memberName,
    ...(binding.memberId === undefined ? {} : { memberId: binding.memberId }),
    profileId: binding.profileId,
    profileRevision: binding.profileRevision,
    profile: binding.profile,
    runtimeTarget,
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
    for (const revision of new Set([head.latestRevision, head.activeRevision])) {
      const record = revisions.get(profileRevisionKey(head.profileId, revision))
      if (record === undefined || record.profileId !== head.profileId || record.revision !== revision) {
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

  getProfile(id: string): DigitalEmployeeProfile | undefined {
    const head = this.domain.table('profile_heads').get(id)
    if (head === undefined) return undefined
    const revision = this.domain.table('profile_revisions').get(profileRevisionKey(id, head.latestRevision))
    if (revision === undefined) {
      throw new DigitalEmployeeMigrationError(
        `Profile Head ${JSON.stringify(id)} points to missing latest Revision ${head.latestRevision}`,
        'target-inconsistent',
      )
    }
    return profileFromRevision(revision)
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

  async putProfile(profile: DigitalEmployeeProfile): Promise<void> {
    const heads = this.domain.table('profile_heads')
    const current = heads.get(profile.id)
    const revision = revisionRecord(profile)
    await putImmutable(
      this.domain.table('profile_revisions'),
      'profile_revisions',
      profileRevisionKey(profile.id, profile.revision),
      revision,
      { copiedRecords: 0 },
      {},
    )
    const next: DigitalEmployeeProfileHeadV1 = Object.freeze({
      schemaVersion: 1,
      profileId: profile.id,
      headRevision: (current?.headRevision ?? 0) + 1,
      latestRevision: profile.revision,
      activeRevision: profile.revision,
      historyStartsAtRevision: current?.historyStartsAtRevision ?? profile.revision,
      createdAt: current?.createdAt ?? profile.createdAt,
      updatedAt: profile.updatedAt,
    })
    await heads.put(profile.id, next)
  }

  deleteProfile(id: string): Promise<boolean> {
    return this.domain.table('profile_heads').delete(id)
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
