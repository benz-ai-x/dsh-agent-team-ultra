// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

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
    expect(screen.queryByRole('option', { name: 'worker' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh messages' }))
    await waitFor(() => {
      expect(loadTeam).toHaveBeenCalledTimes(2)
      expect(screen.getByRole('option', { name: 'worker' })).toBeTruthy()
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })
})
