/** Agent Team Ultra Host service and generated Remote surface. */

import { Buffer } from 'node:buffer'
import { Context, Service } from '@deepseek-ai/cordis'
import s from '@deepseek-ai/schemastery'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { TeamError } from '@deepseek-ai/dsh-experimental-agent-team'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-subagent'
import type { PostToolDecision, PreToolDecision } from '@deepseek-ai/dsh-tools'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  digitalEmployeeDomainSpec,
  digitalEmployeeProfileDraftSchema,
  type DigitalEmployeeBinding,
} from './spec.ts'
import type {
  DeleteDigitalEmployeeProfileRequest,
  DeleteDigitalEmployeeProfileResult,
  DigitalEmployeeFailure,
  DigitalEmployeeInstanceView,
  DigitalEmployeeProfile,
  DigitalEmployeeStudioView,
  ProfileHook,
  ProfileTextBlock,
  ProfileToolOption,
  ProfileToolPolicy,
  SaveDigitalEmployeeProfileRequest,
  SaveDigitalEmployeeProfileResult,
  SpawnDigitalEmployeeRequest,
  SpawnDigitalEmployeeResult,
} from './types.ts'

export type * from './types.ts'
export {
  digitalEmployeeBindingSchema,
  digitalEmployeeDomainSpec,
  digitalEmployeeProfileDraftSchema,
  digitalEmployeeProfileSchema,
  profileHookSchema,
  profileTextBlockSchema,
  profileToolPolicySchema,
} from './spec.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    digitalEmployees: DigitalEmployeeService
  }
}

/** Deployment limits and the fallback continuable provider. */
export interface Config {
  readonly defaultProvider?: string
  readonly maxProfiles?: number
  readonly maxProfileBytes?: number
  readonly maxHooks?: number
  readonly maxAssignmentBytes?: number
}

const DEFAULT_PROVIDER = 'spawn'
const DEFAULT_MAX_PROFILES = 64
const DEFAULT_MAX_PROFILE_BYTES = 131_072
const DEFAULT_MAX_HOOKS = 32
const DEFAULT_MAX_ASSIGNMENT_BYTES = 32_768

const TEAM_OWN_TOOL_NAMES = new Set([
  'spawn_teammate',
  'send_message',
  'followup_task',
  'list_agents',
  'wait_agent',
  'interrupt_agent',
  'team_task_create',
  'team_task_list',
  'team_task_get',
  'team_task_update',
  'run_code',
])

const PLUGIN_SOURCE = { kind: 'plugin', plugin: 'agent-team-ultra' } as const

/** Loader schema; defaults are universal operational limits, not deployment policy guesses. */
export const Config: s<Config> = s.object({
  defaultProvider: s.string().default(DEFAULT_PROVIDER),
  maxProfiles: s.number().step(1).min(1).default(DEFAULT_MAX_PROFILES),
  maxProfileBytes: s.number().step(1).min(1024).default(DEFAULT_MAX_PROFILE_BYTES),
  maxHooks: s.number().step(1).min(0).default(DEFAULT_MAX_HOOKS),
  maxAssignmentBytes: s.number().step(1).min(1).default(DEFAULT_MAX_ASSIGNMENT_BYTES),
})

/** Validate a direct-constructor integer that Loader normally checks. */
function positiveInteger(name: string, value: number, minimum = 1): number {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`agent-team-ultra: ${name} must be a safe integer >= ${minimum}`)
  }
  return value
}

/** Keep arbitrary failures bounded before they enter a durable binding diagnostic. */
function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.length <= 2048 ? text : `${text.slice(0, 2045)}...`
}

/** Freeze one text block before it crosses or enters a public boundary. */
function freezeTextBlock(block: ProfileTextBlock): ProfileTextBlock {
  return Object.freeze({
    id: block.id,
    title: block.title,
    content: block.content,
    enabled: block.enabled,
  })
}

/** Freeze one declarative hook before storage retains it by reference. */
function freezeHook(hook: ProfileHook): ProfileHook {
  return Object.freeze({
    id: hook.id,
    point: hook.point,
    effect: hook.effect,
    ...(hook.matcher === undefined ? {} : { matcher: hook.matcher }),
    text: hook.text,
    enabled: hook.enabled,
  })
}

/** Deep-detach the full profile snapshot. */
export function snapshotProfile(profile: DigitalEmployeeProfile): DigitalEmployeeProfile {
  const names = Object.freeze([...profile.toolPolicy.names])
  const toolPolicy: ProfileToolPolicy = Object.freeze({ mode: profile.toolPolicy.mode, names })
  return Object.freeze({
    id: profile.id,
    employeeName: profile.employeeName,
    displayName: profile.displayName,
    description: profile.description,
    provider: profile.provider,
    contextMode: profile.contextMode,
    persona: profile.persona,
    mission: profile.mission,
    toolPolicy,
    context: Object.freeze(profile.context.map(freezeTextBlock)),
    memory: Object.freeze(profile.memory.map(freezeTextBlock)),
    hooks: Object.freeze(profile.hooks.map(freezeHook)),
    revision: profile.revision,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  })
}

function failure(code: DigitalEmployeeFailure['code'], message: string, current?: DigitalEmployeeProfile): DigitalEmployeeFailure {
  return Object.freeze({
    code,
    message,
    ...(current === undefined ? {} : { current: snapshotProfile(current) }),
  })
}

function saveRejected(error: DigitalEmployeeFailure): SaveDigitalEmployeeProfileResult {
  return Object.freeze({ ok: false, error })
}

function deleteRejected(error: DigitalEmployeeFailure): DeleteDigitalEmployeeProfileResult {
  return Object.freeze({ ok: false, error })
}

function spawnRejected(error: DigitalEmployeeFailure): SpawnDigitalEmployeeResult {
  return Object.freeze({ ok: false, error })
}

/** Stable storage key; record keys never reach a filesystem path. */
function bindingKey(teamId: string, memberName: string): string {
  return JSON.stringify([teamId, memberName])
}

/** Render enabled blocks as one bounded, deterministic prompt section. */
function blockSection(title: string, blocks: readonly ProfileTextBlock[]): string {
  const enabled = blocks.filter(block => block.enabled)
  if (enabled.length === 0) return ''
  return [`# ${title}`, ...enabled.map(block => `## ${block.title}\n${block.content}`)].join('\n\n')
}

/** Simple wildcard matcher: `*` spans any substring and every other character is literal. */
function matchesTool(matcher: string, name: string): boolean {
  if (matcher === '*') return true
  const parts = matcher.split('*')
  if (parts.length === 1) return matcher === name
  let cursor = 0
  if (!matcher.startsWith('*')) {
    const first = parts[0] ?? ''
    if (!name.startsWith(first)) return false
    cursor = first.length
  }
  const end = matcher.endsWith('*') ? parts.length : parts.length - 1
  for (let index = 1; index < end; index += 1) {
    const part = parts[index] ?? ''
    if (part === '') continue
    const found = name.indexOf(part, cursor)
    if (found === -1) return false
    cursor = found + part.length
  }
  if (!matcher.endsWith('*')) {
    const last = parts.at(-1) ?? ''
    return name.endsWith(last) && name.length - last.length >= cursor
  }
  return true
}

function hookMessage(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: PLUGIN_SOURCE })
}

/** Concrete Host service; one provider is sufficient for this local overlay. */
export class DigitalEmployeeService extends TypertRemoteService {
  static inject = ['agents', 'agentTeams', 'storageDomain', 'subagents', 'systemPrompt', 'tools']
  static Config = Config

  private readonly resolved: Required<Config>
  private profiles: KvTable<string, DigitalEmployeeProfile> | undefined
  private bindings: KvTable<string, DigitalEmployeeBinding> | undefined
  private mutationTail: Promise<void> = Promise.resolve()
  private readonly launches = new Set<Promise<unknown>>()
  private readonly lifecycle = new AbortController()
  private admissionOpen = true

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'digitalEmployees')
    this.resolved = {
      defaultProvider: (config.defaultProvider ?? DEFAULT_PROVIDER).trim(),
      maxProfiles: positiveInteger('maxProfiles', config.maxProfiles ?? DEFAULT_MAX_PROFILES),
      maxProfileBytes: positiveInteger('maxProfileBytes', config.maxProfileBytes ?? DEFAULT_MAX_PROFILE_BYTES, 1024),
      maxHooks: positiveInteger('maxHooks', config.maxHooks ?? DEFAULT_MAX_HOOKS, 0),
      maxAssignmentBytes: positiveInteger('maxAssignmentBytes', config.maxAssignmentBytes ?? DEFAULT_MAX_ASSIGNMENT_BYTES),
    }
    if (this.resolved.defaultProvider === '') {
      throw new TypeError('agent-team-ultra: defaultProvider must not be blank')
    }
  }

  /** Open durable sidecar state, then make child setup observable. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(digitalEmployeeDomainSpec)
    this.profiles = domain.table('profiles')
    this.bindings = domain.table('bindings')
    const revokeSetup = this.ctx.subagents.registerContinuableSetup(childCtx => this.installForChild(childCtx))
    this.ctx.effect(() => async () => {
      this.admissionOpen = false
      this.lifecycle.abort(new Error('Agent Team Ultra service disposed'))
      revokeSetup()
      await Promise.allSettled([...this.launches])
      await this.mutationTail
      await domain.close()
      this.profiles = undefined
      this.bindings = undefined
    }, 'agent-team-ultra.runtime')
  }

  /** Complete replaceable Studio view for one exact live Team member. */
  @Remote('view')
  remoteView(sessionId: string): DigitalEmployeeStudioView {
    const agent = this.requireLiveAgent(sessionId)
    const membership = this.ctx.agentTeams.membership(agent)
    const profiles = [...this.requireProfiles().entries()]
      .map(([, profile]) => snapshotProfile(profile))
      .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.id.localeCompare(right.id))
    const tools: ProfileToolOption[] = this.ctx.tools.schemas(agent)
      .filter(tool => !TEAM_OWN_TOOL_NAMES.has(tool.name))
      .map(tool => Object.freeze({ name: tool.name, description: tool.description }))
      .sort((left, right) => left.name.localeCompare(right.name))
    const instances = [...this.requireBindings().entries()]
      .map(([, binding]) => binding)
      .filter(binding => binding.teamId === membership.id)
      .map(binding => this.instanceView(binding))
      .sort((left, right) => left.memberName.localeCompare(right.memberName))
    return Object.freeze({
      profiles: Object.freeze(profiles),
      tools: Object.freeze(tools),
      instances: Object.freeze(instances),
    })
  }

  /** Save one normalized profile with an exact CAS precondition. */
  @Remote('save')
  remoteSave(sessionId: string, request: SaveDigitalEmployeeProfileRequest): Promise<SaveDigitalEmployeeProfileResult> {
    this.requireLiveAgent(sessionId)
    return this.saveProfile(request)
  }

  /** Delete one profile with an exact CAS precondition. Active employees retain snapshots. */
  @Remote('deleteProfile')
  remoteDelete(sessionId: string, request: DeleteDigitalEmployeeProfileRequest): Promise<DeleteDigitalEmployeeProfileResult> {
    this.requireLiveAgent(sessionId)
    return this.deleteProfile(request)
  }

  /** Launch one profile as a real Agent Team teammate under exact Lead authority. */
  @Remote('spawn')
  remoteSpawn(
    sessionId: string,
    request: SpawnDigitalEmployeeRequest,
    signal: AbortSignal,
  ): Promise<SpawnDigitalEmployeeResult> {
    return this.spawnProfile(sessionId, request, signal)
  }

  /** Public Host API used by headless consumers and tests. */
  saveProfile(request: SaveDigitalEmployeeProfileRequest): Promise<SaveDigitalEmployeeProfileResult> {
    if (!this.admissionOpen) return Promise.resolve(saveRejected(failure('service-disposed', 'Digital Employee service is disposing')))
    const provider = request.profile.provider.trim() || this.resolved.defaultProvider
    const parsed = digitalEmployeeProfileDraftSchema.safeParse({ ...request.profile, provider })
    if (!parsed.success) {
      return Promise.resolve(saveRejected(failure(
        'profile-invalid',
        parsed.error.issues.map(issue => `${issue.path.join('.') || 'profile'}: ${issue.message}`).join('; ').slice(0, 2048),
      )))
    }
    if (parsed.data.hooks.length > this.resolved.maxHooks) {
      return Promise.resolve(saveRejected(failure(
        'profile-invalid',
        `profile has ${parsed.data.hooks.length} hooks; maximum is ${this.resolved.maxHooks}`,
      )))
    }
    const bytes = Buffer.byteLength(JSON.stringify(parsed.data), 'utf8')
    if (bytes > this.resolved.maxProfileBytes) {
      return Promise.resolve(saveRejected(failure(
        'profile-invalid',
        `profile is ${bytes} UTF-8 bytes; maximum is ${this.resolved.maxProfileBytes}`,
      )))
    }
    return this.enqueue(async () => {
      const table = this.requireProfiles()
      const current = table.get(parsed.data.id)
      if (request.expectedRevision !== (current?.revision ?? null)) {
        return saveRejected(failure('profile-conflict', 'profile revision changed; reload before saving', current))
      }
      if (current === undefined && table.size >= this.resolved.maxProfiles) {
        return saveRejected(failure('profile-limit', `profile limit ${this.resolved.maxProfiles} reached`))
      }
      const now = Date.now()
      const next = snapshotProfile({
        ...parsed.data,
        revision: (current?.revision ?? 0) + 1,
        createdAt: current?.createdAt ?? now,
        updatedAt: current === undefined ? now : Math.max(now, current.updatedAt),
      })
      await table.put(next.id, next)
      return Object.freeze({ ok: true, value: snapshotProfile(next) })
    })
  }

  /** Public Host delete API. */
  deleteProfile(request: DeleteDigitalEmployeeProfileRequest): Promise<DeleteDigitalEmployeeProfileResult> {
    if (!this.admissionOpen) return Promise.resolve(deleteRejected(failure('service-disposed', 'Digital Employee service is disposing')))
    return this.enqueue(async () => {
      const table = this.requireProfiles()
      const current = table.get(request.profileId)
      if (current === undefined) {
        return deleteRejected(failure('profile-not-found', `profile "${request.profileId}" not found`))
      }
      if (request.expectedRevision !== current.revision) {
        return deleteRejected(failure('profile-conflict', 'profile revision changed; reload before deleting', current))
      }
      const pending = [...this.requireBindings().entries()].some(([, binding]) =>
        binding.profileId === request.profileId && binding.phase === 'pending')
      if (pending) {
        return deleteRejected(failure('profile-in-use', 'profile has a launch still being provisioned'))
      }
      await table.delete(request.profileId)
      return Object.freeze({ ok: true, value: Object.freeze({ deleted: true as const }) })
    })
  }

  /** Public Host launch API with cancellation preserved through Agent Team provisioning. */
  spawnProfile(
    sessionId: string,
    request: SpawnDigitalEmployeeRequest,
    signal: AbortSignal,
  ): Promise<SpawnDigitalEmployeeResult> {
    if (!this.admissionOpen) return Promise.resolve(spawnRejected(failure('service-disposed', 'Digital Employee service is disposing')))
    const operation = this.spawnAdmitted(this.requireLiveAgent(sessionId), request, signal)
    this.launches.add(operation)
    void operation.finally(() => { this.launches.delete(operation) }).catch(() => undefined)
    return operation
  }

  private async spawnAdmitted(
    caller: Agent,
    request: SpawnDigitalEmployeeRequest,
    callerSignal: AbortSignal,
  ): Promise<SpawnDigitalEmployeeResult> {
    const signal = AbortSignal.any([callerSignal, this.lifecycle.signal])
    signal.throwIfAborted()
    const assignment = request.assignment?.trim()
    if (assignment !== undefined && Buffer.byteLength(assignment, 'utf8') > this.resolved.maxAssignmentBytes) {
      return spawnRejected(failure(
        'assignment-too-large',
        `assignment exceeds ${this.resolved.maxAssignmentBytes} UTF-8 bytes`,
      ))
    }
    let membership
    try {
      membership = this.ctx.agentTeams.membership(caller)
    } catch (error: unknown) {
      if (error instanceof TeamError) return spawnRejected(failure('team-rejected', error.message))
      throw error
    }
    if (membership.role !== 'lead') {
      return spawnRejected(failure('team-lead-required', 'only the exact live Team Lead may launch a Digital Employee'))
    }
    const profile = this.requireProfiles().get(request.profileId)
    if (profile === undefined) {
      return spawnRejected(failure('profile-not-found', `profile "${request.profileId}" not found`))
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

    const key = bindingKey(membership.id, profile.employeeName)
    const reservation = await this.enqueue(async (): Promise<DigitalEmployeeBinding | DigitalEmployeeFailure> => {
      const bindings = this.requireBindings()
      const existing = bindings.get(key)
      const rosterOwnsName = this.ctx.agentTeams.listMembers(caller)
        .some(member => member.name === profile.employeeName)
      if (existing !== undefined && rosterOwnsName) {
        return failure('profile-in-use', `Team member name "${profile.employeeName}" is already reserved`)
      }
      const pending: DigitalEmployeeBinding = Object.freeze({
        teamId: membership.id,
        memberName: profile.employeeName,
        profileId: profile.id,
        profileRevision: profile.revision,
        profile: snapshotProfile(profile),
        phase: 'pending',
      })
      await bindings.put(key, pending)
      return pending
    })
    if ('code' in reservation) return spawnRejected(reservation)

    const prompt = [
      `You are ${profile.displayName} (${profile.employeeName}), a profile-bound Digital Employee.`,
      `Mission:\n${profile.mission}`,
      ...(assignment === undefined || assignment === '' ? [] : [`Current assignment:\n${assignment}`]),
    ].join('\n\n')

    let provisionedMemberId: string | undefined
    try {
      const result = await this.ctx.agentTeams.spawnTeammate(caller, {
        name: profile.employeeName,
        description: profile.description,
        prompt: [{ type: 'text', text: prompt }],
        context: profile.contextMode,
        provider: profile.provider,
        signal,
      })
      provisionedMemberId = result.member.id
      const active: DigitalEmployeeBinding = Object.freeze({
        ...reservation,
        memberId: provisionedMemberId,
        phase: 'active',
      })
      await this.enqueue(async () => { await this.requireBindings().put(key, active) })
      return Object.freeze({ ok: true, value: this.instanceView(active) })
    } catch (error: unknown) {
      const failed: DigitalEmployeeBinding = Object.freeze({
        ...reservation,
        ...(provisionedMemberId === undefined ? {} : { memberId: provisionedMemberId }),
        phase: 'failed',
        error: errorText(error),
      })
      try {
        await this.enqueue(async () => { await this.requireBindings().put(key, failed) })
      } catch (recordError: unknown) {
        throw new AggregateError([error, recordError], 'Digital Employee launch and failure recording both failed')
      }
      if (signal.aborted) signal.throwIfAborted()
      if (error instanceof TeamError) {
        return spawnRejected(failure(
          error.code === 'TEAM_LEAD_REQUIRED' ? 'team-lead-required' : 'team-rejected',
          error.message,
        ))
      }
      throw error
    }
  }

  /** Compose a matching immutable binding into one unpublished child Activation. */
  private installForChild(childCtx: Context): () => void {
    const agent = childCtx.agent as Agent
    const binding = this.bindingFor(agent)
    if (binding === undefined) return () => undefined
    const profile = binding.profile
    const disposers: Array<() => unknown> = []
    const add = (dispose: () => unknown): void => { disposers.push(dispose) }
    try {
      add(childCtx.systemPrompt.section({
        name: 'deployment:persona',
        order: 0,
        text: profile.persona,
      }))
      const context = blockSection('Digital Employee context', profile.context)
      if (context !== '') add(childCtx.systemPrompt.context({ name: 'ultra:context', order: 130, text: context }))
      const memory = blockSection('Curated long-term memory', profile.memory)
      if (memory !== '') add(childCtx.systemPrompt.context({ name: 'ultra:memory', order: 140, text: memory }))
      if (profile.toolPolicy.mode !== 'inherit') {
        add(childCtx.tools.restrict(profile.toolPolicy.mode === 'allow'
          ? { allow: profile.toolPolicy.names }
          : { deny: profile.toolPolicy.names }))
      }
      this.installHooks(childCtx, profile.hooks, add)
    } catch (error: unknown) {
      for (const dispose of disposers.reverse()) void dispose()
      throw error
    }
    return () => {
      const failures: unknown[] = []
      for (const dispose of disposers.reverse()) {
        try { void dispose() } catch (error: unknown) { failures.push(error) }
      }
      if (failures.length > 0) throw new AggregateError(failures, 'Digital Employee child-scope disposal failed')
    }
  }

  /** Install only the declared, bounded hook semantics—never arbitrary code. */
  private installHooks(childCtx: Context, hooks: readonly ProfileHook[], add: (dispose: () => unknown) => void): void {
    const enabled = hooks.filter(hook => hook.enabled)
    const startup = enabled.filter(hook => hook.point === 'session-start')
    if (startup.length > 0) {
      add(childCtx.on('agent/session-start', ({ agent }) => {
        agent.inject(hookMessage(startup.map(hook => hook.text).join('\n\n')))
      }))
    }
    const beforeStep = enabled.filter(hook => hook.point === 'before-step')
    if (beforeStep.length > 0) {
      const message = hookMessage(beforeStep.map(hook => hook.text).join('\n\n'))
      add(childCtx.on('agent/pre-step', async (_payload, next): Promise<PreStepDecision> => {
        const downstream = await next()
        if (downstream.kind !== 'enter') return downstream
        return { ...downstream, messages: [...downstream.messages, message] }
      }))
    }
    const beforeTool = enabled.filter(hook => hook.point === 'before-tool')
    if (beforeTool.length > 0) {
      add(childCtx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
        const denied = beforeTool.find(hook => matchesTool(hook.matcher ?? '', exec.name))
        if (denied !== undefined) return { kind: 'deny', reason: denied.text }
        return await next()
      }))
    }
    const afterTool = enabled.filter(hook => hook.point === 'after-tool')
    if (afterTool.length > 0) {
      add(childCtx.on('tools/post-execute', async (exec, _result, next): Promise<PostToolDecision> => {
        const downstream = await next()
        const matching = afterTool.filter(hook => matchesTool(hook.matcher ?? '', exec.name))
        if (matching.length === 0) return downstream
        const message = hookMessage(matching.map(hook => hook.text).join('\n\n'))
        return {
          ...downstream,
          additionalContexts: [...downstream.additionalContexts ?? [], message],
        }
      }))
    }
  }

  /** Resolve by durable member id first, then the pre-publication Team/name reservation. */
  private bindingFor(agent: Agent): DigitalEmployeeBinding | undefined {
    const bindings = this.requireBindings()
    for (const [, binding] of bindings.entries()) {
      if (binding.memberId === agent.id) return binding
    }
    const parentId = agent.session.header.parentSession
    if (parentId === undefined) return undefined
    const root = this.ctx.agents.get(parentId)
    if (root === undefined) return undefined
    const member = this.ctx.agentTeams.listMembers(root).find(candidate => candidate.id === agent.id)
    return member === undefined ? undefined : bindings.get(bindingKey(parentId, member.name))
  }

  /** Resolve the explicit wire identity to the exact currently registered Agent. */
  private requireLiveAgent(sessionId: string): Agent {
    const agent = this.ctx.agents.get(sessionId as Agent['id'])
    if (agent === undefined) throw new Error(`Digital Employee session "${sessionId}" is not active`)
    return agent
  }

  private instanceView(binding: DigitalEmployeeBinding): DigitalEmployeeInstanceView {
    return Object.freeze({
      teamId: binding.teamId,
      memberName: binding.memberName,
      ...(binding.memberId === undefined ? {} : { memberId: binding.memberId }),
      profileId: binding.profileId,
      profileRevision: binding.profileRevision,
      phase: binding.phase,
      ...(binding.error === undefined ? {} : { error: binding.error }),
    })
  }

  /** Serialize read-modify-write decisions while letting storage own durability. */
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.mutationTail.then(operation)
    this.mutationTail = run.then(() => undefined, () => undefined)
    return run
  }

  private requireProfiles(): KvTable<string, DigitalEmployeeProfile> {
    if (this.profiles === undefined) throw new Error('Agent Team Ultra profile domain is not ready')
    return this.profiles
  }

  private requireBindings(): KvTable<string, DigitalEmployeeBinding> {
    if (this.bindings === undefined) throw new Error('Agent Team Ultra binding domain is not ready')
    return this.bindings
  }
}

export default DigitalEmployeeService
