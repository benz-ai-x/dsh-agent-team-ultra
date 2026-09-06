# Issue #30 acceptance

Claude Code now exposes the complete six-operation native member collaboration
surface through its pinned SDK MCP channel. Task writes and waits delegate to
the same provider-neutral Host operations and Team state used by Codex and DSH
members. Claude and Codex enter through native grants while DSH retains exact
live-Agent authority; the adapter adds no task store, authority identity,
receipt cache, or persistence format.

Requirement: [Issue #30](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/30);
parent [Spec #18](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18).
The task-channel decision is
[ADR 0021](../adr/0021-complete-claude-task-operations.md).
Ultra starts from main
`c3a95739c2a4e474d1f95f76c526c7a2ae86762f`; the qualified Harness remains
`b85ebb3fca3da0c735cfed0b4532f926a4221e24`. Session 0, Team payload 4,
Team checkpoint 5, native operation 4, and Ultra v1 remain unchanged.

| Acceptance criterion | Repeatable evidence and conclusion |
| --- | --- |
| Complete dependency reads, claim, update, completion and wait through the actual SDK tool channel while reusing existing Team operations and durable receipts | [team-tools.ts](../../packages/claude-code/src/team-tools.ts) exposes exactly `team_task_update` and `team_wait` beside the four existing MCP tools. It maps them to the Host-owned `tasks.update` and `wait` operations under the query's current grant, canonical turn and SDK `claudecode/toolUseId`. The locked [native SDK integration](../../packages/claude-code/tests/native-sdk.integration.spec.ts) uses the real SDK 0.3.241, Claude Code payload 2.1.241 and managed native process to read a task with a completed dependency, claim, edit and complete it, then perform a real timed wait. The resulting three task facts and completed authoritative task view are read from the existing Team. The installed-archive probe repeats claim, lost-reply recovery, completion and a change-driven wait on JSON and SQLite. |
| Verify CAS conflict, DAG, tombstones, ownership retention, forbidden assignment/interrupt and wait without member wake-up | [member task integration](../../packages/claude-code/tests/member-tasks.integration.spec.ts) executes the same task sequence as an ordinary DSH teammate and as Claude, then compares every result. It covers unowned edit rejection, Lead-only reassignment, blocked claim, stale revision with current revision, dependency cycle, deletion with dependents, normalized edit, completion, dependency readiness, tombstone rejection and reopen. The advertised six-tool list contains neither assignment nor interrupt. Separate wait cases prove timeout bounds, dependency wake-up, no extra Claude turn/native Session/file, advisory overlapping write scopes, interrupted ownership retention, and cancellation without a wait receipt. |
| Prevent duplicate changes or wrong identity after a post-commit lost reply, recovery retry, or old-generation callback | The 64th-call regression drops the reply after a claim is committed, recovers the exact receipt with the same call id before CAS/rate rejection, rejects changed input, and retains one task fact and Revision 2. The Lead-generation case revokes an outstanding old wait, rebinds the same provider/member/handle under the resumed Lead, replays the exact lost receipt, and keeps one owner and one task fact. JSON and SQLite cases repeat lost-reply recovery through two cold restarts while preserving member id, native handle, task owner, revision and one durable receipt. |
| Show the real result in the existing task view and declare complete native collaboration separately from optional fork, Hooks, approval, evaluation and write capabilities | [the existing TeamAction integration](../../packages/claude-code/tests/member-task-ui.client.spec.tsx) reads the generated authoritative view and displays `Pending` → `In progress` with the Claude owner → `Completed` after MCP operations. [catalog integration](../../packages/claude-code/tests/catalog.integration.spec.ts) declares the same six member operations as Codex while independently retaining `fresh`, Profile `persona`/`mission`/`context`/`memory`, and Runtime `sandbox`/`evidence`/`usage`. It does not claim fork, Profile tool policy/Hooks, exact-call approval, evaluation, or workspace-write support. The full suite retains the existing capability-mismatch and isolated-evaluation rules. |

The task MCP schema accepts the seven ordinary-member task actions and never
accepts caller, Team, role, provider, native handle, assignment owner, interrupt,
or arbitrary Host operation parameters. Host validation remains authoritative
even for a protocol caller that bypasses the advertised schema. All six tools
share the existing 16 KiB request, 64 KiB escaped-result, 64 distinct call-id,
five-second grant wait, cancellation, and generation limits. An identical
turn/call/normalized input selects the durable receipt before CAS; different
input returns `TEAM_NATIVE_OPERATION_CONFLICT`.

`team_wait` observes activity that happens after the call. It accepts 10 seconds
through one hour, stores no receipt, and ends on timeout, query cancellation, or
grant revocation. Task mutation, dependency readiness, and wait do not start a
native turn or acquire a file lock. Interrupting the Claude member closes its
query and leaves an in-progress task assigned to that member.

The TDD RED run expected the six MCP tools and received the previous four. After
adding the two strict mappings, the new task suite passes eight tests, the
existing task-view suite passes one test, and the locked native SDK suite passes
its real MCP scenario. The complete Claude package passes 55 tests in six files,
including all earlier query, message, settlement, recovery, sandbox and byte
boundary regressions.

The final `pnpm verify` passes 562 strict context checks with zero warnings,
builds Host and Client targets, and passes 327 tests in 28 files. Its pack gate
creates and installs all eight archives, boots the real Web profile, executes
Codex and Claude new/resumed work on JSON and SQLite, verifies Claude message,
task and terminal receipts plus wait behavior, then removes every package and
Loader row.

Historical archives from
`081357d17f7a0535b75bb7d3133177febddee4a2` upgrade on JSON and SQLite while
preserving each original member, Profile Revision 1, native Session and handle.
The upgraded provider changes from zero to six member operations, performs later
work, boots Web and uninstalls cleanly. The maintained fork and fixed official
`d347e703908d0406b7a7ef80e3a0e594d86b2215` both pass the same 11 public
behavior groups; admission still accepts only the maintained fork and creates no
business data when rejecting the unsupported official source or Team package.

The native integration keeps the real locked SDK, payload, subprocess, sandbox,
MCP transport, Team, Session and persistence. Only the external model endpoint
is a deterministic local HTTP/SSE fixture with a dummy key. This establishes the
repeatable SDK/native boundary required by Issue #30; authenticated product
acceptance remains [Issue #44](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/44).
