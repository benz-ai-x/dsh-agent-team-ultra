/** Host-only runtime topology, capability validation, and external-provider registration. */

import type { Context } from '@deepseek-ai/cordis'
import type {
  TeammateRuntimeProvider,
  TeammateRuntimeMetadata,
  TeammateRuntimeProfileSnapshot,
  TeammateRuntimeRegistration,
} from '@deepseek-ai/dsh-experimental-agent-team'
import type LlmRuntime from '@deepseek-ai/dsh-llm'
import type { LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm'
import type SubagentRuntime from '@deepseek-ai/dsh-subagent'
import type {
  DigitalEmployeeContextMode,
  DshModelRuntimeTarget,
  DigitalEmployeeDshModelBackend,
  DigitalEmployeeProfileCapability,
  DigitalEmployeeProfileDraft,
  DigitalEmployeeRequiredCapabilities,
  DigitalEmployeeRuntimeAvailability,
  DigitalEmployeeRuntimeBackend,
  DigitalEmployeeRuntimeCapability,
  DigitalEmployeeRuntimeCatalog,
  DigitalEmployeeRuntimeTarget,
} from './types.ts'

const ALL_PROFILE_CAPABILITIES = Object.freeze([
  'persona',
  'mission',
  'context',
  'memory',
  'tool-policy',
  'hooks',
] as const satisfies readonly DigitalEmployeeProfileCapability[])
const ONE_SHOT_DIAGNOSTIC = 'Installed provider supports one-shot delegation only; no durable employee runtime is registered.'
const MISSING_DSH_DIAGNOSTIC = 'This historical DSH model route is not currently available.'
const INVALID_DSH_DIAGNOSTIC = 'The registered DSH adapter could not resolve this advertised model route.'
const MISSING_EXTERNAL_DIAGNOSTIC = 'This historical durable local-agent provider is not currently available.'
const LEGACY_DIAGNOSTIC = 'Legacy inherited Lead routing is migration-only and cannot be selected or activated.'

/** Safe metadata a durable external provider contributes to the Runtime Backend catalog. */
export interface DigitalEmployeeExternalRuntimeProvider extends TeammateRuntimeProvider {
  readonly contextModes: readonly DigitalEmployeeContextMode[]
  readonly profileCapabilities: readonly DigitalEmployeeProfileCapability[]
  readonly runtimeCapabilities: readonly DigitalEmployeeRuntimeCapability[]
}

/** Effect-owned registration that can atomically replace one provider generation. */
export interface DigitalEmployeeExternalRuntimeRegistration {
  (): Promise<void>
  replace(provider: DigitalEmployeeExternalRuntimeProvider): Promise<void>
}

/** Stable validation result translated to a public domain failure by the owning service. */
export interface RuntimeTargetProblem {
  readonly code: 'runtime-target-unavailable' | 'runtime-route-invalid' | 'runtime-capability-mismatch'
  readonly message: string
}

interface RegisteredExternalRuntime {
  readonly metadata: ExternalRuntimeMetadata
  readonly registration: TeammateRuntimeRegistration
}

type ExternalRuntimeMetadata = TeammateRuntimeMetadata

interface ComposedRuntimeCatalog {
  readonly backends: readonly DigitalEmployeeRuntimeBackend[]
  readonly invalidDshRoutes: ReadonlySet<string>
}

/** Stable routing identity independent from mutable presentation labels. */
export function runtimeTargetRoutingId(target: DigitalEmployeeRuntimeTarget): string {
  switch (target.kind) {
    case 'legacy-inherit-lead': return 'legacy-inherit-lead'
    case 'dsh-model': return `dsh-model/${encodeURIComponent(target.provider)}/${encodeURIComponent(target.model)}`
    case 'external-agent': return `external-agent/${encodeURIComponent(target.provider)}`
  }
}

/** Derive the exact Profile-policy demand captured by an immutable Revision. */
export function requiredCapabilitiesForProfile(
  profile: DigitalEmployeeProfileDraft,
): DigitalEmployeeRequiredCapabilities {
  const capabilities: DigitalEmployeeProfileCapability[] = ['persona', 'mission']
  if (profile.context.some(block => block.enabled)) capabilities.push('context')
  if (profile.memory.some(block => block.enabled)) capabilities.push('memory')
  if (profile.toolPolicy.mode !== 'inherit') capabilities.push('tool-policy')
  if (profile.hooks.some(hook => hook.enabled)) capabilities.push('hooks')
  return Object.freeze({
    contextMode: profile.contextMode,
    profileCapabilities: Object.freeze(capabilities),
  })
}

/** Derive operational guarantees required only by an external native runtime. */
export function requiredRuntimeCapabilitiesForProfile(
  profile: DigitalEmployeeProfileDraft,
): readonly DigitalEmployeeRuntimeCapability[] {
  return Object.freeze(profile.hooks.some(hook => hook.enabled && hook.effect === 'ask')
    ? ['exact-call-approval']
    : [])
}

/**
 * Translate one immutable Ultra Profile into the allowlisted external-provider policy seam.
 * @param profile - Immutable Profile content selected for one launch.
 * @returns a deeply detached snapshot containing only enforceable provider policy.
 */
export function externalRuntimeProfileSnapshot(
  profile: DigitalEmployeeProfileDraft,
): TeammateRuntimeProfileSnapshot {
  const textBlocks = (blocks: DigitalEmployeeProfileDraft['context']) => Object.freeze(blocks
    .filter(block => block.enabled)
    .map(block => Object.freeze({ id: block.id, title: block.title, content: block.content })))
  return Object.freeze({
    persona: profile.persona,
    mission: profile.mission,
    context: textBlocks(profile.context),
    memory: textBlocks(profile.memory),
    toolPolicy: Object.freeze({
      mode: profile.toolPolicy.mode,
      names: Object.freeze([...profile.toolPolicy.names]),
    }),
    hooks: Object.freeze(profile.hooks
      .filter(hook => hook.enabled)
      .map(hook => Object.freeze({
        id: hook.id,
        point: hook.point,
        effect: hook.effect,
        ...(hook.matcher === undefined ? {} : { matcher: hook.matcher }),
        text: hook.text,
      }))),
  })
}

function snapshotRequirements(
  required: DigitalEmployeeRequiredCapabilities,
): DigitalEmployeeRequiredCapabilities {
  return Object.freeze({
    contextMode: required.contextMode,
    profileCapabilities: Object.freeze([...required.profileCapabilities]),
  })
}

function snapshotReasoning(
  reasoning: LlmResolvedModelInfo['reasoning'],
): DigitalEmployeeDshModelBackend['reasoning'] {
  if (reasoning === undefined) return undefined
  const efforts = reasoning.efforts.map(effort => Object.freeze({
    id: String(effort.id),
    name: effort.name,
    ...(effort.description === undefined ? {} : { description: effort.description }),
  }))
  return Object.freeze({
    efforts: Object.freeze(efforts),
    ...(reasoning.defaultEffort === undefined ? {} : { defaultEffort: String(reasoning.defaultEffort) }),
  })
}

function freezeBackend<T extends DigitalEmployeeRuntimeBackend>(backend: T): T {
  return Object.freeze({
    ...backend,
    contextModes: Object.freeze([...backend.contextModes]),
    profileCapabilities: Object.freeze([...backend.profileCapabilities]),
    runtimeCapabilities: Object.freeze([...backend.runtimeCapabilities]),
  }) as unknown as T
}

function externalBackend(metadata: ExternalRuntimeMetadata): DigitalEmployeeRuntimeBackend {
  return freezeBackend({
    routingId: runtimeTargetRoutingId({ kind: 'external-agent', provider: metadata.id }),
    family: 'external-agent',
    availability: 'available',
    provider: metadata.id,
    displayName: metadata.displayName,
    contextModes: metadata.contextModes,
    profileCapabilities: metadata.profileCapabilities,
    runtimeCapabilities: metadata.runtimeCapabilities,
  })
}

function backendOrder(left: DigitalEmployeeRuntimeBackend, right: DigitalEmployeeRuntimeBackend): number {
  const familyRank = (family: DigitalEmployeeRuntimeBackend['family']): number => (
    family === 'dsh-model' ? 0 : family === 'external-agent' ? 1 : 2
  )
  return familyRank(left.family) - familyRank(right.family)
    || left.displayName.localeCompare(right.displayName)
    || left.routingId.localeCompare(right.routingId)
}

/**
 * Deep Host module: one topology read model fronts both live registries while
 * keeping provider implementations and adapter state behind the Host boundary.
 */
export class RuntimeBackendRegistry {
  private readonly external = new Map<string, RegisteredExternalRuntime>()
  private liveBackends = Object.freeze([]) as readonly DigitalEmployeeRuntimeBackend[]
  private invalidDshRoutes = new Set<string>() as ReadonlySet<string>
  private generation = 0
  private refreshRequest = 0
  private refreshTail: Promise<void> = Promise.resolve()
  private initialized = false
  private disposed = false

  constructor(
    private readonly ctx: Context,
    private readonly llm: LlmRuntime,
    private readonly subagents: SubagentRuntime,
    private readonly onGeneration?: () => void,
  ) {}

  /** Subscribe before the first complete read so no registry edge is lost. */
  async initialize(): Promise<void> {
    if (this.initialized) return await this.whenSettled()
    this.initialized = true
    this.ctx.on('llm/adapters-updated', () => { this.scheduleRefresh() })
    this.ctx.on('subagent/provider-added', () => { this.scheduleRefresh() })
    this.ctx.on('subagent/provider-removed', () => { this.scheduleRefresh() })
    await this.scheduleRefresh(true)
    await this.whenSettled()
  }

  /** Stop future publication, release provider references, and await every admitted refresh. */
  async dispose(): Promise<void> {
    if (!this.disposed) {
      this.disposed = true
      this.refreshRequest += 1
      this.external.clear()
      this.liveBackends = Object.freeze([])
      this.invalidDshRoutes = new Set()
    }
    await this.whenSettled()
  }

  /** Wait through refreshes that were superseded while the caller was waiting. */
  async whenSettled(): Promise<void> {
    let observed: Promise<void>
    do {
      observed = this.refreshTail
      await observed
    } while (observed !== this.refreshTail)
  }

  /** Current complete topology generation captured into new Bindings. */
  get capabilityGeneration(): number {
    return this.generation
  }

  /** Classify current executability without changing durable provisioning state. */
  availability(
    profile: DigitalEmployeeProfileDraft,
    target: DigitalEmployeeRuntimeTarget,
    required: DigitalEmployeeRequiredCapabilities,
  ): DigitalEmployeeRuntimeAvailability {
    const problem = this.validate(profile, target, required, 'launch')
    if (problem === undefined) return 'available'
    return problem.code === 'runtime-capability-mismatch' ? 'capability-mismatch' : 'unavailable'
  }

  /** Register one provider object while exposing only its detached allowlisted metadata. */
  registerExternalRuntimeProvider(
    owner: Context,
    provider: DigitalEmployeeExternalRuntimeProvider,
  ): DigitalEmployeeExternalRuntimeRegistration {
    if (this.disposed) throw new Error('Digital Employee runtime registry is disposed')
    if (this.external.has(provider.id)) {
      throw new Error(`external runtime provider "${provider.id}" is already registered`)
    }
    const agentTeams = owner.get('agentTeams')
    if (agentTeams === undefined) throw new Error('Agent Team service is unavailable')
    const teammateRegistration: TeammateRuntimeRegistration = agentTeams.registerTeammateRuntimeProvider(provider)
    let current = teammateRegistration.metadata()
    const stopAvailability = teammateRegistration.onAvailabilityChanged(() => { this.scheduleRefresh() })
    let record: RegisteredExternalRuntime | undefined
    let released = false
    let transition = Promise.resolve()
    let disposeCatalog: () => Promise<void>
    try {
      disposeCatalog = owner.effect(function* (this: RuntimeBackendRegistry) {
        record = Object.freeze({ metadata: current, registration: teammateRegistration })
        this.external.set(current.id, record)
        this.scheduleRefresh()
        yield () => {
          stopAvailability()
          released = true
          if (record !== undefined && this.external.get(current.id) === record) {
            this.external.delete(current.id)
            this.scheduleRefresh()
          }
          record = undefined
        }
      }.bind(this), 'digitalEmployees.registerExternalRuntimeProvider()')
    } catch (error: unknown) {
      stopAvailability()
      void teammateRegistration().catch((cleanupError: unknown) => {
        this.ctx.logger.warn('agent-team-ultra: failed to roll back teammate runtime registration')
        this.ctx.logger.warn(cleanupError)
      })
      throw error
    }
    const handle = (async (): Promise<void> => {
      stopAvailability()
      const results = await Promise.allSettled([disposeCatalog(), teammateRegistration()])
      const failures = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map(result => result.reason)
      if (failures.length > 0) throw new AggregateError(failures, 'external runtime registration disposal failed')
    }) as DigitalEmployeeExternalRuntimeRegistration
    handle.replace = async (replacement): Promise<void> => {
      if (replacement.id !== current.id) {
        throw new Error('an external runtime replacement must preserve its stable provider id')
      }
      const operation = transition.then(async () => {
        if (released || this.disposed || record === undefined) {
          throw new Error('a disposed external runtime registration cannot be replaced')
        }
        const prior = record
        if (this.external.get(current.id) === prior) {
          this.external.delete(current.id)
          this.scheduleRefresh()
        }
        try {
          await teammateRegistration.replace(replacement)
        } catch (error: unknown) {
          if (record === prior) record = undefined
          throw error
        }
        if (released || this.disposed || record === undefined) {
          throw new Error('external runtime registration was disposed during replacement')
        }
        const metadata = teammateRegistration.metadata()
        const next = Object.freeze({ metadata, registration: teammateRegistration })
        current = metadata
        record = next
        this.external.set(metadata.id, next)
        await this.scheduleRefresh()
      })
      transition = operation.then(() => undefined, () => undefined)
      await operation
    }
    return handle
  }

  /** Compose historical unavailable rows into the current detached live snapshot. */
  snapshot(historicalTargets: Iterable<DigitalEmployeeRuntimeTarget>): DigitalEmployeeRuntimeCatalog {
    const rows = new Map(this.liveBackends
      .filter(backend => backend.family !== 'external-agent'
        || (backend.availability === 'unsupported' && !this.external.has(backend.provider)))
      .map(backend => [backend.routingId, backend]))
    for (const external of this.external.values()) {
      if (!external.registration.available()) continue
      const backend = externalBackend(external.metadata)
      rows.set(backend.routingId, backend)
    }
    for (const target of historicalTargets) {
      const routingId = runtimeTargetRoutingId(target)
      if (rows.has(routingId)) continue
      if (target.kind === 'dsh-model') {
        rows.set(routingId, freezeBackend({
          routingId,
          family: 'dsh-model',
          availability: 'unavailable',
          provider: target.provider,
          providerDisplayName: target.provider,
          model: target.model,
          displayName: target.model,
          contextModes: [],
          profileCapabilities: [],
          runtimeCapabilities: [],
          diagnostic: MISSING_DSH_DIAGNOSTIC,
        }))
      } else if (target.kind === 'external-agent') {
        rows.set(routingId, freezeBackend({
          routingId,
          family: 'external-agent',
          availability: 'unavailable',
          provider: target.provider,
          displayName: target.provider,
          contextModes: [],
          profileCapabilities: [],
          runtimeCapabilities: [],
          diagnostic: MISSING_EXTERNAL_DIAGNOSTIC,
        }))
      } else {
        rows.set(routingId, freezeBackend({
          routingId: 'legacy-inherit-lead',
          family: 'legacy-inherit-lead',
          availability: 'unsupported',
          displayName: 'Legacy inherited Lead runtime',
          contextModes: [],
          profileCapabilities: [],
          runtimeCapabilities: [],
          diagnostic: LEGACY_DIAGNOSTIC,
        }))
      }
    }
    return Object.freeze({
      generation: this.generation,
      backends: Object.freeze([...rows.values()].sort(backendOrder)),
    })
  }

  /** Validate one immutable selection without ever resolving a fallback route. */
  validate(
    profile: DigitalEmployeeProfileDraft,
    target: DigitalEmployeeRuntimeTarget,
    required: DigitalEmployeeRequiredCapabilities,
    _operation: 'save' | 'activate' | 'launch' | 'evaluate',
  ): RuntimeTargetProblem | undefined {
    if (target.kind === 'legacy-inherit-lead') {
      return Object.freeze({
        code: 'runtime-route-invalid',
        message: 'legacy inherited Lead routing is migration-only and cannot be selected or activated',
      })
    }
    const routingId = runtimeTargetRoutingId(target)
    let backend = this.liveBackends.find(candidate => candidate.routingId === routingId)
    if (target.kind === 'dsh-model') {
      if (backend === undefined) {
        return Object.freeze({
          code: 'runtime-target-unavailable',
          message: `DSH model route "${target.provider}/${target.model}" is not currently available`,
        })
      }
      if (this.invalidDshRoutes.has(routingId)) {
        return Object.freeze({
          code: 'runtime-route-invalid',
          message: `DSH model route "${target.provider}/${target.model}" could not be resolved by its adapter`,
        })
      }
      if (backend.family !== 'dsh-model' || backend.availability !== 'available') {
        return Object.freeze({
          code: 'runtime-route-invalid',
          message: `runtime route "${routingId}" does not identify an available DSH model`,
        })
      }
      if (target.reasoningEffort !== undefined
        && !backend.reasoning?.efforts.some(effort => effort.id === target.reasoningEffort)) {
        return Object.freeze({
          code: 'runtime-route-invalid',
          message: `reasoning effort "${target.reasoningEffort}" is not supported by "${target.provider}/${target.model}"`,
        })
      }
      const continuation = this.subagents.getProvider(profile.continuationProvider)
      if (continuation === undefined) {
        return Object.freeze({
          code: 'runtime-target-unavailable',
          message: `continuation provider "${profile.continuationProvider}" is not currently available`,
        })
      }
      if (continuation.prepareContinuable === undefined) {
        return Object.freeze({
          code: 'runtime-capability-mismatch',
          message: `provider "${profile.continuationProvider}" cannot create durable continuable employees`,
        })
      }
      const inherits = required.contextMode === 'fork'
      if (continuation.inheritsParentContext !== inherits) {
        return Object.freeze({
          code: 'runtime-capability-mismatch',
          message: `continuation provider "${profile.continuationProvider}" does not support ${required.contextMode} context semantics`,
        })
      }
    } else {
      const external = this.external.get(target.provider)
      if (external === undefined || !external.registration.available()) {
        const oneShot = this.subagents.getProvider(target.provider)
        if (oneShot !== undefined && oneShot.prepareContinuable === undefined) {
          return Object.freeze({
            code: 'runtime-capability-mismatch',
            message: `installed provider "${target.provider}" is one-shot-only and is not a durable employee runtime`,
          })
        }
        return Object.freeze({
          code: 'runtime-target-unavailable',
          message: `external runtime provider "${target.provider}" is not currently available`,
        })
      }
      backend = externalBackend(external.metadata)
      if (backend.family !== 'external-agent' || backend.availability !== 'available') {
        return Object.freeze({
          code: backend.availability === 'unsupported'
            ? 'runtime-capability-mismatch'
            : 'runtime-target-unavailable',
          message: backend.diagnostic ?? `external runtime provider "${target.provider}" is unavailable`,
        })
      }
    }
    if (!backend.contextModes.includes(required.contextMode)) {
      return Object.freeze({
        code: 'runtime-capability-mismatch',
        message: `runtime "${routingId}" cannot enforce ${required.contextMode} initial-context semantics`,
      })
    }
    const missing = required.profileCapabilities.filter(capability =>
      !backend.profileCapabilities.includes(capability))
    if (missing.length > 0) {
      return Object.freeze({
        code: 'runtime-capability-mismatch',
        message: `runtime "${routingId}" cannot enforce required Profile capabilities: ${missing.join(', ')}`,
      })
    }
    if (target.kind === 'external-agent') {
      const missingRuntime = requiredRuntimeCapabilitiesForProfile(profile).filter(capability =>
        !backend.runtimeCapabilities.includes(capability))
      if (missingRuntime.length > 0) {
        return Object.freeze({
          code: 'runtime-capability-mismatch',
          message: `runtime "${routingId}" cannot enforce required Runtime capabilities: ${missingRuntime.join(', ')}`,
        })
      }
    }
    return undefined
  }

  /** Re-resolve one selected DSH route at launch time and reject adapter aliases or disappearance. */
  async verifyDshModelRoute(target: DshModelRuntimeTarget): Promise<RuntimeTargetProblem | undefined> {
    let resolved: LlmResolvedModelInfo
    try {
      resolved = await this.llm.resolveModelInfo(target.provider, target.model)
    } catch {
      return Object.freeze({
        code: 'runtime-route-invalid',
        message: `DSH model route "${target.provider}/${target.model}" could not be resolved by its adapter`,
      })
    }
    if (resolved.provider !== target.provider || resolved.id !== target.model) {
      return Object.freeze({
        code: 'runtime-route-invalid',
        message: `DSH model route "${target.provider}/${target.model}" resolved to a different provider or model`,
      })
    }
    if (target.reasoningEffort !== undefined
      && !resolved.reasoning?.efforts.some(effort => effort.id === target.reasoningEffort)) {
      return Object.freeze({
        code: 'runtime-route-invalid',
        message: `reasoning effort "${target.reasoningEffort}" is not supported by "${target.provider}/${target.model}"`,
      })
    }
    return undefined
  }

  private scheduleRefresh(initial = false): Promise<void> {
    if (this.disposed) return Promise.resolve()
    const request = ++this.refreshRequest
    const operation = this.compose().then((catalog) => {
      if (this.disposed || request !== this.refreshRequest) return
      this.liveBackends = catalog.backends
      this.invalidDshRoutes = catalog.invalidDshRoutes
      this.generation += 1
      try {
        this.onGeneration?.()
      } catch (error: unknown) {
        this.ctx.logger.warn('agent-team-ultra: runtime generation observer failed')
        this.ctx.logger.warn(error)
      }
    }).catch((error: unknown) => {
      if (initial) throw error
      this.ctx.logger.warn('agent-team-ultra: runtime catalog refresh failed; retaining the prior generation')
      this.ctx.logger.warn(error)
    })
    this.refreshTail = operation
    return operation
  }

  private async compose(): Promise<ComposedRuntimeCatalog> {
    const backends: DigitalEmployeeRuntimeBackend[] = []
    const invalidDshRoutes = new Set<string>()
    const dshContextModes: DigitalEmployeeContextMode[] = []
    for (const name of this.subagents.list()) {
      const provider = this.subagents.getProvider(name)
      if (provider?.prepareContinuable === undefined) continue
      const mode = provider.inheritsParentContext ? 'fork' : 'fresh'
      if (!dshContextModes.includes(mode)) dshContextModes.push(mode)
    }
    dshContextModes.sort((left, right) => left === right ? 0 : left === 'fresh' ? -1 : 1)
    const providers = this.llm.listProviders()
    for (const provider of providers) {
      let models
      try {
        models = await this.llm.listModels(provider.id)
      } catch {
        continue
      }
      for (const model of models) {
        const routingId = runtimeTargetRoutingId({
          kind: 'dsh-model',
          provider: provider.id,
          model: model.id,
        })
        let resolved: LlmResolvedModelInfo | undefined
        try {
          const candidate = await this.llm.resolveModelInfo(provider.id, model.id)
          if (candidate.provider === provider.id && candidate.id === model.id) resolved = candidate
          else invalidDshRoutes.add(routingId)
        } catch {
          invalidDshRoutes.add(routingId)
        }
        const reasoning = snapshotReasoning(resolved?.reasoning)
        backends.push(freezeBackend({
          routingId,
          family: 'dsh-model',
          availability: resolved === undefined ? 'unavailable' : 'available',
          provider: provider.id,
          providerDisplayName: provider.name,
          model: model.id,
          displayName: model.name,
          contextModes: resolved === undefined ? [] : dshContextModes,
          profileCapabilities: resolved === undefined ? [] : ALL_PROFILE_CAPABILITIES,
          runtimeCapabilities: resolved === undefined ? [] : ['exact-call-approval'],
          ...(reasoning === undefined ? {} : { reasoning }),
          ...(resolved === undefined ? { diagnostic: INVALID_DSH_DIAGNOSTIC } : {}),
        }))
      }
    }

    for (const { metadata, registration } of this.external.values()) {
      if (!registration.available()) continue
      backends.push(externalBackend(metadata))
    }

    for (const name of this.subagents.list()) {
      if (this.external.has(name)) continue
      const provider = this.subagents.getProvider(name)
      if (provider === undefined || provider.prepareContinuable !== undefined) continue
      backends.push(freezeBackend({
        routingId: runtimeTargetRoutingId({ kind: 'external-agent', provider: name }),
        family: 'external-agent',
        availability: 'unsupported',
        provider: name,
        displayName: name === 'codex' ? 'Codex' : name === 'claude-code' ? 'Claude Code' : name,
        contextModes: [],
        profileCapabilities: [],
        runtimeCapabilities: [],
        diagnostic: ONE_SHOT_DIAGNOSTIC,
      }))
    }

    const unique = new Map<string, DigitalEmployeeRuntimeBackend>()
    for (const backend of backends) {
      if (unique.has(backend.routingId)) {
        throw new Error(`runtime catalog composed duplicate routing id "${backend.routingId}"`)
      }
      unique.set(backend.routingId, backend)
    }
    return Object.freeze({
      backends: Object.freeze([...unique.values()].sort(backendOrder)),
      invalidDshRoutes,
    })
  }
}

/** Defensive copier used when Revision data leaves storage ownership. */
export function snapshotRequiredCapabilities(
  required: DigitalEmployeeRequiredCapabilities,
): DigitalEmployeeRequiredCapabilities {
  return snapshotRequirements(required)
}
