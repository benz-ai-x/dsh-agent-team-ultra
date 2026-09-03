import { SessionId, SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import {
  createExternalRunIndex,
  foldExternalRunEvidence,
  foldDshRunEvidence,
  runIdForDshTurn,
  type ExternalRunFoldBinding,
  type DshRunFoldBinding,
} from '../src/run.ts'
import { digitalEmployeeRunIndexRecordSchema } from '../src/storage.ts'

const binding = Object.freeze({
  teamId: 'lead-session',
  owner: Object.freeze({ kind: 'team-member', memberId: 'employee-session', memberName: 'reviewer' }),
  profileId: 'reviewer',
  profileRevision: 3,
  profileFingerprint: 'a'.repeat(64),
  selectedRuntimeTarget: { kind: 'dsh-model', provider: 'deepseek', model: 'reasoner' },
  actualRuntimeTarget: { kind: 'dsh-model', provider: 'deepseek', model: 'reasoner' },
  capabilityGeneration: 7,
} as const satisfies DshRunFoldBinding)

function event(
  type: SessionEvent['type'],
  seq: number,
  time: number,
  data: unknown,
): SessionEvent {
  return { type, seq: SessionSeq(seq), time, data } as SessionEvent
}

describe('truthful Run evidence fold', () => {
  it('creates one deterministic Run per accepted DSH turn and projects only safe evidence', () => {
    const events = [
      event('turn/start', 0, 100, { turn: 4 }),
      event('user/message', 1, 101, {
        role: 'user',
        content: [{ type: 'text', text: 'SECRET_PROMPT' }],
        source: {
          kind: 'team-message',
          teamId: 'lead-session',
          messageId: 'message-9',
          senderId: 'lead-session',
          senderName: 'lead',
        },
      }),
      event('step/start', 2, 102, { turn: 4, step: 0 }),
      event('tool/call', 3, 103, {
        turn: 4,
        step: 0,
        callId: 'call-1',
        name: 'read',
        arguments: '{"path":"SECRET_PATH"}',
      }),
      event('tool/result', 4, 104, {
        turn: 4,
        step: 0,
        message: {
          role: 'user',
          content: [{
            type: 'tool-result',
            toolCallId: 'call-1',
            content: [{ type: 'text', text: 'SECRET_RESULT' }],
          }],
          source: { kind: 'tool' },
        },
      }),
      event('assistant/message', 5, 105, {
        turn: 4,
        step: 0,
        message: { role: 'assistant', content: [{ type: 'text', text: 'SECRET_REPLY' }] },
        usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18, cacheReadTokens: 3 },
      }),
      event('step/end', 6, 106, { turn: 4, step: 0 }),
      event('turn/end', 7, 107, { turn: 4, reason: { kind: 'completed' } }),
    ]

    const folded = foldDshRunEvidence(binding, SessionId('employee-session'), events, 100, 100)

    expect(folded).toHaveLength(1)
    expect(folded[0]?.index).toMatchObject({
      runId: runIdForDshTurn('employee-session', 4),
      source: 'dsh-session',
      canonicalTurnId: 'employee-session:4',
      teamId: 'lead-session',
      owner: { kind: 'team-member', memberId: 'employee-session', memberName: 'reviewer' },
      profileRevision: 3,
      selectedRuntimeTarget: { kind: 'dsh-model', provider: 'deepseek', model: 'reasoner' },
      actualRuntimeTarget: { kind: 'dsh-model', provider: 'deepseek', model: 'reasoner' },
      terminal: 'completed',
      usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18, cacheReadTokens: 3 },
      startedAt: 100,
      endedAt: 107,
      completeness: { status: 'complete', redactions: ['content', 'tool-arguments', 'tool-results', 'raw-payloads'] },
    })
    expect(folded[0]?.detail.timeline).toEqual([
      { kind: 'turn', timestamp: 100, outcome: 'started' },
      { kind: 'step', timestamp: 102, step: 0, outcome: 'started' },
      { kind: 'tool', timestamp: 103, step: 0, name: 'read', callId: 'call-1', outcome: 'started' },
      { kind: 'tool', timestamp: 104, step: 0, name: 'read', callId: 'call-1', outcome: 'completed' },
      { kind: 'usage', timestamp: 105, step: 0, usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18, cacheReadTokens: 3 } },
      { kind: 'step', timestamp: 106, step: 0, outcome: 'completed' },
      { kind: 'turn', timestamp: 107, outcome: 'completed' },
    ])
    const serialized = JSON.stringify(folded)
    expect(serialized).not.toContain('SECRET_PROMPT')
    expect(serialized).not.toContain('SECRET_PATH')
    expect(serialized).not.toContain('SECRET_RESULT')
    expect(serialized).not.toContain('SECRET_REPLY')
  })

  it('marks interrupted and open turns truthfully while bounding the timeline', () => {
    const events = [
      event('turn/start', 0, 10, { turn: 1 }),
      event('turn/end', 1, 11, { turn: 1, reason: { kind: 'interrupted' } }),
      event('turn/start', 2, 20, { turn: 2 }),
      event('step/start', 3, 21, { turn: 2, step: 0 }),
    ]

    const folded = foldDshRunEvidence(binding, SessionId('employee-session'), events, 1, 100)

    expect(folded.map(run => run.index.terminal)).toEqual(['interrupted', 'unknown-terminal'])
    expect(folded[0]?.detail.timeline).toHaveLength(1)
    expect(folded[0]?.detail.timelineTruncated).toBe(true)
    expect(folded[1]?.index.completeness).toMatchObject({
      status: 'incomplete',
      diagnostic: 'accepted DSH turn has no terminal event',
    })
  })

  it('projects exact DSH approval audit pairs and orphans unresolved crash tails', () => {
    const events = [
      event('turn/start', 0, 10, { turn: 1 }),
      event('tool/call', 1, 11, {
        turn: 1,
        step: 0,
        callId: 'call-1',
        name: 'write_file',
        arguments: '{"path":"SECRET_PATH"}',
      }),
      event('approval/asked' as SessionEvent['type'], 2, 12, {
        id: 'approval-1',
        toolName: 'write_file',
        callId: 'call-1',
        reason: 'Confirm this exact write call.',
      }),
    ]

    const live = foldDshRunEvidence(
      binding,
      SessionId('employee-session'),
      events,
      10,
      10,
      new Set(['approval-1']),
    )
    expect(live[0]?.detail.timeline).toContainEqual({
      kind: 'approval',
      timestamp: 12,
      name: 'write_file',
      callId: 'call-1',
      approvalId: 'approval-1',
      policy: 'Confirm this exact write call.',
      outcome: 'waiting-approval',
    })

    const repaired = foldDshRunEvidence(binding, SessionId('employee-session'), events, 10, 10)
    expect(repaired[0]?.detail.timeline).toContainEqual(expect.objectContaining({
      kind: 'approval',
      approvalId: 'approval-1',
      outcome: 'orphaned',
    }))
    expect(JSON.stringify(repaired)).not.toContain('SECRET_PATH')

    const decided = foldDshRunEvidence(binding, SessionId('employee-session'), [
      ...events,
      event('approval/decided' as SessionEvent['type'], 3, 13, {
        id: 'approval-1',
        outcome: 'allowed-once',
      }),
      event('turn/end', 4, 14, { turn: 1, reason: { kind: 'completed' } }),
    ], 10, 10)
    expect(decided[0]?.detail.timeline.filter(item => item.kind === 'approval')).toEqual([
      {
        kind: 'approval',
        timestamp: 12,
        name: 'write_file',
        callId: 'call-1',
        approvalId: 'approval-1',
        policy: 'Confirm this exact write call.',
        outcome: 'asked',
      },
      {
        kind: 'approval',
        timestamp: 13,
        name: 'write_file',
        callId: 'call-1',
        approvalId: 'approval-1',
        policy: 'Confirm this exact write call.',
        outcome: 'allowed-once',
      },
    ])
  })

  it('folds only the newest bounded DSH Runs during index repair', () => {
    const events = [
      event('turn/start', 0, 10, { turn: 1 }),
      event('turn/end', 1, 11, { turn: 1, reason: { kind: 'completed' } }),
      event('turn/start', 2, 20, { turn: 2 }),
      event('turn/end', 3, 21, { turn: 2, reason: { kind: 'completed' } }),
      event('turn/start', 4, 30, { turn: 3 }),
      event('turn/end', 5, 31, { turn: 3, reason: { kind: 'completed' } }),
    ]

    const folded = foldDshRunEvidence(binding, SessionId('employee-session'), events, 10, 2)

    expect(folded.map(run => run.index.canonicalTurnId)).toEqual([
      'employee-session:2',
      'employee-session:3',
    ])
  })

  it('retains isolated evaluation identity without inventing Team membership', () => {
    const evaluationBinding = Object.freeze({
      ...binding,
      owner: Object.freeze({
        kind: 'evaluation-worker',
        evalRunId: 'eval-run-4',
        caseId: 'case-2',
      }),
    }) as unknown as DshRunFoldBinding
    const folded = foldDshRunEvidence(evaluationBinding, SessionId('eval-session'), [
      event('turn/start', 0, 40, { turn: 1 }),
      event('turn/end', 1, 41, { turn: 1, reason: { kind: 'completed' } }),
    ], 10, 10)

    expect(folded[0]?.index).toMatchObject({
      teamId: 'lead-session',
      owner: { kind: 'evaluation-worker', evalRunId: 'eval-run-4', caseId: 'case-2' },
      canonicalSource: { kind: 'dsh-session', sessionId: 'eval-session', turn: 1 },
    })
    expect(folded[0]?.index).not.toHaveProperty('memberId')
    expect(folded[0]?.index).not.toHaveProperty('memberName')
    expect(digitalEmployeeRunIndexRecordSchema.parse(folded[0]?.index).owner).toEqual({
      kind: 'evaluation-worker',
      evalRunId: 'eval-run-4',
      caseId: 'case-2',
    })
  })

  it('correlates bounded provider evidence to one exact native turn without copying payloads', () => {
    const externalBinding = Object.freeze({
      ...binding,
      selectedRuntimeTarget: { kind: 'external-agent', provider: 'claude-code' },
      actualRuntimeTarget: { kind: 'external-agent', provider: 'claude-code' },
      nativeHandle: 'native-session-7',
    } as const satisfies ExternalRunFoldBinding)
    const index = createExternalRunIndex(
      externalBinding,
      'native-turn-3',
      'native-turn-3',
      200,
    )
    const folded = foldExternalRunEvidence(index, [
      {
        id: 'evidence-tool',
        kind: 'tool',
        timestamp: 201,
        turnId: 'native-turn-3',
        name: 'read',
        outcome: 'completed',
        raw: 'SECRET_PROVIDER_PAYLOAD',
      },
      {
        id: 'evidence-usage',
        kind: 'usage',
        timestamp: 202,
        turnId: 'native-turn-3',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
      },
      {
        id: 'evidence-turn',
        kind: 'turn',
        timestamp: 203,
        turnId: 'native-turn-3',
        outcome: 'completed',
      },
      {
        id: 'another-turn',
        kind: 'turn',
        timestamp: 204,
        turnId: 'native-turn-4',
        outcome: 'failed',
      },
    ], true, 10)

    expect(folded.index).toMatchObject({
      source: 'external-native',
      canonicalTurnId: 'native-turn-3',
      terminal: 'completed',
      endedAt: 203,
      usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
      completeness: { status: 'complete' },
      canonicalSource: {
        kind: 'external-native',
        provider: 'claude-code',
        nativeHandle: 'native-session-7',
        nativeTurnId: 'native-turn-3',
      },
    })
    expect(folded.detail.timeline).toEqual([
      { kind: 'tool', timestamp: 201, name: 'read', outcome: 'completed' },
      { kind: 'usage', timestamp: 202, usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 } },
      { kind: 'turn', timestamp: 203, outcome: 'completed' },
    ])
    expect(JSON.stringify(folded)).not.toContain('SECRET_PROVIDER_PAYLOAD')
  })

  it('uses the latest provider-reported usage snapshot instead of double-counting cumulative reports', () => {
    const externalBinding = Object.freeze({
      ...binding,
      selectedRuntimeTarget: { kind: 'external-agent', provider: 'codex' },
      actualRuntimeTarget: { kind: 'external-agent', provider: 'codex' },
      nativeHandle: 'native-session-8',
    } as const satisfies ExternalRunFoldBinding)
    const index = createExternalRunIndex(externalBinding, 'native-turn-8', 'native-turn-8', 300)

    const folded = foldExternalRunEvidence(index, [
      {
        id: 'usage-1',
        kind: 'usage',
        timestamp: 301,
        turnId: 'native-turn-8',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
      },
      {
        id: 'usage-2',
        kind: 'usage',
        timestamp: 302,
        turnId: 'native-turn-8',
        usage: { inputTokens: 8, outputTokens: 3, totalTokens: 11 },
      },
      {
        id: 'turn-8',
        kind: 'turn',
        timestamp: 303,
        turnId: 'native-turn-8',
        outcome: 'completed',
      },
    ], true, 10)

    expect(folded.index.usage).toEqual({ inputTokens: 8, outputTokens: 3, totalTokens: 11 })
    expect(folded.detail.timeline.filter(item => item.kind === 'usage')).toHaveLength(2)
  })

  it('projects only correlated native approval decisions and requires a live pending identity for waiting', () => {
    const externalBinding = Object.freeze({
      ...binding,
      selectedRuntimeTarget: { kind: 'external-agent', provider: 'capable-native' },
      actualRuntimeTarget: { kind: 'external-agent', provider: 'capable-native' },
      nativeHandle: 'native-session-9',
    } as const satisfies ExternalRunFoldBinding)
    const index = createExternalRunIndex(externalBinding, 'native-turn-9', 'native-turn-9', 400)
    const evidence = [
      {
        id: 'tool-1',
        kind: 'tool' as const,
        timestamp: 400,
        turnId: 'native-turn-9',
        name: 'write_file',
        callId: 'native-call-1',
        outcome: 'blocked' as const,
      },
      {
        id: 'approval-asked-1',
        kind: 'approval' as const,
        timestamp: 401,
        turnId: 'native-turn-9',
        name: 'write_file',
        outcome: 'asked' as const,
        approvalId: 'native-approval-1',
        callId: 'native-call-1',
        policyId: 'confirm-write',
      },
      {
        id: 'tool-2',
        kind: 'tool' as const,
        timestamp: 402,
        turnId: 'native-turn-9',
        name: 'write_file',
        callId: 'native-call-2',
        outcome: 'blocked' as const,
      },
      {
        id: 'approval-decided-1',
        kind: 'approval' as const,
        timestamp: 402,
        turnId: 'native-turn-9',
        name: 'write_file',
        outcome: 'rejected' as const,
        approvalId: 'native-approval-1',
        callId: 'native-call-1',
        policyId: 'confirm-write',
      },
      {
        id: 'approval-unbacked',
        kind: 'approval' as const,
        timestamp: 404,
        turnId: 'native-turn-9',
        name: 'write_file',
        outcome: 'asked' as const,
        approvalId: 'native-approval-unbacked',
        callId: 'native-call-unbacked',
        policyId: 'confirm-write',
      },
      {
        id: 'approval-asked-2',
        kind: 'approval' as const,
        timestamp: 403,
        turnId: 'native-turn-9',
        name: 'write_file',
        outcome: 'asked' as const,
        approvalId: 'native-approval-2',
        callId: 'native-call-2',
        policyId: 'confirm-write',
      },
    ]
    const pending = [{
      turnId: 'native-turn-9',
      approvalId: 'native-approval-2',
      callId: 'native-call-2',
    }]

    const live = foldExternalRunEvidence(index, evidence, false, 10, pending)
    expect(live.detail.timeline.filter(item => item.kind === 'approval')).toEqual([
      expect.objectContaining({ approvalId: 'native-approval-1', outcome: 'asked' }),
      expect.objectContaining({ approvalId: 'native-approval-1', outcome: 'rejected' }),
      expect.objectContaining({ approvalId: 'native-approval-2', outcome: 'waiting-approval' }),
    ])
    expect(live.detail.timeline).not.toContainEqual(expect.objectContaining({
      approvalId: 'native-approval-unbacked',
    }))
    const repaired = foldExternalRunEvidence(index, evidence, false, 10)
    expect(repaired.detail.timeline).toContainEqual(expect.objectContaining({
      approvalId: 'native-approval-2',
      outcome: 'orphaned',
    }))

    const terminal = foldExternalRunEvidence(index, [
      ...evidence,
      {
        id: 'turn-complete',
        kind: 'turn' as const,
        timestamp: 405,
        turnId: 'native-turn-9',
        outcome: 'completed' as const,
      },
    ], true, 20, pending)
    expect(terminal.detail.timeline).toContainEqual(expect.objectContaining({
      approvalId: 'native-approval-2',
      outcome: 'orphaned',
    }))
  })
})
