import { DatabaseSync } from 'node:sqlite'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as JsonStorage from '@deepseek-ai/dsh-storage-json'
import * as SqliteStorage from '@deepseek-ai/dsh-storage-sqlite'
import { digitalEmployeeDomainSpec } from '../src/spec.ts'
import { openDigitalEmployeeStorage } from '../src/storage.ts'
import { SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it, vi } from 'vitest'
import { profile, target, workflow } from './fixtures/host-workflow.ts'
import * as Codex from '../../codex/lib/index.js'
import { NativeProduct } from '../../codex/tests/fixtures/native-product.mjs'
import type { DigitalEmployeeStudioView, SpawnDigitalEmployeeResult } from '../src/types.ts'

const project = resolve(import.meta.dirname, '../../..')
function bytes(root: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      for (const [name, digest] of Object.entries(bytes(path))) result[`${entry.name}/${name}`] = digest
    } else result[entry.name] = createHash('sha256').update(readFileSync(path)).digest('hex')
  }
  return result
}

async function created(backend: 'json' | 'sqlite' = 'json', checkpoints = false) {
  const { ctx, invoke, root, lead } = await workflow(backend)
  if (checkpoints) {
    const { default: Cache } = await import(pathToFileURL(join(project, '.dsh/harness/packages/session/session-projection-cache/lib/index.js')).href)
    await ctx.plugin(Cache, { writeEveryEvents: 100, writeIntervalMs: 1000 })
  }
  await invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target })
  await invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 })
  const launched = await invoke('spawn', {
    launchRequestId: '66666666-6666-4666-8666-666666666666', profileId: profile.id,
  }) as SpawnDigitalEmployeeResult
  expect(launched.ok).toBe(true)
  if (!launched.ok || !launched.value.memberId) throw new Error('missing created employee')
  await ctx.agents.get(SessionId(launched.value.memberId))?.whenIdle()
  if (checkpoints) {
    const cache = ctx.get('sessionProjectionCache') as { write(session: typeof lead.agent.session): Promise<void> }
    await cache.write(lead.agent.session)
  }
  await ctx.fiber.dispose()
  return { root, launched, leadId: lead.agent.id }
}

function audit(root: string, backend: 'json' | 'sqlite' = 'json') {
  return spawnSync(process.execPath, [join(project, 'scripts/audit-migration.mjs'),
    '--sessions', join(root, 'sessions'), `--${backend}`, join(root, backend === 'json' ? 'storage' : 'storage.sqlite'),
  ], { cwd: project, encoding: 'utf8' })
}

async function storageContext(root: string, backend: 'json' | 'sqlite') {
  const ctx = new Context()
  await ctx.plugin(Storage)
  if (backend === 'json') await ctx.plugin(JsonStorage, { root: join(root, 'storage') })
  else await ctx.plugin(SqliteStorage, { path: join(root, 'storage.sqlite'), journalMode: 'delete' })
  await ctx.plugin(StorageDomain, { backend })
  return ctx
}

async function legacySource(root: string, backend: 'json' | 'sqlite') {
  let binding: any
  if (backend === 'json') {
    const directory = join(root, 'storage/agent_team_ultra_v1/bindings')
    binding = JSON.parse(readFileSync(join(directory, readdirSync(directory)[0]!), 'utf8')).record
  } else {
    const db = new DatabaseSync(join(root, 'storage.sqlite'), { readOnly: true })
    try { binding = JSON.parse((db.prepare('SELECT value FROM u_agent_team_ultra_v1_bindings').get() as { value: string }).value) }
    finally { db.close() }
  }
  const { continuationProvider, ...fields } = binding.profile
  const legacyProfile = { ...fields, provider: continuationProvider }
  const ctx = await storageContext(root, backend)
  try {
    const source = await ctx.storageDomain.open(digitalEmployeeDomainSpec)
    await source.table('profiles').put(legacyProfile.id, legacyProfile)
    await source.table('bindings').put(JSON.stringify([binding.teamId, binding.memberName]), {
      teamId: binding.teamId, memberName: binding.memberName, memberId: binding.memberId,
      profileId: binding.profileId, profileRevision: binding.profileRevision, profile: legacyProfile, phase: 'active',
    })
    await source.close()
  } finally { await ctx.fiber.dispose() }
  if (backend === 'json') rmSync(join(root, 'storage/agent_team_ultra_v1'), { recursive: true })
  else {
    const db = new DatabaseSync(join(root, 'storage.sqlite'))
    try {
      for (const table of db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all() as { name: string }[]) {
        if (table.name.startsWith('u_agent_team_ultra_v1_')) db.exec(`DROP TABLE "${table.name}"`)
      }
      db.prepare('DELETE FROM unit_globals WHERE unit = ?').run('agent_team_ultra_v1')
      db.prepare('DELETE FROM units WHERE name = ?').run('agent_team_ultra_v1')
    } finally { db.close() }
  }
}

async function mutateSession(root: string, id: string, change: (rows: any[]) => void) {
  const relative = Object.keys(bytes(root)).find(name => name.endsWith(`/${id}/session.jsonl.zstd`))!
  const path = join(root, relative)
  const zstd = await import(pathToFileURL(join(project, '.dsh/harness/packages/session/session-persistence-jsonl/lib/types/zstd.js')).href)
  const source = readFileSync(path)
  const decoder = zstd.createZstdFrameDecoder()
  let plaintext: Buffer
  try { plaintext = Buffer.concat(Array.from(decoder.decode(source, zstd.scanZstdFrames(source).frames), chunk => Buffer.from(chunk as Uint8Array))) }
  finally { decoder.close() }
  const rows = plaintext.toString('utf8').trimEnd().split('\n').map(row => JSON.parse(row))
  change(rows)
  const [header, ...events] = rows
  writeFileSync(path, Buffer.concat([
    await zstd.compressZstdFrame(JSON.stringify(header) + '\n'),
    await zstd.compressZstdFrame(events.map(row => JSON.stringify(row)).join('\n') + '\n'),
  ]))
}

describe('operator migration audit', () => {
  it.each(['json', 'sqlite'] as const)('reads a real Session, Team projection and %s Binding without changing the source', async backend => {
    const { root, launched } = await created(backend)
    const before = bytes(root)
    const result = audit(root, backend)
    expect(result.status, result.stderr + result.stdout).toBe(0)
    const report = JSON.parse(result.stdout)
    expect(report).toMatchObject({
      ok: true,
      sourceFormats: { session: 0, teamEvent: 2, teamProjection: 3, ultraDomain: 'agent_team_ultra_v1', ultraVersion: 1 },
      migration: {
        sourcePreserved: true, bidirectionalWrites: false, targetWrites: 'closed-until-complete',
        executionAvailable: false,
        targetFormats: { session: 2, teamEvent: 3, teamProjection: 4, subagentDescriptor: 3, ultraDomain: 'agent_team_ultra_v1', ultraVersion: 1 },
        order: ['freeze-source', 'create-isolated-target', 'convert-session-codec', 'convert-team-payloads', 'validate-ultra-records', 'rebuild-projections', 'verify-identities', 'commit-completion-marker'],
      },
    })
    expect(report.bindings).toContainEqual(expect.objectContaining({
      memberId: launched.value.memberId, profileId: profile.id, profileRevision: 1, runtimeTarget: target,
    }))
    expect(JSON.stringify(report)).not.toMatch(/PRIVATE_OUTPUT|Review carefully\.|Report a finding\./)
    expect(bytes(root)).toEqual(before)
  })

  it.each(['json', 'sqlite'] as const)('audits a transitional %s v1 Binding without rewriting its legacy fields', async backend => {
    const { root, launched } = await created(backend)
    const transitional = (record: any) => {
      record.phase = record.provisioningPhase
      delete record.provisioningPhase
      delete record.requiredCapabilities
      const { continuationProvider, ...fields } = record.profile
      record.profile = { ...fields, provider: continuationProvider }
      return record
    }
    if (backend === 'json') {
      const directory = join(root, 'storage/agent_team_ultra_v1/bindings')
      const path = join(directory, readdirSync(directory)[0]!)
      const envelope = JSON.parse(readFileSync(path, 'utf8'))
      envelope.record = transitional(envelope.record)
      writeFileSync(path, JSON.stringify(envelope))
    } else {
      const db = new DatabaseSync(join(root, 'storage.sqlite'))
      try {
        const row = db.prepare('SELECT key, value FROM u_agent_team_ultra_v1_bindings').get() as { key: string; value: string }
        db.prepare('UPDATE u_agent_team_ultra_v1_bindings SET value = ? WHERE key = ?')
          .run(JSON.stringify(transitional(JSON.parse(row.value))), row.key)
      } finally { db.close() }
    }
    const before = bytes(root)
    const result = audit(root, backend)
    expect(result.status, result.stderr + result.stdout).toBe(0)
    const report = JSON.parse(result.stdout)
    expect(report.ultraMigration.status).toBe('complete')
    expect(report.bindings).toContainEqual(expect.objectContaining({
      memberId: launched.value.memberId, profileId: profile.id, profileRevision: 1, runtimeTarget: target,
    }))
    expect(bytes(root)).toEqual(before)
  })

  it.each(['identity', 'route'] as const)('refuses a Binding whose %s conflicts with the authoritative Team log', async conflict => {
    const { root } = await created()
    const directory = join(root, 'storage/agent_team_ultra_v1/bindings')
    const path = join(directory, readdirSync(directory)[0]!)
    const envelope = JSON.parse(readFileSync(path, 'utf8'))
    if (conflict === 'identity') envelope.record.memberId = '77777777-7777-4777-8777-777777777777'
    else envelope.record.resolvedRuntimeTarget.model = 'unrelated-model'
    writeFileSync(path, JSON.stringify(envelope))
    const before = bytes(root)
    const result = audit(root)
    expect(result.status, result.stderr + result.stdout).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: conflict === 'identity' ? 'AUDIT_BINDING_IDENTITY' : 'AUDIT_BINDING_ROUTE' })
    expect(bytes(root)).toEqual(before)
  })

  it.each(['json', 'sqlite'] as const)('audits real %s checkpoints against canonical log cuts without rewriting them', async backend => {
    const { root, leadId } = await created(backend, true)
    const cachePath = join(root, 'storage/session_projcache/sessions', `${leadId}.json`)
    let original: { version: number; record: Record<string, any> }
    if (backend === 'json') original = JSON.parse(readFileSync(cachePath, 'utf8'))
    else {
      const db = new DatabaseSync(join(root, 'storage.sqlite'), { readOnly: true })
      try {
        const row = db.prepare('SELECT value FROM u_session_projcache_sessions WHERE key = ?').get(leadId) as { value: string }
        original = { version: 6, record: JSON.parse(row.value) }
      } finally { db.close() }
    }
    for (const reason of ['reusable', 'projection-version', 'session-identity', 'checkpoint-ahead', 'checkpoint-state']) {
      const envelope = structuredClone(original)
      if (reason === 'projection-version') envelope.record.rows.agentTeam.ver = 999
      if (reason === 'session-identity') envelope.record.identity.createdAt += 1
      if (reason === 'checkpoint-ahead') envelope.record.rows.agentTeam.seq += 100
      if (reason === 'checkpoint-state') envelope.record.rows.agentTeam.val.members = []
      if (backend === 'json') writeFileSync(cachePath, JSON.stringify(envelope))
      else {
        const db = new DatabaseSync(join(root, 'storage.sqlite'))
        try { db.prepare('UPDATE u_session_projcache_sessions SET value = ? WHERE key = ?').run(JSON.stringify(envelope.record), leadId) }
        finally { db.close() }
      }
      const before = bytes(root)
      const result = audit(root, backend)
      expect(result.status, result.stderr + result.stdout).toBe(0)
      expect(JSON.parse(result.stdout).checkpoints).toContainEqual(expect.objectContaining({
        sessionId: leadId, status: reason === 'reusable' ? 'reusable' : 'rebuild',
        ...(reason === 'reusable' ? {} : { reason }),
      }))
      expect(bytes(root)).toEqual(before)
    }
  })

  it('reports unreadable legacy checkpoints for rebuilding without changing the source', async () => {
    const { root, leadId } = await created('json', true)
    rmSync(join(root, 'storage/session_projcache'), { recursive: true })
    writeFileSync(join(root, 'storage/session_projcache.json'), '{"unit":')
    const before = bytes(root)
    const result = audit(root)
    expect(result.status, result.stderr + result.stdout).toBe(0)
    expect(JSON.parse(result.stdout).checkpoints).toContainEqual({
      sessionId: leadId, status: 'rebuild', reason: 'cache-unreadable',
    })
    expect(bytes(root)).toEqual(before)
  })

  it('refuses a schema-valid Profile Head that points outside its durable Revision history', async () => {
    const { root } = await created()
    const path = join(root, 'storage/agent_team_ultra_v1/profile_heads', `${profile.id}.json`)
    const envelope = JSON.parse(readFileSync(path, 'utf8'))
    envelope.record.latestRevision += 1
    writeFileSync(path, JSON.stringify(envelope))
    const before = bytes(root)
    const result = audit(root)
    expect(result.status, result.stderr + result.stdout).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: 'AUDIT_ULTRA_CONFLICT' })
    expect(bytes(root)).toEqual(before)
  })

  it.each(['json', 'sqlite'] as const)('reports a real %s v0 source and its v1 migration path without creating the target generation', async backend => {
    const { root, launched } = await created(backend)
    await legacySource(root, backend)
    const before = bytes(root)
    const result = audit(root, backend)
    expect(result.status, result.stderr + result.stdout).toBe(0)
    const report = JSON.parse(result.stdout)
    expect(report.sourceFormats).toMatchObject({ ultraDomain: 'agent_team_ultra', ultraVersion: 0 })
    expect(report.ultraMigration).toMatchObject({ status: 'required', sourceVersion: 0, targetVersion: 1 })
    expect(report.bindings).toContainEqual(expect.objectContaining({ memberId: launched.value.memberId, profileRevision: 1 }))
    expect(bytes(root)).toEqual(before)
  })

  it.each(['json', 'sqlite'] as const)('audits an interrupted %s migration idempotently and refuses target divergence', async backend => {
    const { root } = await created(backend)
    await legacySource(root, backend)
    const ctx = await storageContext(root, backend)
    const interrupted = new Error('test interruption after the first durable Revision')
    try {
      await expect(openDigitalEmployeeStorage(ctx.storageDomain, {
        migrationHooks: { afterRecord: () => { throw interrupted } },
      })).rejects.toBe(interrupted)
    } finally { await ctx.fiber.dispose() }
    const before = bytes(root)
    const first = audit(root, backend)
    const retry = audit(root, backend)
    expect(first.status, first.stderr + first.stdout).toBe(0)
    expect(retry.status, retry.stderr + retry.stdout).toBe(0)
    expect(retry.stdout).toBe(first.stdout)
    expect(JSON.parse(first.stdout).ultraMigration).toMatchObject({ status: 'pending' })
    expect(bytes(root)).toEqual(before)
    if (backend === 'json') {
      const directory = join(root, 'storage/agent_team_ultra_v1/profile_revisions')
      const path = join(directory, readdirSync(directory)[0]!)
      const envelope = JSON.parse(readFileSync(path, 'utf8'))
      envelope.record.updatedAt += 1
      writeFileSync(path, JSON.stringify(envelope))
    } else {
      const db = new DatabaseSync(join(root, 'storage.sqlite'))
      try {
        const row = db.prepare('SELECT key, value FROM u_agent_team_ultra_v1_profile_revisions').get() as { key: string; value: string }
        const record = JSON.parse(row.value)
        record.updatedAt += 1
        db.prepare('UPDATE u_agent_team_ultra_v1_profile_revisions SET value = ? WHERE key = ?').run(JSON.stringify(record), row.key)
      } finally { db.close() }
    }
    const divergent = bytes(root)
    const rejected = audit(root, backend)
    expect(rejected.status, rejected.stderr + rejected.stdout).toBe(1)
    expect(JSON.parse(rejected.stdout)).toMatchObject({ ok: false, code: 'AUDIT_MIGRATION_CONFLICT' })
    expect(bytes(root)).toEqual(divergent)
  })

  it.each(['handle', 'requirements'] as const)('matches a real Codex adapter Binding to its committed native %s', async field => {
    const { ctx, invoke, root } = await workflow()
    const runtimeRequire = createRequire(join(project, 'packages/codex/lib/index.js'))
    const manifestPath = runtimeRequire.resolve('@openai/codex/package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const native = new NativeProduct(join(root, 'native.json'), resolve(dirname(manifestPath), manifest.bin.codex))
    const { default: Subprocess } = await import(pathToFileURL(join(project, '.dsh/harness/packages/subprocess/subprocess/lib/index.js')).href)
    class NativeTransport extends Subprocess {
      resolveExecutable() { throw new Error('Codex must not search PATH') }
      spawnTerminal() { throw new Error('Codex must use the qualified product transport') }
      spawn(spec: unknown) { return native.open(spec) }
    }
    await ctx.plugin(NativeTransport)
    await ctx.plugin(Codex, { catalogOwnerService: 'digitalEmployees', sandbox: 'read-only' })
    await invoke('save', { expectedHeadRevision: null, profile: { ...profile, continuationProvider: '' },
      runtimeTarget: { kind: 'external-agent', provider: 'codex' },
    })
    await invoke('activate', { profileId: profile.id, revision: 1, expectedHeadRevision: 1 })
    const launched = await invoke('spawn', {
      launchRequestId: '88888888-8888-4888-8888-888888888888', profileId: profile.id,
    }) as SpawnDigitalEmployeeResult
    expect(launched.ok).toBe(true)
    if (!launched.ok) throw new Error('native launch failed')
    native.complete()
    await vi.waitFor(async () => {
      expect((await invoke('view') as DigitalEmployeeStudioView).instances[0]?.runtimePresence).toBe('idle')
    })
    await ctx.fiber.dispose()
    const accepted = audit(root)
    expect(accepted.status, accepted.stderr + accepted.stdout).toBe(0)
    expect(JSON.parse(accepted.stdout).bindings).toContainEqual(expect.objectContaining({ nativeRuntimeHandle: launched.value.nativeRuntimeHandle }))
    expect(JSON.parse(accepted.stdout).nativeCorrelations).toContainEqual(expect.objectContaining({
      memberId: launched.value.memberId, nativeRuntimeHandle: launched.value.nativeRuntimeHandle,
      nativeTurnId: expect.any(String), kind: 'initial',
    }))
    const directory = join(root, 'storage/agent_team_ultra_v1/bindings')
    const path = join(directory, readdirSync(directory)[0]!)
    const envelope = JSON.parse(readFileSync(path, 'utf8'))
    if (field === 'handle') {
      envelope.record.nativeRuntimeHandle = '99999999-9999-4999-8999-999999999999'
      writeFileSync(path, JSON.stringify(envelope))
    } else await mutateSession(root, envelope.record.teamId, rows => {
      for (const row of rows.filter(row => row.type === 'team/member')) {
        row.data.member.externalRuntime.requirements.runtimeCapabilities = ['evidence']
      }
    })
    const before = bytes(root)
    const result = audit(root)
    expect(result.status, result.stderr + result.stdout).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: 'AUDIT_NATIVE_IDENTITY' })
    expect(bytes(root)).toEqual(before)
  })

  it('refuses unknown Team recovery facts even when a newer writer marks them ignorable', async () => {
    const { root, leadId } = await created()
    const path = Object.keys(bytes(root)).find(name => name.endsWith(`/${leadId}/session.jsonl.zstd`))!
    const absolute = join(root, path)
    const zstd = await import(pathToFileURL(join(project, '.dsh/harness/packages/session/session-persistence-jsonl/lib/types/zstd.js')).href)
    const format = await import(pathToFileURL(join(project, '.dsh/harness/packages/session/session-persistence-jsonl/lib/types/format.js')).href)
    const source = readFileSync(absolute)
    const decoder = zstd.createZstdFrameDecoder()
    let plaintext: Buffer
    try { plaintext = Buffer.concat(Array.from(decoder.decode(source, zstd.scanZstdFrames(source).frames), chunk => Buffer.from(chunk as Uint8Array))) }
    finally { decoder.close() }
    const log = format.scanLog(plaintext)
    appendFileSync(absolute, await zstd.compressZstdFrame(JSON.stringify({
      type: 'team/future-required', seq: log.events.length, time: Date.now(), ignorable: true,
      data: { version: 3, teamId: leadId },
    }) + '\n'))
    const before = bytes(root)
    const result = audit(root)
    expect(result.status, result.stderr + result.stdout).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: 'AUDIT_TEAM_VOCABULARY' })
    expect(bytes(root)).toEqual(before)
  })

  it('refuses a valid child descriptor whose route conflicts with the permanent Team member', async () => {
    const { root, launched } = await created()
    await mutateSession(root, launched.value.memberId!, rows => {
      rows.find(row => row.type === 'subagent/descriptor').data.agentModel = 'unrelated-model'
    })
    const before = bytes(root)
    const result = audit(root)
    expect(result.status, result.stderr + result.stdout).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: 'AUDIT_DESCRIPTOR_IDENTITY' })
    expect(bytes(root)).toEqual(before)
  })

  it('refuses an unrecognized Session layout instead of reporting an empty source', async () => {
    const { root } = await created()
    for (const name of Object.keys(bytes(root)).filter(name => name.endsWith('/session.jsonl.zstd'))) {
      renameSync(join(root, name), join(root, name.replace('session.jsonl.zstd', 'future-session.data')))
    }
    const before = bytes(root)
    const result = audit(root)
    expect(result.status, result.stderr + result.stdout).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: 'AUDIT_SESSION_LAYOUT' })
    expect(bytes(root)).toEqual(before)
  })

  it.each(['session', 'team', 'descriptor', 'envelope', 'generation'] as const)('refuses a future %s format without rewriting the source', async layer => {
    const { root, launched, leadId } = await created()
    const codes = {
      session: 'AUDIT_SESSION_FORMAT', team: 'AUDIT_TEAM_EVENT', descriptor: 'AUDIT_DESCRIPTOR_VERSION',
      envelope: 'AUDIT_ULTRA_VERSION', generation: 'AUDIT_ULTRA_GENERATION',
    }
    if (layer === 'session') await mutateSession(root, leadId, rows => { rows[0].version = 999 })
    if (layer === 'team') await mutateSession(root, leadId, rows => { rows.find(row => row.type === 'team/member').data.version = 999 })
    if (layer === 'descriptor') await mutateSession(root, launched.value.memberId!, rows => { rows.find(row => row.type === 'subagent/descriptor').data.version = 999 })
    if (layer === 'envelope') {
      const path = join(root, 'storage/agent_team_ultra_v1/global.json')
      const envelope = JSON.parse(readFileSync(path, 'utf8'))
      envelope.version = 999
      writeFileSync(path, JSON.stringify(envelope))
    }
    if (layer === 'generation') mkdirSync(join(root, 'storage/agent_team_ultra_v999'))
    const before = bytes(root)
    const result = audit(root)
    expect(result.status, result.stderr + result.stdout).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: codes[layer] })
    expect(bytes(root)).toEqual(before)
  })

  it.each(['physical', 'unit'] as const)('refuses a future SQLite %s version without opening a business domain', async layer => {
    const { root } = await created('sqlite')
    const db = new DatabaseSync(join(root, 'storage.sqlite'))
    try {
      if (layer === 'physical') db.exec('PRAGMA user_version = 999')
      else db.prepare('UPDATE units SET version = ? WHERE name = ?').run(999, 'agent_team_ultra_v1')
    } finally { db.close() }
    const before = bytes(root)
    const result = audit(root, 'sqlite')
    expect(result.status, result.stderr + result.stdout).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: layer === 'physical' ? 'AUDIT_SQLITE_VERSION' : 'AUDIT_ULTRA_VERSION' })
    expect(bytes(root)).toEqual(before)
  })

  it.each(['transitional', 'conflicting'] as const)('validates a %s Revision fingerprint using the admission contract without writing it', async kind => {
    const { root } = await created()
    const directory = join(root, 'storage/agent_team_ultra_v1/profile_revisions')
    const path = join(directory, readdirSync(directory)[0]!)
    const envelope = JSON.parse(readFileSync(path, 'utf8'))
    if (kind === 'transitional') {
      delete envelope.record.fingerprint
      delete envelope.record.requiredCapabilities
    } else envelope.record.fingerprint = '0'.repeat(64)
    writeFileSync(path, JSON.stringify(envelope))
    const before = bytes(root)
    const result = audit(root)
    expect(result.status, result.stderr + result.stdout).toBe(kind === 'transitional' ? 0 : 1)
    expect(JSON.parse(result.stdout)).toMatchObject(kind === 'transitional'
      ? { ok: true } : { ok: false, code: 'AUDIT_ULTRA_CONFLICT' })
    expect(bytes(root)).toEqual(before)
  })

  it('includes committed WAL data in the audit identity without changing the source database or sidecars', async () => {
    const { root } = await created('sqlite')
    const db = new DatabaseSync(join(root, 'storage.sqlite'))
    try {
      db.exec('PRAGMA journal_mode = WAL')
      const first = audit(root, 'sqlite')
      expect(first.status, first.stderr + first.stdout).toBe(0)
      const marker = { formatVersion: 1, status: 'pending', sourceVersion: 0 }
      db.prepare('UPDATE unit_globals SET value = ? WHERE unit = ?').run(JSON.stringify(marker), 'agent_team_ultra_v1')
      const before = bytes(root)
      const second = audit(root, 'sqlite')
      expect(second.status, second.stderr + second.stdout).toBe(0)
      const report = JSON.parse(second.stdout)
      expect(report.ultraMigration).toMatchObject({ status: 'pending' })
      expect(report.sourceDigest).not.toBe(JSON.parse(first.stdout).sourceDigest)
      expect(bytes(root)).toEqual(before)
    } finally { db.close() }
  })

  it('refuses a native turn receipt attached to a DSH member', async () => {
    const { root, leadId, launched } = await created()
    await mutateSession(root, leadId, rows => {
      const seq = rows.at(-1).seq + 1
      rows.push({ type: 'team/message/queued', seq, time: Date.now(), data: {
        version: 2, teamId: leadId, message: {
          id: 'audit-message', senderId: leadId, senderName: 'lead', targetId: launched.value.memberId,
          content: [{ type: 'text', text: 'Inspect the read-only sample.' }],
        },
      } }, { type: 'team/message/delivered', seq: seq + 1, time: Date.now(), data: {
        version: 2, teamId: leadId, messageId: 'audit-message', targetId: launched.value.memberId,
        nativeTurnId: 'external-turn',
      } })
    })
    const before = bytes(root)
    const result = audit(root)
    expect(result.status, result.stderr + result.stdout).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: 'AUDIT_NATIVE_CORRELATION' })
    expect(bytes(root)).toEqual(before)
  })

})
