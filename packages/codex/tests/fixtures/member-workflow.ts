import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import Subprocess, { type SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { TeammateLaunchRequestId } from '@deepseek-ai/dsh-experimental-agent-team'
import { expect } from 'vitest'
import { workflow } from '../../../domain/tests/fixtures/host-workflow.ts'
import * as codex from '../../lib/index.js'
import { NativeProduct } from './native-product.mjs'

export async function queryWorkflow(configure?: (native: NativeProduct) => void, backend: 'json' | 'sqlite' = 'json',
  options: { root?: string; resumeLead?: boolean; disposalTimeoutMs?: number } = {}) {
  const host = await workflow(backend, options)
  const require = createRequire(import.meta.url)
  const manifestPath = require.resolve('@openai/codex/package.json')
  const native = new NativeProduct(join(host.root, 'native.json'), resolve(dirname(manifestPath), 'bin/codex.js'))
  configure?.(native)
  class NativeTransport extends Subprocess {
    override resolveExecutable(): never { throw new Error('the adapter must not search PATH') }
    override spawnTerminal(): never { throw new Error('the adapter must use the app-server transport') }
    override spawn(spec: SubprocessSpawnSpec) { return native.open(spec) }
  }
  await host.ctx.plugin(NativeTransport)
  const runtime = host.ctx.plugin(codex, { catalogOwnerService: 'digitalEmployees', cwd: host.root, sandbox: 'read-only' })
  await runtime
  if (options.resumeLead) {
    const member = host.ctx.agentTeams.listMembers(host.lead.agent).find(value => value.name === 'codex-reviewer')!
    const handle = member.externalRuntime!.nativeHandle!
    await expect.poll(() => native.channels.has(handle)).toBe(true)
    return { ...host, native, runtime, member, handle }
  }
  const launched = await host.ctx.agentTeams.spawnTeammate(host.lead.agent, {
    name: 'codex-reviewer', description: 'Query the shared Team.', context: 'fresh',
    prompt: [{ type: 'text', text: 'Read the shared task board.' }], signal: new AbortController().signal,
    runtime: {
      kind: 'external-agent', provider: 'codex', launchRequestId: TeammateLaunchRequestId('codex-query-boundary'),
      profile: { persona: 'Be precise.', mission: 'Review source.', context: [], memory: [], toolPolicy: { mode: 'inherit', names: [] }, hooks: [] },
      requirements: { contextMode: 'fresh', profileCapabilities: ['persona', 'mission'], runtimeCapabilities: ['sandbox'] },
    },
  })
  return { ...host, native, runtime, member: launched.member, handle: launched.member.externalRuntime!.nativeHandle! }
}

export function operationResult(response: { success: boolean; contentItems: Array<{ type: string; text: string }> }) {
  expect(response.contentItems).toHaveLength(1)
  expect(response.contentItems[0].type).toBe('inputText')
  return { success: response.success, result: JSON.parse(response.contentItems[0].text) }
}
