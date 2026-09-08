# Ultra Claude Code runtime

`@benz-ai-x/dsh-agent-team-claude-code` owns Ultra's durable Claude Code adapter.
The implementation, process bridge and qualification originated in
maintained Harness commit `8b4bae0b620cc89a987a3ec6dd8b0b7d9025649a`,
`packages/experimental/agent-team-claude-code`, under the retained [MIT license](LICENSE).

The provider-neutral Agent Team contract remains in the locked Harness.
This namespace plugin exports `name`, `inject`, `Config`, and `apply`; the
profile sets `catalogOwnerService: digitalEmployees` so one complete provider
registration owns execution and Studio metadata together.

Only package-local Claude Agent SDK `0.3.241` and Claude Code `2.1.241` qualify.
The `claude-code` route, deterministic native Session, read-only built-in tools
and sandbox, denied interactive permission, disabled network, and Fiber-owned
query/process cleanup retain their original constraints.
Read/Glob/Grep stay in the built-in tool list but have no bare `allowedTools`
entries: native workspace permission checks and the denying callback must remain
effective for paths outside `cwd`, including symlink targets.

Issues #29 and #30 add one controlled in-process SDK MCP server with member
listing, task listing/detail, intentional Team messages, task mutation and
waiting. Every call uses the current Team-owned grant and the native
`claudecode/toolUseId` metadata. Model arguments cannot choose caller identity
or invoke arbitrary Host operations. Limits apply to requests, escaped results,
distinct calls per turn and the startup grant wait. Messages and task changes
return the original durable receipt on a matching retry. Task writes retain the
shared CAS, ownership, DAG, tombstone and Lead-only rules; wait only observes
later activity and neither starts work nor releases ownership. Final results
settle through the member mailbox, and new delivery prompts retain the existing
turn id beside the original operation marker for transcript-based recovery.

Create and resume results confirm the six per-handle `memberOperations` because
every query installs this generation's controlled Team MCP server, including
resumed queries. Studio combines this live proof with the provider catalog;
provider removal discards it without changing the persisted member identity.

Cold attach reads Host-only `turns.recover` pages through the newly verified
member grant. The Host supplies the original launch correlation, inbound
delivery ids and committed settlements for the exact member/provider/handle;
the adapter recomputes every canonical turn id and accepts only matching
top-level transcript boundaries. Host settlements win over native history.
Otherwise, the first qualified native terminal is settled once; a missing
terminal becomes interrupted. Tool-result continuations can join multiple
assistant stages into one usage snapshot. Duplicate or late terminals cannot
replace that boundary, malformed identities fail closed, and a terminal that
lost authority is retried after same-provider rebinding.

Controlled SDK/MCP, generated Remote, JSON/SQLite restart scenarios, packed
qualification and the locked SDK/native process against a local deterministic
model endpoint cover these boundaries. Host recovery adapts its page size when
a complete escaped page exceeds the result limit. Invalid timestamps or unsafe
usage counters never enter evidence.
Authenticated native acceptance remains #44. See the accepted
[Team-tool decision](../../docs/adr/0020-authorize-claude-team-tools.md) and
[Claude task decision](../../docs/adr/0021-complete-claude-task-operations.md).

The actual native integration test requires a host supported by the locked
payload. On Linux, install `bubblewrap` and `socat`; the test retains the required
sandbox and uses dummy model credentials. Missing sandbox dependencies cause a
failure rather than an unsandboxed run.

Use the complete archive set and stopped-Web upgrade procedure in the
[workspace README](../../README.md#安装到本地-dsh-web).
The [ownership decision](../../docs/adr/0008-activate-package-local-claude-code-runtime.md)
records provenance, permission boundaries and validation limits.
