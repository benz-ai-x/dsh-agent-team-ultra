#!/usr/bin/env node
/** Final PR-level qualification of the actual B0 archive closure and official Web installation. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requirePreparedHarness } from './harness-source.mjs'
import { archivePackageRoots, qualifiedHarnessPeerRoots } from './local-package-closure.mjs'
import { assertProfileArchiveClosure } from './profile-archive-closure.mjs'
import { initializeBaselineData, assertBaselineData } from '../packages/domain/lib/baseline-data.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { harnessRoot: harness } = requirePreparedHarness(root)
const temporary = mkdtempSync(join(tmpdir(), 'ultra-b0-pack-'))
const destination = join(temporary, 'archives')
const home = join(temporary, 'home')
const archives = []
mkdirSync(destination, { recursive: true })
initializeBaselineData(join(home, 'ultra-b0'))
const env = { ...process.env, DSH_HOME: home, npm_config_ignore_scripts: 'true' }
function run(command, args, label, extraEnv = {}, cwd = root) {
  const result = spawnSync(command, args, { cwd, env: { ...env, ...extraEnv }, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 180_000 })
  if (result.status !== 0) throw new Error(label + ' failed:\n' + (result.stdout ?? '') + '\n' + (result.stderr ?? '') + (result.error ?? ''))
  return result.stdout
}
try {
  const packageRoots = archivePackageRoots(root, harness)
  for (const directory of packageRoots) {
    const output = run('pnpm', ['pack', '--json', '--pack-destination', destination], 'pack ' + directory, {}, directory)
    const packed = JSON.parse(output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1))
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
    const files = (packed.files ?? []).map(file => file.path)
    for (const required of ['package.json', manifest.main]) assert.ok(files.includes(required), manifest.name + ' missing ' + required)
    if (manifest.name.startsWith('@benz-ai-x/')) {
      assert.ok(files.every(file => !file.startsWith('src/') && !file.startsWith('tests/') && !file.endsWith('.map') && !file.endsWith('.tsbuildinfo')), 'archive leaked development artifacts')
      assert.ok(!files.some(file => /(?:evaluation|run-workflow|runtime|TeamMessageCenter|migration-admission)\.(?:d\.)?[jt]s/.test(file)), 'archive retained a retired implementation or declaration')
    }
    assert.ok(existsSync(packed.filename))
    archives.push({ ...manifest, filename: resolve(packed.filename) })
    console.log('PASS archive ' + manifest.name)
  }
  assertProfileArchiveClosure(root, archives)
  assert.equal(archives.filter(row => row.name.startsWith('@benz-ai-x/')).length, 3)
  assert.ok(archives.every(row => !/agent-team-(codex|claude-code)/.test(row.name)))
  const peers = qualifiedHarnessPeerRoots(root, harness, new Set(archives.map(row => row.name)))
  const cli = join(harness, 'apps/cli/lib/bin.js')
  const checkedCli = join(root, 'scripts/compatible-dsh.mjs')
  run(process.execPath, [checkedCli, '--lock-local-peers', 'plugin', '--profile', 'web', 'add',
    ...archives.map(row => 'file:' + row.filename), ...peers.map(path => 'link:' + path)], 'real archive installation')
  const profile = join(home, 'profiles/web')
  const installed = join(profile, 'node_modules')
  const manager = run('pnpm', ['--version'], 'installed package manager', {}, profile).trim()
  assert.equal('pnpm@' + manager, JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).packageManager)
  run(process.execPath, ['--input-type=module', '--eval',
    "await Promise.all(['@benz-ai-x/dsh-agent-team-ultra', '@benz-ai-x/dsh-agent-team-ultra/client', '@benz-ai-x/dsh-agent-team-ultra/baseline-data', '@benz-ai-x/dsh-agent-team-ultra-profile', '@benz-ai-x/dsh-agent-team-ultra-profile/data', '@benz-ai-x/dsh-client-ui-agent-team-ultra'].map(name => import(name)))",
  ], 'ordinary installed public imports', {}, profile)
  const dump = run(process.execPath, [cli, '--profile', 'web', '--dump-config'], 'installed Loader composition')
  for (const id of ['agent-team-ultra-data', 'agent-team-ultra', 'ui-agent-team-ultra', 'tool-agent-team']) assert.ok(dump.includes('id: ' + id), 'missing ' + id)
  assert.ok(!/id: agent-team-(codex|claude-code)/.test(dump), 'retired runtime in Loader')
  console.log('PASS ' + archives.length + ' archives: real CLI installation, ordinary resolution and official Loader composition')
  const marker = readFileSync(join(home, 'ultra-b0/ultra-b0.json'))
  // Exercise the same public behavior suite against the actual installed Host and Typert bytes.
  const product = run(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run',
    'packages/domain/tests/b0-workflow.integration.spec.ts', 'packages/ui/tests/packed-studio.client.spec.tsx'],
  'installed Host/Studio/generated Remote workflow', {
    ULTRA_PACKED_DOMAIN: join(installed, '@benz-ai-x/dsh-agent-team-ultra'),
    ULTRA_PACKED_UI: join(installed, '@benz-ai-x/dsh-client-ui-agent-team-ultra'),
  })
  process.stdout.write(product)
  const boot = run(process.execPath, [join(root, 'scripts/verify-web-boot.mjs'), checkedCli], 'real Web startup and graceful exit')
  process.stdout.write(boot)
  assertBaselineData(join(home, 'ultra-b0'))
  assert.deepEqual(readFileSync(join(home, 'ultra-b0/ultra-b0.json')), marker)
  console.log('PASS installed B0 workflows and real Web boot; model execution uses a controlled adapter, not an authenticated account')
  // This sentinel proves uninstall keeps the isolated data; application data is never removed by the CLI.
  const sentinel = join(home, 'ultra-b0/storage/keep-after-uninstall.txt')
  writeFileSync(sentinel, 'retain data')
  run(process.execPath, [cli, 'plugin', '--profile', 'web', 'remove', '--config.offline=true', '--config.auto-install-peers=false',
    ...archives.map(row => row.name)], 'real archive uninstall')
  const removed = run(process.execPath, [cli, '--profile', 'web', '--dump-config'], 'Loader after uninstall')
  for (const row of archives) {
    assert.ok(!existsSync(join(installed, row.name)), row.name + ' remained installed')
    assert.ok(!removed.includes(row.name), row.name + ' retained a Loader entry')
  }
  assert.equal(readFileSync(sentinel, 'utf8'), 'retain data')
  assert.deepEqual(readFileSync(join(home, 'ultra-b0/ultra-b0.json')), marker)
  console.log('PASS complete uninstall: no overlay packages/Loader rows, application data preserved')
} catch (error) {
  console.error(String(error))
  process.exitCode = 1
} finally {
  if (process.exitCode && process.argv.includes('--keep-failed')) console.error('Diagnostic installation retained at ' + temporary)
  else rmSync(temporary, { recursive: true, force: true })
}
