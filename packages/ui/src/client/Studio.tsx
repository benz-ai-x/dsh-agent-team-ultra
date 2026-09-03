import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  CancelDigitalEmployeeEvalRunRequest,
  CancelDigitalEmployeeEvalRunResult,
  DigitalEmployeeEvalCaseResult,
  DigitalEmployeeEvalRunDetail,
  DigitalEmployeeEvalRunId,
  DigitalEmployeeEvalRunStatus,
  DigitalEmployeeEvalRunSummary,
  DigitalEmployeeEvalSetCatalogEntry,
  DigitalEmployeeEvalSetDraft,
  GetDigitalEmployeeProfileRevisionResult,
  GetDigitalEmployeeEvalRunRequest,
  GetDigitalEmployeeEvalRunResult,
  LaunchRequestId,
  MutateDigitalEmployeeProfileHeadResult,
  DigitalEmployeeProfileCatalogEntry,
  DigitalEmployeeProfileDraft,
  DigitalEmployeeProfileRevisionDetail,
  DigitalEmployeeProfileCapability,
  DigitalEmployeeRuntimeBackend,
  DigitalEmployeeRuntimeCapability,
  DigitalEmployeeRuntimeAvailability,
  DigitalEmployeeRuntimePresence,
  DigitalEmployeeRuntimeTarget,
  DigitalEmployeeRunDetail,
  DigitalEmployeeRunId,
  DigitalEmployeeRunIndexRecord,
  DigitalEmployeeRunSource,
  DigitalEmployeeRunTerminal,
  DigitalEmployeeRunTimelineItem,
  DigitalEmployeeStudioView,
  GetDigitalEmployeeRunResult,
  ProfileHook,
  ProfileHookPoint,
  ProfileTextBlock,
  SaveDigitalEmployeeProfileRequest,
  SaveDigitalEmployeeProfileResult,
  SaveDigitalEmployeeEvalSetRequest,
  SaveDigitalEmployeeEvalSetResult,
  SelectableDigitalEmployeeRuntimeTarget,
  SetDigitalEmployeeEvalGateRequest,
  SpawnDigitalEmployeeRequest,
  SpawnDigitalEmployeeResult,
  StartDigitalEmployeeEvalRunRequest,
  StartDigitalEmployeeEvalRunResult,
} from '@deepseek-ai/dsh-agent-team-ultra/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import {
  IconChevronDownOutline14,
  IconCloseOutline16,
  IconContextInjectionOutline16,
  IconGoalOutline16,
  IconPlayOutline16,
  IconPlusOutline16,
  IconRefreshOutline14,
  IconSettingsOutline16,
  IconSkillOutline16,
  IconThinkOutline16,
  IconTrashOutline16,
  IconUserOutline16,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { NS, type UltraKey } from './locales.ts'
import css from './Studio.module.css'

export interface DigitalEmployeeStudioInjected {
  load: (sessionId: SessionId) => Promise<RemoteResult<DigitalEmployeeStudioView>>
  save: (
    sessionId: SessionId,
    request: SaveDigitalEmployeeProfileRequest,
  ) => Promise<RemoteResult<SaveDigitalEmployeeProfileResult>>
  revision: (
    sessionId: SessionId,
    profileId: string,
    revision: number,
  ) => Promise<RemoteResult<GetDigitalEmployeeProfileRevisionResult>>
  activate: (
    sessionId: SessionId,
    profileId: string,
    revision: number,
    expectedHeadRevision: number,
  ) => Promise<RemoteResult<MutateDigitalEmployeeProfileHeadResult>>
  rollback: (
    sessionId: SessionId,
    profileId: string,
    revision: number,
    expectedHeadRevision: number,
  ) => Promise<RemoteResult<MutateDigitalEmployeeProfileHeadResult>>
  archive: (
    sessionId: SessionId,
    profileId: string,
    expectedHeadRevision: number,
  ) => Promise<RemoteResult<MutateDigitalEmployeeProfileHeadResult>>
  restore: (
    sessionId: SessionId,
    profileId: string,
    expectedHeadRevision: number,
  ) => Promise<RemoteResult<MutateDigitalEmployeeProfileHeadResult>>
  spawn: (
    sessionId: SessionId,
    request: SpawnDigitalEmployeeRequest,
    signal?: AbortSignal,
  ) => Promise<RemoteResult<SpawnDigitalEmployeeResult>>
  run: (
    sessionId: SessionId,
    runId: DigitalEmployeeRunId,
    signal?: AbortSignal,
  ) => Promise<RemoteResult<GetDigitalEmployeeRunResult>>
  saveEvalSet: (
    sessionId: SessionId,
    request: SaveDigitalEmployeeEvalSetRequest,
  ) => Promise<RemoteResult<SaveDigitalEmployeeEvalSetResult>>
  setEvalGate: (
    sessionId: SessionId,
    request: SetDigitalEmployeeEvalGateRequest,
  ) => Promise<RemoteResult<MutateDigitalEmployeeProfileHeadResult>>
  startEvalRun: (
    sessionId: SessionId,
    request: StartDigitalEmployeeEvalRunRequest,
  ) => Promise<RemoteResult<StartDigitalEmployeeEvalRunResult>>
  cancelEvalRun: (
    sessionId: SessionId,
    request: CancelDigitalEmployeeEvalRunRequest,
  ) => Promise<RemoteResult<CancelDigitalEmployeeEvalRunResult>>
  evalRun: (
    sessionId: SessionId,
    request: GetDigitalEmployeeEvalRunRequest,
  ) => Promise<RemoteResult<GetDigitalEmployeeEvalRunResult>>
}

export type DigitalEmployeeStudioProps =
  PropsRuntime<'conversation.session.header.actions'>
  & DigitalEmployeeStudioInjected
  & PropsLocale<typeof NS>

type Translate = DigitalEmployeeStudioProps['t']
type BusyOperation =
  | 'save'
  | 'activate'
  | 'rollback'
  | 'archive'
  | 'restore'
  | 'spawn'
  | 'save-eval'
  | 'gate-eval'
  | 'start-eval'
  | 'cancel-eval'
type HeadOperation = 'activate' | 'rollback' | 'archive' | 'restore'
type SectionId = 'identity' | 'persona' | 'tools' | 'context' | 'memory' | 'hooks' | 'evaluations' | 'revisions'
type ResizeEdge = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

interface StudioWindowRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

interface StudioWindowInteractionBase {
  readonly pointerId: number
  readonly originX: number
  readonly originY: number
  readonly originRect: StudioWindowRect
}

type StudioWindowInteraction = StudioWindowInteractionBase & (
  | { readonly mode: 'move' }
  | { readonly mode: 'resize'; readonly edge: ResizeEdge }
)

interface ViewportSize {
  readonly width: number
  readonly height: number
}

interface LaunchIntent {
  readonly sessionId: SessionId
  readonly profileId: string
  readonly assignment: string | undefined
  readonly request: SpawnDigitalEmployeeRequest
}

const SECTION_ORDER: readonly SectionId[] = [
  'identity',
  'persona',
  'tools',
  'context',
  'memory',
  'hooks',
  'evaluations',
  'revisions',
]
const RESIZE_EDGES: readonly ResizeEdge[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
const WINDOW_MARGIN = 16
const WINDOW_MIN_WIDTH = 680
const WINDOW_MIN_HEIGHT = 480
const WINDOW_DEFAULT_WIDTH = 1040
const WINDOW_DEFAULT_HEIGHT = 760

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #5b8def, #9a6ff0)',
  'linear-gradient(135deg, #3fae8a, #5b8def)',
  'linear-gradient(135deg, #f0a35e, #e06c8a)',
  'linear-gradient(135deg, #6f7bf0, #45b8d6)',
] as const

let localIdentity = 0

function freshIdentity(prefix: string): string {
  localIdentity += 1
  return `${prefix}-${Date.now().toString(36)}-${localIdentity.toString(36)}`
}

function emptyProfile(): DigitalEmployeeProfileDraft {
  const id = freshIdentity('employee')
  return {
    id,
    employeeName: id,
    displayName: 'New Employee',
    description: 'A profile-bound Agent Team teammate.',
    continuationProvider: 'spawn',
    contextMode: 'fresh',
    persona: 'Act as a reliable specialist. State assumptions and report concrete outcomes.',
    mission: 'Complete delegated work while coordinating clearly with the Team Lead.',
    toolPolicy: { mode: 'inherit', names: [] },
    context: [],
    memory: [],
    hooks: [],
  }
}

function emptyEvalSet(profileId: DigitalEmployeeProfileDraft['id']): DigitalEmployeeEvalSetDraft {
  return {
    id: freshIdentity(`${profileId}-eval`),
    profileId,
    displayName: 'Candidate evaluation',
    toolAllowlist: [],
    resourceCeilings: { maxSteps: 8, maxOutputTokens: 2_048, maxElapsedMs: 60_000 },
    passPolicy: { kind: 'all' },
    cases: [{
      id: 'case-1',
      title: 'Candidate behavior',
      input: 'Complete the requested task.',
      fixtures: [],
      assertions: {
        acceptedTerminals: ['completed'],
        requiredTools: [],
        forbiddenTools: [],
        requiredOutputSubstrings: [],
        forbiddenOutputSubstrings: [],
      },
    }],
  }
}

function cloneEvalSet(evalSet: DigitalEmployeeEvalSetDraft): DigitalEmployeeEvalSetDraft {
  return {
    ...evalSet,
    toolAllowlist: [...evalSet.toolAllowlist],
    resourceCeilings: { ...evalSet.resourceCeilings },
    passPolicy: { ...evalSet.passPolicy },
    cases: evalSet.cases.map(testCase => ({
      ...testCase,
      fixtures: testCase.fixtures.map(fixture => ({ ...fixture })),
      assertions: {
        ...testCase.assertions,
        acceptedTerminals: [...testCase.assertions.acceptedTerminals],
        requiredTools: [...testCase.assertions.requiredTools],
        forbiddenTools: [...testCase.assertions.forbiddenTools],
        requiredOutputSubstrings: [...testCase.assertions.requiredOutputSubstrings],
        forbiddenOutputSubstrings: [...testCase.assertions.forbiddenOutputSubstrings],
      },
    })),
  }
}

function prettyCases(evalSet: DigitalEmployeeEvalSetDraft): string {
  return JSON.stringify(evalSet.cases, null, 2)
}

function cloneProfile(profile: DigitalEmployeeProfileDraft): DigitalEmployeeProfileDraft {
  return {
    id: profile.id,
    employeeName: profile.employeeName,
    displayName: profile.displayName,
    description: profile.description,
    continuationProvider: profile.continuationProvider,
    contextMode: profile.contextMode,
    persona: profile.persona,
    mission: profile.mission,
    toolPolicy: { mode: profile.toolPolicy.mode, names: [...profile.toolPolicy.names] },
    context: profile.context.map(block => ({ ...block })),
    memory: profile.memory.map(block => ({ ...block })),
    hooks: profile.hooks.map(hook => ({ ...hook })),
  }
}

function cloneRuntimeTarget(target: DigitalEmployeeRuntimeTarget): DigitalEmployeeRuntimeTarget {
  return target.kind === 'legacy-inherit-lead' ? { kind: target.kind } : { ...target }
}

function runtimeTargetId(target: DigitalEmployeeRuntimeTarget | null): string {
  if (target === null) return ''
  if (target.kind === 'legacy-inherit-lead') return target.kind
  if (target.kind === 'external-agent') return `external-agent/${encodeURIComponent(target.provider)}`
  return `dsh-model/${encodeURIComponent(target.provider)}/${encodeURIComponent(target.model)}`
}

function sameRuntimeTarget(left: DigitalEmployeeRuntimeTarget, right: DigitalEmployeeRuntimeTarget): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === 'legacy-inherit-lead' || right.kind === 'legacy-inherit-lead') return true
  if (left.kind === 'external-agent' || right.kind === 'external-agent') {
    return left.kind === 'external-agent' && right.kind === 'external-agent' && left.provider === right.provider
  }
  return left.provider === right.provider
    && left.model === right.model
    && left.reasoningEffort === right.reasoningEffort
}

function runtimeTargetLabel(target: DigitalEmployeeRuntimeTarget): string {
  if (target.kind === 'legacy-inherit-lead') return target.kind
  if (target.kind === 'external-agent') return `external-agent/${target.provider}`
  return `${target.provider}/${target.model}${target.reasoningEffort === undefined ? '' : ` · ${target.reasoningEffort}`}`
}

function targetFromBackend(backend: DigitalEmployeeRuntimeBackend): DigitalEmployeeRuntimeTarget {
  switch (backend.family) {
    case 'legacy-inherit-lead': return { kind: 'legacy-inherit-lead' }
    case 'external-agent': return { kind: 'external-agent', provider: backend.provider }
    case 'dsh-model': return { kind: 'dsh-model', provider: backend.provider, model: backend.model }
  }
}

function firstAvailableTarget(backends: readonly DigitalEmployeeRuntimeBackend[]): DigitalEmployeeRuntimeTarget | null {
  const backend = backends.find(candidate => candidate.availability === 'available'
    && candidate.family !== 'legacy-inherit-lead')
  return backend === undefined ? null : targetFromBackend(backend)
}

function draftBaseline(
  profile: DigitalEmployeeProfileDraft,
  runtimeTarget: DigitalEmployeeRuntimeTarget | null,
): string {
  return JSON.stringify({ profile, runtimeTarget })
}

function failureText(error: { readonly code: string; readonly message: string }): string {
  return `${error.message} (${error.code})`
}

function provisioningPhaseKey(phase: 'pending' | 'active' | 'failed'): UltraKey {
  return phase
}

function instanceAvailabilityKey(availability: DigitalEmployeeRuntimeAvailability): UltraKey {
  switch (availability) {
    case 'available': return 'runtimeAvailable'
    case 'unavailable': return 'runtimeUnavailable'
    case 'capability-mismatch': return 'runtimeCapabilityMismatch'
  }
}

function runtimePresenceKey(presence: DigitalEmployeeRuntimePresence): UltraKey {
  switch (presence) {
    case 'running': return 'runtimeRunning'
    case 'idle': return 'runtimeIdle'
    case 'inactive': return 'runtimeInactive'
  }
}

function runSourceLabel(source: DigitalEmployeeRunSource, t: Translate): string {
  return source === 'dsh-session' ? t('runSourceDsh') : t('runSourceExternal')
}

function runTerminalLabel(terminal: DigitalEmployeeRunTerminal, t: Translate): string {
  switch (terminal) {
    case 'completed': return t('runCompleted')
    case 'cancelled': return t('runCancelled')
    case 'blocked': return t('runBlocked')
    case 'failed': return t('runFailed')
    case 'max-tokens': return t('runMaxTokens')
    case 'interrupted': return t('runInterrupted')
    case 'unknown-terminal': return t('runUnknownTerminal')
  }
}

function runTimelineOutcomeLabel(
  outcome: NonNullable<DigitalEmployeeRunTimelineItem['outcome']>,
  t: Translate,
): string {
  switch (outcome) {
    case 'started': return t('runStarted')
    case 'asked': return t('runApprovalAsked')
    case 'waiting-approval': return t('runApprovalWaiting')
    case 'orphaned': return t('runApprovalOrphaned')
    case 'allowed-once': return t('runApprovalAllowedOnce')
    case 'rejected': return t('runApprovalRejected')
    case 'unavailable': return t('runApprovalUnavailable')
    default: return runTerminalLabel(outcome, t)
  }
}

function runOwnerLabel(run: DigitalEmployeeRunIndexRecord, t: Translate): string {
  return run.owner.kind === 'team-member'
    ? run.owner.memberName
    : `${t('runEvaluation')} ${run.owner.evalRunId} / ${run.owner.caseId}`
}

function canonicalSourceHref(run: DigitalEmployeeRunIndexRecord): string {
  if (run.canonicalSource.kind === 'dsh-session') {
    return `/sessions/${encodeURIComponent(run.canonicalSource.sessionId)}?turn=${run.canonicalSource.turn}`
  }
  const turn = run.canonicalSource.nativeTurnId ?? run.canonicalTurnId
  return `#run-source/${encodeURIComponent(run.canonicalSource.provider)}/${encodeURIComponent(turn)}`
}

function runtimeAvailabilityLabel(
  availability: DigitalEmployeeRuntimeBackend['availability'],
  t: Translate,
): string {
  switch (availability) {
    case 'available': return t('runtimeAvailable')
    case 'unavailable': return t('runtimeUnavailable')
    case 'unsupported': return t('runtimeUnsupported')
  }
}

function profileCapabilityLabel(capability: DigitalEmployeeProfileCapability, t: Translate): string {
  switch (capability) {
    case 'persona': return t('capabilityPersona')
    case 'mission': return t('capabilityMission')
    case 'context': return t('capabilityContext')
    case 'memory': return t('capabilityMemory')
    case 'tool-policy': return t('capabilityToolPolicy')
    case 'hooks': return t('capabilityHooks')
  }
}

function runtimeCapabilityLabel(capability: DigitalEmployeeRuntimeCapability, t: Translate): string {
  switch (capability) {
    case 'exact-call-approval': return t('capabilityExactCallApproval')
    case 'sandbox': return t('capabilitySandbox')
    case 'evaluation': return t('capabilityEvaluation')
    case 'evidence': return t('capabilityEvidence')
    case 'usage': return t('capabilityUsage')
  }
}

function runtimeOptionLabel(backend: DigitalEmployeeRuntimeBackend, t: Translate): string {
  const name = backend.family === 'dsh-model'
    ? `${backend.providerDisplayName} · ${backend.displayName}`
    : backend.displayName
  return backend.availability === 'available'
    ? name
    : `${name} — ${runtimeAvailabilityLabel(backend.availability, t)}`
}

function hookPointLabel(point: ProfileHookPoint, t: Translate): string {
  switch (point) {
    case 'session-start': return t('sessionStart')
    case 'before-step': return t('beforeStep')
    case 'before-tool': return t('beforeTool')
    case 'after-tool': return t('afterTool')
  }
}

function isToolPoint(point: ProfileHookPoint): boolean {
  return point === 'before-tool' || point === 'after-tool'
}

function pointAdjusted(hook: ProfileHook, point: ProfileHookPoint): ProfileHook {
  if (!isToolPoint(point)) {
    const { matcher: _matcher, ...rest } = hook
    return { ...rest, point, effect: 'context' }
  }
  if (point === 'before-tool') {
    return {
      ...hook,
      point,
      effect: hook.point === 'before-tool' && (hook.effect === 'deny' || hook.effect === 'ask')
        ? hook.effect
        : 'deny',
      matcher: hook.matcher?.trim() || '*',
    }
  }
  return {
    ...hook,
    point,
    effect: 'context',
    matcher: hook.matcher?.trim() || '*',
  }
}

function sectionNavKey(section: SectionId): UltraKey {
  switch (section) {
    case 'identity': return 'navIdentity'
    case 'persona': return 'navPersona'
    case 'tools': return 'navTools'
    case 'context': return 'navContext'
    case 'memory': return 'navMemory'
    case 'hooks': return 'navHooks'
    case 'evaluations': return 'navEvaluations'
    case 'revisions': return 'navRevisions'
  }
}

function sectionTitleKey(section: SectionId): UltraKey {
  switch (section) {
    case 'identity': return 'basic'
    case 'persona': return 'personaMission'
    case 'tools': return 'tools'
    case 'context': return 'context'
    case 'memory': return 'memory'
    case 'hooks': return 'hooks'
    case 'evaluations': return 'evaluations'
    case 'revisions': return 'revisions'
  }
}

function sectionDescKey(section: SectionId): UltraKey {
  switch (section) {
    case 'identity': return 'identityDesc'
    case 'persona': return 'personaDesc'
    case 'tools': return 'toolsDesc'
    case 'context': return 'contextDesc'
    case 'memory': return 'memoryDesc'
    case 'hooks': return 'hooksDesc'
    case 'evaluations': return 'evaluationsDesc'
    case 'revisions': return 'revisionsDesc'
  }
}

function SectionIcon({ section }: { section: SectionId }) {
  switch (section) {
    case 'identity': return <IconUserOutline16 size={13} />
    case 'persona': return <IconThinkOutline16 size={13} />
    case 'tools': return <IconSkillOutline16 size={13} />
    case 'context': return <IconContextInjectionOutline16 size={13} />
    case 'memory': return <IconGoalOutline16 size={13} />
    case 'hooks': return <IconSettingsOutline16 size={13} />
    case 'evaluations': return <IconGoalOutline16 size={13} />
    case 'revisions': return <IconRefreshOutline14 />
  }
}

function sectionSummary(draft: DigitalEmployeeProfileDraft, section: SectionId, t: Translate): string | null {
  switch (section) {
    case 'tools': return t(draft.toolPolicy.mode)
    case 'context': return draft.context.length > 0 ? String(draft.context.length) : null
    case 'memory': return draft.memory.length > 0 ? String(draft.memory.length) : null
    case 'hooks': {
      if (draft.hooks.length === 0) return null
      const enabled = draft.hooks.filter(hook => hook.enabled).length
      return `${enabled} / ${draft.hooks.length}`
    }
    case 'revisions': return null
    case 'evaluations': return null
    default: return null
  }
}

function evalRunStatusLabel(status: DigitalEmployeeEvalRunStatus, t: Translate): string {
  switch (status) {
    case 'running': return t('evalStatusRunning')
    case 'passed': return t('evalStatusPassed')
    case 'failed': return t('evalStatusFailed')
    case 'cancelled': return t('evalStatusCancelled')
    case 'interrupted': return t('evalStatusInterrupted')
    case 'environment-unavailable': return t('evalStatusUnavailable')
  }
}

function evalCaseStatusLabel(status: DigitalEmployeeEvalCaseResult['status'], t: Translate): string {
  return status === 'pending' ? t('evalStatusPending') : evalRunStatusLabel(status, t)
}

function promotionGateLabel(
  status: DigitalEmployeeProfileCatalogEntry['promotionGate']['status'],
  t: Translate,
): string {
  switch (status) {
    case 'not-required': return t('evalGateNotRequired')
    case 'pending': return t('evalGatePending')
    case 'passed': return t('evalGatePassed')
    case 'invalidated': return t('evalGateInvalidated')
  }
}

function avatarGradient(id: string): string {
  let hash = 0
  for (const char of id) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length] ?? AVATAR_GRADIENTS[0]
}

function displayInitial(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? '?'
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function currentViewport(): ViewportSize {
  if (typeof window === 'undefined') {
    return {
      width: WINDOW_DEFAULT_WIDTH + WINDOW_MARGIN * 2,
      height: WINDOW_DEFAULT_HEIGHT + WINDOW_MARGIN * 2,
    }
  }
  return {
    width: Math.max(1, window.innerWidth),
    height: Math.max(1, window.innerHeight),
  }
}

function windowLimits(viewport: ViewportSize) {
  const maxWidth = Math.max(1, viewport.width - WINDOW_MARGIN * 2)
  const maxHeight = Math.max(1, viewport.height - WINDOW_MARGIN * 2)
  return {
    minWidth: Math.min(WINDOW_MIN_WIDTH, maxWidth),
    minHeight: Math.min(WINDOW_MIN_HEIGHT, maxHeight),
    maxWidth,
    maxHeight,
  }
}

function fitWindowRect(rect: StudioWindowRect, viewport = currentViewport()): StudioWindowRect {
  const limits = windowLimits(viewport)
  const width = clamp(rect.width, limits.minWidth, limits.maxWidth)
  const height = clamp(rect.height, limits.minHeight, limits.maxHeight)
  const maxLeft = Math.max(WINDOW_MARGIN, viewport.width - WINDOW_MARGIN - width)
  const maxTop = Math.max(WINDOW_MARGIN, viewport.height - WINDOW_MARGIN - height)
  return {
    left: clamp(rect.left, WINDOW_MARGIN, maxLeft),
    top: clamp(rect.top, WINDOW_MARGIN, maxTop),
    width,
    height,
  }
}

function initialWindowRect(viewport = currentViewport()): StudioWindowRect {
  const limits = windowLimits(viewport)
  const width = Math.min(WINDOW_DEFAULT_WIDTH, limits.maxWidth)
  const height = Math.min(WINDOW_DEFAULT_HEIGHT, limits.maxHeight)
  return fitWindowRect({
    left: (viewport.width - width) / 2,
    top: (viewport.height - height) / 2,
    width,
    height,
  }, viewport)
}

function movedWindowRect(
  origin: StudioWindowRect,
  deltaX: number,
  deltaY: number,
  viewport: ViewportSize,
): StudioWindowRect {
  return fitWindowRect({
    ...origin,
    left: origin.left + deltaX,
    top: origin.top + deltaY,
  }, viewport)
}

function resizedWindowRect(
  origin: StudioWindowRect,
  edge: ResizeEdge,
  deltaX: number,
  deltaY: number,
  viewport: ViewportSize,
): StudioWindowRect {
  const fitted = fitWindowRect(origin, viewport)
  const limits = windowLimits(viewport)
  let { left, top, width, height } = fitted

  if (edge.includes('e')) {
    width = clamp(width + deltaX, limits.minWidth, viewport.width - WINDOW_MARGIN - left)
  }
  if (edge.includes('s')) {
    height = clamp(height + deltaY, limits.minHeight, viewport.height - WINDOW_MARGIN - top)
  }
  if (edge.includes('w')) {
    const right = left + width
    width = clamp(width - deltaX, limits.minWidth, right - WINDOW_MARGIN)
    left = right - width
  }
  if (edge.includes('n')) {
    const bottom = top + height
    height = clamp(height - deltaY, limits.minHeight, bottom - WINDOW_MARGIN)
    top = bottom - height
  }

  return fitWindowRect({ left, top, width, height }, viewport)
}

/** Conversation-header action and complete profile editor. */
export function DigitalEmployeeStudio({
  sessionId,
  load,
  save,
  revision,
  activate,
  rollback,
  archive,
  restore,
  spawn,
  run,
  saveEvalSet,
  setEvalGate,
  startEvalRun,
  cancelEvalRun,
  evalRun,
  t,
}: DigitalEmployeeStudioProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<DigitalEmployeeStudioView | null>(null)
  const [draft, setDraft] = useState<DigitalEmployeeProfileDraft | null>(null)
  const [runtimeTarget, setRuntimeTarget] = useState<DigitalEmployeeRuntimeTarget | null>(null)
  const [baseline, setBaseline] = useState<string | null>(null)
  const [section, setSection] = useState<SectionId>('identity')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expectedHeadRevision, setExpectedHeadRevision] = useState<number | null>(null)
  const [revisionDetail, setRevisionDetail] = useState<DigitalEmployeeProfileRevisionDetail | null>(null)
  const [revisionLoading, setRevisionLoading] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<DigitalEmployeeRunId | null>(null)
  const [runDetail, setRunDetail] = useState<DigitalEmployeeRunDetail | null>(null)
  const [runLoading, setRunLoading] = useState(false)
  const [runSourceFilter, setRunSourceFilter] = useState<'all' | DigitalEmployeeRunSource>('all')
  const [runTerminalFilter, setRunTerminalFilter] = useState<'all' | DigitalEmployeeRunTerminal>('all')
  const [selectedEvalSetId, setSelectedEvalSetId] = useState<string | null>(null)
  const [evalDraft, setEvalDraft] = useState<DigitalEmployeeEvalSetDraft | null>(null)
  const [evalCasesJson, setEvalCasesJson] = useState('[]')
  const [evalExpectedHeadRevision, setEvalExpectedHeadRevision] = useState<number | null>(null)
  const [selectedEvalRunId, setSelectedEvalRunId] = useState<DigitalEmployeeEvalRunId | null>(null)
  const [evalRunDetail, setEvalRunDetail] = useState<DigitalEmployeeEvalRunDetail | null>(null)
  const [evalRunLoading, setEvalRunLoading] = useState(false)
  const [compareEvalRunId, setCompareEvalRunId] = useState<DigitalEmployeeEvalRunId | null>(null)
  const [assignment, setAssignment] = useState('')
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<BusyOperation | null>(null)
  const [windowRect, setWindowRect] = useState<StudioWindowRect | null>(null)
  const [windowInteraction, setWindowInteraction] = useState<'move' | ResizeEdge | null>(null)
  const sessionRef = useRef(sessionId)
  const selectedRef = useRef(selectedId)
  const refreshGeneration = useRef(0)
  const revisionGeneration = useRef(0)
  const runGeneration = useRef(0)
  const evalRunGeneration = useRef(0)
  const runAbortRef = useRef<AbortController | null>(null)
  const busyRef = useRef<BusyOperation | null>(null)
  const launchAbortRef = useRef<AbortController | null>(null)
  const launchIntentRef = useRef<LaunchIntent | null>(null)
  const windowRectRef = useRef<StudioWindowRect | null>(windowRect)
  const windowInteractionRef = useRef<StudioWindowInteraction | null>(null)
  sessionRef.current = sessionId
  selectedRef.current = selectedId
  windowRectRef.current = windowRect

  const commitWindowRect = useCallback((next: StudioWindowRect): void => {
    windowRectRef.current = next
    setWindowRect(next)
  }, [])

  const finishWindowInteraction = useCallback((): void => {
    windowInteractionRef.current = null
    setWindowInteraction(null)
  }, [])

  const closeWindow = useCallback((): void => {
    finishWindowInteraction()
    setOpen(false)
  }, [finishWindowInteraction])

  useEffect(() => {
    refreshGeneration.current += 1
    busyRef.current = null
    launchIntentRef.current = null
    windowInteractionRef.current = null
    setOpen(false)
    setLoading(false)
    setView(null)
    setDraft(null)
    setRuntimeTarget(null)
    setBaseline(null)
    setSection('identity')
    setSelectedId(null)
    setExpectedHeadRevision(null)
    setRevisionDetail(null)
    setRevisionLoading(false)
    setSelectedRunId(null)
    setRunDetail(null)
    setRunLoading(false)
    setRunSourceFilter('all')
    setRunTerminalFilter('all')
    setSelectedEvalSetId(null)
    setEvalDraft(null)
    setEvalCasesJson('[]')
    setEvalExpectedHeadRevision(null)
    setSelectedEvalRunId(null)
    setEvalRunDetail(null)
    setEvalRunLoading(false)
    setCompareEvalRunId(null)
    setAssignment('')
    setCollapsed(new Set())
    setError(null)
    setNotice(null)
    setBusy(null)
    setWindowInteraction(null)
    return () => {
      const controller = launchAbortRef.current
      launchAbortRef.current = null
      controller?.abort(new Error('Digital Employee Studio session changed'))
      const runController = runAbortRef.current
      runAbortRef.current = null
      runController?.abort(new Error('Digital Employee Studio session changed'))
    }
  }, [sessionId])

  useEffect(() => {
    if (!open) return

    const handlePointerMove = (event: PointerEvent): void => {
      const interaction = windowInteractionRef.current
      if (interaction === null || interaction.pointerId !== event.pointerId) return
      event.preventDefault()
      const deltaX = event.clientX - interaction.originX
      const deltaY = event.clientY - interaction.originY
      const viewport = currentViewport()
      const next = interaction.mode === 'move'
        ? movedWindowRect(interaction.originRect, deltaX, deltaY, viewport)
        : resizedWindowRect(interaction.originRect, interaction.edge, deltaX, deltaY, viewport)
      commitWindowRect(next)
    }

    const handlePointerEnd = (event: PointerEvent): void => {
      const interaction = windowInteractionRef.current
      if (interaction !== null && interaction.pointerId === event.pointerId) finishWindowInteraction()
    }

    const handleViewportResize = (): void => {
      const current = windowRectRef.current
      if (current !== null) commitWindowRect(fitWindowRect(current))
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerEnd)
    window.addEventListener('pointercancel', handlePointerEnd)
    window.addEventListener('resize', handleViewportResize)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerEnd)
      window.removeEventListener('pointercancel', handlePointerEnd)
      window.removeEventListener('resize', handleViewportResize)
    }
  }, [commitWindowRect, finishWindowInteraction, open])

  const beginWindowInteraction = (
    event: ReactPointerEvent<HTMLElement>,
    mode: 'move' | 'resize',
    edge?: ResizeEdge,
  ): void => {
    if (event.button !== 0) return
    const originRect = windowRectRef.current
    if (originRect === null) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const origin = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      originRect,
    }
    if (mode === 'move') {
      windowInteractionRef.current = { ...origin, mode }
    } else {
      if (edge === undefined) return
      windowInteractionRef.current = { ...origin, mode, edge }
    }
    setWindowInteraction(mode === 'move' ? 'move' : edge ?? null)
  }

  const select = useCallback((entry: DigitalEmployeeProfileCatalogEntry, resetFeedback = true): void => {
    const profileChanged = selectedRef.current !== entry.head.profileId
    const next = cloneProfile(entry.latest.profile)
    const nextTarget = cloneRuntimeTarget(entry.latest.runtimeTarget)
    revisionGeneration.current += 1
    setSelectedId(entry.head.profileId)
    setExpectedHeadRevision(entry.head.headRevision)
    setRevisionDetail(null)
    setRevisionLoading(false)
    runGeneration.current += 1
    runAbortRef.current?.abort(new Error('Digital Employee Studio selected a Profile'))
    runAbortRef.current = null
    setSelectedRunId(null)
    setRunDetail(null)
    setRunLoading(false)
    setDraft(next)
    setRuntimeTarget(nextTarget)
    setBaseline(draftBaseline(next, nextTarget))
    setAssignment('')
    if (profileChanged) {
      evalRunGeneration.current += 1
      setSelectedEvalSetId(null)
      setEvalDraft(null)
      setEvalCasesJson('[]')
      setEvalExpectedHeadRevision(null)
      setSelectedEvalRunId(null)
      setEvalRunDetail(null)
      setEvalRunLoading(false)
      setCompareEvalRunId(null)
    }
    if (resetFeedback) {
      setError(null)
      setNotice(null)
    }
  }, [])

  const selectEvalSet = useCallback((entry: DigitalEmployeeEvalSetCatalogEntry): void => {
    const next = cloneEvalSet(entry.latest.evalSet)
    setSelectedEvalSetId(entry.head.evalSetId)
    setEvalDraft(next)
    setEvalCasesJson(prettyCases(next))
    setEvalExpectedHeadRevision(entry.head.headRevision)
    setError(null)
    setNotice(null)
  }, [])

  const refresh = useCallback(async (preferredId?: string): Promise<boolean> => {
    const requestedSession = sessionId
    const generation = ++refreshGeneration.current
    setLoading(true)
    try {
      const result = await load(requestedSession)
      if (sessionRef.current !== requestedSession || refreshGeneration.current !== generation) return false
      if (!result.ok) {
        setError(failureText(result.error))
        return false
      }
      setView(result.value)
      const targetId = preferredId ?? selectedRef.current
      const selected = result.value.profiles.find(profile => profile.head.profileId === targetId)
      if (selected !== undefined) {
        select(selected)
      } else {
        setDraft(null)
        setRuntimeTarget(null)
        setBaseline(null)
        setSelectedId(null)
        setExpectedHeadRevision(null)
        setRevisionDetail(null)
        setRevisionLoading(false)
        evalRunGeneration.current += 1
        setSelectedEvalSetId(null)
        setEvalDraft(null)
        setEvalCasesJson('[]')
        setEvalExpectedHeadRevision(null)
        setSelectedEvalRunId(null)
        setEvalRunDetail(null)
        setEvalRunLoading(false)
        setCompareEvalRunId(null)
      }
      setError(null)
      return true
    } catch (reason: unknown) {
      if (sessionRef.current === requestedSession && refreshGeneration.current === generation) {
        setError(`${t('transportFailure')} ${String(reason)}`)
      }
      return false
    } finally {
      if (sessionRef.current === requestedSession && refreshGeneration.current === generation) setLoading(false)
    }
  }, [load, select, sessionId, t])

  const begin = (operation: BusyOperation): boolean => {
    if (busyRef.current !== null) return false
    busyRef.current = operation
    refreshGeneration.current += 1
    setLoading(false)
    setBusy(operation)
    setError(null)
    setNotice(null)
    return true
  }

  const finish = (requestedSession: SessionId): void => {
    if (sessionRef.current !== requestedSession) return
    busyRef.current = null
    setBusy(null)
  }

  const saveDraft = async (): Promise<void> => {
    if (draft === null || runtimeTarget === null) return
    if (runtimeTarget.kind === 'legacy-inherit-lead') {
      setError(t('legacyTargetCannotSave'))
      return
    }
    if (!begin('save')) return
    const requestedSession = sessionId
    try {
      const result = await save(requestedSession, {
        expectedHeadRevision,
        profile: draft,
        runtimeTarget: runtimeTarget as SelectableDigitalEmployeeRuntimeTarget,
      })
      if (sessionRef.current !== requestedSession) return
      if (!result.ok) {
        setError(failureText(result.error))
      } else if (!result.value.ok) {
        const failure = failureText(result.value.error)
        setError(failure)
        if (result.value.error.currentHead !== undefined) {
          await refresh(result.value.error.currentHead.profileId)
          if (sessionRef.current === requestedSession) setError(failure)
        }
      } else {
        const id = result.value.value.head.profileId
        if (await refresh(id) && sessionRef.current === requestedSession) setNotice(t('saved'))
      }
    } catch (reason: unknown) {
      if (sessionRef.current === requestedSession) setError(`${t('transportFailure')} ${String(reason)}`)
    } finally {
      finish(requestedSession)
    }
  }

  const inspectRevision = useCallback(async (profileId: string, selectedRevision: number): Promise<void> => {
    const requestedSession = sessionId
    const generation = ++revisionGeneration.current
    setRevisionLoading(true)
    try {
      const result = await revision(requestedSession, profileId, selectedRevision)
      if (sessionRef.current !== requestedSession || revisionGeneration.current !== generation) return
      if (!result.ok) {
        setError(failureText(result.error))
      } else if (!result.value.ok) {
        setError(failureText(result.value.error))
      } else {
        setRevisionDetail(result.value.value)
        setError(null)
      }
    } catch (reason: unknown) {
      if (sessionRef.current === requestedSession) setError(`${t('transportFailure')} ${String(reason)}`)
    } finally {
      if (sessionRef.current === requestedSession && revisionGeneration.current === generation) {
        setRevisionLoading(false)
      }
    }
  }, [revision, sessionId, t])

  const inspectRun = useCallback(async (selected: DigitalEmployeeRunIndexRecord): Promise<void> => {
    const requestedSession = sessionId
    const generation = ++runGeneration.current
    runAbortRef.current?.abort(new Error('Digital Employee Studio selected another Run'))
    const controller = new AbortController()
    runAbortRef.current = controller
    setSelectedRunId(selected.runId)
    setRunDetail(null)
    setRunLoading(true)
    setError(null)
    try {
      const result = await run(requestedSession, selected.runId, controller.signal)
      if (sessionRef.current !== requestedSession || runGeneration.current !== generation) return
      if (!result.ok) setError(failureText(result.error))
      else if (!result.value.ok) setError(failureText(result.value.error))
      else setRunDetail(result.value.value)
    } catch (reason: unknown) {
      if (!controller.signal.aborted
        && sessionRef.current === requestedSession
        && runGeneration.current === generation) {
        setError(`${t('transportFailure')} ${String(reason)}`)
      }
    } finally {
      if (runAbortRef.current === controller) runAbortRef.current = null
      if (sessionRef.current === requestedSession && runGeneration.current === generation) setRunLoading(false)
    }
  }, [run, sessionId, t])

  const inspectEvalRun = useCallback(async (selected: DigitalEmployeeEvalRunSummary): Promise<void> => {
    const requestedSession = sessionId
    const generation = ++evalRunGeneration.current
    setSelectedEvalRunId(selected.evalRunId)
    setEvalRunDetail(null)
    setEvalRunLoading(true)
    setError(null)
    try {
      const result = await evalRun(requestedSession, { evalRunId: selected.evalRunId })
      if (sessionRef.current !== requestedSession || evalRunGeneration.current !== generation) return
      if (!result.ok) setError(failureText(result.error))
      else if (!result.value.ok) setError(failureText(result.value.error))
      else setEvalRunDetail(result.value.value)
    } catch (reason: unknown) {
      if (sessionRef.current === requestedSession && evalRunGeneration.current === generation) {
        setError(`${t('transportFailure')} ${String(reason)}`)
      }
    } finally {
      if (sessionRef.current === requestedSession && evalRunGeneration.current === generation) {
        setEvalRunLoading(false)
      }
    }
  }, [evalRun, sessionId, t])

  const saveEvaluationSet = async (): Promise<void> => {
    if (evalDraft === null || !begin('save-eval')) return
    const requestedSession = sessionId
    try {
      let cases: DigitalEmployeeEvalSetDraft['cases']
      try {
        const parsed = JSON.parse(evalCasesJson) as unknown
        if (!Array.isArray(parsed)) throw new Error(t('evalCasesMustBeArray'))
        cases = parsed as DigitalEmployeeEvalSetDraft['cases']
      } catch (reason: unknown) {
        setError(`${t('evalInvalidCasesJson')} ${String(reason)}`)
        return
      }
      const request: SaveDigitalEmployeeEvalSetRequest = {
        expectedHeadRevision: evalExpectedHeadRevision,
        evalSet: { ...evalDraft, cases },
      }
      const result = await saveEvalSet(requestedSession, request)
      if (sessionRef.current !== requestedSession) return
      if (!result.ok) setError(failureText(result.error))
      else if (!result.value.ok) {
        const failure = failureText(result.value.error)
        setError(failure)
        if (result.value.error.code === 'eval-conflict') await refresh(evalDraft.profileId)
        if (sessionRef.current === requestedSession) setError(failure)
      } else {
        const next = cloneEvalSet(result.value.value.revision.evalSet)
        setSelectedEvalSetId(result.value.value.head.evalSetId)
        setEvalDraft(next)
        setEvalCasesJson(prettyCases(next))
        setEvalExpectedHeadRevision(result.value.value.head.headRevision)
        if (await refresh(next.profileId) && sessionRef.current === requestedSession) {
          setNotice(t(result.value.value.unchanged ? 'evalSetUnchanged' : 'evalSetSaved'))
        }
      }
    } catch (reason: unknown) {
      if (sessionRef.current === requestedSession) setError(`${t('transportFailure')} ${String(reason)}`)
    } finally {
      finish(requestedSession)
    }
  }

  const changeEvalGate = async (required: boolean): Promise<void> => {
    if (selectedEntry === undefined || !begin('gate-eval')) return
    if (required && evalDraft === null) {
      finish(sessionId)
      return
    }
    const requestedSession = sessionId
    try {
      const request: SetDigitalEmployeeEvalGateRequest = {
        profileId: selectedEntry.head.profileId,
        expectedHeadRevision: selectedEntry.head.headRevision,
        ...(required
          ? {
              requiredEvalSet: {
                evalSetId: evalDraft!.id,
                revision: view?.evalSets.find(candidate => candidate.head.evalSetId === evalDraft!.id)
                  ?.head.latestRevision ?? 1,
              },
            }
          : {}),
      }
      const result = await setEvalGate(requestedSession, request)
      if (sessionRef.current !== requestedSession) return
      if (!result.ok) setError(failureText(result.error))
      else if (!result.value.ok) setError(failureText(result.value.error))
      else if (await refresh(selectedEntry.head.profileId)) {
        setNotice(t(required ? 'evalGateRequired' : 'evalGateCleared'))
      }
    } catch (reason: unknown) {
      if (sessionRef.current === requestedSession) setError(`${t('transportFailure')} ${String(reason)}`)
    } finally {
      finish(requestedSession)
    }
  }

  const startEvaluation = async (): Promise<void> => {
    if (selectedEntry === undefined || evalDraft === null || !begin('start-eval')) return
    const evalSetEntry = view?.evalSets.find(candidate => candidate.head.evalSetId === evalDraft.id)
    if (evalSetEntry === undefined) {
      setError(t('evalSaveBeforeRun'))
      finish(sessionId)
      return
    }
    const requestedSession = sessionId
    try {
      const request: StartDigitalEmployeeEvalRunRequest = {
        evalRunId: globalThis.crypto.randomUUID() as DigitalEmployeeEvalRunId,
        profileId: selectedEntry.head.profileId,
        profileRevision: selectedEntry.head.latestRevision,
        evalSetId: evalSetEntry.head.evalSetId,
        evalSetRevision: evalSetEntry.head.latestRevision,
      }
      const result = await startEvalRun(requestedSession, request)
      if (sessionRef.current !== requestedSession) return
      if (!result.ok) setError(failureText(result.error))
      else if (!result.value.ok) setError(failureText(result.value.error))
      else {
        setSelectedEvalRunId(result.value.value.run.evalRunId)
        setEvalRunDetail(null)
        setCompareEvalRunId(null)
        await refresh(selectedEntry.head.profileId)
        if (sessionRef.current === requestedSession) setNotice(t('evalRunStarted'))
      }
    } catch (reason: unknown) {
      if (sessionRef.current === requestedSession) setError(`${t('transportFailure')} ${String(reason)}`)
    } finally {
      finish(requestedSession)
    }
  }

  const cancelEvaluation = async (): Promise<void> => {
    if (selectedEvalRunId === null || !begin('cancel-eval')) return
    const requestedSession = sessionId
    try {
      const result = await cancelEvalRun(requestedSession, { evalRunId: selectedEvalRunId })
      if (sessionRef.current !== requestedSession) return
      if (!result.ok) setError(failureText(result.error))
      else if (!result.value.ok) setError(failureText(result.value.error))
      else {
        const cancelledRun = result.value.value.run
        setEvalRunDetail(current => current === null
          ? null
          : { ...current, run: { ...current.run, ...cancelledRun, cases: current.run.cases } })
        await refresh(selectedEntry?.head.profileId)
        if (sessionRef.current === requestedSession) setNotice(t('evalRunCancelled'))
      }
    } catch (reason: unknown) {
      if (sessionRef.current === requestedSession) setError(`${t('transportFailure')} ${String(reason)}`)
    } finally {
      finish(requestedSession)
    }
  }

  const mutateHead = async (
    operation: HeadOperation,
    profileId: string,
    invoke: () => Promise<RemoteResult<MutateDigitalEmployeeProfileHeadResult>>,
    successKey: UltraKey,
  ): Promise<void> => {
    if (!begin(operation)) return
    const requestedSession = sessionId
    try {
      const result = await invoke()
      if (sessionRef.current !== requestedSession) return
      if (!result.ok) {
        setError(failureText(result.error))
      } else if (!result.value.ok) {
        const failure = failureText(result.value.error)
        setError(failure)
        if (result.value.error.currentHead !== undefined) {
          await refresh(result.value.error.currentHead.profileId)
          if (sessionRef.current === requestedSession) setError(failure)
        }
      } else if (await refresh(profileId) && sessionRef.current === requestedSession) {
        setNotice(t(successKey))
      }
    } catch (reason: unknown) {
      if (sessionRef.current === requestedSession) setError(`${t('transportFailure')} ${String(reason)}`)
    } finally {
      finish(requestedSession)
    }
  }

  const launchDraft = async (): Promise<void> => {
    if (draft === null || expectedHeadRevision === null || !begin('spawn')) return
    const requestedSession = sessionId
    const requestedProfileId = draft.id
    const requestedAssignment = assignment.trim() || undefined
    const retained = launchIntentRef.current
    const intent = retained?.sessionId === requestedSession
      && retained.profileId === requestedProfileId
      && retained.assignment === requestedAssignment
      ? retained
      : {
        sessionId: requestedSession,
        profileId: requestedProfileId,
        assignment: requestedAssignment,
        request: {
          launchRequestId: globalThis.crypto.randomUUID() as LaunchRequestId,
          profileId: requestedProfileId,
          ...(requestedAssignment === undefined ? {} : { assignment: requestedAssignment }),
        },
      }
    launchIntentRef.current = intent
    const controller = new AbortController()
    launchAbortRef.current = controller
    try {
      const result = await spawn(requestedSession, intent.request, controller.signal)
      if (sessionRef.current !== requestedSession) return
      if (!result.ok) {
        setError(failureText(result.error))
      } else if (!result.value.ok) {
        if (launchIntentRef.current === intent) launchIntentRef.current = null
        setError(failureText(result.value.error))
      } else {
        const pending = result.value.value.provisioningPhase === 'pending'
        if (!pending && launchIntentRef.current === intent) launchIntentRef.current = null
        if (!pending) setAssignment('')
        if (await refresh(requestedProfileId) && sessionRef.current === requestedSession) {
          if (pending) setAssignment(assignment)
          setNotice(t('launched'))
        }
      }
    } catch (reason: unknown) {
      if (sessionRef.current === requestedSession) setError(`${t('transportFailure')} ${String(reason)}`)
    } finally {
      if (launchAbortRef.current === controller) launchAbortRef.current = null
      finish(requestedSession)
    }
  }

  const update = <K extends keyof DigitalEmployeeProfileDraft>(
    key: K,
    value: DigitalEmployeeProfileDraft[K],
  ): void => {
    setDraft(current => current === null ? null : { ...current, [key]: value })
  }

  const updateBlock = (
    collection: 'context' | 'memory',
    id: string,
    patch: Partial<ProfileTextBlock>,
  ): void => {
    setDraft(current => current === null ? null : {
      ...current,
      [collection]: current[collection].map(block => block.id === id ? { ...block, ...patch } : block),
    })
  }

  const removeBlock = (collection: 'context' | 'memory', id: string): void => {
    setDraft(current => current === null ? null : {
      ...current,
      [collection]: current[collection].filter(block => block.id !== id),
    })
  }

  const updateHook = (id: string, patch: Partial<ProfileHook>): void => {
    setDraft(current => current === null ? null : {
      ...current,
      hooks: current.hooks.map(hook => hook.id === id ? { ...hook, ...patch } : hook),
    })
  }

  const toggleCollapsed = (id: string): void => {
    setCollapsed(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const profiles = view?.profiles ?? []
  const instances = view?.instances ?? []
  const runs = view?.runs ?? []
  const evalSets = view?.evalSets ?? []
  const evalRuns = view?.evalRuns ?? []
  const filteredRuns = runs.filter(candidate =>
    (runSourceFilter === 'all' || candidate.source === runSourceFilter)
    && (runTerminalFilter === 'all' || candidate.terminal === runTerminalFilter))
  const selectedRun = runs.find(candidate => candidate.runId === selectedRunId)
  const runtimeBackends = view?.runtimeCatalog.backends ?? []
  const selectedEntry = profiles.find(profile => profile.head.profileId === selectedId)
  const profileEvalSets = selectedEntry === undefined
    ? []
    : evalSets.filter(candidate => candidate.head.profileId === selectedEntry.head.profileId)
  const selectedEvalSetEntry = profileEvalSets.find(candidate => candidate.head.evalSetId === selectedEvalSetId)
  const profileEvalRuns = selectedEntry === undefined
    ? []
    : evalRuns.filter(candidate => candidate.profileId === selectedEntry.head.profileId)
  const selectedEvalRun = profileEvalRuns.find(candidate => candidate.evalRunId === selectedEvalRunId)
  const comparedEvalRun = profileEvalRuns.find(candidate => candidate.evalRunId === compareEvalRunId)
  const selectedRuntimeBackend = runtimeBackends.find(backend => backend.routingId === runtimeTargetId(runtimeTarget))
  const retainsLatestRuntimeTarget = runtimeTarget !== null
    && selectedEntry !== undefined
    && sameRuntimeTarget(runtimeTarget, selectedEntry.latest.runtimeTarget)
  const dirty = draft !== null
    && baseline !== null
    && draftBaseline(draft, runtimeTarget) !== baseline
  const canLaunch = selectedEntry !== undefined
    && selectedEntry.head.activeRevision !== undefined
    && selectedEntry.head.archivedAt === undefined
  const canSave = runtimeTarget !== null
    && runtimeTarget.kind !== 'legacy-inherit-lead'
    && (selectedRuntimeBackend?.availability === 'available'
      || (selectedRuntimeBackend?.availability === 'unavailable' && retainsLatestRuntimeTarget))
  const activationBlockedByGate = selectedEntry?.promotionGate.status === 'pending'
    || selectedEntry?.promotionGate.status === 'invalidated'

  return (
    <div className={css.root} data-digital-employee-studio>
      <button
        type="button"
        className={css.trigger}
        aria-expanded={open}
        onClick={() => {
          if (open) {
            closeWindow()
            return
          }
          commitWindowRect(fitWindowRect(windowRectRef.current ?? initialWindowRect()))
          setOpen(true)
          void refresh()
        }}
      >
        <IconUserOutline16 size={14} />
        <span>{t('trigger')}</span>
        {instances.length > 0 && <span className={css.count}>{instances.length}</span>}
      </button>

      {open && windowRect !== null && (
        <div
          className={css.panel}
          role="dialog"
          aria-label={t('title')}
          data-window-interaction={windowInteraction ?? undefined}
          style={{
            left: `${windowRect.left}px`,
            top: `${windowRect.top}px`,
            width: `${windowRect.width}px`,
            height: `${windowRect.height}px`,
          }}
        >
          <header className={css.toolbar}>
            <div
              className={css.dragRegion}
              data-window-drag-handle
              onPointerDown={event => { beginWindowInteraction(event, 'move') }}
            >
              <div className={css.toolbarTitle}>
                <strong>{t('title')}</strong>
                <p>{t('subtitle')}</p>
              </div>
              <span className={css.spacer} />
            </div>
            <button type="button" className={css.iconButton} aria-label={t('refresh')} disabled={busy !== null || loading} onClick={() => { void refresh() }}>
              <IconRefreshOutline14 />
            </button>
            <button type="button" className={css.iconButton} aria-label={t('close')} onClick={closeWindow}>
              <IconCloseOutline16 size={14} />
            </button>
          </header>

          {error !== null && <div className={css.error} role="alert">{error}</div>}
          {notice !== null && <div className={css.success} role="status">{notice}</div>}
          {loading && view === null && <div className={css.notice}>{t('loading')}</div>}

          {view !== null && (
            <div className={css.workspace}>
              <aside className={css.sidebar}>
                <button
                  type="button"
                  className={css.newButton}
                  disabled={busy !== null}
                  onClick={() => {
                    const next = emptyProfile()
                    const nextTarget = firstAvailableTarget(view.runtimeCatalog.backends)
                    setDraft(next)
                    setRuntimeTarget(nextTarget)
                    setBaseline(draftBaseline(next, nextTarget))
                    setSection('identity')
                    setSelectedId(next.id)
                    setExpectedHeadRevision(null)
                    setRevisionDetail(null)
                    setRevisionLoading(false)
                    runGeneration.current += 1
                    runAbortRef.current?.abort(new Error('Digital Employee Studio created a Profile'))
                    runAbortRef.current = null
                    setSelectedRunId(null)
                    setRunDetail(null)
                    setRunLoading(false)
                    evalRunGeneration.current += 1
                    setSelectedEvalSetId(null)
                    setEvalDraft(null)
                    setEvalCasesJson('[]')
                    setEvalExpectedHeadRevision(null)
                    setSelectedEvalRunId(null)
                    setEvalRunDetail(null)
                    setEvalRunLoading(false)
                    setCompareEvalRunId(null)
                    setAssignment('')
                    setError(null)
                    setNotice(null)
                  }}
                >
                  <IconPlusOutline16 size={14} /> {t('newProfile')}
                </button>
                <div className={css.profileList}>
                  {profiles.length === 0 && <p className={css.muted}>{t('empty')}</p>}
                  {profiles.map(profile => (
                    <button
                      type="button"
                      key={profile.head.profileId}
                      className={profile.head.profileId === selectedId ? css.profileSelected : css.profile}
                      disabled={busy !== null}
                      onClick={() => { select(profile) }}
                    >
                      <span className={css.avatar} style={{ background: avatarGradient(profile.head.profileId) }} aria-hidden>
                        {displayInitial(profile.latest.profile.displayName)}
                      </span>
                      <span className={css.profileMeta}>
                        <strong>{profile.latest.profile.displayName}</strong>
                        <span>{profile.latest.profile.employeeName}</span>
                        <small>
                          {t('revision')} {profile.head.latestRevision}
                          {profile.head.activeRevision === undefined
                            ? ` · ${t('noActiveRevision')}`
                            : ` · ${t('activeShort')} ${profile.head.activeRevision}`}
                          {profile.head.archivedAt === undefined ? '' : ` · ${t('archived')}`}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>

                {draft !== null && (
                  <nav className={css.nav} aria-label={t('sections')}>
                    <div className={css.navCaption}>{t('sections')}</div>
                    {SECTION_ORDER.map(item => {
                      const summary = sectionSummary(draft, item, t)
                      return (
                        <button
                          type="button"
                          key={item}
                          className={item === section ? css.navItemActive : css.navItem}
                          aria-current={item === section ? 'true' : undefined}
                          onClick={() => {
                            setSection(item)
                            if (item === 'evaluations' && selectedEntry !== undefined) {
                              const available = view.evalSets.filter(candidate =>
                                candidate.head.profileId === selectedEntry.head.profileId)
                              const current = available.find(candidate => candidate.head.evalSetId === selectedEvalSetId)
                                ?? available[0]
                              if (current !== undefined) selectEvalSet(current)
                              else {
                                const next = emptyEvalSet(selectedEntry.head.profileId)
                                setSelectedEvalSetId(next.id)
                                setEvalDraft(next)
                                setEvalCasesJson(prettyCases(next))
                                setEvalExpectedHeadRevision(null)
                              }
                            }
                            if (item === 'revisions' && selectedEntry !== undefined) {
                              void inspectRevision(selectedEntry.head.profileId, selectedEntry.head.latestRevision)
                            }
                          }}
                        >
                          <SectionIcon section={item} />
                          <span>{t(sectionNavKey(item))}</span>
                          {summary !== null && <em>{summary}</em>}
                        </button>
                      )
                    })}
                  </nav>
                )}

                <h3>{t('instances')}</h3>
                <div className={css.instances}>
                  {instances.length === 0 && <p className={css.muted}>{t('noInstances')}</p>}
                  {instances.map(instance => (
                    <div key={`${instance.teamId}/${instance.memberName}`} className={css.instance}>
                      <StateDot state={instance.provisioningPhase === 'failed' ? 'error' : instance.provisioningPhase === 'pending' ? 'ongoing' : 'done'} />
                      <span>
                        <strong>{instance.memberName}</strong>
                        <small>{t('provisioningState')}: {t(provisioningPhaseKey(instance.provisioningPhase))} · r{instance.profileRevision}</small>
                        <small>{t('runtimeAvailabilityState')}: {t(instanceAvailabilityKey(instance.runtimeAvailability))}</small>
                        <small>{t('runtimePresenceState')}: {t(runtimePresenceKey(instance.runtimePresence))}</small>
                        <small>{t('selectedRoute')}: {runtimeTargetLabel(instance.runtimeTarget)}</small>
                        {instance.resolvedRuntimeTarget !== undefined && (
                          <small>{t('actualRoute')}: {runtimeTargetLabel(instance.resolvedRuntimeTarget)}</small>
                        )}
                        {instance.nativeRuntimeHandle !== undefined && (
                          <small>{t('nativeRuntimeHandle')}: {instance.nativeRuntimeHandle}</small>
                        )}
                        {instance.error !== undefined && <small className={css.diagnostic}>{instance.error}</small>}
                      </span>
                    </div>
                  ))}
                </div>

                <h3>{t('runs')}</h3>
                <div className={css.runFilters}>
                  <label>
                    <span>{t('runSource')}</span>
                    <select
                      aria-label={t('runSource')}
                      value={runSourceFilter}
                      onChange={event => { setRunSourceFilter(event.target.value as 'all' | DigitalEmployeeRunSource) }}
                    >
                      <option value="all">{t('allRuns')}</option>
                      <option value="dsh-session">{t('runSourceDsh')}</option>
                      <option value="external-native">{t('runSourceExternal')}</option>
                    </select>
                  </label>
                  <label>
                    <span>{t('runTerminal')}</span>
                    <select
                      aria-label={t('runTerminal')}
                      value={runTerminalFilter}
                      onChange={event => { setRunTerminalFilter(event.target.value as 'all' | DigitalEmployeeRunTerminal) }}
                    >
                      <option value="all">{t('allRuns')}</option>
                      <option value="completed">{t('runCompleted')}</option>
                      <option value="cancelled">{t('runCancelled')}</option>
                      <option value="blocked">{t('runBlocked')}</option>
                      <option value="failed">{t('runFailed')}</option>
                      <option value="max-tokens">{t('runMaxTokens')}</option>
                      <option value="interrupted">{t('runInterrupted')}</option>
                      <option value="unknown-terminal">{t('runUnknownTerminal')}</option>
                    </select>
                  </label>
                </div>
                <div className={css.runList}>
                  {filteredRuns.length === 0 && <p className={css.muted}>{t('noRuns')}</p>}
                  {filteredRuns.map(candidate => (
                    <button
                      type="button"
                      key={candidate.runId}
                      className={candidate.runId === selectedRunId ? css.runSelected : css.run}
                      onClick={() => { void inspectRun(candidate) }}
                    >
                      <strong>{runOwnerLabel(candidate, t)}</strong>
                      <span>{runTerminalLabel(candidate.terminal, t)} · {runSourceLabel(candidate.source, t)}</span>
                      <small>{new Date(candidate.startedAt).toLocaleString()} · {candidate.completeness.status}</small>
                    </button>
                  ))}
                </div>
              </aside>

              <main className={css.editor}>
                {selectedRunId !== null
                  ? selectedRun === undefined
                    ? <div className={css.placeholder}>{t('runNotFound')}</div>
                    : <RunInspector
                        run={runDetail?.run ?? selectedRun}
                        detail={runDetail}
                        loading={runLoading}
                        t={t}
                      />
                  : draft === null
                  ? <div className={css.placeholder}>{t('selectProfile')}</div>
                  : (
                    <>
                      <div className={css.sectionScroll}>
                        {section === 'identity' && (
                          <SectionPage title={t(sectionTitleKey('identity'))} desc={t(sectionDescKey('identity'))}>
                            <div className={css.grid}>
                              <Field label={t('profileId')}>
                                <input value={draft.id} disabled={expectedHeadRevision !== null} onChange={event => { update('id', event.target.value) }} />
                              </Field>
                              <Field label={t('employeeName')}>
                                <input value={draft.employeeName} onChange={event => { update('employeeName', event.target.value) }} />
                              </Field>
                              <Field label={t('displayName')}>
                                <input value={draft.displayName} onChange={event => { update('displayName', event.target.value) }} />
                              </Field>
                              <Field label={t('continuationProvider')}>
                                <input
                                  value={draft.continuationProvider}
                                  onChange={event => { update('continuationProvider', event.target.value) }}
                                />
                              </Field>
                              <Field label={t('description')} wide>
                                <input value={draft.description} onChange={event => { update('description', event.target.value) }} />
                              </Field>
                              <Field label={t('runtimeBackend')} wide>
                                <select
                                  value={runtimeTargetId(runtimeTarget)}
                                  onChange={(event) => {
                                    const backend = runtimeBackends.find(candidate => candidate.routingId === event.target.value)
                                    if (backend !== undefined) setRuntimeTarget(targetFromBackend(backend))
                                  }}
                                >
                                  {runtimeTarget === null && <option value="">{t('selectRuntimeBackend')}</option>}
                                  <optgroup label={t('dshModels')}>
                                    {runtimeBackends.filter(backend => backend.family === 'dsh-model').map(backend => (
                                      <option
                                        key={backend.routingId}
                                        value={backend.routingId}
                                        disabled={backend.availability !== 'available'}
                                      >
                                        {runtimeOptionLabel(backend, t)}
                                      </option>
                                    ))}
                                  </optgroup>
                                  <optgroup label={t('localAgents')}>
                                    {runtimeBackends.filter(backend => backend.family === 'external-agent').map(backend => (
                                      <option
                                        key={backend.routingId}
                                        value={backend.routingId}
                                        disabled={backend.availability !== 'available'}
                                      >
                                        {runtimeOptionLabel(backend, t)}
                                      </option>
                                    ))}
                                  </optgroup>
                                  {runtimeBackends.some(backend => backend.family === 'legacy-inherit-lead') && (
                                    <optgroup label={t('historicalRuntime')}>
                                      {runtimeBackends.filter(backend => backend.family === 'legacy-inherit-lead').map(backend => (
                                        <option key={backend.routingId} value={backend.routingId} disabled>
                                          {runtimeOptionLabel(backend, t)}
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                </select>
                              </Field>
                              {selectedRuntimeBackend !== undefined && (
                                <div className={css.runtimeDetails}>
                                  <strong>
                                    {runtimeAvailabilityLabel(selectedRuntimeBackend.availability, t)}
                                    {' · '}
                                    {selectedRuntimeBackend.contextModes.length === 0
                                      ? t('noContextModes')
                                      : selectedRuntimeBackend.contextModes.map(mode => t(mode)).join(', ')}
                                  </strong>
                                  <span>
                                    {selectedRuntimeBackend.profileCapabilities.length === 0
                                      ? t('noProfileCapabilities')
                                      : selectedRuntimeBackend.profileCapabilities
                                        .map(capability => profileCapabilityLabel(capability, t)).join(' · ')}
                                  </span>
                                  <span>
                                    {t('runtimeCapabilities')}: {' '}
                                    {selectedRuntimeBackend.runtimeCapabilities.length === 0
                                      ? t('noRuntimeCapabilities')
                                      : selectedRuntimeBackend.runtimeCapabilities
                                        .map(capability => runtimeCapabilityLabel(capability, t)).join(' · ')}
                                  </span>
                                  {selectedRuntimeBackend.diagnostic !== undefined && (
                                    <small className={css.diagnostic}>{selectedRuntimeBackend.diagnostic}</small>
                                  )}
                                </div>
                              )}
                              {runtimeTarget?.kind === 'dsh-model'
                                && selectedRuntimeBackend?.family === 'dsh-model'
                                && selectedRuntimeBackend.reasoning !== undefined && (
                                  <Field label={t('reasoningEffort')} wide>
                                    <select
                                      value={runtimeTarget.reasoningEffort ?? ''}
                                      onChange={(event) => {
                                        const reasoningEffort = event.target.value
                                        setRuntimeTarget((current) => {
                                          if (current?.kind !== 'dsh-model') return current
                                          if (reasoningEffort !== '') return { ...current, reasoningEffort }
                                          return {
                                            kind: 'dsh-model',
                                            provider: current.provider,
                                            model: current.model,
                                          }
                                        })
                                      }}
                                    >
                                      <option value="">
                                        {t('providerDefault')}
                                        {selectedRuntimeBackend.reasoning.defaultEffort === undefined
                                          ? ''
                                          : ` (${selectedRuntimeBackend.reasoning.defaultEffort})`}
                                      </option>
                                      {selectedRuntimeBackend.reasoning.efforts.map(effort => (
                                        <option key={effort.id} value={effort.id}>{effort.name}</option>
                                      ))}
                                    </select>
                                  </Field>
                                )}
                              <div className={css.fieldWide}>
                                <span className={css.fieldLabel}>{t('contextMode')}</span>
                                <div className={css.segmented}>
                                  {(['fresh', 'fork'] as const).map(mode => (
                                    <button
                                      type="button"
                                      key={mode}
                                      className={draft.contextMode === mode ? css.segmentActive : css.segment}
                                      aria-pressed={draft.contextMode === mode}
                                      onClick={() => { update('contextMode', mode) }}
                                    >
                                      {t(mode)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </SectionPage>
                        )}

                        {section === 'persona' && (
                          <SectionPage title={t(sectionTitleKey('persona'))} desc={t(sectionDescKey('persona'))}>
                            <PromptField label={t('persona')} value={draft.persona} max={16_384} onChange={value => { update('persona', value) }} />
                            <PromptField label={t('mission')} value={draft.mission} max={16_384} onChange={value => { update('mission', value) }} />
                          </SectionPage>
                        )}

                        {section === 'tools' && (
                          <SectionPage title={t(sectionTitleKey('tools'))} desc={t(sectionDescKey('tools'))}>
                            <div className={css.segmented}>
                              {(['inherit', 'allow', 'deny'] as const).map(mode => (
                                <button
                                  type="button"
                                  key={mode}
                                  className={draft.toolPolicy.mode === mode ? css.segmentActive : css.segment}
                                  aria-pressed={draft.toolPolicy.mode === mode}
                                  onClick={() => { update('toolPolicy', { mode, names: mode === 'inherit' ? [] : draft.toolPolicy.names }) }}
                                >
                                  {t(mode)}
                                </button>
                              ))}
                            </div>
                            {draft.toolPolicy.mode !== 'inherit' && (
                              <div className={css.toolGrid}>
                                {view.tools.length === 0 && <p className={css.muted}>{t('noTools')}</p>}
                                {view.tools.map(tool => {
                                  const checked = draft.toolPolicy.names.includes(tool.name)
                                  return (
                                    <label key={tool.name} className={css.tool} title={tool.description}>
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => {
                                          const names = checked
                                            ? draft.toolPolicy.names.filter(name => name !== tool.name)
                                            : [...draft.toolPolicy.names, tool.name]
                                          update('toolPolicy', { ...draft.toolPolicy, names })
                                        }}
                                      />
                                      <span><strong>{tool.name}</strong><small>{tool.description}</small></span>
                                    </label>
                                  )
                                })}
                              </div>
                            )}
                          </SectionPage>
                        )}

                        {(['context', 'memory'] as const).map(collection => (
                          section === collection && (
                            <SectionPage
                              key={collection}
                              title={t(sectionTitleKey(collection))}
                              desc={t(sectionDescKey(collection))}
                              action={(
                                <button
                                  type="button"
                                  className={css.smallButton}
                                  onClick={() => {
                                    const block: ProfileTextBlock = {
                                      id: freshIdentity(collection),
                                      title: collection === 'context' ? 'Context' : 'Memory',
                                      content: '',
                                      enabled: true,
                                    }
                                    update(collection, [...draft[collection], block])
                                  }}
                                >
                                  <IconPlusOutline16 size={13} /> {t('addBlock')}
                                </button>
                              )}
                            >
                              <BlockList
                                blocks={draft[collection]}
                                collapsed={collapsed}
                                onToggleCollapse={toggleCollapsed}
                                onChange={(id, value) => { updateBlock(collection, id, value) }}
                                onRemove={id => { removeBlock(collection, id) }}
                                t={t}
                              />
                            </SectionPage>
                          )
                        ))}

                        {section === 'hooks' && (
                          <SectionPage
                            title={t(sectionTitleKey('hooks'))}
                            desc={t(sectionDescKey('hooks'))}
                            action={(
                              <button
                                type="button"
                                className={css.smallButton}
                                onClick={() => {
                                  const hook: ProfileHook = {
                                    id: freshIdentity('hook'),
                                    point: 'session-start',
                                    effect: 'context',
                                    text: '',
                                    enabled: true,
                                  }
                                  update('hooks', [...draft.hooks, hook])
                                }}
                              >
                                <IconPlusOutline16 size={13} /> {t('addHook')}
                              </button>
                            )}
                          >
                            <div className={css.cards}>
                              {draft.hooks.length === 0 && <p className={css.muted}>{t('noHooks')}</p>}
                              {draft.hooks.map(hook => (
                                <article key={hook.id} className={css.hookCard}>
                                  <div className={css.hookHead}>
                                    <Switch
                                      label={t('enabled')}
                                      checked={hook.enabled}
                                      onChange={enabled => { updateHook(hook.id, { enabled }) }}
                                    />
                                    <select
                                      aria-label={t('hookPoint')}
                                      value={hook.point}
                                      onChange={event => {
                                        const point = event.target.value as ProfileHookPoint
                                        setDraft(current => current === null ? null : {
                                          ...current,
                                          hooks: current.hooks.map(item => item.id === hook.id ? pointAdjusted(item, point) : item),
                                        })
                                      }}
                                    >
                                      {(['session-start', 'before-step', 'before-tool', 'after-tool'] as const).map(point => (
                                        <option key={point} value={point}>{hookPointLabel(point, t)}</option>
                                      ))}
                                    </select>
                                    {hook.point === 'before-tool'
                                      ? (
                                        <select
                                          aria-label={t('hookEffect')}
                                          value={hook.effect}
                                          onChange={event => {
                                            updateHook(hook.id, { effect: event.target.value as 'deny' | 'ask' })
                                          }}
                                        >
                                          <option value="deny">{t('denyEffect')}</option>
                                          <option value="ask">{t('askEffect')}</option>
                                        </select>
                                        )
                                      : (
                                        <span className={css.badgeInject}>{t('contextEffect')}</span>
                                        )}
                                    {isToolPoint(hook.point) && (
                                      <input
                                        className={css.matcher}
                                        aria-label={t('matcher')}
                                        placeholder={t('matcher')}
                                        value={hook.matcher ?? '*'}
                                        onChange={event => { updateHook(hook.id, { matcher: event.target.value }) }}
                                      />
                                    )}
                                    <span className={css.spacer} />
                                    <button type="button" className={css.iconButton} aria-label={t('remove')} onClick={() => { update('hooks', draft.hooks.filter(item => item.id !== hook.id)) }}>
                                      <IconTrashOutline16 size={14} />
                                    </button>
                                  </div>
                                  <textarea
                                    className={css.hookText}
                                    aria-label={t('content')}
                                    value={hook.text}
                                    onChange={event => { updateHook(hook.id, { text: event.target.value }) }}
                                  />
                                </article>
                              ))}
                            </div>
                          </SectionPage>
                        )}

                        {section === 'evaluations' && selectedEntry !== undefined && (
                          <SectionPage
                            title={t(sectionTitleKey('evaluations'))}
                            desc={t(sectionDescKey('evaluations'))}
                            action={(
                              <button
                                type="button"
                                className={css.smallButton}
                                disabled={busy !== null}
                                onClick={() => {
                                  const next = emptyEvalSet(selectedEntry.head.profileId)
                                  setSelectedEvalSetId(next.id)
                                  setEvalDraft(next)
                                  setEvalCasesJson(prettyCases(next))
                                  setEvalExpectedHeadRevision(null)
                                  setSelectedEvalRunId(null)
                                  setEvalRunDetail(null)
                                  setCompareEvalRunId(null)
                                  setError(null)
                                  setNotice(null)
                                }}
                              >
                                <IconPlusOutline16 size={13} /> {t('newEvalSet')}
                              </button>
                            )}
                          >
                            <div className={css.releaseSummary}>
                              <span>{t('evalPromotionGate')}: {promotionGateLabel(selectedEntry.promotionGate.status, t)}</span>
                              {selectedEntry.promotionGate.requiredEvalSet !== undefined && (
                                <span>
                                  {selectedEntry.promotionGate.requiredEvalSet.evalSetId}
                                  @r{selectedEntry.promotionGate.requiredEvalSet.revision}
                                </span>
                              )}
                              {selectedEntry.promotionGate.satisfiedByEvalRunId !== undefined && (
                                <span>{t('evalSatisfiedBy')}: {selectedEntry.promotionGate.satisfiedByEvalRunId}</span>
                              )}
                            </div>
                            {selectedEntry.promotionGate.diagnostic !== undefined && (
                              <p className={css.diagnostic}>{selectedEntry.promotionGate.diagnostic}</p>
                            )}

                            <div className={css.evalWorkspace}>
                              <div className={css.revisionList}>
                                {profileEvalSets.length === 0 && <p className={css.muted}>{t('noEvalSets')}</p>}
                                {profileEvalSets.map(candidate => (
                                  <button
                                    type="button"
                                    key={candidate.head.evalSetId}
                                    className={candidate.head.evalSetId === selectedEvalSetId
                                      ? css.revisionSelected
                                      : css.revisionItem}
                                    disabled={busy !== null}
                                    onClick={() => { selectEvalSet(candidate) }}
                                  >
                                    <strong>{candidate.latest.evalSet.displayName}</strong>
                                    <span>r{candidate.head.latestRevision}</span>
                                    <code>{candidate.head.evalSetId}</code>
                                  </button>
                                ))}
                              </div>

                              <div className={css.evalEditor}>
                                {evalDraft === null
                                  ? <p className={css.muted}>{t('selectEvalSet')}</p>
                                  : (
                                    <>
                                      <div className={css.grid}>
                                        <Field label={t('evalSetId')}>
                                          <input
                                            value={evalDraft.id}
                                            disabled={evalExpectedHeadRevision !== null}
                                            onChange={event => {
                                              setSelectedEvalSetId(event.target.value)
                                              setEvalDraft(current => current === null
                                                ? null
                                                : { ...current, id: event.target.value })
                                            }}
                                          />
                                        </Field>
                                        <Field label={t('evalDisplayName')}>
                                          <input
                                            value={evalDraft.displayName}
                                            onChange={event => {
                                              setEvalDraft(current => current === null
                                                ? null
                                                : { ...current, displayName: event.target.value })
                                            }}
                                          />
                                        </Field>
                                        <Field label={t('evalToolAllowlist')} wide>
                                          <input
                                            value={evalDraft.toolAllowlist.join(', ')}
                                            onChange={event => {
                                              const toolAllowlist = event.target.value.split(',')
                                                .map(name => name.trim()).filter(Boolean)
                                              setEvalDraft(current => current === null
                                                ? null
                                                : { ...current, toolAllowlist })
                                            }}
                                          />
                                        </Field>
                                        <Field label={t('evalMaxSteps')}>
                                          <input
                                            type="number"
                                            min={1}
                                            value={evalDraft.resourceCeilings.maxSteps}
                                            onChange={event => {
                                              const maxSteps = Number(event.target.value)
                                              setEvalDraft(current => current === null ? null : {
                                                ...current,
                                                resourceCeilings: { ...current.resourceCeilings, maxSteps },
                                              })
                                            }}
                                          />
                                        </Field>
                                        <Field label={t('evalMaxOutputTokens')}>
                                          <input
                                            type="number"
                                            min={1}
                                            value={evalDraft.resourceCeilings.maxOutputTokens}
                                            onChange={event => {
                                              const maxOutputTokens = Number(event.target.value)
                                              setEvalDraft(current => current === null ? null : {
                                                ...current,
                                                resourceCeilings: { ...current.resourceCeilings, maxOutputTokens },
                                              })
                                            }}
                                          />
                                        </Field>
                                        <Field label={t('evalMaxElapsedMs')}>
                                          <input
                                            type="number"
                                            min={1}
                                            value={evalDraft.resourceCeilings.maxElapsedMs}
                                            onChange={event => {
                                              const maxElapsedMs = Number(event.target.value)
                                              setEvalDraft(current => current === null ? null : {
                                                ...current,
                                                resourceCeilings: { ...current.resourceCeilings, maxElapsedMs },
                                              })
                                            }}
                                          />
                                        </Field>
                                        <Field label={t('evalPassPolicy')}>
                                          <select
                                            value={evalDraft.passPolicy.kind}
                                            onChange={event => {
                                              const passPolicy = event.target.value === 'all'
                                                ? { kind: 'all' as const }
                                                : { kind: 'minimum' as const, minimumPassed: 1 }
                                              setEvalDraft(current => current === null ? null : { ...current, passPolicy })
                                            }}
                                          >
                                            <option value="all">{t('evalPassAll')}</option>
                                            <option value="minimum">{t('evalPassMinimum')}</option>
                                          </select>
                                        </Field>
                                        {evalDraft.passPolicy.kind === 'minimum' && (
                                          <Field label={t('evalMinimumPassed')}>
                                            <input
                                              type="number"
                                              min={1}
                                              value={evalDraft.passPolicy.minimumPassed}
                                              onChange={event => {
                                                const minimumPassed = Number(event.target.value)
                                                setEvalDraft(current => current === null ? null : {
                                                  ...current,
                                                  passPolicy: { kind: 'minimum', minimumPassed },
                                                })
                                              }}
                                            />
                                          </Field>
                                        )}
                                      </div>
                                      <PromptField
                                        label={t('evalCasesJson')}
                                        value={evalCasesJson}
                                        max={131_072}
                                        onChange={setEvalCasesJson}
                                      />
                                      <div className={css.evalActions}>
                                        <button
                                          type="button"
                                          className={css.secondaryButton}
                                          disabled={busy !== null}
                                          onClick={() => { void saveEvaluationSet() }}
                                        >
                                          {busy === 'save-eval' ? t('saving') : t('saveEvalSet')}
                                        </button>
                                        <button
                                          type="button"
                                          className={css.secondaryButton}
                                          disabled={busy !== null || selectedEvalSetEntry === undefined}
                                          onClick={() => { void changeEvalGate(true) }}
                                        >
                                          {t('requireLatestEval')}
                                        </button>
                                        <button
                                          type="button"
                                          className={css.secondaryButton}
                                          disabled={busy !== null || selectedEntry.promotionGate.requiredEvalSet === undefined}
                                          onClick={() => { void changeEvalGate(false) }}
                                        >
                                          {t('clearEvalGate')}
                                        </button>
                                        <span className={css.spacer} />
                                        <button
                                          type="button"
                                          className={css.primaryButton}
                                          disabled={busy !== null || selectedEvalSetEntry === undefined}
                                          onClick={() => { void startEvaluation() }}
                                        >
                                          <IconPlayOutline16 size={14} /> {t('runCandidate')}
                                        </button>
                                      </div>
                                      {selectedEvalSetEntry !== undefined && (
                                        <div className={css.evalHistory}>
                                          <strong>{t('evalSetHistory')}</strong>
                                          {selectedEvalSetEntry.history.map(item => (
                                            <code key={item.revision}>r{item.revision} · {item.fingerprint.slice(0, 12)}</code>
                                          ))}
                                          {selectedEvalSetEntry.historyTruncated && <span>{t('historyTruncated')}</span>}
                                        </div>
                                      )}
                                    </>
                                    )}
                              </div>
                            </div>

                            <div className={css.evalRunHeading}>
                              <strong>{t('evalRuns')}</strong>
                              <span>{profileEvalRuns.length}</span>
                            </div>
                            <div className={css.evalRunWorkspace}>
                              <div className={css.runList}>
                                {profileEvalRuns.length === 0 && <p className={css.muted}>{t('noEvalRuns')}</p>}
                                {profileEvalRuns.map(candidate => (
                                  <button
                                    type="button"
                                    key={candidate.evalRunId}
                                    aria-label={`${t('evalRunAria')} ${candidate.evalRunId}`}
                                    className={candidate.evalRunId === selectedEvalRunId ? css.runSelected : css.run}
                                    onClick={() => { void inspectEvalRun(candidate) }}
                                  >
                                    <strong>{candidate.evalRunId.slice(0, 8)}</strong>
                                    <span>{evalRunStatusLabel(candidate.status, t)} · {candidate.passedCases}/{candidate.totalCases}</span>
                                    <small>Profile r{candidate.profileRevision} · Eval r{candidate.evalSetRevision}</small>
                                  </button>
                                ))}
                              </div>
                              <EvalRunInspector
                                summary={selectedEvalRun}
                                detail={evalRunDetail}
                                loading={evalRunLoading}
                                candidates={profileEvalRuns}
                                compareId={compareEvalRunId}
                                compared={comparedEvalRun}
                                busy={busy}
                                onCompare={setCompareEvalRunId}
                                onCancel={() => { void cancelEvaluation() }}
                                t={t}
                              />
                            </div>
                          </SectionPage>
                        )}

                        {section === 'revisions' && selectedEntry !== undefined && (
                          <SectionPage
                            title={t(sectionTitleKey('revisions'))}
                            desc={t(sectionDescKey('revisions'))}
                          >
                            <div className={css.releaseSummary}>
                              <span>{t('latestLabel')} r{selectedEntry.head.latestRevision}</span>
                              <span>
                                {selectedEntry.head.activeRevision === undefined
                                  ? t('noActiveRevision')
                                  : `${t('activeLabel')} r${selectedEntry.head.activeRevision}`}
                              </span>
                              <span>{t('headRevision')} {selectedEntry.head.headRevision}</span>
                              <span>
                                {t('evalPromotionGate')}: {promotionGateLabel(selectedEntry.promotionGate.status, t)}
                              </span>
                              {selectedEntry.head.archivedAt !== undefined && <span>{t('archived')}</span>}
                            </div>
                            {selectedEntry.promotionGate.diagnostic !== undefined && (
                              <p className={css.diagnostic}>{selectedEntry.promotionGate.diagnostic}</p>
                            )}
                            <div className={css.revisionWorkspace}>
                              <div className={css.revisionList}>
                                {selectedEntry.history.map(item => (
                                  <button
                                    type="button"
                                    key={item.revision}
                                    aria-label={`${t('revision')} ${item.revision}`}
                                    className={revisionDetail?.revision.revision === item.revision
                                      ? css.revisionSelected
                                      : css.revisionItem}
                                    disabled={busy !== null}
                                    onClick={() => {
                                      void inspectRevision(selectedEntry.head.profileId, item.revision)
                                    }}
                                  >
                                    <strong>r{item.revision}</strong>
                                    <span>
                                      {item.revision === selectedEntry.head.latestRevision && t('latest')}
                                      {item.revision === selectedEntry.head.latestRevision
                                        && item.revision === selectedEntry.head.activeRevision && ' · '}
                                      {item.revision === selectedEntry.head.activeRevision && t('active')}
                                    </span>
                                    <code>{item.fingerprint.slice(0, 12)}</code>
                                  </button>
                                ))}
                                {selectedEntry.historyTruncated && <p className={css.muted}>{t('historyTruncated')}</p>}
                              </div>
                              <div className={css.revisionDetail}>
                                {revisionLoading && <p className={css.muted}>{t('loadingRevision')}</p>}
                                {!revisionLoading && revisionDetail === null && (
                                  <p className={css.muted}>{t('selectRevision')}</p>
                                )}
                                {!revisionLoading && revisionDetail !== null && (
                                  <>
                                    <div className={css.revisionDetailHead}>
                                      <div>
                                        <strong>{t('revision')} {revisionDetail.revision.revision}</strong>
                                        <code title={revisionDetail.revision.fingerprint}>
                                          {revisionDetail.revision.fingerprint}
                                        </code>
                                      </div>
                                      <span className={css.spacer} />
                                      {revisionDetail.revision.revision === selectedEntry.head.latestRevision
                                        && revisionDetail.revision.revision !== selectedEntry.head.activeRevision
                                        && selectedEntry.head.archivedAt === undefined && (
                                        <button
                                          type="button"
                                          className={css.primaryButton}
                                          disabled={busy !== null || activationBlockedByGate}
                                          title={activationBlockedByGate ? selectedEntry.promotionGate.diagnostic : undefined}
                                          onClick={() => {
                                            void mutateHead(
                                              'activate',
                                              selectedEntry.head.profileId,
                                              () => activate(
                                                sessionId,
                                                selectedEntry.head.profileId,
                                                revisionDetail.revision.revision,
                                                selectedEntry.head.headRevision,
                                              ),
                                              'activated',
                                            )
                                          }}
                                        >
                                          {t('activateLatest')}
                                        </button>
                                      )}
                                      {revisionDetail.revision.revision < selectedEntry.head.latestRevision
                                        && revisionDetail.revision.revision !== selectedEntry.head.activeRevision
                                        && selectedEntry.head.archivedAt === undefined && (
                                        <button
                                          type="button"
                                          className={css.secondaryButton}
                                          disabled={busy !== null}
                                          onClick={() => {
                                            void mutateHead(
                                              'rollback',
                                              selectedEntry.head.profileId,
                                              () => rollback(
                                                sessionId,
                                                selectedEntry.head.profileId,
                                                revisionDetail.revision.revision,
                                                selectedEntry.head.headRevision,
                                              ),
                                              'rolledBack',
                                            )
                                          }}
                                        >
                                          {t('rollbackTo')} {revisionDetail.revision.revision}
                                        </button>
                                      )}
                                    </div>
                                    <p className={css.comparison}>
                                      {revisionDetail.comparedToRevision === undefined
                                        ? t('noComparison')
                                        : `${t('comparedTo')} r${revisionDetail.comparedToRevision}`}
                                    </p>
                                    <div className={css.diffList}>
                                      {revisionDetail.diff.length === 0 && <p className={css.muted}>{t('noDiff')}</p>}
                                      {revisionDetail.diff.map((entry, index) => (
                                        <div key={`${entry.path}/${index}`} className={css.diffEntry}>
                                          <strong>{entry.path}</strong>
                                          <span>{entry.kind}</span>
                                          <code>{entry.before ?? '∅'} → {entry.after ?? '∅'}</code>
                                        </div>
                                      ))}
                                      {revisionDetail.diffTruncated && <p className={css.muted}>{t('diffTruncated')}</p>}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </SectionPage>
                        )}
                      </div>

                      <footer className={css.actions}>
                        {selectedEntry !== undefined && (
                          <button
                            type="button"
                            className={selectedEntry.head.archivedAt === undefined ? css.dangerButton : css.secondaryButton}
                            disabled={busy !== null}
                            onClick={() => {
                              const archived = selectedEntry.head.archivedAt !== undefined
                              void mutateHead(
                                archived ? 'restore' : 'archive',
                                selectedEntry.head.profileId,
                                () => archived
                                  ? restore(sessionId, selectedEntry.head.profileId, selectedEntry.head.headRevision)
                                  : archive(sessionId, selectedEntry.head.profileId, selectedEntry.head.headRevision),
                                archived ? 'restored' : 'archivedNotice',
                              )
                            }}
                          >
                            {selectedEntry.head.archivedAt === undefined ? t('archiveProfile') : t('restoreProfile')}
                          </button>
                        )}
                        {dirty && <span className={css.unsaved}>{t('unsaved')}</span>}
                        {selectedEntry !== undefined && selectedEntry.head.activeRevision === undefined && (
                          <span className={css.unsaved}>{t('noActiveRevision')}</span>
                        )}
                        <span className={css.spacer} />
                        <button type="button" className={css.secondaryButton} disabled={!canSave || busy !== null} onClick={() => { void saveDraft() }}>
                          {busy === 'save' ? t('saving') : t('save')}
                        </button>
                        <input
                          className={css.assignment}
                          aria-label={t('assignment')}
                          placeholder={t('assignment')}
                          value={assignment}
                          onChange={event => { setAssignment(event.target.value) }}
                        />
                        <button type="button" className={css.primaryButton} disabled={!canLaunch || busy !== null} onClick={() => { void launchDraft() }}>
                          <IconPlayOutline16 size={14} /> {busy === 'spawn' ? t('launching') : t('launch')}
                        </button>
                      </footer>
                    </>
                  )}
              </main>
            </div>
          )}
          <ResizeHandles onPointerDown={(event, edge) => { beginWindowInteraction(event, 'resize', edge) }} />
        </div>
      )}
    </div>
  )
}

function EvalRunInspector({
  summary,
  detail,
  loading,
  candidates,
  compareId,
  compared,
  busy,
  onCompare,
  onCancel,
  t,
}: {
  summary: DigitalEmployeeEvalRunSummary | undefined
  detail: DigitalEmployeeEvalRunDetail | null
  loading: boolean
  candidates: readonly DigitalEmployeeEvalRunSummary[]
  compareId: DigitalEmployeeEvalRunId | null
  compared: DigitalEmployeeEvalRunSummary | undefined
  busy: BusyOperation | null
  onCompare: (id: DigitalEmployeeEvalRunId | null) => void
  onCancel: () => void
  t: Translate
}) {
  if (summary === undefined) return <div className={css.revisionDetail}><p className={css.muted}>{t('selectEvalRun')}</p></div>
  const status = detail?.run.status ?? summary.status
  return (
    <div className={css.evalRunInspector}>
      <div className={css.revisionDetailHead}>
        <div>
          <strong>{t('evalRunDetail')}</strong>
          <code title={summary.evalRunId}>{summary.evalRunId}</code>
        </div>
        <span className={css.spacer} />
        {status === 'running' && (
          <button
            type="button"
            className={css.dangerButton}
            disabled={busy !== null}
            onClick={onCancel}
          >
            {t('cancelEvaluation')}
          </button>
        )}
      </div>
      <div className={css.releaseSummary}>
        <span>{evalRunStatusLabel(status, t)}</span>
        <span>{summary.passedCases}/{summary.totalCases} {t('evalCasesPassed')}</span>
        <span>Profile r{summary.profileRevision}</span>
        <span>Eval r{summary.evalSetRevision}</span>
      </div>
      <label className={css.evalCompare}>
        <span>{t('compareEvalRun')}</span>
        <select
          aria-label={t('compareEvalRun')}
          value={compareId ?? ''}
          onChange={event => {
            onCompare(event.target.value === '' ? null : event.target.value as DigitalEmployeeEvalRunId)
          }}
        >
          <option value="">{t('noEvalComparison')}</option>
          {candidates.filter(candidate => candidate.evalRunId !== summary.evalRunId).map(candidate => (
            <option key={candidate.evalRunId} value={candidate.evalRunId}>
              {candidate.evalRunId.slice(0, 8)} · {evalRunStatusLabel(candidate.status, t)}
            </option>
          ))}
        </select>
      </label>
      {compared !== undefined && (
        <div className={css.evalComparison}>
          <code>{summary.status} → {compared.status}</code>
          <span>
            {t('evalCasesPassed')}: {summary.passedCases}/{summary.totalCases}
            {' → '}{compared.passedCases}/{compared.totalCases}
          </span>
          <span>
            {t('evalEnvironment')}: {summary.environmentFingerprint === compared.environmentFingerprint
              ? t('same')
              : t('different')}
          </span>
        </div>
      )}
      {loading && <p className={css.muted}>{t('loadingEvalRun')}</p>}
      {!loading && detail !== null && (
        <div className={css.evalCases}>
          {detail.run.cases.map(testCase => (
            <article key={testCase.caseId} className={css.evalCase}>
              <div>
                <strong>{testCase.caseId}</strong>
                <span>{evalCaseStatusLabel(testCase.status, t)}</span>
              </div>
              {testCase.diagnostic !== undefined && <p className={css.diagnostic}>{testCase.diagnostic}</p>}
              {testCase.assertions.map((assertion, index) => (
                <div className={css.evalAssertion} key={`${assertion.kind}/${assertion.subject ?? ''}/${index}`}>
                  <span>{assertion.passed ? '✓' : '×'} {assertion.kind}</span>
                  {assertion.subject !== undefined && <code>{assertion.subject}</code>}
                  <small>{assertion.diagnostic}</small>
                </div>
              ))}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function RunInspector({
  run,
  detail,
  loading,
  t,
}: {
  run: DigitalEmployeeRunIndexRecord
  detail: DigitalEmployeeRunDetail | null
  loading: boolean
  t: Translate
}) {
  return (
    <div className={css.runInspector}>
      <div className={css.runHeader}>
        <div>
          <h2>{t('runDetail')}</h2>
          <p>{runOwnerLabel(run, t)} · {run.profileId}@{run.profileRevision}</p>
        </div>
        <span className={css.runTerminal}>{runTerminalLabel(run.terminal, t)}</span>
      </div>
      <div className={css.runFacts}>
        <span><strong>{t('runSource')}:</strong> {runSourceLabel(run.source, t)}</span>
        <span><strong>{t('selectedRoute')}:</strong> {runtimeTargetLabel(run.selectedRuntimeTarget)}</span>
        <span>
          <strong>{t('actualRoute')}:</strong>{' '}
          {run.actualRuntimeTarget === undefined ? t('runUnavailable') : runtimeTargetLabel(run.actualRuntimeTarget)}
        </span>
        <span><strong>{t('runTerminal')}:</strong> {runTerminalLabel(run.terminal, t)}</span>
        <span><strong>{t('runCompleteness')}:</strong> {run.completeness.status}</span>
        <span><strong>{t('runRevisionFingerprint')}:</strong> <code>{run.profileFingerprint}</code></span>
        <span><strong>{t('runCapabilityGeneration')}:</strong> {run.capabilityGeneration}</span>
        {run.usage !== undefined && (
          <span>
            <strong>{t('runUsage')}:</strong>{' '}
            {run.usage.inputTokens} / {run.usage.outputTokens}
            {run.usage.totalTokens === undefined ? '' : ` / ${run.usage.totalTokens}`}
          </span>
        )}
      </div>
      <a
        className={css.canonicalLink}
        href={canonicalSourceHref(run)}
        aria-label={t('canonicalSource')}
      >
        {t('canonicalSource')}: {run.canonicalTurnId}
      </a>
      <p className={css.redactions}>{t('runRedactions')}: {run.completeness.redactions.join(', ')}</p>
      {run.completeness.diagnostic !== undefined && (
        <p className={css.diagnostic}>{run.completeness.diagnostic}</p>
      )}
      <h3>{t('runTimeline')}</h3>
      {loading && <p className={css.muted}>{t('loadingRun')}</p>}
      {!loading && detail !== null && (
        <div className={css.timeline}>
          {detail.timeline.map((item, index) => (
            <div className={css.timelineItem} key={`${item.timestamp}/${item.kind}/${index}`}>
              <time>{new Date(item.timestamp).toLocaleString()}</time>
              <strong>{item.kind}{item.name === undefined ? '' : ` · ${item.name}`}</strong>
              {item.outcome !== undefined && (
                <span>{runTimelineOutcomeLabel(item.outcome, t)}</span>
              )}
              {item.callId !== undefined && <span>{t('runCallId')}: {item.callId}</span>}
              {item.approvalId !== undefined && <span>{t('runApprovalId')}: {item.approvalId}</span>}
              {item.policyId !== undefined && <span>{t('runPolicyId')}: {item.policyId}</span>}
              {item.policy !== undefined && <span>{t('runApprovalPolicy')}: {item.policy}</span>}
              {item.usage !== undefined && (
                <span>{t('runUsage')}: {item.usage.inputTokens} / {item.usage.outputTokens}</span>
              )}
            </div>
          ))}
          {detail.timeline.length === 0 && <p className={css.muted}>{t('noRunEvidence')}</p>}
          {detail.timelineTruncated && <p className={css.muted}>{t('runTimelineTruncated')}</p>}
        </div>
      )}
    </div>
  )
}

function ResizeHandles({
  onPointerDown,
}: {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, edge: ResizeEdge) => void
}) {
  return (
    <>
      {RESIZE_EDGES.map(edge => (
        <div
          key={edge}
          className={`${css.resizeHandle} ${resizeEdgeClass(edge)}`}
          data-resize-edge={edge}
          aria-hidden="true"
          onPointerDown={event => { onPointerDown(event, edge) }}
        />
      ))}
    </>
  )
}

function resizeEdgeClass(edge: ResizeEdge): string {
  switch (edge) {
    case 'n': return css.resizeNorth!
    case 'ne': return css.resizeNorthEast!
    case 'e': return css.resizeEast!
    case 'se': return css.resizeSouthEast!
    case 's': return css.resizeSouth!
    case 'sw': return css.resizeSouthWest!
    case 'w': return css.resizeWest!
    case 'nw': return css.resizeNorthWest!
  }
}

function SectionPage({
  title,
  desc,
  action,
  children,
}: {
  title: string
  desc: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={css.sectionPage}>
      <div className={css.sectionHead}>
        <div className={css.sectionHeadText}>
          <h3>{title}</h3>
          <p>{desc}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={wide ? css.fieldWide : css.field}><span className={css.fieldLabel}>{label}</span>{children}</label>
}

function PromptField({
  label,
  value,
  max,
  onChange,
}: {
  label: string
  value: string
  max: number
  onChange: (value: string) => void
}) {
  return (
    <div className={css.promptField}>
      <div className={css.labelRow}>
        <span className={css.fieldLabel}>{label}</span>
        <span className={css.charCount}>{value.length} / {max}</span>
      </div>
      <textarea className={css.largeText} aria-label={label} value={value} onChange={event => { onChange(event.target.value) }} />
    </div>
  )
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className={css.switch}>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        onChange={event => { onChange(event.target.checked) }}
      />
      <span className={css.switchTrack} aria-hidden />
    </label>
  )
}

function BlockList({
  blocks,
  collapsed,
  onToggleCollapse,
  onChange,
  onRemove,
  t,
}: {
  blocks: readonly ProfileTextBlock[]
  collapsed: ReadonlySet<string>
  onToggleCollapse: (id: string) => void
  onChange: (id: string, patch: Partial<ProfileTextBlock>) => void
  onRemove: (id: string) => void
  t: Translate
}) {
  return (
    <div className={css.cards}>
      {blocks.length === 0 && <p className={css.muted}>{t('noBlocks')}</p>}
      {blocks.map(block => {
        const isCollapsed = collapsed.has(block.id)
        return (
          <article key={block.id} className={block.enabled ? css.blockCard : css.blockCardOff}>
            <div className={css.blockHead}>
              <button
                type="button"
                className={isCollapsed ? css.collapseCollapsed : css.collapse}
                aria-label={isCollapsed ? t('expand') : t('collapse')}
                onClick={() => { onToggleCollapse(block.id) }}
              >
                <IconChevronDownOutline14 />
              </button>
              <input
                className={css.blockTitle}
                aria-label={t('blockTitle')}
                value={block.title}
                onChange={event => { onChange(block.id, { title: event.target.value }) }}
              />
              <span className={css.charCount}>{block.content.length} {t('chars')}</span>
              <Switch
                label={t('enabled')}
                checked={block.enabled}
                onChange={enabled => { onChange(block.id, { enabled }) }}
              />
              <button type="button" className={css.iconButton} aria-label={t('remove')} onClick={() => { onRemove(block.id) }}>
                <IconTrashOutline16 size={14} />
              </button>
            </div>
            {!isCollapsed && (
              <textarea
                className={css.blockContent}
                aria-label={t('content')}
                value={block.content}
                onChange={event => { onChange(block.id, { content: event.target.value }) }}
              />
            )}
          </article>
        )
      })}
    </div>
  )
}
