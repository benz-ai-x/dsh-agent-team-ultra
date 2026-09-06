/** One query's controlled MCP transport to the Team owner's member grant. */
import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult, type Tool } from '@modelcontextprotocol/sdk/types.js'
import {
  TeammateRuntimeToolCallId,
  type TeammateRuntimeTurnId,
  type NativeMemberGrant,
  type NativeMemberOperationResult,
} from '@deepseek-ai/dsh-experimental-agent-team'

const definitions: Tool[] = [
  { name: 'team_members_list', description: 'List the members of your current Team.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'team_tasks_list', description: 'Read a page of your Team shared tasks. Request a smaller page if the result is too large.',
    inputSchema: { type: 'object', properties: {
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      cursor: { type: 'string', minLength: 1, maxLength: 128 },
    }, additionalProperties: false } },
  { name: 'team_tasks_get', description: 'Read the current details of one task in your Team.',
    inputSchema: { type: 'object', properties: { taskId: { type: 'string', minLength: 1, maxLength: 128 } },
      required: ['taskId'], additionalProperties: false } },
  { name: 'team_message_send', description: 'Send intentional text to a Team member by name, or to lead. A queued receipt means durable acceptance, not delivery or completed work.',
    inputSchema: { type: 'object', properties: {
      target: { type: 'string', minLength: 1 }, text: { type: 'string', minLength: 1 },
    }, required: ['target', 'text'], additionalProperties: false } },
]

const operations: Readonly<Record<string, string>> = {
  team_members_list: 'members.list', team_tasks_list: 'tasks.list', team_tasks_get: 'tasks.get', team_message_send: 'messages.send',
}

export const teamToolNames = definitions.map(tool => `mcp__dsh_team__${tool.name}`)

function response(result: NativeMemberOperationResult): CallToolResult {
  const value = { isError: !result.ok, content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') <= 65_536) return value
  return refusal('CLAUDE_TEAM_RESULT_LIMIT', 'The native Team tool result exceeds 65536 UTF-8 bytes; request a smaller task page.')
}

function refusal(code: string, message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: JSON.stringify({ ok: false, error: { code, message } }) }] }
}

export function createTeamToolTurn(
  turnId: TeammateRuntimeTurnId,
  signal: AbortSignal,
  currentGrant: () => NativeMemberGrant | undefined,
  bound: Promise<NativeMemberGrant>,
) {
  const lifetime = new AbortController()
  const activeSignal = AbortSignal.any([signal, lifetime.signal])
  const callIds = new Set<string>()
  const pending = new Set<Promise<CallToolResult>>()
  const server = createSdkMcpServer({ name: 'dsh_team', version: '1.0.0', tools: [] })
  // Keep raw arguments intact: Host schemas, rather than coercion or unknown-key
  // stripping in the convenience tool helper, own request validation.
  server.instance.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: structuredClone(definitions) }))
  server.instance.server.setRequestHandler(CallToolRequestSchema, (request, extra) => {
    const run = async (): Promise<CallToolResult> => {
      if (Buffer.byteLength(JSON.stringify(request), 'utf8') > 16_384) {
        return refusal('CLAUDE_TEAM_REQUEST_LIMIT', 'The native Team tool request exceeds 16384 UTF-8 bytes.')
      }
      const callId = extra._meta?.['claudecode/toolUseId']
      if (typeof callId !== 'string' || callId.length === 0 || Buffer.byteLength(callId, 'utf8') > 200) {
        return refusal('TEAM_NATIVE_CORRELATION_REQUIRED', 'The native call has no trusted operation identity.')
      }
      const operation = Object.hasOwn(operations, request.params.name) ? operations[request.params.name] : undefined
      if (operation === undefined) return refusal('CLAUDE_TEAM_UNAVAILABLE', 'This Team operation is unavailable.')
      const args = request.params.arguments ?? {}
      if (Object.hasOwn(args, 'operation')) return refusal('TEAM_NATIVE_INVALID_REQUEST', 'The Team operation arguments are invalid.')
      const requestSignal = AbortSignal.any([activeSignal, extra.signal])
      if (requestSignal.aborted) return refusal('TEAM_NATIVE_CANCELLED', 'The Team operation was cancelled.')
      if (!callIds.has(callId) && callIds.size >= 64) {
        return refusal('CLAUDE_TEAM_RATE_LIMIT', 'The native turn has reached its limit of 64 Team operations.')
      }
      callIds.add(callId)
      let grant = currentGrant()
      if (grant === undefined) {
        const deadline = new AbortController()
        const timer = setTimeout(() => { deadline.abort() }, 5_000)
        const waitingSignal = AbortSignal.any([requestSignal, deadline.signal])
        const cancelled = Promise.withResolvers<never>()
        const cancel = (): void => { cancelled.reject(new Error('Team grant wait ended')) }
        waitingSignal.addEventListener('abort', cancel, { once: true })
        try {
          if (waitingSignal.aborted) cancel()
          grant = await Promise.race([bound, cancelled.promise])
        } catch {
          return requestSignal.aborted
            ? refusal('TEAM_NATIVE_CANCELLED', 'The Team operation was cancelled.')
            : refusal('CLAUDE_TEAM_UNAVAILABLE', 'This Team operation is unavailable.')
        } finally {
          clearTimeout(timer)
          waitingSignal.removeEventListener('abort', cancel)
        }
      }
      const result = await grant.execute({ ...args, operation }, requestSignal, {
        kind: 'tool', turnId, callId: TeammateRuntimeToolCallId(callId),
      })
      if (grant.signal.aborted || currentGrant() !== grant) {
        return refusal('TEAM_NATIVE_GRANT_REVOKED', 'This Team authorization is no longer active.')
      }
      if (requestSignal.aborted) return refusal('TEAM_NATIVE_CANCELLED', 'The Team operation was cancelled.')
      return response(result)
    }
    const operation = run().catch(() => refusal('CLAUDE_TEAM_UNAVAILABLE', 'The Team operation could not be completed.'))
    pending.add(operation)
    void operation.finally(() => { pending.delete(operation) })
    return operation
  })
  return {
    server,
    async close(): Promise<void> {
      lifetime.abort()
      await Promise.allSettled([...pending])
      await server.instance.close()
    },
  }
}
