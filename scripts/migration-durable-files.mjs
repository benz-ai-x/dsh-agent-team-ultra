/** Durable publication primitives used only inside the isolated operator target. */
import { closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { readBytes, refuse } from './migration-audit-input.mjs'

export function syncDirectory(directory) {
  const handle = openSync(directory, 'r')
  try { fsyncSync(handle) }
  finally { closeSync(handle) }
}

export function durableDirectory(directory) {
  if (existsSync(directory)) {
    if (!lstatSync(directory).isDirectory()) refuse('MIGRATION_TARGET_KIND', 'The target must use concrete directories without symbolic links')
    return
  }
  durableDirectory(dirname(directory))
  mkdirSync(directory, { mode: 0o700 })
  syncDirectory(dirname(directory))
}

export function publish(path, bytes, replace = false) {
  durableDirectory(dirname(path))
  const temporary = join(dirname(path), '.ultra-migration-write')
  const handle = openSync(temporary, 'wx', 0o600)
  try {
    writeFileSync(handle, bytes)
    fsyncSync(handle)
  } finally { closeSync(handle) }
  if (replace) renameSync(temporary, path)
  else {
    linkSync(temporary, path)
    unlinkSync(temporary)
  }
  syncDirectory(dirname(path))
}

export function assertIsolatedTarget(target, sources) {
  for (const source of sources) {
    const concrete = realpathSync(resolve(source))
    if (target === concrete || target.startsWith(`${concrete}/`) || concrete.startsWith(`${target}/`)) {
      refuse('MIGRATION_TARGET_OVERLAP', 'The isolated target must not contain or be contained by a source')
    }
  }
  let directory = target
  for (;;) {
    if (existsSync(directory) && lstatSync(directory).isSymbolicLink()) {
      refuse('MIGRATION_TARGET_KIND', 'The target must use concrete directories without symbolic links')
    }
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
}

export function sameFile(path, bytes) {
  return existsSync(path) && lstatSync(path).isFile() && readFileSync(path).equals(bytes)
}

/** A reserved interrupted write is removable only when it matches this candidate. */
export function recoverTemporary(path, candidates) {
  if (!existsSync(path)) return
  if (!lstatSync(path).isFile()) refuse('MIGRATION_TARGET_DIVERGED', 'An interrupted publication is not a regular file')
  const partial = readBytes(path)
  if (!candidates.some(candidate => {
    const expected = typeof candidate === 'string' ? readBytes(candidate) : candidate
    return partial.length <= expected.length && expected.subarray(0, partial.length).equals(partial)
  })) refuse('MIGRATION_TARGET_DIVERGED', 'An interrupted publication differs from every expected artifact in this directory')
  unlinkSync(path)
  syncDirectory(dirname(path))
}
