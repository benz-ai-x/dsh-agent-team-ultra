import { DigitalEmployeeHostContext } from './host-context.ts'
import { errorText, failure } from './host-errors.ts'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import { profileContentFingerprint, type DigitalEmployeeBindingV1 } from './storage.ts'
import {
  createExternalRunIndex,
  foldDshRunEvidence,
  foldExternalRunEvidence,
  type DshRunFoldBinding,
  type ExternalRunFoldBinding,
} from './run.ts'
import type {
  DigitalEmployeeFailure,
  DigitalEmployeeRunIndexRecord,
  GetDigitalEmployeeRunRequest,
  GetDigitalEmployeeRunResult,
} from './types.ts'

function runRejected(error: DigitalEmployeeFailure): GetDigitalEmployeeRunResult {
  return Object.freeze({ ok: false, error })
}

/** Rebuilds bounded Run projections from canonical Session and runtime evidence. */
export class RunWorkflow {
  private readonly runRepairs = new Set<Promise<void>>()
  private readonly pendingApprovals = new Map<string, Set<string>>()

  constructor(private readonly host: DigitalEmployeeHostContext) {}

  forgetAgent(agent: Agent): void { this.pendingApprovals.delete(agent.id) }

  clearApprovals(): void { this.pendingApprovals.clear() }

  async whenSettled(): Promise<void> { await Promise.allSettled([...this.runRepairs]) }

  /** Public Host Run inspector guarded by exact live Lead authority. */
  async runEvidence(
    caller: Agent,
    request: GetDigitalEmployeeRunRequest,
    signal: AbortSignal,
  ): Promise<GetDigitalEmployeeRunResult> {
    if (!this.host.admissionOpen) return runRejected(failure('service-disposed', 'Digital Employee service is disposing'))
    const authorityFailure = this.host.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) return runRejected(authorityFailure)
    signal.throwIfAborted()
    const membership = this.host.ctx.agentTeams.membership(caller)
    const stored = this.host.storage.getRun(request.runId)
    if (stored === undefined || stored.teamId !== membership.id) {
      return runRejected(failure('run-not-found', `Run "${request.runId}" not found`))
    }
    if (stored.source === 'dsh-session') {
      try {
        if (stored.canonicalSource.kind !== 'dsh-session') {
          return runRejected(failure('evidence-unavailable', 'Run canonical DSH correlation is invalid'))
        }
        const events = await this.loadOwnSessionEvents(stored.canonicalSource.sessionId, signal)
        const folded = foldDshRunEvidence(
          this.dshRunBindingFromIndex(stored),
          SessionId(stored.canonicalSource.sessionId),
          events,
          this.host.config.maxRunEvidenceItems,
          this.host.config.maxRuns,
          this.pendingApprovals.get(stored.canonicalSource.sessionId),
        ).find(candidate => candidate.index.runId === stored.runId)
        if (folded === undefined) {
          return runRejected(failure('evidence-unavailable', 'canonical DSH turn is no longer inspectable'))
        }
        await this.host.storage.putRun(folded.index, this.host.config.maxRuns)
        return Object.freeze({ ok: true as const, value: folded.detail })
      } catch (error: unknown) {
        if (signal.aborted) throw error
        return runRejected(failure('evidence-unavailable', `DSH Session evidence unavailable: ${errorText(error)}`))
      }
    }
    if (stored.owner.kind !== 'team-member') {
      return runRejected(failure(
        'evidence-unavailable',
        'evaluation-native evidence is owned by the evaluation runner',
      ))
    }
    try {
      const page = await this.host.ctx.agentTeams.readTeammateRuntimeEvidence(caller, stored.owner.memberName, {
        limit: this.host.config.maxRunEvidenceItems,
        signal,
      })
      const folded = foldExternalRunEvidence(
        stored,
        page.items,
        page.complete,
        this.host.config.maxRunEvidenceItems,
        page.pendingApprovals,
      )
      await this.host.storage.putRun(folded.index, this.host.config.maxRuns)
      return Object.freeze({ ok: true as const, value: folded.detail })
    } catch (error: unknown) {
      if (signal.aborted) throw error
      return runRejected(failure('evidence-unavailable', `external runtime evidence unavailable: ${errorText(error)}`))
    }
  }

  /** Translate one durable Binding into the narrow Run fold interface. */
  private dshRunBinding(binding: DigitalEmployeeBindingV1): DshRunFoldBinding {
    if (binding.memberId === undefined) throw new Error('Run Binding has no member identity')
    const { revision: _revision, createdAt: _createdAt, updatedAt: _updatedAt, ...profile } = binding.profile
    return Object.freeze({
      teamId: binding.teamId,
      owner: Object.freeze({
        kind: 'team-member' as const,
        memberId: binding.memberId,
        memberName: binding.memberName,
      }),
      profileId: binding.profileId,
      profileRevision: binding.profileRevision,
      profileFingerprint: binding.profileFingerprint
        ?? profileContentFingerprint(profile, binding.runtimeTarget, binding.requiredCapabilities),
      selectedRuntimeTarget: binding.runtimeTarget,
      ...(binding.resolvedRuntimeTarget === undefined
        ? {}
        : { actualRuntimeTarget: binding.resolvedRuntimeTarget }),
      capabilityGeneration: binding.capabilityGeneration ?? 0,
    })
  }

  private externalRunBinding(binding: DigitalEmployeeBindingV1): ExternalRunFoldBinding {
    if (binding.runtimeTarget.kind !== 'external-agent'
      || binding.memberId === undefined
      || binding.nativeRuntimeHandle === undefined) {
      throw new Error('external Run Binding lacks its exact runtime identity')
    }
    const { actualRuntimeTarget: _actualRuntimeTarget, ...common } = this.dshRunBinding(binding)
    return Object.freeze({
      ...common,
      selectedRuntimeTarget: binding.runtimeTarget,
      ...(binding.resolvedRuntimeTarget?.kind === 'external-agent'
        ? { actualRuntimeTarget: binding.resolvedRuntimeTarget }
        : {}),
      nativeHandle: binding.nativeRuntimeHandle,
    })
  }

  /** Reuse the immutable index identity when lazily refolding a retained DSH Run. */
  private dshRunBindingFromIndex(run: DigitalEmployeeRunIndexRecord): DshRunFoldBinding {
    return Object.freeze({
      teamId: run.teamId,
      owner: Object.freeze({ ...run.owner }),
      profileId: run.profileId,
      profileRevision: run.profileRevision,
      profileFingerprint: run.profileFingerprint,
      selectedRuntimeTarget: run.selectedRuntimeTarget,
      ...(run.actualRuntimeTarget === undefined ? {} : { actualRuntimeTarget: run.actualRuntimeTarget }),
      capabilityGeneration: run.capabilityGeneration,
    })
  }

  /** Load only one Session's owned suffix, never a fork-inherited prefix. */
  private async loadOwnSessionEvents(sessionId: string, signal: AbortSignal): Promise<readonly SessionEvent[]> {
    signal.throwIfAborted()
    const live = this.host.ctx.agents.get(SessionId(sessionId))
    if (live !== undefined) return live.session.ownEvents()
    const handle = await this.host.ctx.sessionPersistence.open(SessionId(sessionId), 'read', { signal })
    try {
      const events = await handle.read(0, undefined, { signal })
      return events.slice(handle.inheritedEventCount)
    } finally {
      await handle.close()
    }
  }

  /** Rebuild every DSH Run row from its canonical child Session. */
  private async repairDshBindingRuns(binding: DigitalEmployeeBindingV1, signal: AbortSignal): Promise<void> {
    if (binding.provisioningPhase !== 'active'
      || binding.runtimeTarget.kind !== 'dsh-model'
      || binding.memberId === undefined) return
    const events = await this.loadOwnSessionEvents(binding.memberId, signal)
    const runs = foldDshRunEvidence(
      this.dshRunBinding(binding),
      SessionId(binding.memberId),
      events,
      this.host.config.maxRunEvidenceItems,
      this.host.config.maxRuns,
      this.pendingApprovals.get(binding.memberId),
    )
    for (const run of runs) {
      signal.throwIfAborted()
      await this.host.storage.putRun(run.index, this.host.config.maxRuns)
    }
  }

  /** Rebuild external launch and delivery Runs from the canonical Team Lead log. */
  private async repairExternalBindingRuns(binding: DigitalEmployeeBindingV1, signal: AbortSignal): Promise<void> {
    if (binding.provisioningPhase !== 'active'
      || binding.runtimeTarget.kind !== 'external-agent'
      || binding.memberId === undefined
      || binding.nativeRuntimeHandle === undefined) return
    const events = await this.loadOwnSessionEvents(binding.teamId, signal)
    const foldBinding = this.externalRunBinding(binding)
    const active = events.findLast((event) => {
      if (event.type !== 'team/member') return false
      const data = event.data as SessionEvent<'team/member'>['data']
      return data.member.id === binding.memberId
        && data.member.phase === 'active'
        && data.member.externalRuntime?.nativeHandle === binding.nativeRuntimeHandle
    }) as SessionEvent<'team/member'> | undefined
    if (active !== undefined) {
      const nativeTurnId = active.data.member.externalRuntime?.initialTurnId
      const launchIdentity = nativeTurnId ?? (binding.launchRequestId === undefined
        ? undefined
        : `launch:${binding.launchRequestId}`)
      if (launchIdentity !== undefined) {
        await this.host.storage.putRun(createExternalRunIndex(
          foldBinding,
          launchIdentity,
          nativeTurnId,
          active.time,
        ), this.host.config.maxRuns)
      }
    }
    for (const event of events) {
      if (event.type !== 'team/message/delivered' || event.data.targetId !== binding.memberId) continue
      const canonicalTurnId = event.data.nativeTurnId ?? `message:${event.data.messageId}`
      await this.host.storage.putRun(createExternalRunIndex(
        foldBinding,
        canonicalTurnId,
        event.data.nativeTurnId,
        event.time,
      ), this.host.config.maxRuns)
    }
  }

  /** Repair all Run rows owned by one exact live Team Lead. */
  async repairTeamRuns(caller: Agent): Promise<void> {
    if (!this.host.hasStorage || this.host.lifecycle.signal.aborted || this.host.ctx.agents.get(caller.id) !== caller) return
    const membership = this.host.ctx.agentTeams.tryMembership(caller)
    if (membership?.role !== 'lead') return
    const bindings = [...this.host.storage.bindingEntries()]
      .map(([, binding]) => binding)
      .filter(binding => binding.teamId === membership.id)
    for (const binding of bindings) {
      try {
        if (binding.runtimeTarget.kind === 'external-agent') {
          await this.repairExternalBindingRuns(binding, this.host.lifecycle.signal)
        } else {
          await this.repairDshBindingRuns(binding, this.host.lifecycle.signal)
        }
      } catch (error: unknown) {
        if (this.host.lifecycle.signal.aborted) return
        this.host.ctx.logger.warn(`agent-team-ultra: Run repair failed for ${binding.memberName}: ${errorText(error)}`)
      }
    }
  }

  /** Repair every live Team once after startup. */
  async repairAvailableTeamRuns(): Promise<void> {
    const seen = new Set<string>()
    for (const agent of this.host.ctx.agents.list()) {
      const membership = this.host.ctx.agentTeams.tryMembership(agent)
      if (membership?.role !== 'lead' || seen.has(membership.id)) continue
      seen.add(membership.id)
      await this.repairTeamRuns(agent)
    }
  }

  /** Retain only same-process unresolved audit ids; persisted asks are intentionally non-resumable. */
  observeApprovalCorrelation(sessionId: SessionId, event: SessionEvent): void {
    const type = String(event.type)
    if (type === 'turn/end') {
      this.pendingApprovals.delete(sessionId)
      return
    }
    if (type !== 'approval/asked' && type !== 'approval/decided') return
    const data = event.data as unknown as Record<string, unknown>
    if (typeof data.id !== 'string' || data.id.length === 0) return
    if (type === 'approval/decided') {
      const pending = this.pendingApprovals.get(sessionId)
      pending?.delete(data.id)
      if (pending?.size === 0) this.pendingApprovals.delete(sessionId)
      return
    }
    if (typeof data.callId !== 'string' || data.callId.length === 0) return
    const binding = [...this.host.storage.bindingEntries()]
      .map(([, current]) => current)
      .find(current => current.memberId === sessionId
        && current.provisioningPhase === 'active'
        && current.runtimeTarget.kind === 'dsh-model')
    if (binding === undefined || this.host.ctx.agents.get(sessionId) === undefined) return
    const pending = this.pendingApprovals.get(sessionId) ?? new Set<string>()
    pending.add(data.id)
    this.pendingApprovals.set(sessionId, pending)
  }

  /** Track event-driven Run repair as disposal-visible work. */
  scheduleRunRepair(sessionId: SessionId): void {
    if (!this.host.hasStorage || this.host.lifecycle.signal.aborted) return
    const operation = (async () => {
      const lead = this.host.ctx.agents.get(sessionId)
      const membership = lead === undefined ? undefined : this.host.ctx.agentTeams.tryMembership(lead)
      if (lead !== undefined && membership?.role === 'lead') {
        await this.repairTeamRuns(lead)
        return
      }
      const bindings = [...this.host.storage.bindingEntries()]
        .map(([, binding]) => binding)
        .filter(binding => binding.memberId === sessionId && binding.runtimeTarget.kind === 'dsh-model')
      for (const binding of bindings) await this.repairDshBindingRuns(binding, this.host.lifecycle.signal)
    })()
    this.runRepairs.add(operation)
    void operation.catch((error: unknown) => {
      if (!this.host.lifecycle.signal.aborted) {
        this.host.ctx.logger.warn(`agent-team-ultra: event-driven Run repair failed: ${errorText(error)}`)
      }
    }).finally(() => { this.runRepairs.delete(operation) })
  }
}
