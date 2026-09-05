# Repository Guidelines

## Shared Agent Setup

Codex/Claude Code share this guide. Keep `CLAUDE.md → AGENTS.md` as a relative symlink; edit only `AGENTS.md`. Inspect Git state; preserve others' changes.

## Project Structure

- `packages/domain/src/`: Host services, persistence, authority, and Remote contracts.
- `packages/ui/src/client/`: React Studio, CSS Modules, and bilingual locales.
- `packages/profile/`: local bundle and `cordis.patch.yml`.
- `packages/*/tests/`: product tests; `scripts/`: source preparation, generation, verification, and CLI tests; `docs/evidence/`: screenshots.
- Vocabulary: [CONTEXT.md](CONTEXT.md); ADRs: `docs/adr/`; historical decisions: `docs/decisions/`. Follow [domain conventions](docs/agents/domain.md).

## Environment and Commands

Before editing, read [PROJECT_CONTRACT.md](docs/agent/PROJECT_CONTRACT.md), [TODO.md](TODO.md), and [dsh-reference.lock.json](dsh-reference.lock.json), then run `pnpm context:check:strict`.

Use Node `^22.19.0 || >=24.0.0`, pnpm `11.7.0`, and locked, built Harness sources. For a fresh checkout or changed source selection, run `DSH_HARNESS_ROOT=/absolute/locked/source pnpm prepare:harness`, then `pnpm install`; the prepared `.dsh/harness` link supplies every source consumer. Relative selections resolve from this repository root. See [source preparation](README.md#开发与验证); report mismatches without weakening the lock or resetting shared checkouts.

| Command | Purpose |
| --- | --- |
| `pnpm prepare:harness` | Attest and prepare the selected Harness source before dependency installation. |
| `pnpm install` | Install workspace dependencies. |
| `pnpm build` | Build Host/Client and generate Typert artifacts. |
| `pnpm test` / `pnpm test:watch` | Run/watch Vitest. |
| `pnpm verify` | Strict check, build, tests, packed install/boot/uninstall. |
| `pnpm pack:local` | Generate eight archives and installation commands. |

After archive installation, use the locked CLI's `web --no-open --port 4317` with isolated `DSH_HOME`; choose an unused port. See [local setup](README.md#安装到本地-dsh-web).

## Style and Architecture

Use TypeScript ESM, two-space indentation, single quotes, and no semicolons. Use PascalCase components/types, camelCase functions/variables, and kebab-case module filenames. No lint/formatter script exists.

Host state is authoritative; resolve exact live Agent authority, keep Client bundles browser-safe, and prove every registration disappears on Fiber disposal. Use canonical `dsh-plugin-dev` for DSH contract changes. Regenerate Typert; never hand-edit generated artifacts. Ultra uses `@benz-ai-x`; pinned Harness dependencies retain `@deepseek-ai`. Delivery remains local-only.

## Testing Guidelines

Name tests `*.spec.ts`/`*.spec.tsx`; Client tests declare jsdom and use React Testing Library. No coverage threshold is configured. Cover changed permissions, persistence, recovery, cancellation, and disposal boundaries. Run `pnpm verify` before merging runtime changes; validate documentation links and `git diff --check` for documentation-only edits.

## Commits and Pull Requests

Follow history: imperative `fix:`, `docs:`, or `chore:` subjects. PRs describe behavior, link Issues, report validation limits, and include relevant UI screenshots. Manage Issues/PRDs with `gh`; follow [tracker](docs/agents/issue-tracker.md) and [five-role triage](docs/agents/triage-labels.md) conventions.

## Handoff

Read/update root [HANDOFF.md](HANDOFF.md) in Chinese: completed/planned work, next steps, environment, verification, and skills. This overrides the handoff skill's temporary-directory default. Preserve valid context, replace stale status, reference authoritative specs/Issues/ADRs, and exclude credentials, tokens, and private conversations. [docs/HANDOFF.md](docs/HANDOFF.md) remains historical.
