/** Agent Team Ultra Host service and generated Remote surface. */

import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { Context, Service } from '@deepseek-ai/cordis'
import s from '@deepseek-ai/schemastery'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session-persistence'
import {
  TeamError,
  TeammateEvaluationId,
  TeammateLaunchRequestId,
  TeammateRuntimeError,
} from '@deepseek-ai/dsh-experimental-agent-team'
import type { TeamMemberRouteSnapshot } from '@deepseek-ai/dsh-experimental-agent-team'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionEvent, type UserMessage } from '@deepseek-ai/dsh-session'
import { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import { foldSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import type { PostToolDecision, PreToolDecision } from '@deepseek-ai/dsh-tools'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { setApprovalPolicy } from '@deepseek-ai/dsh-user-approval'
import {
  digitalEmployeeProfileDraftSchema,
  digitalEmployeeEvalSetDraftSchema,
  evalRunIdSchema,
  launchRequestIdSchema,
  nativeRuntimeHandleFromTeammate,
  selectableDigitalEmployeeRuntimeTargetSchema,
  type DigitalEmployeeBinding,
} from './spec.ts'
import {
  externalRuntimeProfileSnapshot,
  requiredCapabilitiesForProfile,
  requiredRuntimeCapabilitiesForProfile,
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
import {
  createExternalRunIndex,
  foldDshRunEvidence,
  foldExternalRunEvidence,
  type DshRunFoldBinding,
  type ExternalRunFoldBinding,
} from './run.ts'
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
  DigitalEmployeeRunIndexRecord,
  DshModelRuntimeTarget,
  DigitalEmployeeStudioView,
  GetDigitalEmployeeProfileRevisionRequest,
  GetDigitalEmployeeProfileRevisionResult,
  GetDigitalEmployeeRunRequest,
  GetDigitalEmployeeRunResult,
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
  SaveDigitalEmployeeEvalSetRequest,
  SaveDigitalEmployeeEvalSetResult,
  SetDigitalEmployeeEvalGateRequest,
  StartDigitalEmployeeEvalRunRequest,
  StartDigitalEmployeeEvalRunResult,
  CancelDigitalEmployeeEvalRunRequest,
  CancelDigitalEmployeeEvalRunResult,
  GetDigitalEmployeeEvalRunRequest,
  GetDigitalEmployeeEvalRunResult,
  DigitalEmployeeEvalCase,
  DigitalEmployeeEvalCaseResult,
  DigitalEmployeeEvalRunRecord,
  DigitalEmployeeEvalSetCatalogEntry,
  DigitalEmployeeEvalSetHead,
  DigitalEmployeeEvalSetRevision,
  DigitalEmployeePromotionGate,
  SelectableDigitalEmployeeRuntimeTarget,
} from './types.ts'
import {
  EVAL_ASSERTION_SCHEMA_VERSION,
  casePassed,
  effectiveEvaluationTools,
  evalEnvironmentFingerprint,
  evalRunPassed,
  evalRunRequestFingerprint,
  evalSetContentFingerprint,
  evaluateCaseAssertions,
  evaluationTerminal,
  snapshotEvalRun,
  snapshotEvalSetDraft,
  snapshotEvalSetHead,
  snapshotEvalSetRevision,
  summarizeEvalRun,
} from './evaluation.ts'

export type * from './types.ts'
export type {
  DigitalEmployeeExternalRuntimeProvider,
  DigitalEmployeeExternalRuntimeRegistration,
} from './runtime.ts'
export {
  digitalEmployeeBindingSchema,
  digitalEmployeeDomainSpec,
  digitalEmployeeEvalSetDraftSchema,
  digitalEmployeeProfileDraftSchema,
  digitalEmployeeProfileSchema,
  digitalEmployeeRuntimeTargetSchema,
  launchRequestIdSchema,
  evalRunIdSchema,
  profileHookSchema,
  profileTextBlockSchema,
  profileToolPolicySchema,
  selectableDigitalEmployeeRuntimeTargetSchema,
} from './spec.ts'
export {
  EVAL_ASSERTION_SCHEMA_VERSION,
  effectiveEvaluationTools,
  evalEnvironmentFingerprint,
  evalRunPassed,
  evalRunRequestFingerprint,
  evalSetContentFingerprint,
  evaluateCaseAssertions,
} from './evaluation.ts'
export {
  requiredCapabilitiesForProfile,
  requiredRuntimeCapabilitiesForProfile,
  runtimeTargetRoutingId,
} from './runtime.ts'

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
  readonly maxRuns?: number
  readonly maxRunEvidenceItems?: number
  readonly maxEvalSets?: number
  readonly maxEvalSetBytes?: number
  readonly maxEvalCases?: number
  readonly maxEvalRuns?: number
}

interface ResolvedConfig {
  readonly defaultContinuationProvider: string
  readonly maxProfiles: number
  readonly maxProfileBytes: number
  readonly maxHooks: number
  readonly maxAssignmentBytes: number
  readonly maxRevisionHistory: number
  readonly maxDiffEntries: number
  readonly maxRuns: number
  readonly maxRunEvidenceItems: number
  readonly maxEvalSets: number
  readonly maxEvalSetBytes: number
  readonly maxEvalCases: number
  readonly maxEvalRuns: number
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

interface InFlightEvaluation {
  readonly teamId: string
  readonly requestFingerprint: string
  readonly controller: AbortController
  readonly operation: Promise<void>
}

interface EvaluationPlan {
  readonly teamId: string
  readonly profile: DigitalEmployeeProfileRevision
  readonly evalSet: DigitalEmployeeEvalSetRevision
  readonly runtimeTarget: SelectableDigitalEmployeeRuntimeTarget
  readonly capabilityGeneration: number
  readonly effectiveToolAllowlist: readonly string[]
  readonly environmentFingerprint: string
  readonly requestFingerprint: string
}

class EvaluationCancelledError extends Error {
  constructor(readonly reason: 'cancelled' | 'interrupted') {
    super(`evaluation ${reason}`)
    this.name = 'EvaluationCancelledError'
  }
}

class EvaluationTimeoutError extends Error {
  constructor(maxElapsedMs: number) {
    super(`evaluation Case exceeded ${maxElapsedMs}ms`)
    this.name = 'EvaluationTimeoutError'
  }
}

const DEFAULT_PROVIDER = 'spawn'
const DEFAULT_MAX_PROFILES = 64
const DEFAULT_MAX_PROFILE_BYTES = 131_072
const DEFAULT_MAX_HOOKS = 32
const DEFAULT_MAX_ASSIGNMENT_BYTES = 32_768
const DEFAULT_MAX_REVISION_HISTORY = 32
const DEFAULT_MAX_DIFF_ENTRIES = 512
const DEFAULT_MAX_RUNS = 512
const DEFAULT_MAX_RUN_EVIDENCE_ITEMS = 512
const DEFAULT_MAX_EVAL_SETS = 64
const DEFAULT_MAX_EVAL_SET_BYTES = 262_144
const DEFAULT_MAX_EVAL_CASES = 64
const DEFAULT_MAX_EVAL_RUNS = 256

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
  maxRuns: s.number().step(1).min(1).default(DEFAULT_MAX_RUNS),
  maxRunEvidenceItems: s.number().step(1).min(1).default(DEFAULT_MAX_RUN_EVIDENCE_ITEMS),
  maxEvalSets: s.number().step(1).min(1).default(DEFAULT_MAX_EVAL_SETS),
  maxEvalSetBytes: s.number().step(1).min(1024).default(DEFAULT_MAX_EVAL_SET_BYTES),
  maxEvalCases: s.number().step(1).min(1).default(DEFAULT_MAX_EVAL_CASES),
  maxEvalRuns: s.number().step(1).min(1).default(DEFAULT_MAX_EVAL_RUNS),
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

function snapshotRunIndex(run: DigitalEmployeeRunIndexRecord): DigitalEmployeeRunIndexRecord {
  return Object.freeze({
    ...run,
    canonicalSource: Object.freeze({ ...run.canonicalSource }),
    owner: Object.freeze({ ...run.owner }),
    selectedRuntimeTarget: run.selectedRuntimeTarget.kind === 'legacy-inherit-lead'
      ? legacyInheritLeadRuntimeTarget
      : Object.freeze({ ...run.selectedRuntimeTarget }),
    ...(run.actualRuntimeTarget === undefined
      ? {}
      : { actualRuntimeTarget: Object.freeze({ ...run.actualRuntimeTarget }) }),
    ...(run.usage === undefined ? {} : { usage: Object.freeze({ ...run.usage }) }),
    completeness: Object.freeze({
      ...run.completeness,
      redactions: Object.freeze([...run.completeness.redactions]),
    }),
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

function runRejected(error: DigitalEmployeeFailure): GetDigitalEmployeeRunResult {
  return Object.freeze({ ok: false, error })
}

function saveEvalSetRejected(error: DigitalEmployeeFailure): SaveDigitalEmployeeEvalSetResult {
  return Object.freeze({ ok: false, error })
}

function startEvalRejected(error: DigitalEmployeeFailure): StartDigitalEmployeeEvalRunResult {
  return Object.freeze({ ok: false, error })
}

function cancelEvalRejected(error: DigitalEmployeeFailure): CancelDigitalEmployeeEvalRunResult {
  return Object.freeze({ ok: false, error })
}

function getEvalRejected(error: DigitalEmployeeFailure): GetDigitalEmployeeEvalRunResult {
  return Object.freeze({ ok: false, error })
}

function evaluationSessionId(evalRunId: string, caseId: string): SessionId {
  const digest = createHash('sha256')
    .update(JSON.stringify(['agent-team-ultra-evaluation', evalRunId, caseId]), 'utf8')
    .digest('base64url')
  return SessionId(`eval_${digest}`)
}

function profileFromRevision(revision: DigitalEmployeeProfileRevision): DigitalEmployeeProfile {
  return snapshotProfile({
    ...revision.profile,
    revision: revision.revision,
    createdAt: revision.createdAt,
    updatedAt: revision.updatedAt,
  })
}

function assistantOutputForTurn(events: readonly SessionEvent[], turn: number): string {
  const output: string[] = []
  for (const event of events) {
    if (event.type !== 'assistant/message' || event.data.turn !== turn) continue
    for (const block of event.data.message.content) {
      if (block.type === 'text') output.push(block.text)
    }
  }
  return output.join('')
}

function contentBlockOutput(blocks: readonly { readonly type: string; readonly text?: string }[]): string {
  return blocks.filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text!)
    .join('')
}

function evaluationFixturesText(testCase: DigitalEmployeeEvalCase): string {
  if (testCase.fixtures.length === 0) return ''
  return [
    '# Immutable evaluation fixtures',
    ...testCase.fixtures.map(fixture => `## ${fixture.id}\n${fixture.content}`),
  ].join('\n\n')
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
  static inject = [
    'agents',
    'agentTeams',
    'llm',
    'sessionPersistence',
    'storageDomain',
    'subagents',
    'systemPrompt',
    'tools',
  ]
  static Config = Config

  private readonly resolved: ResolvedConfig
  private storage: DigitalEmployeeStorage | undefined
  private mutationTail: Promise<void> = Promise.resolve()
  private readonly launches = new Set<Promise<unknown>>()
  private readonly launchesByRequest = new Map<string, InFlightLaunch>()
  private readonly reconciliations = new Set<Promise<void>>()
  private readonly runRepairs = new Set<Promise<void>>()
  private readonly evaluations = new Set<Promise<void>>()
  private readonly evaluationsById = new Map<string, InFlightEvaluation>()
  private readonly childInstallations = new Map<Agent, () => void>()
  private readonly pendingApprovals = new Map<string, Set<string>>()
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
      maxRuns: positiveInteger('maxRuns', config.maxRuns ?? DEFAULT_MAX_RUNS),
      maxRunEvidenceItems: positiveInteger(
        'maxRunEvidenceItems',
        config.maxRunEvidenceItems ?? DEFAULT_MAX_RUN_EVIDENCE_ITEMS,
      ),
      maxEvalSets: positiveInteger('maxEvalSets', config.maxEvalSets ?? DEFAULT_MAX_EVAL_SETS),
      maxEvalSetBytes: positiveInteger(
        'maxEvalSetBytes',
        config.maxEvalSetBytes ?? DEFAULT_MAX_EVAL_SET_BYTES,
        1024,
      ),
      maxEvalCases: positiveInteger('maxEvalCases', config.maxEvalCases ?? DEFAULT_MAX_EVAL_CASES),
      maxEvalRuns: positiveInteger('maxEvalRuns', config.maxEvalRuns ?? DEFAULT_MAX_EVAL_RUNS),
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
      for (const evaluation of this.evaluationsById.values()) {
        evaluation.controller.abort(new Error('Agent Team Ultra service disposed'))
      }
      const runtimeBackendDisposal = this.runtimeBackends.dispose()
      const failures: unknown[] = []
      try { stopCreated() } catch (error: unknown) { failures.push(error) }
      try { stopDisposed() } catch (error: unknown) { failures.push(error) }
      try { stopSessionStart() } catch (error: unknown) { failures.push(error) }
      try { stopSessionEvent() } catch (error: unknown) { failures.push(error) }
      this.pendingApprovals.clear()
      try { this.revokeBoundAgents() } catch (error: unknown) { failures.push(error) }
      await Promise.allSettled([...this.launches])
      await Promise.allSettled([...this.reconciliations])
      await Promise.allSettled([...this.runRepairs])
      await Promise.allSettled([...this.evaluations])
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
    stopDisposed = this.ctx.on('agent/disposed', ({ agent }) => {
      this.pendingApprovals.delete(agent.id)
      this.removeBoundAgent(agent)
    })
    stopSessionStart = this.ctx.on('agent/session-start', ({ agent }) => {
      this.scheduleLeadReconciliation(agent)
    })
    stopSessionEvent = this.ctx.on('session/event', (session, event) => {
      this.observeApprovalCorrelation(session.id, event)
      if (event.type === 'team/member') {
        const lead = this.ctx.agents.get(session.id)
        if (lead !== undefined) this.scheduleLeadReconciliation(lead)
      }
      if (event.type === 'turn/start' || event.type === 'turn/end' || event.type === 'assistant/message'
        || event.type === 'team/member' || event.type === 'team/message/delivered'
        || String(event.type) === 'approval/asked' || String(event.type) === 'approval/decided') {
        this.scheduleRunRepair(session.id)
      }
    })
    await this.repairInterruptedEvaluations()
    this.admissionOpen = true
    for (const agent of this.ctx.agents.list()) this.installBoundAgent(agent)
    await this.reconcileAvailableLeads()
    await this.repairAvailableTeamRuns()
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
    await this.repairTeamRuns(agent)
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

  /** Lazily fold bounded canonical evidence for one deterministic Run. */
  @Remote('run')
  remoteRun(
    agent: Agent,
    request: GetDigitalEmployeeRunRequest,
    signal: AbortSignal,
  ): Promise<GetDigitalEmployeeRunResult> {
    return this.runEvidence(agent, request, signal)
  }

  /** Build the complete replaceable Studio view for one exact live Team Lead. */
  studioView(caller: Agent): DigitalEmployeeStudioView {
    const authorityFailure = this.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) throw authorityRemoteError(authorityFailure, 'view')
    const membership = this.ctx.agentTeams.membership(caller)
    const profiles = [...this.requireStorage().profileHeadEntries()]
      .map(([, head]) => this.profileCatalogEntry(caller, membership.id, head))
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
    const runs = [...this.requireStorage().runEntries()]
      .map(([, run]) => run)
      .filter(run => run.teamId === membership.id)
      .sort((left, right) => right.startedAt - left.startedAt || right.runId.localeCompare(left.runId))
      .map(snapshotRunIndex)
    const evalSets = [...this.requireStorage().evalSetHeadEntries()]
      .map(([, head]) => this.evalSetCatalogEntry(head))
      .sort((left, right) => left.latest.evalSet.displayName.localeCompare(right.latest.evalSet.displayName)
        || left.head.evalSetId.localeCompare(right.head.evalSetId))
    const evalRuns = [...this.requireStorage().evalRunEntries()]
      .map(([, run]) => run)
      .filter(run => run.teamId === membership.id)
      .sort((left, right) => right.startedAt - left.startedAt
        || right.evalRunId.localeCompare(left.evalRunId))
      .map(summarizeEvalRun)
    const historicalTargets = profiles.flatMap(entry =>
      [...this.requireStorage().profileRevisionEntries(entry.head.profileId)]
        .map(([, revision]) => revision.runtimeTarget))
    for (const [, binding] of this.requireStorage().bindingEntries()) {
      if (binding.teamId === membership.id) historicalTargets.push(binding.runtimeTarget)
    }
    for (const run of evalRuns) historicalTargets.push(run.runtimeTarget)
    return Object.freeze({
      profiles: Object.freeze(profiles),
      runtimeCatalog: this.runtimeBackends.snapshot(historicalTargets),
      tools: Object.freeze(tools),
      instances: Object.freeze(instances),
      runs: Object.freeze(runs),
      evalSets: Object.freeze(evalSets),
      evalRuns: Object.freeze(evalRuns),
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

  /** Public Host Run inspector guarded by exact live Lead authority. */
  async runEvidence(
    caller: Agent,
    request: GetDigitalEmployeeRunRequest,
    signal: AbortSignal,
  ): Promise<GetDigitalEmployeeRunResult> {
    if (!this.admissionOpen) return runRejected(failure('service-disposed', 'Digital Employee service is disposing'))
    const authorityFailure = this.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) return runRejected(authorityFailure)
    signal.throwIfAborted()
    const membership = this.ctx.agentTeams.membership(caller)
    const stored = this.requireStorage().getRun(request.runId)
    if (stored === undefined || stored.teamId !== membership.id) {
      return runRejected(failure('run-not-found', `Run "${request.runId}" not found`))
    }
    if (stored.source === 'dsh-session') {
      try {
        if (stored.canonicalSource.kind !== 'dsh-session') {
          return runRejected(failure('evidence-unavailable', 'Run canonical DSH correlation is invalid'))
        }
        const events = await this.loadOwnSessionEvents(stored.canonicalSource.sessionId, signal)
        const folded = foldDshRunEvidence(
          this.dshRunBindingFromIndex(stored),
          SessionId(stored.canonicalSource.sessionId),
          events,
          this.resolved.maxRunEvidenceItems,
          this.resolved.maxRuns,
          this.pendingApprovals.get(stored.canonicalSource.sessionId),
        ).find(candidate => candidate.index.runId === stored.runId)
        if (folded === undefined) {
          return runRejected(failure('evidence-unavailable', 'canonical DSH turn is no longer inspectable'))
        }
        await this.requireStorage().putRun(folded.index, this.resolved.maxRuns)
        return Object.freeze({ ok: true as const, value: folded.detail })
      } catch (error: unknown) {
        if (signal.aborted) throw error
        return runRejected(failure('evidence-unavailable', `DSH Session evidence unavailable: ${errorText(error)}`))
      }
    }
    if (stored.owner.kind !== 'team-member') {
      return runRejected(failure(
        'evidence-unavailable',
        'evaluation-native evidence is owned by the evaluation runner',
      ))
    }
    try {
      const page = await this.ctx.agentTeams.readTeammateRuntimeEvidence(caller, stored.owner.memberName, {
        limit: this.resolved.maxRunEvidenceItems,
        signal,
      })
      const folded = foldExternalRunEvidence(
        stored,
        page.items,
        page.complete,
        this.resolved.maxRunEvidenceItems,
        page.pendingApprovals,
      )
      await this.requireStorage().putRun(folded.index, this.resolved.maxRuns)
      return Object.freeze({ ok: true as const, value: folded.detail })
    } catch (error: unknown) {
      if (signal.aborted) throw error
      return runRejected(failure('evidence-unavailable', `external runtime evidence unavailable: ${errorText(error)}`))
    }
  }

  /** Save one normalized profile with an exact CAS precondition. */
  @Remote('save')
  remoteSave(agent: Agent, request: SaveDigitalEmployeeProfileRequest): Promise<SaveDigitalEmployeeProfileResult> {
    return this.saveProfile(agent, request)
  }

  /** Version one Profile-scoped Eval Set through exact independent CAS. */
  @Remote('saveEvalSet')
  remoteSaveEvalSet(
    agent: Agent,
    request: SaveDigitalEmployeeEvalSetRequest,
  ): Promise<SaveDigitalEmployeeEvalSetResult> {
    return this.saveEvalSet(agent, request)
  }

  /** Attach or clear a fixed Eval Set Revision promotion gate. */
  @Remote('setEvalGate')
  remoteSetEvalGate(
    agent: Agent,
    request: SetDigitalEmployeeEvalGateRequest,
  ): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.setEvalGate(agent, request)
  }

  /** Admit one exact idempotent evaluation and run its Cases in the background. */
  @Remote('startEvalRun')
  remoteStartEvalRun(
    agent: Agent,
    request: StartDigitalEmployeeEvalRunRequest,
  ): Promise<StartDigitalEmployeeEvalRunResult> {
    return this.startEvalRun(agent, request)
  }

  /** Cancel one Team-owned running evaluation and return its terminal snapshot. */
  @Remote('cancelEvalRun')
  remoteCancelEvalRun(
    agent: Agent,
    request: CancelDigitalEmployeeEvalRunRequest,
  ): Promise<CancelDigitalEmployeeEvalRunResult> {
    return this.cancelEvalRun(agent, request)
  }

  /** Inspect one Team-owned Eval Run and its exact immutable Eval Set. */
  @Remote('evalRun')
  remoteEvalRun(
    agent: Agent,
    request: GetDigitalEmployeeEvalRunRequest,
  ): Promise<GetDigitalEmployeeEvalRunResult> {
    return this.evalRun(agent, request)
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

  /** Publish one immutable Eval Set Revision and move only its CAS Head. */
  async saveEvalSet(
    caller: Agent,
    request: SaveDigitalEmployeeEvalSetRequest,
  ): Promise<SaveDigitalEmployeeEvalSetResult> {
    if (!this.admissionOpen) {
      return saveEvalSetRejected(failure('service-disposed', 'Digital Employee service is disposing'))
    }
    const authorityFailure = this.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) return saveEvalSetRejected(authorityFailure)
    if (request.expectedHeadRevision !== null
      && (!Number.isSafeInteger(request.expectedHeadRevision) || request.expectedHeadRevision < 1)) {
      return saveEvalSetRejected(failure('eval-invalid', 'Eval Set Head revision must be null or positive'))
    }
    const parsed = digitalEmployeeEvalSetDraftSchema.safeParse(request.evalSet)
    if (!parsed.success) {
      return saveEvalSetRejected(failure(
        'eval-invalid',
        parsed.error.issues.map(issue => `${issue.path.join('.') || 'evalSet'}: ${issue.message}`).join('; ').slice(0, 2048),
      ))
    }
    if (parsed.data.cases.length > this.resolved.maxEvalCases) {
      return saveEvalSetRejected(failure(
        'eval-invalid',
        `Eval Set has ${parsed.data.cases.length} Cases; maximum is ${this.resolved.maxEvalCases}`,
      ))
    }
    const normalized = snapshotEvalSetDraft(parsed.data)
    const bytes = Buffer.byteLength(JSON.stringify(normalized), 'utf8')
    if (bytes > this.resolved.maxEvalSetBytes) {
      return saveEvalSetRejected(failure(
        'eval-invalid',
        `Eval Set content is ${bytes} UTF-8 bytes; maximum is ${this.resolved.maxEvalSetBytes}`,
      ))
    }
    return await this.enqueue(async () => {
      const storage = this.requireStorage()
      const profileHead = storage.getProfileHead(normalized.profileId)
      if (profileHead === undefined) {
        return saveEvalSetRejected(failure('profile-not-found', `profile "${normalized.profileId}" not found`))
      }
      const currentHead = storage.getEvalSetHead(normalized.id)
      if (request.expectedHeadRevision !== (currentHead?.headRevision ?? null)) {
        return saveEvalSetRejected(failure('eval-conflict', 'Eval Set Head changed; reload before saving'))
      }
      if (currentHead !== undefined && currentHead.profileId !== normalized.profileId) {
        return saveEvalSetRejected(failure('eval-conflict', 'Eval Set identity is already owned by another Profile'))
      }
      if (currentHead === undefined && storage.evalSetCount >= this.resolved.maxEvalSets) {
        return saveEvalSetRejected(failure('eval-invalid', `Eval Set limit ${this.resolved.maxEvalSets} reached`))
      }
      const latest = currentHead === undefined
        ? undefined
        : storage.getEvalSetRevision(normalized.id, currentHead.latestRevision)
      if (currentHead !== undefined && latest === undefined) {
        throw new Error(`Eval Set Head "${normalized.id}" has no latest Revision`)
      }
      const fingerprint = evalSetContentFingerprint(normalized)
      if (latest?.fingerprint === fingerprint) {
        return Object.freeze({
          ok: true as const,
          value: Object.freeze({
            unchanged: true,
            head: snapshotEvalSetHead(currentHead!),
            revision: snapshotEvalSetRevision(latest),
          }),
        })
      }
      const known = [...storage.evalSetRevisionEntries(normalized.id)].map(([, revision]) => revision)
      const reusable = known
        .filter(revision => revision.revision > (currentHead?.latestRevision ?? 0)
          && revision.fingerprint === fingerprint)
        .sort((left, right) => left.revision - right.revision)[0]
      const now = Date.now()
      const revision = reusable ?? snapshotEvalSetRevision({
        schemaVersion: 1,
        evalSetId: normalized.id,
        profileId: normalized.profileId,
        revision: Math.max(0, ...known.map(candidate => candidate.revision)) + 1,
        evalSet: normalized,
        fingerprint,
        createdAt: currentHead?.createdAt ?? now,
        updatedAt: Math.max(now, currentHead?.updatedAt ?? 0),
      })
      const nextHead = snapshotEvalSetHead({
        schemaVersion: 1,
        evalSetId: normalized.id,
        profileId: normalized.profileId,
        headRevision: (currentHead?.headRevision ?? 0) + 1,
        latestRevision: revision.revision,
        createdAt: currentHead?.createdAt ?? now,
        updatedAt: Math.max(now, currentHead?.updatedAt ?? 0),
      })
      await storage.putEvalSetRevision(revision)
      await storage.putEvalSetHead(nextHead)
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
    if (!this.admissionOpen) {
      return Promise.resolve(headMutationRejected(failure('service-disposed', 'Digital Employee service is disposing')))
    }
    const authorityFailure = this.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) return Promise.resolve(headMutationRejected(authorityFailure))
    if (!Number.isSafeInteger(request.expectedHeadRevision) || request.expectedHeadRevision < 1
      || (request.requiredEvalSet !== undefined
        && (!Number.isSafeInteger(request.requiredEvalSet.revision) || request.requiredEvalSet.revision < 1))) {
      return Promise.resolve(headMutationRejected(failure('eval-invalid', 'Eval gate CAS values must be positive integers')))
    }
    return this.enqueue(async () => {
      const storage = this.requireStorage()
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

  /** Reserve one exact Eval Run identity, then execute it outside the mutation queue. */
  async startEvalRun(
    caller: Agent,
    request: StartDigitalEmployeeEvalRunRequest,
  ): Promise<StartDigitalEmployeeEvalRunResult> {
    if (!this.admissionOpen) {
      return startEvalRejected(failure('service-disposed', 'Digital Employee service is disposing'))
    }
    const authorityFailure = this.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) return startEvalRejected(authorityFailure)
    const parsedId = evalRunIdSchema.safeParse(request.evalRunId)
    if (!parsedId.success) {
      return startEvalRejected(failure('eval-invalid', 'evalRunId must be a canonical lowercase UUID'))
    }
    if (![request.profileRevision, request.evalSetRevision]
      .every(value => Number.isSafeInteger(value) && value >= 1)) {
      return startEvalRejected(failure('eval-invalid', 'evaluation Revision values must be positive integers'))
    }
    const teamId = this.ctx.agentTeams.membership(caller).id
    const planned = await this.prepareEvaluationPlan(caller, teamId, request)
    if ('code' in planned) return startEvalRejected(planned)
    const evalRunId = parsedId.data
    const existing = this.requireStorage().getEvalRun(evalRunId)
    if (existing !== undefined) {
      if (existing.teamId !== teamId || existing.requestFingerprint !== planned.requestFingerprint) {
        return startEvalRejected(failure('eval-conflict', 'evalRunId was already used with different exact inputs'))
      }
      return Object.freeze({
        ok: true,
        value: Object.freeze({ replayed: true, run: summarizeEvalRun(existing) }),
      })
    }
    const now = Date.now()
    const initial = snapshotEvalRun({
      schemaVersion: 1,
      evalRunId,
      requestFingerprint: planned.requestFingerprint,
      teamId,
      profileId: planned.profile.profileId,
      profileRevision: planned.profile.revision,
      profileFingerprint: planned.profile.fingerprint,
      runtimeTarget: planned.runtimeTarget,
      capabilityGeneration: planned.capabilityGeneration,
      evalSetId: planned.evalSet.evalSetId,
      evalSetRevision: planned.evalSet.revision,
      evalSetFingerprint: planned.evalSet.fingerprint,
      assertionSchemaVersion: EVAL_ASSERTION_SCHEMA_VERSION,
      environmentFingerprint: planned.environmentFingerprint,
      effectiveToolAllowlist: planned.effectiveToolAllowlist,
      status: 'running',
      cases: Object.freeze(planned.evalSet.evalSet.cases.map(testCase => Object.freeze({
        caseId: testCase.id,
        status: 'pending' as const,
        assertions: Object.freeze([]),
      }))),
      startedAt: now,
      updatedAt: now,
    })
    const reserved = await this.enqueue(async (): Promise<DigitalEmployeeEvalRunRecord | DigitalEmployeeFailure> => {
      const storage = this.requireStorage()
      const concurrent = storage.getEvalRun(evalRunId)
      if (concurrent !== undefined) {
        return concurrent.teamId === teamId && concurrent.requestFingerprint === planned.requestFingerprint
          ? concurrent
          : failure('eval-conflict', 'evalRunId was concurrently used with different exact inputs')
      }
      await storage.putEvalRun(initial, this.resolved.maxEvalRuns)
      return initial
    })
    if ('code' in reserved) return startEvalRejected(reserved)
    if (reserved !== initial) {
      return Object.freeze({
        ok: true,
        value: Object.freeze({ replayed: true, run: summarizeEvalRun(reserved) }),
      })
    }
    const controller = new AbortController()
    let operation!: Promise<void>
    operation = Promise.resolve().then(async () => {
      await this.executeEvaluation(caller, planned, initial, controller)
    }).catch((error: unknown) => {
      this.ctx.logger.warn(`agent-team-ultra: Eval Run ${evalRunId} failed outside its recorded state machine`)
      this.ctx.logger.warn(error)
    }).finally(() => {
      this.evaluations.delete(operation)
      if (this.evaluationsById.get(evalRunId)?.operation === operation) {
        this.evaluationsById.delete(evalRunId)
      }
    })
    this.evaluations.add(operation)
    this.evaluationsById.set(evalRunId, {
      teamId,
      requestFingerprint: planned.requestFingerprint,
      controller,
      operation,
    })
    return Object.freeze({
      ok: true,
      value: Object.freeze({ replayed: false, run: summarizeEvalRun(initial) }),
    })
  }

  /** Abort and drain a running evaluation owned by the caller's exact Team. */
  async cancelEvalRun(
    caller: Agent,
    request: CancelDigitalEmployeeEvalRunRequest,
  ): Promise<CancelDigitalEmployeeEvalRunResult> {
    if (!this.admissionOpen) {
      return cancelEvalRejected(failure('service-disposed', 'Digital Employee service is disposing'))
    }
    const authorityFailure = this.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) return cancelEvalRejected(authorityFailure)
    const parsedId = evalRunIdSchema.safeParse(request.evalRunId)
    if (!parsedId.success) return cancelEvalRejected(failure('eval-invalid', 'invalid evalRunId'))
    const teamId = this.ctx.agentTeams.membership(caller).id
    const stored = this.requireStorage().getEvalRun(parsedId.data)
    if (stored === undefined || stored.teamId !== teamId) {
      return cancelEvalRejected(failure('eval-not-found', `Eval Run "${request.evalRunId}" not found`))
    }
    const inFlight = this.evaluationsById.get(parsedId.data)
    if (stored.status === 'running' && inFlight !== undefined && inFlight.teamId === teamId) {
      inFlight.controller.abort(new EvaluationCancelledError('cancelled'))
      await inFlight.operation
    }
    const current = this.requireStorage().getEvalRun(parsedId.data) ?? stored
    return Object.freeze({ ok: true, value: Object.freeze({ run: summarizeEvalRun(current) }) })
  }

  /** Read an Eval Run only inside the exact Team that admitted it. */
  async evalRun(
    caller: Agent,
    request: GetDigitalEmployeeEvalRunRequest,
  ): Promise<GetDigitalEmployeeEvalRunResult> {
    if (!this.admissionOpen) return getEvalRejected(failure('service-disposed', 'Digital Employee service is disposing'))
    const authorityFailure = this.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) return getEvalRejected(authorityFailure)
    const parsedId = evalRunIdSchema.safeParse(request.evalRunId)
    if (!parsedId.success) return getEvalRejected(failure('eval-invalid', 'invalid evalRunId'))
    const teamId = this.ctx.agentTeams.membership(caller).id
    const run = this.requireStorage().getEvalRun(parsedId.data)
    if (run === undefined || run.teamId !== teamId) {
      return getEvalRejected(failure('eval-not-found', `Eval Run "${request.evalRunId}" not found`))
    }
    const evalSet = this.requireStorage().getEvalSetRevision(run.evalSetId, run.evalSetRevision)
    if (evalSet === undefined || evalSet.fingerprint !== run.evalSetFingerprint) {
      return getEvalRejected(failure('eval-not-found', 'Eval Run immutable Eval Set is unavailable'))
    }
    return Object.freeze({
      ok: true,
      value: Object.freeze({ run: snapshotEvalRun(run), evalSet: snapshotEvalSetRevision(evalSet) }),
    })
  }

  /** Resolve every immutable and live capability input before reserving an Eval Run. */
  private async prepareEvaluationPlan(
    caller: Agent,
    teamId: string,
    request: StartDigitalEmployeeEvalRunRequest,
  ): Promise<EvaluationPlan | DigitalEmployeeFailure> {
    await this.runtimeBackends.whenSettled()
    const storage = this.requireStorage()
    const head = storage.getProfileHead(request.profileId)
    if (head === undefined) return failure('profile-not-found', `profile "${request.profileId}" not found`)
    if (head.archivedAt !== undefined) return failure('profile-archived', `profile "${request.profileId}" is archived`, head)
    const profile = storage.getProfileRevision(request.profileId, request.profileRevision)
    if (profile === undefined || profile.revision < head.historyStartsAtRevision
      || profile.revision > head.latestRevision) {
      return failure('revision-not-found', `Profile Revision ${request.profileRevision} is not retained`, head)
    }
    const evalSet = storage.getEvalSetRevision(request.evalSetId, request.evalSetRevision)
    if (evalSet === undefined || evalSet.profileId !== profile.profileId) {
      return failure('eval-not-found', 'Eval Set Revision does not exist for this Profile')
    }
    if (profile.runtimeTarget.kind === 'legacy-inherit-lead') {
      return failure('runtime-route-invalid', 'legacy inherited Lead routing cannot be evaluated')
    }
    const runtimeTarget = Object.freeze({ ...profile.runtimeTarget }) as SelectableDigitalEmployeeRuntimeTarget
    const targetProblem = this.runtimeBackends.validateEvaluation(
      profile.profile,
      runtimeTarget,
      profile.requiredCapabilities,
    )
    if (targetProblem !== undefined) {
      return failure('eval-environment-unavailable', targetProblem.message)
    }
    if (runtimeTarget.kind === 'dsh-model') {
      const exactProblem = await this.runtimeBackends.verifyDshModelRoute(runtimeTarget)
      if (exactProblem !== undefined) return failure('eval-environment-unavailable', exactProblem.message)
      if (this.ctx.get('sandboxPolicy') === undefined
        || this.ctx.get('approval') === undefined
        || typeof this.ctx.agents.create !== 'function') {
        return failure(
          'eval-environment-unavailable',
          'DSH evaluation requires Agent creation plus the sandbox and approval policy services',
        )
      }
    }
    const providerTools = runtimeTarget.kind === 'external-agent'
      ? this.runtimeBackends.externalEvaluationTools(runtimeTarget.provider)
      : this.ctx.tools.schemas(caller)
        .map(tool => tool.name)
        .filter(name => !TEAM_OWN_TOOL_NAMES.has(name))
        .sort()
    if (providerTools === undefined) {
      return failure(
        'eval-environment-unavailable',
        `runtime "${runtimeTarget.provider}" cannot prove its evaluation tool inventory`,
      )
    }
    const effectiveToolAllowlist = effectiveEvaluationTools(
      profile.profile.toolPolicy,
      providerTools,
      evalSet.evalSet.toolAllowlist,
      TEAM_OWN_TOOL_NAMES,
    )
    const environmentFingerprint = evalEnvironmentFingerprint({ effectiveToolAllowlist, evalSet })
    const capabilityGeneration = this.runtimeBackends.capabilityGeneration
    const requestFingerprint = evalRunRequestFingerprint({
      teamId,
      profile,
      runtimeTarget,
      capabilityGeneration,
      evalSet,
      environmentFingerprint,
    })
    return Object.freeze({
      teamId,
      profile: snapshotProfileRevision(profile),
      evalSet: snapshotEvalSetRevision(evalSet),
      runtimeTarget,
      capabilityGeneration,
      effectiveToolAllowlist,
      environmentFingerprint,
      requestFingerprint,
    })
  }

  /** Execute Cases sequentially so each terminal result is independently durable. */
  private async executeEvaluation(
    caller: Agent,
    plan: EvaluationPlan,
    initial: DigitalEmployeeEvalRunRecord,
    controller: AbortController,
  ): Promise<void> {
    const interrupt = (): void => {
      controller.abort(new EvaluationCancelledError('interrupted'))
    }
    if (this.lifecycle.signal.aborted) interrupt()
    else this.lifecycle.signal.addEventListener('abort', interrupt, { once: true })
    try {
      for (const testCase of plan.evalSet.evalSet.cases) {
        if (controller.signal.aborted) break
        if (this.runtimeBackends.capabilityGeneration !== plan.capabilityGeneration) {
          await this.commitEvalCase(initial.evalRunId, {
            caseId: testCase.id,
            status: 'environment-unavailable',
            assertions: Object.freeze([]),
            diagnostic: 'runtime capability generation changed before the Case started',
            endedAt: Date.now(),
          })
          break
        }
        const startedAt = Date.now()
        await this.commitEvalCase(initial.evalRunId, {
          caseId: testCase.id,
          status: 'running',
          assertions: Object.freeze([]),
          startedAt,
        })
        try {
          if (plan.runtimeTarget.kind === 'dsh-model') {
            await this.runDshEvaluationCase(caller, plan, testCase, initial.evalRunId, controller.signal)
          } else {
            await this.runExternalEvaluationCase(caller, plan, testCase, initial.evalRunId, controller.signal)
          }
        } catch (error: unknown) {
          const interrupted = this.lifecycle.signal.aborted
          const cancelled = controller.signal.aborted
          const timedOut = error instanceof EvaluationTimeoutError
          const environmentUnavailable = error instanceof TeammateRuntimeError
            || error instanceof TeamError
            || (!cancelled && !(error instanceof EvaluationCancelledError) && !timedOut)
          await this.commitEvalCase(initial.evalRunId, {
            caseId: testCase.id,
            status: interrupted
              ? 'interrupted'
              : cancelled || error instanceof EvaluationCancelledError
                ? 'cancelled'
                : timedOut
                  ? 'failed'
                : environmentUnavailable
                  ? 'environment-unavailable'
                  : 'failed',
            assertions: Object.freeze([]),
            diagnostic: errorText(error),
            startedAt,
            endedAt: Date.now(),
          })
          if (interrupted || cancelled || environmentUnavailable) break
        }
      }
    } finally {
      this.lifecycle.signal.removeEventListener('abort', interrupt)
      await this.finalizeEvalRun(initial.evalRunId, controller.signal.aborted)
    }
  }

  /** Run a fresh, parentless DSH Agent under fixed policy and dispose it after its result commits. */
  private async runDshEvaluationCase(
    caller: Agent,
    plan: EvaluationPlan,
    testCase: DigitalEmployeeEvalCase,
    evalRunId: DigitalEmployeeEvalRunRecord['evalRunId'],
    parentSignal: AbortSignal,
  ): Promise<void> {
    if (plan.runtimeTarget.kind !== 'dsh-model') throw new TypeError('DSH evaluator requires a DSH model target')
    const target = plan.runtimeTarget
    const ceilings = plan.evalSet.evalSet.resourceCeilings
    const timeout = new AbortController()
    const timer = setTimeout(() => {
      timeout.abort(new EvaluationTimeoutError(ceilings.maxElapsedMs))
    }, ceilings.maxElapsedMs)
    const signal = AbortSignal.any([parentSignal, timeout.signal])
    let handle: Awaited<ReturnType<Context['agents']['create']>> | undefined
    try {
      signal.throwIfAborted()
      const profile = profileFromRevision(plan.profile)
      handle = await caller.ctx.agents.create({
        sessionId: evaluationSessionId(evalRunId, testCase.id),
        agentOptions: {
          provider: target.provider,
          model: target.model,
          ...(target.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: ReasoningEffortId(target.reasoningEffort) }),
          maxTokens: ceilings.maxOutputTokens,
        },
        signal,
        setup: (agentCtx) => {
          const evaluator = agentCtx.agent
          if (evaluator === undefined) throw new Error('unpublished evaluation Agent is unavailable')
          setSandboxMode(evaluator.session, 'read-only')
          setApprovalPolicy(evaluator.session, 'never')
          this.installProfileCapabilities(caller, evaluator, profile)
          agentCtx.effect(() => () => { this.removeBoundAgent(evaluator) }, 'agent-team-ultra.evaluation-profile')
          agentCtx.tools.restrict({ allow: plan.effectiveToolAllowlist })
          const fixtures = evaluationFixturesText(testCase)
          if (fixtures !== '') {
            agentCtx.systemPrompt.context({ name: 'ultra:evaluation-fixtures', order: 145, text: fixtures })
          }
          agentCtx.on('agent/pre-step', async (payload, next): Promise<PreStepDecision> => {
            if (payload.step > ceilings.maxSteps) return { kind: 'reject' }
            return await next()
          })
        },
      })
      const evaluator = handle.agent
      const abort = (): void => {
        evaluator.cancel({ kind: 'hook', reason: 'isolated evaluation cancelled' })
      }
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
      try {
        evaluator.followup(createUserMessage({
          content: [{ type: 'text', text: testCase.input }],
          source: PLUGIN_SOURCE,
        }))
        await evaluator.whenIdle()
        signal.throwIfAborted()
      } finally {
        signal.removeEventListener('abort', abort)
      }
      const flushed = await evaluator.ctx.sessions.flush(evaluator.session)
      if (!flushed) throw new Error('DSH evaluation Session has no durability checkpoint provider')
      const events = evaluator.session.snapshotEvents()
      const folded = foldDshRunEvidence({
        teamId: plan.teamId,
        owner: Object.freeze({ kind: 'evaluation-worker', evalRunId, caseId: testCase.id }),
        profileId: plan.profile.profileId,
        profileRevision: plan.profile.revision,
        profileFingerprint: plan.profile.fingerprint,
        selectedRuntimeTarget: target,
        actualRuntimeTarget: target,
        capabilityGeneration: plan.capabilityGeneration,
      }, evaluator.session.id, events, this.resolved.maxRunEvidenceItems, 1).at(-1)
      if (folded === undefined) throw new Error('DSH evaluation produced no accepted canonical turn')
      const turn = folded.index.canonicalSource.kind === 'dsh-session'
        ? folded.index.canonicalSource.turn
        : 0
      const assertions = evaluateCaseAssertions(testCase, folded.detail, assistantOutputForTurn(events, turn))
      await this.commitEvalCase(evalRunId, {
        caseId: testCase.id,
        status: casePassed(assertions) ? 'passed' : 'failed',
        assertions,
        run: folded.detail,
        startedAt: folded.index.startedAt,
        endedAt: folded.index.endedAt ?? Date.now(),
      })
    } finally {
      clearTimeout(timer)
      await handle?.dispose()
    }
  }

  /** Run a provider-native isolated handle and commit while TeamService still owns it. */
  private async runExternalEvaluationCase(
    caller: Agent,
    plan: EvaluationPlan,
    testCase: DigitalEmployeeEvalCase,
    evalRunId: DigitalEmployeeEvalRunRecord['evalRunId'],
    signal: AbortSignal,
  ): Promise<void> {
    if (plan.runtimeTarget.kind !== 'external-agent') throw new TypeError('external evaluator requires an external target')
    const target = plan.runtimeTarget
    const ceilings = plan.evalSet.evalSet.resourceCeilings
    const timeout = new AbortController()
    const timer = setTimeout(() => {
      timeout.abort(new EvaluationTimeoutError(ceilings.maxElapsedMs))
    }, ceilings.maxElapsedMs)
    const caseSignal = AbortSignal.any([signal, timeout.signal])
    const runtimeCapabilities = Object.freeze([...new Set([
      ...requiredRuntimeCapabilitiesForProfile(plan.profile.profile),
      'sandbox' as const,
      'evaluation' as const,
      'evidence' as const,
      'usage' as const,
    ])].sort())
    try {
      await this.ctx.agentTeams.runTeammateEvaluation(caller, target.provider, {
      evaluationId: TeammateEvaluationId(`${evalRunId}:${testCase.id}`),
      profile: externalRuntimeProfileSnapshot(plan.profile.profile),
      requirements: Object.freeze({
        contextMode: 'fresh',
        profileCapabilities: plan.profile.requiredCapabilities.profileCapabilities,
        runtimeCapabilities,
      }),
      input: Object.freeze([{ type: 'text', text: testCase.input }]),
      environment: Object.freeze({
        sandbox: 'read-only',
        approval: 'never',
        toolAllowlist: plan.effectiveToolAllowlist,
        fixtures: Object.freeze(testCase.fixtures.map(fixture => Object.freeze({ ...fixture }))),
        maxSteps: ceilings.maxSteps,
        maxOutputTokens: ceilings.maxOutputTokens,
        maxElapsedMs: ceilings.maxElapsedMs,
      }),
      signal: caseSignal,
    }, async (result) => {
      caseSignal.throwIfAborted()
      const provisional = createExternalRunIndex({
        teamId: plan.teamId,
        owner: Object.freeze({ kind: 'evaluation-worker', evalRunId, caseId: testCase.id }),
        profileId: plan.profile.profileId,
        profileRevision: plan.profile.revision,
        profileFingerprint: plan.profile.fingerprint,
        selectedRuntimeTarget: target,
        actualRuntimeTarget: target,
        capabilityGeneration: plan.capabilityGeneration,
        nativeHandle: result.evaluationHandle,
      }, result.turnId, result.turnId, result.startedAt)
      const folded = foldExternalRunEvidence(
        provisional,
        result.evidence,
        result.complete,
        this.resolved.maxRunEvidenceItems,
      )
      const assertions = evaluateCaseAssertions(
        testCase,
        folded.detail,
        contentBlockOutput(result.output),
      )
      const terminalMatches = folded.index.terminal === evaluationTerminal(result.terminal)
      const passed = result.complete && terminalMatches && casePassed(assertions)
      await this.commitEvalCase(evalRunId, {
        caseId: testCase.id,
        status: passed ? 'passed' : 'failed',
        assertions,
        run: folded.detail,
        ...terminalMatches ? {} : { diagnostic: 'provider terminal conflicts with normalized canonical evidence' },
        startedAt: result.startedAt,
        endedAt: result.endedAt,
      })
    })
    } finally {
      clearTimeout(timer)
    }
  }

  /** Replace exactly one Case projection while retaining the Eval Run identity tuple. */
  private async commitEvalCase(
    evalRunId: DigitalEmployeeEvalRunRecord['evalRunId'],
    result: DigitalEmployeeEvalCaseResult,
  ): Promise<void> {
    await this.enqueue(async () => {
      const storage = this.requireStorage()
      const current = storage.getEvalRun(evalRunId)
      if (current === undefined || current.status !== 'running') return
      if (!current.cases.some(testCase => testCase.caseId === result.caseId)) {
        throw new Error(`Eval Run "${evalRunId}" does not own Case "${result.caseId}"`)
      }
      const now = Math.max(Date.now(), current.updatedAt)
      await storage.putEvalRun(snapshotEvalRun({
        ...current,
        cases: Object.freeze(current.cases.map(testCase => testCase.caseId === result.caseId
          ? Object.freeze(structuredClone(result))
          : testCase)),
        updatedAt: now,
      }), this.resolved.maxEvalRuns)
    })
  }

  /** Close the state machine; cancellation, crash, and missing guarantees can never pass. */
  private async finalizeEvalRun(
    evalRunId: DigitalEmployeeEvalRunRecord['evalRunId'],
    aborted: boolean,
  ): Promise<void> {
    await this.enqueue(async () => {
      const storage = this.requireStorage()
      const current = storage.getEvalRun(evalRunId)
      if (current === undefined || current.status !== 'running') return
      const interrupted = this.lifecycle.signal.aborted
      const hasEnvironmentFailure = current.cases.some(testCase => testCase.status === 'environment-unavailable')
      const fillStatus: DigitalEmployeeEvalCaseResult['status'] = interrupted
        ? 'interrupted'
        : aborted
          ? 'cancelled'
          : hasEnvironmentFailure
            ? 'environment-unavailable'
            : 'interrupted'
      const now = Math.max(Date.now(), current.updatedAt)
      const cases = Object.freeze(current.cases.map(testCase => (
        testCase.status !== 'pending' && testCase.status !== 'running'
          ? testCase
          : Object.freeze({
              ...testCase,
              status: fillStatus,
              diagnostic: testCase.diagnostic ?? (
                interrupted ? 'service stopped before the Case completed'
                  : aborted ? 'evaluation cancelled before the Case completed'
                    : hasEnvironmentFailure ? 'evaluation environment became unavailable'
                      : 'Case did not reach a terminal result'
              ),
              ...(testCase.startedAt === undefined ? {} : { startedAt: testCase.startedAt }),
              endedAt: now,
            })
      )))
      const status: DigitalEmployeeEvalRunRecord['status'] = interrupted
        ? 'interrupted'
        : aborted || cases.some(testCase => testCase.status === 'cancelled')
          ? 'cancelled'
          : cases.some(testCase => testCase.status === 'environment-unavailable')
            ? 'environment-unavailable'
            : cases.some(testCase => testCase.status === 'interrupted')
              ? 'interrupted'
              : evalRunPassed(
                  this.requireStorage().getEvalSetRevision(current.evalSetId, current.evalSetRevision)!.evalSet.passPolicy,
                  cases,
                )
                ? 'passed'
                : 'failed'
      await storage.putEvalRun(snapshotEvalRun({
        ...current,
        status,
        cases,
        updatedAt: now,
        endedAt: now,
      }), this.resolved.maxEvalRuns)
    })
  }

  /** Cold-start repair: a process-local evaluation is never resumed or inferred to have passed. */
  private async repairInterruptedEvaluations(): Promise<void> {
    const storage = this.requireStorage()
    for (const [, run] of [...storage.evalRunEntries()]) {
      if (run.status !== 'running') continue
      const now = Math.max(Date.now(), run.updatedAt)
      const cases = Object.freeze(run.cases.map(testCase => (
        testCase.status !== 'pending' && testCase.status !== 'running'
          ? testCase
          : Object.freeze({
              ...testCase,
              status: 'interrupted' as const,
              diagnostic: 'Host restarted before the evaluation reached a terminal edge',
              endedAt: now,
            })
      )))
      await storage.putEvalRun(snapshotEvalRun({
        ...run,
        status: 'interrupted',
        cases,
        updatedAt: now,
        endedAt: now,
      }), this.resolved.maxEvalRuns)
    }
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
              runtimeCapabilities: requiredRuntimeCapabilitiesForProfile(profile),
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
        const matched = beforeTool.find(hook => matchesTool(hook.matcher ?? '', exec.name))
        if (matched?.effect === 'ask') return { kind: 'ask', reason: matched.text }
        if (matched?.effect === 'deny') return { kind: 'deny', reason: matched.text }
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
  private profileCatalogEntry(
    caller: Agent,
    teamId: string,
    head: DigitalEmployeeProfileHead,
  ): DigitalEmployeeProfileCatalogEntry {
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
      promotionGate: this.promotionGate(caller, teamId, head, latest),
    })
  }

  /** Build one bounded Eval Set catalog row without exposing mutable storage values. */
  private evalSetCatalogEntry(head: DigitalEmployeeEvalSetHead): DigitalEmployeeEvalSetCatalogEntry {
    const storage = this.requireStorage()
    const latest = storage.getEvalSetRevision(head.evalSetId, head.latestRevision)
    if (latest === undefined) throw new Error(`Eval Set Head "${head.evalSetId}" has no latest Revision`)
    const revisions = [...storage.evalSetRevisionEntries(head.evalSetId)]
      .map(([, revision]) => revision)
      .filter(revision => revision.revision <= head.latestRevision)
      .sort((left, right) => right.revision - left.revision)
    const history = revisions.slice(0, this.resolved.maxRevisionHistory).map(revision => Object.freeze({
      revision: revision.revision,
      fingerprint: revision.fingerprint,
      createdAt: revision.createdAt,
      updatedAt: revision.updatedAt,
    }))
    return Object.freeze({
      head: snapshotEvalSetHead(head),
      latest: snapshotEvalSetRevision(latest),
      history: Object.freeze(history),
      historyTruncated: revisions.length > history.length,
    })
  }

  /** Derive the exact current promotion proof; stale successes are visibly invalidated. */
  private promotionGate(
    caller: Agent,
    teamId: string,
    head: DigitalEmployeeProfileHead,
    latest: DigitalEmployeeProfileRevision,
  ): DigitalEmployeePromotionGate {
    const required = head.requiredEvalSet
    if (required === undefined) return Object.freeze({ status: 'not-required' })
    const storage = this.requireStorage()
    const evalSet = storage.getEvalSetRevision(required.evalSetId, required.revision)
    const passedRuns = [...storage.evalRunEntries()]
      .map(([, run]) => run)
      .filter(run => run.teamId === teamId
        && run.profileId === head.profileId
        && run.evalSetId === required.evalSetId
        && run.evalSetRevision === required.revision
        && run.status === 'passed')
      .sort((left, right) => right.startedAt - left.startedAt
        || right.evalRunId.localeCompare(left.evalRunId))
    if (evalSet === undefined || evalSet.profileId !== head.profileId) {
      return Object.freeze({
        status: passedRuns.length === 0 ? 'pending' : 'invalidated',
        requiredEvalSet: Object.freeze({ ...required }),
        diagnostic: 'required Eval Set Revision is unavailable',
      })
    }
    if (latest.runtimeTarget.kind === 'legacy-inherit-lead') {
      return Object.freeze({
        status: passedRuns.length === 0 ? 'pending' : 'invalidated',
        requiredEvalSet: Object.freeze({ ...required }),
        diagnostic: 'candidate runtime route cannot be evaluated',
      })
    }
    const providerTools = latest.runtimeTarget.kind === 'external-agent'
      ? this.runtimeBackends.externalEvaluationTools(latest.runtimeTarget.provider)
      : this.ctx.tools.schemas(caller)
        .map(tool => tool.name)
        .filter(name => !TEAM_OWN_TOOL_NAMES.has(name))
        .sort()
    if (providerTools === undefined) {
      return Object.freeze({
        status: passedRuns.length === 0 ? 'pending' : 'invalidated',
        requiredEvalSet: Object.freeze({ ...required }),
        diagnostic: 'current runtime cannot prove the evaluation environment',
      })
    }
    const tools = effectiveEvaluationTools(
      latest.profile.toolPolicy,
      providerTools,
      evalSet.evalSet.toolAllowlist,
      TEAM_OWN_TOOL_NAMES,
    )
    const environment = evalEnvironmentFingerprint({ effectiveToolAllowlist: tools, evalSet })
    const exact = passedRuns.find(run => run.profileRevision === latest.revision
      && run.profileFingerprint === latest.fingerprint
      && isDeepStrictEqual(run.runtimeTarget, latest.runtimeTarget)
      && run.capabilityGeneration === this.runtimeBackends.capabilityGeneration
      && run.evalSetFingerprint === evalSet.fingerprint
      && run.assertionSchemaVersion === EVAL_ASSERTION_SCHEMA_VERSION
      && run.environmentFingerprint === environment
      && isDeepStrictEqual(run.effectiveToolAllowlist, tools))
    if (exact !== undefined) {
      return Object.freeze({
        status: 'passed',
        requiredEvalSet: Object.freeze({ ...required }),
        satisfiedByEvalRunId: exact.evalRunId,
      })
    }
    return Object.freeze({
      status: passedRuns.length === 0 ? 'pending' : 'invalidated',
      requiredEvalSet: Object.freeze({ ...required }),
      diagnostic: passedRuns.length === 0
        ? 'the exact candidate has not passed this Eval Set Revision'
        : 'a prior pass no longer matches the candidate, runtime generation, or environment',
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
      if (operation === 'activate') {
        const teamId = this.ctx.agentTeams.membership(caller).id
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

  /** Translate one durable Binding into the narrow Run fold interface. */
  private dshRunBinding(binding: DigitalEmployeeBindingV1): DshRunFoldBinding {
    if (binding.memberId === undefined) throw new Error('Run Binding has no member identity')
    const { revision: _revision, createdAt: _createdAt, updatedAt: _updatedAt, ...profile } = binding.profile
    return Object.freeze({
      teamId: binding.teamId,
      owner: Object.freeze({
        kind: 'team-member' as const,
        memberId: binding.memberId,
        memberName: binding.memberName,
      }),
      profileId: binding.profileId,
      profileRevision: binding.profileRevision,
      profileFingerprint: binding.profileFingerprint
        ?? profileContentFingerprint(profile, binding.runtimeTarget, binding.requiredCapabilities),
      selectedRuntimeTarget: binding.runtimeTarget,
      ...(binding.resolvedRuntimeTarget === undefined
        ? {}
        : { actualRuntimeTarget: binding.resolvedRuntimeTarget }),
      capabilityGeneration: binding.capabilityGeneration ?? 0,
    })
  }

  private externalRunBinding(binding: DigitalEmployeeBindingV1): ExternalRunFoldBinding {
    if (binding.runtimeTarget.kind !== 'external-agent'
      || binding.memberId === undefined
      || binding.nativeRuntimeHandle === undefined) {
      throw new Error('external Run Binding lacks its exact runtime identity')
    }
    const { actualRuntimeTarget: _actualRuntimeTarget, ...common } = this.dshRunBinding(binding)
    return Object.freeze({
      ...common,
      selectedRuntimeTarget: binding.runtimeTarget,
      ...(binding.resolvedRuntimeTarget?.kind === 'external-agent'
        ? { actualRuntimeTarget: binding.resolvedRuntimeTarget }
        : {}),
      nativeHandle: binding.nativeRuntimeHandle,
    })
  }

  /** Reuse the immutable index identity when lazily refolding a retained DSH Run. */
  private dshRunBindingFromIndex(run: DigitalEmployeeRunIndexRecord): DshRunFoldBinding {
    return Object.freeze({
      teamId: run.teamId,
      owner: Object.freeze({ ...run.owner }),
      profileId: run.profileId,
      profileRevision: run.profileRevision,
      profileFingerprint: run.profileFingerprint,
      selectedRuntimeTarget: run.selectedRuntimeTarget,
      ...(run.actualRuntimeTarget === undefined ? {} : { actualRuntimeTarget: run.actualRuntimeTarget }),
      capabilityGeneration: run.capabilityGeneration,
    })
  }

  /** Load only one Session's owned suffix, never a fork-inherited prefix. */
  private async loadOwnSessionEvents(sessionId: string, signal: AbortSignal): Promise<readonly SessionEvent[]> {
    signal.throwIfAborted()
    const live = this.ctx.agents.get(SessionId(sessionId))
    if (live !== undefined) return live.session.ownEvents()
    const inspected = await this.ctx.sessionPersistence.inspect(SessionId(sessionId), signal)
    return inspected.events.slice(inspected.inheritedEventCount)
  }

  /** Rebuild every DSH Run row from its canonical child Session. */
  private async repairDshBindingRuns(binding: DigitalEmployeeBindingV1, signal: AbortSignal): Promise<void> {
    if (binding.provisioningPhase !== 'active'
      || binding.runtimeTarget.kind !== 'dsh-model'
      || binding.memberId === undefined) return
    const events = await this.loadOwnSessionEvents(binding.memberId, signal)
    const runs = foldDshRunEvidence(
      this.dshRunBinding(binding),
      SessionId(binding.memberId),
      events,
      this.resolved.maxRunEvidenceItems,
      this.resolved.maxRuns,
      this.pendingApprovals.get(binding.memberId),
    )
    for (const run of runs) {
      signal.throwIfAborted()
      await this.requireStorage().putRun(run.index, this.resolved.maxRuns)
    }
  }

  /** Rebuild external launch and delivery Runs from the canonical Team Lead log. */
  private async repairExternalBindingRuns(binding: DigitalEmployeeBindingV1, signal: AbortSignal): Promise<void> {
    if (binding.provisioningPhase !== 'active'
      || binding.runtimeTarget.kind !== 'external-agent'
      || binding.memberId === undefined
      || binding.nativeRuntimeHandle === undefined) return
    const events = await this.loadOwnSessionEvents(binding.teamId, signal)
    const foldBinding = this.externalRunBinding(binding)
    const active = events.findLast((event) => {
      if (event.type !== 'team/member') return false
      const data = event.data as SessionEvent<'team/member'>['data']
      return data.member.id === binding.memberId
        && data.member.phase === 'active'
        && data.member.externalRuntime?.nativeHandle === binding.nativeRuntimeHandle
    }) as SessionEvent<'team/member'> | undefined
    if (active !== undefined) {
      const nativeTurnId = active.data.member.externalRuntime?.initialTurnId
      const launchIdentity = nativeTurnId ?? (binding.launchRequestId === undefined
        ? undefined
        : `launch:${binding.launchRequestId}`)
      if (launchIdentity !== undefined) {
        await this.requireStorage().putRun(createExternalRunIndex(
          foldBinding,
          launchIdentity,
          nativeTurnId,
          active.time,
        ), this.resolved.maxRuns)
      }
    }
    for (const event of events) {
      if (event.type !== 'team/message/delivered' || event.data.targetId !== binding.memberId) continue
      const canonicalTurnId = event.data.nativeTurnId ?? `message:${event.data.messageId}`
      await this.requireStorage().putRun(createExternalRunIndex(
        foldBinding,
        canonicalTurnId,
        event.data.nativeTurnId,
        event.time,
      ), this.resolved.maxRuns)
    }
  }

  /** Repair all Run rows owned by one exact live Team Lead. */
  private async repairTeamRuns(caller: Agent): Promise<void> {
    if (this.storage === undefined || this.lifecycle.signal.aborted || this.ctx.agents.get(caller.id) !== caller) return
    const membership = this.ctx.agentTeams.tryMembership(caller)
    if (membership?.role !== 'lead') return
    const bindings = [...this.requireStorage().bindingEntries()]
      .map(([, binding]) => binding)
      .filter(binding => binding.teamId === membership.id)
    for (const binding of bindings) {
      try {
        if (binding.runtimeTarget.kind === 'external-agent') {
          await this.repairExternalBindingRuns(binding, this.lifecycle.signal)
        } else {
          await this.repairDshBindingRuns(binding, this.lifecycle.signal)
        }
      } catch (error: unknown) {
        if (this.lifecycle.signal.aborted) return
        this.ctx.logger.warn(`agent-team-ultra: Run repair failed for ${binding.memberName}: ${errorText(error)}`)
      }
    }
  }

  /** Repair every live Team once after startup. */
  private async repairAvailableTeamRuns(): Promise<void> {
    const seen = new Set<string>()
    for (const agent of this.ctx.agents.list()) {
      const membership = this.ctx.agentTeams.tryMembership(agent)
      if (membership?.role !== 'lead' || seen.has(membership.id)) continue
      seen.add(membership.id)
      await this.repairTeamRuns(agent)
    }
  }

  /** Retain only same-process unresolved audit ids; persisted asks are intentionally non-resumable. */
  private observeApprovalCorrelation(sessionId: SessionId, event: SessionEvent): void {
    const type = String(event.type)
    if (type === 'turn/end') {
      this.pendingApprovals.delete(sessionId)
      return
    }
    if (type !== 'approval/asked' && type !== 'approval/decided') return
    const data = event.data as unknown as Record<string, unknown>
    if (typeof data.id !== 'string' || data.id.length === 0) return
    if (type === 'approval/decided') {
      const pending = this.pendingApprovals.get(sessionId)
      pending?.delete(data.id)
      if (pending?.size === 0) this.pendingApprovals.delete(sessionId)
      return
    }
    if (typeof data.callId !== 'string' || data.callId.length === 0) return
    const binding = [...this.requireStorage().bindingEntries()]
      .map(([, current]) => current)
      .find(current => current.memberId === sessionId
        && current.provisioningPhase === 'active'
        && current.runtimeTarget.kind === 'dsh-model')
    if (binding === undefined || this.ctx.agents.get(sessionId) === undefined) return
    const pending = this.pendingApprovals.get(sessionId) ?? new Set<string>()
    pending.add(data.id)
    this.pendingApprovals.set(sessionId, pending)
  }

  /** Track event-driven Run repair as disposal-visible work. */
  private scheduleRunRepair(sessionId: SessionId): void {
    if (this.storage === undefined || this.lifecycle.signal.aborted) return
    const operation = (async () => {
      const lead = this.ctx.agents.get(sessionId)
      const membership = lead === undefined ? undefined : this.ctx.agentTeams.tryMembership(lead)
      if (lead !== undefined && membership?.role === 'lead') {
        await this.repairTeamRuns(lead)
        return
      }
      const bindings = [...this.requireStorage().bindingEntries()]
        .map(([, binding]) => binding)
        .filter(binding => binding.memberId === sessionId && binding.runtimeTarget.kind === 'dsh-model')
      for (const binding of bindings) await this.repairDshBindingRuns(binding, this.lifecycle.signal)
    })()
    this.runRepairs.add(operation)
    void operation.catch((error: unknown) => {
      if (!this.lifecycle.signal.aborted) {
        this.ctx.logger.warn(`agent-team-ultra: event-driven Run repair failed: ${errorText(error)}`)
      }
    }).finally(() => { this.runRepairs.delete(operation) })
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
