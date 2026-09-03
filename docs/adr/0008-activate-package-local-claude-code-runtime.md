---
status: accepted
---

# Activate the package-local durable Claude Code runtime

The shipped profile activates
`@deepseek-ai/dsh-experimental-agent-team-claude-code` after the durable Codex
row. The provider may register only when the package-pinned Claude Agent SDK
`0.3.241`, its Claude Code `2.1.241` manifest, and the matching package-local
native payload pass qualification. It must not search `PATH`, substitute
another Claude installation, or fall back to a DSH model or one-shot subagent.

Each accepted teammate owns one deterministic native Session id derived from
the provider, Launch Request, and reserved member identities. Replayed launches
converge on that Session. Cold resume verifies a hashed launch marker in the
native transcript before attaching, and each mailbox delivery is serialized
and de-duplicated by its hashed durable message identity.

The profile selects fixed `read-only` sandboxing. The adapter accepts fresh
context, Profile prompt sections, and inherited tool policy without Hooks; its
native tool surface is fixed to `Read`, `Glob`, and `Grep`. Settings, skills,
plugins, ambient MCP servers, interactive permission, writes, unsandboxed
commands, and network access are disabled. Only bounded normalized evidence
and usage occurrence may cross the provider seam.

## Consequences

The Claude Code package is a fifth pinned private upstream package and part of
the eight-source-link local delivery closure. Missing or mismatched SDK/native
payloads leave its stable catalog route unavailable without fallback. Exact
interrupt, teammate removal, and Fiber disposal stop only matching active
queries and process trees, await quiescence, and remove the provider
registration while leaving its native transcript available for later Host
resume.
