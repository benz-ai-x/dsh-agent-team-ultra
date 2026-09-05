#!/usr/bin/env node

import { existsSync, lstatSync, mkdirSync, realpathSync, renameSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { harnessLink, requireLockedHarness } from './harness-source.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { harnessRoot, proof } = requireLockedHarness(projectRoot)
const prepared = join(projectRoot, harnessLink)
let current
try { current = lstatSync(prepared) } catch (error) { if (error.code !== 'ENOENT') throw error }

if (!existsSync(prepared) || realpathSync(prepared) !== harnessRoot) {
  if (current !== undefined && !current.isSymbolicLink()) {
    throw new Error(`Cannot replace the existing directory ${prepared}; selected source is ${harnessRoot}`)
  }
  mkdirSync(dirname(prepared), { recursive: true })
  const temporary = `${prepared}.${process.pid}.tmp`
  try {
    symlinkSync(harnessRoot, temporary, 'junction')
    renameSync(temporary, prepared)
  } finally { rmSync(temporary, { force: true }) }
}

console.log(JSON.stringify(proof, null, 2))
