#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requirePreparedHarness } from './harness-source.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { lock, harnessRoot: harness } = requirePreparedHarness(root)
const output = resolve(root, process.argv[2] ?? 'artifacts/agent-team-ultra')
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

const packageRoots = [
  join(harness, 'packages', 'experimental', 'agent-team'),
  join(root, 'packages', 'codex'),
  join(root, 'packages', 'claude-code'),
  join(harness, 'packages', 'experimental', 'tool-agent-team'),
  join(harness, 'packages', 'experimental', 'client-ui-agent-team'),
  join(root, 'packages', 'domain'),
  join(root, 'packages', 'ui'),
  join(root, 'packages', 'profile'),
]
const pinnedPeerRoots = [
  join(harness, 'vendor', 'cordis'),
  join(harness, 'vendor', 'loader'),
  join(harness, 'packages', 'core', 'agent'),
  join(harness, 'packages', 'util', 'brand'),
  join(harness, 'packages', 'runtime-diagnostics', 'invariants'),
  join(harness, 'packages', 'llm', 'llm'),
  join(harness, 'packages', 'sandbox', 'sandbox-policy'),
  join(harness, 'packages', 'core', 'session'),
  join(harness, 'packages', 'session', 'session-persistence'),
  join(harness, 'packages', 'session', 'session-projection'),
  join(harness, 'packages', 'storage', 'storage-domain'),
  join(harness, 'packages', 'subagent', 'subagent'),
  join(harness, 'packages', 'core', 'system-prompt'),
  join(harness, 'packages', 'core', 'tools'),
  join(harness, 'packages', 'typert', 'protocol'),
  join(harness, 'packages', 'interaction', 'user-approval'),
  join(harness, 'packages', 'sdk', 'protocol'),
  join(harness, 'packages', 'subprocess', 'subprocess'),
  join(harness, 'packages', 'util', 'timeout'),
  join(harness, 'packages', 'api', 'gateway'),
  join(harness, 'packages', 'api', 'remotes'),
  join(harness, 'packages', 'api', 'session-controller'),
  join(harness, 'packages', 'client', 'locale'),
  join(harness, 'packages', 'client', 'ui-conversation'),
  join(harness, 'packages', 'client', 'ui-primitives'),
  join(harness, 'packages', 'client', 'ui-renderer'),
  join(harness, 'packages', 'client', 'ui-session'),
  join(harness, 'packages', 'client', 'ui-slots'),
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
console.log('For an existing old Codex installation, stop Web and remove only its retired adapter before installing:')
console.log(`${shellWord(process.execPath)} ${shellWord(cli)} plugin --profile web remove --config.offline=true --config.auto-install-peers=false '@deepseek-ai/dsh-experimental-agent-team-codex'`)
console.log('For an existing old Claude Code installation, stop Web and remove its retired adapter before installing:')
console.log(`${shellWord(process.execPath)} ${shellWord(cli)} plugin --profile web remove --config.offline=true --config.auto-install-peers=false '@deepseek-ai/dsh-experimental-agent-team-claude-code'`)
console.log(`Install the ${archives.length} archives into a DSH Web profile with:`)
console.log([
  `${shellWord(process.execPath)} ${shellWord(checkedCli)} plugin --profile web add`,
  ...archives.map(archive => `  ${shellWord(`file:${archive}`)}`),
  ...pinnedPeerRoots.map(packageRoot => `  ${shellWord(`link:${packageRoot}`)}`),
].join(' \\\n'))
console.log('Remove every overlay package and Loader row with:')
console.log([
  `${shellWord(process.execPath)} ${shellWord(cli)} plugin --profile web remove --config.offline=true --config.auto-install-peers=false`,
  ...packageNames.map(packageName => `  ${shellWord(packageName)}`),
].join(' \\\n'))
