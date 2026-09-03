/** Durable storage-domain and input schemas for Agent Team Ultra. */

import { Buffer } from 'node:buffer'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { TeammateRuntimeHandle } from '@deepseek-ai/dsh-experimental-agent-team'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import type {
  DigitalEmployeeEvalRunId,
  DigitalEmployeeEvalSetDraft,
  DigitalEmployeeProfile,
  DigitalEmployeeProfileDraft,
  DigitalEmployeeRuntimeTarget,
  LaunchRequestId,
  NativeRuntimeHandle,
  ProfileHook,
  ProfileTextBlock,
  ProfileToolPolicy,
  SelectableDigitalEmployeeRuntimeTarget,
} from './types.ts'

const lowerKebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/u
const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

/** Canonical lowercase UUID accepted as one caller-owned launch identity. */
export const launchRequestIdSchema = z.string().regex(canonicalUuid)
  .transform(value => brandString<LaunchRequestId>(value))

/** Canonical lowercase UUID accepted as one idempotent Eval Run identity. */
export const evalRunIdSchema = z.string().regex(canonicalUuid)
  .transform(value => brandString<DigitalEmployeeEvalRunId>(value))

/** Bounded non-secret identity returned by one durable native provider. */
export const nativeRuntimeHandleSchema = z.string()
  .min(1)
  .refine(value => Buffer.byteLength(value, 'utf8') <= 200, {
    message: 'native runtime handle must be at most 200 UTF-8 bytes',
  })
  .transform(value => brandString<NativeRuntimeHandle>(value))

/** Rebrand an upstream-validated opaque teammate handle for Ultra persistence. */
export function nativeRuntimeHandleFromTeammate(handle: TeammateRuntimeHandle): NativeRuntimeHandle {
  return brandString<NativeRuntimeHandle>(handle)
}

export const profileTextBlockSchema = z.object({
  id: z.string().min(1).max(64).regex(identifier),
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(16_384),
  enabled: z.boolean(),
}).strict() satisfies z.ZodType<ProfileTextBlock>

export const profileToolPolicySchema = z.object({
  mode: z.union([z.literal('inherit'), z.literal('allow'), z.literal('deny')]),
  names: z.array(z.string().trim().min(1).max(128)).max(256),
}).strict().superRefine((policy, ctx) => {
  if (policy.mode === 'inherit' && policy.names.length !== 0) {
    ctx.addIssue({ code: 'custom', path: ['names'], message: 'inherit tool policy must not name tools' })
  }
  if (new Set(policy.names).size !== policy.names.length) {
    ctx.addIssue({ code: 'custom', path: ['names'], message: 'tool names must be unique' })
  }
}) as unknown as z.ZodType<ProfileToolPolicy>

export const profileHookSchema = z.object({
  id: z.string().min(1).max(64).regex(identifier),
  point: z.union([
    z.literal('session-start'),
    z.literal('before-step'),
    z.literal('before-tool'),
    z.literal('after-tool'),
  ]),
  effect: z.union([z.literal('context'), z.literal('deny'), z.literal('ask')]),
  matcher: z.string().trim().min(1).max(128).optional(),
  text: z.string().trim().min(1).max(4096),
  enabled: z.boolean(),
}).strict().superRefine((hook, ctx) => {
  if ((hook.point === 'session-start' || hook.point === 'before-step')
    && (hook.effect !== 'context' || hook.matcher !== undefined)) {
    ctx.addIssue({ code: 'custom', message: `${hook.point} hooks require context effect without matcher` })
  }
  if (hook.point === 'before-tool' && hook.effect !== 'deny' && hook.effect !== 'ask') {
    ctx.addIssue({ code: 'custom', path: ['effect'], message: 'before-tool hooks support only deny or ask' })
  }
  if (hook.point === 'after-tool' && hook.effect !== 'context') {
    ctx.addIssue({ code: 'custom', path: ['effect'], message: 'after-tool hooks support only context' })
  }
  if ((hook.point === 'before-tool' || hook.point === 'after-tool') && hook.matcher === undefined) {
    ctx.addIssue({ code: 'custom', path: ['matcher'], message: `${hook.point} hooks require a tool matcher` })
  }
}) as unknown as z.ZodType<ProfileHook>

const sharedProfileFields = {
  id: z.string().trim().min(1).max(64).regex(lowerKebab),
  employeeName: z.string().trim().min(1).max(64).regex(lowerKebab).refine(value => value !== 'lead', {
    message: 'employeeName cannot be lead',
  }),
  displayName: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(200),
  contextMode: z.union([z.literal('fresh'), z.literal('fork')]),
  persona: z.string().trim().min(1).max(16_384),
  mission: z.string().trim().min(1).max(16_384),
  toolPolicy: profileToolPolicySchema,
  context: z.array(profileTextBlockSchema).max(128),
  memory: z.array(profileTextBlockSchema).max(128),
  hooks: z.array(profileHookSchema).max(64),
} as const

function refineProfileCollections(
  profile: { readonly context: readonly ProfileTextBlock[]; readonly memory: readonly ProfileTextBlock[]; readonly hooks: readonly ProfileHook[] },
  ctx: z.core.$RefinementCtx,
): void {
  for (const field of ['context', 'memory', 'hooks'] as const) {
    const ids = profile[field].map(item => item.id)
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: [field], message: `${field} ids must be unique` })
    }
  }
}

const profileDraftObject = z.object({
  ...sharedProfileFields,
  continuationProvider: z.string().trim().min(1).max(200),
}).strict().superRefine(refineProfileCollections)

/** Exact v0 spelling retained solely for deterministic migration reads. */
export const legacyDigitalEmployeeProfileDraftSchema = z.object({
  ...sharedProfileFields,
  provider: z.string().trim().min(1).max(200),
}).strict().superRefine(refineProfileCollections)

export type LegacyDigitalEmployeeProfileDraft = z.infer<typeof legacyDigitalEmployeeProfileDraftSchema>
export type LegacyDigitalEmployeeProfile = LegacyDigitalEmployeeProfileDraft & {
  readonly revision: number
  readonly createdAt: number
  readonly updatedAt: number
}

export const digitalEmployeeProfileDraftSchema = profileDraftObject as unknown as z.ZodType<DigitalEmployeeProfileDraft>

export const digitalEmployeeProfileSchema = profileDraftObject.safeExtend({
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  createdAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  updatedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).refine(profile => profile.updatedAt >= profile.createdAt, {
  path: ['updatedAt'],
  message: 'updatedAt must not precede createdAt',
}) as unknown as z.ZodType<DigitalEmployeeProfile>

export const legacyDigitalEmployeeProfileSchema = legacyDigitalEmployeeProfileDraftSchema.safeExtend({
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  createdAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  updatedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).refine(profile => profile.updatedAt >= profile.createdAt, {
  path: ['updatedAt'],
  message: 'updatedAt must not precede createdAt',
}) as unknown as z.ZodType<LegacyDigitalEmployeeProfile>

const dshModelRuntimeTargetSchema = z.object({
  kind: z.literal('dsh-model'),
  provider: z.string().trim().min(1).max(200).regex(identifier),
  model: z.string().trim().min(1).max(300),
  reasoningEffort: z.string().trim().min(1).max(100).optional(),
}).strict()

const externalAgentRuntimeTargetSchema = z.object({
  kind: z.literal('external-agent'),
  provider: z.string().trim().min(1).max(200).regex(identifier),
}).strict()

export const selectableDigitalEmployeeRuntimeTargetSchema = z.union([
  dshModelRuntimeTargetSchema,
  externalAgentRuntimeTargetSchema,
]) as z.ZodType<SelectableDigitalEmployeeRuntimeTarget>

export const digitalEmployeeRuntimeTargetSchema = z.union([
  z.object({ kind: z.literal('legacy-inherit-lead') }).strict(),
  dshModelRuntimeTargetSchema,
  externalAgentRuntimeTargetSchema,
]) as z.ZodType<DigitalEmployeeRuntimeTarget>

const evalFixtureSchema = z.object({
  id: z.string().trim().min(1).max(64).regex(identifier),
  content: z.string().min(1).max(16_384),
}).strict()

const runTerminalSchema = z.enum([
  'completed',
  'cancelled',
  'blocked',
  'failed',
  'max-tokens',
  'interrupted',
  'unknown-terminal',
])

const uniqueBoundedStrings = (maximum: number, itemMaximum: number) => z.array(
  z.string().min(1).max(itemMaximum),
).max(maximum).superRefine((values, ctx) => {
  if (new Set(values).size !== values.length) {
    ctx.addIssue({ code: 'custom', message: 'values must be unique' })
  }
})

const evalAssertionsSchema = z.object({
  acceptedTerminals: z.array(runTerminalSchema).min(1).max(7),
  requiredTools: uniqueBoundedStrings(256, 128),
  forbiddenTools: uniqueBoundedStrings(256, 128),
  requiredOutputSubstrings: uniqueBoundedStrings(64, 1024),
  forbiddenOutputSubstrings: uniqueBoundedStrings(64, 1024),
  maxSteps: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  maxReportedTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  maxElapsedMs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
}).strict().superRefine((assertions, ctx) => {
  const bothTools = assertions.requiredTools.filter(name => assertions.forbiddenTools.includes(name))
  if (bothTools.length > 0) {
    ctx.addIssue({ code: 'custom', message: `tools cannot be both required and forbidden: ${bothTools.join(', ')}` })
  }
  const bothOutput = assertions.requiredOutputSubstrings
    .filter(value => assertions.forbiddenOutputSubstrings.includes(value))
  if (bothOutput.length > 0) {
    ctx.addIssue({ code: 'custom', message: 'output substrings cannot be both required and forbidden' })
  }
})

const evalCaseSchema = z.object({
  id: z.string().trim().min(1).max(64).regex(identifier),
  title: z.string().trim().min(1).max(120),
  input: z.string().min(1).max(32_768),
  fixtures: z.array(evalFixtureSchema).max(64),
  assertions: evalAssertionsSchema,
}).strict().superRefine((testCase, ctx) => {
  const fixtureIds = testCase.fixtures.map(fixture => fixture.id)
  if (new Set(fixtureIds).size !== fixtureIds.length) {
    ctx.addIssue({ code: 'custom', path: ['fixtures'], message: 'fixture ids must be unique per Case' })
  }
})

const evalPassPolicySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }).strict(),
  z.object({
    kind: z.literal('minimum'),
    minimumPassed: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  }).strict(),
])

/** Browser-safe bounded authoring schema for immutable Eval Set Revisions. */
export const digitalEmployeeEvalSetDraftSchema = z.object({
  id: z.string().trim().min(1).max(64).regex(lowerKebab),
  profileId: z.string().trim().min(1).max(64).regex(lowerKebab),
  displayName: z.string().trim().min(1).max(120),
  toolAllowlist: uniqueBoundedStrings(256, 128),
  resourceCeilings: z.object({
    maxSteps: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    maxOutputTokens: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    maxElapsedMs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  }).strict(),
  passPolicy: evalPassPolicySchema,
  cases: z.array(evalCaseSchema).min(1).max(64),
}).strict().superRefine((evalSet, ctx) => {
  const caseIds = evalSet.cases.map(testCase => testCase.id)
  if (new Set(caseIds).size !== caseIds.length) {
    ctx.addIssue({ code: 'custom', path: ['cases'], message: 'Case ids must be unique' })
  }
  if (evalSet.passPolicy.kind === 'minimum'
    && evalSet.passPolicy.minimumPassed > evalSet.cases.length) {
    ctx.addIssue({ code: 'custom', path: ['passPolicy'], message: 'minimumPassed exceeds Case count' })
  }
}) as z.ZodType<DigitalEmployeeEvalSetDraft>

export const digitalEmployeeBindingSchema = z.object({
  teamId: z.string().min(1),
  memberName: z.string().min(1).max(64),
  memberId: z.string().min(1).optional(),
  profileId: z.string().min(1).max(64),
  profileRevision: z.number().int().positive(),
  profile: legacyDigitalEmployeeProfileSchema,
  phase: z.union([z.literal('pending'), z.literal('active'), z.literal('failed')]),
  error: z.string().max(2048).optional(),
}).strict()

export type DigitalEmployeeBinding = z.infer<typeof digitalEmployeeBindingSchema>

export const digitalEmployeeDomainSpec = defineDomain({
  name: 'agent_team_ultra',
  version: 0,
  tables: {
    profiles: domainTable<string, LegacyDigitalEmployeeProfile>(legacyDigitalEmployeeProfileSchema),
    bindings: domainTable<string, DigitalEmployeeBinding>(digitalEmployeeBindingSchema),
  },
})
