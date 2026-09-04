---
status: accepted
---

# Route durable runtimes through the configured catalog owner

Codex and Claude Code originally registered their durable provider generations
only with Agent Team, while Studio's Local Agents catalog was owned separately
by Ultra. Agent Team intentionally exposes neither provider enumeration nor a
registration event stream, so Ultra could not truthfully reconstruct that
catalog: the providers were executable, but their Runtime Backends were absent
from Studio.

We choose the configured catalog-owner registration path (option A). Both
adapters expose the optional, provider-neutral `catalogOwnerService` setting and
share Agent Team's Host-only `mountTeammateRuntimeProvider` lifecycle module.
When the setting is absent, the existing standalone path registers directly
with Agent Team. When it is present, `ctx.inject` waits for that named service
without registering directly or falling back; the service must expose
`registerExternalRuntimeProvider(provider)` and return the disposer for that
exact provider generation. The shipped Ultra profile configures both adapters
with `digitalEmployees`, whose registration publishes the detached Runtime
Backend and forwards the same provider object to Agent Team as one owned
operation.

Each appearance of the configured owner creates one registration generation.
Owner disappearance or replacement disposes that generation before a later
owner receives a new one. Adapter Fiber disposal first disposes the catalog and
Agent Team registration, then closes the provider's native resources. Cordis
owns at-most-once effect cleanup; synchronous and asynchronous cleanup failures
are preserved, and simultaneous registration/provider cleanup failures are
reported together.

## Considered options

- **Configured catalog owner (selected):** keeps one Host authority responsible
  for both the executable provider registration and its browser-safe catalog
  projection, while preserving the adapters' standalone behavior.
- **Mirror adapter metadata inside Ultra or this overlay:** rejected because a
  mirror cannot prove that the native provider generation exists or is
  available. It would publish a selectable route independently from the object
  that must execute it and would duplicate lifecycle authority.
- **Proxy or inspect the Agent Team service:** rejected after code-level
  verification because the service has no supported enumeration or
  registration-event seam. Replacing or wrapping the authoritative service
  would also make correctness depend on Loader order and would not give Ultra
  ownership of already-captured registrations.

## Consequences

An absent configured owner intentionally leaves that adapter route absent from
both Agent Team and Studio until the owner appears. Deployments that omit the
setting retain direct Agent Team registration. Adapter code does not hard-code
Ultra's service name, so another deployment may provide the same structural
contract.

This decision realizes, rather than supersedes, ADR-0006: Ultra now registers
the same complete provider contract with Agent Team and its Runtime Backend
catalog. It also makes ADR-0007 and ADR-0008 literal: disposing either packaged
runtime removes its exact registration from both authorities before native
resource cleanup.
