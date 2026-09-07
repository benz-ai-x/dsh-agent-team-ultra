# Issue #37 acceptance

The Digital Employee Studio now projects every teammate from the authoritative
Team roster and distinguishes an ordinary member from an exact Profile Binding.
It displays immutable Revision, selected and actual Runtime Target, lifecycle
state, and separately sourced Profile/runtime capabilities. A member link uses
the public Harness navigation service to open that member in the single existing
Team message panel.

Requirement: [Issue #37](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/37);
parent [Spec #18](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18).
Ultra starts from main `2c5a355deefcf3c9dfc3384787e9cfe3de4678e3`;
the independent product commit is
`68abfed30c4a10a345b96c3f28d9e6233f8c7e70`. The lock selects qualified
Harness commit `95483a7a9645679c45805a46a968a1cf7508126c` and docs digest
`b64dd01c882927bf39cd936ce7545019df5b8763538f847fc4c3db5640cdbdaa`.
The complete-gate consumer synchronization is the separate Ultra test commit
`d70156add03db918ac119da38b00bac8aa6c2ad4`.
That Harness branch contains two independent #37 commits after baseline
`d2d870fbe40bc0e968abdac854a3aae495162bec`:

- `9f73a7d71cc9136d32030975d4ff1d0bcc834ff3` declares and validates the
  complete-collaboration and workspace-write capabilities.
- `95483a7a9645679c45805a46a968a1cf7508126c` adds the Fiber-owned public
  navigation exchange into the existing Team panel.

Both repositories were pushed over HTTPS and their branch heads were read back
with `git ls-remote`; the Harness worktree was clean before Ultra locked it.

## Acceptance mapping

| Acceptance criterion | Repeatable evidence and conclusion |
| --- | --- |
| Authoritative ordinary/Profile-bound identity, immutable Revision, selected/actual Runtime Target | [studio-projection.ts](../../packages/domain/src/studio-projection.ts) starts from `agentTeams.listMembers`, includes teammates only, and joins a Binding only when both roster member id and name match. A Binding cannot invent a member; an orphan remains absent from `teamMembers`. The discriminated browser-safe DTO in [types.ts](../../packages/domain/src/types.ts) exposes Profile identity/Revision only on `profile-bound` rows and carries selected/actual routes for both kinds. `conversation-profile-tools.integration.spec.ts` creates one ordinary member plus one Profile launch through the real public Host workflow and asserts both rows, Revision 1 and exact routes. `profile-service.spec.ts` also covers an unavailable pending Binding, provider return, exact roster reuse, and a historical route allowlist. |
| Full collaboration, fresh/fork, tool policy, Hooks, approval, evaluation and file writes shown separately and validated against executable behavior | The Profile catalog remains the source for supported context modes and `persona`, `mission`, `context`, `memory`, `tool-policy`, and `hooks`; the runtime catalog separately contributes `full-collaboration`, `workspace-write`, `exact-call-approval`, `sandbox`, `evaluation`, `evidence`, and `usage`. Harness rejects unknown values and rejects a false `full-collaboration` claim unless the provider exposes all six native member operations plus its runtime binder. DSH advertises both new capabilities; Codex and Claude Code advertise complete collaboration but do not claim workspace writes. [Studio.tsx](../../packages/ui/src/client/Studio.tsx) renders context selection/support, Profile behavior, complete collaboration, workspace writes, approval, evaluation and other runtime guarantees on separate rows. Catalog, Host integration and Studio tests assert these exact distinctions. |
| Preserve provisioning, availability, presence, baseline/replacement/stale/business-conflict boundaries | The Host derives provisioning from authoritative roster status, availability from the currently selected/resolved registered backend, and presence independently as running/idle/inactive. Profile-bound availability continues to use the immutable Binding requirements. The existing `studio-feed.spec.ts`, `profile-service.spec.ts`, `generated-remote.spec.ts`, `message-center.client.spec.tsx` and `mount.client.spec.ts` regression suites still cover complete baseline frames, replaceable generations, stale replies/pages, disconnected/unavailable state, Team switching, business conflicts, and Fiber disposal. The eight-file combined run below passed without changing those state machines. |
| Public member navigation; no second Team panel; compatibility remains operational | [Studio.tsx](../../packages/ui/src/client/Studio.tsx) adds an accessible member link to the existing members area; [mount.ts](../../packages/ui/src/client/mount.ts) sends only `{ teamSessionId, viewId: 'messages', memberId }` to Harness's public `agentTeamPanelNavigation`. Harness retains one revisioned request until the exact Team-owned panel consumes it, opens only a registered public child in its existing dialog, and passes the member/revision through the existing Slot owner. `team-action.client.spec.tsx` proves the one-panel behavior; `browser-plugin.client.spec.ts` proves registration and removal with the owning Fiber. No build/compatibility diagnostic was added to the Studio view. |
| Snapshot/errors/Run Index exclude grants, paths and native raw content; message detail stays separately authorized and paged | Public teammate-runtime errors are mapped by stable code, old stored Binding diagnostics project only `Teammate provisioning failed.`, Evaluation diagnostics use fixed classifications, and DSH/external evidence failures return fixed unavailable text. Poison values containing credential-like data, a private config path and a native transcript marker are absent from the complete Studio Snapshot, Eval Run and Run result. The Run Index still projects only normalized/redacted metadata. [TeamMessageCenter.tsx](../../packages/ui/src/client/TeamMessageCenter.tsx) applies the addressed member to the first authorized `listMessages` page and still calls `getMessage(messageId, committedCursor)` only after row selection; a newer navigation revision clears old page/detail state before re-reading. |
| Profile CAS/gates, isolated Evaluation Worker and Exact-call Approval stay strict | The targeted regression command below passes concurrent Head CAS, JSON/SQLite release and exact evaluation/promotion gates, stock DSH and native one-call approval identity with independent sandbox denial, fresh parentless DSH evaluation, and an external Evaluation Worker that is non-roster, read-only, approval-never and disposed exactly. The new collaboration capability is catalog metadata and is not consulted by these authorization decisions. |

## TDD controls

The first Host Snapshot RED observed `teamMembers` missing. Subsequent genuine
REDs covered invalid/false runtime capability claims, missing native catalogs,
missing Studio member rendering, missing public Team navigation and Fiber
cleanup, missing member-addressed message paging, and three provider-diagnostic
leaks (launch/Snapshot, Evaluation and Run evidence). A final historical-Binding
RED reproduced legacy poisoned text crossing the Host-to-Client boundary. Each
RED was followed by the smallest owning GREEN before combined regressions. Test
fixture wording/state corrections and stale generated build timestamps were
recorded separately and were not claimed as product REDs.

## Verification

- Harness capability owner suite: 45/45 tests passed; the final public
  navigation owner/browser run passed 2 files / 34 tests. Host/Client build,
  Client typecheck, package bundle, generated catalogs and bilingual owner
  documents passed. Each final `pnpm run doc-sync` passed 32/32 checks.
- Harness repository-wide lint still reports four pre-existing violations in
  untouched Agent Team test files, each attributed to commits predating this
  branch. All changed owner paths pass their lint gate; no baseline test was
  weakened or skipped.
- Ultra combined safety/recovery regression:
  `pnpm vitest run packages/domain/tests/profile-service.spec.ts packages/domain/tests/pinned-route.integration.spec.ts packages/domain/tests/run-evidence.spec.ts packages/domain/tests/generated-remote.spec.ts packages/domain/tests/studio-feed.spec.ts packages/ui/tests/studio.client.spec.tsx packages/ui/tests/message-center.client.spec.tsx packages/ui/tests/mount.client.spec.ts`
  passed 8 files / 115 tests.
- Ultra strict AC6 regression:
  `pnpm vitest run packages/domain/tests/profile-service.spec.ts packages/domain/tests/profile-workflow.integration.spec.ts packages/domain/tests/pinned-route.integration.spec.ts -t "serializes CAS writes|preserves release, exact evaluation|proves exact native approval|evaluates a DSH candidate|evaluates and cancels fake external"`
  passed 3 files / 6 tests, with 63 non-matching tests skipped.
- Ultra `pnpm build` passed after the final projection and security changes.
- The first formal full gate exposed three stale public-consumer expectations:
  Codex and Claude Code fixtures omitted `usePanelNavigation`, and the standalone
  UI bundle test still expected the former three-item injection list. The exact
  three files then passed 29/29 tests after synchronization; no business
  assertion was removed or relaxed.
- Final Ultra `pnpm verify` exited naturally with code 0: strict source
  attestation passed 582 checks / 0 warnings; Host/Client and generated
  Typert/compatibility builds passed; Vitest passed 30 files / 350 tests; and
  all eight archives passed pack/install/resolve, production Team message and
  dropped-receipt recovery, required-fact negative controls, real Web boot,
  Codex and Claude Code JSON/SQLite create-and-resume, registration release,
  and complete uninstall.

Continuous watch/reconnect behavior remains owned by blocked #36. Authenticated
Codex and Claude Code product canaries remain owned by #44; neither boundary is
claimed as new #37 work.

## Issue update

After all six mappings and the full gate passed, one script read the live Issue
twice, required it to remain open and byte-identical, asserted each exact
unchecked criterion occurred once, changed only those six checkbox markers,
reversed the changes locally to prove every other byte unchanged, PATCHed, and
read the complete body back. The result is 6/6 checked with the Issue still
open (`updatedAt=2026-09-07T22:08:47Z` and
`otherBytesUnchanged=true`). The pull request should therefore use
`Closes #37`.
