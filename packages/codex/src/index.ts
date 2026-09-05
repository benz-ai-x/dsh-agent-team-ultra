/** Durable Codex App Server adapter for the Agent Team teammate-runtime seam. */

import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import type { Readable, Writable } from 'node:stream'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { JsonRpcLineTransport } from '@deepseek-ai/dsh-sdk-protocol'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
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
  type TeammateRuntimeResumeRequest,
} from '@deepseek-ai/dsh-experimental-agent-team'
import type {
  SubprocessHandle,
  SubprocessSpawnSpec,
} from '@deepseek-ai/dsh-subprocess'
import { codexPackageBin, codexProductEligibility } from './product.ts'

export { codexProductEligibility } from './product.ts'
export type { CodexProductEligibility } from './product.ts'
export type {
  RuntimeCatalogOwnerService,
  RuntimeCatalogRegistration,
} from '@deepseek-ai/dsh-experimental-agent-team'

export const name = 'agent-team-codex'
export const inject = ['agentTeams', 'subprocess']

const DEFAULT_PROVIDER_NAME = 'codex'
const DEFAULT_DISPOSE_GRACE_MS = 3_000
const DEFAULT_MAX_EVIDENCE_ITEMS = 512

type JsonObject = Record<string, unknown>
type SandboxMode = 'read-only' | 'workspace-write'
type TurnOutcome = 'completed' | 'interrupted' | 'failed'

/** Deployment-owned durable Codex adapter settings. */
export interface Config {
  /** Stable provider id registered with Agent Teams. */
  readonly providerName?: string
  /** Optional service whose registerExternalRuntimeProvider(provider) call returns this generation's disposer. */
  readonly catalogOwnerService?: string
  /** Workspace path resolved to absolute for every native thread owned by this instance. */
  readonly cwd?: string
  /** Optional native Codex model pinned for this provider generation. */
  readonly model?: string
  /** Explicit environment layered over the subprocess seam's scrubbed parent. */
  readonly env?: Readonly<Record<string, string>>
  /** Deployment-owned confinement; Profiles cannot weaken this value. */
  readonly sandbox?: SandboxMode
  /** Grace for exact process-tree termination. */
  readonly disposeGraceMs?: number
  /** Maximum fixed-shape evidence facts retained per attached thread. */
  readonly maxEvidenceItems?: number
}

/** Loader schema for deployment-owned Codex adapter settings. */
export const Config: z<Config> = z.object({
  providerName: z.string().min(1).default(DEFAULT_PROVIDER_NAME),
  catalogOwnerService: z.string().min(1),
  cwd: z.string().min(1).default(process.cwd()),
  model: z.string().min(1),
  env: z.dict(z.string()).default({}),
  sandbox: z.union(['read-only', 'workspace-write']).default('read-only'),
  disposeGraceMs: z.number().default(DEFAULT_DISPOSE_GRACE_MS),
  maxEvidenceItems: z.number().step(1).min(1).default(DEFAULT_MAX_EVIDENCE_ITEMS),
})

interface ResolvedConfig {
  readonly providerName: string
  readonly cwd: string
  readonly model?: string
  readonly env: Record<string, string>
  readonly sandbox: SandboxMode
  readonly disposeGraceMs: number
  readonly maxEvidenceItems: number
}

interface ThreadSnapshot {
  readonly id: string
  readonly projectId?: string
  readonly ephemeral?: boolean
  readonly status?: unknown
  readonly turns: readonly JsonObject[]
}

interface AcceptedTurn {
  readonly id: string
  readonly done: Promise<TurnTerminal>
}

interface TurnTerminal {
  readonly id: string
  readonly outcome: TurnOutcome
  readonly timestamp: number
}

function object(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`agent-team-codex: invalid ${label}`)
  }
  return value as JsonObject
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`agent-team-codex: invalid ${label}`)
  }
  return value
}

function codexUsage(value: unknown): TeammateRuntimeEvidenceItem['usage'] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const envelope = value as JsonObject
  const selected = envelope.total !== null && typeof envelope.total === 'object' && !Array.isArray(envelope.total)
    ? envelope.total as JsonObject
    : envelope
  const count = (key: string): number | undefined => {
    const candidate = selected[key]
    return Number.isSafeInteger(candidate) && (candidate as number) >= 0 ? candidate as number : undefined
  }
  const aggregateInput = count('inputTokens')
  const outputTokens = count('outputTokens')
  if (aggregateInput === undefined || outputTokens === undefined) return undefined
  const cacheReadTokens = count('cachedInputTokens')
  const inputTokens = Math.max(0, aggregateInput - (cacheReadTokens ?? 0))
  const totalTokens = count('totalTokens') ?? aggregateInput + outputTokens
  const reasoningTokens = count('reasoningOutputTokens')
  return Object.freeze({
    inputTokens,
    outputTokens,
    totalTokens,
    ...(cacheReadTokens === undefined ? {} : { cacheReadTokens }),
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
  })
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error('agent-team-codex: operation aborted')
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

function textInput(content: readonly { readonly type: string; readonly text?: string }[]): string[] {
  if (content.length === 0 || content.some(block => block.type !== 'text' || typeof block.text !== 'string')) {
    throw new TeammateRuntimeError(
      'Codex durable runtime accepts non-empty text input only',
      'TEAM_RUNTIME_CAPABILITY_MISMATCH',
    )
  }
  const texts = content.map(block => block.text as string)
  if (texts.every(text => text.trim().length === 0)) {
    throw new TeammateRuntimeError(
      'Codex durable runtime accepts non-empty text input only',
      'TEAM_RUNTIME_CAPABILITY_MISMATCH',
    )
  }
  return texts
}

function projectKey(providerId: string, launchRequestId: string, memberId: string): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([providerId, launchRequestId, memberId]))
    .digest('hex')
  return `dsh-agent-team-codex:${digest}`
}

function launchInputId(launchRequestId: string): string {
  return `dsh-launch:${launchRequestId}`
}

function evidenceId(kind: string, ...nativeIdentity: readonly string[]): ReturnType<typeof TeammateRuntimeEvidenceId> {
  const digest = createHash('sha256')
    .update(JSON.stringify([kind, ...nativeIdentity]))
    .digest('hex')
  return TeammateRuntimeEvidenceId(`codex-evidence:${digest}`)
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

function terminalOutcome(value: unknown): TurnOutcome {
  if (value === 'completed' || value === 'interrupted' || value === 'failed') return value
  throw new Error('agent-team-codex: invalid terminal turn status')
}

function threadPresence(status: unknown): 'running' | 'idle' {
  if (status !== null && typeof status === 'object' && !Array.isArray(status)
    && (status as JsonObject).type === 'active') return 'running'
  return 'idle'
}

function recoveredInputs(turns: readonly JsonObject[]): Map<string, string> {
  const result = new Map<string, string>()
  for (const turn of turns) {
    const turnId = typeof turn.id === 'string' ? turn.id : undefined
    const items = Array.isArray(turn.items) ? turn.items : []
    if (turnId === undefined) continue
    for (const raw of items) {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue
      const item = raw as JsonObject
      if (item.type === 'userMessage' && typeof item.clientId === 'string') {
        result.set(item.clientId, turnId)
      }
    }
  }
  return result
}

function recoveredDeliveries(
  inputs: ReadonlyMap<string, string>,
): Map<string, ReturnType<typeof TeammateRuntimeTurnId>> {
  const deliveries = new Map<string, ReturnType<typeof TeammateRuntimeTurnId>>()
  for (const [clientId, turnId] of inputs) {
    if (clientId.startsWith('dsh-delivery:')) {
      deliveries.set(clientId.slice('dsh-delivery:'.length), TeammateRuntimeTurnId(turnId))
    }
  }
  return deliveries
}

class CodexConnection {
  private readonly transport: JsonRpcLineTransport
  private readonly fatal = Promise.withResolvers<never>()
  private active: {
    id?: string
    readonly completion: PromiseWithResolvers<TurnTerminal>
    terminal?: TurnTerminal
  } | undefined
  private threadId: string | undefined
  private closed = false

  constructor(
    private readonly input: Readable,
    output: Writable,
    private readonly onItem: (params: JsonObject) => void,
    private readonly onUsage: (params: JsonObject) => void,
  ) {
    this.transport = new JsonRpcLineTransport(input, output)
    void this.fatal.promise.catch(() => {})
    this.transport.onRequest((method, params) => this.handleRequest(method, params))
    this.transport.onNotification((method, params) => {
      try {
        this.handleNotification(method, params)
      } catch (error: unknown) {
        this.fail(error)
      }
    })
    input.on('error', this.onInputError)
    input.on('end', this.onInputEnd)
    output.on('error', this.onOutputError)
  }

  start(): void {
    this.transport.start()
  }

  async initialize(signal: AbortSignal): Promise<void> {
    object(await this.guarded(this.transport.request('initialize', {
      clientInfo: {
        name: 'deepseek-harness-agent-team',
        title: 'DeepSeek Harness Agent Team',
        version: '0.0.1',
      },
      capabilities: { experimentalApi: true, requestAttestation: false },
    }, signal), signal), 'initialize response')
    this.transport.notify('initialized')
    await this.guarded(this.transport.flush(), signal)
  }

  async findThread(nativeProjectId: string, signal: AbortSignal): Promise<ThreadSnapshot | undefined> {
    const response = object(await this.guarded(this.transport.request('thread/list', {
      projectId: nativeProjectId,
      limit: 2,
      useStateDbOnly: true,
    }, signal), signal), 'thread/list response')
    if (!Array.isArray(response.data)) throw new Error('agent-team-codex: invalid thread/list data')
    const matches = response.data.map(value => this.thread(value, 'thread/list thread'))
      .filter(thread => thread.projectId === undefined || thread.projectId === nativeProjectId)
    if (matches.length > 1) {
      throw new TeammateRuntimeError(
        'Codex durable runtime found conflicting native threads for one launch',
        'TEAM_RUNTIME_IDENTITY_CONFLICT',
      )
    }
    return matches[0]
  }

  async ensureProject(idempotencyKey: string, cwd: string, signal: AbortSignal): Promise<string> {
    const response = object(await this.guarded(this.transport.request('project/create', {
      name: `DSH Codex teammate ${idempotencyKey.slice(-12)}`,
      roots: [{ path: cwd }],
      metadata: { owner: 'deepseek-harness-agent-team' },
      idempotencyKey,
    }, signal), signal), 'project/create response')
    const project = object(response.project, 'project/create project')
    return string(project.id, 'project/create project id')
  }

  async startThread(
    nativeProjectId: string,
    instructions: string,
    config: ResolvedConfig,
    signal: AbortSignal,
  ): Promise<ThreadSnapshot> {
    const response = object(await this.guarded(this.transport.request('thread/start', {
      cwd: config.cwd,
      projectId: nativeProjectId,
      ephemeral: false,
      historyMode: 'legacy',
      approvalPolicy: 'never',
      sandbox: config.sandbox,
      developerInstructions: instructions,
      ...config.model === undefined ? {} : { model: config.model },
    }, signal), signal), 'thread/start response')
    this.assertEffectivePolicy(response, config)
    const thread = this.thread(response.thread, 'thread/start thread')
    if (thread.ephemeral !== false) throw new Error('agent-team-codex: Codex did not persist the native thread')
    if (thread.projectId !== undefined && thread.projectId !== nativeProjectId) {
      throw new Error('agent-team-codex: Codex returned a different project identity')
    }
    this.threadId = thread.id
    return thread
  }

  async resumeThread(
    threadId: string,
    nativeProjectId: string,
    config: ResolvedConfig,
    signal: AbortSignal,
  ): Promise<ThreadSnapshot> {
    const response = object(await this.guarded(this.transport.request('thread/resume', {
      threadId,
      cwd: config.cwd,
      approvalPolicy: 'never',
      sandbox: config.sandbox,
      ...config.model === undefined ? {} : { model: config.model },
    }, signal), signal), 'thread/resume response')
    this.assertEffectivePolicy(response, config)
    const thread = this.thread(response.thread, 'thread/resume thread')
    if (
      thread.id !== threadId
      || thread.ephemeral === true
      || (thread.projectId !== undefined && thread.projectId !== nativeProjectId)
    ) {
      throw new Error('agent-team-codex: Codex resumed a different or ephemeral native thread')
    }
    this.threadId = thread.id
    return thread
  }

  private assertEffectivePolicy(response: JsonObject, config: ResolvedConfig): void {
    if (response.approvalPolicy !== 'never') {
      throw new Error('agent-team-codex: Codex returned a different approval policy')
    }
    const sandbox = object(response.sandbox, 'effective sandbox')
    const expectedType = config.sandbox === 'read-only' ? 'readOnly' : 'workspaceWrite'
    if (sandbox.type !== expectedType || sandbox.networkAccess !== false) {
      throw new Error('agent-team-codex: Codex returned a broader sandbox policy')
    }
  }

  async startTurn(texts: readonly string[], clientId: string, signal: AbortSignal): Promise<AcceptedTurn> {
    if (this.threadId === undefined || this.active !== undefined) {
      throw new Error('agent-team-codex: native thread is not ready for a new turn')
    }
    const completion = Promise.withResolvers<TurnTerminal>()
    this.active = { completion }
    let id: string
    try {
      const response = object(await this.guarded(this.transport.request('turn/start', {
        threadId: this.threadId,
        clientUserMessageId: clientId,
        input: texts.map(text => ({ type: 'text', text, text_elements: [] })),
      }, signal), signal), 'turn/start response')
      const turn = object(response.turn, 'turn/start turn')
      id = string(turn.id, 'turn/start turn id')
      if (this.active.id !== undefined && this.active.id !== id) {
        throw new Error('agent-team-codex: turn/start identity mismatch')
      }
      this.active.id = id
      const early = this.active.terminal
      if (early !== undefined) this.finishTurn(early)
    } catch (error: unknown) {
      this.active = undefined
      completion.reject(error)
      void completion.promise.catch(() => {})
      throw error
    }
    return { id, done: completion.promise }
  }

  interrupt(): void {
    const turnId = this.active?.id
    if (this.closed || this.threadId === undefined || turnId === undefined) return
    void this.transport.request('turn/interrupt', {
      threadId: this.threadId,
      turnId,
    }).catch(() => {})
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.input.off('error', this.onInputError)
    this.input.off('end', this.onInputEnd)
    this.transport.close()
    this.active?.completion.reject(new Error('agent-team-codex: native connection closed'))
    this.active = undefined
  }

  private thread(value: unknown, label: string): ThreadSnapshot {
    const thread = object(value, label)
    return {
      id: string(thread.id, `${label} id`),
      ...(typeof thread.projectId === 'string' ? { projectId: thread.projectId } : {}),
      ...(typeof thread.ephemeral === 'boolean' ? { ephemeral: thread.ephemeral } : {}),
      ...(thread.status === undefined ? {} : { status: thread.status }),
      turns: Array.isArray(thread.turns)
        ? thread.turns.map(turn => object(turn, `${label} turn`))
        : [],
    }
  }

  private async guarded<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
    return await raceAbort(Promise.race([pending, this.fatal.promise]), signal)
  }

  private fail(error: unknown): void {
    const normalized = error instanceof Error ? error : new Error('agent-team-codex: protocol failure')
    this.fatal.reject(normalized)
    this.active?.completion.reject(normalized)
    this.active = undefined
  }

  private readonly onInputError = (error: Error): void => { this.fail(error) }
  private readonly onOutputError = (error: Error): void => { this.fail(error) }
  private readonly onInputEnd = (): void => { this.fail(new Error('agent-team-codex: protocol stream closed')) }

  private validateRequest(params: JsonObject, nullableTurn = false): void {
    if (params.threadId !== this.threadId) throw new Error('agent-team-codex: request targeted another thread')
    if (nullableTurn && params.turnId === null) return
    const turnId = string(params.turnId, 'server request turn id')
    if (this.active === undefined) throw new Error('agent-team-codex: request targeted no active turn')
    if (this.active.id === undefined) this.active.id = turnId
    else if (this.active.id !== turnId) throw new Error('agent-team-codex: request targeted another turn')
  }

  private handleRequest(method: string, params: JsonObject): Promise<unknown> {
    switch (method) {
      case 'item/commandExecution/requestApproval':
      case 'item/fileChange/requestApproval': {
        this.validateRequest(params)
        const available = Array.isArray(params.availableDecisions) ? params.availableDecisions : []
        const decision = available.includes('cancel') ? 'cancel' : 'decline'
        return Promise.resolve({ decision })
      }
      case 'item/permissions/requestApproval':
        this.validateRequest(params)
        return Promise.resolve({ permissions: {}, scope: 'turn' })
      case 'item/tool/requestUserInput':
        this.validateRequest(params)
        return Promise.resolve({ answers: {} })
      case 'mcpServer/elicitation/request':
        this.validateRequest(params, true)
        return Promise.resolve({ action: 'decline', content: null, _meta: null })
      default:
        return Promise.reject(new Error('agent-team-codex: unsupported native request'))
    }
  }

  private handleNotification(method: string, params: JsonObject): void {
    if (params.threadId !== this.threadId) return
    if (method === 'turn/started') {
      const turn = object(params.turn, 'turn/started turn')
      const id = string(turn.id, 'turn/started turn id')
      if (this.active !== undefined) {
        if (this.active.id === undefined) this.active.id = id
        else if (this.active.id !== id) throw new Error('agent-team-codex: turn/started identity mismatch')
      }
      return
    }
    if (method === 'item/completed') {
      this.onItem(params)
      return
    }
    if (method === 'thread/tokenUsage/updated') {
      this.onUsage(params)
      return
    }
    if (method !== 'turn/completed') return
    const turn = object(params.turn, 'turn/completed turn')
    const terminal: TurnTerminal = {
      id: string(turn.id, 'turn/completed turn id'),
      outcome: terminalOutcome(turn.status),
      timestamp: typeof turn.completedAt === 'number'
        ? Math.trunc(turn.completedAt * 1_000)
        : Date.now(),
    }
    if (this.active === undefined) return
    if (this.active.id === undefined) {
      this.active.id = terminal.id
      this.active.terminal = terminal
      return
    }
    this.finishTurn(terminal)
  }

  private finishTurn(terminal: TurnTerminal): void {
    const active = this.active
    if (active === undefined || active.id !== terminal.id) return
    this.active = undefined
    active.completion.resolve(terminal)
  }
}

interface NativeSession {
  readonly handle: ReturnType<typeof TeammateRuntimeHandle>
  readonly correlationKey: string
  readonly projectId: string
  readonly child: SubprocessHandle
  readonly connection: CodexConnection
  readonly recoveredInputs: Map<string, string>
  readonly deliveries: Map<string, ReturnType<typeof TeammateRuntimeTurnId>>
  readonly evidence: TeammateRuntimeEvidenceItem[]
  presence: 'running' | 'idle'
  current: AcceptedTurn | undefined
  disposing?: Promise<void>
  disposed: boolean
}

class CodexTeammateRuntimeProvider implements TeammateRuntimeProvider {
  readonly id: string
  readonly displayName = 'Codex'
  readonly contextModes = ['fresh'] as const
  readonly profileCapabilities = ['persona', 'mission', 'context', 'memory'] as const
  readonly runtimeCapabilities = ['sandbox', 'evidence', 'usage'] as const
  private readonly sessions = new Map<string, NativeSession>()
  private readonly correlations = new Map<string, string>()
  private readonly creations = new Map<string, Promise<TeammateRuntimeCreateResult>>()
  private readonly presenceListeners = new Set<(event: TeammateRuntimePresenceEvent) => void>()
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
    const key = this.correlationKey(request.launchRequestId, request.memberId)
    const known = this.correlations.get(key)
    if (known !== undefined) {
      const session = this.sessions.get(known)
      if (session !== undefined && !session.disposed) return this.result(session)
    }
    const active = this.creations.get(key)
    if (active !== undefined) return await active
    const creation = this.createOnce(key, request)
    this.creations.set(key, creation)
    try {
      return await creation
    } finally {
      /* v8 ignore else -- only this settlement owns and can clear its exact in-flight creation promise. */
      if (this.creations.get(key) === creation) this.creations.delete(key)
    }
  }

  async resume(request: TeammateRuntimeResumeRequest): Promise<TeammateRuntimeCreateResult | undefined> {
    this.assertOpen()
    try {
      const key = this.correlationKey(request.launchRequestId, request.memberId)
      const expected = request.nativeHandle === undefined ? this.correlations.get(key) : request.nativeHandle
      if (expected !== undefined) {
        const attached = this.sessions.get(expected)
        if (attached !== undefined && !attached.disposed) return this.result(attached)
      }
      if (expected === undefined) {
        const discovered = await this.open(key, request.signal)
        if (discovered === undefined) return undefined
        this.correlations.set(key, discovered.handle)
        return this.result(discovered)
      }
      const opened = await this.open(key, request.signal, expected)
      this.correlations.set(key, opened.handle)
      return this.result(opened)
    } catch (error: unknown) {
      if (error instanceof TeammateRuntimeError) throw error
      throw this.failure('resume', error)
    }
  }

  async deliver(request: TeammateRuntimeDeliverRequest): Promise<TeammateRuntimeDeliverResult> {
    const session = await this.attach(request.nativeHandle, request.signal)
    const known = session.deliveries.get(request.deliveryId)
    if (known !== undefined) return { turnId: known, presence: session.presence }
    if (session.current !== undefined) {
      await raceAbort(session.current.done.catch(() => undefined), request.signal)
    }
    const turn = await session.connection.startTurn(
      textInput(request.content),
      `dsh-delivery:${request.deliveryId}`,
      request.signal,
    )
    const turnId = TeammateRuntimeTurnId(turn.id)
    session.deliveries.set(request.deliveryId, turnId)
    this.observeTurn(session, turn)
    return { turnId, presence: 'running' }
  }

  interrupt(request: TeammateRuntimeInterruptRequest): TeammateRuntimeInterruptResult {
    const session = this.sessions.get(request.nativeHandle)
    if (session === undefined || session.disposed) {
      return { previousStatus: 'inactive' }
    }
    const previousStatus = session.presence
    session.connection.interrupt()
    return { previousStatus }
  }

  evidence(request: TeammateRuntimeEvidenceRequest): Promise<TeammateRuntimeEvidenceResult> {
    return Promise.resolve().then(() => {
      request.signal.throwIfAborted()
      const session = this.session(request.nativeHandle)
      const offset = request.cursor === undefined ? 0 : Number(request.cursor)
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > session.evidence.length) {
        throw new TeammateRuntimeError(
          'Codex evidence cursor is invalid',
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
    if (session === undefined) return
    await this.disposeSession(session)
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    const outcomes = await Promise.allSettled([...this.sessions.values()].map(async (session) => {
      await this.disposeSession(session)
    }))
    this.creations.clear()
    this.correlations.clear()
    this.presenceListeners.clear()
    const failures: unknown[] = []
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') {
        const reason: unknown = outcome.reason
        failures.push(reason)
      }
    }
    if (failures.length > 0) throw new AggregateError(failures, 'Codex runtime cleanup failed')
  }

  private async createOnce(
    key: string,
    request: TeammateRuntimeCreateRequest,
  ): Promise<TeammateRuntimeCreateResult> {
    const texts = textInput(request.initialWork)
    let session: NativeSession | undefined
    try {
      session = await this.openNew(key, request.profile, request.signal)
      this.correlations.set(key, session.handle)
      const inputId = launchInputId(request.launchRequestId)
      const recoveredTurn = session.recoveredInputs.get(inputId)
      if (recoveredTurn !== undefined) {
        return this.result(session, TeammateRuntimeTurnId(recoveredTurn))
      }
      const turn = await session.connection.startTurn(texts, inputId, request.signal)
      this.observeTurn(session, turn)
      return {
        nativeHandle: session.handle,
        turnId: TeammateRuntimeTurnId(turn.id),
        presence: 'running',
      }
    } catch (error: unknown) {
      if (session !== undefined) await this.disposeSession(session).catch(() => {})
      if (error instanceof TeammateRuntimeError) throw error
      throw this.failure('creation', error)
    }
  }

  private async open(key: string, signal: AbortSignal): Promise<NativeSession | undefined>
  private async open(key: string, signal: AbortSignal, expectedHandle: string): Promise<NativeSession>
  private async open(
    key: string,
    signal: AbortSignal,
    expectedHandle?: string,
  ): Promise<NativeSession | undefined> {
    signal.throwIfAborted()
    const child = this.ctx.subprocess.spawn(this.spawnSpec())
    child.stderr?.resume()
    const eventSession: { current?: NativeSession } = {}
    const connection = new CodexConnection(
      child.stdout as NonNullable<SubprocessHandle['stdout']>,
      child.stdin as NonNullable<SubprocessHandle['stdin']>,
      (params) => { if (eventSession.current !== undefined) this.recordItem(eventSession.current, params) },
      (params) => { if (eventSession.current !== undefined) this.recordUsage(eventSession.current, params) },
    )
    try {
      connection.start()
      await connection.initialize(signal)
      const [launchRequestId, memberId] = JSON.parse(key) as [string, string]
      const nativeProjectId = await connection.ensureProject(
        projectKey(this.id, launchRequestId, memberId),
        this.config.cwd,
        signal,
      )
      let thread: ThreadSnapshot | undefined
      if (expectedHandle === undefined) {
        const listed = await connection.findThread(nativeProjectId, signal)
        if (listed === undefined) {
          await this.disposeProcess(connection, child)
          return undefined
        }
        thread = await connection.resumeThread(listed.id, nativeProjectId, this.config, signal)
      } else {
        thread = await connection.resumeThread(expectedHandle, nativeProjectId, this.config, signal)
      }
      const session = this.makeSession(key, nativeProjectId, thread, child, connection)
      eventSession.current = session
      this.sessions.set(session.handle, session)
      this.watchProcess(session)
      return session
    } catch (error: unknown) {
      await this.disposeProcess(connection, child).catch(() => {})
      if (expectedHandle === undefined && error instanceof Error && error.message.includes('thread not found')) {
        return undefined
      }
      throw error
    }
  }

  private async openNew(
    key: string,
    profile: TeammateRuntimeProfileSnapshot,
    signal: AbortSignal,
  ): Promise<NativeSession> {
    signal.throwIfAborted()
    const child = this.ctx.subprocess.spawn(this.spawnSpec())
    child.stderr?.resume()
    let sessionForEvents: NativeSession | undefined
    const connection = new CodexConnection(
      child.stdout as NonNullable<SubprocessHandle['stdout']>,
      child.stdin as NonNullable<SubprocessHandle['stdin']>,
      (params) => { if (sessionForEvents !== undefined) this.recordItem(sessionForEvents, params) },
      (params) => { if (sessionForEvents !== undefined) this.recordUsage(sessionForEvents, params) },
    )
    try {
      connection.start()
      await connection.initialize(signal)
      const parsed = JSON.parse(key) as [string, string]
      const nativeProjectId = await connection.ensureProject(
        projectKey(this.id, parsed[0], parsed[1]),
        this.config.cwd,
        signal,
      )
      const listed = await connection.findThread(nativeProjectId, signal)
      const thread = listed === undefined
        ? await connection.startThread(nativeProjectId, profileInstructions(profile), this.config, signal)
        : await connection.resumeThread(listed.id, nativeProjectId, this.config, signal)
      const session = this.makeSession(key, nativeProjectId, thread, child, connection)
      sessionForEvents = session
      this.sessions.set(session.handle, session)
      this.watchProcess(session)
      return session
    } catch (error: unknown) {
      await this.disposeProcess(connection, child).catch(() => {})
      throw error
    }
  }

  private makeSession(
    key: string,
    projectId: string,
    thread: ThreadSnapshot,
    child: SubprocessHandle,
    connection: CodexConnection,
  ): NativeSession {
    const inputs = recoveredInputs(thread.turns)
    return {
      handle: TeammateRuntimeHandle(thread.id),
      correlationKey: key,
      projectId,
      child,
      connection,
      recoveredInputs: inputs,
      deliveries: recoveredDeliveries(inputs),
      evidence: [],
      presence: threadPresence(thread.status),
      current: undefined,
      disposed: false,
    }
  }

  private observeTurn(session: NativeSession, turn: AcceptedTurn): void {
    session.current = turn
    session.presence = 'running'
    void turn.done.then(
      (terminal) => {
        if (session.current !== turn || session.disposed) return
        session.current = undefined
        this.addEvidence(session, {
          id: evidenceId('turn', session.handle, terminal.id),
          kind: 'turn',
          timestamp: terminal.timestamp,
          turnId: TeammateRuntimeTurnId(terminal.id),
          outcome: terminal.outcome,
        })
        session.presence = 'idle'
        this.emitPresence(session, 'idle')
      },
      () => {
        if (session.current !== turn || session.disposed) return
        this.retireSession(session)
      },
    )
  }

  private recordItem(session: NativeSession, params: JsonObject): void {
    const item = params.item
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return
    const value = item as JsonObject
    const turnId = typeof params.turnId === 'string' ? TeammateRuntimeTurnId(params.turnId) : undefined
    const names: Readonly<Record<string, string>> = {
      commandExecution: 'command',
      fileChange: 'file-change',
      mcpToolCall: 'mcp-tool',
      dynamicToolCall: 'dynamic-tool',
      webSearch: 'web-search',
    }
    const toolName = typeof value.type === 'string' ? names[value.type] : undefined
    if (toolName === undefined || typeof value.id !== 'string') return
    this.addEvidence(session, {
      id: evidenceId('tool', session.handle, value.id),
      kind: 'tool',
      timestamp: typeof params.completedAtMs === 'number' ? Math.trunc(params.completedAtMs) : Date.now(),
      ...(turnId === undefined ? {} : { turnId }),
      name: toolName,
      outcome: value.status === 'completed' || value.status === 'success'
        ? 'completed'
        : value.status === 'declined'
          ? 'blocked'
          : value.status === 'failed'
            ? 'failed'
            : 'unknown',
    })
  }

  private recordUsage(session: NativeSession, params: JsonObject): void {
    if (typeof params.turnId !== 'string') return
    const usage = codexUsage(params.tokenUsage)
    this.addEvidence(session, {
      id: evidenceId('usage', session.handle, params.turnId, String(session.evidence.length)),
      kind: 'usage',
      timestamp: Date.now(),
      turnId: TeammateRuntimeTurnId(params.turnId),
      ...(usage === undefined ? {} : { usage }),
    })
  }

  private addEvidence(session: NativeSession, item: TeammateRuntimeEvidenceItem): void {
    session.evidence.push(Object.freeze(item))
    if (session.evidence.length > this.config.maxEvidenceItems) session.evidence.shift()
  }

  private watchProcess(session: NativeSession): void {
    void session.child.done.then(
      () => { this.processEnded(session) },
      () => { this.processEnded(session) },
    )
  }

  private processEnded(session: NativeSession): void {
    if (session.disposed) return
    session.disposed = true
    session.current = undefined
    session.connection.close()
    this.sessions.delete(session.handle)
    session.evidence.splice(0)
    session.deliveries.clear()
    session.recoveredInputs.clear()
    this.emitPresence(session, 'inactive')
  }

  private retireSession(session: NativeSession): void {
    session.current = undefined
    const disposal = this.disposeSession(session, true)
    this.emitPresence(session, 'inactive')
    void disposal.catch(() => {})
  }

  private emitPresence(session: NativeSession, presence: TeammateRuntimePresenceEvent['presence']): void {
    for (const listener of [...this.presenceListeners]) {
      try {
        listener({ nativeHandle: session.handle, presence })
      } catch {
        // Presence observation cannot change native thread ownership.
      }
    }
  }

  private result(
    session: NativeSession,
    acceptedTurnId?: ReturnType<typeof TeammateRuntimeTurnId>,
  ): TeammateRuntimeCreateResult {
    return {
      nativeHandle: session.handle,
      ...(acceptedTurnId === undefined ? {} : { turnId: acceptedTurnId }),
      presence: session.presence,
    }
  }

  private session(handle: string): NativeSession {
    const session = this.sessions.get(handle)
    if (session === undefined || session.disposed) {
      throw new TeammateRuntimeError(
        'Codex native thread is not attached to this provider generation',
        'TEAM_RUNTIME_IDENTITY_CONFLICT',
      )
    }
    return session
  }

  private async attach(handle: string, signal: AbortSignal): Promise<NativeSession> {
    const attached = this.sessions.get(handle)
    if (attached !== undefined && !attached.disposed) return attached
    const correlation = [...this.correlations].find(([, knownHandle]) => knownHandle === handle)?.[0]
    if (correlation === undefined) {
      throw new TeammateRuntimeError(
        'Codex native thread is not attached to this provider generation',
        'TEAM_RUNTIME_IDENTITY_CONFLICT',
      )
    }
    try {
      return await this.open(correlation, signal, handle)
    } catch (error: unknown) {
      if (error instanceof TeammateRuntimeError) throw error
      throw this.failure('resume', error)
    }
  }

  private correlationKey(launchRequestId: string, memberId: string): string {
    return JSON.stringify([launchRequestId, memberId])
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new TeammateRuntimeError('Codex durable runtime is disposing', 'TEAM_RUNTIME_UNAVAILABLE')
    }
  }

  private spawnSpec(): SubprocessSpawnSpec {
    return {
      argv: [process.execPath, codexPackageBin, 'app-server', '--stdio'],
      cwd: this.config.cwd,
      stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
      graceMs: this.config.disposeGraceMs,
      env: this.config.env,
    }
  }

  private async disposeSession(session: NativeSession, preserveCorrelation = false): Promise<void> {
    if (session.disposing !== undefined) {
      await session.disposing
      return
    }
    session.disposed = true
    session.connection.interrupt()
    const disposal = this.disposeProcess(session.connection, session.child).finally(() => {
      this.sessions.delete(session.handle)
      if (!preserveCorrelation && this.correlations.get(session.correlationKey) === session.handle) {
        this.correlations.delete(session.correlationKey)
      }
      session.evidence.splice(0)
      session.deliveries.clear()
      session.recoveredInputs.clear()
    })
    session.disposing = disposal
    await disposal
  }

  private async disposeProcess(connection: CodexConnection, child: SubprocessHandle): Promise<void> {
    connection.close()
    try {
      child.stdin?.end()
    } catch {
      // Tree termination below remains authoritative.
    }
    child.terminate()
    await child.waitForExit()
    await child.done.catch(() => {})
  }

  private failure(stage: string, cause: unknown): TeammateRuntimeError {
    return new TeammateRuntimeError(
      `Codex durable runtime failed during ${stage}`,
      'TEAM_RUNTIME_UNAVAILABLE',
      { cause },
    )
  }

}

/** Register one Fiber-owned durable Codex teammate runtime provider. */
export function apply(ctx: Context, config: Config): void {
  const eligibility = codexProductEligibility()
  if (!eligibility.eligible) {
    ctx.logger.warn(`agent-team-codex: durable provider unavailable (${eligibility.reason})`)
    return
  }
  const cwd = resolve(config.cwd ?? process.cwd())
  const disposeGraceMs = config.disposeGraceMs ?? DEFAULT_DISPOSE_GRACE_MS
  if (!Number.isFinite(disposeGraceMs) || disposeGraceMs <= 0 || disposeGraceMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`agent-team-codex: disposeGraceMs must be positive and no greater than ${MAX_TIMER_DELAY_MS}`)
  }
  const maxEvidenceItems = config.maxEvidenceItems ?? DEFAULT_MAX_EVIDENCE_ITEMS
  if (!Number.isSafeInteger(maxEvidenceItems) || maxEvidenceItems < 1) {
    throw new Error('agent-team-codex: maxEvidenceItems must be a positive safe integer')
  }
  const provider = new CodexTeammateRuntimeProvider(ctx, {
    providerName: config.providerName ?? DEFAULT_PROVIDER_NAME,
    cwd,
    ...config.model === undefined ? {} : { model: config.model },
    env: { ...config.env },
    sandbox: config.sandbox ?? 'read-only',
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
