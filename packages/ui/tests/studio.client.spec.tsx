// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  DigitalEmployeeProfile,
  DigitalEmployeeProfileCatalogEntry,
  DigitalEmployeeProfileRevision,
  DigitalEmployeeRuntimeCatalog,
  DigitalEmployeeStudioView,
} from '@deepseek-ai/dsh-agent-team-ultra/client'
import { DigitalEmployeeStudio, type DigitalEmployeeStudioProps } from '../src/client/Studio.tsx'
import { en, type UltraKey } from '../src/client/locales.ts'

function profile(displayName = 'Reviewer One', revision = 1): DigitalEmployeeProfile {
  return {
    id: 'reviewer',
    employeeName: 'reviewer',
    displayName,
    description: 'Reviews code.',
    continuationProvider: 'spawn',
    contextMode: 'fresh',
    persona: 'Be precise.',
    mission: 'Find defects.',
    toolPolicy: { mode: 'allow', names: ['read'] },
    context: [],
    memory: [],
    hooks: [],
    revision,
    createdAt: 1,
    updatedAt: revision,
  }
}

function immutableRevision(profile: DigitalEmployeeProfile): DigitalEmployeeProfileRevision {
  const { revision, createdAt, updatedAt, ...draft } = profile
  return {
    schemaVersion: 1,
    profileId: profile.id,
    revision,
    profile: draft,
    runtimeTarget: { kind: 'dsh-model', provider: 'test-provider', model: 'test-model' },
    requiredCapabilities: { contextMode: 'fresh', profileCapabilities: ['persona', 'mission', 'tool-policy'] },
    fingerprint: `${String(revision).padStart(64, '0')}`,
    createdAt,
    updatedAt,
  }
}

function catalog(
  latestProfile: DigitalEmployeeProfile,
  options: {
    readonly headRevision?: number
    readonly activeRevision?: number | null
    readonly archivedAt?: number
    readonly history?: readonly DigitalEmployeeProfile[]
  } = {},
): DigitalEmployeeProfileCatalogEntry {
  const latest = immutableRevision(latestProfile)
  const activeRevision = options.activeRevision === undefined ? latest.revision : options.activeRevision
  const history = (options.history ?? [latestProfile]).map(immutableRevision)
  return {
    head: {
      schemaVersion: 1,
      profileId: latest.profileId,
      headRevision: options.headRevision ?? latest.revision,
      latestRevision: latest.revision,
      ...(activeRevision === null ? {} : { activeRevision }),
      historyStartsAtRevision: Math.min(...history.map(revision => revision.revision)),
      ...(options.archivedAt === undefined ? {} : { archivedAt: options.archivedAt }),
      createdAt: latest.createdAt,
      updatedAt: latest.updatedAt,
    },
    latest,
    history: history.map(revision => ({
      revision: revision.revision,
      fingerprint: revision.fingerprint,
      createdAt: revision.createdAt,
      updatedAt: revision.updatedAt,
    })),
    historyTruncated: false,
  }
}

function runtimeCatalog(): DigitalEmployeeRuntimeCatalog {
  return {
    generation: 1,
    backends: [
      {
        routingId: 'dsh-model/test-provider/test-model',
        family: 'dsh-model',
        availability: 'available',
        provider: 'test-provider',
        providerDisplayName: 'Test Provider',
        model: 'test-model',
        displayName: 'Test Model',
        contextModes: ['fresh', 'fork'],
        profileCapabilities: ['persona', 'mission', 'context', 'memory', 'tool-policy', 'hooks'],
        reasoning: {
          efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }],
          defaultEffort: 'low',
        },
      },
      {
        routingId: 'external-agent/native-reviewer',
        family: 'external-agent',
        availability: 'available',
        provider: 'native-reviewer',
        displayName: 'Native Reviewer',
        contextModes: ['fresh'],
        profileCapabilities: ['persona', 'mission'],
      },
      {
        routingId: 'dsh-model/retired-provider/retired-model',
        family: 'dsh-model',
        availability: 'unavailable',
        provider: 'retired-provider',
        providerDisplayName: 'Retired Provider',
        model: 'retired-model',
        displayName: 'Retired Model',
        contextModes: [],
        profileCapabilities: [],
        diagnostic: 'Historical route is missing.',
      },
      {
        routingId: 'external-agent/codex',
        family: 'external-agent',
        availability: 'unsupported',
        provider: 'codex',
        displayName: 'Codex',
        contextModes: [],
        profileCapabilities: [],
        diagnostic: 'One-shot only.',
      },
    ],
  }
}

function view(profiles: readonly DigitalEmployeeProfile[] = []): DigitalEmployeeStudioView {
  return {
    profiles: profiles.map(profile => catalog(profile)),
    runtimeCatalog: runtimeCatalog(),
    tools: [{ name: 'read', description: 'Read files' }],
    instances: [],
  }
}

function catalogView(profiles: readonly DigitalEmployeeProfileCatalogEntry[]): DigitalEmployeeStudioView {
  return { profiles, runtimeCatalog: runtimeCatalog(), tools: [{ name: 'read', description: 'Read files' }], instances: [] }
}

function saved(profile: DigitalEmployeeProfile, headRevision = profile.revision) {
  const entry = catalog(profile, { headRevision })
  return { unchanged: false, head: entry.head, revision: entry.latest }
}

function props(overrides: Partial<DigitalEmployeeStudioProps> = {}): DigitalEmployeeStudioProps {
  return {
    sessionId: 'session-a' as never,
    load: vi.fn(async () => ({ ok: true, value: view() })),
    save: vi.fn(async () => ({ ok: true, value: { ok: false, error: { code: 'profile-invalid', message: 'invalid' } } })),
    revision: vi.fn(async () => ({ ok: true, value: { ok: false, error: { code: 'revision-not-found', message: 'missing' } } })),
    activate: vi.fn(async () => ({ ok: true, value: { ok: false, error: { code: 'profile-conflict', message: 'stale' } } })),
    rollback: vi.fn(async () => ({ ok: true, value: { ok: false, error: { code: 'profile-conflict', message: 'stale' } } })),
    archive: vi.fn(async () => ({ ok: true, value: { ok: false, error: { code: 'profile-conflict', message: 'stale' } } })),
    restore: vi.fn(async () => ({ ok: true, value: { ok: false, error: { code: 'profile-conflict', message: 'stale' } } })),
    spawn: vi.fn(async () => ({
      ok: true,
      value: {
        ok: true,
        value: {
          teamId: 'session-a',
          memberName: 'reviewer',
          profileId: 'reviewer',
          profileRevision: 1,
          runtimeTarget: { kind: 'dsh-model', provider: 'test-provider', model: 'test-model' },
          requiredCapabilities: { contextMode: 'fresh', profileCapabilities: ['persona', 'mission'] },
          phase: 'active',
        },
      },
    })),
    t: ((key: UltraKey) => en[key]) as DigitalEmployeeStudioProps['t'],
    ...overrides,
  } as DigitalEmployeeStudioProps
}

const originalViewport = {
  width: window.innerWidth,
  height: window.innerHeight,
}

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
}

function dispatchPointer(
  target: Element | Window,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  init: MouseEventInit & { pointerId: number },
): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init })
  Object.defineProperty(event, 'pointerId', { value: init.pointerId })
  fireEvent(target, event)
}

afterEach(() => {
  setViewport(originalViewport.width, originalViewport.height)
  document.body.innerHTML = ''
  for (const node of document.querySelectorAll('style')) node.remove()
})

describe('Digital Employee Studio', () => {
  it('groups stable Runtime Backends, exposes capabilities, and saves the selected target separately', async () => {
    const save = vi.fn(async () => ({
      ok: true as const,
      value: { ok: false as const, error: { code: 'profile-invalid' as const, message: 'stop after capture' } },
    }))
    render(<DigitalEmployeeStudio {...props({
      load: vi.fn(async () => ({ ok: true, value: view([profile()]) })),
      save,
    })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer One/ }))

    const backend = screen.getByLabelText('Runtime backend') as HTMLSelectElement
    expect([...backend.querySelectorAll('optgroup')].map(group => group.label)).toEqual([
      'DSH Models',
      'Local Agents',
    ])
    expect((within(backend).getByRole('option', { name: /Test Provider · Test Model/ }) as HTMLOptionElement).disabled).toBe(false)
    expect((within(backend).getByRole('option', { name: /Retired Provider · Retired Model.*unavailable/i }) as HTMLOptionElement).disabled).toBe(true)
    expect((within(backend).getByRole('option', { name: /Codex.*unsupported/i }) as HTMLOptionElement).disabled).toBe(true)
    expect((screen.getByLabelText('Reasoning effort') as HTMLSelectElement).value).toBe('')
    expect(within(screen.getByLabelText('Reasoning effort')).getByRole('option', { name: /High/ })).toBeTruthy()

    fireEvent.change(backend, { target: { value: 'external-agent/native-reviewer' } })
    expect(screen.getByText(/Available.*Fresh/)).toBeTruthy()
    expect(screen.getByText(/Persona.*Mission/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(() => { expect(save).toHaveBeenCalledOnce() })
    expect(save.mock.calls[0]?.[1]).toMatchObject({
      profile: { continuationProvider: 'spawn' },
      runtimeTarget: { kind: 'external-agent', provider: 'native-reviewer' },
    })
  })

  it('fences duplicate saves before React can render the pending state', async () => {
    let settle: ((value: Awaited<ReturnType<DigitalEmployeeStudioProps['save']>>) => void) | undefined
    const save = vi.fn(() => new Promise<Awaited<ReturnType<DigitalEmployeeStudioProps['save']>>>(resolveSave => {
      settle = resolveSave
    }))
    render(<DigitalEmployeeStudio {...props({ save })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    await screen.findByRole('button', { name: /New profile/ })
    fireEvent.click(screen.getByRole('button', { name: /New profile/ }))
    const saveButton = screen.getByRole('button', { name: 'Save profile' })
    fireEvent.click(saveButton)
    fireEvent.click(saveButton)
    expect(save).toHaveBeenCalledOnce()
    await act(async () => {
      settle?.({
        ok: true,
        value: {
          ok: true,
          value: saved(profile('New Employee')),
        },
      })
    })
  })

  it('replaces the whole view on refresh and discards a stale entity draft on Session change', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: view([profile('Reviewer One', 1)]) })
      .mockResolvedValueOnce({ ok: true, value: view([profile('Reviewer Two', 2)]) })
    const initial = props({ load })
    const rendered = render(<DigitalEmployeeStudio {...initial} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer One/ }))
    expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Reviewer One')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => {
      expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Reviewer Two')
    })
    expect(screen.getByRole('button', { name: /Reviewer Two/ }).textContent).toContain('Revision 2')

    rendered.rerender(<DigitalEmployeeStudio {...props({ sessionId: 'session-b' as never, load })} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps transport failure distinct from a domain rejection', async () => {
    const transport = vi.fn(async () => ({
      ok: false,
      error: { code: 'disconnected', message: 'offline' },
    } as const))
    const rendered = render(<DigitalEmployeeStudio {...props({ load: transport })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('offline (disconnected)')

    rendered.unmount()
    const server = catalog(profile('Server copy', 2), { headRevision: 4 })
    const load = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, value: view([profile()]) })
      .mockResolvedValue({ ok: true as const, value: catalogView([server]) })
    const domainSave = vi.fn(async () => ({
      ok: true,
      value: { ok: false, error: { code: 'profile-conflict', message: 'stale', currentHead: server.head } },
    } as const))
    render(<DigitalEmployeeStudio {...props({ load, save: domainSave })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer One/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    expect((await screen.findByRole('alert')).textContent).toContain('stale (profile-conflict)')
    await waitFor(() => {
      expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Server copy')
    })
  })

  it('cancels an unaccepted launch when the owning Session changes', async () => {
    let launchSignal: AbortSignal | undefined
    const spawn = vi.fn((_sessionId, _profileId, _assignment, signal?: AbortSignal) => {
      launchSignal = signal
      return new Promise<never>((_resolve, reject) => {
        signal?.addEventListener('abort', () => { reject(signal.reason) }, { once: true })
      })
    })
    const load = vi.fn(async () => ({ ok: true as const, value: view([profile()]) }))
    const rendered = render(<DigitalEmployeeStudio {...props({ load, spawn })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer One/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Launch employee' }))
    expect(launchSignal?.aborted).toBe(false)

    rendered.rerender(<DigitalEmployeeStudio {...props({ sessionId: 'session-b' as never, load, spawn })} />)
    await waitFor(() => { expect(launchSignal?.aborted).toBe(true) })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('inspects immutable history and sends explicit activate, rollback, and archive CAS operations', async () => {
    const oldest = profile('Reviewer One', 1)
    const active = profile('Reviewer Two', 2)
    const latest = profile('Reviewer Candidate', 3)
    const entry = catalog(latest, {
      headRevision: 5,
      activeRevision: 2,
      history: [latest, active, oldest],
    })
    const revision = vi.fn(async (_sessionId, _profileId, selectedRevision: number) => {
      const selected = [latest, active, oldest].find(candidate => candidate.revision === selectedRevision)!
      return {
        ok: true as const,
        value: {
          ok: true as const,
          value: {
            head: entry.head,
            revision: immutableRevision(selected),
            comparedToRevision: 2,
            diff: selectedRevision === 3
              ? [{ path: 'profile.displayName', kind: 'changed' as const, before: '"Reviewer Two"', after: '"Reviewer Candidate"' }]
              : [],
            diffTruncated: false,
          },
        },
      }
    })
    const mutate = async () => ({
      ok: true as const,
      value: { ok: true as const, value: { head: entry.head } },
    })
    const activate = vi.fn(mutate)
    const rollback = vi.fn(mutate)
    const archive = vi.fn(mutate)
    const load = vi.fn(async () => ({ ok: true as const, value: catalogView([entry]) }))

    render(<DigitalEmployeeStudio {...props({ load, revision, activate, rollback, archive })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer Candidate/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Revisions/ }))

    await waitFor(() => {
      expect(revision).toHaveBeenCalledWith('session-a', 'reviewer', 3)
    })
    expect(screen.getByText('profile.displayName')).toBeDefined()
    expect(screen.getByText(/Active r2/)).toBeDefined()
    expect(screen.getByText(/Latest r3/)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Activate latest' }))
    await waitFor(() => {
      expect(activate).toHaveBeenCalledWith('session-a', 'reviewer', 3, 5)
    })

    fireEvent.click(screen.getByRole('button', { name: /Revision 1/ }))
    await waitFor(() => {
      expect(revision).toHaveBeenCalledWith('session-a', 'reviewer', 1)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Roll back to revision 1' }))
    await waitFor(() => {
      expect(rollback).toHaveBeenCalledWith('session-a', 'reviewer', 1, 5)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Archive profile' }))
    await waitFor(() => {
      expect(archive).toHaveBeenCalledWith('session-a', 'reviewer', 5)
    })
  })

  it('blocks launch without an active Revision and offers restore for an archived Head', async () => {
    const candidate = profile('Inactive Reviewer', 1)
    const inactive = catalog(candidate, { headRevision: 1, activeRevision: null })
    const archived = catalog(candidate, { headRevision: 2, activeRevision: 1, archivedAt: 5 })
    const load = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, value: catalogView([inactive]) })
      .mockResolvedValue({ ok: true as const, value: catalogView([archived]) })
    const restore = vi.fn(async () => ({
      ok: true as const,
      value: { ok: true as const, value: { head: archived.head } },
    }))
    const rendered = render(<DigitalEmployeeStudio {...props({ load, restore })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Inactive Reviewer/ }))
    expect((screen.getByRole('button', { name: 'Launch employee' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('No active revision')).toBeDefined()

    rendered.unmount()
    render(<DigitalEmployeeStudio {...props({ load, restore })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Inactive Reviewer/ }))
    expect((screen.getByRole('button', { name: 'Launch employee' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Restore profile' }))
    await waitFor(() => {
      expect(restore).toHaveBeenCalledWith('session-a', 'reviewer', 2)
    })
  })
})

describe('sectioned navigation', () => {
  it('starts on the identity section, switches sections from the nav, and keeps edits while switching', async () => {
    const load = vi.fn(async () => ({ ok: true as const, value: view([profile()]) }))
    render(<DigitalEmployeeStudio {...props({ load })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    const card = await screen.findByRole('button', { name: /Reviewer One/ })
    expect(within(card).getByText('R')).toBeDefined()
    fireEvent.click(card)

    expect(screen.getByLabelText('Display name')).toBeDefined()
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Senior Reviewer' } })

    fireEvent.click(screen.getByRole('button', { name: /^Tools/ }))
    expect(screen.queryByLabelText('Display name')).toBeNull()
    expect(screen.getByRole('button', { name: 'Inherit all' })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: /^Persona/ }))
    expect(screen.getByLabelText('Persona')).toBeDefined()
    expect(screen.getByLabelText('Mission')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: /^Identity/ }))
    expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Senior Reviewer')
  })

  it('summarizes each section in the nav with counts and the tool mode', async () => {
    const configured: DigitalEmployeeProfile = {
      ...profile(),
      toolPolicy: { mode: 'allow', names: ['read'] },
      context: [
        { id: 'c1', title: 'Repo', content: 'Monorepo.', enabled: true },
        { id: 'c2', title: 'Style', content: 'Tabs.', enabled: false },
      ],
      memory: [{ id: 'm1', title: 'Decisions', content: 'ADR-7.', enabled: true }],
      hooks: [
        { id: 'h1', point: 'session-start', effect: 'context', text: 'Read README.', enabled: true },
        { id: 'h2', point: 'before-tool', effect: 'deny', matcher: 'shell*', text: 'No shell.', enabled: false },
      ],
    }
    const load = vi.fn(async () => ({ ok: true as const, value: view([configured]) }))
    render(<DigitalEmployeeStudio {...props({ load })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer One/ }))

    const nav = screen.getByRole('navigation', { name: 'Sections' })
    expect(within(nav).getByRole('button', { name: /Tools/ }).textContent).toContain('Allow selected')
    expect(within(nav).getByRole('button', { name: /Context/ }).textContent).toContain('2')
    expect(within(nav).getByRole('button', { name: /Memory/ }).textContent).toContain('1')
    expect(within(nav).getByRole('button', { name: /Hooks/ }).textContent).toContain('1 / 2')
  })
})

describe('movable and resizable window', () => {
  it('moves from the title bar and keeps the complete window inside the viewport', async () => {
    setViewport(1_200, 900)
    render(<DigitalEmployeeStudio {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    const dialog = await screen.findByRole('dialog')
    const dragHandle = dialog.querySelector<HTMLElement>('[data-window-drag-handle]')
    expect(dragHandle).not.toBeNull()

    const initialLeft = Number.parseFloat(dialog.style.left)
    const initialTop = Number.parseFloat(dialog.style.top)
    dispatchPointer(dragHandle as HTMLElement, 'pointerdown', {
      button: 0,
      pointerId: 7,
      clientX: 100,
      clientY: 100,
    })
    dispatchPointer(window, 'pointermove', { pointerId: 7, clientX: 140, clientY: 130 })
    expect(Number.parseFloat(dialog.style.left)).toBe(initialLeft + 40)
    expect(Number.parseFloat(dialog.style.top)).toBe(initialTop + 30)

    dispatchPointer(window, 'pointermove', { pointerId: 7, clientX: -2_000, clientY: -2_000 })
    expect(dialog.style.left).toBe('16px')
    expect(dialog.style.top).toBe('16px')
    dispatchPointer(window, 'pointerup', { pointerId: 7 })
  })

  it('resizes from every edge, respects minimums, and fits itself after viewport shrink', async () => {
    setViewport(1_200, 900)
    render(<DigitalEmployeeStudio {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.querySelectorAll('[data-resize-edge]')).toHaveLength(8)

    const southeast = dialog.querySelector<HTMLElement>('[data-resize-edge="se"]')
    expect(southeast).not.toBeNull()
    const initialWidth = Number.parseFloat(dialog.style.width)
    const initialHeight = Number.parseFloat(dialog.style.height)
    dispatchPointer(southeast as HTMLElement, 'pointerdown', {
      button: 0,
      pointerId: 9,
      clientX: 1_000,
      clientY: 700,
    })
    dispatchPointer(window, 'pointermove', { pointerId: 9, clientX: 1_050, clientY: 740 })
    expect(Number.parseFloat(dialog.style.width)).toBe(initialWidth + 50)
    expect(Number.parseFloat(dialog.style.height)).toBe(initialHeight + 40)
    dispatchPointer(window, 'pointermove', { pointerId: 9, clientX: -2_000, clientY: -2_000 })
    expect(dialog.style.width).toBe('680px')
    expect(dialog.style.height).toBe('480px')
    dispatchPointer(window, 'pointerup', { pointerId: 9 })

    setViewport(640, 420)
    fireEvent(window, new Event('resize'))
    await waitFor(() => {
      expect(dialog.style.left).toBe('16px')
      expect(dialog.style.top).toBe('16px')
      expect(dialog.style.width).toBe('608px')
      expect(dialog.style.height).toBe('388px')
    })
  })
})

describe('draft dirty tracking', () => {
  it('flags unsaved edits and clears the flag after a save refreshes the profile', async () => {
    const renamed = profile('Senior Reviewer', 2)
    const load = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, value: view([profile()]) })
      .mockResolvedValue({ ok: true as const, value: view([renamed]) })
    const save = vi.fn(async () => ({ ok: true as const, value: { ok: true as const, value: saved(renamed) } }))
    render(<DigitalEmployeeStudio {...props({ load, save })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer One/ }))
    expect(screen.queryByText(/Unsaved changes/)).toBeNull()

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Senior Reviewer' } })
    expect(screen.getByText(/Unsaved changes/)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(() => { expect(screen.queryByText(/Unsaved changes/)).toBeNull() })
  })
})

describe('text block cards', () => {
  function withMemory(): DigitalEmployeeProfile {
    return {
      ...profile(),
      memory: [{ id: 'm1', title: 'Conventions', content: 'Use pnpm.', enabled: true }],
    }
  }

  it('toggles a memory block from its card header and persists the change on save', async () => {
    const save = vi.fn(async () => ({
      ok: true as const,
      value: { ok: true as const, value: saved({ ...withMemory(), revision: 2 }) },
    }))
    const load = vi.fn(async () => ({ ok: true as const, value: view([withMemory()]) }))
    render(<DigitalEmployeeStudio {...props({ load, save })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer One/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Memory/ }))

    const card = screen.getByDisplayValue('Conventions').closest('article')
    expect(card).not.toBeNull()
    expect(within(card as HTMLElement).getByText(/9\s/)).toBeDefined()
    const toggle = within(card as HTMLElement).getByRole('switch')
    expect((toggle as HTMLInputElement).checked).toBe(true)
    fireEvent.click(toggle)

    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(() => { expect(save).toHaveBeenCalled() })
    const saved = save.mock.calls[0]?.[1].profile
    expect(saved.memory[0]?.enabled).toBe(false)
  })

  it('collapses a block card to its header and expands it again', async () => {
    const load = vi.fn(async () => ({ ok: true as const, value: view([withMemory()]) }))
    render(<DigitalEmployeeStudio {...props({ load })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer One/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Memory/ }))

    const card = screen.getByDisplayValue('Conventions').closest('article') as HTMLElement
    expect(within(card).getByLabelText('Content')).toBeDefined()
    fireEvent.click(within(card).getByRole('button', { name: 'Collapse' }))
    expect(within(card).queryByLabelText('Content')).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: 'Expand' }))
    expect(within(card).getByLabelText('Content')).toBeDefined()
  })
})

describe('hook cards', () => {
  function withHook(): DigitalEmployeeProfile {
    return {
      ...profile(),
      hooks: [{ id: 'h1', point: 'session-start', effect: 'context', text: 'Read the README first.', enabled: true }],
    }
  }

  it('derives the effect badge from the hook point and shows the matcher only for tool hooks', async () => {
    const load = vi.fn(async () => ({ ok: true as const, value: view([withHook()]) }))
    render(<DigitalEmployeeStudio {...props({ load })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer One/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Hooks/ }))

    expect(screen.getByText('Inject context')).toBeDefined()
    expect(screen.queryByLabelText(/Tool matcher/)).toBeNull()

    fireEvent.change(screen.getByLabelText('Point'), { target: { value: 'before-tool' } })
    expect(screen.getByText('Deny call')).toBeDefined()
    expect(screen.getByLabelText(/Tool matcher/)).toBeDefined()

    fireEvent.change(screen.getByLabelText('Point'), { target: { value: 'after-tool' } })
    expect(screen.getByText('Inject context')).toBeDefined()
    expect(screen.getByLabelText(/Tool matcher/)).toBeDefined()

    fireEvent.change(screen.getByLabelText('Point'), { target: { value: 'before-step' } })
    expect(screen.getByText('Inject context')).toBeDefined()
    expect(screen.queryByLabelText(/Tool matcher/)).toBeNull()
  })
})

describe('standalone Client bundle', () => {
  it('registers a lazy module-table factory and injects its CSS only when materialized', async () => {
    const code = readFileSync(resolve('packages/ui/lib/client.js'), 'utf8')
    let handoff: {
      id: string
      factory: (require: (specifier: string) => unknown) => Record<string, unknown>
    } | undefined
    ;(window as unknown as { __ModuleLoader__: { load: (value: typeof handoff) => void } }).__ModuleLoader__ = {
      load: value => { handoff = value },
    }
    // Deliberate built-artifact fixture: execute the browser factory registration in window scope.
    new Function(code)()
    expect(handoff?.id).toBe('@deepseek-ai/dsh-client-ui-agent-team-ultra')
    expect(document.querySelectorAll('style')).toHaveLength(0)
    const modules = new Map<string, unknown>([
      ['react', await import('react')],
      ['react/jsx-runtime', await import('react/jsx-runtime')],
      ['@deepseek-ai/cordis', await import('@deepseek-ai/cordis')],
      ['@deepseek-ai/dsh-client-ui-primitives', await import('@deepseek-ai/dsh-client-ui-primitives')],
    ])
    const exports = handoff?.factory(specifier => {
      if (!modules.has(specifier)) throw new Error(`unexpected require: ${specifier}`)
      return modules.get(specifier)
    })
    expect(exports?.apply).toBeTypeOf('function')
    expect(exports?.inject).toEqual(['remote', 'slots', 'locale'])
    expect(document.querySelectorAll('style[data-plugin-css]')).toHaveLength(1)
    handoff?.factory(specifier => {
      if (!modules.has(specifier)) throw new Error(`unexpected require: ${specifier}`)
      return modules.get(specifier)
    })
    expect(document.querySelectorAll('style[data-plugin-css]')).toHaveLength(1)
  })
})
