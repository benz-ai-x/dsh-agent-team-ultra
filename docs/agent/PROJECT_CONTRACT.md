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

- `@deepseek-ai/dsh-agent-team-ultra` is the Host service, storage-domain
  owner, generated Remote contract, and exact-Agent lifecycle composer.
- `@deepseek-ai/dsh-client-ui-agent-team-ultra` is the browser-only UI adapter
  and React Studio surface.
- `@deepseek-ai/dsh-agent-team-ultra-profile` is the bundle patch that activates
  the Host and UI rows alongside the experimental Agent Team rows.
- `@deepseek-ai/dsh-experimental-agent-team-codex` is the Host-only durable
  Codex Runtime Backend, qualified against its exact package-local native
  payload and activated with a read-only sandbox.
- `@deepseek-ai/dsh-experimental-agent-team-claude-code` is the Host-only
  durable Claude Code Runtime Backend, qualified against its exact
  package-local Agent SDK/native payload and activated with a read-only
  sandbox.
- Required Host services: `agents`, `agentTeams`, `llm`, `storageDomain`,
  `subagents`, `systemPrompt`, and `tools`.

The packages remain together in one workspace, but Host, Client, and bundle
boundaries are separate because they have different runtime and delivery
contracts.

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
  tools installed in the teammate's own scope remain available.
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
revokes every resident child installation and Runtime Backend registration,
waits for admitted profile/binding commits and Run repairs, and closes its v1
storage domain.
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
- `maxRevisionHistory`: maximum Revision summaries returned per Profile in a
  Studio baseline.
- `maxDiffEntries`: maximum structured field differences returned by a Revision
  inspection.

Every field is validated by the exported Standard Schema and again where a
direct constructor call could bypass Loader validation.

## Delivery and non-goals

Delivery is a local-only overlay bound to the audited Harness commit in
`dsh-reference.lock.json`. The upstream Agent Team packages are private, so
this workspace is not npm-publishable. `pack:local` creates the three Ultra
archives and the five pinned private Agent Team archives for artifact
inspection, then emits an eight-package source-link command. The runnable DSH
profile uses those exact built source links because the pinned public DSH peer
versions are not all present in the registry.

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
