---
status: accepted
---

# Activate the package-local durable Claude Code runtime

The shipped profile activates
`@benz-ai-x/dsh-agent-team-claude-code` after the durable Codex
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

The Claude Code package is owned, built, and packed by Ultra. The complete
local delivery closure contains five Ultra archives and three pinned private
Harness archives. Missing or mismatched SDK/native
payloads leave its stable catalog route unavailable without fallback. Exact
interrupt, teammate removal, and Fiber disposal stop only matching active
queries and process trees, await quiescence, and remove the provider
registration while leaving its native transcript available for later Host
resume.

## Ownership revision — 2026-09-05, Issue #24

The adapter moves from `@deepseek-ai/dsh-experimental-agent-team-claude-code`
to `@benz-ai-x/dsh-agent-team-claude-code`, version `0.1.0`. Its implementation,
process bridge and product qualification originate unchanged from maintained
Harness commit `8b4bae0b620cc89a987a3ec6dd8b0b7d9025649a`, with its MIT license
retained. The exact SDK `0.3.241` and native product `2.1.241` remain pinned.

The `agent-team-claude-code` Loader row, `digitalEmployees` Catalog Owner,
`external-agent/claude-code` route, deterministic Session and message markers,
Profile Revision, member and Native Runtime Handle remain stable. Upgrade
stops Web, removes only installed retired product packages, and installs the
complete archive set in the same Profile and `DSH_HOME`. It copies no history
and provisions no replacement Session. Profile admission rejects coexistence
with either retired adapter before child registration.

Actual archive verification exercises Loader, generated Remote, JSON/SQLite
cold recovery, fixed permissions, provider removal/replacement, Web boot and
complete uninstall. The SDK API uses a controlled external boundary; this does
not replace the authenticated native-product acceptance in Issue #44.
Controlled Team query, mailbox and task tools remain separate work in Issues
#29 and #30; this ownership move grants none of those capabilities.
