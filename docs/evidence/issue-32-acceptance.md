# Issue #32 acceptance

An exact live Team Lead can now browse persisted Team messages in the existing
Agent Teams panel. The list is a bounded, body-free view of a fixed committed
window; intentional content is loaded only after the Lead selects a row. The
Agent Team Session log remains the authority for identity, ordering, delivery,
and content.

Requirement: [Issue #32](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/32);
parent [Spec #18](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18).
The authority, composition, cursor, content, and delivery decisions are in
[ADR 0023](../adr/0023-compose-persisted-team-message-reads.md). Ultra starts
from main `5ab1c5a2c5e16b6832edbdef8dd1473bc913e022`; the qualified Harness is
`c2940ac5039b744f962d2b264c03a6e9fb33af07`. Session 0, Team event payload 2,
native operation 4, and Ultra v1 remain unchanged. The Team projection advances
from 5 to 6 so older checkpoints rebuild the event-derived message index.

| Acceptance criterion | Repeatable evidence and conclusion |
| --- | --- |
| Compose one panel through the Team owner's public generated Remote and navigation/Slot contract, without another UI's private components; record the authority and content boundary | The Harness Agent Teams Client remains the sole owner of the conversation-header entry, dialog, navigation roster, and generated Team Remote. It publishes the session-scoped public child Slot `agent-team.panel.view` with the Team Session id resolved by the owner. Ultra registers one stable `messages` view in that Slot and calls `agentTeams.view`, `listMessages`, and `getMessage` through generated Remote augmentation. It imports only public Team Client, Remote, and Slot contracts. The owning Client tests navigate the child view and prove its owner registration, roster, locale, and Slot disappear with the Fiber. Ultra's [mount test](../../packages/ui/tests/mount.client.spec.ts) proves one child registration and removal with the Ultra Fiber. ADR 0023 records these ownership boundaries. |
| Provide bounded pagination, filters, detail, stable message identity, a committed cursor, explicit completeness, and safe on-demand content | Harness `TeamMessageReader` defaults to 20 items, accepts only integer limits 1–100, orders stable message ids newest-first by queue sequence, and binds Team, canonical member/direction/delivery filters, committed `through`, and exclusive `before` sequence into the cursor. Every page reports the fixed committed-window cursor, optional continuation, and completeness. List responses contain metadata only. Detail requires a selected message id plus the committed window and returns literal intentional text, detached image media type/size/dimensions, explicit omitted parts and `complete | partial | unavailable`; attachment ids, paths, bytes, reasoning, tools, provider-private blocks, and unknown blocks do not cross the boundary. The nine reader tests cover later writes, a write racing immediately after the durable cutoff capture, stable older-window facts, paging, every filter, default and exact bounds, malformed/future/query/cross-Team cursors, partial/unavailable content, and disposal settling an accepted read. The [message-center test](../../packages/ui/tests/message-center.client.spec.tsx) proves no detail call occurs before selection, literal text cannot become markup, filters preserve their committed query, continuation uses the Host cursor, pending detail state is cleared by filter/refresh replacement, and a roster failure is retained and retried independently from list state. |
| Resolve the exact live Lead in Host and reject forged sender, stale identity, and cross-Team cursor/query | Each list/detail operation resolves the caller through the live Team roster before the transaction, again before the durable Session flush, and after it. Teammates, disposed or replaced Leads, and stale objects fail closed. The projection reader resolves both participants against the current Host roster and rejects a persisted sender label that differs from the roster. Cursor decoding rejects malformed envelopes and payloads, bad checksums, unknown fields, future sequence cutoffs, another Team, and changed filters. Tests exercise all of those cases, a forged sender, a nonparticipant target, inconsistent message indexes and delivery facts, and disposal while a read is waiting at the flush barrier. |
| Show sender, recipient, time, intentional content, and Host-proven state while keeping pending/delivered/unknown distinct from read or task completion | Page and detail DTOs contain Host-resolved sender/recipient identities, event-owned queue time, and delivery as of the committed cutoff. `pending` means no acknowledgement is committed in that window; `delivered` includes the event-owned acknowledgement time; `unknown` remains an explicit browser-safe contract value when the Host cannot prove a current fact. The English and Chinese panel copy states that delivery is neither read status nor task completion. UI tests render pending and unknown states separately, and the reader test proves that a later acknowledgement cannot rewrite an older committed window. |
| Keep message bodies out of global Studio Snapshot and Run Index, and do not copy raw native history or credentials | Message bodies remain only in the authoritative Agent Team Session log. The new Team projection index stores message id plus queue/delivery sequence and time; list DTOs and cursors contain no content. Ultra adds no message field to its storage schema, Studio snapshot, Run index, or watch frame. Detail sanitizes the selected Team-log content directly and never reads or persists a native transcript. The existing Studio/Run schemas and packed JSON/SQLite recovery tests remain green, while migration audit now requires projection 6 and confirms Session 0 and Ultra v1 are unchanged. |
| Provide English/Chinese empty, loading, error, and unavailable behavior; keep the Client browser-safe and clean Remote/locale/Slot registrations with the Fiber | [locales.ts](../../packages/ui/src/client/locales.ts) defines paired English and Chinese strings for navigation, filters, delivery, loading, empty, error context, partial content, unavailable content, and the visible stable message id. The panel uses generation and Team Session guards to discard stale list/detail settlements after navigation. Client tests cover loading, empty, unavailable, stale-session, pagination, filters, literal rendering and all visible delivery variants. Mount tests verify generated Remote calls and child-Slot disposal; the Harness browser test boots real Client composition and confirms the owner Slot and locale listeners clean up. The packed gate installs the actual archive closure, renders the actual Team owner and Ultra child through their generated bundles, reads two pages containing DSH, Codex, and Claude routes through authenticated HTTP, loads one detail on demand, then restarts Host storage and reuses the committed cursor and stable id. Ultra's browser bundle builds without Node imports, and the packed gate also starts the real DSH Web profile. |

The TDD RED run first failed eight Harness behaviors because no reader or
message index existed; it is recorded in
`/root/workspace/.ultra-checks/32-harness-message-read-red.log`. The first reader
GREEN run passed seven tests and both Agent Team owner packages passed 269 tests
in ten files. The first fixed-SHA reviews then exposed a cursor cutoff race,
unsettled reads during Team disposal, and a Client owner that bypassed the
reserved injected-hook surface. Dedicated RED runs reproduced each defect.
The corrected reader now passes nine tests; both owner packages pass 271 tests
in ten files; and the reader reports 100% statements, branches, functions, and
lines. The built-library Remote test passes separately, and all 32 documentation
gates pass. The final logs are
`/root/workspace/.ultra-checks/32-harness-review-fixes-{owner-final,reader-coverage,built-lib,doc-sync}.log`.

Ultra's UI RED run initially had no component or usable Client test dependency.
The final focused message center and mount run passes four tests. Compatibility
repairs for the new required owner props and independently bundled CSS were
then caught by the first full suite and locked down by 28 targeted regression
tests. A later bilingual-error assertion also went RED before the localized
prefix was added, then passed with the focused suite. Review-driven Client RED
runs then proved that refresh/filter replacement left a pending detail spinner,
list success erased a separate roster failure, refresh did not retry the roster,
and the stable id was not visible. The corrected component isolates all three
failure channels, resets invalidated detail state, retries both reads, and shows
the stable id. The first final run then exposed two downstream Client fixtures
that still supplied the retired raw owner props; their focused regressions pass
after moving them to the public injected selector hook. The repeated final
`pnpm verify` passes 582 strict context checks with zero warnings, builds Host,
generated Typert, and Client targets, and passes 340 tests in 30 files. It packs
all eight archives, imports the installed closure,
boots real DSH Web, exercises Codex and Claude through new and resumed JSON and
SQLite archives, and removes every package and Loader row. The logs are
`/root/workspace/.ultra-checks/32-ultra-{message-center-red,message-center-green,regression-fixes,bilingual-error-red,bilingual-error-green}.log`,
`/root/workspace/.ultra-checks/32-review-fixes-ultra-{red,green-attempt}.log`,
`/root/workspace/.ultra-checks/32-review-fixes-downstream-ui-green.log`,
`/root/workspace/.ultra-checks/32-packed-message-center-attempt.log`,
`/root/workspace/.ultra-checks/32-verify-pack-attempt.log`,
and `/root/workspace/.ultra-checks/32-review-fixes-ultra-final-verify.log`.

The maintained Harness `c2940ac5039b744f962d2b264c03a6e9fb33af07` and fixed
official comparison `d347e703908d0406b7a7ef80e3a0e594d86b2215` pass the same
11 public Team behavior groups, including authority, messaging, tasks,
cancellation, disposal, and recovery. Compatibility admission accepts the
maintained source and rejects unsupported official source or package material
before business data exists. The comparison log is
`/root/workspace/.ultra-checks/32-review-fixes-compatibility-compare.log`.

Historical Codex archives from
`debde06ce5c75658f9ad741cbfc8d535df118455` and Claude archives from
`081357d17f7a0535b75bb7d3133177febddee4a2` upgrade on JSON and SQLite while
preserving the original Profile Revision, member, native handle, and single
native session. Later controlled work, Web boot, and complete uninstall pass.
The independent historical worktrees and their `8b4bae0b620cc89a987a3ec6dd8b0b7d9025649a`
Harness remain source-clean. Their logs are
`/root/workspace/.ultra-checks/32-review-fixes-{codex,claude}-upgrade.log`.

This slice deliberately has no send, reply, mutation idempotency, live stream,
or reconnect behavior. Issue #33 owns message writes, #36 owns live updates,
and #44 owns authenticated native-product acceptance.
