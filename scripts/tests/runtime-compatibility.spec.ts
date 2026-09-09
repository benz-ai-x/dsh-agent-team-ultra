import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const domain = join(project, 'packages/domain')
const temporary: string[] = []

afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true })
})

function installedPackage(source = domain) {
  const root = mkdtempSync(join(tmpdir(), 'ultra-runtime-compatibility-'))
  temporary.push(root)
  cpSync(join(source, 'lib'), join(root, 'lib'), { recursive: true })
  cpSync(join(source, 'package.json'), join(root, 'package.json'))
  const modules = join(source, 'node_modules')
  for (const scope of readdirSync(modules).filter(name => !name.startsWith('.'))) {
    const names = scope.startsWith('@') ? readdirSync(join(modules, scope)).map(name => `${scope}/${name}`) : [scope]
    for (const name of names) {
      const target = join(root, 'node_modules', name)
      mkdirSync(dirname(target), { recursive: true })
      symlinkSync(realpathSync(join(modules, name)), target, 'dir')
    }
  }
  return root
}

function importHost(root: string, environment: Record<string, string> = {}) {
  return spawnSync(process.execPath, ['--input-type=module', '--eval', `
    try {
      await import(${JSON.stringify(pathToFileURL(join(root, 'lib/index.js')).href)})
      console.log(JSON.stringify({ ok: true }))
    } catch (error) {
      console.log(JSON.stringify({ code: error.code, message: error.message }))
      process.exitCode = 1
    }
  `], { cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, ...environment, DSH_HOME: join(root, 'business-data') } })
}

function installedProfile() {
  const profile = installedPackage(join(project, 'packages/profile'))
  const home = mkdtempSync(join(tmpdir(), 'ultra-loader-profile-'))
  temporary.push(home)
  const directory = join(home, 'profiles/web')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: 'isolated-web', private: true, type: 'module' }))
  cpSync(join(profile, 'node_modules'), join(directory, 'node_modules'), { recursive: true, verbatimSymlinks: true })
  symlinkSync(profile, join(directory, 'node_modules/@benz-ai-x/dsh-agent-team-ultra-profile'), 'dir')
  return { profile, home, directory }
}

function loadProfile(directory: string, includeData = false) {
  return spawnSync(process.execPath, ['--expose-internals', '--input-type=module', '--eval', `
    import { createRequire } from 'node:module'
    import { pathToFileURL } from 'node:url'
    const require = createRequire(${JSON.stringify(join(domain, 'package.json'))})
    const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href)
    const { default: Loader } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis-plugin-loader')).href)
    const ctx = new Context()
    if (${includeData}) {
      const { default: Storage } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-storage')).href)
      await ctx.plugin(Storage)
    }
    await ctx.plugin(Loader, { baseUrl: ${JSON.stringify(pathToFileURL(`${directory}/`).href)} })
    try {
      const entries = [{
        id: 'agent-team-ultra-compatibility', name: '@benz-ai-x/dsh-agent-team-ultra-profile', group: true,
        config: [{ id: 'agent-team', name: '@deepseek-ai/dsh-experimental-agent-team' }],
      }]
      if (${includeData}) entries.unshift({
        id: 'agent-team-ultra-data', name: '@benz-ai-x/dsh-agent-team-ultra-profile/data',
        config: {
          sessions: { root: ${JSON.stringify(join(directory, 'business-data/sessions'))} },
          storage: { backend: 'sqlite', path: ${JSON.stringify(join(directory, 'business-data/storage.sqlite'))} },
        },
      })
      await ctx.loader.root.update(entries)
      await ctx.loader.await()
      console.log(JSON.stringify({ ok: true }))
    } catch (error) {
      console.log(JSON.stringify({ code: error.code, message: error.message,
        ...(error instanceof AggregateError ? { errors: error.errors.map(cause => cause.message) } : {}),
      }))
      process.exitCode = 1
    } finally { await ctx.fiber.dispose() }
  `], { cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, DSH_HOME: join(directory, 'business-data') }, timeout: 15000 })
}

describe('installed Ultra compatibility admission', () => {
  it('rejects an unsupported source before the install command initializes a DSH home', () => {
    const root = mkdtempSync(join(tmpdir(), 'ultra-install-preflight-'))
    temporary.push(root)
    const result = spawnSync(process.execPath, [
      join(project, 'scripts/compatible-dsh.mjs'), 'plugin', '--profile', 'web', 'add', 'unreachable-package',
    ], {
      cwd: tmpdir(), encoding: 'utf8',
      env: { ...process.env, DSH_HARNESS_ROOT: root, DSH_HOME: join(root, 'business-data') },
    })
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stderr)).toMatchObject({ code: 'ULTRA_COMPAT_SOURCE_MISMATCH' })
    expect(existsSync(join(root, 'business-data'))).toBe(false)
  })

  it('admits the complete locked Host without writing business data', () => {
    const root = installedPackage()
    const result = importHost(root)
    expect(result.status, result.stderr + result.stdout).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ ok: true })
    expect(existsSync(join(root, 'business-data'))).toBe(false)
  })

  it('refuses an unqualified explicit peer link before initializing its profile', () => {
    const root = mkdtempSync(join(tmpdir(), 'ultra-peer-link-admission-'))
    temporary.push(root)
    const peer = join(root, 'peer')
    mkdirSync(peer)
    writeFileSync(join(peer, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-brand', version: '0.1.3-alpha.1' }))
    const result = spawnSync(process.execPath, [
      join(project, 'scripts/compatible-dsh.mjs'), '--lock-local-peers', 'plugin', '--profile', 'web', 'add', `link:${peer}`,
    ], { cwd: project, encoding: 'utf8', env: { ...process.env, DSH_HOME: join(root, 'business-data') } })
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stderr)).toMatchObject({ code: 'ULTRA_COMPAT_INSTALLATION_INVALID' })
    expect(existsSync(join(root, 'business-data'))).toBe(false)
  })

  it('preserves a conflicting user override and profile manifest instead of silently replacing them', () => {
    const root = mkdtempSync(join(tmpdir(), 'ultra-peer-override-conflict-'))
    temporary.push(root)
    const directory = join(root, 'profiles/web')
    mkdirSync(directory, { recursive: true })
    const manifest = JSON.stringify({ name: 'user-profile', private: true, description: 'Retain this setting.' }) + '\n'
    const settings = "packages: []\n# Retain this comment.\noverrides:\n  '@deepseek-ai/dsh-brand': 'PRIVATE_CUSTOM_OVERRIDE'\n"
    writeFileSync(join(directory, 'package.json'), manifest)
    writeFileSync(join(directory, 'pnpm-workspace.yaml'), settings)
    writeFileSync(join(directory, 'cordis.patch.yml'), '[]\n')
    const peer = realpathSync(join(project, '.dsh/harness/packages/util/brand'))
    const result = spawnSync(process.execPath, [
      join(project, 'scripts/compatible-dsh.mjs'), '--lock-local-peers', 'plugin', '--profile', 'web', 'add', `link:${peer}`,
    ], { cwd: project, encoding: 'utf8', env: { ...process.env, DSH_HOME: root } })
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stderr)).toMatchObject({ code: 'ULTRA_COMPAT_INSTALLATION_INVALID' })
    expect(result.stderr).not.toContain('PRIVATE_CUSTOM_OVERRIDE')
    expect(readFileSync(join(directory, 'package.json'), 'utf8')).toBe(manifest)
    expect(readFileSync(join(directory, 'pnpm-workspace.yaml'), 'utf8')).toBe(settings)
    expect(existsSync(join(directory, 'node_modules'))).toBe(false)
  })

  it('reports a missing compatibility proof before importing the Host implementation', () => {
    const root = installedPackage()
    rmSync(join(root, 'lib/compatibility.json'))
    const result = importHost(root)
    expect(result.status, result.stderr).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ code: 'ULTRA_COMPAT_PROOF_INVALID' })
    expect(existsSync(join(root, 'business-data'))).toBe(false)
  })

  it('rejects a same-version Team with missing extensions before importing it or opening business data', () => {
    const root = installedPackage()
    const team = join(root, 'node_modules/@deepseek-ai/dsh-experimental-agent-team')
    const version = JSON.parse(readFileSync(join(team, 'package.json'), 'utf8')).version
    rmSync(team)
    mkdirSync(team)
    writeFileSync(join(team, 'package.json'), JSON.stringify({
      name: '@deepseek-ai/dsh-experimental-agent-team', version, type: 'module', main: 'index.js',
    }))
    writeFileSync(join(team, 'index.js'), `
      import { mkdirSync } from 'node:fs'
      mkdirSync(process.env.DSH_HOME, { recursive: true })
      throw new Error('unsupported Team executed')
    `)

    const result = importHost(root)
    expect(result.status, result.stderr).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ code: 'ULTRA_COMPAT_ARTIFACT_MISMATCH' })
    expect(existsSync(join(root, 'business-data'))).toBe(false)
  })

  it('rejects a changed dependency module type before linking the Host implementation', () => {
    const root = installedPackage()
    const team = join(root, 'node_modules/@deepseek-ai/dsh-experimental-agent-team')
    const copy = installedPackage(realpathSync(team))
    rmSync(team)
    symlinkSync(copy, team, 'dir')
    const path = join(copy, 'package.json')
    const manifest = JSON.parse(readFileSync(path, 'utf8'))
    writeFileSync(path, JSON.stringify({ ...manifest, type: 'commonjs' }))

    const result = importHost(root)
    expect(result.status, result.stderr + result.stdout).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({
      code: 'ULTRA_COMPAT_ARTIFACT_MISMATCH',
      message: expect.stringContaining('@deepseek-ai/dsh-experimental-agent-team'),
    })
    expect(existsSync(join(root, 'business-data'))).toBe(false)
  })

  it('rejects a changed Session executable even when its package version and exports match', () => {
    const root = installedPackage()
    const session = join(root, 'node_modules/@deepseek-ai/dsh-session')
    const source = realpathSync(session)
    rmSync(session)
    cpSync(source, session, { recursive: true, filter: path => !path.includes('/node_modules') })
    symlinkSync(join(source, 'node_modules'), join(session, 'node_modules'), 'dir')
    const entry = join(session, 'lib/index.js')
    writeFileSync(entry, `${readFileSync(entry, 'utf8')}\nthrow new Error('unlocked Session imported')\n`)

    const result = importHost(root)
    expect(result.status, result.stderr).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({
      code: 'ULTRA_COMPAT_ARTIFACT_MISMATCH',
      message: expect.stringContaining('@deepseek-ai/dsh-session'),
    })
    expect(existsSync(join(root, 'business-data'))).toBe(false)
  })

  it('checks the Team dependency resolution as well as the Host dependency resolution', () => {
    const root = installedPackage()
    const team = join(root, 'node_modules/@deepseek-ai/dsh-experimental-agent-team')
    const teamSource = realpathSync(team)
    rmSync(team)
    cpSync(teamSource, team, { recursive: true, filter: path => !path.includes('/node_modules') })
    const modules = join(team, 'node_modules/@deepseek-ai')
    mkdirSync(modules, { recursive: true })
    for (const name of readdirSync(join(teamSource, 'node_modules/@deepseek-ai'))) {
      symlinkSync(realpathSync(join(teamSource, 'node_modules/@deepseek-ai', name)), join(modules, name), 'dir')
    }
    const session = join(modules, 'dsh-session')
    const source = realpathSync(session)
    rmSync(session)
    cpSync(source, session, { recursive: true, filter: path => !path.includes('/node_modules') })
    symlinkSync(join(source, 'node_modules'), join(session, 'node_modules'), 'dir')
    const entry = join(session, 'lib/index.js')
    writeFileSync(entry, `${readFileSync(entry, 'utf8')}\nthrow new Error('mixed transitive Session imported')\n`)

    const result = importHost(root)
    expect(result.status, result.stderr).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({
      code: 'ULTRA_COMPAT_ARTIFACT_MISMATCH',
      message: expect.stringContaining('@deepseek-ai/dsh-session'),
    })
    expect(existsSync(join(root, 'business-data'))).toBe(false)
  })

  it('rejects a missing native adapter even when NODE_PATH exposes a qualified copy', () => {
    const root = installedPackage(join(project, 'packages/profile'))
    rmSync(join(root, 'node_modules/@benz-ai-x/dsh-agent-team-codex'))
    const result = importHost(root, { NODE_PATH: join(project, 'packages/profile/node_modules') })
    expect(result.status, result.stderr).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({
      code: 'ULTRA_COMPAT_ARTIFACT_MISMATCH',
      message: expect.stringContaining('@benz-ai-x/dsh-agent-team-codex'),
    })
    expect(existsSync(join(root, 'business-data'))).toBe(false)
  })

  it('rejects an unqualified native SDK version before importing an adapter', () => {
    const root = installedPackage(join(project, 'packages/profile'))
    const codex = join(root, 'node_modules/@benz-ai-x/dsh-agent-team-codex')
    const isolated = installedPackage(realpathSync(codex))
    rmSync(codex)
    symlinkSync(isolated, codex, 'dir')
    const sdk = join(isolated, 'node_modules/@openai/codex')
    rmSync(sdk)
    mkdirSync(sdk)
    writeFileSync(join(sdk, 'package.json'), JSON.stringify({ name: '@openai/codex', version: '0.149.2' }))

    const result = importHost(root)
    expect(result.status, result.stderr).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({
      code: 'ULTRA_COMPAT_ARTIFACT_MISMATCH',
      message: expect.stringContaining('@openai/codex'),
    })
    expect(existsSync(join(root, 'business-data'))).toBe(false)
  })

  it('rejects a missing Ultra UI before the profile can load any child', () => {
    const root = installedPackage(join(project, 'packages/profile'))
    rmSync(join(root, 'node_modules/@benz-ai-x/dsh-client-ui-agent-team-ultra'))

    const result = importHost(root)
    expect(result.status, result.stderr).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({
      code: 'ULTRA_COMPAT_ARTIFACT_MISMATCH',
      message: expect.stringContaining('@benz-ai-x/dsh-client-ui-agent-team-ultra'),
    })
    expect(existsSync(join(root, 'business-data'))).toBe(false)
  })

  it('checks the actual Loader root even when the profile package has a qualified private Team', () => {
    const { directory } = installedProfile()
    const team = join(directory, 'node_modules/@deepseek-ai/dsh-experimental-agent-team')
    rmSync(team)
    mkdirSync(team)
    writeFileSync(join(team, 'package.json'), JSON.stringify({
      name: '@deepseek-ai/dsh-experimental-agent-team', version: '0.1.2-rc.1', type: 'module', main: 'index.js',
    }))
    writeFileSync(join(team, 'index.js'), `
      import { mkdirSync } from 'node:fs'
      mkdirSync(process.env.DSH_HOME, { recursive: true })
      throw new Error('unchecked Loader-root Team executed')
    `)

    const result = loadProfile(directory)
    expect(result.status, result.stderr + result.stdout).toBe(1)
    // Loader wraps entry failures; its public diagnostic retains the compatibility code.
    expect(JSON.parse(result.stdout)).toMatchObject({
      message: expect.stringContaining('ULTRA_COMPAT_ARTIFACT_MISMATCH: @deepseek-ai/dsh-experimental-agent-team'),
    })
    expect(existsSync(join(directory, 'business-data'))).toBe(false)
  })

  it('rejects an unqualified Loader tree before its public data row creates business storage', () => {
    const { directory } = installedProfile()
    const team = join(directory, 'node_modules/@deepseek-ai/dsh-experimental-agent-team')
    rmSync(team)
    mkdirSync(team)
    writeFileSync(join(team, 'package.json'), JSON.stringify({
      name: '@deepseek-ai/dsh-experimental-agent-team', version: '0.1.2-rc.1', type: 'module', main: 'index.js',
    }))
    writeFileSync(join(team, 'index.js'), "throw new Error('unchecked Loader-root Team executed')\n")

    const result = loadProfile(directory, true)
    expect(result.status, result.stderr + result.stdout).toBe(1)
    expect(result.stdout).toContain('ULTRA_COMPAT_ARTIFACT_MISMATCH: @deepseek-ai/dsh-experimental-agent-team')
    expect(existsSync(join(directory, 'business-data'))).toBe(false)
  })

  it('preflights the installed CLI profile from its Loader root before starting web', () => {
    const { home, directory } = installedProfile()
    rmSync(join(directory, 'node_modules/@deepseek-ai/dsh-experimental-agent-team'))
    const result = spawnSync(process.execPath, [
      join(project, 'scripts/compatible-dsh.mjs'), 'web', '--profile', 'web', '--dump-config',
    ], { cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, DSH_HOME: home }, timeout: 15000 })

    expect(result.status, result.stderr + result.stdout).toBe(1)
    expect(JSON.parse(result.stderr)).toMatchObject({
      code: 'ULTRA_COMPAT_ARTIFACT_MISMATCH',
      message: expect.stringContaining('@deepseek-ai/dsh-experimental-agent-team'),
    })
    expect(existsSync(join(home, 'sessions'))).toBe(false)
  })


  it('rejects a Loader-root Host whose private Session differs before loading children', () => {
    const { directory } = installedProfile()
    const host = installedPackage()
    const link = join(directory, 'node_modules/@benz-ai-x/dsh-agent-team-ultra')
    rmSync(link)
    symlinkSync(host, link, 'dir')
    const session = join(host, 'node_modules/@deepseek-ai/dsh-session')
    const copy = installedPackage(realpathSync(session))
    rmSync(session)
    symlinkSync(copy, session, 'dir')
    const entry = join(copy, 'lib/index.js')
    writeFileSync(entry, `${readFileSync(entry, 'utf8')}\nthrow new Error('unchecked private Session executed')\n`)

    const result = loadProfile(directory)
    expect(result.status, result.stderr + result.stdout).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({
      message: expect.stringContaining('ULTRA_COMPAT_ARTIFACT_MISMATCH: @deepseek-ai/dsh-session'),
    })
    expect(existsSync(join(directory, 'business-data'))).toBe(false)
  })

  it('admits a complete profile with both Ultra-owned native adapters', () => {
    const root = installedPackage(join(project, 'packages/profile'))
    const result = importHost(root)
    expect(result.status, result.stderr + result.stdout).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ ok: true })
    expect(existsSync(join(root, 'business-data'))).toBe(false)
  })

  it('requires the Ultra-owned Claude Code adapter before loading the profile', () => {
    const root = installedPackage(join(project, 'packages/profile'))
    rmSync(join(root, 'node_modules/@benz-ai-x/dsh-agent-team-claude-code'))
    const result = importHost(root)
    expect(result.status, result.stderr + result.stdout).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({
      code: 'ULTRA_COMPAT_ARTIFACT_MISMATCH',
      message: expect.stringContaining('@benz-ai-x/dsh-agent-team-claude-code'),
    })
    expect(existsSync(join(root, 'business-data'))).toBe(false)
  })

  it.each([
    { version: '0.3.240', claudeCodeVersion: '2.1.241' },
    { version: '0.3.241', claudeCodeVersion: '2.1.240' },
  ])('rejects an unqualified Claude SDK or native product before importing the adapter: %j', fields => {
    const root = installedPackage(join(project, 'packages/profile'))
    const claude = join(root, 'node_modules/@benz-ai-x/dsh-agent-team-claude-code')
    const isolated = installedPackage(realpathSync(claude))
    rmSync(claude)
    symlinkSync(isolated, claude, 'dir')
    const sdk = join(isolated, 'node_modules/@anthropic-ai/claude-agent-sdk')
    rmSync(sdk)
    mkdirSync(sdk)
    writeFileSync(join(sdk, 'package.json'), JSON.stringify({ name: '@anthropic-ai/claude-agent-sdk', ...fields }))
    const result = importHost(root)
    expect(result.status, result.stderr + result.stdout).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({
      code: 'ULTRA_COMPAT_ARTIFACT_MISMATCH',
      message: expect.stringContaining('@anthropic-ai/claude-agent-sdk'),
    })
    expect(existsSync(join(root, 'business-data'))).toBe(false)
  })

  it.each(['codex', 'claude-code'])('rejects co-installed old and Ultra-owned %s packages before either can register', provider => {
    const root = installedPackage(join(project, 'packages/profile'))
    symlinkSync(join(project, `.dsh/harness/packages/experimental/agent-team-${provider}`),
      join(root, `node_modules/@deepseek-ai/dsh-experimental-agent-team-${provider}`), 'dir')
    const result = importHost(root)
    expect(result.status, result.stderr + result.stdout).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({
      code: 'ULTRA_COMPAT_LEGACY_RUNTIME',
      message: expect.stringContaining(`@deepseek-ai/dsh-experimental-agent-team-${provider}`),
    })
    expect(existsSync(join(root, 'business-data'))).toBe(false)
  })
})
