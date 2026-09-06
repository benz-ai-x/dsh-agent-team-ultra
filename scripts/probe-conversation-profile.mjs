/** Drive the packed Host's model-visible Profile tools through a real Lead Agent loop. */
import assert from 'node:assert/strict'

export const PROFILE_TOOL_NAMES = Object.freeze([
  'ultra_profile_detail',
  'ultra_profile_launch',
  'ultra_profile_list',
])

function restoreOption(options, name, value) {
  if (value === undefined) delete options[name]
  else options[name] = value
}

/**
 * Make a controlled Lead model list, inspect, and launch one installed Profile.
 * Only the external model response is controlled; dispatch uses the packed
 * ToolRuntime and Host registrations, and the Agent loop persists each pair.
 */
export async function runPackedProfileConversation({
  ctx,
  lead,
  LlmAdapter,
  createUserMessage,
  profileId,
  assignment,
  callPrefix,
}) {
  const invocations = [
    { id: `${callPrefix}-list`, name: 'ultra_profile_list', arguments: {} },
    { id: `${callPrefix}-detail`, name: 'ultra_profile_detail', arguments: { profile_id: profileId } },
    { id: `${callPrefix}-launch`, name: 'ultra_profile_launch', arguments: { profile_id: profileId, assignment } },
  ]
  class PackedProfileAdapter extends LlmAdapter {
    requests = []
    index = 0

    providerInfo(provider) { return { id: provider, name: 'Packed Profile conversation probe' } }
    async listModels(provider) { return [{ provider, id: 'lead', name: 'Packed Profile Lead' }] }
    async resolveModel(provider, model) { return { provider, id: model, name: 'Packed Profile Lead' } }

    async *stream(options) {
      this.requests.push(options)
      const invocation = invocations[this.index++]
      if (invocation !== undefined) {
        const encoded = JSON.stringify(invocation.arguments)
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'tool-call-delta', index: 0, id: invocation.id, name: invocation.name, argumentsDelta: encoded }
        yield { type: 'block-end', index: 0, block: {
          type: 'tool-call', id: invocation.id, name: invocation.name, arguments: encoded,
        } }
        yield { type: 'usage', usage: { inputTokens: 8, outputTokens: 4 } }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
        return
      }
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'The requested Team Profile operation is complete.' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'The requested Team Profile operation is complete.' } }
      yield { type: 'usage', usage: { inputTokens: 8, outputTokens: 6 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }

  const adapter = new PackedProfileAdapter()
  const provider = `${callPrefix}-${profileId}`
  const release = ctx.llm.registerAdapter([provider], adapter)
  const previousProvider = lead.agent.options.provider
  const previousModel = lead.agent.options.model
  try {
    Object.assign(lead.agent.options, { provider, model: 'lead' })
    lead.agent.followup(createUserMessage({
      content: [{ type: 'text', text: `Use Team collaboration: inspect and launch Profile ${profileId}.` }],
      source: { kind: 'user' },
    }))
    await lead.agent.whenIdle()
  } finally {
    release()
    restoreOption(lead.agent.options, 'provider', previousProvider)
    restoreOption(lead.agent.options, 'model', previousModel)
  }

  assert.equal(adapter.requests.length, invocations.length + 1)
  for (const request of adapter.requests) {
    const visible = request.tools?.map(tool => tool.name)
      .filter(name => name.startsWith('ultra_profile_')).sort()
    assert.deepEqual(visible, PROFILE_TOOL_NAMES)
  }
  const events = lead.agent.session.snapshotEvents()
  const callIds = new Set(invocations.map(invocation => invocation.id))
  assert.deepEqual(events
    .filter(event => event.type === 'tool/call' && callIds.has(event.data.callId))
    .map(event => event.data.name), invocations.map(invocation => invocation.name))
  const results = events
    .filter(event => event.type === 'tool/result' && callIds.has(event.data.message.source.callId))
  assert.deepEqual(results.map(event => event.data.message.source.callId), invocations.map(invocation => invocation.id))
  assert.ok(results.every(event => event.data.message.content[0].isError === false))
  const values = results.map(event => JSON.parse(event.data.message.content[0].content[0].text))
  assert.deepEqual(values[0].profiles.map(profile => profile.profileId), [profileId])
  assert.equal(values[1].ok, true, JSON.stringify(values[1]))
  assert.equal(values[1].value.head.profileId, profileId)
  return values[2]
}
