import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { describe, expect, it } from 'vitest'
import { workflow } from '../../domain/tests/fixtures/host-workflow.ts'
import type { DigitalEmployeeStudioView } from '../../domain/src/types.ts'
import * as codex from '../lib/index.js'

describe('Ultra-owned Codex public package', () => {
  it('publishes one executable catalog generation and releases it with its Fiber', async () => {
    const { ctx, invoke } = await workflow()
    await ctx.plugin(LocalSubprocessRuntime)
    const config = { catalogOwnerService: 'digitalEmployees', sandbox: 'read-only' as const }
    const first = ctx.plugin(codex, config)
    await first
    const view = await invoke('view') as DigitalEmployeeStudioView
    expect(view.runtimeCatalog.backends.filter(backend => backend.provider === 'codex')).toEqual([
      expect.objectContaining({
        routingId: 'external-agent/codex', availability: 'available',
        contextModes: ['fresh'],
        profileCapabilities: ['persona', 'mission', 'context', 'memory'],
        runtimeCapabilities: ['sandbox', 'evidence', 'usage'],
      }),
    ])
    expect(JSON.stringify(view)).not.toMatch(/nativePath|apiKey|packageBin|CODEX_HOME/)
    await first.dispose()
    const removed = await invoke('view') as DigitalEmployeeStudioView
    expect(removed.runtimeCatalog.backends.filter(backend => backend.provider === 'codex'))
      .not.toContainEqual(expect.objectContaining({ availability: 'available' }))
    const replacement = ctx.plugin(codex, config)
    await replacement
    const restored = await invoke('view') as DigitalEmployeeStudioView
    expect(restored.runtimeCatalog.generation).toBeGreaterThan(view.runtimeCatalog.generation)
    expect(restored.runtimeCatalog.backends.filter(backend => backend.provider === 'codex' && backend.availability === 'available'))
      .toHaveLength(1)
    await replacement.dispose()
  })
})
