# Agent Team Ultra project contract

## Product outcome

Agent Team Ultra adds a visual Digital Employee Studio to the DSH Web UI. A
Team Lead can create versioned employee profiles, choose a teammate name,
provider/context mode, inherited tool allow/deny policy, curated context,
long-term profile memory, and declarative lifecycle hooks, then launch that
profile as a real continuable Agent Team teammate.

The first observable scenario is: create a `code-reviewer` profile in the Web
UI, select read/search tools, add review rules and memory, launch it for the
current Team, and observe a durable Agent Team member whose prompt and tool
  surface reflect that exact active Profile Revision snapshot.

## DSH form and topology

- `@deepseek-ai/dsh-agent-team-ultra` is the Host service, storage-domain
  owner, generated Remote contract, and exact-Agent lifecycle composer.
- `@deepseek-ai/dsh-client-ui-agent-team-ultra` is the browser-only UI adapter
  and React Studio surface.
- `@deepseek-ai/dsh-agent-team-ultra-profile` is the bundle patch that activates
  the Host and UI rows alongside the experimental Agent Team rows.
- Required Host services: `agents`, `agentTeams`, `storageDomain`,
  `systemPrompt`, and `tools`.

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
- Launch persists a pending binding before Agent Team provisioning. The
  existing Agent Team Lead Session log remains authoritative for roster,
  mailbox, and task facts.
- Each employee binds to an exact Revision and immutable profile snapshot. Editing a profile
  affects future launches, not already-created teammates or cold resumes.

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
- A migrated Binding preserves its profile snapshot, phase, member identity,
  and revision. It receives an exact DSH model target only when the live child
  descriptor, lineage, and Team roster prove that route; otherwise it retains
  the explicit `legacy-inherit-lead` compatibility target.
- Existing identical records make retry idempotent. Divergent partial data,
  malformed v0 records, unknown markers, and newer marker versions fail
  closed. The completion marker is the final write and v0 is never modified.
- Transitional v1 Revisions created before fingerprints existed are upgraded
  deterministically before mutation admission. A present non-canonical
  fingerprint fails closed instead of being rewritten.
- After v1 accepts new mutations, downgrading to a binary that writes v0 is
  unsupported because it would create two divergent authoritative histories.

## Capability semantics

- `contextMode` maps to the upstream `fresh`/`fork` teammate contract.
- A tool policy filters capabilities inherited from the parent preset. Team
  tools installed in the teammate's own scope remain available.
- Context and curated memory are bounded prompt sections. The employee's
  durable Session provides episodic conversation memory.
- Hooks are safe declarative adapters for `session-start`, `before-step`,
  `before-tool`, and `after-tool`. Arbitrary shell/JavaScript hooks are not in
  the first increment.
- The reusable Host capability installer accepts an exact Lead caller, exact
  target Agent scope, and detached profile snapshot, then owns all persona,
  context, memory, tool-policy, and hook registrations as one lifecycle layer.

## Cancellation and disposal

Caller cancellation owns launch until the upstream Agent Team accepts the
initial prompt. After acceptance, the Team runtime owns the continuable child.
The Host listens to the synchronous `agent/created` publication edge and
matches the exact Agent against the already-persisted binding. It installs the
immutable profile through `agent.ctx` before `agent/session-start` and the
first prompt assembly; a synchronous installation failure vetoes publication.
Service disposal closes mutation admission, removes the lifecycle listeners,
revokes every resident child installation, waits for admitted profile/binding
commits, and closes its v1 storage domain. Child-scope prompt, tool, and hook
registrations are also disposed when that exact Agent scope ends.
Installations are keyed by exact Agent object identity. Agent disposal, Fiber
disposal, and service replacement each revoke a layer at most once, while a
replacement service can reconstruct one layer for every resident bound Agent.

## Configuration

- `defaultProvider`: provider used when a profile leaves it blank.
- `maxProfiles`: durable profile count limit.
- `maxProfileBytes`: UTF-8 size limit for one normalized profile snapshot.
- `maxHooks`: hook count limit per profile.
- `maxAssignmentBytes`: UTF-8 size limit for one launch-specific assignment.
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
archives and the three pinned private Agent Team archives for artifact
inspection, then emits a six-package source-link command. The runnable DSH
profile uses those exact built source links because the pinned public DSH peer
versions are not all present in the registry.

Non-goals for the first increment: nested Teams, cross-process Team delivery,
filesystem locks/worktrees, profile hot-rebinding of existing employees,
arbitrary executable hooks, automatic task ownership, and custom Session
event vocabulary.

## External-world acceptance assertion

Through a real DSH Web profile, saving and explicitly activating a Profile
Revision, then launching it, must create a visible teammate in the Agent Team roster; the child sees the configured
persona/context/memory, cannot execute a filtered inherited tool, retains Team
tools, and reconstructs the same profile snapshot after cold resume.
