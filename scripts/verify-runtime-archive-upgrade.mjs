import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requirePreparedHarness } from './harness-source.mjs'
import { assertProfileArchiveClosure } from './profile-archive-closure.mjs'
import { files } from './migration-audit-input.mjs'
import { qualifiedProductOverrides } from './local-package-closure.mjs'
import yaml from 'js-yaml'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Run the shared installed-archive migration while keeping each product probe independent. */
export function verifyRuntimeArchiveUpgrade({ provider, baseline, probeScript, nativeAcceptance, renamed = true }) {
  const previous = process.argv[2] && resolve(process.argv[2])
  assert.ok(previous, `Pass the built, isolated predecessor checkout to verify ${provider} upgrade`)
  const { harnessRoot } = requirePreparedHarness(root)
  const { harnessRoot: previousHarnessRoot } = requirePreparedHarness(previous)
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
  const temporary = mkdtempSync(join(tmpdir(), `ultra-${provider}-archive-upgrade-`))
  const environment = { DSH_HOME: join(temporary, 'home') }
  const profileDirectory = join(environment.DSH_HOME, 'profiles/web')
  const retired = `@deepseek-ai/dsh-experimental-agent-team-${provider}`
  const current = `@benz-ai-x/dsh-agent-team-${provider}`
  const cli = join(harnessRoot, 'apps/cli/lib/bin.js')
  const previousCli = join(previousHarnessRoot, 'apps/cli/lib/bin.js')
  const beforePhase = renamed ? 'before' : 'query-new'
  const afterPhase = renamed ? 'after' : 'query-resume'
  const stateDirectory = (phase, backend) => join(temporary, phase === beforePhase ? 'source' : 'migrated', backend)
  const sourceBytes = backend => Object.fromEntries(files(stateDirectory(beforePhase, backend)).map(path => [
    path, createHash('sha256').update(readFileSync(path)).digest('hex'),
  ]))
  let passed = false
  try {
    const pack = (source, output) => {
      run(process.execPath, [join(source, 'scripts/pack-local-overlay.mjs'), output], source)
      const archives = readdirSync(output).filter(file => file.endsWith('.tgz')).map(file => join(output, file))
      const packages = archives.map(file => ({ file, ...JSON.parse(run('tar', ['-xOf', file, 'package/package.json'])) }))
      assertProfileArchiveClosure(source, packages)
      return packages
    }
    const before = pack(previous, join(temporary, 'before'))
    const after = pack(root, join(temporary, 'after'))
    assert.ok(before.some(pkg => pkg.name === (renamed ? retired : current)))
    assert.ok(!after.some(pkg => pkg.name === retired))
    assert.ok(after.some(pkg => pkg.name === current))
    const archiveNames = new Set([...before, ...after].map(pkg => pkg.name))
    const peersFor = source => {
      const { harnessRoot: selected } = requirePreparedHarness(source)
      const sources = new Map()
      const categories = readdirSync(join(selected, 'packages'), { withFileTypes: true })
        .filter(entry => entry.isDirectory()).map(entry => `packages/${entry.name}`)
      for (const parent of ['vendor', ...categories]) {
        for (const name of readdirSync(join(selected, parent))) {
          const path = join(selected, parent, name)
          if (existsSync(join(path, 'package.json'))) {
            sources.set(JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')).name, path)
          }
        }
      }
      const sourceProof = JSON.parse(readFileSync(join(source, 'packages/domain/lib/compatibility.json'), 'utf8'))
      return Object.keys(sourceProof.packages).filter(name => !archiveNames.has(name) && sources.has(name))
        .map(name => `link:${sources.get(name)}`)
    }
    const proof = JSON.parse(readFileSync(join(root, 'packages/domain/lib/compatibility.json'), 'utf8'))
    const retiredPackages = proof.retiredRuntimePackages.filter(name => before.some(pkg => pkg.name === name))
    const install = (source, archives) => run(process.execPath, [
      join(source, 'scripts/compatible-dsh.mjs'), ...(source === root ? ['--lock-local-peers'] : []),
      'plugin', '--profile', 'web', 'add',
      ...archives.map(pkg => `file:${pkg.file}`), ...peersFor(source),
      ...(source === root ? [] : Object.values(qualifiedProductOverrides(source, previousHarnessRoot))),
    ], source, environment)
    const probe = (phase, backend) => {
      const lines = run(process.execPath, [
        join(root, 'scripts', probeScript), profileDirectory, phase, stateDirectory(phase, backend), backend,
        phase === beforePhase ? previous : root, join(temporary, 'native-continuity', backend),
      ], root, environment).trim().split('\n')
      const result = JSON.parse(lines.pop())
      for (const line of lines) console.log(line)
      return result
    }
    // Initialize through the real historical CLI, then pin this isolated test
    // profile to that source's declared pnpm before any dependency installation.
    run(process.execPath, [previousCli, 'plugin', '--profile', 'web', 'list', '--depth', '-1'], previous, environment)
    const manifestPath = join(profileDirectory, 'package.json')
    const profileManifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const packageManager = JSON.parse(readFileSync(join(previous, 'package.json'), 'utf8')).packageManager
    writeFileSync(manifestPath, JSON.stringify({ ...profileManifest, packageManager }, null, 2) + '\n')
    assert.equal(run('pnpm', ['--version'], profileDirectory).trim(), packageManager.slice('pnpm@'.length))
    const settingsPath = join(profileDirectory, 'pnpm-workspace.yaml')
    const settings = yaml.load(readFileSync(settingsPath, 'utf8'))
    const previousProducts = qualifiedProductOverrides(previous, previousHarnessRoot)
    writeFileSync(settingsPath, yaml.dump({ ...settings, overrides: { ...settings.overrides, ...previousProducts } }, { lineWidth: -1 }))
    install(previous, before)
    const oldDump = run(process.execPath, [previousCli, '--profile', 'web', '--dump-config'], root, environment)
    assert.equal(oldDump.split(`id: agent-team-${provider}\n`).length - 1, 1)
    assert.ok(oldDump.includes(renamed ? retired : current))
    const initial = ['json', 'sqlite'].map(backend => probe(beforePhase, backend))
    const preserved = ['json', 'sqlite'].map(sourceBytes)
    console.log(`PASS predecessor archives create and deliver to one ${provider} employee on JSON and SQLite`)

    // Every old runtime context has stopped. Remove retired product packages;
    // the profile, its configuration, and all business/native storage are retained.
    if (retiredPackages.length) run(process.execPath, [previousCli, 'plugin', '--profile', 'web', 'remove',
      '--config.offline=true', '--config.auto-install-peers=false', ...retiredPackages], root, environment)
    for (const name of retiredPackages) assert.ok(!existsSync(join(profileDirectory, 'node_modules', name)))
    // This isolated profile owns these old SDK links. Rebind the same pinned
    // products to the new qualified checkout without moving their native history.
    const oldSettings = yaml.load(readFileSync(settingsPath, 'utf8'))
    for (const [name, value] of Object.entries(previousProducts)) {
      assert.equal(oldSettings.overrides[name], value)
      delete oldSettings.overrides[name]
    }
    writeFileSync(settingsPath, yaml.dump(oldSettings, { lineWidth: -1 }))
    install(root, after)
    const newDump = run(process.execPath, [cli, '--profile', 'web', '--dump-config'], root, environment)
    assert.equal(newDump.split(`id: agent-team-${provider}\n`).length - 1, 1)
    assert.ok(newDump.includes(current))
    assert.ok(!newDump.includes(retired))
    for (const backend of ['json', 'sqlite']) {
      const migration = JSON.parse(run(process.execPath, [join(root, 'scripts/migrate-data.mjs'),
        '--sessions', join(stateDirectory(beforePhase, backend), 'sessions'),
        `--${backend}`, join(stateDirectory(beforePhase, backend), backend === 'json' ? 'storage' : 'storage.sqlite'),
        '--target', stateDirectory(afterPhase, backend),
      ]))
      assert.equal(migration.ok, true)
      assert.equal(migration.sourcePreserved, true)
      console.log(`PASS ${provider} ${backend} historical archive data migrates into a complete isolated target`)
    }
    const upgraded = ['json', 'sqlite'].map(backend => probe(afterPhase, backend))
    for (let index = 0; index < initial.length; index += 1) {
      assert.equal(upgraded[index].memberId, initial[index].memberId)
      assert.equal(upgraded[index].nativeRuntimeHandle, initial[index].nativeRuntimeHandle)
      assert.deepEqual(sourceBytes(['json', 'sqlite'][index]), preserved[index])
    }
    console.log('PASS upgraded archives resume original members, revisions and native handles without duplicate native sessions')
    for (const backend of ['json', 'sqlite']) {
      const state = stateDirectory(afterPhase, backend)
      writeFileSync(join(profileDirectory, 'cordis.patch.yml'), yaml.dump([{
        id: 'agent-team-ultra-data', config: {
          sessions: { root: join(state, 'sessions') },
          storage: backend === 'json' ? { backend, root: join(state, 'storage') }
            : { backend, path: join(state, 'storage.sqlite'), journalMode: 'delete' },
        },
      }]))
      const boot = run(process.execPath, [join(root, 'scripts/verify-web-boot.mjs'), join(root, 'scripts/compatible-dsh.mjs')], root, environment)
      console.log(`PASS ${provider} ${backend} migrated Web lifecycle: ${boot.trim()}`)
    }
    writeFileSync(join(profileDirectory, 'cordis.patch.yml'), '[]\n')
    run(process.execPath, [cli, 'plugin', '--profile', 'web', 'remove',
      '--config.offline=true', '--config.auto-install-peers=false', ...after.map(pkg => pkg.name)], root, environment)
    for (const name of [...after.map(pkg => pkg.name), ...retiredPackages]) {
      assert.ok(!existsSync(join(profileDirectory, 'node_modules', name)), `${name} remained installed`)
    }
    const removed = run(process.execPath, [cli, '--profile', 'web', '--dump-config'], root, environment)
    assert.doesNotMatch(removed, /agent-team-ultra|agent-team-codex|agent-team-claude-code/)
    console.log('PASS upgraded Web boots and uninstall removes every overlay package and Loader row')
    console.log(JSON.stringify({ baseline, initial, upgraded, nativeAcceptance }, null, 2))
    passed = true
  } finally {
    if (!passed && process.argv.includes('--keep-failed')) console.error(`Failed archive upgrade retained at ${temporary}`)
    else rmSync(temporary, { recursive: true, force: true })
  }
}
