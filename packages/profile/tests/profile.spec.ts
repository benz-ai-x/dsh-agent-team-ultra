import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

function patches(path: string): any[] { return yaml.load(readFileSync(path, 'utf8'), { schema: entryListSchema }) as any[] }
describe('official-first B0 profile', () => {
  it('reuses the fixed official Team configuration and collision policy unchanged', () => {
    const own = patches(resolve('packages/profile/cordis.patch.yml'))
    const official = patches(resolve('.dsh/harness/packages/experimental/agent-team-profile/cordis.patch.yml'))
    const group = own.flatMap(row => row.insert ?? []).find(row => row.id === 'agent-team-ultra-compatibility')
    for (const row of official) {
      if (row.id) expect(own.find(candidate => candidate.id === row.id)).toEqual(row)
      for (const inserted of row.insert ?? []) expect(group.config.find((candidate: any) => candidate.id === inserted.id)).toEqual(inserted)
    }
    expect(group.config.map((row: any) => row.id)).toEqual(['agent-team', 'tool-agent-team', 'agent-team-ultra', 'ui-agent-team', 'ui-agent-team-ultra'])
    for (const id of ['session-persistence-jsonl', 'storage-json', 'storage-domain']) expect(own.find(row => row.id === id)?.disabled).toBe(true)
  })

  it('ships only three Ultra packages, official peers and one isolated data-root setting', () => {
    const manifest = JSON.parse(readFileSync('packages/profile/package.json', 'utf8'))
    expect(manifest.private).toBe(true)
    expect(JSON.stringify(manifest)).not.toMatch(/claude-code|agent-team-codex|storage-sqlite/)
    const own = patches(resolve('packages/profile/cordis.patch.yml'))
    const data = own.flatMap(row => row.insert ?? []).find(row => row.id === 'agent-team-ultra-data')
    expect(data.name).toBe('@benz-ai-x/dsh-agent-team-ultra-profile/data')
    expect(Object.keys(data.config)).toEqual(['root'])
    expect(readFileSync('packages/profile/cordis.patch.yml', 'utf8')).toContain("dshHomePath('ultra-b0')")
  })
})
