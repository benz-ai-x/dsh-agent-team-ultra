---
status: accepted
---

# Stream complete Studio snapshots

The Host exposes the same authoritative Studio view builder through a unary
read and a generated Remote stream. Every physical stream generation opens
with one complete baseline. Domain, runtime-catalog, roster, turn, and
evaluation invalidations are coalesced by revision and rebuild a complete
replacement on demand; partial entity deltas and unbounded chunk queues are
not part of the protocol.

## Consequences

The Client supervises carrier generations with the stock Gateway stream
primitives, rejects updates before an opening baseline, and atomically replaces
its published view. Carrier loss preserves the last accepted snapshot as
explicitly stale; a terminal stream failure is separately disconnected. A
late unary read cannot overwrite a newer streamed generation. Closing the
Studio starts stream cancellation, while Host disposal closes stream admission
and followers before listeners, runtime registrations, admitted work, and
storage are released.
