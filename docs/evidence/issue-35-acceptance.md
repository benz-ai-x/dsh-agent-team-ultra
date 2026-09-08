# Issue #35 acceptance

The public Shared Task Panel now edits dependencies through the same real task
ids, revision, Host authority, and detail used by its list and dependency graph.
Client previews remain disposable. A successful edit is one atomic Host commit;
a stale edit reloads authority while retaining an explicitly unsaved draft.

Requirement: [Issue #35](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/35);
parent [Spec #18](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18).
The authority boundary is recorded in
[ADR 0025](../adr/0025-project-one-authoritative-task-board-into-list-and-graph.md).
Ultra pins qualified Harness commit
[`806e58873b`](https://github.com/benz-ai-x/deepseek-harness_x/commit/806e58873bb055e258b4623d03c9fbad41a26dc7);
the unified-retry edit behavior is isolated in
[`13f5fb25d7`](https://github.com/benz-ai-x/deepseek-harness_x/commit/13f5fb25d7f43e67103f176ca6f603178f86c2ef)
with paired contract documentation in
[`938adcc566`](https://github.com/benz-ai-x/deepseek-harness_x/commit/938adcc566f9a6a4eddb90f8f03920684a0e28e6).

| Acceptance criterion | Repeatable evidence and conclusion |
| --- | --- |
| Share task id/revision and validate dependency additions/removals through the real Team API | The production picker is a native checkbox group derived from the current authoritative task view and keyed by real ids. Edit pins `expectedRevision` when the form opens, then sends body, scopes, and the complete `blockedBy` set once even if a watch refresh updates the selected task meanwhile. The Host atomic-edit test proves missing references, self edges, and indirect cycles are rejected with unchanged task revision, body, dependencies, and durable event count; existing exact-role checks remain in that same mutation API. |
| Make C claimable only after both A and B complete, with synchronized edges and blockers | The Host test creates A/B/C, atomically gives C both prerequisites, completes A and observes C still blocked, then completes B and claims C only after readiness becomes true. Production component tests require preview to leave the old graph unchanged and a committed refresh to replace the exact prerequisite-to-dependent edge and blocker detail. Blocker copy now filters only completed dependencies from the same Host view while the complete `A -> C` and `B -> C` relationship remains in the DAG; a watch-driven completion proves the copy and Host `ready` fact change together. The installed archive independently replaces `A -> C` with `B -> C` through the actual checkbox and generated Remote. |
| Return conflict/current authority to two Clients while retaining an unsaved draft without retry | The two-Client component test lets Client A advance the Host, sends Client B a real watch invalidation, then proves B still submits the edit-start revision exactly once, reloads A's current value, and retains B's text and dependency choices under an explicit unsaved diagnostic. A new public behavior test then requires no automatic resubmission and proves the next explicit Save uses the successfully reloaded authority revision. Its paired failure test makes that reload reject stably: the real error remains visible, the draft and old base remain unchanged, and the next explicit Save still uses the old revision. Ordinary watch refreshes never advance an active edit base. The [packed production probe](../../scripts/probe-packed-message-center.mjs) repeats the first stale CAS against a real Host through the generated Remote. |
| Preserve tombstone, reopen, ownership, hidden-dependency, and preview semantics | Host tests retain an in-progress owner across dependency edits, clear ownership on complete/reopen according to the existing transition, preserve blockers/readiness, expose a stable tombstone through Host detail, and hide deletion from the task list. Production Browser wiring consumes generated `agentTeams/getTask`: when an authoritative refresh removes the selected task, the same selected id remains and its deleted tombstone appears in the shared detail with every write control removed; a late old-Team detail cannot enter a replacement generation. If only a selected dependency is concurrently deleted, the active draft keeps an explicit bilingual “unavailable or deleted” native checkbox for its real id, so the user can audit and remove it; unchecking remains a Client preview until the next explicit Save sends the complete dependency set through the same CAS. Component filtering still names hidden blockers without recomputing readiness. Unit and packed probes verify dependency clicks alone do not mutate the Host or graph. |
| Reject stale Lead, cross-Team, and unauthorized writes without persistence; provide accessible bilingual selection and feedback | One Host test uses an exact-handle impostor, another Team Lead, and a same-Team non-owner, asserting precise rejection and unchanged event counts in both Roots. Native checkbox/fieldset semantics provide keyboard operation and the existing native-button list remains the graph alternative. Separate English and Chinese production-renderer mounts each create a real stale conflict and verify current authority plus explicit unsaved-draft feedback. |

## Verification

- Unified-retry Harness TeamAction passes 42/42. The public
  TeamAction/browser/Fiber owner set passes 55/55 and the Host plus Client owner
  set passes 115/115. The generated built-library Remote test passes 1/1.
- Harness full typecheck, focused lint, production Client/Web builds, complete
  GUI regression (283 files, 3925 passed, one existing skip), and 32/32
  documentation gates pass. The directly
  applicable `agent-team-external` recorded-session replay passes in lib mode
  without refreshing its golden.
- A full Harness snapshot attempt encountered unrelated current-environment
  baselines: ACP model config events, skill-catalog/context sequence drift, and
  a headless `.ts` loader error. Those failures reproduce outside this task
  surface and no golden was changed; the isolated Agent Team replay above is
  green. Details and exact counts remain in
  [pipeline state](../../PIPELINE_STATE.md).
- Ultra source preparation attests Harness `806e58873bb055e258b4623d03c9fbad41a26dc7`
  and docs digest
  `d4028c4f143f72a99ded5c0ee39c3463c13ff258bbb70ba9ce74af0aa426e767`.
  Frozen install, build, and 582 strict checks / zero warnings pass.
- Ultra `pnpm verify:pack` passes all eight installed archives, the real
  English/Chinese dependency-edit and stale-CAS path, existing message and
  controlled-provider recovery, real Web boot, Codex/Claude JSON and SQLite
  recovery, registration release, and complete uninstall.
- The unified-retry full `pnpm verify` passes on its first run: 582 strict
  checks / zero warnings, 30 files / 359 tests, generated Host/Client artifacts,
  and the complete eight-archive install, production UI, Web, dual-runtime
  recovery, registration-release, and uninstall gate. The historical local-gate
  red count remains one and the consecutive count remains zero.

The first UI RED could not find an accessible dependency checkbox. The Host RED
then proved the old `edit` committed text while ignoring dependencies. A
two-Client RED proved authority and draft were retained but the conflict copy
did not identify the draft as unsaved. The packed RED used the prior #34
archive and stopped at the missing production dependency group. Each became
green at the owning boundary before this final archive run. Test-fixture,
incremental declaration freshness, and locale hot-switch orchestration errors
were classified separately and were not counted as product REDs.

Issue #36 owns live invalidation, paging/watch races, disconnected/stale state,
reconnect generations, and watch disposal. Its separate evidence establishes
those behaviors; this document claims only the #35 dependency and conflict
criteria above.
