/** Exact local Codex product qualification for the durable runtime adapter. */

import { accessSync, constants, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

/** Exact wrapper and native payload version qualified by this adapter. */
export const EXPECTED_CODEX_VERSION = '0.149.1'

interface CodexPackageManifest {
  readonly version: string
  readonly bin: { readonly codex: string }
}

const codexPackageJsonPath = createRequire(import.meta.url).resolve('@openai/codex/package.json')
const codexPackageManifest = JSON.parse(
  readFileSync(codexPackageJsonPath, 'utf8'),
) as CodexPackageManifest

/** Package-local wrapper entry used by the subprocess owner. */
export const codexPackageBin = resolve(dirname(codexPackageJsonPath), codexPackageManifest.bin.codex)

/** Detached local-product qualification result safe for operator diagnostics. */
export type CodexProductEligibility =
  | {
    readonly eligible: true
    readonly product: 'codex'
    readonly version: typeof EXPECTED_CODEX_VERSION
    readonly protocol: 'app-server-v2'
  }
  | {
    readonly eligible: false
    readonly product: 'codex'
    readonly reason: 'unsupported-adapter-version' | 'unsupported-platform' | 'native-product-missing'
  }

interface NativeTarget {
  readonly packageName: string
  readonly packageVersion: string
  readonly triple: string
}

interface ProductProbe {
  readonly wrapperVersion: string
  readonly platform: string
  readonly arch: string
  resolveManifest(packageName: string): string
  readManifestVersion(path: string): unknown
  isFile(path: string): boolean
  assertExecutable(path: string): void
}

const targets: Readonly<Record<string, NativeTarget>> = {
  'linux-x64': {
    packageName: '@openai/codex-linux-x64',
    packageVersion: `${EXPECTED_CODEX_VERSION}-linux-x64`,
    triple: 'x86_64-unknown-linux-musl',
  },
  'linux-arm64': {
    packageName: '@openai/codex-linux-arm64',
    packageVersion: `${EXPECTED_CODEX_VERSION}-linux-arm64`,
    triple: 'aarch64-unknown-linux-musl',
  },
  'darwin-x64': {
    packageName: '@openai/codex-darwin-x64',
    packageVersion: `${EXPECTED_CODEX_VERSION}-darwin-x64`,
    triple: 'x86_64-apple-darwin',
  },
  'darwin-arm64': {
    packageName: '@openai/codex-darwin-arm64',
    packageVersion: `${EXPECTED_CODEX_VERSION}-darwin-arm64`,
    triple: 'aarch64-apple-darwin',
  },
  'win32-x64': {
    packageName: '@openai/codex-win32-x64',
    packageVersion: `${EXPECTED_CODEX_VERSION}-win32-x64`,
    triple: 'x86_64-pc-windows-msvc',
  },
  'win32-arm64': {
    packageName: '@openai/codex-win32-arm64',
    packageVersion: `${EXPECTED_CODEX_VERSION}-win32-arm64`,
    triple: 'aarch64-pc-windows-msvc',
  },
}

/**
 * Qualify one detached wrapper, platform, and native-payload probe.
 * @param probe - bounded product facts and filesystem operations supplied by the caller.
 * @returns exact eligibility without native installation paths.
 */
export function qualifyCodexProduct(probe: ProductProbe): CodexProductEligibility {
  if (probe.wrapperVersion !== EXPECTED_CODEX_VERSION) {
    return { eligible: false, product: 'codex', reason: 'unsupported-adapter-version' }
  }
  const target = targets[`${probe.platform}-${probe.arch}`]
  if (target === undefined) {
    return { eligible: false, product: 'codex', reason: 'unsupported-platform' }
  }
  try {
    const manifestPath = probe.resolveManifest(target.packageName)
    const executable = join(
      dirname(manifestPath),
      'vendor',
      target.triple,
      'bin',
      probe.platform === 'win32' ? 'codex.exe' : 'codex',
    )
    if (probe.readManifestVersion(manifestPath) !== target.packageVersion || !probe.isFile(executable)) {
      return { eligible: false, product: 'codex', reason: 'native-product-missing' }
    }
    if (probe.platform !== 'win32') probe.assertExecutable(executable)
  } catch {
    return { eligible: false, product: 'codex', reason: 'native-product-missing' }
  }
  return {
    eligible: true,
    product: 'codex',
    version: EXPECTED_CODEX_VERSION,
    protocol: 'app-server-v2',
  }
}

/**
 * Verify the pinned wrapper and current-platform native binary.
 * @returns exact eligibility without exposing an installation path.
 */
export function codexProductEligibility(): CodexProductEligibility {
  const productRequire = createRequire(codexPackageBin)
  return qualifyCodexProduct({
    wrapperVersion: codexPackageManifest.version,
    platform: process.platform,
    arch: process.arch,
    resolveManifest: packageName => productRequire.resolve(`${packageName}/package.json`),
    readManifestVersion: path => (
      JSON.parse(readFileSync(path, 'utf8')) as { readonly version?: unknown }
    ).version,
    isFile: path => statSync(path).isFile(),
    assertExecutable: (path) => { accessSync(path, constants.X_OK) },
  })
}
