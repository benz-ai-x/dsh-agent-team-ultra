import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as JsonStorage from '@deepseek-ai/dsh-storage-json'
import * as SqliteStorage from '@deepseek-ai/dsh-storage-sqlite'
import { SUBAGENT_DESCRIPTOR_VERSION } from '@deepseek-ai/dsh-subagent'
import { z } from 'zod'
import { describe, expect, it, vi } from 'vitest'
import DigitalEmployeeService from '../lib/index.js'
import {
  digitalEmployeeDomainSpec,
  type LegacyDigitalEmployeeProfile,
  type LegacyDigitalEmployeeProfileDraft,
} from '../src/spec.ts'
import {
  digitalEmployeeV1DomainSpec,
  digitalEmployeeBindingKey,
  openDigitalEmployeeStorage,
  profileContentFingerprint,
  profileRevisionKey,
} from '../src/storage.ts'
import type { DigitalEmployeeProfile, DigitalEmployeeProfileDraft } from '../src/types.ts'

const legacyProfileDraft: LegacyDigitalEmployeeProfileDraft = {
  id: 'legacy-reviewer',
  employeeName: 'legacy-reviewer',
  displayName: 'Legacy Reviewer',
  description: 'Migrated without changing its behavior.',
  provider: 'spawn',
  contextMode: 'fresh',
  persona: 'Review carefully.',
  mission: 'Protect correctness.',
  toolPolicy: { mode: 'inherit', names: [] },
  context: [],
  memory: [],
  hooks: [],
}

const legacyProfile: LegacyDigitalEmployeeProfile = {
  ...legacyProfileDraft,
  revision: 7,
  createdAt: 100,
  updatedAt: 200,
}

const { provider: legacyContinuationProvider, ...legacyProfileFields } = legacyProfileDraft
const migratedProfileDraft: DigitalEmployeeProfileDraft = {
  ...legacyProfileFields,
  continuationProvider: legacyContinuationProvider,
}

const migratedProfile: DigitalEmployeeProfile = {
  ...migratedProfileDraft,
  revision: legacyProfile.revision,
  createdAt: legacyProfile.createdAt,
  updatedAt: legacyProfile.updatedAt,
}

const legacyBinding = {
  teamId: 'lead',
  memberName: 'legacy-reviewer',
  memberId: 'child',
  profileId: legacyProfile.id,
  profileRevision: legacyProfile.revision,
  profile: legacyProfile,
  phase: 'active' as const,
}

const migratedBinding = {
  ...legacyBinding,
  profile: migratedProfile,
}

const laxV0Spec = StorageDomain.defineDomain({
  name: 'agent_team_ultra',
  version: 0,
  tables: {
    profiles: StorageDomain.domainTable<string, unknown>(z.unknown()),
    bindings: StorageDomain.domainTable<string, unknown>(z.unknown()),
  },
})

const newerV0Spec = StorageDomain.defineDomain({
  ...laxV0Spec,
  version: 1,
})

function permissiveV1Spec(initial: { formatVersion: number; status: string; sourceVersion: number }) {
  return StorageDomain.defineDomain({
    name: 'agent_team_ultra_v1',
    version: 1,
    layout: 'per-record' as const,
    global: {
      schema: z.object({
        formatVersion: z.number(),
        status: z.string(),
        sourceVersion: z.number(),
      }).strict(),
      initial,
    },
    tables: Object.fromEntries([
      'profile_heads',
      'profile_revisions',
      'bindings',
      'run_index',
      'eval_sets',
      'eval_runs',
    ].map(name => [name, StorageDomain.domainTable<string, unknown>(z.unknown())])),
  })
}

const unknownMarkerV1Spec = permissiveV1Spec({ formatVersion: 1, status: 'future', sourceVersion: 0 })
const newerMarkerV1Spec = permissiveV1Spec({ formatVersion: 2, status: 'complete', sourceVersion: 1 })

interface BackendHarness {
  readonly ctx: Context
  close(): Promise<void>
}

async function backendHarness(backend: 'json' | 'sqlite'): Promise<BackendHarness> {
  const root = await mkdtemp(join(tmpdir(), `agent-team-ultra-${backend}-`))
  const ctx = new Context()
  await ctx.plugin(Storage)
  if (backend === 'json') {
    await ctx.plugin(JsonStorage, { root: join(root, 'json') })
  } else {
    await ctx.plugin(SqliteStorage, { path: join(root, 'storage.sqlite'), journalMode: 'delete' })
  }
  await ctx.plugin(StorageDomain, { backend })
  return {
    ctx,
    async close() {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    },
  }
}

function installAgentRuntime(
  ctx: Context,
  options: { readonly rosterMemberId?: string } = {},
): { readonly leader: Agent; readonly child: Agent } {
  const childCtx = {
    systemPrompt: { section: () => () => undefined, context: () => () => undefined },
    tools: { restrict: () => () => undefined },
    on: () => () => undefined,
  } as unknown as Context
  const leader = {
    id: 'lead',
    session: { header: {} },
    ctx,
  } as unknown as Agent
  const child = {
    id: 'child',
    session: {
      header: { parentSession: 'lead' },
      snapshotEvents: () => [{
        type: 'subagent/descriptor',
        data: {
          version: SUBAGENT_DESCRIPTOR_VERSION,
          mode: 'continuable',
          provider: 'spawn',
          label: 'Legacy Reviewer',
          agentProvider: 'deepseek',
          agentModel: 'deepseek-chat',
          agentReasoningEffort: 'high',
        },
      }],
    },
    ctx: childCtx,
  } as unknown as Agent
  Object.defineProperty(childCtx, 'agent', { value: child })
  const agents = new Map<string, Agent>([['lead', leader], ['child', child]])
  ctx.provide('agents', {
    get: (id: string) => agents.get(id),
    list: () => [...agents.values()],
  } as never)
  ctx.provide('agentTeams', {
    membership: (agent: Agent) => {
      if (agent !== leader) throw new Error('only the exact fixture Lead has authority')
      return { id: 'lead', root: leader, role: 'lead', name: 'lead' }
    },
    listMembers: () => [
      { id: 'lead', name: 'lead', role: 'lead' },
      { id: options.rosterMemberId ?? 'child', name: 'legacy-reviewer', role: 'teammate' },
    ],
  } as never)
  ctx.provide('systemPrompt', {} as never)
  ctx.provide('tools', {
    schemas: () => [],
    get: () => undefined,
  } as never)
  ctx.provide('llm', {
    listProviders: () => [{ id: 'deepseek', name: 'DeepSeek' }],
    listModels: async () => [{ provider: 'deepseek', id: 'deepseek-chat', name: 'DeepSeek Chat' }],
    resolveModelInfo: async () => ({
      provider: 'deepseek', id: 'deepseek-chat', name: 'DeepSeek Chat',
      reasoning: { efforts: [{ id: 'high', name: 'High' }] },
    }),
  } as never)
  ctx.provide('subagents', {
    list: () => ['spawn'],
    getProvider: (name: string) => name === 'spawn'
      ? {
        name: 'spawn',
        inheritsParentContext: false,
        capabilities: {},
        prepareContinuable: async () => ({}),
      }
      : undefined,
  } as never)
  return { leader, child }
}

describe('Digital Employee v1 storage generation', () => {
  it('declares the migration marker and every per-record table up front', () => {
    expect(digitalEmployeeV1DomainSpec).toMatchObject({
      name: 'agent_team_ultra_v1',
      version: 1,
      layout: 'per-record',
    })
    expect(digitalEmployeeV1DomainSpec.global?.initial).toEqual({
      formatVersion: 1,
      status: 'pending',
      sourceVersion: 0,
    })
    expect(Object.keys(digitalEmployeeV1DomainSpec.tables).sort()).toEqual([
      'bindings',
      'eval_runs',
      'eval_sets',
      'profile_heads',
      'profile_revisions',
      'run_index',
    ])
  })

  it('derives a stable content fingerprint without operational metadata', () => {
    const target = { kind: 'legacy-inherit-lead' } as const
    const reordered = {
      hooks: migratedProfileDraft.hooks,
      memory: migratedProfileDraft.memory,
      context: migratedProfileDraft.context,
      toolPolicy: migratedProfileDraft.toolPolicy,
      mission: migratedProfileDraft.mission,
      persona: migratedProfileDraft.persona,
      contextMode: migratedProfileDraft.contextMode,
      continuationProvider: migratedProfileDraft.continuationProvider,
      description: migratedProfileDraft.description,
      displayName: migratedProfileDraft.displayName,
      employeeName: migratedProfileDraft.employeeName,
      id: migratedProfileDraft.id,
    }

    expect(profileContentFingerprint(migratedProfileDraft, target)).toBe(
      profileContentFingerprint(reordered, target),
    )
    expect(profileContentFingerprint(migratedProfileDraft, target)).toMatch(/^[a-f0-9]{64}$/u)
  })

  it.each(['json', 'sqlite'] as const)(
    'upgrades an Issue #3 v1 Revision without a fingerprint before admission on %s',
    async (backend) => {
      const runtime = await backendHarness(backend)
      try {
        const transitional = await runtime.ctx.storageDomain.open(permissiveV1Spec({
          formatVersion: 1,
          status: 'complete',
          sourceVersion: 0,
        }))
        await transitional.table('profile_heads').put(legacyProfile.id, {
          schemaVersion: 1,
          profileId: legacyProfile.id,
          headRevision: 1,
          latestRevision: legacyProfile.revision,
          activeRevision: legacyProfile.revision,
          historyStartsAtRevision: legacyProfile.revision,
          createdAt: legacyProfile.createdAt,
          updatedAt: legacyProfile.updatedAt,
        })
        const key = profileRevisionKey(legacyProfile.id, legacyProfile.revision)
        await transitional.table('profile_revisions').put(key, {
          schemaVersion: 1,
          profileId: legacyProfile.id,
          revision: legacyProfile.revision,
          profile: legacyProfileDraft,
          runtimeTarget: { kind: 'legacy-inherit-lead' },
          createdAt: legacyProfile.createdAt,
          updatedAt: legacyProfile.updatedAt,
        })
        await transitional.close()

        const upgraded = await openDigitalEmployeeStorage(runtime.ctx.storageDomain)
        expect(upgraded.getProfileRevision(legacyProfile.id, legacyProfile.revision)).toMatchObject({
          fingerprint: profileContentFingerprint(migratedProfileDraft, { kind: 'legacy-inherit-lead' }),
        })
        await upgraded.close()

        const reopened = await openDigitalEmployeeStorage(runtime.ctx.storageDomain)
        expect(reopened.getProfileRevision(legacyProfile.id, legacyProfile.revision)?.fingerprint).toBe(
          profileContentFingerprint(migratedProfileDraft, { kind: 'legacy-inherit-lead' }),
        )
        await reopened.close()
      } finally {
        await runtime.close()
      }
    },
  )

  it.each(['json', 'sqlite'] as const)(
    'fails closed when an existing v1 fingerprint is non-canonical on %s',
    async (backend) => {
      const runtime = await backendHarness(backend)
      try {
        const transitional = await runtime.ctx.storageDomain.open(permissiveV1Spec({
          formatVersion: 1,
          status: 'complete',
          sourceVersion: 0,
        }))
        const key = profileRevisionKey(legacyProfile.id, legacyProfile.revision)
        await transitional.table('profile_revisions').put(key, {
          schemaVersion: 1,
          profileId: legacyProfile.id,
          revision: legacyProfile.revision,
          profile: legacyProfileDraft,
          runtimeTarget: { kind: 'legacy-inherit-lead' },
          fingerprint: '0'.repeat(64),
          createdAt: legacyProfile.createdAt,
          updatedAt: legacyProfile.updatedAt,
        })
        await transitional.close()

        await expect(openDigitalEmployeeStorage(runtime.ctx.storageDomain)).rejects.toMatchObject({
          name: 'DigitalEmployeeMigrationError',
          code: 'target-inconsistent',
        })
        expect(runtime.ctx.storageDomain.get('agent_team_ultra_v1')).toBeUndefined()
      } finally {
        await runtime.close()
      }
    },
  )

  it.each(['json', 'sqlite'] as const)(
    'fails closed when stored required capabilities disagree with Revision content on %s',
    async (backend) => {
      const runtime = await backendHarness(backend)
      try {
        const seeded = await runtime.ctx.storageDomain.open(permissiveV1Spec({
          formatVersion: 1,
          status: 'complete',
          sourceVersion: 0,
        }))
        const requiredCapabilities = {
          contextMode: 'fork' as const,
          profileCapabilities: ['persona' as const],
        }
        await seeded.table('profile_revisions').put(
          profileRevisionKey(migratedProfile.id, migratedProfile.revision),
          {
            schemaVersion: 1,
            profileId: migratedProfile.id,
            revision: migratedProfile.revision,
            profile: migratedProfileDraft,
            runtimeTarget: { kind: 'legacy-inherit-lead' },
            requiredCapabilities,
            fingerprint: profileContentFingerprint(
              migratedProfileDraft,
              { kind: 'legacy-inherit-lead' },
              requiredCapabilities,
            ),
            createdAt: migratedProfile.createdAt,
            updatedAt: migratedProfile.updatedAt,
          },
        )
        await seeded.close()

        await expect(openDigitalEmployeeStorage(runtime.ctx.storageDomain)).rejects.toMatchObject({
          name: 'DigitalEmployeeMigrationError',
          code: 'target-inconsistent',
        })
      } finally {
        await runtime.close()
      }
    },
  )

  it.each(['json', 'sqlite'] as const)(
    'fails closed when a v1 Revision snapshot disagrees with its identity on %s',
    async (backend) => {
      const runtime = await backendHarness(backend)
      try {
        const seeded = await runtime.ctx.storageDomain.open(permissiveV1Spec({
          formatVersion: 1,
          status: 'complete',
          sourceVersion: 0,
        }))
        await seeded.table('profile_heads').put(legacyProfile.id, {
          schemaVersion: 1,
          profileId: legacyProfile.id,
          headRevision: 1,
          latestRevision: 1,
          activeRevision: 1,
          historyStartsAtRevision: 1,
          createdAt: 100,
          updatedAt: 200,
        })
        await seeded.table('profile_revisions').put(profileRevisionKey(legacyProfile.id, 1), {
          schemaVersion: 1,
          profileId: legacyProfile.id,
          revision: 1,
          profile: { ...legacyProfileDraft, id: 'different-reviewer' },
          runtimeTarget: { kind: 'legacy-inherit-lead' },
          createdAt: 100,
          updatedAt: 200,
        })
        await seeded.close()

        await expect(openDigitalEmployeeStorage(runtime.ctx.storageDomain)).rejects.toMatchObject({
          name: 'DigitalEmployeeMigrationError',
          code: 'target-inconsistent',
        })
      } finally {
        await runtime.close()
      }
    },
  )

  it.each(['json', 'sqlite'] as const)(
    'fails closed when retained v1 Revision history has a gap on %s',
    async (backend) => {
      const runtime = await backendHarness(backend)
      try {
        const seeded = await runtime.ctx.storageDomain.open(permissiveV1Spec({
          formatVersion: 1,
          status: 'complete',
          sourceVersion: 0,
        }))
        await seeded.table('profile_heads').put(legacyProfile.id, {
          schemaVersion: 1,
          profileId: legacyProfile.id,
          headRevision: 3,
          latestRevision: 3,
          activeRevision: 3,
          historyStartsAtRevision: 1,
          createdAt: 100,
          updatedAt: 200,
        })
        for (const revision of [1, 3]) {
          await seeded.table('profile_revisions').put(profileRevisionKey(legacyProfile.id, revision), {
            schemaVersion: 1,
            profileId: legacyProfile.id,
            revision,
            profile: legacyProfileDraft,
            runtimeTarget: { kind: 'legacy-inherit-lead' },
            createdAt: 100,
            updatedAt: 200,
          })
        }
        await seeded.close()

        await expect(openDigitalEmployeeStorage(runtime.ctx.storageDomain)).rejects.toMatchObject({
          name: 'DigitalEmployeeMigrationError',
          code: 'target-inconsistent',
        })
      } finally {
        await runtime.close()
      }
    },
  )

  it.each(['json', 'sqlite'] as const)(
    'finalizes an empty v0 source without inventing records on the %s backend',
    async (backend) => {
      const runtime = await backendHarness(backend)
      try {
        const open = vi.spyOn(runtime.ctx.storageDomain, 'open')
        const migrated = await openDigitalEmployeeStorage(runtime.ctx.storageDomain)
        expect(open.mock.calls.map(([spec]) => spec.name)).toEqual([
          'agent_team_ultra_v1',
          'agent_team_ultra',
        ])
        expect(migrated.profileCount).toBe(0)
        expect([...migrated.bindingEntries()]).toEqual([])
        await migrated.close()
        open.mockRestore()

        const v1 = await runtime.ctx.storageDomain.open(digitalEmployeeV1DomainSpec)
        expect(v1.global.get()).toEqual({ formatVersion: 1, status: 'complete', sourceVersion: 0 })
        expect(v1.table('profile_heads').size).toBe(0)
        expect(v1.table('profile_revisions').size).toBe(0)
        expect(v1.table('bindings').size).toBe(0)
        await v1.close()
      } finally {
        await runtime.close()
      }
    },
  )

  it.each(['json', 'sqlite'] as const)(
    'migrates a truncated v0 catalog idempotently on the %s backend',
    async (backend) => {
      const runtime = await backendHarness(backend)
      try {
        const v0 = await runtime.ctx.storageDomain.open(digitalEmployeeDomainSpec)
        await v0.table('profiles').put(legacyProfile.id, legacyProfile)
        await v0.table('bindings').put(JSON.stringify(['lead', 'legacy-reviewer']), legacyBinding)
        await v0.close()

        const migrated = await openDigitalEmployeeStorage(runtime.ctx.storageDomain)
        expect(migrated.getProfile(legacyProfile.id)).toEqual(migratedProfile)
        expect([...migrated.bindingEntries()]).toEqual([
          [digitalEmployeeBindingKey('lead', 'legacy-reviewer'), expect.objectContaining(migratedBinding)],
        ])
        await migrated.close()

        const v1 = await runtime.ctx.storageDomain.open(digitalEmployeeV1DomainSpec)
        expect(v1.global.get()).toEqual({ formatVersion: 1, status: 'complete', sourceVersion: 0 })
        expect(v1.table('profile_heads').get(legacyProfile.id)).toEqual({
          schemaVersion: 1,
          profileId: legacyProfile.id,
          headRevision: 1,
          latestRevision: 7,
          activeRevision: 7,
          historyStartsAtRevision: 7,
          createdAt: 100,
          updatedAt: 200,
        })
        expect(v1.table('profile_revisions').get(profileRevisionKey(legacyProfile.id, 7))).toMatchObject({
          schemaVersion: 1,
          profileId: legacyProfile.id,
          revision: 7,
          runtimeTarget: { kind: 'legacy-inherit-lead' },
          createdAt: 100,
          updatedAt: 200,
        })
        expect(v1.table('bindings').get(digitalEmployeeBindingKey('lead', 'legacy-reviewer'))).toMatchObject({
          ...migratedBinding,
          schemaVersion: 1,
          runtimeTarget: { kind: 'legacy-inherit-lead' },
        })
        await v1.close()

        const open = vi.spyOn(runtime.ctx.storageDomain, 'open')
        const reopened = await openDigitalEmployeeStorage(runtime.ctx.storageDomain)
        expect(open.mock.calls.map(([spec]) => spec.name)).toEqual(['agent_team_ultra_v1'])
        expect(reopened.getProfile(legacyProfile.id)).toEqual(migratedProfile)
        await reopened.close()

        open.mockRestore()
        const unchangedV0 = await runtime.ctx.storageDomain.open(digitalEmployeeDomainSpec)
        expect(unchangedV0.table('profiles').get(legacyProfile.id)).toEqual(legacyProfile)
        expect(unchangedV0.table('bindings').get(JSON.stringify(['lead', 'legacy-reviewer']))).toEqual(legacyBinding)
        await unchangedV0.close()
      } finally {
        await runtime.close()
      }
    },
  )

  it.each(['json', 'sqlite'] as const)(
    'preserves every valid v0 Binding identity without unsafe key growth on %s',
    async (backend) => {
      const runtime = await backendHarness(backend)
      try {
        const teamId = `team-${'t'.repeat(300)}`
        const memberId = `member-${'m'.repeat(300)}`
        const binding = { ...legacyBinding, teamId, memberId }
        const key = digitalEmployeeBindingKey(teamId, binding.memberName)
        expect(key.length).toBeLessThanOrEqual(64)

        const v0 = await runtime.ctx.storageDomain.open(digitalEmployeeDomainSpec)
        await v0.table('bindings').put(JSON.stringify([teamId, binding.memberName]), binding)
        await v0.close()

        const migrated = await openDigitalEmployeeStorage(runtime.ctx.storageDomain)
        expect(migrated.getBinding(key)).toMatchObject({ teamId, memberId })
        await migrated.close()

        const reopened = await openDigitalEmployeeStorage(runtime.ctx.storageDomain)
        expect(reopened.getBinding(key)).toMatchObject({ teamId, memberId })
        await reopened.close()
      } finally {
        await runtime.close()
      }
    },
  )

  it.each(['json', 'sqlite'] as const)(
    'refuses to overwrite a divergent partial v1 migration on the %s backend',
    async (backend) => {
      const runtime = await backendHarness(backend)
      try {
        const v0 = await runtime.ctx.storageDomain.open(digitalEmployeeDomainSpec)
        await v0.table('profiles').put(legacyProfile.id, legacyProfile)
        await v0.close()

        const partial = await runtime.ctx.storageDomain.open(digitalEmployeeV1DomainSpec)
        const key = profileRevisionKey(legacyProfile.id, legacyProfile.revision)
        await partial.table('profile_revisions').put(key, {
          schemaVersion: 1,
          profileId: legacyProfile.id,
          revision: legacyProfile.revision,
          profile: { ...legacyProfileDraft, displayName: 'Divergent Reviewer' },
          runtimeTarget: { kind: 'legacy-inherit-lead' },
          createdAt: legacyProfile.createdAt,
          updatedAt: legacyProfile.updatedAt,
        })
        await partial.close()

        await expect(openDigitalEmployeeStorage(runtime.ctx.storageDomain)).rejects.toMatchObject({
          name: 'DigitalEmployeeMigrationError',
          code: 'target-diverged',
        })
        expect(runtime.ctx.storageDomain.get('agent_team_ultra')).toBeUndefined()
        expect(runtime.ctx.storageDomain.get('agent_team_ultra_v1')).toBeUndefined()

        const unchanged = await runtime.ctx.storageDomain.open(digitalEmployeeV1DomainSpec)
        expect(unchanged.global.get()).toEqual({ formatVersion: 1, status: 'pending', sourceVersion: 0 })
        expect(unchanged.table('profile_revisions').get(key)?.profile.displayName).toBe('Divergent Reviewer')
        expect(unchanged.table('profile_heads').size).toBe(0)
        await unchanged.close()
      } finally {
        await runtime.close()
      }
    },
  )

  it.each(['json', 'sqlite'] as const)(
    'recovers deterministically after every %s migration crash boundary',
    async (backend) => {
      for (const crashBoundary of [1, 2, 3, 'before-completion'] as const) {
        const runtime = await backendHarness(backend)
        try {
          const v0 = await runtime.ctx.storageDomain.open(digitalEmployeeDomainSpec)
          await v0.table('profiles').put(legacyProfile.id, legacyProfile)
          await v0.table('bindings').put(JSON.stringify(['lead', 'legacy-reviewer']), legacyBinding)
          await v0.close()

          const crash = new Error(`simulated crash at ${crashBoundary}`)
          await expect(openDigitalEmployeeStorage(runtime.ctx.storageDomain, {
            migrationHooks: {
              afterRecord: boundary => {
                if (boundary.copiedRecords === crashBoundary) throw crash
              },
              beforeCompletion: () => {
                expect(runtime.ctx.storageDomain.get('agent_team_ultra')).toBeUndefined()
                expect(runtime.ctx.storageDomain.get('agent_team_ultra_v1')?.global.get()).toEqual({
                  formatVersion: 1,
                  status: 'pending',
                  sourceVersion: 0,
                })
                if (crashBoundary === 'before-completion') throw crash
              },
            },
          })).rejects.toBe(crash)
          expect(runtime.ctx.storageDomain.get('agent_team_ultra')).toBeUndefined()
          expect(runtime.ctx.storageDomain.get('agent_team_ultra_v1')).toBeUndefined()

          const incomplete = await runtime.ctx.storageDomain.open(digitalEmployeeV1DomainSpec)
          expect(incomplete.global.get()).toEqual({ formatVersion: 1, status: 'pending', sourceVersion: 0 })
          await incomplete.close()

          const recovered = await openDigitalEmployeeStorage(runtime.ctx.storageDomain)
          expect(recovered.getProfile(legacyProfile.id)).toEqual(migratedProfile)
          expect([...recovered.bindingEntries()]).toHaveLength(1)
          await recovered.close()

          const v1 = await runtime.ctx.storageDomain.open(digitalEmployeeV1DomainSpec)
          expect(v1.global.get()).toEqual({ formatVersion: 1, status: 'complete', sourceVersion: 0 })
          expect(v1.table('profile_heads').size).toBe(1)
          expect(v1.table('profile_revisions').size).toBe(1)
          expect(v1.table('bindings').size).toBe(1)
          await v1.close()
        } finally {
          await runtime.close()
        }
      }
    },
  )

  it.each(['json', 'sqlite'] as const)(
    'keeps the first proven Binding route when retry loses live proof on %s',
    async (backend) => {
      const runtime = await backendHarness(backend)
      try {
        const v0 = await runtime.ctx.storageDomain.open(digitalEmployeeDomainSpec)
        await v0.table('profiles').put(legacyProfile.id, legacyProfile)
        await v0.table('bindings').put(JSON.stringify(['lead', 'legacy-reviewer']), legacyBinding)
        await v0.close()

        const crash = new Error('crash after proven Binding')
        await expect(openDigitalEmployeeStorage(runtime.ctx.storageDomain, {
          resolveBindingRuntimeTarget: () => ({
            kind: 'dsh-model',
            provider: 'deepseek',
            model: 'deepseek-chat',
          }),
          migrationHooks: {
            afterRecord: boundary => {
              if (boundary.table === 'bindings') throw crash
            },
          },
        })).rejects.toBe(crash)

        const recovered = await openDigitalEmployeeStorage(runtime.ctx.storageDomain)
        expect(recovered.getBinding(digitalEmployeeBindingKey('lead', 'legacy-reviewer')))
          .toMatchObject({
            runtimeTarget: {
              kind: 'dsh-model',
              provider: 'deepseek',
              model: 'deepseek-chat',
            },
          })
        await recovered.close()
      } finally {
        await runtime.close()
      }
    },
  )

  it.each(['json', 'sqlite'] as const)(
    'keeps a legacy target when the live roster does not prove the child identity on %s',
    async (backend) => {
      const runtime = await backendHarness(backend)
      try {
        const v0 = await runtime.ctx.storageDomain.open(digitalEmployeeDomainSpec)
        await v0.table('profiles').put(legacyProfile.id, legacyProfile)
        await v0.table('bindings').put(JSON.stringify(['lead', 'legacy-reviewer']), legacyBinding)
        await v0.close()
        installAgentRuntime(runtime.ctx, { rosterMemberId: 'different-child' })

        const service = runtime.ctx.plugin(DigitalEmployeeService)
        await service
        await service.dispose()

        const v1 = await runtime.ctx.storageDomain.open(digitalEmployeeV1DomainSpec)
        expect(v1.table('bindings').get(digitalEmployeeBindingKey('lead', 'legacy-reviewer')))
          .toMatchObject({ runtimeTarget: { kind: 'legacy-inherit-lead' } })
        await v1.close()
      } finally {
        await runtime.close()
      }
    },
  )

  it.each(['json', 'sqlite'] as const)(
    'restores the migrated Studio and records only a descriptor-proven route on %s',
    async (backend) => {
      const runtime = await backendHarness(backend)
      try {
        const v0 = await runtime.ctx.storageDomain.open(digitalEmployeeDomainSpec)
        await v0.table('profiles').put(legacyProfile.id, legacyProfile)
        await v0.table('bindings').put(JSON.stringify(['lead', 'legacy-reviewer']), legacyBinding)
        await v0.close()
        const { leader } = installAgentRuntime(runtime.ctx)

        const service = runtime.ctx.plugin(DigitalEmployeeService)
        await service
        expect(runtime.ctx.digitalEmployees.studioView(leader)).toMatchObject({
          profiles: [{
            head: {
              profileId: 'legacy-reviewer',
              latestRevision: 7,
              activeRevision: 7,
            },
            latest: { revision: 7, profile: { id: 'legacy-reviewer' } },
          }],
          instances: [{
            teamId: 'lead',
            memberName: 'legacy-reviewer',
            memberId: 'child',
            profileRevision: 7,
            phase: 'active',
          }],
        })
        await service.dispose()

        const open = vi.spyOn(runtime.ctx.storageDomain, 'open')
        const replacement = runtime.ctx.plugin(DigitalEmployeeService)
        await replacement
        expect(open.mock.calls.map(([spec]) => spec.name)).toEqual(['agent_team_ultra_v1'])
        expect(runtime.ctx.digitalEmployees.studioView(leader).profiles).toHaveLength(1)
        await replacement.dispose()
        open.mockRestore()

        const v1 = await runtime.ctx.storageDomain.open(digitalEmployeeV1DomainSpec)
        expect(v1.table('bindings').get(digitalEmployeeBindingKey('lead', 'legacy-reviewer')))
          .toMatchObject({
            runtimeTarget: {
              kind: 'dsh-model',
              provider: 'deepseek',
              model: 'deepseek-chat',
              reasoningEffort: 'high',
            },
          })
        await v1.close()
      } finally {
        await runtime.close()
      }
    },
  )

  it.each(['json', 'sqlite'] as const)(
    'fails closed on invalid v0 records and releases %s handles quietly',
    async (backend) => {
      const runtime = await backendHarness(backend)
      try {
        const invalidV0 = await runtime.ctx.storageDomain.open(laxV0Spec)
        await invalidV0.table('profiles').put('broken', { id: 'not-a-profile' })
        await invalidV0.close()

        await expect(openDigitalEmployeeStorage(runtime.ctx.storageDomain)).rejects.toMatchObject({
          code: 'invalid-record',
        })
        expect(runtime.ctx.storageDomain.get('agent_team_ultra')).toBeUndefined()
        expect(runtime.ctx.storageDomain.get('agent_team_ultra_v1')).toBeUndefined()
      } finally {
        await runtime.close()
      }
    },
  )

  it.each(['json', 'sqlite'] as const)(
    'fails closed on a newer v0 medium without completing v1 on %s',
    async (backend) => {
      const runtime = await backendHarness(backend)
      try {
        const newerV0 = await runtime.ctx.storageDomain.open(newerV0Spec)
        await newerV0.table('profiles').put('materialized', { future: true })
        await newerV0.close()

        await expect(openDigitalEmployeeStorage(runtime.ctx.storageDomain)).rejects.toMatchObject({
          code: 'version-mismatch',
        })
        expect(runtime.ctx.storageDomain.get('agent_team_ultra')).toBeUndefined()
        expect(runtime.ctx.storageDomain.get('agent_team_ultra_v1')).toBeUndefined()

        const v1 = await runtime.ctx.storageDomain.open(digitalEmployeeV1DomainSpec)
        expect(v1.global.get()).toEqual({ formatVersion: 1, status: 'pending', sourceVersion: 0 })
        await v1.close()
      } finally {
        await runtime.close()
      }
    },
  )

  it.each(['json', 'sqlite'] as const)(
    'rejects unknown and newer v1 formats before opening v0 on %s',
    async (backend) => {
      for (const storedSpec of [unknownMarkerV1Spec, newerMarkerV1Spec]) {
        const runtime = await backendHarness(backend)
        try {
          const stored = await runtime.ctx.storageDomain.open(storedSpec)
          await stored.global.set(storedSpec.global.initial)
          await stored.close()

          const open = vi.spyOn(runtime.ctx.storageDomain, 'open')
          let failure: unknown
          try {
            await openDigitalEmployeeStorage(runtime.ctx.storageDomain)
          } catch (error: unknown) {
            failure = error
          }
          expect((failure as { code?: unknown } | undefined)?.code).toBe(
            'invalid-record',
          )
          expect(open.mock.calls.map(([spec]) => spec.name)).toEqual(['agent_team_ultra_v1'])
          expect(runtime.ctx.storageDomain.get('agent_team_ultra_v1')).toBeUndefined()
          open.mockRestore()
        } finally {
          await runtime.close()
        }
      }
    },
  )
})
