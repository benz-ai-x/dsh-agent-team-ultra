---
status: accepted
---

# Isolate the v1 storage generation

Agent Team Ultra stores the new format in the independently named, per-record `agent_team_ultra_v1` domain and keeps `agent_team_ultra` version 0 as an untouched recovery source. The v1 global Migration Marker carries its application `formatVersion`; the Host opens v1 first, exposes no mutation while it is pending, copies deterministic immutable Profile Revisions before their Profile Heads and copies Bindings, closes v0, then writes the completion marker last. This application marker is deliberate because per-record backends treat an envelope-version mismatch as an absent record, which cannot safely distinguish an empty store from a future format.

## Consequences

Retries may encounter already-copied records and accept them only when they exactly equal the v0 projection; divergent, malformed, unknown, or newer data fails closed. A migrated Binding receives an exact DSH model Runtime Target only when the live child descriptor, lineage, and Team roster prove the same identity; otherwise it receives the explicit legacy compatibility target, and the first durable route choice is retained if live proof availability changes during retry. Future incompatible formats must use a new generation name rather than bump the v1 per-record envelope version. Once v1 accepts mutations, operators must not roll back to a binary that writes v0, because the two generations would diverge even though v0 remains recoverable.
