#!/usr/bin/env node
/** Reproduce the documented stopped-Web upgrade from the fixed, built #22 checkout. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requirePreparedHarness } from './harness-source.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const previous = process.argv[2] && resolve(process.argv[2])
assert.ok(previous, 'Pass the built, isolated #22 checkout to verify:codex-upgrade')
const { harnessRoot } = requirePreparedHarness(root)
requirePreparedHarness(previous)
const baseline = '61d23615bb8987e85f2397ed57b94ef23c79ade3'
function run(command, args, cwd = root, env = {}) {
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, npm_config_ignore_scripts: 'true', ...env },
  })
  assert.equal(result.status, 0, `${command} ${args[0]} failed:\n${result.stdout}\n${result.stderr}`)
  return result.stdout
}
assert.equal(run('git', ['rev-parse', 'HEAD'], previous).trim(), baseline)
assert.equal(run('git', ['status', '--porcelain', '--untracked-files=no'], previous).trim(), '')
const temporary = mkdtempSync(join(tmpdir(), 'ultra-codex-archive-upgrade-'))
const environment = { DSH_HOME: join(temporary, 'home') }
const profileDirectory = join(environment.DSH_HOME, 'profiles/web')
const retired = '@deepseek-ai/dsh-experimental-agent-team-codex'
const current = '@benz-ai-x/dsh-agent-team-codex'
const cli = join(harnessRoot, 'apps/cli/lib/bin.js')
try {
  const pack = (source, output) => {
    run(process.execPath, [join(source, 'scripts/pack-local-overlay.mjs'), output], source)
    const archives = readdirSync(output).filter(file => file.endsWith('.tgz')).map(file => join(output, file))
    assert.equal(archives.length, 8)
    return archives.map(file => ({ file, ...JSON.parse(run('tar', ['-xOf', file, 'package/package.json'])) }))
  }
  const before = pack(previous, join(temporary, 'before'))
  const after = pack(root, join(temporary, 'after'))
  assert.ok(before.some(pkg => pkg.name === retired))
  assert.ok(!after.some(pkg => pkg.name === retired))
  assert.ok(after.some(pkg => pkg.name === current))
  const archiveNames = new Set([...before, ...after].map(pkg => pkg.name))
  const sources = new Map()
  const categories = readdirSync(join(harnessRoot, 'packages'), { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => `packages/${entry.name}`)
  for (const parent of ['vendor', ...categories]) {
    for (const name of readdirSync(join(harnessRoot, parent))) {
      const path = join(harnessRoot, parent, name)
      if (existsSync(join(path, 'package.json'))) {
        sources.set(JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')).name, path)
      }
    }
  }
  const proof = JSON.parse(readFileSync(join(root, 'packages/domain/lib/compatibility.json'), 'utf8'))
  const peers = Object.keys(proof.packages).filter(name => !archiveNames.has(name) && sources.has(name))
    .map(name => `link:${sources.get(name)}`)
  const install = (source, archives) => run(process.execPath, [
    join(source, 'scripts/compatible-dsh.mjs'), 'plugin', '--profile', 'web', 'add',
    ...archives.map(pkg => `file:${pkg.file}`), ...peers,
  ], source, environment)
  const probe = (phase, backend) => JSON.parse(run(process.execPath, [
    join(root, 'scripts/probe-codex-continuity.mjs'), profileDirectory, phase, join(temporary, backend), backend,
  ], root, environment).trim())
  install(previous, before)
  const oldDump = run(process.execPath, [cli, '--profile', 'web', '--dump-config'], root, environment)
  assert.equal(oldDump.match(/id: agent-team-codex\n/g)?.length, 1)
  assert.ok(oldDump.includes(retired))
  const initial = ['json', 'sqlite'].map(backend => probe('before', backend))
  console.log('PASS predecessor archives create and deliver to one Codex employee on JSON and SQLite')

  // Every old runtime context has stopped. Only the retired package is removed;
  // the profile, its configuration, and all business/native storage are retained.
  run(process.execPath, [cli, 'plugin', '--profile', 'web', 'remove',
    '--config.offline=true', '--config.auto-install-peers=false', retired], root, environment)
  assert.ok(!existsSync(join(profileDirectory, 'node_modules', retired)))
  install(root, after)
  const newDump = run(process.execPath, [cli, '--profile', 'web', '--dump-config'], root, environment)
  assert.equal(newDump.match(/id: agent-team-codex\n/g)?.length, 1)
  assert.ok(newDump.includes(current))
  assert.ok(!newDump.includes(retired))
  const upgraded = ['json', 'sqlite'].map(backend => probe('after', backend))
  for (let index = 0; index < initial.length; index += 1) {
    assert.equal(upgraded[index].memberId, initial[index].memberId)
    assert.equal(upgraded[index].nativeRuntimeHandle, initial[index].nativeRuntimeHandle)
  }
  console.log('PASS upgraded archives resume original members, revisions and native handles without duplicate threads')
  run(process.execPath, [join(root, 'scripts/verify-web-boot.mjs'), join(root, 'scripts/compatible-dsh.mjs')], root, environment)
  run(process.execPath, [cli, 'plugin', '--profile', 'web', 'remove',
    '--config.offline=true', '--config.auto-install-peers=false', ...after.map(pkg => pkg.name)], root, environment)
  for (const name of [...after.map(pkg => pkg.name), retired]) {
    assert.ok(!existsSync(join(profileDirectory, 'node_modules', name)), `${name} remained installed`)
  }
  const removed = run(process.execPath, [cli, '--profile', 'web', '--dump-config'], root, environment)
  assert.doesNotMatch(removed, /agent-team-ultra|agent-team-codex|agent-team-claude-code/)
  console.log('PASS upgraded Web boots and uninstall removes every overlay package and Loader row')
  console.log(JSON.stringify({ baseline, initial, upgraded, nativeAcceptance: 'controlled transport; authenticated product acceptance remains #44' }, null, 2))
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
