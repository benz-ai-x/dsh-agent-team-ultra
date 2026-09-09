/** Strict inputs for the isolated official DSH-only product. */
import { z } from 'zod'
import type { DigitalEmployeeProfile, DigitalEmployeeProfileDraft, ProfileHook, ProfileTextBlock, ProfileToolPolicy } from './types.ts'

const lowerKebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/u
export const launchRequestIdSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u)

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


export const digitalEmployeeProfileDraftSchema = profileDraftObject as unknown as z.ZodType<DigitalEmployeeProfileDraft>
export const digitalEmployeeProfileSchema = profileDraftObject.safeExtend({
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  createdAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  updatedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).refine(profile => profile.updatedAt >= profile.createdAt) as unknown as z.ZodType<DigitalEmployeeProfile>
