/** Browser registration and generated Remote lifecycle for Digital Employee Studio. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-team-ultra/remote'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { DigitalEmployeeStudio, type DigitalEmployeeStudioInjected } from './Studio.tsx'
import { en, NS, zh, type UltraKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'agent-team-ultra': UltraKey
  }
}

export const inject = ['remote', 'slots', 'locale']

function registerStudio(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'client-ui-agent-team-ultra: dictionaries')
  const actions: DigitalEmployeeStudioInjected = {
    async load(sessionId) {
      return await ctx.remote.digitalEmployees.view(sessionId)
    },
    async save(sessionId, request) {
      return await ctx.remote.digitalEmployees.save(sessionId, request)
    },
    async remove(sessionId, profileId, expectedRevision) {
      return await ctx.remote.digitalEmployees.deleteProfile(sessionId, { profileId, expectedRevision })
    },
    async spawn(sessionId, profileId, assignment, signal) {
      return await ctx.remote.digitalEmployees.spawn(
        sessionId,
        assignment.trim() === '' ? { profileId } : { profileId, assignment: assignment.trim() },
        signal,
      )
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
}

/** Mount generated Remote descriptors before exposing the Studio Slot. */
export async function mountDigitalEmployeeStudio(
  ctx: ClientContext,
  contribution: TypertRemoteContribution,
): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.digitalEmployees', 'slots', 'locale'], registerStudio)
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
