import { LaunchWorkflow } from './launch-workflow.ts'
import { RunWorkflow } from './run-workflow.ts'
import { StudioProjection } from './studio-projection.ts'
import { Config, resolveConfig } from './configuration.ts'
import { DigitalEmployeeHostContext } from './host-context.ts'
import { ProfileLifecycle } from './profile-lifecycle.ts'
import { EvaluationWorkflow } from './evaluation-workflow.ts'
import { ProfileCapabilityInstaller } from './profile-capabilities.ts'
import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { DomainChanged } from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { DigitalEmployeeExternalRuntimeProvider, DigitalEmployeeExternalRuntimeRegistration } from './runtime.ts'
import { openDigitalEmployeeStorage } from './storage.ts'
import type {
  ActivateDigitalEmployeeProfileRequest,
  ArchiveDigitalEmployeeProfileRequest,
  DigitalEmployeeProfile,
  DigitalEmployeeStudioView,
  DigitalEmployeeStudioFrame,
  GetDigitalEmployeeProfileRevisionRequest,
  GetDigitalEmployeeProfileRevisionResult,
  GetDigitalEmployeeRunRequest,
  GetDigitalEmployeeRunResult,
  MutateDigitalEmployeeProfileHeadResult,
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
  private readonly launchWorkflow: LaunchWorkflow
  private readonly runWorkflow: RunWorkflow
  private readonly studioSnapshots: StudioProjection

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'digitalEmployees')
    this.host = new DigitalEmployeeHostContext(ctx, resolveConfig(config), () => {
      this.launchWorkflow.scheduleAvailableLeadReconciliation()
      this.studioSnapshots.invalidate()
    })
    this.capabilities = new ProfileCapabilityInstaller(this.host)
    this.evaluationWorkflow = new EvaluationWorkflow(this.host, this.capabilities)
    this.profiles = new ProfileLifecycle(this.host, (caller, teamId, head, revision) =>
      this.evaluationWorkflow.promotionGate(caller, teamId, head, revision))
    this.launchWorkflow = new LaunchWorkflow(this.host, this.capabilities)
    this.runWorkflow = new RunWorkflow(this.host)
    this.studioSnapshots = new StudioProjection(this.host, this.profiles, this.evaluationWorkflow)
  }

  /** Open durable sidecar state, then compose every matching live and future child scope. */
  protected async [Service.init](): Promise<void> {
    await this.host.runtimeBackends.initialize()
    const storage = await openDigitalEmployeeStorage(this.ctx.storageDomain, {
      resolveBindingRuntimeTarget: binding => this.launchWorkflow.migratedBindingRuntimeTarget(binding),
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
      this.runWorkflow.clearApprovals()
      try { this.capabilities.disposeAll() } catch (error: unknown) { failures.push(error) }
      await this.launchWorkflow.whenSettled()
      await this.runWorkflow.whenSettled()
      await this.evaluationWorkflow.whenSettled()
      await this.host.whenWritesSettled()
      try { await runtimeBackendDisposal } catch (error: unknown) { failures.push(error) }
      try { await this.host.closeStorage() } catch (error: unknown) { failures.push(error) }
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Agent Team Ultra disposal failed')
      }
    }, 'agent-team-ultra.runtime')
    stopCreated = this.ctx.on('agent/created', ({ agent }) => {
      this.launchWorkflow.installBoundAgent(agent)
      this.launchWorkflow.scheduleLeadReconciliation(agent)
      this.studioSnapshots.invalidate()
    })
    stopDisposed = this.ctx.on('agent/disposed', ({ agent }) => {
      this.runWorkflow.forgetAgent(agent)
      this.capabilities.remove(agent)
      this.studioSnapshots.invalidate()
    })
    stopSessionStart = this.ctx.on('agent/session-start', ({ agent }) => {
      this.launchWorkflow.scheduleLeadReconciliation(agent)
      this.studioSnapshots.invalidate()
    })
    stopSessionEvent = this.ctx.on('session/event', (session, event) => {
      this.runWorkflow.observeApprovalCorrelation(session.id, event)
      if (event.type === 'team/member') {
        const lead = this.ctx.agents.get(session.id)
        if (lead !== undefined) this.launchWorkflow.scheduleLeadReconciliation(lead)
      }
      if (event.type === 'turn/start' || event.type === 'turn/end' || event.type === 'assistant/message'
        || event.type === 'team/member' || event.type === 'team/message/delivered'
        || String(event.type) === 'approval/asked' || String(event.type) === 'approval/decided') {
        this.runWorkflow.scheduleRunRepair(session.id)
        this.studioSnapshots.invalidate()
      }
    })
    stopDomainChanged = this.ctx.on('domain/changed', (change: DomainChanged) => {
      if (change.domain === 'agent_team_ultra_v1') this.studioSnapshots.invalidate()
    })
    this.host.restoreRuntimeGeneration()
    await this.evaluationWorkflow.repairInterrupted()
    this.host.openAdmission()
    for (const agent of this.ctx.agents.list()) this.launchWorkflow.installBoundAgent(agent)
    await this.launchWorkflow.reconcileAvailableLeads()
    await this.runWorkflow.repairAvailableTeamRuns()
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
    await this.launchWorkflow.reconcileTeam(agent)
    await this.runWorkflow.repairTeamRuns(agent)
    return this.studioView(agent)
  }

  /** Follow complete replaceable snapshots across one Remote carrier generation. */
  @Remote({ mode: 'stream' })
  async *watch(agent: Agent, signal: AbortSignal): AsyncIterable<DigitalEmployeeStudioFrame> {
    signal.throwIfAborted()
    await this.launchWorkflow.reconcileTeam(agent)
    await this.runWorkflow.repairTeamRuns(agent)
    yield* this.studioSnapshots.follow(agent, signal)
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
    return this.studioSnapshots.view(caller)
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
    return this.runWorkflow.runEvidence(caller, request, signal)
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
    return this.launchWorkflow.spawnProfile(caller, request, callerSignal)
  }

  /** Install one immutable Profile layer into exactly the supplied Agent scope. */
  installProfileCapabilities(caller: Agent, agent: Agent, source: DigitalEmployeeProfile): () => void {
    return this.capabilities.install(caller, agent, source)
  }
}

export default DigitalEmployeeService
