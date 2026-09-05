import { Config, resolveConfig } from './configuration.ts'
import { DigitalEmployeeHostContext } from './host-context.ts'
import { ProfileLifecycle } from './profile-lifecycle.ts'
import { EvaluationWorkflow } from './evaluation-workflow.ts'
import { ProfileCapabilityInstaller, TEAM_OWN_TOOL_NAMES } from './profile-capabilities.ts'
import {
  errorText,
  failure,
  authorityRemoteError,
  externalRuntimeFailure,
} from './host-errors.ts'
import { snapshotProfile } from './profile-snapshot.ts'
import { Buffer } from 'node:buffer'
import { isDeepStrictEqual } from 'node:util'
import { Context, Service } from '@deepseek-ai/cordis'

import type { Agent } from '@deepseek-ai/dsh-agent'
import type { DomainChanged } from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { TeamError, TeammateLaunchRequestId, TeammateRuntimeError } from '@deepseek-ai/dsh-experimental-agent-team'
import type { TeamMemberRouteSnapshot } from '@deepseek-ai/dsh-experimental-agent-team'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import { foldSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { launchRequestIdSchema, nativeRuntimeHandleFromTeammate, type DigitalEmployeeBinding } from './spec.ts'
import {
  sameDshTarget,
  externalRuntimeProfileSnapshot,
  requiredRuntimeCapabilitiesForProfile,
  snapshotRequiredCapabilities,
  type DigitalEmployeeExternalRuntimeProvider,
  type DigitalEmployeeExternalRuntimeRegistration,
} from './runtime.ts'
import {
  assignmentContentHash,
  digitalEmployeeBindingKey,
  legacyInheritLeadRuntimeTarget,
  openDigitalEmployeeStorage,
  launchRequestFingerprint,
  profileContentFingerprint,
  type DigitalEmployeeBindingV1,
  type MigratedRuntimeTarget,
} from './storage.ts'
import {
  bindingMatchesReplay,
  bindingRosterMember,
  bindingRuntimePresence,
  reconcileBindingFromRoster,
} from './launch.ts'
import {
  createExternalRunIndex,
  foldDshRunEvidence,
  foldExternalRunEvidence,
  type DshRunFoldBinding,
  type ExternalRunFoldBinding,
} from './run.ts'
import type {
  ActivateDigitalEmployeeProfileRequest,
  ArchiveDigitalEmployeeProfileRequest,
  DigitalEmployeeFailure,
  DigitalEmployeeInstanceView,
  DigitalEmployeeProfile,
  DigitalEmployeeRunIndexRecord,
  DshModelRuntimeTarget,
  DigitalEmployeeStudioView,
  DigitalEmployeeStudioFrame,
  GetDigitalEmployeeProfileRevisionRequest,
  GetDigitalEmployeeProfileRevisionResult,
  GetDigitalEmployeeRunRequest,
  GetDigitalEmployeeRunResult,
  LaunchRequestId,
  MutateDigitalEmployeeProfileHeadResult,
  ProfileToolOption,
  RollbackDigitalEmployeeProfileRequest,
  RestoreDigitalEmployeeProfileRequest,
  SaveDigitalEmployeeProfileRequest,
  SaveDigitalEmployeeProfileResult,
  SpawnDigitalEmployeeRequest,
  SpawnDigitalEmployeeResult,
  SaveDigitalEmployeeEvalSetRequest,
  SaveDigitalEmployeeEvalSetResult,
  SetDigitalEmployeeEvalGateRequest,
  StartDigitalEmployeeEvalRunRequest,
  StartDigitalEmployeeEvalRunResult,
  CancelDigitalEmployeeEvalRunRequest,
  CancelDigitalEmployeeEvalRunResult,
  GetDigitalEmployeeEvalRunRequest,
  GetDigitalEmployeeEvalRunResult,
} from './types.ts'
import { StudioSnapshotFeed } from './studio-feed.ts'
import { summarizeEvalRun } from './evaluation.ts'

export { Config } from './configuration.ts'
export { snapshotProfile } from './profile-snapshot.ts'
export type * from './types.ts'
export type {
  DigitalEmployeeExternalRuntimeProvider,
  DigitalEmployeeExternalRuntimeRegistration,
} from './runtime.ts'
export {
  digitalEmployeeBindingSchema,
  digitalEmployeeDomainSpec,
  digitalEmployeeEvalSetDraftSchema,
  digitalEmployeeProfileDraftSchema,
  digitalEmployeeProfileSchema,
  digitalEmployeeRuntimeTargetSchema,
  launchRequestIdSchema,
  evalRunIdSchema,
  profileHookSchema,
  profileTextBlockSchema,
  profileToolPolicySchema,
  selectableDigitalEmployeeRuntimeTargetSchema,
} from './spec.ts'
export {
  EVAL_ASSERTION_SCHEMA_VERSION,
  effectiveEvaluationTools,
  evalEnvironmentFingerprint,
  evalRunPassed,
  evalRunRequestFingerprint,
  evalSetContentFingerprint,
  evaluateCaseAssertions,
} from './evaluation.ts'
export {
  requiredCapabilitiesForProfile,
  requiredRuntimeCapabilitiesForProfile,
  runtimeTargetRoutingId,
} from './runtime.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    digitalEmployees: DigitalEmployeeService
  }
}

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

function snapshotRunIndex(run: DigitalEmployeeRunIndexRecord): DigitalEmployeeRunIndexRecord {
  return Object.freeze({
    ...run,
    canonicalSource: Object.freeze({ ...run.canonicalSource }),
    owner: Object.freeze({ ...run.owner }),
    selectedRuntimeTarget: run.selectedRuntimeTarget.kind === 'legacy-inherit-lead'
      ? legacyInheritLeadRuntimeTarget
      : Object.freeze({ ...run.selectedRuntimeTarget }),
    ...(run.actualRuntimeTarget === undefined
      ? {}
      : { actualRuntimeTarget: Object.freeze({ ...run.actualRuntimeTarget }) }),
    ...(run.usage === undefined ? {} : { usage: Object.freeze({ ...run.usage }) }),
    completeness: Object.freeze({
      ...run.completeness,
      redactions: Object.freeze([...run.completeness.redactions]),
    }),
  })
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

function runRejected(error: DigitalEmployeeFailure): GetDigitalEmployeeRunResult {
  return Object.freeze({ ok: false, error })
}

/** Concrete Host service; one provider is sufficient for this local overlay. */
export class DigitalEmployeeService extends TypertRemoteService {
  static inject = [
    'agents',
    'agentTeams',
    'llm',
    'sessionPersistence',
    'storageDomain',
    'subagents',
    'systemPrompt',
    'tools',
  ]
  static Config = Config

  private readonly profiles: ProfileLifecycle
  private readonly evaluationWorkflow: EvaluationWorkflow
  private readonly capabilities: ProfileCapabilityInstaller
  private readonly host: DigitalEmployeeHostContext
  private readonly launches = new Set<Promise<unknown>>()
  private readonly launchesByRequest = new Map<string, InFlightLaunch>()
  private readonly reconciliations = new Set<Promise<void>>()
  private readonly runRepairs = new Set<Promise<void>>()
  private readonly pendingApprovals = new Map<string, Set<string>>()
  private readonly studioSnapshots = new StudioSnapshotFeed<DigitalEmployeeStudioView>()

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'digitalEmployees')
    this.host = new DigitalEmployeeHostContext(ctx, resolveConfig(config), () => {
      this.scheduleAvailableLeadReconciliation()
      this.studioSnapshots.invalidate()
    })
    this.capabilities = new ProfileCapabilityInstaller(this.host)
    this.evaluationWorkflow = new EvaluationWorkflow(this.host, this.capabilities)
    this.profiles = new ProfileLifecycle(this.host, (caller, teamId, head, revision) =>
      this.evaluationWorkflow.promotionGate(caller, teamId, head, revision))
  }

  /** Open durable sidecar state, then compose every matching live and future child scope. */
  protected async [Service.init](): Promise<void> {
    await this.host.runtimeBackends.initialize()
    const storage = await openDigitalEmployeeStorage(this.ctx.storageDomain, {
      resolveBindingRuntimeTarget: binding => this.migratedBindingRuntimeTarget(binding),
    })
    this.host.attachStorage(storage)
    let stopCreated = (): void => undefined
    let stopDisposed = (): void => undefined
    let stopSessionStart = (): void => undefined
    let stopSessionEvent = (): void => undefined
    let stopDomainChanged = (): void => undefined
    this.ctx.effect(() => async () => {
      this.host.closeAdmission()
      this.studioSnapshots.close()
      this.evaluationWorkflow.interrupt()
      const runtimeBackendDisposal = this.host.runtimeBackends.dispose()
      const failures: unknown[] = []
      try { stopCreated() } catch (error: unknown) { failures.push(error) }
      try { stopDisposed() } catch (error: unknown) { failures.push(error) }
      try { stopSessionStart() } catch (error: unknown) { failures.push(error) }
      try { stopSessionEvent() } catch (error: unknown) { failures.push(error) }
      try { stopDomainChanged() } catch (error: unknown) { failures.push(error) }
      this.pendingApprovals.clear()
      try { this.capabilities.disposeAll() } catch (error: unknown) { failures.push(error) }
      await Promise.allSettled([...this.launches])
      await Promise.allSettled([...this.reconciliations])
      await Promise.allSettled([...this.runRepairs])
      await this.evaluationWorkflow.whenSettled()
      await this.host.whenWritesSettled()
      try { await runtimeBackendDisposal } catch (error: unknown) { failures.push(error) }
      try { await this.host.closeStorage() } catch (error: unknown) { failures.push(error) }
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Agent Team Ultra disposal failed')
      }
    }, 'agent-team-ultra.runtime')
    stopCreated = this.ctx.on('agent/created', ({ agent }) => {
      this.installBoundAgent(agent)
      this.scheduleLeadReconciliation(agent)
      this.studioSnapshots.invalidate()
    })
    stopDisposed = this.ctx.on('agent/disposed', ({ agent }) => {
      this.pendingApprovals.delete(agent.id)
      this.capabilities.remove(agent)
      this.studioSnapshots.invalidate()
    })
    stopSessionStart = this.ctx.on('agent/session-start', ({ agent }) => {
      this.scheduleLeadReconciliation(agent)
      this.studioSnapshots.invalidate()
    })
    stopSessionEvent = this.ctx.on('session/event', (session, event) => {
      this.observeApprovalCorrelation(session.id, event)
      if (event.type === 'team/member') {
        const lead = this.ctx.agents.get(session.id)
        if (lead !== undefined) this.scheduleLeadReconciliation(lead)
      }
      if (event.type === 'turn/start' || event.type === 'turn/end' || event.type === 'assistant/message'
        || event.type === 'team/member' || event.type === 'team/message/delivered'
        || String(event.type) === 'approval/asked' || String(event.type) === 'approval/decided') {
        this.scheduleRunRepair(session.id)
        this.studioSnapshots.invalidate()
      }
    })
    stopDomainChanged = this.ctx.on('domain/changed', (change: DomainChanged) => {
      if (change.domain === 'agent_team_ultra_v1') this.studioSnapshots.invalidate()
    })
    this.host.restoreRuntimeGeneration()
    await this.evaluationWorkflow.repairInterrupted()
    this.host.openAdmission()
    for (const agent of this.ctx.agents.list()) this.installBoundAgent(agent)
    await this.reconcileAvailableLeads()
    await this.repairAvailableTeamRuns()
  }

  /** Register one durable local-agent runtime; the provider object remains Host-only. */
  registerExternalRuntimeProvider(
    provider: DigitalEmployeeExternalRuntimeProvider,
  ): DigitalEmployeeExternalRuntimeRegistration {
    return this.host.runtimeBackends.registerExternalRuntimeProvider(this.ctx, provider)
  }

  /** Await the latest topology generation; useful to coordinate Host startup and tests. */
  whenRuntimeCatalogSettled(): Promise<void> {
    return this.host.runtimeBackends.whenSettled()
  }

  /** Complete replaceable Studio view for one exact live Team Lead. */
  @Remote('view')
  async remoteView(agent: Agent): Promise<DigitalEmployeeStudioView> {
    await this.reconcileTeam(agent)
    await this.repairTeamRuns(agent)
    return this.studioView(agent)
  }

  /** Follow complete replaceable snapshots across one Remote carrier generation. */
  @Remote({ mode: 'stream' })
  async *watch(agent: Agent, signal: AbortSignal): AsyncIterable<DigitalEmployeeStudioFrame> {
    signal.throwIfAborted()
    await this.reconcileTeam(agent)
    await this.repairTeamRuns(agent)
    yield* this.studioSnapshots.follow(() => this.studioView(agent), signal)
  }

  /** Fetch one immutable Revision and its bounded comparison with active. */
  @Remote('revision')
  remoteRevision(
    agent: Agent,
    request: GetDigitalEmployeeProfileRevisionRequest,
  ): Promise<GetDigitalEmployeeProfileRevisionResult> {
    return this.profileRevision(agent, request)
  }

  /** Lazily fold bounded canonical evidence for one deterministic Run. */
  @Remote('run')
  remoteRun(
    agent: Agent,
    request: GetDigitalEmployeeRunRequest,
    signal: AbortSignal,
  ): Promise<GetDigitalEmployeeRunResult> {
    return this.runEvidence(agent, request, signal)
  }

  /** Build the complete replaceable Studio view for one exact live Team Lead. */
  studioView(caller: Agent): DigitalEmployeeStudioView {
    const authorityFailure = this.host.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) throw authorityRemoteError(authorityFailure, 'view')
    const membership = this.ctx.agentTeams.membership(caller)
    const profiles = [...this.host.storage.profileHeadEntries()]
      .map(([, head]) => this.profiles.catalogEntry(caller, membership.id, head))
      .sort((left, right) => left.latest.profile.displayName.localeCompare(right.latest.profile.displayName)
        || left.head.profileId.localeCompare(right.head.profileId))
    const tools: ProfileToolOption[] = this.ctx.tools.schemas(caller)
      .filter(tool => !TEAM_OWN_TOOL_NAMES.has(tool.name))
      .map(tool => Object.freeze({ name: tool.name, description: tool.description }))
      .sort((left, right) => left.name.localeCompare(right.name))
    const instances = [...this.host.storage.bindingEntries()]
      .map(([, binding]) => binding)
      .filter(binding => binding.teamId === membership.id)
      .map(binding => this.instanceView(caller, binding))
      .sort((left, right) => left.memberName.localeCompare(right.memberName))
    const runs = [...this.host.storage.runEntries()]
      .map(([, run]) => run)
      .filter(run => run.teamId === membership.id)
      .sort((left, right) => right.startedAt - left.startedAt || right.runId.localeCompare(left.runId))
      .map(snapshotRunIndex)
    const evalSets = [...this.host.storage.evalSetHeadEntries()]
      .map(([, head]) => this.evaluationWorkflow.catalogEntry(head))
      .sort((left, right) => left.latest.evalSet.displayName.localeCompare(right.latest.evalSet.displayName)
        || left.head.evalSetId.localeCompare(right.head.evalSetId))
    const evalRuns = [...this.host.storage.evalRunEntries()]
      .map(([, run]) => run)
      .filter(run => run.teamId === membership.id)
      .sort((left, right) => right.startedAt - left.startedAt
        || right.evalRunId.localeCompare(left.evalRunId))
      .map(summarizeEvalRun)
    const historicalTargets = profiles.flatMap(entry =>
      [...this.host.storage.profileRevisionEntries(entry.head.profileId)]
        .map(([, revision]) => revision.runtimeTarget))
    for (const [, binding] of this.host.storage.bindingEntries()) {
      if (binding.teamId === membership.id) historicalTargets.push(binding.runtimeTarget)
    }
    for (const run of evalRuns) historicalTargets.push(run.runtimeTarget)
    return Object.freeze({
      profiles: Object.freeze(profiles),
      runtimeCatalog: this.host.runtimeBackends.snapshot(historicalTargets),
      tools: Object.freeze(tools),
      instances: Object.freeze(instances),
      runs: Object.freeze(runs),
      evalSets: Object.freeze(evalSets),
      evalRuns: Object.freeze(evalRuns),
    })
  }

  /** Public Host Revision inspector guarded by exact live Lead authority. */
  profileRevision(
    caller: Agent,
    request: GetDigitalEmployeeProfileRevisionRequest,
  ): Promise<GetDigitalEmployeeProfileRevisionResult> {
    return this.profiles.profileRevision(caller, request)
  }

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
    const membership = this.ctx.agentTeams.membership(caller)
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
      const page = await this.ctx.agentTeams.readTeammateRuntimeEvidence(caller, stored.owner.memberName, {
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

  /** Save one normalized profile with an exact CAS precondition. */
  @Remote('save')
  remoteSave(agent: Agent, request: SaveDigitalEmployeeProfileRequest): Promise<SaveDigitalEmployeeProfileResult> {
    return this.saveProfile(agent, request)
  }

  /** Version one Profile-scoped Eval Set through exact independent CAS. */
  @Remote('saveEvalSet')
  remoteSaveEvalSet(
    agent: Agent,
    request: SaveDigitalEmployeeEvalSetRequest,
  ): Promise<SaveDigitalEmployeeEvalSetResult> {
    return this.saveEvalSet(agent, request)
  }

  /** Attach or clear a fixed Eval Set Revision promotion gate. */
  @Remote('setEvalGate')
  remoteSetEvalGate(
    agent: Agent,
    request: SetDigitalEmployeeEvalGateRequest,
  ): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.setEvalGate(agent, request)
  }

  /** Admit one exact idempotent evaluation and run its Cases in the background. */
  @Remote('startEvalRun')
  remoteStartEvalRun(
    agent: Agent,
    request: StartDigitalEmployeeEvalRunRequest,
  ): Promise<StartDigitalEmployeeEvalRunResult> {
    return this.startEvalRun(agent, request)
  }

  /** Cancel one Team-owned running evaluation and return its terminal snapshot. */
  @Remote('cancelEvalRun')
  remoteCancelEvalRun(
    agent: Agent,
    request: CancelDigitalEmployeeEvalRunRequest,
  ): Promise<CancelDigitalEmployeeEvalRunResult> {
    return this.cancelEvalRun(agent, request)
  }

  /** Inspect one Team-owned Eval Run and its exact immutable Eval Set. */
  @Remote('evalRun')
  remoteEvalRun(
    agent: Agent,
    request: GetDigitalEmployeeEvalRunRequest,
  ): Promise<GetDigitalEmployeeEvalRunResult> {
    return this.evalRun(agent, request)
  }

  /** Promote the latest candidate without rewriting any Revision. */
  @Remote('activate')
  remoteActivate(
    agent: Agent,
    request: ActivateDigitalEmployeeProfileRequest,
  ): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.activateProfile(agent, request)
  }

  /** Repoint activeRevision to an older immutable Revision. */
  @Remote('rollback')
  remoteRollback(
    agent: Agent,
    request: RollbackDigitalEmployeeProfileRequest,
  ): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.rollbackProfile(agent, request)
  }

  /** Archive a Profile Head while retaining every historical reference. */
  @Remote('archive')
  remoteArchive(
    agent: Agent,
    request: ArchiveDigitalEmployeeProfileRequest,
  ): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.archiveProfile(agent, request)
  }

  /** Restore an archived Profile Head through exact CAS. */
  @Remote('restore')
  remoteRestore(
    agent: Agent,
    request: RestoreDigitalEmployeeProfileRequest,
  ): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.restoreProfile(agent, request)
  }

  /** Launch one profile as a real Agent Team teammate under exact Lead authority. */
  @Remote('spawn')
  remoteSpawn(
    agent: Agent,
    request: SpawnDigitalEmployeeRequest,
    signal: AbortSignal,
  ): Promise<SpawnDigitalEmployeeResult> {
    return this.spawnProfile(agent, request, signal)
  }

  /** Public Host API used by headless consumers and tests. */
  async saveProfile(caller: Agent, request: SaveDigitalEmployeeProfileRequest): Promise<SaveDigitalEmployeeProfileResult> {
    return this.profiles.saveProfile(caller, request)
  }

  /** Publish one immutable Eval Set Revision and move only its CAS Head. */
  async saveEvalSet(
    caller: Agent,
    request: SaveDigitalEmployeeEvalSetRequest,
  ): Promise<SaveDigitalEmployeeEvalSetResult> {
    return this.evaluationWorkflow.saveEvalSet(caller, request)
  }

  /** Change only the Profile Head's required Eval Set pointer through CAS. */
  setEvalGate(
    caller: Agent,
    request: SetDigitalEmployeeEvalGateRequest,
  ): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.profiles.setEvalGate(caller, request)
  }

  /** Reserve one exact Eval Run identity, then execute it outside the mutation queue. */
  async startEvalRun(
    caller: Agent,
    request: StartDigitalEmployeeEvalRunRequest,
  ): Promise<StartDigitalEmployeeEvalRunResult> {
    return this.evaluationWorkflow.startEvalRun(caller, request)
  }

  /** Abort and drain a running evaluation owned by the caller's exact Team. */
  async cancelEvalRun(
    caller: Agent,
    request: CancelDigitalEmployeeEvalRunRequest,
  ): Promise<CancelDigitalEmployeeEvalRunResult> {
    return this.evaluationWorkflow.cancelEvalRun(caller, request)
  }

  /** Read an Eval Run only inside the exact Team that admitted it. */
  async evalRun(
    caller: Agent,
    request: GetDigitalEmployeeEvalRunRequest,
  ): Promise<GetDigitalEmployeeEvalRunResult> {
    return this.evaluationWorkflow.evalRun(caller, request)
  }

  /** Activate only the latest candidate through exact Head CAS. */
  activateProfile(
    caller: Agent,
    request: ActivateDigitalEmployeeProfileRequest,
  ): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.profiles.activateProfile(caller, request)
  }

  /** Roll back to an older existing Revision through exact Head CAS. */
  rollbackProfile(
    caller: Agent,
    request: RollbackDigitalEmployeeProfileRequest,
  ): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.profiles.rollbackProfile(caller, request)
  }

  /** Archive without removing immutable history or active Binding snapshots. */
  archiveProfile(
    caller: Agent,
    request: ArchiveDigitalEmployeeProfileRequest,
  ): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.profiles.archiveProfile(caller, request)
  }

  /** Restore one archived Head through exact CAS. */
  restoreProfile(
    caller: Agent,
    request: RestoreDigitalEmployeeProfileRequest,
  ): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.profiles.restoreProfile(caller, request)
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
      const membership = this.ctx.agentTeams.membership(caller)
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
      const roster = this.ctx.agentTeams.listMembers(caller)
      const reconciled = await this.reconcileBinding(caller, prior, roster)
      const rosterMember = bindingRosterMember(reconciled, roster)
      if (reconciled.provisioningPhase !== 'pending'
        || (rosterMember !== undefined && reconciled.runtimeTarget.kind !== 'external-agent')
        || !await this.pendingBindingIsExecutable(caller, reconciled)) {
        return Object.freeze({ ok: true, value: this.instanceView(caller, reconciled) })
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
      if (resolutionProblem !== undefined) {
        return spawnRejected(failure(resolutionProblem.code, resolutionProblem.message, head))
      }
      const unavailable = profile.toolPolicy.mode === 'inherit'
        ? []
        : profile.toolPolicy.names.filter(name =>
          TEAM_OWN_TOOL_NAMES.has(name) || this.ctx.tools.get(name, caller) === undefined)
      if (unavailable.length > 0) {
        return spawnRejected(failure(
          'tool-unavailable',
          `profile names tools unavailable to this Lead: ${unavailable.join(', ')}`,
        ))
      }
    }

    const key = digitalEmployeeBindingKey(teamId, profile.employeeName)
    const reservation = await this.host.enqueue(async (): Promise<DigitalEmployeeBindingV1 | DigitalEmployeeFailure> => {
      const storage = this.host.storage
      const requestOwner = storage.findBindingByLaunchRequest(teamId, request.launchRequestId)
      if (requestOwner !== undefined) {
        return bindingMatchesReplay(requestOwner[1], request.profileId, request.assignmentHash)
          ? requestOwner[1]
          : failure('launch-request-conflict', 'launchRequestId was already used with different normalized input')
      }
      const existing = storage.getBinding(key)
      const rosterOwnsName = this.ctx.agentTeams.listMembers(caller)
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
    const roster = this.ctx.agentTeams.listMembers(caller)
    if (reservation.provisioningPhase !== 'pending'
      || (bindingRosterMember(reservation, roster) !== undefined
        && reservation.runtimeTarget.kind !== 'external-agent')) {
      const reconciled = await this.reconcileBinding(caller, reservation, roster)
      return Object.freeze({ ok: true, value: this.instanceView(caller, reconciled) })
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
      return Object.freeze({ ok: true, value: this.instanceView(caller, reservation) })
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
        ? await this.ctx.agentTeams.spawnTeammate(caller, {
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
        : await this.ctx.agentTeams.spawnTeammate(caller, {
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
          ? Object.freeze({ ok: true, value: this.instanceView(caller, committed) })
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
        ? Object.freeze({ ok: true, value: this.instanceView(caller, committed) })
        : spawnRejected(failure('team-rejected', committed.error ?? 'teammate provisioning did not become active'))
    } catch (error: unknown) {
      const roster = this.ctx.agentTeams.listMembers(caller)
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
        return Object.freeze({ ok: true, value: this.instanceView(caller, recorded) })
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

  /** Install one immutable Profile layer into exactly the supplied Agent scope. */
  installProfileCapabilities(caller: Agent, agent: Agent, source: DigitalEmployeeProfile): () => void {
    return this.capabilities.install(caller, agent, source)
  }

  /** Install at most once for an exact Agent object; an id reused later is a distinct lifecycle. */
  private installBoundAgent(agent: Agent): void {
    if (!this.host.admissionOpen || this.capabilities.has(agent)) return
    const binding = this.bindingFor(agent)
    if (binding === undefined) return
    const caller = this.ctx.agents.get(binding.teamId as Agent['id'])
    if (caller === undefined) {
      throw new Error(`Digital Employee Team Lead "${binding.teamId}" is not active`)
    }
    this.installProfileCapabilities(caller, agent, binding.profile)
  }

  /** Resolve by durable member id first, then the pre-publication Team/name reservation. */
  private bindingFor(agent: Agent): DigitalEmployeeBindingV1 | undefined {
    const storage = this.host.storage
    for (const [, binding] of storage.bindingEntries()) {
      if (binding.memberId === agent.id) return binding
    }
    const parentId = agent.session.header.parentSession
    if (parentId === undefined) return undefined
    const root = this.ctx.agents.get(parentId)
    if (root === undefined) return undefined
    const member = this.ctx.agentTeams.listMembers(root).find(candidate => candidate.id === agent.id)
    return member === undefined
      ? undefined
      : storage.getBinding(digitalEmployeeBindingKey(parentId, member.name))
  }

  /** Record an exact historical route only when the durable child descriptor proves it. */
  private migratedBindingRuntimeTarget(binding: DigitalEmployeeBinding): MigratedRuntimeTarget {
    try {
      if (binding.memberId === undefined) return legacyInheritLeadRuntimeTarget
      const child = this.ctx.agents.get(binding.memberId as Agent['id'])
      if (child === undefined || child.session.header.parentSession !== binding.teamId) {
        return legacyInheritLeadRuntimeTarget
      }
      const root = this.ctx.agents.get(binding.teamId as Agent['id'])
      if (root === undefined) return legacyInheritLeadRuntimeTarget
      const membership = this.ctx.agentTeams.membership(root)
      if (membership.role !== 'lead' || membership.root !== root || membership.id !== binding.teamId
        || !this.ctx.agentTeams.listMembers(root)
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
        !TEAM_OWN_TOOL_NAMES.has(name) && this.ctx.tools.get(name, caller) !== undefined)
  }

  /** Persist one roster-derived Binding repair without allowing an older observation to replace a newer request. */
  private async reconcileBinding(
    caller: Agent,
    binding: DigitalEmployeeBindingV1,
    roster = this.ctx.agentTeams.listMembers(caller),
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
  private async reconcileTeam(caller: Agent): Promise<void> {
    if (!this.host.hasStorage || this.host.lifecycle.signal.aborted || this.ctx.agents.get(caller.id) !== caller) return
    const membership = this.ctx.agentTeams.tryMembership(caller)
    if (membership?.role !== 'lead') return
    const teamId = membership.id
    const roster = this.ctx.agentTeams.listMembers(caller)
    const bindings = [...this.host.storage.bindingEntries()]
      .map(([, binding]) => binding)
      .filter(binding => binding.teamId === teamId)
    for (const binding of bindings) await this.reconcileBinding(caller, binding, roster)
  }

  /** Reconcile every distinct live root Team currently visible to this Host. */
  private async reconcileAvailableLeads(): Promise<void> {
    const seen = new Set<string>()
    for (const agent of this.ctx.agents.list()) {
      const membership = this.ctx.agentTeams.tryMembership(agent)
      if (membership?.role !== 'lead' || seen.has(membership.id)) continue
      seen.add(membership.id)
      await this.reconcileTeam(agent)
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
    const live = this.ctx.agents.get(SessionId(sessionId))
    if (live !== undefined) return live.session.ownEvents()
    const handle = await this.ctx.sessionPersistence.open(SessionId(sessionId), 'read', { signal })
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
  private async repairTeamRuns(caller: Agent): Promise<void> {
    if (!this.host.hasStorage || this.host.lifecycle.signal.aborted || this.ctx.agents.get(caller.id) !== caller) return
    const membership = this.ctx.agentTeams.tryMembership(caller)
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
        this.ctx.logger.warn(`agent-team-ultra: Run repair failed for ${binding.memberName}: ${errorText(error)}`)
      }
    }
  }

  /** Repair every live Team once after startup. */
  private async repairAvailableTeamRuns(): Promise<void> {
    const seen = new Set<string>()
    for (const agent of this.ctx.agents.list()) {
      const membership = this.ctx.agentTeams.tryMembership(agent)
      if (membership?.role !== 'lead' || seen.has(membership.id)) continue
      seen.add(membership.id)
      await this.repairTeamRuns(agent)
    }
  }

  /** Retain only same-process unresolved audit ids; persisted asks are intentionally non-resumable. */
  private observeApprovalCorrelation(sessionId: SessionId, event: SessionEvent): void {
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
    if (binding === undefined || this.ctx.agents.get(sessionId) === undefined) return
    const pending = this.pendingApprovals.get(sessionId) ?? new Set<string>()
    pending.add(data.id)
    this.pendingApprovals.set(sessionId, pending)
  }

  /** Track event-driven Run repair as disposal-visible work. */
  private scheduleRunRepair(sessionId: SessionId): void {
    if (!this.host.hasStorage || this.host.lifecycle.signal.aborted) return
    const operation = (async () => {
      const lead = this.ctx.agents.get(sessionId)
      const membership = lead === undefined ? undefined : this.ctx.agentTeams.tryMembership(lead)
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
        this.ctx.logger.warn(`agent-team-ultra: event-driven Run repair failed: ${errorText(error)}`)
      }
    }).finally(() => { this.runRepairs.delete(operation) })
  }

  /** Track one event-driven reconciliation so disposal reaches quiescence. */
  private scheduleLeadReconciliation(agent: Agent): void {
    if (!this.host.hasStorage || this.host.lifecycle.signal.aborted) return
    const operation = this.reconcileTeam(agent)
    this.reconciliations.add(operation)
    void operation.catch((error: unknown) => {
      this.ctx.logger.warn('agent-team-ultra: Team Binding reconciliation failed')
      this.ctx.logger.warn(error)
    }).finally(() => { this.reconciliations.delete(operation) })
  }

  /** Reconcile live Teams after a complete runtime catalog generation publishes. */
  private scheduleAvailableLeadReconciliation(): void {
    if (!this.host.hasStorage || this.host.lifecycle.signal.aborted) return
    for (const agent of this.ctx.agents.list()) this.scheduleLeadReconciliation(agent)
  }

  private instanceView(caller: Agent, binding: DigitalEmployeeBindingV1): DigitalEmployeeInstanceView {
    const rosterMember = binding.memberId === undefined
      ? undefined
      : this.ctx.agentTeams.listMembers(caller).find(member =>
          member.id === binding.memberId && member.name === binding.memberName)
    return Object.freeze({
      teamId: binding.teamId,
      memberName: binding.memberName,
      ...(binding.memberId === undefined ? {} : { memberId: binding.memberId }),
      ...(binding.launchRequestId === undefined ? {} : { launchRequestId: binding.launchRequestId }),
      profileId: binding.profileId,
      profileRevision: binding.profileRevision,
      runtimeTarget: binding.runtimeTarget.kind === 'legacy-inherit-lead'
        ? legacyInheritLeadRuntimeTarget
        : Object.freeze({ ...binding.runtimeTarget }),
      ...(binding.resolvedRuntimeTarget === undefined
        ? {}
        : { resolvedRuntimeTarget: Object.freeze({ ...binding.resolvedRuntimeTarget }) }),
      ...(binding.nativeRuntimeHandle === undefined
        ? {}
        : { nativeRuntimeHandle: binding.nativeRuntimeHandle }),
      requiredCapabilities: snapshotRequiredCapabilities(binding.requiredCapabilities),
      provisioningPhase: binding.provisioningPhase,
      runtimeAvailability: this.host.runtimeBackends.availability(
        binding.profile,
        binding.runtimeTarget,
        binding.requiredCapabilities,
      ),
      runtimePresence: binding.runtimeTarget.kind === 'external-agent'
        && binding.nativeRuntimeHandle !== undefined
        ? rosterMember?.status === 'running' || rosterMember?.status === 'idle'
          ? rosterMember.status
          : 'inactive'
        : bindingRuntimePresence(
          binding,
          binding.memberId === undefined ? undefined : this.ctx.agents.get(SessionId(binding.memberId)),
        ),
      ...(binding.error === undefined ? {} : { error: binding.error }),
    })
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

export default DigitalEmployeeService
