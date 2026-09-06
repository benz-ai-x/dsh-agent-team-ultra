# Issue #29 acceptance

Claude Code now uses the same provider-neutral Host authority as the existing
native member channel. The adapter exposes exactly four read/message tools
through the pinned SDK's in-process MCP transport, persists intentional messages
and terminal results through Host receipts, and reconciles public native history
against Host-owned work identities after restart.

Requirement: [Issue #29](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/29);
parent [Spec #18](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18).
The permission and recovery decision is
[ADR 0020](../adr/0020-authorize-claude-team-tools.md).
Harness is fixed at
`b85ebb3fca3da0c735cfed0b4532f926a4221e24`; Session 0, Team payload 4,
Team checkpoint 5, native operation 4, and Ultra v1 remain unchanged.

| Acceptance criterion | Repeatable evidence and conclusion |
| --- | --- |
| Use the pinned Claude SDK/payload's controlled tool channel with the existing provider-neutral authorization, queries, messages, and durable receipts | [team-tools.ts](../../packages/claude-code/src/team-tools.ts) builds one in-process `dsh_team` MCP server per live query and declares only `team_members_list`, `team_tasks_list`, `team_tasks_get`, and `team_message_send`. The handler sends the SDK-provided `claudecode/toolUseId` and unmodified arguments to the current Host grant. Missing identity, model-added authority, unknown fields, 16 KiB request overflow, 64 KiB escaped-result overflow, more than 64 call identities, cancellation, expired generations, and a grant wait beyond five seconds fail without a durable mutation. Same-identity retry is decided by the Host receipt. |
| Complete Claude→Lead, Claude↔DSH, and Claude↔Codex round trips while retaining Session, handle, and immutable Profile | [member operations integration](../../packages/claude-code/tests/member-operations.integration.spec.ts) sends attributed messages in all three directions through real Team and generated Remote boundaries. The reply returns to the same native Session and handle. A later Profile edit does not change the running member's Revision 1 binding. The installed archive probe performs new and resumed work on JSON and SQLite and observes one unchanged member, Profile revision, native handle, and native Session. |
| Apply the same deduplication/rejection rules to lost receipts, duplicate terminal notifications, restart recovery, and old-generation responses | The integration suite drops the 64th MCP reply after Host commit, then proves identical replay, changed-input conflict, one durable message, and no extra call identity. It covers duplicate and conflicting terminals, a terminal pending across grant revocation, recovery retry after a failed Host flush and same-provider grant rebind, committed Host settlement winning over a late old-generation reply, a valid terminal surviving a later SDK iterator failure, missing terminal becoming interrupted, API failure without diagnostic disclosure, JSON/SQLite restart, legacy history without the new turn marker, malformed or repeated boundaries, adaptive recovery pages, and isolated unowned history. [Claude continuity](../../scripts/probe-claude-continuity.mjs) repeats receipt and terminal recovery from installed archives. |
| Extend only explicitly authorized Team tools and formally revise the old Read/Glob/Grep decision without widening file, shell, network, approval, or evaluation permissions | [ADR 0020](../adr/0020-authorize-claude-team-tools.md) records the accepted revision. `allowedTools` contains only the four MCP names. Read, Glob, and Grep remain SDK built-ins under the original cwd and symlink confinement; the real native test proves in-workspace access and rejects outside paths and links. Shell, writes, external network, interactive approval, hooks, plugins, skills, external MCP, task mutation, and task wait are absent. Existing isolated-evaluation integration still exposes only its read-only fixture and creates no Team member identity. |
| Verify identity, acceptance, and results in real Team logs; prevent ordinary members and Evaluation Workers from gaining Lead authority | Team persistence records the original member sender, native call/turn correlation, accepted receipt, intentional text, terminal outcome, and one Run/usage occurrence. The integration suite rejects forged role/operation fields and a Lead-only spawn tool, and verifies no rejected attempt changes Team persistence. Evaluation tests keep `evaluation-worker` as a separate Run owner without member id/name, and external evaluation creates no Team member. The locked real SDK/native test reaches the same Host log through the public MCP bridge. |

The Host-only `turns.recover` operation reads existing launch, inbound delivery,
and committed settlement facts for the exact member/provider/handle under the
current grant. It flushes the Lead Session before reading, uses strict paging and
size bounds, rechecks cancellation and authority, and never appears in the
model's tool catalog. It returns no inbound work body or other member's facts.
The adapter halves oversized pages, rejects non-advancing or conflicting facts,
and completes recovery before evidence reads or new delivery. A failed recovery
retains the public history snapshot and retries it after a current grant for the
same provider is bound.

Committed Host settlement is authoritative. When it is absent, the adapter
accepts the first trustworthy `end_turn` whose model identifier is nonempty, or
the pinned payload's synthetic API-failure signature; no terminal becomes
interrupted. Later terminal records and iterator failures cannot replace the
first result. Assistant/tool-result continuations produce one usage occurrence.
Invalid timestamps never become negative evidence, and unsafe cumulative
counters are omitted while retaining the occurrence.

The Claude-focused run passes 46 tests in four files. The full
`pnpm verify` passes 562 strict context checks with zero warnings and 318 tests
in 26 files. It builds both targets, packs eight archives, boots a real packed
Web profile, runs Codex and Claude installed new/resumed flows on JSON and
SQLite, verifies durable messages and terminal receipts without duplicates, and
removes every package and Loader row on uninstall.

The locked SDK/native integration keeps the actual SDK 0.3.241, native payload
2.1.241, managed subprocess, sandbox, MCP server, Team, Session, and persistence.
Only the external model endpoint is replaced by a local deterministic HTTP/SSE
fixture with a dummy key. It validates the four tool calls and native metadata,
inside/outside workspace file behavior, durable final results, API-error
confinement, provider disposal/rebinding, and public-history recovery. This is
the required deterministic native boundary test; credentialed product
acceptance remains [#44](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/44).

Harness
[`native-member-operations.spec.ts`](https://github.com/benz-ai-x/deepseek-harness_x/blob/b85ebb3fca3da0c735cfed0b4532f926a4221e24/packages/experimental/agent-team/tests/native-member-operations.spec.ts)
and its Loader recording pass 229 owning tests. The four changed runtime files
reach 100% statements (271/271), branches (174/174), functions (48/48), and
lines (236/236). Host and Client builds, the real Loader, generated Cordis
catalog, public type equivalence, documentation sync, lint, normal commit hooks,
and push all pass.

Historical archives produced from
`081357d17f7a0535b75bb7d3133177febddee4a2` upgrade on JSON and SQLite while
preserving the original member, Profile Revision 1, native handle, and single
Session. The upgraded runtime adds the four operations, performs later work,
boots Web, and uninstalls cleanly. The maintained fork and official
`d347e703908d0406b7a7ef80e3a0e594d86b2215` both pass the same 11 public
behavior groups. Compatibility admission accepts the fixed maintained fork,
rejects unsupported source before install and unsupported Team format before
import, and creates no business data on rejection.

TDD records include the query, settlement, recovery, recovery-admission,
paging, marker, missing-terminal, legacy-delivery, API-error, file-confinement,
byte-boundary, unsafe-history, and conflicting-terminal RED/GREEN logs under
`/root/workspace/.ultra-checks/29-*`. The first Standards and Spec reviews each
found the same P2: a failed recovery's first delivery cleared the ordering tail,
so a later delivery could start native work. The formal regression now proves
every delivery waits for the current recovery result. Final review and merge
status remain properties of the PR.
