/** Durable storage-domain and input schemas for Agent Team Ultra. */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type {
  DigitalEmployeeProfile,
  DigitalEmployeeProfileDraft,
  ProfileHook,
  ProfileTextBlock,
  ProfileToolPolicy,
} from './types.ts'

const lowerKebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/u

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
  effect: z.union([z.literal('context'), z.literal('deny')]),
  matcher: z.string().trim().min(1).max(128).optional(),
  text: z.string().trim().min(1).max(4096),
  enabled: z.boolean(),
}).strict().superRefine((hook, ctx) => {
  if ((hook.point === 'session-start' || hook.point === 'before-step')
    && (hook.effect !== 'context' || hook.matcher !== undefined)) {
    ctx.addIssue({ code: 'custom', message: `${hook.point} hooks require context effect without matcher` })
  }
  if (hook.point === 'before-tool' && hook.effect !== 'deny') {
    ctx.addIssue({ code: 'custom', path: ['effect'], message: 'before-tool hooks support only deny' })
  }
  if (hook.point === 'after-tool' && hook.effect !== 'context') {
    ctx.addIssue({ code: 'custom', path: ['effect'], message: 'after-tool hooks support only context' })
  }
  if ((hook.point === 'before-tool' || hook.point === 'after-tool') && hook.matcher === undefined) {
    ctx.addIssue({ code: 'custom', path: ['matcher'], message: `${hook.point} hooks require a tool matcher` })
  }
}) as unknown as z.ZodType<ProfileHook>

const profileDraftObject = z.object({
  id: z.string().trim().min(1).max(64).regex(lowerKebab),
  employeeName: z.string().trim().min(1).max(64).regex(lowerKebab).refine(value => value !== 'lead', {
    message: 'employeeName cannot be lead',
  }),
  displayName: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(200),
  provider: z.string().trim().min(1).max(200),
  contextMode: z.union([z.literal('fresh'), z.literal('fork')]),
  persona: z.string().trim().min(1).max(16_384),
  mission: z.string().trim().min(1).max(16_384),
  toolPolicy: profileToolPolicySchema,
  context: z.array(profileTextBlockSchema).max(128),
  memory: z.array(profileTextBlockSchema).max(128),
  hooks: z.array(profileHookSchema).max(64),
}).strict().superRefine((profile, ctx) => {
  for (const field of ['context', 'memory', 'hooks'] as const) {
    const ids = profile[field].map(item => item.id)
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: [field], message: `${field} ids must be unique` })
    }
  }
})

export const digitalEmployeeProfileDraftSchema = profileDraftObject as unknown as z.ZodType<DigitalEmployeeProfileDraft>

export const digitalEmployeeProfileSchema = profileDraftObject.safeExtend({
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  createdAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  updatedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).refine(profile => profile.updatedAt >= profile.createdAt, {
  path: ['updatedAt'],
  message: 'updatedAt must not precede createdAt',
}) as unknown as z.ZodType<DigitalEmployeeProfile>

export const digitalEmployeeBindingSchema = z.object({
  teamId: z.string().min(1),
  memberName: z.string().min(1).max(64),
  memberId: z.string().min(1).optional(),
  profileId: z.string().min(1).max(64),
  profileRevision: z.number().int().positive(),
  profile: digitalEmployeeProfileSchema,
  phase: z.union([z.literal('pending'), z.literal('active'), z.literal('failed')]),
  error: z.string().max(2048).optional(),
}).strict()

export type DigitalEmployeeBinding = z.infer<typeof digitalEmployeeBindingSchema>

export const digitalEmployeeDomainSpec = defineDomain({
  name: 'agent_team_ultra',
  version: 0,
  tables: {
    profiles: domainTable<string, DigitalEmployeeProfile>(digitalEmployeeProfileSchema),
    bindings: domainTable<string, DigitalEmployeeBinding>(digitalEmployeeBindingSchema),
  },
})
