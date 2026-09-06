import { Context } from '@deepseek-ai/cordis'
import { DigitalEmployeeHostContext } from './host-context.ts'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'

import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { type UserMessage } from '@deepseek-ai/dsh-session'
import type { PostToolDecision, PreToolDecision } from '@deepseek-ai/dsh-tools'
import type { DigitalEmployeeProfile, ProfileHook, ProfileTextBlock } from './types.ts'
import { authorityRemoteError } from './host-errors.ts'
import { snapshotProfile } from './profile-snapshot.ts'

export const TEAM_OWN_TOOL_NAMES = new Set([
  'spawn_teammate',
  'send_message',
  'followup_task',
  'list_agents',
  'wait_agent',
  'interrupt_agent',
  'team_task_create',
  'team_task_list',
  'team_task_get',
  'team_task_update',
  'run_code',
])

export const PLUGIN_SOURCE = { kind: 'plugin', plugin: 'agent-team-ultra' } as const

/** Render enabled blocks as one bounded, deterministic prompt section. */
function blockSection(title: string, blocks: readonly ProfileTextBlock[]): string {
  const enabled = blocks.filter(block => block.enabled)
  if (enabled.length === 0) return ''
  return [`# ${title}`, ...enabled.map(block => `## ${block.title}\n${block.content}`)].join('\n\n')
}

/** Simple wildcard matcher: `*` spans any substring and every other character is literal. */
function matchesTool(matcher: string, name: string): boolean {
  if (matcher === '*') return true
  const parts = matcher.split('*')
  if (parts.length === 1) return matcher === name
  let cursor = 0
  if (!matcher.startsWith('*')) {
    const first = parts[0] ?? ''
    if (!name.startsWith(first)) return false
    cursor = first.length
  }
  const end = matcher.endsWith('*') ? parts.length : parts.length - 1
  for (let index = 1; index < end; index += 1) {
    const part = parts[index] ?? ''
    if (part === '') continue
    const found = name.indexOf(part, cursor)
    if (found === -1) return false
    cursor = found + part.length
  }
  if (!matcher.endsWith('*')) {
    const last = parts.at(-1) ?? ''
    return name.endsWith(last) && name.length - last.length >= cursor
  }
  return true
}

function hookMessage(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: PLUGIN_SOURCE })
}

export class ProfileCapabilityInstaller {
  private readonly childInstallations = new Map<Agent, () => void>()

  constructor(private readonly host: DigitalEmployeeHostContext) {}

  has(agent: Agent): boolean { return this.childInstallations.has(agent) }

  /** Install one immutable Profile layer into exactly the supplied Agent scope. */
  install(caller: Agent, agent: Agent, source: DigitalEmployeeProfile): () => void {
    if (!this.host.admissionOpen) throw new Error('Digital Employee service is disposing')
    const authorityFailure = this.host.leadAuthorityFailure(caller)
    if (authorityFailure !== undefined) {
      throw authorityRemoteError(authorityFailure, 'install-profile-capabilities')
    }
    if (agent.ctx.agent !== agent) {
      throw new TypeError('Digital Employee Profile capabilities require the exact Agent-owned scope')
    }
    if (this.childInstallations.has(agent)) {
      throw new Error(`Digital Employee Profile capabilities are already installed for Agent "${agent.id}"`)
    }
    const childCtx = agent.ctx
    const profile = snapshotProfile(source)
    const disposers: Array<() => unknown> = []
    const add = (dispose: () => unknown): void => { disposers.push(dispose) }
    try {
      add(childCtx.systemPrompt.section({
        name: 'deployment:persona',
        order: 0,
        text: profile.persona,
      }))
      const context = blockSection('Digital Employee context', profile.context)
      if (context !== '') add(childCtx.systemPrompt.context({ name: 'ultra:context', order: 130, text: context }))
      const memory = blockSection('Curated long-term memory', profile.memory)
      if (memory !== '') add(childCtx.systemPrompt.context({ name: 'ultra:memory', order: 140, text: memory }))
      if (profile.toolPolicy.mode !== 'inherit') {
        add(childCtx.tools.restrict(profile.toolPolicy.mode === 'allow'
          ? { allow: profile.toolPolicy.names }
          : { deny: profile.toolPolicy.names }))
      }
      this.installHooks(childCtx, profile.hooks, add)
    } catch (error: unknown) {
      for (const dispose of disposers.reverse()) void dispose()
      throw error
    }
    let active = true
    const dispose = (): void => {
      if (!active) return
      active = false
      if (this.childInstallations.get(agent) === dispose) this.childInstallations.delete(agent)
      const failures: unknown[] = []
      for (const dispose of disposers.reverse()) {
        try { void dispose() } catch (error: unknown) { failures.push(error) }
      }
      if (failures.length > 0) throw new AggregateError(failures, 'Digital Employee child-scope disposal failed')
    }
    this.childInstallations.set(agent, dispose)
    return dispose
  }

  /** Revoke one exact Agent installation when its published lifecycle ends. */
  remove(agent: Agent): void {
    const dispose = this.childInstallations.get(agent)
    if (dispose === undefined) return
    this.childInstallations.delete(agent)
    dispose()
  }

  /** Revoke every resident child contribution before the owning service Fiber disappears. */
  disposeAll(): void {
    const failures: unknown[] = []
    for (const [agent, dispose] of this.childInstallations) {
      this.childInstallations.delete(agent)
      try { dispose() } catch (error: unknown) { failures.push(error) }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, 'Digital Employee child-scope disposal failed')
    }
  }

  /** Install only the declared, bounded hook semantics—never arbitrary code. */
  private installHooks(childCtx: Context, hooks: readonly ProfileHook[], add: (dispose: () => unknown) => void): void {
    const enabled = hooks.filter(hook => hook.enabled)
    const startup = enabled.filter(hook => hook.point === 'session-start')
    if (startup.length > 0) {
      add(childCtx.on('agent/session-start', ({ agent }) => {
        agent.inject(hookMessage(startup.map(hook => hook.text).join('\n\n')))
      }))
    }
    const beforeStep = enabled.filter(hook => hook.point === 'before-step')
    if (beforeStep.length > 0) {
      const message = hookMessage(beforeStep.map(hook => hook.text).join('\n\n'))
      add(childCtx.on('agent/pre-step', async (_payload, next): Promise<PreStepDecision> => {
        const downstream = await next()
        if (downstream.kind !== 'enter') return downstream
        return { ...downstream, messages: [...downstream.messages, message] }
      }))
    }
    const beforeTool = enabled.filter(hook => hook.point === 'before-tool')
    if (beforeTool.length > 0) {
      add(childCtx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
        const matched = beforeTool.find(hook => matchesTool(hook.matcher ?? '', exec.name))
        if (matched?.effect === 'ask') return { kind: 'ask', reason: matched.text }
        if (matched?.effect === 'deny') return { kind: 'deny', reason: matched.text }
        return await next()
      }))
    }
    const afterTool = enabled.filter(hook => hook.point === 'after-tool')
    if (afterTool.length > 0) {
      add(childCtx.on('tools/post-execute', async (exec, _result, next): Promise<PostToolDecision> => {
        const downstream = await next()
        const matching = afterTool.filter(hook => matchesTool(hook.matcher ?? '', exec.name))
        if (matching.length === 0) return downstream
        const message = hookMessage(matching.map(hook => hook.text).join('\n\n'))
        return {
          ...downstream,
          additionalContexts: [...downstream.additionalContexts ?? [], message],
        }
      }))
    }
  }
}
