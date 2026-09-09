import { AsyncLocalStorage } from 'node:async_hooks'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { ContentBlock, UserMessage } from '@deepseek-ai/dsh-llm'
import { foldSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import { DigitalEmployeeHostContext } from './host-context.ts'
import { ProfileCapabilityInstaller } from './profile-capabilities.ts'
import { failure } from './host-errors.ts'
import { profileFromRevision } from './profile-snapshot.ts'
import { launchRequestIdSchema } from './spec.ts'
import { contentFingerprint, digitalEmployeeBindingKey, type DigitalEmployeeBinding } from './storage.ts'
import { snapshotInstance } from './studio-projection.ts'
import type { DigitalEmployeeFailure, SpawnDigitalEmployeeRequest, SpawnDigitalEmployeeResult } from './types.ts'

function rejected(error: DigitalEmployeeFailure): SpawnDigitalEmployeeResult { return { ok: false, error } }

/** Match an accepted initial message in the child's own canonical suffix, including its pending inbox. */
function acceptedPrompt(events: readonly SessionEvent[], fingerprint: string): boolean {
  const pending: Record<string, UserMessage[]> = { 'next-turn': [], 'next-step': [] }
  const matches = (message: UserMessage) => message.source.kind === 'user'
    && contentFingerprint(message.content) === fingerprint
  for (const event of events) {
    if (event.type === 'user/message' && matches(event.data)) return true
    if (event.type === 'agent/inbox/spliced') {
      const data = event.data
      pending[data.target]?.splice(data.start, data.removedCount ?? 0, ...data.inserted ?? [])
    }
  }
  return Object.values(pending).some(messages => messages.some(matches))
}

function initialPrompt(binding: Pick<DigitalEmployeeBinding, 'launchRequestId' | 'profileFingerprint' | 'profile'>, assignment: string): ContentBlock[] {
  return [{
    type: 'text',
    text: [
      '[Ultra B0 launch ' + binding.launchRequestId + '; Profile ' + binding.profileFingerprint + ']',
      binding.profile.mission,
      assignment,
    ].filter(Boolean).join('\n\n'),
  }]
}

/** Official Team owns Sessions and execution; Ultra owns only immutable launch reservations. */
export class LaunchWorkflow {
  private readonly inFlight = new Map<string, { fingerprint: string; promise: Promise<SpawnDigitalEmployeeResult> }>()
  private readonly tasks = new Set<Promise<unknown>>()
  private readonly creating = new AsyncLocalStorage<DigitalEmployeeBinding>()

  constructor(private readonly host: DigitalEmployeeHostContext, private readonly capabilities: ProfileCapabilityInstaller) {}

  async whenSettled(): Promise<void> { await Promise.allSettled([...this.tasks]) }

  private track<T>(promise: Promise<T>): Promise<T> {
    this.tasks.add(promise)
    void promise.finally(() => this.tasks.delete(promise)).catch(() => undefined)
    return promise
  }

  spawnProfile(caller: Agent, request: SpawnDigitalEmployeeRequest, callerSignal: AbortSignal): Promise<SpawnDigitalEmployeeResult> {
    const authority = this.host.mutationFailure(caller)
    if (authority !== undefined) return Promise.resolve(rejected(authority))
    if (request === null || typeof request !== 'object'
      || Object.keys(request).some(key => !['launchRequestId', 'profileId', 'assignment'].includes(key))
      || !launchRequestIdSchema.safeParse(request.launchRequestId).success
      || typeof request.profileId !== 'string'
      || (request.assignment !== undefined && typeof request.assignment !== 'string')) {
      return Promise.resolve(rejected(failure('profile-invalid', 'A Profile and canonical launch UUID are required')))
    }
    const assignment = request.assignment?.trim() ?? ''
    if (Buffer.byteLength(assignment, 'utf8') > this.host.config.maxAssignmentBytes) {
      return Promise.resolve(rejected(failure('assignment-too-large', 'Assignment exceeds the configured byte limit')))
    }
    // Public Host callers may retain their object while the reservation waits in the queue.
    request = Object.freeze({ profileId: request.profileId, launchRequestId: request.launchRequestId })
    const teamId = this.host.ctx.agentTeams.membership(caller).id
    const key = JSON.stringify([teamId, request.launchRequestId])
    const fingerprint = contentFingerprint([request.profileId, assignment])
    const current = this.inFlight.get(key)
    if (current !== undefined) return current.fingerprint === fingerprint
      ? current.promise
      : Promise.resolve(rejected(failure('launch-request-conflict', 'This launch UUID already owns different input')))
    const signal = AbortSignal.any([callerSignal, this.host.lifecycle.signal])
    const promise = this.track(this.launch(caller, teamId, request, assignment, fingerprint, signal))
    this.inFlight.set(key, { fingerprint, promise })
    void promise.finally(() => {
      if (this.inFlight.get(key)?.promise === promise) this.inFlight.delete(key)
    }).catch(() => undefined)
    return promise
  }

  private async launch(caller: Agent, teamId: string, request: SpawnDigitalEmployeeRequest,
    assignment: string, requestFingerprint: string, signal: AbortSignal): Promise<SpawnDigitalEmployeeResult> {
    signal.throwIfAborted()
    const reservation = await this.host.enqueue(async (): Promise<DigitalEmployeeBinding | DigitalEmployeeFailure> => {
      signal.throwIfAborted()
      const authority = this.host.mutationFailure(caller)
      if (authority !== undefined) return authority
      const storage = this.host.storage
      const prior = [...storage.bindingEntries()].find(([, row]) =>
        row.teamId === teamId && row.launchRequestId === request.launchRequestId)?.[1]
      if (prior !== undefined) return prior.requestFingerprint === requestFingerprint
        ? prior : failure('launch-request-conflict', 'This launch UUID already owns different input')
      const head = storage.getProfileHead(request.profileId)
      if (head === undefined) return failure('profile-not-found', 'Profile not found')
      if (head.archivedAt !== undefined) return failure('profile-archived', 'Profile is archived', head)
      if (head.activeRevision === undefined) return failure('profile-not-active', 'Activate a Revision before launching', head)
      const revision = storage.getProfileRevision(request.profileId, head.activeRevision)
      if (revision === undefined) return failure('revision-not-found', 'Active Revision is missing', head)
      const profile = profileFromRevision(revision)
      const problem = this.host.profileProblem(caller, profile)
      if (problem !== undefined) return problem
      const key = digitalEmployeeBindingKey(teamId, profile.employeeName)
      if (storage.getBinding(key) !== undefined
        || this.host.ctx.agentTeams.listMembers(caller).some(member => member.name === profile.employeeName)) {
        return failure('profile-in-use', 'This Team member name is already reserved')
      }
      const identity = { launchRequestId: request.launchRequestId, profileFingerprint: revision.fingerprint, profile }
      const binding: DigitalEmployeeBinding = {
        schemaVersion: 1, teamId, memberName: profile.employeeName, ...identity,
        requestFingerprint, initialPromptFingerprint: contentFingerprint(initialPrompt(identity, assignment)),
        profileId: profile.id, profileRevision: profile.revision, provisioningPhase: 'pending',
      }
      await storage.putBinding(key, binding)
      return binding
    })
    if ('code' in reservation) return rejected(reservation)
    const key = digitalEmployeeBindingKey(teamId, reservation.memberName)
    await this.reconcileBinding(caller, reservation)
    let binding = this.host.storage.getBinding(key)!
    const authority = this.host.mutationFailure(caller)
    if (authority !== undefined) return rejected(authority)
    // A durable roster reservation is never replaced or adopted merely by matching its name.
    if (binding.provisioningPhase !== 'pending'
      || this.host.ctx.agentTeams.listMembers(caller).some(member => member.name === binding.memberName)) {
      return { ok: true, value: snapshotInstance(this.host, caller, binding) }
    }
    signal.throwIfAborted()
    const problem = this.host.profileProblem(caller, binding.profile)
    if (problem !== undefined) return rejected(problem)
    try {
      const result = await this.creating.run(binding, () => this.host.ctx.agentTeams.spawnTeammate(caller, {
        name: binding.memberName, description: binding.profile.description,
        context: binding.profile.contextMode, provider: binding.profile.continuationProvider,
        prompt: initialPrompt(binding, assignment), signal,
      }))
      await this.settle(binding, { memberId: result.member.id, provisioningPhase: 'active' })
    } catch (error: unknown) {
      // Team may have accepted a child before a final checkpoint/transport failed.
      // Canonical child proof wins; otherwise leave a roster-owned reservation retryable.
      await this.reconcileBinding(caller, binding)
      binding = this.host.storage.getBinding(key)!
      if (binding.provisioningPhase === 'pending'
        && !this.host.ctx.agentTeams.listMembers(caller).some(member => member.name === binding.memberName)) {
        await this.settle(binding, { provisioningPhase: 'failed', error: 'Official Team rejected creation before a child was accepted' })
      }
      if (signal.aborted) throw error
      binding = this.host.storage.getBinding(key)!
      if (binding.provisioningPhase === 'pending') throw error
    }
    binding = this.host.storage.getBinding(key)!
    return { ok: true, value: snapshotInstance(this.host, caller, binding) }
  }

  private async settle(binding: DigitalEmployeeBinding,
    update: Pick<DigitalEmployeeBinding, 'provisioningPhase'> & { memberId?: string; error?: string }): Promise<void> {
    await this.host.enqueue(async () => {
      const key = digitalEmployeeBindingKey(binding.teamId, binding.memberName)
      const current = this.host.storage.getBinding(key)!
      if (current.provisioningPhase !== 'pending') return
      await this.host.storage.putBinding(key, { ...current, ...update })
    })
  }

  /** Runs synchronously at agent/created, before the official child assembles its first prompt. */
  installBoundAgent(agent: Agent): void {
    if (!this.host.admissionOpen || this.capabilities.has(agent)) return
    const leadId = agent.session.header.parentSession
    if (leadId === undefined) return
    const lead = this.host.ctx.agents.get(leadId)
    if (lead === undefined || this.host.leadAuthorityFailure(lead) !== undefined) return
    const member = this.host.ctx.agentTeams.listMembers(lead).find(row => row.id === agent.id)
    if (member === undefined) return
    const binding = this.host.storage.getBinding(digitalEmployeeBindingKey(leadId, member.name))
    if (binding === undefined || binding.provisioningPhase === 'failed'
      || (binding.memberId !== undefined && binding.memberId !== agent.id)) return
    const duringOwnCreation = this.creating.getStore() === binding
      || this.creating.getStore()?.launchRequestId === binding.launchRequestId
        && this.creating.getStore()?.teamId === binding.teamId
    const suffix = agent.session.snapshotEvents(agent.session.inheritedEventCount)
    const descriptor = foldSubagentDescriptor(suffix)
    const restored = descriptor?.mode === 'continuable'
      && descriptor.provider === binding.profile.continuationProvider
      && acceptedPrompt(suffix, binding.initialPromptFingerprint)
    if (!duringOwnCreation && !restored) return
    this.capabilities.install(lead, agent, binding.profile)
  }

  private async reconcileBinding(caller: Agent, binding: DigitalEmployeeBinding): Promise<void> {
    if (binding.provisioningPhase !== 'pending') return
    const member = this.host.ctx.agentTeams.listMembers(caller).find(row =>
      row.name === binding.memberName && (binding.memberId === undefined || row.id === binding.memberId))
    if (member === undefined) return
    if (member.status === 'failed') {
      await this.settle(binding, { provisioningPhase: 'failed', error: 'Official Team provisioning failed; this name remains reserved' })
      return
    }
    // Read only the exact official child; never start or resume it to manufacture evidence.
    try {
      const signal = this.host.lifecycle.signal
      const live = this.host.ctx.agents.get(member.id)
      let events: readonly SessionEvent[]
      let parent: string | undefined
      if (live !== undefined) {
        events = live.session.snapshotEvents(live.session.inheritedEventCount)
        parent = live.session.header.parentSession
      } else {
        const handle = await this.host.ctx.sessionPersistence.open(member.id, 'read', { signal })
        try {
          const read = await handle.read(0, undefined, { signal })
          events = read.events.slice(handle.inheritedEventCount)
          parent = handle.header.parentSession
        } finally { await handle.close() }
      }
      const descriptor = foldSubagentDescriptor(events)
      if (parent !== binding.teamId || descriptor?.mode !== 'continuable'
        || descriptor.provider !== binding.profile.continuationProvider
        || !acceptedPrompt(events, binding.initialPromptFingerprint)) return
      await this.settle(binding, { memberId: member.id, provisioningPhase: 'active' })
      if (live !== undefined) this.installBoundAgent(live)
    } catch (error: unknown) {
      if (this.host.lifecycle.signal.aborted) throw error
      // Unreadable evidence is not a failed launch and does not authorize a replacement.
    }
  }

  reconcileTeam(caller: Agent): Promise<void> {
    const authority = this.host.mutationFailure(caller)
    if (authority !== undefined) return Promise.resolve()
    const teamId = this.host.ctx.agentTeams.membership(caller).id
    return this.track((async () => {
      for (const [, binding] of this.host.storage.bindingEntries()) {
        if (binding.teamId === teamId
          && !this.inFlight.has(JSON.stringify([teamId, binding.launchRequestId]))) {
          await this.reconcileBinding(caller, binding)
        }
      }
    })())
  }

  scheduleLeadReconciliation(agent: Agent): void {
    if (!this.host.admissionOpen || this.host.leadAuthorityFailure(agent) !== undefined) return
    void this.reconcileTeam(agent).catch(() => undefined)
  }
}
