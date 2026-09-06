import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { Context } from '@deepseek-ai/cordis'

import { DigitalEmployeeHostContext } from './host-context.ts'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'

import { TeamError, TeammateEvaluationId, TeammateRuntimeError } from '@deepseek-ai/dsh-experimental-agent-team'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import { setApprovalPolicy } from '@deepseek-ai/dsh-user-approval'
import { digitalEmployeeEvalSetDraftSchema, evalRunIdSchema } from './spec.ts'
import { externalRuntimeProfileSnapshot, requiredRuntimeCapabilitiesForProfile } from './runtime.ts'
import { createExternalRunIndex, foldDshRunEvidence, foldExternalRunEvidence } from './run.ts'
import type {
  DigitalEmployeeFailure,
  DigitalEmployeeProfileHead,
  DigitalEmployeeProfileRevision,
  SaveDigitalEmployeeEvalSetRequest,
  SaveDigitalEmployeeEvalSetResult,
  StartDigitalEmployeeEvalRunRequest,
  StartDigitalEmployeeEvalRunResult,
  CancelDigitalEmployeeEvalRunRequest,
  CancelDigitalEmployeeEvalRunResult,
  GetDigitalEmployeeEvalRunRequest,
  GetDigitalEmployeeEvalRunResult,
  DigitalEmployeeEvalCase,
  DigitalEmployeeEvalCaseResult,
  DigitalEmployeeEvalRunRecord,
  DigitalEmployeeEvalSetCatalogEntry,
  DigitalEmployeeEvalSetHead,
  DigitalEmployeeEvalSetRevision,
  DigitalEmployeePromotionGate,
  SelectableDigitalEmployeeRuntimeTarget,
} from './types.ts'
import {
  EVAL_ASSERTION_SCHEMA_VERSION,
  casePassed,
  effectiveEvaluationTools,
  evalEnvironmentFingerprint,
  evalRunPassed,
  evalRunRequestFingerprint,
  evalSetContentFingerprint,
  evaluateCaseAssertions,
  evaluationTerminal,
  snapshotEvalRun,
  snapshotEvalSetDraft,
  snapshotEvalSetHead,
  snapshotEvalSetRevision,
  summarizeEvalRun,
} from './evaluation.ts'
import { ProfileCapabilityInstaller, TEAM_OWN_TOOL_NAMES, PLUGIN_SOURCE } from './profile-capabilities.ts'
import { errorText, failure } from './host-errors.ts'
import { snapshotProfileRevision, profileFromRevision } from './profile-snapshot.ts'

interface InFlightEvaluation {
  readonly teamId: string
  readonly requestFingerprint: string
  readonly controller: AbortController
  readonly operation: Promise<void>
}

interface EvaluationPlan {
  readonly teamId: string
  readonly profile: DigitalEmployeeProfileRevision
  readonly evalSet: DigitalEmployeeEvalSetRevision
  readonly runtimeTarget: SelectableDigitalEmployeeRuntimeTarget
  readonly capabilityGeneration: number
  readonly effectiveToolAllowlist: readonly string[]
  readonly environmentFingerprint: string
  readonly requestFingerprint: string
}

class EvaluationCancelledError extends Error {
  constructor(readonly reason: 'cancelled' | 'interrupted') {
    super(`evaluation ${reason}`)
    this.name = 'EvaluationCancelledError'
  }
}

class EvaluationTimeoutError extends Error {
  constructor(maxElapsedMs: number) {
    super(`evaluation Case exceeded ${maxElapsedMs}ms`)
    this.name = 'EvaluationTimeoutError'
  }
}

function evaluationSessionId(evalRunId: string, caseId: string): SessionId {
  const digest = createHash('sha256')
    .update(JSON.stringify(['agent-team-ultra-evaluation', evalRunId, caseId]), 'utf8')
    .digest('base64url')
  return SessionId(`eval_${digest}`)
}

function assistantOutputForTurn(events: readonly SessionEvent[], turn: number): string {
  const output: string[] = []
  for (const event of events) {
    if (event.type !== 'assistant/message' || event.data.turn !== turn) continue
    for (const block of event.data.message.content) {
      if (block.type === 'text') output.push(block.text)
    }
  }
  return output.join('')
}

function contentBlockOutput(blocks: readonly { readonly type: string; readonly text?: string }[]): string {
  return blocks.filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text!)
    .join('')
}

function evaluationFixturesText(testCase: DigitalEmployeeEvalCase): string {
  if (testCase.fixtures.length === 0) return ''
  return [
    '# Immutable evaluation fixtures',
    ...testCase.fixtures.map(fixture => `## ${fixture.id}\n${fixture.content}`),
  ].join('\n\n')
}

function saveEvalSetRejected(error: DigitalEmployeeFailure): SaveDigitalEmployeeEvalSetResult {
  return Object.freeze({ ok: false, error })
}

function startEvalRejected(error: DigitalEmployeeFailure): StartDigitalEmployeeEvalRunResult {
  return Object.freeze({ ok: false, error })
}

function cancelEvalRejected(error: DigitalEmployeeFailure): CancelDigitalEmployeeEvalRunResult {
  return Object.freeze({ ok: false, error })
}

function getEvalRejected(error: DigitalEmployeeFailure): GetDigitalEmployeeEvalRunResult {
  return Object.freeze({ ok: false, error })
}

export class EvaluationWorkflow {
  private readonly evaluations = new Set<Promise<void>>()
  private readonly evaluationsById = new Map<string, InFlightEvaluation>()

  constructor(
    private readonly host: DigitalEmployeeHostContext,
    private readonly capabilities: ProfileCapabilityInstaller,
  ) {}

  interrupt(): void {
    for (const evaluation of this.evaluationsById.values()) {
      evaluation.controller.abort(new Error('Agent Team Ultra service disposed'))
    }
  }

  async whenSettled(): Promise<void> { await Promise.allSettled([...this.evaluations]) }

  /** Publish one immutable Eval Set Revision and move only its CAS Head. */
  async saveEvalSet(
    caller: Agent,
    request: SaveDigitalEmployeeEvalSetRequest,
  ): Promise<SaveDigitalEmployeeEvalSetResult> {
    if (!this.host.admissionOpen) {
      return saveEvalSetRejected(failure('service-disposed', 'Digital Employee service is disposing'))
    }
    const authorityFailure = this.host.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) return saveEvalSetRejected(authorityFailure)
    if (request.expectedHeadRevision !== null
      && (!Number.isSafeInteger(request.expectedHeadRevision) || request.expectedHeadRevision < 1)) {
      return saveEvalSetRejected(failure('eval-invalid', 'Eval Set Head revision must be null or positive'))
    }
    const parsed = digitalEmployeeEvalSetDraftSchema.safeParse(request.evalSet)
    if (!parsed.success) {
      return saveEvalSetRejected(failure(
        'eval-invalid',
        parsed.error.issues.map(issue => `${issue.path.join('.') || 'evalSet'}: ${issue.message}`).join('; ').slice(0, 2048),
      ))
    }
    if (parsed.data.cases.length > this.host.config.maxEvalCases) {
      return saveEvalSetRejected(failure(
        'eval-invalid',
        `Eval Set has ${parsed.data.cases.length} Cases; maximum is ${this.host.config.maxEvalCases}`,
      ))
    }
    const normalized = snapshotEvalSetDraft(parsed.data)
    const bytes = Buffer.byteLength(JSON.stringify(normalized), 'utf8')
    if (bytes > this.host.config.maxEvalSetBytes) {
      return saveEvalSetRejected(failure(
        'eval-invalid',
        `Eval Set content is ${bytes} UTF-8 bytes; maximum is ${this.host.config.maxEvalSetBytes}`,
      ))
    }
    return await this.host.mutate(caller, async () => {
      const storage = this.host.storage
      const profileHead = storage.getProfileHead(normalized.profileId)
      if (profileHead === undefined) {
        return saveEvalSetRejected(failure('profile-not-found', `profile "${normalized.profileId}" not found`))
      }
      const currentHead = storage.getEvalSetHead(normalized.id)
      if (request.expectedHeadRevision !== (currentHead?.headRevision ?? null)) {
        return saveEvalSetRejected(failure('eval-conflict', 'Eval Set Head changed; reload before saving'))
      }
      if (currentHead !== undefined && currentHead.profileId !== normalized.profileId) {
        return saveEvalSetRejected(failure('eval-conflict', 'Eval Set identity is already owned by another Profile'))
      }
      if (currentHead === undefined && storage.evalSetCount >= this.host.config.maxEvalSets) {
        return saveEvalSetRejected(failure('eval-invalid', `Eval Set limit ${this.host.config.maxEvalSets} reached`))
      }
      const latest = currentHead === undefined
        ? undefined
        : storage.getEvalSetRevision(normalized.id, currentHead.latestRevision)
      if (currentHead !== undefined && latest === undefined) {
        throw new Error(`Eval Set Head "${normalized.id}" has no latest Revision`)
      }
      const fingerprint = evalSetContentFingerprint(normalized)
      if (latest?.fingerprint === fingerprint) {
        return Object.freeze({
          ok: true as const,
          value: Object.freeze({
            unchanged: true,
            head: snapshotEvalSetHead(currentHead!),
            revision: snapshotEvalSetRevision(latest),
          }),
        })
      }
      const known = [...storage.evalSetRevisionEntries(normalized.id)].map(([, revision]) => revision)
      const reusable = known
        .filter(revision => revision.revision > (currentHead?.latestRevision ?? 0)
          && revision.fingerprint === fingerprint)
        .sort((left, right) => left.revision - right.revision)[0]
      const now = Date.now()
      const revision = reusable ?? snapshotEvalSetRevision({
        schemaVersion: 1,
        evalSetId: normalized.id,
        profileId: normalized.profileId,
        revision: Math.max(0, ...known.map(candidate => candidate.revision)) + 1,
        evalSet: normalized,
        fingerprint,
        createdAt: currentHead?.createdAt ?? now,
        updatedAt: Math.max(now, currentHead?.updatedAt ?? 0),
      })
      const nextHead = snapshotEvalSetHead({
        schemaVersion: 1,
        evalSetId: normalized.id,
        profileId: normalized.profileId,
        headRevision: (currentHead?.headRevision ?? 0) + 1,
        latestRevision: revision.revision,
        createdAt: currentHead?.createdAt ?? now,
        updatedAt: Math.max(now, currentHead?.updatedAt ?? 0),
      })
      await storage.putEvalSetRevision(revision)
      await storage.putEvalSetHead(nextHead)
      return Object.freeze({
        ok: true as const,
        value: Object.freeze({ unchanged: false, head: nextHead, revision }),
      })
    })
  }

  /** Reserve one exact Eval Run identity, then execute it outside the mutation queue. */
  async startEvalRun(
    caller: Agent,
    request: StartDigitalEmployeeEvalRunRequest,
  ): Promise<StartDigitalEmployeeEvalRunResult> {
    if (!this.host.admissionOpen) {
      return startEvalRejected(failure('service-disposed', 'Digital Employee service is disposing'))
    }
    const authorityFailure = this.host.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) return startEvalRejected(authorityFailure)
    const parsedId = evalRunIdSchema.safeParse(request.evalRunId)
    if (!parsedId.success) {
      return startEvalRejected(failure('eval-invalid', 'evalRunId must be a canonical lowercase UUID'))
    }
    if (![request.profileRevision, request.evalSetRevision]
      .every(value => Number.isSafeInteger(value) && value >= 1)) {
      return startEvalRejected(failure('eval-invalid', 'evaluation Revision values must be positive integers'))
    }
    const teamId = this.host.ctx.agentTeams.membership(caller).id
    const planned = await this.prepareEvaluationPlan(caller, teamId, request)
    if ('code' in planned) return startEvalRejected(planned)
    const admissionFailure = this.host.mutationFailure(caller)
    if (admissionFailure !== undefined) return startEvalRejected(admissionFailure)
    const evalRunId = parsedId.data
    const existing = this.host.storage.getEvalRun(evalRunId)
    if (existing !== undefined) {
      if (existing.teamId !== teamId || existing.requestFingerprint !== planned.requestFingerprint) {
        return startEvalRejected(failure('eval-conflict', 'evalRunId was already used with different exact inputs'))
      }
      return Object.freeze({
        ok: true,
        value: Object.freeze({ replayed: true, run: summarizeEvalRun(existing) }),
      })
    }
    const now = Date.now()
    const initial = snapshotEvalRun({
      schemaVersion: 1,
      evalRunId,
      requestFingerprint: planned.requestFingerprint,
      teamId,
      profileId: planned.profile.profileId,
      profileRevision: planned.profile.revision,
      profileFingerprint: planned.profile.fingerprint,
      runtimeTarget: planned.runtimeTarget,
      capabilityGeneration: planned.capabilityGeneration,
      evalSetId: planned.evalSet.evalSetId,
      evalSetRevision: planned.evalSet.revision,
      evalSetFingerprint: planned.evalSet.fingerprint,
      assertionSchemaVersion: EVAL_ASSERTION_SCHEMA_VERSION,
      environmentFingerprint: planned.environmentFingerprint,
      effectiveToolAllowlist: planned.effectiveToolAllowlist,
      status: 'running',
      cases: Object.freeze(planned.evalSet.evalSet.cases.map(testCase => Object.freeze({
        caseId: testCase.id,
        status: 'pending' as const,
        assertions: Object.freeze([]),
      }))),
      startedAt: now,
      updatedAt: now,
    })
    const reserved = await this.host.enqueue(async (): Promise<DigitalEmployeeEvalRunRecord | DigitalEmployeeFailure> => {
      const admissionFailure = this.host.mutationFailure(caller)
      if (admissionFailure !== undefined) return admissionFailure
      const storage = this.host.storage
      const concurrent = storage.getEvalRun(evalRunId)
      if (concurrent !== undefined) {
        return concurrent.teamId === teamId && concurrent.requestFingerprint === planned.requestFingerprint
          ? concurrent
          : failure('eval-conflict', 'evalRunId was concurrently used with different exact inputs')
      }
      await storage.putEvalRun(initial, this.host.config.maxEvalRuns)
      return initial
    })
    if ('code' in reserved) return startEvalRejected(reserved)
    if (reserved !== initial) {
      return Object.freeze({
        ok: true,
        value: Object.freeze({ replayed: true, run: summarizeEvalRun(reserved) }),
      })
    }
    const controller = new AbortController()
    let operation!: Promise<void>
    operation = Promise.resolve().then(async () => {
      await this.executeEvaluation(caller, planned, initial, controller)
    }).catch((error: unknown) => {
      this.host.ctx.logger.warn(`agent-team-ultra: Eval Run ${evalRunId} failed outside its recorded state machine`)
      this.host.ctx.logger.warn(error)
    }).finally(() => {
      this.evaluations.delete(operation)
      if (this.evaluationsById.get(evalRunId)?.operation === operation) {
        this.evaluationsById.delete(evalRunId)
      }
    })
    this.evaluations.add(operation)
    this.evaluationsById.set(evalRunId, {
      teamId,
      requestFingerprint: planned.requestFingerprint,
      controller,
      operation,
    })
    return Object.freeze({
      ok: true,
      value: Object.freeze({ replayed: false, run: summarizeEvalRun(initial) }),
    })
  }

  /** Abort and drain a running evaluation owned by the caller's exact Team. */
  async cancelEvalRun(
    caller: Agent,
    request: CancelDigitalEmployeeEvalRunRequest,
  ): Promise<CancelDigitalEmployeeEvalRunResult> {
    if (!this.host.admissionOpen) {
      return cancelEvalRejected(failure('service-disposed', 'Digital Employee service is disposing'))
    }
    const authorityFailure = this.host.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) return cancelEvalRejected(authorityFailure)
    const parsedId = evalRunIdSchema.safeParse(request.evalRunId)
    if (!parsedId.success) return cancelEvalRejected(failure('eval-invalid', 'invalid evalRunId'))
    const teamId = this.host.ctx.agentTeams.membership(caller).id
    const stored = this.host.storage.getEvalRun(parsedId.data)
    if (stored === undefined || stored.teamId !== teamId) {
      return cancelEvalRejected(failure('eval-not-found', `Eval Run "${request.evalRunId}" not found`))
    }
    const inFlight = this.evaluationsById.get(parsedId.data)
    if (stored.status === 'running' && inFlight !== undefined && inFlight.teamId === teamId) {
      inFlight.controller.abort(new EvaluationCancelledError('cancelled'))
      await inFlight.operation
    }
    const current = this.host.storage.getEvalRun(parsedId.data) ?? stored
    return Object.freeze({ ok: true, value: Object.freeze({ run: summarizeEvalRun(current) }) })
  }

  /** Read an Eval Run only inside the exact Team that admitted it. */
  async evalRun(
    caller: Agent,
    request: GetDigitalEmployeeEvalRunRequest,
  ): Promise<GetDigitalEmployeeEvalRunResult> {
    if (!this.host.admissionOpen) return getEvalRejected(failure('service-disposed', 'Digital Employee service is disposing'))
    const authorityFailure = this.host.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) return getEvalRejected(authorityFailure)
    const parsedId = evalRunIdSchema.safeParse(request.evalRunId)
    if (!parsedId.success) return getEvalRejected(failure('eval-invalid', 'invalid evalRunId'))
    const teamId = this.host.ctx.agentTeams.membership(caller).id
    const run = this.host.storage.getEvalRun(parsedId.data)
    if (run === undefined || run.teamId !== teamId) {
      return getEvalRejected(failure('eval-not-found', `Eval Run "${request.evalRunId}" not found`))
    }
    const evalSet = this.host.storage.getEvalSetRevision(run.evalSetId, run.evalSetRevision)
    if (evalSet === undefined || evalSet.fingerprint !== run.evalSetFingerprint) {
      return getEvalRejected(failure('eval-not-found', 'Eval Run immutable Eval Set is unavailable'))
    }
    return Object.freeze({
      ok: true,
      value: Object.freeze({ run: snapshotEvalRun(run), evalSet: snapshotEvalSetRevision(evalSet) }),
    })
  }

  /** Resolve every immutable and live capability input before reserving an Eval Run. */
  private async prepareEvaluationPlan(
    caller: Agent,
    teamId: string,
    request: StartDigitalEmployeeEvalRunRequest,
  ): Promise<EvaluationPlan | DigitalEmployeeFailure> {
    await this.host.runtimeBackends.whenSettled()
    const admissionFailure = this.host.mutationFailure(caller)
    if (admissionFailure !== undefined) return admissionFailure
    const storage = this.host.storage
    const head = storage.getProfileHead(request.profileId)
    if (head === undefined) return failure('profile-not-found', `profile "${request.profileId}" not found`)
    if (head.archivedAt !== undefined) return failure('profile-archived', `profile "${request.profileId}" is archived`, head)
    const profile = storage.getProfileRevision(request.profileId, request.profileRevision)
    if (profile === undefined || profile.revision < head.historyStartsAtRevision
      || profile.revision > head.latestRevision) {
      return failure('revision-not-found', `Profile Revision ${request.profileRevision} is not retained`, head)
    }
    const evalSet = storage.getEvalSetRevision(request.evalSetId, request.evalSetRevision)
    if (evalSet === undefined || evalSet.profileId !== profile.profileId) {
      return failure('eval-not-found', 'Eval Set Revision does not exist for this Profile')
    }
    if (profile.runtimeTarget.kind === 'legacy-inherit-lead') {
      return failure('runtime-route-invalid', 'legacy inherited Lead routing cannot be evaluated')
    }
    const runtimeTarget = Object.freeze({ ...profile.runtimeTarget }) as SelectableDigitalEmployeeRuntimeTarget
    const targetProblem = this.host.runtimeBackends.validateEvaluation(
      profile.profile,
      runtimeTarget,
      profile.requiredCapabilities,
    )
    if (targetProblem !== undefined) {
      return failure('eval-environment-unavailable', targetProblem.message)
    }
    if (runtimeTarget.kind === 'dsh-model') {
      const exactProblem = await this.host.runtimeBackends.verifyDshModelRoute(runtimeTarget)
      const admissionFailure = this.host.mutationFailure(caller)
      if (admissionFailure !== undefined) return admissionFailure
      if (exactProblem !== undefined) return failure('eval-environment-unavailable', exactProblem.message)
      if (this.host.ctx.get('sandboxPolicy') === undefined
        || this.host.ctx.get('approval') === undefined
        || typeof this.host.ctx.agents.create !== 'function') {
        return failure(
          'eval-environment-unavailable',
          'DSH evaluation requires Agent creation plus the sandbox and approval policy services',
        )
      }
    }
    const providerTools = runtimeTarget.kind === 'external-agent'
      ? this.host.runtimeBackends.externalEvaluationTools(runtimeTarget.provider)
      : this.host.ctx.tools.schemas(caller)
        .map(tool => tool.name)
        .filter(name => !TEAM_OWN_TOOL_NAMES.has(name))
        .sort()
    if (providerTools === undefined) {
      return failure(
        'eval-environment-unavailable',
        `runtime "${runtimeTarget.provider}" cannot prove its evaluation tool inventory`,
      )
    }
    const effectiveToolAllowlist = effectiveEvaluationTools(
      profile.profile.toolPolicy,
      providerTools,
      evalSet.evalSet.toolAllowlist,
      TEAM_OWN_TOOL_NAMES,
    )
    const environmentFingerprint = evalEnvironmentFingerprint({ effectiveToolAllowlist, evalSet })
    const capabilityGeneration = this.host.runtimeBackends.capabilityGeneration
    const requestFingerprint = evalRunRequestFingerprint({
      teamId,
      profile,
      runtimeTarget,
      capabilityGeneration,
      evalSet,
      environmentFingerprint,
    })
    return Object.freeze({
      teamId,
      profile: snapshotProfileRevision(profile),
      evalSet: snapshotEvalSetRevision(evalSet),
      runtimeTarget,
      capabilityGeneration,
      effectiveToolAllowlist,
      environmentFingerprint,
      requestFingerprint,
    })
  }

  /** Execute Cases sequentially so each terminal result is independently durable. */
  private async executeEvaluation(
    caller: Agent,
    plan: EvaluationPlan,
    initial: DigitalEmployeeEvalRunRecord,
    controller: AbortController,
  ): Promise<void> {
    const interrupt = (): void => {
      controller.abort(new EvaluationCancelledError('interrupted'))
    }
    if (this.host.lifecycle.signal.aborted) interrupt()
    else this.host.lifecycle.signal.addEventListener('abort', interrupt, { once: true })
    try {
      for (const testCase of plan.evalSet.evalSet.cases) {
        if (controller.signal.aborted) break
        if (this.host.runtimeBackends.capabilityGeneration !== plan.capabilityGeneration) {
          await this.commitEvalCase(initial.evalRunId, {
            caseId: testCase.id,
            status: 'environment-unavailable',
            assertions: Object.freeze([]),
            diagnostic: 'runtime capability generation changed before the Case started',
            endedAt: Date.now(),
          })
          break
        }
        const startedAt = Date.now()
        await this.commitEvalCase(initial.evalRunId, {
          caseId: testCase.id,
          status: 'running',
          assertions: Object.freeze([]),
          startedAt,
        })
        try {
          if (plan.runtimeTarget.kind === 'dsh-model') {
            await this.runDshEvaluationCase(caller, plan, testCase, initial.evalRunId, controller.signal)
          } else {
            await this.runExternalEvaluationCase(caller, plan, testCase, initial.evalRunId, controller.signal)
          }
        } catch (error: unknown) {
          const interrupted = this.host.lifecycle.signal.aborted
          const cancelled = controller.signal.aborted
          const timedOut = error instanceof EvaluationTimeoutError
          const environmentUnavailable = error instanceof TeammateRuntimeError
            || error instanceof TeamError
            || (!cancelled && !(error instanceof EvaluationCancelledError) && !timedOut)
          await this.commitEvalCase(initial.evalRunId, {
            caseId: testCase.id,
            status: interrupted
              ? 'interrupted'
              : cancelled || error instanceof EvaluationCancelledError
                ? 'cancelled'
                : timedOut
                  ? 'failed'
                : environmentUnavailable
                  ? 'environment-unavailable'
                  : 'failed',
            assertions: Object.freeze([]),
            diagnostic: errorText(error),
            startedAt,
            endedAt: Date.now(),
          })
          if (interrupted || cancelled || environmentUnavailable) break
        }
      }
    } finally {
      this.host.lifecycle.signal.removeEventListener('abort', interrupt)
      await this.finalizeEvalRun(initial.evalRunId, controller.signal.aborted)
    }
  }

  /** Run a fresh, parentless DSH Agent under fixed policy and dispose it after its result commits. */
  private async runDshEvaluationCase(
    caller: Agent,
    plan: EvaluationPlan,
    testCase: DigitalEmployeeEvalCase,
    evalRunId: DigitalEmployeeEvalRunRecord['evalRunId'],
    parentSignal: AbortSignal,
  ): Promise<void> {
    if (plan.runtimeTarget.kind !== 'dsh-model') throw new TypeError('DSH evaluator requires a DSH model target')
    const target = plan.runtimeTarget
    const ceilings = plan.evalSet.evalSet.resourceCeilings
    const timeout = new AbortController()
    const timer = setTimeout(() => {
      timeout.abort(new EvaluationTimeoutError(ceilings.maxElapsedMs))
    }, ceilings.maxElapsedMs)
    const signal = AbortSignal.any([parentSignal, timeout.signal])
    let handle: Awaited<ReturnType<Context['agents']['create']>> | undefined
    try {
      signal.throwIfAborted()
      const profile = profileFromRevision(plan.profile)
      handle = await caller.ctx.agents.create({
        sessionId: evaluationSessionId(evalRunId, testCase.id),
        agentOptions: {
          provider: target.provider,
          model: target.model,
          ...(target.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: ReasoningEffortId(target.reasoningEffort) }),
          maxTokens: ceilings.maxOutputTokens,
        },
        signal,
        setup: (agentCtx) => {
          const evaluator = agentCtx.agent
          if (evaluator === undefined) throw new Error('unpublished evaluation Agent is unavailable')
          setSandboxMode(evaluator.session, 'read-only')
          setApprovalPolicy(evaluator.session, 'never')
          this.capabilities.install(caller, evaluator, profile)
          agentCtx.effect(() => () => { this.capabilities.remove(evaluator) }, 'agent-team-ultra.evaluation-profile')
          agentCtx.tools.restrict({ allow: plan.effectiveToolAllowlist })
          const fixtures = evaluationFixturesText(testCase)
          if (fixtures !== '') {
            agentCtx.systemPrompt.context({ name: 'ultra:evaluation-fixtures', order: 145, text: fixtures })
          }
          agentCtx.on('agent/pre-step', async (payload, next): Promise<PreStepDecision> => {
            if (payload.step > ceilings.maxSteps) return { kind: 'reject' }
            return await next()
          })
        },
      })
      const evaluator = handle.agent
      const abort = (): void => {
        evaluator.cancel({ kind: 'hook', reason: 'isolated evaluation cancelled' })
      }
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
      try {
        evaluator.followup(createUserMessage({
          content: [{ type: 'text', text: testCase.input }],
          source: PLUGIN_SOURCE,
        }))
        await evaluator.whenIdle()
        signal.throwIfAborted()
      } finally {
        signal.removeEventListener('abort', abort)
      }
      const flushed = await evaluator.ctx.sessions.flush(evaluator.session)
      if (!flushed) throw new Error('DSH evaluation Session has no durability checkpoint provider')
      const events = evaluator.session.snapshotEvents()
      const folded = foldDshRunEvidence({
        teamId: plan.teamId,
        owner: Object.freeze({ kind: 'evaluation-worker', evalRunId, caseId: testCase.id }),
        profileId: plan.profile.profileId,
        profileRevision: plan.profile.revision,
        profileFingerprint: plan.profile.fingerprint,
        selectedRuntimeTarget: target,
        actualRuntimeTarget: target,
        capabilityGeneration: plan.capabilityGeneration,
      }, evaluator.session.id, events, this.host.config.maxRunEvidenceItems, 1).at(-1)
      if (folded === undefined) throw new Error('DSH evaluation produced no accepted canonical turn')
      const turn = folded.index.canonicalSource.kind === 'dsh-session'
        ? folded.index.canonicalSource.turn
        : 0
      const assertions = evaluateCaseAssertions(testCase, folded.detail, assistantOutputForTurn(events, turn))
      await this.commitEvalCase(evalRunId, {
        caseId: testCase.id,
        status: casePassed(assertions) ? 'passed' : 'failed',
        assertions,
        run: folded.detail,
        startedAt: folded.index.startedAt,
        endedAt: folded.index.endedAt ?? Date.now(),
      })
    } finally {
      clearTimeout(timer)
      await handle?.dispose()
    }
  }

  /** Run a provider-native isolated handle and commit while TeamService still owns it. */
  private async runExternalEvaluationCase(
    caller: Agent,
    plan: EvaluationPlan,
    testCase: DigitalEmployeeEvalCase,
    evalRunId: DigitalEmployeeEvalRunRecord['evalRunId'],
    signal: AbortSignal,
  ): Promise<void> {
    if (plan.runtimeTarget.kind !== 'external-agent') throw new TypeError('external evaluator requires an external target')
    const target = plan.runtimeTarget
    const ceilings = plan.evalSet.evalSet.resourceCeilings
    const timeout = new AbortController()
    const timer = setTimeout(() => {
      timeout.abort(new EvaluationTimeoutError(ceilings.maxElapsedMs))
    }, ceilings.maxElapsedMs)
    const caseSignal = AbortSignal.any([signal, timeout.signal])
    const runtimeCapabilities = Object.freeze([...new Set([
      ...requiredRuntimeCapabilitiesForProfile(plan.profile.profile),
      'sandbox' as const,
      'evaluation' as const,
      'evidence' as const,
      'usage' as const,
    ])].sort())
    try {
      await this.host.ctx.agentTeams.runTeammateEvaluation(caller, target.provider, {
      evaluationId: TeammateEvaluationId(`${evalRunId}:${testCase.id}`),
      profile: externalRuntimeProfileSnapshot(plan.profile.profile),
      requirements: Object.freeze({
        contextMode: 'fresh',
        profileCapabilities: plan.profile.requiredCapabilities.profileCapabilities,
        runtimeCapabilities,
      }),
      input: Object.freeze([{ type: 'text', text: testCase.input }]),
      environment: Object.freeze({
        sandbox: 'read-only',
        approval: 'never',
        toolAllowlist: plan.effectiveToolAllowlist,
        fixtures: Object.freeze(testCase.fixtures.map(fixture => Object.freeze({ ...fixture }))),
        maxSteps: ceilings.maxSteps,
        maxOutputTokens: ceilings.maxOutputTokens,
        maxElapsedMs: ceilings.maxElapsedMs,
      }),
      signal: caseSignal,
    }, async (result) => {
      caseSignal.throwIfAborted()
      const provisional = createExternalRunIndex({
        teamId: plan.teamId,
        owner: Object.freeze({ kind: 'evaluation-worker', evalRunId, caseId: testCase.id }),
        profileId: plan.profile.profileId,
        profileRevision: plan.profile.revision,
        profileFingerprint: plan.profile.fingerprint,
        selectedRuntimeTarget: target,
        actualRuntimeTarget: target,
        capabilityGeneration: plan.capabilityGeneration,
        nativeHandle: result.evaluationHandle,
      }, result.turnId, result.turnId, result.startedAt)
      const folded = foldExternalRunEvidence(
        provisional,
        result.evidence,
        result.complete,
        this.host.config.maxRunEvidenceItems,
      )
      const assertions = evaluateCaseAssertions(
        testCase,
        folded.detail,
        contentBlockOutput(result.output),
      )
      const terminalMatches = folded.index.terminal === evaluationTerminal(result.terminal)
      const passed = result.complete && terminalMatches && casePassed(assertions)
      await this.commitEvalCase(evalRunId, {
        caseId: testCase.id,
        status: passed ? 'passed' : 'failed',
        assertions,
        run: folded.detail,
        ...terminalMatches ? {} : { diagnostic: 'provider terminal conflicts with normalized canonical evidence' },
        startedAt: result.startedAt,
        endedAt: result.endedAt,
      })
    })
    } finally {
      clearTimeout(timer)
    }
  }

  /** Replace exactly one Case projection while retaining the Eval Run identity tuple. */
  private async commitEvalCase(
    evalRunId: DigitalEmployeeEvalRunRecord['evalRunId'],
    result: DigitalEmployeeEvalCaseResult,
  ): Promise<void> {
    await this.host.enqueue(async () => {
      const storage = this.host.storage
      const current = storage.getEvalRun(evalRunId)
      if (current === undefined || current.status !== 'running') return
      if (!current.cases.some(testCase => testCase.caseId === result.caseId)) {
        throw new Error(`Eval Run "${evalRunId}" does not own Case "${result.caseId}"`)
      }
      const now = Math.max(Date.now(), current.updatedAt)
      await storage.putEvalRun(snapshotEvalRun({
        ...current,
        cases: Object.freeze(current.cases.map(testCase => testCase.caseId === result.caseId
          ? Object.freeze(structuredClone(result))
          : testCase)),
        updatedAt: now,
      }), this.host.config.maxEvalRuns)
    })
  }

  /** Close the state machine; cancellation, crash, and missing guarantees can never pass. */
  private async finalizeEvalRun(
    evalRunId: DigitalEmployeeEvalRunRecord['evalRunId'],
    aborted: boolean,
  ): Promise<void> {
    await this.host.enqueue(async () => {
      const storage = this.host.storage
      const current = storage.getEvalRun(evalRunId)
      if (current === undefined || current.status !== 'running') return
      const interrupted = this.host.lifecycle.signal.aborted
      const hasEnvironmentFailure = current.cases.some(testCase => testCase.status === 'environment-unavailable')
      const fillStatus: DigitalEmployeeEvalCaseResult['status'] = interrupted
        ? 'interrupted'
        : aborted
          ? 'cancelled'
          : hasEnvironmentFailure
            ? 'environment-unavailable'
            : 'interrupted'
      const now = Math.max(Date.now(), current.updatedAt)
      const cases = Object.freeze(current.cases.map(testCase => (
        testCase.status !== 'pending' && testCase.status !== 'running'
          ? testCase
          : Object.freeze({
              ...testCase,
              status: fillStatus,
              diagnostic: testCase.diagnostic ?? (
                interrupted ? 'service stopped before the Case completed'
                  : aborted ? 'evaluation cancelled before the Case completed'
                    : hasEnvironmentFailure ? 'evaluation environment became unavailable'
                      : 'Case did not reach a terminal result'
              ),
              ...(testCase.startedAt === undefined ? {} : { startedAt: testCase.startedAt }),
              endedAt: now,
            })
      )))
      const status: DigitalEmployeeEvalRunRecord['status'] = interrupted
        ? 'interrupted'
        : aborted || cases.some(testCase => testCase.status === 'cancelled')
          ? 'cancelled'
          : cases.some(testCase => testCase.status === 'environment-unavailable')
            ? 'environment-unavailable'
            : cases.some(testCase => testCase.status === 'interrupted')
              ? 'interrupted'
              : evalRunPassed(
                  this.host.storage.getEvalSetRevision(current.evalSetId, current.evalSetRevision)!.evalSet.passPolicy,
                  cases,
                )
                ? 'passed'
                : 'failed'
      await storage.putEvalRun(snapshotEvalRun({
        ...current,
        status,
        cases,
        updatedAt: now,
        endedAt: now,
      }), this.host.config.maxEvalRuns)
    })
  }

  /** Cold-start repair: a process-local evaluation is never resumed or inferred to have passed. */
  async repairInterrupted(): Promise<void> {
    const storage = this.host.storage
    for (const [, run] of [...storage.evalRunEntries()]) {
      if (run.status !== 'running') continue
      const now = Math.max(Date.now(), run.updatedAt)
      const cases = Object.freeze(run.cases.map(testCase => (
        testCase.status !== 'pending' && testCase.status !== 'running'
          ? testCase
          : Object.freeze({
              ...testCase,
              status: 'interrupted' as const,
              diagnostic: 'Host restarted before the evaluation reached a terminal edge',
              endedAt: now,
            })
      )))
      await storage.putEvalRun(snapshotEvalRun({
        ...run,
        status: 'interrupted',
        cases,
        updatedAt: now,
        endedAt: now,
      }), this.host.config.maxEvalRuns)
    }
  }

  /** Build one bounded Eval Set catalog row without exposing mutable storage values. */
  catalogEntry(head: DigitalEmployeeEvalSetHead): DigitalEmployeeEvalSetCatalogEntry {
    const storage = this.host.storage
    const latest = storage.getEvalSetRevision(head.evalSetId, head.latestRevision)
    if (latest === undefined) throw new Error(`Eval Set Head "${head.evalSetId}" has no latest Revision`)
    const revisions = [...storage.evalSetRevisionEntries(head.evalSetId)]
      .map(([, revision]) => revision)
      .filter(revision => revision.revision <= head.latestRevision)
      .sort((left, right) => right.revision - left.revision)
    const history = revisions.slice(0, this.host.config.maxRevisionHistory).map(revision => Object.freeze({
      revision: revision.revision,
      fingerprint: revision.fingerprint,
      createdAt: revision.createdAt,
      updatedAt: revision.updatedAt,
    }))
    return Object.freeze({
      head: snapshotEvalSetHead(head),
      latest: snapshotEvalSetRevision(latest),
      history: Object.freeze(history),
      historyTruncated: revisions.length > history.length,
    })
  }

  /** Derive the exact current promotion proof; stale successes are visibly invalidated. */
  promotionGate(
    caller: Agent,
    teamId: string,
    head: DigitalEmployeeProfileHead,
    latest: DigitalEmployeeProfileRevision,
  ): DigitalEmployeePromotionGate {
    const required = head.requiredEvalSet
    if (required === undefined) return Object.freeze({ status: 'not-required' })
    const storage = this.host.storage
    const evalSet = storage.getEvalSetRevision(required.evalSetId, required.revision)
    const passedRuns = [...storage.evalRunEntries()]
      .map(([, run]) => run)
      .filter(run => run.teamId === teamId
        && run.profileId === head.profileId
        && run.evalSetId === required.evalSetId
        && run.evalSetRevision === required.revision
        && run.status === 'passed')
      .sort((left, right) => right.startedAt - left.startedAt
        || right.evalRunId.localeCompare(left.evalRunId))
    if (evalSet === undefined || evalSet.profileId !== head.profileId) {
      return Object.freeze({
        status: passedRuns.length === 0 ? 'pending' : 'invalidated',
        requiredEvalSet: Object.freeze({ ...required }),
        diagnostic: 'required Eval Set Revision is unavailable',
      })
    }
    if (latest.runtimeTarget.kind === 'legacy-inherit-lead') {
      return Object.freeze({
        status: passedRuns.length === 0 ? 'pending' : 'invalidated',
        requiredEvalSet: Object.freeze({ ...required }),
        diagnostic: 'candidate runtime route cannot be evaluated',
      })
    }
    const providerTools = latest.runtimeTarget.kind === 'external-agent'
      ? this.host.runtimeBackends.externalEvaluationTools(latest.runtimeTarget.provider)
      : this.host.ctx.tools.schemas(caller)
        .map(tool => tool.name)
        .filter(name => !TEAM_OWN_TOOL_NAMES.has(name))
        .sort()
    if (providerTools === undefined) {
      return Object.freeze({
        status: passedRuns.length === 0 ? 'pending' : 'invalidated',
        requiredEvalSet: Object.freeze({ ...required }),
        diagnostic: 'current runtime cannot prove the evaluation environment',
      })
    }
    const tools = effectiveEvaluationTools(
      latest.profile.toolPolicy,
      providerTools,
      evalSet.evalSet.toolAllowlist,
      TEAM_OWN_TOOL_NAMES,
    )
    const environment = evalEnvironmentFingerprint({ effectiveToolAllowlist: tools, evalSet })
    const exact = passedRuns.find(run => run.profileRevision === latest.revision
      && run.profileFingerprint === latest.fingerprint
      && isDeepStrictEqual(run.runtimeTarget, latest.runtimeTarget)
      && run.capabilityGeneration === this.host.runtimeBackends.capabilityGeneration
      && run.evalSetFingerprint === evalSet.fingerprint
      && run.assertionSchemaVersion === EVAL_ASSERTION_SCHEMA_VERSION
      && run.environmentFingerprint === environment
      && isDeepStrictEqual(run.effectiveToolAllowlist, tools))
    if (exact !== undefined) {
      return Object.freeze({
        status: 'passed',
        requiredEvalSet: Object.freeze({ ...required }),
        satisfiedByEvalRunId: exact.evalRunId,
      })
    }
    return Object.freeze({
      status: passedRuns.length === 0 ? 'pending' : 'invalidated',
      requiredEvalSet: Object.freeze({ ...required }),
      diagnostic: passedRuns.length === 0
        ? 'the exact candidate has not passed this Eval Set Revision'
        : 'a prior pass no longer matches the candidate, runtime generation, or environment',
    })
  }
}
