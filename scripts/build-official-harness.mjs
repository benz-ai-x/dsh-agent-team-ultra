#!/usr/bin/env node
/** Build a clean locked source with a native TS config loader, without patching upstream. */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireLockedHarness } from './harness-source.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { harnessRoot } = requireLockedHarness(root)
const buildNode = process.env.DSH_BUILD_NODE ?? process.execPath
const version = spawnSync(buildNode, ['--version'], { encoding: 'utf8' })
const parts = /^v(\d+)\.(\d+)\.(\d+)/u.exec(version.stdout ?? '')
if (!parts || Number(parts[1]) < 24 || (Number(parts[1]) === 24 && (Number(parts[2]) < 11 || (Number(parts[2]) === 11 && Number(parts[3]) < 1)))) {
  throw new Error('Set DSH_BUILD_NODE to Node >=24.11.1 for the official native tsdown config loader. Runtime may stay on Node 22.')
}
function run(args) {
  const result = spawnSync(buildNode, args, { cwd: harnessRoot, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
const native = spawnSync('pnpm', ['run', 'build:native-system'], { cwd: harnessRoot, stdio: 'inherit' })
if (native.status !== 0) process.exit(native.status ?? 1)
for (const face of ['host', 'client']) {
  run(['--max-old-space-size=4096', 'node_modules/typescript/bin/tsc', '-b', 'tsconfig.' + face + '.json'])
  run(['node_modules/tsdown/dist/run.mjs', '--env.DSH_BUILD_FACE', face, '--config-loader', 'native', '--logLevel', 'warn'])
}
const web = spawnSync('pnpm', ['run', 'build:web'], { cwd: harnessRoot, stdio: 'inherit' })
if (web.status !== 0) process.exit(web.status ?? 1)
requireLockedHarness(root)
console.log('Built the fixed official native component, Host/Client libraries and Web assets; source identity remains clean.')
