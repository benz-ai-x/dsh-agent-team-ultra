/** Host-only runtime topology, capability validation, and external-provider registration. */

import type { Context } from '@deepseek-ai/cordis'
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
  DigitalEmployeeRuntimeBackend,
  DigitalEmployeeRuntimeCatalog,
  DigitalEmployeeRuntimeTarget,
} from './types.ts'

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/u
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
export interface DigitalEmployeeExternalRuntimeProvider {
  readonly id: string
  readonly displayName: string
  readonly contextModes: readonly DigitalEmployeeContextMode[]
  readonly profileCapabilities: readonly DigitalEmployeeProfileCapability[]
}

/** Effect-owned registration that can atomically replace one provider generation. */
export interface DigitalEmployeeExternalRuntimeRegistration {
  (): void
  replace(provider: DigitalEmployeeExternalRuntimeProvider): void
}

/** Stable validation result translated to a public domain failure by the owning service. */
export interface RuntimeTargetProblem {
  readonly code: 'runtime-target-unavailable' | 'runtime-route-invalid' | 'runtime-capability-mismatch'
  readonly message: string
}

interface RegisteredExternalRuntime {
  readonly provider: DigitalEmployeeExternalRuntimeProvider
  readonly metadata: DigitalEmployeeExternalRuntimeProvider
}

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

function snapshotRequirements(
  required: DigitalEmployeeRequiredCapabilities,
): DigitalEmployeeRequiredCapabilities {
  return Object.freeze({
    contextMode: required.contextMode,
    profileCapabilities: Object.freeze([...required.profileCapabilities]),
  })
}

function normalizeExternalMetadata(
  provider: DigitalEmployeeExternalRuntimeProvider,
): DigitalEmployeeExternalRuntimeProvider {
  if (typeof provider.id !== 'string' || provider.id.length > 200 || !IDENTIFIER.test(provider.id)) {
    throw new TypeError('external runtime provider id must be a non-empty stable identifier')
  }
  const displayName = typeof provider.displayName === 'string' ? provider.displayName.trim() : ''
  if (displayName.length === 0 || displayName.length > 120) {
    throw new TypeError(`external runtime provider "${provider.id}" needs a display name of at most 120 characters`)
  }
  const requestedContextModes = [...provider.contextModes]
  if (requestedContextModes.length === 0
    || requestedContextModes.some(mode => mode !== 'fresh' && mode !== 'fork')
    || new Set(requestedContextModes).size !== requestedContextModes.length) {
    throw new TypeError(`external runtime provider "${provider.id}" has invalid context modes`)
  }
  const contextModes = (['fresh', 'fork'] as const).filter(mode => requestedContextModes.includes(mode))
  const profileCapabilities = [...provider.profileCapabilities]
  if (profileCapabilities.some(capability => !ALL_PROFILE_CAPABILITIES.includes(capability))
    || new Set(profileCapabilities).size !== profileCapabilities.length) {
    throw new TypeError(`external runtime provider "${provider.id}" has invalid Profile capabilities`)
  }
  return Object.freeze({
    id: provider.id,
    displayName,
    contextModes: Object.freeze(contextModes),
    profileCapabilities: Object.freeze(ALL_PROFILE_CAPABILITIES.filter(capability =>
      profileCapabilities.includes(capability))),
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
  }) as unknown as T
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

  /** Stop future publication and release all same-process provider references. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.refreshRequest += 1
    this.external.clear()
    this.liveBackends = Object.freeze([])
    this.invalidDshRoutes = new Set()
  }

  /** Wait through refreshes that were superseded while the caller was waiting. */
  async whenSettled(): Promise<void> {
    let observed: Promise<void>
    do {
      observed = this.refreshTail
      await observed
    } while (observed !== this.refreshTail)
  }

  /** Register one provider object while exposing only its detached allowlisted metadata. */
  registerExternalRuntimeProvider(
    owner: Context,
    provider: DigitalEmployeeExternalRuntimeProvider,
  ): DigitalEmployeeExternalRuntimeRegistration {
    if (this.disposed) throw new Error('Digital Employee runtime registry is disposed')
    let current = normalizeExternalMetadata(provider)
    let record: RegisteredExternalRuntime | undefined
    let released = false
    const dispose = owner.effect(function* (this: RuntimeBackendRegistry) {
      if (this.external.has(current.id)) {
        throw new Error(`external runtime provider "${current.id}" is already registered`)
      }
      record = Object.freeze({ provider, metadata: current })
      this.external.set(current.id, record)
      this.scheduleRefresh()
      yield () => {
        released = true
        if (record !== undefined && this.external.get(current.id) === record) {
          this.external.delete(current.id)
          this.scheduleRefresh()
        }
        record = undefined
      }
    }.bind(this), 'digitalEmployees.registerExternalRuntimeProvider()')
    const handle = (() => { void dispose() }) as DigitalEmployeeExternalRuntimeRegistration
    handle.replace = (replacement): void => {
      if (released || this.disposed || record === undefined) {
        throw new Error('a disposed external runtime registration cannot be replaced')
      }
      const metadata = normalizeExternalMetadata(replacement)
      if (metadata.id !== current.id) {
        throw new Error('an external runtime replacement must preserve its stable provider id')
      }
      const next = Object.freeze({ provider: replacement, metadata })
      current = metadata
      record = next
      this.external.set(metadata.id, next)
      this.scheduleRefresh()
    }
    return handle
  }

  /** Current external provider object for future execution seams; never crosses Remote. */
  externalProvider(id: string): DigitalEmployeeExternalRuntimeProvider | undefined {
    return this.external.get(id)?.provider
  }

  /** Compose historical unavailable rows into the current detached live snapshot. */
  snapshot(historicalTargets: Iterable<DigitalEmployeeRuntimeTarget>): DigitalEmployeeRuntimeCatalog {
    const rows = new Map(this.liveBackends.map(backend => [backend.routingId, backend]))
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
    const backend = this.liveBackends.find(candidate => candidate.routingId === routingId)
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
      if (backend === undefined) {
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
          ...(reasoning === undefined ? {} : { reasoning }),
          ...(resolved === undefined ? { diagnostic: INVALID_DSH_DIAGNOSTIC } : {}),
        }))
      }
    }

    for (const { metadata } of this.external.values()) {
      backends.push(freezeBackend({
        routingId: runtimeTargetRoutingId({ kind: 'external-agent', provider: metadata.id }),
        family: 'external-agent',
        availability: 'available',
        provider: metadata.id,
        displayName: metadata.displayName,
        contextModes: metadata.contextModes,
        profileCapabilities: metadata.profileCapabilities,
      }))
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
