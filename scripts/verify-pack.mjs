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
  join(harness, 'packages', 'experimental', 'agent-team-codex'),
  join(harness, 'packages', 'experimental', 'agent-team-claude-code'),
  join(harness, 'packages', 'experimental', 'tool-agent-team'),
  join(harness, 'packages', 'experimental', 'client-ui-agent-team'),
]
const pinnedHarnessPeers = [
  join(harness, 'vendor', 'cordis'),
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
  archives.push({ filename, name: manifest.name })
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
  const ultraArchives = archives.map(archive => archive.filename)
  for (const packageRoot of privateClosure) pack(packageRoot)
  const completeArchiveSet = archives.map(archive => archive.filename)

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
    `  '@deepseek-ai/dsh-brand': ${JSON.stringify(`link:${join(harness, 'packages', 'util', 'brand')}`)}`,
    `  'zod': ${JSON.stringify(`link:${join(harness, 'packages', 'experimental', 'agent-team', 'node_modules', 'zod')}`)}`,
    `  'react': ${JSON.stringify(`link:${join(harness, 'packages', 'experimental', 'client-ui-agent-team', 'node_modules', 'react')}`)}`,
    `  '@openai/codex': ${JSON.stringify(`link:${join(harness, 'packages', 'experimental', 'agent-team-codex', 'node_modules', '@openai', 'codex')}`)}`,
    `  '@anthropic-ai/claude-agent-sdk': ${JSON.stringify(`link:${join(harness, 'packages', 'experimental', 'agent-team-claude-code', 'node_modules', '@anthropic-ai', 'claude-agent-sdk')}`)}`,
    `  '@anthropic-ai/sdk': ${JSON.stringify(`link:${join(harness, 'packages', 'experimental', 'agent-team-claude-code', 'node_modules', '@anthropic-ai', 'sdk')}`)}`,
    `  '@modelcontextprotocol/sdk': ${JSON.stringify(`link:${join(harness, 'packages', 'experimental', 'agent-team-claude-code', 'node_modules', '@modelcontextprotocol', 'sdk')}`)}`,
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
      "await Promise.all([import('@benz-ai-x/dsh-agent-team-ultra/client'), import('@benz-ai-x/dsh-client-ui-agent-team-ultra'), import('@benz-ai-x/dsh-agent-team-ultra-profile')])",
    ],
    consumer,
    'ordinary-resolution public import',
  )
  checkedRun(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      "await Promise.all([import('@deepseek-ai/dsh-experimental-agent-team-codex'), import('@deepseek-ai/dsh-experimental-agent-team-claude-code')])",
    ],
    consumer,
    'packed runtime-family public imports',
  )
  console.log(`PASS complete archive set: ${completeArchiveSet.length} archive(s), including Codex and Claude Code, install and resolve`)
  console.log(`PASS private archive content: ${archives.length - ultraArchives.length} local-only archive(s) packed`)

  const cli = join(harness, 'apps', 'cli', 'lib', 'bin.js')
  checkedRun(
    process.execPath,
    [
      cli,
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
  const installedHostEntries = [
    '@benz-ai-x/dsh-agent-team-ultra',
    '@deepseek-ai/dsh-experimental-agent-team',
    '@deepseek-ai/dsh-experimental-agent-team-codex',
    '@deepseek-ai/dsh-experimental-agent-team-claude-code',
    '@deepseek-ai/dsh-experimental-tool-agent-team',
  ].map(packageName => pathToFileURL(join(installed, ...packageName.split('/'), 'lib', 'index.js')).href)
  checkedRun(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `await Promise.all(${JSON.stringify(installedHostEntries)}.map(specifier => import(specifier)))`,
    ],
    root,
    'packed Host imports',
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
    "name: '@deepseek-ai/dsh-experimental-agent-team-codex'",
    'id: agent-team-claude-code',
    "name: '@deepseek-ai/dsh-experimental-agent-team-claude-code'",
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
  checkedRun(
    process.execPath,
    [join(root, 'scripts', 'verify-web-boot.mjs'), cli],
    root,
    'real dsh Web startup',
    { DSH_HOME: profileHome },
  )
  console.log('PASS real packed DSH Web profile resolves Host packages, composes both runtime families, and listens')
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
  for (const packageName of [
    '@benz-ai-x/dsh-agent-team-ultra',
    '@benz-ai-x/dsh-client-ui-agent-team-ultra',
    '@benz-ai-x/dsh-agent-team-ultra-profile',
    '@deepseek-ai/dsh-experimental-agent-team-codex',
    '@deepseek-ai/dsh-experimental-agent-team-claude-code',
  ]) {
    const packageDirectory = join(profileHome, 'profiles', 'web', 'node_modules', ...packageName.split('/'))
    if (existsSync(packageDirectory)) throw new Error(`${packageName} remained installed after uninstall`)
  }
  console.log('PASS uninstall removes every Ultra, Codex, and Claude Code Loader row and package')
  console.log('packed artifact check passed')
} catch (error) {
  console.error(`packed artifact check failed: ${String(error)}`)
  process.exitCode = 1
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
