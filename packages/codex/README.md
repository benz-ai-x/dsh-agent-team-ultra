# Ultra Codex runtime

`@benz-ai-x/dsh-agent-team-codex` owns Ultra's durable Codex product adapter.
The implementation and qualification originate from the maintained Harness
snapshot `8b4bae0b620cc89a987a3ec6dd8b0b7d9025649a`,
`packages/experimental/agent-team-codex`, under the retained [MIT license](LICENSE).

The provider-neutral Agent Team contract remains in the locked Harness.
This package exports a namespace plugin with `name`, `inject`, `Config`, and
`apply`; the shipped profile sets `catalogOwnerService: digitalEmployees` so
one complete provider registration owns both execution and Studio metadata.

The adapter qualifies only package-local `@openai/codex` `0.149.1` and its exact
platform payload. It preserves read-only sandboxing, approval `never`, disabled
network, the `codex` route, native project correlations, thread handles, and
Fiber-owned process cleanup. Package renaming changes no durable format.

New native threads install `team_members_list`, `team_tasks_list`, and
`team_tasks_get` through the qualified app-server dynamic-tool protocol.
Queries use the Team owner's revocable member grant and canonical roster/task
board. They cannot select a Team, member, role, handle, Host method or MCP server.
The native envelope is limited to 16384 UTF-8 bytes, Host arguments to 4096,
and the complete escaped tool result to 65536. Each native turn admits at most
64 queries; a query arriving before durable acceptance waits at most five seconds.
Interrupt and turn completion cancel current queries; owner disposal and
registration removal revoke the grant. Approval and sandbox restrictions remain in force.

The qualified Codex version restores dynamic tools saved in native history but
cannot install them through `thread/resume`. Threads created with these tools
retain them across recovery; older threads retain their handles and history
without acquiring new tools. The catalog's `memberOperations` describes new
native sessions, not a retroactive upgrade of existing threads. See the
[authorization decision](../../docs/adr/0017-authorize-native-team-member-queries.md).

Use the complete local archive set and the stopped-Web upgrade procedure in
the [workspace README](../../README.md#安装到本地-dsh-web).
The [ownership decision](../../docs/adr/0007-activate-package-local-codex-runtime.md)
records the migration boundary and validation limits.
