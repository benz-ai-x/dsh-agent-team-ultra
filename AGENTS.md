# Agent instructions

Before editing, read `docs/agent/PROJECT_CONTRACT.md`, `TODO.md`, and
`dsh-reference.lock.json`, then run `pnpm context:check:strict`.

This repository is a source-linked, local-only DSH Agent Team extension. Keep
Host state authoritative, keep Client bundles browser-safe, preserve exact
Agent authority, and prove every registration disappears on Fiber disposal.

Use the canonical `dsh-plugin-dev` skill when changing DSH contracts.

## Handoff / 交接文档

- 用户要求交接或调用 `$handoff` 时，必须将交接内容写入本项目根目录的 [HANDOFF.md](HANDOFF.md)，后续交接更新同一文件。
- 本项目约定优先于 `handoff` 技能默认写入系统临时目录的规则；仅提供临时文件或对话中的摘要不算完成交接。
- 接手时先读根目录的 `HANDOFF.md`，并核实仓库、分支、提交和工作区状态。更新时保留仍然有效的上下文，替换过时状态，明确已完成、未实现、下一步及验证范围。
- 交接以中文为主，引用现有规格、Issue、ADR 和证据路径，不复制整份权威文档；记录适用技能和环境限制，不写入凭据、令牌或私人会话内容。
- [docs/HANDOFF.md](docs/HANDOFF.md) 仅保留历史运行手册与验收记录；最新会话交接统一维护在根目录 `HANDOFF.md`。

## Agent skills

### Issue tracker

Issues and PRDs are tracked in this repository's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-role triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Use a single-context layout with `CONTEXT.md` at the root and ADRs under `docs/adr/`. See `docs/agents/domain.md`.
