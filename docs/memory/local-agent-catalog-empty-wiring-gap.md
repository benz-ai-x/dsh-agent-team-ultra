---
status: fixed
fixedOn: 2026-09-05
decision: ../adr/0013-route-durable-runtimes-through-the-catalog-owner.md
issues:
  - 15
  - 16
  - 17
---

# Local Agent catalog empty wiring gap

The Studio Local Agents group was empty even though the package-local Codex and
Claude Code providers qualified and could register with Agent Team. The two
adapters registered only with Agent Team; Ultra's authoritative Runtime Backend
catalog accepted providers through a separate
`registerExternalRuntimeProvider()` seam, and Agent Team exposed no supported
enumeration or registration-event API from which Ultra could reconstruct them.

Status: **fixed**. [ADR-0013](../adr/0013-route-durable-runtimes-through-the-catalog-owner.md)
selects a neutral, optional `catalogOwnerService` adapter setting. The shipped
profile points both runtime adapters at `digitalEmployees`; its Fiber-owned
registration publishes the catalog row and the same executable provider
generation together. Missing owners wait without direct fallback, service
replacement re-registers only after the old generation is removed, and adapter
disposal removes registration before closing provider resources. Omitting the
setting preserves standalone direct Agent Team registration.

The repository-side metadata mirror and Agent Team proxy/introspection paths
remain rejected: the first cannot prove executable availability, and the
second has no supported enumeration/event seam and cannot recover registrations
already captured under another service generation.

Evidence is pinned by Harness commits `f9e8a4d0fc49895fc4d7601758620d1c73cec1ca`
(Codex) and `8b4bae0b620cc89a987a3ec6dd8b0b7d9025649a` (shared lifecycle plus Claude
Code), Ultra commits `f21121b91464a2cccb51bee597ea461506b4d980` and
`2ae12c2ec1797d73dac1ae990f378476d1fdfae4`, and the real-Web screenshots under
`docs/evidence/issue-15-codex-runtime-catalog.png` and
`docs/evidence/issue-16-local-agent-runtime-catalog.png`.
