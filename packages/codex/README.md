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

Cleanup closes admission and revokes the old generation before waiting for its
process to exit. If the Team cleanup abort grace expires first, a warning says
that cleanup is still waiting; a separate completion message follows actual
quiescence. The grace period is not a hard unload deadline.

New native threads install `team_members_list`, `team_tasks_list`,
`team_tasks_get`, `team_message_send`, `team_task_update`, and `team_wait` through
the qualified app-server dynamic-tool protocol.
Operations use the Team owner's revocable member grant and canonical roster, task
board and mailbox. They cannot select a Team, member, role, handle, Host method or MCP server.
The native envelope is limited to 16384 UTF-8 bytes, Host arguments to 4096,
and the complete escaped tool result to 65536. Each native turn admits at most
64 distinct Team call identities. Retries of an admitted identity still reach the
Host for original-receipt recovery or input-conflict rejection after that limit;
the adapter does not cache authoritative results. A call arriving before durable
acceptance waits at most five seconds.
Interrupt and turn completion cancel current queries; owner disposal and
registration removal revoke the grant. Approval and sandbox restrictions remain in force.

The qualified Codex version restores dynamic tools saved in native history but
cannot install them through `thread/resume`. Threads created with these tools
retain them across recovery; older threads retain their handles and history
without acquiring new tools. The catalog's `memberOperations` describes new
native sessions, not a retroactive upgrade of existing threads. See the
[authorization decision](../../docs/adr/0017-authorize-native-team-member-queries.md).

The create/resume result confirms per-handle `memberOperations` only when this
provider generation created the thread with the complete tool set. Codex 0.149.1
does not expose installed tools in its Thread or resume response, so a cold
resume reports unknown even for a current thread. Studio displays that
uncertainty instead of promoting it from the catalog. No tool installation,
native thread replacement, or new durable Team state occurs during recovery.

Member messages atomically commit their original receipt before acknowledgement
and delivery. Retries within a live turn preserve trusted thread/turn/call identities; changed
normalized input conflicts. Queued means durable acceptance only. Final answers
and explicit failed/interrupted notices use the same mailbox under a separate
settlement identity. Cold resume recovers native terminal output and replays its
settlement receipt and restores source-timed terminal Run evidence after the new grant
is bound. A missing, invalid, or unrepresentable native completion timestamp is
never replaced with the observation or recovery time. The terminal outcome still
settles through the Team mailbox, but the timestamp-required evidence seam omits
the undated terminal and reports incomplete; the Run may retain `unknown-terminal`
until a dated canonical terminal is available.

Resume does not reconstruct the complete normalized historical tool/usage
timeline. Its evidence page therefore remains incomplete for that provider
generation, even at the last cursor or after later live work. This conservative
page-level status also applies to newer Runs sharing that history; it does not
change native identity, task ownership, or durable result receipts.
Codex marks orphan running turns interrupted after process
restart; their dead tool RPC callbacks cannot be restored. Host receipt recovery
and native interrupted-turn recovery are verified separately. Mailbox delivery
to an inactive member first verifies its identity and binds a fresh grant. Reasoning, interim commentary and complete native transcripts
are excluded; Run evidence remains scrubbed. See the
[durable message decision](../../docs/adr/0018-persist-native-team-message-receipts.md).

Task changes use the shared task board's expectedRevision, ownership, DAG and
tombstone rules. Stale writes return the current revision. Task state and the
original compact receipt commit together; retrying the same normalized call
returns its original revision even after later task changes. Changed input
conflicts. Full task details remain available through task reads.
`team_wait` observes later Team activity for 10 seconds to 1 hour and ends on
caller cancellation or grant revocation. Waiting, claiming and unblocking work
do not start members or create file locks; interruption preserves ownership.
See the [task operation decision](../../docs/adr/0019-persist-native-task-operation-receipts.md).

Use the complete local archive set and the stopped-Web upgrade procedure in
the [workspace README](../../README.md#安装到本地-dsh-web).
The [ownership decision](../../docs/adr/0007-activate-package-local-codex-runtime.md)
records the migration boundary and validation limits.
