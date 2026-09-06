import { DigitalEmployeeHostContext } from './host-context.ts'
import { ProfileCapabilityInstaller, TEAM_OWN_TOOL_NAMES } from './profile-capabilities.ts'
import { errorText, failure, externalRuntimeFailure } from './host-errors.ts'
import { snapshotProfile } from './profile-snapshot.ts'
import { Buffer } from 'node:buffer'
import { isDeepStrictEqual } from 'node:util'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { TeamError, TeammateLaunchRequestId, TeammateRuntimeError } from '@deepseek-ai/dsh-experimental-agent-team'
import type { TeamMemberRouteSnapshot } from '@deepseek-ai/dsh-experimental-agent-team'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { foldSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import { launchRequestIdSchema, nativeRuntimeHandleFromTeammate, type DigitalEmployeeBinding } from './spec.ts'
import {
  sameDshTarget,
  externalRuntimeProfileSnapshot,
  requiredRuntimeCapabilitiesForProfile,
  snapshotRequiredCapabilities,
} from './runtime.ts'
import {
  assignmentContentHash,
  digitalEmployeeBindingKey,
  legacyInheritLeadRuntimeTarget,
  launchRequestFingerprint,
  type DigitalEmployeeBindingV1,
  type MigratedRuntimeTarget,
} from './storage.ts'
import { bindingMatchesReplay, bindingRosterMember, reconcileBindingFromRoster } from './launch.ts'
import type {
  DigitalEmployeeFailure,
  DshModelRuntimeTarget,
  LaunchRequestId,
  SpawnDigitalEmployeeRequest,
  SpawnDigitalEmployeeResult,
} from './types.ts'
import { snapshotInstance } from './studio-projection.ts'

interface NormalizedLaunchRequest {
  readonly launchRequestId: LaunchRequestId
  readonly profileId: string
  readonly assignment?: string
  readonly assignmentHash: string
}

interface InFlightLaunch {
  readonly profileId: string
  readonly assignmentHash: string
  readonly operation: Promise<SpawnDigitalEmployeeResult>
}

function spawnRejected(error: DigitalEmployeeFailure): SpawnDigitalEmployeeResult {
  return Object.freeze({ ok: false, error })
}

function dshTargetFromRoute(route: TeamMemberRouteSnapshot | undefined): DshModelRuntimeTarget | undefined {
  if (route?.provider === undefined || route.model === undefined) return undefined
  return Object.freeze({
    kind: 'dsh-model',
    provider: route.provider,
    model: route.model,
    ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }),
  })
}

/** Owns Launch Intent admission, durable provisioning, and roster-derived recovery. */
export class LaunchWorkflow {
  private readonly launches = new Set<Promise<unknown>>()
  private readonly launchesByRequest = new Map<string, InFlightLaunch>()
  private readonly reconciliations = new Set<Promise<void>>()

  constructor(
    private readonly host: DigitalEmployeeHostContext,
    private readonly capabilities: ProfileCapabilityInstaller,
  ) {}

  async whenSettled(): Promise<void> {
    await Promise.allSettled([...this.launches])
    await Promise.allSettled([...this.reconciliations])
  }

  /** Public Host launch API with Team-scoped idempotency and pre-acceptance cancellation. */
  spawnProfile(
    caller: Agent,
    request: SpawnDigitalEmployeeRequest,
    callerSignal: AbortSignal,
  ): Promise<SpawnDigitalEmployeeResult> {
    if (!this.host.admissionOpen) return Promise.resolve(spawnRejected(failure('service-disposed', 'Digital Employee service is disposing')))
    const authorityFailure = this.host.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) return Promise.resolve(spawnRejected(authorityFailure))
    const parsedRequestId = launchRequestIdSchema.safeParse(request.launchRequestId)
    if (!parsedRequestId.success) {
      return Promise.resolve(spawnRejected(failure(
        'profile-invalid',
        'launchRequestId must be a canonical lowercase UUID',
      )))
    }
    const assignmentText = request.assignment?.trim()
    const assignment = assignmentText === '' ? undefined : assignmentText
    if (assignment !== undefined && Buffer.byteLength(assignment, 'utf8') > this.host.config.maxAssignmentBytes) {
      return Promise.resolve(spawnRejected(failure(
        'assignment-too-large',
        `assignment exceeds ${this.host.config.maxAssignmentBytes} UTF-8 bytes`,
      )))
    }
    let teamId: string
    try {
      const membership = this.host.ctx.agentTeams.membership(caller)
      if (membership.role !== 'lead') {
        return Promise.resolve(spawnRejected(failure(
          'team-lead-required',
          'only the exact live Team Lead may launch a Digital Employee',
        )))
      }
      teamId = membership.id
    } catch (error: unknown) {
      if (error instanceof TeamError) return Promise.resolve(spawnRejected(failure('team-rejected', error.message)))
      throw error
    }
    const normalized: NormalizedLaunchRequest = Object.freeze({
      launchRequestId: parsedRequestId.data,
      profileId: request.profileId,
      ...(assignment === undefined ? {} : { assignment }),
      assignmentHash: assignmentContentHash(assignment),
    })
    const requestKey = JSON.stringify([teamId, normalized.launchRequestId])
    const existing = this.launchesByRequest.get(requestKey)
    if (existing !== undefined) {
      return existing.profileId === normalized.profileId && existing.assignmentHash === normalized.assignmentHash
        ? existing.operation
        : Promise.resolve(spawnRejected(failure(
          'launch-request-conflict',
          'launchRequestId was already used with different normalized input',
        )))
    }
    const operation = this.spawnAdmitted(caller, teamId, normalized, callerSignal)
    this.launchesByRequest.set(requestKey, {
      profileId: normalized.profileId,
      assignmentHash: normalized.assignmentHash,
      operation,
    })
    this.launches.add(operation)
    void operation.finally(() => {
      this.launches.delete(operation)
      if (this.launchesByRequest.get(requestKey)?.operation === operation) this.launchesByRequest.delete(requestKey)
    }).catch(() => undefined)
    return operation
  }

  private async spawnAdmitted(
    caller: Agent,
    teamId: string,
    request: NormalizedLaunchRequest,
    callerSignal: AbortSignal,
  ): Promise<SpawnDigitalEmployeeResult> {
    const signal = AbortSignal.any([callerSignal, this.host.lifecycle.signal])
    signal.throwIfAborted()
    const storage = this.host.storage
    const replay = storage.findBindingByLaunchRequest(teamId, request.launchRequestId)
    if (replay !== undefined) {
      const [, prior] = replay
      if (!bindingMatchesReplay(prior, request.profileId, request.assignmentHash)) {
        return spawnRejected(failure(
          'launch-request-conflict',
          'launchRequestId was already used with different normalized input',
        ))
      }
      const roster = this.host.ctx.agentTeams.listMembers(caller)
      const reconciled = await this.reconcileBinding(caller, prior, roster)
      const authorityFailure = this.host.mutationFailure(caller)
      if (authorityFailure !== undefined) return spawnRejected(authorityFailure)
      const rosterMember = bindingRosterMember(reconciled, roster)
      if (reconciled.provisioningPhase !== 'pending'
        || (rosterMember !== undefined && reconciled.runtimeTarget.kind !== 'external-agent')) {
        return Object.freeze({ ok: true, value: snapshotInstance(this.host, caller, reconciled) })
      }
      const executable = await this.pendingBindingIsExecutable(caller, reconciled)
      const preflightAuthorityFailure = this.host.mutationFailure(caller)
      if (preflightAuthorityFailure !== undefined) return spawnRejected(preflightAuthorityFailure)
      if (!executable) {
        return Object.freeze({ ok: true, value: snapshotInstance(this.host, caller, reconciled) })
      }
      return await this.provisionBinding(caller, reconciled, request.assignment, signal)
    }

    const head = storage.getProfileHead(request.profileId)
    if (head === undefined) {
      return spawnRejected(failure('profile-not-found', `profile "${request.profileId}" not found`))
    }
    if (head.archivedAt !== undefined) {
      return spawnRejected(failure('profile-archived', `profile "${request.profileId}" is archived`, head))
    }
    if (head.activeRevision === undefined) {
      return spawnRejected(failure('profile-not-active', `profile "${request.profileId}" has no active Revision`, head))
    }
    const activeRevision = storage.getProfileRevision(request.profileId, head.activeRevision)
    if (activeRevision === undefined) {
      return spawnRejected(failure('revision-not-found', `active Profile Revision ${head.activeRevision} was not found`, head))
    }
    const profile = snapshotProfile({
      ...activeRevision.profile,
      revision: activeRevision.revision,
      createdAt: activeRevision.createdAt,
      updatedAt: activeRevision.updatedAt,
    })
    await this.host.runtimeBackends.whenSettled()
    const preflightAuthorityFailure = this.host.mutationFailure(caller)
    if (preflightAuthorityFailure !== undefined) return spawnRejected(preflightAuthorityFailure)
    const targetProblem = this.host.runtimeBackends.validate(
      activeRevision.profile,
      activeRevision.runtimeTarget,
      activeRevision.requiredCapabilities,
      'launch',
    )
    if (targetProblem !== undefined) {
      return spawnRejected(failure(targetProblem.code, targetProblem.message, head))
    }
    const selectedTarget = activeRevision.runtimeTarget
    if (selectedTarget.kind === 'legacy-inherit-lead') {
      return spawnRejected(failure('runtime-route-invalid', 'the active Revision has no exact executable route', head))
    }
    if (selectedTarget.kind === 'dsh-model') {
      const resolutionProblem = await this.host.runtimeBackends.verifyDshModelRoute(selectedTarget)
      const authorityFailure = this.host.mutationFailure(caller)
      if (authorityFailure !== undefined) return spawnRejected(authorityFailure)
      if (resolutionProblem !== undefined) {
        return spawnRejected(failure(resolutionProblem.code, resolutionProblem.message, head))
      }
      const unavailable = profile.toolPolicy.mode === 'inherit'
        ? []
        : profile.toolPolicy.names.filter(name =>
          TEAM_OWN_TOOL_NAMES.has(name) || this.host.ctx.tools.get(name, caller) === undefined)
      if (unavailable.length > 0) {
        return spawnRejected(failure(
          'tool-unavailable',
          `profile names tools unavailable to this Lead: ${unavailable.join(', ')}`,
        ))
      }
    }

    const key = digitalEmployeeBindingKey(teamId, profile.employeeName)
    const reservation = await this.host.enqueue(async (): Promise<DigitalEmployeeBindingV1 | DigitalEmployeeFailure> => {
      const authorityFailure = this.host.mutationFailure(caller)
      if (authorityFailure !== undefined) return authorityFailure
      const storage = this.host.storage
      const requestOwner = storage.findBindingByLaunchRequest(teamId, request.launchRequestId)
      if (requestOwner !== undefined) {
        return bindingMatchesReplay(requestOwner[1], request.profileId, request.assignmentHash)
          ? requestOwner[1]
          : failure('launch-request-conflict', 'launchRequestId was already used with different normalized input')
      }
      const existing = storage.getBinding(key)
      const rosterOwnsName = this.host.ctx.agentTeams.listMembers(caller)
        .some(member => member.name === profile.employeeName)
      if (existing !== undefined || rosterOwnsName) {
        return failure('profile-in-use', `Team member name "${profile.employeeName}" is already reserved`)
      }
      const capabilityGeneration = this.host.runtimeBackends.capabilityGeneration
      const requestFingerprint = launchRequestFingerprint({
        profileId: profile.id,
        profileRevision: profile.revision,
        profileFingerprint: activeRevision.fingerprint,
        runtimeTarget: selectedTarget,
        preflightRuntimeTarget: selectedTarget,
        requiredCapabilities: activeRevision.requiredCapabilities,
        capabilityGeneration,
        assignmentHash: request.assignmentHash,
      })
      const pending: DigitalEmployeeBindingV1 = Object.freeze({
        schemaVersion: 1,
        teamId,
        memberName: profile.employeeName,
        launchRequestId: request.launchRequestId,
        requestFingerprint,
        assignmentHash: request.assignmentHash,
        profileId: profile.id,
        profileRevision: profile.revision,
        profileFingerprint: activeRevision.fingerprint,
        profile: snapshotProfile(profile),
        runtimeTarget: Object.freeze({ ...selectedTarget }),
        preflightRuntimeTarget: Object.freeze({ ...selectedTarget }),
        requiredCapabilities: snapshotRequiredCapabilities(activeRevision.requiredCapabilities),
        capabilityGeneration,
        provisioningPhase: 'pending',
      })
      await storage.putBinding(key, pending)
      return pending
    })
    if ('code' in reservation) return spawnRejected(reservation)
    signal.throwIfAborted()
    const reservationAuthorityFailure = this.host.mutationFailure(caller)
    if (reservationAuthorityFailure !== undefined) return spawnRejected(reservationAuthorityFailure)
    const roster = this.host.ctx.agentTeams.listMembers(caller)
    if (reservation.provisioningPhase !== 'pending'
      || (bindingRosterMember(reservation, roster) !== undefined
        && reservation.runtimeTarget.kind !== 'external-agent')) {
      const reconciled = await this.reconcileBinding(caller, reservation, roster)
      return Object.freeze({ ok: true, value: snapshotInstance(this.host, caller, reconciled) })
    }
    return await this.provisionBinding(caller, reservation, request.assignment, signal)
  }

  private async provisionBinding(
    caller: Agent,
    reservation: DigitalEmployeeBindingV1,
    assignment: string | undefined,
    signal: AbortSignal,
  ): Promise<SpawnDigitalEmployeeResult> {
    const selectedTarget = reservation.runtimeTarget
    if (selectedTarget.kind === 'legacy-inherit-lead' || reservation.launchRequestId === undefined) {
      return Object.freeze({ ok: true, value: snapshotInstance(this.host, caller, reservation) })
    }
    const profile = reservation.profile
    const key = digitalEmployeeBindingKey(reservation.teamId, reservation.memberName)
    const prompt = [
      `You are ${profile.displayName} (${profile.employeeName}), a profile-bound Digital Employee.`,
      `Mission:\n${profile.mission}`,
      ...(assignment === undefined || assignment === '' ? [] : [`Current assignment:\n${assignment}`]),
    ].join('\n\n')

    let provisionedMemberId: string | undefined
    try {
      const result = selectedTarget.kind === 'dsh-model'
        ? await this.host.ctx.agentTeams.spawnTeammate(caller, {
          name: profile.employeeName,
          description: profile.description,
          prompt: [{ type: 'text', text: prompt }],
          context: profile.contextMode,
          provider: profile.continuationProvider,
          agentOptions: {
            provider: selectedTarget.provider,
            model: selectedTarget.model,
            ...(selectedTarget.reasoningEffort === undefined
              ? {}
              : { reasoningEffort: ReasoningEffortId(selectedTarget.reasoningEffort) }),
          },
          signal,
        })
        : await this.host.ctx.agentTeams.spawnTeammate(caller, {
          name: profile.employeeName,
          description: profile.description,
          prompt: [{ type: 'text', text: prompt }],
          context: profile.contextMode,
          runtime: {
            kind: 'external-agent',
            provider: selectedTarget.provider,
            launchRequestId: TeammateLaunchRequestId(reservation.launchRequestId),
            profile: externalRuntimeProfileSnapshot(profile),
            requirements: {
              contextMode: reservation.requiredCapabilities.contextMode,
              profileCapabilities: reservation.requiredCapabilities.profileCapabilities,
              runtimeCapabilities: requiredRuntimeCapabilitiesForProfile(profile),
            },
          },
          signal,
        })
      provisionedMemberId = result.member.id
      if (selectedTarget.kind === 'external-agent') {
        const external = result.member.externalRuntime
        if (result.member.provider !== selectedTarget.provider
          || external === undefined
          || String(external.launchRequestId) !== reservation.launchRequestId
          || external.nativeHandle === undefined) {
          const message = `teammate "${profile.employeeName}" did not preserve the selected external runtime identity`
          const failed: DigitalEmployeeBindingV1 = Object.freeze({
            ...reservation,
            memberId: provisionedMemberId,
            provisioningPhase: 'failed',
            error: message,
          })
          await this.host.enqueue(async () => { await this.host.storage.putBinding(key, failed) })
          return spawnRejected(failure('runtime-route-invalid', message))
        }
        const nativeRuntimeHandle = nativeRuntimeHandleFromTeammate(external.nativeHandle)
        const active: DigitalEmployeeBindingV1 = Object.freeze({
          ...reservation,
          memberId: provisionedMemberId,
          resolvedRuntimeTarget: Object.freeze({ ...selectedTarget }),
          nativeRuntimeHandle,
          provisioningPhase: 'active',
        })
        const committed = await this.commitProvisionedBinding(key, active)
        return committed.provisioningPhase === 'active'
          ? Object.freeze({ ok: true, value: snapshotInstance(this.host, caller, committed) })
          : spawnRejected(failure('team-rejected', committed.error ?? 'external teammate provisioning did not become active'))
      }
      const resolvedRuntimeTarget = dshTargetFromRoute(result.member.resolvedRoute)
      if (resolvedRuntimeTarget === undefined || !sameDshTarget(selectedTarget, resolvedRuntimeTarget)) {
        const message = `teammate "${profile.employeeName}" did not resolve the selected DSH model route`
        const failed: DigitalEmployeeBindingV1 = Object.freeze({
          ...reservation,
          memberId: provisionedMemberId,
          ...(resolvedRuntimeTarget === undefined ? {} : { resolvedRuntimeTarget }),
          provisioningPhase: 'failed',
          error: message,
        })
        await this.host.enqueue(async () => { await this.host.storage.putBinding(key, failed) })
        return spawnRejected(failure('runtime-route-invalid', message))
      }
      const active: DigitalEmployeeBindingV1 = Object.freeze({
        ...reservation,
        memberId: provisionedMemberId,
        resolvedRuntimeTarget,
        provisioningPhase: 'active',
      })
      const committed = await this.commitProvisionedBinding(key, active)
      return committed.provisioningPhase === 'active'
        ? Object.freeze({ ok: true, value: snapshotInstance(this.host, caller, committed) })
        : spawnRejected(failure('team-rejected', committed.error ?? 'teammate provisioning did not become active'))
    } catch (error: unknown) {
      const roster = this.host.ctx.agentTeams.listMembers(caller)
      const authoritative = reconcileBindingFromRoster(reservation, roster)
      const retryablePreRoster = authoritative === reservation
        && (signal.aborted
          || (error instanceof TeammateRuntimeError && error.code === 'TEAM_RUNTIME_UNAVAILABLE'))
      const recorded: DigitalEmployeeBindingV1 = authoritative === reservation
        ? retryablePreRoster
          ? reservation
          : Object.freeze({
            ...reservation,
            ...(provisionedMemberId === undefined ? {} : { memberId: provisionedMemberId }),
            provisioningPhase: 'failed',
            error: errorText(error),
          })
        : Object.freeze(authoritative)
      try {
        await this.host.enqueue(async () => { await this.host.storage.putBinding(key, recorded) })
      } catch (recordError: unknown) {
        throw new AggregateError([error, recordError], 'Digital Employee launch and failure recording both failed')
      }
      if (recorded.provisioningPhase === 'active') {
        return Object.freeze({ ok: true, value: snapshotInstance(this.host, caller, recorded) })
      }
      if (signal.aborted) signal.throwIfAborted()
      if (error instanceof TeammateRuntimeError) {
        return spawnRejected(externalRuntimeFailure(error))
      }
      if (error instanceof TeamError) {
        return spawnRejected(failure(
          error.code === 'TEAM_LEAD_REQUIRED'
            ? 'team-lead-required'
            : error.code === 'TEAM_RUNTIME_ROUTE_MISMATCH'
              ? 'runtime-route-invalid'
              : 'team-rejected',
          error.message,
        ))
      }
      throw error
    }
  }

  /** Install at most once for an exact Agent object; an id reused later is a distinct lifecycle. */
  installBoundAgent(agent: Agent): void {
    if (!this.host.admissionOpen || this.capabilities.has(agent)) return
    const binding = this.bindingFor(agent)
    if (binding === undefined) return
    const caller = this.host.ctx.agents.get(binding.teamId as Agent['id'])
    if (caller === undefined) {
      throw new Error(`Digital Employee Team Lead "${binding.teamId}" is not active`)
    }
    this.capabilities.install(caller, agent, binding.profile)
  }

  /** Resolve by durable member id first, then the pre-publication Team/name reservation. */
  private bindingFor(agent: Agent): DigitalEmployeeBindingV1 | undefined {
    const storage = this.host.storage
    for (const [, binding] of storage.bindingEntries()) {
      if (binding.memberId === agent.id) return binding
    }
    const parentId = agent.session.header.parentSession
    if (parentId === undefined) return undefined
    const root = this.host.ctx.agents.get(parentId)
    if (root === undefined) return undefined
    const member = this.host.ctx.agentTeams.listMembers(root).find(candidate => candidate.id === agent.id)
    return member === undefined
      ? undefined
      : storage.getBinding(digitalEmployeeBindingKey(parentId, member.name))
  }

  /** Record an exact historical route only when the durable child descriptor proves it. */
  migratedBindingRuntimeTarget(binding: DigitalEmployeeBinding): MigratedRuntimeTarget {
    try {
      if (binding.memberId === undefined) return legacyInheritLeadRuntimeTarget
      const child = this.host.ctx.agents.get(binding.memberId as Agent['id'])
      if (child === undefined || child.session.header.parentSession !== binding.teamId) {
        return legacyInheritLeadRuntimeTarget
      }
      const root = this.host.ctx.agents.get(binding.teamId as Agent['id'])
      if (root === undefined) return legacyInheritLeadRuntimeTarget
      const membership = this.host.ctx.agentTeams.membership(root)
      if (membership.role !== 'lead' || membership.root !== root || membership.id !== binding.teamId
        || !this.host.ctx.agentTeams.listMembers(root)
          .some(member => member.id === child.id && member.name === binding.memberName)) {
        return legacyInheritLeadRuntimeTarget
      }
      const descriptor = foldSubagentDescriptor(child.session.snapshotEvents())
      if (descriptor?.mode !== 'continuable') return legacyInheritLeadRuntimeTarget
      const provider = descriptor.agentProvider?.trim()
      const model = descriptor.agentModel?.trim()
      if (provider === undefined || provider === '' || model === undefined || model === '') {
        return legacyInheritLeadRuntimeTarget
      }
      const reasoningEffort = descriptor.agentReasoningEffort?.trim()
      return Object.freeze({
        kind: 'dsh-model',
        provider,
        model,
        ...(reasoningEffort === undefined || reasoningEffort === '' ? {} : { reasoningEffort }),
      })
    } catch {
      return legacyInheritLeadRuntimeTarget
    }
  }

  /** A replay may continue a pre-roster reservation only while its exact dependencies remain executable. */
  private async pendingBindingIsExecutable(caller: Agent, binding: DigitalEmployeeBindingV1): Promise<boolean> {
    await this.host.runtimeBackends.whenSettled()
    const problem = this.host.runtimeBackends.validate(
      binding.profile,
      binding.runtimeTarget,
      binding.requiredCapabilities,
      'launch',
    )
    if (problem !== undefined) return false
    if (binding.runtimeTarget.kind === 'external-agent') {
      return true
    }
    if (binding.runtimeTarget.kind !== 'dsh-model'
      || await this.host.runtimeBackends.verifyDshModelRoute(binding.runtimeTarget) !== undefined) return false
    return binding.profile.toolPolicy.mode === 'inherit'
      || binding.profile.toolPolicy.names.every(name =>
        !TEAM_OWN_TOOL_NAMES.has(name) && this.host.ctx.tools.get(name, caller) !== undefined)
  }

  /** Persist one roster-derived Binding repair without allowing an older observation to replace a newer request. */
  private async reconcileBinding(
    caller: Agent,
    binding: DigitalEmployeeBindingV1,
    roster = this.host.ctx.agentTeams.listMembers(caller),
  ): Promise<DigitalEmployeeBindingV1> {
    const key = digitalEmployeeBindingKey(binding.teamId, binding.memberName)
    return await this.host.enqueue(async () => {
      const storage = this.host.storage
      const current = storage.getBinding(key)
      if (current === undefined) return binding
      const reconciled = reconcileBindingFromRoster(current, roster)
      if (!isDeepStrictEqual(current, reconciled)) await storage.putBinding(key, reconciled)
      return reconciled
    })
  }

  /** Repair all Bindings owned by one exact live Team Lead from its authoritative roster. */
  async reconcileTeam(caller: Agent): Promise<void> {
    if (!this.host.hasStorage || this.host.lifecycle.signal.aborted || this.host.ctx.agents.get(caller.id) !== caller) return
    const membership = this.host.ctx.agentTeams.tryMembership(caller)
    if (membership?.role !== 'lead') return
    const teamId = membership.id
    const roster = this.host.ctx.agentTeams.listMembers(caller)
    const bindings = [...this.host.storage.bindingEntries()]
      .map(([, binding]) => binding)
      .filter(binding => binding.teamId === teamId)
    for (const binding of bindings) await this.reconcileBinding(caller, binding, roster)
  }

  /** Reconcile every distinct live root Team currently visible to this Host. */
  async reconcileAvailableLeads(): Promise<void> {
    const seen = new Set<string>()
    for (const agent of this.host.ctx.agents.list()) {
      const membership = this.host.ctx.agentTeams.tryMembership(agent)
      if (membership?.role !== 'lead' || seen.has(membership.id)) continue
      seen.add(membership.id)
      await this.reconcileTeam(agent)
    }
  }

  /** Track one event-driven reconciliation so disposal reaches quiescence. */
  scheduleLeadReconciliation(agent: Agent): void {
    if (!this.host.hasStorage || this.host.lifecycle.signal.aborted) return
    const operation = this.reconcileTeam(agent)
    this.reconciliations.add(operation)
    void operation.catch((error: unknown) => {
      this.host.ctx.logger.warn('agent-team-ultra: Team Binding reconciliation failed')
      this.host.ctx.logger.warn(error)
    }).finally(() => { this.reconciliations.delete(operation) })
  }

  /** Reconcile live Teams after a complete runtime catalog generation publishes. */
  scheduleAvailableLeadReconciliation(): void {
    if (!this.host.hasStorage || this.host.lifecycle.signal.aborted) return
    for (const agent of this.host.ctx.agents.list()) this.scheduleLeadReconciliation(agent)
  }

  /** Persist one terminal provider result unless event reconciliation already wrote the same or a failed edge. */
  private async commitProvisionedBinding(
    key: string,
    active: DigitalEmployeeBindingV1,
  ): Promise<DigitalEmployeeBindingV1> {
    return await this.host.enqueue(async () => {
      const storage = this.host.storage
      const current = storage.getBinding(key)
      if (current?.launchRequestId !== undefined && current.launchRequestId !== active.launchRequestId) {
        throw new Error(`binding "${key}" changed launch identity during provisioning`)
      }
      if (current?.provisioningPhase === 'failed') return current
      if (current !== undefined && isDeepStrictEqual(current, active)) return current
      await storage.putBinding(key, active)
      return active
    })
  }
}
