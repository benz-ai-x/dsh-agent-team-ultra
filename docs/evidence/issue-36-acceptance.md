# Issue #36 acceptance

The public Team owner panel now follows committed message and task changes
without copying either domain into another persistent store. Each exact-Lead
watch generation starts with a complete authoritative Team view. Later durable
commits coalesce into bounded invalidation, and both the task panel and message
center reread their existing Host-owned views.

Requirement: [Issue #36](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/36);
parent [Spec #18](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18).
The shared authority boundary remains
[ADR 0025](../adr/0025-project-one-authoritative-task-board-into-list-and-graph.md).
Ultra pins qualified Harness commit
[`503ad563ff`](https://github.com/benz-ai-x/deepseek-harness_x/commit/503ad563ff226c2afc77608c432af3a80aae3279).

| Acceptance criterion | Repeatable evidence and conclusion |
| --- | --- |
| Establish a complete baseline, then bounded invalidation and authoritative rereads | Host tests open the follower before reading the baseline, so an overlapping commit cannot be lost. The first frame is a complete `TeamView`; synchronous message/task bursts retain one pending invalidation bit per follower. Client count/barrier tests prove task view, message page, and roster each allow one authority read in flight and coalesce a burst into exactly one trailing read. No stream frame or latch stores a page, body, task patch, or Client-authored authority. |
| Fence paging/live races, filters, late pages, Team switches, and service replacements | Component tests cover both race directions: an append already in flight is fenced when invalidation starts a no-cursor replacement, while an old published cursor cannot start append after replacement begins. A barrier test changes filters while the prior replacement is pending and proves the old filter generation cannot publish before the one queued trailing read. Team switching releases old queues and pending submission, disposes its control, starts an empty new-Team intent, and rejects late callbacks/settlements. Same-Team replacement preserves an editing draft; an interrupted pending request retains its exact id/body as explicitly unknown without retry. |
| Reconnect reads without resend, missing pages, duplicates, or false completion | Stale and reconnect callbacks only reload `TeamView` and the authoritative filtered window. `sendMessage` remains zero throughout reconnect tests. A pending cursor cannot become the replacement cursor, metadata ids are deduplicated on valid append, and pending delivery remains separate from task completion. Stored uncertain intents return only as reviewable `unknown`; only the explicit retry command resubmits the same request. |
| Share Host commit facts and keep distinct bilingual states | The same Host follower observes a real `remoteSendMessage` acceptance/delivery and task commits. Authority reads return the exact delivered message and current task view. Production UI tests distinguish empty/loading, disconnected before baseline, stale after baseline, unavailable terminal transport, stale-CAS conflict, and retained committed data in English and Chinese; Chinese stale copy consistently uses “陈旧”. |
| Release watch, Remote, locale, Slot, and background work; prove generated and packed paths | The generated descriptor exposes exactly `agentTeams/watch` in stream mode with Agent lookup and signal cancellation. Host abort and Team Fiber disposal end iterators. TeamAction and message child React cleanup immediately trigger idempotent control disposal, while their Client context owners retain every live or replaced async close until Fiber/service-generation teardown is quiescent; deferred transport tests prove the lifecycle cannot resolve early, registrations reach zero, and disposal failures are caught by the Cordis lifecycle boundary. The packed probe uses the production renderer, public owner/child Slot, generated Remote, Gateway, real Host/Team/JSONL persistence, and verifies baseline, committed invalidation, late-cursor rejection, no resend, and no callback after renderer unmount. |

## Verification

- Harness source-owning tests pass 3 files / 109 tests: 60 Host Team authority,
  36 production TeamAction, and 13 browser child-Slot/lifecycle tests. The built-library
  stream descriptor e2e passes 1/1.
- Harness type equivalence passes 435/435 blocks, the isolated Agent Team
  recorded replay passes, and all 15 documentation gates pass. Official Host
  and Client builds generate the stream descriptor and browser bundle; no
  artifact was hand-edited.
- Ultra source preparation attests Harness
  `503ad563ff226c2afc77608c432af3a80aae3279` and docs digest
  `d4028c4f143f72a99ded5c0ee39c3463c13ff258bbb70ba9ce74af0aa426e767`.
  Frozen install, build, 582 strict checks / zero warnings, and the message plus
  mount owner suites (2 files / 25 tests) pass.
- Ultra `pnpm verify:pack` passes all eight archives. Its production path
  covers task-DAG and dependency-CAS regressions, watch baseline and bounded
  invalidation, a held late cursor, zero reconnect resend, renderer disposal,
  Host recovery, real Web boot, Codex/Claude JSON and SQLite recovery,
  registration release, and complete uninstall.
- The review-fix final `pnpm verify` passes 582 strict checks with zero warnings, production
  Host/Client and generated-artifact builds, 359 tests in 30 files, and repeats
  the complete eight-archive install, Web, dual-runtime recovery, lifecycle,
  and uninstall gate. Before review round 1, the first formal local-gate run
  exposed two stale direct-mount fixtures; after both consumed the authoritative
  watch baseline and asserted the shared selected detail precisely, their
  focused 2/2 and the next full gate passed. The review-fix full gate passed on
  its first run, so the historical Batch red count remains one and consecutive
  red count remains zero.

The first Host RED lacked a public watch. A role RED showed the old draft did
not enforce exact Lead authority, and the prior built descriptor lacked the
stream method. Client REDs showed zero watch opens, missing Gateway actions,
and absent stale states. A same-Team replacement RED left a pending request
stuck as submitting. The packed RED ran the exact prior #35 sources and stopped
at the missing generated Team watch action. Each became green at its owning
boundary. Matcher, timeout, declaration-freshness, legacy-artifact, and probe
wiring errors are separately classified in
[pipeline state](../../PIPELINE_STATE.md) and are not represented as product
REDs.

This issue changes no Session, Team event, projection, message-request, native
operation, or Ultra-domain format. It does not implement #37 Studio capability
truth, #38 provider-generation replacement, #39+ migration, or #44 authenticated
native acceptance.
