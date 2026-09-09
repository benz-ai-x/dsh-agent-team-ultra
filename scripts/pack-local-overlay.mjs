#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requirePreparedHarness } from './harness-source.mjs'
import { archivePackageRoots, qualifiedHarnessPeerRoots } from './local-package-closure.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { lock, harnessRoot: harness } = requirePreparedHarness(root)
const output = resolve(root, process.argv[2] ?? 'artifacts/agent-team-ultra-b0')
const cli = join(harness, 'apps', 'cli', 'lib', 'bin.js')
const checkedCli = join(root, 'scripts/compatible-dsh.mjs')

if (!existsSync(join(harness, 'package.json'))) {
  throw new Error(`pack-local-overlay: pinned Harness source not found at ${harness}`)
}
if (!existsSync(cli)) throw new Error(`pack-local-overlay: selected Harness CLI is not built at ${cli}`)
mkdirSync(output, { recursive: true })

function shellWord(value) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

const packageRoots = archivePackageRoots(root, harness)
const packageNames = packageRoots.map(packageRoot => {
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
  if (typeof manifest.name !== 'string') throw new Error(`${packageRoot}: package name is missing`)
  return manifest.name
})
const pinnedPeerRoots = qualifiedHarnessPeerRoots(root, harness, new Set(packageNames))
const archives = []

for (const packageRoot of packageRoots) {
  const result = spawnSync('pnpm', ['pack', '--json', '--pack-destination', output], {
    cwd: packageRoot,
    encoding: 'utf8',
    env: { ...process.env, npm_config_ignore_scripts: 'true' },
  })
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `pack failed for ${packageRoot}`)
  }
  const start = result.stdout.indexOf('{')
  const end = result.stdout.lastIndexOf('}')
  const packed = JSON.parse(result.stdout.slice(start, end + 1))
  if (typeof packed.filename !== 'string' || !existsSync(packed.filename)) {
    throw new Error(`pack-local-overlay: pnpm did not create the reported archive for ${packageRoot}`)
  }
  archives.push(resolve(packed.filename))
}

console.log(`Packed ${archives.length} local-only archives against Harness ${lock.upstream.version}.`)
console.log(`Archives are available in ${output}; exact unpublished peers resolve from the pinned Harness checkout.`)
console.log('Use a new isolated DSH_HOME and initialize its ultra-b0 data root first. Historical installations are not upgraded in place.')
console.log(`Install the ${archives.length} archives into a DSH Web profile with:`)
console.log([
  `${shellWord(process.execPath)} ${shellWord(checkedCli)} --lock-local-peers plugin --profile web add`,
  ...archives.map(archive => `  ${shellWord(`file:${archive}`)}`),
  ...pinnedPeerRoots.map(packageRoot => `  ${shellWord(`link:${packageRoot}`)}`),
].join(' \\\n'))
console.log('Remove every overlay package and Loader row with:')
console.log([
  `${shellWord(process.execPath)} ${shellWord(cli)} plugin --profile web remove --config.offline=true --config.auto-install-peers=false`,
  ...packageNames.map(packageName => `  ${shellWord(packageName)}`),
].join(' \\\n'))
