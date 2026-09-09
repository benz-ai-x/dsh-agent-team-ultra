/** Node-only B0 admission. No Harness import or business registration precedes it. */
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, readSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

const markerName = 'ultra-b0.json'
const unpublishedRecordName = /^\.[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\.tmp$/u
const marker = Object.freeze({
  schemaVersion: 1,
  baseline: 'official-dsh-only-b0',
  sessionVersion: 3,
  domain: 'agent_team_ultra_b0',
  storage: 'json',
  compression: 'none',
})

export interface BaselineDataPaths {
  readonly root: string
  readonly sessions: string
  readonly storage: string
}

export class BaselineDataError extends Error {
  constructor(message: string) {
    super(`B0_DATA: ${message}`)
    this.name = 'BaselineDataError'
  }
}

function checkedRoot(input: string): string {
  if (typeof input !== 'string' || input.trim() === '' || !isAbsolute(input)) {
    throw new BaselineDataError('an explicit absolute, isolated data root is required')
  }
  const root = resolve(input)
  for (let path = root; ; path = dirname(path)) {
    try {
      const stat = lstatSync(path)
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new BaselineDataError('data roots must be real directories')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (path === dirname(path)) break
  }
  return root
}

function paths(root: string): BaselineDataPaths {
  return Object.freeze({ root, sessions: join(root, 'sessions'), storage: join(root, 'storage') })
}

function realDirectory(path: string): void {
  try {
    const stat = lstatSync(path)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('not a directory')
  } catch { throw new BaselineDataError('an initialized data directory is missing or is not a real directory') }
}

/** The official per-record reader treats malformed/future envelopes as absent; B0 must refuse them. */
function validateRecordEnvelope(path: string): void {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (value === null || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== 2 || !Object.hasOwn(value, 'version') || !Object.hasOwn(value, 'record')) {
      throw new Error('invalid envelope')
    }
    const { version, record } = value as Record<string, unknown>
    if (version !== 1 || record === null || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error('unsupported record')
    }
  } catch { throw new BaselineDataError('malformed or unsupported B0 record envelope; retain the original data') }
}

function validateStorageRecords(root: string): void {
  const unit = join(root, marker.domain)
  if (!existsSync(unit)) return // A fresh initializer has not materialized the first record yet.
  realDirectory(unit)
  for (const entry of readdirSync(unit, { withFileTypes: true })) {
    const path = join(unit, entry.name)
    if (entry.isFile() && unpublishedRecordName.test(entry.name)) continue
    if (entry.name === 'global.json' && entry.isFile()) {
      validateRecordEnvelope(path)
      continue
    }
    if (!entry.isDirectory() || !['profile_heads', 'profile_revisions', 'bindings'].includes(entry.name)) {
      throw new BaselineDataError('unrecognized B0 storage layout')
    }
    for (const file of readdirSync(path, { withFileTypes: true })) {
      // Interrupted official atomic writes are unpublished, not records; preserve their bytes.
      if (file.isFile() && unpublishedRecordName.test(file.name)) continue
      if (!file.isFile() || !/^[a-zA-Z0-9_-]+\.json$/u.test(file.name)) {
        throw new BaselineDataError('unrecognized B0 record path')
      }
      validateRecordEnvelope(join(path, file.name))
    }
  }
}

function validateTree(root: string, sessions: boolean): void {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
      throw new BaselineDataError('linked or special media cannot be used as B0 data')
    }
    if (!sessions && /^agent_team_ultra(?:$|[._])/u.test(entry.name)
      && entry.name !== marker.domain) {
      throw new BaselineDataError('a legacy Ultra storage generation is present; retain the matching old program')
    }
    if (entry.isDirectory()) { validateTree(path, sessions); continue }
    if (!sessions) continue
    if (entry.name.endsWith('.jsonl.zstd')) throw new BaselineDataError('B0 uses uncompressed Session 3 media')
    if (!entry.name.endsWith('.jsonl')) continue
    const descriptor = openSync(path, 'r')
    try {
      const buffer = Buffer.alloc(64 * 1024)
      const length = readSync(descriptor, buffer, 0, buffer.length, 0)
      const end = buffer.subarray(0, length).indexOf(10)
      if (end < 0) throw new Error('missing bounded header')
      const header: unknown = JSON.parse(buffer.subarray(0, end).toString('utf8'))
      if (header === null || typeof header !== 'object' || Array.isArray(header)
        || (header as { version?: unknown }).version !== 3) throw new Error('unsupported Session version')
    } catch { throw new BaselineDataError('non-B0 Session media is present; no automatic historical migration is supported') }
    finally { closeSync(descriptor) }
  }
}

/** Read-only admission; malformed, foreign or incomplete data never becomes a new empty dataset. */
export function assertBaselineData(input: string): BaselineDataPaths {
  const root = checkedRoot(input)
  let parsed: unknown
  try {
    const stat = lstatSync(join(root, markerName))
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw new Error('invalid marker medium')
    parsed = JSON.parse(readFileSync(join(root, markerName), 'utf8'))
  } catch { throw new BaselineDataError('initialize a fresh B0 root explicitly; old data must remain separate') }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)
    || Object.keys(parsed).length !== Object.keys(marker).length
    || Object.entries(marker).some(([key, value]) => (parsed as Record<string, unknown>)[key] !== value)) {
    throw new BaselineDataError('unrecognized data identity; the marker must not be rewritten to admit old data')
  }
  const result = paths(root)
  realDirectory(result.sessions)
  realDirectory(result.storage)
  validateTree(result.sessions, true)
  validateTree(result.storage, false)
  validateStorageRecords(result.storage)
  return result
}

/** Explicit operator initialization only; never called implicitly by Host or Loader startup. */
export function initializeBaselineData(input: string): BaselineDataPaths {
  const root = checkedRoot(input)
  if (existsSync(join(root, markerName))) return assertBaselineData(root)
  if (existsSync(root)) {
    // Recover only an interrupted, still-empty initializer. Any business bytes refuse admission.
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!['sessions', 'storage'].includes(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()
        || readdirSync(join(root, entry.name)).length > 0) {
        throw new BaselineDataError('initialization requires a new or empty data root')
      }
    }
  }
  const result = paths(root)
  mkdirSync(result.sessions, { recursive: true, mode: 0o700 })
  mkdirSync(result.storage, { recursive: true, mode: 0o700 })
  try { writeFileSync(join(root, markerName), `${JSON.stringify(marker, null, 2)}\n`, { flag: 'wx', mode: 0o600 }) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  return assertBaselineData(root)
}
