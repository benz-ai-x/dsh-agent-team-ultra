/** Read physical source artifacts without opening a mutation-capable storage domain. */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { isDeepStrictEqual } from 'node:util'

export function refuse(code, message) {
  throw Object.assign(new Error(message), { code })
}

export function readBytes(path) {
  const stat = lstatSync(path)
  if (!stat.isFile()) refuse('AUDIT_SOURCE_KIND', 'A source artifact must be a regular file, without symbolic links')
  if (stat.size > 64 * 1024 * 1024) refuse('AUDIT_LIMIT', 'A source artifact exceeds the 64 MiB audit limit')
  return readFileSync(path)
}

export function readJson(path) {
  try { return JSON.parse(readBytes(path).toString('utf8')) }
  catch (error) {
    if (error.code === 'AUDIT_LIMIT') throw error
    refuse('AUDIT_INVALID_JSON', 'A source artifact is not valid JSON')
  }
}

export function files(root) {
  if (!lstatSync(root).isDirectory()) refuse('AUDIT_SOURCE_KIND', 'A source root must be a concrete directory, without symbolic links')
  const result = []
  function visit(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name)
      if (entry.isSymbolicLink()) refuse('AUDIT_SOURCE_LINK', 'Audit a concrete source snapshot without symbolic links')
      if (entry.isDirectory()) visit(child)
      else if (entry.isFile()) result.push(child)
      else refuse('AUDIT_SOURCE_KIND', 'A source entry is not a regular file or directory')
      if (result.length > 10000) refuse('AUDIT_LIMIT', 'The source exceeds the 10000 artifact audit limit')
    }
  }
  visit(root)
  return result.sort()
}

export function digest(paths) {
  const hash = createHash('sha256')
  for (const [identity, path] of paths) {
    hash.update(JSON.stringify([identity, createHash('sha256').update(readBytes(path)).digest('hex')])).update('\n')
  }
  return hash.digest('hex')
}

export function sqliteFiles(path) {
  return ['', '-wal', '-shm', '-journal'].map(suffix => path + suffix).filter(artifact => existsSync(artifact))
}

/** Read a private copy so SQLite cannot create or update even a source SHM file. */
export function snapshotSqlite(path) {
  if (!existsSync(path)) refuse('AUDIT_SOURCE_MISSING', 'The SQLite source does not exist')
  if (existsSync(`${path}-journal`) && readBytes(`${path}-journal`).length > 0) {
    refuse('AUDIT_SQLITE_RECOVERY', 'A rollback journal requires explicit source recovery before audit')
  }
  const directory = mkdtempSync(join(tmpdir(), 'ultra-audit-sqlite-'))
  const target = join(directory, 'source.sqlite')
  const dispose = () => rmSync(directory, { recursive: true, force: true })
  try {
    copyFileSync(path, target)
    if (existsSync(`${path}-wal`)) copyFileSync(`${path}-wal`, `${target}-wal`)
    return { path: target, dispose }
  } catch (error) {
    dispose()
    throw error
  }
}

export const imported = path => import(pathToFileURL(path).href)

export function readJsonUnits(root, specs) {
  const known = new Map(specs.map(spec => [spec.name, spec]))
  for (const entry of readdirSync(root)) {
    if (entry.startsWith('agent_team_ultra') && !known.has(entry.replace(/\.json$/, ''))) {
      refuse('AUDIT_ULTRA_GENERATION', 'An unknown Ultra Storage Generation is present')
    }
  }
  const units = new Map()
  for (const spec of specs) {
    const directory = join(root, spec.name)
    const legacy = join(root, `${spec.name}.json`)
    let unit
    if (existsSync(legacy)) {
      const document = readJson(legacy)
      if (document.unit?.name !== spec.name || document.unit?.version !== spec.version) {
        refuse('AUDIT_ULTRA_VERSION', 'An Ultra unit header has an unsupported version or identity')
      }
      unit = { spec, global: document.global, tables: document.tables }
    }
    if (existsSync(directory)) {
      const documents = files(directory)
      if (documents.length) {
        unit = { spec, global: undefined, tables: {} }
        for (const path of documents) {
          const relative = path.slice(directory.length + 1)
          const envelope = readJson(path)
          if (envelope.version !== spec.version || !Object.hasOwn(envelope, 'record')) {
            refuse('AUDIT_ULTRA_VERSION', 'An Ultra record envelope has an unsupported version')
          }
          if (relative === 'global.json') unit.global = envelope.record
          else {
            const match = /^([a-z_]+)\/([a-zA-Z0-9_-]+)\.json$/.exec(relative)
            if (!match || !Object.hasOwn(spec.tables, match[1])) refuse('AUDIT_ULTRA_TABLE', 'An unknown Ultra table or record path is present')
            const records = unit.tables[match[1]] ??= Object.create(null)
            records[match[2]] = envelope.record
          }
        }
      }
    }
    if (!unit) continue
    units.set(spec.name, unit)
  }
  return units
}

export function validateUnits(units) {
  for (const unit of units.values()) {
    const { spec } = unit
    if (!unit.tables || typeof unit.tables !== 'object' || Array.isArray(unit.tables)) refuse('AUDIT_ULTRA_TABLE', 'Ultra tables are malformed')
    try {
      if (spec.global && unit.global !== undefined) unit.global = spec.global.schema.parse(unit.global)
      for (const [name, records] of Object.entries(unit.tables)) {
        if (!Object.hasOwn(spec.tables, name) || !records || typeof records !== 'object' || Array.isArray(records)) {
          refuse('AUDIT_ULTRA_TABLE', 'An unknown or malformed Ultra table is present')
        }
        for (const [key, record] of Object.entries(records)) records[key] = spec.tables[name].valueSchema.parse(record)
      }
    } catch (error) {
      if (error.code?.startsWith('AUDIT_')) throw error
      refuse('AUDIT_ULTRA_RECORD', 'An Ultra record does not satisfy its current schema')
    }
  }
}

export function readSqliteUnits(path, specs) {
  if (!existsSync(path)) refuse('AUDIT_SOURCE_MISSING', 'The SQLite source does not exist')
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    if (db.prepare('PRAGMA user_version').get().user_version !== 1) refuse('AUDIT_SQLITE_VERSION', 'The SQLite physical schema version is not supported')
    const known = new Map(specs.map(spec => [spec.name, spec]))
    const units = new Map()
    const rows = db.prepare('SELECT name, version FROM units').all()
    const expected = new Set(rows.flatMap(row => Object.keys(known.get(row.name)?.tables ?? {})
      .map(table => `u_${row.name}_${table}`)))
    for (const table of db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all()) {
      if (table.name.startsWith('u_agent_team_ultra_') && !expected.has(table.name)) {
        refuse('AUDIT_ULTRA_TABLE', 'An unknown or orphaned Ultra table is present')
      }
    }
    for (const row of rows) {
      if (!row.name.startsWith('agent_team_ultra')) continue
      const spec = known.get(row.name)
      if (!spec) refuse('AUDIT_ULTRA_GENERATION', 'An unknown Ultra Storage Generation is present')
      if (row.version !== spec.version) refuse('AUDIT_ULTRA_VERSION', 'An Ultra unit header has an unsupported version')
      const global = db.prepare('SELECT value FROM unit_globals WHERE unit = ?').get(spec.name)
      const unit = { spec, global: global ? JSON.parse(global.value) : undefined, tables: {} }
      for (const name of Object.keys(spec.tables)) {
        unit.tables[name] = Object.fromEntries(db.prepare(`SELECT key, value FROM "u_${spec.name}_${name}"`).all()
          .map(record => [record.key, JSON.parse(record.value)]))
      }
      units.set(spec.name, unit)
    }
    return units
  } finally { db.close() }
}

export function readCheckpoints(source, backend) {
  const records = new Map()
  let unreadable = false
  const parse = (id, version, text) => {
    try { records.set(id, { version, record: JSON.parse(text) }) }
    catch { records.set(id, { version, reason: 'cache-unreadable' }) }
  }
  if (backend === 'sqlite') {
    const db = new DatabaseSync(source, { readOnly: true })
    try {
      const unit = db.prepare('SELECT version FROM units WHERE name = ?').get('session_projcache')
      if (unit) for (const row of db.prepare('SELECT key, value FROM u_session_projcache_sessions').all()) {
        parse(row.key, unit.version, row.value)
      }
    } finally { db.close() }
  } else {
    const directory = join(source, 'session_projcache/sessions')
    if (existsSync(directory)) for (const entry of readdirSync(directory)) {
      if (!entry.endsWith('.json')) continue
      const id = entry.slice(0, -5)
      try {
        const envelope = readJson(join(directory, entry))
        records.set(id, { version: envelope.version, record: envelope.record })
      } catch { records.set(id, { reason: 'cache-unreadable' }) }
    }
    const legacy = join(source, 'session_projcache.json')
    if (records.size === 0 && existsSync(legacy)) {
      try {
        const unit = readJson(legacy)
        for (const [id, record] of Object.entries(unit.tables?.sessions ?? {})) {
          records.set(id, { version: unit.unit?.version, record })
        }
      } catch { unreadable = true }
    }
  }
  return { records, unreadable }
}

function checkpointReason(cached, handle, events, registry, definition, schema) {
  if (cached.reason) return cached.reason
  if (![3, 4, 5, 6].includes(cached.version)) return 'cache-format'
  const parsed = schema.safeParse(cached.record)
  if (!parsed.success) return 'cache-schema'
  const { identity, rows } = parsed.data
  if (identity.createdAt !== handle.header.createdAt || identity.cwd !== handle.header.cwd
    || (identity.isSeeded ?? false) !== handle.header.isSeeded
    || (identity.inheritedEventCount ?? 0) !== handle.inheritedEventCount) return 'session-identity'
  const row = rows.agentTeam
  if (!row) return 'missing-team-row'
  if (row.ver !== definition.stateVersion) return 'projection-version'
  if (row.seq > (events.at(-1)?.seq ?? -1)) return 'checkpoint-ahead'
  const prefix = registry.restore({}, events.slice(0, row.seq + 1), 0, handle.header, handle.inheritedEventCount)
  if (!isDeepStrictEqual(row.val, prefix.checkpoint.agentTeam.val)) return 'checkpoint-state'
  // Exercise the real restore path after the checkpoint has matched its log.
  registry.restore({ agentTeam: row }, events, 0, handle.header, handle.inheritedEventCount)
  return undefined
}

export async function readSessions(root, harnessRoot, { records: cached = new Map(), unreadable = false } = {}) {
  const load = (path, entry = 'index.js') => imported(join(harnessRoot, path, 'lib', entry))
  const [{ Context }, { default: Persistence }, { default: Projections }, { teamProjectionDefinition, isTeamEvent }, format, zstd, { checkpointRecord }, subagent] = await Promise.all([
    load('vendor/cordis'), load('packages/session/session-persistence-jsonl'),
    load('packages/session/session-projection'), load('packages/experimental/agent-team', 'types/projection.js'),
    load('packages/session/session-persistence-jsonl', 'types/format.js'),
    load('packages/session/session-persistence-jsonl', 'types/zstd.js'),
    load('packages/session/session-projection-cache'),
    load('packages/subagent/subagent'),
  ])
  const sourceFiles = files(root)
  const artifacts = sourceFiles.filter(path => /\/session\.jsonl(?:\.zstd)?$/.test(path))
  const sessionDirectories = artifacts.map(path => dirname(path))
  for (const path of sourceFiles) {
    if (artifacts.includes(path)) continue
    if (basename(path).startsWith('session.') || !sessionDirectories.some(directory => path.startsWith(`${directory}/`))) {
      refuse('AUDIT_SESSION_LAYOUT', 'A Session artifact is outside the qualified layout; it cannot be interpreted as an empty log')
    }
  }
  const encodings = new Set(artifacts.map(path => path.endsWith('.zstd') ? 'zstd' : 'none'))
  if (encodings.size > 1) refuse('AUDIT_SESSION_ENCODING', 'One Session root contains mixed physical encodings')
  const parsed = []
  for (const path of artifacts) {
    let bytes = readBytes(path)
    if (path.endsWith('.zstd')) {
      const { frames, tornStart } = zstd.scanZstdFrames(bytes)
      if (tornStart !== undefined) refuse('AUDIT_SESSION_TAIL', 'A Session has an incomplete physical tail; retain the source for explicit recovery')
      const decoder = zstd.createZstdFrameDecoder()
      try { bytes = Buffer.concat(Array.from(decoder.decode(bytes, frames), chunk => Buffer.from(chunk))) }
      finally { decoder.close() }
    }
    let log
    try { log = format.scanLog(bytes) }
    catch (error) {
      if (error.name === 'SessionFormatUnsupportedError') refuse('AUDIT_SESSION_FORMAT', 'A Session requires an unsupported header, codec or event vocabulary')
      throw error
    }
    if (log.committedBytes !== bytes.length) refuse('AUDIT_SESSION_TAIL', 'A Session contains unreadable or incomplete records')
    for (const event of log.events) {
      if (event.type.startsWith('team/') && !isTeamEvent(event)) {
        refuse('AUDIT_TEAM_VOCABULARY', 'An unknown Team recovery event requires a matching schema, codec and projection')
      }
    }
    parsed.push(log)
  }
  const ctx = new Context()
  try {
    await ctx.plugin(Persistence, { root, compression: [...encodings][0] ?? 'zstd' })
    await ctx.plugin(Projections)
    ctx.sessionProjections.register(teamProjectionDefinition)
    const sessions = new Map()
    const checkpoints = []
    for (const log of parsed) {
      if (sessions.has(log.meta.id)) refuse('AUDIT_SESSION_IDENTITY', 'A Session identity occurs in more than one source artifact')
      const handle = await ctx.sessionPersistence.open(log.meta.id, 'read')
      try {
        const events = await handle.read()
        const folded = ctx.sessionProjections.restore({}, events, 0, handle.header, handle.inheritedEventCount)
        const team = folded.checkpoint.agentTeam.val
        if (team.failure) refuse('AUDIT_TEAM_EVENT', 'Team events cannot be replayed by the qualified projection')
        const descriptors = events.slice(handle.inheritedEventCount).filter(event => event.type === 'subagent/descriptor')
        for (const event of descriptors) {
          if (event.data?.version !== subagent.SUBAGENT_DESCRIPTOR_VERSION) {
            refuse('AUDIT_DESCRIPTOR_VERSION', 'A child descriptor requires an unsupported version')
          }
        }
        let descriptor
        try {
          descriptor = subagent.foldSubagentDescriptor(descriptors)
          if (descriptors.some(event => !isDeepStrictEqual(subagent.foldSubagentDescriptor([event]), descriptor))) {
            refuse('AUDIT_DESCRIPTOR_IDENTITY', 'A child contains conflicting continuation descriptors')
          }
        } catch (error) {
          if (error.code?.startsWith('AUDIT_')) throw error
          refuse('AUDIT_DESCRIPTOR_SCHEMA', 'A child descriptor does not satisfy its declared schema')
        }
        if (cached.has(handle.id) || unreadable) {
          const reason = unreadable ? 'cache-unreadable'
            : checkpointReason(cached.get(handle.id), handle, events, ctx.sessionProjections, teamProjectionDefinition, checkpointRecord)
          checkpoints.push({ sessionId: handle.id, status: reason ? 'rebuild' : 'reusable', ...(reason ? { reason } : {}) })
        }
        sessions.set(handle.id, { header: handle.header, inheritedEventCount: handle.inheritedEventCount, events, team, descriptor })
      } finally { await handle.close() }
    }
    for (const id of cached.keys()) if (!sessions.has(id)) checkpoints.push({ sessionId: id, status: 'rebuild', reason: 'missing-session' })
    const nativeCorrelations = []
    for (const [teamId, session] of sessions) {
      for (const member of session.team.members) {
        if (member.externalRuntime?.initialTurnId !== undefined) {
          if (member.externalRuntime.nativeHandle === undefined) refuse('AUDIT_NATIVE_CORRELATION', 'A native initial turn has no committed runtime handle')
          nativeCorrelations.push({ teamId, memberId: member.id, provider: member.provider,
            nativeRuntimeHandle: member.externalRuntime.nativeHandle, nativeTurnId: member.externalRuntime.initialTurnId, kind: 'initial' })
        }
      }
      for (const event of session.events.slice(session.inheritedEventCount)) {
        if (event.type !== 'team/message/delivered' || event.data.teamId !== teamId || event.data.nativeTurnId === undefined) continue
        const member = session.team.members.find(row => row.id === event.data.targetId)
        if (member?.externalRuntime?.nativeHandle === undefined) {
          refuse('AUDIT_NATIVE_CORRELATION', 'A native turn receipt does not belong to a committed external member handle')
        }
        nativeCorrelations.push({ teamId, memberId: member.id, provider: member.provider,
          nativeRuntimeHandle: member.externalRuntime.nativeHandle, nativeTurnId: event.data.nativeTurnId,
          messageId: event.data.messageId, kind: 'message' })
      }
    }
    for (const [teamId, session] of sessions) for (const member of session.team.members) {
      if (member.externalRuntime) continue
      const child = sessions.get(member.id)
      if (!child && member.phase !== 'active') continue
      const descriptor = child?.descriptor
      const route = descriptor && {
        ...(descriptor.agentProvider === undefined ? {} : { provider: descriptor.agentProvider }),
        ...(descriptor.agentModel === undefined ? {} : { model: descriptor.agentModel }),
        ...(descriptor.agentReasoningEffort === undefined ? {} : { reasoningEffort: descriptor.agentReasoningEffort }),
      }
      if (child?.header.parentSession !== teamId || descriptor?.mode !== 'continuable'
        || descriptor.provider !== member.provider
        || (member.resolvedRoute !== undefined && !isDeepStrictEqual(route, member.resolvedRoute))
        || Object.entries(member.requestedRoute ?? {}).some(([key, value]) => route?.[key] !== value)) {
        refuse('AUDIT_DESCRIPTOR_IDENTITY', 'A Team member conflicts with its child Session, continuation provider or fixed route')
      }
    }
    return { sessions, checkpoints, nativeCorrelations }
  } finally { await ctx.fiber.dispose() }
}
