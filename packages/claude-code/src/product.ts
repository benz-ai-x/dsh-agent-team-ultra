/** Exact local Claude Code product qualification for the durable runtime adapter. */

import { accessSync, constants, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/** Exact Agent SDK version qualified by this adapter. */
export const EXPECTED_AGENT_SDK_VERSION = '0.3.241'

/** Exact Claude Code native product version distributed by the qualified SDK. */
export const EXPECTED_CLAUDE_CODE_VERSION = '2.1.241'

interface AgentSdkPackageManifest {
  readonly version: string
  readonly claudeCodeVersion: string
}

const sdkEntryPath = createRequire(import.meta.url).resolve('@anthropic-ai/claude-agent-sdk')
const sdkPackageJsonPath = join(dirname(sdkEntryPath), 'package.json')
const sdkPackageManifest = JSON.parse(
  readFileSync(sdkPackageJsonPath, 'utf8'),
) as AgentSdkPackageManifest

/** Detached local-product qualification result safe for operator diagnostics. */
export type ClaudeCodeProductEligibility =
  | {
    readonly eligible: true
    readonly product: 'claude-code'
    readonly sdkVersion: typeof EXPECTED_AGENT_SDK_VERSION
    readonly nativeVersion: typeof EXPECTED_CLAUDE_CODE_VERSION
    readonly protocol: 'agent-sdk-session-resume'
  }
  | {
    readonly eligible: false
    readonly product: 'claude-code'
    readonly reason:
      | 'unsupported-adapter-version'
      | 'unsupported-native-version'
      | 'unsupported-platform'
      | 'native-product-missing'
  }

/** Bounded product facts and filesystem operations used during qualification. */
export interface ClaudeCodeProductProbe {
  readonly sdkVersion: string
  readonly nativeVersion: string
  readonly platform: string
  readonly arch: string
  readonly libc: 'glibc' | 'musl' | undefined
  resolveManifest(packageName: string): string
  readManifestVersion(path: string): unknown
  isFile(path: string): boolean
  assertExecutable(path: string): void
}

interface NativeTarget {
  readonly packageName: string
}

const targets: Readonly<Record<string, NativeTarget>> = {
  'linux-x64-glibc': { packageName: '@anthropic-ai/claude-agent-sdk-linux-x64' },
  'linux-arm64-glibc': { packageName: '@anthropic-ai/claude-agent-sdk-linux-arm64' },
  'linux-x64-musl': { packageName: '@anthropic-ai/claude-agent-sdk-linux-x64-musl' },
  'linux-arm64-musl': { packageName: '@anthropic-ai/claude-agent-sdk-linux-arm64-musl' },
  'darwin-x64-none': { packageName: '@anthropic-ai/claude-agent-sdk-darwin-x64' },
  'darwin-arm64-none': { packageName: '@anthropic-ai/claude-agent-sdk-darwin-arm64' },
  'win32-x64-none': { packageName: '@anthropic-ai/claude-agent-sdk-win32-x64' },
  'win32-arm64-none': { packageName: '@anthropic-ai/claude-agent-sdk-win32-arm64' },
}

/** Package-local Claude Code executable used by the subprocess owner. */
export const claudeCodePackageBin = resolveNativeExecutable(
  process.platform,
  process.arch,
  currentLinuxLibc(),
  packageName => createRequire(sdkEntryPath).resolve(`${packageName}/package.json`),
)

/**
 * Qualify one detached SDK, native-product, platform, and payload probe.
 * @param probe - bounded product facts and filesystem operations supplied by the caller.
 * @returns exact eligibility without native installation paths.
 */
export function qualifyClaudeCodeProduct(
  probe: ClaudeCodeProductProbe,
): ClaudeCodeProductEligibility {
  if (probe.sdkVersion !== EXPECTED_AGENT_SDK_VERSION) {
    return { eligible: false, product: 'claude-code', reason: 'unsupported-adapter-version' }
  }
  if (probe.nativeVersion !== EXPECTED_CLAUDE_CODE_VERSION) {
    return { eligible: false, product: 'claude-code', reason: 'unsupported-native-version' }
  }
  const target = nativeTarget(probe.platform, probe.arch, probe.libc)
  if (target === undefined) {
    return { eligible: false, product: 'claude-code', reason: 'unsupported-platform' }
  }
  try {
    const manifestPath = probe.resolveManifest(target.packageName)
    const executable = join(dirname(manifestPath), probe.platform === 'win32' ? 'claude.exe' : 'claude')
    if (
      probe.readManifestVersion(manifestPath) !== EXPECTED_AGENT_SDK_VERSION
      || !probe.isFile(executable)
    ) {
      return { eligible: false, product: 'claude-code', reason: 'native-product-missing' }
    }
    if (probe.platform !== 'win32') probe.assertExecutable(executable)
  } catch {
    return { eligible: false, product: 'claude-code', reason: 'native-product-missing' }
  }
  return {
    eligible: true,
    product: 'claude-code',
    sdkVersion: EXPECTED_AGENT_SDK_VERSION,
    nativeVersion: EXPECTED_CLAUDE_CODE_VERSION,
    protocol: 'agent-sdk-session-resume',
  }
}

/**
 * Verify the pinned SDK and current-platform native Claude Code executable.
 * @returns exact eligibility without exposing an installation path.
 */
export function claudeCodeProductEligibility(): ClaudeCodeProductEligibility {
  const productRequire = createRequire(sdkEntryPath)
  return qualifyClaudeCodeProduct({
    sdkVersion: sdkPackageManifest.version,
    nativeVersion: sdkPackageManifest.claudeCodeVersion,
    platform: process.platform,
    arch: process.arch,
    libc: currentLinuxLibc(),
    resolveManifest: packageName => productRequire.resolve(`${packageName}/package.json`),
    readManifestVersion: path => (
      JSON.parse(readFileSync(path, 'utf8')) as { readonly version?: unknown }
    ).version,
    isFile: path => statSync(path).isFile(),
    assertExecutable: (path) => { accessSync(path, constants.X_OK) },
  })
}

function nativeTarget(
  platform: string,
  arch: string,
  libc: 'glibc' | 'musl' | undefined,
): NativeTarget | undefined {
  return targets[`${platform}-${arch}-${platform === 'linux' ? libc : 'none'}`]
}

/**
 * Resolve one platform payload executable without consulting PATH.
 * @param platform - Node platform identifier.
 * @param arch - Node architecture identifier.
 * @param libc - Linux libc family, or undefined outside Linux.
 * @param resolveManifest - package-local manifest resolver.
 * @returns exact executable path, or an empty string when the target payload cannot be resolved.
 */
export function resolveNativeExecutable(
  platform: string,
  arch: string,
  libc: 'glibc' | 'musl' | undefined,
  resolveManifest: (packageName: string) => string,
): string {
  const target = nativeTarget(platform, arch, libc)
  if (target === undefined) return ''
  try {
    const manifestPath = resolveManifest(target.packageName)
    return join(dirname(manifestPath), platform === 'win32' ? 'claude.exe' : 'claude')
  } catch {
    return ''
  }
}

/**
 * Select the native Linux libc family from a detached process-report fact.
 * @param platform - Node platform identifier.
 * @param glibcVersion - runtime glibc version when Node reports one.
 * @returns glibc, musl, or undefined outside Linux.
 */
export function detectLinuxLibc(
  platform: string,
  glibcVersion: unknown,
): 'glibc' | 'musl' | undefined {
  if (platform !== 'linux') return undefined
  return typeof glibcVersion === 'string' ? 'glibc' : 'musl'
}

function currentLinuxLibc(): 'glibc' | 'musl' | undefined {
  const report = process.report.getReport() as { readonly header?: { readonly glibcVersionRuntime?: unknown } }
  return detectLinuxLibc(process.platform, report.header?.glibcVersionRuntime)
}
