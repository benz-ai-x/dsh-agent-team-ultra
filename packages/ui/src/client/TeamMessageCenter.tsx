import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-experimental-client-ui-agent-team/client'
import type {
  GetTeamMessageRequest,
  ListTeamMessagesRequest,
  TeamMessageCursor,
  TeamMessageDetail,
  TeamMessageFilters,
  TeamMessagePage,
  TeamView,
} from '@deepseek-ai/dsh-experimental-agent-team/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import css from './TeamMessageCenter.module.css'

const PAGE_SIZE = 20

/** Generated Team Remote operations used by the public message-center view. */
export interface TeamMessageCenterInjected {
  loadTeam: (sessionId: SessionId) => Promise<RemoteResult<TeamView>>
  listMessages: (sessionId: SessionId, request: ListTeamMessagesRequest) => Promise<RemoteResult<TeamMessagePage>>
  getMessage: (sessionId: SessionId, request: GetTeamMessageRequest) => Promise<RemoteResult<TeamMessageDetail>>
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

/** Browse Host-authorized persisted Team messages without copying them into Studio state. */
export function TeamMessageCenter({
  teamSessionId, loadTeam, listMessages, getMessage, t,
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
  const sessionRef = useRef(teamSessionId)
  const teamGeneration = useRef(0)
  const listGeneration = useRef(0)
  const detailGeneration = useRef(0)
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
      setTeam(result.value)
      setRosterError(null)
    } else {
      setRosterError(failureText(t('messageLoadError'), result.error))
    }
  }, [loadTeam, t])

  useEffect(() => {
    const requestedSession = teamSessionId
    setTeam(null)
    setPage(null)
    setDraft(EMPTY_FILTERS)
    setAppliedFilters(undefined)
    setLoadingMore(false)
    setRosterError(null)
    setListError(null)
    resetDetail()
    void loadPage(requestedSession, undefined, 'replace')
    void loadRoster(requestedSession)
  }, [loadPage, loadRoster, resetDetail, teamSessionId])

  const applyFilters = (): void => {
    const filters = filtersOf(draft)
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
