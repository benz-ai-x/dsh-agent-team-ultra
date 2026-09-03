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
  it('publishes the immutable release workflow without a hard-delete operation', () => {
    expect(remote.package).toBe('@deepseek-ai/dsh-agent-team-ultra')
    expect(remote.descriptors.map(method => method.method)).toEqual([
      'activate', 'archive', 'cancelEvalRun', 'evalRun', 'restore', 'revision', 'rollback', 'run',
      'save', 'saveEvalSet', 'setEvalGate', 'spawn', 'startEvalRun', 'view',
    ])
    const spawn = remote.descriptors.find(method => method.method === 'spawn')
    expect(spawn).toMatchObject({
      cancellation: { parameter: 'signal' },
    })
    const codec = spawn?.parameters[1]?.codec.schema as unknown as {
      safeParse(value: unknown): { readonly success: boolean }
    }
    expect(codec.safeParse({ profileId: 'reviewer' }).success).toBe(false)
    expect(codec.safeParse({
      launchRequestId: '11111111-1111-4111-8111-111111111111',
      profileId: 'reviewer',
    }).success).toBe(true)
    const resultCodec = spawn?.result.schema as unknown as {
      safeParse(value: unknown): { readonly success: boolean }
    }
    const active = {
      ok: true,
      value: {
        teamId: 'lead',
        memberName: 'reviewer',
        launchRequestId: '11111111-1111-4111-8111-111111111111',
        profileId: 'reviewer',
        profileRevision: 1,
        runtimeTarget: { kind: 'dsh-model', provider: 'test-provider', model: 'test-model' },
        requiredCapabilities: { contextMode: 'fresh', profileCapabilities: ['persona', 'mission'] },
        provisioningPhase: 'active',
        runtimeAvailability: 'available',
        runtimePresence: 'idle',
      },
    }
    expect(resultCodec.safeParse(active).success).toBe(true)
    expect(resultCodec.safeParse({
      ...active,
      value: { ...active.value, provisioningPhase: undefined, phase: 'active' },
    }).success).toBe(false)
    expect(remote.descriptors.filter(method => method.method !== 'spawn' && method.method !== 'run')
      .every(method => method.cancellation === undefined)).toBe(true)
    expect(remote.descriptors.find(method => method.method === 'run')).toMatchObject({
      cancellation: { parameter: 'signal' },
    })
    expect(remote.descriptors.map(method => method.parameters[0])).toEqual(
      Array.from({ length: 14 }, () => expect.objectContaining({
        name: 'agent',
        wire: 'agentId',
        source: 'lookup',
        lookup: 'agent',
      })),
    )
    const host = TYPERT as { invocations: { id: string }[] }
    expect(host.invocations.map(invocation => invocation.id)).toEqual([
      '@deepseek-ai/dsh-agent-team-ultra#digitalEmployees/activate',
      '@deepseek-ai/dsh-agent-team-ultra#digitalEmployees/archive',
      '@deepseek-ai/dsh-agent-team-ultra#digitalEmployees/cancelEvalRun',
      '@deepseek-ai/dsh-agent-team-ultra#digitalEmployees/evalRun',
      '@deepseek-ai/dsh-agent-team-ultra#digitalEmployees/restore',
      '@deepseek-ai/dsh-agent-team-ultra#digitalEmployees/revision',
      '@deepseek-ai/dsh-agent-team-ultra#digitalEmployees/rollback',
      '@deepseek-ai/dsh-agent-team-ultra#digitalEmployees/run',
      '@deepseek-ai/dsh-agent-team-ultra#digitalEmployees/save',
      '@deepseek-ai/dsh-agent-team-ultra#digitalEmployees/saveEvalSet',
      '@deepseek-ai/dsh-agent-team-ultra#digitalEmployees/setEvalGate',
      '@deepseek-ai/dsh-agent-team-ultra#digitalEmployees/spawn',
      '@deepseek-ai/dsh-agent-team-ultra#digitalEmployees/startEvalRun',
      '@deepseek-ai/dsh-agent-team-ultra#digitalEmployees/view',
    ])
  })

  it('ships the Client namespace declaration used by the UI', () => {
    const declaration = readFileSync(resolve('packages/domain/lib/typert.remote-client.d.ts'), 'utf8')
    const types = readFileSync(resolve('packages/domain/lib/types/types.d.ts'), 'utf8')
    expect(declaration).toContain("interface TypertRemoteNamespaceMap")
    expect(declaration).toContain("'digitalEmployees':")
    expect(declaration).toContain('spawn: (agentId: SessionId, request: SpawnDigitalEmployeeRequest, signal?: AbortSignal)')
    expect(declaration).toContain('run: (agentId: SessionId, request: GetDigitalEmployeeRunRequest, signal?: AbortSignal)')
    expect(declaration).toContain('saveEvalSet: (agentId: SessionId, request: SaveDigitalEmployeeEvalSetRequest)')
    expect(declaration).toContain('startEvalRun: (agentId: SessionId, request: StartDigitalEmployeeEvalRunRequest)')
    expect(declaration).toContain('cancelEvalRun: (agentId: SessionId, request: CancelDigitalEmployeeEvalRunRequest)')
    expect(declaration).toContain('evalRun: (agentId: SessionId, request: GetDigitalEmployeeEvalRunRequest)')
    expect(declaration).toContain("'agent:digitalEmployees/view': () => Promise<RemoteResult<DigitalEmployeeStudioView>>")
    expect(types).toContain("export type LaunchRequestId = Branded<'LaunchRequestId'>")
    expect(types).toMatch(/readonly launchRequestId: LaunchRequestId/u)
    expect(types).toContain("export type DigitalEmployeeEvalRunId = Branded<'DigitalEmployeeEvalRunId'>")
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
