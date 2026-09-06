---
status: accepted
---

# Maintain an explicit official foundation and extension contract

[Spec #18, revision 1.1](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18)
and [#22](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/22) require a
complete supported runtime before migration to a newer official release. The
maintained fork is based on official commit `76fda729799fe9b3848dbe2c211d4b231032b81e`;
the newer official comparison `d347e703908d0406b7a7ef80e3a0e594d86b2215` is not its
foundation and is not a supported replacement. The reference lock records both
identities separately from the supported fork, documentation digest, extension
API qualification, durable formats, and native SDK and payload versions.

This supplements the historical [local overlay decision](../decisions/0001-local-overlay-and-sidecar-state.md):
Ultra consumes the authoritative `agentTeams` service, while explicitly
maintained Harness extensions supply contracts absent from the official
foundation. Team continues to own roles, permanent names, roster, mailbox,
tasks, and recovery. Profile, evaluation policy, Studio, and native product
adapters belong to Ultra; [#23](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/23)
and [#24](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/24) implement the
adapter package move. No second Team state machine or proxy replaces this
authority. The [patch ledger](../reference/harness-patch-ledger.md) makes the
maintenance and upstream disposition of each existing extension explicit.

Compatibility admission uses a Node-only boundary before dynamically loading
the Host implementation or the profile's child Loader entries. Build-time
attestation supplies executable digests for the installed dependency closure;
runtime admission checks each package's actual dependency resolution, including
transitive copies. Module type, main, exports, and executable bytes must match;
matching semver is insufficient. The qualification label
`agent-team-ultra.phase-a.v1` belongs to Ultra's compatibility record, rather than
claiming that Harness exports a version constant with that name. Generated
proofs and public entry wrappers are regenerated after Host, Typert, Profile,
and Client outputs in the complete `pnpm build`, so the proof includes the
shipped Ultra Host, UI, and Profile as well as their Harness dependencies.
The profile checks its private closure on import and the owning Loader tree's
source directory before each initial child load or configuration replacement.
The checked CLI uses that same installed profile directory. Dependency lookup
follows ESM package scope and ancestor `node_modules`, including real package
paths; `NODE_PATH` cannot qualify a dependency that ESM would not load.

The fixed official/fork comparison exercises public Team and persistence
interfaces with a controlled LLM: a held queued flush precedes delivery,
multiple messages retain order and sender attribution, interrupted tasks retain
their owner, and a fresh Host context reloads the same durable roster and tasks.
Waiting for a change times out without creating cold Agents; a later message
resumes the original member identity. Both builds must pass the same assertions.

The equal Team event and projection version numbers on the fork and comparison
baseline do not imply interchangeable schemas. The fork's route, external
runtime, and native receipt fields remain part of its distinct format identity.
Phase C must migrate the full Session, Team, and Ultra history and requalify the
complete build before changing the supported lock. ADRs
[0004](0004-pin-capability-aware-runtime-targets.md),
[0006](0006-use-durable-external-teammate-runtime.md), and
[0013](0013-route-durable-runtimes-through-the-catalog-owner.md) retain their route,
durable acceptance, and registration ownership guarantees.

需求 / Requirements: US-01, US-02, US-03, US-15, US-20, US-24, US-25, US-26,
US-47, US-50, US-51; D-01–D-04, D-21, D-22; T-03, T-04, T-09. Chinese Spec
text is normative; these identifiers have the same meaning in both languages.
