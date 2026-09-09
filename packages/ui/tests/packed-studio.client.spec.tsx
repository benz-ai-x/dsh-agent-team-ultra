// @vitest-environment jsdom
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Context } from '@deepseek-ai/cordis'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import * as ClientGateway from '@deepseek-ai/dsh-api-gateway/src/client/index.ts'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/src/client/index.ts'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/src/client/registry.ts'
import { describe, expect, it, vi } from 'vitest'
import { workflow, profile } from '../../domain/tests/fixtures/host-workflow.ts'
import { en, type UltraKey } from '../src/client/locales.ts'
import type { DigitalEmployeeStudioInjected, DigitalEmployeeStudioProps } from '../src/client/Studio.tsx'

describe('shipping B0 Studio bundle and real Host/Remote', () => {
  it('surfaces Host CAS errors, retries a lost response without another child, opens the official conversation and unmounts', async () => {
    const host = await workflow()
    const client = new Context()
    let mounted: ReturnType<typeof render> | undefined
    try {
      await client.plugin(TypertRegistry)
      let loseLaunch = true
      const launchIds: string[] = []
      client.provide('connection', {
        start: () => ({ stop() {} }), registerGenerationSource: () => () => undefined,
        rpc: {
          async *open() { throw new Error('B0 does not open streams') },
          async call(_path: string, endpoint: string, payload: { args: { agentId: string; request?: { launchRequestId?: string } } }, signal: AbortSignal) {
            const method = endpoint.split('/')[1]!
            const value = await host.invoke(method, payload.args.request, payload.args.agentId as never, signal)
            if (method === 'spawn') {
              launchIds.push(payload.args.request!.launchRequestId!)
              if (loseLaunch) { loseLaunch = false; throw new Error('RESPONSE_LOST_AFTER_HOST_ACCEPTANCE') }
            }
            return { ok: true, value }
          },
        },
      } as never)
      await client.plugin(ClientGateway)
      client.provide('locale', new LocaleRuntime(client))
      const openSubagent = vi.fn()
      client.provide('sessions', {
        refreshSubagents: vi.fn(async () => undefined),
        list: { getSnapshot: () => ({ current: host.lead.agent.id }) }, openSubagent,
      } as never)
      await client.plugin(SlotRegistry)
      client.slots.register({ name: 'root', children: { 'conversation.session.header.actions': { kind: 'list', scope: 'session' } } } as never, () => null)

      let plugin: { apply: (ctx: Context) => Promise<() => Promise<void>> } | undefined
      const source = await readFile(join(process.env.ULTRA_PACKED_UI ?? join(process.cwd(), 'packages/ui'), 'lib/client.js'), 'utf8')
      const windowSeat = { __ModuleLoader__: { load(record: { id: string; factory: (require: (name: string) => unknown) => typeof plugin }) {
        expect(record.id).toBe('@benz-ai-x/dsh-client-ui-agent-team-ultra')
        plugin = record.factory(name => {
          if (name === 'react') return React
          if (name === 'react/jsx-runtime') return jsx
          throw new Error('Unexpected browser runtime dependency: ' + name)
        })
      } } }
      new Function('window', source)(windowSeat)
      expect(plugin).toBeDefined()
      const dispose = await plugin!.apply(client)
      const entry = client.slots.entries('conversation.session.header.actions')[0]!
      expect(entry).toBeDefined()
      const actions = (entry.inject as unknown as () => DigitalEmployeeStudioInjected)()
      mounted = render(React.createElement(entry.component as React.ComponentType<DigitalEmployeeStudioProps>, {
        ...actions, sessionId: host.lead.agent.id, t: (key: UltraKey) => en[key],
      }))
      fireEvent.click(screen.getByRole('button', { name: en.title }))
      await screen.findByRole('dialog')
      for (const key of ['id', 'employeeName', 'displayName', 'description', 'persona', 'mission'] as const) {
        fireEvent.change(screen.getByLabelText(en[key]), { target: { value: profile[key] } })
      }
      fireEvent.click(screen.getByRole('button', { name: en.save }))
      await screen.findByRole('button', { name: 'Reviewer · r1' })
      // Advance the real Host behind the editor; the UI must keep its rejected draft.
      expect(await host.invoke('save', { expectedHeadRevision: 1, profile: { ...profile, mission: 'OTHER_EDITOR' } })).toMatchObject({ ok: true })
      fireEvent.change(screen.getByLabelText(en.persona), { target: { value: 'UNSAVED_PACKED_DRAFT' } })
      fireEvent.click(screen.getByRole('button', { name: en.save }))
      expect((await screen.findByRole('alert')).textContent).toContain('profile-conflict')
      expect((screen.getByLabelText(en.persona) as HTMLTextAreaElement).value).toBe('UNSAVED_PACKED_DRAFT')
      fireEvent.click(screen.getByRole('button', { name: en.refresh }))
      fireEvent.click(await screen.findByRole('button', { name: 'Reviewer · r2' }))
      fireEvent.click(screen.getByRole('button', { name: en.activate }))
      await waitFor(() => expect((screen.getByRole('button', { name: en.launch }) as HTMLButtonElement).disabled).toBe(false))
      fireEvent.click(screen.getByRole('button', { name: en.launch }))
      expect((await screen.findByRole('alert')).textContent).toContain(en.launchUnknown)
      fireEvent.click(screen.getByRole('button', { name: en.close }))
      fireEvent.click(screen.getByRole('button', { name: en.title }))
      fireEvent.click(await screen.findByRole('button', { name: 'Reviewer · r2' }))
      fireEvent.click(screen.getByRole('button', { name: en.launch }))
      await waitFor(() => expect(launchIds).toHaveLength(2))
      expect(launchIds[0]).toBe(launchIds[1])
      await waitFor(() => expect((screen.getByRole('button', { name: en.openConversation }) as HTMLButtonElement).disabled).toBe(false))
      fireEvent.click(screen.getByRole('button', { name: en.openConversation }))
      const members = host.ctx.agentTeams.listMembers(host.lead.agent).filter(row => row.role === 'teammate')
      expect(members).toHaveLength(1)
      await waitFor(() => expect(openSubagent).toHaveBeenCalledWith({ parentSessionId: host.lead.agent.id, childSessionId: members[0]!.id, mode: 'continuable' }))
      mounted.unmount()
      mounted = undefined
      await act(async () => { await dispose() })
      expect(client.slots.entries('conversation.session.header.actions')).toEqual([])
      expect(client.get('remote.digitalEmployees')).toBeUndefined()
    } finally {
      mounted?.unmount()
      cleanup()
      sessionStorage.clear()
      await client.fiber.dispose()
    }
  })
})
