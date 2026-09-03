import { describe, expect, it } from 'vitest'
import { digitalEmployeeEvalSetDraftSchema } from '../src/spec.ts'
import {
  effectiveEvaluationTools,
  evalEnvironmentFingerprint,
  evalSetContentFingerprint,
  evaluateCaseAssertions,
} from '../src/evaluation.ts'
import type {
  DigitalEmployeeEvalCase,
  DigitalEmployeeEvalSetDraft,
  DigitalEmployeeEvalSetRevision,
  DigitalEmployeeRunDetail,
} from '../src/types.ts'

function evalSet(overrides: Partial<DigitalEmployeeEvalSetDraft> = {}): DigitalEmployeeEvalSetDraft {
  return {
    id: 'release-gate',
    profileId: 'reviewer',
    displayName: 'Release gate',
    toolAllowlist: ['read', 'search'],
    resourceCeilings: { maxSteps: 4, maxOutputTokens: 256, maxElapsedMs: 5_000 },
    passPolicy: { kind: 'all' },
    cases: [{
      id: 'find-risk',
      title: 'Find a risk',
      input: 'Review the fixture.',
      fixtures: [{ id: 'source', content: 'export const value = 1' }],
      assertions: {
        acceptedTerminals: ['completed'],
        requiredTools: ['read'],
        forbiddenTools: ['write'],
        requiredOutputSubstrings: ['finding'],
        forbiddenOutputSubstrings: ['secret'],
        maxSteps: 2,
        maxReportedTokens: 100,
        maxElapsedMs: 1_000,
      },
    }],
    ...overrides,
  }
}

describe('Digital Employee evaluation contract', () => {
  it('validates bounded deterministic Eval Sets and rejects contradictory assertions', () => {
    expect(digitalEmployeeEvalSetDraftSchema.parse(evalSet())).toEqual(evalSet())
    const invalid = evalSet({
      cases: [{
        ...evalSet().cases[0]!,
        assertions: {
          ...evalSet().cases[0]!.assertions,
          forbiddenTools: ['read'],
        },
      }],
    })
    expect(digitalEmployeeEvalSetDraftSchema.safeParse(invalid).success).toBe(false)
  })

  it('intersects Profile, provider, and Eval tools while always denying Team tools', () => {
    expect(effectiveEvaluationTools(
      { mode: 'deny', names: ['write'] },
      ['read', 'write', 'search', 'send_message'],
      ['write', 'read', 'send_message'],
      new Set(['send_message']),
    )).toEqual(['read'])
    expect(effectiveEvaluationTools(
      { mode: 'allow', names: ['read', 'search'] },
      ['read', 'search'],
      [],
      new Set(),
    )).toEqual([])
  })

  it('fingerprints immutable fixtures and confinement independently from display timestamps', () => {
    const draft = evalSet()
    const revision = {
      schemaVersion: 1,
      evalSetId: draft.id,
      profileId: draft.profileId,
      revision: 1,
      evalSet: draft,
      fingerprint: evalSetContentFingerprint(draft),
      createdAt: 1,
      updatedAt: 1,
    } satisfies DigitalEmployeeEvalSetRevision
    const first = evalEnvironmentFingerprint({ effectiveToolAllowlist: ['read'], evalSet: revision })
    expect(first).toBe(evalEnvironmentFingerprint({
      effectiveToolAllowlist: ['read'],
      evalSet: { ...revision, createdAt: 99, updatedAt: 100 },
    }))
    expect(first).not.toBe(evalEnvironmentFingerprint({
      effectiveToolAllowlist: ['read'],
      evalSet: {
        ...revision,
        evalSet: evalSet({ cases: [{ ...draft.cases[0]!, fixtures: [{ id: 'source', content: 'changed' }] }] }),
      },
    }))
  })

  it('computes stop, tool, output, step, token, and elapsed assertions without retaining output', () => {
    const testCase = evalSet().cases[0] as DigitalEmployeeEvalCase
    const run = {
      run: {
        schemaVersion: 1,
        runId: 'run-eval' as never,
        source: 'dsh-session',
        canonicalTurnId: 'eval-session:1',
        canonicalSource: { kind: 'dsh-session', sessionId: 'eval-session', turn: 1 },
        teamId: 'lead',
        owner: { kind: 'evaluation-worker', evalRunId: 'eval-1', caseId: testCase.id },
        profileId: 'reviewer',
        profileRevision: 2,
        profileFingerprint: 'a'.repeat(64),
        selectedRuntimeTarget: { kind: 'dsh-model', provider: 'fake', model: 'model' },
        actualRuntimeTarget: { kind: 'dsh-model', provider: 'fake', model: 'model' },
        capabilityGeneration: 3,
        terminal: 'completed',
        usage: { inputTokens: 30, outputTokens: 20 },
        startedAt: 10,
        endedAt: 40,
        completeness: {
          status: 'complete',
          redactions: ['content', 'tool-arguments', 'tool-results', 'raw-payloads'],
        },
      },
      timeline: [
        { kind: 'step', step: 1, timestamp: 11, outcome: 'started' },
        { kind: 'tool', name: 'read', timestamp: 12, outcome: 'completed' },
      ],
      timelineTruncated: false,
    } satisfies DigitalEmployeeRunDetail
    const results = evaluateCaseAssertions(testCase, run, 'one finding')
    expect(results.every(result => result.passed)).toBe(true)
    expect(JSON.stringify(results)).not.toContain('one finding')
    expect(evaluateCaseAssertions(testCase, {
      ...run,
      run: { ...run.run, terminal: 'failed' },
    }, 'secret').some(result => !result.passed)).toBe(true)
  })
})
