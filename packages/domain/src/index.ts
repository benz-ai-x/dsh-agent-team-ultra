/** Agent Team Ultra Host service and generated Remote surface. */

import { Buffer } from 'node:buffer'
import { Context, Service } from '@deepseek-ai/cordis'
import s from '@deepseek-ai/schemastery'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { TeamError } from '@deepseek-ai/dsh-experimental-agent-team'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import { foldSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import type { PostToolDecision, PreToolDecision } from '@deepseek-ai/dsh-tools'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  digitalEmployeeProfileDraftSchema,
  selectableDigitalEmployeeRuntimeTargetSchema,
  type DigitalEmployeeBinding,
} from './spec.ts'
import {
  requiredCapabilitiesForProfile,
  RuntimeBackendRegistry,
  snapshotRequiredCapabilities,
  type DigitalEmployeeExternalRuntimeProvider,
  type DigitalEmployeeExternalRuntimeRegistration,
} from './runtime.ts'
import {
  DigitalEmployeeStorage,
  digitalEmployeeBindingKey,
  legacyInheritLeadRuntimeTarget,
  openDigitalEmployeeStorage,
  profileContentFingerprint,
  type DigitalEmployeeBindingV1,
  type MigratedRuntimeTarget,
} from './storage.ts'
import type {
  ActivateDigitalEmployeeProfileRequest,
  ArchiveDigitalEmployeeProfileRequest,
  DigitalEmployeeAuthorityErrorDetails,
  DigitalEmployeeFailure,
  DigitalEmployeeInstanceView,
  DigitalEmployeeProfileCatalogEntry,
  DigitalEmployeeProfileHead,
  DigitalEmployeeProfile,
  DigitalEmployeeProfileDraft,
  DigitalEmployeeProfileRevision,
  DigitalEmployeeProfileDiffEntry,
  DigitalEmployeeProfileRevisionSummary,
  DigitalEmployeeRuntimeTarget,
  DigitalEmployeeStudioView,
  GetDigitalEmployeeProfileRevisionRequest,
  GetDigitalEmployeeProfileRevisionResult,
  MutateDigitalEmployeeProfileHeadResult,
  ProfileHook,
  ProfileTextBlock,
  ProfileToolOption,
  ProfileToolPolicy,
  RollbackDigitalEmployeeProfileRequest,
  RestoreDigitalEmployeeProfileRequest,
  SaveDigitalEmployeeProfileRequest,
  SaveDigitalEmployeeProfileResult,
  SpawnDigitalEmployeeRequest,
  SpawnDigitalEmployeeResult,
} from './types.ts'

export type * from './types.ts'
export type {
  DigitalEmployeeExternalRuntimeProvider,
  DigitalEmployeeExternalRuntimeRegistration,
} from './runtime.ts'
export {
  digitalEmployeeBindingSchema,
  digitalEmployeeDomainSpec,
  digitalEmployeeProfileDraftSchema,
  digitalEmployeeProfileSchema,
  digitalEmployeeRuntimeTargetSchema,
  profileHookSchema,
  profileTextBlockSchema,
  profileToolPolicySchema,
  selectableDigitalEmployeeRuntimeTargetSchema,
} from './spec.ts'
export { requiredCapabilitiesForProfile, runtimeTargetRoutingId } from './runtime.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    digitalEmployees: DigitalEmployeeService
  }
}

/** Deployment limits and the fallback continuation provider. */
export interface Config {
  readonly defaultContinuationProvider?: string
  /** Transitional loader spelling accepted while local profiles upgrade. */
  readonly defaultProvider?: string
  readonly maxProfiles?: number
  readonly maxProfileBytes?: number
  readonly maxHooks?: number
  readonly maxAssignmentBytes?: number
  readonly maxRevisionHistory?: number
  readonly maxDiffEntries?: number
}

interface ResolvedConfig {
  readonly defaultContinuationProvider: string
  readonly maxProfiles: number
  readonly maxProfileBytes: number
  readonly maxHooks: number
  readonly maxAssignmentBytes: number
  readonly maxRevisionHistory: number
  readonly maxDiffEntries: number
}

const DEFAULT_PROVIDER = 'spawn'
const DEFAULT_MAX_PROFILES = 64
const DEFAULT_MAX_PROFILE_BYTES = 131_072
const DEFAULT_MAX_HOOKS = 32
const DEFAULT_MAX_ASSIGNMENT_BYTES = 32_768
const DEFAULT_MAX_REVISION_HISTORY = 32
const DEFAULT_MAX_DIFF_ENTRIES = 512

const TEAM_OWN_TOOL_NAMES = new Set([
  'spawn_teammate',
  'send_message',
  'followup_task',
  'list_agents',
  'wait_agent',
  'interrupt_agent',
  'team_task_create',
  'team_task_list',
  'team_task_get',
  'team_task_update',
  'run_code',
])

const PLUGIN_SOURCE = { kind: 'plugin', plugin: 'agent-team-ultra' } as const

/** Loader schema; defaults are universal operational limits, not deployment policy guesses. */
export const Config: s<Config> = s.object({
  defaultContinuationProvider: s.string(),
  defaultProvider: s.string(),
  maxProfiles: s.number().step(1).min(1).default(DEFAULT_MAX_PROFILES),
  maxProfileBytes: s.number().step(1).min(1024).default(DEFAULT_MAX_PROFILE_BYTES),
  maxHooks: s.number().step(1).min(0).default(DEFAULT_MAX_HOOKS),
  maxAssignmentBytes: s.number().step(1).min(1).default(DEFAULT_MAX_ASSIGNMENT_BYTES),
  maxRevisionHistory: s.number().step(1).min(1).default(DEFAULT_MAX_REVISION_HISTORY),
  maxDiffEntries: s.number().step(1).min(1).default(DEFAULT_MAX_DIFF_ENTRIES),
})

/** Validate a direct-constructor integer that Loader normally checks. */
function positiveInteger(name: string, value: number, minimum = 1): number {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`agent-team-ultra: ${name} must be a safe integer >= ${minimum}`)
  }
  return value
}

/** Keep arbitrary failures bounded before they enter a durable binding diagnostic. */
function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.length <= 2048 ? text : `${text.slice(0, 2045)}...`
}

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
function snapshotProfileDraft(profile: DigitalEmployeeProfileDraft): DigitalEmployeeProfileDraft {
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

function snapshotProfileHead(head: DigitalEmployeeProfileHead): DigitalEmployeeProfileHead {
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

function snapshotProfileRevision(revision: DigitalEmployeeProfileRevision): DigitalEmployeeProfileRevision {
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

function failure(code: DigitalEmployeeFailure['code'], message: string, currentHead?: DigitalEmployeeProfileHead): DigitalEmployeeFailure {
  return Object.freeze({
    code,
    message,
    ...(currentHead === undefined ? {} : { currentHead: snapshotProfileHead(currentHead) }),
  })
}

function saveRejected(error: DigitalEmployeeFailure): SaveDigitalEmployeeProfileResult {
  return Object.freeze({ ok: false, error })
}

function spawnRejected(error: DigitalEmployeeFailure): SpawnDigitalEmployeeResult {
  return Object.freeze({ ok: false, error })
}

function headMutationRejected(error: DigitalEmployeeFailure): MutateDigitalEmployeeProfileHeadResult {
  return Object.freeze({ ok: false, error })
}

function revisionRejected(error: DigitalEmployeeFailure): GetDigitalEmployeeProfileRevisionResult {
  return Object.freeze({ ok: false, error })
}

function authorityRemoteError(
  error: DigitalEmployeeFailure,
  operation: DigitalEmployeeAuthorityErrorDetails['operation'],
): RemoteError<'digital-employees/team-lead-required' | 'digital-employees/team-rejected'> {
  const details = Object.freeze({ operation })
  return error.code === 'team-lead-required'
    ? new RemoteError('digital-employees/team-lead-required', error.message, details)
    : new RemoteError('digital-employees/team-rejected', error.message, details)
}

/** Render enabled blocks as one bounded, deterministic prompt section. */
function blockSection(title: string, blocks: readonly ProfileTextBlock[]): string {
  const enabled = blocks.filter(block => block.enabled)
  if (enabled.length === 0) return ''
  return [`# ${title}`, ...enabled.map(block => `## ${block.title}\n${block.content}`)].join('\n\n')
}

/** Simple wildcard matcher: `*` spans any substring and every other character is literal. */
function matchesTool(matcher: string, name: string): boolean {
  if (matcher === '*') return true
  const parts = matcher.split('*')
  if (parts.length === 1) return matcher === name
  let cursor = 0
  if (!matcher.startsWith('*')) {
    const first = parts[0] ?? ''
    if (!name.startsWith(first)) return false
    cursor = first.length
  }
  const end = matcher.endsWith('*') ? parts.length : parts.length - 1
  for (let index = 1; index < end; index += 1) {
    const part = parts[index] ?? ''
    if (part === '') continue
    const found = name.indexOf(part, cursor)
    if (found === -1) return false
    cursor = found + part.length
  }
  if (!matcher.endsWith('*')) {
    const last = parts.at(-1) ?? ''
    return name.endsWith(last) && name.length - last.length >= cursor
  }
  return true
}

function hookMessage(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: PLUGIN_SOURCE })
}

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

/** Concrete Host service; one provider is sufficient for this local overlay. */
export class DigitalEmployeeService extends TypertRemoteService {
  static inject = ['agents', 'agentTeams', 'llm', 'storageDomain', 'subagents', 'systemPrompt', 'tools']
  static Config = Config

  private readonly resolved: ResolvedConfig
  private storage: DigitalEmployeeStorage | undefined
  private mutationTail: Promise<void> = Promise.resolve()
  private readonly launches = new Set<Promise<unknown>>()
  private readonly childInstallations = new Map<Agent, () => void>()
  private readonly lifecycle = new AbortController()
  private readonly runtimeBackends: RuntimeBackendRegistry
  private admissionOpen = false

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'digitalEmployees')
    this.runtimeBackends = new RuntimeBackendRegistry(ctx, ctx.llm, ctx.subagents)
    this.resolved = {
      defaultContinuationProvider: (
        config.defaultContinuationProvider ?? config.defaultProvider ?? DEFAULT_PROVIDER
      ).trim(),
      maxProfiles: positiveInteger('maxProfiles', config.maxProfiles ?? DEFAULT_MAX_PROFILES),
      maxProfileBytes: positiveInteger('maxProfileBytes', config.maxProfileBytes ?? DEFAULT_MAX_PROFILE_BYTES, 1024),
      maxHooks: positiveInteger('maxHooks', config.maxHooks ?? DEFAULT_MAX_HOOKS, 0),
      maxAssignmentBytes: positiveInteger('maxAssignmentBytes', config.maxAssignmentBytes ?? DEFAULT_MAX_ASSIGNMENT_BYTES),
      maxRevisionHistory: positiveInteger(
        'maxRevisionHistory',
        config.maxRevisionHistory ?? DEFAULT_MAX_REVISION_HISTORY,
      ),
      maxDiffEntries: positiveInteger('maxDiffEntries', config.maxDiffEntries ?? DEFAULT_MAX_DIFF_ENTRIES),
    }
    if (this.resolved.defaultContinuationProvider === '') {
      throw new TypeError('agent-team-ultra: defaultContinuationProvider must not be blank')
    }
  }

  /** Open durable sidecar state, then compose every matching live and future child scope. */
  protected async [Service.init](): Promise<void> {
    await this.runtimeBackends.initialize()
    const storage = await openDigitalEmployeeStorage(this.ctx.storageDomain, {
      resolveBindingRuntimeTarget: binding => this.migratedBindingRuntimeTarget(binding),
    })
    this.storage = storage
    this.admissionOpen = true
    let stopCreated = (): void => undefined
    let stopDisposed = (): void => undefined
    this.ctx.effect(() => async () => {
      this.admissionOpen = false
      this.lifecycle.abort(new Error('Agent Team Ultra service disposed'))
      this.runtimeBackends.dispose()
      const failures: unknown[] = []
      try { stopCreated() } catch (error: unknown) { failures.push(error) }
      try { stopDisposed() } catch (error: unknown) { failures.push(error) }
      try { this.revokeBoundAgents() } catch (error: unknown) { failures.push(error) }
      await Promise.allSettled([...this.launches])
      await this.mutationTail
      try { await storage.close() } catch (error: unknown) { failures.push(error) }
      finally {
        this.storage = undefined
      }
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Agent Team Ultra disposal failed')
      }
    }, 'agent-team-ultra.runtime')
    stopCreated = this.ctx.on('agent/created', ({ agent }) => { this.installBoundAgent(agent) })
    stopDisposed = this.ctx.on('agent/disposed', ({ agent }) => { this.removeBoundAgent(agent) })
    for (const agent of this.ctx.agents.list()) this.installBoundAgent(agent)
  }

  /** Register one durable local-agent runtime; the provider object remains Host-only. */
  registerExternalRuntimeProvider(
    provider: DigitalEmployeeExternalRuntimeProvider,
  ): DigitalEmployeeExternalRuntimeRegistration {
    return this.runtimeBackends.registerExternalRuntimeProvider(this.ctx, provider)
  }

  /** Await the latest topology generation; useful to coordinate Host startup and tests. */
  whenRuntimeCatalogSettled(): Promise<void> {
    return this.runtimeBackends.whenSettled()
  }

  /** Complete replaceable Studio view for one exact live Team Lead. */
  @Remote('view')
  remoteView(agent: Agent): DigitalEmployeeStudioView {
    return this.studioView(agent)
  }

  /** Fetch one immutable Revision and its bounded comparison with active. */
  @Remote('revision')
  remoteRevision(
    agent: Agent,
    request: GetDigitalEmployeeProfileRevisionRequest,
  ): Promise<GetDigitalEmployeeProfileRevisionResult> {
    return this.profileRevision(agent, request)
  }

  /** Build the complete replaceable Studio view for one exact live Team Lead. */
  studioView(caller: Agent): DigitalEmployeeStudioView {
    const authorityFailure = this.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) throw authorityRemoteError(authorityFailure, 'view')
    const membership = this.ctx.agentTeams.membership(caller)
    const profiles = [...this.requireStorage().profileHeadEntries()]
      .map(([, head]) => this.profileCatalogEntry(head))
      .sort((left, right) => left.latest.profile.displayName.localeCompare(right.latest.profile.displayName)
        || left.head.profileId.localeCompare(right.head.profileId))
    const tools: ProfileToolOption[] = this.ctx.tools.schemas(caller)
      .filter(tool => !TEAM_OWN_TOOL_NAMES.has(tool.name))
      .map(tool => Object.freeze({ name: tool.name, description: tool.description }))
      .sort((left, right) => left.name.localeCompare(right.name))
    const instances = [...this.requireStorage().bindingEntries()]
      .map(([, binding]) => binding)
      .filter(binding => binding.teamId === membership.id)
      .map(binding => this.instanceView(binding))
      .sort((left, right) => left.memberName.localeCompare(right.memberName))
    const historicalTargets = profiles.flatMap(entry =>
      [...this.requireStorage().profileRevisionEntries(entry.head.profileId)]
        .map(([, revision]) => revision.runtimeTarget))
    for (const [, binding] of this.requireStorage().bindingEntries()) {
      if (binding.teamId === membership.id) historicalTargets.push(binding.runtimeTarget)
    }
    return Object.freeze({
      profiles: Object.freeze(profiles),
      runtimeCatalog: this.runtimeBackends.snapshot(historicalTargets),
      tools: Object.freeze(tools),
      instances: Object.freeze(instances),
    })
  }

  /** Public Host Revision inspector guarded by exact live Lead authority. */
  profileRevision(
    caller: Agent,
    request: GetDigitalEmployeeProfileRevisionRequest,
  ): Promise<GetDigitalEmployeeProfileRevisionResult> {
    if (!this.admissionOpen) {
      return Promise.resolve(revisionRejected(failure('service-disposed', 'Digital Employee service is disposing')))
    }
    const authorityFailure = this.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) return Promise.resolve(revisionRejected(authorityFailure))
    if (!Number.isSafeInteger(request.revision) || request.revision < 1) {
      return Promise.resolve(revisionRejected(failure('profile-invalid', 'Revision must be a positive integer')))
    }
    const storage = this.requireStorage()
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
    const comparison = profileRevisionDiff(active, revision, this.resolved.maxDiffEntries)
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

  /** Save one normalized profile with an exact CAS precondition. */
  @Remote('save')
  remoteSave(agent: Agent, request: SaveDigitalEmployeeProfileRequest): Promise<SaveDigitalEmployeeProfileResult> {
    return this.saveProfile(agent, request)
  }

  /** Promote the latest candidate without rewriting any Revision. */
  @Remote('activate')
  remoteActivate(
    agent: Agent,
    request: ActivateDigitalEmployeeProfileRequest,
  ): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.activateProfile(agent, request)
  }

  /** Repoint activeRevision to an older immutable Revision. */
  @Remote('rollback')
  remoteRollback(
    agent: Agent,
    request: RollbackDigitalEmployeeProfileRequest,
  ): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.rollbackProfile(agent, request)
  }

  /** Archive a Profile Head while retaining every historical reference. */
  @Remote('archive')
  remoteArchive(
    agent: Agent,
    request: ArchiveDigitalEmployeeProfileRequest,
  ): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.archiveProfile(agent, request)
  }

  /** Restore an archived Profile Head through exact CAS. */
  @Remote('restore')
  remoteRestore(
    agent: Agent,
    request: RestoreDigitalEmployeeProfileRequest,
  ): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.restoreProfile(agent, request)
  }

  /** Launch one profile as a real Agent Team teammate under exact Lead authority. */
  @Remote('spawn')
  remoteSpawn(
    agent: Agent,
    request: SpawnDigitalEmployeeRequest,
    signal: AbortSignal,
  ): Promise<SpawnDigitalEmployeeResult> {
    return this.spawnProfile(agent, request, signal)
  }

  /** Public Host API used by headless consumers and tests. */
  async saveProfile(caller: Agent, request: SaveDigitalEmployeeProfileRequest): Promise<SaveDigitalEmployeeProfileResult> {
    if (!this.admissionOpen) return saveRejected(failure('service-disposed', 'Digital Employee service is disposing'))
    const authorityFailure = this.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) return saveRejected(authorityFailure)
    if (request.expectedHeadRevision !== null
      && (!Number.isSafeInteger(request.expectedHeadRevision) || request.expectedHeadRevision < 1)) {
      return saveRejected(failure('profile-invalid', 'Head revision must be null or a positive integer'))
    }
    const continuationProvider = typeof request.profile.continuationProvider === 'string'
      ? request.profile.continuationProvider.trim() || this.resolved.defaultContinuationProvider
      : this.resolved.defaultContinuationProvider
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
    if (parsed.data.hooks.length > this.resolved.maxHooks) {
      return saveRejected(failure(
        'profile-invalid',
        `profile has ${parsed.data.hooks.length} hooks; maximum is ${this.resolved.maxHooks}`,
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
    if (bytes > this.resolved.maxProfileBytes) {
      return saveRejected(failure(
        'profile-invalid',
        `Revision content is ${bytes} UTF-8 bytes; maximum is ${this.resolved.maxProfileBytes}`,
      ))
    }
    await this.runtimeBackends.whenSettled()
    const targetProblem = this.runtimeBackends.validate(
      normalized,
      runtimeTarget,
      requiredCapabilities,
      'save',
    )
    if (targetProblem !== undefined) return saveRejected(failure(targetProblem.code, targetProblem.message))
    return await this.enqueue(async () => {
      const storage = this.requireStorage()
      const currentHead = storage.getProfileHead(parsed.data.id)
      if (request.expectedHeadRevision !== (currentHead?.headRevision ?? null)) {
        return saveRejected(failure(
          'profile-conflict',
          'Profile Head changed; reload before saving',
          currentHead,
        ))
      }
      if (currentHead === undefined && storage.profileCount >= this.resolved.maxProfiles) {
        return saveRejected(failure('profile-limit', `profile limit ${this.resolved.maxProfiles} reached`))
      }

      const latest = currentHead === undefined
        ? undefined
        : storage.getProfileRevision(parsed.data.id, currentHead.latestRevision)
      if (currentHead !== undefined && latest === undefined) {
        throw new Error(`Digital Employee Profile Head "${parsed.data.id}" has no latest Revision`)
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

  /** Public Host launch API with cancellation preserved through Agent Team provisioning. */
  spawnProfile(
    caller: Agent,
    request: SpawnDigitalEmployeeRequest,
    signal: AbortSignal,
  ): Promise<SpawnDigitalEmployeeResult> {
    if (!this.admissionOpen) return Promise.resolve(spawnRejected(failure('service-disposed', 'Digital Employee service is disposing')))
    const authorityFailure = this.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) return Promise.resolve(spawnRejected(authorityFailure))
    const operation = this.spawnAdmitted(caller, request, signal)
    this.launches.add(operation)
    void operation.finally(() => { this.launches.delete(operation) }).catch(() => undefined)
    return operation
  }

  private async spawnAdmitted(
    caller: Agent,
    request: SpawnDigitalEmployeeRequest,
    callerSignal: AbortSignal,
  ): Promise<SpawnDigitalEmployeeResult> {
    const signal = AbortSignal.any([callerSignal, this.lifecycle.signal])
    signal.throwIfAborted()
    const assignment = request.assignment?.trim()
    if (assignment !== undefined && Buffer.byteLength(assignment, 'utf8') > this.resolved.maxAssignmentBytes) {
      return spawnRejected(failure(
        'assignment-too-large',
        `assignment exceeds ${this.resolved.maxAssignmentBytes} UTF-8 bytes`,
      ))
    }
    let membership
    try {
      membership = this.ctx.agentTeams.membership(caller)
    } catch (error: unknown) {
      if (error instanceof TeamError) return spawnRejected(failure('team-rejected', error.message))
      throw error
    }
    if (membership.role !== 'lead') {
      return spawnRejected(failure('team-lead-required', 'only the exact live Team Lead may launch a Digital Employee'))
    }
    const storage = this.requireStorage()
    const head = storage.getProfileHead(request.profileId)
    if (head === undefined) {
      return spawnRejected(failure('profile-not-found', `profile "${request.profileId}" not found`))
    }
    if (head.archivedAt !== undefined) {
      return spawnRejected(failure('profile-archived', `profile "${request.profileId}" is archived`, head))
    }
    if (head.activeRevision === undefined) {
      return spawnRejected(failure('profile-not-active', `profile "${request.profileId}" has no active Revision`, head))
    }
    const activeRevision = storage.getProfileRevision(request.profileId, head.activeRevision)
    if (activeRevision === undefined) {
      return spawnRejected(failure('revision-not-found', `active Profile Revision ${head.activeRevision} was not found`, head))
    }
    const profile = snapshotProfile({
      ...activeRevision.profile,
      revision: activeRevision.revision,
      createdAt: activeRevision.createdAt,
      updatedAt: activeRevision.updatedAt,
    })
    await this.runtimeBackends.whenSettled()
    const targetProblem = this.runtimeBackends.validate(
      activeRevision.profile,
      activeRevision.runtimeTarget,
      activeRevision.requiredCapabilities,
      'launch',
    )
    if (targetProblem !== undefined) {
      return spawnRejected(failure(targetProblem.code, targetProblem.message, head))
    }
    if (activeRevision.runtimeTarget.kind === 'external-agent') {
      return spawnRejected(failure(
        'runtime-capability-mismatch',
        `external runtime provider "${activeRevision.runtimeTarget.provider}" has no executable teammate seam in this build`,
        head,
      ))
    }
    const unavailable = profile.toolPolicy.mode === 'inherit'
      ? []
      : profile.toolPolicy.names.filter(name =>
        TEAM_OWN_TOOL_NAMES.has(name) || this.ctx.tools.get(name, caller) === undefined)
    if (unavailable.length > 0) {
      return spawnRejected(failure(
        'tool-unavailable',
        `profile names tools unavailable to this Lead: ${unavailable.join(', ')}`,
      ))
    }

    const key = digitalEmployeeBindingKey(membership.id, profile.employeeName)
    const reservation = await this.enqueue(async (): Promise<DigitalEmployeeBindingV1 | DigitalEmployeeFailure> => {
      const storage = this.requireStorage()
      const existing = storage.getBinding(key)
      const rosterOwnsName = this.ctx.agentTeams.listMembers(caller)
        .some(member => member.name === profile.employeeName)
      if (existing !== undefined && rosterOwnsName) {
        return failure('profile-in-use', `Team member name "${profile.employeeName}" is already reserved`)
      }
      const pending: DigitalEmployeeBindingV1 = Object.freeze({
        schemaVersion: 1,
        teamId: membership.id,
        memberName: profile.employeeName,
        profileId: profile.id,
        profileRevision: profile.revision,
        profile: snapshotProfile(profile),
        runtimeTarget: activeRevision.runtimeTarget.kind === 'legacy-inherit-lead'
          ? legacyInheritLeadRuntimeTarget
          : Object.freeze({ ...activeRevision.runtimeTarget }),
        requiredCapabilities: snapshotRequiredCapabilities(activeRevision.requiredCapabilities),
        phase: 'pending',
      })
      await storage.putBinding(key, pending)
      return pending
    })
    if ('code' in reservation) return spawnRejected(reservation)

    const prompt = [
      `You are ${profile.displayName} (${profile.employeeName}), a profile-bound Digital Employee.`,
      `Mission:\n${profile.mission}`,
      ...(assignment === undefined || assignment === '' ? [] : [`Current assignment:\n${assignment}`]),
    ].join('\n\n')

    let provisionedMemberId: string | undefined
    try {
      const result = await this.ctx.agentTeams.spawnTeammate(caller, {
        name: profile.employeeName,
        description: profile.description,
        prompt: [{ type: 'text', text: prompt }],
        context: profile.contextMode,
        provider: profile.continuationProvider,
        signal,
      })
      provisionedMemberId = result.member.id
      const active: DigitalEmployeeBindingV1 = Object.freeze({
        ...reservation,
        memberId: provisionedMemberId,
        phase: 'active',
      })
      await this.enqueue(async () => { await this.requireStorage().putBinding(key, active) })
      return Object.freeze({ ok: true, value: this.instanceView(active) })
    } catch (error: unknown) {
      const failed: DigitalEmployeeBindingV1 = Object.freeze({
        ...reservation,
        ...(provisionedMemberId === undefined ? {} : { memberId: provisionedMemberId }),
        phase: 'failed',
        error: errorText(error),
      })
      try {
        await this.enqueue(async () => { await this.requireStorage().putBinding(key, failed) })
      } catch (recordError: unknown) {
        throw new AggregateError([error, recordError], 'Digital Employee launch and failure recording both failed')
      }
      if (signal.aborted) signal.throwIfAborted()
      if (error instanceof TeamError) {
        return spawnRejected(failure(
          error.code === 'TEAM_LEAD_REQUIRED' ? 'team-lead-required' : 'team-rejected',
          error.message,
        ))
      }
      throw error
    }
  }

  /** Install one immutable Profile layer into exactly the supplied Agent scope. */
  installProfileCapabilities(caller: Agent, agent: Agent, source: DigitalEmployeeProfile): () => void {
    if (!this.admissionOpen) throw new Error('Digital Employee service is disposing')
    const authorityFailure = this.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) {
      throw authorityRemoteError(authorityFailure, 'install-profile-capabilities')
    }
    if (agent.ctx.agent !== agent) {
      throw new TypeError('Digital Employee Profile capabilities require the exact Agent-owned scope')
    }
    if (this.childInstallations.has(agent)) {
      throw new Error(`Digital Employee Profile capabilities are already installed for Agent "${agent.id}"`)
    }
    const childCtx = agent.ctx
    const profile = snapshotProfile(source)
    const disposers: Array<() => unknown> = []
    const add = (dispose: () => unknown): void => { disposers.push(dispose) }
    try {
      add(childCtx.systemPrompt.section({
        name: 'deployment:persona',
        order: 0,
        text: profile.persona,
      }))
      const context = blockSection('Digital Employee context', profile.context)
      if (context !== '') add(childCtx.systemPrompt.context({ name: 'ultra:context', order: 130, text: context }))
      const memory = blockSection('Curated long-term memory', profile.memory)
      if (memory !== '') add(childCtx.systemPrompt.context({ name: 'ultra:memory', order: 140, text: memory }))
      if (profile.toolPolicy.mode !== 'inherit') {
        add(childCtx.tools.restrict(profile.toolPolicy.mode === 'allow'
          ? { allow: profile.toolPolicy.names }
          : { deny: profile.toolPolicy.names }))
      }
      this.installHooks(childCtx, profile.hooks, add)
    } catch (error: unknown) {
      for (const dispose of disposers.reverse()) void dispose()
      throw error
    }
    let active = true
    const dispose = (): void => {
      if (!active) return
      active = false
      if (this.childInstallations.get(agent) === dispose) this.childInstallations.delete(agent)
      const failures: unknown[] = []
      for (const dispose of disposers.reverse()) {
        try { void dispose() } catch (error: unknown) { failures.push(error) }
      }
      if (failures.length > 0) throw new AggregateError(failures, 'Digital Employee child-scope disposal failed')
    }
    this.childInstallations.set(agent, dispose)
    return dispose
  }

  /** Install at most once for an exact Agent object; an id reused later is a distinct lifecycle. */
  private installBoundAgent(agent: Agent): void {
    if (!this.admissionOpen || this.childInstallations.has(agent)) return
    const binding = this.bindingFor(agent)
    if (binding === undefined) return
    const caller = this.ctx.agents.get(binding.teamId as Agent['id'])
    if (caller === undefined) {
      throw new Error(`Digital Employee Team Lead "${binding.teamId}" is not active`)
    }
    this.installProfileCapabilities(caller, agent, binding.profile)
  }

  /** Revoke one exact Agent installation when its published lifecycle ends. */
  private removeBoundAgent(agent: Agent): void {
    const dispose = this.childInstallations.get(agent)
    if (dispose === undefined) return
    this.childInstallations.delete(agent)
    dispose()
  }

  /** Revoke every resident child contribution before the owning service Fiber disappears. */
  private revokeBoundAgents(): void {
    const failures: unknown[] = []
    for (const [agent, dispose] of this.childInstallations) {
      this.childInstallations.delete(agent)
      try { dispose() } catch (error: unknown) { failures.push(error) }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, 'Digital Employee child-scope disposal failed')
    }
  }

  /** Install only the declared, bounded hook semantics—never arbitrary code. */
  private installHooks(childCtx: Context, hooks: readonly ProfileHook[], add: (dispose: () => unknown) => void): void {
    const enabled = hooks.filter(hook => hook.enabled)
    const startup = enabled.filter(hook => hook.point === 'session-start')
    if (startup.length > 0) {
      add(childCtx.on('agent/session-start', ({ agent }) => {
        agent.inject(hookMessage(startup.map(hook => hook.text).join('\n\n')))
      }))
    }
    const beforeStep = enabled.filter(hook => hook.point === 'before-step')
    if (beforeStep.length > 0) {
      const message = hookMessage(beforeStep.map(hook => hook.text).join('\n\n'))
      add(childCtx.on('agent/pre-step', async (_payload, next): Promise<PreStepDecision> => {
        const downstream = await next()
        if (downstream.kind !== 'enter') return downstream
        return { ...downstream, messages: [...downstream.messages, message] }
      }))
    }
    const beforeTool = enabled.filter(hook => hook.point === 'before-tool')
    if (beforeTool.length > 0) {
      add(childCtx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
        const denied = beforeTool.find(hook => matchesTool(hook.matcher ?? '', exec.name))
        if (denied !== undefined) return { kind: 'deny', reason: denied.text }
        return await next()
      }))
    }
    const afterTool = enabled.filter(hook => hook.point === 'after-tool')
    if (afterTool.length > 0) {
      add(childCtx.on('tools/post-execute', async (exec, _result, next): Promise<PostToolDecision> => {
        const downstream = await next()
        const matching = afterTool.filter(hook => matchesTool(hook.matcher ?? '', exec.name))
        if (matching.length === 0) return downstream
        const message = hookMessage(matching.map(hook => hook.text).join('\n\n'))
        return {
          ...downstream,
          additionalContexts: [...downstream.additionalContexts ?? [], message],
        }
      }))
    }
  }

  /** Resolve by durable member id first, then the pre-publication Team/name reservation. */
  private bindingFor(agent: Agent): DigitalEmployeeBindingV1 | undefined {
    const storage = this.requireStorage()
    for (const [, binding] of storage.bindingEntries()) {
      if (binding.memberId === agent.id) return binding
    }
    const parentId = agent.session.header.parentSession
    if (parentId === undefined) return undefined
    const root = this.ctx.agents.get(parentId)
    if (root === undefined) return undefined
    const member = this.ctx.agentTeams.listMembers(root).find(candidate => candidate.id === agent.id)
    return member === undefined
      ? undefined
      : storage.getBinding(digitalEmployeeBindingKey(parentId, member.name))
  }

  /** Record an exact historical route only when the durable child descriptor proves it. */
  private migratedBindingRuntimeTarget(binding: DigitalEmployeeBinding): MigratedRuntimeTarget {
    try {
      if (binding.memberId === undefined) return legacyInheritLeadRuntimeTarget
      const child = this.ctx.agents.get(binding.memberId as Agent['id'])
      if (child === undefined || child.session.header.parentSession !== binding.teamId) {
        return legacyInheritLeadRuntimeTarget
      }
      const root = this.ctx.agents.get(binding.teamId as Agent['id'])
      if (root === undefined) return legacyInheritLeadRuntimeTarget
      const membership = this.ctx.agentTeams.membership(root)
      if (membership.role !== 'lead' || membership.root !== root || membership.id !== binding.teamId
        || !this.ctx.agentTeams.listMembers(root)
          .some(member => member.id === child.id && member.name === binding.memberName)) {
        return legacyInheritLeadRuntimeTarget
      }
      const descriptor = foldSubagentDescriptor(child.session.snapshotEvents())
      if (descriptor?.mode !== 'continuable') return legacyInheritLeadRuntimeTarget
      const provider = descriptor.agentProvider?.trim()
      const model = descriptor.agentModel?.trim()
      if (provider === undefined || provider === '' || model === undefined || model === '') {
        return legacyInheritLeadRuntimeTarget
      }
      const reasoningEffort = descriptor.agentReasoningEffort?.trim()
      return Object.freeze({
        kind: 'dsh-model',
        provider,
        model,
        ...(reasoningEffort === undefined || reasoningEffort === '' ? {} : { reasoningEffort }),
      })
    } catch {
      return legacyInheritLeadRuntimeTarget
    }
  }

  /** Build one bounded, detached catalog entry from authoritative v1 records. */
  private profileCatalogEntry(head: DigitalEmployeeProfileHead): DigitalEmployeeProfileCatalogEntry {
    const storage = this.requireStorage()
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
      .slice(0, this.resolved.maxRevisionHistory)
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
    })
  }

  /** Shared Head-only mutation; immutable Revision rows are read, never rewritten. */
  private setActiveRevision(
    caller: Agent,
    request: ActivateDigitalEmployeeProfileRequest | RollbackDigitalEmployeeProfileRequest,
    operation: 'activate' | 'rollback',
  ): Promise<MutateDigitalEmployeeProfileHeadResult> {
    if (!this.admissionOpen) {
      return Promise.resolve(headMutationRejected(failure('service-disposed', 'Digital Employee service is disposing')))
    }
    const authorityFailure = this.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) return Promise.resolve(headMutationRejected(authorityFailure))
    if (!Number.isSafeInteger(request.revision) || request.revision < 1
      || !Number.isSafeInteger(request.expectedHeadRevision) || request.expectedHeadRevision < 1) {
      return Promise.resolve(headMutationRejected(failure('profile-invalid', 'Revision CAS values must be positive integers')))
    }
    return this.enqueue(async () => {
      const storage = this.requireStorage()
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
      await this.runtimeBackends.whenSettled()
      const targetProblem = this.runtimeBackends.validate(
        revision.profile,
        revision.runtimeTarget,
        revision.requiredCapabilities,
        'activate',
      )
      if (targetProblem !== undefined) {
        return headMutationRejected(failure(targetProblem.code, targetProblem.message, head))
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
    if (!this.admissionOpen) {
      return Promise.resolve(headMutationRejected(failure('service-disposed', 'Digital Employee service is disposing')))
    }
    const authorityFailure = this.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) return Promise.resolve(headMutationRejected(authorityFailure))
    if (!Number.isSafeInteger(request.expectedHeadRevision) || request.expectedHeadRevision < 1) {
      return Promise.resolve(headMutationRejected(failure('profile-invalid', 'Head revision must be a positive integer')))
    }
    return this.enqueue(async () => {
      const storage = this.requireStorage()
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

  /** Reject anything except the exact live Agent object currently recognized as a Team Lead. */
  private leadAuthorityFailure(caller: Agent): DigitalEmployeeFailure | undefined {
    if (this.ctx.agents.get(caller.id) !== caller) {
      return failure('team-rejected', 'caller is not the exact live Agent registered on this Host')
    }
    try {
      const membership = this.ctx.agentTeams.membership(caller)
      if (membership.role !== 'lead') {
        return failure('team-lead-required', 'only the exact live Team Lead may manage Digital Employee profiles')
      }
      return undefined
    } catch (error: unknown) {
      if (error instanceof TeamError) return failure('team-rejected', error.message)
      throw error
    }
  }

  private instanceView(binding: DigitalEmployeeBindingV1): DigitalEmployeeInstanceView {
    return Object.freeze({
      teamId: binding.teamId,
      memberName: binding.memberName,
      ...(binding.memberId === undefined ? {} : { memberId: binding.memberId }),
      profileId: binding.profileId,
      profileRevision: binding.profileRevision,
      runtimeTarget: binding.runtimeTarget.kind === 'legacy-inherit-lead'
        ? legacyInheritLeadRuntimeTarget
        : Object.freeze({ ...binding.runtimeTarget }),
      requiredCapabilities: snapshotRequiredCapabilities(binding.requiredCapabilities),
      phase: binding.phase,
      ...(binding.error === undefined ? {} : { error: binding.error }),
    })
  }

  /** Serialize read-modify-write decisions while letting storage own durability. */
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.mutationTail.then(operation)
    this.mutationTail = run.then(() => undefined, () => undefined)
    return run
  }

  private requireStorage(): DigitalEmployeeStorage {
    if (this.storage === undefined) throw new Error('Agent Team Ultra v1 storage is not ready')
    return this.storage
  }
}

export default DigitalEmployeeService
