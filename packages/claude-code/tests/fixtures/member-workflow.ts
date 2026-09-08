import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import Subprocess, { type SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import {
  TeammateLaunchRequestId,
  type TeammateRuntimeCapability,
} from '@deepseek-ai/dsh-experimental-agent-team'
import { expect, vi } from 'vitest'
import { workflow } from '../../../domain/tests/fixtures/host-workflow.ts'
import { NativeProduct as CodexProduct } from '../../../codex/tests/fixtures/native-product.mjs'
import { claudeCodePackageBin } from '../../src/product.ts'
import * as claude from '../../lib/index.js'
import { NativeProduct } from './native-product.mjs'

const sdk = vi.hoisted(() => ({ native: undefined as NativeProduct | undefined }))
vi.mock('@anthropic-ai/claude-agent-sdk', async (original) => ({
  ...await original<typeof import('@anthropic-ai/claude-agent-sdk')>(),
  query: (...args: Parameters<NativeProduct['query']>) => sdk.native!.query(...args),
  getSessionInfo: (...args: Parameters<NativeProduct['getSessionInfo']>) => sdk.native!.getSessionInfo(...args),
  getSessionMessages: (...args: Parameters<NativeProduct['getSessionMessages']>) => sdk.native!.getSessionMessages(...args),
}))

export async function claudeWorkflow(backend: 'json' | 'sqlite' = 'json', options: {
  root?: string
  resumeLead?: boolean
  runtimeCapabilities?: readonly TeammateRuntimeCapability[]
} = {},
  configure?: (native: NativeProduct, host: Awaited<ReturnType<typeof workflow>>) => void) {
  const host = await workflow(backend, options)
  const native = new NativeProduct(join(host.root, 'claude-native.json'), claudeCodePackageBin, { teamTools: true })
  const codexRequire = createRequire(resolve(process.cwd(), 'packages/codex/package.json'))
  const codexBin = resolve(dirname(codexRequire.resolve('@openai/codex/package.json')), 'bin/codex.js')
  const codexNative = new CodexProduct(join(host.root, 'codex-native.json'), codexBin)
  sdk.native = native
  configure?.(native, host)
  class NativeTransport extends Subprocess {
    override resolveExecutable(): never { throw new Error('the adapter must not search PATH') }
    override spawnTerminal(): never { throw new Error('the adapter must use the SDK process bridge') }
    override spawn(spec: SubprocessSpawnSpec) {
      return spec.argv[1] === codexBin ? codexNative.open(spec) : native.open(spec)
    }
  }
  await host.ctx.plugin(NativeTransport)
  const runtime = host.ctx.plugin(claude, { catalogOwnerService: 'digitalEmployees', cwd: host.root })
  await runtime
  if (options.resumeLead) {
    await expect.poll(() => host.ctx.agentTeams.listMembers(host.lead.agent)
      .find(member => member.name === 'claude-reviewer')?.status).toBe('idle')
    const member = host.ctx.agentTeams.listMembers(host.lead.agent).find(member => member.name === 'claude-reviewer')!
    return { ...host, native, codexNative, runtime, member, handle: member.externalRuntime!.nativeHandle!, client: undefined }
  }
  const launched = await host.ctx.agentTeams.spawnTeammate(host.lead.agent, {
    name: 'claude-reviewer', description: 'Query the shared Team.', context: 'fresh',
    prompt: [{ type: 'text', text: 'Read the shared task board.' }], signal: new AbortController().signal,
    runtime: {
      kind: 'external-agent', provider: 'claude-code', launchRequestId: TeammateLaunchRequestId('claude-query-boundary'),
      profile: { persona: 'Be precise.', mission: 'Review source.', context: [], memory: [], toolPolicy: { mode: 'inherit', names: [] }, hooks: [] },
      requirements: {
        contextMode: 'fresh',
        profileCapabilities: ['persona', 'mission'],
        runtimeCapabilities: options.runtimeCapabilities ?? ['sandbox'],
      },
    },
  })
  const handle = launched.member.externalRuntime!.nativeHandle!
  const channel = native.channels.get(handle)!
  await channel.ready
  return { ...host, native, codexNative, runtime, member: launched.member, handle, client: channel.client }
}

export function mountClaudeRuntime(ctx: Awaited<ReturnType<typeof workflow>>['ctx'], config: {
  catalogOwnerService: string
  cwd: string
}) {
  return ctx.plugin(claude, config)
}

export function operationResult(response: { isError?: boolean; content: unknown[] }) {
  expect(response.content).toHaveLength(1)
  const content = response.content[0] as { type: string; text?: string }
  expect(content.type).toBe('text')
  return { success: response.isError !== true, result: JSON.parse(content.text!) }
}
