import type { TeamMemberView } from '@deepseek-ai/dsh-experimental-agent-team'
import { describe, expect, it } from 'vitest'
import { reconcileBindingFromRoster } from '../src/launch.ts'
import { nativeRuntimeHandleSchema } from '../src/spec.ts'
import type { DigitalEmployeeBindingV1 } from '../src/storage.ts'

const baseBinding = {
  schemaVersion: 1,
  teamId: 'lead',
  memberName: 'reviewer',
  memberId: 'original-member',
  profileId: 'reviewer',
  profileRevision: 1,
  profile: { hooks: [] },
  requiredCapabilities: {
    contextMode: 'fresh',
    profileCapabilities: ['persona', 'mission'],
  },
  provisioningPhase: 'active',
} as unknown as DigitalEmployeeBindingV1

describe('Binding roster reconciliation', () => {
  it('preserves a bounded opaque provider-native handle without imposing identifier grammar', () => {
    const nativeHandle = 'native/session/运行'
    expect(nativeRuntimeHandleSchema.parse(nativeHandle)).toBe(nativeHandle)
    expect(() => nativeRuntimeHandleSchema.parse('运'.repeat(67))).toThrow()

    const binding = {
      ...baseBinding,
      launchRequestId: '11111111-1111-4111-8111-111111111111',
      runtimeTarget: { kind: 'external-agent', provider: 'native-reviewer' },
      provisioningPhase: 'pending',
    } as unknown as DigitalEmployeeBindingV1
    const member = {
      id: 'original-member',
      name: 'reviewer',
      role: 'teammate',
      status: 'idle',
      provider: 'native-reviewer',
      externalRuntime: {
        kind: 'external-agent',
        launchRequestId: '11111111-1111-4111-8111-111111111111',
        requestFingerprint: 'provider-owned',
        requirements: {
          contextMode: 'fresh',
          profileCapabilities: ['persona', 'mission'],
          runtimeCapabilities: [],
        },
        nativeHandle,
      },
      diagnostics: [],
    } as unknown as TeamMemberView

    expect(reconcileBindingFromRoster(binding, [member])).toMatchObject({
      nativeRuntimeHandle: nativeHandle,
      provisioningPhase: 'active',
    })
  })

  it('fails closed without rebinding an existing Binding to a same-name replacement member', () => {
    const binding = {
      ...baseBinding,
      runtimeTarget: { kind: 'dsh-model', provider: 'deepseek', model: 'deepseek-chat' },
    } as DigitalEmployeeBindingV1
    const replacement = {
      id: 'replacement-member',
      name: 'reviewer',
      role: 'teammate',
      status: 'idle',
      requestedRoute: { provider: 'deepseek', model: 'deepseek-chat' },
      resolvedRoute: { provider: 'deepseek', model: 'deepseek-chat' },
      diagnostics: [],
    } as unknown as TeamMemberView

    expect(reconcileBindingFromRoster(binding, [replacement])).toMatchObject({
      memberId: 'original-member',
      provisioningPhase: 'failed',
      error: expect.stringContaining('does not match'),
    })
  })

  it('validates external launch identity while the authoritative row is still provisioning', () => {
    const binding = {
      ...baseBinding,
      memberId: undefined,
      launchRequestId: '11111111-1111-4111-8111-111111111111',
      runtimeTarget: { kind: 'external-agent', provider: 'native-reviewer' },
      provisioningPhase: 'pending',
    } as unknown as DigitalEmployeeBindingV1
    const mismatched = {
      id: 'native-member',
      name: 'reviewer',
      role: 'teammate',
      status: 'provisioning',
      provider: 'different-provider',
      externalRuntime: {
        kind: 'external-agent',
        launchRequestId: '11111111-1111-4111-8111-111111111111',
        requestFingerprint: 'provider-owned',
        requirements: {
          contextMode: 'fresh',
          profileCapabilities: ['persona', 'mission'],
          runtimeCapabilities: [],
        },
      },
      diagnostics: [],
    } as unknown as TeamMemberView

    expect(reconcileBindingFromRoster(binding, [mismatched])).toMatchObject({
      memberId: 'native-member',
      provisioningPhase: 'failed',
      error: expect.stringContaining('does not match'),
    })
  })

  it('fails instead of downgrading resolved external identity back to pending', () => {
    const binding = {
      ...baseBinding,
      launchRequestId: '11111111-1111-4111-8111-111111111111',
      runtimeTarget: { kind: 'external-agent', provider: 'native-reviewer' },
      resolvedRuntimeTarget: { kind: 'external-agent', provider: 'native-reviewer' },
      nativeRuntimeHandle: 'native-handle',
    } as unknown as DigitalEmployeeBindingV1
    const regressed = {
      id: 'original-member',
      name: 'reviewer',
      role: 'teammate',
      status: 'provisioning',
      provider: 'native-reviewer',
      externalRuntime: {
        kind: 'external-agent',
        launchRequestId: '11111111-1111-4111-8111-111111111111',
        requestFingerprint: 'provider-owned',
        requirements: {
          contextMode: 'fresh',
          profileCapabilities: ['persona', 'mission'],
          runtimeCapabilities: [],
        },
      },
      diagnostics: [],
    } as unknown as TeamMemberView

    expect(reconcileBindingFromRoster(binding, [regressed])).toMatchObject({
      memberId: 'original-member',
      nativeRuntimeHandle: 'native-handle',
      provisioningPhase: 'failed',
      error: expect.stringContaining('regressed'),
    })
  })
})
