/** Browser entry for Agent Team Ultra. */

import digitalEmployeesRemote from '@deepseek-ai/dsh-agent-team-ultra/remote'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { mountDigitalEmployeeStudio } from './mount.ts'

export { inject } from './mount.ts'
export type { DigitalEmployeeStudioInjected, DigitalEmployeeStudioProps } from './Studio.tsx'
export type { UltraKey } from './locales.ts'

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  return await mountDigitalEmployeeStudio(ctx, digitalEmployeesRemote)
}
