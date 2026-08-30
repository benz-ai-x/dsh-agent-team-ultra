import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import remote from '../lib/typert.remote-client.js'
import { TYPERT } from '../lib/typert.host.js'

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
    expect(declaration).toContain('spawn: (sessionId: string, request: SpawnDigitalEmployeeRequest, signal?: AbortSignal)')
  })
})
