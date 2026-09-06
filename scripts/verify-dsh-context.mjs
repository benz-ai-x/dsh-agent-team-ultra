#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectHarnessIdentity, nodeSatisfies, selectHarnessRoot, validateLinks, validateTypeScriptSources } from './harness-source.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const requireSource = process.argv.includes('--require-source')
const failures = []
const warnings = []
const passes = []

function check(condition, message) {
  if (condition) passes.push(message)
  else failures.push(message)
}

for (const path of [
  'README.md',
  'AGENTS.md',
  'TODO.md',
  'package.json',
  'pnpm-lock.yaml',
  'dsh-reference.lock.json',
  'scripts/verify-web-boot.mjs',
  'docs/agent/PROJECT_CONTRACT.md',
  'docs/decisions/0001-local-overlay-and-sidecar-state.md',
  'packages/domain/package.json',
  'packages/ui/package.json',
  'packages/profile/cordis.patch.yml',
]) check(existsSync(join(projectRoot, path)), `${path} exists`)

let manifest
let lock
try { manifest = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) } catch (error) {
  failures.push(`package.json is invalid: ${String(error)}`)
}
try { lock = JSON.parse(readFileSync(join(projectRoot, 'dsh-reference.lock.json'), 'utf8')) } catch (error) {
  failures.push(`dsh-reference.lock.json is invalid: ${String(error)}`)
}

if (manifest !== undefined) {
  check(manifest.private === true, 'workspace remains private')
  check(manifest.type === 'module', 'workspace uses ESM')
  check(manifest.engines?.node === lock?.upstream?.node, 'workspace Node engine matches the reference lock')
  check(manifest.scripts?.verify?.includes('context:check:strict') === true, 'verification begins with strict source attestation')
}

if (lock !== undefined) {
  check(lock.schemaVersion === 1, 'reference lock schema is supported')
  check(/^[0-9a-f]{40}$/u.test(lock.upstream?.commit ?? ''), 'reference lock has a full Git commit')
  check(/^[0-9a-f]{64}$/u.test(lock.upstream?.docsDigest ?? ''), 'reference lock has a docs digest')
  check(nodeSatisfies(lock.upstream?.node), `Node ${process.version} satisfies ${lock.upstream?.node}`)
  const environmentName = lock.localResolution?.environmentVariable ?? 'DSH_HARNESS_ROOT'
  const harnessRoot = selectHarnessRoot(projectRoot, lock)
  if (!existsSync(harnessRoot)) {
    const message = `pinned Harness source not found at ${harnessRoot}`
    if (requireSource) failures.push(message)
    else warnings.push(`${message}; set ${environmentName} for strict validation`)
  } else {
    try {
      inspectHarnessIdentity(harnessRoot, lock, check)
      validateLinks(projectRoot, harnessRoot, check)
      validateTypeScriptSources(projectRoot, harnessRoot, check)
      passes.push(`validated Harness source at ${harnessRoot}`)
    } catch (error) {
      failures.push(`cannot validate Harness source at ${harnessRoot}: ${String(error)}`)
    }
  }
}

for (const message of passes) console.log(`PASS ${message}`)
for (const message of warnings) console.warn(`WARN ${message}`)
for (const message of failures) console.error(`FAIL ${message}`)
if (failures.length > 0) {
  console.error(`\ncontext check failed: ${failures.length} failure(s), ${warnings.length} warning(s)`)
  process.exitCode = 1
} else {
  console.log(`\ncontext check passed: ${passes.length} check(s), ${warnings.length} warning(s)`)
}
