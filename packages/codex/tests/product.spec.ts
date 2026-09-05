import { describe, expect, it, vi } from 'vitest'
import {
  codexProductEligibility,
  EXPECTED_CODEX_VERSION,
  qualifyCodexProduct,
} from '../src/product.ts'

function probe(overrides: Partial<Parameters<typeof qualifyCodexProduct>[0]> = {}) {
  return {
    wrapperVersion: EXPECTED_CODEX_VERSION,
    platform: 'linux',
    arch: 'x64',
    resolveManifest: (packageName: string) => `/products/${packageName}/package.json`,
    readManifestVersion: () => `${EXPECTED_CODEX_VERSION}-linux-x64`,
    isFile: () => true,
    assertExecutable: () => {},
    ...overrides,
  }
}

describe('Codex local-product qualification', () => {
  it('qualifies the installed package through the real bounded probe', () => {
    expect(codexProductEligibility()).toEqual({
      eligible: true,
      product: 'codex',
      version: EXPECTED_CODEX_VERSION,
      protocol: 'app-server-v2',
    })
  })

  it('rejects a wrapper mismatch before resolving a platform package', () => {
    const resolveManifest = vi.fn(() => '/unused')
    expect(qualifyCodexProduct(probe({ wrapperVersion: '0.0.0', resolveManifest }))).toEqual({
      eligible: false,
      product: 'codex',
      reason: 'unsupported-adapter-version',
    })
    expect(resolveManifest).not.toHaveBeenCalled()
  })

  it('rejects unsupported platforms before touching the filesystem', () => {
    const resolveManifest = vi.fn(() => '/unused')
    expect(qualifyCodexProduct(probe({ platform: 'aix', arch: 'ppc64', resolveManifest }))).toEqual({
      eligible: false,
      product: 'codex',
      reason: 'unsupported-platform',
    })
    expect(resolveManifest).not.toHaveBeenCalled()
  })

  it.each([
    ['linux', 'x64', '@openai/codex-linux-x64', 'x86_64-unknown-linux-musl', 'codex'],
    ['linux', 'arm64', '@openai/codex-linux-arm64', 'aarch64-unknown-linux-musl', 'codex'],
    ['darwin', 'x64', '@openai/codex-darwin-x64', 'x86_64-apple-darwin', 'codex'],
    ['darwin', 'arm64', '@openai/codex-darwin-arm64', 'aarch64-apple-darwin', 'codex'],
    ['win32', 'x64', '@openai/codex-win32-x64', 'x86_64-pc-windows-msvc', 'codex.exe'],
    ['win32', 'arm64', '@openai/codex-win32-arm64', 'aarch64-pc-windows-msvc', 'codex.exe'],
  ])('accepts the pinned %s-%s native payload', (platform, arch, packageName, triple, binary) => {
    const resolveManifest = vi.fn(() => `/products/${packageName}/package.json`)
    const assertExecutable = vi.fn()
    expect(qualifyCodexProduct(probe({
      platform,
      arch,
      resolveManifest,
      readManifestVersion: () => `${EXPECTED_CODEX_VERSION}-${packageName.slice('@openai/codex-'.length)}`,
      assertExecutable,
    }))).toMatchObject({ eligible: true })
    expect(resolveManifest).toHaveBeenCalledWith(packageName)
    const expectedBinary = `/products/${packageName}/vendor/${triple}/bin/${binary}`
    if (platform === 'win32') expect(assertExecutable).not.toHaveBeenCalled()
    else expect(assertExecutable).toHaveBeenCalledWith(expectedBinary)
  })

  it('rejects wrong-version, non-file, and throwing native probes with the same safe reason', () => {
    const unavailable = { eligible: false, product: 'codex', reason: 'native-product-missing' }
    expect(qualifyCodexProduct(probe({ readManifestVersion: () => 'wrong' }))).toEqual(unavailable)
    expect(qualifyCodexProduct(probe({ isFile: () => false }))).toEqual(unavailable)
    expect(qualifyCodexProduct(probe({
      assertExecutable: () => { throw new Error('/secret/native/path') },
    }))).toEqual(unavailable)
  })
})
