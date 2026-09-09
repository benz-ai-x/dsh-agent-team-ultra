import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { foldSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import type { DigitalEmployeeHostContext } from './host-context.ts'
import type { ProfileLifecycle } from './profile-lifecycle.ts'
import type { DigitalEmployeeBinding } from './storage.ts'
import type { DigitalEmployeeInstanceView, DigitalEmployeeStudioView } from './types.ts'
import { authorityRemoteError } from './host-errors.ts'
import { TEAM_OWN_TOOL_NAMES } from './profile-capabilities.ts'

export function snapshotInstance(host: DigitalEmployeeHostContext, caller: Agent, binding: DigitalEmployeeBinding): DigitalEmployeeInstanceView {
  const member = host.ctx.agentTeams.listMembers(caller).find(row =>
    row.id === binding.memberId && row.name === binding.memberName)
  const live = binding.memberId === undefined ? undefined : host.ctx.agents.get(SessionId(binding.memberId))
  const descriptor = live === undefined ? undefined
    : foldSubagentDescriptor(live.session.snapshotEvents(live.session.inheritedEventCount))
  const actualRoute = descriptor?.mode === 'continuable'
    && descriptor.agentProvider !== undefined && descriptor.agentModel !== undefined
    ? { provider: descriptor.agentProvider, model: descriptor.agentModel,
        ...(descriptor.agentReasoningEffort === undefined ? {} : { reasoningEffort: String(descriptor.agentReasoningEffort) }) }
    : undefined
  return Object.freeze({
    teamId: binding.teamId, memberName: binding.memberName,
    ...(binding.memberId === undefined ? {} : { memberId: binding.memberId }),
    profileId: binding.profileId, profileRevision: binding.profileRevision,
    provisioningPhase: binding.provisioningPhase,
    presence: member?.status === 'running' || member?.status === 'idle' ? member.status : 'inactive',
    ...(actualRoute === undefined ? {} : { actualRoute: Object.freeze(actualRoute) }),
    ...(binding.error === undefined ? {} : { error: binding.error }),
  })
}

/** Point-in-time projection. Official Team and conversation UI remain the operational console. */
export class StudioProjection {
  constructor(private readonly host: DigitalEmployeeHostContext, private readonly profiles: ProfileLifecycle) {}

  view(caller: Agent): DigitalEmployeeStudioView {
    const error = this.host.mutationFailure(caller)
    if (error !== undefined) throw authorityRemoteError(error, 'view')
    const teamId = this.host.ctx.agentTeams.membership(caller).id
    return Object.freeze({
      profiles: Object.freeze([...this.host.storage.profileHeadEntries()]
        .map(([, head]) => this.profiles.catalogEntry(head))
        .sort((a, b) => a.head.profileId.localeCompare(b.head.profileId))),
      tools: Object.freeze(caller.ctx.tools.schemas(caller)
        .filter(tool => !TEAM_OWN_TOOL_NAMES.has(tool.name))
        .map(tool => Object.freeze({ name: tool.name, description: tool.description }))),
      instances: Object.freeze([...this.host.storage.bindingEntries()]
        .filter(([, binding]) => binding.teamId === teamId)
        .map(([, binding]) => snapshotInstance(this.host, caller, binding))),
    })
  }
}
