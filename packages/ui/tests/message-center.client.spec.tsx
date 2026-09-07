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

  it('applies an addressed member and reapplies the same member on a newer navigation revision', async () => {
    const listMessages = vi.fn(() => ok(page))
    const injected = actions({ listMessages })
    const rendered = render(<TeamMessageCenter {...{
      ...props(injected),
      selectedMemberId: WORKER,
      navigationRevision: 7,
    }} />)

    await waitFor(() => {
      expect(listMessages).toHaveBeenLastCalledWith(LEAD, {
        limit: 20,
        filters: { memberId: WORKER },
      })
    })
    expect((screen.getByLabelText('Member') as HTMLSelectElement).value).toBe(WORKER)

    fireEvent.change(screen.getByLabelText('Member'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    await waitFor(() => {
      expect(listMessages).toHaveBeenLastCalledWith(LEAD, { limit: 20 })
    })

    rendered.rerender(<TeamMessageCenter {...{
      ...props(injected),
      selectedMemberId: WORKER,
      navigationRevision: 8,
    }} />)
    await waitFor(() => {
      expect(listMessages).toHaveBeenLastCalledWith(LEAD, {
        limit: 20,
        filters: { memberId: WORKER },
      })
    })
    expect((screen.getByLabelText('Member') as HTMLSelectElement).value).toBe(WORKER)
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
