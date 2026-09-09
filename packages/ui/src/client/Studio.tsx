import { useEffect, useId, useRef, useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {
  DigitalEmployeeStudioView, DigitalEmployeeProfileDraft,
  DigitalEmployeeProfileRevisionDetail, GetDigitalEmployeeProfileRevisionRequest, GetDigitalEmployeeProfileRevisionResult,
  SaveDigitalEmployeeProfileRequest, SaveDigitalEmployeeProfileResult,
  ActivateDigitalEmployeeProfileRequest, RollbackDigitalEmployeeProfileRequest,
  ArchiveDigitalEmployeeProfileRequest, RestoreDigitalEmployeeProfileRequest, MutateDigitalEmployeeProfileHeadResult,
  SpawnDigitalEmployeeRequest, SpawnDigitalEmployeeResult,
} from '@benz-ai-x/dsh-agent-team-ultra/client'
import { NS } from './locales.ts'
import css from './Studio.module.css'

export interface DigitalEmployeeStudioInjected {
  load: (id: SessionId) => Promise<RemoteResult<DigitalEmployeeStudioView>>
  save: (id: SessionId, request: SaveDigitalEmployeeProfileRequest) => Promise<RemoteResult<SaveDigitalEmployeeProfileResult>>
  revision: (id: SessionId, request: GetDigitalEmployeeProfileRevisionRequest) => Promise<RemoteResult<GetDigitalEmployeeProfileRevisionResult>>
  activate: (id: SessionId, request: ActivateDigitalEmployeeProfileRequest) => Promise<RemoteResult<MutateDigitalEmployeeProfileHeadResult>>
  rollback: (id: SessionId, request: RollbackDigitalEmployeeProfileRequest) => Promise<RemoteResult<MutateDigitalEmployeeProfileHeadResult>>
  archive: (id: SessionId, request: ArchiveDigitalEmployeeProfileRequest) => Promise<RemoteResult<MutateDigitalEmployeeProfileHeadResult>>
  restore: (id: SessionId, request: RestoreDigitalEmployeeProfileRequest) => Promise<RemoteResult<MutateDigitalEmployeeProfileHeadResult>>
  spawn: (id: SessionId, request: SpawnDigitalEmployeeRequest, signal?: AbortSignal) => Promise<RemoteResult<SpawnDigitalEmployeeResult>>
  openConversation: (id: SessionId, memberId: string) => Promise<void>
}
export type DigitalEmployeeStudioProps = PropsRuntime<'conversation.session.header.actions'>
  & DigitalEmployeeStudioInjected & PropsLocale<typeof NS>

function emptyDraft(): DigitalEmployeeProfileDraft {
  return { id: '', employeeName: '', displayName: '', description: '', continuationProvider: 'spawn',
    contextMode: 'fresh', persona: '', mission: '', toolPolicy: { mode: 'inherit', names: [] }, context: [], memory: [], hooks: [] }
}
function unwrap<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw new Error(result.error.message + ' (' + result.error.code + ')')
  return result.value
}
function business<T>(result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T {
  if (!result.ok) throw new Error(result.error.message + ' (' + result.error.code + ')')
  return result.value
}
function advancedOf(draft: DigitalEmployeeProfileDraft): string {
  return JSON.stringify({ context: draft.context, memory: draft.memory, hooks: draft.hooks, toolPolicy: draft.toolPolicy }, null, 2)
}

function launchIntentKey(sessionId: string, profileId: string, assignment: string): string {
  return 'ultra-b0.launch:' + JSON.stringify([sessionId, profileId, assignment.trim()])
}

/** Persist the intent before sending. Unknown transport outcomes survive closing/reopening the dialog. */
export function launchIntentId(sessionId: string, profileId: string, assignment: string, storage: Storage = sessionStorage): string {
  const key = launchIntentKey(sessionId, profileId, assignment)
  const prior = storage.getItem(key)
  if (prior !== null) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(prior)) throw new Error('Invalid stored launch UUID; do not retry with a replacement identity')
    return prior
  }
  const id = crypto.randomUUID()
  storage.setItem(key, id)
  return id
}

export function DigitalEmployeeStudio(props: DigitalEmployeeStudioProps) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => setOpen(false), [props.sessionId])
  return <>
    <button ref={trigger} type="button" onClick={() => setOpen(true)}>{props.t('title')}</button>
    {open && <StudioDialog key={props.sessionId} {...props} close={() => { setOpen(false); trigger.current?.focus() }} />}
  </>
}

function StudioDialog(props: DigitalEmployeeStudioProps & { close: () => void }) {
  const { sessionId, t } = props
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const life = useRef(new AbortController())
  const refreshGeneration = useRef(0)
  const [view, setView] = useState<DigitalEmployeeStudioView>()
  const [stale, setStale] = useState(false)
  const [draft, setDraft] = useState(emptyDraft)
  const [expected, setExpected] = useState<number | null>(null)
  const [advanced, setAdvanced] = useState(() => advancedOf(emptyDraft()))
  const [detail, setDetail] = useState<DigitalEmployeeProfileRevisionDetail>()
  const [revisionNumber, setRevisionNumber] = useState(1)
  const [assignment, setAssignment] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const selected = view?.profiles.find(row => row.head.profileId === draft.id)
  const active = !life.current.signal.aborted

  useEffect(() => {
    const controller = new AbortController()
    life.current = controller
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    void refresh(controller.signal)
    return () => controller.abort()
  }, [sessionId])

  async function refresh(signal = life.current.signal): Promise<void> {
    const generation = ++refreshGeneration.current
    try {
      const next = unwrap(await props.load(sessionId))
      if (signal.aborted || generation !== refreshGeneration.current) return
      setView(next)
      setStale(false)
    } catch (cause: unknown) {
      if (signal.aborted || generation !== refreshGeneration.current) return
      setStale(true)
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function perform(operation: (signal: AbortSignal) => Promise<void>): Promise<void> {
    if (busyRef.current) return
    const signal = life.current.signal
    busyRef.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try { await operation(signal) } catch (cause: unknown) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (!signal.aborted) { busyRef.current = false; setBusy(false) }
    }
  }

  function edit(profile: DigitalEmployeeProfileDraft, revision: number | null): void {
    setDraft(structuredClone(profile))
    setExpected(revision)
    setAdvanced(advancedOf(profile))
    setDetail(undefined)
  }

  async function save(signal: AbortSignal): Promise<void> {
    const fields = JSON.parse(advanced) as Pick<DigitalEmployeeProfileDraft, 'context' | 'memory' | 'hooks' | 'toolPolicy'>
    if (fields === null || typeof fields !== 'object' || Array.isArray(fields)
      || Object.keys(fields).some(key => !['context', 'memory', 'hooks', 'toolPolicy'].includes(key))) throw new Error(t('invalidAdvanced'))
    const value = business(unwrap(await props.save(sessionId, {
      expectedHeadRevision: expected, profile: { ...draft, ...fields },
    })))
    if (signal.aborted) return
    edit(value.revision.profile, value.head.headRevision)
    setNotice(t('saved'))
    await refresh(signal)
  }

  async function mutate(kind: 'activate' | 'rollback' | 'archive' | 'restore', signal: AbortSignal): Promise<void> {
    if (selected === undefined) return
    const base = { profileId: selected.head.profileId, expectedHeadRevision: selected.head.headRevision }
    const result = kind === 'activate' || kind === 'rollback'
      ? await props[kind](sessionId, { ...base, revision: kind === 'activate' ? selected.head.latestRevision : revisionNumber })
      : await props[kind](sessionId, base)
    business(unwrap(result))
    if (signal.aborted) return
    setNotice(t('done'))
    // Do not silently advance the editor's CAS token or discard unsaved text.
    await refresh(signal)
  }

  async function inspect(signal: AbortSignal): Promise<void> {
    if (selected === undefined) return
    const value = business(unwrap(await props.revision(sessionId, { profileId: selected.head.profileId, revision: revisionNumber })))
    if (!signal.aborted) setDetail(value)
  }

  async function launch(signal: AbortSignal): Promise<void> {
    if (selected === undefined) return
    const request = { profileId: selected.head.profileId, assignment,
      launchRequestId: launchIntentId(sessionId, selected.head.profileId, assignment) }
    let result: SpawnDigitalEmployeeResult
    try {
      result = unwrap(await props.spawn(sessionId, request, signal))
    } catch (cause: unknown) {
      throw new Error(t('launchUnknown') + ' ' + (cause instanceof Error ? cause.message : String(cause)))
    }
    const value = business(result)
    if (signal.aborted) return
    if (value.provisioningPhase === 'active' || value.provisioningPhase === 'failed') {
      const key = launchIntentKey(sessionId, request.profileId, request.assignment)
      if (sessionStorage.getItem(key) === request.launchRequestId) sessionStorage.removeItem(key)
    }
    if (value.provisioningPhase !== 'active') setError(value.error ?? value.provisioningPhase)
    else setNotice(t('done'))
    await refresh(signal)
  }

  const textFields = ['id', 'employeeName', 'displayName', 'description', 'persona', 'mission'] as const
  return <div className={css.backdrop}>
    <div className={css.dialog} ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); props.close() }
        if (event.key === 'Tab') {
          const items = [...panel.current!.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]')]
          const first = items[0], last = items.at(-1)
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
        }
      }}>
      <header><h2 id={titleId}>{t('title')}</h2><button type="button" onClick={props.close}>{t('close')}</button></header>
      <p>{t('manual')}</p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {stale && <p role="status">{t('stale')}</p>}
      <div className={css.actions}>
        <button disabled={busy} onClick={() => void perform(signal => refresh(signal))}>{t('refresh')}</button>
        <button disabled={busy} onClick={() => edit(emptyDraft(), null)}>{t('newProfile')}</button>
        {busy && <span role="status">{t('loading')}</span>}
      </div>
      <div className={css.columns}>
        <nav aria-label={t('profiles')}>
          {view?.profiles.map(row => <button key={row.head.profileId} disabled={busy}
            aria-pressed={selected === row} onClick={() => edit(row.latest.profile, row.head.headRevision)}>
            {row.latest.profile.displayName} · r{row.head.latestRevision}
            {row.head.archivedAt !== undefined ? ' · ' + t('archived') : ''}
          </button>)}
          {view?.profiles.length === 0 && <p>{t('empty')}</p>}
        </nav>
        <section>
          <form onSubmit={event => { event.preventDefault(); void perform(save) }}>
            <fieldset disabled={busy || !active}>
              {textFields.map(key => <label key={key}>{t(key)}
                {key === 'persona' || key === 'mission'
                  ? <textarea required value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })} />
                  : <input required disabled={key === 'id' && expected !== null} value={draft[key]}
                    onChange={event => setDraft({ ...draft, [key]: event.target.value })} />}
              </label>)}
              <label>{t('contextMode')}<select value={draft.contextMode} onChange={event => {
                const mode = event.target.value as 'fresh' | 'fork'
                setDraft({ ...draft, contextMode: mode, continuationProvider: mode === 'fork' ? 'fork' : 'spawn' })
              }}><option value="fresh">{t('fresh')}</option><option value="fork">{t('fork')}</option></select></label>
              <label>{t('advanced')}<textarea className={css.advanced} value={advanced} onChange={event => setAdvanced(event.target.value)} /></label>
              <button type="submit">{t('save')}</button>
            </fieldset>
          </form>
          {selected && <>
            <p>{t('candidate')}: r{selected.head.latestRevision} · {t('active')}: {selected.head.activeRevision ?? '—'}</p>
            <div className={css.actions}>
              <button disabled={busy || stale || selected.head.archivedAt !== undefined} onClick={() => void perform(signal => mutate('activate', signal))}>{t('activate')}</button>
              <button disabled={busy || stale} onClick={() => void perform(signal => mutate(selected.head.archivedAt === undefined ? 'archive' : 'restore', signal))}>{t(selected.head.archivedAt === undefined ? 'archive' : 'restore')}</button>
            </div>
            <h3>{t('history')}</h3>
            <p>{selected.history.map(row => 'r' + row.revision).join(', ')}</p>
            {selected.historyTruncated && <p>{t('historyTruncated')}</p>}
            <label>{t('revisionNumber')}<input type="number" min={1} value={revisionNumber} onChange={event => setRevisionNumber(Number(event.target.value))} /></label>
            <div className={css.actions}>
              <button disabled={busy} onClick={() => void perform(inspect)}>{t('inspect')}</button>
              <button disabled={busy || stale || selected.head.archivedAt !== undefined} onClick={() => void perform(signal => mutate('rollback', signal))}>{t('rollback')}</button>
            </div>
            {detail && <><pre>{JSON.stringify(detail, null, 2)}</pre><button disabled={busy}
              onClick={() => edit(detail.revision.profile, detail.head.headRevision)}>{t('loadRevision')}</button></>}
            <label>{t('assignment')}<textarea disabled={busy} value={assignment} onChange={event => setAssignment(event.target.value)} /></label>
            <button disabled={busy || stale || selected.head.activeRevision === undefined || selected.head.archivedAt !== undefined}
              onClick={() => void perform(launch)}>{t('launch')}</button>
          </>}
        </section>
      </div>
      <h3>{t('instances')}</h3>
      {view?.instances.map(instance => <article key={instance.memberName}>
        <p>{instance.memberName} · {instance.profileId} r{instance.profileRevision} · {instance.provisioningPhase} / {instance.presence}</p>
        <p>{instance.actualRoute ? instance.actualRoute.provider + ' / ' + instance.actualRoute.model : t('routeUnknown')}</p>
        {instance.error && <p>{instance.error}</p>}
        {instance.memberId && <button disabled={busy} onClick={() => void perform(() => props.openConversation(sessionId, instance.memberId!))}>{t('openConversation')}</button>}
      </article>)}
      {view?.instances.length === 0 && <p>{t('empty')}</p>}
    </div>
  </div>
}
