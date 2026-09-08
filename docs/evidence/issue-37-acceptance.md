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
the original product commit is
`68abfed30c4a10a345b96c3f28d9e6233f8c7e70`, the complete-gate consumer
synchronization is `d70156add03db918ac119da38b00bac8aa6c2ad4`, and review round 1
is repaired by independent Ultra commit
`a94ede79d193495d347282d50fcf9a4dc1445042`. The lock selects qualified
Harness commit `924a622f6dc69a2e4b5beebdf218196da927dc7c` and docs digest
`b64dd01c882927bf39cd936ce7545019df5b8763538f847fc4c3db5640cdbdaa`.
That Harness branch contains three independent #37 commits after baseline
`d2d870fbe40bc0e968abdac854a3aae495162bec`:

- `9f73a7d71cc9136d32030975d4ff1d0bcc834ff3` declares and validates the
  complete-collaboration and workspace-write capabilities.
- `95483a7a9645679c45805a46a968a1cf7508126c` adds the Fiber-owned public
  navigation exchange into the existing Team panel.
- `924a622f6dc69a2e4b5beebdf218196da927dc7c` repairs review round 1 by
  aligning capability projection/admission, containing unknown Gateway and
  roster errors, publishing complete Slot owner props, adding the keyless Web
  navigation snapshot, and isolating navigation subscribers.

The Harness review commit was pushed over HTTPS and read back with
`git ls-remote`; its worktree was clean before Ultra locked it. Final Ultra
branch readback is a delivery check, not an acceptance premise.

## Acceptance mapping

| Acceptance criterion | Repeatable evidence and conclusion |
| --- | --- |
| Authoritative ordinary/Profile-bound identity, immutable Revision, selected/actual Runtime Target | [studio-projection.ts](../../packages/domain/src/studio-projection.ts) starts from `agentTeams.listMembers` and joins a Binding only when roster id and name both match. An ordinary external reservation keeps its selected provider, but actual provider appears only after a native handle proves provider acceptance. Joined rows take immutable Revision and lifecycle authority from the Binding; unjoined pending/failed Bindings remain visible beside ordinary roster members without inventing a `teamMembers` row or a message link. Tests cover the pre-acceptance external reservation, a failed Binding conflicting with an idle roster row, and unrostered pending/failed Bindings while another ordinary member exists. |
| Full collaboration, fresh/fork, tool policy, Hooks, approval, evaluation and file writes shown separately and validated against executable behavior | The Profile catalog supplies context modes and `persona`, `mission`, `context`, `memory`, `tool-policy`, and `hooks`; the runtime catalog separately supplies collaboration, approval, sandbox, evaluation, evidence and usage. A resolvable DSH model no longer infers `workspace-write` from brand/model; without a reliable public executable proof it does not claim that capability. Explicit external catalogs remain validated at registration. Claude Code now accepts the same `full-collaboration` value it advertises on both create and cold resume. [Studio.tsx](../../packages/ui/src/client/Studio.tsx) continues to render each dimension separately. |
| Preserve provisioning, availability, presence, baseline/replacement/stale/business-conflict boundaries | Profile-bound rows take Provisioning Phase and Runtime Availability from the persistent Binding while Runtime Presence remains roster-derived. Thus a route/native identity conflict stays failed even if the roster row is idle, and pending/failed Bindings before reservation are still rendered. `studio-feed.spec.ts`, `profile-service.spec.ts`, `generated-remote.spec.ts`, `message-center.client.spec.tsx` and `mount.client.spec.ts` retain complete baseline, bounded replacement, stale reply/page, disconnected/unavailable, Team-switch, business-conflict and Fiber-disposal coverage. |
| Public member navigation; no second Team panel; compatibility remains operational | [Studio.tsx](../../packages/ui/src/client/Studio.tsx) adds an accessible member link to the existing members area; [mount.ts](../../packages/ui/src/client/mount.ts) sends only `{ teamSessionId, viewId: 'messages', memberId }` to Harness's public `agentTeamPanelNavigation`. The documented `AgentTeamPanelViewOwnerProps` is exported from the package `/client` entry and its three owner fields occur exactly once in the official generated Slot catalog. The Fiber-owned dispatcher contains a throwing subscriber and still delivers to later subscribers while retaining the same snapshot. A keyless recorded-session borrower assembles the real private Agent Team Host/Web profile, dynamic Client package, human approval and public navigation, then snapshots the single dialog, Messages selection, addressed member and revision. No build diagnostic was added to Studio. |
| Snapshot/errors/Run Index exclude grants, paths and native raw content; message detail stays separately authorized and paged | Ultra contains an ordinary pre-roster `Error` at the launch Host boundary and writes only `Teammate provisioning failed.`; post-reservation internal faults still rethrow for recovery. Harness likewise keeps unknown provider errors out of the durable/public roster and serializes unknown Gateway business throws as stable `gateway/internal` with `Remote invocation failed.` while preserving trusted diagnostics and abort behavior internally. Poison values containing a private path, credential-like data and a native transcript marker are absent from results and Studio snapshots. Run Index remains normalized/redacted, and message detail still requires its separately authorized paged read after row selection. |
| Profile CAS/gates, isolated Evaluation Worker and Exact-call Approval stay strict | The targeted regression command below passes concurrent Head CAS, JSON/SQLite release and exact evaluation/promotion gates, stock DSH and native one-call approval identity with independent sandbox denial, fresh parentless DSH evaluation, and an external Evaluation Worker that is non-roster, read-only, approval-never and disposed exactly. The new collaboration capability is catalog metadata and is not consulted by these authorization decisions. |

## TDD controls

The original delivery used RED/GREEN coverage for Host projection, runtime
claims, Studio rendering, navigation, message paging, and diagnostic
redaction. Review round 1 then reproduced each reported defect independently:

- H1 showed an ordinary external reservation falsely exposing an actual target.
- H2 showed Binding failure overwritten by idle roster state and unrostered
  pending/failed Bindings disappearing when an ordinary member existed.
- H3 showed every resolvable DSH model falsely claiming `workspace-write`.
- H4 passed Harness admission but failed Claude create on advertised
  `full-collaboration`.
- H5 sent a poison ordinary `Error` through Ultra launch, Harness roster, and
  Gateway public boundaries.
- H6 generated a public Slot catalog without the owner prop field names.
- H7 executed the assembled browser flow but failed because the required
  recorded-session golden and inventory entry were absent.
- M1 showed one throwing navigation listener starving the next listener.

Each true RED was followed by the smallest owning GREEN. Incorrect H7
composition/header setup, an overly broad Web command, stale generated bundles,
and Harness declaration mtimes were explicitly treated as setup/freshness
results, not product REDs. A combined regression caught an over-broad H5
conversion after roster acceptance; the final boundary preserves that internal
fault and all focused regressions then passed.

## Verification

- Harness focused owner suite passed 5 files / 176 tests. The keyless Web
  navigation replay passed 1 file / 5 tests, and the recorded-session corpus
  gate passed 1 file / 2 tests. Catalog freshness, translation pairing,
  typecheck, full build and `pnpm run doc-sync` (32 passed / 0 failed) passed.
- Harness repository-wide lint still reports four pre-existing violations in
  untouched Agent Team test files, each attributed to commits predating this
  branch. All changed owner paths pass their lint gate; no baseline test was
  weakened or skipped.
- Ultra combined safety/recovery regression passed 10 files / 164 tests after
  adding the Domain/Profile conversation and Claude create/resume suites to the
  original Studio, navigation, feed, message, Run and generated-Remote set.
- Ultra strict AC6 regression:
  `pnpm vitest run packages/domain/tests/profile-service.spec.ts packages/domain/tests/profile-workflow.integration.spec.ts packages/domain/tests/pinned-route.integration.spec.ts -t "serializes CAS writes|preserves release, exact evaluation|proves exact native approval|evaluates a DSH candidate|evaluates and cancels fake external"`
  passed 3 files / 6 tests, with 65 non-matching tests skipped.
- Final review-fix Ultra `pnpm verify` passed on its first formal run: strict source
  attestation passed 582 checks / 0 warnings; Host/Client and generated
  Typert/compatibility builds passed; Vitest passed 30 files / 354 tests; and
  all eight archives passed pack/install/resolve, production Team message and
  dropped-receipt recovery, required-fact negative controls, real Web boot,
  Codex and Claude Code JSON/SQLite create-and-resume, registration release,
  and complete uninstall.

Continuous watch/reconnect behavior remains owned by blocked #36. Authenticated
Codex and Claude Code product canaries remain owned by #44; neither boundary is
claimed as new #37 work.

## Issue update

After all six mappings and the full gate passed, one script read the live Issue
twice and required state, body and `updatedAt` to match. Each of the four
review-withdrawn unchecked criteria occurred exactly once, its checked form did
not exist, and both already checked criteria also occurred once. The script
changed only those four checkbox markers, reversed the replacements to prove
every other byte unchanged, PATCHed, and read the complete body back. The result
is 6/6 checked with the Issue still open
(`updatedAt=2026-09-08T00:52:57Z`, `otherBytesUnchanged=true`, and
`fullPostPatchReadback=true`). The pull request is therefore eligible to use
`Closes #37`.
