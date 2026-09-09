import type { Context } from '@deepseek-ai/cordis'
import type {} from '@benz-ai-x/dsh-agent-team-ultra/remote'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { DigitalEmployeeStudio, type DigitalEmployeeStudioInjected } from './Studio.tsx'
import { NS, en, zh, type UltraKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'agent-team-ultra': UltraKey }
}
export const inject = ['sessions', 'remote', 'slots', 'locale']

function registerStudio(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'ultra-b0:locale')
  const actions: DigitalEmployeeStudioInjected = {
    load: id => ctx.remote.digitalEmployees.view(id),
    save: (id, request) => ctx.remote.digitalEmployees.save(id, request),
    revision: (id, request) => ctx.remote.digitalEmployees.revision(id, request),
    activate: (id, request) => ctx.remote.digitalEmployees.activate(id, request),
    rollback: (id, request) => ctx.remote.digitalEmployees.rollback(id, request),
    archive: (id, request) => ctx.remote.digitalEmployees.archive(id, request),
    restore: (id, request) => ctx.remote.digitalEmployees.restore(id, request),
    spawn: (id, request, signal) => ctx.remote.digitalEmployees.spawn(id, request, signal),
    async openConversation(parentSessionId, memberId) {
      await ctx.sessions.refreshSubagents(parentSessionId)
      if (ctx.sessions.list.getSnapshot().current !== parentSessionId) return
      ctx.sessions.openSubagent({ parentSessionId, childSessionId: memberId as SessionId, mode: 'continuable' })
    },
  }
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions', id: 'agent-team-ultra', order: 21, locale: NS,
    inject: () => actions,
  }, DigitalEmployeeStudio))
}

export async function mountDigitalEmployeeStudio(ctx: Context, contribution: TypertRemoteContribution): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['sessions', 'remote', 'remote.digitalEmployees', 'slots', 'locale'], registerStudio)
  try { await ui } catch (error) {
    try { await ui.dispose() } finally { await disposeRemote() }
    throw error
  }
  return async () => { try { await ui.dispose() } finally { await disposeRemote() } }
}
