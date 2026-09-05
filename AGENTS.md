# Agent instructions

Before editing, read `docs/agent/PROJECT_CONTRACT.md`, `TODO.md`, and
`dsh-reference.lock.json`, then run `pnpm context:check:strict`.

This repository is a source-linked, local-only DSH Agent Team extension. Keep
Host state authoritative, keep Client bundles browser-safe, preserve exact
Agent authority, and prove every registration disappears on Fiber disposal.

Use the canonical `dsh-plugin-dev` skill when changing DSH contracts.

## Handoff

Follow the project handoff rules in [AGENT.md](AGENT.md). Read and update the
root [HANDOFF.md](HANDOFF.md) for session handoffs.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in this repository's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-role triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Use a single-context layout with `CONTEXT.md` at the root and ADRs under `docs/adr/`. See `docs/agents/domain.md`.
