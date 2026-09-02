#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lock = JSON.parse(readFileSync(join(root, 'dsh-reference.lock.json'), 'utf8'))
const harness = resolve(process.env.DSH_HARNESS_ROOT
  ?? join(root, lock.localResolution?.fallbackRelativePath ?? '../deepseek-harness'))
const temporaryRoot = mkdtempSync(join(tmpdir(), 'dsh-agent-team-ultra-pack-'))
const destination = join(temporaryRoot, 'archives')
const consumer = join(temporaryRoot, 'consumer')
const profileHome = join(temporaryRoot, 'dsh-home')
mkdirSync(destination, { recursive: true })

const packages = [
  {
    directory: 'packages/domain',
    required: [
      'package.json', 'lib/index.js', 'lib/client.js', 'lib/types/index.d.ts',
      'lib/typert.host.js', 'lib/typert.host.d.ts',
      'lib/typert.remote-client.js', 'lib/typert.remote-client.d.ts',
    ],
  },
  {
    directory: 'packages/ui',
    required: ['package.json', 'lib/index.js', 'lib/client.js', 'lib/types/client/index.d.ts'],
  },
  {
    directory: 'packages/profile',
    required: ['package.json', 'cordis.patch.yml', 'lib/index.js', 'lib/types/index.d.ts'],
  },
]
const privateClosure = [
  join(harness, 'packages', 'experimental', 'agent-team'),
  join(harness, 'packages', 'experimental', 'tool-agent-team'),
  join(harness, 'packages', 'experimental', 'client-ui-agent-team'),
]
const archives = []

function pack(packageRoot) {
  const result = spawnSync('pnpm', ['pack', '--json', '--pack-destination', destination], {
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
  const filename = typeof packed.filename === 'string' ? resolve(packed.filename) : undefined
  if (filename === undefined || !existsSync(filename)) {
    throw new Error(`${packageRoot}: pnpm did not create the reported archive`)
  }
  archives.push(filename)
  return packed
}

function checkedRun(command, args, cwd, label, env = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, npm_config_ignore_scripts: 'true', ...env },
  })
  if (result.status !== 0) {
    throw new Error(`${label} failed:\n${result.stdout.trim()}\n${result.stderr.trim()}`)
  }
  return result
}

try {
  if (!existsSync(join(harness, 'package.json'))) {
    throw new Error(`pinned Harness source not found at ${harness}`)
  }
  for (const candidate of packages) {
    const packed = pack(join(root, candidate.directory))
    const files = new Set((packed.files ?? []).map(file => file.path))
    const missing = candidate.required.filter(file => !files.has(file))
    const leaked = [...files].filter(file =>
      file.startsWith('src/')
      || file.startsWith('tests/')
      || file.endsWith('.map')
      || file.endsWith('.tsbuildinfo'))
    if (missing.length > 0) throw new Error(`${candidate.directory} missing packed files: ${missing.join(', ')}`)
    if (leaked.length > 0) throw new Error(`${candidate.directory} leaks development files: ${leaked.join(', ')}`)
    console.log(`PASS ${candidate.directory}: ${files.size} packed file(s)`)
  }
  const ultraArchives = [...archives]
  for (const packageRoot of privateClosure) pack(packageRoot)

  mkdirSync(consumer, { recursive: true })
  writeFileSync(join(consumer, 'package.json'), `${JSON.stringify({
    name: 'dsh-agent-team-ultra-pack-smoke',
    private: true,
    type: 'module',
  }, null, 2)}\n`)
  writeFileSync(join(consumer, 'pnpm-workspace.yaml'), [
    'packages: []',
    'overrides:',
    `  '@deepseek-ai/schemastery': ${JSON.stringify(`link:${join(harness, 'vendor', 'schemastery')}`)}`,
    '',
  ].join('\n'))
  checkedRun(
    'pnpm',
    ['add', '--offline', '--config.auto-install-peers=false', ...ultraArchives],
    consumer,
    'Ultra archive-set install',
  )
  checkedRun(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      "await Promise.all([import('@deepseek-ai/dsh-agent-team-ultra/client'), import('@deepseek-ai/dsh-client-ui-agent-team-ultra'), import('@deepseek-ai/dsh-agent-team-ultra-profile')])",
    ],
    consumer,
    'ordinary-resolution public import',
  )
  console.log(`PASS Ultra archive set: ${ultraArchives.length} archive(s) install and browser-safe imports resolve`)
  console.log(`PASS private archive content: ${archives.length - ultraArchives.length} local-only archive(s) packed`)

  const cli = join(harness, 'apps', 'cli', 'lib', 'bin.js')
  const sourceRoots = [
    ...privateClosure,
    join(root, 'packages', 'domain'),
    join(root, 'packages', 'ui'),
    join(root, 'packages', 'profile'),
  ]
  checkedRun(
    process.execPath,
    [cli, 'plugin', '--profile', 'web', 'add', ...sourceRoots.map(packageRoot => `link:${packageRoot}`)],
    root,
    'real source-linked dsh profile install',
    { DSH_HOME: profileHome },
  )
  const installed = join(profileHome, 'profiles', 'web', 'node_modules', '@deepseek-ai')
  checkedRun(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `await Promise.all(${JSON.stringify([
        pathToFileURL(join(installed, 'dsh-agent-team-ultra', 'lib', 'index.js')).href,
        pathToFileURL(join(installed, 'dsh-experimental-agent-team', 'lib', 'index.js')).href,
        pathToFileURL(join(installed, 'dsh-experimental-tool-agent-team', 'lib', 'index.js')).href,
      ])}.map(specifier => import(specifier)))`,
    ],
    root,
    'source-linked Host imports',
  )
  const dump = checkedRun(
    process.execPath,
    [cli, '--profile', 'web', '--dump-config'],
    root,
    'real dsh profile composition',
    { DSH_HOME: profileHome },
  ).stdout
  for (const expected of [
    '# == @deepseek-ai/dsh-agent-team-ultra-profile',
    'id: agent-team-ultra',
    "name: '@deepseek-ai/dsh-agent-team-ultra'",
    'id: ui-agent-team-ultra',
    'maxProfiles: 64',
  ]) {
    if (!dump.includes(expected)) throw new Error(`real dsh profile dump is missing ${JSON.stringify(expected)}`)
  }
  const help = checkedRun(
    process.execPath,
    [cli, 'web', '--help'],
    root,
    'real dsh Web application resolution',
    { DSH_HOME: profileHome },
  ).stdout
  if (!help.includes('Serve the DeepSeek Harness browser UI.')) {
    throw new Error('real dsh Web help did not reach the composed application')
  }
  checkedRun(
    process.execPath,
    [join(root, 'scripts', 'verify-web-boot.mjs'), cli],
    root,
    'real dsh Web startup',
    { DSH_HOME: profileHome },
  )
  console.log('PASS real source-linked DSH Web profile resolves Host packages, composes Ultra, and listens')
  console.log('packed artifact check passed')
} catch (error) {
  console.error(`packed artifact check failed: ${String(error)}`)
  process.exitCode = 1
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
