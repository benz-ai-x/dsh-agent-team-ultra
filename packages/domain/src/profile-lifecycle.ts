import { Buffer } from 'node:buffer'
import { isDeepStrictEqual } from 'node:util'

import { DigitalEmployeeHostContext } from './host-context.ts'
import type { Agent } from '@deepseek-ai/dsh-agent'

import { digitalEmployeeProfileDraftSchema, selectableDigitalEmployeeRuntimeTargetSchema } from './spec.ts'
import { requiredCapabilitiesForProfile, sameDshTarget } from './runtime.ts'
import { profileContentFingerprint } from './storage.ts'
import type {
  ActivateDigitalEmployeeProfileRequest,
  ArchiveDigitalEmployeeProfileRequest,
  DigitalEmployeeFailure,
  DigitalEmployeeProfileCatalogEntry,
  DigitalEmployeeProfileHead,
  DigitalEmployeeProfileRevision,
  DigitalEmployeeProfileDiffEntry,
  DigitalEmployeeProfileRevisionSummary,
  DigitalEmployeeRuntimeTarget,
  GetDigitalEmployeeProfileRevisionRequest,
  GetDigitalEmployeeProfileRevisionResult,
  MutateDigitalEmployeeProfileHeadResult,
  RollbackDigitalEmployeeProfileRequest,
  RestoreDigitalEmployeeProfileRequest,
  SaveDigitalEmployeeProfileRequest,
  SaveDigitalEmployeeProfileResult,
  SetDigitalEmployeeEvalGateRequest,
  DigitalEmployeePromotionGate,
} from './types.ts'
import { failure } from './host-errors.ts'
import { snapshotProfileDraft, snapshotProfileHead, snapshotProfileRevision } from './profile-snapshot.ts'

function diffValue(value: unknown): string {
  return JSON.stringify(value) ?? 'null'
}

/** Deterministic, bounded structural comparison of immutable Revision content. */
function profileRevisionDiff(
  before: DigitalEmployeeProfileRevision | undefined,
  after: DigitalEmployeeProfileRevision,
  limit: number,
): { readonly entries: readonly DigitalEmployeeProfileDiffEntry[]; readonly truncated: boolean } {
  const entries: DigitalEmployeeProfileDiffEntry[] = []
  const append = (entry: DigitalEmployeeProfileDiffEntry): void => {
    if (entries.length <= limit) entries.push(Object.freeze(entry))
  }
  const walk = (left: unknown, right: unknown, path: string): void => {
    if (entries.length > limit || Object.is(left, right)) return
    if (Array.isArray(left) && Array.isArray(right)) {
      const length = Math.max(left.length, right.length)
      for (let index = 0; index < length && entries.length <= limit; index += 1) {
        const nextPath = `${path}[${index}]`
        if (index >= left.length) append({ path: nextPath, kind: 'added', after: diffValue(right[index]) })
        else if (index >= right.length) append({ path: nextPath, kind: 'removed', before: diffValue(left[index]) })
        else walk(left[index], right[index], nextPath)
      }
      return
    }
    if (left !== null && right !== null && typeof left === 'object' && typeof right === 'object'
      && !Array.isArray(left) && !Array.isArray(right)) {
      const leftRecord = left as Record<string, unknown>
      const rightRecord = right as Record<string, unknown>
      const keys = [...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])].sort()
      for (const key of keys) {
        if (entries.length > limit) break
        const nextPath = path === '' ? key : `${path}.${key}`
        if (!Object.hasOwn(leftRecord, key)) {
          append({ path: nextPath, kind: 'added', after: diffValue(rightRecord[key]) })
        } else if (!Object.hasOwn(rightRecord, key)) {
          append({ path: nextPath, kind: 'removed', before: diffValue(leftRecord[key]) })
        } else {
          walk(leftRecord[key], rightRecord[key], nextPath)
        }
      }
      return
    }
    append({ path, kind: 'changed', before: diffValue(left), after: diffValue(right) })
  }
  walk(
    before === undefined
      ? {}
      : {
        profile: before.profile,
        runtimeTarget: before.runtimeTarget,
        requiredCapabilities: before.requiredCapabilities,
      },
    {
      profile: after.profile,
      runtimeTarget: after.runtimeTarget,
      requiredCapabilities: after.requiredCapabilities,
    },
    '',
  )
  return Object.freeze({
    entries: Object.freeze(entries.slice(0, limit)),
    truncated: entries.length > limit,
  })
}

function sameRuntimeTarget(left: DigitalEmployeeRuntimeTarget, right: DigitalEmployeeRuntimeTarget): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === 'legacy-inherit-lead' || right.kind === 'legacy-inherit-lead') return true
  if (left.kind === 'external-agent' || right.kind === 'external-agent') {
    return left.kind === 'external-agent' && right.kind === 'external-agent' && left.provider === right.provider
  }
  return sameDshTarget(left, right)
}

function saveRejected(error: DigitalEmployeeFailure): SaveDigitalEmployeeProfileResult {
  return Object.freeze({ ok: false, error })
}

function headMutationRejected(error: DigitalEmployeeFailure): MutateDigitalEmployeeProfileHeadResult {
  return Object.freeze({ ok: false, error })
}

function revisionRejected(error: DigitalEmployeeFailure): GetDigitalEmployeeProfileRevisionResult {
  return Object.freeze({ ok: false, error })
}

export class ProfileLifecycle {
  constructor(
    private readonly host: DigitalEmployeeHostContext,
    private readonly promotionGate: (
      caller: Agent, teamId: string, head: DigitalEmployeeProfileHead, revision: DigitalEmployeeProfileRevision,
    ) => DigitalEmployeePromotionGate,
  ) {}

  /** Public Host Revision inspector guarded by exact live Lead authority. */
  profileRevision(
    caller: Agent,
    request: GetDigitalEmployeeProfileRevisionRequest,
  ): Promise<GetDigitalEmployeeProfileRevisionResult> {
    if (!this.host.admissionOpen) {
      return Promise.resolve(revisionRejected(failure('service-disposed', 'Digital Employee service is disposing')))
    }
    const authorityFailure = this.host.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) return Promise.resolve(revisionRejected(authorityFailure))
    if (!Number.isSafeInteger(request.revision) || request.revision < 1) {
      return Promise.resolve(revisionRejected(failure('profile-invalid', 'Revision must be a positive integer')))
    }
    const storage = this.host.storage
    const head = storage.getProfileHead(request.profileId)
    if (head === undefined) {
      return Promise.resolve(revisionRejected(failure('profile-not-found', `profile "${request.profileId}" not found`)))
    }
    const revision = storage.getProfileRevision(request.profileId, request.revision)
    if (revision === undefined || request.revision < head.historyStartsAtRevision
      || request.revision > head.latestRevision) {
      return Promise.resolve(revisionRejected(failure(
        'revision-not-found',
        `Profile Revision ${request.revision} is not in retained history`,
        head,
      )))
    }
    const active = head.activeRevision === undefined
      ? undefined
      : storage.getProfileRevision(head.profileId, head.activeRevision)
    if (head.activeRevision !== undefined && active === undefined) {
      throw new Error(`Digital Employee Profile Head "${head.profileId}" has no active Revision`)
    }
    const comparison = profileRevisionDiff(active, revision, this.host.config.maxDiffEntries)
    return Promise.resolve(Object.freeze({
      ok: true as const,
      value: Object.freeze({
        head: snapshotProfileHead(head),
        revision: snapshotProfileRevision(revision),
        ...(active === undefined ? {} : { comparedToRevision: active.revision }),
        diff: comparison.entries,
        diffTruncated: comparison.truncated,
      }),
    }))
  }

  /** Public Host API used by headless consumers and tests. */
  async saveProfile(caller: Agent, request: SaveDigitalEmployeeProfileRequest): Promise<SaveDigitalEmployeeProfileResult> {
    if (!this.host.admissionOpen) return saveRejected(failure('service-disposed', 'Digital Employee service is disposing'))
    const authorityFailure = this.host.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) return saveRejected(authorityFailure)
    if (request.expectedHeadRevision !== null
      && (!Number.isSafeInteger(request.expectedHeadRevision) || request.expectedHeadRevision < 1)) {
      return saveRejected(failure('profile-invalid', 'Head revision must be null or a positive integer'))
    }
    const continuationProvider = typeof request.profile.continuationProvider === 'string'
      ? request.profile.continuationProvider.trim() || this.host.config.defaultContinuationProvider
      : this.host.config.defaultContinuationProvider
    const parsed = digitalEmployeeProfileDraftSchema.safeParse({ ...request.profile, continuationProvider })
    if (!parsed.success) {
      return saveRejected(failure(
        'profile-invalid',
        parsed.error.issues.map(issue => `${issue.path.join('.') || 'profile'}: ${issue.message}`).join('; ').slice(0, 2048),
      ))
    }
    const parsedTarget = selectableDigitalEmployeeRuntimeTargetSchema.safeParse(request.runtimeTarget)
    if (!parsedTarget.success) {
      return saveRejected(failure(
        'runtime-route-invalid',
        parsedTarget.error.issues.map(issue => `${issue.path.join('.') || 'runtimeTarget'}: ${issue.message}`).join('; ').slice(0, 2048),
      ))
    }
    if (parsed.data.hooks.length > this.host.config.maxHooks) {
      return saveRejected(failure(
        'profile-invalid',
        `profile has ${parsed.data.hooks.length} hooks; maximum is ${this.host.config.maxHooks}`,
      ))
    }
    const normalized = snapshotProfileDraft(parsed.data)
    const runtimeTarget = Object.freeze({ ...parsedTarget.data })
    const requiredCapabilities = requiredCapabilitiesForProfile(normalized)
    const bytes = Buffer.byteLength(JSON.stringify({
      profile: normalized,
      runtimeTarget,
      requiredCapabilities,
    }), 'utf8')
    if (bytes > this.host.config.maxProfileBytes) {
      return saveRejected(failure(
        'profile-invalid',
        `Revision content is ${bytes} UTF-8 bytes; maximum is ${this.host.config.maxProfileBytes}`,
      ))
    }
    await this.host.runtimeBackends.whenSettled()
    const currentAuthorityFailure = this.host.mutationFailure(caller)
    if (currentAuthorityFailure !== undefined) return saveRejected(currentAuthorityFailure)
    const targetProblem = this.host.runtimeBackends.validate(
      normalized,
      runtimeTarget,
      requiredCapabilities,
      'save',
    )
    if (targetProblem !== undefined && targetProblem.code !== 'runtime-target-unavailable') {
      return saveRejected(failure(targetProblem.code, targetProblem.message))
    }
    return await this.host.mutate(caller, async () => {
      const storage = this.host.storage
      const currentHead = storage.getProfileHead(parsed.data.id)
      if (request.expectedHeadRevision !== (currentHead?.headRevision ?? null)) {
        return saveRejected(failure(
          'profile-conflict',
          'Profile Head changed; reload before saving',
          currentHead,
        ))
      }
      if (currentHead === undefined && storage.profileCount >= this.host.config.maxProfiles) {
        return saveRejected(failure('profile-limit', `profile limit ${this.host.config.maxProfiles} reached`))
      }

      const latest = currentHead === undefined
        ? undefined
        : storage.getProfileRevision(parsed.data.id, currentHead.latestRevision)
      if (currentHead !== undefined && latest === undefined) {
        throw new Error(`Digital Employee Profile Head "${parsed.data.id}" has no latest Revision`)
      }
      if (targetProblem !== undefined
        && (latest === undefined
          || !sameRuntimeTarget(latest.runtimeTarget, runtimeTarget)
          || latest.profile.continuationProvider !== normalized.continuationProvider)) {
        return saveRejected(failure(targetProblem.code, targetProblem.message, currentHead))
      }
      const fingerprint = profileContentFingerprint(normalized, runtimeTarget, requiredCapabilities)
      if (latest?.fingerprint === fingerprint) {
        return Object.freeze({
          ok: true as const,
          value: Object.freeze({
            unchanged: true,
            head: snapshotProfileHead(currentHead!),
            revision: snapshotProfileRevision(latest),
          }),
        })
      }

      const known = [...storage.profileRevisionEntries(parsed.data.id)].map(([, revision]) => revision)
      const reusable = known
        .filter(revision => revision.revision > (currentHead?.latestRevision ?? 0)
          && revision.fingerprint === fingerprint)
        .sort((left, right) => left.revision - right.revision)[0]
      const now = Date.now()
      const revision = reusable ?? snapshotProfileRevision({
        schemaVersion: 1,
        profileId: normalized.id,
        revision: Math.max(0, ...known.map(candidate => candidate.revision)) + 1,
        profile: normalized,
        runtimeTarget,
        requiredCapabilities,
        fingerprint,
        createdAt: currentHead?.createdAt ?? now,
        updatedAt: Math.max(now, currentHead?.updatedAt ?? 0),
      })
      const nextHead = snapshotProfileHead({
        schemaVersion: 1,
        profileId: normalized.id,
        headRevision: (currentHead?.headRevision ?? 0) + 1,
        latestRevision: revision.revision,
        ...(currentHead?.activeRevision === undefined ? {} : { activeRevision: currentHead.activeRevision }),
        historyStartsAtRevision: currentHead?.historyStartsAtRevision ?? revision.revision,
        ...(currentHead?.requiredEvalSet === undefined ? {} : { requiredEvalSet: currentHead.requiredEvalSet }),
        ...(currentHead?.archivedAt === undefined ? {} : { archivedAt: currentHead.archivedAt }),
        createdAt: currentHead?.createdAt ?? now,
        updatedAt: Math.max(now, currentHead?.updatedAt ?? 0),
      })
      await storage.putProfileRevision(revision)
      await storage.putProfileHead(nextHead)
      return Object.freeze({
        ok: true as const,
        value: Object.freeze({ unchanged: false, head: nextHead, revision }),
      })
    })
  }

  /** Change only the Profile Head's required Eval Set pointer through CAS. */
  setEvalGate(
    caller: Agent,
    request: SetDigitalEmployeeEvalGateRequest,
  ): Promise<MutateDigitalEmployeeProfileHeadResult> {
    if (!this.host.admissionOpen) {
      return Promise.resolve(headMutationRejected(failure('service-disposed', 'Digital Employee service is disposing')))
    }
    const authorityFailure = this.host.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) return Promise.resolve(headMutationRejected(authorityFailure))
    if (!Number.isSafeInteger(request.expectedHeadRevision) || request.expectedHeadRevision < 1
      || (request.requiredEvalSet !== undefined
        && (!Number.isSafeInteger(request.requiredEvalSet.revision) || request.requiredEvalSet.revision < 1))) {
      return Promise.resolve(headMutationRejected(failure('eval-invalid', 'Eval gate CAS values must be positive integers')))
    }
    return this.host.mutate(caller, async () => {
      const storage = this.host.storage
      const head = storage.getProfileHead(request.profileId)
      if (head === undefined) {
        return headMutationRejected(failure('profile-not-found', `profile "${request.profileId}" not found`))
      }
      if (head.headRevision !== request.expectedHeadRevision) {
        return headMutationRejected(failure('profile-conflict', 'Profile Head changed; reload before changing its gate', head))
      }
      const required = request.requiredEvalSet
      if (required !== undefined) {
        const revision = storage.getEvalSetRevision(required.evalSetId, required.revision)
        if (revision === undefined || revision.profileId !== head.profileId) {
          return headMutationRejected(failure(
            'eval-not-found',
            'required Eval Set Revision does not exist for this Profile',
            head,
          ))
        }
      }
      if (isDeepStrictEqual(head.requiredEvalSet, required)) {
        return Object.freeze({ ok: true as const, value: Object.freeze({ head: snapshotProfileHead(head) }) })
      }
      const now = Math.max(Date.now(), head.updatedAt)
      const next = snapshotProfileHead({
        schemaVersion: 1,
        profileId: head.profileId,
        headRevision: head.headRevision + 1,
        latestRevision: head.latestRevision,
        ...(head.activeRevision === undefined ? {} : { activeRevision: head.activeRevision }),
        historyStartsAtRevision: head.historyStartsAtRevision,
        ...(required === undefined ? {} : { requiredEvalSet: Object.freeze({ ...required }) }),
        ...(head.archivedAt === undefined ? {} : { archivedAt: head.archivedAt }),
        createdAt: head.createdAt,
        updatedAt: now,
      })
      await storage.putProfileHead(next)
      return Object.freeze({ ok: true as const, value: Object.freeze({ head: next }) })
    })
  }

  /** Activate only the latest candidate through exact Head CAS. */
  activateProfile(
    caller: Agent,
    request: ActivateDigitalEmployeeProfileRequest,
  ): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.setActiveRevision(caller, request, 'activate')
  }

  /** Roll back to an older existing Revision through exact Head CAS. */
  rollbackProfile(
    caller: Agent,
    request: RollbackDigitalEmployeeProfileRequest,
  ): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.setActiveRevision(caller, request, 'rollback')
  }

  /** Archive without removing immutable history or active Binding snapshots. */
  archiveProfile(
    caller: Agent,
    request: ArchiveDigitalEmployeeProfileRequest,
  ): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.setArchiveState(caller, request, true)
  }

  /** Restore one archived Head through exact CAS. */
  restoreProfile(
    caller: Agent,
    request: RestoreDigitalEmployeeProfileRequest,
  ): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.setArchiveState(caller, request, false)
  }

  /** Build one bounded, detached catalog entry from authoritative v1 records. */
  catalogEntry(
    caller: Agent,
    teamId: string,
    head: DigitalEmployeeProfileHead,
  ): DigitalEmployeeProfileCatalogEntry {
    const storage = this.host.storage
    const latest = storage.getProfileRevision(head.profileId, head.latestRevision)
    if (latest === undefined) {
      throw new Error(`Digital Employee Profile Head "${head.profileId}" has no latest Revision`)
    }
    const revisions = [...storage.profileRevisionEntries(head.profileId)]
      .map(([, revision]) => revision)
      .filter(revision => revision.revision >= head.historyStartsAtRevision
        && revision.revision <= head.latestRevision)
      .sort((left, right) => right.revision - left.revision)
    const history: DigitalEmployeeProfileRevisionSummary[] = revisions
      .slice(0, this.host.config.maxRevisionHistory)
      .map(revision => Object.freeze({
        revision: revision.revision,
        fingerprint: revision.fingerprint,
        createdAt: revision.createdAt,
        updatedAt: revision.updatedAt,
      }))
    return Object.freeze({
      head: snapshotProfileHead(head),
      latest: snapshotProfileRevision(latest),
      history: Object.freeze(history),
      historyTruncated: revisions.length > history.length,
      promotionGate: this.promotionGate(caller, teamId, head, latest),
    })
  }

  /** Shared Head-only mutation; immutable Revision rows are read, never rewritten. */
  private setActiveRevision(
    caller: Agent,
    request: ActivateDigitalEmployeeProfileRequest | RollbackDigitalEmployeeProfileRequest,
    operation: 'activate' | 'rollback',
  ): Promise<MutateDigitalEmployeeProfileHeadResult> {
    if (!this.host.admissionOpen) {
      return Promise.resolve(headMutationRejected(failure('service-disposed', 'Digital Employee service is disposing')))
    }
    const authorityFailure = this.host.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) return Promise.resolve(headMutationRejected(authorityFailure))
    if (!Number.isSafeInteger(request.revision) || request.revision < 1
      || !Number.isSafeInteger(request.expectedHeadRevision) || request.expectedHeadRevision < 1) {
      return Promise.resolve(headMutationRejected(failure('profile-invalid', 'Revision CAS values must be positive integers')))
    }
    return this.host.mutate(caller, async () => {
      const storage = this.host.storage
      const head = storage.getProfileHead(request.profileId)
      if (head === undefined) {
        return headMutationRejected(failure('profile-not-found', `profile "${request.profileId}" not found`))
      }
      if (request.expectedHeadRevision !== head.headRevision) {
        return headMutationRejected(failure('profile-conflict', 'Profile Head changed; reload before promotion', head))
      }
      if (head.archivedAt !== undefined) {
        return headMutationRejected(failure('profile-archived', `profile "${request.profileId}" is archived`, head))
      }
      const revision = storage.getProfileRevision(request.profileId, request.revision)
      if (revision === undefined || request.revision < head.historyStartsAtRevision
        || request.revision > head.latestRevision) {
        return headMutationRejected(failure(
          'revision-not-found',
          `Profile Revision ${request.revision} is not in retained history`,
          head,
        ))
      }
      if (operation === 'activate' && request.revision !== head.latestRevision) {
        return headMutationRejected(failure('revision-not-found', 'activation requires the latest candidate Revision', head))
      }
      if (operation === 'rollback'
        && (head.activeRevision === undefined || request.revision > head.activeRevision)) {
        return headMutationRejected(failure('revision-not-found', 'rollback requires an active or older Revision', head))
      }
      await this.host.runtimeBackends.whenSettled()
      const admissionFailure = this.host.mutationFailure(caller)
      if (admissionFailure !== undefined) return headMutationRejected(admissionFailure)
      const targetProblem = this.host.runtimeBackends.validate(
        revision.profile,
        revision.runtimeTarget,
        revision.requiredCapabilities,
        'activate',
      )
      if (targetProblem !== undefined) {
        return headMutationRejected(failure(targetProblem.code, targetProblem.message, head))
      }
      if (operation === 'activate') {
        const teamId = this.host.ctx.agentTeams.membership(caller).id
        const gate = this.promotionGate(caller, teamId, head, revision)
        if (gate.status !== 'not-required' && gate.status !== 'passed') {
          return headMutationRejected(failure(
            'promotion-gate-failed',
            gate.diagnostic ?? 'the exact candidate has not passed its required Eval Set',
            head,
          ))
        }
      }
      if (head.activeRevision === request.revision) {
        return Object.freeze({ ok: true as const, value: Object.freeze({ head: snapshotProfileHead(head) }) })
      }
      const next = snapshotProfileHead({
        ...head,
        headRevision: head.headRevision + 1,
        activeRevision: request.revision,
        updatedAt: Math.max(Date.now(), head.updatedAt),
      })
      await storage.putProfileHead(next)
      return Object.freeze({ ok: true as const, value: Object.freeze({ head: next }) })
    })
  }

  /** Toggle archive state as a Head-only CAS mutation. */
  private setArchiveState(
    caller: Agent,
    request: ArchiveDigitalEmployeeProfileRequest | RestoreDigitalEmployeeProfileRequest,
    archived: boolean,
  ): Promise<MutateDigitalEmployeeProfileHeadResult> {
    if (!this.host.admissionOpen) {
      return Promise.resolve(headMutationRejected(failure('service-disposed', 'Digital Employee service is disposing')))
    }
    const authorityFailure = this.host.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) return Promise.resolve(headMutationRejected(authorityFailure))
    if (!Number.isSafeInteger(request.expectedHeadRevision) || request.expectedHeadRevision < 1) {
      return Promise.resolve(headMutationRejected(failure('profile-invalid', 'Head revision must be a positive integer')))
    }
    return this.host.mutate(caller, async () => {
      const storage = this.host.storage
      const head = storage.getProfileHead(request.profileId)
      if (head === undefined) {
        return headMutationRejected(failure('profile-not-found', `profile "${request.profileId}" not found`))
      }
      if (request.expectedHeadRevision !== head.headRevision) {
        return headMutationRejected(failure('profile-conflict', 'Profile Head changed; reload before archive mutation', head))
      }
      if ((head.archivedAt !== undefined) === archived) {
        return Object.freeze({ ok: true as const, value: Object.freeze({ head: snapshotProfileHead(head) }) })
      }
      const now = Math.max(Date.now(), head.updatedAt)
      const next = snapshotProfileHead({
        schemaVersion: 1,
        profileId: head.profileId,
        headRevision: head.headRevision + 1,
        latestRevision: head.latestRevision,
        ...(head.activeRevision === undefined ? {} : { activeRevision: head.activeRevision }),
        historyStartsAtRevision: head.historyStartsAtRevision,
        ...(head.requiredEvalSet === undefined ? {} : { requiredEvalSet: head.requiredEvalSet }),
        ...(archived ? { archivedAt: now } : {}),
        createdAt: head.createdAt,
        updatedAt: now,
      })
      await storage.putProfileHead(next)
      return Object.freeze({ ok: true as const, value: Object.freeze({ head: next }) })
    })
  }
}
