#!/usr/bin/env node
/** Read-only preflight followed by the exact locked CLI's supported profile entry. */
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { requirePreparedHarness } from './harness-source.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
let source
let assertUltraCompatibility
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
  assertUltraCompatibility(pathToFileURL(join(root, 'packages/domain/package.json')).href)
  assertUltraCompatibility(pathToFileURL(join(root, 'packages/profile/package.json')).href, 'profile')
  if (args.length === 0 || args[0] === 'check') {
    const { packages, roots, ...identity } = JSON.parse(readFileSync(join(root, 'packages/domain/lib/compatibility.json'), 'utf8'))
    console.log(JSON.stringify({ compatible: true, ...identity, packageCount: Object.keys(packages).length }, null, 2))
    process.exit(0)
  }
  const { parseDshArgs } = await import(pathToFileURL(join(source.harnessRoot, 'apps/cli/lib/types/args.js')).href)
  invocation = parseDshArgs(args, source.lock.upstream.version)
  if (invocation.mode !== 'plugin') await checkInstalledProfile()
} catch (error) {
  rejectInstallation(error)
}

const cli = join(source.harnessRoot, 'apps/cli/lib/bin.js')
if (invocation.mode === 'plugin') {
  const result = spawnSync(process.execPath, [cli, ...args], { stdio: 'inherit', env: process.env })
  if (result.status !== 0) process.exit(result.status ?? 1)
  if (invocation.args[0] === 'add') {
    try { await checkInstalledProfile() }
    catch (error) { rejectInstallation(error) }
  }
  process.exit(0)
}
process.argv = [process.execPath, cli, ...args]
await import(pathToFileURL(cli).href)

async function checkInstalledProfile() {
  const profile = invocation.profile
  if (!profile || !/^[a-zA-Z0-9_-]+$/.test(profile)) throw new Error('A valid profile name is required')
  const { resolveDshHome } = await import(pathToFileURL(join(source.harnessRoot, 'packages/util/home-paths/lib/index.js')).href)
  const directory = join(resolveDshHome(), 'profiles', profile)
  if (!existsSync(join(directory, 'package.json'))) throw new Error(`Ultra profile ${profile} is not installed`)
  const require = createRequire(join(directory, 'package.json'))
  assertUltraCompatibility(pathToFileURL(require.resolve('@benz-ai-x/dsh-agent-team-ultra/package.json')).href)
  assertUltraCompatibility(pathToFileURL(require.resolve('@benz-ai-x/dsh-agent-team-ultra-profile/package.json')).href, 'profile')
}

function rejectInstallation(error) {
  console.error(JSON.stringify({
    code: error.code?.startsWith('ULTRA_COMPAT_') ? error.code : 'ULTRA_COMPAT_INSTALLATION_INVALID',
    message: error.message,
  }))
  process.exit(1)
}
