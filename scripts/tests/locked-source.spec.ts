import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const harness = resolve(realpathSync(join(project, 'node_modules/@deepseek-ai/dsh-typert-generator')), '../../..')
const temporary: string[] = []
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true })
})

function isolatedProject() {
  const root = mkdtempSync(join(tmpdir(), 'ultra-source-isolated-'))
  temporary.push(root)
  const directory = join(root, 'ultra')
  cpSync(project, directory, {
    recursive: true,
    filter: path => !relative(project, path).split('/').some(part =>
      ['.git', 'node_modules', 'lib', 'artifacts', '.dsh'].includes(part)),
  })
  symlinkSync(harness, join(root, 'deepseek-harness'), 'dir')
  mkdirSync(join(directory, '.dsh'), { recursive: true })
  symlinkSync(harness, join(directory, '.dsh/harness'), 'dir')
  const manifests = [join(directory, 'package.json'), ...readdirSync(join(directory, 'packages'))
    .map(name => join(directory, 'packages', name, 'package.json')).filter(path => existsSync(path))]
  for (const path of manifests) {
    const manifest = JSON.parse(readFileSync(path, 'utf8'))
    for (const [name, specifier] of Object.entries(manifest.devDependencies ?? {})) {
      if (typeof specifier !== 'string' || !specifier.startsWith('link:')) continue
      const installed = join(dirname(path), 'node_modules', name)
      mkdirSync(dirname(installed), { recursive: true })
      symlinkSync(resolve(dirname(path), specifier.slice(5)), installed, 'dir')
    }
  }
  return directory
}

describe('locked source preparation and consumers', () => {
  it('attests the same relative source selection from an unrelated working directory', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ultra-source-cwd-'))
    temporary.push(cwd)
    const result = spawnSync(process.execPath, [join(project, 'scripts/verify-dsh-context.mjs'), '--require-source'], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, DSH_HARNESS_ROOT: relative(project, harness) },
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`PASS validated Harness source at ${harness}`)
  })

  it('rejects an installed dependency that differs from the selected source', () => {
    const directory = isolatedProject()
    const check = () => spawnSync(process.execPath, [join(directory, 'scripts/verify-dsh-context.mjs'), '--require-source'], {
      cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, DSH_HARNESS_ROOT: harness },
    })
    const valid = check()
    expect(valid.status, valid.stderr).toBe(0)
    const installed = join(directory, 'node_modules/@deepseek-ai/dsh-typert-generator')
    const wrong = join(directory, 'unselected-generator')
    mkdirSync(wrong)
    rmSync(installed)
    symlinkSync(wrong, installed, 'dir')

    const mixed = check()
    expect(mixed.status, mixed.stdout).toBe(1)
    expect(mixed.stderr).toContain(wrong)
    expect(mixed.stderr).toContain(harness)
  })

  it('prepares a non-adjacent locked source repeatedly with identical provenance', () => {
    const directory = isolatedProject()
    rmSync(join(dirname(directory), 'deepseek-harness'))
    rmSync(join(directory, '.dsh/harness'))
    const prepare = (cwd: string) => spawnSync(process.execPath, [join(directory, 'scripts/prepare-harness.mjs')], {
      cwd, encoding: 'utf8', env: { ...process.env, DSH_HARNESS_ROOT: relative(directory, harness) },
    })
    const first = prepare(tmpdir())
    expect(first.status, first.stderr).toBe(0)
    const second = prepare(join(directory, 'packages/domain'))
    expect(second.status, second.stderr).toBe(0)
    expect(JSON.parse(second.stdout)).toEqual(JSON.parse(first.stdout))
    expect(JSON.parse(first.stdout)).toMatchObject({ harnessRoot: harness })
    expect(realpathSync(join(directory, '.dsh/harness'))).toBe(harness)
    const generator = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
      .devDependencies['@deepseek-ai/dsh-typert-generator'] as string
    expect(realpathSync(resolve(directory, generator.slice(5))))
      .toBe(join(harness, 'packages/typert/generator'))
    const host = JSON.parse(readFileSync(join(directory, 'packages/domain/tsconfig.json'), 'utf8'))
    expect(realpathSync(resolve(directory, 'packages/domain', host.extends))).toBe(join(harness, 'tsconfig.base.json'))
    expect(existsSync(join(dirname(directory), 'deepseek-harness'))).toBe(false)
  })

  it.each(['extends', 'reference'] as const)('rejects a TypeScript %s from an unselected source', (input) => {
    const directory = isolatedProject()
    const wrong = join(directory, 'unselected-config.json')
    cpSync(join(harness, 'tsconfig.base.json'), wrong)
    const configPath = join(directory, 'packages/domain/tsconfig.json')
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    if (input === 'extends') config.extends = wrong
    else config.references[0].path = wrong
    writeFileSync(configPath, JSON.stringify(config))

    const result = spawnSync(process.execPath, [join(directory, 'scripts/verify-dsh-context.mjs'), '--require-source'], {
      cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, DSH_HARNESS_ROOT: harness },
    })
    expect(result.status, result.stdout).toBe(1)
    expect(result.stderr).toContain(wrong)
    expect(result.stderr).toContain(harness)
  })

  it('preserves the prepared source when a new selection fails attestation', () => {
    const directory = isolatedProject()
    const wrong = join(directory, 'unlocked-harness')
    mkdirSync(wrong)
    const lock = readFileSync(join(directory, 'dsh-reference.lock.json'), 'utf8')
    const result = spawnSync(process.execPath, [join(directory, 'scripts/prepare-harness.mjs')], {
      cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, DSH_HARNESS_ROOT: wrong },
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(wrong)
    expect(realpathSync(join(directory, '.dsh/harness'))).toBe(harness)
    expect(readFileSync(join(directory, 'dsh-reference.lock.json'), 'utf8')).toBe(lock)
  })

  it('preserves an existing directory at the prepared link location', () => {
    const directory = isolatedProject()
    const existing = join(directory, '.dsh/harness')
    rmSync(existing)
    mkdirSync(existing)
    writeFileSync(join(existing, 'keep.txt'), 'existing checkout data')
    const result = spawnSync(process.execPath, [join(directory, 'scripts/prepare-harness.mjs')], {
      cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, DSH_HARNESS_ROOT: harness },
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(existing)
    expect(readFileSync(join(existing, 'keep.txt'), 'utf8')).toBe('existing checkout data')
  })
})
