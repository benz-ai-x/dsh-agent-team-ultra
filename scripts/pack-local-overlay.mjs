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
  join(harness, 'packages', 'experimental', 'tool-agent-team'),
  join(harness, 'packages', 'experimental', 'client-ui-agent-team'),
  join(root, 'packages', 'domain'),
  join(root, 'packages', 'ui'),
  join(root, 'packages', 'profile'),
]
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
console.log(`Archives are available in ${output} for inspection; exact public peers remain source-linked.`)
console.log('Install the six built source packages into a DSH Web profile with:')
console.log([
  'dsh plugin --profile web add',
  ...packageRoots.map(packageRoot => `  ${JSON.stringify(`link:${packageRoot}`)}`),
].join(' \\\n'))
