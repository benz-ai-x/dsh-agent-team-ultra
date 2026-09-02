---
status: accepted
---

# Pin capability-aware Runtime Targets

Agent Team Ultra separates runtime placement from conversation continuation. Every new Profile Revision pins one discriminated Runtime Target: `dsh-model` contains the exact provider, model, and optional supported reasoning effort; `external-agent` contains one stable durable-provider identity. The former Profile `provider` field is renamed `continuationProvider` and only describes the DSH continuable-child mechanism that implements `fresh` or `fork`. The migration-only `legacy-inherit-lead` target is never selectable.

The Host owns a replaceable Runtime Backend catalog composed from the live DSH model registry and effect-owned durable external-provider registrations. Catalog rows use stable routing ids and expose only detached allowlisted presentation, availability, context-mode, Profile-capability, and reasoning metadata. Display labels never route work, and adapter objects, credentials, endpoints, paths, environment values, or login state never cross the Remote boundary.

## Consequences

Required context and Profile capabilities are derived canonically and join the selected target in Revision fingerprints, history, diffs, and Binding snapshots. A new or changed save validates a live selectable route and its capabilities; an edit may retain the latest exact target and continuation provider while they are temporarily unavailable, but activation, launch, and future evaluation still revalidate against the current catalog. A dsh-model launch re-resolves the selected adapter route before durable partial work, passes normalized provider/model/reasoning options unchanged to Agent Teams, and accepts the child only when its continuation descriptor preserves every explicit route field. The Binding and Studio retain selected and descriptor-resolved targets separately, and cold resume reconstructs from the descriptor rather than the Lead or a deployment default. Missing historical routes remain visible as unavailable, while missing, malformed, mismatched, unsupported, and one-shot-only routes fail with stable runtime errors instead of fallback. External registrations support atomic metadata replacement and disappear with their owning Fiber; catalog generations publish only complete topology snapshots.
