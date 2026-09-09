# TODO

## Current requested scope: complete acceptance and merge PR #63

- [x] Confirm the historical migration → real Host / generated Remote → shipping Studio seam with the user; acceptance includes Runs, usage, completeness and error bubbling.
- [x] Restore the exact C Harness Git identity in independent administrative storage after shared worktree metadata disappeared; tracked bytes match `3c38b1d4e8`, strict 648 / 0 warnings passes without changing source or lock.
- [x] Reproduce the shipping Studio gate's missing Claude historical completion time through public Host / generated Remote; preserve known outcomes without inventing endedAt or completeness, and pass all 37 Claude operations regressions.
- [ ] Complete the shipping Studio joint acceptance, then promote Phase C support qualification on the same source / SDK versions.
- [ ] Run final PR gates and independent Standards / Spec review, push, merge PR #63 and fast-forward local main to the remote merge result.

- [x] Integrate merged main / PR #62 as `21a22b0`, preserving its final native recovery and cleanup diagnostics fixes; build and 15 native recovery tests pass.
- [x] Reject an unqualified owning Loader source before public data registration or writes; the real Loader regression is RED → GREEN with zero business writes.
- [x] Reject missing required Session / storage entities in an already completed joint migration; all four JSON / SQLite public Loader cases are RED → GREEN and recover their retained data after restoration.
- [x] Share pure Run Binding identity and native correlation selection between migration and Host recovery; 34 migration / v2 usage and 15 Run evidence / lifecycle tests pass.
- [x] Complete intermediate candidate `ddc7769`: 648 strict checks, 445 tests, actual archive install / Web / recovery / uninstall, and all three historical archive upgrade gates pass.
- [x] Fix the independent re-review's manifest enum admission and README isolated-upgrade ordering P2 findings; both real Loader backend regressions are RED → GREEN, and build passes.
- [x] Complete final `3212225` verification: 648 strict checks, 447 tests, actual archive install / Web / recovery / uninstall and all three historical upgrades; independent Standards / Spec each report zero unresolved findings. The concurrent timeout attempt is retained in the [repair evidence](docs/evidence/pr63-review-fixes.md).
- [x] Under the previous repair-only authorization, push the reviewed runtime to PR #63, retarget it to merged main, and read back matching local / remote heads; synchronize main and preserve the original HANDOFF in stash. The current extended authorization is recorded above.

The user has now authorized completing these acceptance gates and merging PR #63
once they pass. The confirmed Studio seam extends the earlier public Host tests.
The C Harness and SDK selections stay fixed; #44 authenticated native acceptance,
parent Spec #18 and unrelated notifications / worktree cleanup remain out of scope.

## Previous PR #62 review repairs (merged)

The user has authorized fixing the two runtime P2 findings and stale handoff P3
in PR #62, then validating, independently re-reviewing, and updating that PR.
Keep its B Harness lock and SDKs; do not merge or change PR #63 / parent Spec #18.

- [x] Reproduce and fix missing native completion times through public Host / generated Remote on JSON and SQLite; never use the recovery clock as an endedAt.
- [x] Reproduce and fix partial-history completeness through provider replacement, later work and cold recovery; the bounded page remains explicitly incomplete.
- [x] Align the handoff and TODO with actual completed work and remaining review gates.
- [x] Complete intermediate `pnpm verify` at `d5054de`: 590 strict checks, 400 tests and eight-archive install/Web/recovery/uninstall pass. See [repair evidence](docs/evidence/pr62-review-fixes.md).
- [x] Fix the independent re-review's additional Standards P2: contain both adapters' new cleanup-log sink failures through public RED → GREEN, without masking native cleanup errors.
- [x] Complete fresh final `pnpm verify` at `e7a5f2d`: 590 strict checks, 404 tests and complete archive gates; independent Standards / Spec each report zero unresolved findings.

Publication uses the original branch. Read its actual head and merge state from
[PR #62](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/62); passing these
gates does not authorize merging or continuing another PR.

## Original requested scope: TDD development from Issue #38

The user has authorized reading the remaining Issues, starting development at
[#38](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/38), and reporting
each completed Issue through Feishu CLI. The live Issue validation plans retain
three PR batches: #38, #39–#43, and #44. Issue-local verification stays focused;
complete cross-feature and packed validation belongs to the final PR candidate.
This development request does not itself authorize merging PRs or closing
unverified Issues. Parent Spec #18 stays open.

- [x] Read live #38 and confirm #36 / #37 are closed; preserve main's local handoff and all stashes.
- [x] Create `feat/batch-3b-provider-recovery` from main `ec88d85`, prepare locked Harness `57670c6b32`, install frozen dependencies, and pass 590 strict checks / 0 warnings.
- [x] Build the unchanged baseline, including Host, Client, generated Typert, and compatibility proof.
- [x] Audit all six #38 AC against existing public tests and packed probes; distinguish real persistence from memory-only fixtures in the [coverage audit](docs/evidence/issue-38-coverage-audit.md). This is not acceptance.
- [x] User confirmed the public TDD seams: real Host/generated Remote, Team/Session and JSON/SQLite persistence, and Cordis Fiber lifecycle; only external SDK/process boundaries are controlled.
- [x] Reproduce and fix #38 Run read/view disposal, retired Lead reads, native cleanup diagnostics, recovered terminal evidence and invalid native completion times through public RED → GREEN slices; the combined real-persistence recovery scenario passes.
- [x] Complete the [six-AC evidence map](docs/evidence/issue-38-acceptance.md) and final Batch 3B gate at `7caa05e`: 590 strict checks, 394 tests and eight-archive install/Web/message/DAG/native recovery/uninstall all pass; PR review and merge remain separate.
- [x] User confirmed bot DM to the current Feishu user with Issue, implementation/test results, branch/PR and pending acceptance; report implementation completion separately from PR acceptance.

## Current Batch 4 integration: Issues #39–#43

- [x] Publish #38 as PR #62 and send the confirmed Feishu completion notification once; review and human merge remain separate.
- [x] Branch from #38 `4cecfe2` in an isolated Ultra worktree; prepare the unchanged locked B source and pass strict checks.
- [x] Observe the #39 public fixed-route cold-resume tracer fail on B's Session format 0 versus required format 2.
- [x] Finish integrating fixed official `d347e703` into the maintained Harness as `3c38b1d4e8`, preserving the complete B Team/native/UI contracts and recorded scenarios; formal candidate source selection follows.
- [x] Qualify clean candidate `3c38b1d4e8` without switching the B support line: formal preparation, 590 strict checks, full Ultra build, the fixed-route v2 cold-resume tracer and both 11-group public Team probes pass. See [#39 evidence](docs/evidence/issue-39-acceptance.md); PR-level acceptance remains #43.
- [x] Complete #40 native/UI focused validation on the same candidate: Ultra 145 tests, Harness Team UI 63 tests and real built native Loader 1 test pass; see [#40 evidence](docs/evidence/issue-40-acceptance.md). Final PR acceptance remains #43.
- [x] Implement #41 isolated joint migration, write admission and deterministic recovery: 70 focused tests / 5 files, 648 strict checks and full build pass. See [#41 evidence](docs/evidence/issue-41-acceptance.md); complete historical archives and every-write interruption matrix remain #43.
- [x] Publish #41 as `04b2c9f` on PR #63 and send its per-Issue bot notification once; Issue remains OPEN / 2 of 6 AC, with full historical acceptance deferred to #43.
- [x] Implement #42 truthful v2 usage: public Agent Loop / Session / generated Remote RED → GREEN for failed-attempt usage, missing stream terminal and partial aggregate totals; focused 112 tests / 7 files pass. See [#42 evidence](docs/evidence/issue-42-acceptance.md).
- [x] Publish #42 as `61fb4f6` on PR #63 and send its per-Issue notification once; Issue remains OPEN / 4 of 5 AC. Final historical v2-to-Studio and packed acceptance remains #43.
- [x] Run #43 complete candidate verification: 648 strict checks, 430 tests / 39 files, JSON 14 and SQLite 8 publication boundaries, actual closure install / Web / native data recovery / uninstall; old Codex, old Claude and B archive upgrades plus official / fork comparison pass. See [#43 evidence](docs/evidence/issue-43-acceptance.md).
- [ ] Finish #43's migrated Host / generated Remote → Studio display and error propagation scenario after the requested public-seam confirmation, then promote the qualified support lock and obtain formal review / human merge. No automatic merge.
- [ ] Perform #44 genuine authenticated native acceptance after its prerequisites; controlled external boundaries are not this acceptance.

## Previous requested scope: publish and merge the reviewed PR #61 (completed)

The user now authorizes pushing the reviewed companion Harness, updating PR #61, checking exact remote identities and current gates, then merging this PR. Preserve the shared main checkout and its existing edits; do not change other Issues/PRs, notify, delete branches/worktrees, or resume the historical pipeline. See [repair and publication evidence](docs/evidence/pr61-capability-review-fixes.md). GitHub PR state, mergedAt and mergeCommit are the canonical publication/merge outcome; read them before resuming and never repeat an already completed merge.

- [x] Derive DSH collaboration from the exact live member's Team tools and invalidate Studio snapshots on tool changes.
- [x] Reject native create/resume when required full collaboration lacks complete exact-handle proof; retain cleanup, identity and queued-work recovery.
- [x] Pass the Harness owner tests and exact-module 100% coverage, build, bilingual documentation gates and normal commit hooks.
- [x] Complete fresh Ultra verification: 590 strict checks, 382 tests and eight-archive install/Web/recovery/uninstall, including generated Remote, both DSH bindings and installed Loader capability checks.
- [x] Re-review the complete fixed PR diff with independent Standards and Spec agents: both report zero findings at Ultra `f5b2d4d` / Harness `57670c6b32`.
- [x] Push Harness `57670c6b32` to the maintained fork, then Ultra `9aa53d9` to PR #61; read both remote identities back. The subsequent publication handoff is documentation-only and does not alter the reviewed runtime or lock.

## Previous PR #61 repairs and conflict resolution (completed)

- [x] Separate exact member operation proof from provider catalog capabilities, retaining unknown on unprovable Codex cold recovery.
- [x] Compare ordinary external members' retained context, Profile and runtime requirements after provider replacement.
- [x] Close Studio after public member-message navigation and retain its editing draft on reopen.
- [x] Complete the final aggregate and local archive verification: 582 strict checks, 364 tests, eight archives, Web boot, JSON/SQLite recovery and uninstall.
- [x] Publish the companion Harness commit and all three repairs to the existing remote PR #61; verify both remote commit identities without bypassing hooks or rewriting history.

- [x] Integrate main and its locked Harness source, run combined regression and archive gates, then publish the resolved PR #61: Ultra merge `309c778`, Harness merge `bb9b489548`, 378 tests and complete eight-archive verification. Both original branches were fast-forwarded without bypassing hooks; PR #61 remains OPEN. See [merge evidence](docs/evidence/pr61-merge-resolution.md).

## Current vertical slice

- [x] Select local-only overlay delivery against the audited Harness snapshot.
- [x] Record authority, persistence, cancellation, disposal, collision, and UI decisions.
- [x] Implement profile schemas, immutable snapshots, and CAS storage.
- [x] Persist Team/name binding before teammate provisioning.
- [x] Install tool filters, persona, context, memory, and declarative hooks in child scope.
- [x] Expose generated Remote view/revision/save/release/spawn operations.
- [x] Add the Digital Employee Studio Client slot.
- [x] Compose stable Loader rows in the bundle patch.
- [x] Pass unit, lifecycle, Loader/profile, Client, and packed-artifact checks.
- [x] Run the credentialed manual Web launch and cold-resume acceptance scenario on the target DSH installation.
- [x] Upgrade the audited source baseline to DSH `0.1.2-rc.1`, migrate Session persistence to scoped handles, and align Agent Team delivery/profile contracts.
- [x] Make the Studio window movable, eight-direction resizable, viewport-bounded, and container-responsive.
- [x] Harden Studio, Remote, and headless seams to exact live Team Lead authority with reusable snapshot and Agent-scope lifecycle primitives.
- [x] Add the isolated v1 storage generation and idempotently migrate v0 Profiles and Bindings on JSON and SQLite.
- [x] Deliver immutable Profile Revisions with fingerprints, Head CAS, explicit activation/rollback, archive/restore, and bounded Studio history/diffs.
- [x] Select and pin capability-aware DSH model or durable local-agent Runtime Targets without fallback.
- [x] Launch and cold-resume dsh-model employees on their exact provider/model/reasoning route while retaining selected and resolved routes.
- [x] Make Launch Intents Team-idempotent and restart-reconcilable with separate provisioning, availability, and presence state.
- [x] Activate the audited package-local durable Codex Runtime Backend in the profile and local artifact closure.
- [x] Activate the audited package-local durable Claude Code Runtime Backend in the profile and local artifact closure.
- [x] Close the catalog-owner registration gap for both packaged runtimes and record ADR-0013.
- [x] Index one truthful, repairable Run per accepted DSH or external work turn and inspect bounded redacted canonical evidence in Studio.
- [x] Add exact-call one-shot approval through stock DSH approval, external capability gating, and truthful waiting/orphan evidence.
- [x] Gate Profile promotion with versioned exact isolated candidate evaluations.
- [x] Complete Studio snapshot streaming, lifecycle quiescence, and packed install/uninstall proof.
- [x] Move every Ultra-owned package and generated RPC identity to `@benz-ai-x`, verify the renamed archive set, and update the local Web installation.
- [x] Compare the official Agent Team contracts with the locked Ultra fork and record reproduced API, replay, runtime-capability, and v2 Run evidence compatibility findings in `docs/research/2026-09-05-official-agent-team-compatibility.md`.
- [x] Publish the Chinese-primary bilingual vNext Spec 1.1 as [Issue #18](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18), including the Team message center and interactive task DAG.

## Next increment

PR #60 is historical: it was merged as `9835db4361dcad500b3be09ef69f78420d71a6ab`; #34–#36 are closed with 5/5 AC. Its final review retained three P2 findings and one P3 finding, recorded in [HANDOFF.md](HANDOFF.md) and [review-fix evidence](docs/evidence/pr-60-review-fixes.md). Those findings are not claimed fixed by this integration. Historical review count 3 and sole retry 1/1 remain unchanged. Current development scope and validation timing are stated above and in the live Issues; old pipeline permissions do not expand merge authority.

- [x] [B09 / #27](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/27): [PR #53](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/53) merged as `2568444`; Issue closed, 6/6 acceptance criteria verified. Final candidate `472145a` passed Standards and Spec with zero unresolved findings. Full verification: 554 strict checks, 274 tests and eight-archive install/messaging/recovery/Web/uninstall. Harness `d5eca257c2` adds durable receipts and inactive-member reauthorization; both SDK event projections pass. Feishu completion notification succeeded.
- [x] [B10 / #28](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/28): [PR #54](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/54) merged as `e728af1`; Issue closed, 5/5 acceptance criteria verified. Final candidate `1120425` passed independent Standards/Spec with zero unresolved findings after fixing retry-budget and shared-diagnostic defects. Harness `7119c51c8d` passes 224 tests / 100% business-source coverage. Final full verify passes 562 strict checks, 282 tests / 24 files and eight-archive task/wait/receipt/recovery/Web/uninstall. Feishu completion notification succeeded. See [acceptance evidence](docs/evidence/issue-28-acceptance.md).
- [x] [B11 / #29](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/29): [PR #55](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/55) merged as `c3a95739`; Issue closed, 5/5 acceptance criteria verified. Qualified Harness `b85ebb3fca` adds the Host-only recovery reader and passes 229 owning tests with 100% coverage of four changed runtime files. Final validation passes 562 strict checks, 318 tests / 26 files, Claude 46 tests / 4 files, archive install/recovery/Web/uninstall, historical upgrade and maintained/official comparison. Both exact-head review axes report zero unresolved findings. Feishu completion notification succeeded. See [acceptance evidence](docs/evidence/issue-29-acceptance.md).
- [x] [B12 / #30](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/30): [PR #56](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/56) merged as `1a74d7fe`; Issue closed with 4/4 AC verified. Claude Code exposes task mutation and wait through the actual SDK channel while retaining Host CAS/DAG/tombstone/ownership/authority and durable-receipt semantics. Final validation passes 562 strict checks, 327 tests / 28 files, eight-archive install/recovery/Web/uninstall, historical Claude upgrade and maintained/official comparison. Initial Standards review found two P3 documentation-contract errors and Spec found zero issues; both corrections passed complete and final exact-head Standards/Spec review with zero unresolved findings at `7ad45df`. The merge tree equals that reviewed head. Feishu completion notification succeeded. See [acceptance evidence](docs/evidence/issue-30-acceptance.md).
- [x] [B13 / #31](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/31): [PR #57](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/57) merged as `5ab1c5a`; Issue closed with 6/6 AC verified. Exact live Leads receive fixed list/detail/launch tools while ordinary teammates and Evaluation Workers do not; persisted tool-call identity reuses the Host launch workflow across retries, cancellation and JSON/SQLite recovery. Final validation passes 562 strict checks, 336 tests / 29 files, packed Codex/Claude conversational launch and recovery, both historical upgrades and the maintained/official 11-group comparison. The initial Spec P2 packed-conversation evidence gap was repaired; final exact-head Standards and Spec reviews at `22c1100` report zero unresolved findings, and the merge tree equals that reviewed head. Feishu completion notification succeeded. See [acceptance evidence](docs/evidence/issue-31-acceptance.md).
- [x] [B14 / #32](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/32): [PR #58](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/58) merged as `08585631`; Issue closed with 6/6 AC verified. Qualified Harness `c2940ac503` supplies exact-Lead committed message reads and the Team-owned public child Slot. Final Ultra validation passes 582 strict checks, 340 tests / 30 files, eight-archive production renderer/Remote/Host recovery, both historical upgrades, and the maintained/official comparison. All review findings were repaired through RED/GREEN controls; exact-head Standards and Spec reviews at `47aac4f` report zero unresolved findings, and the merge tree equals that reviewed head. Feishu completion notification succeeded. See [acceptance evidence](docs/evidence/issue-32-acceptance.md).
- [x] [B15 / #33](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/33): [PR #59](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/59) merged as `2c5a355`; Issue closed with 6/6 AC verified. Qualified Harness `d2d870fbe4` supplies exact-Lead Team-owned submission, `(Team, sender, request)` replay/conflict, required `team/message/request-committed@1`, projection 7, same-Team replies, provider recovery, generated Remote, and keyless TypeScript/Python SDK projections. The final two-axis review has zero findings; pre-merge and post-merge `pnpm verify` both pass 582 strict checks, 346 tests / 30 files, and the eight-archive recovery/Web/uninstall gate. Manual merge and Feishu completion notifications both succeeded. See [acceptance evidence](docs/evidence/issue-33-acceptance.md) and [pipeline state](PIPELINE_STATE.md).
- [x] [B16 / #34](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/34): sole unified retry complete on Batch 2. Qualified Harness `806e5887…` keeps complete dependency edges while blocker copy names only unfinished Host prerequisites, and fit-to-view fully centers a normal five-row DAG in the default viewport without changing manual controls. Public RED/GREEN, focused Web/corpus, GUI, types/docs/build and the full Ultra gate pass. Live body was updated one marker at a time with other bytes unchanged; PR #60 was merged as `9835db4`; Issue is closed with 5/5 AC. The main lock at `b78caad462` includes subsequent review fixes. See [acceptance evidence](docs/evidence/issue-34-acceptance.md) and [pipeline state](PIPELINE_STATE.md).
- [x] [B17 / #35](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/35): sole unified retry complete on Batch 2. Qualified Harness `806e5887…` advances the edit base only after successful conflict authority reload and only for the next explicit Save; reload failure keeps the real error/old base, watch never advances an active edit, and a concurrently deleted selected dependency remains visibly removable from the draft. No path auto-retries. Live body was updated one marker at a time with other bytes unchanged; PR #60 was merged as `9835db4`; Issue is closed with 5/5 AC. The main lock at `b78caad462` includes subsequent review fixes. See [acceptance evidence](docs/evidence/issue-35-acceptance.md) and [pipeline state](PIPELINE_STATE.md).
- [x] [B18 / #36](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/36): sole unified retry complete on Batch 2. Qualified Harness `806e5887…` publishes the generated watch catalog, uses one shared completion/dirty bit per task refresh generation under 4096+4096 invalidations, and makes TeamAction Fiber teardown await Remote watch quiescence. Ultra likewise owns every message watch close at the Client context lifecycle while preserving immediate React cleanup; old-cursor fencing, page/roster coalescing, bilingual lifecycle states, and no-resend remain intact. Live body was updated one marker at a time with other bytes unchanged; PR #60 was merged as `9835db4`; Issue is closed with 5/5 AC. The main lock at `b78caad462` includes subsequent review fixes. See [acceptance evidence](docs/evidence/issue-36-acceptance.md) and [pipeline state](PIPELINE_STATE.md).

[Batch 3A / #37](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/37): implementation, two capability repairs and independent re-review are complete; both axes report zero findings. The repaired code was published through `9aa53d9`, locking Harness `57670c6b32`. Publication-only documentation follows. Merge and linked Issue closure are read from [PR #61](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/61), not inferred from the Issue's 6/6 checked AC. See [current evidence](docs/evidence/pr61-capability-review-fixes.md).
- [x] Implement and repair #38 on Batch 3B; PR #62 merged as `c1632755`, Issue closed. Validation and notification remain recorded above.
- [ ] Finish the active #39–#43 and #44 batches in their approved dependency order. Do not treat unrun PR acceptance as complete; parent Spec #18 stays open.

- [ ] Deliver [vNext Spec #18](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18) through its A/B/C phases and all acceptance criteria; specification publication does not mark implementation complete.
- [x] [A01 / #19](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/19): shared Host context, Profile release, isolated evaluation, and capability installation consolidation implemented on `fix/19-host-profile-evaluation`. Full `pnpm verify` passes 164 tests and eight-archive install/boot/uninstall. [PR #45](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/45), reviewed at `3046af5` with no Standards/Spec findings, was merged into `main` as `c6ea879` on explicit user authorization. Issue closed.
- [x] [A02 / #20](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/20): Launch/recovery, Run repair, and Studio projection consolidated on `fix/20-host-launch-recovery`, based on A01. Full `pnpm verify` passes 171 tests and eight-archive install/boot/uninstall; seven new generated-Remote cases cover stale authority, fixed-route cold recovery on JSON/SQLite, index rebuilding, cancellation ownership, and disposal. [PR #46](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/46) was independently re-reviewed against main with no Standards/Spec findings, then merged as `f702040` under the user's conditional authorization. Issue closed.
- [x] [A03 / #21](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/21): source preparation and shared attestation implemented on `fix/21-locked-source-preparation`, based on A02. An isolated checkout with spaces and no adjacent Harness passes frozen dependency install, 436 strict checks, full `pnpm verify` with 178 tests, eight-archive install/boot/uninstall, and standalone packing. [PR #47](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/47) was independently re-reviewed against main with no Standards/Spec findings, then merged as `85b80c2` under the user's conditional authorization. Issue closed.
- [x] [A04 / #22](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/22): [PR #48](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/48) repaired complete Ultra/Host/UI/Profile closure, actual Loader-root admission, ESM resolution without NODE_PATH, module-type verification, and T-04 comparison coverage. Full `pnpm verify` passes 448 strict checks, 191 tests and eight-archive install/Web boot/uninstall; maintained fork and fixed official baseline pass the same 11 public contract groups. Final Standards / Spec review of `0ccd4c0` reports zero unresolved findings; merged to main as `debde06` on existing user authorization. Issue remains closed.
- [x] [A05 / #23](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/23): [PR #49](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/49) moves Codex to Ultra, integrates main's complete compatibility admission, and validates the Profile-derived archive identity set. Full verification passes 506 strict checks, 204 tests and actual archive install/Web boot/uninstall. JSON/SQLite upgrade from current-main archives preserves member/Revision/native handle identity; catalog removal/replacement, follow-up messages, Web and complete uninstall pass. Official/fork 11-group comparison passes. Final Standards / Spec review of `7ad2602` has zero unresolved findings; merged to main as `081357d` on user authorization. Issue closed; authenticated native acceptance remains #44.
- [x] [A06 / #24](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/24): [PR #50](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/50) moves Claude Code to Ultra and preserves qualification, permissions and stable identity. Integrated main passes 554 strict checks, 218 tests and actual archive install/Web boot/uninstall. Shared Claude/Codex upgrade verification passes on JSON/SQLite, retaining original members/Revision/native handles, lifecycle cleanup and full uninstall; official/fork 11-group comparison passes. Final Standards / Spec review of `ef3ecde` has zero unresolved findings; merged to main as `cd15e97` on user authorization. Issue closed; authenticated native acceptance remains #44.
- [x] [A07 / #25](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/25): [PR #51](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/51) adds read-only migration audit and ADR 0016, integrates main, and repairs SQLite cache failure plus cross-Team/inherited payload admission. Final full verification passes 554 strict checks, 254 tests (36 audit cases) and actual archive install/Web boot/uninstall. Both JSON/SQLite native upgrade paths and the 11-group comparison pass; six new regressions prove source bytes stay unchanged. Final Standards / Spec review of `5539b5e` reports zero unresolved findings; merged as `ce6cb39` on user authorization. Issue closed. The #26 branch has integrated `ce6cb39`; Phase C migration and authenticated native acceptance remain outstanding.
- [x] [B08 / #26](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/26): revocable Team-owned native grants and three Codex dynamic-tool queries. Main `ce6cb39` integrated; qualified maintained Harness `fdfdbaeb0e` passes focused 100% coverage, build, Loader, docs and lint. Ultra passes 554 strict checks, 263 tests, eight-archive install/query/cold-resume/Web/uninstall, both JSON/SQLite product upgrades and the 11-group official comparison. Old threads preserve their installed tools and original handles; authenticated native acceptance remains #44. [PR #52](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/52) merged as `6253119` on user authorization; Issue closed. Both initial Standards findings (recorded-session coverage and branded task cursor) are fixed; built session replay, public declaration types and final full validation pass. Final independent Standards / Spec reviews of Ultra `04a50c9722` and Harness `fb03045fbe` report zero unresolved findings; The user has authorized merging after review. The renewed main review found one P3 exact/multibyte byte-limit test gap; four added regressions and negative controls close it, with 48 owning tests passing and query-module coverage at 100%. Complete Ultra verification, both upgrades and official comparison pass with the final lock; final independent Standards / Spec reviews of Ultra `0f0a83310f` and Harness `fdfdbaeb0e` both pass with zero unresolved findings, merged to main as `6253119` after checking the final head `a7f98069e7`.
- [ ] Continue the remaining implementation issues under the frozen Batch plan in [PIPELINE_STATE.md](PIPELINE_STATE.md), preserving dependency and integration-branch requirements. Leave Spec #18 open for the final acceptance audit.

## Later

- [ ] Add optional managed worktrees after DSH exposes an enforceable ownership seam.
- [ ] Add profile import/export and secret-reference fields without transporting credentials.
- [ ] Re-evaluate publishability after experimental Agent Team packages are released.
