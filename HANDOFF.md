# Agent Team Ultra 交接

交接日期：2026-09-06（Asia/Shanghai）。用户使用中文。

本文件是最新交接的唯一入口，存放规则见 [AGENTS.md](AGENTS.md)。
[docs/HANDOFF.md](docs/HANDOFF.md) 保留历史运行手册；其中的路径、运行实例和剩余范围不能覆盖当前仓库状态及权威需求。

## 当前任务与完成边界

- 用户当前要求评审 [PR #49](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/49) 并处理与 main 的合并冲突，并已授权双轴 review 通过后合并到 `main`。开发修复在隔离工作树 `/tmp/ultra-49-review-cc6edu_i`，分支 `fix/23-ultra-codex-runtime`；保留主工作区 #26 的未提交改动。
- 权威需求为 [Spec #18，修订 1.1](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18) 和 [#23](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/23)，中文为规范主版。父 Spec 保持 open。
- PR #45–#48 已合并；main 为 `debde06ce5c75658f9ad741cbfc8d535df118455`。PR #49 原 head 为 `ae2ec72`，本轮将 main 合入该分支，保留完整闭包、真实 Loader 根、模块类型诊断和 11 组共同对照，同时接入 Ultra-owned Codex 和旧包拒绝规则。
- GitHub CLI 已登录。#19–#25 已按用户“开发及验证完成即可关闭”的指示关闭；Issue 状态与 PR 合并状态分别追踪。本分支包含 #23 的 Codex 迁移；#24–#25 的增量仍位于 PR #50–#51；#26 在主工作区进行中。
- 本轮只在当前对话报告进度。历史通知记录不能作为本轮向外部发送消息的授权。

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

## #23 已实现内容

- Codex 实现与资格校验迁入 `packages/codex`，包名为 `@benz-ai-x/dsh-agent-team-codex@0.1.0`。`src/index.ts`／`src/product.ts` 与固定 Harness 前身逐字节一致，并保留 MIT license 和来源说明；SDK／平台 payload 仍为 `0.149.1`，不搜索 PATH，不扩大沙箱或能力。
- 保留 `agent-team-codex` Loader 行、`digitalEmployees` Catalog Owner、`external-agent/codex` 路由、native project correlation、成员、Profile Revision、Binding、native handle 及存储代际。完整 provider 仍经同一个通用 Catalog Owner 注册，目录与执行注册随 Fiber 一起释放。
- Profile peers／workspace 依赖、TS references、Host 构建顺序、生成兼容性证明及安装／卸载清单一起调整；归档仍为八个，现为四个 Ultra 包和四个 Harness private 包。Typert 通过正常构建重新生成。pnpm lock 保留全部已有 resolutions／snapshots／settings，只增加 Codex wrapper 与六个平台载荷的七个固定条目。
- 迁移测试发现 Node `createRequire().resolve.paths()` 会接纳 `NODE_PATH` 中的工作区副本，掩盖 ESM 实际缺包。预检现仅沿真正的 ESM `node_modules` 祖先路径查找，并保留 SDK 未导出 package.json 的读取能力；明确的 NODE_PATH 回归测试通过。
- 新版 Profile 在子插件加载前拒绝仍可解析的旧 Codex 包，返回 `ULTRA_COMPAT_LEGACY_RUNTIME`。README、打包输出、ADR-0007、ADR-0014 和补丁清单给出停止 Web、仅移除旧 Codex、安装新八包并沿用原 DSH_HOME 的升级流程；历史归档不可用目录通配符混装。
- 新增真实 Host catalog／Fiber 替换测试，迁入原有十条 native 产品资格校验测试，并新增完整 Profile 准入与旧新共存拒绝案例。
- 初次实现的完整 `pnpm verify` 退出 0：**506 项 strict、0 警告；199 项测试（18 个文件）；八个真实归档安装、Web 启动和卸载全部通过**。日志 `/tmp/ultra-23-full-verify.log`。RED 日志为 `/tmp/ultra-23-{profile,catalog,admission,duplicate,pack}-red.log`。
- [升级验证脚本](scripts/verify-codex-upgrade.mjs) 从固定前身 `61d23615bb8987e85f2397ed57b94ef23c79ade3` 的独立已构建 checkout `/tmp/ultra-23-predecessor` 重新打包并安装实际旧八包。经真实 Loader、生成 Remote、Team 与 JSON／SQLite 存储分别创建员工并完成两轮工作；停止旧 context、仅移除旧 Codex、安装新八包后，原成员／Revision／handle 保持不变，新增第三轮消息没有创建新线程。目录移除／回归、执行注册释放、升级后 Web 启动、完整卸载及无残留均通过，退出 0。最终日志 `/tmp/ultra-23-upgrade-final.log`。
- 升级探针的 native app-server 通道是明确的外部确定性替身；实际 adapter、SDK／payload 资格校验、协议传输、Loader、Remote 和持久化均使用发货代码。没有使用用户认证或运行真实 native 模型会话；#44 的产品验收要求仍未完成。
- 曾有一次 pnpm 11.7.0 在输出 Done 后超过四分钟不退出，已通过飞书报告并终止该隔离安装进程。带诊断观察的完整场景和不带观察器的原命令随后均自然退出 0；固定 11.7.0 的最小归档更新案例也未复现。没有修改 pnpm／Harness 版本、跳过检查或把被终止的运行当成成功；根因未证明，作为一次未稳定复现的环境限制保留。临时观察器不进入项目。

## 验证证据与限制

### #22 安装／导入前兼容性诊断

- **2026-09-06 PR #48 评审修复**：生成证明移至完整构建末尾，包含 Ultra Host、UI、Profile 和各自实际依赖；Profile 导入检查私有闭包，并在 Loader 初次加载／配置替换前检查真实 source directory。CLI 从实际 profile 根检查同一闭包。ESM 查找支持包自引用和祖先 `node_modules`，忽略 `NODE_PATH`。
- 新增缺失 UI、真实 Loader 根混用 Team、CLI 根缺失 Team、Host 私有 Session 混用四条回归，原适配器缺失测试加入合格 `NODE_PATH` 副本。真实 Loader 保留稳定诊断码于包装后的 message；直接导入和 CLI 保留结构化 code。无不兼容子项执行或业务目录写入。
- 清除本隔离工作树的旧 `lib` 后完整 `pnpm verify` **通过：448 strict、0 警告；190 测试／16 文件；八归档真实安装、Web 启动、全部行与包卸载**。日志 `/tmp/ultra-48-fix-verify.log`；新入口用例日志 `/tmp/ultra-48-admission-tests.log`。最初失败的日志为 `/tmp/ultra-48-{node-path,ui-closure,loader-anchor,cli-anchor}-red.log`；补修后入口集合通过记录见 `/tmp/ultra-48-cli-anchor-green.log` 和 `/tmp/ultra-48-admission-tests.log`。
- `/tmp/ultra-48-comparison.log`：固定官方 `d347e703…` 与维护 fork `8b4bae0b…` 均通过同一 11 组公共契约，新增公共 queued flush 屏障、三条消息顺序与发送方、真实上下文冷重启、10 秒 wait 超时不创建冷 Agent、消息恢复原成员身份、中断及恢复后任务仍由原成员持有。官方源码和 Team 包仍在安装／导入前被拒绝；无业务数据写入。两个 Harness checkout 均保持干净。
- `80464c4` 双轴复审：Spec 0 项；Standards 新发现 P2（Team manifest 只改 `type: commonjs` 时先通过 guard，再报原始 ESM 链接错误）。本次再补修将 `type` 加入生成证明和核验；公开 Host 入口 RED / GREEN 日志为 `/tmp/ultra-48-module-type-{red,green}.log`。
- 模块类型补修后的完整 `pnpm verify` **通过 448 strict、0 警告；191 测试／16 文件；八归档安装、Web 启动及全部行与包卸载**，日志 `/tmp/ultra-48-module-type-verify.log`。同一官方／fork 11 组对照复跑日志为 `/tmp/ultra-48-module-type-comparison.log`。
- 下一步提交／推送补修，再固定新 head 让 Standards 与 Spec 分别复核；本记录不预先宣称最终 review 或合并通过。


- `dsh-reference.lock.json` 新增独立的官方基础 `76fda729…`、官方对照 `d347e703…`、扩展接口资格、Session/Team/投影/Ultra 格式及 native SDK/payload 标识；原 `upstream` 提交、版本和文档摘要保持不变。当前受支持运行时仍是完整 `8b4bae0b…` fork。
- `scripts/generate-compatibility.mjs` 从严格证明的源码生成实际发货 JavaScript 摘要、依赖关系及 Host 公共入口。公开 Host 包先执行 Node-only 检查，再动态导入实现；TypeScript 公共类型和生成 Remote 保持原契约，Client 不引入 Node 预检。
- `packages/domain/src/compatibility.ts` 检查每个包实际 Node 解析路径、版本、exports、发货文件摘要及 SDK manifest。直接依赖和传递依赖分别检查；相同 semver 不能掩盖错误产物。兼容性证明缺失、源码错误、产物／SDK 不匹配均有 `ULTRA_COMPAT_*` 稳定诊断。
- profile 将七个原有子行放入 `agent-team-ultra-compatibility` Loader 组，组入口预检完成后才加载子插件。`compatible-dsh.mjs` 使用锁定 CLI 的参数解析和真实 CLI，安装前校验源码及构建，安装后校验实际依赖，启动前再次校验。
- `pack:local` 打印绝对路径的预检安装入口，归档仍为八个；新增明确的锁定 Loader peer。依赖锁只增加该 link，未改变包解析版本。
- 8 条新 CLI／包入口集成案例按 TDD 验证：错误源码不初始化 DSH home、完整 Host 可导入、证明缺失、同版本 Team 缺接口、直接 Session 被替换、Team 传递 Session 混用、原生适配器缺失及 SDK 版本不合格。
- [ADR 0015](docs/adr/0015-maintain-explicit-harness-compatibility.md)、[补丁清单](docs/reference/harness-patch-ledger.md)、术语、项目契约和 README 已更新。补丁表明确用途、公开合约、格式影响、测试责任与上游状态；没有把未来 #23/#24 的适配器迁移或 #44 的真实 native 验收标成已完成。
- 初次实现的 `pnpm verify`：**448 项 strict、0 警告；186 项测试（16 个文件）；8 个真实归档安装、Web 启动及卸载全部通过，退出码 0**。日志：`/tmp/ultra-22-final-verify.log`。RED 日志：`/tmp/ultra-22-{import,session,transitive,profile,sdk,install,proof}-red.log`；最终比较报告：`/tmp/ultra-22-comparison-final.json`。
- 固定官方基线在 `/tmp/ultra-22-official-d347e7` 独立 worktree 中，冻结安装成功，源码保持干净。Node 22 默认打包缺少 `unrun`，`tsx` 与临时补齐的 `unrun` 路径均未完成打包；改用经过官方 SHA256 校验的 Node 24.11.1 arm64 原生配置加载后，Host 构建成功。原生依赖由 Node 22 安装，探针继续用 Node 22 运行，避免 `fs-ext` ABI 混用。维护 fork 和共享源码未被改动。
- 初次实现的 `probe-team-contract.mjs` 对两个真实构建均通过六组公共合约（已由本次 11 组场景补足）：精确 live 角色、任务 CAS/DAG/所有权、墓碑与 wait cancellation、持久回执早于 delivered、永久名称、Fiber 卸载。仅 LLM 外部边界受控。`compare-harness-contract.mjs` 验证固定官方提交和源码状态，再复跑探针，并证明官方源码在安装前、实际官方 Team 包在导入前被稳定拒绝且不创建业务数据；Session 格式分别为 fork 0、官方 2。

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
- 飞书 CLI 已验证当前 user／bot 身份可用；认证阻塞、#21 缓存阻塞及恢复、#22 官方构建阻塞及恢复均已通知。不要在本文件记录凭据、用户标识或私人消息。
- GitHub CLI 已认证，使用 `gh` 刷新实际 Issue / PR 状态；PR body 更新使用 REST API，避免已失效的 Projects classic GraphQL 字段。
- 历史交接提到的 `4317`／`3080` 常驻实例并未在本容器重新确认；本次验证使用打包脚本的隔离 home 与端口，不能据此声称用户应用已运行。

## 下一步

1. 完成 PR #49 的 main 冲突整合、完整验证和真实前身归档升级，提交并推送。
2. 固定当前 main 与新 head 分别执行 Standards / Spec 两路独立评审；均通过后按用户已有授权合并 PR #49。
3. 保留 PR #50–#51 后续审核和合并边界；不要切换或提交主工作区 #26 WIP。父 Spec #18 保持 open，真实 native 验收仍属 #44。

## 权威材料与技能

- 开发前必读：[AGENTS.md](AGENTS.md)、[PROJECT_CONTRACT.md](docs/agent/PROJECT_CONTRACT.md)、[TODO.md](TODO.md)、[reference lock](dsh-reference.lock.json)。
- 领域／历史：[CONTEXT.md](CONTEXT.md)、[领域约定](docs/agents/domain.md)、[ADRs](docs/adr/)、[历史决策](docs/decisions/)、[官方兼容性研究](docs/research/2026-09-05-official-agent-team-compatibility.md)。
- 任务管理：[Issue tracker 约定](docs/agents/issue-tracker.md)、[triage 约定](docs/agents/triage-labels.md)；GitHub Issue 是需求源，不能用本地缓存或 TODO 替代。
- 本轮修复使用 `tdd`、`dsh-plugin-dev`、`domain-modeling`，复审使用 `code-review`；该技能明确要求 Standards / Spec 两路独立代理，开发没有额外委派。

- 本轮 PR #49 使用 `code-review`、`resolving-merge-conflicts`、`dsh-plugin-dev`；已合入 #48 的修复意图，尚待最终验证与复审。

## PR #49 本轮整合验证

- 已在本隔离分支合入 main `debde06`，逐项保留 #48 的完整闭包、ESM 自引用／模块类型检查、真实 Loader 根目录和公共 Team 对照；把 Codex 包加入同一生成闭包，保留旧包提前拒绝及全部入口回归。
- 完整 `pnpm verify` 已通过：506 strict、0 警告；204 测试／18 文件；八归档真实安装、Web 启动与完整卸载。日志 `/tmp/ultra-49-merged-verify.log`。Codex `index.ts` / `product.ts` 与锁定 Harness 前身保持逐字节一致。
- 真实归档升级的固定前身更新为当前 main `debde06ce5c75658f9ad741cbfc8d535df118455`；独立工作树 `/tmp/ultra-49-predecessor-cpcyoykc` 按其锁准备和构建。升级验收及新固定 head 的双轴 review 尚待完成。
