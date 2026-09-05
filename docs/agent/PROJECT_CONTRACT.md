# Agent Team Ultra project contract

## Product outcome

Agent Team Ultra adds a visual Digital Employee Studio to the DSH Web UI. A
Team Lead can create versioned employee profiles, choose a teammate name,
a capability-aware Runtime Backend, a separate continuation provider/context
mode, inherited tool allow/deny policy, curated context, long-term profile
memory, and declarative lifecycle hooks, then launch that profile as a real
DSH-continuable or provider-native durable Agent Team teammate.

The first observable scenario is: create a `code-reviewer` profile in the Web
UI, select read/search tools, add review rules and memory, launch it for the
current Team, and observe a durable Agent Team member whose pinned route,
prompt, and tool surface reflect that exact active Profile Revision snapshot.

## DSH form and topology

- `@benz-ai-x/dsh-agent-team-ultra` is the Host service, storage-domain
  owner, generated Remote contract, and exact-Agent lifecycle composer.
- `@benz-ai-x/dsh-client-ui-agent-team-ultra` is the browser-only UI adapter
  and React Studio surface.
- `@benz-ai-x/dsh-agent-team-ultra-profile` is the bundle patch that activates
  the Host and UI rows alongside the experimental Agent Team rows, beneath a
  Loader group whose Node-only compatibility admission precedes child imports.
- `@benz-ai-x/dsh-agent-team-codex` is the Ultra-owned Host-only durable
  Codex Runtime Backend, qualified against its exact package-local native
  payload and activated with a read-only sandbox.
- `@benz-ai-x/dsh-agent-team-claude-code` is the Ultra-owned Host-only
  durable Claude Code Runtime Backend, qualified against its exact
  package-local Agent SDK/native payload and activated with a read-only
  sandbox.
- Required Host services: `agents`, `agentTeams`, `llm`, `storageDomain`,
  `subagents`, `systemPrompt`, and `tools`.

The packages remain together in one workspace, but Host, Client, and bundle
boundaries are separate because they have different runtime and delivery
contracts.

The [compatibility decision](../adr/0015-maintain-explicit-harness-compatibility.md)
and [patch ledger](../reference/harness-patch-ledger.md) supplement the historical
consume-without-replacement boundary. The lock identifies the official
foundation, maintained fork, comparison baseline, documentation digest,
extension API qualification, durable formats, and native SDK/payloads separately.
Normal builds generate an executable proof and a public Host wrapper that
checks it before dynamically importing fork-only implementation dependencies.
The profile checks its full private package closure before Loader starts any
child; validation follows each package's own ESM dependency resolution, excluding
`NODE_PATH` fallbacks. A retired Codex or Claude Code package remaining in the installation
is rejected before any child can register. The local
CLI wrapper validates source before installation, actual dependencies after
installation, and source plus installed dependencies before startup. Admission
failure does not open Ultra or Team business storage. Native user authentication
and final product acceptance remain separate requirements.

Ultra-owned packages use the maintainer's `@benz-ai-x` scope. Dependencies
provided by the pinned Harness retain their `@deepseek-ai` names. Package and
generated RPC identities move together; `digitalEmployees`, stable Loader row
ids, and the `agent_team_ultra_v1` storage generation remain unchanged.

The Host composes internal Profile lifecycle, Evaluation workflow, Profile
capability installation, Launch/recovery, Run evidence/repair, and Studio
projection modules around one service context. That context owns
exact live Lead checks, public mutation admission, the serial write queue,
runtime catalog, and storage lifetime. Generated Remote and headless methods
delegate to the same business operations. A queued decision rechecks its caller
before it starts, and runtime preflight rechecks authority after asynchronous
work. Internal settlement remains able to flush after public admission closes.
The Launch workflow owns idempotent admission and roster-derived recovery;
the Run workflow owns bounded canonical folds and event-driven repair; the
Studio projection owns the shared instance DTO builder and complete snapshot
feed. The public service composes their startup, event subscriptions, and drain
order without wrapping or replacing the authoritative Agent Teams service.

Source preparation attests the selected locked Harness before creating the
repository-local `.dsh/harness` link. Dependencies, TypeScript bases/references,
test aliases, protocol generation, and packaging resolve that selection;
relative environment selections are anchored at the Ultra repository root.
Build and test entry points reject disagreement between configured links,
installed Node resolution, and TypeScript inputs before loading Harness modules.
Preparation preserves the selected checkout and application data directories.

## Read-only migration audit and phase delivery

The operator CLI `pnpm migration:audit` consumes an existing Session root and
either JSON storage or SQLite, without opening a writable business domain.
It validates physical formats before readers can skip unknown data, replays
real Session read handles through the locked Team projection, and correlates
Profile revisions, Bindings, fixed routes, descriptors, native identities and
capability requirements. The Host and audit share pure Revision normalization,
v0 projection and immutable-reference validation. The audit never persists the
in-memory result. JSON and SQLite v0/pending-v1 retries accept equal projected
records and refuse divergence. Invalid checkpoints are reported for cold
rebuilding, leaving original bytes intact.

SQLite is read through a private database/WAL copy so even SHM creation stays
outside the source. Source digests include sidecars and are checked again before
success; active rollback journals require explicit recovery. Unknown, future
or conflicting business data returns a bounded `AUDIT_*` refusal, never an empty
catalog. Reports exclude message bodies, prompts and native transcripts.

[ADR 0016](../adr/0016-audit-and-plan-format-aware-migration.md) specifies Phase C
Session 2, Team payload 3 and projection 4, formal generated vocabulary for
native operations/send requests/replies, deterministic source-preserving
migration, a closed pending target and completion committed last. Audit success
does not execute or qualify that target. Ultra v1 remains unless an incompatible
record change requires another generation. Phase A retains the locked fork and
its eight-archive behavior; Phase B adds collaboration before Phase C qualifies
an actual integration commit based on the fixed official comparison.

## Authority and state

- The Client sends a Session id through the generated Typert contract. The Host
  treats it only as an Agent lookup key, resolves the exact current live
  `Agent`, and derives Team membership from that object; Client-supplied role or
  Team claims are never used.
- Only an exact live Agent Team Lead may view or mutate the shared profile
  catalog, launch a Digital Employee, or invoke an exported headless mutation.
- Profile Heads, immutable Profile Revisions, and Team/member Bindings are
  authoritative records in the `agent_team_ultra_v1` DSH storage generation.
  UI state is only a draft or mirror.
- The Host composes the replaceable Runtime Backend catalog from the live DSH
  model registry and Fiber-owned durable external-provider registrations.
  Stable routing ids are authoritative; labels and Client catalog copies are
  presentation only.
- A save uses `expectedHeadRevision`; activation, rollback, archive, and restore
  use the same Profile Head CAS discipline. Stale writes return the current
  Head with `profile-conflict` and never overwrite another edit.
- Saving normalized content creates an immutable candidate Revision only when
  its canonical SHA-256 content fingerprint changed. It does not implicitly
  activate the candidate. An unchanged save is a no-op.
- Activation promotes only the latest candidate; rollback repoints the Head to
  an existing older Revision. Launch resolves only `activeRevision`, and an
  inactive or archived Profile cannot launch.
- Archive retains the Head, all Revision history, and existing Bindings. Restore
  is explicit and CAS-guarded; hard delete is not part of the contract.
- Launch resolves the active Revision's selected exact route, then persists a
  pending Binding before Agent Team provisioning. That reservation contains
  the Team-scoped Launch Request ID, normalized request and assignment
  fingerprints, active Revision/Profile snapshot, selected Runtime Target,
  distinct Preflight Runtime Target, Required Capabilities, catalog generation,
  and member name. Resolved Runtime Target remains absent until either a child
  continuation descriptor proves the actual DSH route or an external provider
  durably accepts initial work and returns its stable Native Runtime Handle.
  The active external Binding records that handle atomically with its resolved
  provider identity. The existing Agent Team Lead Session log remains
  authoritative for roster, mailbox, and task facts.
- The Client mints one canonical UUID for a Launch Intent and reuses it across
  transport failures or a durable `pending` result. Within one Team, identical
  replay returns or resumes the existing Binding; changing normalized Profile
  or assignment input returns `launch-request-conflict`. The assignment text
  is used for initial work but only its canonical hash is persisted.
- Each employee binds to an exact Revision, selected Runtime Target, resolved
  child or external Runtime Target, optional Native Runtime Handle, Required
  Capabilities, and immutable profile snapshot.
  Editing a profile or changing the Lead/default route affects future launches,
  not already-created teammates or cold resumes.

## Storage generation and migration

- The v1 generation has an explicit application-format marker and six
  per-record tables: `profile_heads`, `profile_revisions`, `bindings`,
  `run_index`, `eval_sets`, and `eval_runs`.
- The Host opens v1 first. A complete marker bypasses v0 entirely; a pending
  marker opens `agent_team_ultra` version 0 only as a read-only migration
  source. Mutation admission remains closed until migration completes.
- Migration writes each deterministic immutable Profile Revision before its
  Profile Head, preserves legacy revision and timestamps, and starts known
  history at that legacy revision. Orphan Revisions are not published by a
  Head and are safe to encounter on retry.
- A migrated Binding preserves its profile snapshot, Provisioning Phase, member identity,
  and revision. It receives an exact DSH model target only when the live child
  descriptor, lineage, and Team roster prove that route; otherwise it retains
  the explicit `legacy-inherit-lead` compatibility target.
- Existing identical records make retry idempotent. Divergent partial data,
  malformed v0 records, unknown markers, and newer marker versions fail
  closed. The completion marker is the final write and v0 is never modified.
- Transitional v1 Revisions created before fingerprints existed are upgraded
  deterministically before mutation admission. A present non-canonical
  fingerprint fails closed instead of being rewritten.
- Transitional `provider` fields are migrated to `continuationProvider`.
  Required Capabilities are derived from Profile content, added to Revisions
  and Bindings, and included in the canonical fingerprint. Conflicting stored
  capability claims fail closed.
- After v1 accepts new mutations, downgrading to a binary that writes v0 is
  unsupported because it would create two divergent authoritative histories.

## Capability semantics

- A `dsh-model` Runtime Target pins the exact DSH provider/model and optional
  supported reasoning effort. An `external-agent` target pins one durable
  provider identity. `legacy-inherit-lead` is migration-only and cannot be
  selected or activated.
- `continuationProvider` independently selects the DSH continuable-child
  mechanism. Its `inheritsParentContext` contract must match `contextMode`
  (`fresh` or `fork`); it never supplies a fallback model route.
- Required Capabilities canonically record the selected context mode plus the
  persona, mission, enabled context/memory, non-inherit tool policy, and enabled
  Hook behavior the Runtime Backend must enforce.
- A new or changed selection can save only a live, available, compatible
  backend. An edit may retain its latest temporarily unavailable target and
  continuation provider so historical configuration is not destroyed.
  Activation, launch, and evaluation still revalidate it. Missing or malformed
  routes and capability mismatches return stable runtime errors without
  substituting the Lead route.
- The Codex provider qualifies only the pinned package-local `@openai/codex`
  `0.149.1` native payload. It never searches `PATH`; a missing, mismatched, or
  unqualified payload leaves the route unavailable without another backend.
- Codex owns one non-ephemeral app-server thread per accepted teammate, keeps
  its opaque native identity stable across turns and cold resume, and
  idempotently repairs a crashed process around that same thread. It advertises
  only capabilities it enforces: Profile prompt sections, read-only or
  workspace-write sandboxing, bounded scrubbed evidence, and usage accounting.
  The shipped profile selects read-only sandboxing, approval `never`, and
  disabled network access.
- The Claude Code provider qualifies only the pinned package-local Claude
  Agent SDK `0.3.241` and Claude Code `2.1.241` native payload. It never
  searches `PATH`; a missing, mismatched, or unqualified payload leaves the
  route unavailable without another backend.
- Claude Code owns one deterministic native Session per accepted teammate,
  verifies the hashed launch identity against the native transcript before
  resume, serializes mailbox delivery, and de-duplicates turns by their hashed
  message identity. It accepts only fresh context, inherited Profile tool
  policy with no Hooks, fixed `Read`/`Glob`/`Grep` tools, read-only sandboxing,
  bounded scrubbed evidence, and usage occurrence.
- A durable external provider registers one complete typed contract with Agent
  Team and Ultra. Its detached catalog metadata includes enforceable context,
  Profile, and operational Runtime Capabilities. Provider objects, credentials,
  endpoints, environment values, and native payloads never enter storage,
  Typert, Remote, or Studio views.
- External create routes by the selected provider plus launch/member identity
  and returns the durable native handle. Resume and later runtime delivery,
  interrupt, evidence, and disposal route through that exact opaque handle.
  Isolated evaluation creation uses its own evaluation id and returns a distinct
  evaluation handle for exact disposal. The provider-native session is
  canonical; Launch Request ID, Team member id, and Binding identity are
  correlations only.
- Agent Team validates every requested context, Profile, approval, sandbox,
  evaluation, evidence, and usage capability before provider work. A mismatch
  fails closed without a DSH or one-shot fallback.
- A tool policy filters capabilities inherited from the parent preset. Team
  tools installed in a production teammate's own scope remain available.
  Evaluation Workers instead intersect Profile policy, provider-enforceable
  inventory, and the Eval Set allowlist, and always exclude Team tools.
- Context and curated memory are bounded Profile sections. A DSH employee's
  durable child Session provides episodic conversation memory; an external
  employee's native session and history remain provider-owned.
- Hooks are safe declarative adapters for `session-start`, `before-step`,
  `before-tool`, and `after-tool`. A `before-tool` Hook may deny or request
  exact-call approval; the first enabled matcher in Profile order decides.
  Other Hook point/effect combinations remain context-only, and arbitrary
  shell/JavaScript hooks are excluded.
- DSH approval uses the stock Tool runtime, Host approval service, generated
  audit events, and Conversation UI. Only `allowed-once` authorizes that exact
  proposed call. Missing, malformed, throwing, rejected, cancelled, or
  unavailable decisions deny, and a later monotonic guard may still deny.
  Approval never changes or weakens sandbox mode or enforcement.
- An external provider may advertise `exact-call-approval` only together with
  enforceable Hooks and evidence whose immutable native call, decision, and
  audit identities correlate exactly. Otherwise save, activation, or launch
  fails with `runtime-capability-mismatch`. The pinned Codex and Claude Code
  providers do not advertise this capability.
- The reusable Host capability installer accepts an exact Lead caller, exact
  target Agent scope, and detached profile snapshot, then owns all persona,
  context, memory, tool-policy, and hook registrations as one lifecycle layer.

## Truthful Run evidence

- Exactly one Run exists for each accepted employee work turn. A DSH Run is
  keyed by the exact child Session and turn; an external Run is keyed by the
  selected provider, roster-owned Native Runtime Handle, and stable native
  turn. Provider loops, steps, tools, retries, and streaming updates remain
  evidence within that Run.
- Run IDs are deterministic over those canonical identities. Every Run Index
  row retains its Team/member identity, immutable Profile Revision and
  fingerprint, selected and actual Runtime Targets, capability generation,
  normalized terminal class, provider-reported usage, timestamps, and explicit
  evidence completeness.
- `run_index` is a bounded, repairable Studio projection, not a transcript.
  The DSH child Session and provider-native history remain canonical. Startup,
  Studio reads, and relevant Session events rebuild missing or stale rows from
  those exact correlations without accepting Client-authored identity.
- Prompt/reply content, tool arguments/results, files, environment values,
  credentials, and raw provider payloads cannot enter the Run Index or
  normalized timeline. Detail reads are lazy and bounded; pagination,
  truncation, missing terminals, absent providers, and missing correlations
  remain visibly incomplete or unavailable.
- Run terminal classes are exactly `completed`, `cancelled`, `blocked`,
  `failed`, `max-tokens`, `interrupted`, and `unknown-terminal`. Usage is shown
  only when reported by the canonical runtime and is never inferred from text
  or multiplied across cumulative provider snapshots.
- Approval timeline items contain only source-proven call, request, policy,
  and decision identities. `waiting-approval` requires a live unresolved
  same-process or provider-native correlation; a persisted unmatched ask is
  repaired as non-actionable `orphaned` evidence and is never resumed by
  inference.

## Exact isolated candidate evaluation

- An Eval Set belongs to exactly one Profile but has its own CAS Head and
  immutable Revision history. Its bounded content includes Cases, text
  fixtures, explicit tool allowlist, hard step/output-token/elapsed ceilings,
  deterministic assertions, and an `all | minimum` pass policy.
- An Eval Run is reserved before provider work and immutably records Team,
  Profile Revision/fingerprint, selected Runtime Target, capability generation,
  Eval Set Revision/fingerprint, assertion schema version, effective tool
  allowlist, and evaluation environment fingerprint. Reusing its Client-minted
  UUID with any different exact input is a conflict.
- Every Case uses a fresh Evaluation Worker. A DSH worker is a parentless,
  unpublished Agent configured by the same immutable Profile installer; an
  external worker is a distinct provider-native evaluation handle. Neither is
  a Team roster member, production Binding, or production workspace identity.
- Every worker fixes sandbox mode to `read-only` and approval policy to
  `never`. The Host preflights these guarantees, fresh isolation, evidence,
  usage, resource enforcement, and the external provider's bounded tool
  inventory; missing proof returns `eval-environment-unavailable` before work.
- Cases execute sequentially. Each result is committed only after its canonical
  source is flushed/folded and its bounded assertions and terminal are known,
  but before the exact DSH/native handle is disposed in `finally`. Output is
  transient assertion input and never becomes a sidecar transcript.
- Cancellation marks unfinished Cases and the Eval Run cancelled. Host restart
  repairs every persisted running evaluation to interrupted. Unknown errors,
  missing checkpoints, provider identity conflicts, incomplete evidence, and
  capability drift fail closed and can never produce a passed gate.
- A Profile Head may point to one required Eval Set Revision. Activation is a
  separate CAS mutation and accepts only a passed Eval Run whose complete
  identity tuple still matches the latest candidate and current environment;
  prior successes remain visible as `invalidated` after any relevant change.
- A replacement Host catalog advances beyond every capability generation
  retained in Eval Runs, Bindings, and the Run Index before opening admission.
  Restart cannot reuse a prior generation number to revive an invalidated
  Promotion Gate. Historical Eval Runs remain immutable; a new catalog lifetime
  requires fresh exact evaluation proof for activation.
- Studio can create/version Eval Sets, attach/clear the gate, start/cancel and
  inspect Eval Runs, compare their status and fingerprints, and show
  `not-required | pending | passed | invalidated` eligibility without deriving
  authority or success in the browser.

## Studio projection and stream protocol

- The unary `view` operation and generated `watch` stream use the same
  Host-owned snapshot builder after exact live Lead authorization, roster
  reconciliation, and Run repair.
- Every physical stream generation begins with exactly one complete baseline.
  Later frames are complete replacements, never partial entity patches.
- Storage-domain, Runtime Backend generation, Agent roster, Team turn, approval,
  and evaluation changes invalidate the projection. A synchronous burst keeps
  only its newest revision, so slow Clients cannot create an unbounded queue.
- The Client uses the stock Gateway generation supervisor and snapshot
  validator. An update before its opening baseline, or a duplicate baseline,
  fails the stream instead of publishing an ambiguous model.
- Carrier loss keeps the last accepted complete snapshot visible as stale.
  Terminal disconnection, opening load, complete empty data, pending work,
  conflicts, runtime availability/capability failures, business rejection, and
  transport failure remain distinct UI states.
- A streamed generation fences older in-flight unary reads. Navigation exposes
  Profiles, Runtime Backends, Revisions, Instances, Runs, and Evaluations while
  retaining the movable, eight-direction resizable, viewport-bounded shell.

## Cancellation and disposal

Caller cancellation owns launch until the upstream Agent Team or external
provider durably accepts the initial work. After acceptance, the Team runtime
owns terminal settlement of the continuable child or native handle.
Service disposal may cancel validation or unaccepted provisioning, but never
stops an unrelated child or one whose initial work is durably Team-owned.
Ultra disposal also removes every Profile Hook listener and in-process pending
approval correlation while leaving the stock approval service and unrelated
provider generations intact.
Startup, live Lead/roster events, and Runtime Backend generations reconcile
Bindings against the authoritative permanent roster without provisioning a
replacement. Provisioning Phase is durable; Runtime Availability and Runtime
Presence are derived independently from the current catalog and exact
live-Agent or provider-generation facts. Provider disappearance does not
rewrite an active Binding; return must resume its stored launch/member/handle
tuple without a replacement.
The Host listens to the synchronous `agent/created` publication edge and
matches the exact Agent against the already-persisted binding. It installs the
immutable profile through `agent.ctx` before `agent/session-start` and the
first prompt assembly; a synchronous installation failure vetoes publication.
Service disposal closes mutation admission, removes the lifecycle listeners,
closes every Studio follower, aborts evaluation workers, revokes every resident
child installation and Runtime Backend registration, waits for admitted
launches, reconciliations, Run repairs, evaluations, catalog refreshes, and
mutation commits, and only then closes its v1 storage domain.
Removing an external-provider Fiber immediately closes provider admission,
removes its catalog row, aborts native cleanup after the Agent Team grace
period, still awaits actual quiescence, and releases only that generation's
runtime/evaluation handles.
Child-scope prompt, tool, and hook registrations are also disposed when that
exact Agent scope ends.
Installations are keyed by exact Agent object identity. Agent disposal, Fiber
disposal, and service replacement each revoke a layer at most once, while a
replacement service can reconstruct one layer for every resident bound Agent.

## Configuration

- `defaultContinuationProvider`: continuation provider used when a Profile
  leaves it blank. `defaultProvider` is accepted only as a transitional Loader
  alias.
- `maxProfiles`: durable profile count limit.
- `maxProfileBytes`: UTF-8 size limit for one normalized profile snapshot.
- `maxHooks`: hook count limit per profile.
- `maxAssignmentBytes`: UTF-8 size limit for one launch-specific assignment.
- `maxRuns`: newest durable Run Index rows retained across Teams.
- `maxRunEvidenceItems`: normalized timeline/evidence items returned by one
  lazy detail read.
- `maxEvalSets`: durable Eval Set Head count limit.
- `maxEvalSetBytes`: UTF-8 size limit for one normalized Eval Set Revision.
- `maxEvalCases`: Case count limit per Eval Set.
- `maxEvalRuns`: newest terminal Eval Runs retained; in-flight runs are not
  removed by retention.
- `maxRevisionHistory`: maximum Revision summaries returned per Profile in a
  Studio baseline.
- `maxDiffEntries`: maximum structured field differences returned by a Revision
  inspection.

Every field is validated by the exported Standard Schema and again where a
direct constructor call could bypass Loader validation.

## Delivery and non-goals

Delivery is a local-only overlay bound to the audited Harness commit in
`dsh-reference.lock.json`. The upstream Agent Team packages are private, so
this workspace is not npm-publishable. `pack:local` creates the five Ultra
archives and the three pinned private Agent Team archives, then emits a local
archive installation command whose unpublished peer dependencies resolve from
the audited Harness checkout. Verification installs all eight archives,
resolves both Codex and Claude Code runtime families, boots a real DSH Web
profile, removes the eight overlay packages, and proves no Ultra, Codex, or
Claude Code Loader row or package remains.

Non-goals for the first increment: nested Teams, cross-process Team delivery,
filesystem locks/worktrees, profile hot-rebinding of existing employees,
arbitrary executable hooks, automatic task ownership, and custom Session
event vocabulary.

## External-world acceptance assertion

Through a real DSH Web profile, the Studio must show the Host catalog grouped as
DSH Models and Local Agents, save an exact compatible Runtime Target into an
immutable candidate, and refuse a newly selected unavailable target without
fallback. After explicit activation and launch, the teammate must be visible in
the Agent Team roster; Studio and the launch result distinguish the selected
route from the actual descriptor-resolved route. The child sees the configured
persona/context/memory, cannot execute a filtered inherited tool, retains Team
tools, and reconstructs the same route and Profile snapshot after cold resume,
even if the Lead route or active Profile later changes. A retried Launch Intent
must converge to that same permanent member, while Studio reports its durable
Provisioning Phase separately from current Runtime Availability and Presence.
For an external target, acceptance additionally requires the same opaque
Native Runtime Handle before the active Binding edge, two mailbox turns around
an Ultra restart, inactive/unavailable views while the provider is absent,
exact-handle resume and interrupt after it returns, no duplicate native
session, no one-shot fallback, and no provider secret in Remote or Studio. For
the Codex route, qualification must prove the exact package-local native
payload; evidence must remain bounded and scrubbed, and Fiber disposal must
remove the registration and every owned process/thread handle.

For the Claude Code route, qualification must prove the exact package-local
SDK/native product, cold resume must verify the same deterministic native
Session, and evidence must not expose prompts, payloads, credentials, native
paths, configuration, or login state.

For Run evidence, acceptance additionally requires one deterministic row per
accepted DSH or external turn, startup reconstruction after deleting the
derived index, correct selected/actual route and immutable Revision identity,
normalized terminal/usage facts, source and terminal filters, lazy bounded
detail for both source families, explicit incomplete/unavailable states, and
the absence of raw model, tool, file, environment, credential, or provider
payload content from storage and Studio.

For exact-call approval, acceptance additionally requires first-match Profile
Hook ordering, stock DSH approval and Conversation UI routing, one-call-only
authorization, independent monotonic sandbox enforcement, capability-gated
external native correlation, truthful waiting/orphan repair, and exact
Ultra-owned listener and pending-state disposal.

For a gated candidate, acceptance additionally requires a versioned Eval Set,
a fresh non-roster DSH or provider-native worker for every Case, read-only and
approval-never confinement, durable normalized evidence before exact-handle
disposal, cancellation/restart repair that never passes, visible invalidation
after identity or environment drift, and activation only after the exact
passed Eval Run while leaving activation as a separate user decision.

For final Studio delivery, acceptance additionally requires one complete
authorized baseline per carrier generation, coalesced complete replacements,
last-good stale rendering across reconnect, terminal disconnection without
discarding that snapshot, full teardown before service replacement, a
credential-free external-world workflow, packed Codex and Claude Code runtime
resolution, and a residue-free overlay uninstall.
