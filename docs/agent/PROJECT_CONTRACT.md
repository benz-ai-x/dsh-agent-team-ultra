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
surface reflect that exact profile snapshot.

## DSH form and topology

- `@deepseek-ai/dsh-agent-team-ultra` is the Host service, storage-domain
  owner, generated Remote contract, and continuable-child setup contributor.
- `@deepseek-ai/dsh-client-ui-agent-team-ultra` is the browser-only UI adapter
  and React Studio surface.
- `@deepseek-ai/dsh-agent-team-ultra-profile` is the bundle patch that activates
  the Host and UI rows alongside the experimental Agent Team rows.
- Required Host services: `agents`, `agentTeams`, `storageDomain`, `subagents`,
  `systemPrompt`, and `tools`.

The packages remain together in one workspace, but Host, Client, and bundle
boundaries are separate because they have different runtime and delivery
contracts.

## Authority and state

- The Client sends a Session id through the generated Typert contract. The Host
  resolves that id to the exact current live `Agent` and derives Team membership
  from the resolved object; Client-supplied role or Team claims are never used.
- Only an Agent Team Lead may launch a Digital Employee.
- Profiles and Team/member-to-profile bindings are authoritative records in a
  versioned DSH storage domain. UI state is only a draft or mirror.
- A save/delete uses `expectedRevision`; stale writes return
  `profile-conflict` and never overwrite another edit.
- Launch persists a pending binding before Agent Team provisioning. The
  existing Agent Team Lead Session log remains authoritative for roster,
  mailbox, and task facts.
- Each employee binds to an immutable profile snapshot. Editing a profile
  affects future launches, not already-created teammates or cold resumes.

## Capability semantics

- `contextMode` maps to the upstream `fresh`/`fork` teammate contract.
- A tool policy filters capabilities inherited from the parent preset. Team
  tools installed in the teammate's own scope remain available.
- Context and curated memory are bounded prompt sections. The employee's
  durable Session provides episodic conversation memory.
- Hooks are safe declarative adapters for `session-start`, `before-step`,
  `before-tool`, and `after-tool`. Arbitrary shell/JavaScript hooks are not in
  the first increment.

## Cancellation and disposal

Caller cancellation owns launch until the upstream Agent Team accepts the
initial prompt. After acceptance, the Team runtime owns the continuable child.
Service disposal closes mutation admission, revokes the continuable setup,
waits for admitted profile/binding commits, and closes its storage domain.
Child-scope prompt, tool, and hook registrations are disposed with that child
or immediately when the setup contribution is revoked.

## Configuration

- `defaultProvider`: provider used when a profile leaves it blank.
- `maxProfiles`: durable profile count limit.
- `maxProfileBytes`: UTF-8 size limit for one normalized profile snapshot.
- `maxHooks`: hook count limit per profile.
- `maxAssignmentBytes`: UTF-8 size limit for one launch-specific assignment.

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

Through a real DSH Web profile, saving a profile and launching it must create a
visible teammate in the Agent Team roster; the child sees the configured
persona/context/memory, cannot execute a filtered inherited tool, retains Team
tools, and reconstructs the same profile snapshot after cold resume.
