# HANDOFF — 2026-09-05 catalog-owner closeout

> Durable contracts live in [`PROJECT_CONTRACT.md`](docs/agent/PROJECT_CONTRACT.md),
> domain language in [`CONTEXT.md`](CONTEXT.md), and the full operating guide in
> [`docs/HANDOFF.md`](docs/HANDOFF.md).

## 1. Current outcome

Issues #15 and #16 close the Local Agent catalog wiring gap for both packaged
runtimes. Codex and Claude Code now use the configured Runtime Backend Catalog
Owner, so one Fiber-owned registration publishes the executable provider to
Agent Team and its detached Runtime Backend to Studio. The complete decision,
rejected alternatives, and lifecycle semantics are recorded in
[`ADR-0013`](docs/adr/0013-route-durable-runtimes-through-the-catalog-owner.md).
The repaired project memory is
[`local-agent-catalog-empty-wiring-gap`](docs/memory/local-agent-catalog-empty-wiring-gap.md).

Pinned delivery state:

| Repository | Commit | Purpose |
|---|---|---|
| Harness fork | `8b4bae0b620cc89a987a3ec6dd8b0b7d9025649a` | Shared catalog-owner lifecycle plus Codex and Claude Code adapters |
| Ultra | `2ae12c2ec1797d73dac1ae990f378476d1fdfae4` or later | Both profile rows configured and real-Web evidence committed |

The Harness lock and docs digest in [`dsh-reference.lock.json`](dsh-reference.lock.json)
are the machine-readable authority. Do not replace either value with a branch
name or an unverified checkout.

## 2. Verification evidence

- Strict source attestation: 290 checks, 0 warnings.
- Ultra Vitest: 12 files, 157 tests passed.
- Current-source archive set: all eight local archives install and resolve;
  the real composed Web profile starts, and uninstall removes every Ultra,
  Codex, and Claude Code Loader row and package.
- Real browser DOM: DSH Models retains three enabled routes; Local Agents
  contains enabled `external-agent/codex` and
  `external-agent/claude-code`, with no page errors.
- Screenshots:
  [`Codex`](docs/evidence/issue-15-codex-runtime-catalog.png) and
  [`Claude Code`](docs/evidence/issue-16-local-agent-runtime-catalog.png).

The browser proof must always install archives packed from the current sources.
Repository `artifacts/` may be older than an uncommitted source edit; do not use
its timestamps as proof of current behavior. `pnpm verify` itself packs into an
isolated temporary directory and is the final gate.

## 3. Environment state

- Ultra branch `main` is pushed to `origin` through commit `2ae12c2` before
  this documentation closeout.
- Harness checkout `/root/workspace/deepseek-harness` is clean at `8b4bae0b`
  on local branch `agent-team-ultra-current`; the exact commit is also pushed
  to remote branch `agent-team-ultra-pinned-route`.
- No issue-verification DSH Web process or temporary profile is intentionally
  left running. Start a fresh isolated profile for any later manual proof.
- No API key, Web token, native transcript, profile state, or temporary archive
  belongs in this repository or in a handoff document.

## 4. Runbook

Before any edit, read `AGENTS.md`, `docs/agent/PROJECT_CONTRACT.md`, `TODO.md`,
and `dsh-reference.lock.json`, then run:

```sh
pnpm context:check:strict
```

For the complete merge gate:

```sh
pnpm verify
git diff --check
```

For a new isolated local installation, first build the audited eight-archive
closure and use the printed installation command:

```sh
pnpm pack:local
```

Start that installation with the locked source CLI and an explicit isolated
DSH Home. Pick an unused port rather than stopping another user's server:

```sh
export DSH_HARNESS_ROOT=/absolute/path/to/deepseek-harness
export DSH_HOME=/absolute/path/to/isolated-dsh-home

node "$DSH_HARNESS_ROOT/apps/cli/lib/bin.js" --profile web --dump-config
node "$DSH_HARNESS_ROOT/apps/cli/lib/bin.js" web --no-open --port 4317
```

The final dump must configure `catalogOwnerService: digitalEmployees` on both
`agent-team-codex` and `agent-team-claude-code`. In a real Lead session, the
Digital Employee Studio Runtime Backend selector must group three DSH Models
and both enabled Local Agents. An absent configured owner must leave that local
route absent; it must never fall back to direct registration.

After modifying any Harness adapter source, rebuild its `lib/` before strict
attestation or packing. After modifying a Profile patch, regenerate archives
before manual browser verification.

## 5. Remaining scope

Only the three items under `TODO.md` → Later remain: optional managed
worktrees after an enforceable DSH ownership seam, profile import/export and
secret references, and publishability re-evaluation after the experimental
Agent Team packages are released. The cosmetic browser audit about form fields
without `id` or `name` remains inherited from the surrounding UI and was not
part of Issues #15–#17.
