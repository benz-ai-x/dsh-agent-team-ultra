#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { requirePreparedHarness } from './harness-source.mjs'
import { archivePackageRoots, qualifiedHarnessPeerRoots } from './local-package-closure.mjs'
import { assertProfileArchiveClosure } from './profile-archive-closure.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { lock, harnessRoot: harness } = requirePreparedHarness(root)
const temporaryRoot = mkdtempSync(join(tmpdir(), 'dsh-agent-team-ultra-pack-'))
const destination = join(temporaryRoot, 'archives')
const consumer = join(temporaryRoot, 'consumer')
const profileHome = join(temporaryRoot, 'dsh-home')
mkdirSync(destination, { recursive: true })

const packages = [
  {
    directory: 'packages/claude-code',
    required: ['package.json', 'lib/index.js', 'lib/types/index.d.ts', 'lib/types/product.d.ts', 'lib/types/process.d.ts', 'LICENSE'],
  },
  {
    directory: 'packages/codex',
    required: ['package.json', 'lib/index.js', 'lib/types/index.d.ts', 'lib/types/product.d.ts', 'LICENSE'],
  },
  {
    directory: 'packages/domain',
    required: [
      'package.json', 'lib/index.js', 'lib/client.js', 'lib/types/index.d.ts',
      'lib/host.js', 'lib/compatibility.js', 'lib/compatibility.json',
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
    required: ['package.json', 'cordis.patch.yml', 'lib/index.js', 'lib/types/index.d.ts', 'lib/data.js', 'lib/types/data.d.ts'],
  },
]
const archiveRoots = archivePackageRoots(root, harness)
const pinnedHarnessPeers = qualifiedHarnessPeerRoots(root, harness, new Set(archiveRoots
  .map(directory => JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')).name)))
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
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
  if (typeof manifest.name !== 'string') throw new Error(`${packageRoot}: package name is missing`)
  archives.push({ ...manifest, filename })
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
  for (const directory of archiveRoots) {
    const packed = pack(directory)
    const candidate = packages.find(candidate => join(root, candidate.directory) === directory)
    if (!candidate) continue
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
  assertProfileArchiveClosure(root, archives)
  const completeArchiveSet = archives.map(archive => archive.filename)

  mkdirSync(consumer, { recursive: true })
  writeFileSync(join(consumer, 'package.json'), `${JSON.stringify({
    name: 'dsh-agent-team-ultra-pack-smoke',
    private: true,
    type: 'module',
    packageManager: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).packageManager,
  }, null, 2)}\n`)
  writeFileSync(join(consumer, 'pnpm-workspace.yaml'), [
    'packages: []',
    'overrides:',
    `  '@deepseek-ai/schemastery': ${JSON.stringify(`link:${join(harness, 'vendor', 'schemastery')}`)}`,
    `  '@deepseek-ai/dsh-brand': ${JSON.stringify(`link:${join(harness, 'packages', 'util', 'brand')}`)}`,
    `  'zod': ${JSON.stringify(`link:${join(harness, 'packages', 'experimental', 'agent-team', 'node_modules', 'zod')}`)}`,
    `  'react': ${JSON.stringify(`link:${join(harness, 'packages', 'experimental', 'client-ui-agent-team', 'node_modules', 'react')}`)}`,
    `  '@openai/codex': ${JSON.stringify(`link:${join(root, 'packages', 'codex', 'node_modules', '@openai', 'codex')}`)}`,
    `  '@anthropic-ai/claude-agent-sdk': ${JSON.stringify(`link:${join(root, 'packages', 'claude-code', 'node_modules', '@anthropic-ai', 'claude-agent-sdk')}`)}`,
    `  '@anthropic-ai/sdk': ${JSON.stringify(`link:${join(root, 'packages', 'claude-code', 'node_modules', '@anthropic-ai', 'sdk')}`)}`,
    `  '@modelcontextprotocol/sdk': ${JSON.stringify(`link:${join(root, 'packages', 'claude-code', 'node_modules', '@modelcontextprotocol', 'sdk')}`)}`,
    '',
  ].join('\n'))
  checkedRun(
    'pnpm',
    [
      'add',
      '--config.offline=true',
      '--config.auto-install-peers=false',
      ...completeArchiveSet,
      ...pinnedHarnessPeers.map(packageRoot => `link:${packageRoot}`),
    ],
    consumer,
    'complete archive-set install',
  )
  checkedRun(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      "await Promise.all([import('@benz-ai-x/dsh-agent-team-ultra/client'), import('@benz-ai-x/dsh-client-ui-agent-team-ultra'), import('@benz-ai-x/dsh-agent-team-ultra-profile'), import('@benz-ai-x/dsh-agent-team-ultra-profile/data')])",
    ],
    consumer,
    'ordinary-resolution public import',
  )
  checkedRun(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      "await Promise.all([import('@benz-ai-x/dsh-agent-team-codex'), import('@benz-ai-x/dsh-agent-team-claude-code')])",
    ],
    consumer,
    'packed runtime-family public imports',
  )
  console.log(`PASS complete archive set: ${completeArchiveSet.length} archive(s), including Codex and Claude Code, install and resolve`)
  console.log('PASS archive identities match the actual profile and local package dependency closure')
  const consumerModules = join(consumer, 'node_modules')
  const packedMessageProbe = checkedRun(
    process.execPath,
    [
      join(root, 'scripts', 'probe-packed-message-center.mjs'),
      join(consumerModules, '@benz-ai-x', 'dsh-client-ui-agent-team-ultra', 'lib', 'client.js'),
      join(consumerModules, '@deepseek-ai', 'dsh-experimental-client-ui-agent-team', 'lib', 'client.js'),
      join(consumerModules, '@deepseek-ai', 'dsh-experimental-agent-team'),
      harness,
    ],
    root,
    'packed Team message-center generated-Remote integration',
  )
  process.stdout.write(packedMessageProbe.stdout)

  const cli = join(harness, 'apps', 'cli', 'lib', 'bin.js')
  const checkedCli = join(root, 'scripts', 'compatible-dsh.mjs')
  checkedRun(
    process.execPath,
    [
      checkedCli,
      '--lock-local-peers',
      'plugin',
      '--profile',
      'web',
      'add',
      ...completeArchiveSet.map(filename => `file:${filename}`),
      ...pinnedHarnessPeers.map(packageRoot => `link:${packageRoot}`),
    ],
    root,
    'real packed-artifact dsh profile install',
    { DSH_HOME: profileHome },
  )
  const installed = join(profileHome, 'profiles', 'web', 'node_modules')
  const packageManager = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).packageManager
  const installedManager = checkedRun('pnpm', ['--version'], dirname(installed), 'profile package manager identity').stdout.trim()
  if (`pnpm@${installedManager}` !== packageManager) throw new Error('real profile CLI used a different package manager')
  const installedHostEntries = [
    '@benz-ai-x/dsh-agent-team-ultra',
    '@deepseek-ai/dsh-experimental-agent-team',
    '@benz-ai-x/dsh-agent-team-codex',
    '@benz-ai-x/dsh-agent-team-claude-code',
    '@deepseek-ai/dsh-experimental-tool-agent-team',
  ].map(packageName => pathToFileURL(join(installed, ...packageName.split('/'), 'lib', 'index.js')).href)
  checkedRun(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `const modules = await Promise.all(${JSON.stringify(installedHostEntries)}.map(specifier => import(specifier))); const names = [...(modules[0].ULTRA_PROFILE_TOOL_NAMES ?? [])].sort(); if (JSON.stringify(names) !== JSON.stringify(['ultra_profile_detail', 'ultra_profile_launch', 'ultra_profile_list'])) throw new Error('packed Host is missing the fixed Ultra Profile tool names')`,
    ],
    root,
    'packed Host imports and Profile tool surface',
  )
  const dump = checkedRun(
    process.execPath,
    [cli, '--profile', 'web', '--dump-config'],
    root,
    'real dsh profile composition',
    { DSH_HOME: profileHome },
  ).stdout
  for (const expected of [
    '# == @benz-ai-x/dsh-agent-team-ultra-profile',
    'id: agent-team-codex',
    "name: '@benz-ai-x/dsh-agent-team-codex'",
    'id: agent-team-claude-code',
    "name: '@benz-ai-x/dsh-agent-team-claude-code'",
    'id: agent-team-ultra',
    "name: '@benz-ai-x/dsh-agent-team-ultra'",
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
  const webBoot = checkedRun(
    process.execPath,
    [join(root, 'scripts', 'verify-web-boot.mjs'), checkedCli],
    root,
    'real dsh Web startup',
    { DSH_HOME: profileHome },
  )
  process.stdout.write(webBoot.stdout)
  console.log('PASS real packed DSH Web profile retains the fixed Profile tool surface, composes both runtime families, and listens')
  for (const backend of ['json', 'sqlite']) {
    for (const phase of ['query-new', 'query-resume']) {
      const result = checkedRun(process.execPath, [
        join(root, 'scripts', 'probe-codex-continuity.mjs'), join(profileHome, 'profiles', 'web'), phase,
        join(temporaryRoot, `codex-queries-${backend}`), backend,
      ], root, `installed Codex member operations (${backend}, ${phase})`, { DSH_HOME: profileHome })
      process.stdout.write(result.stdout)
    }
  }
  console.log('PASS installed Codex queries, task receipts, wait and exact member recovery with JSON and SQLite')
  for (const backend of ['json', 'sqlite']) {
    for (const phase of ['query-new', 'query-resume']) {
      const result = checkedRun(process.execPath, [
        join(root, 'scripts', 'probe-claude-continuity.mjs'), join(profileHome, 'profiles', 'web'), phase,
        join(temporaryRoot, `claude-queries-${backend}`), backend,
      ], root, `installed Claude member operations (${backend}, ${phase})`, { DSH_HOME: profileHome })
      process.stdout.write(result.stdout)
    }
  }
  console.log('PASS installed Claude SDK MCP queries, messages, task receipts, wait, final receipts and member recovery with JSON and SQLite')
  checkedRun(
    process.execPath,
    [
      cli,
      'plugin',
      '--profile',
      'web',
      'remove',
      '--config.offline=true',
      '--config.auto-install-peers=false',
      ...archives.map(archive => archive.name),
    ],
    root,
    'real packed-artifact dsh profile uninstall',
    { DSH_HOME: profileHome },
  )
  const removedDump = checkedRun(
    process.execPath,
    [cli, '--profile', 'web', '--dump-config'],
    root,
    'real dsh profile composition after uninstall',
    { DSH_HOME: profileHome },
  ).stdout
  for (const forbidden of [
    'agent-team-ultra',
    'agent-team-codex',
    'agent-team-claude-code',
  ]) {
    if (removedDump.includes(forbidden)) {
      throw new Error(`real dsh profile dump retained ${JSON.stringify(forbidden)} after uninstall`)
    }
  }
  for (const packageName of archives.map(archive => archive.name)) {
    const packageDirectory = join(profileHome, 'profiles', 'web', 'node_modules', ...packageName.split('/'))
    if (existsSync(packageDirectory)) throw new Error(`${packageName} remained installed after uninstall`)
  }
  console.log('PASS uninstall removes every Ultra, Codex, and Claude Code Loader row and package')
  console.log('packed artifact check passed')
} catch (error) {
  console.error(`packed artifact check failed: ${String(error)}`)
  process.exitCode = 1
} finally {
  if (process.exitCode && process.argv.includes('--keep-failed')) {
    console.error(`Failed installation retained for diagnosis at ${temporaryRoot}`)
  } else {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}
