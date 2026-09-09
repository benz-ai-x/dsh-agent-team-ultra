import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { initializeBaselineData } from '../../packages/domain/src/baseline-data.ts'

const project = resolve('.')
const temporary: string[] = []
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }) })
function root() { const path = mkdtempSync(join(tmpdir(), 'ultra-b0-compat-')); temporary.push(path); return path }
function installedPackage(source = join(project, 'packages/domain')) {
  const target = root()
  cpSync(join(source, 'lib'), join(target, 'lib'), { recursive: true })
  cpSync(join(source, 'package.json'), join(target, 'package.json'))
  const modules = join(source, 'node_modules')
  for (const scope of readdirSync(modules).filter(name => !name.startsWith('.'))) {
    const names = scope.startsWith('@') ? readdirSync(join(modules, scope)).map(name => scope + '/' + name) : [scope]
    for (const name of names) {
      const link = join(target, 'node_modules', name)
      mkdirSync(dirname(link), { recursive: true })
      symlinkSync(realpathSync(join(modules, name)), link, 'dir')
    }
  }
  return target
}
function importHost(target: string) {
  return spawnSync(process.execPath, ['--input-type=module', '--eval',
    'try { await import(' + JSON.stringify(pathToFileURL(join(target, 'lib/index.js')).href) + '); console.log("ok") } catch (error) { console.log(error.message); process.exitCode = 1 }',
  ], { encoding: 'utf8', env: { ...process.env, DSH_HOME: join(target, 'business-data') } })
}

describe('installed official B0 compatibility admission', () => {
  it('admits the exact locked Host without opening business data', () => {
    const target = installedPackage()
    const result = importHost(target)
    expect(result.status, result.stdout + result.stderr).toBe(0)
    expect(existsSync(join(target, 'business-data'))).toBe(false)
  })
  it('rejects a missing build proof before linking the Host', () => {
    const target = installedPackage()
    rmSync(join(target, 'lib/compatibility.json'))
    const result = importHost(target)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('ULTRA_COMPAT_PROOF_INVALID')
    expect(existsSync(join(target, 'business-data'))).toBe(false)
  })
  it.each(['@deepseek-ai/dsh-session', '@deepseek-ai/dsh-experimental-agent-team'])('rejects changed same-version executable bytes of %s', name => {
    const target = installedPackage()
    const link = join(target, 'node_modules', name)
    const original = realpathSync(link)
    const altered = join(target, 'altered')
    cpSync(original, altered, { recursive: true, verbatimSymlinks: true, filter: path => !path.includes('/node_modules/') && !path.endsWith('/node_modules') })
    rmSync(link)
    symlinkSync(altered, link, 'dir')
    const manifest = JSON.parse(readFileSync(join(altered, 'package.json'), 'utf8'))
    const entry = join(altered, manifest.main)
    writeFileSync(entry, readFileSync(entry, 'utf8') + '\n// changed executable\n')
    const result = importHost(target)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('ULTRA_COMPAT_ARTIFACT_MISMATCH')
    expect(result.stdout).toContain(name)
    expect(existsSync(join(target, 'business-data'))).toBe(false)
  })
  it('rejects unsupported source selection before creating an installation', () => {
    const target = root()
    const result = spawnSync(process.execPath, [join(project, 'scripts/compatible-dsh.mjs'), 'plugin', '--profile', 'web', 'add', 'unused'], {
      encoding: 'utf8', env: { ...process.env, DSH_HARNESS_ROOT: target, DSH_HOME: join(target, 'home') },
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('ULTRA_COMPAT_SOURCE_MISMATCH')
    expect(existsSync(join(target, 'home'))).toBe(false)
  })
  it.each(['uninitialized', 'malformed', 'future'] as const)('refuses an %s data home before even plugin add can run', mode => {
    const target = root()
    const home = join(target, 'home')
    const record = join(home, 'ultra-b0/storage/agent_team_ultra_b0/profile_heads/reviewer.json')
    const original = mode === 'future' ? '{"version":2,"record":{"profileId":"reviewer"}}' : '{broken'
    if (mode !== 'uninitialized') {
      initializeBaselineData(join(home, 'ultra-b0'))
      mkdirSync(dirname(record), { recursive: true })
      writeFileSync(record, original)
    }
    const result = spawnSync(process.execPath, [join(project, 'scripts/compatible-dsh.mjs'),
      'plugin', '--profile', 'web', 'add', '--config.offline=true', '--config.auto-install-peers=false', 'unused'], {
      encoding: 'utf8', env: { ...process.env, DSH_HOME: home },
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('B0_DATA')
    expect(existsSync(join(home, 'profiles'))).toBe(false)
    if (mode === 'uninitialized') expect(existsSync(home)).toBe(false)
    else expect(readFileSync(record, 'utf8')).toBe(original)
  })
  it('preserves a conflicting local-peer override and manifest byte-for-byte', () => {
    const target = root()
    initializeBaselineData(join(target, 'ultra-b0'))
    const directory = join(target, 'profiles/web')
    mkdirSync(directory, { recursive: true })
    const manifest = JSON.stringify({ name: 'user-profile', private: true, description: 'keep' })
    const settings = "packages: []\n# keep\noverrides:\n  '@deepseek-ai/dsh-brand': 'PRIVATE_OVERRIDE'\n"
    writeFileSync(join(directory, 'package.json'), manifest)
    writeFileSync(join(directory, 'pnpm-workspace.yaml'), settings)
    writeFileSync(join(directory, 'cordis.patch.yml'), '[]\n')
    const peer = realpathSync(join(project, '.dsh/harness/packages/util/brand'))
    const result = spawnSync(process.execPath, [join(project, 'scripts/compatible-dsh.mjs'), '--lock-local-peers', 'plugin', '--profile', 'web', 'add', 'link:' + peer], {
      encoding: 'utf8', env: { ...process.env, DSH_HOME: target },
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('conflicts with the qualified source')
    expect(result.stderr).not.toContain('PRIVATE_OVERRIDE')
    expect(readFileSync(join(directory, 'package.json'), 'utf8')).toBe(manifest)
    expect(readFileSync(join(directory, 'pnpm-workspace.yaml'), 'utf8')).toBe(settings)
    expect(existsSync(join(directory, 'node_modules'))).toBe(false)
  })
})
