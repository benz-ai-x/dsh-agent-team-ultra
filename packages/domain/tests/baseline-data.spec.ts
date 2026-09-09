import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assertBaselineData, initializeBaselineData } from '../src/baseline-data.ts'

const roots: string[] = []
function temporary() {
  const path = mkdtempSync(join(tmpdir(), 'ultra-b0-data-test-'))
  roots.push(path)
  return path
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('B0 data admission before writable registrations', () => {
  it('requires explicit initialization and derives both roots from one identity', () => {
    const root = join(temporary(), 'new-data')
    expect(() => assertBaselineData(root)).toThrow(/B0_DATA/)
    const initialized = initializeBaselineData(root)
    expect(assertBaselineData(root)).toEqual(initialized)
    expect(initialized.sessions).toBe(join(root, 'sessions'))
    expect(initialized.storage).toBe(join(root, 'storage'))
    expect(initializeBaselineData(root)).toEqual(initialized)
  })

  it('refuses a legacy root without creating markers or changing original bytes', () => {
    const root = temporary()
    mkdirSync(join(root, 'sessions'))
    const file = join(root, 'sessions', 'old.jsonl')
    writeFileSync(file, '{"version":2,"id":"old"}\n')
    const before = readFileSync(file)
    for (const run of [initializeBaselineData, assertBaselineData]) {
      expect(() => run(root)).toThrow(/B0_DATA/)
      expect(readFileSync(file)).toEqual(before)
      expect(readdirSync(root)).toEqual(['sessions'])
    }
  })

  it('refuses malformed or future markers without interpreting them as fresh data', () => {
    for (const marker of ['[]', '{', '{"schemaVersion":2,"baseline":"official-dsh-only-b0"}']) {
      const root = temporary()
      writeFileSync(join(root, 'ultra-b0.json'), marker)
      expect(() => initializeBaselineData(root)).toThrow(/B0_DATA/)
      expect(() => assertBaselineData(root)).toThrow(/B0_DATA/)
      expect(readFileSync(join(root, 'ultra-b0.json'), 'utf8')).toBe(marker)
    }
  })

  it('refuses missing directories in an initialized dataset, never recreating them', () => {
    const root = temporary()
    initializeBaselineData(root)
    rmSync(join(root, 'storage'), { recursive: true })
    expect(() => assertBaselineData(root)).toThrow(/B0_DATA/)
    expect(() => initializeBaselineData(root)).toThrow(/B0_DATA/)
    expect(readdirSync(root).sort()).toEqual(['sessions', 'ultra-b0.json'])
  })

  it('refuses symlinked roots and nested media pointing at other data', () => {
    const parent = temporary()
    const actual = join(parent, 'actual')
    initializeBaselineData(actual)
    symlinkSync(actual, join(parent, 'alias'))
    expect(() => assertBaselineData(join(parent, 'alias'))).toThrow(/B0_DATA/)
    symlinkSync(join(parent, 'untouched'), join(actual, 'storage', 'legacy'))
    expect(() => assertBaselineData(actual)).toThrow(/B0_DATA/)
  })

  it('rejects old Session media even when copied beneath a B0 marker', () => {
    const root = temporary()
    initializeBaselineData(root)
    const file = join(root, 'sessions', 'old.jsonl')
    writeFileSync(file, '{"type":"session/header","data":{"version":2,"id":"old"}}\n')
    const before = readFileSync(file)
    expect(() => assertBaselineData(root)).toThrow(/B0_DATA/)
    expect(readFileSync(file)).toEqual(before)
  })

  it('refuses old Ultra storage generations instead of skipping their records', () => {
    const root = temporary()
    initializeBaselineData(root)
    mkdirSync(join(root, 'storage', 'agent_team_ultra_v1'))
    expect(() => assertBaselineData(root)).toThrow(/B0_DATA/)
  })
})
