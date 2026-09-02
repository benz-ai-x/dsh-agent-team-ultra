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
  GetDigitalEmployeeProfileRevisionResult,
  MutateDigitalEmployeeProfileHeadResult,
  DigitalEmployeeProfileCatalogEntry,
  DigitalEmployeeProfileDraft,
  DigitalEmployeeProfileRevisionDetail,
  DigitalEmployeeStudioView,
  ProfileHook,
  ProfileHookPoint,
  ProfileTextBlock,
  SaveDigitalEmployeeProfileRequest,
  SaveDigitalEmployeeProfileResult,
  SpawnDigitalEmployeeResult,
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
    profileId: string,
    assignment: string,
    signal?: AbortSignal,
  ) => Promise<RemoteResult<SpawnDigitalEmployeeResult>>
}

export type DigitalEmployeeStudioProps =
  PropsRuntime<'conversation.session.header.actions'>
  & DigitalEmployeeStudioInjected
  & PropsLocale<typeof NS>

type Translate = DigitalEmployeeStudioProps['t']
type BusyOperation = 'save' | 'activate' | 'rollback' | 'archive' | 'restore' | 'spawn'
type SectionId = 'identity' | 'persona' | 'tools' | 'context' | 'memory' | 'hooks' | 'revisions'
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

const SECTION_ORDER: readonly SectionId[] = ['identity', 'persona', 'tools', 'context', 'memory', 'hooks', 'revisions']
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
    provider: 'spawn',
    contextMode: 'fresh',
    persona: 'Act as a reliable specialist. State assumptions and report concrete outcomes.',
    mission: 'Complete delegated work while coordinating clearly with the Team Lead.',
    toolPolicy: { mode: 'inherit', names: [] },
    context: [],
    memory: [],
    hooks: [],
  }
}

function cloneProfile(profile: DigitalEmployeeProfileDraft): DigitalEmployeeProfileDraft {
  return {
    id: profile.id,
    employeeName: profile.employeeName,
    displayName: profile.displayName,
    description: profile.description,
    provider: profile.provider,
    contextMode: profile.contextMode,
    persona: profile.persona,
    mission: profile.mission,
    toolPolicy: { mode: profile.toolPolicy.mode, names: [...profile.toolPolicy.names] },
    context: profile.context.map(block => ({ ...block })),
    memory: profile.memory.map(block => ({ ...block })),
    hooks: profile.hooks.map(hook => ({ ...hook })),
  }
}

function failureText(error: { readonly code: string; readonly message: string }): string {
  return `${error.message} (${error.code})`
}

function instanceStatusKey(phase: 'pending' | 'active' | 'failed'): UltraKey {
  return phase
}

function hookPointLabel(point: ProfileHookPoint, t: Translate): string {
  switch (point) {
    case 'session-start': return t('sessionStart')
    case 'before-step': return t('beforeStep')
    case 'before-tool': return t('beforeTool')
    case 'after-tool': return t('afterTool')
  }
}

function hookEffectOf(point: ProfileHookPoint): 'context' | 'deny' {
  return point === 'before-tool' ? 'deny' : 'context'
}

function isToolPoint(point: ProfileHookPoint): boolean {
  return point === 'before-tool' || point === 'after-tool'
}

function pointAdjusted(hook: ProfileHook, point: ProfileHookPoint): ProfileHook {
  if (!isToolPoint(point)) {
    const { matcher: _matcher, ...rest } = hook
    return { ...rest, point, effect: 'context' }
  }
  return {
    ...hook,
    point,
    effect: hookEffectOf(point),
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
    default: return null
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
  t,
}: DigitalEmployeeStudioProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<DigitalEmployeeStudioView | null>(null)
  const [draft, setDraft] = useState<DigitalEmployeeProfileDraft | null>(null)
  const [baseline, setBaseline] = useState<string | null>(null)
  const [section, setSection] = useState<SectionId>('identity')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expectedHeadRevision, setExpectedHeadRevision] = useState<number | null>(null)
  const [revisionDetail, setRevisionDetail] = useState<DigitalEmployeeProfileRevisionDetail | null>(null)
  const [revisionLoading, setRevisionLoading] = useState(false)
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
  const busyRef = useRef<BusyOperation | null>(null)
  const launchAbortRef = useRef<AbortController | null>(null)
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
    windowInteractionRef.current = null
    setOpen(false)
    setLoading(false)
    setView(null)
    setDraft(null)
    setBaseline(null)
    setSection('identity')
    setSelectedId(null)
    setExpectedHeadRevision(null)
    setRevisionDetail(null)
    setRevisionLoading(false)
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
    const next = cloneProfile(entry.latest.profile)
    revisionGeneration.current += 1
    setSelectedId(entry.head.profileId)
    setExpectedHeadRevision(entry.head.headRevision)
    setRevisionDetail(null)
    setRevisionLoading(false)
    setDraft(next)
    setBaseline(JSON.stringify(next))
    setAssignment('')
    if (resetFeedback) {
      setError(null)
      setNotice(null)
    }
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
        setBaseline(null)
        setSelectedId(null)
        setExpectedHeadRevision(null)
        setRevisionDetail(null)
        setRevisionLoading(false)
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
    if (draft === null || !begin('save')) return
    const requestedSession = sessionId
    try {
      const result = await save(requestedSession, { expectedHeadRevision, profile: draft })
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

  const mutateHead = async (
    operation: Exclude<BusyOperation, 'save' | 'spawn'>,
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
    const controller = new AbortController()
    launchAbortRef.current = controller
    try {
      const result = await spawn(requestedSession, requestedProfileId, assignment, controller.signal)
      if (sessionRef.current !== requestedSession) return
      if (!result.ok) {
        setError(failureText(result.error))
      } else if (!result.value.ok) {
        setError(failureText(result.value.error))
      } else {
        setAssignment('')
        if (await refresh(requestedProfileId) && sessionRef.current === requestedSession) setNotice(t('launched'))
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
  const selectedEntry = profiles.find(profile => profile.head.profileId === selectedId)
  const dirty = draft !== null && baseline !== null && JSON.stringify(draft) !== baseline
  const canLaunch = selectedEntry !== undefined
    && selectedEntry.head.activeRevision !== undefined
    && selectedEntry.head.archivedAt === undefined

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
                    setDraft(next)
                    setBaseline(JSON.stringify(next))
                    setSection('identity')
                    setSelectedId(next.id)
                    setExpectedHeadRevision(null)
                    setRevisionDetail(null)
                    setRevisionLoading(false)
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
                      <StateDot state={instance.phase === 'failed' ? 'error' : instance.phase === 'pending' ? 'ongoing' : 'done'} />
                      <span>
                        <strong>{instance.memberName}</strong>
                        <small>{t(instanceStatusKey(instance.phase))} · r{instance.profileRevision}</small>
                        {instance.error !== undefined && <small className={css.diagnostic}>{instance.error}</small>}
                      </span>
                    </div>
                  ))}
                </div>
              </aside>

              <main className={css.editor}>
                {draft === null
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
                              <Field label={t('provider')}>
                                <input value={draft.provider} onChange={event => { update('provider', event.target.value) }} />
                              </Field>
                              <Field label={t('description')} wide>
                                <input value={draft.description} onChange={event => { update('description', event.target.value) }} />
                              </Field>
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
                                    <span className={hook.effect === 'deny' ? css.badgeDeny : css.badgeInject}>
                                      {t(hook.effect === 'deny' ? 'denyEffect' : 'contextEffect')}
                                    </span>
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
                              {selectedEntry.head.archivedAt !== undefined && <span>{t('archived')}</span>}
                            </div>
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
                                          disabled={busy !== null}
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
                        <button type="button" className={css.secondaryButton} disabled={busy !== null} onClick={() => { void saveDraft() }}>
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
