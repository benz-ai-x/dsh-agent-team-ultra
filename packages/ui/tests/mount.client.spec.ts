// @vitest-environment jsdom
import { Context, Service } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/src/client/index.ts'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/src/client/registry.ts'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, vi } from 'vitest'
import { mountDigitalEmployeeStudio } from '../src/client/mount.ts'
import { DigitalEmployeeStudio, type DigitalEmployeeStudioInjected } from '../src/client/Studio.tsx'

const REMOTE: TypertRemoteContribution = { package: '@benz-ai-x/dsh-agent-team-ultra', descriptors: [] }
async function bench(fail = false) {
  const ctx = new Context()
  const disposeMount = vi.fn(async () => undefined)
  class RemoteService extends Service {
    constructor(context: Context) { super(context, 'remote') }
    $mount = vi.fn(async () => disposeMount)
  }
  const remote = new RemoteService(ctx)
  const view = vi.fn(async () => ({ ok: true, value: { profiles: [], tools: [], instances: [] } }))
  ctx.provide('remote.digitalEmployees', { view } as never)
  const openSubagent = vi.fn()
  ctx.provide('sessions', { refreshSubagents: vi.fn(async () => undefined), list: { getSnapshot: () => ({ current: 'lead' }) }, openSubagent } as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  await ctx.plugin(SlotRegistry)
  ctx.slots.register({ name: 'root', children: { 'conversation.session.header.actions': { kind: 'list', scope: 'session' } } } as never, () => null)
  if (fail) vi.spyOn(ctx.slots, 'inject').mockImplementationOnce(() => { throw new Error('slot failed') })
  return { ctx, remote, disposeMount, view, openSubagent }
}

describe('Studio public Slot and generated Remote lifetime', () => {
  it('registers one official header Slot and releases it with the Remote namespace', async () => {
    const { ctx, remote, disposeMount, view, openSubagent } = await bench()
    try {
      const dispose = await mountDigitalEmployeeStudio(ctx, REMOTE)
      expect(remote.$mount).toHaveBeenCalledWith(REMOTE)
      const entry = ctx.slots.entries('conversation.session.header.actions').find(row => row.component === DigitalEmployeeStudio)!
      expect(entry).toBeDefined()
      const actions = (entry.inject as unknown as () => DigitalEmployeeStudioInjected)()
      await actions.load('lead' as never)
      expect(view).toHaveBeenCalledWith('lead')
      await actions.openConversation('lead' as never, 'child')
      expect(openSubagent).toHaveBeenCalledWith({ parentSessionId: 'lead', childSessionId: 'child', mode: 'continuable' })
      await dispose()
      expect(ctx.slots.entries('conversation.session.header.actions')).toEqual([])
      expect(disposeMount).toHaveBeenCalledOnce()
    } finally { await ctx.fiber.dispose() }
  })

  it('bubbles registration failure and releases the already-mounted Remote', async () => {
    const { ctx, disposeMount } = await bench(true)
    try {
      await expect(mountDigitalEmployeeStudio(ctx, REMOTE)).rejects.toThrow('slot failed')
      expect(disposeMount).toHaveBeenCalledOnce()
    } finally { await ctx.fiber.dispose() }
  })
})
