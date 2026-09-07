/** Browser registration and generated Remote lifecycle for Digital Employee Studio. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@benz-ai-x/dsh-agent-team-ultra/remote'
import type { DigitalEmployeeStudioFrame } from '@benz-ai-x/dsh-agent-team-ultra/client'
import type { TeamWatchFrame } from '@deepseek-ai/dsh-experimental-agent-team/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { RemoteSnapshotStream, RemoteStreamCarrierError } from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-experimental-client-ui-agent-team/client'
import type {} from '@deepseek-ai/dsh-experimental-agent-team/remote'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import {
  DigitalEmployeeStudio,
  type DigitalEmployeeStudioInjected,
  type DigitalEmployeeStudioWatchSink,
} from './Studio.tsx'
import {
  TeamMessageCenter,
  type TeamMessageCenterInjected,
  type TeamMessageCenterWatchControl,
  type TeamMessageCenterWatchSink,
} from './TeamMessageCenter.tsx'
import { en, NS, zh, type UltraKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'agent-team-ultra': UltraKey
  }
}

export const inject = ['remote', 'slots', 'locale']

function registerStudio(ctx: ClientContext): void {
  const messageWatchOwner = createTeamMessageWatchOwner()
  ctx.effect(
    () => async () => { await messageWatchOwner.dispose() },
    'client-ui-agent-team-ultra: message watch controls',
  )
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'client-ui-agent-team-ultra: dictionaries')
  const actions: DigitalEmployeeStudioInjected = {
    async load(sessionId) {
      return await ctx.remote.digitalEmployees.view(sessionId)
    },
    watch(sessionId, sink) {
      return createDigitalEmployeeStudioWatch(ctx, sessionId, sink)
    },
    async save(sessionId, request) {
      return await ctx.remote.digitalEmployees.save(sessionId, request)
    },
    async revision(sessionId, profileId, revision) {
      return await ctx.remote.digitalEmployees.revision(sessionId, { profileId, revision })
    },
    async activate(sessionId, profileId, revision, expectedHeadRevision) {
      return await ctx.remote.digitalEmployees.activate(sessionId, { profileId, revision, expectedHeadRevision })
    },
    async rollback(sessionId, profileId, revision, expectedHeadRevision) {
      return await ctx.remote.digitalEmployees.rollback(sessionId, { profileId, revision, expectedHeadRevision })
    },
    async archive(sessionId, profileId, expectedHeadRevision) {
      return await ctx.remote.digitalEmployees.archive(sessionId, { profileId, expectedHeadRevision })
    },
    async restore(sessionId, profileId, expectedHeadRevision) {
      return await ctx.remote.digitalEmployees.restore(sessionId, { profileId, expectedHeadRevision })
    },
    async spawn(sessionId, request, signal) {
      return await ctx.remote.digitalEmployees.spawn(sessionId, request, signal)
    },
    async run(sessionId, runId, signal) {
      return await ctx.remote.digitalEmployees.run(sessionId, { runId }, signal)
    },
    async saveEvalSet(sessionId, request) {
      return await ctx.remote.digitalEmployees.saveEvalSet(sessionId, request)
    },
    async setEvalGate(sessionId, request) {
      return await ctx.remote.digitalEmployees.setEvalGate(sessionId, request)
    },
    async startEvalRun(sessionId, request) {
      return await ctx.remote.digitalEmployees.startEvalRun(sessionId, request)
    },
    async cancelEvalRun(sessionId, request) {
      return await ctx.remote.digitalEmployees.cancelEvalRun(sessionId, request)
    },
    async evalRun(sessionId, request) {
      return await ctx.remote.digitalEmployees.evalRun(sessionId, request)
    },
  }
  const messageActions: TeamMessageCenterInjected = {
    async loadTeam(sessionId) {
      return await ctx.remote.agentTeams.view(sessionId)
    },
    watch(sessionId, sink) {
      return messageWatchOwner.own(createTeamMessageWatch(ctx, sessionId, sink))
    },
    async listMessages(sessionId, request) {
      return await ctx.remote.agentTeams.listMessages(sessionId, request)
    },
    async getMessage(sessionId, request) {
      return await ctx.remote.agentTeams.getMessage(sessionId, request)
    },
    async sendMessage(sessionId, request, signal) {
      return await ctx.remote.agentTeams.sendMessage(sessionId, request, signal)
    },
  }

  ctx.slots.inject(
    'conversation.session.header.actions',
    () => ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'agent-team-ultra',
      order: 21,
      locale: NS,
      inject: () => actions,
    }, DigitalEmployeeStudio),
  )
  ctx.slots.inject(
    'agent-team.panel.view',
    () => ctx.slots.register({
      name: 'agent-team.panel.view',
      id: 'messages',
      order: 20,
      label: () => ctx.locale.bind(NS)('messagesTab'),
      locale: NS,
      inject: () => messageActions,
    }, TeamMessageCenter),
  )
}

type TeamWatchBaselineFrame = Extract<TeamWatchFrame, { readonly type: 'baseline' }>
type TeamWatchInvalidationFrame = Exclude<TeamWatchFrame, TeamWatchBaselineFrame>

interface AwaitableTeamMessageWatchControl {
  start(): void
  dispose(): Promise<void>
}

interface TeamMessageWatchOwner {
  own(control: AwaitableTeamMessageWatchControl): TeamMessageCenterWatchControl
  dispose(): Promise<void>
}

/** Retain triggered message watch closes until the Client registration reaches quiescence. */
function createTeamMessageWatchOwner(): TeamMessageWatchOwner {
  const controls = new Set<TeamMessageCenterWatchControl>()
  const pending = new Set<Promise<void>>()
  const failures: unknown[] = []
  let accepting = true
  return {
    own(control) {
      let completion: Promise<void> | undefined
      let disposed = false
      const owned: TeamMessageCenterWatchControl = {
        start() {
          if (!disposed) control.start()
        },
        dispose(): Promise<void> {
          if (completion !== undefined) return completion
          disposed = true
          controls.delete(owned)
          const closing = control.dispose()
          const observed = closing.catch((error: unknown) => { failures.push(error) })
          completion = observed
          pending.add(observed)
          void observed.then(() => { pending.delete(observed) })
          return observed
        },
      }
      if (accepting) controls.add(owned)
      else void owned.dispose()
      return owned
    },
    async dispose() {
      accepting = false
      for (const control of [...controls]) void control.dispose()
      await Promise.all([...pending])
      if (failures.length === 1) throw failures[0]
      if (failures.length > 1) throw new AggregateError(failures, 'Team message watch controls failed to dispose')
    },
  }
}

/**
 * Reconnect one logical Team change stream for the message-center child view.
 *
 * @param ctx Client context that owns the generated Remote and Gateway stream.
 * @param sessionId Exact Team Lead Session key resolved again by the Host.
 * @param sink Generation-fenced message-center lifecycle destination.
 * @returns A start/dispose control owned by the mounted child Slot generation.
 */
export function createTeamMessageWatch(
  ctx: ClientContext,
  sessionId: Parameters<TeamMessageCenterInjected['loadTeam']>[0],
  sink: TeamMessageCenterWatchSink,
): AwaitableTeamMessageWatchControl {
  const stream = ctx.remote.$stream<TeamWatchFrame>({
    name: 'Agent Team message change stream',
    open: signal => ctx.remote.agentTeams.watch(sessionId, signal),
    ended: accepted => accepted
      ? new RemoteStreamCarrierError('Agent Team message change stream ended after opening')
      : new Error('Agent Team message change stream ended before its opening baseline'),
    carrierFailed: () => { sink.stale() },
  })
  return new RemoteSnapshotStream<TeamWatchBaselineFrame, TeamWatchInvalidationFrame>(stream, {
    name: 'Agent Team message change stream',
    isSnapshot: (frame): frame is TeamWatchBaselineFrame => frame.type === 'baseline',
    replace: frame => { sink.replace(frame.value) },
    update: () => { sink.invalidated() },
    failed: sink.failed,
  })
}

type DigitalEmployeeStudioBaselineFrame = Extract<DigitalEmployeeStudioFrame, { readonly type: 'baseline' }>
type DigitalEmployeeStudioReplacementFrame = Exclude<DigitalEmployeeStudioFrame, DigitalEmployeeStudioBaselineFrame>

/** Reconnect one logical Studio stream and accept only complete generation openings. */
export function createDigitalEmployeeStudioWatch(
  ctx: ClientContext,
  sessionId: Parameters<DigitalEmployeeStudioInjected['load']>[0],
  sink: DigitalEmployeeStudioWatchSink,
): RemoteSnapshotStream<DigitalEmployeeStudioBaselineFrame, DigitalEmployeeStudioReplacementFrame> {
  const stream = ctx.remote.$stream<DigitalEmployeeStudioFrame>({
    name: 'Digital Employee Studio snapshot stream',
    open: signal => ctx.remote.digitalEmployees.watch(sessionId, signal),
    ended: accepted => accepted
      ? new RemoteStreamCarrierError('Digital Employee Studio snapshot stream ended after opening')
      : new Error('Digital Employee Studio snapshot stream ended before its opening snapshot'),
    carrierFailed: () => { sink.stale() },
  })
  return new RemoteSnapshotStream(stream, {
    name: 'Digital Employee Studio snapshot stream',
    isSnapshot: (frame): frame is DigitalEmployeeStudioBaselineFrame => frame.type === 'baseline',
    replace: frame => { sink.replace(frame.value) },
    update: frame => { sink.replace(frame.value) },
    failed: sink.failed,
  })
}

/** Mount generated Remote descriptors before exposing the Studio Slot. */
export async function mountDigitalEmployeeStudio(
  ctx: ClientContext,
  contribution: TypertRemoteContribution,
): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.digitalEmployees', 'remote.agentTeams', 'slots', 'locale'], registerStudio)
  try {
    await ui
  } catch (error) {
    await ui.dispose()
    await disposeRemote()
    throw error
  }
  return async () => {
    await ui.dispose()
    await disposeRemote()
  }
}
