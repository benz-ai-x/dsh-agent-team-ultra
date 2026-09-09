import s from '@deepseek-ai/schemastery'

const DEFAULT_PROVIDER = 'spawn'
const DEFAULT_MAX_PROFILES = 64
const DEFAULT_MAX_PROFILE_BYTES = 131_072
const DEFAULT_MAX_HOOKS = 32
const DEFAULT_MAX_ASSIGNMENT_BYTES = 32_768
const DEFAULT_MAX_REVISION_HISTORY = 32
const DEFAULT_MAX_DIFF_ENTRIES = 512

/** Loader schema; defaults are universal operational limits, not deployment policy guesses. */
export const Config: s<Config> = s.object({
  defaultContinuationProvider: s.string(),
  maxProfiles: s.number().step(1).min(1).default(DEFAULT_MAX_PROFILES),
  maxProfileBytes: s.number().step(1).min(1024).default(DEFAULT_MAX_PROFILE_BYTES),
  maxHooks: s.number().step(1).min(0).default(DEFAULT_MAX_HOOKS),
  maxAssignmentBytes: s.number().step(1).min(1).default(DEFAULT_MAX_ASSIGNMENT_BYTES),
  maxRevisionHistory: s.number().step(1).min(1).default(DEFAULT_MAX_REVISION_HISTORY),
  maxDiffEntries: s.number().step(1).min(1).default(DEFAULT_MAX_DIFF_ENTRIES),
})
/** Deployment limits and the fallback continuation provider. */
export interface Config {
  readonly defaultContinuationProvider?: string
  readonly maxProfiles?: number
  readonly maxProfileBytes?: number
  readonly maxHooks?: number
  readonly maxAssignmentBytes?: number
  readonly maxRevisionHistory?: number
  readonly maxDiffEntries?: number
}

export interface ResolvedConfig {
  readonly defaultContinuationProvider: string
  readonly maxProfiles: number
  readonly maxProfileBytes: number
  readonly maxHooks: number
  readonly maxAssignmentBytes: number
  readonly maxRevisionHistory: number
  readonly maxDiffEntries: number
}

/** Validate a direct-constructor integer that Loader normally checks. */
function positiveInteger(name: string, value: number, minimum = 1): number {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`agent-team-ultra: ${name} must be a safe integer >= ${minimum}`)
  }
  return value
}

export function resolveConfig(config: Config): ResolvedConfig {
  const resolved: ResolvedConfig = {
    defaultContinuationProvider: (
      config.defaultContinuationProvider ?? DEFAULT_PROVIDER
    ).trim(),
    maxProfiles: positiveInteger('maxProfiles', config.maxProfiles ?? DEFAULT_MAX_PROFILES),
    maxProfileBytes: positiveInteger('maxProfileBytes', config.maxProfileBytes ?? DEFAULT_MAX_PROFILE_BYTES, 1024),
    maxHooks: positiveInteger('maxHooks', config.maxHooks ?? DEFAULT_MAX_HOOKS, 0),
    maxAssignmentBytes: positiveInteger('maxAssignmentBytes', config.maxAssignmentBytes ?? DEFAULT_MAX_ASSIGNMENT_BYTES),
    maxRevisionHistory: positiveInteger(
      'maxRevisionHistory',
      config.maxRevisionHistory ?? DEFAULT_MAX_REVISION_HISTORY,
    ),
    maxDiffEntries: positiveInteger('maxDiffEntries', config.maxDiffEntries ?? DEFAULT_MAX_DIFF_ENTRIES),
  }
  if (resolved.defaultContinuationProvider === '') {
    throw new TypeError('agent-team-ultra: defaultContinuationProvider must not be blank')
  }
  return resolved
}
