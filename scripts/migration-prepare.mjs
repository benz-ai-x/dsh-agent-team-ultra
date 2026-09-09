/** Convert only a private copy, using the locked public persistence contracts. */
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { files, imported, refuse, sqliteFiles } from './migration-audit-input.mjs'
import { rebuildMigrationRuns } from './migration-run-index.mjs'

export async function prepareMigration({ sessions, storage, backend, harnessRoot, ultraRoot, sessionCount }) {
  const directory = mkdtempSync(join(tmpdir(), 'ultra-migration-prepare-'))
  const dispose = () => rmSync(directory, { recursive: true, force: true })
  let ctx
  try {
    mkdirSync(join(directory, 'sessions'))
    if (backend === 'json') mkdirSync(join(directory, 'storage'))
    const artifacts = [
      ...files(sessions).map(path => [join(directory, 'sessions', relative(sessions, path)), path]),
      ...(backend === 'json'
        ? files(storage).map(path => [join(directory, 'storage', relative(storage, path)), path])
        : sqliteFiles(storage).filter(path => !path.endsWith('-shm'))
          .map(path => [join(directory, `storage.sqlite${path.slice(storage.length)}`), path])),
    ]
    for (const [target, source] of artifacts) {
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
      copyFileSync(source, target)
    }
    const [{ Context }, { default: Persistence }, { default: Storage }, StorageDomain, StorageBackend,
      { openDigitalEmployeeStorage }, { default: Projections }, { teamProjectionDefinition },
      { projectionCacheDomainSpec }] = await Promise.all([
      imported(join(harnessRoot, 'vendor/cordis/lib/index.js')),
      imported(join(harnessRoot, 'packages/session/session-persistence-jsonl/lib/index.js')),
      imported(join(harnessRoot, 'packages/storage/storage/lib/index.js')),
      imported(join(harnessRoot, 'packages/storage/storage-domain/lib/index.js')),
      imported(join(harnessRoot, `packages/storage/storage-${backend}/lib/index.js`)),
      imported(join(ultraRoot, 'packages/domain/lib/types/storage.js')),
      imported(join(harnessRoot, 'packages/session/session-projection/lib/index.js')),
      imported(join(harnessRoot, 'packages/experimental/agent-team/lib/types/projection.js')),
      imported(join(harnessRoot, 'packages/session/session-projection-cache/lib/index.js')),
    ])
    ctx = new Context()
    const compressed = files(sessions).some(path => path.endsWith('.jsonl.zstd'))
    await ctx.plugin(Persistence, { root: join(directory, 'sessions'), compression: compressed ? 'zstd' : 'none' })
    const listed = await ctx.sessionPersistence.list()
    if (listed.length !== sessionCount) refuse('MIGRATION_SESSION_MISSING', 'A source Session was omitted by the physical listing')
    const logs = []
    for (const { header } of [...listed].sort((left, right) => left.header.id.localeCompare(right.header.id))) {
      const handle = await ctx.sessionPersistence.open(header.id, 'read')
      try {
        const events = await handle.read()
        if (handle.header.version !== 2) refuse('MIGRATION_CONVERSION_REQUIRED', 'A Session has no qualified current successor')
        logs.push({ header: handle.header, inheritedEventCount: handle.inheritedEventCount, events })
      } finally { await handle.close() }
    }
    // Cache bytes are disposable only in this private copy. Never ask a domain
    // opener to "repair" the operator's authoritative source directory.
    if (backend === 'json') {
      rmSync(join(directory, 'storage/session_projcache'), { recursive: true, force: true })
      rmSync(join(directory, 'storage/session_projcache.json'), { force: true })
    } else {
      const db = new DatabaseSync(join(directory, 'storage.sqlite'))
      try {
        db.exec('DROP TABLE IF EXISTS u_session_projcache_sessions')
        db.prepare('DELETE FROM unit_globals WHERE unit = ?').run('session_projcache')
        db.prepare('DELETE FROM units WHERE name = ?').run('session_projcache')
      } finally { db.close() }
    }
    await ctx.plugin(Storage)
    await ctx.plugin(StorageBackend, backend === 'json'
      ? { root: join(directory, 'storage') }
      : { path: join(directory, 'storage.sqlite'), journalMode: 'delete' })
    await ctx.plugin(StorageDomain, { backend })
    const ultra = await openDigitalEmployeeStorage(ctx.storageDomain)
    let rebuiltRunCount
    try { rebuiltRunCount = await rebuildMigrationRuns(ultra, logs, ultraRoot) }
    finally { await ultra.close() }
    await ctx.plugin(Projections)
    const unregister = ctx.sessionProjections.register(teamProjectionDefinition)
    ctx.effect(() => unregister)
    const checkpoints = await ctx.storageDomain.open(projectionCacheDomainSpec)
    try {
      for (const { header, inheritedEventCount, events } of logs) {
        const restored = ctx.sessionProjections.restore({}, events, 0, header, inheritedEventCount)
        if (restored.checkpoint.agentTeam.val.failure) refuse('MIGRATION_TEAM_UNREADABLE', 'A migrated Team cannot rebuild its projection')
        await checkpoints.table('sessions').put(header.id, {
          identity: { formatVersion: header.version, createdAt: header.createdAt,
            ...(header.cwd === undefined ? {} : { cwd: header.cwd }),
            isSeeded: header.isSeeded, inheritedEventCount },
          rows: restored.checkpoint,
        })
      }
    } finally { await checkpoints.close() }
    await ctx.fiber.dispose()
    ctx = undefined
    return { directory, dispose, rebuiltRunCount }
  } catch (error) {
    try { await ctx?.fiber.dispose() }
    finally { dispose() }
    throw error
  }
}
