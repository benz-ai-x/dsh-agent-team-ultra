# HANDOFF — 2026-09-04 会话

> 本文件承载最新会话的交接；持久技术状态、固定 Harness source lock、验证证据与 Web Runbook 以 [`docs/HANDOFF.md`](docs/HANDOFF.md) 和 [`PROJECT_CONTRACT.md`](docs/agent/PROJECT_CONTRACT.md) 为准。上一版（2026-09-02 UI/alpha.4 迁移）交接见 git 历史 `c0c038f:HANDOFF.md`。

## 1. 本次会话完成了什么

1. **启动应用**：按 Runbook 用锁定源码 CLI 起 DSH Web（隔离 profile `agent-team-ultra-e2e`，端口 4317)，启动前校验 fork 分支/HEAD 与 `dsh-reference.lock.json` 一致。
2. **修复陈旧构建**：Studio"身份与运行时"缺 Runtime Backend 下拉框——根因是 `packages/*/lib` 停在 9 月 2 日构建，9 月 3 日源码三个提交未构建。重新构建 + 重启后下拉框（模型/Agent 分组目录 + 推理强度）出现并截图验收。
3. **全面重建**：物理删除三个 `lib/`（含增量缓存）后 `pnpm verify` 全绿（严格上下文 284 项、12 文件 157 测试、八包归档 + 真实 profile 组合门禁、卸载无残留）。
4. **诊断"本地 Agent"目录为空**：根因、方案对比、被证伪路径的完整取证已写入 [issue #15](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/15) 正文与项目记忆 `local-agent-catalog-empty-wiring-gap`，此处不重复。
5. **方案 A 定稿并拆票**（GitHub Issues，均带 `ready-for-agent`):
   - **#15 Codex 端到端**——无阻塞，模式建立票，TDD
   - **#16 Claude Code 端到端**——blocked by #15，同构复刻
   - **#17 文档收口**——blocked by #15/#16,ADR-0013 + 最终 verify
6. **交付链答疑**：fork 在打包时的处理（5 个 fork 包烘成 `file:` tarball + 15 个 `link:` peers;e2e profile 为 `link:` 直连开发模式，本地验证不必打包）——以 `scripts/pack-local-overlay.mjs` 为准。

## 2. 接手前必读

- **issue [#15](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/15) / [#16](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/16) / [#17](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/17)**——验收标准即规格
- 项目记忆（自动加载，勿重复分析）：`local-agent-catalog-empty-wiring-gap`（根因 + 方案 A + 被证伪路径 + cordis `ctx.inject`/`ctx.provide`/处置器语义事实）、`harness-checkout-must-stay-on-pinned-fork-branch`(fork 恢复步骤）
- [`PROJECT_CONTRACT.md`](docs/agent/PROJECT_CONTRACT.md) 与 ADR-0006/0007/0008——契约字面表述是验收依据
- [`docs/HANDOFF.md`](docs/HANDOFF.md) §8 Runbook——启动与冷恢复复验流程

## 3. 当前未决问题

1. **#15 待开发**（可立即开工）。实施要点已验证：provider 类元数据与 Ultra 契约结构兼容；默认 provider id 为 `codex`/`claude-code`；两家均不含 `evaluation` 能力（评测门不受影响）;adapter 侧处置函数加 once-guard。
2. 沿用 cosmetic:Chrome 审计 `form field should have id or name`（宿主与兄弟插件同款，未处理）。
3. `TODO.md` Later 列表原样保留。

## 4. 环境现状

- DSH Web 后台运行中：端口 4317，日志 `/tmp/dsh-web-4317.log`。访问 token 由 CLI 启动时打印在该日志（惯例：不入交接；重启取新 token)。
- 两仓库（本仓 `main`、fork `agent-team-ultra-pinned-route`）干净且与远端同步，无未提交内容。
- e2e profile `agent-team-ultra-e2e` 为 `link:` 直连开发模式：fork adapter 改完重建 `lib/` 并重启 Web 即生效，无需打包。

## 5. 会话中学到的关键事实（勿再踩坑）

- **`packages/*/lib` 不入库也不会自动重建**。改完源码必须跑构建再验收 Web，否则界面是陈旧构建——本次"缺下拉框"就是它。`pnpm verify` 是全量门禁（上下文校验 → 构建 → 测试 → 打包组合）。
- 启动/验收前先 `pnpm context:check:strict`：fork 必须停在 lock 的提交且产物新鲜。
- fork 的 5 个包 `pnpm pack` 只带 `lib/`：改完 fork 源码必须先重建再打包。
- 改 UI 测试注意：Vitest 下 CSS Modules 生成哈希类名，查询一律用 role/label/text（沿用）。
- "数字员工"入口只在已打开会话的头部横幅（沿用）。

## 6. Suggested skills

- **`dsh-plugin-dev`**——本仓任何改动的前置技能，改代码前必调。
- **`superpowers:test-driven-development`**——#15/#16 为行为改动，RED→GREEN。
- **`superpowers:verification-before-completion`**——声称通过前跑实际命令取证。
- **`superpowers:systematic-debugging`**——验收行为不符预期时先取证。
- **`run`**——启动/驱动真实 Web 验收。
- **`mattpocock-skills:writing-for-agents`**——再更新本文件或 AGENTS.md 时。
