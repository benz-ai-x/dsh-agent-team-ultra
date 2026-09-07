// @vitest-environment jsdom

import { Context, Service } from '@deepseek-ai/cordis'
import type { DigitalEmployeeEvalRunId, LaunchRequestId } from '@benz-ai-x/dsh-agent-team-ultra/client'
import type { RemoteStreamOptions } from '@deepseek-ai/dsh-api-gateway/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/src/client/index.ts'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/src/client/registry.ts'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, vi } from 'vitest'
import { DigitalEmployeeStudio, type DigitalEmployeeStudioInjected } from '../src/client/Studio.tsx'
import { TeamMessageCenter, type TeamMessageCenterInjected } from '../src/client/TeamMessageCenter.tsx'
import { inject, mountDigitalEmployeeStudio } from '../src/client/mount.ts'

const REMOTE: TypertRemoteContribution = {
  package: '@benz-ai-x/dsh-agent-team-ultra',
  descriptors: [],
}

const LAUNCH_REQUEST_ID = '11111111-1111-4111-8111-111111111111' as LaunchRequestId
const EVAL_RUN_ID = '22222222-2222-4222-8222-222222222222' as DigitalEmployeeEvalRunId

async function bench(
  registrationFailure = false,
  disposeStreamGate?: Promise<unknown>,
  disposeStreamFailure?: unknown,
) {
  const ctx = new Context()
  const calls: { readonly method: string; readonly args: readonly unknown[] }[] = []

  class RemoteService extends Service {
    readonly disposeMount = vi.fn(async () => undefined)
    readonly mount = vi.fn(async (_contribution: unknown) => this.disposeMount)
    readonly createStream = vi.fn()
    readonly restartStream = vi.fn()
    readonly disposeStream = vi.fn(async () => {
      await disposeStreamGate
      if (disposeStreamFailure !== undefined) throw disposeStreamFailure
    })
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
  const agentTeams = {
    view: answer('team/view', { members: [], tasks: [] }),
    watch: (...args: unknown[]) => {
      calls.push({ method: 'team/watch', args })
      return { [Symbol.asyncIterator]: async function * () {} }
    },
    listMessages: answer('team/listMessages', { items: [], committedCursor: 'cursor', complete: true }),
    getMessage: answer('team/getMessage', {}),
    sendMessage: answer('team/sendMessage', { ok: true, value: {} }),
  }
  const disposeAgentTeams = ctx.reflect.provide('remote.agentTeams', agentTeams as never)
  ctx.provide('conversation', {})
  ctx.provide('locale', new LocaleRuntime(ctx))
  await ctx.plugin(SlotRegistry).await()
  const disposeRoot = ctx.slots.register({
    name: 'root',
    children: { 'conversation.session.header.actions': { kind: 'list', scope: 'session' } },
  } as never, () => null)
  const disposeTeamOwner = ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'agent-team-owner',
    children: { 'agent-team.panel.view': { kind: 'list', scope: 'session' } },
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
  const messageEntry = () => ctx.slots.entries('agent-team.panel.view')
    .find(candidate => candidate.component === TeamMessageCenter)
  return {
    ctx, fiber, activation, calls, disposeRoot, disposeTeamOwner, entry, messageEntry, remote,
    agentTeams, disposeAgentTeams,
  }
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
    expect(runtime.messageEntry()).toMatchObject({
      options: { id: 'messages', order: 20 },
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
    const messageActions = (runtime.messageEntry()!.inject as unknown as () => TeamMessageCenterInjected)()
    await messageActions.loadTeam('lead-session')
    const messageSink = {
      replace: vi.fn(),
      invalidated: vi.fn(),
      stale: vi.fn(),
      failed: vi.fn(),
    }
    const messageWatch = messageActions.watch('lead-session', messageSink)
    expect(runtime.remote.createStream).toHaveBeenCalledTimes(2)
    expect(runtime.remote.streamOptions).toMatchObject({
      name: 'Agent Team message change stream',
      open: expect.any(Function),
      ended: expect.any(Function),
      carrierFailed: expect.any(Function),
    })
    runtime.remote.streamOptions?.carrierFailed?.(new Error('message carrier lost') as never)
    expect(messageSink.stale).toHaveBeenCalledOnce()
    runtime.remote.streamOptions?.open(new AbortController().signal)
    expect(runtime.calls.at(-1)?.method).toBe('team/watch')
    messageWatch.start()
    await messageWatch.dispose()
    expect(runtime.remote.disposeStream).toHaveBeenCalledTimes(2)
    await messageActions.listMessages('lead-session', { limit: 20 })
    await messageActions.getMessage('lead-session', {
      messageId: 'message-1' as never,
      committedCursor: 'cursor' as never,
    })
    await messageActions.sendMessage('lead-session', {
      requestId: 'request-1' as never,
      recipientId: 'worker-session' as never,
      text: 'Review this message.',
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
      { method: 'team/view', args: ['lead-session'] },
      { method: 'team/watch', args: ['lead-session', expect.any(AbortSignal)] },
      { method: 'team/listMessages', args: ['lead-session', { limit: 20 }] },
      {
        method: 'team/getMessage',
        args: ['lead-session', { messageId: 'message-1', committedCursor: 'cursor' }],
      },
      {
        method: 'team/sendMessage',
        args: [
          'lead-session',
          { requestId: 'request-1', recipientId: 'worker-session', text: 'Review this message.' },
          expect.any(AbortSignal),
        ],
      },
    ])

    await runtime.fiber.dispose()
    expect(runtime.entry()).toBeUndefined()
    expect(runtime.messageEntry()).toBeUndefined()
    expect(runtime.remote.disposeMount).toHaveBeenCalledOnce()
    runtime.disposeRoot()
    runtime.disposeTeamOwner()
    await runtime.ctx.fiber.dispose()
  })

  it('rolls the Remote contribution back when later slot registration fails', async () => {
    const runtime = await bench(true)
    await expect(runtime.activation).resolves.toMatchObject({ message: 'slot registration failed' })
    expect(runtime.remote.mount).toHaveBeenCalledOnce()
    expect(runtime.remote.disposeMount).toHaveBeenCalledOnce()
    runtime.disposeRoot()
    runtime.disposeTeamOwner()
    await runtime.ctx.fiber.dispose()
  })

  it('awaits a React-triggered message watch disposal before its Fiber releases Remote registration', async () => {
    const released = Promise.withResolvers<undefined>()
    const runtime = await bench(false, released.promise)
    const actions = (runtime.messageEntry()!.inject as unknown as () => TeamMessageCenterInjected)()
    const control = actions.watch('lead-session', {
      replace() {}, invalidated() {}, stale() {}, failed() {},
    })
    control.start()

    void control.dispose()
    expect(runtime.remote.disposeStream).toHaveBeenCalledOnce()
    let settled = false
    const closing = runtime.fiber.dispose().then(() => { settled = true })
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(settled).toBe(false)
    expect(runtime.remote.disposeMount).not.toHaveBeenCalled()

    released.resolve(undefined)
    await closing
    expect(runtime.remote.disposeStream).toHaveBeenCalledOnce()
    expect(runtime.remote.disposeMount).toHaveBeenCalledOnce()
    expect(runtime.messageEntry()).toBeUndefined()
    runtime.disposeRoot()
    runtime.disposeTeamOwner()
    await runtime.ctx.fiber.dispose()
  })

  it('reports message watch disposal failure through lifecycle while releasing Remote registration', async () => {
    const failure = new Error('message watch transport disposal failed')
    const runtime = await bench(false, undefined, failure)
    const logged = vi.spyOn(runtime.ctx.logger, 'error')
    const actions = (runtime.messageEntry()!.inject as unknown as () => TeamMessageCenterInjected)()
    const control = actions.watch('lead-session', {
      replace() {}, invalidated() {}, stale() {}, failed() {},
    })
    control.start()

    void control.dispose()
    await runtime.fiber.dispose()
    expect(logged).toHaveBeenCalledWith(failure)
    expect(runtime.remote.disposeStream).toHaveBeenCalledOnce()
    expect(runtime.remote.disposeMount).toHaveBeenCalledOnce()
    expect(runtime.messageEntry()).toBeUndefined()
    runtime.disposeRoot()
    runtime.disposeTeamOwner()
    await runtime.ctx.fiber.dispose()
  })

  it('drains message watches before an Agent Team service generation is withdrawn', async () => {
    const released = Promise.withResolvers<undefined>()
    const runtime = await bench(false, released.promise)
    const actions = (runtime.messageEntry()!.inject as unknown as () => TeamMessageCenterInjected)()
    const control = actions.watch('lead-session', {
      replace() {}, invalidated() {}, stale() {}, failed() {},
    })
    control.start()

    let withdrawn = false
    const withdrawing = Promise.resolve(runtime.disposeAgentTeams()).then(() => { withdrawn = true })
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(withdrawn).toBe(false)
    expect(runtime.remote.disposeStream).toHaveBeenCalledOnce()
    expect(runtime.messageEntry()).toBeUndefined()

    released.resolve(undefined)
    await withdrawing
    const staleControl = actions.watch('lead-session', {
      replace() {}, invalidated() {}, stale() {}, failed() {},
    })
    expect(runtime.remote.createStream).toHaveBeenCalledTimes(2)
    expect(runtime.remote.disposeStream).toHaveBeenCalledTimes(2)
    staleControl.start()

    const disposeReplacement = runtime.ctx.reflect.provide('remote.agentTeams', runtime.agentTeams as never)
    await vi.waitFor(() => { expect(runtime.messageEntry()).toBeDefined() })
    await disposeReplacement()
    await runtime.fiber.dispose()
    runtime.disposeRoot()
    runtime.disposeTeamOwner()
    await runtime.ctx.fiber.dispose()
  })
})
