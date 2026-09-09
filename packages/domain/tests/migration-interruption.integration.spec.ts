import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Storage from '@deepseek-ai/dsh-storage'
import { SessionId } from '@deepseek-ai/dsh-session'
import { expect, it } from 'vitest'
import { cleanups, profile, target, workflow } from './fixtures/host-workflow.ts'
import type { DigitalEmployeeStudioView, SpawnDigitalEmployeeResult } from '../src/types.ts'

const project = resolve(import.meta.dirname, '../../..')

function bytes(root: string): Record<string, string> {
  return Object.fromEntries(readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name)
    return entry.isDirectory()
      ? Object.entries(bytes(path)).map(([name, hash]) => [`${entry.name}/${name}`, hash])
      : [[entry.name, createHash('sha256').update(readFileSync(path)).digest('hex')]]
  }))
}

it.each(['json', 'sqlite'] as const)('resumes every %s publication boundary, including both completion-marker edges, without changing the source or employee', async backend => {
  const source = await workflow(backend)
  await source.invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target })
  await source.invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 })
  const launched = await source.invoke('spawn', {
    launchRequestId: '77777777-7777-4777-8777-777777777777', profileId: profile.id,
  }) as SpawnDigitalEmployeeResult
  if (!launched.ok || !launched.value.memberId) throw new Error('source employee did not launch')
  await expect.poll(() => source.ctx.agents.get(SessionId(launched.value.memberId!))).toBeUndefined()
  const original = await source.invoke('view') as DigitalEmployeeStudioView
  await source.ctx.fiber.dispose()
  mkdirSync(join(source.root, 'sessions'), { recursive: true })
  const unchanged = bytes(source.root)
  const parent = mkdtempSync(join(tmpdir(), 'ultra-every-migration-write-'))
  cleanups.push(async () => { rmSync(parent, { recursive: true, force: true }) })
  const migrate = (destination: string, limit?: number) => spawnSync(process.execPath, [
    join(project, 'scripts/migrate-data.mjs'), '--sessions', join(source.root, 'sessions'),
    `--${backend}`, join(source.root, backend === 'json' ? 'storage' : 'storage.sqlite'), '--target', destination,
    ...(limit === undefined ? [] : ['--max-writes', String(limit)]),
  ], { cwd: project, encoding: 'utf8' })
  const baseline = join(parent, 'uninterrupted')
  const finished = migrate(baseline)
  expect(finished.status, finished.stdout + finished.stderr).toBe(0)
  const { writes } = JSON.parse(finished.stdout) as { writes: number }
  expect(writes).toBeGreaterThan(2)
  const expected = bytes(baseline)
  // The state after publication n is the state before publication n + 1.
  // Include zero and the final marker, so neither outside edge is omitted.
  for (let completedWrites = 0; completedWrites <= writes; completedWrites += 1) {
    const destination = join(parent, `after-${completedWrites}`)
    const paused = migrate(destination, completedWrites)
    expect(paused.status, paused.stdout + paused.stderr).toBe(1)
    expect(JSON.parse(paused.stdout)).toMatchObject({ ok: false, code: 'MIGRATION_PAUSED', sourcePreserved: true })
    expect(bytes(source.root)).toEqual(unchanged)
    if (completedWrites < writes) {
      const pending = bytes(destination)
      const ctx = new Context()
      try {
        await ctx.plugin(Storage)
        await ctx.plugin(Loader)
        await expect(ctx.loader.create({
          name: pathToFileURL(join(project, 'packages/profile/lib/data.js')).href,
          config: {
            sessions: { root: join(destination, 'sessions') },
            storage: backend === 'json' ? { backend, root: join(destination, 'storage') }
              : { backend, path: join(destination, 'storage.sqlite') },
          },
        })).rejects.toThrow(/Joint data migration is pending/)
        expect(ctx.get('sessionPersistence')).toBeUndefined()
        expect(ctx.storage.backend.names()).toEqual([])
      } finally { await ctx.fiber.dispose() }
      expect(bytes(destination)).toEqual(pending)
    }
    const resumed = migrate(destination)
    expect(resumed.status, resumed.stdout + resumed.stderr).toBe(0)
    expect(bytes(destination)).toEqual(expected)
    const reused = migrate(destination)
    expect(reused.status, reused.stdout + reused.stderr).toBe(0)
    expect(JSON.parse(reused.stdout)).toMatchObject({ ok: true, reused: true, writes: 0 })
    const cold = await workflow(backend, { root: destination, resumeLead: true })
    try {
      const recovered = await cold.invoke('view') as DigitalEmployeeStudioView
      expect(recovered.instances).toMatchObject([{ memberId: launched.value.memberId, profileRevision: 1, resolvedRuntimeTarget: target }])
      expect(recovered.profiles).toEqual(original.profiles)
      expect(recovered.runs.map(run => run.runId)).toEqual(original.runs.map(run => run.runId))
    } finally { await cold.ctx.fiber.dispose() }
    expect(bytes(source.root)).toEqual(unchanged)
  }
  process.stdout.write(`PASS ${backend}: ${writes} durable publications, all ${writes + 1} before/after boundaries and cold identities\n`)
}, 300_000)
