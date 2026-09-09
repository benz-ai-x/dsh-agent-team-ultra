import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { LaunchWorkflow } from './launch-workflow.ts'
import { StudioProjection } from './studio-projection.ts'
import { Config, resolveConfig } from './configuration.ts'
import { DigitalEmployeeHostContext } from './host-context.ts'
import { ProfileLifecycle } from './profile-lifecycle.ts'
import { ProfileCapabilityInstaller } from './profile-capabilities.ts'
import { openDigitalEmployeeStorage } from './storage.ts'
import type {
  DigitalEmployeeStudioView, GetDigitalEmployeeProfileRevisionRequest, GetDigitalEmployeeProfileRevisionResult,
  SaveDigitalEmployeeProfileRequest, SaveDigitalEmployeeProfileResult,
  ActivateDigitalEmployeeProfileRequest, RollbackDigitalEmployeeProfileRequest,
  ArchiveDigitalEmployeeProfileRequest, RestoreDigitalEmployeeProfileRequest,
  MutateDigitalEmployeeProfileHeadResult, SpawnDigitalEmployeeRequest, SpawnDigitalEmployeeResult,
} from './types.ts'

export { Config } from './configuration.ts'
export { snapshotProfile } from './profile-snapshot.ts'
export type * from './types.ts'
export { digitalEmployeeDomainSpec, digitalEmployeeBindingSchema } from './storage.ts'
export { digitalEmployeeProfileDraftSchema, digitalEmployeeProfileSchema, launchRequestIdSchema,
  profileHookSchema, profileTextBlockSchema, profileToolPolicySchema } from './spec.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { digitalEmployees: DigitalEmployeeService }
}

/** Ultra B0: Profile catalog and official DSH teammate bindings, scoped to one Host lifetime. */
export class DigitalEmployeeService extends TypertRemoteService {
  static inject = ['agents', 'agentTeams', 'sessionPersistence', 'storageDomain', 'subagents', 'systemPrompt', 'tools', 'ultraBaselineData']
  static Config = Config
  private readonly host: DigitalEmployeeHostContext
  private readonly profiles: ProfileLifecycle
  private readonly capabilities: ProfileCapabilityInstaller
  private readonly launchWorkflow: LaunchWorkflow
  private readonly projection: StudioProjection

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'digitalEmployees')
    this.host = new DigitalEmployeeHostContext(ctx, resolveConfig(config))
    this.profiles = new ProfileLifecycle(this.host)
    this.capabilities = new ProfileCapabilityInstaller(this.host)
    this.launchWorkflow = new LaunchWorkflow(this.host, this.capabilities)
    this.projection = new StudioProjection(this.host, this.profiles)
  }

  protected async [Service.init](): Promise<void> {
    this.host.attachStorage(await openDigitalEmployeeStorage(this.ctx.storageDomain, this.ctx.ultraBaselineData))
    const stops: Array<() => void> = []
    this.ctx.effect(() => async () => {
      this.host.closeAdmission()
      const failures: unknown[] = []
      for (const stop of stops.reverse()) {
        try { stop() } catch (error) { failures.push(error) }
      }
      await this.launchWorkflow.whenSettled()
      try {
        await this.capabilities.drainBoundAgents()
        this.capabilities.disposeAll()
      } catch (error) { failures.push(error) }
      await this.host.whenWritesSettled()
      try { await this.host.closeStorage() } catch (error) { failures.push(error) }
      if (failures.length > 0) throw new AggregateError(failures, 'Ultra B0 disposal failed')
    }, 'agent-team-ultra.b0')
    stops.push(this.ctx.on('agent/created', ({ agent }) => {
      this.launchWorkflow.installBoundAgent(agent)
      this.launchWorkflow.scheduleLeadReconciliation(agent)
    }))
    stops.push(this.ctx.on('agent/disposed', ({ agent }) => this.capabilities.remove(agent)))
    stops.push(this.ctx.on('agent/session-start', ({ agent }) => this.launchWorkflow.scheduleLeadReconciliation(agent)))
    this.host.openAdmission()
    for (const agent of this.ctx.agents.list()) this.launchWorkflow.installBoundAgent(agent)
    for (const agent of this.ctx.agents.list()) await this.launchWorkflow.reconcileTeam(agent)
  }

  @Remote('view')
  async remoteView(agent: Agent): Promise<DigitalEmployeeStudioView> {
    await this.launchWorkflow.reconcileTeam(agent)
    return this.studioView(agent)
  }

  studioView(caller: Agent): DigitalEmployeeStudioView { return this.projection.view(caller) }

  @Remote('revision')
  remoteRevision(agent: Agent, request: GetDigitalEmployeeProfileRevisionRequest): Promise<GetDigitalEmployeeProfileRevisionResult> {
    return this.profileRevision(agent, request)
  }

  profileRevision(caller: Agent, request: GetDigitalEmployeeProfileRevisionRequest): Promise<GetDigitalEmployeeProfileRevisionResult> {
    return this.profiles.profileRevision(caller, request)
  }

  @Remote('save')
  remoteSave(agent: Agent, request: SaveDigitalEmployeeProfileRequest): Promise<SaveDigitalEmployeeProfileResult> {
    return this.saveProfile(agent, request)
  }

  saveProfile(caller: Agent, request: SaveDigitalEmployeeProfileRequest): Promise<SaveDigitalEmployeeProfileResult> {
    return this.profiles.saveProfile(caller, request)
  }

  @Remote('activate')
  remoteActivate(agent: Agent, request: ActivateDigitalEmployeeProfileRequest): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.activateProfile(agent, request)
  }

  activateProfile(caller: Agent, request: ActivateDigitalEmployeeProfileRequest): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.profiles.activateProfile(caller, request)
  }

  @Remote('rollback')
  remoteRollback(agent: Agent, request: RollbackDigitalEmployeeProfileRequest): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.rollbackProfile(agent, request)
  }

  rollbackProfile(caller: Agent, request: RollbackDigitalEmployeeProfileRequest): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.profiles.rollbackProfile(caller, request)
  }

  @Remote('archive')
  remoteArchive(agent: Agent, request: ArchiveDigitalEmployeeProfileRequest): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.archiveProfile(agent, request)
  }

  archiveProfile(caller: Agent, request: ArchiveDigitalEmployeeProfileRequest): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.profiles.archiveProfile(caller, request)
  }

  @Remote('restore')
  remoteRestore(agent: Agent, request: RestoreDigitalEmployeeProfileRequest): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.restoreProfile(agent, request)
  }

  restoreProfile(caller: Agent, request: RestoreDigitalEmployeeProfileRequest): Promise<MutateDigitalEmployeeProfileHeadResult> {
    return this.profiles.restoreProfile(caller, request)
  }

  @Remote('spawn')
  remoteSpawn(agent: Agent, request: SpawnDigitalEmployeeRequest, signal: AbortSignal): Promise<SpawnDigitalEmployeeResult> {
    return this.spawnProfile(agent, request, signal)
  }

  spawnProfile(caller: Agent, request: SpawnDigitalEmployeeRequest, signal: AbortSignal): Promise<SpawnDigitalEmployeeResult> {
    return this.launchWorkflow.spawnProfile(caller, request, signal)
  }
}

export default DigitalEmployeeService
