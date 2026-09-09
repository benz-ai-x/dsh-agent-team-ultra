/** The only B0 persistence entry: admit isolated data before any writable backend opens. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { assertUltraCompatibility } from '@benz-ai-x/dsh-agent-team-ultra/compatibility'
import { assertBaselineData } from '@benz-ai-x/dsh-agent-team-ultra/baseline-data'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { assertLoaderCompatibility } from './loader-compatibility.ts'

assertUltraCompatibility(import.meta.url, 'profile')
const [{ default: Persistence }, JsonStorage, StorageDomain] = await Promise.all([
  import('@deepseek-ai/dsh-session-persistence-jsonl'),
  import('@deepseek-ai/dsh-storage-json'),
  import('@deepseek-ai/dsh-storage-domain'),
])
export const name = 'agent-team-ultra-data'
export const inject = ['storage']
export interface Config { root: string }
export const Config: z<Config> = z.object({ root: z.string().required() })

export async function apply(ctx: Context, config: Config): Promise<void> {
  const paths = assertBaselineData(config.root)
  assertLoaderCompatibility(ctx.fiber.entry?.parent.tree.ctx.baseUrl)
  await ctx.plugin(Persistence, { root: paths.sessions, compression: 'none' })
  await ctx.plugin(JsonStorage, { root: paths.storage })
  await ctx.plugin(StorageDomain, { backend: 'json' })
}
