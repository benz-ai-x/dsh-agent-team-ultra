import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import TypertGateway from '@deepseek-ai/dsh-api-gateway'
import TeamService from '@deepseek-ai/dsh-experimental-agent-team'
import { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionQueryEngine from '@deepseek-ai/dsh-session-query'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as JsonStorage from '@deepseek-ai/dsh-storage-json'
import Subagents from '@deepseek-ai/dsh-subagent'
import * as SubagentSpawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import * as SubagentFork from '@deepseek-ai/dsh-subagent-fork-in-process'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import TypertRegistry, { type TypertContribution } from '@deepseek-ai/dsh-typert-registry'
import Approval from '@deepseek-ai/dsh-user-approval'
import { afterEach } from 'vitest'
const implementation = process.env.ULTRA_PACKED_DOMAIN ?? join(process.cwd(), 'packages/domain')
const hostEntry = pathToFileURL(join(implementation, 'lib/index.js')).href
const typertEntry = pathToFileURL(join(implementation, 'lib/typert.host.js')).href
export const { default: DigitalEmployeeService } = await import(/* @vite-ignore */ hostEntry) as typeof import('../../src/index.ts')
const { TYPERT } = await import(/* @vite-ignore */ typertEntry)
import type { DigitalEmployeeProfileDraft } from '../../src/types.ts'
import { initializeBaselineData } from '../../src/baseline-data.ts'

export { ToolCallId } from '@deepseek-ai/dsh-llm'

export const target = { provider: 'workflow', model: 'reviewer' } as const
export const profile: DigitalEmployeeProfileDraft = {
  id: 'reviewer',
  employeeName: 'reviewer',
  displayName: 'Reviewer',
  description: 'Review an immutable candidate.',
  continuationProvider: 'spawn',
  contextMode: 'fresh',
  persona: 'Review carefully.',
  mission: 'Report a finding.',
  toolPolicy: { mode: 'inherit', names: [] },
  context: [],
  memory: [],
  hooks: [],
}

export class WorkflowAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  beforeStream: ((options: GenerateOptions) => Promise<void>) | undefined

  override providerInfo(provider: string) { return { id: provider, name: 'Workflow' } }

  override async listModels(provider: string) {
    return [{ provider, id: 'reviewer', name: 'Reviewer' }]
  }

  override async resolveModel(provider: string, model: string) {
    return { provider, id: model, name: 'Reviewer' }
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    if (this.beforeStream !== undefined) {
      const gate = this.beforeStream(options)
      const signal = options.signal
      signal?.throwIfAborted()
      let stop = () => undefined
      try {
        await Promise.race([gate, new Promise<never>((_resolve, reject) => {
          const abort = () => reject(signal?.reason ?? new Error('aborted'))
          signal?.addEventListener('abort', abort, { once: true })
          stop = () => signal?.removeEventListener('abort', abort)
        })])
      } finally { stop() }
    }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'finding PRIVATE_OUTPUT' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'finding PRIVATE_OUTPUT' } }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

class UnusedSessionSearch extends SessionQueryEngine {
  override searchSessions(): Promise<never> { return Promise.reject(new Error('unused session search')) }
  override searchEvents(): Promise<never> { return Promise.reject(new Error('unused event search')) }
}

export const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

export async function workflow(
  backend: 'json' = 'json',
  options: { root?: string; resumeLead?: boolean; disposalTimeoutMs?: number } = {},
) {
  const root = options.root ?? await mkdtemp(join(tmpdir(), 'ultra-host-workflow-'))
  const paths = initializeBaselineData(root)
  const ctx = new Context()
  cleanups.push(async () => {
    try { await ctx.fiber.dispose() }
    finally { if (options.root === undefined) await rm(root, { recursive: true, force: true }) }
  })
  await mountAgentLoopTestDependencies(ctx, { systemPrompt: { personaPrefix: 'OFFICIAL_PREFIX', personaSuffix: 'OFFICIAL_WORKSPACE_SUFFIX' } })
  await ctx.plugin(JsonlSessionPersistence, { root: paths.sessions, compression: 'none' })
  await ctx.plugin(UnusedSessionSearch)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(Approval)
  await ctx.plugin(SandboxPolicy)
  await ctx.plugin(Subagents)
  await ctx.plugin(SubagentSpawn, { providerName: 'spawn' })
  await ctx.plugin(SubagentFork, { providerName: 'fork' })
  await ctx.plugin(TeamService, { disposalTimeoutMs: options.disposalTimeoutMs })
  await ctx.plugin(Storage)
  await ctx.plugin(JsonStorage, { root: paths.storage })
  await ctx.plugin(StorageDomain, { backend })
  ctx.tools.register(defineContentToolFixture({
    name: 'read', description: 'Read immutable evidence', parameters: {},
    async execute() { return [] },
  }))
  const adapter = new WorkflowAdapter()
  ctx.llm.registerAdapter(['workflow'], adapter)
  if (options.resumeLead) ctx.llm.registerAdapter(['changed-lead'], new WorkflowAdapter())
  const lead = options.resumeLead
    ? await ctx.agents.resume({
      resumeSessionId: SessionId('workflow-lead'),
      agentOptions: { provider: 'changed-lead', model: target.model },
    })
    : await ctx.agents.create({
      sessionId: SessionId('workflow-lead'), agentOptions: { provider: target.provider, model: target.model },
    })
  const observer = await ctx.agents.create({
    sessionId: SessionId(options.resumeLead ? 'observer-after-restart' : 'observer-lead'),
  })
  const fiber = ctx.plugin(DigitalEmployeeService)
  await fiber
  await ctx.plugin(TypertRegistry)
  await ctx.plugin(TypertGateway)
  ctx.typert.register(TYPERT as TypertContribution)
  const invoke = (method: string, request?: unknown, agentId = lead.agent.id, signal?: AbortSignal) => ctx.typertGateway.invoke({
    namespace: 'digitalEmployees',
    method,
    args: { agentId, ...(request === undefined ? {} : { request }) },
    ...(signal === undefined ? {} : { signal }),
  })
  return { ctx, lead, observer, adapter, fiber, invoke, root }
}
