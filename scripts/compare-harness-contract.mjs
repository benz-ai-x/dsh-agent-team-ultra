#!/usr/bin/env node
/** Reproduce qualification against the fixed official baseline and maintained fork. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { requirePreparedHarness } from './harness-source.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { harnessRoot, lock } = requirePreparedHarness(root)
if (!process.argv[2]) throw new Error('Pass the built official reference directory as the first argument')
const official = realpathSync(resolve(process.argv[2]))
const expected = lock.compatibility.officialComparison
const commit = spawnSync('git', ['-C', official, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
assert.equal(commit.status, 0, commit.stderr)
assert.equal(commit.stdout.trim(), expected.commit, 'official reference must match the fixed comparison commit')
const dirty = spawnSync('git', ['-C', official, 'status', '--porcelain=v1', '--untracked-files=all'], { encoding: 'utf8' })
assert.equal(dirty.status, 0, dirty.stderr)
assert.equal(dirty.stdout.trim(), '', 'official source must remain clean')

function run(args, env = {}) {
  return spawnSync(process.execPath, args, { cwd: tmpdir(), encoding: 'utf8', timeout: 30000, env: { ...process.env, ...env } })
}
const results = {}
for (const [name, source] of Object.entries({ fork: harnessRoot, official })) {
  const result = run([join(root, 'scripts/probe-team-contract.mjs'), source])
  assert.equal(result.status, 0, `${name}: ${result.stdout}\n${result.stderr}`)
  results[name] = JSON.parse(result.stdout)
}
assert.deepEqual(results.fork.checked, results.official.checked)
assert.equal(results.fork.sessionFormat, lock.compatibility.formats.session)
assert.equal(results.official.sessionFormat, 2)

const isolated = mkdtempSync(join(tmpdir(), 'ultra-official-admission-'))
try {
  const business = join(isolated, 'business-data')
  const rejected = run([join(root, 'scripts/compatible-dsh.mjs'), 'plugin', '--profile', 'web', 'add', 'must-not-install'], {
    DSH_HARNESS_ROOT: official, DSH_HOME: business,
  })
  assert.equal(rejected.status, 1, rejected.stdout)
  assert.equal(JSON.parse(rejected.stderr).code, 'ULTRA_COMPAT_SOURCE_MISMATCH')
  assert.equal(existsSync(business), false)

  const host = join(root, 'packages/domain')
  cpSync(join(host, 'lib'), join(isolated, 'lib'), { recursive: true })
  cpSync(join(host, 'package.json'), join(isolated, 'package.json'))
  for (const scope of readdirSync(join(host, 'node_modules')).filter(name => !name.startsWith('.'))) {
    const names = scope.startsWith('@') ? readdirSync(join(host, 'node_modules', scope)).map(name => `${scope}/${name}`) : [scope]
    for (const name of names) {
      const target = join(isolated, 'node_modules', name)
      mkdirSync(dirname(target), { recursive: true })
      symlinkSync(name === '@deepseek-ai/dsh-experimental-agent-team'
        ? join(official, 'packages/experimental/agent-team')
        : realpathSync(join(host, 'node_modules', name)), target, 'dir')
    }
  }
  const imported = run(['--input-type=module', '--eval', `
    try { await import(${JSON.stringify(pathToFileURL(join(isolated, 'lib/index.js')).href)}); process.exitCode = 2 }
    catch (error) { console.log(JSON.stringify({ code: error.code, message: error.message })) }
  `], { DSH_HOME: business })
  assert.equal(imported.status, 0, imported.stderr)
  assert.equal(JSON.parse(imported.stdout).code, 'ULTRA_COMPAT_ARTIFACT_MISMATCH')
  assert.equal(existsSync(business), false)
  console.log(JSON.stringify({
    maintainedFork: lock.upstream.commit,
    official: expected.commit,
    behavior: results,
    admission: { supportedFork: 'accepted', stockSource: 'rejected-before-install', stockTeam: 'rejected-before-import', businessDataCreated: false },
  }, null, 2))
} finally { rmSync(isolated, { recursive: true, force: true }) }
