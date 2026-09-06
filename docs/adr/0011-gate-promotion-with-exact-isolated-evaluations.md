---
status: accepted
---

# Gate promotion with exact isolated evaluations

Eval Sets have an independent immutable Revision history and CAS Head instead of becoming Profile fields, while every Eval Run captures the exact Profile Revision, Eval Set Revision, Runtime Target, capability generation, assertion schema, effective tools, and environment fingerprint. A Profile Head may point at one required Eval Set Revision, but activation succeeds only when a passed Eval Run still matches that complete tuple; saving or running an evaluation never activates a candidate.

## Consequences

Each Case runs in a fresh non-roster Evaluation Worker with read-only sandboxing, approval `never`, an intersected tool allowlist, hard resource ceilings, and a canonical evidence checkpoint before its exact runtime handle is disposed. Cancellation, restart, missing evidence, provider drift, capability changes, and environment changes cannot be inferred as success; they become terminal failed, interrupted, unavailable, or visibly invalidated states. DSH and durable external providers share these semantics while keeping their native sessions and handles behind the Host boundary.

The [vNext A01 implementation](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/19)
makes the Evaluation workflow own its workers and terminal settlement, sharing
the Host write queue and exact Agent capability installer with Profile release.
On replacement or cold startup the catalog advances beyond capability generations
retained by Eval Runs, Bindings, and Run Index records. A process-local counter
starting over cannot revalidate a prior pass. This deliberately requires fresh
evaluation proof in the replacement catalog lifetime while preserving the
immutable historical results and existing Active Revision. No new storage
generation or Team state is introduced.
