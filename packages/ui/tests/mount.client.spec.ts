// @vitest-environment jsdom

import { Context, Service } from '@deepseek-ai/cordis'
import type { LaunchRequestId } from '@deepseek-ai/dsh-agent-team-ultra/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/src/client/index.ts'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/src/client/registry.ts'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, vi } from 'vitest'
import { DigitalEmployeeStudio, type DigitalEmployeeStudioInjected } from '../src/client/Studio.tsx'
import { inject, mountDigitalEmployeeStudio } from '../src/client/mount.ts'

const REMOTE: TypertRemoteContribution = {
  package: '@deepseek-ai/dsh-agent-team-ultra',
  descriptors: [],
}

const LAUNCH_REQUEST_ID = '11111111-1111-4111-8111-111111111111' as LaunchRequestId

async function bench(registrationFailure = false) {
  const ctx = new Context()
  const calls: { readonly method: string; readonly args: readonly unknown[] }[] = []

  class RemoteService extends Service {
    readonly disposeMount = vi.fn(async () => undefined)
    readonly mount = vi.fn(async (_contribution: unknown) => this.disposeMount)

    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }

    $mount(contribution: unknown): Promise<() => Promise<void>> {
      return this.mount(contribution)
    }
  }

  const remote = new RemoteService(ctx)
  const answer = (method: string, value: unknown) => (...args: unknown[]) => {
    calls.push({ method, args })
    return Promise.resolve({ ok: true as const, value })
  }
  ctx.provide('remote.digitalEmployees', {
    view: answer('view', { profiles: [], tools: [], instances: [] }),
    save: answer('save', { ok: true, value: {} }),
    revision: answer('revision', { ok: true, value: {} }),
    activate: answer('activate', { ok: true, value: {} }),
    rollback: answer('rollback', { ok: true, value: {} }),
    archive: answer('archive', { ok: true, value: {} }),
    restore: answer('restore', { ok: true, value: {} }),
    spawn: answer('spawn', { ok: true, value: {} }),
  } as never)
  ctx.provide('conversation', {})
  ctx.provide('locale', new LocaleRuntime(ctx))
  await ctx.plugin(SlotRegistry).await()
  const disposeRoot = ctx.slots.register({
    name: 'root',
    children: { 'conversation.session.header.actions': { kind: 'list', scope: 'session' } },
  } as never, () => null)
  if (registrationFailure) {
    vi.spyOn(ctx.slots, 'inject').mockImplementationOnce(() => { throw new Error('slot registration failed') })
  }

  const fiber = registrationFailure
    ? ctx.plugin({ apply() {} })
    : ctx.plugin({ inject: [...inject], apply: clientCtx => mountDigitalEmployeeStudio(clientCtx, REMOTE) })
  const activation = registrationFailure
    ? mountDigitalEmployeeStudio(ctx, REMOTE).catch((error: unknown) => error)
    : fiber.await()
  await fiber.await()
  if (!registrationFailure) await activation

  const entry = () => ctx.slots.entries('conversation.session.header.actions')
    .find(candidate => candidate.component === DigitalEmployeeStudio)
  return { ctx, fiber, activation, calls, disposeRoot, entry, remote }
}

describe('Digital Employee Studio mount lifecycle', () => {
  it('registers one disposable slot after mounting the generated Remote', async () => {
    const runtime = await bench()
    expect(inject).toEqual(['remote', 'slots', 'locale'])
    expect(runtime.remote.mount).toHaveBeenCalledWith(REMOTE)
    expect(runtime.entry()).toMatchObject({
      options: { id: 'agent-team-ultra', order: 21 },
      locale: 'agent-team-ultra',
    })

    const actions = (runtime.entry()!.inject as unknown as () => DigitalEmployeeStudioInjected)()
    await actions.load('lead-session')
    await actions.revision('lead-session', 'reviewer', 2)
    await actions.activate('lead-session', 'reviewer', 2, 4)
    await actions.rollback('lead-session', 'reviewer', 1, 5)
    await actions.archive('lead-session', 'reviewer', 6)
    await actions.restore('lead-session', 'reviewer', 7)
    await actions.spawn('lead-session', {
      launchRequestId: LAUNCH_REQUEST_ID,
      profileId: 'reviewer',
      assignment: 'Review this change.',
    }, new AbortController().signal)
    expect(runtime.calls).toEqual([
      { method: 'view', args: ['lead-session'] },
      { method: 'revision', args: ['lead-session', { profileId: 'reviewer', revision: 2 }] },
      {
        method: 'activate',
        args: ['lead-session', { profileId: 'reviewer', revision: 2, expectedHeadRevision: 4 }],
      },
      {
        method: 'rollback',
        args: ['lead-session', { profileId: 'reviewer', revision: 1, expectedHeadRevision: 5 }],
      },
      { method: 'archive', args: ['lead-session', { profileId: 'reviewer', expectedHeadRevision: 6 }] },
      { method: 'restore', args: ['lead-session', { profileId: 'reviewer', expectedHeadRevision: 7 }] },
      {
        method: 'spawn',
        args: [
          'lead-session',
          {
            launchRequestId: LAUNCH_REQUEST_ID,
            profileId: 'reviewer',
            assignment: 'Review this change.',
          },
          expect.any(AbortSignal),
        ],
      },
    ])

    await runtime.fiber.dispose()
    expect(runtime.entry()).toBeUndefined()
    expect(runtime.remote.disposeMount).toHaveBeenCalledOnce()
    runtime.disposeRoot()
    await runtime.ctx.fiber.dispose()
  })

  it('rolls the Remote contribution back when later slot registration fails', async () => {
    const runtime = await bench(true)
    await expect(runtime.activation).resolves.toMatchObject({ message: 'slot registration failed' })
    expect(runtime.remote.mount).toHaveBeenCalledOnce()
    expect(runtime.remote.disposeMount).toHaveBeenCalledOnce()
    runtime.disposeRoot()
    await runtime.ctx.fiber.dispose()
  })
})
