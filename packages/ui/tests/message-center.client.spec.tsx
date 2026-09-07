// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  TeamMessageCursor,
  TeamMessageDetail,
  TeamMessageId,
  TeamMessagePage,
  TeamView,
} from '@deepseek-ai/dsh-experimental-agent-team/client'
import { TeamMessageCenter, type TeamMessageCenterInjected, type TeamMessageCenterProps } from '../src/client/TeamMessageCenter.tsx'
import { en, zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  globalThis.sessionStorage.clear()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const LEAD = 'message-lead' as SessionId
const NEXT_LEAD = 'message-next-lead' as SessionId
const WORKER = 'message-worker' as SessionId
const NEXT_WORKER = 'message-next-worker' as SessionId
const CURSOR = 'committed-cursor' as TeamMessageCursor
const NEXT_CURSOR = 'next-cursor' as TeamMessageCursor
const MESSAGE = 'message-1' as TeamMessageId

const team: TeamView = {
  members: [
    { id: LEAD, name: 'lead', role: 'lead', status: 'idle', diagnostics: [] },
    { id: WORKER, name: 'worker', role: 'teammate', status: 'inactive', diagnostics: [] },
  ],
  tasks: [],
}

const page: TeamMessagePage = {
  items: [{
    id: MESSAGE,
    sender: { id: LEAD, name: 'lead' },
    recipient: { id: WORKER, name: 'worker' },
    sentAt: Date.UTC(2026, 8, 7, 1, 2, 3),
    delivery: { stage: 'pending' },
  }],
  committedCursor: CURSOR,
  nextCursor: NEXT_CURSOR,
  complete: true,
}

function ok<T>(value: T) {
  return Promise.resolve({ ok: true as const, value })
}

function actions(overrides: Partial<TeamMessageCenterInjected> = {}): TeamMessageCenterInjected {
  return {
    loadTeam: () => ok(team),
    watch: () => ({ start() {}, dispose: () => Promise.resolve() }),
    listMessages: () => ok(page),
    getMessage: () => ok({
      ...page.items[0]!,
      content: {
        completeness: 'partial',
        omittedCount: 1,
        parts: [
          { type: 'text', text: '<img src=x onerror=alert(1)> visible' },
          { type: 'omitted' },
          { type: 'image', mediaType: 'image/png', bytes: 12, width: 3, height: 4 },
        ],
      },
    } satisfies TeamMessageDetail),
    sendMessage: (_sessionId, request) => ok({
      ok: true,
      value: {
        submission: { requestId: request.requestId, messageId: 'sent-message' as TeamMessageId, status: 'accepted' },
        delivery: { stage: 'pending' },
      },
    }),
    ...overrides,
  }
}

function props(injected: TeamMessageCenterInjected, teamSessionId = LEAD): TeamMessageCenterProps {
  return {
    sessionId: teamSessionId,
    teamSessionId,
    ...injected,
    t: ((key: keyof typeof en) => en[key]) as TeamMessageCenterProps['t'],
  } as TeamMessageCenterProps
}

describe('TeamMessageCenter', () => {
  it('refreshes the authoritative message window from watch baseline and invalidation', async () => {
    const opening = Promise.withResolvers<Awaited<ReturnType<TeamMessageCenterInjected['listMessages']>>>()
    const baselinePage: TeamMessagePage = {
      ...page,
      items: [{
        ...page.items[0]!,
        id: 'baseline-message' as TeamMessageId,
        sender: { id: LEAD, name: 'baseline sender' },
      }],
    }
    const livePage: TeamMessagePage = {
      ...page,
      items: [{
        ...page.items[0]!,
        id: 'live-message' as TeamMessageId,
        sender: { id: WORKER, name: 'live sender' },
      }],
    }
    const listMessages = vi.fn()
      .mockImplementationOnce(() => opening.promise)
      .mockImplementationOnce(() => ok(baselinePage))
      .mockImplementationOnce(() => ok(livePage))
    const loadTeam = vi.fn(() => ok(team))
    const sendMessage = vi.fn(actions().sendMessage)
    let sink: {
      replace(value: TeamView): void
      invalidated(): void
      stale(): void
      failed(error: unknown): void
    } | undefined
    const start = vi.fn()
    const dispose = vi.fn(() => Promise.resolve())
    const watch = vi.fn((_sessionId: SessionId, nextSink: typeof sink) => {
      sink = nextSink
      return { start, dispose }
    })
    const injected = {
      ...actions({ loadTeam, listMessages, sendMessage }),
      watch,
    } as unknown as TeamMessageCenterInjected

    render(<TeamMessageCenter {...props(injected)} />)
    await waitFor(() => { expect(watch).toHaveBeenCalledWith(LEAD, expect.any(Object)) })
    expect(start).toHaveBeenCalledOnce()
    act(() => { sink?.replace(team) })
    expect(listMessages).toHaveBeenCalledOnce()
    opening.resolve({ ok: true, value: page })
    expect(await screen.findByText('baseline sender → worker')).toBeTruthy()
    expect(listMessages).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('lead → worker')).toBeNull()
    act(() => { sink?.invalidated() })
    expect(await screen.findByText('live sender → worker')).toBeTruthy()
    expect(listMessages).toHaveBeenCalledTimes(3)
    expect(loadTeam).toHaveBeenCalledTimes(2)
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('fences a late filtered page when live invalidation replaces its committed window', async () => {
    type WatchSink = Parameters<TeamMessageCenterInjected['watch']>[1]
    const latePage = Promise.withResolvers<Awaited<ReturnType<TeamMessageCenterInjected['listMessages']>>>()
    const filteredCursor = 'filtered-next' as TeamMessageCursor
    const filteredHead: TeamMessagePage = {
      ...page,
      items: [{
        ...page.items[0]!,
        id: 'filtered-head' as TeamMessageId,
        sender: { id: LEAD, name: 'filtered head' },
        delivery: { stage: 'delivered', deliveredAt: Date.UTC(2026, 8, 7, 2) },
      }],
      nextCursor: filteredCursor,
    }
    const liveHead: TeamMessagePage = {
      ...filteredHead,
      items: [{
        ...filteredHead.items[0]!,
        id: 'live-filtered-head' as TeamMessageId,
        sender: { id: WORKER, name: 'live filtered head' },
      }],
      committedCursor: 'live-filtered-window' as TeamMessageCursor,
    }
    let filteredReplacements = 0
    const listMessages = vi.fn((_sessionId: SessionId, request: Parameters<TeamMessageCenterInjected['listMessages']>[1]) => {
      if (request.cursor === filteredCursor) return latePage.promise
      if (request.filters?.delivery === 'delivered') {
        filteredReplacements += 1
        return ok(filteredReplacements === 1 ? filteredHead : liveHead)
      }
      return ok(page)
    })
    const sendMessage = vi.fn(actions().sendMessage)
    let sink: WatchSink | undefined
    const watch = vi.fn((_sessionId: SessionId, nextSink: WatchSink) => {
      sink = nextSink
      return { start() {}, dispose: () => Promise.resolve() }
    })
    render(<TeamMessageCenter {...props(actions({ listMessages, sendMessage, watch }))} />)
    await screen.findByText('lead → worker')
    act(() => { sink?.replace(team) })
    await waitFor(() => { expect(listMessages).toHaveBeenCalledTimes(2) })

    fireEvent.change(screen.getByLabelText('Delivery'), { target: { value: 'delivered' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    expect(await screen.findByText('filtered head → worker')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Load older messages' }))
    await waitFor(() => {
      expect(listMessages).toHaveBeenLastCalledWith(LEAD, {
        limit: 20,
        cursor: filteredCursor,
        filters: { delivery: 'delivered' },
      })
    })

    act(() => { sink?.invalidated() })
    expect(await screen.findByText('live filtered head → worker')).toBeTruthy()
    expect(listMessages).toHaveBeenLastCalledWith(LEAD, {
      limit: 20,
      filters: { delivery: 'delivered' },
    })
    latePage.resolve({
      ok: true,
      value: {
        ...page,
        items: [{
          ...page.items[0]!,
          id: 'late-old-window' as TeamMessageId,
          sender: { id: LEAD, name: 'late old cursor' },
        }],
      },
    })
    await Promise.resolve()
    expect(screen.queryByText('late old cursor → worker')).toBeNull()
    expect(screen.getAllByText('live filtered head → worker')).toHaveLength(1)
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('rejects an old committed cursor append while a live replacement is in flight', async () => {
    type WatchSink = Parameters<TeamMessageCenterInjected['watch']>[1]
    const replacement = Promise.withResolvers<Awaited<ReturnType<TeamMessageCenterInjected['listMessages']>>>()
    const oldAppend = Promise.withResolvers<Awaited<ReturnType<TeamMessageCenterInjected['listMessages']>>>()
    const livePage: TeamMessagePage = {
      ...page,
      items: [{
        ...page.items[0]!,
        id: 'replacement-head' as TeamMessageId,
        sender: { id: WORKER, name: 'replacement head' },
      }],
      committedCursor: 'replacement-window' as TeamMessageCursor,
      nextCursor: undefined,
    }
    const listMessages = vi.fn()
      .mockImplementationOnce(() => ok(page))
      .mockImplementationOnce(() => replacement.promise)
      .mockImplementationOnce(() => oldAppend.promise)
    let sink: WatchSink | undefined
    render(<TeamMessageCenter {...props(actions({
      listMessages,
      watch: (_sessionId, nextSink) => {
        sink = nextSink
        return { start() {}, dispose: () => Promise.resolve() }
      },
    }))} />)
    await screen.findByText('lead → worker')

    act(() => { sink?.invalidated() })
    await waitFor(() => { expect(listMessages).toHaveBeenCalledTimes(2) })
    fireEvent.click(screen.getByRole('button', { name: 'Load older messages' }))
    expect(listMessages).toHaveBeenCalledTimes(2)

    replacement.resolve({ ok: true, value: livePage })
    expect(await screen.findByText('replacement head → worker')).toBeTruthy()
    expect(screen.queryByText('lead → worker')).toBeNull()
  })

  it('does not publish an older filter generation before its queued replacement', async () => {
    type WatchSink = Parameters<TeamMessageCenterInjected['watch']>[1]
    type PageResult = Awaited<ReturnType<TeamMessageCenterInjected['listMessages']>>
    const oldReplacement = Promise.withResolvers<PageResult>()
    const filteredReplacement = Promise.withResolvers<PageResult>()
    const oldPage: TeamMessagePage = {
      ...page,
      items: [{
        ...page.items[0]!,
        id: 'old-filter-generation' as TeamMessageId,
        sender: { id: LEAD, name: 'old filter generation' },
      }],
    }
    const filteredPage: TeamMessagePage = {
      ...page,
      items: [{
        ...page.items[0]!,
        id: 'current-filter-generation' as TeamMessageId,
        sender: { id: WORKER, name: 'current filter generation' },
      }],
    }
    const listMessages = vi.fn()
      .mockImplementationOnce(() => ok(page))
      .mockImplementationOnce(() => oldReplacement.promise)
      .mockImplementationOnce(() => filteredReplacement.promise)
    let sink: WatchSink | undefined
    render(<TeamMessageCenter {...props(actions({
      listMessages,
      watch: (_sessionId, nextSink) => {
        sink = nextSink
        return { start() {}, dispose: () => Promise.resolve() }
      },
    }))} />)
    await screen.findByText('lead → worker')

    act(() => { sink?.invalidated() })
    await waitFor(() => { expect(listMessages).toHaveBeenCalledTimes(2) })
    fireEvent.change(screen.getByLabelText('Delivery'), { target: { value: 'delivered' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))

    oldReplacement.resolve({ ok: true, value: oldPage })
    await waitFor(() => { expect(listMessages).toHaveBeenCalledTimes(3) })
    expect(screen.queryByText('old filter generation → worker')).toBeNull()

    filteredReplacement.resolve({ ok: true, value: filteredPage })
    expect(await screen.findByText('current filter generation → worker')).toBeTruthy()
    expect(listMessages).toHaveBeenLastCalledWith(LEAD, {
      limit: 20,
      filters: { delivery: 'delivered' },
    })
  })

  it('coalesces message and roster invalidation bursts into one trailing authority reload each', async () => {
    type WatchSink = Parameters<TeamMessageCenterInjected['watch']>[1]
    type PageResult = Awaited<ReturnType<TeamMessageCenterInjected['listMessages']>>
    type TeamResult = Awaited<ReturnType<TeamMessageCenterInjected['loadTeam']>>
    const firstPage = Promise.withResolvers<PageResult>()
    const trailingPage = Promise.withResolvers<PageResult>()
    const firstTeam = Promise.withResolvers<TeamResult>()
    const trailingTeam = Promise.withResolvers<TeamResult>()
    const listMessages = vi.fn()
      .mockImplementationOnce(() => ok(page))
      .mockImplementationOnce(() => firstPage.promise)
      .mockImplementationOnce(() => trailingPage.promise)
      .mockImplementation(() => new Promise<PageResult>(() => {}))
    const loadTeam = vi.fn()
      .mockImplementationOnce(() => ok(team))
      .mockImplementationOnce(() => firstTeam.promise)
      .mockImplementationOnce(() => trailingTeam.promise)
      .mockImplementation(() => new Promise<TeamResult>(() => {}))
    let sink: WatchSink | undefined
    render(<TeamMessageCenter {...props(actions({
      listMessages,
      loadTeam,
      watch: (_sessionId, nextSink) => {
        sink = nextSink
        return { start() {}, dispose: () => Promise.resolve() }
      },
    }))} />)
    await screen.findByText('lead → worker')

    act(() => {
      sink?.invalidated()
      sink?.invalidated()
      sink?.invalidated()
      sink?.invalidated()
    })
    expect(listMessages).toHaveBeenCalledTimes(2)
    expect(loadTeam).toHaveBeenCalledTimes(2)

    firstPage.resolve({ ok: true, value: page })
    firstTeam.resolve({ ok: true, value: team })
    await waitFor(() => {
      expect(listMessages).toHaveBeenCalledTimes(3)
      expect(loadTeam).toHaveBeenCalledTimes(3)
    })
    trailingPage.resolve({ ok: true, value: {
      ...page,
      items: [{
        ...page.items[0]!,
        id: 'trailing-message' as TeamMessageId,
        sender: { id: WORKER, name: 'trailing sender' },
      }],
    } })
    trailingTeam.resolve({ ok: true, value: team })
    expect(await screen.findByText('trailing sender → worker')).toBeTruthy()
    expect(listMessages).toHaveBeenCalledTimes(3)
    expect(loadTeam).toHaveBeenCalledTimes(3)
  })

  it('retains stale messages and disposes replaced or unmounted watch generations', async () => {
    type WatchSink = Parameters<TeamMessageCenterInjected['watch']>[1]
    let firstSink: WatchSink | undefined
    let secondSink: WatchSink | undefined
    const firstControl = { start: vi.fn(), dispose: vi.fn(() => Promise.resolve()) }
    const secondControl = { start: vi.fn(), dispose: vi.fn(() => Promise.resolve()) }
    const firstWatch = vi.fn((_sessionId: SessionId, sink: WatchSink) => {
      firstSink = sink
      return firstControl
    })
    const secondWatch = vi.fn((_sessionId: SessionId, sink: WatchSink) => {
      secondSink = sink
      return secondControl
    })
    const loadTeam = vi.fn(() => ok(team))
    const listMessages = vi.fn(() => ok(page))
    const getMessage = vi.fn(actions().getMessage)
    const sendMessage = vi.fn(actions().sendMessage)
    const initialProps = props(actions({
      loadTeam, listMessages, getMessage, sendMessage, watch: firstWatch,
    }))
    const rendered = render(<TeamMessageCenter {...initialProps} />)
    expect(await screen.findByText('lead → worker')).toBeTruthy()
    act(() => {
      firstSink?.replace(team)
      firstSink?.stale()
    })
    expect(await screen.findByText('Disconnected. Showing potentially stale Team messages.')).toBeTruthy()
    expect(screen.getByText('lead → worker')).toBeTruthy()

    rendered.rerender(<TeamMessageCenter {...initialProps} watch={secondWatch} />)
    await waitFor(() => {
      expect(firstControl.dispose).toHaveBeenCalledOnce()
      expect(secondControl.start).toHaveBeenCalledOnce()
    })
    act(() => {
      firstSink?.failed(new Error('late old generation failure'))
      secondSink?.replace(team)
    })
    expect(screen.queryByText('Disconnected. Showing potentially stale Team messages.')).toBeNull()
    act(() => { secondSink?.failed(new Error('watch unavailable')) })
    expect(screen.getByText('Live Team message updates are unavailable; the last authoritative page is retained.')).toBeTruthy()
    expect(screen.getByText('lead → worker')).toBeTruthy()
    expect(sendMessage).not.toHaveBeenCalled()

    rendered.unmount()
    await waitFor(() => { expect(secondControl.dispose).toHaveBeenCalledOnce() })
  })

  it('distinguishes disconnected, stale, and unavailable message streams in Chinese', async () => {
    type WatchSink = Parameters<TeamMessageCenterInjected['watch']>[1]
    const pendingTeam = Promise.withResolvers<Awaited<ReturnType<TeamMessageCenterInjected['loadTeam']>>>()
    const pendingPage = Promise.withResolvers<Awaited<ReturnType<TeamMessageCenterInjected['listMessages']>>>()
    let sink: WatchSink | undefined
    const control = { start: vi.fn(), dispose: vi.fn(() => Promise.resolve()) }
    const translated = {
      ...props(actions({
        loadTeam: () => pendingTeam.promise,
        listMessages: () => pendingPage.promise,
        watch: (_sessionId, nextSink) => {
          sink = nextSink
          return control
        },
      })),
      t: ((key: keyof typeof zh) => zh[key]) as TeamMessageCenterProps['t'],
    }
    const rendered = render(<TeamMessageCenter {...translated} />)
    await waitFor(() => { expect(control.start).toHaveBeenCalledOnce() })

    act(() => { sink?.stale() })
    expect(screen.getByText('Team 消息实时连接已断开，正在等待重连。')).toBeTruthy()
    act(() => {
      sink?.replace(team)
      sink?.stale()
    })
    expect(screen.getByText('连接已断开，正在显示可能陈旧的 Team 消息。')).toBeTruthy()
    act(() => { sink?.failed(new Error('不可用')) })
    expect(screen.getByText('Team 消息实时更新不可用；已保留最后一次权威消息页。')).toBeTruthy()

    rendered.unmount()
    await waitFor(() => { expect(control.dispose).toHaveBeenCalledOnce() })
  })

  it('preserves a same-Team editing draft while fencing a replaced service generation', async () => {
    type WatchSink = Parameters<TeamMessageCenterInjected['watch']>[1]
    const latePage = Promise.withResolvers<Awaited<ReturnType<TeamMessageCenterInjected['listMessages']>>>()
    const replacementPage: TeamMessagePage = {
      ...page,
      items: [{
        ...page.items[0]!,
        id: 'replacement-service-message' as TeamMessageId,
        sender: { id: WORKER, name: 'replacement service' },
      }],
    }
    const lateOldPage: TeamMessagePage = {
      ...page,
      items: [{
        ...page.items[0]!,
        id: 'late-old-service-message' as TeamMessageId,
        sender: { id: LEAD, name: 'late old service' },
      }],
    }
    let oldSink: WatchSink | undefined
    const oldControl = { start: vi.fn(), dispose: vi.fn(() => Promise.resolve()) }
    const nextControl = { start: vi.fn(), dispose: vi.fn(() => Promise.resolve()) }
    const oldList = vi.fn()
      .mockImplementationOnce(() => ok(page))
      .mockImplementationOnce(() => latePage.promise)
    const nextList = vi.fn(() => ok(replacementPage))
    const oldWatch = vi.fn((_sessionId: SessionId, sink: WatchSink) => {
      oldSink = sink
      return oldControl
    })
    const nextWatch = vi.fn(() => nextControl)
    const sendMessage = vi.fn(actions().sendMessage)
    const rendered = render(<TeamMessageCenter {...props(actions({
      listMessages: oldList,
      sendMessage,
      watch: oldWatch,
    }))} />)
    await screen.findByText('lead → worker')
    fireEvent.change(screen.getByLabelText('Recipient'), { target: { value: WORKER } })
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Keep this same-Team draft.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh messages' }))
    await waitFor(() => { expect(oldList).toHaveBeenCalledTimes(2) })

    rendered.rerender(<TeamMessageCenter {...props(actions({
      loadTeam: () => ok(team),
      listMessages: nextList,
      sendMessage,
      watch: nextWatch,
    }))} />)
    expect(await screen.findByText('replacement service → worker')).toBeTruthy()
    expect(screen.getByDisplayValue('Keep this same-Team draft.')).toBeTruthy()
    await waitFor(() => {
      expect(oldControl.dispose).toHaveBeenCalledOnce()
      expect(nextControl.start).toHaveBeenCalledOnce()
    })

    act(() => {
      oldSink?.replace(team)
      oldSink?.invalidated()
      oldSink?.failed(new Error('late old service failure'))
    })
    latePage.resolve({ ok: true, value: lateOldPage })
    await Promise.resolve()
    expect(screen.queryByText('late old service → worker')).toBeNull()
    expect(screen.getByText('replacement service → worker')).toBeTruthy()
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('keeps a same-Team pending intent unknown when its service generation is replaced', async () => {
    const pendingSend = Promise.withResolvers<Awaited<ReturnType<TeamMessageCenterInjected['sendMessage']>>>()
    const sendMessage = vi.fn((
      _sessionId: SessionId,
      _request: Parameters<TeamMessageCenterInjected['sendMessage']>[1],
      _signal: AbortSignal,
    ) => pendingSend.promise)
    const oldControl = { start: vi.fn(), dispose: vi.fn(() => Promise.resolve()) }
    const nextControl = { start: vi.fn(), dispose: vi.fn(() => Promise.resolve()) }
    const rendered = render(<TeamMessageCenter {...props(actions({
      sendMessage,
      watch: () => oldControl,
    }))} />)
    await screen.findByText('lead → worker')
    fireEvent.change(screen.getByLabelText('Recipient'), { target: { value: WORKER } })
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Keep the interrupted request exact.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(sendMessage).toHaveBeenCalledOnce()
    const original = sendMessage.mock.calls[0]![1]
    const oldSignal = sendMessage.mock.calls[0]![2]

    rendered.rerender(<TeamMessageCenter {...props(actions({
      loadTeam: () => ok(team),
      listMessages: () => ok(page),
      sendMessage,
      watch: () => nextControl,
    }))} />)

    await waitFor(() => {
      expect(oldSignal.aborted).toBe(true)
      expect(oldControl.dispose).toHaveBeenCalledOnce()
      expect(nextControl.start).toHaveBeenCalledOnce()
    })
    expect(screen.getByDisplayValue('Keep the interrupted request exact.')).toBeTruthy()
    expect(screen.getByText(original.requestId)).toBeTruthy()
    expect(screen.getByText('Submission result unknown. Review this saved intent before retrying.')).toBeTruthy()
    expect(sendMessage).toHaveBeenCalledOnce()

    pendingSend.resolve({
      ok: true,
      value: {
        ok: true,
        value: {
          submission: {
            requestId: original.requestId,
            messageId: 'late-replaced-service-commit' as TeamMessageId,
            status: 'accepted',
          },
          delivery: { stage: 'pending' },
        },
      },
    })
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByText('Accepted; pending delivery.')).toBeNull()
    expect(screen.getByText('Submission result unknown. Review this saved intent before retrying.')).toBeTruthy()
    expect(sendMessage).toHaveBeenCalledOnce()
  })

  it('isolates pending submissions, cursors, drafts, and watch callbacks when switching Team', async () => {
    type WatchSink = Parameters<TeamMessageCenterInjected['watch']>[1]
    const latePage = Promise.withResolvers<Awaited<ReturnType<TeamMessageCenterInjected['listMessages']>>>()
    const pendingSend = Promise.withResolvers<Awaited<ReturnType<TeamMessageCenterInjected['sendMessage']>>>()
    const nextTeam: TeamView = {
      members: [
        { id: NEXT_LEAD, name: 'next lead', role: 'lead', status: 'idle', diagnostics: [] },
        { id: NEXT_WORKER, name: 'next worker', role: 'teammate', status: 'idle', diagnostics: [] },
      ],
      tasks: [],
    }
    const nextPage: TeamMessagePage = {
      ...page,
      items: [{
        ...page.items[0]!,
        id: 'next-team-message' as TeamMessageId,
        sender: { id: NEXT_LEAD, name: 'next lead' },
        recipient: { id: NEXT_WORKER, name: 'next worker' },
      }],
      committedCursor: 'next-team-window' as TeamMessageCursor,
      nextCursor: undefined,
    }
    const lateOldPage: TeamMessagePage = {
      ...page,
      items: [{
        ...page.items[0]!,
        id: 'late-old-team-message' as TeamMessageId,
        sender: { id: LEAD, name: 'late old Team' },
      }],
    }
    const sinks = new Map<SessionId, WatchSink>()
    const controls = new Map<SessionId, { start: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }>()
    const watch = vi.fn((sessionId: SessionId, sink: WatchSink) => {
      sinks.set(sessionId, sink)
      const control = { start: vi.fn(), dispose: vi.fn(() => Promise.resolve()) }
      controls.set(sessionId, control)
      return control
    })
    const loadTeam = vi.fn((sessionId: SessionId) => ok(sessionId === LEAD ? team : nextTeam))
    const listMessages = vi.fn((sessionId: SessionId, request: ListTeamMessagesRequest) => {
      if (sessionId === NEXT_LEAD) return ok(nextPage)
      if (request.cursor === NEXT_CURSOR) return latePage.promise
      return ok(page)
    })
    const sendMessage = vi.fn((
      _sessionId: SessionId,
      _request: Parameters<TeamMessageCenterInjected['sendMessage']>[1],
      _signal: AbortSignal,
    ) => pendingSend.promise)
    const injected = actions({ loadTeam, listMessages, sendMessage, watch })
    const rendered = render(<TeamMessageCenter {...props(injected)} />)
    await screen.findByText('lead → worker')
    fireEvent.click(screen.getByRole('button', { name: 'Load older messages' }))
    await waitFor(() => {
      expect(listMessages).toHaveBeenLastCalledWith(LEAD, { limit: 20, cursor: NEXT_CURSOR })
    })
    fireEvent.change(screen.getByLabelText('Recipient'), { target: { value: WORKER } })
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Old Team intent only.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(sendMessage).toHaveBeenCalledOnce()
    const oldRequest = sendMessage.mock.calls[0]![1]
    const oldSignal = sendMessage.mock.calls[0]![2]

    rendered.rerender(<TeamMessageCenter {...props(injected, NEXT_LEAD)} />)
    expect(await screen.findByText('next lead → next worker')).toBeTruthy()
    expect(oldSignal.aborted).toBe(true)
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('')
    await waitFor(() => {
      expect(controls.get(LEAD)?.dispose).toHaveBeenCalledOnce()
      expect(controls.get(NEXT_LEAD)?.start).toHaveBeenCalledOnce()
    })

    act(() => {
      sinks.get(LEAD)?.replace(team)
      sinks.get(LEAD)?.invalidated()
      sinks.get(LEAD)?.stale()
      sinks.get(LEAD)?.failed(new Error('late old Team failure'))
    })
    latePage.resolve({ ok: true, value: lateOldPage })
    pendingSend.resolve({
      ok: true,
      value: {
        ok: true,
        value: {
          submission: {
            requestId: oldRequest.requestId,
            messageId: 'late-old-team-commit' as TeamMessageId,
            status: 'accepted',
          },
          delivery: { stage: 'pending' },
        },
      },
    })
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByText('late old Team → worker')).toBeNull()
    expect(screen.queryByText('Accepted; pending delivery.')).toBeNull()
    expect(screen.queryByText('Disconnected. Showing potentially stale Team messages.')).toBeNull()
    expect(screen.getByText('next lead → next worker')).toBeTruthy()
    expect(sendMessage).toHaveBeenCalledOnce()

    rendered.rerender(<TeamMessageCenter {...props(injected)} />)
    expect(await screen.findByDisplayValue('Old Team intent only.')).toBeTruthy()
    expect(screen.getByText(oldRequest.requestId)).toBeTruthy()
    expect(screen.getByText('Submission result unknown. Review this saved intent before retrying.')).toBeTruthy()
    expect(sendMessage).toHaveBeenCalledOnce()
  })

  it('preserves one explicit reply intent across a transport failure and retries only on command', async () => {
    const first = Promise.withResolvers<{
      readonly ok: false
      readonly error: { readonly code: string; readonly message: string }
    }>()
    const sendMessage = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockImplementationOnce((_sessionId, request) => ok({
        ok: true as const,
        value: {
          submission: { requestId: request.requestId, messageId: 'sent-message', status: 'accepted' as const },
          delivery: { stage: 'pending' as const },
        },
      }))
    const injected = { ...actions(), sendMessage }
    render(<TeamMessageCenter {...props(injected as TeamMessageCenterInjected)} />)

    await screen.findByText('lead → worker')
    fireEvent.change(screen.getByLabelText('Recipient'), { target: { value: WORKER } })
    fireEvent.change(screen.getByLabelText('Reply to'), { target: { value: MESSAGE } })
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: '请检查 retry 语义。' } })
    const submit = screen.getByRole('button', { name: 'Send message' })
    fireEvent.click(submit)
    fireEvent.click(submit)
    expect(sendMessage).toHaveBeenCalledTimes(1)
    const [sessionId, original] = sendMessage.mock.calls[0]!
    expect(sessionId).toBe(LEAD)
    expect(original).toMatchObject({
      recipientId: WORKER,
      replyTo: MESSAGE,
      text: '请检查 retry 语义。',
      requestId: expect.any(String),
    })

    first.resolve({ ok: false, error: { code: 'gateway/unavailable', message: 'response lost' } })
    expect(await screen.findByText('Submission result unknown. Review this saved intent before retrying.')).toBeTruthy()
    expect(screen.getByDisplayValue('请检查 retry 语义。')).toBeTruthy()
    expect(screen.getByText(original.requestId)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh messages' }))
    await Promise.resolve()
    expect(sendMessage).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Retry same request' }))
    await waitFor(() => { expect(sendMessage).toHaveBeenCalledTimes(2) })
    expect(sendMessage.mock.calls[1]).toEqual([LEAD, original, expect.any(AbortSignal)])
    expect(await screen.findByText('Accepted; pending delivery.')).toBeTruthy()
  })

  it('ends a non-settling submission at its deadline and retries the identical saved intent', async () => {
    const first = Promise.withResolvers<Awaited<ReturnType<TeamMessageCenterInjected['sendMessage']>>>()
    const sendMessage = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockImplementationOnce((_sessionId, request) => ok({
        ok: true as const,
        value: {
          submission: { requestId: request.requestId, messageId: 'sent-message' as TeamMessageId, status: 'accepted' as const },
          delivery: { stage: 'pending' as const },
        },
      }))
    render(<TeamMessageCenter {...props(actions({ sendMessage }))} />)

    await screen.findByText('lead → worker')
    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText('Recipient'), { target: { value: WORKER } })
    fireEvent.change(screen.getByLabelText('Reply to'), { target: { value: MESSAGE } })
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Keep this deadline retry exact.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    expect(sendMessage).toHaveBeenCalledOnce()
    const [sessionId, original, signal] = sendMessage.mock.calls[0]!
    expect(sessionId).toBe(LEAD)
    expect(original).toMatchObject({
      recipientId: WORKER,
      replyTo: MESSAGE,
      text: 'Keep this deadline retry exact.',
      requestId: expect.any(String),
    })
    expect(signal.aborted).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })

    expect(signal.aborted).toBe(true)
    expect(screen.getByText('Submission result unknown. Review this saved intent before retrying.')).toBeTruthy()
    expect(screen.getByDisplayValue('Keep this deadline retry exact.')).toBeTruthy()
    expect(screen.getByText(original.requestId)).toBeTruthy()

    first.reject(new Error('late transport rejection'))
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText('Submission result unknown. Review this saved intent before retrying.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Retry same request' }))
    await act(async () => {
      await Promise.resolve()
    })
    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(sendMessage.mock.calls[1]).toEqual([LEAD, original, expect.any(AbortSignal)])
    expect(screen.getByText('Accepted; pending delivery.')).toBeTruthy()
  })

  it('aborts a non-settling submission and clears its deadline when unmounted', async () => {
    const pending = Promise.withResolvers<Awaited<ReturnType<TeamMessageCenterInjected['sendMessage']>>>()
    const sendMessage = vi.fn(() => pending.promise)
    const rendered = render(<TeamMessageCenter {...props(actions({ sendMessage }))} />)

    await screen.findByText('lead → worker')
    vi.useFakeTimers()
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    fireEvent.change(screen.getByLabelText('Recipient'), { target: { value: WORKER } })
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Unmount this pending request.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    const signal = sendMessage.mock.calls[0]![2]
    expect(signal.aborted).toBe(false)
    const deadlineCall = timeoutSpy.mock.calls.findIndex(([, delay]) => delay === 15_000)
    expect(deadlineCall).toBeGreaterThanOrEqual(0)
    const deadlineHandle = timeoutSpy.mock.results[deadlineCall]!.value

    rendered.unmount()

    expect(signal.aborted).toBe(true)
    expect(clearTimeoutSpy).toHaveBeenCalledWith(deadlineHandle)
    pending.reject(new Error('late rejection after unmount'))
    await act(async () => {
      await Promise.resolve()
    })
  })

  it('does not call the Remote when browser storage cannot retain the intent and diagnoses both locales', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota denied', 'QuotaExceededError')
    })
    const sendMessage = vi.fn(actions().sendMessage)
    const rendered = render(<TeamMessageCenter {...props(actions({ sendMessage }))} />)

    await screen.findByText('lead → worker')
    fireEvent.change(screen.getByLabelText('Recipient'), { target: { value: WORKER } })
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Do not send without durable retry state.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    expect(sendMessage).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain(
      'Unable to save this message intent in browser storage. Nothing was sent.',
    )
    expect(screen.getByRole('alert').textContent).toContain('QuotaExceededError: quota denied')
    expect(screen.getByDisplayValue('Do not send without durable retry state.')).toBeTruthy()
    expect(screen.queryByLabelText('Saved message intent')).toBeNull()
    rendered.unmount()

    const chineseSend = vi.fn(actions().sendMessage)
    render(<TeamMessageCenter {...{
      ...props(actions({ sendMessage: chineseSend })),
      t: ((key: keyof typeof zh) => zh[key]) as TeamMessageCenterProps['t'],
    }} />)
    await screen.findByText('lead → worker')
    fireEvent.change(screen.getByLabelText('收件人'), { target: { value: WORKER } })
    fireEvent.change(screen.getByLabelText('消息'), { target: { value: '没有可靠重试状态就不要发送。' } })
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }))

    expect(chineseSend).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('无法把发送意图保存到浏览器存储；消息未发送。')
    expect(screen.getByRole('alert').textContent).toContain('QuotaExceededError: quota denied')
    expect(screen.getByDisplayValue('没有可靠重试状态就不要发送。')).toBeTruthy()
  })

  it('restores an uncertain request after remount without automatically sending it again', async () => {
    const first = Promise.withResolvers<Awaited<ReturnType<TeamMessageCenterInjected['sendMessage']>>>()
    const initialSend = vi.fn(() => first.promise)
    const rendered = render(<TeamMessageCenter {...props(actions({ sendMessage: initialSend }))} />)

    await screen.findByText('lead → worker')
    fireEvent.change(screen.getByLabelText('Recipient'), { target: { value: WORKER } })
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Persist this exact draft.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    const original = initialSend.mock.calls[0]![1]
    first.resolve({ ok: false, error: { code: 'gateway/unavailable', message: 'response lost' } as never })
    await screen.findByText('Submission result unknown. Review this saved intent before retrying.')
    rendered.unmount()

    const retrySend = vi.fn((_sessionId, request) => ok({
      ok: true as const,
      value: {
        submission: { requestId: request.requestId, messageId: 'sent-message' as TeamMessageId, status: 'accepted' as const },
        delivery: { stage: 'delivered' as const },
      },
    }))
    render(<TeamMessageCenter {...props(actions({ sendMessage: retrySend }))} />)

    expect(await screen.findByDisplayValue('Persist this exact draft.')).toBeTruthy()
    expect(screen.getByText(original.requestId)).toBeTruthy()
    expect(retrySend).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh messages' }))
    await Promise.resolve()
    expect(retrySend).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry same request' }))
    await waitFor(() => { expect(retrySend).toHaveBeenCalledOnce() })
    expect(retrySend.mock.calls[0]).toEqual([LEAD, original, expect.any(AbortSignal)])
    expect(await screen.findByText('Accepted and delivered.')).toBeTruthy()
  })

  it('renders the compose and failure-recovery surface in Chinese', async () => {
    const sendMessage = vi.fn(() => Promise.resolve({
      ok: false as const,
      error: { code: 'gateway/unavailable', message: '响应丢失' } as never,
    }))
    const translated = {
      ...props(actions({ sendMessage })),
      t: ((key: keyof typeof zh) => zh[key]) as TeamMessageCenterProps['t'],
    }
    render(<TeamMessageCenter {...translated} />)

    await screen.findByText('lead → worker')
    fireEvent.change(screen.getByLabelText('收件人'), { target: { value: WORKER } })
    fireEvent.change(screen.getByLabelText('消息'), { target: { value: '请检查恢复。' } })
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }))

    expect(await screen.findByText('提交结果未知。重试前请核对这份已保存的发送意图。')).toBeTruthy()
    expect(screen.getByRole('button', { name: '使用同一请求重试' })).toBeTruthy()
    expect(screen.getByDisplayValue('请检查恢复。')).toBeTruthy()
  })

  it('loads metadata, filters and pages it, then requests safe content only for the selected row', async () => {
    const listMessages = vi.fn(() => ok(page))
    const getMessage = vi.fn(actions().getMessage)
    render(<TeamMessageCenter {...props(actions({ listMessages, getMessage }))} />)

    expect(screen.getByText('Loading persisted messages…')).toBeTruthy()
    expect(await screen.findByText('lead → worker')).toBeTruthy()
    expect(screen.getByText(/Delivery is not read status or task completion/u)).toBeTruthy()
    expect(screen.getAllByText('Pending delivery')).toHaveLength(2)
    expect(listMessages).toHaveBeenCalledWith(LEAD, { limit: 20 })
    expect(getMessage).not.toHaveBeenCalled()
    expect(screen.queryByText(/visible/u)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /lead → worker/u }))
    expect(await screen.findByText('<img src=x onerror=alert(1)> visible')).toBeTruthy()
    expect(screen.getByText(MESSAGE)).toBeTruthy()
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('Some private or unsupported content was omitted.')).toBeTruthy()
    expect(screen.getByText('Image · image/png · 3×4 · 12 B')).toBeTruthy()
    expect(getMessage).toHaveBeenCalledWith(LEAD, {
      messageId: MESSAGE,
      committedCursor: CURSOR,
    })

    fireEvent.change(screen.getByLabelText('Member'), { target: { value: WORKER } })
    fireEvent.change(screen.getByLabelText('Direction'), { target: { value: 'sent' } })
    fireEvent.change(screen.getByLabelText('Delivery'), { target: { value: 'delivered' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    await waitFor(() => {
      expect(listMessages).toHaveBeenLastCalledWith(LEAD, {
        limit: 20,
        filters: { memberId: WORKER, direction: 'sent', delivery: 'delivered' },
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Load older messages' }))
    await waitFor(() => {
      expect(listMessages).toHaveBeenLastCalledWith(LEAD, {
        limit: 20,
        cursor: NEXT_CURSOR,
        filters: { memberId: WORKER, direction: 'sent', delivery: 'delivered' },
      })
    })
  })

  it('covers empty, unavailable and unknown states while discarding stale session responses', async () => {
    const firstTeam = Promise.withResolvers<Awaited<ReturnType<TeamMessageCenterInjected['loadTeam']>>>()
    const firstPage = Promise.withResolvers<Awaited<ReturnType<TeamMessageCenterInjected['listMessages']>>>()
    const loadTeam = vi.fn((sessionId: SessionId) => sessionId === LEAD
      ? firstTeam.promise
      : ok({ members: [{ id: NEXT_LEAD, name: 'lead', role: 'lead', status: 'idle', diagnostics: [] }], tasks: [] }))
    const listMessages = vi.fn((sessionId: SessionId) => sessionId === LEAD
      ? firstPage.promise
      : ok({ items: [], committedCursor: 'next-empty' as TeamMessageCursor, complete: true }))
    const rendered = render(<TeamMessageCenter {...props(actions({ loadTeam, listMessages }))} />)
    rendered.rerender(<TeamMessageCenter {...props(actions({ loadTeam, listMessages }), NEXT_LEAD)} />)

    expect(await screen.findByText('No persisted Team messages match these filters.')).toBeTruthy()
    firstTeam.resolve({ ok: true, value: team })
    firstPage.resolve({ ok: true, value: page })
    await Promise.resolve()
    expect(screen.queryByText('lead → worker')).toBeNull()

    const unknownPage: TeamMessagePage = {
      items: [{
        ...page.items[0]!,
        delivery: { stage: 'unknown' },
      }],
      committedCursor: CURSOR,
      complete: true,
    }
    const failedDetail = {
      ok: false as const,
      error: { code: 'gateway/unavailable', message: 'detail offline' } as never,
    }
    rendered.rerender(<TeamMessageCenter {...props(actions({
      listMessages: () => ok(unknownPage),
      getMessage: () => Promise.resolve(failedDetail),
    }))} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh messages' }))
    expect(await screen.findByText('Delivery unknown')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /lead → worker/u }))
    expect(await screen.findByText('Message content is unavailable.')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe(
      'Unable to load persisted messages: detail offline (gateway/unavailable)',
    )
  })

  it('clears an invalidated detail loading state on refresh and filter replacement', async () => {
    for (const trigger of ['refresh', 'filters'] as const) {
      const pendingDetail = Promise.withResolvers<Awaited<ReturnType<TeamMessageCenterInjected['getMessage']>>>()
      render(<TeamMessageCenter {...props(actions({ getMessage: () => pendingDetail.promise }))} />)
      fireEvent.click(await screen.findByRole('button', { name: /lead → worker/u }))
      expect(await screen.findByText('Loading message content…')).toBeTruthy()

      if (trigger === 'refresh') {
        fireEvent.click(screen.getByRole('button', { name: 'Refresh messages' }))
      } else {
        fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
      }

      await waitFor(() => {
        expect(screen.queryByText('Loading message content…')).toBeNull()
        expect(screen.getByText('Select a message to load its content.')).toBeTruthy()
      })
      cleanup()
    }
  })

  it('keeps roster failures independent and retries the roster on refresh', async () => {
    const firstTeam = Promise.withResolvers<Awaited<ReturnType<TeamMessageCenterInjected['loadTeam']>>>()
    const firstPage = Promise.withResolvers<Awaited<ReturnType<TeamMessageCenterInjected['listMessages']>>>()
    const loadTeam = vi.fn()
      .mockImplementationOnce(() => firstTeam.promise)
      .mockImplementationOnce(() => ok(team))
    const listMessages = vi.fn()
      .mockImplementationOnce(() => firstPage.promise)
      .mockImplementation(() => ok(page))
    render(<TeamMessageCenter {...props(actions({ loadTeam, listMessages }))} />)

    firstTeam.resolve({
      ok: false,
      error: { code: 'gateway/unavailable', message: 'roster offline' } as never,
    })
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Unable to load persisted messages: roster offline (gateway/unavailable)',
    )
    firstPage.resolve({ ok: true, value: page })
    expect(await screen.findByText('lead → worker')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('roster offline')
    expect(within(screen.getByLabelText('Member')).queryByRole('option', { name: 'worker' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh messages' }))
    await waitFor(() => {
      expect(loadTeam).toHaveBeenCalledTimes(2)
      expect(within(screen.getByLabelText('Member')).getByRole('option', { name: 'worker' })).toBeTruthy()
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })
})
