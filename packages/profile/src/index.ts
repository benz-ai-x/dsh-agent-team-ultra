/** Admit the complete overlay before Loader can import any child plugin. */
import { assertUltraCompatibility, UltraCompatibilityError } from '@benz-ai-x/dsh-agent-team-ultra/compatibility'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'

assertUltraCompatibility(import.meta.url, 'profile')
const { Group } = await import('@deepseek-ai/cordis-plugin-loader')

/** Recheck the owning Loader tree before each initial load or config replacement. */
export default class UltraProfile extends Group {
  override async update(config: EntryOptions[]): Promise<void> {
    const baseUrl = this.tree.ctx.baseUrl
    if (baseUrl === undefined) {
      throw new UltraCompatibilityError('@benz-ai-x/dsh-agent-team-ultra-profile', 'Loader source directory is unavailable')
    }
    assertUltraCompatibility(new URL('package.json', baseUrl).href, 'profile')
    await super.update(config)
  }
}
