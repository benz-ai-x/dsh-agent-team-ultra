import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { TeamError } from '@deepseek-ai/dsh-experimental-agent-team'
import type { ResolvedConfig } from './configuration.ts'
import type { DigitalEmployeeStorage } from './storage.ts'
import type { DigitalEmployeeFailure, DigitalEmployeeProfileDraft } from './types.ts'
import { TEAM_OWN_TOOL_NAMES } from './profile-capabilities.ts'

/** One service lifetime owns authority, mutation ordering, and the open storage handle. */
export class DigitalEmployeeHostContext {
  readonly lifecycle = new AbortController()
  private accepting = false
  private storageValue: DigitalEmployeeStorage | undefined
  private mutationTail: Promise<void> = Promise.resolve()

  constructor(
    readonly ctx: Context,
    readonly config: ResolvedConfig,
  ) {}

  get admissionOpen(): boolean { return this.accepting }
  get hasStorage(): boolean { return this.storageValue !== undefined }

  get storage(): DigitalEmployeeStorage {
    if (this.storageValue === undefined) throw new Error('Agent Team Ultra B0 storage is not ready')
    return this.storageValue
  }

  attachStorage(storage: DigitalEmployeeStorage): void {
    this.storageValue = storage
  }

  openAdmission(): void { this.accepting = true }

  closeAdmission(): void {
    this.accepting = false
    this.lifecycle.abort(new Error('Agent Team Ultra service disposed'))
  }

  /** Only official in-process continuation is offered; no route registry or fallback. */
  profileProblem(caller: Agent, profile: DigitalEmployeeProfileDraft): DigitalEmployeeFailure | undefined {
    if (profile.continuationProvider !== (profile.contextMode === 'fork' ? 'fork' : 'spawn')) {
      return { code: 'profile-invalid', message: 'B0 supports only the matching official spawn/fork continuation' }
    }
    const provider = this.ctx.subagents.getProvider(profile.continuationProvider)
    if (provider?.prepareContinuable === undefined
      || provider.inheritsParentContext !== (profile.contextMode === 'fork')) {
      return { code: 'runtime-unavailable', message: 'The required official DSH continuation is unavailable' }
    }
    const tools = new Set(caller.ctx.tools.schemas(caller).map(tool => tool.name))
    if (profile.toolPolicy.names.some(name => TEAM_OWN_TOOL_NAMES.has(name) || !tools.has(name))) {
      return { code: 'tool-unavailable', message: 'A selected inherited tool is not available to this Lead' }
    }
    return undefined
  }

  async closeStorage(): Promise<void> {
    try { await this.storageValue?.close() }
    finally { this.storageValue = undefined }
  }

  leadAuthorityFailure(caller: Agent): DigitalEmployeeFailure | undefined {
    if (this.ctx.agents.get(caller.id) !== caller) {
      return Object.freeze({ code: 'team-rejected', message: 'caller is not the exact live Agent registered on this Host' })
    }
    try {
      if (this.ctx.agentTeams.membership(caller).role !== 'lead') {
        return Object.freeze({
          code: 'team-lead-required',
          message: 'only the exact live Team Lead may manage Digital Employee profiles',
        })
      }
      return undefined
    } catch (error: unknown) {
      if (error instanceof TeamError) return Object.freeze({ code: 'team-rejected', message: error.message })
      throw error
    }
  }

  mutationFailure(caller: Agent): DigitalEmployeeFailure | undefined {
    return this.accepting
      ? this.leadAuthorityFailure(caller)
      : Object.freeze({ code: 'service-disposed', message: 'Digital Employee service is disposing' })
  }

  /** Admitted internal settlement may still flush after public admission closes. */
  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.mutationTail.then(operation)
    this.mutationTail = run.then(() => undefined, () => undefined)
    return run
  }

  /** Recheck authority when the queued business decision actually starts. */
  mutate<T extends { readonly ok: boolean }>(
    caller: Agent,
    operation: () => Promise<T>,
  ): Promise<T | { readonly ok: false; readonly error: DigitalEmployeeFailure }> {
    return this.enqueue(async () => {
      const error = this.mutationFailure(caller)
      return error === undefined ? await operation() : Object.freeze({ ok: false as const, error })
    })
  }

  whenWritesSettled(): Promise<void> { return this.mutationTail }
}
