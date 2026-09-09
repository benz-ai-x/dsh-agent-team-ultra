import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import remote from '../lib/typert.remote-client.js'
import { TYPERT } from '../lib/typert.host.js'

describe('generated B0 wire contract', () => {
  it('contains only the eight supported operations with exact Agent lookup and launch cancellation', () => {
    const methods = ['activate', 'archive', 'restore', 'revision', 'rollback', 'save', 'spawn', 'view']
    expect(remote.descriptors.map(row => row.method)).toEqual(methods)
    expect(remote.descriptors.every(row => row.parameters[0]?.source === 'lookup' && row.parameters[0]?.lookup === 'agent')).toBe(true)
    expect(remote.descriptors.find(row => row.method === 'spawn')).toMatchObject({ cancellation: { parameter: 'signal' } })
    expect((TYPERT as { invocations: { id: string }[] }).invocations.map(row => row.id.split('/').at(-1))).toEqual(methods)
    const declaration = readFileSync('packages/domain/lib/typert.remote-client.d.ts', 'utf8')
    expect(declaration).toContain('TypertRemoteNamespaceMap')
    expect(declaration).not.toMatch(/Eval|RunEvidence|watch:|RuntimeProvider/)
  })

  it('requires caller-owned launch intent identity, without interpreting old fields as valid B0 input', () => {
    const codec = remote.descriptors.find(row => row.method === 'spawn')!.parameters[1]!.codec.schema as any
    expect(codec.safeParse({ profileId: 'reviewer' }).success).toBe(false)
    const input = { profileId: 'reviewer', launchRequestId: '11111111-1111-4111-8111-111111111111', runtimeTarget: { kind: 'external-agent', provider: 'retired' } }
    // Host receives unknown fields intact and rejects them; the transport must not silently drop their meaning.
    expect(codec.parse(input)).toEqual(input)
  })
})
