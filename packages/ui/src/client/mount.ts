/** Browser registration and generated Remote lifecycle for Digital Employee Studio. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@benz-ai-x/dsh-agent-team-ultra/remote'
import type { DigitalEmployeeStudioFrame } from '@benz-ai-x/dsh-agent-team-ultra/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { RemoteSnapshotStream, RemoteStreamCarrierError } from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-experimental-client-ui-agent-team/client'
import type {} from '@deepseek-ai/dsh-experimental-agent-team/remote'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import {
  DigitalEmployeeStudio,
  type DigitalEmployeeStudioInjected,
  type DigitalEmployeeStudioWatchSink,
} from './Studio.tsx'
import { TeamMessageCenter, type TeamMessageCenterInjected } from './TeamMessageCenter.tsx'
import { en, NS, zh, type UltraKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'agent-team-ultra': UltraKey
  }
}

export const inject = ['remote', 'slots', 'locale', 'agentTeamPanelNavigation']

function registerStudio(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'client-ui-agent-team-ultra: dictionaries')
  const actions: DigitalEmployeeStudioInjected = {
    openTeamMessages(sessionId, memberId) {
      ctx.agentTeamPanelNavigation.open({
        teamSessionId: sessionId,
        viewId: 'messages',
        memberId: memberId as SessionId,
      })
    },
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
  const ui = ctx.inject([
    'remote.digitalEmployees',
    'remote.agentTeams',
    'slots',
    'locale',
    'agentTeamPanelNavigation',
  ], registerStudio)
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
