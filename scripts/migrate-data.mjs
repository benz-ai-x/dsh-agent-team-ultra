#!/usr/bin/env node
/** Operator entry for the isolated, one-way Session/Team/Ultra migration. */
import { closeSync, existsSync, openSync } from 'node:fs'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { requirePreparedHarness } from './harness-source.mjs'
import { files, readBytes, readJson, refuse } from './migration-audit-input.mjs'
import { assertIsolatedTarget, durableDirectory, publish, recoverTemporary, sameFile } from './migration-durable-files.mjs'
import { migrationPlan } from './migration-audit-plan.mjs'
import { prepareMigration } from './migration-prepare.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let prepared
let lease

function audit(sessions, backend, storage) {
  const result = spawnSync(process.execPath, [join(root, 'scripts/audit-migration.mjs'),
    '--sessions', sessions, `--${backend}`, storage,
  ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  let report
  try { report = JSON.parse(result.stdout) }
  catch { refuse('MIGRATION_AUDIT_FAILED', 'The source audit could not produce a bounded result') }
  if (result.status !== 0 || !report.ok) {
    refuse(report.code?.startsWith('AUDIT_') ? report.code : 'MIGRATION_AUDIT_FAILED',
      report.code?.startsWith('AUDIT_') ? report.message : 'The source audit refused this data')
  }
  return report
}

try {
  const args = process.argv.slice(2)
  const options = new Map()
  for (let index = 0; index < args.length; index += 2) {
    if (!['--sessions', '--json', '--sqlite', '--target', '--max-writes'].includes(args[index])
      || !args[index + 1] || options.has(args[index])) {
      refuse('MIGRATION_ARGUMENTS', 'Use --sessions <source> and --json <root> or --sqlite <database>, with --target <isolated directory>')
    }
    options.set(args[index], args[index] === '--max-writes' ? args[index + 1] : resolve(args[index + 1]))
  }
  if (!options.has('--target') || !options.has('--sessions') || options.has('--json') === options.has('--sqlite')) {
    refuse('MIGRATION_ARGUMENTS', 'Exactly one storage source, a Session source and an isolated target are required')
  }
  const { harnessRoot, lock, proof } = requirePreparedHarness(root)
  const backend = options.has('--json') ? 'json' : 'sqlite'
  const sourceSessions = options.get('--sessions')
  const sourceStorage = options.get(`--${backend}`)
  const target = options.get('--target')
  const maximumWrites = options.has('--max-writes') ? Number(options.get('--max-writes')) : Infinity
  if (maximumWrites !== Infinity && (!Number.isSafeInteger(maximumWrites) || maximumWrites < 1)) {
    refuse('MIGRATION_ARGUMENTS', '--max-writes must be a positive safe integer')
  }
  let writes = 0
  const afterWrite = () => {
    writes += 1
    if (writes >= maximumWrites) refuse('MIGRATION_PAUSED', 'The requested durable write limit was reached; retry with the same source and target')
  }
  assertIsolatedTarget(target, [sourceSessions, sourceStorage])
  const source = audit(sourceSessions, backend, sourceStorage)
  prepared = await prepareMigration({ sessions: sourceSessions, storage: sourceStorage, backend, harnessRoot,
    ultraRoot: root, sessionCount: source.sessionCount })
  const expectedReport = audit(join(prepared.directory, 'sessions'), backend,
    join(prepared.directory, backend === 'json' ? 'storage' : 'storage.sqlite'))
  const manifest = {
    schemaVersion: 1, status: 'pending', sourceDigest: source.sourceDigest,
    sourceFormats: source.sourceFormats, sourceCompatibility: source.sourceCompatibility,
    targetCompatibility: { commit: proof.commit, docsDigest: proof.docsDigest, extensionApi: lock.compatibility.extensionApi },
    targetFormats: migrationPlan.targetFormats, backend,
  }
  durableDirectory(target)
  const manifestPath = join(target, 'ultra-migration-manifest.json')
  const pendingBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
  const completeBytes = Buffer.from(JSON.stringify({ ...manifest, status: 'complete', targetDigest: expectedReport.sourceDigest }, null, 2) + '\n')
  const existingFiles = files(target)
  if (!existsSync(manifestPath) && existingFiles.some(path =>
    ![join(target, '.ultra-migration.lock'), join(target, '.ultra-migration-write')].includes(path))) {
    refuse('MIGRATION_TARGET_UNOWNED', 'A non-empty target has no matching migration manifest; no files were overwritten')
  }
  const require = createRequire(join(harnessRoot, 'packages/session/session-persistence-jsonl/package.json'))
  const { flockSync } = require('fs-ext')
  lease = openSync(join(target, '.ultra-migration.lock'), 'a+', 0o600)
  try { flockSync(lease, 'exnb') }
  catch { refuse('MIGRATION_TARGET_BUSY', 'Another operator owns this target; retry after it finishes') }
  let previous
  if (existsSync(manifestPath)) {
    previous = readJson(manifestPath)
    const { status, targetDigest, ...identity } = previous
    const { status: _pending, ...expected } = manifest
    if (!['pending', 'complete'].includes(status) || !isDeepStrictEqual(identity, expected)
      || (status === 'complete' && !/^[a-f0-9]{64}$/.test(targetDigest ?? ''))) {
      refuse('MIGRATION_TARGET_DIVERGED', 'The target manifest belongs to a different source, format or integration candidate')
    }
  } else {
    recoverTemporary(join(target, '.ultra-migration-write'), [pendingBytes])
    publish(manifestPath, pendingBytes)
    afterWrite()
  }
  durableDirectory(join(target, 'sessions'))
  const artifacts = files(prepared.directory).map(path => [join(target, relative(prepared.directory, path)), path])
  if (artifacts.some(([path]) => ['.ultra-migration-write', '.ultra-migration.lock', 'ultra-migration-manifest.json'].includes(basename(path)))) {
    refuse('MIGRATION_RESERVED_ARTIFACT', 'A source artifact uses a reserved migration publication name')
  }
  if (backend === 'json') durableDirectory(join(target, 'storage'))
  if (previous?.status !== 'complete') for (const path of files(target)) {
    if (basename(path) !== '.ultra-migration-write') continue
    const candidates = artifacts.filter(([destination]) => dirname(destination) === dirname(path)).map(([, sourcePath]) => sourcePath)
    if (dirname(path) === target) candidates.push(pendingBytes, completeBytes)
    recoverTemporary(path, candidates)
  }
  const expectedPaths = new Set([...artifacts.map(([destination]) => destination), manifestPath, join(target, '.ultra-migration.lock')])
  for (const path of files(target)) if (!expectedPaths.has(path)) {
    refuse('MIGRATION_TARGET_DIVERGED', 'An unexpected target artifact prevents deterministic reuse')
  }
  for (const [destination, sourcePath] of artifacts) {
    const expected = readBytes(sourcePath)
    if (existsSync(destination)) {
      if (!sameFile(destination, expected)) refuse('MIGRATION_TARGET_DIVERGED', 'An existing target artifact differs from its deterministic projection')
    } else {
      if (previous?.status === 'complete') refuse('MIGRATION_TARGET_DIVERGED', 'A complete target has lost a required artifact')
      publish(destination, expected)
      afterWrite()
    }
  }
  const targetReport = audit(join(target, 'sessions'), backend, join(target, backend === 'json' ? 'storage' : 'storage.sqlite'))
  if (targetReport.sourceDigest !== expectedReport.sourceDigest) {
    refuse('MIGRATION_TARGET_DIVERGED', 'The published target differs from its validated candidate')
  }
  if (targetReport.sessionCount > 0 && targetReport.sourceFormats.session !== 2) {
    refuse('MIGRATION_CONVERSION_REQUIRED', 'The isolated target still requires Session format conversion')
  }
  if (targetReport.ultraMigration.status !== 'complete') {
    refuse('MIGRATION_ULTRA_PENDING', 'Ultra records must be validated and complete before joint completion')
  }
  if (targetReport.checkpoints.some(row => row.status !== 'reusable')) {
    refuse('MIGRATION_CHECKPOINT_INVALID', 'A target checkpoint does not match its authoritative log')
  }
  for (const field of ['sessionCount', 'bindings', 'nativeCorrelations']) {
    if (!isDeepStrictEqual(source[field], targetReport[field])) refuse('MIGRATION_IDENTITY_CHANGED', 'The isolated target changed an authoritative identity')
  }
  if (audit(sourceSessions, backend, sourceStorage).sourceDigest !== source.sourceDigest) {
    refuse('MIGRATION_SOURCE_CHANGED', 'The source changed during migration; keep its writers stopped')
  }
  if (previous?.status === 'complete') {
    if (previous.targetDigest !== targetReport.sourceDigest) refuse('MIGRATION_TARGET_DIVERGED', 'A complete target has changed since migration')
  } else {
    publish(manifestPath, completeBytes, true)
    afterWrite()
  }
  console.log(JSON.stringify({ ok: true, status: 'complete', sourcePreserved: true,
    sourceDigest: source.sourceDigest, sessionCount: targetReport.sessionCount,
    rebuiltRunCount: prepared.rebuiltRunCount,
    targetFormats: manifest.targetFormats, targetCommit: proof.commit, reused: previous?.status === 'complete', writes,
  }, null, 2))
} catch (error) {
  const known = /^(AUDIT_|MIGRATION_)/.test(error.code ?? '')
  console.log(JSON.stringify({ ok: false, code: known ? error.code : 'MIGRATION_IO_FAILED',
    message: known ? error.message : 'Migration could not finish; the source was not opened for writes', sourcePreserved: true }))
  process.exitCode = 1
} finally {
  try { if (lease !== undefined) closeSync(lease) }
  finally { prepared?.dispose() }
}
