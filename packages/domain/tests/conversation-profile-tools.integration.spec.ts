import {
  createUserMessage,
  LlmAdapter,
  ToolCallId,
  type GenerateOptions,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { defineContentToolFixture, type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi } from 'vitest'
import type { DigitalEmployeeStudioView, SpawnDigitalEmployeeResult } from '../src/types.ts'
import { profile, target, workflow } from './fixtures/host-workflow.ts'

const SIGNAL = new AbortController().signal
const ULTRA_PROFILE_TOOLS = [
  'ultra_profile_detail',
  'ultra_profile_launch',
  'ultra_profile_list',
] as const

class ConversationLaunchAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  private calls = 0

  override providerInfo(provider: string) { return { id: provider, name: 'Conversation launch' } }

  override async listModels(provider: string) {
    return [{ provider, id: 'lead', name: 'Lead' }]
  }

  override async resolveModel(provider: string, model: string) {
    return { provider, id: model, name: 'Lead' }
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    if (this.calls === 0) {
      this.calls += 1
      const id = ToolCallId('persisted-ultra-profile-launch')
      const args = JSON.stringify({ profile_id: profile.id, assignment: 'Review through the conversation.' })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id, name: 'ultra_profile_launch', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'ultra_profile_launch', arguments: args } }
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 4 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    this.calls += 1
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'The Profile-bound employee is launched.' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'The Profile-bound employee is launched.' } }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 7 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

function execute(
  runtime: Awaited<ReturnType<typeof workflow>>,
  name: typeof ULTRA_PROFILE_TOOLS[number],
  callId: string,
  args: unknown,
  signal: AbortSignal = SIGNAL,
): Promise<ToolExecutionResult> {
  return runtime.ctx.tools.execute({
    agent: runtime.lead.agent,
    callId: ToolCallId(callId),
    name,
    arguments: args,
    signal,
  })
}

function value(result: ToolExecutionResult): unknown {
  if (result.isError) throw new Error(result.error.message)
  return result.value
}

async function saveAndActivate(runtime: Awaited<ReturnType<typeof workflow>>): Promise<void> {
  await expect(runtime.invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target }))
    .resolves.toMatchObject({ ok: true })
  await expect(runtime.invoke('activate', {
    profileId: profile.id,
    revision: 1,
    expectedHeadRevision: 1,
  })).resolves.toMatchObject({ ok: true })
}

describe('conversational Ultra Profile tools', () => {
  it('publishes fixed Lead-only list/detail/launch schemas and keeps ordinary Team members unbound', async () => {
    const runtime = await workflow()
    const leadSchemas = runtime.ctx.tools.schemas(runtime.lead.agent).map(tool => tool.name)
    expect(leadSchemas.filter(name => name.startsWith('ultra_profile_')).sort()).toEqual(ULTRA_PROFILE_TOOLS)
    expect(new Set(leadSchemas).size).toBe(leadSchemas.length)
    expect(runtime.ctx.tools.schemas(runtime.observer.agent).map(tool => tool.name)
      .filter(name => name.startsWith('ultra_profile_')).sort()).toEqual(ULTRA_PROFILE_TOOLS)
    const futureLead = await runtime.ctx.agents.create({
      sessionId: SessionId('future-conversation-lead'),
    })
    expect(runtime.ctx.tools.schemas(futureLead.agent).map(tool => tool.name)
      .filter(name => name.startsWith('ultra_profile_')).sort()).toEqual(ULTRA_PROFILE_TOOLS)

    await expect(runtime.invoke('save', { expectedHeadRevision: null, profile, runtimeTarget: target }))
      .resolves.toMatchObject({ ok: true })
    expect(value(await execute(runtime, 'ultra_profile_list', 'profile-list-1', {}))).toMatchObject({
      profiles: [{
        profileId: profile.id,
        employeeName: profile.employeeName,
        displayName: profile.displayName,
        headRevision: 1,
        latestRevision: 1,
        archived: false,
      }],
    })
    expect(value(await execute(runtime, 'ultra_profile_detail', 'profile-detail-1', {
      profile_id: profile.id,
    }))).toMatchObject({
      ok: true,
      value: {
        head: { profileId: profile.id, latestRevision: 1 },
        latest: {
          revision: 1,
          profile: { id: profile.id, mission: profile.mission },
          runtimeTarget: target,
          requiredCapabilities: { contextMode: 'fresh' },
        },
        latestPromotionGate: { status: 'not-required' },
      },
    })
    expect(value(await execute(runtime, 'ultra_profile_launch', 'profile-launch-inactive', {
      profile_id: profile.id,
    }))).toMatchObject({ ok: false, error: { code: 'profile-not-active' } })
    expect(value(await execute(runtime, 'ultra_profile_detail', 'profile-detail-invalid', {
      profile_id: '../reviewer',
    }))).toMatchObject({ ok: false, error: { code: 'profile-invalid' } })
    expect(value(await execute(runtime, 'ultra_profile_launch', 'profile-launch-invalid', {
      profile_id: 'R'.repeat(1_000),
    }))).toMatchObject({ ok: false, error: { code: 'profile-invalid' } })
    expect((await runtime.invoke('view') as DigitalEmployeeStudioView).instances).toEqual([])

    const ordinary = await runtime.ctx.agentTeams.spawnTeammate(runtime.lead.agent, {
      name: 'ordinary-reviewer',
      description: 'Ordinary Team member without an Ultra Profile Binding.',
      prompt: [{ type: 'text', text: 'Report one finding.' }],
      context: 'fresh',
      provider: 'spawn',
      agentOptions: { provider: target.provider, model: target.model },
      signal: SIGNAL,
    })
    const ordinaryAgent = runtime.ctx.agents.get(SessionId(ordinary.member.id))
    if (ordinaryAgent !== undefined) {
      expect(runtime.ctx.tools.schemas(ordinaryAgent).map(tool => tool.name)
        .filter(name => name.startsWith('ultra_profile_'))).toEqual([])
    }
    await vi.waitFor(() => { expect(runtime.adapter.requests.length).toBeGreaterThan(0) })
    expect(runtime.adapter.requests[0]?.tools?.map(tool => tool.name)
      .filter(name => name.startsWith('ultra_profile_'))).toEqual([])
    expect((await runtime.invoke('view') as DigitalEmployeeStudioView).instances).toEqual([])

    await runtime.observer.dispose()
    expect(runtime.ctx.tools.schemas(runtime.observer.agent).map(tool => tool.name)
      .filter(name => name.startsWith('ultra_profile_'))).toEqual([])
    expect(await runtime.ctx.tools.execute({
      agent: runtime.observer.agent,
      callId: ToolCallId('disposed-lead-profile-list'),
      name: 'ultra_profile_list',
      arguments: {},
      signal: SIGNAL,
    })).toMatchObject({ isError: true, error: { info: { code: 'UNKNOWN_TOOL' } } })
    await futureLead.dispose()
  })

  it('refuses a visible fixed-name collision and rolls back partial Lead registrations', async () => {
    const runtime = await workflow()
    await runtime.fiber.dispose()
    const releaseCollision = runtime.lead.agent.ctx.tools.register(defineContentToolFixture({
      name: 'ultra_profile_list',
      description: 'Conflicting tool owned by another plugin.',
      parameters: {},
      async execute() { return [] },
    }))

    const replacement = runtime.ctx.plugin((await import('../lib/index.js')).default)
    await expect(replacement).rejects.toThrow('Ultra Profile tool name collision: ultra_profile_list')
    expect(runtime.ctx.tools.schemas(runtime.observer.agent).map(tool => tool.name)
      .filter(name => name.startsWith('ultra_profile_'))).toEqual([])
    releaseCollision()
  })

  it('derives one canonical Launch Request ID per durable tool call and converges with generated Remote', async () => {
    const runtime = await workflow()
    await saveAndActivate(runtime)
    const args = { profile_id: profile.id, assignment: 'Review the fixed route.' }

    const first = value(await execute(runtime, 'ultra_profile_launch', 'profile-launch-stable', args)) as SpawnDigitalEmployeeResult
    const replay = value(await execute(runtime, 'ultra_profile_launch', 'profile-launch-stable', {
      ...args,
      assignment: `  ${args.assignment}  `,
    })) as SpawnDigitalEmployeeResult
    expect(first).toMatchObject({
      ok: true,
      value: {
        memberName: profile.employeeName,
        profileRevision: 1,
        provisioningPhase: 'active',
        runtimeTarget: target,
        resolvedRuntimeTarget: target,
        launchRequestId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u),
      },
    })
    expect(replay).toEqual(first)
    if (!first.ok) throw new Error(first.error.message)
    await expect(runtime.invoke('spawn', {
      launchRequestId: first.value.launchRequestId,
      profileId: profile.id,
      assignment: args.assignment,
    })).resolves.toEqual(first)
    expect(value(await execute(runtime, 'ultra_profile_launch', 'profile-launch-stable', {
      ...args,
      assignment: 'Changed assignment under the same tool call.',
    }))).toMatchObject({ ok: false, error: { code: 'launch-request-conflict' } })
    const separate = value(await execute(runtime, 'ultra_profile_launch', 'profile-launch-new-intent', args)) as SpawnDigitalEmployeeResult
    expect(separate).toMatchObject({ ok: false, error: { code: 'profile-in-use' } })
    expect(value(await execute(runtime, 'ultra_profile_list', 'profile-list-active', {}))).toMatchObject({
      profiles: [{
        activeRevision: 1,
        active: {
          revision: 1,
          runtimeTarget: target,
          requiredCapabilities: {
            contextMode: profile.contextMode,
            profileCapabilities: ['persona', 'mission'],
          },
          runtimeAvailability: 'available',
        },
        instances: [{
          memberName: profile.employeeName,
          launchRequestId: first.value.launchRequestId,
          provisioningPhase: 'active',
          runtimeTarget: target,
          resolvedRuntimeTarget: target,
        }],
      }],
    })
    expect(value(await execute(runtime, 'ultra_profile_detail', 'profile-detail-active', {
      profile_id: profile.id,
    }))).toMatchObject({
      ok: true,
      value: {
        active: {
          revision: {
            revision: 1,
            profile: { id: profile.id },
            runtimeTarget: target,
            requiredCapabilities: { contextMode: profile.contextMode },
          },
          runtimeAvailability: 'available',
        },
        instances: [{ memberId: first.value.memberId }],
      },
    })
    const view = await runtime.invoke('view') as DigitalEmployeeStudioView
    expect(view.instances).toHaveLength(1)
    expect(runtime.ctx.agentTeams.listMembers(runtime.lead.agent)
      .filter(member => member.name === profile.employeeName)).toHaveLength(1)
  })

  it('executes from a model-visible schema and persists the call/result identity in the Lead Session', async () => {
    const runtime = await workflow()
    await saveAndActivate(runtime)
    const adapter = new ConversationLaunchAdapter()
    runtime.ctx.llm.registerAdapter(['conversation-launch'], adapter)
    Object.assign(runtime.lead.agent.options, { provider: 'conversation-launch', model: 'lead' })
    runtime.lead.agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'Use Team collaboration and launch the Reviewer Profile.' }],
      source: { kind: 'user' },
    }))
    await runtime.lead.agent.whenIdle()

    expect(adapter.requests[0]?.tools?.map(tool => tool.name)
      .filter(name => name.startsWith('ultra_profile_')).sort()).toEqual(ULTRA_PROFILE_TOOLS)
    const events = runtime.lead.agent.session.snapshotEvents()
    expect(events.filter(event => event.type === 'tool/call')).toMatchObject([{
      data: {
        callId: 'persisted-ultra-profile-launch',
        name: 'ultra_profile_launch',
        arguments: JSON.stringify({ profile_id: profile.id, assignment: 'Review through the conversation.' }),
      },
    }])
    const view = await runtime.invoke('view') as DigitalEmployeeStudioView
    expect(view.instances).toHaveLength(1)
    const instance = view.instances[0]!
    expect(instance.launchRequestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u)
    expect(JSON.stringify(events.filter(event => event.type === 'tool/result'))).toContain(instance.launchRequestId)

    const replay = value(await execute(runtime, 'ultra_profile_launch', 'persisted-ultra-profile-launch', {
      profile_id: profile.id,
      assignment: 'Review through the conversation.',
    }))
    expect(replay).toEqual({ ok: true, value: instance })
  })

  it.each(['binding', 'team'] as const)('preserves retry identity across cancellation at the durable %s boundary', async (boundary) => {
    const runtime = await workflow()
    await saveAndActivate(runtime)
    const controller = new AbortController()
    const stop = boundary === 'binding'
      ? runtime.ctx.on('domain/changed', change => {
          if (change.domain === 'agent_team_ultra_v1' && change.table === 'bindings'
            && change.operation === 'put'
            && (change.value as { provisioningPhase?: string }).provisioningPhase === 'pending') {
            controller.abort(new Error('cancel at pending Binding'))
          }
        })
      : runtime.ctx.on('session/event', (session, event) => {
          if (session.id === runtime.lead.agent.id && event.type === 'team/member'
            && event.data.member.name === profile.employeeName && event.data.member.phase === 'active') {
            controller.abort(new Error('cancel after Team acceptance'))
          }
        })
    const args = { profile_id: profile.id, assignment: `Cancellation at ${boundary}.` }
    const callId = `profile-launch-cancel-${boundary}`
    const cancelled = await execute(runtime, 'ultra_profile_launch', callId, args, controller.signal)
    stop()
    expect(controller.signal.aborted).toBe(true)
    expect(cancelled).toMatchObject(boundary === 'binding'
      ? { isError: true, error: { message: 'cancel at pending Binding' } }
      : { isError: true, error: { info: { code: 'ABORTED' } } })

    let replacement: ReturnType<typeof runtime.ctx.plugin> | undefined
    if (boundary === 'binding') {
      await runtime.fiber.dispose()
      replacement = runtime.ctx.plugin((await import('../lib/index.js')).default)
      await replacement
    }

    const recovered = value(await execute(runtime, 'ultra_profile_launch', callId, args)) as SpawnDigitalEmployeeResult
    expect(recovered).toMatchObject({
      ok: true,
      value: {
        memberName: profile.employeeName,
        profileRevision: 1,
        provisioningPhase: 'active',
      },
    })
    expect(runtime.ctx.agentTeams.listMembers(runtime.lead.agent)
      .filter(member => member.name === profile.employeeName)).toHaveLength(1)
    expect((await runtime.invoke('view') as DigitalEmployeeStudioView).instances).toHaveLength(1)
    await replacement?.dispose()
  })

  it.each(['json', 'sqlite'] as const)('replays the same tool call after a complete %s Host cold restart', async (backend) => {
    const runtime = await workflow(backend)
    await saveAndActivate(runtime)
    const args = { profile_id: profile.id, assignment: 'Recover the response-lost launch.' }
    const before = value(await execute(runtime, 'ultra_profile_launch', 'profile-launch-cold-replay', args))
    expect(before).toMatchObject({ ok: true })
    await runtime.ctx.fiber.dispose()

    const recovered = await workflow(backend, { root: runtime.root, resumeLead: true })
    expect(value(await execute(recovered, 'ultra_profile_launch', 'profile-launch-cold-replay', args))).toEqual(before)
    expect(recovered.ctx.agentTeams.listMembers(recovered.lead.agent)
      .filter(member => member.name === profile.employeeName)).toHaveLength(1)
    expect((await recovered.invoke('view') as DigitalEmployeeStudioView).instances).toMatchObject([{
      memberName: profile.employeeName,
      profileRevision: 1,
      provisioningPhase: 'active',
      runtimePresence: 'inactive',
    }])
  })

  it('removes every schema on Fiber disposal and restores the same tool-call identity after reload', async () => {
    const runtime = await workflow()
    await saveAndActivate(runtime)
    const args = { profile_id: profile.id, assignment: 'Survive a Host reload.' }
    const before = value(await execute(runtime, 'ultra_profile_launch', 'profile-launch-reload', args)) as SpawnDigitalEmployeeResult
    expect(before).toMatchObject({ ok: true })

    await runtime.fiber.dispose()
    expect(runtime.ctx.tools.schemas(runtime.lead.agent).map(tool => tool.name)
      .filter(name => name.startsWith('ultra_profile_'))).toEqual([])
    const absent = await execute(runtime, 'ultra_profile_list', 'profile-list-after-dispose', {})
    expect(absent).toMatchObject({ isError: true, error: { info: { code: 'UNKNOWN_TOOL' } } })

    const replacement = runtime.ctx.plugin((await import('../lib/index.js')).default)
    await replacement
    expect(runtime.ctx.tools.schemas(runtime.lead.agent).map(tool => tool.name)
      .filter(name => name.startsWith('ultra_profile_')).sort()).toEqual(ULTRA_PROFILE_TOOLS)
    const after = value(await execute(runtime, 'ultra_profile_launch', 'profile-launch-reload', args))
    expect(after).toEqual(before)
    await replacement.dispose()
  })
})
