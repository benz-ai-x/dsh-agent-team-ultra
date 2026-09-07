import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-experimental-client-ui-agent-team/client'
import type {
  GetTeamMessageRequest,
  ListTeamMessagesRequest,
  SubmitTeamMessageRequest,
  SubmitTeamMessageResult,
  TeamMessageCursor,
  TeamMessageDetail,
  TeamMessageFilters,
  TeamMessagePage,
  TeamMessageRequestId,
  TeamView,
} from '@deepseek-ai/dsh-experimental-agent-team/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import css from './TeamMessageCenter.module.css'

const PAGE_SIZE = 20
const SUBMISSION_DEADLINE_MS = 15_000

/** Generated Team Remote operations used by the public message-center view. */
export interface TeamMessageCenterInjected {
  loadTeam: (sessionId: SessionId) => Promise<RemoteResult<TeamView>>
  watch: (sessionId: SessionId, sink: TeamMessageCenterWatchSink) => TeamMessageCenterWatchControl
  listMessages: (sessionId: SessionId, request: ListTeamMessagesRequest) => Promise<RemoteResult<TeamMessagePage>>
  getMessage: (sessionId: SessionId, request: GetTeamMessageRequest) => Promise<RemoteResult<TeamMessageDetail>>
  sendMessage: (
    sessionId: SessionId,
    request: SubmitTeamMessageRequest,
    signal: AbortSignal,
  ) => Promise<RemoteResult<SubmitTeamMessageResult>>
}

/** Reconnecting Team change stream destinations for one message-center generation. */
export interface TeamMessageCenterWatchSink {
  replace(value: TeamView): void
  invalidated(): void
  stale(): void
  failed(error: unknown): void
}

/** Minimal lifecycle owned by one mounted message-center generation. */
export interface TeamMessageCenterWatchControl {
  start(): void
  dispose(): Promise<void>
}

/** Props composed by the Agent Teams child Slot. */
export type TeamMessageCenterProps = PropsRuntime<'agent-team.panel.view'>
  & TeamMessageCenterInjected & PropsLocale<typeof NS>

interface FilterDraft {
  readonly memberId: string
  readonly direction: '' | 'sent' | 'received'
  readonly delivery: '' | 'pending' | 'delivered' | 'unknown'
}

const EMPTY_FILTERS: FilterDraft = { memberId: '', direction: '', delivery: '' }

interface MessageDraft {
  readonly recipientId: string
  readonly replyTo: string
  readonly text: string
}

type SubmissionPhase = 'editing' | 'submitting' | 'unknown' | 'rejected' | 'accepted'
type TeamMessageWatchPhase = 'connecting' | 'connected' | 'stale' | 'disconnected' | 'unavailable'

interface StoredMessageIntent {
  readonly version: 1
  readonly request: SubmitTeamMessageRequest
}

type IntentStorageResult = { readonly ok: true } | { readonly ok: false; readonly reason: string }

const EMPTY_MESSAGE: MessageDraft = { recipientId: '', replyTo: '', text: '' }
const INTENT_KEY = 'dsh-agent-team-ultra.message-intent.v1'

function failureText(prefix: string, error: { readonly code: string; readonly message: string }): string {
  return `${prefix}: ${error.message} (${error.code})`
}

function filtersOf(draft: FilterDraft): TeamMessageFilters | undefined {
  if (draft.memberId === '' && draft.direction === '' && draft.delivery === '') return undefined
  return {
    ...(draft.memberId === '' ? {} : { memberId: draft.memberId as SessionId }),
    ...(draft.direction === '' ? {} : { direction: draft.direction }),
    ...(draft.delivery === '' ? {} : { delivery: draft.delivery }),
  }
}

function pageRequest(filters: TeamMessageFilters | undefined, cursor?: TeamMessageCursor): ListTeamMessagesRequest {
  return {
    limit: PAGE_SIZE,
    ...(filters === undefined ? {} : { filters }),
    ...(cursor === undefined ? {} : { cursor }),
  }
}

function intentKey(teamSessionId: SessionId): string {
  return `${INTENT_KEY}:${encodeURIComponent(teamSessionId)}`
}

function readIntent(teamSessionId: SessionId): SubmitTeamMessageRequest | null {
  try {
    const encoded = globalThis.sessionStorage?.getItem(intentKey(teamSessionId))
    if (encoded === null || encoded === undefined) return null
    const value: unknown = JSON.parse(encoded)
    if (value === null || typeof value !== 'object') return null
    const stored = value as Partial<StoredMessageIntent>
    const request = stored.request as Partial<SubmitTeamMessageRequest> | undefined
    if (stored.version !== 1 || request === undefined
      || typeof request.requestId !== 'string' || request.requestId.length === 0
      || typeof request.recipientId !== 'string' || request.recipientId.length === 0
      || typeof request.text !== 'string'
      || (request.replyTo !== undefined && typeof request.replyTo !== 'string')) return null
    return request as SubmitTeamMessageRequest
  } catch {
    return null
  }
}

function storageFailureReason(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}

function storeIntent(teamSessionId: SessionId, request: SubmitTeamMessageRequest | null): IntentStorageResult {
  try {
    const storage = globalThis.sessionStorage
    if (storage === undefined) return { ok: false, reason: 'sessionStorage is unavailable' }
    const key = intentKey(teamSessionId)
    if (request === null) {
      storage.removeItem(key)
      return { ok: true }
    }
    const encoded = JSON.stringify({ version: 1, request } satisfies StoredMessageIntent)
    let writeFailure: unknown = null
    try {
      storage.setItem(key, encoded)
    } catch (error: unknown) {
      writeFailure = error
    }
    if (storage.getItem(key) === encoded) return { ok: true }
    return {
      ok: false,
      reason: writeFailure === null
        ? 'sessionStorage did not retain the exact message intent'
        : storageFailureReason(writeFailure),
    }
  } catch (error: unknown) {
    return { ok: false, reason: storageFailureReason(error) }
  }
}

function requestId(): TeamMessageRequestId {
  return globalThis.crypto.randomUUID() as TeamMessageRequestId
}

/** Browse Host-authorized persisted Team messages without copying them into Studio state. */
export function TeamMessageCenter({
  teamSessionId, loadTeam, watch, listMessages, getMessage, sendMessage, t,
}: TeamMessageCenterProps) {
  const [team, setTeam] = useState<TeamView | null>(null)
  const [page, setPage] = useState<TeamMessagePage | null>(null)
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<TeamMessageFilters | undefined>()
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [rosterError, setRosterError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<TeamMessageDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailUnavailable, setDetailUnavailable] = useState(false)
  const [messageDraft, setMessageDraft] = useState<MessageDraft>(EMPTY_MESSAGE)
  const [intent, setIntent] = useState<SubmitTeamMessageRequest | null>(null)
  const [submissionPhase, setSubmissionPhase] = useState<SubmissionPhase>('editing')
  const [submission, setSubmission] = useState<Extract<SubmitTeamMessageResult, { ok: true }>['value'] | null>(null)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [watchPhase, setWatchPhase] = useState<TeamMessageWatchPhase>('connecting')
  const sessionRef = useRef(teamSessionId)
  const initializedSessionRef = useRef<SessionId | null>(null)
  const publishedRef = useRef(false)
  const appliedFiltersRef = useRef<TeamMessageFilters | undefined>()
  const watchGeneration = useRef(0)
  const teamGeneration = useRef(0)
  const listGeneration = useRef(0)
  const detailGeneration = useRef(0)
  const submissionGeneration = useRef(0)
  const submitting = useRef(false)
  const interruptedSubmission = useRef(false)
  const submissionController = useRef<AbortController | null>(null)
  const submissionDeadline = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  sessionRef.current = teamSessionId

  const resetDetail = useCallback((): void => {
    detailGeneration.current += 1
    setSelectedId(null)
    setDetail(null)
    setDetailLoading(false)
    setDetailUnavailable(false)
    setDetailError(null)
  }, [])

  const loadPage = useCallback(async (
    requestedSession: SessionId,
    filters: TeamMessageFilters | undefined,
    mode: 'replace' | 'append',
    cursor?: TeamMessageCursor,
  ): Promise<void> => {
    const generation = ++listGeneration.current
    if (mode === 'replace') setLoading(true)
    else setLoadingMore(true)
    const result = await listMessages(requestedSession, pageRequest(filters, cursor))
    if (sessionRef.current !== requestedSession || listGeneration.current !== generation) return
    setLoading(false)
    setLoadingMore(false)
    if (!result.ok) {
      setListError(failureText(t('messageLoadError'), result.error))
      return
    }
    setListError(null)
    publishedRef.current = true
    setPage((current) => {
      if (mode === 'replace' || current === null) return result.value
      const seen = new Set(current.items.map(item => item.id))
      return {
        ...result.value,
        items: [...current.items, ...result.value.items.filter(item => !seen.has(item.id))],
        committedCursor: current.committedCursor,
      }
    })
  }, [listMessages, t])

  const loadRoster = useCallback(async (requestedSession: SessionId): Promise<void> => {
    const generation = ++teamGeneration.current
    const result = await loadTeam(requestedSession)
    if (sessionRef.current !== requestedSession || teamGeneration.current !== generation) return
    if (result.ok) {
      publishedRef.current = true
      setTeam(result.value)
      setRosterError(null)
    } else {
      setRosterError(failureText(t('messageLoadError'), result.error))
    }
  }, [loadTeam, t])

  useEffect(() => {
    const requestedSession = teamSessionId
    const changedTeam = initializedSessionRef.current !== requestedSession
    const wasInterrupted = interruptedSubmission.current
    interruptedSubmission.current = false
    initializedSessionRef.current = requestedSession
    submissionGeneration.current += 1
    watchGeneration.current += 1
    submitting.current = false
    if (submissionDeadline.current !== null) {
      globalThis.clearTimeout(submissionDeadline.current)
      submissionDeadline.current = null
    }
    submissionController.current?.abort(new Error('Team message composer changed session'))
    submissionController.current = null
    if (changedTeam) {
      const savedIntent = readIntent(requestedSession)
      appliedFiltersRef.current = undefined
      publishedRef.current = false
      setTeam(null)
      setPage(null)
      setDraft(EMPTY_FILTERS)
      setAppliedFilters(undefined)
      setMessageDraft(savedIntent === null ? EMPTY_MESSAGE : {
        recipientId: savedIntent.recipientId,
        replyTo: savedIntent.replyTo ?? '',
        text: savedIntent.text,
      })
      setIntent(savedIntent)
      setSubmissionPhase(savedIntent === null ? 'editing' : 'unknown')
      setSubmission(null)
      setSubmissionError(null)
    } else if (wasInterrupted) {
      setSubmission(null)
      setSubmissionError(null)
      setSubmissionPhase('unknown')
    }
    setLoadingMore(false)
    setRosterError(null)
    setListError(null)
    setWatchPhase('connecting')
    resetDetail()
    void loadPage(requestedSession, appliedFiltersRef.current, 'replace')
    void loadRoster(requestedSession)
    return () => {
      submissionGeneration.current += 1
      interruptedSubmission.current = submitting.current
      submitting.current = false
      if (submissionDeadline.current !== null) {
        globalThis.clearTimeout(submissionDeadline.current)
        submissionDeadline.current = null
      }
      submissionController.current?.abort(new Error('Team message composer unmounted'))
      submissionController.current = null
    }
  }, [loadPage, loadRoster, resetDetail, teamSessionId])

  useEffect(() => {
    const requestedSession = teamSessionId
    const generation = ++watchGeneration.current
    const current = (): boolean => sessionRef.current === requestedSession
      && watchGeneration.current === generation
    setWatchPhase('connecting')
    const control = watch(requestedSession, {
      replace(next) {
        if (!current()) return
        teamGeneration.current += 1
        publishedRef.current = true
        setTeam(next)
        setRosterError(null)
        setWatchPhase('connected')
        resetDetail()
        void loadPage(requestedSession, appliedFiltersRef.current, 'replace')
      },
      invalidated() {
        if (!current()) return
        setWatchPhase('connected')
        resetDetail()
        void loadPage(requestedSession, appliedFiltersRef.current, 'replace')
        void loadRoster(requestedSession)
      },
      stale() {
        if (current()) setWatchPhase(publishedRef.current ? 'stale' : 'disconnected')
      },
      failed() {
        if (current()) setWatchPhase('unavailable')
      },
    })
    control.start()
    return () => {
      if (watchGeneration.current === generation) watchGeneration.current += 1
      void control.dispose()
    }
  }, [loadPage, loadRoster, resetDetail, teamSessionId, watch])

  const submitIntent = async (request: SubmitTeamMessageRequest): Promise<void> => {
    if (submitting.current) return
    submitting.current = true
    const requestedSession = teamSessionId
    const retained = storeIntent(requestedSession, request)
    if (!retained.ok) {
      submitting.current = false
      setSubmissionError(`${t('messageIntentStorageFailure')} ${retained.reason}`)
      return
    }
    const generation = ++submissionGeneration.current
    const controller = new AbortController()
    submissionController.current = controller
    setIntent(request)
    setSubmission(null)
    setSubmissionError(null)
    setSubmissionPhase('submitting')
    let rejectOnAbort: (() => void) | null = null
    let deadline: ReturnType<typeof globalThis.setTimeout> | null = null
    try {
      const aborted = new Promise<never>((_resolve, reject) => {
        rejectOnAbort = () => {
          reject(controller.signal.reason ?? new Error(t('messageSendDeadlineExceeded')))
        }
        controller.signal.addEventListener('abort', rejectOnAbort, { once: true })
      })
      deadline = globalThis.setTimeout(() => {
        controller.abort(new Error(t('messageSendDeadlineExceeded')))
      }, SUBMISSION_DEADLINE_MS)
      submissionDeadline.current = deadline
      const result = await Promise.race([
        sendMessage(requestedSession, request, controller.signal),
        aborted,
      ])
      if (sessionRef.current !== requestedSession || submissionGeneration.current !== generation) return
      if (!result.ok) {
        setSubmissionPhase('unknown')
        setSubmissionError(failureText(t('messageSendUnknown'), result.error))
        return
      }
      if (!result.value.ok) {
        setSubmissionPhase('rejected')
        setSubmissionError(failureText(t('messageSendRejected'), result.value.error))
        return
      }
      storeIntent(requestedSession, null)
      setSubmission(result.value.value)
      setSubmissionPhase('accepted')
      setPage(null)
      resetDetail()
      void loadPage(requestedSession, appliedFilters, 'replace')
      void loadRoster(requestedSession)
    } catch (error: unknown) {
      if (sessionRef.current !== requestedSession || submissionGeneration.current !== generation) return
      setSubmissionPhase('unknown')
      setSubmissionError(`${t('messageSendUnknown')}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (rejectOnAbort !== null) controller.signal.removeEventListener('abort', rejectOnAbort)
      if (deadline !== null) globalThis.clearTimeout(deadline)
      if (submissionDeadline.current === deadline) submissionDeadline.current = null
      if (submissionGeneration.current === generation) {
        submitting.current = false
        if (submissionController.current === controller) submissionController.current = null
      }
    }
  }

  const sendDraft = (): void => {
    if (messageDraft.recipientId === '' || messageDraft.text.trim().length === 0) return
    const request: SubmitTeamMessageRequest = {
      requestId: requestId(),
      recipientId: messageDraft.recipientId as SessionId,
      text: messageDraft.text,
      ...(messageDraft.replyTo === '' ? {} : {
        replyTo: messageDraft.replyTo as NonNullable<SubmitTeamMessageRequest['replyTo']>,
      }),
    }
    void submitIntent(request)
  }

  const retryIntent = (): void => {
    if (intent !== null) void submitIntent(intent)
  }

  const startNewIntent = (): void => {
    submissionGeneration.current += 1
    submitting.current = false
    if (submissionDeadline.current !== null) {
      globalThis.clearTimeout(submissionDeadline.current)
      submissionDeadline.current = null
    }
    submissionController.current?.abort(new Error('Operator started a new Team message intent'))
    submissionController.current = null
    storeIntent(teamSessionId, null)
    setIntent(null)
    setSubmission(null)
    setSubmissionError(null)
    setSubmissionPhase('editing')
  }

  const applyFilters = (): void => {
    const filters = filtersOf(draft)
    appliedFiltersRef.current = filters
    setAppliedFilters(filters)
    setPage(null)
    resetDetail()
    void loadPage(teamSessionId, filters, 'replace')
  }

  const selectMessage = async (messageId: string): Promise<void> => {
    if (page === null) return
    const requestedSession = teamSessionId
    const generation = ++detailGeneration.current
    setSelectedId(messageId)
    setDetail(null)
    setDetailUnavailable(false)
    setDetailError(null)
    setDetailLoading(true)
    const result = await getMessage(requestedSession, {
      messageId: messageId as TeamMessageDetail['id'],
      committedCursor: page.committedCursor,
    })
    if (sessionRef.current !== requestedSession || detailGeneration.current !== generation) return
    setDetailLoading(false)
    if (result.ok) {
      setDetail(result.value)
      setDetailError(null)
    } else {
      setDetailUnavailable(true)
      setDetailError(failureText(t('messageLoadError'), result.error))
    }
  }

  const stageText = (stage: TeamMessageDetail['delivery']['stage']): string => {
    switch (stage) {
      case 'pending': return t('messagePending')
      case 'delivered': return t('messageDelivered')
      case 'unknown': return t('messageUnknown')
    }
  }

  return (
    <section className={css.root} aria-label={t('messagesTitle')}>
      <div className={css.heading}>
        <div>
          <h3>{t('messagesTitle')}</h3>
          <p>{t('messagesDescription')}</p>
        </div>
        <button type="button" onClick={() => {
          setPage(null)
          resetDetail()
          void loadPage(teamSessionId, appliedFilters, 'replace')
          void loadRoster(teamSessionId)
        }}>{t('refreshMessages')}</button>
      </div>

      <form className={css.composer} onSubmit={(event) => {
        event.preventDefault()
        sendDraft()
      }}>
        <div className={css.composeGrid}>
          <label>
            {t('messageRecipient')}
            <select
              value={messageDraft.recipientId}
              disabled={submissionPhase !== 'editing'}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                setMessageDraft(current => ({ ...current, recipientId: event.target.value }))
              }}
            >
              <option value="">{t('chooseMessageRecipient')}</option>
              {team?.members.filter(member => member.role === 'teammate'
                && member.status !== 'provisioning' && member.status !== 'failed')
                .map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
          </label>
          <label>
            {t('messageReplyTo')}
            <select
              value={messageDraft.replyTo}
              disabled={submissionPhase !== 'editing'}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                const replyTo = event.target.value
                const message = page?.items.find(item => item.id === replyTo)
                const inferredRecipient = message === undefined
                  ? undefined
                  : message.sender.id === teamSessionId ? message.recipient.id : message.sender.id
                setMessageDraft(current => ({
                  ...current,
                  replyTo,
                  ...(inferredRecipient === undefined || inferredRecipient === teamSessionId
                    ? {}
                    : { recipientId: inferredRecipient }),
                }))
              }}
            >
              <option value="">{t('noMessageReply')}</option>
              {messageDraft.replyTo !== '' && !page?.items.some(item => item.id === messageDraft.replyTo) && (
                <option value={messageDraft.replyTo}>{messageDraft.replyTo}</option>
              )}
              {page?.items.map(item => (
                <option key={item.id} value={item.id}>{item.sender.name} → {item.recipient.name} · {item.id}</option>
              ))}
            </select>
          </label>
        </div>
        <label className={css.messageText}>
          {t('messageText')}
          <textarea
            value={messageDraft.text}
            disabled={submissionPhase !== 'editing'}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
              setMessageDraft(current => ({ ...current, text: event.target.value }))
            }}
          />
        </label>
        <div className={css.composeActions}>
          {submissionPhase === 'editing' && (
            <button
              type="submit"
              disabled={messageDraft.recipientId === '' || messageDraft.text.trim().length === 0}
            >{t('sendMessage')}</button>
          )}
          {submissionPhase === 'submitting' && <span>{t('messageSubmitting')}</span>}
          {submissionPhase === 'unknown' && (
            <>
              <button type="button" onClick={retryIntent}>{t('retryMessage')}</button>
              <button type="button" onClick={startNewIntent}>{t('newMessageIntent')}</button>
            </>
          )}
          {(submissionPhase === 'rejected' || submissionPhase === 'accepted') && (
            <button type="button" onClick={startNewIntent}>{t('newMessageIntent')}</button>
          )}
        </div>
        {submissionPhase === 'unknown' && <div className={css.notice}>{t('messageSubmissionUnknown')}</div>}
        {submissionPhase === 'rejected' && <div className={css.notice}>{t('messageSubmissionRejected')}</div>}
        {submission !== null && (
          <div className={css.notice}>
            {submission.delivery.stage === 'pending'
              ? t('messageAcceptedPending')
              : submission.delivery.stage === 'delivered'
                ? t('messageAcceptedDelivered')
                : t('messageAcceptedUnknown')}
          </div>
        )}
        {intent !== null && (
          <div className={css.intent} aria-label={t('savedMessageIntent')}>
            <span>{t('messageRequestId')}: <code>{intent.requestId}</code></span>
            <span>{t('messageRecipient')}: <code>{intent.recipientId}</code></span>
            {intent.replyTo !== undefined && <span>{t('messageReplyTo')}: <code>{intent.replyTo}</code></span>}
          </div>
        )}
        {submissionError !== null && <div className={css.error} role="alert">{submissionError}</div>}
      </form>

      <div className={css.filters}>
        <label>
          {t('messageMember')}
          <select value={draft.memberId} onChange={(event: ChangeEvent<HTMLSelectElement>) => {
            const memberId = event.target.value
            setDraft(current => ({ ...current, memberId, ...(memberId === '' ? { direction: '' } : {}) }))
          }}>
            <option value="">{t('allMembers')}</option>
            {team?.members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </label>
        <label>
          {t('messageDirection')}
          <select
            value={draft.direction}
            disabled={draft.memberId === ''}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => {
              setDraft(current => ({ ...current, direction: event.target.value as FilterDraft['direction'] }))
            }}
          >
            <option value="">{t('allDirections')}</option>
            <option value="sent">{t('directionSent')}</option>
            <option value="received">{t('directionReceived')}</option>
          </select>
        </label>
        <label>
          {t('messageDelivery')}
          <select value={draft.delivery} onChange={(event: ChangeEvent<HTMLSelectElement>) => {
            setDraft(current => ({ ...current, delivery: event.target.value as FilterDraft['delivery'] }))
          }}>
            <option value="">{t('allDeliveries')}</option>
            <option value="pending">{t('messagePending')}</option>
            <option value="delivered">{t('messageDelivered')}</option>
            <option value="unknown">{t('messageUnknown')}</option>
          </select>
        </label>
        <button type="button" onClick={applyFilters}>{t('applyMessageFilters')}</button>
      </div>

      {rosterError !== null && <div className={css.error} role="alert">{rosterError}</div>}
      {listError !== null && <div className={css.error} role="alert">{listError}</div>}
      {detailError !== null && <div className={css.error} role="alert">{detailError}</div>}
      {watchPhase === 'stale' && <div className={css.notice} role="status">{t('messageStreamStale')}</div>}
      {watchPhase === 'disconnected' && (
        <div className={css.notice} role="status">{t('messageStreamDisconnected')}</div>
      )}
      {watchPhase === 'unavailable' && (
        <div className={css.notice} role="status">{t('messageStreamUnavailable')}</div>
      )}
      {loading && page === null && <div className={css.notice}>{t('loadingMessages')}</div>}
      {!loading && page !== null && page.items.length === 0 && (
        <div className={css.notice}>{t('emptyMessages')}</div>
      )}
      {page !== null && page.items.length > 0 && (
        <div className={css.browser}>
          <div className={css.list} aria-label={t('messageList')}>
            {page.items.map(item => (
              <button
                key={item.id}
                type="button"
                className={selectedId === item.id ? css.selectedMessage : css.message}
                onClick={() => { void selectMessage(item.id) }}
              >
                <span className={css.route}>{item.sender.name} → {item.recipient.name}</span>
                <span>{new Date(item.sentAt).toLocaleString()}</span>
                <span>{stageText(item.delivery.stage)}</span>
              </button>
            ))}
            {page.nextCursor !== undefined && (
              <button
                type="button"
                className={css.loadMore}
                disabled={loadingMore}
                onClick={() => { void loadPage(teamSessionId, appliedFilters, 'append', page.nextCursor) }}
              >
                {loadingMore ? t('loadingOlderMessages') : t('loadOlderMessages')}
              </button>
            )}
          </div>
          <div className={css.detail} aria-live="polite">
            {selectedId === null && <div className={css.notice}>{t('selectMessage')}</div>}
            {detailLoading && <div className={css.notice}>{t('loadingMessageContent')}</div>}
            {detailUnavailable && <div className={css.notice}>{t('messageContentUnavailable')}</div>}
            {detail !== null && (
              <>
                <div className={css.detailHeader}>
                  <div>
                    <strong>{detail.sender.name} → {detail.recipient.name}</strong>
                    <div className={css.messageId}>{t('messageId')}: <code>{detail.id}</code></div>
                  </div>
                  <span>{stageText(detail.delivery.stage)}</span>
                </div>
                <div className={css.content}>
                  {detail.content.parts.map((part, index) => {
                    if (part.type === 'text') return <p key={index}>{part.text}</p>
                    if (part.type === 'image') {
                      return <p key={index}>{t('messageImage')} · {part.mediaType} · {part.width}×{part.height} · {part.bytes} B</p>
                    }
                    return <p key={index} className={css.omitted}>{t('messagePartOmitted')}</p>
                  })}
                </div>
                {detail.content.completeness === 'partial' && (
                  <div className={css.notice}>{t('messageContentPartial')}</div>
                )}
                {detail.content.completeness === 'unavailable' && (
                  <div className={css.notice}>{t('messageContentUnavailable')}</div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
