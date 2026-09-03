/** Safe, runtime-neutral Run identity and DSH Session evidence folding. */

import { createHash } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionEvent, SessionId, TurnEndReason } from '@deepseek-ai/dsh-session'
import type {
  DigitalEmployeeRunDetail,
  DigitalEmployeeRunId,
  DigitalEmployeeRunIndexRecord,
  DigitalEmployeeRunNativeHandle,
  DigitalEmployeeRunOwner,
  DigitalEmployeeRunTerminal,
  DigitalEmployeeRunTimelineItem,
  DigitalEmployeeRunUsage,
  DigitalEmployeeRuntimeTarget,
  SelectableDigitalEmployeeRuntimeTarget,
} from './types.ts'

export interface DshRunFoldBinding {
  readonly teamId: string
  readonly owner: DigitalEmployeeRunOwner
  readonly profileId: string
  readonly profileRevision: number
  readonly profileFingerprint: string
  readonly selectedRuntimeTarget: DigitalEmployeeRuntimeTarget
  readonly actualRuntimeTarget?: SelectableDigitalEmployeeRuntimeTarget
  readonly capabilityGeneration: number
}

export interface FoldedDshRun {
  readonly index: DigitalEmployeeRunIndexRecord
  readonly detail: DigitalEmployeeRunDetail
}

export interface ExternalRunFoldBinding extends DshRunFoldBinding {
  readonly selectedRuntimeTarget: { readonly kind: 'external-agent'; readonly provider: string }
  readonly actualRuntimeTarget?: { readonly kind: 'external-agent'; readonly provider: string }
  readonly nativeHandle: string
}

interface ExternalEvidenceLike {
  readonly id: string
  readonly kind: 'turn' | 'tool' | 'approval' | 'usage' | 'diagnostic'
  readonly timestamp: number
  readonly turnId?: string
  readonly name?: string
  readonly outcome?:
    | 'completed'
    | 'cancelled'
    | 'blocked'
    | 'failed'
    | 'interrupted'
    | 'unknown'
    | 'asked'
    | 'allowed-once'
    | 'rejected'
    | 'unavailable'
  readonly approvalId?: string
  readonly callId?: string
  readonly policyId?: string
  readonly usage?: unknown
}

interface PendingApprovalLike {
  readonly turnId: string
  readonly approvalId: string
  readonly callId: string
}

const REDACTIONS = Object.freeze([
  'content',
  'tool-arguments',
  'tool-results',
  'raw-payloads',
] as const)

/** Deterministically identify one accepted DSH Session turn. */
export function runIdForDshTurn(sessionId: string, turn: number): DigitalEmployeeRunId {
  const digest = createHash('sha256')
    .update(JSON.stringify(['dsh-session', sessionId, turn]), 'utf8')
    .digest('base64url')
  return brandString<DigitalEmployeeRunId>(`run_${digest}`)
}

/** Deterministically identify one provider-native accepted turn. */
export function runIdForExternalTurn(
  provider: string,
  nativeHandle: string,
  canonicalTurnId: string,
): DigitalEmployeeRunId {
  const digest = createHash('sha256')
    .update(JSON.stringify(['external-native', provider, nativeHandle, canonicalTurnId]), 'utf8')
    .digest('base64url')
  return brandString<DigitalEmployeeRunId>(`run_${digest}`)
}

function terminal(reason: TurnEndReason): DigitalEmployeeRunTerminal {
  switch (reason.kind) {
    case 'completed': return 'completed'
    case 'aborted': return 'cancelled'
    case 'blocked': return 'blocked'
    case 'error': return 'failed'
    case 'max-tokens': return 'max-tokens'
    case 'interrupted': return 'interrupted'
    default: return 'unknown-terminal'
  }
}

function externalTerminal(
  outcome: ExternalEvidenceLike['outcome'],
): DigitalEmployeeRunTerminal {
  switch (outcome) {
    case 'completed': return 'completed'
    case 'cancelled': return 'cancelled'
    case 'blocked': return 'blocked'
    case 'failed': return 'failed'
    case 'interrupted': return 'interrupted'
    case 'asked':
    case 'allowed-once':
    case 'rejected':
    case 'unavailable':
    case 'unknown':
    case undefined:
      return 'unknown-terminal'
  }
}

function usageOf(value: unknown): DigitalEmployeeRunUsage | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const usage = value as Record<string, unknown>
  if (typeof usage.inputTokens !== 'number' || typeof usage.outputTokens !== 'number') return undefined
  return Object.freeze({
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    ...(typeof usage.totalTokens === 'number' ? { totalTokens: usage.totalTokens } : {}),
    ...(typeof usage.cacheReadTokens === 'number' ? { cacheReadTokens: usage.cacheReadTokens } : {}),
    ...(typeof usage.cacheWriteTokens === 'number' ? { cacheWriteTokens: usage.cacheWriteTokens } : {}),
    ...(typeof usage.reasoningTokens === 'number' ? { reasoningTokens: usage.reasoningTokens } : {}),
  })
}

function addUsage(
  current: DigitalEmployeeRunUsage | undefined,
  reported: DigitalEmployeeRunUsage,
): DigitalEmployeeRunUsage {
  const sum = (field: keyof DigitalEmployeeRunUsage): number | undefined => {
    const right = reported[field]
    const left = current?.[field]
    if (right === undefined && left === undefined) return undefined
    return (left ?? 0) + (right ?? 0)
  }
  return Object.freeze({
    inputTokens: (current?.inputTokens ?? 0) + reported.inputTokens,
    outputTokens: (current?.outputTokens ?? 0) + reported.outputTokens,
    ...(sum('totalTokens') === undefined ? {} : { totalTokens: sum('totalTokens')! }),
    ...(sum('cacheReadTokens') === undefined ? {} : { cacheReadTokens: sum('cacheReadTokens')! }),
    ...(sum('cacheWriteTokens') === undefined ? {} : { cacheWriteTokens: sum('cacheWriteTokens')! }),
    ...(sum('reasoningTokens') === undefined ? {} : { reasoningTokens: sum('reasoningTokens')! }),
  })
}

function eventTurn(event: SessionEvent): number | undefined {
  if (event.type === 'turn/start' || event.type === 'turn/end'
    || event.type === 'step/start' || event.type === 'step/end'
    || event.type === 'assistant/message' || event.type === 'tool/call'
    || event.type === 'tool/result') return event.data.turn
  return undefined
}

type ApprovalAuditEvent =
  | {
    readonly type: 'approval/asked'
    readonly time: number
    readonly data: {
      readonly id: string
      readonly toolName: string
      readonly callId?: string
      readonly reason?: string
    }
  }
  | {
    readonly type: 'approval/decided'
    readonly time: number
    readonly data: {
      readonly id: string
      readonly outcome: 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'
    }
  }

function approvalAuditEvent(event: SessionEvent): ApprovalAuditEvent | undefined {
  const candidate = event as unknown as { readonly type: string; readonly time: number; readonly data: unknown }
  if (candidate.type !== 'approval/asked' && candidate.type !== 'approval/decided') return undefined
  if (candidate.data === null || typeof candidate.data !== 'object') return undefined
  const data = candidate.data as Record<string, unknown>
  if (typeof data.id !== 'string' || data.id.length === 0) return undefined
  if (candidate.type === 'approval/asked') {
    if (typeof data.toolName !== 'string' || data.toolName.length === 0) return undefined
    return {
      type: candidate.type,
      time: candidate.time,
      data: {
        id: data.id,
        toolName: data.toolName,
        ...(typeof data.callId === 'string' ? { callId: data.callId } : {}),
        ...(typeof data.reason === 'string' ? { reason: data.reason } : {}),
      },
    }
  }
  if (!['allowed-once', 'rejected', 'cancelled', 'unavailable'].includes(String(data.outcome))) return undefined
  return {
    type: candidate.type,
    time: candidate.time,
    data: {
      id: data.id,
      outcome: data.outcome as 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable',
    },
  }
}

/**
 * Fold DSH canonical events into one safe Run per accepted turn.
 * User/assistant content, tool arguments/results, headers, chunks, and opaque payloads are ignored by construction.
 */
export function foldDshRunEvidence(
  binding: DshRunFoldBinding,
  sessionId: SessionId,
  events: readonly SessionEvent[],
  maxTimelineItems: number,
  maxRuns: number,
  liveApprovalIds: ReadonlySet<string> = new Set(),
): readonly FoldedDshRun[] {
  if (!Number.isSafeInteger(maxTimelineItems) || maxTimelineItems < 1) {
    throw new TypeError('maxTimelineItems must be a positive safe integer')
  }
  if (!Number.isSafeInteger(maxRuns) || maxRuns < 1) {
    throw new TypeError('maxRuns must be a positive safe integer')
  }
  const eventsByTurn = new Map<number, SessionEvent[]>()
  const starts: SessionEvent<'turn/start'>[] = []
  let openTurn: number | undefined
  for (const current of events) {
    if (current.type === 'turn/start') openTurn = current.data.turn
    const turn = eventTurn(current) ?? (approvalAuditEvent(current) === undefined ? undefined : openTurn)
    if (turn === undefined) continue
    const grouped = eventsByTurn.get(turn) ?? []
    grouped.push(current)
    eventsByTurn.set(turn, grouped)
    if (current.type === 'turn/start') starts.push(current)
    if (current.type === 'turn/end') openTurn = undefined
  }
  const retainedStarts = starts.slice(-maxRuns)
  return Object.freeze(retainedStarts.map((start) => {
    const turn = start.data.turn
    const selected = eventsByTurn.get(turn) ?? []
    const timeline: DigitalEmployeeRunTimelineItem[] = [Object.freeze({
      kind: 'turn',
      timestamp: start.time,
      outcome: 'started',
    })]
    const toolNames = new Map<string, string>()
    const approvals = new Map<string, {
      readonly timelineIndex: number
      readonly name: string
      readonly callId: string
      readonly policy?: string
      decided: boolean
    }>()
    let reportedUsage: DigitalEmployeeRunUsage | undefined
    let end: SessionEvent<'turn/end'> | undefined
    for (const current of selected) {
      const approval = approvalAuditEvent(current)
      if (approval?.type === 'approval/asked') {
        const callId = approval.data.callId
        if (callId === undefined || toolNames.get(callId) !== approval.data.toolName || approvals.has(approval.data.id)) {
          continue
        }
        const item = {
          kind: 'approval' as const,
          timestamp: approval.time,
          name: approval.data.toolName,
          callId,
          approvalId: approval.data.id,
          ...(approval.data.reason === undefined ? {} : { policy: approval.data.reason }),
          outcome: 'asked' as const,
        }
        approvals.set(approval.data.id, {
          timelineIndex: timeline.length,
          name: approval.data.toolName,
          callId,
          ...(approval.data.reason === undefined ? {} : { policy: approval.data.reason }),
          decided: false,
        })
        timeline.push(Object.freeze(item))
        continue
      }
      if (approval?.type === 'approval/decided') {
        const pending = approvals.get(approval.data.id)
        if (pending === undefined || pending.decided) continue
        pending.decided = true
        timeline.push(Object.freeze({
          kind: 'approval',
          timestamp: approval.time,
          name: pending.name,
          callId: pending.callId,
          approvalId: approval.data.id,
          ...(pending.policy === undefined ? {} : { policy: pending.policy }),
          outcome: approval.data.outcome,
        }))
        continue
      }
      switch (current.type) {
        case 'turn/start': break
        case 'step/start':
          timeline.push(Object.freeze({ kind: 'step', timestamp: current.time, step: current.data.step, outcome: 'started' }))
          break
        case 'tool/call':
          toolNames.set(current.data.callId, current.data.name)
          timeline.push(Object.freeze({
            kind: 'tool',
            timestamp: current.time,
            step: current.data.step,
            name: current.data.name,
            callId: current.data.callId,
            outcome: 'started',
          }))
          break
        case 'tool/result': {
          const result = current.data.message.content[0]
          const name = toolNames.get(result.toolCallId)
          timeline.push(Object.freeze({
            kind: 'tool',
            timestamp: current.time,
            step: current.data.step,
            ...(name === undefined ? {} : { name }),
            callId: result.toolCallId,
            outcome: current.data.error === undefined && result.isError !== true ? 'completed' : 'failed',
          }))
          break
        }
        case 'assistant/message': {
          const usage = usageOf(current.data.usage)
          if (usage !== undefined) {
            reportedUsage = addUsage(reportedUsage, usage)
            timeline.push(Object.freeze({
              kind: 'usage',
              timestamp: current.time,
              step: current.data.step,
              usage,
            }))
          }
          break
        }
        case 'step/end':
          timeline.push(Object.freeze({ kind: 'step', timestamp: current.time, step: current.data.step, outcome: 'completed' }))
          break
        case 'turn/end':
          end = current
          timeline.push(Object.freeze({ kind: 'turn', timestamp: current.time, outcome: terminal(current.data.reason) }))
          break
      }
    }
    for (const [approvalId, pending] of approvals) {
      if (pending.decided) continue
      timeline[pending.timelineIndex] = Object.freeze({
        ...timeline[pending.timelineIndex]!,
        outcome: liveApprovalIds.has(approvalId) ? 'waiting-approval' : 'orphaned',
      })
    }
    const terminalClass = end === undefined ? 'unknown-terminal' : terminal(end.data.reason)
    const completeness = Object.freeze(end === undefined
      ? {
          status: 'incomplete' as const,
          diagnostic: 'accepted DSH turn has no terminal event',
          redactions: REDACTIONS,
        }
      : terminalClass === 'unknown-terminal'
        ? {
            status: 'incomplete' as const,
            diagnostic: 'DSH turn ended with an unsupported terminal class',
            redactions: REDACTIONS,
          }
        : { status: 'complete' as const, redactions: REDACTIONS })
    const index = Object.freeze({
      schemaVersion: 1 as const,
      runId: runIdForDshTurn(sessionId, turn),
      source: 'dsh-session' as const,
      canonicalTurnId: `${sessionId}:${turn}`,
      canonicalSource: Object.freeze({ kind: 'dsh-session' as const, sessionId, turn }),
      teamId: binding.teamId,
      owner: Object.freeze(structuredClone(binding.owner)),
      profileId: binding.profileId,
      profileRevision: binding.profileRevision,
      profileFingerprint: binding.profileFingerprint,
      selectedRuntimeTarget: Object.freeze(structuredClone(binding.selectedRuntimeTarget)),
      ...(binding.actualRuntimeTarget === undefined
        ? {}
        : { actualRuntimeTarget: Object.freeze(structuredClone(binding.actualRuntimeTarget)) }),
      capabilityGeneration: binding.capabilityGeneration,
      terminal: terminalClass,
      ...(reportedUsage === undefined ? {} : { usage: reportedUsage }),
      startedAt: start.time,
      ...(end === undefined ? {} : { endedAt: end.time }),
      completeness,
    }) satisfies DigitalEmployeeRunIndexRecord
    const truncated = timeline.length > maxTimelineItems
    const bounded = Object.freeze(timeline.slice(0, maxTimelineItems))
    const detail = Object.freeze({ run: index, timeline: bounded, timelineTruncated: truncated })
    return Object.freeze({ index, detail })
  }))
}

/** Create the durable provisional index row at native work-acceptance time. */
export function createExternalRunIndex(
  binding: ExternalRunFoldBinding,
  canonicalTurnId: string,
  nativeTurnId: string | undefined,
  acceptedAt: number,
): DigitalEmployeeRunIndexRecord {
  const nativeHandle = brandString<DigitalEmployeeRunNativeHandle>(binding.nativeHandle)
  return Object.freeze({
    schemaVersion: 1,
    runId: runIdForExternalTurn(
      binding.selectedRuntimeTarget.provider,
      nativeHandle,
      canonicalTurnId,
    ),
    source: 'external-native',
    canonicalTurnId,
    canonicalSource: Object.freeze({
      kind: 'external-native',
      provider: binding.selectedRuntimeTarget.provider,
      nativeHandle,
      ...(nativeTurnId === undefined ? {} : { nativeTurnId }),
    }),
    teamId: binding.teamId,
    owner: Object.freeze(structuredClone(binding.owner)),
    profileId: binding.profileId,
    profileRevision: binding.profileRevision,
    profileFingerprint: binding.profileFingerprint,
    selectedRuntimeTarget: Object.freeze(structuredClone(binding.selectedRuntimeTarget)),
    ...(binding.actualRuntimeTarget === undefined
      ? {}
      : { actualRuntimeTarget: Object.freeze(structuredClone(binding.actualRuntimeTarget)) }),
    capabilityGeneration: binding.capabilityGeneration,
    terminal: 'unknown-terminal',
    startedAt: acceptedAt,
    completeness: Object.freeze({
      status: nativeTurnId === undefined ? 'unavailable' : 'incomplete',
      ...(nativeTurnId === undefined
        ? { diagnostic: 'provider did not report a stable native turn correlation' }
        : { diagnostic: 'provider-native turn evidence has not been folded yet' }),
      redactions: REDACTIONS,
    }),
  })
}

/** Lazily fold one provider-normalized evidence page for its exact native turn. */
export function foldExternalRunEvidence(
  record: DigitalEmployeeRunIndexRecord,
  evidence: readonly ExternalEvidenceLike[],
  providerComplete: boolean,
  maxTimelineItems: number,
  pendingApprovals: readonly PendingApprovalLike[] = [],
): FoldedDshRun {
  if (record.canonicalSource.kind !== 'external-native') {
    throw new TypeError('external evidence requires an external-native Run')
  }
  if (!Number.isSafeInteger(maxTimelineItems) || maxTimelineItems < 1) {
    throw new TypeError('maxTimelineItems must be a positive safe integer')
  }
  const nativeTurnId = record.canonicalSource.nativeTurnId
  if (nativeTurnId === undefined) {
    const detail = Object.freeze({ run: record, timeline: Object.freeze([]), timelineTruncated: false })
    return Object.freeze({ index: record, detail })
  }
  const matching = evidence
    .filter(item => item.turnId === nativeTurnId)
    .map(item => structuredClone(item))
    .sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id))
  const timeline: DigitalEmployeeRunTimelineItem[] = []
  const proposedCalls = new Map<string, string | undefined>()
  for (const item of matching) {
    if (item.kind !== 'tool' || item.callId === undefined || item.name === undefined) continue
    const known = proposedCalls.get(item.callId)
    if (!proposedCalls.has(item.callId)) proposedCalls.set(item.callId, item.name)
    else if (known !== item.name) proposedCalls.set(item.callId, undefined)
  }
  const pendingKeys = new Set(pendingApprovals.map(pending => JSON.stringify([
    pending.turnId,
    pending.approvalId,
    pending.callId,
  ])))
  const approvals = new Map<string, {
    readonly timelineIndex: number
    readonly turnId: string
    readonly name: string
    readonly callId: string
    readonly policyId: string
    decided: boolean
  }>()
  let reportedUsage: DigitalEmployeeRunUsage | undefined
  let terminalItem: ExternalEvidenceLike | undefined
  for (const item of matching) {
    if (item.kind === 'approval') {
      if (item.approvalId === undefined || item.callId === undefined || item.policyId === undefined
        || item.name === undefined) continue
      if (item.outcome === 'asked') {
        if (approvals.has(item.approvalId) || proposedCalls.get(item.callId) !== item.name) continue
        approvals.set(item.approvalId, {
          timelineIndex: timeline.length,
          turnId: item.turnId!,
          name: item.name,
          callId: item.callId,
          policyId: item.policyId,
          decided: false,
        })
        timeline.push(Object.freeze({
          kind: 'approval',
          timestamp: item.timestamp,
          name: item.name,
          callId: item.callId,
          approvalId: item.approvalId,
          policyId: item.policyId,
          outcome: 'asked',
        }))
        continue
      }
      const pending = approvals.get(item.approvalId)
      if (pending === undefined || pending.decided
        || pending.turnId !== item.turnId
        || pending.name !== item.name
        || pending.callId !== item.callId
        || pending.policyId !== item.policyId
        || !['allowed-once', 'rejected', 'cancelled', 'unavailable'].includes(String(item.outcome))) continue
      pending.decided = true
      timeline.push(Object.freeze({
        kind: 'approval',
        timestamp: item.timestamp,
        name: item.name,
        callId: item.callId,
        approvalId: item.approvalId,
        policyId: item.policyId,
        outcome: item.outcome as 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable',
      }))
      continue
    }
    if (item.kind === 'usage') {
      const usage = usageOf(item.usage)
      if (usage !== undefined) {
        // External providers report snapshots for one native turn. Keep the
        // latest provider-owned counters instead of inventing a sum across
        // successive progress reports.
        reportedUsage = usage
        timeline.push(Object.freeze({ kind: 'usage', timestamp: item.timestamp, usage }))
      }
      continue
    }
    if (item.kind === 'turn') terminalItem = item
    timeline.push(Object.freeze({
      kind: item.kind,
      timestamp: item.timestamp,
      ...(item.name === undefined ? {} : { name: item.name }),
      ...(item.callId === undefined ? {} : { callId: item.callId }),
      ...(item.outcome === undefined ? {} : { outcome: externalTerminal(item.outcome) }),
    }))
  }
  for (const [approvalId, pending] of approvals) {
    if (pending.decided) continue
    const live = terminalItem === undefined
      && pendingKeys.has(JSON.stringify([pending.turnId, approvalId, pending.callId]))
    timeline[pending.timelineIndex] = Object.freeze({
      ...timeline[pending.timelineIndex]!,
      outcome: live ? 'waiting-approval' : 'orphaned',
    })
  }
  const terminalClass = terminalItem === undefined
    ? 'unknown-terminal'
    : externalTerminal(terminalItem.outcome)
  const complete = providerComplete && terminalItem !== undefined && terminalClass !== 'unknown-terminal'
  const completeness = Object.freeze({
    status: complete ? 'complete' as const : 'incomplete' as const,
    ...complete
      ? {}
      : {
          diagnostic: providerComplete
            ? 'provider evidence has no supported terminal fact for this native turn'
            : 'provider evidence page is incomplete',
        },
    redactions: REDACTIONS,
  })
  const index = Object.freeze({
    ...record,
    terminal: terminalClass,
    ...(reportedUsage === undefined ? {} : { usage: reportedUsage }),
    ...(terminalItem === undefined ? {} : { endedAt: terminalItem.timestamp }),
    completeness,
  })
  const truncated = timeline.length > maxTimelineItems
  const bounded = Object.freeze(timeline.slice(0, maxTimelineItems))
  const detail = Object.freeze({ run: index, timeline: bounded, timelineTruncated: truncated })
  return Object.freeze({ index, detail })
}
