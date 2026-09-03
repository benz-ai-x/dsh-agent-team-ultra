#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lock = JSON.parse(readFileSync(join(root, 'dsh-reference.lock.json'), 'utf8'))
const harness = resolve(process.env.DSH_HARNESS_ROOT
  ?? join(root, lock.localResolution?.fallbackRelativePath ?? '../deepseek-harness'))
const output = resolve(process.argv[2] ?? join(root, 'artifacts', 'agent-team-ultra'))

if (!existsSync(join(harness, 'package.json'))) {
  throw new Error(`pack-local-overlay: pinned Harness source not found at ${harness}`)
}
mkdirSync(output, { recursive: true })

const packageRoots = [
  join(harness, 'packages', 'experimental', 'agent-team'),
  join(harness, 'packages', 'experimental', 'agent-team-codex'),
  join(harness, 'packages', 'experimental', 'agent-team-claude-code'),
  join(harness, 'packages', 'experimental', 'tool-agent-team'),
  join(harness, 'packages', 'experimental', 'client-ui-agent-team'),
  join(root, 'packages', 'domain'),
  join(root, 'packages', 'ui'),
  join(root, 'packages', 'profile'),
]
const pinnedPeerRoots = [
  join(harness, 'vendor', 'cordis'),
  join(harness, 'packages', 'core', 'agent'),
  join(harness, 'packages', 'util', 'brand'),
  join(harness, 'packages', 'llm', 'llm'),
  join(harness, 'packages', 'sandbox', 'sandbox-policy'),
  join(harness, 'packages', 'core', 'session'),
  join(harness, 'packages', 'storage', 'storage-domain'),
  join(harness, 'packages', 'subagent', 'subagent'),
  join(harness, 'packages', 'core', 'system-prompt'),
  join(harness, 'packages', 'core', 'tools'),
  join(harness, 'packages', 'typert', 'protocol'),
  join(harness, 'packages', 'interaction', 'user-approval'),
  join(harness, 'packages', 'sdk', 'protocol'),
  join(harness, 'packages', 'subprocess', 'subprocess'),
  join(harness, 'packages', 'util', 'timeout'),
]
const packageNames = packageRoots.map(packageRoot => {
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
  if (typeof manifest.name !== 'string') throw new Error(`${packageRoot}: package name is missing`)
  return manifest.name
})
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
console.log(`Install the ${archives.length} archives into a DSH Web profile with:`)
console.log([
  'dsh plugin --profile web add',
  ...archives.map(archive => `  ${JSON.stringify(`file:${archive}`)}`),
  ...pinnedPeerRoots.map(packageRoot => `  ${JSON.stringify(`link:${packageRoot}`)}`),
].join(' \\\n'))
console.log('Remove every overlay package and Loader row with:')
console.log([
  'dsh plugin --profile web remove --config.offline=true --config.auto-install-peers=false',
  ...packageNames.map(packageName => `  ${JSON.stringify(packageName)}`),
].join(' \\\n'))
