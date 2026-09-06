import { createHash } from 'node:crypto'

import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { InferValue, ToolExecution, ValueSchemaSpec } from '@deepseek-ai/dsh-tools'
import { failure } from './host-errors.ts'
import type { DigitalEmployeeHostContext } from './host-context.ts'
import { launchRequestIdSchema } from './spec.ts'
import type {
  DigitalEmployeeProfileCatalogEntry,
  DigitalEmployeeProfileRevision,
  DigitalEmployeeStudioView,
  GetDigitalEmployeeProfileRevisionRequest,
  GetDigitalEmployeeProfileRevisionResult,
  SpawnDigitalEmployeeRequest,
  SpawnDigitalEmployeeResult,
} from './types.ts'

/** Fixed names reserved for the model-facing Ultra Profile boundary. */
export const ULTRA_PROFILE_TOOL_NAMES = Object.freeze([
  'ultra_profile_list',
  'ultra_profile_detail',
  'ultra_profile_launch',
] as const)

type UltraProfileToolName = typeof ULTRA_PROFILE_TOOL_NAMES[number]
const PROFILE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

interface ConversationProfileOperations {
  view(caller: Agent): DigitalEmployeeStudioView
  revision(
    caller: Agent,
    request: GetDigitalEmployeeProfileRevisionRequest,
  ): Promise<GetDigitalEmployeeProfileRevisionResult>
  launch(
    caller: Agent,
    request: SpawnDigitalEmployeeRequest,
    signal: AbortSignal,
  ): Promise<SpawnDigitalEmployeeResult>
}

const RUNTIME_AVAILABILITY_SCHEMA = {
  type: 'string',
  enum: ['available', 'unavailable', 'capability-mismatch'],
} as const

const PROMOTION_GATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: {
      type: 'string',
      required: true,
      enum: ['not-required', 'pending', 'passed', 'invalidated'],
    },
    requiredEvalSet: { type: 'json' },
    satisfiedByEvalRunId: { type: 'string' },
    diagnostic: { type: 'string' },
  },
} as const

const ACTIVE_REVISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    revision: { type: 'integer', required: true },
    fingerprint: { type: 'string', required: true },
    runtimeTarget: { type: 'json', required: true },
    requiredCapabilities: { type: 'json', required: true },
    runtimeAvailability: { ...RUNTIME_AVAILABILITY_SCHEMA, required: true },
  },
} as const

const INSTANCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    teamId: { type: 'string', required: true },
    memberName: { type: 'string', required: true },
    memberId: { type: 'string' },
    launchRequestId: { type: 'string' },
    profileId: { type: 'string', required: true },
    profileRevision: { type: 'integer', required: true },
    runtimeTarget: { type: 'json', required: true },
    resolvedRuntimeTarget: { type: 'json' },
    nativeRuntimeHandle: { type: 'string' },
    requiredCapabilities: { type: 'json', required: true },
    provisioningPhase: {
      type: 'string',
      required: true,
      enum: ['pending', 'active', 'failed'],
    },
    runtimeAvailability: { ...RUNTIME_AVAILABILITY_SCHEMA, required: true },
    runtimePresence: {
      type: 'string',
      required: true,
      enum: ['running', 'idle', 'inactive'],
    },
    error: { type: 'string' },
  },
} as const

const FAILURE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    code: { type: 'string', required: true },
    message: { type: 'string', required: true },
    currentHead: { type: 'json' },
  },
} as const

const PROFILE_SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    profileId: { type: 'string', required: true },
    employeeName: { type: 'string', required: true },
    displayName: { type: 'string', required: true },
    description: { type: 'string', required: true },
    headRevision: { type: 'integer', required: true },
    latestRevision: { type: 'integer', required: true },
    activeRevision: { type: 'integer' },
    archived: { type: 'boolean', required: true },
    active: ACTIVE_REVISION_SCHEMA,
    latestPromotionGate: { ...PROMOTION_GATE_SCHEMA, required: true },
    instances: { type: 'array', required: true, items: INSTANCE_SCHEMA },
  },
} as const

const LIST_VALUE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    profiles: { type: 'array', required: true, items: PROFILE_SUMMARY_SCHEMA },
  },
} as const

const DETAIL_VALUE_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean', required: true, const: true },
        value: {
          type: 'object',
          required: true,
          additionalProperties: false,
          properties: {
            head: { type: 'json', required: true },
            latest: { type: 'json', required: true },
            history: { type: 'array', required: true, items: { type: 'json' } },
            historyTruncated: { type: 'boolean', required: true },
            active: {
              type: 'object',
              additionalProperties: false,
              properties: {
                revision: { type: 'json', required: true },
                runtimeAvailability: { ...RUNTIME_AVAILABILITY_SCHEMA, required: true },
              },
            },
            latestPromotionGate: { ...PROMOTION_GATE_SCHEMA, required: true },
            instances: { type: 'array', required: true, items: INSTANCE_SCHEMA },
          },
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean', required: true, const: false },
        error: { ...FAILURE_SCHEMA, required: true },
      },
    },
  ],
} as const

const LAUNCH_VALUE_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean', required: true, const: true },
        value: { ...INSTANCE_SCHEMA, required: true },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean', required: true, const: false },
        error: { ...FAILURE_SCHEMA, required: true },
      },
    },
  ],
} as const

/** Render every bounded structured result as compact model-facing JSON. */
function jsonOutput<const S extends ValueSchemaSpec>(schema: S): {
  schema: S
  render: (args: unknown, value: InferValue<S>) => [{ type: 'text'; text: string }]
} {
  return {
    schema,
    render: (_args: unknown, value: InferValue<S>) => [{ type: 'text', text: JSON.stringify(value) }],
  }
}

/** Bridge public readonly DTO types to the schema-inferred mutable JSON view; ToolRuntime validates and snapshots it. */
function declaredValue<const S extends ValueSchemaSpec>(schema: S, value: unknown): InferValue<S> {
  void schema
  return value as InferValue<S>
}

/** Reject any carrier other than the exact Agent scope that owns the definition. */
function callingAgent(exec: ToolExecution, owner: Agent, toolName: UltraProfileToolName): Agent {
  if (exec.agent !== owner) throw new Error(`${toolName} requires its exact scoped Agent`)
  return owner
}

/** Deterministically project one persisted tool-call identity onto a canonical UUIDv8. */
function launchRequestIdForToolCall(teamId: string, agentId: string, callId: ToolCallId): ReturnType<typeof launchRequestIdSchema.parse> {
  const bytes = createHash('sha256')
    .update('agent-team-ultra/conversation-launch/v1\0', 'utf8')
    .update(teamId, 'utf8')
    .update('\0', 'utf8')
    .update(agentId, 'utf8')
    .update('\0', 'utf8')
    .update(String(callId), 'utf8')
    .digest()
    .subarray(0, 16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x80
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return launchRequestIdSchema.parse([
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-'))
}

function validProfileId(profileId: string): boolean {
  return profileId.length <= 64 && PROFILE_ID_PATTERN.test(profileId)
}

/** Owns Lead-scoped Profile tools and their in-flight callbacks for one service Fiber. */
export class ConversationProfileTools {
  private readonly installed = new Map<Agent, () => void>()
  private readonly calls = new Set<Promise<unknown>>()
  private stopCreated: () => void = () => undefined
  private stopDisposed: () => void = () => undefined
  private accepting = false

  constructor(
    private readonly host: DigitalEmployeeHostContext,
    private readonly operations: ConversationProfileOperations,
  ) {}

  /** Publish the fixed tool set in every current and future exact Team Lead scope. */
  start(): void {
    if (this.accepting) throw new Error('Ultra Profile tools are already started')
    this.accepting = true
    try {
      this.stopCreated = this.host.ctx.on('agent/created', ({ agent }) => { this.maybeInstall(agent) })
      this.stopDisposed = this.host.ctx.on('agent/disposed', ({ agent }) => { this.remove(agent) })
      for (const agent of this.host.ctx.agents.list()) this.maybeInstall(agent)
      // Existing children may have been visited before their ancestor Lead's
      // definitions became visible. A second synchronous pass installs their
      // deny layer after every current Lead registration is complete.
      for (const agent of this.host.ctx.agents.list()) this.maybeInstall(agent)
    } catch (error: unknown) {
      this.stopCreated()
      this.stopDisposed()
      this.stopCreated = () => undefined
      this.stopDisposed = () => undefined
      for (const dispose of [...this.installed.values()].reverse()) dispose()
      this.installed.clear()
      this.accepting = false
      throw error
    }
  }

  /** Stop discovery, remove schemas, then wait for every admitted callback to settle. */
  async dispose(): Promise<void> {
    if (!this.accepting && this.installed.size === 0 && this.calls.size === 0) return
    this.accepting = false
    this.stopCreated()
    this.stopDisposed()
    this.stopCreated = () => undefined
    this.stopDisposed = () => undefined
    for (const dispose of [...this.installed.values()].reverse()) dispose()
    this.installed.clear()
    await Promise.allSettled([...this.calls])
  }

  private track<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.accepting) return Promise.reject(new Error('Ultra Profile tools are disposing'))
    const call = operation()
    this.calls.add(call)
    void call.finally(() => { this.calls.delete(call) }).catch(() => undefined)
    return call
  }

  private maybeInstall(agent: Agent): void {
    if (!this.accepting || this.installed.has(agent)) return
    if (!this.host.allowsConversationProfileTools(agent)) return
    const membership = this.host.ctx.agentTeams.tryMembership(agent)
    if (membership === undefined) return
    if (membership.role === 'lead' && membership.root === agent) {
      this.installed.set(agent, this.install(agent))
      // A newly resumed Lead can make ancestor-scoped definitions visible to
      // already-live teammates, so close their inherited surface immediately.
      for (const candidate of this.host.ctx.agents.list()) {
        if (candidate !== agent) this.maybeInstall(candidate)
      }
      return
    }
    if (membership.role !== 'teammate') return
    const visible = ULTRA_PROFILE_TOOL_NAMES.filter(name => this.host.ctx.tools.get(name, agent) !== undefined)
    if (visible.length !== ULTRA_PROFILE_TOOL_NAMES.length) return
    this.installed.set(agent, agent.ctx.tools.restrict({ deny: ULTRA_PROFILE_TOOL_NAMES }))
  }

  private remove(agent: Agent): void {
    this.installed.get(agent)?.()
    this.installed.delete(agent)
  }

  private install(agent: Agent): () => void {
    const collision = ULTRA_PROFILE_TOOL_NAMES.find(name => this.host.ctx.tools.get(name, agent) !== undefined)
    if (collision !== undefined) throw new Error(`Ultra Profile tool name collision: ${collision}`)
    const disposers: Array<() => unknown> = []
    const register = (dispose: () => unknown): void => { disposers.push(dispose) }
    try {
      register(agent.ctx.tools.register(defineTool({
        name: 'ultra_profile_list',
        description: 'List existing Ultra Profiles, their active Revision and capabilities, launch availability, and Profile-bound Team instances. This never creates, saves, or activates a Profile.',
        parameters: {},
        output: jsonOutput(LIST_VALUE_SCHEMA),
        isConcurrencySafe: () => true,
        execute: (_args, exec) => this.track(async () => {
          const caller = callingAgent(exec, agent, 'ultra_profile_list')
          return declaredValue(LIST_VALUE_SCHEMA, { profiles: await this.profileSummaries(caller) })
        }),
      })))
      register(agent.ctx.tools.register(defineTool({
        name: 'ultra_profile_detail',
        description: 'Inspect one existing Ultra Profile, including its latest and active immutable Revisions, Promotion Gate, selected route, required capabilities, and Profile-bound Team instances. This never changes the Profile.',
        parameters: {
          profile_id: { type: 'string', required: true, description: 'Exact lower-kebab-case Ultra Profile id.' },
        },
        output: jsonOutput(DETAIL_VALUE_SCHEMA),
        isConcurrencySafe: () => true,
        execute: (args, exec) => this.track(async () => {
          const caller = callingAgent(exec, agent, 'ultra_profile_detail')
          if (!validProfileId(args.profile_id)) {
            return declaredValue(DETAIL_VALUE_SCHEMA, {
              ok: false,
              error: failure('profile-invalid', 'profile_id must be 1–64 lower-kebab-case characters'),
            })
          }
          await this.host.runtimeBackends.whenSettled()
          const view = this.operations.view(caller)
          const entry = view.profiles.find(candidate => candidate.head.profileId === args.profile_id)
          if (entry === undefined) {
            return declaredValue(DETAIL_VALUE_SCHEMA, {
              ok: false,
              error: failure('profile-not-found', `profile "${args.profile_id}" not found`),
            })
          }
          const activeRevision = await this.activeRevision(caller, entry)
          return declaredValue(DETAIL_VALUE_SCHEMA, {
            ok: true,
            value: {
              head: entry.head,
              latest: entry.latest,
              history: [...entry.history],
              historyTruncated: entry.historyTruncated,
              ...(activeRevision === undefined ? {} : {
                active: {
                  revision: activeRevision,
                  runtimeAvailability: this.host.runtimeBackends.availability(
                    activeRevision.profile,
                    activeRevision.runtimeTarget,
                    activeRevision.requiredCapabilities,
                  ),
                },
              }),
              latestPromotionGate: entry.promotionGate,
              instances: view.instances.filter(instance => instance.profileId === entry.head.profileId),
            },
          })
        }),
      })))
      register(agent.ctx.tools.register(defineTool({
        name: 'ultra_profile_launch',
        description: 'Launch one existing Active Revision through the Digital Employee Host only after the user explicitly requests Team collaboration. The tool never creates, saves, or activates a Profile; spawn_teammate remains the separate ordinary-member path.',
        parameters: {
          profile_id: { type: 'string', required: true, description: 'Exact existing Ultra Profile id.' },
          assignment: { type: 'string', description: 'Optional work specific to this launch intent.' },
        },
        output: jsonOutput(LAUNCH_VALUE_SCHEMA),
        execute: (args, exec) => this.track(async () => {
          const caller = callingAgent(exec, agent, 'ultra_profile_launch')
          const authorityFailure = this.host.leadAuthorityFailure(caller)
          if (authorityFailure !== undefined) {
            return declaredValue(LAUNCH_VALUE_SCHEMA, { ok: false, error: authorityFailure })
          }
          if (!validProfileId(args.profile_id)) {
            return declaredValue(LAUNCH_VALUE_SCHEMA, {
              ok: false,
              error: failure('profile-invalid', 'profile_id must be 1–64 lower-kebab-case characters'),
            })
          }
          const membership = this.host.ctx.agentTeams.membership(caller)
          const launchRequestId = launchRequestIdForToolCall(
            String(membership.id),
            String(caller.id),
            exec.callId,
          )
          const result = await this.operations.launch(caller, {
            launchRequestId,
            profileId: args.profile_id,
            ...(args.assignment === undefined ? {} : { assignment: args.assignment }),
          }, exec.signal)
          return declaredValue(LAUNCH_VALUE_SCHEMA, result)
        }),
      })))
    } catch (error: unknown) {
      for (const dispose of disposers.reverse()) void dispose()
      throw error
    }
    let active = true
    return () => {
      if (!active) return
      active = false
      for (const dispose of disposers.reverse()) void dispose()
    }
  }

  private async profileSummaries(caller: Agent): Promise<Array<{
    profileId: string
    employeeName: string
    displayName: string
    description: string
    headRevision: number
    latestRevision: number
    activeRevision?: number
    archived: boolean
    active?: {
      revision: number
      fingerprint: string
      runtimeTarget: DigitalEmployeeProfileRevision['runtimeTarget']
      requiredCapabilities: DigitalEmployeeProfileRevision['requiredCapabilities']
      runtimeAvailability: 'available' | 'unavailable' | 'capability-mismatch'
    }
    latestPromotionGate: DigitalEmployeeProfileCatalogEntry['promotionGate']
    instances: DigitalEmployeeStudioView['instances']
  }>> {
    await this.host.runtimeBackends.whenSettled()
    const view = this.operations.view(caller)
    return await Promise.all(view.profiles.map(async entry => {
      const activeRevision = await this.activeRevision(caller, entry)
      const presentedProfile = activeRevision?.profile ?? entry.latest.profile
      return {
        profileId: entry.head.profileId,
        employeeName: presentedProfile.employeeName,
        displayName: presentedProfile.displayName,
        description: presentedProfile.description,
        headRevision: entry.head.headRevision,
        latestRevision: entry.head.latestRevision,
        ...(entry.head.activeRevision === undefined ? {} : { activeRevision: entry.head.activeRevision }),
        archived: entry.head.archivedAt !== undefined,
        ...(activeRevision === undefined ? {} : {
          active: {
            revision: activeRevision.revision,
            fingerprint: activeRevision.fingerprint,
            runtimeTarget: activeRevision.runtimeTarget,
            requiredCapabilities: activeRevision.requiredCapabilities,
            runtimeAvailability: this.host.runtimeBackends.availability(
              activeRevision.profile,
              activeRevision.runtimeTarget,
              activeRevision.requiredCapabilities,
            ),
          },
        }),
        latestPromotionGate: entry.promotionGate,
        instances: view.instances.filter(instance => instance.profileId === entry.head.profileId),
      }
    }))
  }

  private async activeRevision(
    caller: Agent,
    entry: DigitalEmployeeProfileCatalogEntry,
  ): Promise<DigitalEmployeeProfileRevision | undefined> {
    const revision = entry.head.activeRevision
    if (revision === undefined) return undefined
    if (revision === entry.latest.revision) return entry.latest
    const result = await this.operations.revision(caller, { profileId: entry.head.profileId, revision })
    if (!result.ok) {
      throw new Error(`active Profile Revision ${entry.head.profileId}@${revision} became unreadable: ${result.error.message}`)
    }
    return result.value.revision
  }
}
