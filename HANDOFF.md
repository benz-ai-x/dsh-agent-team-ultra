# Agent Team Ultra 交接

交接日期：2026-09-05（Asia/Shanghai）。用户使用中文。

本文件是最新交接的唯一入口，存放规则见 [AGENTS.md](AGENTS.md)。
[docs/HANDOFF.md](docs/HANDOFF.md) 保留历史运行手册；其中的路径、运行实例和剩余范围不能覆盖当前仓库状态及权威需求。

## 当前任务与完成边界

- 用户要求从 [#19](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/19) 开始逐项实现全部 open issue：新分支、TDD、创建 PR、提交 PR 后使用 code-review，最后通知用户人工审核。每项完成及遇到开发阻塞时使用飞书 CLI 通知用户；已有明确通知授权。
- 权威需求为 [Spec #18，修订 1.1](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18)，中文为规范主版。已读取父 Spec 和 #19–#44 的任务、依赖与验收内容；全部实现和最终验收完成前保持父 Spec open。
- #19 已推送到 `fix/19-host-profile-evaluation`（`3046af5`），其 main 起点为 `c3c96c926f1ba05b04e7ca82a6d531a0570e0a84`；#20 已在其上提交并推送到 `fix/20-host-launch-recovery`（`1185bd0`）。当前在后者基础上的 `fix/21-locked-source-preparation` 开发 #21。远端为 [benz-ai-x/dsh-agent-team-ultra](https://github.com/benz-ai-x/dsh-agent-team-ultra)，实时状态以 Git 为准。
- **#19、#20、#21 的实现与完整验证已完成；PR 创建及提交后的 code-review 均未完成，不能报告 issue 已完成。** 当前容器 `gh auth status` 明确未登录；Git SSH 已成功推送 #19、#20，但具体的 `gh pr create` 命令因未认证而失败。已经通过飞书发送认证阻塞通知，用户也已获知需要在当前环境运行 `gh auth login`，无需发送凭据。
- #22–#44 尚未实现。下一项 [#22](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/22) 补充安装／导入前兼容性诊断与补丁清单。后续按依赖推进；阶段 C 的 Harness 集成、锁定和真实 native 验收不能由本次模拟 LLM 测试替代。

## #19 已实现内容

- `packages/domain/src/index.ts` 保留公开 Host／生成 Remote 入口与组合根；Profile 发布、隔离评测、能力安装分别归入 `profile-lifecycle.ts`、`evaluation-workflow.ts`、`profile-capabilities.ts`。
- `host-context.ts` 统一精确 live Lead 校验、公共写入准入、串行 mutation、runtime catalog、生命周期信号和 storage handle；关闭公共准入后，内部已接纳结算仍能落盘。
- 配置、不可变 Profile 快照及错误构造分离为内部辅助模块；公开结果、Remote 名称、持久化 generation 和权威 `agentTeams` 服务保持既有契约。Typert 已通过正式 build 重新生成。
- TDD 复现并修复：Lead 在 runtime preflight 或写队列等待期间退出后，保存、激活、归档及评测仍可能提交的问题。现在在实际执行业务决策以及异步预检后重新校验精确 live authority。
- TDD 复现并修复：Host 替换使进程内 capability generation 从头计数，历史失效 Promotion Gate 因编号复用而重新变成 passed。新 catalog 在开放准入前推进到所有持久 Eval Run、Binding、Run Index generation 之后；历史结果和已有 Active Revision 保留，新 catalog 生命周期的后续激活需要新评测证明。
- 更新了 [项目契约](docs/agent/PROJECT_CONTRACT.md)、[ADR 0003](docs/adr/0003-separate-profile-authoring-from-release.md) 和 [ADR 0011](docs/adr/0011-gate-promotion-with-exact-isolated-evaluations.md)，记录共享业务入口、权限检查时机及评测有效期规则。

## #20 已实现内容

- `launch-workflow.ts` 接管 Launch Intent、pending Binding、provisioning、固定路由、能力安装触发和权威 roster 派生恢复；`run-workflow.ts` 接管 canonical evidence、Run Index 修复和审批关联；`studio-projection.ts` 接管共用 Instance DTO、完整 Snapshot 与 stream feed。
- 公开 Host 和生成 Remote 入口保持原样，主服务负责组合、订阅和清理顺序；新模块复用 #19 的 Host 上下文，不包装或替换 `agentTeams`，不引入新的持久化格式。
- TDD 复现并修复新启动和 pending 重试在 Lead 退出后抛出非稳定 `TeamError` 的问题。启动工作流在异步预检、队列执行和预订落盘后重新校验 exact live authority。
- 新增 [启动与恢复集成测试](packages/domain/tests/launch-workflow.integration.spec.ts) 共 7 个案例；与 #19 共享 [真实 Host 测试装配](packages/domain/tests/fixtures/host-workflow.ts)，仅 LLM 外部边界使用可控 adapter。
- JSON／SQLite 整个 Host 重启测试先通过真实 Domain handle 删除派生 Run Index，再证明 canonical Session 能重建相同 Run 身份、时间、用量和路由。重试不唤醒已有冷成员；之后 Team 消息才恢复同一成员，并继续使用原 Revision 的能力和路由。
- 取消测试区分 Ultra pending Binding 与 Team 已持久接受初始工作的边界；另在真实 pending 落盘事件触发 Fiber 卸载，验证 drain 后仍可重放同一意图。

## #21 已实现内容

- 新增 `scripts/harness-source.mjs` 统一源码选择、锁定证明、实际 Node 依赖解析和 TypeScript 来源校验；`prepare-harness.mjs` 在校验成功后原子准备 `.dsh/harness`，重复执行输出相同来源证明。
- `DSH_HARNESS_ROOT` 的相对路径固定从 Ultra 仓库根解析；未指定时沿用已准备链接，首次才回退到相邻目录。准备过程只调整本仓库链接，保留 Harness checkout、现有目录及应用数据。
- pnpm links、TypeScript、Vitest alias、Typert、构建、测试和打包均使用统一来源。构建入口检查实际已安装依赖；生成器在检查之后动态导入所选 Typert 实现。打包打印所选 CLI 的绝对路径。
- pnpm lock 仅更新 link 路径；已比较确认 package resolutions、snapshots、settings 和依赖版本不变，`dsh-reference.lock.json` 未改。
- 7 个 [CLI 集成测试](scripts/tests/locked-source.spec.ts) 覆盖 CWD、非相邻来源、重复准备、已安装依赖混用、TypeScript bases/references 混用、拒绝无效选择及保留已有目录。构建通过，strict 为 436 项通过、0 警告；完整隔离验收亦已通过，见下文。

## 验证证据与限制

- 初始 `pnpm context:check:strict`：290 项检查通过、0 警告。
- 改动前完整 `pnpm verify`：157 项测试通过，并通过 8 个归档的真实安装、Web 启动与卸载。日志：`/tmp/ultra-19-baseline-verify.log`。
- 改动后完整 `pnpm verify`：**164 项测试通过（13 个测试文件）**，严格检查、Host／Client 构建、Typert 生成、8 个归档安装、固定 CLI Web 启动及卸载全部通过，进程退出码 0。日志：`/tmp/ultra-19-final-verify.log`。
- 新增 [Profile 工作流集成测试](packages/domain/tests/profile-workflow.integration.spec.ts) 的 7 个案例经真实生成 Remote、Host、Agent／Team 和 JSON／SQLite storage，覆盖 Revision 不可变、独立 CAS、显式激活、archive／restore／rollback、精确门禁与历史保留、权限失效及 Fiber 卸载时评测结算。
- 这些测试仅在 LLM 外部边界使用可控 adapter，隔离 Worker 仍使用真实 Host 生命周期与工具／sandbox／approval 策略。未进行用户授权 native 登录后的真实产品会话验收；该要求仍属于后续 issue，尤其 [#44](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/44)。
- 关键 RED 日志位于 `/tmp/ultra-19-{red,queue-red,gate-red,eval-red,activation-red}.log`。`/tmp` 为本容器辅助证据，不是仓库中持久规范；复核以提交内容和可重跑测试为准。
- #20 开始前 strict 再次通过 290 项、0 警告；新启动和 pending 重试 RED 分别保存在 `/tmp/ultra-20-launch-red.log`、`/tmp/ultra-20-replay-red.log`。改动后的完整 `pnpm verify` **通过 171 项测试（14 个文件）**、严格检查、Host／Client 构建、Typert 生成及 8 个归档安装／Web 启动／卸载，退出码 0。完整日志：`/tmp/ultra-20-final-verify.log`。
- #21 在 `/tmp/ultra-21-acceptance-M0KXbd/checkout with spaces` 完成整个验收；相邻没有 Harness，103 个复制输入在验收完成时仍与主工作区逐字节一致。冻结依赖安装、436 项 strict、完整 `pnpm verify` **178 项测试（15 个文件）**、8 个归档安装／Web 启动／卸载和从其他 CWD 独立打包全部通过，进程退出码 0。
- 隔离准备从不同 CWD 输出相同来源证明，清除 `DSH_HARNESS_ROOT` 后也保留同一选择。安装／卸载输出使用所选 CLI 的绝对路径，含空格路径的命令通过 shell 语法检查。日志与清单：`/tmp/ultra-21-isolated-verify.log`、`/tmp/ultra-21-isolated-pack.log`、`/tmp/ultra-21-isolated-provenance.json`、`/tmp/ultra-21-acceptance.json`。
- 首次隔离离线安装缺少 `detect-libc@2.1.2` 缓存，已通过飞书报告；随后使用同一 frozen lock 联网补齐并完成验收。依赖版本与 Harness 锁未变，该缓存阻塞已解决。

## 当前环境

- 仓库：`/root/workspace/dsh-agent-team-ultra`；Node `v22.22.1`，pnpm `11.7.0`。
- 相邻 `/root/workspace/deepseek-harness` 已匹配 [dsh-reference.lock.json](dsh-reference.lock.json)，HEAD 为 `8b4bae0b620cc89a987a3ec6dd8b0b7d9025649a`，版本 `0.1.2-rc.1`，所需构建产物齐全。当前不需要旧交接中的 macOS 隔离验证副本，也没有重置其他 checkout。
- 当前工作分支已通过 `pnpm prepare:harness` 建立 `.dsh/harness`，依赖和 TypeScript 共用它；首次或换源时先准备再安装依赖。旧分支仍使用相邻路径，切换开发分支后按其说明恢复对应依赖布局。
- 飞书 CLI 已安装并验证当前 user／bot 身份可用，已成功发送一次阻塞通知。不要在本文件记录凭据、用户标识或私人消息。
- GitHub CLI 尚未认证。认证后先刷新 issue／评论状态，再使用 `gh` 创建 PR；无需重复询问已经授权的提交、推送、PR 和飞书通知操作。
- 历史交接提到的 `4317`／`3080` 常驻实例并未在本容器重新确认；本次验证使用打包脚本的隔离 home 与端口，不能据此声称用户应用已运行。

## 下一步

1. #19–#21 的实现和验证均已就绪，提交／推送状态以 Git 为准；PR 描述在 `/tmp/ultra-{19,20,21}-pr-body.md`。这些临时文件不代替最终 PR。
2. `gh` 认证可用后先创建 #19 PR（base 为 `main`，固定基线 `c3c96c9`），再创建 #20 PR（base 为 `fix/19-host-profile-evaluation`，固定基线 `3046af5`）。逐个在 PR 提交后执行 code-review；该技能要求 Standards 和 Spec 两路评审，允许届时按技能要求委派，开发本身没有默认委派要求。
3. 处理评审发现并补足相应验证，通知用户人工审核，同时通过飞书发送 issue 摘要和 PR 链接。不要自动合并，不要提前关闭父 Spec。
4. #21 的 PR base 为 `fix/20-host-launch-recovery`，固定评审起点 `1185bd0`。之后按 [#22](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/22) 继续 TDD；#23–#44 保留各自依赖与阶段 C 集成分支要求。

## 权威材料与技能

- 开发前必读：[AGENTS.md](AGENTS.md)、[PROJECT_CONTRACT.md](docs/agent/PROJECT_CONTRACT.md)、[TODO.md](TODO.md)、[reference lock](dsh-reference.lock.json)。
- 领域／历史：[CONTEXT.md](CONTEXT.md)、[领域约定](docs/agents/domain.md)、[ADRs](docs/adr/)、[历史决策](docs/decisions/)、[官方兼容性研究](docs/research/2026-09-05-official-agent-team-compatibility.md)。
- 任务管理：[Issue tracker 约定](docs/agents/issue-tracker.md)、[triage 约定](docs/agents/triage-labels.md)；GitHub Issue 是需求源，不能用本地缓存或 TODO 替代。
- 本轮已使用 `tdd`、`dsh-plugin-dev`、`domain-modeling`、`lark-im`、`lark-shared`、`writing-for-agents`；已读取 `code-review`，实际评审等待 PR 提交。技能路径以当前会话可用列表为准；不得引用旧交接中本环境不存在的技能作为完成证据。
