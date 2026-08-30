import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  DeleteDigitalEmployeeProfileResult,
  DigitalEmployeeProfile,
  DigitalEmployeeProfileDraft,
  DigitalEmployeeStudioView,
  ProfileHook,
  ProfileHookPoint,
  ProfileTextBlock,
  SaveDigitalEmployeeProfileRequest,
  SaveDigitalEmployeeProfileResult,
  SpawnDigitalEmployeeResult,
} from '@deepseek-ai/dsh-agent-team-ultra/client'
import type { RemoteFailure, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import {
  IconCloseOutline16,
  IconPlayOutline16,
  IconPlusOutline16,
  IconRefreshOutline14,
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
  remove: (
    sessionId: SessionId,
    profileId: string,
    expectedRevision: number,
  ) => Promise<RemoteResult<DeleteDigitalEmployeeProfileResult>>
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
type BusyOperation = 'save' | 'delete' | 'spawn'

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

function cloneProfile(profile: DigitalEmployeeProfile): DigitalEmployeeProfileDraft {
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

function failureText(error: Pick<RemoteFailure, 'code' | 'message'>): string {
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

function pointAdjusted(hook: ProfileHook, point: ProfileHookPoint): ProfileHook {
  if (point === 'session-start' || point === 'before-step') {
    const { matcher: _matcher, ...rest } = hook
    return { ...rest, point, effect: 'context' }
  }
  return {
    ...hook,
    point,
    effect: point === 'before-tool' ? 'deny' : 'context',
    matcher: hook.matcher?.trim() || '*',
  }
}

/** Conversation-header action and complete profile editor. */
export function DigitalEmployeeStudio({
  sessionId,
  load,
  save,
  remove,
  spawn,
  t,
}: DigitalEmployeeStudioProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<DigitalEmployeeStudioView | null>(null)
  const [draft, setDraft] = useState<DigitalEmployeeProfileDraft | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expectedRevision, setExpectedRevision] = useState<number | null>(null)
  const [assignment, setAssignment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<BusyOperation | null>(null)
  const sessionRef = useRef(sessionId)
  const selectedRef = useRef(selectedId)
  const refreshGeneration = useRef(0)
  const busyRef = useRef<BusyOperation | null>(null)
  const launchAbortRef = useRef<AbortController | null>(null)
  sessionRef.current = sessionId
  selectedRef.current = selectedId

  useEffect(() => {
    refreshGeneration.current += 1
    busyRef.current = null
    setOpen(false)
    setLoading(false)
    setView(null)
    setDraft(null)
    setSelectedId(null)
    setExpectedRevision(null)
    setAssignment('')
    setError(null)
    setNotice(null)
    setBusy(null)
    return () => {
      const controller = launchAbortRef.current
      launchAbortRef.current = null
      controller?.abort(new Error('Digital Employee Studio session changed'))
    }
  }, [sessionId])

  const select = useCallback((profile: DigitalEmployeeProfile, resetFeedback = true): void => {
    setSelectedId(profile.id)
    setExpectedRevision(profile.revision)
    setDraft(cloneProfile(profile))
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
      const selected = result.value.profiles.find(profile => profile.id === targetId)
      if (selected !== undefined) {
        select(selected)
      } else {
        setDraft(null)
        setSelectedId(null)
        setExpectedRevision(null)
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
      const result = await save(requestedSession, { expectedRevision, profile: draft })
      if (sessionRef.current !== requestedSession) return
      if (!result.ok) {
        setError(failureText(result.error))
      } else if (!result.value.ok) {
        setError(failureText(result.value.error))
        if (result.value.error.current !== undefined) select(result.value.error.current, false)
      } else {
        const id = result.value.value.id
        if (await refresh(id) && sessionRef.current === requestedSession) setNotice(t('saved'))
      }
    } catch (reason: unknown) {
      if (sessionRef.current === requestedSession) setError(`${t('transportFailure')} ${String(reason)}`)
    } finally {
      finish(requestedSession)
    }
  }

  const deleteDraft = async (): Promise<void> => {
    if (draft === null || expectedRevision === null || !begin('delete')) return
    const requestedSession = sessionId
    try {
      const result = await remove(requestedSession, draft.id, expectedRevision)
      if (sessionRef.current !== requestedSession) return
      if (!result.ok) {
        setError(failureText(result.error))
      } else if (!result.value.ok) {
        setError(failureText(result.value.error))
        if (result.value.error.current !== undefined) select(result.value.error.current, false)
      } else {
        setDraft(null)
        setSelectedId(null)
        setExpectedRevision(null)
        if (await refresh() && sessionRef.current === requestedSession) setNotice(t('deleted'))
      }
    } catch (reason: unknown) {
      if (sessionRef.current === requestedSession) setError(`${t('transportFailure')} ${String(reason)}`)
    } finally {
      finish(requestedSession)
    }
  }

  const launchDraft = async (): Promise<void> => {
    if (draft === null || expectedRevision === null || !begin('spawn')) return
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

  const profiles = view?.profiles ?? []
  const instances = view?.instances ?? []

  return (
    <div className={css.root} data-digital-employee-studio>
      <button
        type="button"
        className={css.trigger}
        aria-expanded={open}
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next) void refresh()
        }}
      >
        <IconUserOutline16 size={14} />
        <span>{t('trigger')}</span>
        {instances.length > 0 && <span className={css.count}>{instances.length}</span>}
      </button>

      {open && (
        <div className={css.panel} role="dialog" aria-label={t('title')}>
          <header className={css.toolbar}>
            <div>
              <strong>{t('title')}</strong>
              <p>{t('subtitle')}</p>
            </div>
            <span className={css.spacer} />
            <button type="button" className={css.iconButton} aria-label={t('refresh')} disabled={busy !== null || loading} onClick={() => { void refresh() }}>
              <IconRefreshOutline14 />
            </button>
            <button type="button" className={css.iconButton} aria-label={t('close')} onClick={() => { setOpen(false) }}>
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
                    setSelectedId(next.id)
                    setExpectedRevision(null)
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
                      key={profile.id}
                      className={profile.id === selectedId ? css.profileSelected : css.profile}
                      disabled={busy !== null}
                      onClick={() => { select(profile) }}
                    >
                      <strong>{profile.displayName}</strong>
                      <span>{profile.employeeName}</span>
                      <small>{t('revision')} {profile.revision}</small>
                    </button>
                  ))}
                </div>
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
                      <EditorSection title={t('basic')}>
                        <div className={css.grid}>
                          <Field label={t('profileId')}>
                            <input value={draft.id} disabled={expectedRevision !== null} onChange={event => { update('id', event.target.value) }} />
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
                          <Field label={t('contextMode')} wide>
                            <select value={draft.contextMode} onChange={event => { update('contextMode', event.target.value as 'fresh' | 'fork') }}>
                              <option value="fresh">{t('fresh')}</option>
                              <option value="fork">{t('fork')}</option>
                            </select>
                          </Field>
                        </div>
                      </EditorSection>

                      <EditorSection title={t('persona')}>
                        <textarea className={css.largeText} value={draft.persona} onChange={event => { update('persona', event.target.value) }} />
                      </EditorSection>
                      <EditorSection title={t('mission')}>
                        <textarea className={css.largeText} value={draft.mission} onChange={event => { update('mission', event.target.value) }} />
                      </EditorSection>

                      <EditorSection title={t('tools')}>
                        <div className={css.segmented}>
                          {(['inherit', 'allow', 'deny'] as const).map(mode => (
                            <button
                              type="button"
                              key={mode}
                              className={draft.toolPolicy.mode === mode ? css.segmentActive : css.segment}
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
                      </EditorSection>

                      {(['context', 'memory'] as const).map(collection => (
                        <EditorSection
                          key={collection}
                          title={t(collection)}
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
                            onChange={(id, value) => { updateBlock(collection, id, value) }}
                            onRemove={id => { removeBlock(collection, id) }}
                            t={t}
                          />
                        </EditorSection>
                      ))}

                      <EditorSection
                        title={t('hooks')}
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
                          {draft.hooks.map(hook => (
                            <article key={hook.id} className={css.card}>
                              <div className={css.cardTop}>
                                <label className={css.check}>
                                  <input type="checkbox" checked={hook.enabled} onChange={event => { updateHook(hook.id, { enabled: event.target.checked }) }} />
                                  {t('enabled')}
                                </label>
                                <button type="button" className={css.iconButton} onClick={() => { update('hooks', draft.hooks.filter(item => item.id !== hook.id)) }}>
                                  <IconTrashOutline16 size={14} />
                                </button>
                              </div>
                              <div className={css.grid}>
                                <Field label={t('hookPoint')}>
                                  <select
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
                                </Field>
                                <Field label={t('hookEffect')}>
                                  <input value={t(hook.effect === 'deny' ? 'denyEffect' : 'contextEffect')} disabled />
                                </Field>
                                {(hook.point === 'before-tool' || hook.point === 'after-tool') && (
                                  <Field label={t('matcher')} wide>
                                    <input value={hook.matcher ?? '*'} onChange={event => { updateHook(hook.id, { matcher: event.target.value }) }} />
                                  </Field>
                                )}
                                <Field label={t('content')} wide>
                                  <textarea value={hook.text} onChange={event => { updateHook(hook.id, { text: event.target.value }) }} />
                                </Field>
                              </div>
                            </article>
                          ))}
                        </div>
                      </EditorSection>

                      <footer className={css.actions}>
                        <button type="button" className={css.dangerButton} disabled={expectedRevision === null || busy !== null} onClick={() => { void deleteDraft() }}>
                          <IconTrashOutline16 size={14} /> {t('remove')}
                        </button>
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
                        <button type="button" className={css.primaryButton} disabled={expectedRevision === null || busy !== null} onClick={() => { void launchDraft() }}>
                          <IconPlayOutline16 size={14} /> {busy === 'spawn' ? t('launching') : t('launch')}
                        </button>
                      </footer>
                    </>
                  )}
              </main>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EditorSection({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={css.section}>
      <div className={css.sectionTitle}><h3>{title}</h3>{action}</div>
      {children}
    </section>
  )
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={wide ? css.fieldWide : css.field}><span>{label}</span>{children}</label>
}

function BlockList({
  blocks,
  onChange,
  onRemove,
  t,
}: {
  blocks: readonly ProfileTextBlock[]
  onChange: (id: string, patch: Partial<ProfileTextBlock>) => void
  onRemove: (id: string) => void
  t: Translate
}) {
  return (
    <div className={css.cards}>
      {blocks.map(block => (
        <article key={block.id} className={css.card}>
          <div className={css.cardTop}>
            <label className={css.check}>
              <input type="checkbox" checked={block.enabled} onChange={event => { onChange(block.id, { enabled: event.target.checked }) }} />
              {t('enabled')}
            </label>
            <button type="button" className={css.iconButton} onClick={() => { onRemove(block.id) }}>
              <IconTrashOutline16 size={14} />
            </button>
          </div>
          <div className={css.grid}>
            <Field label={t('blockTitle')} wide>
              <input value={block.title} onChange={event => { onChange(block.id, { title: event.target.value }) }} />
            </Field>
            <Field label={t('content')} wide>
              <textarea value={block.content} onChange={event => { onChange(block.id, { content: event.target.value }) }} />
            </Field>
          </div>
        </article>
      ))}
    </div>
  )
}
