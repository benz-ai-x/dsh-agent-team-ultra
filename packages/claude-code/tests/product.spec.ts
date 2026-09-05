import { describe, expect, it, vi } from 'vitest'
import {
  EXPECTED_AGENT_SDK_VERSION,
  EXPECTED_CLAUDE_CODE_VERSION,
  detectLinuxLibc,
  qualifyClaudeCodeProduct,
  resolveNativeExecutable,
} from '../src/product.ts'

function probe(overrides: Partial<Parameters<typeof qualifyClaudeCodeProduct>[0]> = {}) {
  return {
    sdkVersion: EXPECTED_AGENT_SDK_VERSION,
    nativeVersion: EXPECTED_CLAUDE_CODE_VERSION,
    platform: 'linux',
    arch: 'arm64',
    libc: 'glibc' as const,
    resolveManifest: vi.fn(() => '/sdk/native/package.json'),
    readManifestVersion: vi.fn(() => EXPECTED_AGENT_SDK_VERSION),
    isFile: vi.fn(() => true),
    assertExecutable: vi.fn(),
    ...overrides,
  }
}

describe('Claude Code product qualification', () => {
  it('accepts only the exact SDK and its package-local native payload', () => {
    const input = probe()
    expect(qualifyClaudeCodeProduct(input)).toEqual({
      eligible: true,
      product: 'claude-code',
      sdkVersion: '0.3.241',
      nativeVersion: '2.1.241',
      protocol: 'agent-sdk-session-resume',
    })
    expect(input.resolveManifest).toHaveBeenCalledWith(
      '@anthropic-ai/claude-agent-sdk-linux-arm64',
    )
    expect(input.assertExecutable).toHaveBeenCalledWith('/sdk/native/claude')
  })

  it.each([
    [{ sdkVersion: '0.3.240' }, 'unsupported-adapter-version'],
    [{ nativeVersion: '2.1.240' }, 'unsupported-native-version'],
    [{ platform: 'freebsd' }, 'unsupported-platform'],
    [{ readManifestVersion: () => '0.3.240' }, 'native-product-missing'],
    [{ isFile: () => false }, 'native-product-missing'],
    [{ resolveManifest: () => { throw new Error('/secret/native/path') } }, 'native-product-missing'],
  ] as const)('fails closed with bounded facts for %j', (overrides, reason) => {
    const result = qualifyClaudeCodeProduct(probe(overrides))
    expect(result).toEqual({ eligible: false, product: 'claude-code', reason })
    expect(JSON.stringify(result)).not.toContain('/secret/')
  })

  it('selects musl and Windows payloads without POSIX executable checks', () => {
    const musl = probe({ libc: 'musl' })
    expect(qualifyClaudeCodeProduct(musl)).toMatchObject({ eligible: true })
    expect(musl.resolveManifest).toHaveBeenCalledWith(
      '@anthropic-ai/claude-agent-sdk-linux-arm64-musl',
    )

    const windows = probe({ platform: 'win32', arch: 'x64', libc: undefined })
    expect(qualifyClaudeCodeProduct(windows)).toMatchObject({ eligible: true })
    expect(windows.assertExecutable).not.toHaveBeenCalled()
  })

  it('resolves every executable shape without PATH and classifies libc facts', () => {
    const resolveManifest = vi.fn((packageName: string) => `/sdk/${packageName}/package.json`)
    expect(resolveNativeExecutable('linux', 'arm64', 'glibc', resolveManifest)).toBe(
      '/sdk/@anthropic-ai/claude-agent-sdk-linux-arm64/claude',
    )
    expect(resolveNativeExecutable('win32', 'x64', undefined, resolveManifest)).toBe(
      '/sdk/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe',
    )
    expect(resolveNativeExecutable('freebsd', 'x64', undefined, resolveManifest)).toBe('')
    expect(resolveNativeExecutable('linux', 'arm64', 'glibc', () => {
      throw new Error('/missing/native/package')
    })).toBe('')
    expect(detectLinuxLibc('linux', '2.39')).toBe('glibc')
    expect(detectLinuxLibc('linux', undefined)).toBe('musl')
    expect(detectLinuxLibc('darwin', '2.39')).toBeUndefined()
  })
})
