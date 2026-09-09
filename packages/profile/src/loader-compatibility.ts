import { assertUltraCompatibility, UltraCompatibilityError } from '@benz-ai-x/dsh-agent-team-ultra/compatibility'

/** Qualify the actual tree that resolves the public Profile's Loader entries. */
export function assertLoaderCompatibility(baseUrl: string | undefined): void {
  if (baseUrl === undefined) {
    throw new UltraCompatibilityError('@benz-ai-x/dsh-agent-team-ultra-profile', 'Loader source directory is unavailable')
  }
  assertUltraCompatibility(new URL('package.json', baseUrl).href, 'profile')
}
