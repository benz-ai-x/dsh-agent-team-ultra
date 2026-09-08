import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader, { type EntryOptions } from '@deepseek-ai/cordis-plugin-loader'
import { applyEntryPatches, entryListSchema, type PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import * as yaml from 'js-yaml'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as JsonStorage from '@deepseek-ai/dsh-storage-json'
import * as SqliteStorage from '@deepseek-ai/dsh-storage-sqlite'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import * as Codex from '../../codex/lib/index.js'
import { NativeProduct } from '../../codex/tests/fixtures/native-product.mjs'
import { cleanups, profile, target, workflow } from './fixtures/host-workflow.ts'
import type { DigitalEmployeeEvalSetDraft, DigitalEmployeeStudioView, SpawnDigitalEmployeeResult } from '../src/types.ts'
import { digitalEmployeeDomainSpec } from '../src/spec.ts'
import { digitalEmployeeV1DomainSpec, openDigitalEmployeeStorage } from '../src/storage.ts'

const project = resolve(import.meta.dirname, '../../..')

function bytes(root: string): Record<string, string> {
  return Object.fromEntries(readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name)
    return entry.isDirectory()
      ? Object.entries(bytes(path)).map(([name, hash]) => [`${entry.name}/${name}`, hash])
      : [[entry.name, createHash('sha256').update(readFileSync(path)).digest('hex')]]
  }))
}

function migrate(source: string, destination: string, backend: 'json' | 'sqlite' = 'json', extra: string[] = []) {
  return spawnSync(process.execPath, [join(project, 'scripts/migrate-data.mjs'),
    '--sessions', join(source, 'sessions'), `--${backend}`, join(source, backend === 'json' ? 'storage' : 'storage.sqlite'),
    '--target', destination, ...extra,
  ], { cwd: project, encoding: 'utf8' })
}

async function storageContext(root: string, backend: 'json' | 'sqlite') {
  const ctx = new Context()
  cleanups.push(async () => { await ctx.fiber.dispose() })
  await ctx.plugin(Storage)
  if (backend === 'json') await ctx.plugin(JsonStorage, { root: join(root, 'storage') })
  else await ctx.plugin(SqliteStorage, { path: join(root, 'storage.sqlite'), journalMode: 'delete' })
  await ctx.plugin(StorageDomain, { backend })
  return ctx
}

describe('operator joint migration', () => {
  it('preserves the JSON source and resumes the original employee from an isolated complete target', async () => {
    const source = await workflow()
    await source.invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target })
    await source.invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 })
    const launched = await source.invoke('spawn', {
      launchRequestId: '66666666-6666-4666-8666-666666666666', profileId: profile.id,
    }) as SpawnDigitalEmployeeResult
    expect(launched.ok).toBe(true)
    if (!launched.ok) throw new Error('employee launch failed')
    await source.ctx.fiber.dispose()
    const before = bytes(source.root)
    const parent = mkdtempSync(join(tmpdir(), 'ultra-joint-migration-'))
    cleanups.push(async () => { rmSync(parent, { recursive: true, force: true }) })
    const destination = join(parent, 'target')
    const result = migrate(source.root, destination)
    expect(result.status, result.stderr + result.stdout).toBe(0)
    const report = JSON.parse(result.stdout)
    expect(report).toMatchObject({ ok: true, status: 'complete', sourcePreserved: true })
    expect(JSON.stringify(report)).not.toMatch(/PRIVATE_OUTPUT|Review carefully\.|Report a finding\./)
    expect(JSON.parse(readFileSync(join(destination, 'ultra-migration-manifest.json'), 'utf8'))).toMatchObject({
      schemaVersion: 1, status: 'complete', sourceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(bytes(source.root)).toEqual(before)
    const resumed = await workflow('json', { root: destination, resumeLead: true })
    const view = await resumed.invoke('view') as DigitalEmployeeStudioView
    expect(view.instances).toContainEqual(expect.objectContaining({ memberId: launched.value.memberId, profileRevision: 1 }))
    expect(view.runs).toHaveLength(1)
    await expect(resumed.ctx.agentTeams.sendMessage(resumed.lead.agent, {
      target: profile.employeeName, content: [{ type: 'text', text: 'Continue the original migrated employee.' }],
      signal: new AbortController().signal,
    })).resolves.toMatchObject({ status: 'accepted' })
    await expect.poll(() => resumed.ctx.agents.get(SessionId(launched.value.memberId!))).toBeUndefined()
    const continued = await resumed.invoke('view') as DigitalEmployeeStudioView
    expect(continued.instances).toMatchObject([{ memberId: launched.value.memberId, profileRevision: 1, resolvedRuntimeTarget: target }])
    expect(continued.runs).toHaveLength(2)
    await resumed.ctx.fiber.dispose()
    expect(bytes(source.root)).toEqual(before)
  })

  it('converts all B-written Team and child Session generations while retaining the historical artifacts', () => {
    const fixture = JSON.parse(readFileSync(new URL('./fixtures/b-team-session-source.json', import.meta.url), 'utf8')) as {
      files: Record<string, { base64: string; sha256: string }>
    }
    const parent = mkdtempSync(join(tmpdir(), 'ultra-b-joint-migration-'))
    cleanups.push(async () => { rmSync(parent, { recursive: true, force: true }) })
    const source = join(parent, 'source')
    const destination = join(parent, 'target')
    mkdirSync(join(source, 'storage'), { recursive: true })
    for (const [name, value] of Object.entries(fixture.files)) {
      const content = Buffer.from(value.base64, 'base64')
      expect(createHash('sha256').update(content).digest('hex')).toBe(value.sha256)
      const path = join(source, 'sessions', name)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, content)
    }
    const before = bytes(source)
    const result = migrate(source, destination)
    expect(result.status, result.stderr + result.stdout).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, status: 'complete', sessionCount: 3 })
    const audited = spawnSync(process.execPath, [join(project, 'scripts/audit-migration.mjs'),
      '--sessions', join(destination, 'sessions'), '--json', join(destination, 'storage'),
    ], { encoding: 'utf8', cwd: project })
    expect(audited.status, audited.stderr + audited.stdout).toBe(0)
    expect(JSON.parse(audited.stdout)).toMatchObject({ ok: true, sourceFormats: { session: 2 }, sessionCount: 3 })
    const targetBytes = bytes(destination)
    for (const [name, hash] of Object.entries(before)) expect(targetBytes[name]).toBe(hash)
    expect(Object.keys(targetBytes).filter(name => name.endsWith('/session.v2.jsonl.zstd'))).toHaveLength(3)
    expect(bytes(source)).toEqual(before)
  })

  it.each(['json', 'sqlite'] as const)('finishes the actual legacy %s domain migration before publishing joint completion', async backend => {
    const parent = mkdtempSync(join(tmpdir(), 'ultra-legacy-joint-migration-'))
    cleanups.push(async () => { rmSync(parent, { recursive: true, force: true }) })
    const source = join(parent, 'source')
    const destination = join(parent, 'target')
    mkdirSync(join(source, 'sessions'), { recursive: true })
    const original = await storageContext(source, backend)
    const domain = await original.storageDomain.open(digitalEmployeeDomainSpec)
    const { continuationProvider, ...fields } = profile
    await domain.table('profiles').put(profile.id, {
      ...fields, provider: continuationProvider, revision: 7, createdAt: 100, updatedAt: 200,
    })
    await domain.close()
    await original.fiber.dispose()
    const before = bytes(source)
    const result = migrate(source, destination, backend)
    expect(result.status, result.stderr + result.stdout).toBe(0)
    const audited = spawnSync(process.execPath, [join(project, 'scripts/audit-migration.mjs'),
      '--sessions', join(destination, 'sessions'), `--${backend}`, join(destination, backend === 'json' ? 'storage' : 'storage.sqlite'),
    ], { encoding: 'utf8', cwd: project })
    expect(audited.status, audited.stderr + audited.stdout).toBe(0)
    expect(JSON.parse(audited.stdout)).toMatchObject({
      ok: true, ultraMigration: { status: 'complete', sourceVersion: 0, targetVersion: 1 },
    })
    const recovered = await storageContext(destination, backend)
    const store = await openDigitalEmployeeStorage(recovered.storageDomain)
    expect(store.getProfile(profile.id)).toMatchObject({ ...profile, revision: 7, createdAt: 100, updatedAt: 200 })
    expect(store.getProfileHead(profile.id)).toMatchObject({ latestRevision: 7, createdAt: 100, updatedAt: 200 })
    await store.close()
    await recovered.fiber.dispose()
    expect(bytes(source)).toEqual(before)
  })

  it.each(['json', 'sqlite'] as const)('retries a paused %s publication and reuses an equal completed target without rewriting it', async backend => {
    const source = await workflow(backend)
    await source.invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target })
    await source.ctx.fiber.dispose()
    mkdirSync(join(source.root, 'sessions'), { recursive: true })
    const before = bytes(source.root)
    const parent = mkdtempSync(join(tmpdir(), 'ultra-joint-retry-'))
    cleanups.push(async () => { rmSync(parent, { recursive: true, force: true }) })
    const destination = join(parent, 'target')
    const paused = migrate(source.root, destination, backend, ['--max-writes', '2'])
    expect(paused.status, paused.stderr + paused.stdout).toBe(1)
    expect(JSON.parse(paused.stdout)).toMatchObject({ ok: false, code: 'MIGRATION_PAUSED' })
    expect(JSON.parse(readFileSync(join(destination, 'ultra-migration-manifest.json'), 'utf8')).status).toBe('pending')
    const completed = migrate(source.root, destination, backend)
    expect(completed.status, completed.stderr + completed.stdout).toBe(0)
    const completeBytes = bytes(destination)
    const retried = migrate(source.root, destination, backend)
    expect(retried.status, retried.stderr + retried.stdout).toBe(0)
    expect(JSON.parse(retried.stdout)).toMatchObject({ ok: true, status: 'complete', reused: true })
    expect(bytes(destination)).toEqual(completeBytes)
    expect(bytes(source.root)).toEqual(before)
  }, 20_000)

  it('refuses checked profile startup before any business storage can open a pending target', async () => {
    const source = await workflow()
    await source.invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target })
    await source.ctx.fiber.dispose()
    mkdirSync(join(source.root, 'sessions'), { recursive: true })
    const parent = mkdtempSync(join(tmpdir(), 'ultra-joint-admission-'))
    cleanups.push(async () => { rmSync(parent, { recursive: true, force: true }) })
    const destination = join(parent, 'target')
    const paused = migrate(source.root, destination, 'json', ['--max-writes', '1'])
    expect(JSON.parse(paused.stdout)).toMatchObject({ ok: false, code: 'MIGRATION_PAUSED' })
    const before = bytes(destination)
    const boot = spawnSync(process.execPath, [join(project, 'scripts/compatible-dsh.mjs'), '--profile', 'web', '--dump-config'], {
      encoding: 'utf8', cwd: project, env: { ...process.env, DSH_HOME: destination },
    })
    expect(boot.status, boot.stderr + boot.stdout).toBe(1)
    expect(JSON.parse(boot.stderr)).toMatchObject({ code: 'ULTRA_MIGRATION_PENDING' })
    expect(bytes(destination)).toEqual(before)
  })

  it('the shipped Loader data composition rejects pending custom roots before registering any persistence', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'ultra-profile-data-admission-'))
    cleanups.push(async () => { rmSync(parent, { recursive: true, force: true }) })
    writeFileSync(join(parent, 'ultra-migration-manifest.json'), JSON.stringify({ schemaVersion: 1, status: 'pending' }))
    const before = bytes(parent)
    const ctx = new Context()
    cleanups.push(async () => { await ctx.fiber.dispose() })
    await ctx.plugin(Storage)
    await ctx.plugin(Loader)
    const base: EntryOptions[] = [
      { id: 'session-persistence-jsonl', name: '@deepseek-ai/dsh-session-persistence-jsonl', config: { root: join(parent, 'sessions') } },
      { id: 'storage-json', name: '@deepseek-ai/dsh-storage-json', config: { root: join(parent, 'storage') } },
      { id: 'storage-domain', name: '@deepseek-ai/dsh-storage-domain', config: { backend: 'json' } },
    ]
    const patches = yaml.load(readFileSync(join(project, 'packages/profile/cordis.patch.yml'), 'utf8'), { schema: entryListSchema }) as PatchOptions[]
    const entries = applyEntryPatches(base, patches, () => undefined)
      .filter(entry => base.some(row => row.id === entry.id) || entry.id === 'agent-team-ultra-data')
    const owned = entries.find(entry => entry.id === 'agent-team-ultra-data')
    if (owned) owned.config = { sessions: { root: join(parent, 'sessions') }, storage: { backend: 'json', root: join(parent, 'storage') } }
    const resolveDomain = createRequire(join(project, 'packages/domain/package.json'))
    const resolveProfile = createRequire(join(project, 'packages/profile/package.json'))
    await expect((async () => {
      for (const entry of entries.filter(row => !row.disabled)) {
        const importer = entry.name.startsWith('@benz-ai-x/') ? resolveProfile : resolveDomain
        await ctx.loader.create({ ...entry, name: pathToFileURL(importer.resolve(entry.name)).href })
      }
      await ctx.loader.await()
    })()).rejects.toThrow(/Joint data migration is pending/)
    expect(ctx.get('sessionPersistence')).toBeUndefined()
    expect(ctx.storage.backend.names()).toEqual([])
    expect(bytes(parent)).toEqual(before)
  })

  it.each(['json', 'sqlite'] as const)('the public data Loader releases and remounts real %s persistence without losing records', async backend => {
    const root = mkdtempSync(join(tmpdir(), 'ultra-data-loader-lifetime-'))
    cleanups.push(async () => { rmSync(root, { recursive: true, force: true }) })
    const ctx = new Context()
    cleanups.push(async () => { await ctx.fiber.dispose() })
    await ctx.plugin(Storage)
    await ctx.plugin(Loader)
    const resolveProfile = createRequire(join(project, 'packages/profile/package.json'))
    const entry = {
      name: pathToFileURL(resolveProfile.resolve('@benz-ai-x/dsh-agent-team-ultra-profile/data')).href,
      config: {
        sessions: { root: join(root, 'sessions') },
        storage: backend === 'json' ? { backend, root: join(root, 'storage') }
          : { backend, path: join(root, 'storage.sqlite'), journalMode: 'delete' },
      },
    }
    const first = await ctx.loader.create(entry)
    const domain = await ctx.storageDomain.open(digitalEmployeeDomainSpec)
    const { continuationProvider, ...fields } = profile
    await domain.table('profiles').put(profile.id, {
      ...fields, provider: continuationProvider, revision: 7, createdAt: 100, updatedAt: 200,
    })
    await ctx.loader.remove(first)
    expect(ctx.get('sessionPersistence')).toBeUndefined()
    expect(ctx.get('storageDomain')).toBeUndefined()
    expect(ctx.storage.backend.names()).toEqual([])
    const second = await ctx.loader.create(entry)
    const recovered = await openDigitalEmployeeStorage(ctx.storageDomain)
    expect(recovered.getProfile(profile.id)).toMatchObject({ ...profile, revision: 7, createdAt: 100, updatedAt: 200 })
    await recovered.close()
    await ctx.loader.remove(second)
    expect(ctx.storage.backend.names()).toEqual([])
    expect(ctx.get('sessionPersistence')).toBeUndefined()
  })

  it.each(['json', 'sqlite'] as const)('rebuilds mismatched %s checkpoints from the authoritative migrated log', async backend => {
    const source = await workflow(backend)
    await source.invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target })
    await source.invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 })
    await source.invoke('spawn', { launchRequestId: '66666666-6666-4666-8666-666666666666', profileId: profile.id })
    const { default: Cache } = await import(pathToFileURL(join(project, '.dsh/harness/packages/session/session-projection-cache/lib/index.js')).href)
    await source.ctx.plugin(Cache, { writeEveryEvents: 100, writeIntervalMs: 1000 })
    const cache = source.ctx.get('sessionProjectionCache') as { write(session: typeof source.lead.agent.session): Promise<void> }
    await cache.write(source.lead.agent.session)
    await source.ctx.fiber.dispose()
    if (backend === 'json') {
      const path = join(source.root, 'storage/session_projcache/sessions/workflow-lead.json')
      const document = JSON.parse(readFileSync(path, 'utf8'))
      document.record.identity.createdAt += 1
      writeFileSync(path, JSON.stringify(document))
    } else {
      const db = new DatabaseSync(join(source.root, 'storage.sqlite'))
      try {
        const row = db.prepare('SELECT value FROM u_session_projcache_sessions WHERE key = ?').get('workflow-lead') as { value: string }
        const record = JSON.parse(row.value)
        record.identity.createdAt += 1
        db.prepare('UPDATE u_session_projcache_sessions SET value = ? WHERE key = ?').run(JSON.stringify(record), 'workflow-lead')
      } finally { db.close() }
    }
    const before = bytes(source.root)
    const parent = mkdtempSync(join(tmpdir(), 'ultra-checkpoint-migration-'))
    cleanups.push(async () => { rmSync(parent, { recursive: true, force: true }) })
    const destination = join(parent, 'target')
    const migrated = migrate(source.root, destination, backend)
    expect(migrated.status, migrated.stderr + migrated.stdout).toBe(0)
    const audited = spawnSync(process.execPath, [join(project, 'scripts/audit-migration.mjs'),
      '--sessions', join(destination, 'sessions'), `--${backend}`, join(destination, backend === 'json' ? 'storage' : 'storage.sqlite'),
    ], { encoding: 'utf8', cwd: project })
    expect(audited.status, audited.stderr + audited.stdout).toBe(0)
    expect(JSON.parse(audited.stdout).checkpoints).toContainEqual({ sessionId: 'workflow-lead', status: 'reusable' })
    expect(bytes(source.root)).toEqual(before)
  }, 10_000)

  it.each(['json', 'sqlite'] as const)('recovers an interrupted temporary %s publication without changing the source', async backend => {
    const source = await workflow(backend)
    await source.invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target })
    await source.ctx.fiber.dispose()
    mkdirSync(join(source.root, 'sessions'), { recursive: true })
    const before = bytes(source.root)
    const parent = mkdtempSync(join(tmpdir(), 'ultra-torn-publication-'))
    cleanups.push(async () => { rmSync(parent, { recursive: true, force: true }) })
    const reference = join(parent, 'reference')
    const accepted = migrate(source.root, reference, backend)
    expect(accepted.status, accepted.stderr + accepted.stdout).toBe(0)
    const artifact = Object.keys(bytes(reference)).find(name => backend === 'json'
      ? name.startsWith('storage/agent_team_ultra_v1/') : name === 'storage.sqlite')!
    const expected = readFileSync(join(reference, artifact))
    const destination = join(parent, 'target')
    const paused = migrate(source.root, destination, backend, ['--max-writes', '1'])
    expect(JSON.parse(paused.stdout)).toMatchObject({ code: 'MIGRATION_PAUSED' })
    const unfinished = join(destination, dirname(artifact), '.ultra-migration-write')
    mkdirSync(dirname(unfinished), { recursive: true })
    writeFileSync(unfinished, expected.subarray(0, Math.floor(expected.length / 2)))
    const resumed = migrate(source.root, destination, backend)
    expect(resumed.status, resumed.stderr + resumed.stdout).toBe(0)
    expect(Object.keys(bytes(destination))).not.toContain(artifact.replace(/[^/]+$/, '.ultra-migration-write'))
    const recovered = await storageContext(destination, backend)
    const store = await openDigitalEmployeeStorage(recovered.storageDomain)
    expect(store.getProfile(profile.id)).toMatchObject({ ...profile, revision: 1 })
    await store.close()
    await recovered.fiber.dispose()
    expect(bytes(source.root)).toEqual(before)
  }, 20_000)

  it.each(['json', 'sqlite'] as const)('refuses divergent %s artifacts and source identities without overwriting either side', async backend => {
    const source = await workflow(backend)
    await source.invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target })
    await source.ctx.fiber.dispose()
    mkdirSync(join(source.root, 'sessions'), { recursive: true })
    const before = bytes(source.root)
    const parent = mkdtempSync(join(tmpdir(), 'ultra-divergent-target-'))
    cleanups.push(async () => { rmSync(parent, { recursive: true, force: true }) })
    for (const conflict of ['artifact', 'source', 'temporary'] as const) {
      const destination = join(parent, conflict)
      const paused = migrate(source.root, destination, backend, ['--max-writes', '2'])
      expect(JSON.parse(paused.stdout)).toMatchObject({ code: 'MIGRATION_PAUSED' })
      if (conflict === 'source') {
        const path = join(destination, 'ultra-migration-manifest.json')
        const manifest = JSON.parse(readFileSync(path, 'utf8'))
        manifest.sourceDigest = 'a'.repeat(64)
        writeFileSync(path, JSON.stringify(manifest))
      } else if (conflict === 'temporary') {
        writeFileSync(join(destination, '.ultra-migration-write'), 'unrelated PRIVATE_OUTPUT')
      } else {
        const artifact = Object.keys(bytes(destination)).find(name => name !== 'ultra-migration-manifest.json' && name !== '.ultra-migration.lock')!
        appendFileSync(join(destination, artifact), 'unrelated PRIVATE_OUTPUT')
      }
      const targetBefore = bytes(destination)
      const refused = migrate(source.root, destination, backend)
      expect(refused.status, refused.stderr + refused.stdout).toBe(1)
      expect(JSON.parse(refused.stdout)).toMatchObject({ ok: false, code: 'MIGRATION_TARGET_DIVERGED', sourcePreserved: true })
      expect(refused.stdout + refused.stderr).not.toContain('PRIVATE_OUTPUT')
      expect(bytes(destination)).toEqual(targetBefore)
      expect(bytes(source.root)).toEqual(before)
    }
  }, 30_000)

  it('refuses source overlap even when the operator reached the source through a directory alias', async () => {
    const source = await workflow()
    await source.invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target })
    await source.ctx.fiber.dispose()
    mkdirSync(join(source.root, 'sessions'), { recursive: true })
    const before = bytes(source.root)
    const parent = mkdtempSync(join(tmpdir(), 'ultra-source-alias-'))
    cleanups.push(async () => { rmSync(parent, { recursive: true, force: true }) })
    const alias = join(parent, 'source')
    symlinkSync(source.root, alias, 'dir')
    const result = migrate(alias, join(source.root, 'sessions/target'))
    expect(result.status, result.stderr + result.stdout).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: 'MIGRATION_TARGET_OVERLAP' })
    expect(bytes(source.root)).toEqual(before)
  })

  it.each(['json', 'sqlite'] as const)('retains historical %s evaluation evidence but invalidates its gate after migration and cold startup', async backend => {
    const source = await workflow(backend)
    source.lead.agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'Prepare an immutable historical evaluation.' }],
      source: { kind: 'plugin', plugin: 'migration-acceptance' },
    }))
    await source.lead.agent.whenIdle()
    await source.invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target })
    const evalSet: DigitalEmployeeEvalSetDraft = {
      id: 'migration-eval', profileId: profile.id, displayName: 'Migration evaluation', toolAllowlist: ['read'],
      resourceCeilings: { maxSteps: 2, maxOutputTokens: 256, maxElapsedMs: 5_000 }, passPolicy: { kind: 'all' },
      cases: [{
        id: 'finding', title: 'One finding', input: 'Report one finding.', fixtures: [{ id: 'source', content: 'const value = 1' }],
        assertions: { acceptedTerminals: ['completed'], requiredTools: [], forbiddenTools: [],
          requiredOutputSubstrings: ['finding'], forbiddenOutputSubstrings: [], maxReportedTokens: 100 },
      }],
    }
    await expect(source.invoke('saveEvalSet', { expectedHeadRevision: null, evalSet })).resolves.toMatchObject({ ok: true })
    await expect(source.invoke('setEvalGate', {
      profileId: profile.id, expectedHeadRevision: 1, requiredEvalSet: { evalSetId: evalSet.id, revision: 1 },
    })).resolves.toMatchObject({ ok: true })
    const evalRunId = '33333333-3333-4333-8333-333333333333'
    await expect(source.invoke('startEvalRun', {
      evalRunId, profileId: profile.id, profileRevision: 1, evalSetId: evalSet.id, evalSetRevision: 1,
    })).resolves.toMatchObject({ ok: true })
    await expect.poll(async () => ((await source.invoke('view')) as DigitalEmployeeStudioView).profiles[0]?.promotionGate.status).toBe('passed')
    const history = await source.invoke('evalRun', { evalRunId })
    expect(history).toMatchObject({ ok: true, value: { run: { status: 'passed' } } })
    await source.ctx.fiber.dispose()
    const before = bytes(source.root)
    const parent = mkdtempSync(join(tmpdir(), 'ultra-evaluation-migration-'))
    cleanups.push(async () => { rmSync(parent, { recursive: true, force: true }) })
    const destination = join(parent, 'target')
    const result = migrate(source.root, destination, backend)
    expect(result.status, result.stderr + result.stdout).toBe(0)
    const resumed = await workflow(backend, { root: destination, resumeLead: true })
    const view = await resumed.invoke('view') as DigitalEmployeeStudioView
    expect(view.profiles[0]).toMatchObject({ head: { headRevision: 2, latestRevision: 1 }, promotionGate: { status: 'invalidated' } })
    expect(await resumed.invoke('evalRun', { evalRunId })).toEqual(history)
    await expect(resumed.invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 2 }))
      .resolves.toMatchObject({ ok: false, error: { code: 'promotion-gate-failed' } })
    await resumed.ctx.fiber.dispose()
    expect(bytes(source.root)).toEqual(before)
  }, 15_000)

  it('refuses a Loader configuration that mixes migrated Sessions with unrelated storage', async () => {
    const source = await workflow()
    await source.invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target })
    await source.ctx.fiber.dispose()
    mkdirSync(join(source.root, 'sessions'), { recursive: true })
    const parent = mkdtempSync(join(tmpdir(), 'ultra-mixed-migration-roots-'))
    cleanups.push(async () => { rmSync(parent, { recursive: true, force: true }) })
    const destination = join(parent, 'target')
    const migrated = migrate(source.root, destination)
    expect(migrated.status, migrated.stderr + migrated.stdout).toBe(0)
    const before = bytes(parent)
    const ctx = new Context()
    cleanups.push(async () => { await ctx.fiber.dispose() })
    await ctx.plugin(Storage)
    await ctx.plugin(Loader)
    const resolver = createRequire(join(project, 'packages/profile/package.json'))
    await expect(ctx.loader.create({
      name: pathToFileURL(resolver.resolve('@benz-ai-x/dsh-agent-team-ultra-profile/data')).href,
      config: { sessions: { root: join(destination, 'sessions') }, storage: { backend: 'json', root: join(parent, 'unrelated') } },
    })).rejects.toThrow(/Joint migration completion does not match/)
    expect(ctx.get('sessionPersistence')).toBeUndefined()
    expect(ctx.storage.backend.names()).toEqual([])
    expect(bytes(parent)).toEqual(before)
  }, 10_000)

  it('refuses a different storage directory inside the completed migration before it can create an empty domain', async () => {
    const source = await workflow()
    await source.invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target })
    await source.ctx.fiber.dispose()
    mkdirSync(join(source.root, 'sessions'), { recursive: true })
    const parent = mkdtempSync(join(tmpdir(), 'ultra-exact-migration-layout-'))
    cleanups.push(async () => { rmSync(parent, { recursive: true, force: true }) })
    const destination = join(parent, 'target')
    const migrated = migrate(source.root, destination)
    expect(migrated.status, migrated.stderr + migrated.stdout).toBe(0)
    const before = bytes(parent)
    const ctx = new Context()
    cleanups.push(async () => { await ctx.fiber.dispose() })
    await ctx.plugin(Storage)
    await ctx.plugin(Loader)
    const resolver = createRequire(join(project, 'packages/profile/package.json'))
    await expect(ctx.loader.create({
      name: pathToFileURL(resolver.resolve('@benz-ai-x/dsh-agent-team-ultra-profile/data')).href,
      config: { sessions: { root: join(destination, 'sessions') }, storage: { backend: 'json', root: join(destination, 'storages') } },
    })).rejects.toThrow(/Joint migration completion does not match/)
    expect(ctx.get('sessionPersistence')).toBeUndefined()
    expect(ctx.storage.backend.names()).toEqual([])
    expect(bytes(parent)).toEqual(before)
  }, 10_000)

  it.each(['json', 'sqlite'] as const)('rebuilds the missing %s Run Index before the completion marker opens the target', async backend => {
    const source = await workflow(backend)
    await source.invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target })
    await source.invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 })
    const launched = await source.invoke('spawn', {
      launchRequestId: '66666666-6666-4666-8666-666666666666', profileId: profile.id,
    }) as SpawnDigitalEmployeeResult
    if (!launched.ok || !launched.value.memberId) throw new Error('employee launch failed')
    await expect.poll(() => source.ctx.agents.get(SessionId(launched.value.memberId!))).toBeUndefined()
    expect(((await source.invoke('view')) as DigitalEmployeeStudioView).runs).toHaveLength(1)
    await source.ctx.fiber.dispose()
    const cacheOwner = await storageContext(source.root, backend)
    const domain = await cacheOwner.storageDomain.open(digitalEmployeeV1DomainSpec)
    for (const key of [...domain.table('run_index').keys()]) await domain.table('run_index').delete(key)
    await domain.close()
    await cacheOwner.fiber.dispose()
    const before = bytes(source.root)
    const parent = mkdtempSync(join(tmpdir(), 'ultra-run-index-migration-'))
    cleanups.push(async () => { rmSync(parent, { recursive: true, force: true }) })
    const destination = join(parent, 'target')
    const result = migrate(source.root, destination, backend)
    expect(result.status, result.stderr + result.stdout).toBe(0)
    const targetOwner = await storageContext(destination, backend)
    const store = await openDigitalEmployeeStorage(targetOwner.storageDomain)
    const runs = [...store.runEntries()].map(([, run]) => run)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      owner: { kind: 'team-member', memberId: launched.value.memberId },
      canonicalSource: { kind: 'dsh-session', sessionId: launched.value.memberId, turn: 1 },
      profileId: profile.id, profileRevision: 1, terminal: 'completed',
    })
    expect(JSON.stringify(runs)).not.toContain('PRIVATE_OUTPUT')
    await store.close()
    await targetOwner.fiber.dispose()
    expect(bytes(source.root)).toEqual(before)
  }, 10_000)

  it.each(['json', 'sqlite'] as const)('rebuilds native %s Run correlations without starting a process or claiming native completion', async backend => {
    const source = await workflow(backend)
    const runtimeRequire = createRequire(join(project, 'packages/codex/lib/index.js'))
    const manifestPath = runtimeRequire.resolve('@openai/codex/package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const native = new NativeProduct(join(source.root, 'native.json'), resolve(dirname(manifestPath), manifest.bin.codex))
    const { default: Subprocess } = await import(pathToFileURL(join(project, '.dsh/harness/packages/subprocess/subprocess/lib/index.js')).href)
    class NativeTransport extends Subprocess {
      resolveExecutable() { throw new Error('must not search PATH') }
      spawnTerminal() { throw new Error('must use the qualified product transport') }
      spawn(spec: unknown) { return native.open(spec) }
    }
    await source.ctx.plugin(NativeTransport)
    await source.ctx.plugin(Codex, { catalogOwnerService: 'digitalEmployees', sandbox: 'read-only' })
    await source.invoke('save', { expectedHeadRevision: null, profile: { ...profile, continuationProvider: '' },
      runtimeTarget: { kind: 'external-agent', provider: 'codex' } })
    await source.invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 })
    const launched = await source.invoke('spawn', {
      launchRequestId: '88888888-8888-4888-8888-888888888888', profileId: profile.id,
    }) as SpawnDigitalEmployeeResult
    if (!launched.ok || !launched.value.nativeRuntimeHandle) throw new Error('native launch failed')
    native.complete()
    await expect.poll(async () => ((await source.invoke('view')) as DigitalEmployeeStudioView).instances[0]?.runtimePresence).toBe('idle')
    const nativeHandle = launched.value.nativeRuntimeHandle
    await expect(source.ctx.agentTeams.sendMessage(source.lead.agent, {
      target: profile.employeeName, content: [{ type: 'text', text: 'Continue the same native employee.' }],
      signal: new AbortController().signal,
    })).resolves.toMatchObject({ status: 'accepted' })
    native.complete()
    await expect.poll(async () => ((await source.invoke('view')) as DigitalEmployeeStudioView).instances[0]?.runtimePresence).toBe('idle')
    const nativeTurnIds = native.data.threads[nativeHandle].turns.map((turn: { id: string }) => turn.id)
    expect(nativeTurnIds).toHaveLength(2)
    await source.ctx.fiber.dispose()
    const cacheOwner = await storageContext(source.root, backend)
    const domain = await cacheOwner.storageDomain.open(digitalEmployeeV1DomainSpec)
    for (const key of [...domain.table('run_index').keys()]) await domain.table('run_index').delete(key)
    await domain.close()
    await cacheOwner.fiber.dispose()
    const before = bytes(source.root)
    const parent = mkdtempSync(join(tmpdir(), 'ultra-native-run-migration-'))
    cleanups.push(async () => { rmSync(parent, { recursive: true, force: true }) })
    const destination = join(parent, 'target')
    const result = migrate(source.root, destination, backend)
    expect(result.status, result.stderr + result.stdout).toBe(0)
    const targetOwner = await storageContext(destination, backend)
    const store = await openDigitalEmployeeStorage(targetOwner.storageDomain)
    const runs = [...store.runEntries()].map(([, run]) => run)
    expect(runs).toHaveLength(2)
    for (const nativeTurnId of nativeTurnIds) expect(runs).toContainEqual(expect.objectContaining({
      canonicalSource: { kind: 'external-native', provider: 'codex', nativeHandle, nativeTurnId },
      owner: { kind: 'team-member', memberId: launched.value.memberId, memberName: profile.employeeName },
      terminal: 'unknown-terminal', completeness: expect.objectContaining({ status: 'incomplete' }),
    }))
    expect(JSON.stringify(runs)).not.toMatch(/PRIVATE_OUTPUT|PRIVATE_REASONING|PRIVATE_COMMENTARY/)
    await store.close()
    await targetOwner.fiber.dispose()
    expect(bytes(source.root)).toEqual(before)
    expect(native.starts).toBe(1)
  }, 15_000)
})
