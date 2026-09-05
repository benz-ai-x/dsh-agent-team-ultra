// @vitest-environment jsdom

import { Context, Service } from '@deepseek-ai/cordis'
import type { DigitalEmployeeEvalRunId, LaunchRequestId } from '@benz-ai-x/dsh-agent-team-ultra/client'
import type { RemoteStreamOptions } from '@deepseek-ai/dsh-api-gateway/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/src/client/index.ts'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/src/client/registry.ts'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, vi } from 'vitest'
import { DigitalEmployeeStudio, type DigitalEmployeeStudioInjected } from '../src/client/Studio.tsx'
import { inject, mountDigitalEmployeeStudio } from '../src/client/mount.ts'

const REMOTE: TypertRemoteContribution = {
  package: '@benz-ai-x/dsh-agent-team-ultra',
  descriptors: [],
}

const LAUNCH_REQUEST_ID = '11111111-1111-4111-8111-111111111111' as LaunchRequestId
const EVAL_RUN_ID = '22222222-2222-4222-8222-222222222222' as DigitalEmployeeEvalRunId

async function bench(registrationFailure = false) {
  const ctx = new Context()
  const calls: { readonly method: string; readonly args: readonly unknown[] }[] = []

  class RemoteService extends Service {
    readonly disposeMount = vi.fn(async () => undefined)
    readonly mount = vi.fn(async (_contribution: unknown) => this.disposeMount)
    readonly createStream = vi.fn()
    readonly restartStream = vi.fn()
    readonly disposeStream = vi.fn(async () => undefined)
    streamOptions: RemoteStreamOptions<unknown> | undefined

    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }

    $mount(contribution: unknown): Promise<() => Promise<void>> {
      return this.mount(contribution)
    }

    $stream<Item>(options: RemoteStreamOptions<Item>): never {
      this.streamOptions = options as RemoteStreamOptions<unknown>
      this.createStream(options)
      return {
        restart: this.restartStream,
        dispose: this.disposeStream,
        [Symbol.asyncIterator]: async function * () {},
      } as never
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
    run: answer('run', { ok: true, value: {} }),
    saveEvalSet: answer('saveEvalSet', { ok: true, value: {} }),
    setEvalGate: answer('setEvalGate', { ok: true, value: {} }),
    startEvalRun: answer('startEvalRun', { ok: true, value: {} }),
    cancelEvalRun: answer('cancelEvalRun', { ok: true, value: {} }),
    evalRun: answer('evalRun', { ok: true, value: {} }),
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
    const sink = {
      replace: vi.fn(),
      stale: vi.fn(),
      failed: vi.fn(),
    }
    const watch = actions.watch('lead-session', sink)
    expect(runtime.remote.createStream).toHaveBeenCalledOnce()
    expect(runtime.remote.streamOptions).toMatchObject({
      name: 'Digital Employee Studio snapshot stream',
      open: expect.any(Function),
      ended: expect.any(Function),
      carrierFailed: expect.any(Function),
    })
    runtime.remote.streamOptions?.carrierFailed?.(new Error('carrier lost') as never)
    expect(sink.stale).toHaveBeenCalledOnce()
    watch.restart()
    expect(runtime.remote.restartStream).toHaveBeenCalledOnce()
    watch.start()
    await watch.dispose()
    expect(runtime.remote.disposeStream).toHaveBeenCalledOnce()
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
    await actions.run('lead-session', 'run-1' as never)
    await actions.saveEvalSet('lead-session', {
      expectedHeadRevision: null,
      evalSet: {
        id: 'reviewer-smoke',
        profileId: 'reviewer',
        displayName: 'Reviewer smoke',
        toolAllowlist: ['read'],
        resourceCeilings: { maxSteps: 3, maxOutputTokens: 512, maxElapsedMs: 10_000 },
        passPolicy: { kind: 'all' },
        cases: [{
          id: 'summarize',
          title: 'Summarize',
          input: 'Summarize README.',
          fixtures: [],
          assertions: {
            acceptedTerminals: ['completed'],
            requiredTools: ['read'],
            forbiddenTools: [],
            requiredOutputSubstrings: ['summary'],
            forbiddenOutputSubstrings: [],
          },
        }],
      },
    })
    await actions.setEvalGate('lead-session', {
      profileId: 'reviewer',
      expectedHeadRevision: 8,
      requiredEvalSet: { evalSetId: 'reviewer-smoke', revision: 2 },
    })
    await actions.startEvalRun('lead-session', {
      evalRunId: EVAL_RUN_ID,
      profileId: 'reviewer',
      profileRevision: 3,
      evalSetId: 'reviewer-smoke',
      evalSetRevision: 2,
    })
    await actions.cancelEvalRun('lead-session', { evalRunId: EVAL_RUN_ID })
    await actions.evalRun('lead-session', { evalRunId: EVAL_RUN_ID })
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
      { method: 'run', args: ['lead-session', { runId: 'run-1' }, undefined] },
      {
        method: 'saveEvalSet',
        args: ['lead-session', expect.objectContaining({ expectedHeadRevision: null })],
      },
      {
        method: 'setEvalGate',
        args: ['lead-session', {
          profileId: 'reviewer',
          expectedHeadRevision: 8,
          requiredEvalSet: { evalSetId: 'reviewer-smoke', revision: 2 },
        }],
      },
      {
        method: 'startEvalRun',
        args: ['lead-session', {
          evalRunId: EVAL_RUN_ID,
          profileId: 'reviewer',
          profileRevision: 3,
          evalSetId: 'reviewer-smoke',
          evalSetRevision: 2,
        }],
      },
      { method: 'cancelEvalRun', args: ['lead-session', { evalRunId: EVAL_RUN_ID }] },
      { method: 'evalRun', args: ['lead-session', { evalRunId: EVAL_RUN_ID }] },
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
