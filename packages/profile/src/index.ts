/** Admit the complete overlay before Loader can import any child plugin. */
import { assertUltraCompatibility } from '@benz-ai-x/dsh-agent-team-ultra/compatibility'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'
import { assertLoaderCompatibility } from './loader-compatibility.ts'

assertUltraCompatibility(import.meta.url, 'profile')
const { Group } = await import('@deepseek-ai/cordis-plugin-loader')

/** Recheck the owning Loader tree before each initial load or config replacement. */
export default class UltraProfile extends Group {
  override async update(config: EntryOptions[]): Promise<void> {
    assertLoaderCompatibility(this.tree.ctx.baseUrl)
    await super.update(config)
  }
}
