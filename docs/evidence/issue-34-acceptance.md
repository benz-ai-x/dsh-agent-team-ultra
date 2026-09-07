# Issue #34 acceptance

The public Agent Team owner panel now presents one authoritative task board as
both an accessible list and an interactive dependency graph. Both views share
one selection and detail, and every displayed task fact and mutation remains
owned by the Host.

Requirement: [Issue #34](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/34);
parent [Spec #18](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18).
The projection boundary is recorded in
[ADR 0025](../adr/0025-project-one-authoritative-task-board-into-list-and-graph.md).
Ultra starts from main `2c5a355deefcf3c9dfc3384787e9cfe3de4678e3` and pins
qualified Harness commit
[`41291bc977`](https://github.com/benz-ai-x/deepseek-harness_x/commit/41291bc9779ba954b774880c634fe90c9945b966).

| Acceptance criterion | Repeatable evidence and conclusion |
| --- | --- |
| Use real task ids and prerequisite-to-dependent edges; source owner, status, claimability, and blockers from one Host state | The maintained [Agent Team change](https://github.com/benz-ai-x/deepseek-harness_x/commit/709f96c5a16ff3e34c385ba79f45dd4435d8418c) renders each `TeamTaskView` with its real id, owner, status, `ready`, and `blockedBy`. SVG lines expose the exact `data-from-task-id` and `data-to-task-id` and a visible arrow marker from blocker to dependent. Public component tests require `task-1 -> task-2`, unowned/pending/blocked facts, and a matching detail. The packed probe creates both tasks through the real Host and verifies the installed production node and directed edge. |
| Preserve selection across list/graph switching and open one detail with all existing controls | One transient `selectedTaskId` chooses a task from the current `TeamView`; list buttons and graph nodes update it, while a single detail region owns the existing create, edit, owner assign/release, complete, reopen, and delete flows with each task's real revision. Component tests exercise shared selection and the full conditional control set. The [packed production probe](../../scripts/probe-packed-message-center.mjs) selects the dependent in the list, opens the graph, navigates to it by keyboard, switches back, and observes the same selected id and detail controls. |
| Provide automatic layout, zoom, pan, fit, keyboard navigation, list alternative, and hidden-dependency cues without changing readiness | A deterministic dependency-depth layout assigns graph columns without another graph library. Viewport state bounds zoom to 0.5-2, supports canvas-child pointer pan and fit-to-view, and exposes relationship/order keyboard movement. Native task buttons remain available in list mode. Filtering derives only `visibleTasks`; missing visible blockers are named while detail and node readiness continue to display the unmodified Host value. A regression proves ArrowLeft cannot select a filtered-out prerequisite or move the perceptible detail away from the visible node. The official keyless Web corpus records both list and DAG ARIA surfaces from the same authored Host task facts, including the exact `task-1` to `task-2` edge. |
| Reuse existing Team API, permissions, and revisions without another state source, scheduler, lock, or member launch | `remoteGetTask` is a thin generated-Remote delegate to the existing Host `getTask`; task writes retain the existing create/update API and `expectedRevision`. Host tests create then retrieve one task through the public surface and retain exact authority/tombstone behavior. The feature adds no event, checkpoint, persistent field, grant, scheduler, lock, or runtime operation. Presentation state is disposable and never submitted as readiness or authority. |
| Compose through the public Team UI with English/Chinese state copy and packed UI proof | The implementation remains in the Harness-owned production `TeamAction`, which owns the public panel and child Slot used by Ultra's message center. Browser registration/disposal tests and English/Chinese render tests pass. Harness Client production build proves a browser-safe bundle. Ultra's eight-archive gate installs that bundle, mounts the real renderer/root/session/owner/child composition, reads tasks through the generated Remote from a Loader-mounted Team/AgentLoop/JSONL Host, verifies the graph behavior, and then completes existing message recovery, Web, Codex/Claude JSON/SQLite recovery, registration-release, and uninstall checks. |

## Verification

- Harness TeamAction passes 34/34 and the public browser mount passes 10/10;
  the focused keyless Web snapshot passes 3/3 and corpus validation 2/2.
- Harness Client production build, Host generated build, 32/32 documentation
  gates, bilingual pairing, generated catalogs, and `git diff --check` pass.
- Ultra source preparation exactly attests Harness `41291bc9779ba954b774880c634fe90c9945b966`
  and documentation digest
  `358deaf018cb0851d60c70f23beb954bc8513f7154cde82d137be757af15c782`;
  install, full build, and 582 strict checks / zero warnings pass.
- Ultra `pnpm verify:pack` passes all eight installed archives, the production
  task list/DAG probe, persisted message/reply recovery, real Web boot,
  controlled Codex/Claude JSON and SQLite recovery, registration release, and
  complete uninstall.

The first public UI RED could not select a real dependent task or open a graph.
Subsequent focused REDs isolated the missing interactive graph, task filter,
public `getTask` Remote, built descriptor, complete node facts, visible edge
direction, and canvas-child panning. The final archive RED used the prior
production Team Client against a real current Host: both authoritative tasks,
ids, readiness, blockers, and old controls rendered, but the selectable
dependent row and DAG did not exist. Repacking the qualified source made the
same production probe pass. No RED was attributed to stale generated output or
test-fixture mistakes; those cases are identified separately in
[pipeline state](../../PIPELINE_STATE.md).

Issue #35 still owns dependency multi-selection and retained concurrent-conflict
drafts. Issue #36 still owns live invalidation, stale/reconnect generations,
and watch disposal. This evidence does not claim either later behavior.
