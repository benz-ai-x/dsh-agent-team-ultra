# Agent Team Ultra

Agent Team Ultra models reusable Digital Employee definitions and their exact deployments into an authoritative DSH Agent Team.

## Language

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
The durable association between an exact Team member identity and the Profile Revision used to create or restore that member.
_Avoid_: Assignment, link

**Runtime Target**:
The exact discriminated placement pinned by a Profile Revision: either a DSH provider/model/reasoning route or a durable external-agent provider identity. `legacy-inherit-lead` is migration-only.
_Avoid_: Provider guess, inferred model, display label

**Runtime Backend**:
A detached, browser-safe catalog row describing one stable Runtime Target route, current availability, context semantics, and enforceable Profile capabilities.
_Avoid_: Adapter object, credential-bearing provider config

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
