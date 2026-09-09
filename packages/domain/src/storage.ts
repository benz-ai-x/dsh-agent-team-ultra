/** Isolated B0 storage. Historical Ultra generations are never opened or migrated. */
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { defineDomain, domainTable, type Domain, type DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { digitalEmployeeProfileDraftSchema, digitalEmployeeProfileSchema, launchRequestIdSchema } from './spec.ts'
import { snapshotProfile, snapshotProfileDraft, snapshotProfileHead, snapshotProfileRevision } from './profile-snapshot.ts'
import type { BaselineDataAdmission } from './baseline-data.ts'
import type { DigitalEmployeeProfile, DigitalEmployeeProfileDraft, DigitalEmployeeProfileHead, DigitalEmployeeProfileRevision } from './types.ts'

export interface DigitalEmployeeBinding {
  readonly schemaVersion: 1
  readonly teamId: string
  readonly memberName: string
  readonly memberId?: string
  readonly launchRequestId: string
  readonly requestFingerprint: string
  readonly initialPromptFingerprint: string
  readonly profileId: string
  readonly profileRevision: number
  readonly profileFingerprint: string
  readonly profile: DigitalEmployeeProfile
  readonly provisioningPhase: 'pending' | 'active' | 'failed'
  readonly error?: string
}

const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const time = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/u)
const id = z.string().min(1).max(256)
export const profileHeadSchema = z.object({
  schemaVersion: z.literal(1),
  profileId: id,
  headRevision: positive,
  latestRevision: positive,
  activeRevision: positive.optional(),
  historyStartsAtRevision: positive,
  archivedAt: time.optional(),
  createdAt: time,
  updatedAt: time,
}).strict().refine(head => head.updatedAt >= head.createdAt
  && head.historyStartsAtRevision <= head.latestRevision
  && (head.activeRevision === undefined || (head.activeRevision >= head.historyStartsAtRevision
    && head.activeRevision <= head.latestRevision))) as z.ZodType<DigitalEmployeeProfileHead>

export const profileRevisionSchema = z.object({
  schemaVersion: z.literal(1),
  profileId: id,
  revision: positive,
  profile: digitalEmployeeProfileDraftSchema,
  fingerprint,
  createdAt: time,
  updatedAt: time,
}).strict().refine(row => row.profileId === row.profile.id && row.updatedAt >= row.createdAt
  && row.fingerprint === profileContentFingerprint(row.profile)) as z.ZodType<DigitalEmployeeProfileRevision>

export const digitalEmployeeBindingSchema = z.object({
  schemaVersion: z.literal(1),
  teamId: id,
  memberName: id,
  memberId: id.optional(),
  launchRequestId: launchRequestIdSchema,
  requestFingerprint: fingerprint,
  initialPromptFingerprint: fingerprint,
  profileId: id,
  profileRevision: positive,
  profileFingerprint: fingerprint,
  profile: digitalEmployeeProfileSchema,
  provisioningPhase: z.enum(['pending', 'active', 'failed']),
  error: z.string().max(2048).optional(),
}).strict().refine(row => row.profileId === row.profile.id
  && row.profileRevision === row.profile.revision
  && row.memberName === row.profile.employeeName
  && row.profileFingerprint === profileContentFingerprint(row.profile)
  && (row.provisioningPhase !== 'active' || row.memberId !== undefined)) as z.ZodType<DigitalEmployeeBinding>

export const digitalEmployeeDomainSpec = defineDomain({
  name: 'agent_team_ultra_b0',
  version: 1,
  layout: 'per-record',
  global: {
    schema: z.object({ baseline: z.literal('official-dsh-only-b0') }).strict(),
    initial: { baseline: 'official-dsh-only-b0' as const },
  },
  tables: {
    profile_heads: domainTable<string, DigitalEmployeeProfileHead>(profileHeadSchema),
    profile_revisions: domainTable<string, DigitalEmployeeProfileRevision>(profileRevisionSchema),
    bindings: domainTable<string, DigitalEmployeeBinding>(digitalEmployeeBindingSchema),
  },
})
type EmployeeDomain = Domain<typeof digitalEmployeeDomainSpec>

export function contentFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
export function profileContentFingerprint(profile: DigitalEmployeeProfileDraft): string {
  return contentFingerprint(snapshotProfileDraft(profile))
}
export function profileRevisionKey(profileId: string, revision: number): string {
  return contentFingerprint([profileId, revision])
}
export function digitalEmployeeBindingKey(teamId: string, memberName: string): string {
  return contentFingerprint([teamId, memberName])
}

export class DigitalEmployeeStorage {
  constructor(private readonly domain: EmployeeDomain) {}

  get profileCount(): number { return [...this.profileHeadEntries()].length }
  getProfileHead(profileId: string) { return this.domain.table('profile_heads').get(profileId) }
  profileHeadEntries() { return this.domain.table('profile_heads').entries() }
  getProfileRevision(profileId: string, revision: number) {
    return this.domain.table('profile_revisions').get(profileRevisionKey(profileId, revision))
  }
  *profileRevisionEntries(profileId: string) {
    for (const entry of this.domain.table('profile_revisions').entries()) {
      if (entry[1].profileId === profileId) yield entry
    }
  }
  getBinding(key: string) { return this.domain.table('bindings').get(key) }
  bindingEntries() { return this.domain.table('bindings').entries() }

  async putProfileRevision(value: DigitalEmployeeProfileRevision): Promise<void> {
    const revision = snapshotProfileRevision(profileRevisionSchema.parse(value))
    const key = profileRevisionKey(revision.profileId, revision.revision)
    const existing = this.domain.table('profile_revisions').get(key)
    if (existing !== undefined) {
      if (!isDeepStrictEqual(existing, revision)) throw new Error('An immutable Profile Revision cannot be overwritten')
      return
    }
    await this.domain.table('profile_revisions').put(key, revision)
  }

  async putProfileHead(value: DigitalEmployeeProfileHead): Promise<void> {
    const head = snapshotProfileHead(profileHeadSchema.parse(value))
    this.validateHead(head)
    const current = this.getProfileHead(head.profileId)
    if (current !== undefined && (head.headRevision !== current.headRevision + 1
      || head.latestRevision < current.latestRevision || head.createdAt !== current.createdAt
      || head.updatedAt < current.updatedAt)) throw new Error('Profile Head must advance exactly once')
    await this.domain.table('profile_heads').put(head.profileId, head)
  }

  async putBinding(key: string, value: DigitalEmployeeBinding): Promise<void> {
    const binding = digitalEmployeeBindingSchema.parse(value)
    this.validateBinding(key, binding)
    const current = this.getBinding(key)
    if (current !== undefined) {
      const identity = (row: DigitalEmployeeBinding) => ({
        teamId: row.teamId, memberName: row.memberName, launchRequestId: row.launchRequestId,
        requestFingerprint: row.requestFingerprint, initialPromptFingerprint: row.initialPromptFingerprint,
        profileId: row.profileId, profileRevision: row.profileRevision,
        profileFingerprint: row.profileFingerprint, profile: row.profile,
      })
      if (!isDeepStrictEqual(identity(current), identity(binding))
        || (current.memberId !== undefined && current.memberId !== binding.memberId)
        || (current.provisioningPhase !== 'pending' && current.provisioningPhase !== binding.provisioningPhase)) {
        throw new Error('A Binding cannot change its accepted identity or terminal phase')
      }
    }
    await this.domain.table('bindings').put(key, Object.freeze({ ...binding, profile: snapshotProfile(binding.profile) }))
  }

  /** Validate every cross-record reference before public admission. Orphan Revisions remain retryable. */
  validate(): void {
    for (const [key, head] of this.profileHeadEntries()) {
      if (key !== head.profileId) throw new Error('Profile Head key mismatch')
      this.validateHead(head)
    }
    for (const [key, revision] of this.domain.table('profile_revisions').entries()) {
      if (key !== profileRevisionKey(revision.profileId, revision.revision)) throw new Error('Profile Revision key mismatch')
    }
    const intents = new Set<string>()
    const members = new Set<string>()
    for (const [key, binding] of this.bindingEntries()) {
      this.validateBinding(key, binding)
      const intent = JSON.stringify([binding.teamId, binding.launchRequestId])
      if (intents.has(intent)) throw new Error('A Launch Intent cannot own multiple Bindings')
      intents.add(intent)
      if (binding.memberId !== undefined) {
        if (members.has(binding.memberId)) throw new Error('A member cannot own multiple Bindings')
        members.add(binding.memberId)
      }
    }
  }

  private validateHead(head: DigitalEmployeeProfileHead): void {
    if (this.getProfileRevision(head.profileId, head.latestRevision) === undefined
      || (head.activeRevision !== undefined && this.getProfileRevision(head.profileId, head.activeRevision) === undefined)) {
      throw new Error('Profile Head references a missing immutable Revision')
    }
    let retained = 0
    for (const [, revision] of this.profileRevisionEntries(head.profileId)) {
      if (revision.revision >= head.historyStartsAtRevision && revision.revision <= head.latestRevision) retained += 1
    }
    if (retained !== head.latestRevision - head.historyStartsAtRevision + 1) {
      throw new Error('Profile Head has a gap in retained Revision history')
    }
  }

  private validateBinding(key: string, binding: DigitalEmployeeBinding): void {
    const revision = this.getProfileRevision(binding.profileId, binding.profileRevision)
    if (key !== digitalEmployeeBindingKey(binding.teamId, binding.memberName)
      || revision === undefined || revision.fingerprint !== binding.profileFingerprint
      || !isDeepStrictEqual(snapshotProfileDraft(binding.profile), revision.profile)
      || binding.profile.createdAt !== revision.createdAt || binding.profile.updatedAt !== revision.updatedAt) {
      throw new Error('Binding does not match its immutable Profile Revision')
    }
  }

  async close(): Promise<void> { await this.domain.close() }
}

export async function openDigitalEmployeeStorage(facility: DomainFacility, admission: BaselineDataAdmission): Promise<DigitalEmployeeStorage> {
  admission.assert(facility)
  const domain = await facility.open(digitalEmployeeDomainSpec)
  try {
    const storage = new DigitalEmployeeStorage(domain)
    storage.validate()
    return storage
  } catch (error) {
    await domain.close()
    throw error
  }
}
