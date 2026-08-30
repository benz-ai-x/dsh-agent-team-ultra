#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const requireSource = process.argv.includes('--require-source')
const failures = []
const warnings = []
const passes = []

function check(condition, message) {
  if (condition) passes.push(message)
  else failures.push(message)
}

function files(root) {
  const result = []
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile()) result.push(absolute)
    }
  }
  visit(root)
  return result.sort((left, right) => Buffer.from(left).compare(Buffer.from(right)))
}

function docsDigest(root) {
  const aggregate = createHash('sha256')
  for (const absolute of files(join(root, 'docs'))) {
    const digest = createHash('sha256').update(readFileSync(absolute)).digest('hex')
    aggregate.update(`${digest}  ${relative(root, absolute).split(sep).join('/')}\n`)
  }
  return aggregate.digest('hex')
}

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`)
  return result.stdout.trim()
}

function parseVersion(value) {
  const match = /^(?:v)?(\d+)\.(\d+)\.(\d+)/u.exec(value)
  return match === null ? undefined : match.slice(1).map(Number)
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    const difference = left[index] - right[index]
    if (difference !== 0) return difference
  }
  return 0
}

function nodeSatisfies(range) {
  const actual = parseVersion(process.version)
  if (actual === undefined || typeof range !== 'string') return false
  return range.split('||').some(raw => {
    const clause = raw.trim()
    const minimum = parseVersion(clause.replace(/^(?:\^|>=)\s*/u, ''))
    if (minimum === undefined || compareVersions(actual, minimum) < 0) return false
    if (clause.startsWith('>=')) return true
    if (clause.startsWith('^')) return compareVersions(actual, [minimum[0] + 1, 0, 0]) < 0
    return compareVersions(actual, minimum) === 0
  })
}

function manifests() {
  return [join(projectRoot, 'package.json'), ...readdirSync(join(projectRoot, 'packages'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(projectRoot, 'packages', entry.name, 'package.json')))
    .map(entry => join(projectRoot, 'packages', entry.name, 'package.json'))]
}

function validateLinks(harnessRoot) {
  for (const manifestPath of manifests()) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
    for (const section of sections) {
      for (const [name, specifier] of Object.entries(manifest[section] ?? {})) {
        if (typeof specifier !== 'string' || !specifier.startsWith('link:')) continue
        const target = resolve(dirname(manifestPath), specifier.slice('link:'.length))
        check(existsSync(target), `${manifest.name} ${section}.${name} link exists`)
        if (!existsSync(target)) continue
        check(realpathSync(target).startsWith(`${realpathSync(harnessRoot)}${sep}`),
          `${manifest.name} ${section}.${name} links into the audited Harness`)
        const targetManifestPath = join(target, 'package.json')
        if (!existsSync(targetManifestPath)) continue
        const targetManifest = JSON.parse(readFileSync(targetManifestPath, 'utf8'))
        const inputs = [targetManifestPath]
        if (existsSync(join(target, 'src'))) inputs.push(...files(join(target, 'src')))
        const newestInput = Math.max(...inputs.map(input => statSync(input).mtimeMs))
        for (const field of ['main', 'types']) {
          const entry = targetManifest[field]
          if (typeof entry !== 'string') continue
          const artifact = join(target, entry)
          check(existsSync(artifact), `${name} has a built ${field} entry`)
          if (existsSync(artifact)) check(statSync(artifact).mtimeMs >= newestInput, `${name} built ${field} entry is fresh`)
        }
      }
    }
  }
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
  const harnessRoot = resolve(process.env[environmentName]
    ?? join(projectRoot, lock.localResolution?.fallbackRelativePath ?? ''))
  if (!existsSync(harnessRoot)) {
    const message = `pinned Harness source not found at ${harnessRoot}`
    if (requireSource) failures.push(message)
    else warnings.push(`${message}; set ${environmentName} for strict validation`)
  } else {
    try {
      const harnessManifest = JSON.parse(readFileSync(join(harnessRoot, 'package.json'), 'utf8'))
      check(harnessManifest.version === lock.upstream.version, `Harness version matches ${lock.upstream.version}`)
      check(harnessManifest.engines?.node === lock.upstream.node, 'Harness Node engine matches')
      check(git(harnessRoot, ['rev-parse', 'HEAD']) === lock.upstream.commit, `Harness commit matches ${lock.upstream.commit}`)
      check(docsDigest(harnessRoot) === lock.upstream.docsDigest, 'Harness docs digest matches')
      const dirty = [
        git(harnessRoot, ['status', '--porcelain=v1', '--untracked-files=all']),
        git(harnessRoot, ['status', '--porcelain=v1', '--ignored=matching', '--untracked-files=all', '--', '.env']),
      ].filter(Boolean).join('\n')
      check(dirty === '', dirty === '' ? 'Harness attested inputs are clean' : `Harness has changes:\n${dirty}`)
      validateLinks(harnessRoot)
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
