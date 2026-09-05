# Agent Team Ultra

Agent Team Ultra models reusable Digital Employee definitions and their exact deployments into an authoritative DSH Agent Team.

## Language

**Compatibility Identity**:
The separate, exact identities of an official foundation, maintained extensions, documented contracts, durable formats, and native products qualified to operate together.
_Avoid_: Package version, latest Harness, best-effort compatibility

**Maintained Extension**:
A deliberately owned change to the official foundation whose public contract, durable-format impact, validation, and upstream disposition remain explicit.
_Avoid_: Replacement Team, hidden fork, copied product logic

**Digital Employee Profile**:
A reusable definition of one Digital Employee's identity, behavior, context, memory, hooks, and capability policy.
_Avoid_: Template, agent config

**Profile Revision**:
A complete, normalized, immutable version of a Digital Employee Profile, its Runtime Target, and its Required Capabilities, identified by a canonical content fingerprint.
_Avoid_: Profile copy, profile snapshot record

**Profile Head**:
The stable catalog identity and CAS boundary that identifies latest and optional active Profile Revisions, archive state, and optional evaluation requirement.
_Avoid_: Current profile, mutable revision

**Candidate Revision**:
The latest saved Profile Revision, which is not launchable until explicitly activated.
_Avoid_: Draft row, automatically active version

**Active Revision**:
The Profile Revision selected by a Profile Head as the only launchable definition.
_Avoid_: Current candidate, latest version

**Binding**:
The durable association between an exact Team member identity and the Launch Request ID, Profile Revision, selected Runtime Target, Preflight Runtime Target, resolved Runtime Target, optional external Native Runtime Handle, Required Capabilities, and immutable Profile snapshot used to create or restore that member.
_Avoid_: Assignment, link

**Launch Intent**:
One user decision to create a Digital Employee, identified by a Client-minted canonical Launch Request ID that is reused across transport retries until a terminal business outcome.
_Avoid_: Click, RPC attempt, retry token

**Launch Request ID**:
A canonical UUID whose uniqueness and replay semantics are scoped to one authoritative Team. It identifies a Launch Intent, not an individual transport attempt.
_Avoid_: Member ID, global idempotency key

**Provisioning Phase**:
The durable `pending | active | failed` progress of one Binding relative to Agent Team provisioning and roster reconciliation.
_Avoid_: Runtime status, availability

**Runtime Availability**:
The current derived ability of the selected Runtime Backend to honor a Binding's immutable target and Required Capabilities. It is not persisted as provisioning progress.
_Avoid_: Provisioning Phase, online member

**Runtime Presence**:
The current derived `running | idle | inactive` residency of a provisioned member in the exact live Agent registry or its exact external provider generation.
_Avoid_: Provisioning Phase, backend availability

**Runtime Target**:
The exact discriminated placement pinned by a Profile Revision: either a DSH provider/model/reasoning route or a durable external-agent provider identity. `legacy-inherit-lead` is migration-only.
_Avoid_: Provider guess, inferred model, display label

**Resolved Runtime Target**:
The actual DSH provider/model/reasoning route proven by a child descriptor, or the external provider identity proven together with its Native Runtime Handle. It must preserve every explicit field of the selected Runtime Target and is recorded separately in the Binding and Studio.
_Avoid_: Lead route, adapter fallback, display selection

**Preflight Runtime Target**:
The exact executable route resolved and verified immediately before a pending Binding is committed. It is stored separately from the descriptor-proven Resolved Runtime Target.
_Avoid_: Actual route, child route

**Runtime Backend**:
A detached, browser-safe catalog row describing one stable Runtime Target route, current availability, context semantics, enforceable Profile capabilities, and enforceable operational Runtime Capabilities.
_Avoid_: Adapter object, credential-bearing provider config

**Runtime Backend Catalog Owner**:
The Host authority that publishes one durable external provider generation into both the executable Agent Team registry and its detached Studio Runtime Backend catalog.
_Avoid_: Metadata mirror, registry proxy, Client catalog

**Durable External Runtime Provider**:
A Fiber-scoped Host implementation of the Agent Team teammate-runtime contract that owns provider-native sessions, turns, evidence, evaluation handles, and exact resource disposal.
_Avoid_: One-shot subagent, catalog metadata object

**Codex Runtime Backend**:
The Ultra-owned `@benz-ai-x/dsh-agent-team-codex` durable external provider backed only by the audited package-local `@openai/codex` native payload, with one stable app-server thread per accepted teammate and no `PATH` fallback. Its package name is separate from its stable `codex` provider route and Native Runtime Handle.
_Avoid_: Codex CLI invocation, one-shot Codex task

**Claude Code Runtime Backend**:
The durable external provider backed only by the audited package-local Claude Agent SDK/native payload, with one deterministic native Session per teammate and exact transcript-verified resume.
_Avoid_: Claude Code CLI invocation, one-shot Claude subagent

**Native Runtime Handle**:
The stable opaque provider-native identity returned after initial work is durably accepted and retained before an external Binding becomes active.
_Avoid_: Member ID, Launch Request ID, provider process object

**Run**:
The deterministic, runtime-neutral record of exactly one accepted Digital Employee work turn, owned by either an exact Team member or an isolated evaluation worker and correlated to its immutable Profile Revision and canonical evidence source.
_Avoid_: Agent session, provider loop, tool step

**Run Index**:
A bounded, repairable Studio projection containing only Run identity, discriminated Team-member or evaluation-worker ownership, immutable Profile and route identity, normalized terminal/usage facts, timestamps, and evidence completeness. It is not a transcript or the canonical evidence store.
_Avoid_: Run log, copied conversation, telemetry warehouse

**Studio Snapshot**:
One complete, browser-safe Host projection of Profiles, Runtime Backends, Instances, Runs, Eval Sets, Eval Runs, and Lead-visible tools. It is atomically replaced rather than patched by Client-authored entity deltas.
_Avoid_: Client store, partial update, authoritative UI state

**Studio Stream Generation**:
One physical Remote carrier lifetime that must open with exactly one complete Studio Snapshot before any replacement. Reconnect starts a new generation while the last accepted snapshot remains visible as stale.
_Avoid_: Domain revision, reconnect attempt counter, incremental event log

**Studio Invalidation**:
A bounded wake-up caused by domain, runtime, roster, turn, approval, or evaluation change. Bursts coalesce to the newest revision and trigger on-demand construction of one complete replacement.
_Avoid_: Payload queue, entity delta, streamed token chunk

**Eval Set**:
A Profile-owned definition of isolated behavior Cases, allowed tools, resource ceilings, assertions, and the rule by which those Cases pass.
_Avoid_: Test prompt, benchmark file, CI suite

**Eval Set Revision**:
A complete immutable version of an Eval Set, identified independently from Profile Revisions by its own canonical fingerprint and history.
_Avoid_: Profile Revision, mutable test configuration

**Eval Run**:
The durable result of applying one exact Eval Set Revision to one exact Candidate Revision under one captured runtime capability generation and evaluation environment.
_Avoid_: Run, test session, latest evaluation

**Evaluation Worker**:
A fresh isolated runtime that executes exactly one Eval Case without becoming a Team member or production Digital Employee.
_Avoid_: Temporary teammate, hidden roster member

**Promotion Gate**:
A Profile Head requirement that permits activation only when a passed Eval Run still matches the exact Candidate Revision, required Eval Set Revision, runtime capability generation, assertion schema, and evaluation environment.
_Avoid_: Approval, latest pass, mutable release flag

**Canonical Evidence Source**:
The authoritative history from which Run detail is folded on demand: the exact DSH child Session turn or the exact provider-native runtime and turn.
_Avoid_: Run Index, Studio timeline, debug log

**Evidence Completeness**:
The explicit `complete | incomplete | unavailable` state of a Run's bounded evidence, including its default redaction classes and a safe diagnostic when evidence cannot be proven complete.
_Avoid_: Success status, runtime availability

**Runtime Capability**:
An operational guarantee a provider can enforce, such as exact-call approval, sandboxing, evaluation isolation, evidence, or usage accounting.
_Avoid_: Advertised feature hint, secret provider configuration

**Exact-call Approval**:
A human decision scoped to one immutable proposed tool call; only a one-shot grant authorizes that call and it never changes sandbox policy.
_Avoid_: Session permission, standing approval, sandbox escalation

**Pending Approval Correlation**:
The live identity link between an unresolved Exact-call Approval and its proposed call; it is the sole basis for presenting the approval as waiting.
_Avoid_: Unmatched ask, resumable approval

**Orphaned Approval Evidence**:
A source-proven approval request with no matching decision and no live Pending Approval Correlation, retained only as non-actionable history.
_Avoid_: Pending approval, waiting approval

**Continuation Provider**:
The DSH continuable-child mechanism that implements `fresh` or `fork` conversation construction for a DSH model target; it is not the model Runtime Target.
_Avoid_: Runtime provider, model provider

**Required Capabilities**:
The normalized context-mode and Profile-policy behavior that a Runtime Backend must enforce for one immutable Profile Revision.
_Avoid_: Best-effort feature list, UI hints

**Storage Generation**:
An independently named durable data format that can coexist with earlier formats without modifying them.
_Avoid_: In-place schema upgrade

**Migration Marker**:
The authoritative state indicating whether a Storage Generation is still being populated or is complete and safe to mutate.
_Avoid_: Migration flag, best-effort status
