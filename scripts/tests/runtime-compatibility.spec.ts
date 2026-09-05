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

function importHost(root: string) {
  return spawnSync(process.execPath, ['--input-type=module', '--eval', `
    try {
      await import(${JSON.stringify(pathToFileURL(join(root, 'lib/index.js')).href)})
      console.log(JSON.stringify({ ok: true }))
    } catch (error) {
      console.log(JSON.stringify({ code: error.code, message: error.message }))
      process.exitCode = 1
    }
  `], { cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, DSH_HOME: join(root, 'business-data') } })
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
    rmSync(team)
    mkdirSync(team)
    writeFileSync(join(team, 'package.json'), JSON.stringify({
      name: '@deepseek-ai/dsh-experimental-agent-team', version: '0.1.2-rc.1', type: 'module', main: 'index.js',
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

  it('rejects a missing native adapter at the profile boundary before loading its children', () => {
    const root = installedPackage(join(project, 'packages/profile'))
    rmSync(join(root, 'node_modules/@deepseek-ai/dsh-experimental-agent-team-codex'))
    const result = importHost(root)
    expect(result.status, result.stderr).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({
      code: 'ULTRA_COMPAT_ARTIFACT_MISMATCH',
      message: expect.stringContaining('@deepseek-ai/dsh-experimental-agent-team-codex'),
    })
    expect(existsSync(join(root, 'business-data'))).toBe(false)
  })

  it('rejects an unqualified native SDK version before importing an adapter', () => {
    const root = installedPackage(join(project, 'packages/profile'))
    const codex = join(root, 'node_modules/@deepseek-ai/dsh-experimental-agent-team-codex')
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
})
