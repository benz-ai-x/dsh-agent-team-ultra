# TODO

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

User instruction (2026-09-05): close implementation issues once development and validation pass; PR creation and reviews remain independent tasks. #19–#22 meet this condition, but GitHub closure is pending authentication (`gh issue close 19` was rejected before any state change).

- [ ] Deliver [vNext Spec #18](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18) through its A/B/C phases and all acceptance criteria; specification publication does not mark implementation complete.
- [ ] [A01 / #19](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/19): shared Host context, Profile release, isolated evaluation, and capability installation consolidation implemented on `fix/19-host-profile-evaluation`. Full `pnpm verify` passes 164 tests and eight-archive install/boot/uninstall; PR creation awaits GitHub CLI authentication, followed by post-submission review and manual review.
- [ ] [A02 / #20](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/20): Launch/recovery, Run repair, and Studio projection consolidated on `fix/20-host-launch-recovery`, based on A01. Full `pnpm verify` passes 171 tests and eight-archive install/boot/uninstall; seven new generated-Remote cases cover stale authority, fixed-route cold recovery on JSON/SQLite, index rebuilding, cancellation ownership, and disposal. PR creation and post-submission review await GitHub CLI authentication.
- [ ] [A03 / #21](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/21): source preparation and shared attestation implemented on `fix/21-locked-source-preparation`, based on A02. An isolated checkout with spaces and no adjacent Harness passes frozen dependency install, 436 strict checks, full `pnpm verify` with 178 tests, eight-archive install/boot/uninstall, and standalone packing. PR creation and post-submission review await GitHub CLI authentication.
- [ ] [A04 / #22](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/22): explicit compatibility identity, pre-import Host/profile admission, checked install/startup CLI, and patch ledger implemented on `fix/22-runtime-compatibility-preflight`, based on A03. Full `pnpm verify` passes 448 strict checks, 186 tests, and eight-archive install/boot/uninstall. The same public Team behavior probe passes on locked fork and fixed official `d347e7`; unsupported official source and package are rejected before business writes. PR creation and post-submission review await GitHub CLI authentication.
- [ ] Continue open implementation issues #23–#44 in order after A04, preserving their dependency and integration-branch requirements. Leave Spec #18 open for the final acceptance audit.

## Later

- [ ] Add optional managed worktrees after DSH exposes an enforceable ownership seam.
- [ ] Add profile import/export and secret-reference fields without transporting credentials.
- [ ] Re-evaluate publishability after experimental Agent Team packages are released.
