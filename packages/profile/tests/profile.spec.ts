import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

describe('Agent Team Ultra profile overlay', () => {
  it('is a private parseable bundle with collision-free stable rows', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      private?: boolean
      publishConfig?: unknown
      peerDependencies?: Record<string, string>
      peerDependenciesMeta?: Record<string, { optional?: boolean }>
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.private).toBe(true)
    expect(manifest.publishConfig).toBeUndefined()
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.peerDependencies).toEqual({
      '@deepseek-ai/dsh-agent-team-ultra': '0.1.0',
      '@deepseek-ai/dsh-client-ui-agent-team-ultra': '0.1.0',
      '@deepseek-ai/dsh-experimental-agent-team': '0.1.2-alpha.1',
      '@deepseek-ai/dsh-experimental-client-ui-agent-team': '0.1.2-alpha.1',
      '@deepseek-ai/dsh-experimental-tool-agent-team': '0.1.2-alpha.1',
    })
    expect(Object.values(manifest.peerDependenciesMeta ?? {}).every(meta => meta.optional === true)).toBe(true)

    const patches = yaml.load(
      readFileSync(resolve(root, manifest.dsh!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    ) as {
      id?: string
      disabled?: boolean
      config?: Record<string, unknown>
      insert?: { id: string; name: string; config?: Record<string, unknown> }[]
    }[]
    expect(patches.find(patch => patch.id === 'tool-subagent-control')).toMatchObject({ disabled: true })
    expect(patches.find(patch => patch.id === 'tool-subagent-list-agents')).toMatchObject({ disabled: true })
    expect(patches.find(patch => patch.id === 'tool-subagent-report')).toMatchObject({ disabled: true })
    expect(patches.find(patch => patch.id === 'tool-subagent')?.config).toMatchObject({ backgroundMode: 'one-shot' })
    expect(patches.find(patch => patch.id === 'tool-subagent-fork')?.config).toMatchObject({ backgroundMode: 'one-shot' })

    const inserted = patches.flatMap(patch => patch.insert ?? [])
    expect(inserted.map(entry => entry.id)).toEqual([
      'agent-team',
      'tool-agent-team',
      'agent-team-ultra',
      'ui-agent-team',
      'ui-agent-team-ultra',
    ])
    expect(new Set(inserted.map(entry => entry.id)).size).toBe(inserted.length)
    expect(inserted.find(entry => entry.id === 'agent-team-ultra')).toMatchObject({
      name: '@deepseek-ai/dsh-agent-team-ultra',
      config: { defaultProvider: 'spawn', maxProfiles: 64, maxHooks: 32, maxAssignmentBytes: 32768 },
    })
  })
})
