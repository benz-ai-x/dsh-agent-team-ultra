/** Admit the complete overlay before Loader can import any child plugin. */
import { assertUltraCompatibility } from '@benz-ai-x/dsh-agent-team-ultra/compatibility'

assertUltraCompatibility(import.meta.url, 'profile')
const { Group } = await import('@deepseek-ai/cordis-plugin-loader')

export default Group
