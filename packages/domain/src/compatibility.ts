/** Node-only admission; this module must never import a Harness implementation. */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

interface PackageProof {
  readonly version: string
  readonly main: string
  readonly exports: unknown
  readonly files: Readonly<Record<string, string>>
  readonly dependencies: readonly string[]
  readonly products: readonly { readonly name: string; readonly fields: Readonly<Record<string, string>> }[]
}

interface CompatibilityProof {
  readonly schemaVersion: 1
  readonly packages: Readonly<Record<string, PackageProof>>
  readonly roots: Readonly<Record<'host' | 'profile', readonly string[]>>
  readonly retiredRuntimePackages?: readonly string[]
}

export class UltraCompatibilityError extends Error {
  constructor(readonly packageName: string, reason: string, readonly code = 'ULTRA_COMPAT_ARTIFACT_MISMATCH') {
    super(`${code}: ${packageName}: ${reason}. Install the complete locked Ultra build.`)
    this.name = 'UltraCompatibilityError'
  }
}

function findManifest(name: string, from: string): string | undefined {
  let directory = dirname(from.startsWith('file:') ? fileURLToPath(from) : from)
  for (;;) {
    const candidate = join(directory, 'node_modules', name, 'package.json')
    if (basename(directory) !== 'node_modules' && existsSync(candidate)) return realpathSync(candidate)
    const parent = dirname(directory)
    if (parent === directory) return undefined
    directory = parent
  }
}

function resolveManifest(name: string, from: string): string {
  const path = findManifest(name, from)
  if (!path) throw new Error(`required package ${name} is not installed`)
  return path
}

/** Validate installed executable bytes before any fork-only ESM linking takes place. */
export function assertUltraCompatibility(anchor: string, entry: 'host' | 'profile' = 'host'): void {
  let proof: CompatibilityProof
  try {
    proof = JSON.parse(readFileSync(new URL('./compatibility.json', import.meta.url), 'utf8')) as CompatibilityProof
    if (proof?.schemaVersion !== 1 || !proof.packages || !Array.isArray(proof.roots?.host)
      || !Array.isArray(proof.roots?.profile)) throw new Error('unsupported compatibility proof format')
  } catch (error) {
    throw new UltraCompatibilityError('@benz-ai-x/dsh-agent-team-ultra',
      error instanceof Error ? error.message : 'compatibility proof is unavailable', 'ULTRA_COMPAT_PROOF_INVALID')
  }
  if (entry === 'profile') {
    for (const name of proof.retiredRuntimePackages ?? []) {
      if (findManifest(name, anchor)) {
        throw new UltraCompatibilityError(name,
          'retired runtime is still installed; stop Web and remove this package before upgrading',
          'ULTRA_COMPAT_LEGACY_RUNTIME')
      }
    }
  }
  const visited = new Set<string>()
  function verify(name: string, from: string): void {
    try {
      const expected = proof.packages[name]!
      const path = resolveManifest(name, from)
      if (visited.has(path)) return
      const actual = JSON.parse(readFileSync(path, 'utf8')) as PackageProof
      if (actual.version !== expected.version || actual.main !== expected.main
        || JSON.stringify(actual.exports) !== JSON.stringify(expected.exports)) {
        throw new Error('package version or exported entry points differ from the locked build')
      }
      for (const [file, digest] of Object.entries(expected.files)) {
        const bytes = readFileSync(join(dirname(path), file))
        if (createHash('sha256').update(bytes).digest('hex') !== digest) {
          throw new Error(`executable ${file} differs from the locked build`)
        }
      }
      visited.add(path)
      for (const dependency of expected.dependencies) verify(dependency, path)
      for (const product of expected.products) {
        const actual = JSON.parse(readFileSync(resolveManifest(product.name, path), 'utf8')) as Record<string, unknown>
        for (const [field, value] of Object.entries(product.fields)) {
          if (actual[field] !== value) throw new Error(`${product.name} ${field} must be ${value}; found ${String(actual[field])}`)
        }
      }
    } catch (error) {
      if (error instanceof UltraCompatibilityError) throw error
      throw new UltraCompatibilityError(name, error instanceof Error ? error.message : 'package is unavailable')
    }
  }
  for (const name of proof.roots[entry]) verify(name, anchor)
}
