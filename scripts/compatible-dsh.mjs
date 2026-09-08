#!/usr/bin/env node
/** Read-only preflight followed by the exact locked CLI's supported profile entry. */
import { existsSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { requirePreparedHarness } from './harness-source.mjs'
import { harnessPackages, qualifiedProductOverrides } from './local-package-closure.mjs'
import yaml from 'js-yaml'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lockLocalPeers = process.argv.includes('--lock-local-peers')
const args = process.argv.slice(2).filter(argument => argument !== '--lock-local-peers')
let source
let assertUltraCompatibility
let assertUltraMigrationReady
let invocation
try {
  source = requirePreparedHarness(root)
} catch (error) {
  console.error(JSON.stringify({ code: 'ULTRA_COMPAT_SOURCE_MISMATCH', message: error.message }))
  process.exit(1)
}

try {
  const compatibility = await import(pathToFileURL(join(root, 'packages/domain/lib/compatibility.js')).href)
  assertUltraCompatibility = compatibility.assertUltraCompatibility
  assertUltraMigrationReady = compatibility.assertUltraMigrationReady
  assertUltraCompatibility(pathToFileURL(join(root, 'packages/domain/package.json')).href)
  assertUltraCompatibility(pathToFileURL(join(root, 'packages/profile/package.json')).href, 'profile')
  if (args.length === 0 || args[0] === 'check') {
    const { packages, roots, ...identity } = JSON.parse(readFileSync(join(root, 'packages/domain/lib/compatibility.json'), 'utf8'))
    console.log(JSON.stringify({ compatible: true, ...identity, packageCount: Object.keys(packages).length }, null, 2))
    process.exit(0)
  }
  const { parseDshArgs } = await import(pathToFileURL(join(source.harnessRoot, 'apps/cli/lib/types/args.js')).href)
  invocation = parseDshArgs(args, source.lock.upstream.version)
  if (lockLocalPeers) {
    if (invocation.mode !== 'plugin' || invocation.args[0] !== 'add') {
      throw new Error('--lock-local-peers is only supported with plugin add')
    }
    await configureLocalPeers()
  }
  if (invocation.mode !== 'plugin') await checkInstalledProfile()
} catch (error) {
  rejectInstallation(error)
}

const cli = join(source.harnessRoot, 'apps/cli/lib/bin.js')
if (invocation.mode === 'plugin') {
  const result = spawnSync(process.execPath, [cli, ...args], { stdio: 'inherit', env: process.env })
  if (result.status !== 0) process.exit(result.status ?? 1)
  if (invocation.args[0] === 'add') {
    try { await checkInstalledProfile(false) }
    catch (error) { rejectInstallation(error) }
  }
  process.exit(0)
}
process.argv = [process.execPath, cli, ...args]
await import(pathToFileURL(cli).href)

/** Explicit installation option: pin nested dependencies as well as top-level links. */
async function configureLocalPeers() {
  const selected = harnessPackages(source.harnessRoot)
  const proof = JSON.parse(readFileSync(join(root, 'packages/domain/lib/compatibility.json'), 'utf8'))
  const overrides = {}
  for (const argument of invocation.args.slice(1).filter(value => value.startsWith('link:'))) {
    const directory = realpathSync(resolve(argument.slice(5)))
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
    const expected = selected.get(manifest.name)
    if (!expected || realpathSync(expected.directory) !== directory
      || proof.packages[manifest.name]?.version !== manifest.version) {
      throw new Error('--lock-local-peers requires every link to belong to the qualified Harness source')
    }
    overrides[manifest.name] = `link:${directory}`
  }
  if (!Object.keys(overrides).length) throw new Error('--lock-local-peers requires qualified link arguments')
  const products = qualifiedProductOverrides(root, source.harnessRoot)
  Object.assign(overrides, products)
  const { initProfile, resolveProfileDir, PROFILE_TEMPLATES, DEFAULT_PROFILE_BUNDLES } = await import(
    pathToFileURL(join(source.harnessRoot, 'packages/boot/app-boot/lib/index.js')).href)
  const directory = resolveProfileDir(invocation.profile)
  const template = PROFILE_TEMPLATES[invocation.profile]
  initProfile(directory, template?.bundles ?? DEFAULT_PROFILE_BUNDLES, template?.patchReload)
  const path = join(directory, 'pnpm-workspace.yaml')
  const manifestPath = join(directory, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const packageManager = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).packageManager
  if (manifest.packageManager !== undefined && manifest.packageManager !== packageManager) {
    throw new Error('Profile package manager conflicts with the qualified toolchain; reconcile it before installation')
  }
  const bytes = readFileSync(path, 'utf8')
  const workspace = yaml.load(bytes)
  if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)
    || (workspace.overrides !== undefined && (!workspace.overrides || typeof workspace.overrides !== 'object'
      || Array.isArray(workspace.overrides)))) throw new Error('Invalid profile pnpm workspace settings')
  for (const [name, value] of Object.entries(overrides)) {
    if (workspace.overrides?.[name] !== undefined && workspace.overrides[name] !== value) {
      throw new Error(`Profile override for ${name} conflicts with the qualified source; reconcile it before installation`)
    }
  }
  // pnpm's hoisted linker needs direct links for transitive link overrides.
  args.push(...Object.values(products))
  if (manifest.packageManager === undefined) {
    const temporaryManifest = `${manifestPath}.ultra-${process.pid}.tmp`
    writeFileSync(temporaryManifest, JSON.stringify({ ...manifest, packageManager }, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    renameSync(temporaryManifest, manifestPath)
  }
  if (Object.entries(overrides).every(([name, value]) => workspace.overrides?.[name] === value)) return
  // Preserve unrelated settings; when there is no override section, preserve comments too.
  const updated = workspace.overrides === undefined
    ? `${bytes.trimEnd()}\n\n${yaml.dump({ overrides }, { lineWidth: -1 })}`
    : yaml.dump({ ...workspace, overrides: { ...workspace.overrides, ...overrides } }, { lineWidth: -1 })
  const temporary = `${path}.ultra-${process.pid}.tmp`
  writeFileSync(temporary, updated, { flag: 'wx', mode: 0o600 })
  renameSync(temporary, path)
}

async function checkInstalledProfile(checkMigration = true) {
  const profile = invocation.profile
  if (!profile || !/^[a-zA-Z0-9_-]+$/.test(profile)) throw new Error('A valid profile name is required')
  const { resolveDshHome } = await import(pathToFileURL(join(source.harnessRoot, 'packages/util/home-paths/lib/index.js')).href)
  if (checkMigration) assertUltraMigrationReady(resolveDshHome())
  const directory = join(resolveDshHome(), 'profiles', profile)
  if (!existsSync(join(directory, 'package.json'))) throw new Error(`Ultra profile ${profile} is not installed`)
  assertUltraCompatibility(pathToFileURL(join(directory, 'package.json')).href, 'profile')
}

function rejectInstallation(error) {
  console.error(JSON.stringify({
    code: /^ULTRA_(COMPAT_|MIGRATION_)/.test(error.code ?? '') ? error.code : 'ULTRA_COMPAT_INSTALLATION_INVALID',
    message: error.message,
  }))
  process.exit(1)
}
