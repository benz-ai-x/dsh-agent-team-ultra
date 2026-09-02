/** Agent Team Ultra Host service and generated Remote surface. */

import { Buffer } from 'node:buffer'
import { isDeepStrictEqual } from 'node:util'
import { Context, Service } from '@deepseek-ai/cordis'
import s from '@deepseek-ai/schemastery'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import {
  TeamError,
  TeammateLaunchRequestId,
  TeammateRuntimeError,
} from '@deepseek-ai/dsh-experimental-agent-team'
import type { TeamMemberRouteSnapshot } from '@deepseek-ai/dsh-experimental-agent-team'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { SessionId, type UserMessage } from '@deepseek-ai/dsh-session'
import { foldSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import type { PostToolDecision, PreToolDecision } from '@deepseek-ai/dsh-tools'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  digitalEmployeeProfileDraftSchema,
  launchRequestIdSchema,
  nativeRuntimeHandleFromTeammate,
  selectableDigitalEmployeeRuntimeTargetSchema,
  type DigitalEmployeeBinding,
} from './spec.ts'
import {
  externalRuntimeProfileSnapshot,
  requiredCapabilitiesForProfile,
  RuntimeBackendRegistry,
  snapshotRequiredCapabilities,
  type DigitalEmployeeExternalRuntimeProvider,
  type DigitalEmployeeExternalRuntimeRegistration,
} from './runtime.ts'
import {
  assignmentContentHash,
  DigitalEmployeeStorage,
  digitalEmployeeBindingKey,
  legacyInheritLeadRuntimeTarget,
  openDigitalEmployeeStorage,
  launchRequestFingerprint,
  profileContentFingerprint,
  type DigitalEmployeeBindingV1,
  type MigratedRuntimeTarget,
} from './storage.ts'
import {
  bindingMatchesReplay,
  bindingRosterMember,
  bindingRuntimePresence,
  reconcileBindingFromRoster,
} from './launch.ts'
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
  DshModelRuntimeTarget,
  DigitalEmployeeStudioView,
  GetDigitalEmployeeProfileRevisionRequest,
  GetDigitalEmployeeProfileRevisionResult,
  LaunchRequestId,
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
  launchRequestIdSchema,
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

interface NormalizedLaunchRequest {
  readonly launchRequestId: LaunchRequestId
  readonly profileId: string
  readonly assignment?: string
  readonly assignmentHash: string
}

interface InFlightLaunch {
  readonly profileId: string
  readonly assignmentHash: string
  readonly operation: Promise<SpawnDigitalEmployeeResult>
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

/** Translate typed teammate-runtime rejections without inspecting provider prose. */
function externalRuntimeFailure(error: TeammateRuntimeError): DigitalEmployeeFailure {
  switch (error.code) {
    case 'TEAM_RUNTIME_UNAVAILABLE':
      return failure('runtime-target-unavailable', error.message)
    case 'TEAM_RUNTIME_CAPABILITY_MISMATCH':
      return failure('runtime-capability-mismatch', error.message)
    case 'TEAM_RUNTIME_IDENTITY_CONFLICT':
    case 'TEAM_RUNTIME_INVALID_PROVIDER':
      return failure('runtime-route-invalid', error.message)
  }
}

function saveRejected(error: DigitalEmployeeFailure): SaveDigitalEmployeeProfileResult {
  return Object.freeze({ ok: false, error })
}

function spawnRejected(error: DigitalEmployeeFailure): SpawnDigitalEmployeeResult {
  return Object.freeze({ ok: false, error })
}

function dshTargetFromRoute(route: TeamMemberRouteSnapshot | undefined): DshModelRuntimeTarget | undefined {
  if (route?.provider === undefined || route.model === undefined) return undefined
  return Object.freeze({
    kind: 'dsh-model',
    provider: route.provider,
    model: route.model,
    ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }),
  })
}

function sameDshTarget(left: DshModelRuntimeTarget, right: DshModelRuntimeTarget): boolean {
  return left.provider === right.provider
    && left.model === right.model
    && left.reasoningEffort === right.reasoningEffort
}

function sameRuntimeTarget(left: DigitalEmployeeRuntimeTarget, right: DigitalEmployeeRuntimeTarget): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === 'legacy-inherit-lead' || right.kind === 'legacy-inherit-lead') return true
  if (left.kind === 'external-agent' || right.kind === 'external-agent') {
    return left.kind === 'external-agent' && right.kind === 'external-agent' && left.provider === right.provider
  }
  return sameDshTarget(left, right)
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
  private readonly launchesByRequest = new Map<string, InFlightLaunch>()
  private readonly reconciliations = new Set<Promise<void>>()
  private readonly childInstallations = new Map<Agent, () => void>()
  private readonly lifecycle = new AbortController()
  private readonly runtimeBackends: RuntimeBackendRegistry
  private admissionOpen = false

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'digitalEmployees')
    this.runtimeBackends = new RuntimeBackendRegistry(
      ctx,
      ctx.llm,
      ctx.subagents,
      () => { this.scheduleAvailableLeadReconciliation() },
    )
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
    let stopCreated = (): void => undefined
    let stopDisposed = (): void => undefined
    let stopSessionStart = (): void => undefined
    let stopSessionEvent = (): void => undefined
    this.ctx.effect(() => async () => {
      this.admissionOpen = false
      this.lifecycle.abort(new Error('Agent Team Ultra service disposed'))
      const runtimeBackendDisposal = this.runtimeBackends.dispose()
      const failures: unknown[] = []
      try { stopCreated() } catch (error: unknown) { failures.push(error) }
      try { stopDisposed() } catch (error: unknown) { failures.push(error) }
      try { stopSessionStart() } catch (error: unknown) { failures.push(error) }
      try { stopSessionEvent() } catch (error: unknown) { failures.push(error) }
      try { this.revokeBoundAgents() } catch (error: unknown) { failures.push(error) }
      await Promise.allSettled([...this.launches])
      await Promise.allSettled([...this.reconciliations])
      await this.mutationTail
      try { await runtimeBackendDisposal } catch (error: unknown) { failures.push(error) }
      try { await storage.close() } catch (error: unknown) { failures.push(error) }
      finally {
        this.storage = undefined
      }
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Agent Team Ultra disposal failed')
      }
    }, 'agent-team-ultra.runtime')
    stopCreated = this.ctx.on('agent/created', ({ agent }) => {
      this.installBoundAgent(agent)
      this.scheduleLeadReconciliation(agent)
    })
    stopDisposed = this.ctx.on('agent/disposed', ({ agent }) => { this.removeBoundAgent(agent) })
    stopSessionStart = this.ctx.on('agent/session-start', ({ agent }) => {
      this.scheduleLeadReconciliation(agent)
    })
    stopSessionEvent = this.ctx.on('session/event', (session, event) => {
      if (event.type === 'team/member') {
        const lead = this.ctx.agents.get(session.id)
        if (lead !== undefined) this.scheduleLeadReconciliation(lead)
      }
    })
    this.admissionOpen = true
    for (const agent of this.ctx.agents.list()) this.installBoundAgent(agent)
    await this.reconcileAvailableLeads()
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
  async remoteView(agent: Agent): Promise<DigitalEmployeeStudioView> {
    await this.reconcileTeam(agent)
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
      .map(binding => this.instanceView(caller, binding))
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
    if (targetProblem !== undefined && targetProblem.code !== 'runtime-target-unavailable') {
      return saveRejected(failure(targetProblem.code, targetProblem.message))
    }
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

  /** Public Host launch API with Team-scoped idempotency and pre-acceptance cancellation. */
  spawnProfile(
    caller: Agent,
    request: SpawnDigitalEmployeeRequest,
    callerSignal: AbortSignal,
  ): Promise<SpawnDigitalEmployeeResult> {
    if (!this.admissionOpen) return Promise.resolve(spawnRejected(failure('service-disposed', 'Digital Employee service is disposing')))
    const authorityFailure = this.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) return Promise.resolve(spawnRejected(authorityFailure))
    const parsedRequestId = launchRequestIdSchema.safeParse(request.launchRequestId)
    if (!parsedRequestId.success) {
      return Promise.resolve(spawnRejected(failure(
        'profile-invalid',
        'launchRequestId must be a canonical lowercase UUID',
      )))
    }
    const assignmentText = request.assignment?.trim()
    const assignment = assignmentText === '' ? undefined : assignmentText
    if (assignment !== undefined && Buffer.byteLength(assignment, 'utf8') > this.resolved.maxAssignmentBytes) {
      return Promise.resolve(spawnRejected(failure(
        'assignment-too-large',
        `assignment exceeds ${this.resolved.maxAssignmentBytes} UTF-8 bytes`,
      )))
    }
    let teamId: string
    try {
      const membership = this.ctx.agentTeams.membership(caller)
      if (membership.role !== 'lead') {
        return Promise.resolve(spawnRejected(failure(
          'team-lead-required',
          'only the exact live Team Lead may launch a Digital Employee',
        )))
      }
      teamId = membership.id
    } catch (error: unknown) {
      if (error instanceof TeamError) return Promise.resolve(spawnRejected(failure('team-rejected', error.message)))
      throw error
    }
    const normalized: NormalizedLaunchRequest = Object.freeze({
      launchRequestId: parsedRequestId.data,
      profileId: request.profileId,
      ...(assignment === undefined ? {} : { assignment }),
      assignmentHash: assignmentContentHash(assignment),
    })
    const requestKey = JSON.stringify([teamId, normalized.launchRequestId])
    const existing = this.launchesByRequest.get(requestKey)
    if (existing !== undefined) {
      return existing.profileId === normalized.profileId && existing.assignmentHash === normalized.assignmentHash
        ? existing.operation
        : Promise.resolve(spawnRejected(failure(
          'launch-request-conflict',
          'launchRequestId was already used with different normalized input',
        )))
    }
    const operation = this.spawnAdmitted(caller, teamId, normalized, callerSignal)
    this.launchesByRequest.set(requestKey, {
      profileId: normalized.profileId,
      assignmentHash: normalized.assignmentHash,
      operation,
    })
    this.launches.add(operation)
    void operation.finally(() => {
      this.launches.delete(operation)
      if (this.launchesByRequest.get(requestKey)?.operation === operation) this.launchesByRequest.delete(requestKey)
    }).catch(() => undefined)
    return operation
  }

  private async spawnAdmitted(
    caller: Agent,
    teamId: string,
    request: NormalizedLaunchRequest,
    callerSignal: AbortSignal,
  ): Promise<SpawnDigitalEmployeeResult> {
    const signal = AbortSignal.any([callerSignal, this.lifecycle.signal])
    signal.throwIfAborted()
    const storage = this.requireStorage()
    const replay = storage.findBindingByLaunchRequest(teamId, request.launchRequestId)
    if (replay !== undefined) {
      const [, prior] = replay
      if (!bindingMatchesReplay(prior, request.profileId, request.assignmentHash)) {
        return spawnRejected(failure(
          'launch-request-conflict',
          'launchRequestId was already used with different normalized input',
        ))
      }
      const roster = this.ctx.agentTeams.listMembers(caller)
      const reconciled = await this.reconcileBinding(caller, prior, roster)
      const rosterMember = bindingRosterMember(reconciled, roster)
      if (reconciled.provisioningPhase !== 'pending'
        || (rosterMember !== undefined && reconciled.runtimeTarget.kind !== 'external-agent')
        || !await this.pendingBindingIsExecutable(caller, reconciled)) {
        return Object.freeze({ ok: true, value: this.instanceView(caller, reconciled) })
      }
      return await this.provisionBinding(caller, reconciled, request.assignment, signal)
    }

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
    const selectedTarget = activeRevision.runtimeTarget
    if (selectedTarget.kind === 'legacy-inherit-lead') {
      return spawnRejected(failure('runtime-route-invalid', 'the active Revision has no exact executable route', head))
    }
    if (selectedTarget.kind === 'dsh-model') {
      const resolutionProblem = await this.runtimeBackends.verifyDshModelRoute(selectedTarget)
      if (resolutionProblem !== undefined) {
        return spawnRejected(failure(resolutionProblem.code, resolutionProblem.message, head))
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
    }

    const key = digitalEmployeeBindingKey(teamId, profile.employeeName)
    const reservation = await this.enqueue(async (): Promise<DigitalEmployeeBindingV1 | DigitalEmployeeFailure> => {
      const storage = this.requireStorage()
      const requestOwner = storage.findBindingByLaunchRequest(teamId, request.launchRequestId)
      if (requestOwner !== undefined) {
        return bindingMatchesReplay(requestOwner[1], request.profileId, request.assignmentHash)
          ? requestOwner[1]
          : failure('launch-request-conflict', 'launchRequestId was already used with different normalized input')
      }
      const existing = storage.getBinding(key)
      const rosterOwnsName = this.ctx.agentTeams.listMembers(caller)
        .some(member => member.name === profile.employeeName)
      if (existing !== undefined || rosterOwnsName) {
        return failure('profile-in-use', `Team member name "${profile.employeeName}" is already reserved`)
      }
      const capabilityGeneration = this.runtimeBackends.capabilityGeneration
      const requestFingerprint = launchRequestFingerprint({
        profileId: profile.id,
        profileRevision: profile.revision,
        profileFingerprint: activeRevision.fingerprint,
        runtimeTarget: selectedTarget,
        preflightRuntimeTarget: selectedTarget,
        requiredCapabilities: activeRevision.requiredCapabilities,
        capabilityGeneration,
        assignmentHash: request.assignmentHash,
      })
      const pending: DigitalEmployeeBindingV1 = Object.freeze({
        schemaVersion: 1,
        teamId,
        memberName: profile.employeeName,
        launchRequestId: request.launchRequestId,
        requestFingerprint,
        assignmentHash: request.assignmentHash,
        profileId: profile.id,
        profileRevision: profile.revision,
        profileFingerprint: activeRevision.fingerprint,
        profile: snapshotProfile(profile),
        runtimeTarget: Object.freeze({ ...selectedTarget }),
        preflightRuntimeTarget: Object.freeze({ ...selectedTarget }),
        requiredCapabilities: snapshotRequiredCapabilities(activeRevision.requiredCapabilities),
        capabilityGeneration,
        provisioningPhase: 'pending',
      })
      await storage.putBinding(key, pending)
      return pending
    })
    if ('code' in reservation) return spawnRejected(reservation)
    const roster = this.ctx.agentTeams.listMembers(caller)
    if (reservation.provisioningPhase !== 'pending'
      || (bindingRosterMember(reservation, roster) !== undefined
        && reservation.runtimeTarget.kind !== 'external-agent')) {
      const reconciled = await this.reconcileBinding(caller, reservation, roster)
      return Object.freeze({ ok: true, value: this.instanceView(caller, reconciled) })
    }
    return await this.provisionBinding(caller, reservation, request.assignment, signal)
  }

  private async provisionBinding(
    caller: Agent,
    reservation: DigitalEmployeeBindingV1,
    assignment: string | undefined,
    signal: AbortSignal,
  ): Promise<SpawnDigitalEmployeeResult> {
    const selectedTarget = reservation.runtimeTarget
    if (selectedTarget.kind === 'legacy-inherit-lead' || reservation.launchRequestId === undefined) {
      return Object.freeze({ ok: true, value: this.instanceView(caller, reservation) })
    }
    const profile = reservation.profile
    const key = digitalEmployeeBindingKey(reservation.teamId, reservation.memberName)
    const prompt = [
      `You are ${profile.displayName} (${profile.employeeName}), a profile-bound Digital Employee.`,
      `Mission:\n${profile.mission}`,
      ...(assignment === undefined || assignment === '' ? [] : [`Current assignment:\n${assignment}`]),
    ].join('\n\n')

    let provisionedMemberId: string | undefined
    try {
      const result = selectedTarget.kind === 'dsh-model'
        ? await this.ctx.agentTeams.spawnTeammate(caller, {
          name: profile.employeeName,
          description: profile.description,
          prompt: [{ type: 'text', text: prompt }],
          context: profile.contextMode,
          provider: profile.continuationProvider,
          agentOptions: {
            provider: selectedTarget.provider,
            model: selectedTarget.model,
            ...(selectedTarget.reasoningEffort === undefined
              ? {}
              : { reasoningEffort: ReasoningEffortId(selectedTarget.reasoningEffort) }),
          },
          signal,
        })
        : await this.ctx.agentTeams.spawnTeammate(caller, {
          name: profile.employeeName,
          description: profile.description,
          prompt: [{ type: 'text', text: prompt }],
          context: profile.contextMode,
          runtime: {
            kind: 'external-agent',
            provider: selectedTarget.provider,
            launchRequestId: TeammateLaunchRequestId(reservation.launchRequestId),
            profile: externalRuntimeProfileSnapshot(profile),
            requirements: {
              contextMode: reservation.requiredCapabilities.contextMode,
              profileCapabilities: reservation.requiredCapabilities.profileCapabilities,
              runtimeCapabilities: [],
            },
          },
          signal,
        })
      provisionedMemberId = result.member.id
      if (selectedTarget.kind === 'external-agent') {
        const external = result.member.externalRuntime
        if (result.member.provider !== selectedTarget.provider
          || external === undefined
          || String(external.launchRequestId) !== reservation.launchRequestId
          || external.nativeHandle === undefined) {
          const message = `teammate "${profile.employeeName}" did not preserve the selected external runtime identity`
          const failed: DigitalEmployeeBindingV1 = Object.freeze({
            ...reservation,
            memberId: provisionedMemberId,
            provisioningPhase: 'failed',
            error: message,
          })
          await this.enqueue(async () => { await this.requireStorage().putBinding(key, failed) })
          return spawnRejected(failure('runtime-route-invalid', message))
        }
        const nativeRuntimeHandle = nativeRuntimeHandleFromTeammate(external.nativeHandle)
        const active: DigitalEmployeeBindingV1 = Object.freeze({
          ...reservation,
          memberId: provisionedMemberId,
          resolvedRuntimeTarget: Object.freeze({ ...selectedTarget }),
          nativeRuntimeHandle,
          provisioningPhase: 'active',
        })
        const committed = await this.commitProvisionedBinding(key, active)
        return committed.provisioningPhase === 'active'
          ? Object.freeze({ ok: true, value: this.instanceView(caller, committed) })
          : spawnRejected(failure('team-rejected', committed.error ?? 'external teammate provisioning did not become active'))
      }
      const resolvedRuntimeTarget = dshTargetFromRoute(result.member.resolvedRoute)
      if (resolvedRuntimeTarget === undefined || !sameDshTarget(selectedTarget, resolvedRuntimeTarget)) {
        const message = `teammate "${profile.employeeName}" did not resolve the selected DSH model route`
        const failed: DigitalEmployeeBindingV1 = Object.freeze({
          ...reservation,
          memberId: provisionedMemberId,
          ...(resolvedRuntimeTarget === undefined ? {} : { resolvedRuntimeTarget }),
          provisioningPhase: 'failed',
          error: message,
        })
        await this.enqueue(async () => { await this.requireStorage().putBinding(key, failed) })
        return spawnRejected(failure('runtime-route-invalid', message))
      }
      const active: DigitalEmployeeBindingV1 = Object.freeze({
        ...reservation,
        memberId: provisionedMemberId,
        resolvedRuntimeTarget,
        provisioningPhase: 'active',
      })
      const committed = await this.commitProvisionedBinding(key, active)
      return committed.provisioningPhase === 'active'
        ? Object.freeze({ ok: true, value: this.instanceView(caller, committed) })
        : spawnRejected(failure('team-rejected', committed.error ?? 'teammate provisioning did not become active'))
    } catch (error: unknown) {
      const roster = this.ctx.agentTeams.listMembers(caller)
      const authoritative = reconcileBindingFromRoster(reservation, roster)
      const retryablePreRoster = authoritative === reservation
        && (signal.aborted
          || (error instanceof TeammateRuntimeError && error.code === 'TEAM_RUNTIME_UNAVAILABLE'))
      const recorded: DigitalEmployeeBindingV1 = authoritative === reservation
        ? retryablePreRoster
          ? reservation
          : Object.freeze({
            ...reservation,
            ...(provisionedMemberId === undefined ? {} : { memberId: provisionedMemberId }),
            provisioningPhase: 'failed',
            error: errorText(error),
          })
        : Object.freeze(authoritative)
      try {
        await this.enqueue(async () => { await this.requireStorage().putBinding(key, recorded) })
      } catch (recordError: unknown) {
        throw new AggregateError([error, recordError], 'Digital Employee launch and failure recording both failed')
      }
      if (recorded.provisioningPhase === 'active') {
        return Object.freeze({ ok: true, value: this.instanceView(caller, recorded) })
      }
      if (signal.aborted) signal.throwIfAborted()
      if (error instanceof TeammateRuntimeError) {
        return spawnRejected(externalRuntimeFailure(error))
      }
      if (error instanceof TeamError) {
        return spawnRejected(failure(
          error.code === 'TEAM_LEAD_REQUIRED'
            ? 'team-lead-required'
            : error.code === 'TEAM_RUNTIME_ROUTE_MISMATCH'
              ? 'runtime-route-invalid'
              : 'team-rejected',
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

  /** A replay may continue a pre-roster reservation only while its exact dependencies remain executable. */
  private async pendingBindingIsExecutable(caller: Agent, binding: DigitalEmployeeBindingV1): Promise<boolean> {
    await this.runtimeBackends.whenSettled()
    const problem = this.runtimeBackends.validate(
      binding.profile,
      binding.runtimeTarget,
      binding.requiredCapabilities,
      'launch',
    )
    if (problem !== undefined) return false
    if (binding.runtimeTarget.kind === 'external-agent') {
      return true
    }
    if (binding.runtimeTarget.kind !== 'dsh-model'
      || await this.runtimeBackends.verifyDshModelRoute(binding.runtimeTarget) !== undefined) return false
    return binding.profile.toolPolicy.mode === 'inherit'
      || binding.profile.toolPolicy.names.every(name =>
        !TEAM_OWN_TOOL_NAMES.has(name) && this.ctx.tools.get(name, caller) !== undefined)
  }

  /** Persist one roster-derived Binding repair without allowing an older observation to replace a newer request. */
  private async reconcileBinding(
    caller: Agent,
    binding: DigitalEmployeeBindingV1,
    roster = this.ctx.agentTeams.listMembers(caller),
  ): Promise<DigitalEmployeeBindingV1> {
    const key = digitalEmployeeBindingKey(binding.teamId, binding.memberName)
    return await this.enqueue(async () => {
      const storage = this.requireStorage()
      const current = storage.getBinding(key)
      if (current === undefined) return binding
      const reconciled = reconcileBindingFromRoster(current, roster)
      if (!isDeepStrictEqual(current, reconciled)) await storage.putBinding(key, reconciled)
      return reconciled
    })
  }

  /** Repair all Bindings owned by one exact live Team Lead from its authoritative roster. */
  private async reconcileTeam(caller: Agent): Promise<void> {
    if (this.storage === undefined || this.lifecycle.signal.aborted || this.ctx.agents.get(caller.id) !== caller) return
    const membership = this.ctx.agentTeams.tryMembership(caller)
    if (membership?.role !== 'lead') return
    const teamId = membership.id
    const roster = this.ctx.agentTeams.listMembers(caller)
    const bindings = [...this.requireStorage().bindingEntries()]
      .map(([, binding]) => binding)
      .filter(binding => binding.teamId === teamId)
    for (const binding of bindings) await this.reconcileBinding(caller, binding, roster)
  }

  /** Reconcile every distinct live root Team currently visible to this Host. */
  private async reconcileAvailableLeads(): Promise<void> {
    const seen = new Set<string>()
    for (const agent of this.ctx.agents.list()) {
      const membership = this.ctx.agentTeams.tryMembership(agent)
      if (membership?.role !== 'lead' || seen.has(membership.id)) continue
      seen.add(membership.id)
      await this.reconcileTeam(agent)
    }
  }

  /** Track one event-driven reconciliation so disposal reaches quiescence. */
  private scheduleLeadReconciliation(agent: Agent): void {
    if (this.storage === undefined || this.lifecycle.signal.aborted) return
    const operation = this.reconcileTeam(agent)
    this.reconciliations.add(operation)
    void operation.catch((error: unknown) => {
      this.ctx.logger.warn('agent-team-ultra: Team Binding reconciliation failed')
      this.ctx.logger.warn(error)
    }).finally(() => { this.reconciliations.delete(operation) })
  }

  /** Reconcile live Teams after a complete runtime catalog generation publishes. */
  private scheduleAvailableLeadReconciliation(): void {
    if (this.storage === undefined || this.lifecycle.signal.aborted) return
    for (const agent of this.ctx.agents.list()) this.scheduleLeadReconciliation(agent)
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

  private instanceView(caller: Agent, binding: DigitalEmployeeBindingV1): DigitalEmployeeInstanceView {
    const rosterMember = binding.memberId === undefined
      ? undefined
      : this.ctx.agentTeams.listMembers(caller).find(member =>
          member.id === binding.memberId && member.name === binding.memberName)
    return Object.freeze({
      teamId: binding.teamId,
      memberName: binding.memberName,
      ...(binding.memberId === undefined ? {} : { memberId: binding.memberId }),
      ...(binding.launchRequestId === undefined ? {} : { launchRequestId: binding.launchRequestId }),
      profileId: binding.profileId,
      profileRevision: binding.profileRevision,
      runtimeTarget: binding.runtimeTarget.kind === 'legacy-inherit-lead'
        ? legacyInheritLeadRuntimeTarget
        : Object.freeze({ ...binding.runtimeTarget }),
      ...(binding.resolvedRuntimeTarget === undefined
        ? {}
        : { resolvedRuntimeTarget: Object.freeze({ ...binding.resolvedRuntimeTarget }) }),
      ...(binding.nativeRuntimeHandle === undefined
        ? {}
        : { nativeRuntimeHandle: binding.nativeRuntimeHandle }),
      requiredCapabilities: snapshotRequiredCapabilities(binding.requiredCapabilities),
      provisioningPhase: binding.provisioningPhase,
      runtimeAvailability: this.runtimeBackends.availability(
        binding.profile,
        binding.runtimeTarget,
        binding.requiredCapabilities,
      ),
      runtimePresence: binding.runtimeTarget.kind === 'external-agent'
        && binding.nativeRuntimeHandle !== undefined
        ? rosterMember?.status === 'running' || rosterMember?.status === 'idle'
          ? rosterMember.status
          : 'inactive'
        : bindingRuntimePresence(
          binding,
          binding.memberId === undefined ? undefined : this.ctx.agents.get(SessionId(binding.memberId)),
        ),
      ...(binding.error === undefined ? {} : { error: binding.error }),
    })
  }

  /** Persist one terminal provider result unless event reconciliation already wrote the same or a failed edge. */
  private async commitProvisionedBinding(
    key: string,
    active: DigitalEmployeeBindingV1,
  ): Promise<DigitalEmployeeBindingV1> {
    return await this.enqueue(async () => {
      const storage = this.requireStorage()
      const current = storage.getBinding(key)
      if (current?.launchRequestId !== undefined && current.launchRequestId !== active.launchRequestId) {
        throw new Error(`binding "${key}" changed launch identity during provisioning`)
      }
      if (current?.provisioningPhase === 'failed') return current
      if (current !== undefined && isDeepStrictEqual(current, active)) return current
      await storage.putBinding(key, active)
      return active
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
