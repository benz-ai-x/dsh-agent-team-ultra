import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const [officialRoot, ultraRoot] = process.argv.slice(2)
const { AssistantStreamAccumulator, expandAssistantStream } = await import(pathToFileURL(join(officialRoot, 'packages/llm/llm/src/assistant-stream.ts')).href)
const { foldDshRunEvidence } = await import(pathToFileURL(join(ultraRoot, 'packages/domain/src/run.ts')).href)
const attempted = { inputTokens: 11, outputTokens: 3, totalTokens: 14 }
const succeeded = { inputTokens: 5, outputTokens: 2, totalTokens: 7 }
const stream = new AssistantStreamAccumulator()
stream.push({ time: 102, chunk: { type: 'usage', usage: attempted } })
const attemptStream = stream.snapshot()
assert.deepEqual(expandAssistantStream(attemptStream)[0].chunk.usage, attempted)
const event = (type, seq, data, extra = {}) => ({ type, seq, time: 100 + seq, data, ...extra })
const events = [
  event('turn/start', 0, { turn: 1 }),
  event('step/start', 1, { turn: 1, step: 0 }),
  event('assistant/attempt', 2, { turn: 1, step: 0, stream: attemptStream }),
  event('assistant/message', 3, {
    turn: 1, step: 0,
    message: { role: 'assistant', content: [{ type: 'text', text: 'fixture' }], source: { provider: 'fixture', model: 'fixture' } },
    usage: succeeded, stream: [],
  }, { surfaceOp: 'append' }),
  event('step/end', 4, { turn: 1, step: 0 }),
  event('turn/end', 5, { turn: 1, reason: { kind: 'completed' } }),
]
const binding = {
  teamId: 'fixture-team', owner: { kind: 'team-member', memberId: 'fixture-child', memberName: 'worker' },
  profileId: 'fixture-profile', profileRevision: 1, profileFingerprint: 'a'.repeat(64),
  selectedRuntimeTarget: { kind: 'dsh-model', provider: 'fixture', model: 'fixture' }, capabilityGeneration: 1,
}
const [run] = foldDshRunEvidence(binding, 'fixture-child', events, 100, 100)
assert.deepEqual(run.index.usage, succeeded)
assert.equal(run.index.completeness.status, 'complete')
console.log(JSON.stringify({
  fixture: 'failed or retried v2 attempt with reported usage, then successful message',
  reportedAttemptUsage: attempted,
  reportedSuccessfulMessageUsage: succeeded,
  expectedAllAttemptUsage: { inputTokens: 16, outputTokens: 5, totalTokens: 21 },
  ultraUsage: run.index.usage,
  ultraCompleteness: run.index.completeness.status,
}, null, 2))
