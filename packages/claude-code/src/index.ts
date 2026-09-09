/** Durable Claude Code Agent SDK adapter for the Agent Team teammate-runtime seam. */

import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import {
  getSessionInfo,
  getSessionMessages,
  query as officialQuery,
  type Options,
  type Query,
  type SDKMessage,
  type SessionMessage,
  type SpawnOptions,
} from '@anthropic-ai/claude-agent-sdk'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  mountTeammateRuntimeProvider,
  TeammateRuntimeError,
  TeammateRuntimeEvidenceCursor,
  TeammateRuntimeEvidenceId,
  TeammateRuntimeHandle,
  TeammateRuntimeTurnId,
  type NativeMemberGrant,
  type NativeMemberRecoveryItem,
  type TeammateRuntimeMemberOperationsRequest,
  type TeammateRuntimeCreateRequest,
  type TeammateRuntimeCreateResult,
  type TeammateRuntimeDeliverRequest,
  type TeammateRuntimeDeliverResult,
  type TeammateRuntimeDisposeRequest,
  type TeammateRuntimeEvidenceItem,
  type TeammateRuntimeEvidenceRequest,
  type TeammateRuntimeEvidenceResult,
  type TeammateRuntimeInterruptRequest,
  type TeammateRuntimeInterruptResult,
  type TeammateRuntimePresenceEvent,
  type TeammateRuntimeProfileSnapshot,
  type TeammateRuntimeProvider,
  type TeammateRuntimeRequirements,
  type TeammateRuntimeResumeRequest,
} from '@deepseek-ai/dsh-experimental-agent-team'
import {
  scrubbedParentEnv,
  type SubprocessHandle,
} from '@deepseek-ai/dsh-subprocess'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import {
  claudeCodePackageBin,
  claudeCodeProductEligibility,
} from './product.ts'
import {
  claudeSpawnSpec,
  ManagedClaudeCodeProcess,
} from './process.ts'
import { createTeamToolTurn, teamToolNames } from './team-tools.ts'

export {
  claudeCodePackageBin,
  claudeCodeProductEligibility,
} from './product.ts'
export type { ClaudeCodeProductEligibility } from './product.ts'
export type {
  RuntimeCatalogOwnerService,
  RuntimeCatalogRegistration,
} from '@deepseek-ai/dsh-experimental-agent-team'

export const name = 'agent-team-claude-code'
export const inject = ['agentTeams', 'subprocess']

const DEFAULT_PROVIDER_NAME = 'claude-code'
const DEFAULT_DISPOSE_GRACE_MS = 3_000
const DEFAULT_MAX_EVIDENCE_ITEMS = 512
const FIXED_TOOLS = ['Read', 'Glob', 'Grep'] as const

type TurnOutcome = 'completed' | 'interrupted' | 'failed'
type FailureStage = 'creation' | 'resume' | 'delivery' | 'query-start' | 'query-run' | 'teardown'

function claudeUsage(value: unknown): TeammateRuntimeEvidenceItem['usage'] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const usage = value as Record<string, unknown>
  const inputTokens = usage.input_tokens
  const outputTokens = usage.output_tokens
  if (!Number.isSafeInteger(inputTokens) || (inputTokens as number) < 0
    || !Number.isSafeInteger(outputTokens) || (outputTokens as number) < 0) return undefined
  const optional = (key: string): number | undefined => {
    const candidate = usage[key]
    return Number.isSafeInteger(candidate) && (candidate as number) >= 0 ? candidate as number : undefined
  }
  const cacheReadTokens = optional('cache_read_input_tokens')
  const cacheWriteTokens = optional('cache_creation_input_tokens')
  const totalTokens = (inputTokens as number) + (outputTokens as number)
    + (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0)
  if (!Number.isSafeInteger(totalTokens)) return undefined
  return Object.freeze({
    inputTokens: inputTokens as number,
    outputTokens: outputTokens as number,
    totalTokens,
    ...(cacheReadTokens === undefined ? {} : { cacheReadTokens }),
    ...(cacheWriteTokens === undefined ? {} : { cacheWriteTokens }),
  })
}

/** Deployment-owned durable Claude Code adapter settings. */
export interface Config {
  /** Stable provider id registered with Agent Teams. */
  readonly providerName?: string
  /** Workspace root fixed for every native Session owned by this instance. */
  readonly cwd?: string
  /** Optional deployment-pinned Claude model. */
  readonly model?: string
  /** Optional service whose registerExternalRuntimeProvider(provider) call returns this generation's disposer. */
  readonly catalogOwnerService?: string
  /** Fixed confinement marker; no weaker value is accepted. */
  readonly sandbox?: 'read-only'
  /** Grace for exact process-tree termination. */
  readonly disposeGraceMs?: number
  /** Maximum fixed-shape evidence facts retained per attached Session. */
  readonly maxEvidenceItems?: number
}

/** Loader schema for deployment-owned Claude Code adapter settings. */
export const Config: z<Config> = z.object({
  providerName: z.string().min(1).default(DEFAULT_PROVIDER_NAME),
  cwd: z.string().min(1).default(process.cwd()),
  model: z.string().min(1),
  catalogOwnerService: z.string().min(1),
  sandbox: z.const('read-only').default('read-only'),
  disposeGraceMs: z.number().default(DEFAULT_DISPOSE_GRACE_MS),
  maxEvidenceItems: z.number().step(1).min(1).default(DEFAULT_MAX_EVIDENCE_ITEMS),
})

interface ResolvedConfig {
  readonly providerName: string
  readonly cwd: string
  readonly model?: string
  readonly disposeGraceMs: number
  readonly maxEvidenceItems: number
}

interface NativeSession {
  grant: NativeMemberGrant | undefined
  readonly memberBound: PromiseWithResolvers<NativeMemberGrant>
  readonly ownership: AbortController
  readonly recoveries: Set<Promise<void>>
  readonly settlements: Set<Promise<void>>
  readonly pendingTerminals: Map<ReturnType<typeof TeammateRuntimeTurnId>, TurnTerminal>
  readonly settlementOperations: Map<ReturnType<typeof TeammateRuntimeTurnId>, Promise<void>>
  readonly handle: ReturnType<typeof TeammateRuntimeHandle>
  readonly launchRequestId: string
  readonly memberId: string
  readonly evidence: TeammateRuntimeEvidenceItem[]
  evidenceIncomplete: boolean
  readonly deliveries: Map<string, ReturnType<typeof TeammateRuntimeTurnId>>
  readonly deliveryOperations: Map<string, Promise<TeammateRuntimeDeliverResult>>
  recoveryMessages: readonly SessionMessage[] | undefined
  recoveryIncomplete: boolean
  recovery: Promise<void>
  deliveryTail: Promise<void>
  presence: 'running' | 'idle'
  current: ActiveTurn | undefined
  disposed: boolean
  disposing?: Promise<void>
}

interface ActiveTurn {
  readonly teamTools: ReturnType<typeof createTeamToolTurn>
  readonly id: ReturnType<typeof TeammateRuntimeTurnId>
  readonly accepted: Promise<void>
  readonly done: Promise<TurnTerminal>
  interrupt(): void
}

interface TurnTerminal {
  readonly outcome: TurnOutcome
  readonly timestamp: number | undefined
  readonly text: string
}

interface NativeInspection {
  readonly exists: boolean
  readonly messages: readonly SessionMessage[]
}

interface NativeRecoveryWork {
  readonly kind: 'launch' | 'delivery'
  readonly id: ReturnType<typeof TeammateRuntimeTurnId>
  readonly marker: string
  readonly deliveryId?: string
}

interface NativeRecoveryTranscript {
  readonly work: NativeRecoveryWork
  readonly messages: SessionMessage[]
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error('agent-team-claude-code: operation aborted')
}

async function raceAbort<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  const cancellation = Promise.withResolvers<never>()
  const cancel = (): void => { cancellation.reject(abortError(signal)) }
  if (signal.aborted) cancel()
  else signal.addEventListener('abort', cancel, { once: true })
  try {
    return await Promise.race([pending, cancellation.promise])
  } finally {
    signal.removeEventListener('abort', cancel)
  }
}

function textInput(content: readonly { readonly type: string; readonly text?: string }[]): string {
  if (
    content.length === 0
    || content.some(block => block.type !== 'text' || typeof block.text !== 'string')
  ) {
    throw new TeammateRuntimeError(
      'Claude Code durable runtime accepts non-empty text input only',
      'TEAM_RUNTIME_CAPABILITY_MISMATCH',
    )
  }
  const texts = content.map(block => block.text as string)
  if (texts.every(text => text.trim().length === 0)) {
    throw new TeammateRuntimeError(
      'Claude Code durable runtime accepts non-empty text input only',
      'TEAM_RUNTIME_CAPABILITY_MISMATCH',
    )
  }
  return texts.join('\n')
}

function stableUuid(providerId: string, launchRequestId: string, memberId: string): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([providerId, launchRequestId, memberId]))
    .digest('hex')
  const variant = ((Number.parseInt(digest.charAt(16), 16) & 0x3) | 0x8).toString(16)
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `4${digest.slice(13, 16)}`,
    `${variant}${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join('-')
}

function operationMarker(kind: 'launch' | 'delivery', ...identity: readonly string[]): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([kind, ...identity]))
    .digest('hex')
  return `[dsh-agent-team:${kind}:${digest}]`
}

function turnId(handle: string, operation: string): ReturnType<typeof TeammateRuntimeTurnId> {
  const digest = createHash('sha256')
    .update(JSON.stringify([handle, operation]))
    .digest('hex')
  return TeammateRuntimeTurnId(`claude-turn:${digest}`)
}

function evidenceId(
  kind: string,
  ...identity: readonly string[]
): ReturnType<typeof TeammateRuntimeEvidenceId> {
  const digest = createHash('sha256')
    .update(JSON.stringify([kind, ...identity]))
    .digest('hex')
  return TeammateRuntimeEvidenceId(`claude-evidence:${digest}`)
}

function profileInstructions(profile: TeammateRuntimeProfileSnapshot): string {
  const sections = [
    '# Digital Employee Profile',
    `## Persona\n${profile.persona}`,
    `## Mission\n${profile.mission}`,
    ...profile.context.map(block => `## Context: ${block.title}\n${block.content}`),
    ...profile.memory.map(block => `## Memory: ${block.title}\n${block.content}`),
  ]
  return sections.join('\n\n')
}

function initialPrompt(
  marker: string,
  profile: TeammateRuntimeProfileSnapshot,
  work: string,
): string {
  return `${marker}\n\n${profileInstructions(profile)}\n\n# Initial Work\n${work}`
}

function deliveryPrompt(
  marker: string,
  request: TeammateRuntimeDeliverRequest,
  content: string,
): string {
  return [
    marker,
    '',
    '# Team Delivery',
    `Sender: ${request.senderName}`,
    '',
    content,
  ].join('\n')
}

function messageSessionId(message: SDKMessage): string | undefined {
  const value = message as unknown as Record<string, unknown>
  return typeof value.session_id === 'string' ? value.session_id : undefined
}

function sessionMessageText(entry: SessionMessage): string {
  if (entry.message === null || typeof entry.message !== 'object' || Array.isArray(entry.message)) return ''
  const content = (entry.message as Record<string, unknown>).content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.filter(block => block !== null && typeof block === 'object' && !Array.isArray(block)
    && (block as Record<string, unknown>).type === 'text'
    && typeof (block as Record<string, unknown>).text === 'string')
    .map(block => (block as Record<string, unknown>).text as string).join('\n')
}

function transcriptContains(messages: readonly SessionMessage[], marker: string): boolean {
  return messages.some(message => message.type === 'user'
    && message.parent_tool_use_id == null && message.parent_agent_id == null
    && sessionMessageText(message).split('\n', 1)[0] === marker)
}

function isToolResultContinuation(entry: SessionMessage): boolean {
  if (entry.message === null || typeof entry.message !== 'object' || Array.isArray(entry.message)) return false
  const content = (entry.message as Record<string, unknown>).content
  return Array.isArray(content) && content.length > 0 && content.every(raw => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return false
    const block = raw as Record<string, unknown>
    return block.type === 'tool_result' && typeof block.tool_use_id === 'string' && block.tool_use_id.length > 0
  })
}

function assertRequirements(requirements: TeammateRuntimeRequirements): void {
  const allowedProfiles = new Set(['persona', 'mission', 'context', 'memory'])
  const allowedRuntime = new Set(['full-collaboration', 'sandbox', 'evidence', 'usage'])
  if (
    requirements.contextMode !== 'fresh'
    || requirements.profileCapabilities.some(value => !allowedProfiles.has(value))
    || requirements.runtimeCapabilities.some(value => !allowedRuntime.has(value))
  ) {
    throw new TeammateRuntimeError(
      'Claude Code durable runtime does not satisfy the requested capability set',
      'TEAM_RUNTIME_CAPABILITY_MISMATCH',
    )
  }
}

function assertProfile(profile: TeammateRuntimeProfileSnapshot): void {
  if (
    profile.toolPolicy.mode !== 'inherit'
    || profile.toolPolicy.names.length > 0
    || profile.hooks.length > 0
  ) {
    throw new TeammateRuntimeError(
      'Claude Code durable runtime does not accept Profile tool policy or hooks',
      'TEAM_RUNTIME_CAPABILITY_MISMATCH',
    )
  }
}

function safeToolName(value: unknown): string | undefined {
  if (value === 'Read') return 'read'
  if (value === 'Glob') return 'glob'
  if (value === 'Grep') return 'grep'
  return undefined
}

function terminalText(outcome: TurnOutcome, finalText: string): string {
  const text = outcome === 'completed' && finalText.trim()
    ? finalText
    : `Claude Code work ${outcome}${finalText.trim() ? `.\n\n${finalText}` : ' without a final response.'}`
  const encodedBytes = (value: string) => Buffer.byteLength(JSON.stringify({ operation: 'turns.settle', outcome, text: value }), 'utf8')
  if (encodedBytes(text) <= 4_096) return text
  const suffix = '\n[Result truncated to the Team message limit.]'
  let remaining = 4_096 - encodedBytes(suffix)
  let prefix = ''
  for (const character of text) {
    const bytes = Buffer.byteLength(JSON.stringify(character), 'utf8') - 2
    if (bytes > remaining) break
    prefix += character
    remaining -= bytes
  }
  return prefix + suffix
}

class ClaudeCodeTeammateRuntimeProvider implements TeammateRuntimeProvider {
  readonly id: string
  readonly displayName = 'Claude Code'
  readonly contextModes = ['fresh'] as const
  readonly profileCapabilities = ['persona', 'mission', 'context', 'memory'] as const
  readonly runtimeCapabilities = ['full-collaboration', 'sandbox', 'evidence', 'usage'] as const
  readonly memberOperations = ['members.list', 'tasks.list', 'tasks.get', 'messages.send', 'tasks.update', 'wait'] as const
  private readonly sessions = new Map<string, NativeSession>()
  private readonly creations = new Map<string, Promise<TeammateRuntimeCreateResult>>()
  private readonly presenceListeners = new Set<(event: TeammateRuntimePresenceEvent) => void>()
  private readonly lifecycle = new AbortController()
  private closed = false

  constructor(private readonly ctx: Context, private readonly config: ResolvedConfig) {
    this.id = config.providerName
  }

  onPresenceChanged(listener: (event: TeammateRuntimePresenceEvent) => void): () => void {
    this.presenceListeners.add(listener)
    return () => { this.presenceListeners.delete(listener) }
  }

  bindMemberOperations(request: TeammateRuntimeMemberOperationsRequest): void {
    this.assertOpen()
    const session = this.session(request.nativeHandle)
    if (request.grant.identity.nativeHandle !== session.handle || request.grant.identity.provider !== this.id
      || request.grant.identity.memberId !== session.memberId) {
      throw new TeammateRuntimeError('Claude Code Team grant targets another native Session', 'TEAM_RUNTIME_IDENTITY_CONFLICT')
    }
    const previous = session.grant
    session.grant = request.grant
    session.memberBound.resolve(request.grant)
    if (previous !== undefined && previous !== request.grant) {
      if (session.pendingTerminals.size > 0) this.retryPendingSettlements(session)
      if (session.recoveryIncomplete && session.recoveryMessages !== undefined) {
        const recovery = this.queueRecovery(session, session.recoveryMessages, session.deliveryTail)
        session.deliveryTail = recovery
      }
    }
  }

  async create(request: TeammateRuntimeCreateRequest): Promise<TeammateRuntimeCreateResult> {
    this.assertOpen()
    const signal = this.operationSignal(request.signal)
    assertRequirements(request.requirements)
    assertProfile(request.profile)
    const handle = this.handle(request.launchRequestId, request.memberId)
    const attached = this.sessions.get(handle)
    if (attached !== undefined && !attached.disposed) {
      return this.result(attached, turnId(handle, request.launchRequestId))
    }
    const active = this.creations.get(handle)
    if (active !== undefined) return await raceAbort(active, signal)
    const creation = this.createOnce(handle, { ...request, signal })
    this.creations.set(handle, creation)
    try {
      return await creation
    } finally {
      /* v8 ignore else -- only this settlement owns its exact creation promise. */
      if (this.creations.get(handle) === creation) this.creations.delete(handle)
    }
  }

  async resume(request: TeammateRuntimeResumeRequest): Promise<TeammateRuntimeCreateResult | undefined> {
    this.assertOpen()
    const signal = this.operationSignal(request.signal)
    assertRequirements(request.requirements)
    const expected = this.handle(request.launchRequestId, request.memberId)
    if (request.nativeHandle !== undefined && request.nativeHandle !== expected) {
      throw new TeammateRuntimeError(
        'Claude Code native Session does not match the launch correlation',
        'TEAM_RUNTIME_IDENTITY_CONFLICT',
      )
    }
    const attached = this.sessions.get(expected)
    if (attached !== undefined && !attached.disposed) {
      return this.result(attached, turnId(expected, request.launchRequestId))
    }
    try {
      const marker = operationMarker('launch', this.id, request.launchRequestId, request.memberId)
      const inspection = await this.inspect(expected, signal)
      if (!inspection.exists) return undefined
      if (!transcriptContains(inspection.messages, marker)) {
        throw new TeammateRuntimeError(
          'Claude Code native Session does not contain the expected launch marker',
          'TEAM_RUNTIME_IDENTITY_CONFLICT',
        )
      }
      const session = this.attachSession(expected, request.launchRequestId, request.memberId)
      session.deliveryTail = this.queueRecovery(session, inspection.messages)
      return this.result(session, turnId(expected, request.launchRequestId))
    } catch (error: unknown) {
      if (error instanceof TeammateRuntimeError) throw error
      throw this.failure('resume', error)
    }
  }

  async deliver(request: TeammateRuntimeDeliverRequest): Promise<TeammateRuntimeDeliverResult> {
    this.assertOpen()
    const signal = this.operationSignal(request.signal)
    const session = this.session(request.nativeHandle)
    const known = session.deliveries.get(request.deliveryId)
    if (known !== undefined) return { turnId: known, presence: session.presence }
    const pending = session.deliveryOperations.get(request.deliveryId)
    if (pending !== undefined) return await raceAbort(pending, signal)
    const operation = session.deliveryTail.then(async () => await this.deliverOnce(
      session,
      { ...request, signal },
    ))
    session.deliveryOperations.set(request.deliveryId, operation)
    session.deliveryTail = operation.then(() => undefined, () => undefined)
    try {
      return await operation
    } finally {
      /* v8 ignore else -- only this delivery owns its exact queued operation. */
      if (session.deliveryOperations.get(request.deliveryId) === operation) {
        session.deliveryOperations.delete(request.deliveryId)
      }
    }
  }

  private async deliverOnce(
    session: NativeSession,
    request: TeammateRuntimeDeliverRequest,
  ): Promise<TeammateRuntimeDeliverResult> {
    this.assertSessionAttached(session)
    await raceAbort(session.recovery, request.signal)
    this.assertSessionAttached(session)
    if (session.current !== undefined) {
      await raceAbort(session.current.done.then(() => undefined), request.signal)
    }
    this.assertSessionAttached(session)
    const marker = operationMarker('delivery', session.handle, request.deliveryId)
    let inspection: NativeInspection
    try {
      inspection = await this.inspect(session.handle, request.signal)
    } catch (error: unknown) {
      if (error instanceof TeammateRuntimeError) throw error
      throw this.failure('delivery', error)
    }
    if (!inspection.exists) {
      throw new TeammateRuntimeError(
        'Claude Code native Session is unavailable',
        'TEAM_RUNTIME_IDENTITY_CONFLICT',
      )
    }
    const id = turnId(session.handle, request.deliveryId)
    if (transcriptContains(inspection.messages, marker)) {
      await this.queueRecovery(session, inspection.messages)
      session.deliveries.set(request.deliveryId, id)
      return { turnId: id, presence: session.presence }
    }
    const content = textInput(request.content)
    const turn = await this.startTurn(
      session,
      id,
      deliveryPrompt(marker, request, content),
      'resume',
      request.signal,
    )
    await turn.accepted
    session.deliveries.set(request.deliveryId, id)
    return { turnId: id, presence: session.presence }
  }

  interrupt(request: TeammateRuntimeInterruptRequest): TeammateRuntimeInterruptResult {
    const session = this.sessions.get(request.nativeHandle)
    if (session === undefined || session.disposed) return { previousStatus: 'inactive' }
    const previousStatus = session.presence
    session.current?.interrupt()
    return { previousStatus }
  }

  async evidence(request: TeammateRuntimeEvidenceRequest): Promise<TeammateRuntimeEvidenceResult> {
    const signal = this.operationSignal(request.signal)
    const session = this.session(request.nativeHandle)
    await raceAbort(session.recovery, signal)
    return await Promise.resolve().then(() => {
      signal.throwIfAborted()
      this.assertSessionAttached(session)
      const offset = request.cursor === undefined ? 0 : Number(request.cursor)
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > session.evidence.length) {
        throw new TeammateRuntimeError(
          'Claude Code evidence cursor is invalid',
          'TEAM_RUNTIME_IDENTITY_CONFLICT',
        )
      }
      const end = Math.min(offset + request.limit, session.evidence.length)
      return {
        nativeHandle: session.handle,
        items: session.evidence.slice(offset, end),
        ...(end < session.evidence.length
          ? { nextCursor: TeammateRuntimeEvidenceCursor(String(end)) }
          : {}),
        complete: !session.evidenceIncomplete && end === session.evidence.length,
      }
    })
  }

  async dispose(request: TeammateRuntimeDisposeRequest): Promise<void> {
    if (request.kind !== 'runtime') return
    const session = this.sessions.get(request.nativeHandle)
    if (session === undefined) return
    const reportCleanup = (level: 'warn' | 'info', message: string) => {
      try { this.ctx.logger[level](message) } catch {
        // A failing log sink cannot interrupt or invalidate native cleanup.
      }
    }
    const reportGrace = () => {
      reportCleanup('warn', 'agent-team-claude-code: cleanup abort grace elapsed; still waiting for native process exit')
    }
    if (request.signal.aborted) reportGrace()
    else request.signal.addEventListener('abort', reportGrace, { once: true })
    try {
      await this.disposeSession(session)
      if (request.signal.aborted) {
        reportCleanup('info', 'agent-team-claude-code: native cleanup reached quiescence after abort grace')
      }
    } finally {
      request.signal.removeEventListener('abort', reportGrace)
    }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.lifecycle.abort(new TeammateRuntimeError(
      'Claude Code durable runtime is disposing',
      'TEAM_RUNTIME_UNAVAILABLE',
    ))
    await Promise.allSettled([...this.creations.values()])
    await Promise.allSettled(
      [...this.sessions.values()].map(async (session) => { await this.disposeSession(session) }),
    )
    this.creations.clear()
    this.presenceListeners.clear()
  }

  private async createOnce(
    handle: string,
    request: TeammateRuntimeCreateRequest,
  ): Promise<TeammateRuntimeCreateResult> {
    const marker = operationMarker('launch', this.id, request.launchRequestId, request.memberId)
    let session: NativeSession | undefined
    try {
      const inspection = await this.inspect(handle, request.signal)
      if (transcriptContains(inspection.messages, marker)) {
        session = this.attachSession(handle, request.launchRequestId, request.memberId)
        session.deliveryTail = this.queueRecovery(session, inspection.messages)
        return this.result(session, turnId(handle, request.launchRequestId))
      }
      if (inspection.exists) {
        throw new TeammateRuntimeError(
          'Claude Code native Session is already owned by another launch',
          'TEAM_RUNTIME_IDENTITY_CONFLICT',
        )
      }
      const work = textInput(request.initialWork)
      session = this.attachSession(handle, request.launchRequestId, request.memberId)
      const id = turnId(handle, request.launchRequestId)
      const turn = await this.startTurn(
        session,
        id,
        initialPrompt(marker, request.profile, work),
        'new',
        request.signal,
      )
      await turn.accepted
      return this.result(session, id)
    } catch (error: unknown) {
      if (session !== undefined) await this.disposeSession(session)
      if (error instanceof TeammateRuntimeError) throw error
      throw this.failure('creation', error)
    }
  }

  private async startTurn(
    session: NativeSession,
    id: ReturnType<typeof TeammateRuntimeTurnId>,
    prompt: string,
    mode: 'new' | 'resume',
    requestSignal: AbortSignal,
  ): Promise<ActiveTurn> {
    const controller = new AbortController()
    const teamTools = createTeamToolTurn(id, controller.signal, () => session.grant, session.memberBound.promise)
    const accepted = Promise.withResolvers<void>()
    void accepted.promise.catch(() => {})
    let acceptedValue = false
    let query: Query | undefined
    let child: SubprocessHandle | undefined
    const removeRequestAbort = (): void => { requestSignal.removeEventListener('abort', interrupt) }
    const markAccepted = (): void => {
      if (acceptedValue) return
      acceptedValue = true
      removeRequestAbort()
      accepted.resolve()
    }
    const capture = (options: SpawnOptions): ManagedClaudeCodeProcess => {
      if (resolve(options.command) !== resolve(claudeCodePackageBin)) {
        throw new Error('agent-team-claude-code: SDK requested an unqualified executable')
      }
      if (child !== undefined) {
        throw new Error('agent-team-claude-code: SDK requested more than one process for a turn')
      }
      child = this.ctx.subprocess.spawn(claudeSpawnSpec(options, this.config.disposeGraceMs))
      child.stderr?.resume()
      return new ManagedClaudeCodeProcess(child)
    }
    const interrupt = (): void => {
      if (!controller.signal.aborted) {
        controller.abort(abortError(requestSignal))
      }
      try {
        query?.close()
      } catch {
        // The managed process tree remains the authoritative cancellation path.
      }
      child?.terminate()
    }
    /* v8 ignore next -- a signal can flip only in the synchronous gap after native lookup. */
    if (requestSignal.aborted) interrupt()
    else requestSignal.addEventListener('abort', interrupt, { once: true })
    try {
      query = officialQuery({
        // Preserve the existing launch/delivery marker and canonical turn id.
        // New transcripts can recover follow-up turn identity without reversing
        // the hashed delivery marker or replacing any historical identity.
        prompt: `${prompt.slice(0, prompt.indexOf('\n'))}\n[dsh-agent-team:turn:${id}]${prompt.slice(prompt.indexOf('\n'))}`,
        options: this.queryOptions(session.handle, mode, controller, capture, teamTools),
      })
      if (child === undefined || child.pid <= 0) {
        throw new Error('agent-team-claude-code: SDK did not publish a controllable process')
      }
    } catch (error: unknown) {
      removeRequestAbort()
      const failure = this.failure('query-start', error)
      controller.abort(failure)
      await teamTools.close()
      try {
        await this.disposeStartedProcess(query, child)
      } catch {
        // Cleanup completed to the subprocess seam's quiescent settlement; only bounded failure is public.
      }
      accepted.reject(failure)
      throw failure
    }
    const publishedQuery = query
    const publishedChild = child
    const active: ActiveTurn = {
      teamTools,
      id,
      accepted: accepted.promise,
      done: Promise.resolve({ outcome: 'failed', timestamp: Date.now(), text: '' }),
      interrupt,
    }
    session.current = active
    session.presence = 'running'
    const done = this.consumeTurn(
      session,
      active,
      publishedQuery,
      publishedChild,
      controller,
      markAccepted,
      () => acceptedValue,
      accepted.reject,
      removeRequestAbort,
    )
    Object.assign(active, { done })
    this.observeTurn(session, active)
    return active
  }

  private async consumeTurn(
    session: NativeSession,
    turn: ActiveTurn,
    query: Query,
    child: SubprocessHandle,
    controller: AbortController,
    markAccepted: () => void,
    accepted: () => boolean,
    rejectAccepted: (reason?: unknown) => void,
    removeRequestAbort: () => void,
  ): Promise<TurnTerminal> {
    let outcome: TurnOutcome = 'failed'
    let sawResult = false
    let finalText = ''
    let failure: unknown
    try {
      for await (const message of query) {
        const nativeId = messageSessionId(message)
        if (nativeId !== undefined && nativeId !== session.handle) {
          throw new Error('agent-team-claude-code: SDK returned a different Session')
        }
        if (nativeId !== undefined) markAccepted()
        if (sawResult) continue
        const terminal = this.recordMessage(session, turn.id, message)
        if (terminal !== undefined) {
          sawResult = true
          outcome = terminal
          if (message.type === 'result' && message.subtype === 'success') {
            finalText = message.is_error === false && typeof message.result === 'string' ? message.result : ''
          }
        }
      }
      if (!accepted()) throw new Error('agent-team-claude-code: SDK ended before accepting work')
      if (!sawResult) outcome = controller.signal.aborted ? 'interrupted' : 'failed'
    } catch (error: unknown) {
      failure = error
      if (!sawResult) outcome = controller.signal.aborted ? 'interrupted' : 'failed'
      if (!accepted()) rejectAccepted(this.failure('query-run', error))
    } finally {
      removeRequestAbort()
      try {
        await turn.teamTools.close()
      } catch (error: unknown) {
        failure ??= error
        if (!sawResult) outcome = 'failed'
        if (!accepted()) rejectAccepted(this.failure('teardown', error))
      }
      try {
        await this.disposeStartedProcess(query, child)
      } catch (error: unknown) {
        failure ??= error
        if (!sawResult) outcome = 'failed'
        if (!accepted()) rejectAccepted(this.failure('teardown', error))
      }
    }
    if (failure !== undefined && accepted()) {
      this.addEvidence(session, {
        id: evidenceId('diagnostic', session.handle, turn.id, String(session.evidence.length)),
        kind: 'diagnostic',
        timestamp: Date.now(),
        turnId: turn.id,
        name: controller.signal.aborted ? 'query-interrupted' : 'query-failed',
        outcome: controller.signal.aborted ? 'interrupted' : 'failed',
      })
    }
    return { outcome, timestamp: Date.now(), text: terminalText(outcome, finalText) }
  }

  private queryOptions(
    handle: string,
    mode: 'new' | 'resume',
    controller: AbortController,
    spawn: (options: SpawnOptions) => ManagedClaudeCodeProcess,
    teamTools: ReturnType<typeof createTeamToolTurn>,
  ): Options {
    return {
      abortController: controller,
      cwd: this.config.cwd,
      ...this.config.model === undefined ? {} : { model: this.config.model },
      env: scrubbedParentEnv(),
      persistSession: true,
      ...(mode === 'new' ? { sessionId: handle } : { resume: handle }),
      pathToClaudeCodeExecutable: claudeCodePackageBin,
      permissionMode: 'dontAsk',
      tools: [...FIXED_TOOLS],
      allowedTools: [...teamToolNames],
      settingSources: [],
      skills: [],
      plugins: [],
      mcpServers: { dsh_team: teamTools.server },
      strictMcpConfig: true,
      sandbox: {
        enabled: true,
        failIfUnavailable: true,
        autoAllowBashIfSandboxed: false,
        allowUnsandboxedCommands: false,
        network: {
          allowedDomains: [],
          strictAllowlist: true,
          allowLocalBinding: false,
          allowAllUnixSockets: false,
        },
        filesystem: {
          denyWrite: ['/'],
          denyRead: ['/'],
          allowRead: [this.config.cwd],
          disabled: false,
        },
      },
      canUseTool: () => Promise.resolve({
        behavior: 'deny' as const,
        message: 'This durable Claude Code runtime cannot request interactive permission.',
      }),
      onElicitation: () => Promise.resolve({ action: 'decline' as const }),
      onUserDialog: () => Promise.resolve({ behavior: 'cancelled' as const }),
      supportedDialogKinds: ['refusal_fallback_prompt'],
      spawnClaudeCodeProcess: spawn,
    }
  }

  private recordMessage(
    session: NativeSession,
    id: ReturnType<typeof TeammateRuntimeTurnId>,
    message: SDKMessage,
  ): TurnOutcome | undefined {
    const value = message as unknown as Record<string, unknown>
    if (value.type === 'assistant') this.recordAssistantTools(session, id, value)
    if (value.type === 'system' && value.subtype === 'permission_denied') {
      this.addEvidence(session, {
        id: evidenceId('diagnostic', session.handle, id, 'permission-denied', String(session.evidence.length)),
        kind: 'diagnostic',
        timestamp: Date.now(),
        turnId: id,
        name: 'permission-denied',
        outcome: 'blocked',
      })
    }
    if (value.type !== 'result') return undefined
    if (typeof value.uuid !== 'string' || value.uuid.length === 0 || value.uuid.length > 200) {
      throw new Error('agent-team-claude-code: SDK result has no stable identity')
    }
    const usage = claudeUsage(value.usage)
    this.addEvidence(session, {
      id: evidenceId('usage', session.handle, id),
      kind: 'usage',
      timestamp: Date.now(),
      turnId: id,
      ...(usage === undefined ? {} : { usage }),
    })
    return value.subtype === 'success' && value.is_error === false ? 'completed' : 'failed'
  }

  private recordAssistantTools(
    session: NativeSession,
    id: ReturnType<typeof TeammateRuntimeTurnId>,
    message: Record<string, unknown>,
    timestamp = Date.now(),
  ): void {
    const carrier = message.message
    if (carrier === null || typeof carrier !== 'object' || Array.isArray(carrier)) return
    const content = (carrier as Record<string, unknown>).content
    if (!Array.isArray(content)) return
    for (const raw of content) {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue
      const block = raw as Record<string, unknown>
      if (block.type !== 'tool_use') continue
      const name = safeToolName(block.name)
      if (name === undefined) continue
      const nativeId = typeof block.id === 'string' ? block.id : String(session.evidence.length)
      this.addEvidence(session, {
        id: evidenceId('tool', session.handle, id, nativeId),
        kind: 'tool',
        timestamp,
        turnId: id,
        name,
        outcome: 'unknown',
      })
    }
  }

  private observeTurn(session: NativeSession, turn: ActiveTurn): void {
    void turn.done.then((terminal) => {
      if (session.current !== turn || session.disposed) return
      session.current = undefined
      this.recordTerminalEvidence(session, turn.id, terminal)
      session.presence = 'idle'
      this.emitPresence(session, 'idle')
      this.queueSettlement(session, turn.id, terminal)
    })
  }

  private queueSettlement(session: NativeSession, id: ReturnType<typeof TeammateRuntimeTurnId>, terminal: TurnTerminal): Promise<void> {
    const pending = session.pendingTerminals.get(id)
    if (pending !== undefined && (pending.outcome !== terminal.outcome || pending.text !== terminal.text)) {
      const conflict = Promise.reject(new TeammateRuntimeError(
        'Claude Code terminal result conflicts with its pending turn',
        'TEAM_RUNTIME_IDENTITY_CONFLICT',
      ))
      void conflict.catch(() => {
        this.ctx.logger.warn('agent-team-claude-code: conflicting terminal result was refused')
      })
      return conflict
    }
    const active = session.settlementOperations.get(id)
    if (active !== undefined) return active
    session.pendingTerminals.set(id, pending ?? terminal)
    const settle = async (): Promise<void> => {
      const signal = AbortSignal.any([this.lifecycle.signal, session.ownership.signal])
      const grant = session.grant ?? await raceAbort(session.memberBound.promise, signal)
      signal.throwIfAborted()
      const result = await grant.execute({ operation: 'turns.settle', outcome: terminal.outcome, text: terminal.text },
        signal, { kind: 'settlement', turnId: id })
      if (!result.ok) throw new TeammateRuntimeError('Claude Code terminal result awaits Team acceptance', 'TEAM_RUNTIME_UNAVAILABLE')
    }
    const settlement = settle()
    session.settlements.add(settlement)
    session.settlementOperations.set(id, settlement)
    void settlement.then(
      () => {
        const current = session.pendingTerminals.get(id)
        if (current?.outcome === terminal.outcome && current.text === terminal.text) session.pendingTerminals.delete(id)
      },
      () => { this.ctx.logger.warn('agent-team-claude-code: terminal result awaits Team acceptance after resume') },
    ).finally(() => {
      session.settlements.delete(settlement)
      if (session.settlementOperations.get(id) === settlement) session.settlementOperations.delete(id)
    })
    return settlement
  }

  private retryPendingSettlements(session: NativeSession): void {
    const active = [...session.settlements]
    const recovery = Promise.allSettled(active).then(async () => {
      for (const [id, terminal] of [...session.pendingTerminals]) {
        if (session.disposed) return
        await this.queueSettlement(session, id, terminal)
      }
    })
    session.recoveries.add(recovery)
    void recovery.then(
      () => { session.recoveries.delete(recovery) },
      () => {
        session.recoveries.delete(recovery)
        if (!session.disposed) this.ctx.logger.warn('agent-team-claude-code: pending terminal retry did not complete')
      },
    )
  }

  private queueRecovery(
    session: NativeSession,
    messages: readonly SessionMessage[],
    after: Promise<unknown> = Promise.resolve(),
  ): Promise<void> {
    const snapshot = structuredClone(messages)
    session.recoveryMessages = snapshot
    session.recoveryIncomplete = true
    const prior = session.recovery
    const operation = after.catch(() => undefined)
      .then(() => prior.catch(() => undefined))
      .then(async () => {
        const signal = AbortSignal.any([this.lifecycle.signal, session.ownership.signal])
        const grant = session.grant ?? await raceAbort(session.memberBound.promise, signal)
        signal.throwIfAborted()
        await this.recoverNativeSession(session, snapshot, grant, signal)
      })
    session.recovery = operation
    session.recoveries.add(operation)
    void operation.then(
      () => {
        session.recoveries.delete(operation)
        if (session.recovery === operation) {
          session.recoveryIncomplete = false
          session.recoveryMessages = undefined
        }
      },
      () => {
        session.recoveries.delete(operation)
        if (!session.disposed) this.ctx.logger.warn('agent-team-claude-code: native recovery awaits a later provider generation')
      },
    )
    return operation
  }

  private async readNativeRecovery(grant: NativeMemberGrant, signal: AbortSignal): Promise<NativeMemberRecoveryItem[]> {
    const items: NativeMemberRecoveryItem[] = []
    const seen = new Map<string, string>()
    let offset = 0
    let limit = 100
    while (true) {
      signal.throwIfAborted()
      const result = await grant.execute({ operation: 'turns.recover', offset, limit }, signal)
      if (!result.ok) {
        if (result.error.code === 'TEAM_NATIVE_RESULT_LIMIT' && limit > 1) {
          limit = Math.max(1, Math.floor(limit / 2))
          continue
        }
        throw new TeammateRuntimeError('Claude Code native recovery facts are unavailable', 'TEAM_RUNTIME_UNAVAILABLE')
      }
      if (result.operation !== 'turns.recover') {
        throw new TeammateRuntimeError('Claude Code native recovery facts conflict', 'TEAM_RUNTIME_IDENTITY_CONFLICT')
      }
      for (const item of result.value.items) {
        const key = item.kind === 'launch' ? `launch:${item.launchRequestId}`
          : item.kind === 'delivery' ? `delivery:${item.deliveryId}` : `settlement:${item.turnId}`
        const encoded = JSON.stringify(item)
        const known = seen.get(key)
        if (known !== undefined) {
          if (known !== encoded) {
            throw new TeammateRuntimeError('Claude Code native recovery facts conflict', 'TEAM_RUNTIME_IDENTITY_CONFLICT')
          }
          continue
        }
        seen.set(key, encoded)
        items.push(structuredClone(item))
      }
      const next = result.value.nextOffset
      if (next === undefined) return items
      if (!Number.isSafeInteger(next) || next <= offset) {
        throw new TeammateRuntimeError('Claude Code native recovery cursor did not advance', 'TEAM_RUNTIME_IDENTITY_CONFLICT')
      }
      offset = next
    }
  }

  private recoveryTranscripts(
    messages: readonly SessionMessage[],
    workByMarker: ReadonlyMap<string, NativeRecoveryWork>,
  ): Map<string, NativeRecoveryTranscript> {
    const accepted = new Map<string, NativeRecoveryTranscript>()
    let current: NativeRecoveryTranscript | undefined
    for (const entry of messages) {
      if (entry.parent_tool_use_id != null || entry.parent_agent_id != null) continue
      if (entry.type === 'user') {
        const lines = sessionMessageText(entry).split('\n', 2)
        const work = workByMarker.get(lines[0] ?? '')
        if (work === undefined) {
          if (current !== undefined && isToolResultContinuation(entry)) continue
          current = undefined
          continue
        }
        const turnMarker = lines[1] ?? ''
        const stored = /^\[dsh-agent-team:turn:(claude-turn:[0-9a-f]{64})\]$/.exec(turnMarker)?.[1]
        if ((turnMarker !== '' && stored === undefined)
          || (stored !== undefined && stored !== work.id)) {
          throw new TeammateRuntimeError('Claude Code native turn marker conflicts with Team history', 'TEAM_RUNTIME_IDENTITY_CONFLICT')
        }
        if (accepted.has(work.id)) {
          throw new TeammateRuntimeError('Claude Code native Session repeats a Team work marker', 'TEAM_RUNTIME_IDENTITY_CONFLICT')
        }
        current = { work, messages: [] }
        accepted.set(work.id, current)
      } else if (entry.type === 'assistant' && current !== undefined) {
        current.messages.push(entry)
      }
    }
    return accepted
  }

  private async recoverNativeSession(
    session: NativeSession,
    messages: readonly SessionMessage[],
    grant: NativeMemberGrant,
    signal: AbortSignal,
  ): Promise<void> {
    if (grant.identity.provider !== this.id || grant.identity.nativeHandle !== session.handle
      || grant.identity.memberId !== session.memberId) {
      throw new TeammateRuntimeError('Claude Code Team grant targets another native Session', 'TEAM_RUNTIME_IDENTITY_CONFLICT')
    }
    const facts = await this.readNativeRecovery(grant, signal)
    if (grant.signal.aborted || session.grant !== grant) {
      throw new TeammateRuntimeError(
        'Claude Code native recovery authority changed before reconciliation',
        'TEAM_RUNTIME_UNAVAILABLE',
      )
    }
    const launchFacts = facts.filter((item): item is Extract<NativeMemberRecoveryItem, { kind: 'launch' }> => item.kind === 'launch')
    if (launchFacts.length !== 1 || launchFacts[0]!.launchRequestId !== session.launchRequestId) {
      throw new TeammateRuntimeError('Claude Code launch recovery identity conflicts with Team history', 'TEAM_RUNTIME_IDENTITY_CONFLICT')
    }
    const launchId = turnId(session.handle, session.launchRequestId)
    if (launchFacts[0]!.turnId !== undefined && launchFacts[0]!.turnId !== launchId) {
      throw new TeammateRuntimeError('Claude Code launch turn conflicts with Team history', 'TEAM_RUNTIME_IDENTITY_CONFLICT')
    }
    const workByTurn = new Map<string, NativeRecoveryWork>()
    const launchWork: NativeRecoveryWork = {
      kind: 'launch', id: launchId,
      marker: operationMarker('launch', this.id, session.launchRequestId, session.memberId),
    }
    workByTurn.set(launchId, launchWork)
    for (const item of facts) {
      if (item.kind !== 'delivery') continue
      const id = turnId(session.handle, item.deliveryId)
      workByTurn.set(id, {
        kind: 'delivery', id, deliveryId: item.deliveryId,
        marker: operationMarker('delivery', session.handle, item.deliveryId),
      })
    }
    const settlements = new Map<string, Extract<NativeMemberRecoveryItem, { kind: 'settlement' }>>()
    for (const item of facts) {
      if (item.kind !== 'settlement') continue
      if (!workByTurn.has(item.turnId)) {
        throw new TeammateRuntimeError('Claude Code settlement recovery identity conflicts with Team history', 'TEAM_RUNTIME_IDENTITY_CONFLICT')
      }
      settlements.set(item.turnId, item)
    }
    const workByMarker = new Map([...workByTurn.values()].map(work => [work.marker, work]))
    const transcripts = this.recoveryTranscripts(messages, workByMarker)
    if (!transcripts.has(launchId)) {
      throw new TeammateRuntimeError('Claude Code native Session lost its launch history', 'TEAM_RUNTIME_IDENTITY_CONFLICT')
    }
    for (const work of workByTurn.values()) {
      const transcript = transcripts.get(work.id)
      const committed = settlements.get(work.id)
      if (transcript === undefined && committed === undefined) continue
      if (work.deliveryId !== undefined) session.deliveries.set(work.deliveryId, work.id)
      let timestamp: number | undefined
      let nativeTerminal: TurnTerminal | undefined
      let inputTokens = 0
      let outputTokens = 0
      let cacheReadTokens = 0
      let cacheWriteTokens = 0
      let usageTimestamp: number | undefined
      let validUsage = true
      for (const entry of transcript?.messages ?? []) {
        const raw = entry as unknown as Record<string, unknown>
        if (entry.message === null || typeof entry.message !== 'object' || Array.isArray(entry.message)) continue
        const parsedTimestamp = typeof raw.timestamp === 'string' ? Date.parse(raw.timestamp) : Number.NaN
        const message = entry.message as Record<string, unknown>
        const assistant = message.role === 'assistant'
        const normalModel = assistant && typeof message.model === 'string'
          && message.model.trim().length > 0 && message.model !== '<synthetic>'
        const recoveredText = sessionMessageText(entry)
        const terminalOutcome: TurnOutcome | undefined = assistant
          && message.model === '<synthetic>' && message.stop_reason === 'stop_sequence'
          ? 'failed'
          : normalModel && message.stop_reason === 'end_turn' && Array.isArray(message.content)
            ? 'completed'
            : undefined
        if (committed !== undefined && terminalOutcome !== undefined && terminalOutcome !== committed.outcome) break
        timestamp = Number.isSafeInteger(parsedTimestamp) && parsedTimestamp >= 0 ? parsedTimestamp : undefined
        if (timestamp === undefined) session.evidenceIncomplete = true
        else this.recordAssistantTools(session, work.id, raw, timestamp)
        const usage = claudeUsage(message.usage)
        if (message.usage !== undefined && timestamp !== undefined) usageTimestamp = timestamp
        if (message.usage !== undefined && usage === undefined) validUsage = false
        // A dated usage fact retains its own time even when later terminal
        // history is undated. Never attach undated counters to that earlier time.
        if (usage !== undefined && validUsage && timestamp !== undefined) {
          const next: [number, number, number, number] = [
            inputTokens + usage.inputTokens,
            outputTokens + usage.outputTokens,
            cacheReadTokens + (usage.cacheReadTokens ?? 0),
            cacheWriteTokens + (usage.cacheWriteTokens ?? 0),
          ]
          if (next.every(Number.isSafeInteger) && Number.isSafeInteger(next.reduce((sum, value) => sum + value, 0))) {
            inputTokens = next[0]
            outputTokens = next[1]
            cacheReadTokens = next[2]
            cacheWriteTokens = next[3]
          } else {
            validUsage = false
          }
        }
        // Public SDK history omits the outer API-error flag; the locked
        // payload's synthetic model and stop reason remain a stable failure proof.
        if (terminalOutcome === 'failed') {
          nativeTerminal = { outcome: 'failed', timestamp, text: terminalText('failed', '') }
          break
        } else if (terminalOutcome === 'completed') {
          nativeTerminal = { outcome: 'completed', timestamp,
            text: terminalText('completed', recoveredText) }
          break
        }
      }
      const terminal: TurnTerminal = committed === undefined
        ? nativeTerminal ?? { outcome: 'interrupted', timestamp: undefined, text: terminalText('interrupted', '') }
        : { outcome: committed.outcome, timestamp: nativeTerminal?.timestamp, text: committed.text }
      await this.queueSettlement(session, work.id, terminal)
      if (usageTimestamp !== undefined) {
        const usage = validUsage ? Object.freeze({
          inputTokens, outputTokens,
          totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
          ...(cacheReadTokens === 0 ? {} : { cacheReadTokens }),
          ...(cacheWriteTokens === 0 ? {} : { cacheWriteTokens }),
        }) : undefined
        this.addEvidence(session, {
          id: evidenceId('usage', session.handle, work.id),
          kind: 'usage', timestamp: usageTimestamp, turnId: work.id,
          ...(usage === undefined ? {} : { usage }),
        })
      }
      this.recordTerminalEvidence(session, work.id, terminal)
    }
  }

  private recordTerminalEvidence(session: NativeSession, id: ReturnType<typeof TeammateRuntimeTurnId>, terminal: TurnTerminal): void {
    // The timestamp-required evidence boundary cannot represent an undated
    // terminal. Its independent Team settlement still preserves the outcome.
    if (terminal.timestamp === undefined) {
      session.evidenceIncomplete = true
      return
    }
    this.addEvidence(session, {
      id: evidenceId('turn', session.handle, id),
      kind: 'turn', timestamp: terminal.timestamp, turnId: id, outcome: terminal.outcome,
    })
  }

  private addEvidence(session: NativeSession, item: TeammateRuntimeEvidenceItem): void {
    if (session.evidence.some(known => known.id === item.id)) return
    session.evidence.push(Object.freeze(item))
    if (session.evidence.length > this.config.maxEvidenceItems) session.evidence.shift()
  }

  private async inspect(handle: string, signal: AbortSignal): Promise<NativeInspection> {
    signal.throwIfAborted()
    const [info, messages] = await raceAbort(Promise.all([
      getSessionInfo(handle, { dir: this.config.cwd }),
      getSessionMessages(handle, { dir: this.config.cwd }),
    ]), signal)
    if (info !== undefined && info.sessionId !== handle) {
      throw new TeammateRuntimeError(
        'Claude Code native Session lookup returned a different identity',
        'TEAM_RUNTIME_IDENTITY_CONFLICT',
      )
    }
    if (messages.some(message => message.session_id !== handle)) {
      throw new TeammateRuntimeError(
        'Claude Code native Session transcript returned a different identity',
        'TEAM_RUNTIME_IDENTITY_CONFLICT',
      )
    }
    return { exists: info !== undefined || messages.length > 0, messages }
  }

  private attachSession(handle: string, launchRequestId: string, memberId: string): NativeSession {
    const attached = this.sessions.get(handle)
    if (attached !== undefined && !attached.disposed) {
      if (attached.launchRequestId !== launchRequestId || attached.memberId !== memberId) {
        throw new TeammateRuntimeError('Claude Code native Session is attached to another member', 'TEAM_RUNTIME_IDENTITY_CONFLICT')
      }
      return attached
    }
    const session: NativeSession = {
      grant: undefined,
      memberBound: Promise.withResolvers<NativeMemberGrant>(),
      ownership: new AbortController(),
      recoveries: new Set(),
      settlements: new Set(),
      pendingTerminals: new Map(),
      settlementOperations: new Map(),
      handle: TeammateRuntimeHandle(handle),
      launchRequestId,
      memberId,
      evidence: [],
      evidenceIncomplete: false,
      deliveries: new Map(),
      deliveryOperations: new Map(),
      recoveryMessages: undefined,
      recoveryIncomplete: false,
      recovery: Promise.resolve(),
      deliveryTail: Promise.resolve(),
      presence: 'idle',
      current: undefined,
      disposed: false,
    }
    this.sessions.set(handle, session)
    return session
  }

  private session(handle: string): NativeSession {
    const session = this.sessions.get(handle)
    if (session === undefined || session.disposed) {
      throw new TeammateRuntimeError(
        'Claude Code native Session is not attached to this provider generation',
        'TEAM_RUNTIME_IDENTITY_CONFLICT',
      )
    }
    return session
  }

  private assertSessionAttached(session: NativeSession): void {
    if (session.disposed) {
      throw new TeammateRuntimeError(
        'Claude Code native Session is not attached to this provider generation',
        'TEAM_RUNTIME_IDENTITY_CONFLICT',
      )
    }
  }

  private handle(launchRequestId: string, memberId: string): string {
    return stableUuid(this.id, launchRequestId, memberId)
  }

  private result(
    session: NativeSession,
    acceptedTurnId: ReturnType<typeof TeammateRuntimeTurnId>,
  ): TeammateRuntimeCreateResult {
    return {
      nativeHandle: session.handle,
      turnId: acceptedTurnId,
      presence: session.presence,
      memberOperations: this.memberOperations,
    }
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new TeammateRuntimeError(
        'Claude Code durable runtime is disposing',
        'TEAM_RUNTIME_UNAVAILABLE',
      )
    }
  }

  private operationSignal(signal: AbortSignal): AbortSignal {
    const combined = AbortSignal.any([signal, this.lifecycle.signal])
    if (combined.aborted) throw abortError(combined)
    return combined
  }

  private async disposeSession(session: NativeSession): Promise<void> {
    if (session.disposing !== undefined) {
      await session.disposing
      return
    }
    session.disposed = true
    session.ownership.abort()
    session.current?.interrupt()
    const disposal = Promise.allSettled([
      session.current?.done ?? Promise.resolve(),
      ...session.recoveries,
      session.deliveryTail,
      ...session.settlements,
    ]).then(() => {
      this.removeSession(session)
      this.emitPresence(session, 'inactive')
    })
    session.disposing = disposal
    await disposal
  }

  private removeSession(session: NativeSession): void {
    this.sessions.delete(session.handle)
    session.current = undefined
    session.evidence.splice(0)
    session.deliveries.clear()
    session.deliveryOperations.clear()
    session.recoveryMessages = undefined
    session.recoveryIncomplete = false
    session.pendingTerminals.clear()
    session.settlementOperations.clear()
  }

  private async disposeStartedProcess(
    query: Query | undefined,
    child: SubprocessHandle | undefined,
  ): Promise<void> {
    const failures: unknown[] = []
    if (query !== undefined) {
      try {
        query.close()
      } catch (error: unknown) {
        failures.push(error)
      }
    }
    if (child !== undefined) {
      try {
        child.terminate()
      } catch (error: unknown) {
        failures.push(error)
      }
      try {
        await child.waitForExit()
      } catch (error: unknown) {
        failures.push(error)
      }
      await child.done.catch((error: unknown) => { failures.push(error) })
    }
    if (failures.length > 0) throw new AggregateError(failures, 'Claude Code process cleanup failed')
  }

  private emitPresence(session: NativeSession, presence: TeammateRuntimePresenceEvent['presence']): void {
    for (const listener of [...this.presenceListeners]) {
      try {
        listener({ nativeHandle: session.handle, presence })
      } catch {
        // Observation cannot change native Session ownership.
      }
    }
  }

  private failure(stage: FailureStage, _cause: unknown): TeammateRuntimeError {
    return new TeammateRuntimeError(
      `Claude Code durable runtime failed during ${stage}`,
      'TEAM_RUNTIME_UNAVAILABLE',
    )
  }
}

/** Register one Fiber-owned durable Claude Code teammate runtime provider. */
export function apply(ctx: Context, config: Config): void {
  if ((config as { readonly sandbox?: unknown }).sandbox !== undefined && config.sandbox !== 'read-only') {
    throw new Error('agent-team-claude-code: sandbox cannot be weaker than read-only')
  }
  const disposeGraceMs = config.disposeGraceMs ?? DEFAULT_DISPOSE_GRACE_MS
  if (!Number.isFinite(disposeGraceMs) || disposeGraceMs <= 0 || disposeGraceMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `agent-team-claude-code: disposeGraceMs must be positive and no greater than ${MAX_TIMER_DELAY_MS}`,
    )
  }
  const maxEvidenceItems = config.maxEvidenceItems ?? DEFAULT_MAX_EVIDENCE_ITEMS
  if (!Number.isSafeInteger(maxEvidenceItems) || maxEvidenceItems < 1) {
    throw new Error('agent-team-claude-code: maxEvidenceItems must be a positive safe integer')
  }
  const eligibility = claudeCodeProductEligibility()
  if (!eligibility.eligible) {
    ctx.logger.warn(`agent-team-claude-code: durable provider unavailable (${eligibility.reason})`)
    return
  }
  const provider = new ClaudeCodeTeammateRuntimeProvider(ctx, {
    providerName: config.providerName ?? DEFAULT_PROVIDER_NAME,
    cwd: resolve(config.cwd ?? process.cwd()),
    ...config.model === undefined ? {} : { model: config.model },
    disposeGraceMs,
    maxEvidenceItems,
  })
  mountTeammateRuntimeProvider(
    ctx,
    provider,
    async () => { await provider.close() },
    config.catalogOwnerService,
  )
}
