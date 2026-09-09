// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DigitalEmployeeStudio, launchIntentId, type DigitalEmployeeStudioProps } from '../src/client/Studio.tsx'
import { en, type UltraKey } from '../src/client/locales.ts'

const profile = {
  id: 'reviewer', employeeName: 'reviewer', displayName: 'Reviewer', description: 'Review',
  continuationProvider: 'spawn', contextMode: 'fresh', persona: 'Careful', mission: 'Report',
  toolPolicy: { mode: 'inherit', names: [] }, context: [], memory: [], hooks: [],
}
const head = { schemaVersion: 1, profileId: 'reviewer', headRevision: 2, latestRevision: 1, activeRevision: 1, historyStartsAtRevision: 1, createdAt: 1, updatedAt: 2 }
const revision = { schemaVersion: 1, profileId: 'reviewer', revision: 1, profile, fingerprint: 'a'.repeat(64), createdAt: 1, updatedAt: 1 }
const view = { profiles: [{ head, latest: revision, history: [{ revision: 1, fingerprint: revision.fingerprint, createdAt: 1, updatedAt: 1 }], historyTruncated: false }], tools: [], instances: [] }
const remote = <T,>(value: T) => ({ ok: true as const, value })
function props(overrides: Record<string, unknown> = {}): DigitalEmployeeStudioProps {
  return {
    sessionId: 'lead', t: (key: UltraKey) => en[key],
    load: vi.fn(async () => remote(view)),
    save: vi.fn(async () => remote({ ok: true, value: { head, revision, unchanged: true } })),
    activate: vi.fn(async () => remote({ ok: true, value: { head } })),
    rollback: vi.fn(async () => remote({ ok: true, value: { head } })),
    archive: vi.fn(async () => remote({ ok: true, value: { head } })),
    restore: vi.fn(async () => remote({ ok: true, value: { head } })),
    revision: vi.fn(async () => remote({ ok: true, value: { head, revision, diff: [], diffTruncated: false } })),
    spawn: vi.fn(async () => remote({ ok: true, value: { provisioningPhase: 'active' } })),
    openConversation: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as DigitalEmployeeStudioProps
}
async function open() {
  fireEvent.click(screen.getByRole('button', { name: en.title }))
  await screen.findByRole('button', { name: 'Reviewer · r1' })
  fireEvent.click(screen.getByRole('button', { name: 'Reviewer · r1' }))
}
afterEach(() => { cleanup(); sessionStorage.clear() })

describe('minimal B0 Studio', () => {
  it('preserves edited text and its original CAS token when save conflicts', async () => {
    const save = vi.fn(async () => remote({ ok: false, error: { code: 'profile-conflict', message: 'Head changed' } }))
    render(<DigitalEmployeeStudio {...props({ save })} />)
    await open()
    fireEvent.change(screen.getByLabelText(en.persona), { target: { value: 'UNSAVED_EDIT' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect((await screen.findByRole('alert')).textContent).toContain('Head changed')
    expect((screen.getByLabelText(en.persona) as HTMLTextAreaElement).value).toBe('UNSAVED_EDIT')
    expect(save.mock.calls[0]?.[1]).toMatchObject({ expectedHeadRevision: 2, profile: { persona: 'UNSAVED_EDIT' } })
  })

  it('retains the last good snapshot and exposes refresh failure', async () => {
    const load = vi.fn().mockResolvedValueOnce(remote(view)).mockRejectedValueOnce(new Error('offline'))
    render(<DigitalEmployeeStudio {...props({ load })} />)
    await open()
    fireEvent.click(screen.getByRole('button', { name: en.refresh }))
    expect((await screen.findByRole('alert')).textContent).toContain('offline')
    expect(screen.getByText(en.stale)).toBeDefined()
    expect(screen.getByRole('button', { name: 'Reviewer · r1' })).toBeDefined()
    expect((screen.getByRole('button', { name: en.activate }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('ignores an older refresh completing after a newer snapshot', async () => {
    const older = Promise.withResolvers<unknown>()
    const load = vi.fn().mockImplementationOnce(() => older.promise).mockResolvedValueOnce(remote(view))
    render(<DigitalEmployeeStudio {...props({ load })} />)
    fireEvent.click(screen.getByRole('button', { name: en.title }))
    fireEvent.click(screen.getByRole('button', { name: en.refresh }))
    await screen.findByRole('button', { name: 'Reviewer · r1' })
    await act(async () => { older.resolve(remote({ profiles: [], tools: [], instances: [] })); await older.promise })
    expect(screen.getByRole('button', { name: 'Reviewer · r1' })).toBeDefined()
  })

  it('persists a launch UUID before dispatch and reuses it after a lost response and dialog reopening', async () => {
    const spawn = vi.fn().mockRejectedValueOnce(new Error('lost response'))
      .mockResolvedValueOnce(remote({ ok: true, value: { provisioningPhase: 'active' } }))
    render(<DigitalEmployeeStudio {...props({ spawn })} />)
    await open()
    fireEvent.click(screen.getByRole('button', { name: en.launch }))
    expect((await screen.findByRole('alert')).textContent).toContain(en.launchUnknown)
    const firstId = spawn.mock.calls[0]?.[1].launchRequestId
    fireEvent.click(screen.getByRole('button', { name: en.close }))
    await open()
    fireEvent.click(screen.getByRole('button', { name: en.launch }))
    await waitFor(() => expect(spawn).toHaveBeenCalledTimes(2))
    expect(spawn.mock.calls[1]?.[1].launchRequestId).toBe(firstId)
    expect(sessionStorage.length).toBe(1)
  })

  it('cancels an outstanding launch on close and fences its late completion', async () => {
    const gate = Promise.withResolvers<unknown>()
    const spawn = vi.fn(() => gate.promise)
    render(<DigitalEmployeeStudio {...props({ spawn })} />)
    await open()
    fireEvent.click(screen.getByRole('button', { name: en.launch }))
    await waitFor(() => expect(spawn).toHaveBeenCalledOnce())
    const signal = spawn.mock.calls[0]?.[2] as AbortSignal
    fireEvent.click(screen.getByRole('button', { name: en.close }))
    expect(signal.aborted).toBe(true)
    await act(async () => { gate.resolve(remote({ ok: true, value: { provisioningPhase: 'active' } })); await gate.promise })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: en.title }))
  })

  it('reports a definite Host launch rejection without calling its outcome unknown', async () => {
    render(<DigitalEmployeeStudio {...props({ spawn: async () => remote({ ok: false, error: { code: 'profile-in-use', message: 'This name is reserved' } }) })} />)
    await open()
    fireEvent.click(screen.getByRole('button', { name: en.launch }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('profile-in-use')
    expect(alert.textContent).not.toContain(en.launchUnknown)
  })

  it('refuses unreadable intent storage without minting a replacement identity', () => {
    const storage = { getItem: () => 'corrupt', setItem: vi.fn() } as unknown as Storage
    expect(() => launchIntentId('lead', 'reviewer', '', storage)).toThrow('Invalid stored launch UUID')
    expect(storage.setItem).not.toHaveBeenCalled()
  })
})
