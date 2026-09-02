# Agent Team Ultra

Agent Team Ultra models reusable Digital Employee definitions and their exact deployments into an authoritative DSH Agent Team.

## Language

**Digital Employee Profile**:
A reusable definition of one Digital Employee's identity, behavior, context, memory, hooks, and capability policy.
_Avoid_: Template, agent config

**Profile Revision**:
An immutable historical version of a Digital Employee Profile.
_Avoid_: Profile copy, profile snapshot record

**Profile Head**:
The current catalog entry that identifies the latest and active Profile Revisions for one Profile.
_Avoid_: Current profile, mutable revision

**Binding**:
The durable association between an exact Team member identity and the Profile Revision used to create or restore that member.
_Avoid_: Assignment, link

**Runtime Target**:
The provider and model route proven for a Binding, or an explicit legacy compatibility route when no exact route can be proven.
_Avoid_: Provider guess, inferred model

**Storage Generation**:
An independently named durable data format that can coexist with earlier formats without modifying them.
_Avoid_: In-place schema upgrade

**Migration Marker**:
The authoritative state indicating whether a Storage Generation is still being populated or is complete and safe to mutate.
_Avoid_: Migration flag, best-effort status
