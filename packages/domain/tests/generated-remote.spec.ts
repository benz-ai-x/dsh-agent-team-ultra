import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import TypertGatewayService, { TypertGatewayError } from '@deepseek-ai/dsh-api-gateway'
import { bindTypertRemote } from '@deepseek-ai/dsh-typert-protocol'
import TypertRegistry, { type TypertContribution } from '@deepseek-ai/dsh-typert-registry'
import { describe, expect, it } from 'vitest'
import remote from '../lib/typert.remote-client.js'
import { TYPERT } from '../lib/typert.host.js'

class DigitalEmployeesGatewayFixture extends Service {
  readonly typertRemote = bindTypertRemote(this, 'digitalEmployees')
  calls = 0

  constructor(ctx: Context) {
    super(ctx, 'digitalEmployees')
  }

  remoteView(): never {
    this.calls += 1
    throw new Error('unknown identities must fail before business dispatch')
  }
}

describe('generated Digital Employee Remote contract', () => {
  it('publishes four strict operations and cancellation only on spawn', () => {
    expect(remote.package).toBe('@deepseek-ai/dsh-agent-team-ultra')
    expect(remote.descriptors.map(method => method.method)).toEqual([
      'deleteProfile', 'save', 'spawn', 'view',
    ])
    expect(remote.descriptors.find(method => method.method === 'spawn')).toMatchObject({
      cancellation: { parameter: 'signal' },
    })
    expect(remote.descriptors.filter(method => method.method !== 'spawn')
      .every(method => method.cancellation === undefined)).toBe(true)
    expect(remote.descriptors.map(method => method.parameters[0])).toEqual(
      Array.from({ length: 4 }, () => expect.objectContaining({
        name: 'agent',
        wire: 'agentId',
        source: 'lookup',
        lookup: 'agent',
      })),
    )
    const host = TYPERT as { invocations: { id: string }[] }
    expect(host.invocations.map(invocation => invocation.id)).toEqual([
      '@deepseek-ai/dsh-agent-team-ultra#digitalEmployees/deleteProfile',
      '@deepseek-ai/dsh-agent-team-ultra#digitalEmployees/save',
      '@deepseek-ai/dsh-agent-team-ultra#digitalEmployees/spawn',
      '@deepseek-ai/dsh-agent-team-ultra#digitalEmployees/view',
    ])
  })

  it('ships the Client namespace declaration used by the UI', () => {
    const declaration = readFileSync(resolve('packages/domain/lib/typert.remote-client.d.ts'), 'utf8')
    expect(declaration).toContain("interface TypertRemoteNamespaceMap")
    expect(declaration).toContain("'digitalEmployees':")
    expect(declaration).toContain('spawn: (agentId: SessionId, request: SpawnDigitalEmployeeRequest, signal?: AbortSignal)')
    expect(declaration).toContain("'agent:digitalEmployees/view': () => Promise<RemoteResult<DigitalEmployeeStudioView>>")
  })

  it('rejects an unknown Session through the real Gateway before business dispatch', async () => {
    const ctx = new Context()
    await ctx.plugin(TypertRegistry)
    await ctx.plugin(TypertGatewayService)
    const serviceFiber = ctx.plugin(DigitalEmployeesGatewayFixture)
    await serviceFiber
    ctx.typert.register(TYPERT as TypertContribution)
    ctx.typert.lookups.register('agent', {
      parameter: 'agent',
      wire: 'agentId',
      hostTypeSymbol: '@deepseek-ai/dsh-agent#Agent',
      wireTypeSymbol: '@deepseek-ai/dsh-session/types#SessionId',
      resolve: () => undefined,
    })

    try {
      const failure = await ctx.typertGateway.invoke({
        namespace: 'digitalEmployees',
        method: 'view',
        args: { agentId: 'unknown-session' },
      }).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(TypertGatewayError)
      expect(failure).toMatchObject({
        code: 'gateway/lookup-not-found',
        details: { endpoint: 'digitalEmployees/view', field: 'agentId' },
      })
      expect(ctx.digitalEmployees.calls).toBe(0)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
