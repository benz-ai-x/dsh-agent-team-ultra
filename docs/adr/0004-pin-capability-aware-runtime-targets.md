---
status: accepted
---

# Pin capability-aware Runtime Targets

Agent Team Ultra separates runtime placement from conversation continuation. Every new Profile Revision pins one discriminated Runtime Target: `dsh-model` contains the exact provider, model, and optional supported reasoning effort; `external-agent` contains one stable durable-provider identity. The former Profile `provider` field is renamed `continuationProvider` and only describes the DSH continuable-child mechanism that implements `fresh` or `fork`. The migration-only `legacy-inherit-lead` target is never selectable.

The Host owns a replaceable Runtime Backend catalog composed from the live DSH model registry and effect-owned durable external-provider registrations. Catalog rows use stable routing ids and expose only detached allowlisted presentation, availability, context-mode, Profile-capability, and reasoning metadata. Display labels never route work, and adapter objects, credentials, endpoints, paths, environment values, or login state never cross the Remote boundary.

## Consequences

Required context and Profile capabilities are derived canonically and join the selected target in Revision fingerprints, history, diffs, and Binding snapshots. Save validates a live selectable route and its capabilities; activation, launch, and future evaluation revalidate against the current catalog. Missing historical routes remain visible as unavailable, while missing, malformed, unsupported, and one-shot-only routes fail with stable runtime errors instead of inheriting the Lead route. External registrations support atomic metadata replacement and disappear with their owning Fiber; catalog generations publish only complete topology snapshots.
