/** Deterministic Eval Set identities, tool intersection, assertions, and snapshots. */

import { createHash } from 'node:crypto'
import type {
  DigitalEmployeeEvalAssertionResult,
  DigitalEmployeeEvalCase,
  DigitalEmployeeEvalCaseResult,
  DigitalEmployeeEvalPassPolicy,
  DigitalEmployeeEvalRunRecord,
  DigitalEmployeeEvalRunSummary,
  DigitalEmployeeEvalSetDraft,
  DigitalEmployeeEvalSetHead,
  DigitalEmployeeEvalSetRevision,
  DigitalEmployeeProfileRevision,
  DigitalEmployeeRunDetail,
  DigitalEmployeeRunTerminal,
  ProfileToolPolicy,
  SelectableDigitalEmployeeRuntimeTarget,
} from './types.ts'

export const EVAL_ASSERTION_SCHEMA_VERSION = 1 as const

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .filter(key => record[key] !== undefined)
    .sort()
    .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')
}

function cloneFreeze<T>(value: T): T {
  const cloned = structuredClone(value)
  const freeze = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== 'object' || Object.isFrozen(candidate)) return
    for (const child of Object.values(candidate)) freeze(child)
    Object.freeze(candidate)
  }
  freeze(cloned)
  return cloned
}

/** Fingerprint immutable normalized Eval Set content only. */
export function evalSetContentFingerprint(evalSet: DigitalEmployeeEvalSetDraft): string {
  return fingerprint(evalSet)
}

/** Exact idempotency tuple for one requested candidate evaluation. */
export function evalRunRequestFingerprint(input: {
  readonly teamId: string
  readonly profile: DigitalEmployeeProfileRevision
  readonly runtimeTarget: SelectableDigitalEmployeeRuntimeTarget
  readonly capabilityGeneration: number
  readonly evalSet: DigitalEmployeeEvalSetRevision
  readonly environmentFingerprint: string
}): string {
  return fingerprint({
    teamId: input.teamId,
    profileId: input.profile.profileId,
    profileRevision: input.profile.revision,
    profileFingerprint: input.profile.fingerprint,
    runtimeTarget: input.runtimeTarget,
    capabilityGeneration: input.capabilityGeneration,
    evalSetId: input.evalSet.evalSetId,
    evalSetRevision: input.evalSet.revision,
    evalSetFingerprint: input.evalSet.fingerprint,
    assertionSchemaVersion: EVAL_ASSERTION_SCHEMA_VERSION,
    environmentFingerprint: input.environmentFingerprint,
  })
}

/** Identity of every fixed confinement input, including declared Case fixtures. */
export function evalEnvironmentFingerprint(input: {
  readonly effectiveToolAllowlist: readonly string[]
  readonly evalSet: DigitalEmployeeEvalSetRevision
}): string {
  return fingerprint({
    sandbox: 'read-only',
    approval: 'never',
    effectiveToolAllowlist: input.effectiveToolAllowlist,
    resourceCeilings: input.evalSet.evalSet.resourceCeilings,
    fixtures: input.evalSet.evalSet.cases.map(testCase => ({
      caseId: testCase.id,
      fixtures: testCase.fixtures,
    })),
  })
}

/** Profile policy ∩ provider-enforceable inventory ∩ explicit Eval allowlist. */
export function effectiveEvaluationTools(
  policy: ProfileToolPolicy,
  providerTools: readonly string[],
  evalAllowlist: readonly string[],
  deniedTools: ReadonlySet<string>,
): readonly string[] {
  const provider = new Set(providerTools)
  const explicit = new Set(evalAllowlist)
  const profileNames = new Set(policy.names)
  return Object.freeze([...provider]
    .filter(name => explicit.has(name) && !deniedTools.has(name))
    .filter(name => policy.mode === 'inherit'
      || (policy.mode === 'allow' ? profileNames.has(name) : !profileNames.has(name)))
    .sort())
}

export function snapshotEvalSetDraft(evalSet: DigitalEmployeeEvalSetDraft): DigitalEmployeeEvalSetDraft {
  return cloneFreeze(evalSet)
}

export function snapshotEvalSetHead(head: DigitalEmployeeEvalSetHead): DigitalEmployeeEvalSetHead {
  return cloneFreeze(head)
}

export function snapshotEvalSetRevision(
  revision: DigitalEmployeeEvalSetRevision,
): DigitalEmployeeEvalSetRevision {
  return cloneFreeze(revision)
}

export function snapshotEvalRun(run: DigitalEmployeeEvalRunRecord): DigitalEmployeeEvalRunRecord {
  return cloneFreeze(run)
}

export function summarizeEvalRun(run: DigitalEmployeeEvalRunRecord): DigitalEmployeeEvalRunSummary {
  const { cases, ...summary } = snapshotEvalRun(run)
  return Object.freeze({
    ...summary,
    passedCases: cases.filter(testCase => testCase.status === 'passed').length,
    totalCases: cases.length,
  })
}

function assertion(
  kind: DigitalEmployeeEvalAssertionResult['kind'],
  passed: boolean,
  diagnostic: string,
  subject?: string,
): DigitalEmployeeEvalAssertionResult {
  return Object.freeze({ kind, ...(subject === undefined ? {} : { subject }), passed, diagnostic })
}

function reportedTokens(run: DigitalEmployeeRunDetail): number | undefined {
  const usage = run.run.usage
  if (usage === undefined) return undefined
  return usage.totalTokens ?? usage.inputTokens + usage.outputTokens
}

/** Compute every assertion without retaining model output or raw tool payloads. */
export function evaluateCaseAssertions(
  testCase: DigitalEmployeeEvalCase,
  run: DigitalEmployeeRunDetail,
  output: string,
): readonly DigitalEmployeeEvalAssertionResult[] {
  const configured = testCase.assertions
  const results: DigitalEmployeeEvalAssertionResult[] = []
  const terminal = run.run.terminal
  const terminalPassed = configured.acceptedTerminals.includes(terminal)
    && run.run.completeness.status === 'complete'
  results.push(assertion(
    'terminal',
    terminalPassed,
    terminalPassed
      ? `terminal ${terminal} accepted with complete evidence`
      : `terminal ${terminal} or evidence completeness did not satisfy the Case`,
  ))
  const tools = new Set(run.timeline
    .filter(item => item.kind === 'tool' && item.name !== undefined)
    .map(item => item.name!))
  for (const name of configured.requiredTools) {
    results.push(assertion(
      'required-tool',
      tools.has(name),
      tools.has(name) ? 'required tool was observed' : 'required tool was not observed',
      name,
    ))
  }
  for (const name of configured.forbiddenTools) {
    results.push(assertion(
      'forbidden-tool',
      !tools.has(name),
      tools.has(name) ? 'forbidden tool was observed' : 'forbidden tool was not observed',
      name,
    ))
  }
  for (const value of configured.requiredOutputSubstrings) {
    results.push(assertion(
      'required-output',
      output.includes(value),
      output.includes(value) ? 'required output marker was observed' : 'required output marker was absent',
      value,
    ))
  }
  for (const value of configured.forbiddenOutputSubstrings) {
    results.push(assertion(
      'forbidden-output',
      !output.includes(value),
      output.includes(value) ? 'forbidden output marker was observed' : 'forbidden output marker was absent',
      value,
    ))
  }
  const steps = run.timeline
    .filter(item => item.kind === 'step' && item.step !== undefined)
    .map(item => item.step!)
  const stepCount = steps.length === 0 ? 0 : Math.max(...steps)
  if (configured.maxSteps !== undefined) {
    results.push(assertion(
      'max-steps',
      stepCount <= configured.maxSteps,
      `observed ${stepCount} step(s); maximum ${configured.maxSteps}`,
    ))
  }
  if (configured.maxReportedTokens !== undefined) {
    const tokens = reportedTokens(run)
    results.push(assertion(
      'max-reported-tokens',
      tokens !== undefined && tokens <= configured.maxReportedTokens,
      tokens === undefined
        ? 'canonical runtime did not report token usage'
        : `reported ${tokens} token(s); maximum ${configured.maxReportedTokens}`,
    ))
  }
  if (configured.maxElapsedMs !== undefined) {
    const elapsed = run.run.endedAt === undefined ? undefined : run.run.endedAt - run.run.startedAt
    results.push(assertion(
      'max-elapsed-ms',
      elapsed !== undefined && elapsed <= configured.maxElapsedMs,
      elapsed === undefined
        ? 'canonical runtime did not report a terminal timestamp'
        : `elapsed ${elapsed}ms; maximum ${configured.maxElapsedMs}ms`,
    ))
  }
  return Object.freeze(results)
}

export function casePassed(assertions: readonly DigitalEmployeeEvalAssertionResult[]): boolean {
  return assertions.length > 0 && assertions.every(result => result.passed)
}

export function evalRunPassed(
  policy: DigitalEmployeeEvalPassPolicy,
  cases: readonly DigitalEmployeeEvalCaseResult[],
): boolean {
  const passed = cases.filter(testCase => testCase.status === 'passed').length
  return policy.kind === 'all' ? passed === cases.length : passed >= policy.minimumPassed
}

/** Map provider-neutral evaluation terminals into the Run vocabulary. */
export function evaluationTerminal(terminal: string): DigitalEmployeeRunTerminal {
  return terminal === 'unknown' ? 'unknown-terminal' : terminal as DigitalEmployeeRunTerminal
}
