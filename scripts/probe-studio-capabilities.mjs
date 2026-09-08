/** Check member capability admission and live Studio facts through installed Loader rows. */
import assert from 'node:assert/strict'

export async function probeStudioCapabilities({ ctx, installed, harnessUrl, entries, LlmAdapter, SessionId }) {
  class HoldingAdapter extends LlmAdapter {
    providerInfo(provider) { return { id: provider, name: 'Packed collaboration' } }
    async listModels(provider) { return [{ provider, id: 'reviewer', name: 'Packed reviewer' }] }
    async resolveModel(provider, model) { return { provider, id: model, name: 'Packed reviewer' } }
    async *stream(options) {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      await new Promise(resolve => {
        if (options.signal.aborted) resolve()
        else options.signal.addEventListener('abort', resolve, { once: true })
      })
    }
  }
  const provider = 'packed-collaboration'
  const stopAdapter = ctx.llm.registerAdapter([provider], new HoldingAdapter())
  const toolsEntry = {
    id: 'packed-collaboration-tools', name: installed('@deepseek-ai/dsh-experimental-tool-agent-team'),
    config: { freshProvider: 'packed-collaboration-spawn', forkProvider: 'fork' },
  }
  const spawnEntry = {
    id: 'packed-collaboration-spawn', name: harnessUrl('packages/subagent/subagent-spawn-in-process'),
    config: { providerName: 'packed-collaboration-spawn' },
  }
  const controller = new AbortController()
  let iterator
  let lead
  let member
  try {
    await ctx.loader.root.update([...entries, spawnEntry, toolsEntry])
    await ctx.loader.await()
    lead = await ctx.agents.create({
      sessionId: SessionId('packed-collaboration-lead'), agentOptions: { provider, model: 'reviewer' },
    })
    member = (await ctx.agentTeams.spawnTeammate(lead.agent, {
      name: 'dsh-collaborator', description: 'Check installed Team tools.', context: 'fresh',
      provider: 'packed-collaboration-spawn', prompt: [{ type: 'text', text: 'Wait for the probe.' }],
      signal: controller.signal,
    })).member
    const child = ctx.agents.get(member.id)
    assert.ok(child)
    const read = () => ctx.typertGateway.invoke({
      namespace: 'digitalEmployees', method: 'view', args: { agentId: lead.agent.id },
    })
    const row = view => view.teamMembers.find(value => value.memberId === member.id)
    assert.equal(row(await read()).collaborationStatus, 'full')
    const stream = await ctx.typertGateway.stream({
      namespace: 'digitalEmployees', method: 'watch', args: { agentId: lead.agent.id },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
    })
    iterator = stream[Symbol.asyncIterator]()
    assert.equal((await iterator.next()).value.type, 'baseline')
    await ctx.loader.remove(toolsEntry.id)
    assert.equal(child.ctx.tools.schemas(child).some(tool => tool.name === 'send_message'), false)
    assert.equal(row(await read()).collaborationStatus, 'limited')
    const replacement = await iterator.next()
    assert.equal(replacement.value.type, 'replace')
    assert.equal(row(replacement.value.value).collaborationStatus, 'limited')
    assert.equal(row(replacement.value.value).runtimeCapabilities.includes('full-collaboration'), false)
    await ctx.loader.root.update([...entries, spawnEntry, toolsEntry])
    await ctx.loader.await()
    assert.equal(row((await iterator.next()).value.value).collaborationStatus, 'full')

    const attached = new Set()
    const registration = ctx.digitalEmployees.registerExternalRuntimeProvider({
      id: 'packed-incomplete', displayName: 'Packed incomplete member', contextModes: ['fresh'],
      profileCapabilities: ['persona', 'mission'], runtimeCapabilities: ['full-collaboration'],
      memberOperations: ['members.list', 'tasks.list', 'tasks.get', 'messages.send', 'tasks.update', 'wait'],
      bindMemberOperations() {},
      async create() {
        attached.add('packed-incomplete-handle')
        return { nativeHandle: 'packed-incomplete-handle', presence: 'idle', memberOperations: [] }
      },
      async resume() { return undefined },
      async deliver() { throw new Error('Incompatible runtime must not receive work') },
      interrupt() { return { previousStatus: 'idle' } },
      async dispose(request) { attached.delete(request.nativeHandle) },
    })
    try {
      await ctx.digitalEmployees.whenRuntimeCatalogSettled()
      await assert.rejects(ctx.agentTeams.spawnTeammate(lead.agent, {
        name: 'incomplete-collaborator', description: 'Require exact full collaboration.', context: 'fresh',
        prompt: [{ type: 'text', text: 'Review.' }], signal: controller.signal,
        runtime: {
          kind: 'external-agent', provider: 'packed-incomplete', launchRequestId: 'packed-incomplete-launch',
          profile: {
            persona: 'Review.', mission: 'Report.', context: [], memory: [], hooks: [],
            toolPolicy: { mode: 'inherit', names: [] },
          },
          requirements: {
            contextMode: 'fresh', profileCapabilities: ['persona', 'mission'],
            runtimeCapabilities: ['full-collaboration'],
          },
        },
      }), error => error.code === 'TEAM_RUNTIME_CAPABILITY_MISMATCH')
      assert.equal(attached.size, 0)
      await ctx.digitalEmployees.whenRuntimeCatalogSettled()
      const refused = (await read()).teamMembers.find(value => value.memberName === 'incomplete-collaborator')
      assert.notEqual(refused.provisioningPhase, 'active')
      assert.notEqual(refused.runtimeAvailability, 'available')
    } finally { await registration() }
    console.log('PASS packed Studio exact DSH tools, live replacements and required native collaboration refusal')
  } finally {
    controller.abort()
    await iterator?.return?.()
    if (lead !== undefined && member !== undefined) {
      ctx.agentTeams.interrupt(lead.agent, member.name)
      await ctx.agents.get(member.id)?.whenIdle()
    }
    await ctx.loader.root.update(entries)
    await ctx.loader.await()
    stopAdapter()
  }
}
