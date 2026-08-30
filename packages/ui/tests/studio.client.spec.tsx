// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  DigitalEmployeeProfile,
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
    provider: 'spawn',
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

function view(profiles: readonly DigitalEmployeeProfile[] = []): DigitalEmployeeStudioView {
  return {
    profiles,
    tools: [{ name: 'read', description: 'Read files' }],
    instances: [],
  }
}

function props(overrides: Partial<DigitalEmployeeStudioProps> = {}): DigitalEmployeeStudioProps {
  return {
    sessionId: 'session-a' as never,
    load: vi.fn(async () => ({ ok: true, value: view() })),
    save: vi.fn(async () => ({ ok: true, value: { ok: false, error: { code: 'profile-invalid', message: 'invalid' } } })),
    remove: vi.fn(async () => ({ ok: true, value: { ok: true, value: { deleted: true } } })),
    spawn: vi.fn(async () => ({
      ok: true,
      value: {
        ok: true,
        value: {
          teamId: 'session-a', memberName: 'reviewer', profileId: 'reviewer', profileRevision: 1, phase: 'active',
        },
      },
    })),
    t: ((key: UltraKey) => en[key]) as DigitalEmployeeStudioProps['t'],
    ...overrides,
  } as DigitalEmployeeStudioProps
}

afterEach(() => {
  document.body.innerHTML = ''
  for (const node of document.querySelectorAll('style')) node.remove()
})

describe('Digital Employee Studio', () => {
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
          value: profile('New Employee'),
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
    expect(screen.getByText('Revision 2')).not.toBeNull()

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
    const domainSave = vi.fn(async () => ({
      ok: true,
      value: { ok: false, error: { code: 'profile-conflict', message: 'stale', current: profile('Server copy', 2) } },
    } as const))
    render(<DigitalEmployeeStudio {...props({ save: domainSave })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    await screen.findByRole('button', { name: /New profile/ })
    fireEvent.click(screen.getByRole('button', { name: /New profile/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    expect((await screen.findByRole('alert')).textContent).toContain('stale (profile-conflict)')
    expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Server copy')
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
