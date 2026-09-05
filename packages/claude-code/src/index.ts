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
  return Object.freeze({
    inputTokens: inputTokens as number,
    outputTokens: outputTokens as number,
    totalTokens: (inputTokens as number) + (outputTokens as number)
      + (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0),
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
  readonly handle: ReturnType<typeof TeammateRuntimeHandle>
  readonly evidence: TeammateRuntimeEvidenceItem[]
  readonly deliveries: Map<string, ReturnType<typeof TeammateRuntimeTurnId>>
  readonly deliveryOperations: Map<string, Promise<TeammateRuntimeDeliverResult>>
  deliveryTail: Promise<void>
  presence: 'running' | 'idle'
  current: ActiveTurn | undefined
  disposed: boolean
  disposing?: Promise<void>
}

interface ActiveTurn {
  readonly id: ReturnType<typeof TeammateRuntimeTurnId>
  readonly accepted: Promise<void>
  readonly done: Promise<TurnTerminal>
  interrupt(): void
}

interface TurnTerminal {
  readonly outcome: TurnOutcome
  readonly timestamp: number
}

interface NativeInspection {
  readonly exists: boolean
  readonly messages: readonly SessionMessage[]
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

function containsMarker(value: unknown, marker: string, budget: { remaining: number }, depth = 0): boolean {
  if (budget.remaining <= 0 || depth > 8) return false
  budget.remaining -= 1
  if (typeof value === 'string') return value.includes(marker)
  if (Array.isArray(value)) {
    return value.some(item => containsMarker(item, marker, budget, depth + 1))
  }
  if (value === null || typeof value !== 'object') return false
  return Object.values(value).some(item => containsMarker(item, marker, budget, depth + 1))
}

function transcriptContains(messages: readonly SessionMessage[], marker: string): boolean {
  const budget = { remaining: 16_384 }
  return messages.some(message => message.type === 'user'
    && containsMarker(message.message, marker, budget))
}

function assertRequirements(requirements: TeammateRuntimeRequirements): void {
  const allowedProfiles = new Set(['persona', 'mission', 'context', 'memory'])
  const allowedRuntime = new Set(['sandbox', 'evidence', 'usage'])
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

class ClaudeCodeTeammateRuntimeProvider implements TeammateRuntimeProvider {
  readonly id: string
  readonly displayName = 'Claude Code'
  readonly contextModes = ['fresh'] as const
  readonly profileCapabilities = ['persona', 'mission', 'context', 'memory'] as const
  readonly runtimeCapabilities = ['sandbox', 'evidence', 'usage'] as const
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
      const session = this.attachSession(expected)
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

  evidence(request: TeammateRuntimeEvidenceRequest): Promise<TeammateRuntimeEvidenceResult> {
    return Promise.resolve().then(() => {
      this.operationSignal(request.signal)
      const session = this.session(request.nativeHandle)
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
        complete: end === session.evidence.length,
      }
    })
  }

  async dispose(request: TeammateRuntimeDisposeRequest): Promise<void> {
    if (request.kind !== 'runtime') return
    const session = this.sessions.get(request.nativeHandle)
    if (session !== undefined) await this.disposeSession(session)
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
        session = this.attachSession(handle)
        return this.result(session, turnId(handle, request.launchRequestId))
      }
      if (inspection.exists) {
        throw new TeammateRuntimeError(
          'Claude Code native Session is already owned by another launch',
          'TEAM_RUNTIME_IDENTITY_CONFLICT',
        )
      }
      const work = textInput(request.initialWork)
      session = this.attachSession(handle)
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
        prompt,
        options: this.queryOptions(session.handle, mode, controller, capture),
      })
      if (child === undefined || child.pid <= 0) {
        throw new Error('agent-team-claude-code: SDK did not publish a controllable process')
      }
    } catch (error: unknown) {
      removeRequestAbort()
      const failure = this.failure('query-start', error)
      controller.abort(failure)
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
      id,
      accepted: accepted.promise,
      done: Promise.resolve({ outcome: 'failed', timestamp: Date.now() }),
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
    let failure: unknown
    try {
      for await (const message of query) {
        const nativeId = messageSessionId(message)
        if (nativeId !== undefined && nativeId !== session.handle) {
          throw new Error('agent-team-claude-code: SDK returned a different Session')
        }
        if (nativeId !== undefined) markAccepted()
        const terminal = this.recordMessage(session, turn.id, message)
        if (terminal !== undefined) {
          sawResult = true
          outcome = terminal
        }
      }
      if (!accepted()) throw new Error('agent-team-claude-code: SDK ended before accepting work')
      if (!sawResult) outcome = controller.signal.aborted ? 'interrupted' : 'failed'
    } catch (error: unknown) {
      failure = error
      outcome = controller.signal.aborted ? 'interrupted' : 'failed'
      if (!accepted()) rejectAccepted(this.failure('query-run', error))
    } finally {
      removeRequestAbort()
      try {
        await this.disposeStartedProcess(query, child)
      } catch (error: unknown) {
        failure ??= error
        outcome = 'failed'
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
    return { outcome, timestamp: Date.now() }
  }

  private queryOptions(
    handle: string,
    mode: 'new' | 'resume',
    controller: AbortController,
    spawn: (options: SpawnOptions) => ManagedClaudeCodeProcess,
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
      allowedTools: [...FIXED_TOOLS],
      settingSources: [],
      skills: [],
      plugins: [],
      mcpServers: {},
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
    const usage = claudeUsage(value.usage)
    this.addEvidence(session, {
      id: evidenceId('usage', session.handle, id, String(session.evidence.length)),
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
        timestamp: Date.now(),
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
      this.addEvidence(session, {
        id: evidenceId('turn', session.handle, turn.id),
        kind: 'turn',
        timestamp: terminal.timestamp,
        turnId: turn.id,
        outcome: terminal.outcome,
      })
      session.presence = 'idle'
      this.emitPresence(session, 'idle')
    })
  }

  private addEvidence(session: NativeSession, item: TeammateRuntimeEvidenceItem): void {
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

  private attachSession(handle: string): NativeSession {
    const attached = this.sessions.get(handle)
    if (attached !== undefined && !attached.disposed) return attached
    const session: NativeSession = {
      handle: TeammateRuntimeHandle(handle),
      evidence: [],
      deliveries: new Map(),
      deliveryOperations: new Map(),
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
    session.current?.interrupt()
    const disposal = Promise.allSettled([
      session.current?.done ?? Promise.resolve(),
      session.deliveryTail,
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
