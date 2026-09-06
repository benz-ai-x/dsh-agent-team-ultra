# Agent Team Ultra 交接

交接日期：2026-09-05（Asia/Shanghai）。用户使用中文。

本文件是最新交接的唯一入口，存放规则见 [AGENTS.md](AGENTS.md)。
[docs/HANDOFF.md](docs/HANDOFF.md) 保留历史运行手册；其中的路径、运行实例和剩余范围不能覆盖当前仓库状态及权威需求。

## 当前任务与完成边界

- 用户要求从 [#19](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/19) 开始逐项实现全部 open issue：新分支、TDD、创建 PR、提交 PR 后使用 code-review，最后通知用户人工审核。每项完成及遇到开发阻塞时使用飞书 CLI 通知用户；已有明确通知授权。
- 权威需求为 [Spec #18，修订 1.1](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18)，中文为规范主版。已读取父 Spec 和 #19–#44 的任务、依赖与验收内容；全部实现和最终验收完成前保持父 Spec open。
- 当前在 `fix/19-host-profile-evaluation`，起点为 `c3c96c926f1ba05b04e7ca82a6d531a0570e0a84`，开始开发前工作区干净。远端为 [benz-ai-x/dsh-agent-team-ultra](https://github.com/benz-ai-x/dsh-agent-team-ultra)。实时提交及推送状态以 `git status`、`git log` 为准。
- **#19 的实现与完整验证已完成，PR 创建及提交后的 code-review 尚未完成，不能报告 issue 已完成。** 当前容器 `gh auth status` 明确未登录；Git SSH 只读连接成功。已经通过飞书发送认证阻塞通知，用户也已获知需要在当前环境运行 `gh auth login`，无需发送凭据。
- #20–#44 尚未实现。下一项 [#20](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/20) 复用 #19 的 Host 上下文，拆分启动／恢复、Run 修复及 Snapshot 投影。后续按 issue 依赖推进；阶段 C 的 Harness 集成、锁定和真实 native 验收不能由本次模拟 LLM 测试替代。

## #19 已实现内容

- `packages/domain/src/index.ts` 保留公开 Host／生成 Remote 入口与组合根；Profile 发布、隔离评测、能力安装分别归入 `profile-lifecycle.ts`、`evaluation-workflow.ts`、`profile-capabilities.ts`。
- `host-context.ts` 统一精确 live Lead 校验、公共写入准入、串行 mutation、runtime catalog、生命周期信号和 storage handle；关闭公共准入后，内部已接纳结算仍能落盘。
- 配置、不可变 Profile 快照及错误构造分离为内部辅助模块；公开结果、Remote 名称、持久化 generation 和权威 `agentTeams` 服务保持既有契约。Typert 已通过正式 build 重新生成。
- TDD 复现并修复：Lead 在 runtime preflight 或写队列等待期间退出后，保存、激活、归档及评测仍可能提交的问题。现在在实际执行业务决策以及异步预检后重新校验精确 live authority。
- TDD 复现并修复：Host 替换使进程内 capability generation 从头计数，历史失效 Promotion Gate 因编号复用而重新变成 passed。新 catalog 在开放准入前推进到所有持久 Eval Run、Binding、Run Index generation 之后；历史结果和已有 Active Revision 保留，新 catalog 生命周期的后续激活需要新评测证明。
- 更新了 [项目契约](docs/agent/PROJECT_CONTRACT.md)、[ADR 0003](docs/adr/0003-separate-profile-authoring-from-release.md) 和 [ADR 0011](docs/adr/0011-gate-promotion-with-exact-isolated-evaluations.md)，记录共享业务入口、权限检查时机及评测有效期规则。

## 验证证据与限制

- 初始 `pnpm context:check:strict`：290 项检查通过、0 警告。
- 改动前完整 `pnpm verify`：157 项测试通过，并通过 8 个归档的真实安装、Web 启动与卸载。日志：`/tmp/ultra-19-baseline-verify.log`。
- 改动后完整 `pnpm verify`：**164 项测试通过（13 个测试文件）**，严格检查、Host／Client 构建、Typert 生成、8 个归档安装、固定 CLI Web 启动及卸载全部通过，进程退出码 0。日志：`/tmp/ultra-19-final-verify.log`。
- 新增 [Profile 工作流集成测试](packages/domain/tests/profile-workflow.integration.spec.ts) 的 7 个案例经真实生成 Remote、Host、Agent／Team 和 JSON／SQLite storage，覆盖 Revision 不可变、独立 CAS、显式激活、archive／restore／rollback、精确门禁与历史保留、权限失效及 Fiber 卸载时评测结算。
- 这些测试仅在 LLM 外部边界使用可控 adapter，隔离 Worker 仍使用真实 Host 生命周期与工具／sandbox／approval 策略。未进行用户授权 native 登录后的真实产品会话验收；该要求仍属于后续 issue，尤其 [#44](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/44)。
- 关键 RED 日志位于 `/tmp/ultra-19-{red,queue-red,gate-red,eval-red,activation-red}.log`。`/tmp` 为本容器辅助证据，不是仓库中持久规范；复核以提交内容和可重跑测试为准。

## 当前环境

- 仓库：`/root/workspace/dsh-agent-team-ultra`；Node `v22.22.1`，pnpm `11.7.0`。
- 相邻 `/root/workspace/deepseek-harness` 已匹配 [dsh-reference.lock.json](dsh-reference.lock.json)，HEAD 为 `8b4bae0b620cc89a987a3ec6dd8b0b7d9025649a`，版本 `0.1.2-rc.1`，所需构建产物齐全。当前不需要旧交接中的 macOS 隔离验证副本，也没有重置其他 checkout。
- pnpm／TypeScript 仍依赖相邻 Harness 路径；仅设置 `DSH_HARNESS_ROOT` 不能重定向全部解析。统一来源处理属于 [#21](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/21) 及后续工作。
- 飞书 CLI 已安装并验证当前 user／bot 身份可用，已成功发送一次阻塞通知。不要在本文件记录凭据、用户标识或私人消息。
- GitHub CLI 尚未认证。认证后先刷新 issue／评论状态，再使用 `gh` 创建 PR；无需重复询问已经授权的提交、推送、PR 和飞书通知操作。
- 历史交接提到的 `4317`／`3080` 常驻实例并未在本容器重新确认；本次验证使用打包脚本的隔离 home 与端口，不能据此声称用户应用已运行。

## 下一步

1. 核对最终文档链接与 `git diff --check`，提交并推送 #19 分支；准备可直接用于 `gh pr create --body-file` 的 PR 描述。
2. `gh` 认证可用后创建 #19 PR，以固定 main 基线和提交后的 PR diff 执行 code-review。该技能要求分别检查 Standards 和 Spec，允许在执行评审时按技能要求委派两路；开发本身没有默认委派要求。
3. 处理评审发现并补足相应验证，通知用户人工审核，同时通过飞书发送 issue 摘要和 PR 链接。不要自动合并，不要提前关闭父 Spec。
4. 按 [#20](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/20) 的职责边界和真实可观察行为继续 TDD；后续 #21–#44 保留各自依赖与阶段 C 集成分支要求。

## 权威材料与技能

- 开发前必读：[AGENTS.md](AGENTS.md)、[PROJECT_CONTRACT.md](docs/agent/PROJECT_CONTRACT.md)、[TODO.md](TODO.md)、[reference lock](dsh-reference.lock.json)。
- 领域／历史：[CONTEXT.md](CONTEXT.md)、[领域约定](docs/agents/domain.md)、[ADRs](docs/adr/)、[历史决策](docs/decisions/)、[官方兼容性研究](docs/research/2026-09-05-official-agent-team-compatibility.md)。
- 任务管理：[Issue tracker 约定](docs/agents/issue-tracker.md)、[triage 约定](docs/agents/triage-labels.md)；GitHub Issue 是需求源，不能用本地缓存或 TODO 替代。
- 本轮已使用 `tdd`、`dsh-plugin-dev`、`domain-modeling`、`lark-im`、`lark-shared`；已读取 `code-review`，实际评审等待 PR 提交。技能路径以当前会话可用列表为准；不得引用旧交接中本环境不存在的技能作为完成证据。
