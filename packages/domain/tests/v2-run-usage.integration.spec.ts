import { createUserMessage, expandAssistantStream, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { expect, it } from 'vitest'
import type { DigitalEmployeeStudioView, GetDigitalEmployeeRunResult, SpawnDigitalEmployeeResult } from '../src/types.ts'
import { cleanups, profile, workflow, WorkflowAdapter } from './fixtures/host-workflow.ts'

class RetryingUsageAdapter extends WorkflowAdapter {
  attempts = 0
  reportTerminal = true
  reportTotal = true
  readonly streaming = Promise.withResolvers<void>()
  readonly finishStream = Promise.withResolvers<void>()

  override async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.attempts += 1
    if (this.attempts === 1) {
      yield { type: 'usage', usage: { inputTokens: 8, outputTokens: 1, totalTokens: 9 } }
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 } }
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 } }
      yield { type: 'finish', reason: { kind: 'error', failure: { code: 'SERVER', message: 'PRIVATE_RETRY' } } }
      return
    }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'PRIVATE_RESPONSE' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'PRIVATE_RESPONSE' } }
    yield { type: 'usage', usage: { inputTokens: 5, outputTokens: 2, ...(this.reportTotal ? { totalTokens: 7 } : {}) } }
    this.streaming.resolve()
    await this.finishStream.promise
    if (this.reportTerminal) yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

it.each([
  ['json', true, true], ['json', false, true], ['sqlite', true, true], ['sqlite', false, true],
  ['json', true, false],
] as const)('reports one %s Run with truthful terminal=%s and aggregate availability=%s', async (backend, reportTerminal, reportTotal) => {
  const first = await workflow(backend)
  first.lead.agent.followup(createUserMessage({
    content: [{ type: 'text', text: 'Prepare durable Team.' }],
    source: { kind: 'plugin', plugin: 'v2-run-usage-test' },
  }))
  await first.lead.agent.whenIdle()
  const adapter = new RetryingUsageAdapter()
  cleanups.push(async () => { adapter.finishStream.resolve() })
  adapter.reportTerminal = reportTerminal
  adapter.reportTotal = reportTotal
  first.ctx.llm.registerAdapter(['usage-retry'], adapter)
  first.ctx.on('agent/request-error', async ({ provider }) => provider === 'usage-retry' ? { kind: 'retry' as const } : undefined)
  const target = { kind: 'dsh-model', provider: 'usage-retry', model: 'reviewer' } as const
  await expect(first.invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target })).resolves.toMatchObject({ ok: true })
  await expect(first.invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 })).resolves.toMatchObject({ ok: true })
  const launched = await first.invoke('spawn', {
    launchRequestId: '42424242-4242-4242-8242-424242424242',
    profileId: profile.id, assignment: 'Retry the same accepted work, PRIVATE_INPUT.',
  }) as SpawnDigitalEmployeeResult
  if (!launched.ok || !launched.value.memberId) throw new Error('employee was not launched')
  const memberId = SessionId(launched.value.memberId)
  await adapter.streaming.promise
  try {
    const live = await first.invoke('view') as DigitalEmployeeStudioView
    expect(live.runs).toHaveLength(1)
    expect(live.runs[0]).toMatchObject({ usage: { totalTokens: 14 }, completeness: { status: 'incomplete' } })
    await expect(first.invoke('run', { runId: live.runs[0]!.runId })).resolves.toMatchObject({
      ok: true, value: { run: { usage: { totalTokens: 14 }, terminal: 'unknown-terminal' } },
    })
  } finally { adapter.finishStream.resolve() }
  await expect.poll(() => first.ctx.agents.get(memberId)).toBeUndefined()
  expect(adapter.attempts).toBe(2)
  const handle = await first.ctx.sessionPersistence.open(memberId, 'read')
  try {
    expect(handle.header.version).toBe(2)
    const events = await handle.read()
    expect(events.filter(event => event.type === 'turn/start')).toHaveLength(1)
    const settlements = events.filter(event => event.type === 'assistant/attempt' || event.type === 'assistant/message')
    expect(settlements.map(event => event.type)).toEqual(['assistant/attempt', 'assistant/message'])
    expect(settlements.map(event => expandAssistantStream(event.data.stream)
      .filter(({ chunk }) => chunk.type === 'usage').map(({ chunk }) => chunk.type === 'usage' && chunk.usage.totalTokens)))
      .toEqual([[9, 14, 14], [reportTotal ? 7 : undefined]])
  } finally { await handle.close() }
  const view = await first.invoke('view') as DigitalEmployeeStudioView
  expect(view.runs).toMatchObject([{
    owner: { memberId }, profileRevision: 1, actualRuntimeTarget: target,
    terminal: 'completed', usage: { inputTokens: 15, outputTokens: 6 },
    completeness: { status: reportTerminal ? 'complete' : 'incomplete' },
  }])
  expect(view.runs).toHaveLength(1)
  expect(view.runs[0]!.usage?.totalTokens).toBe(reportTotal ? 21 : undefined)
  const runId = view.runs[0]!.runId
  const detail = await first.invoke('run', { runId }) as GetDigitalEmployeeRunResult
  expect(detail).toMatchObject({ ok: true, value: { run: { runId, usage: { inputTokens: 15, outputTokens: 6 } } } })
  expect(JSON.stringify(detail)).not.toContain('PRIVATE_')
  await first.ctx.fiber.dispose()
  const recovered = await workflow(backend, { root: first.root, resumeLead: true })
  await expect(recovered.invoke('run', { runId })).resolves.toMatchObject({
    ok: true, value: { run: {
      runId, owner: { memberId }, usage: { inputTokens: 15, outputTokens: 6 },
      completeness: { status: reportTerminal ? 'complete' : 'incomplete' },
    } },
  })
  expect((await recovered.invoke('view') as DigitalEmployeeStudioView).runs).toHaveLength(1)
})
