---
status: accepted
---

# Activate the package-local durable Codex runtime

The shipped profile activates
`@deepseek-ai/dsh-experimental-agent-team-codex` immediately after the
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

The Codex package is one of the five pinned private upstream packages in the
eight-source-link local delivery closure. Missing or mismatched native payloads
leave its stable catalog route unavailable without fallback. Exact interrupt,
crash repair, teammate removal, evaluation cleanup, and Fiber disposal apply
only to the matching native handles; disposing the provider also removes its
registration from Agent Team and Ultra's Runtime Backend catalog.
