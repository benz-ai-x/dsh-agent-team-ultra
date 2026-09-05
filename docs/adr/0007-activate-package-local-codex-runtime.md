---
status: accepted
---

# Activate the package-local durable Codex runtime

The shipped profile activates
`@benz-ai-x/dsh-agent-team-codex` immediately after the
authoritative Agent Team row. The provider may register only when the pinned
`@openai/codex` `0.149.1` package-local native payload passes qualification. It
must not search `PATH`, substitute another Codex installation, or fall back to
a DSH model or one-shot subagent.

Each accepted teammate owns one non-ephemeral Codex app-server thread. The
opaque thread identity is the durable Native Runtime Handle; Launch Request,
Team, and member identities remain correlations. Replayed launches and
mailbox deliveries converge on the same native operation, later turns reuse
the thread, and cold resume or process-crash repair reattaches to that exact
thread instead of creating a replacement identity.

The profile selects `read-only` sandboxing. The adapter also fixes approval to
`never` and disables network access, validates the effective native policy,
and advertises only the Profile, sandbox, bounded evidence, and usage
capabilities that it enforces. Evidence and external errors are bounded and
scrubbed before leaving the provider boundary.

## Consequences

The Codex package is one of the four Ultra-owned packages in the
eight-archive local delivery closure. Missing or mismatched native payloads
leave its stable catalog route unavailable without fallback. Exact interrupt,
crash repair, teammate removal, evaluation cleanup, and Fiber disposal apply
only to the matching native handles; disposing the provider also removes its
registration from Agent Team and Ultra's Runtime Backend catalog.

## Ownership revision — 2026-09-05, Issue #23

The original decision shipped the fork-owned
`@deepseek-ai/dsh-experimental-agent-team-codex` package. Its implementation
and product qualification now live in Ultra's `packages/codex`; the maintained
source is the exact `8b4bae0b620cc89a987a3ec6dd8b0b7d9025649a` snapshot, with
its MIT license retained. No native protocol, sandbox, runtime route, project
correlation prefix, or durable format changes accompany the package move.

The same complete provider still mounts through the provider-neutral Catalog
Owner contract in [ADR 0013](0013-route-durable-runtimes-through-the-catalog-owner.md).
One owned registration controls executable Team operations and detached Studio
metadata; removing or replacing its Fiber releases both and the exact native
resources. The old package must be removed while Web is stopped before the new
archive set is installed into the same Profile and `DSH_HOME`. Profile admission
rejects a remaining old package before any child can register.

The [upgrade probe](../../scripts/verify-codex-upgrade.mjs) uses actual predecessor
and current archives, real Loader and generated Remote, and JSON/SQLite history
to verify stable Profile/member/handle identity across the transition. Only the
external native protocol is controlled; authenticated native product acceptance
remains required by [#44](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/44).
