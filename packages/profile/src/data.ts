/** Admit both configured data roots before mounting any writable persistence. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { assertUltraCompatibility, assertUltraMigrationReady } from '@benz-ai-x/dsh-agent-team-ultra/compatibility'
import type { Config as SessionConfig } from '@deepseek-ai/dsh-session-persistence-jsonl'
import type { JournalMode } from '@deepseek-ai/dsh-storage-sqlite'

assertUltraCompatibility(import.meta.url, 'profile')
const [{ default: Persistence }, JsonStorage, SqliteStorage, StorageDomain] = await Promise.all([
  import('@deepseek-ai/dsh-session-persistence-jsonl'),
  import('@deepseek-ai/dsh-storage-json'),
  import('@deepseek-ai/dsh-storage-sqlite'),
  import('@deepseek-ai/dsh-storage-domain'),
])

export const name = 'agent-team-ultra-data'
export const inject = ['storage']

export interface Config {
  sessions: SessionConfig
  storage: { backend: 'json'; root: string } | { backend: 'sqlite'; path: string; journalMode?: JournalMode }
}

export const Config: z<Config> = z.object({
  sessions: Persistence.Config.required(),
  storage: z.union([
    z.object({ backend: z.const('json').required(), root: z.string().required() }),
    z.object({
      backend: z.const('sqlite').required(), path: z.string().required(),
      journalMode: z.union(['wal', 'delete', 'truncate', 'persist'] as const).default('wal'),
    }),
  ]).required(),
})

/** All child registrations and database handles belong to this Loader Fiber. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  assertUltraMigrationReady(config.sessions.root,
    config.storage.backend === 'json' ? config.storage.root : config.storage.path, config.storage.backend)
  await ctx.plugin(Persistence, config.sessions)
  if (config.storage.backend === 'json') await ctx.plugin(JsonStorage, { root: config.storage.root })
  else await ctx.plugin(SqliteStorage, {
    path: config.storage.path,
    ...(config.storage.journalMode === undefined ? {} : { journalMode: config.storage.journalMode }),
  })
  await ctx.plugin(StorageDomain, { backend: config.storage.backend })
}
