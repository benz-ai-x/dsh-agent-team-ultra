# Agent Team Ultra 交接

交接日期：2026-09-05（Asia/Shanghai）。用户使用中文；下一会话主题由用户的新指令决定。

本文件是本项目最新交接的唯一入口，存放规则见 [AGENT.md](AGENT.md)。[docs/HANDOFF.md](docs/HANDOFF.md) 保留前一阶段运行手册与历史验收；其中的环境、进度和剩余范围不能覆盖本文件及当前权威材料。

## 当前状态与完成边界

- 主仓库：`$HOME/Dev-Space/dsh-agent-team-ultra`；远端为 [benz-ai-x/dsh-agent-team-ultra](https://github.com/benz-ai-x/dsh-agent-team-ultra)。文中的 `$HOME` 代替本地账户路径。
- 上一轮 `commit push` 已完成：`main` 与 `origin/main` 均在 [b1a762f7598f01bbcbf44ed965452d35db8712d9](https://github.com/benz-ai-x/dsh-agent-team-ultra/commit/b1a762f7598f01bbcbf44ed965452d35db8712d9)，本轮文档修改前工作区干净。该提交包含自有包迁移到 `@benz-ai-x`、官方兼容性研究与 vNext 文档入口；具体差异查看该 commit。
- 当前权威需求为 [Spec #18，修订 1.1](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18)，状态 OPEN，标签 `ready-for-agent`。中文为规范主版，正文后有完整英文对照。用户已确认的取舍和新增协作 UI 均已写入，不需要重新访谈。
- 已确认方向是“官方基础＋明确的 Ultra 扩展”：第一阶段保留完整 pinned-fork 能力，Codex／Claude Code 作为完整队友；持久 mailbox 消息中心与共享任务 DAG 的用户交互均已补入 Spec。具体边界和回放语义以 Spec 为准。
- **Spec 编写、补充和发布已完成；vNext 实现尚未开始。** 本轮按用户要求更新项目内交接及存放规则；这些后续文档更新的提交状态需通过 `git status`、`git log` 核实，不能从上一轮推送完成推断。
- 下一会话按用户的新指令推进；若开始实现，使用 Spec 的 D-22 阶段顺序及全部验收要求，不把标签或文档发布误当功能已实现。

## 先读这些权威材料

以下相对路径均以主仓库为根；本交接不复制其中的规格、领域定义或架构决策。

1. [AGENTS.md](AGENTS.md)、[AGENT.md](AGENT.md)、[PROJECT_CONTRACT.md](docs/agent/PROJECT_CONTRACT.md)、[TODO.md](TODO.md)、[dsh-reference.lock.json](dsh-reference.lock.json)：开发约束、交接规则、当前实现契约、进度和精确运行基线。
2. [CONTEXT.md](CONTEXT.md)、[领域文档约定](docs/agents/domain.md)、[ADRs](docs/adr/) 与 [历史决策](docs/decisions/)：统一领域词汇和历史决策。新 Spec 要求调整哪些 ADR 已在其 D-21、D-25 明确，实施时显式补充或修订。
3. [Spec #18](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18)：新版本范围、双语要求、用户故事、技术边界及验收的唯一需求来源。上一版 [Spec #1](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/1) 已关闭，仅供历史追踪。
4. [官方 Agent Team 兼容性研究](docs/research/2026-09-05-official-agent-team-compatibility.md)及其链接的复现脚本：已验证的官方／fork 差异、证据范围及限制，避免重新从猜测开始。
5. [Issue tracker 约定](docs/agents/issue-tracker.md)、[triage 标签约定](docs/agents/triage-labels.md)：本项目通过 `gh` CLI 管理 GitHub Issues；Specs/PRDs 属于 Issue tracker。

## 环境与验证：最容易踩错的地方

- 主目录相邻的 `../deepseek-harness` **不匹配 reference lock**。最近主目录 strict 检查的四项失败是提交、文档摘要和两个 native 包链接。不要通过放宽锁文件掩盖它，也不要擅自切换那个可能被其他工作使用的 checkout。
- 已有精确锁定环境：
  - Harness：`$HOME/Dev-Space/.agent-team-ultra-runtime/deepseek-harness`，交接时 HEAD 为 `8b4bae0b620cc89a987a3ec6dd8b0b7d9025649a`。
  - Ultra 验证副本：`$HOME/Dev-Space/.agent-team-ultra-runtime/dsh-agent-team-ultra`。
- **Ultra 验证副本不是当前 main。** 交接时仍 detached 在 `c12a3b71238d1f20a13729ef0556f61b60760515`，保留此前改名及研究记录的未提交副本。不要清理或重置它来“修复”状态；它还支持既有运行环境。验证新代码前，安全同步待验证源码或另建匹配隔离目录，并证明源码一致。
- 提交前主目录的 85 个源文件与该验证副本字节一致；之后仅调整文档，包括 README、TODO、研究报告引用及本轮交接约定。运行、构建、测试源码没有变化。
- 本轮在主目录重跑 strict 仍为上述四项失败；精确锁定副本重跑 strict 通过：290 项检查、0 警告。既有全量构建／测试／安装／卸载证据在 `$HOME/Dev-Space/.agent-team-ultra-runtime/scope-verify.log`；提交前复用了同字节源码的证据，没有声称再次完整运行。文档链接、研究脚本语法和 Git whitespace 已核对。
- 设置 `DSH_HARNESS_ROOT` 不能单独修复主目录硬编码的 pnpm links／TypeScript 相邻目录引用。统一解析是 Spec 中待实现的内容。

可在已核对源码的锁定验证副本执行：

```sh
DSH_HARNESS_ROOT="$HOME/Dev-Space/.agent-team-ultra-runtime/deepseek-harness" \
  pnpm --dir "$HOME/Dev-Space/.agent-team-ultra-runtime/dsh-agent-team-ultra" context:check:strict
```

- 固定官方对标 checkout 位于 `$HOME/Dev-Space/.agent-team-ultra-runtime/compatibility-official/deepseek-harness`。准确基线和用法见研究报告；它用于兼容性研究，不是可直接替换的完整 Ultra 运行环境。

## 已存在的本地应用

- 先前已完成应用启动和输入配置修复；隔离 Web 地址为 `http://127.0.0.1:4317/`，应用 home 为 `$HOME/.dsh-agent-team-ultra`。
- 上一轮交接的只读探测得到 HTTP 401，当时服务仍在响应；没有重新做已认证 UI 或真实模型验收。继续使用现有认证，勿为交接重置用户配置或会话。
- 先前另有一个 3080 实例，本会话未改动它。需要操作应用时先确认目标；不要按全部 Node 进程清理环境。
- 本交接不包含认证信息、凭据文件内容、用户消息内容或 native 登录状态。

## Spec 的本地编辑材料

- 未跟踪的辅助材料位于 `$HOME/Dev-Space/.agent-team-ultra-runtime/spec-vnext/`：`build_spec.py`、`spec.zh-CN.md`、`spec.en.md`、`issue-body.md`、`manifest.json`、`published-issue.json`。
- 它们是编辑／发布辅助材料，不是仓库中已提交的规格源文件。GitHub Issue 是权威副本；后续更新前先通过 `gh issue view 18` 读取并比较，避免生成器覆盖他人的更新。
- Issue 当前正文约 64,264 字符，接近 65,536 字符上限。继续扩写时先处理容量和文档组织，保留中文主版与完整英文对照，不能截断译文。
- 仓库 README 和 TODO 已有 Spec 入口；本次没有把整份双语正文复制进仓库。

## Suggested skills / 建议技能

- **dsh-plugin-dev**：`$HOME/.agents/skills/dsh-plugin-dev/SKILL.md`。修改 DSH 合约时按项目要求使用；根据任务读取 Agent Team、Service、Client、版本和打包引用。先通过匹配源码的严格门禁。
- **codebase-design**：`$HOME/.codex/skills/codebase-design/SKILL.md`。适合在实施前落实模块职责、依赖方向和真实 provider/consumer 接口。
- **to-spec**：`$HOME/.codex/skills/to-spec/SKILL.md`。用户继续调整需求时使用，更新既有 Issue #18 和双语编号；已确认内容直接继承。
- **code-review**：`$HOME/.codex/skills/code-review/SKILL.md`。实际实现完成后，针对固定提交范围检查契约和行为。
- **handoff**：`$HOME/.codex/skills/handoff/SKILL.md`。再次交接时更新项目根目录的 `HANDOFF.md`，遵循 [AGENT.md](AGENT.md) 中优先于技能默认临时存放位置的项目约定，并引用现有材料而非复制。

技能可用性以新会话的目录为准。当前 AGENTS 没有要求委派，勿仅因可用工具而自动启动子代理。
