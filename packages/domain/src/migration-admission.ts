/** Node-only admission for data published by the isolated migration operator. */
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export class UltraMigrationAdmissionError extends Error {
  constructor(readonly code: 'ULTRA_MIGRATION_PENDING' | 'ULTRA_MIGRATION_INVALID' | 'ULTRA_MIGRATION_MISMATCH') {
    super(code === 'ULTRA_MIGRATION_PENDING'
      ? 'Joint data migration is pending; finish the operator migration before starting business plugins'
      : 'Joint migration completion does not match the running build; retain the data and use the qualified operator')
    this.name = 'UltraMigrationAdmissionError'
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sha256(value: unknown): boolean {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

function checkedMigrationRoot(path: string): string | undefined {
  let migrationRoot: string | undefined
  const visited = new Set<string>()
  const roots = [resolve(path)]
  if (existsSync(path)) roots.push(realpathSync(path))
  for (let directory of roots) for (;;) {
    if (visited.has(directory)) break
    visited.add(directory)
    const manifestPath = join(directory, 'ultra-migration-manifest.json')
    if (existsSync(manifestPath)) {
      let manifest: unknown
      try {
        const stat = lstatSync(manifestPath)
        if (!stat.isFile() || stat.size > 64 * 1024) throw new Error('invalid manifest medium')
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      } catch { throw new UltraMigrationAdmissionError('ULTRA_MIGRATION_INVALID') }
      if (!record(manifest) || manifest.schemaVersion !== 1 || !['pending', 'complete'].includes(String(manifest.status))) {
        throw new UltraMigrationAdmissionError('ULTRA_MIGRATION_INVALID')
      }
      if (manifest.status === 'pending') throw new UltraMigrationAdmissionError('ULTRA_MIGRATION_PENDING')
      if (!sha256(manifest.sourceDigest) || !sha256(manifest.targetDigest)
        || !record(manifest.targetCompatibility) || !record(manifest.targetFormats)
        || !['json', 'sqlite'].includes(String(manifest.backend))) {
        throw new UltraMigrationAdmissionError('ULTRA_MIGRATION_INVALID')
      }
      const proof = JSON.parse(readFileSync(new URL('./compatibility.json', import.meta.url), 'utf8')) as {
        maintainedFork: { commit: string; docsDigest: string }
        extensionApi: string
        formats: { session: number; teamEvent: number; teamProjection: number; messageRequest: number; nativeOperation: number }
      }
      const targetFormats = manifest.targetFormats
      if (manifest.targetCompatibility.commit !== proof.maintainedFork.commit
        || manifest.targetCompatibility.docsDigest !== proof.maintainedFork.docsDigest
        || manifest.targetCompatibility.extensionApi !== proof.extensionApi
        || Object.entries(proof.formats).filter(([key]) => key !== 'ultraDomain')
          .some(([key, value]) => targetFormats[key] !== value)
        || manifest.targetFormats.subagentDescriptor !== 3 || manifest.targetFormats.projectionCache !== 7
        || manifest.targetFormats.ultraDomain !== 'agent_team_ultra_v1' || manifest.targetFormats.ultraVersion !== 1) {
        throw new UltraMigrationAdmissionError('ULTRA_MIGRATION_MISMATCH')
      }
      const concrete = realpathSync(directory)
      if (migrationRoot !== undefined && migrationRoot !== concrete) {
        throw new UltraMigrationAdmissionError('ULTRA_MIGRATION_MISMATCH')
      }
      migrationRoot = concrete
    }
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  return migrationRoot
}

/** Admit actual configured roots only when they share one completed migration. */
export function assertUltraMigrationReady(...paths: readonly string[]): void {
  const roots = paths.map(checkedMigrationRoot)
  if (roots.some(root => root !== roots[0])) {
    throw new UltraMigrationAdmissionError('ULTRA_MIGRATION_MISMATCH')
  }
}
