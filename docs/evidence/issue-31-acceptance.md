# Issue #31 acceptance

An exact live Team Lead can now inspect existing Ultra Profiles and launch an
Active Revision through three fixed model-facing tools. The tools call the same
Digital Employee Host operations as Studio, so they add no Profile editor,
launch state machine, Team roster, or persistence path. Ordinary
`spawn_teammate` members remain unbound.

Requirement: [Issue #31](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/31);
parent [Spec #18](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18).
The boundary and identity decision is
[ADR 0022](../adr/0022-launch-active-profiles-from-lead-conversations.md).
Ultra starts from main
`1a74d7fe28b11b8c014e648c9bb43bf246112539`; the qualified Harness remains
`b85ebb3fca3da0c735cfed0b4532f926a4221e24`. Session 0, Team payload 4,
Team checkpoint 5, native operation 4, and Ultra v1 remain unchanged.

| Acceptance criterion | Repeatable evidence and conclusion |
| --- | --- |
| Provide clearly named, collision-free Profile list/detail/launch tools; authorize reads and writes with the exact live Lead while keeping ordinary teammate creation ordinary | [conversation-profile-tools.ts](../../packages/domain/src/conversation-profile-tools.ts) reserves exactly `ultra_profile_list`, `ultra_profile_detail`, and `ultra_profile_launch`, checks the visible Lead scope for collisions, and verifies the executing Agent object. The [integration suite](../../packages/domain/tests/conversation-profile-tools.integration.spec.ts) sees one copy of all three schemas on existing and later-created Leads, rejects a conflicting definition while rolling back partial registrations, and shows no schemas in an ordinary spawned teammate's actual model request. List/detail delegate to the exact-Lead Studio/Revision operations; launch additionally repeats the Host authority check. Existing exact teammate, stale Lead, and foreign-root public-boundary regressions remain green. |
| Never create, save, or activate a Profile implicitly; preserve Active Revision, Promotion Gate, capabilities, actual route, permanent names, and member limits | The list and detail inputs contain no mutation fields and return the latest Candidate separately from the Active Revision, its required capabilities and current availability, the latest Promotion Gate, and Profile-bound instances. Launch accepts only an existing Profile ID and optional assignment. An inactive candidate returns `profile-not-active` without a Binding; an Active Revision returns its selected and descriptor-resolved routes. A second tool call is a distinct intent and reaches the existing permanent-name rule as `profile-in-use`. Because the tool delegates directly to `spawnProfile`, existing gate, archive, capability, exact-route, Team permanent-name, and `maxMembers` checks remain the only admission path. |
| Give one persisted tool invocation a stable canonical Launch Request ID across callback/transport retry, and give a new intent a new ID | Launch hashes a fixed namespace plus exact Team, Lead Agent, and `ToolExecution.callId` identities into a canonical UUIDv8 accepted by the existing Launch Request schema. Replaying the same call id with canonically equal assignment text returns the identical ID, member, Binding, and result; changed input under that ID returns `launch-request-conflict`. A different call id produces a different intent and cannot reuse the occupied permanent name. The real Agent loop test persists `persisted-ultra-profile-launch` as a Lead Session `tool/call`, observes the UUID in `tool/result`, and replays that exact call identity to the same instance. |
| Pin the Profile and pending Binding before Team provisioning; converge after lost response, pending recovery, changed input, and cancellation on both sides of acceptance | Conversation launch invokes the existing Launch Workflow with the derived ID and original caller signal. Tests abort on the actual pending-Binding domain write and on the authoritative active Team-member event. The pre-acceptance case disposes and reloads Ultra before replay; the post-acceptance case lets Team own settlement. Both replays yield one active permanent member, one Binding, and one Studio instance. Separate JSON and SQLite cold-restart cases lose the successful response, resume the same Lead Session and tool id, and recover the identical structured result without another member. The changed-input case retains the existing conflict result. |
| Return stable member/Binding identity, Provisioning Phase, selected/resolved routes, and release tools/listeners/registrations with the Fiber | The launch value uses the same browser-safe instance DTO as Studio, including Team/member, Launch Request, Profile Revision, selected and resolved Runtime Targets, optional native handle, required capabilities, Provisioning Phase, Runtime Availability, and Runtime Presence. Service disposal first closes admission and removes all current Lead registrations and teammate deny layers, then waits for every admitted callback before closing storage. The integration suite observes `UNKNOWN_TOOL` after disposal, restores the three schemas on replacement, replays the same launch identity, and verifies collision rollback and independent Lead disposal. |
| Verify the real model-visible tools, generated Remote, and packed Profile rather than a private helper | A real `AgentLoop` request receives all three schemas, emits `ultra_profile_launch`, persists its call/result in the Lead Session, and provisions through the public Host service. The same Launch Request replay through generated Typert Remote `spawn` returns the exact result and the generated `view` shows the same instance. `pnpm verify` rebuilds Typert and all packages, installs the complete eight-archive closure, and drives a controlled Lead model through the packed AgentLoop to call list, detail, and launch for both Codex and Claude on JSON and SQLite. The installed launch tool creates the native member; generated Remote replays its derived Launch Request ID, and the resumed probe replays the same persisted tool call and member. It also boots real DSH Web and removes every package and Loader row. |

The fixed names are classified as Team-owned so Profile tool allow/deny policy
cannot grant them to an employee. Since scoped Lead definitions are inherited
by child scopes in DSH, every live roster teammate receives an explicit deny
registration. A DSH Evaluation Worker is a parentless non-roster Agent and can
otherwise look like a Team root; the evaluation setup marks it ineligible
before synchronous Agent publication. External evaluation workers have no DSH
Agent tool scope. The existing evaluation cases continue to see only their
effective read-only allowlist and approval-never policy.

List and detail wait for the current Runtime Backend generation to settle, then
read bounded Studio data. An active historical Revision is loaded through the
same immutable Revision operation instead of substituting the latest Candidate.
The displayed identity therefore describes what launch will execute. Business
failures remain structured Host failures; malformed Profile IDs are rejected
before a storage read.

The TDD RED run initially found all five requested behaviors missing. The first
GREEN implementation exposed two scope facts through broader tests: ordinary
teammates inherited Lead-scoped definitions, and parentless Evaluation Workers
looked like independent Leads. Explicit teammate restrictions and prepublication
evaluation exclusion fixed those defects. The focused suite passes nine tests,
including its parameterized cancellation and JSON/SQLite cases. Initial
Standards review found no issue; Spec review found one P2 because the packed
probe launched through Remote after executing only the list tool. A new gate
then failed with zero persisted conversation Profile calls. The repaired probe
uses a controlled model only for responses while the installed AgentLoop,
ToolRuntime, Host, native adapter, Session, and storage remain the actual
archive code. The failing guard and final packed gate are recorded in
`/root/workspace/.ultra-checks/31-packed-conversation-red.log` and
`/root/workspace/.ultra-checks/31-packed-conversation-final-candidate.log`.

The post-review `pnpm verify` passes 562 strict context checks with zero warnings,
builds Host and Client targets plus generated Typert, and passes 336 tests in 29
files. The pack gate reports 32 files in the Domain archive, verifies the fixed
tool-name export and live Lead schemas from the installed Host, persists all
three model calls and results, launches the Codex and Claude native member from
the installed tool, replays through generated Remote, resumes the same call on
both storage backends, starts the real packed Web Profile, and uninstalls the
complete archive closure. The repeatable log is
`/root/workspace/.ultra-checks/31-final-pnpm-verify.log`.

Historical Codex archives from
`debde06ce5c75658f9ad741cbfc8d535df118455` and Claude archives from
`081357d17f7a0535b75bb7d3133177febddee4a2` upgrade on JSON and SQLite while
preserving the original Profile Revision, member, native handle, and single
native session. Each upgraded installed Profile exposes all three tools to its
controlled Lead model: list and detail return the original Profile, while a new
launch intent reaches the preserved permanent-name rule and the predecessor's
Launch Request still replays the original member. Later native work, Web boot,
and uninstall also pass. Those runs are recorded in
`/root/workspace/.ultra-checks/31-final-{codex,claude}-upgrade.log`.

The maintained fork `b85ebb3fca3da0c735cfed0b4532f926a4221e24`
and fixed official comparison
`d347e703908d0406b7a7ef80e3a0e594d86b2215` still pass the same 11 public Team
behavior groups, including exact authority, permanent names, acceptance,
cancellation, disposal, and cold recovery. Compatibility admission accepts the
maintained fork and rejects unsupported official source/Team packages before
business data exists. The comparison log is
`/root/workspace/.ultra-checks/31-compatibility-compare.log`.

Independent Standards and Spec reviewers then re-read the complete fixed diff
from `1a74d7fe28b11b8c014e648c9bb43bf246112539` through
`fc5582223fd9de434552e68664a9b24ea5de7b51`. Both reported zero unresolved
findings; the Spec reviewer explicitly closed the original P2 and independently
reran the packed gate across Codex, Claude, JSON, and SQLite. The reports are
`/root/workspace/.ultra-checks/31-standards-final-review.md` and
`/root/workspace/.ultra-checks/31-spec-final-review.md`. This evidence-only
status update receives a separate exact-head review before merge.
