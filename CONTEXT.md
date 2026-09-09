# Agent Team Ultra B0

Agent Team Ultra is a local-only, official-first Profile layer for DSH teammates.
Official Harness owns Agents, Teams, Sessions, model execution, tasks, messages and conversation UI.
Ultra owns reusable employee definitions and the exact Profile Revision bound to an official teammate.

## Language

**B0 Baseline**:
The reduced DSH-only product pinned to unmodified official Harness `0.1.5-alpha.1` at `5dda764ed3aa172535a7967b06ff95d9cbfe536a`.
It is a new isolated product/data baseline, not an in-place upgrade of the maintained-fork product.
_Avoid_: Full-feature migration, latest-compatible Harness, completed Spec #18/#44

**Compatibility Identity**:
The fixed official source commit, documentation digest, package resolution and executable-byte proof used together.
_Avoid_: Matching package version alone, best-effort compatibility

**Digital Employee Profile**:
A reusable definition of identity, persona, mission, fresh/fork context mode, curated context/memory, inherited-tool policy and declarative hooks.
_Avoid_: Autonomous memory engine, external-runtime adapter

**Profile Revision**:
A complete normalized immutable Profile definition, with a canonical fingerprint and Host-owned timestamps.
_Avoid_: Mutable revision, pinned model selection

**Profile Head**:
The mutable catalog pointer with an exact CAS revision, latest and optional active Revision, and archive state.
_Avoid_: Current Profile contents, evaluation gate

**Candidate Revision**:
The latest saved Revision, which does not become active merely by saving.
_Avoid_: Automatically active version

**Active Revision**:
The existing immutable Revision explicitly selected for new launches by the Profile Head.
Changing it never updates an existing Binding.
_Avoid_: Latest draft, hot update of a running employee

**Binding**:
The durable Team/name reservation and eventual exact official member identity, with its Launch Intent,
input fingerprint and immutable Profile Revision. Canonical child evidence is required for recovery.
_Avoid_: Name-only adoption, new Session on retry

**Launch Intent**:
One Team-scoped UUID identifying a launch decision. Identical normalized Profile/assignment retries
reuse it, including after an unknown transport outcome. Conflicting input is rejected.
_Avoid_: Click, individual RPC attempt, automatic replacement

**Continuation Provider**:
The official in-process `spawn` or `fork` provider matching the Profile context mode.
The official continuation inherits its model route under official semantics.
_Avoid_: Model provider, independent Runtime Target

**Observed Route**:
Provider/model/reasoning facts read from a live child's canonical continuation descriptor.
Absence is unknown, not permission to infer an exact route from the Lead.
_Avoid_: Promised model selection, synthetic fallback

**Provisioning Phase**:
The Binding's durable `pending | active | failed` edge.
_Avoid_: Current activity, inference from model output

**Runtime Presence**:
The official roster's current `running | idle | inactive` observation.
An inactive teammate retains its identity and may be resumed by official DSH.
_Avoid_: Failed provisioning, missing Binding

**B0 Data Root**:
An explicitly initialized real directory with a matching marker, Session 3 uncompressed JSONL
and JSON `agent_team_ultra_b0` storage. The data Loader refuses legacy/unknown/mixed media before writable registration.
_Avoid_: Legacy DSH_HOME, implicit migration destination, missing directory means empty data

## Ownership and invariants

- Only the exact live official Team Lead may mutate Profile state or launch; browser identifiers grant no authority.
- Revision creation precedes Head CAS. Bindings pin immutable content; revisions/history are never hard-deleted.
- Official Team owns member lifecycle. Ultra neither creates alternate Team Sessions nor adopts ordinary same-name members.
- Profile policy contributions are child-scoped. Service disposal drains only bound official children before removing their layers.
- Studio is a replaceable point-in-time view with manual refresh and visible errors; official UI owns operational control.
- Legacy native runtimes, fixed-route catalogs, Run/Eval/Promotion Gate, custom Team watch/messages/DAG are outside B0.

## Decisions and history

[ADR 0028](docs/adr/0028-establish-official-dsh-only-baseline.md) supersedes conflicting old-product scope.
[Project contract](docs/agent/PROJECT_CONTRACT.md) defines B0 acceptance.
[Pre-B0 glossary](docs/history/pre-b0-context.md) and older ADRs describe the historical product only.
