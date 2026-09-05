# Agent Team Ultra 交接

交接日期：2026-09-05（Asia/Shanghai）。用户使用中文。

本文件是最新交接的唯一入口，存放规则见 [AGENTS.md](AGENTS.md)。
[docs/HANDOFF.md](docs/HANDOFF.md) 保留历史运行手册；其中的路径、运行实例和剩余范围不能覆盖当前仓库状态及权威需求。

## 当前任务与完成边界

- 用户要求从 [#19](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/19) 开始逐项实现全部 open issue：新分支、TDD、创建 PR、提交 PR 后使用 code-review，最后通知用户人工审核。每项完成及遇到开发阻塞时使用飞书 CLI 通知用户；已有明确通知授权。
- 权威需求为 [Spec #18，修订 1.1](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18)，中文为规范主版。已读取父 Spec 和 #19–#44 的任务、依赖与验收内容；全部实现和最终验收完成前保持父 Spec open。
- #19 已推送到 `fix/19-host-profile-evaluation`（`3046af5`），main 起点为 `c3c96c926f1ba05b04e7ca82a6d531a0570e0a84`；#20 已推送到 `fix/20-host-launch-recovery`（`1185bd0`）；#21 已推送到 `fix/21-locked-source-preparation`（`a8adac0`）。#22 已推送到 `fix/22-runtime-compatibility-preflight`（`61d2361`）。#23 已推送到 `fix/23-ultra-codex-runtime`（`ae2ec72`）。#24 已推送到 `fix/24-ultra-claude-code-runtime`（`d4e72b835362d766f402f761f4dcf29a931e2400`）。当前 #25 开发分支为 `fix/25-read-only-migration-audit`，固定基线为 `d4e72b8`。远端为 [benz-ai-x/dsh-agent-team-ultra](https://github.com/benz-ai-x/dsh-agent-team-ultra)，实时提交／推送状态以 Git 为准。
- **用户最新指示：Issue 在开发和验证完成后即可关闭，不等待 PR 或人工审核。#19–#25 已达到关闭条件；PR 创建、提交后的 code-review 和人工审核仍是独立未完成待办。** 当前容器 `gh auth status` 明确未登录；实际执行的 `gh issue close 19 --repo benz-ai-x/dsh-agent-team-ultra --reason completed` 因未认证退出 4，尚未改变远端 Issue 状态。Git SSH 推送可用，PR 创建也因同一认证问题受阻；认证可用后直接关闭 #19–#25，无需再次确认。
- #25 的开发与验证已完成，阶段 A 已收口，PR 创建与后续评审仍待认证。#26–#44 尚未实现，下一项为阶段 B 的 native 授权与 Codex 查询通道。后续按依赖推进；阶段 C 的 Harness 集成、锁定和真实 native 验收不能由本次模拟 LLM 测试替代。

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
- 最终完整 `pnpm verify` 退出 0：**506 项 strict、0 警告；199 项测试（18 个文件）；八个真实归档安装、Web 启动和卸载全部通过**。日志 `/tmp/ultra-23-full-verify.log`。RED 日志为 `/tmp/ultra-23-{profile,catalog,admission,duplicate,pack}-red.log`。
- [升级验证脚本](scripts/verify-codex-upgrade.mjs) 从固定前身 `61d23615bb8987e85f2397ed57b94ef23c79ade3` 的独立已构建 checkout `/tmp/ultra-23-predecessor` 重新打包并安装实际旧八包。经真实 Loader、生成 Remote、Team 与 JSON／SQLite 存储分别创建员工并完成两轮工作；停止旧 context、仅移除旧 Codex、安装新八包后，原成员／Revision／handle 保持不变，新增第三轮消息没有创建新线程。目录移除／回归、执行注册释放、升级后 Web 启动、完整卸载及无残留均通过，退出 0。最终日志 `/tmp/ultra-23-upgrade-final.log`。
- 升级探针的 native app-server 通道是明确的外部确定性替身；实际 adapter、SDK／payload 资格校验、协议传输、Loader、Remote 和持久化均使用发货代码。没有使用用户认证或运行真实 native 模型会话；#44 的产品验收要求仍未完成。
- 曾有一次 pnpm 11.7.0 在输出 Done 后超过四分钟不退出，已通过飞书报告并终止该隔离安装进程。带诊断观察的完整场景和不带观察器的原命令随后均自然退出 0；固定 11.7.0 的最小归档更新案例也未复现。没有修改 pnpm／Harness 版本、跳过检查或把被终止的运行当成成功；根因未证明，作为一次未稳定复现的环境限制保留。临时观察器不进入项目。

## #24 已实现内容

- Claude Code 实现、产品资格检查与受控进程桥接迁入 `packages/claude-code`，包名为 `@benz-ai-x/dsh-agent-team-claude-code@0.1.0`。三个源文件与固定 Harness 前身逐字节一致，保留 MIT license 和来源说明；SDK `0.3.241`、native `2.1.241`、只读工具／文件／网络与交互权限约束均未改变。
- Profile、peer/workspace 依赖、TS references、构建、兼容性证明及安装／卸载清单同步调整；现在仍为八个归档，组成是五个 Ultra 包与三个 Harness private 包。`agent-team-claude-code` 行、`digitalEmployees` Catalog Owner、`claude-code` 路由、确定性 native Session 与 transcript marker 均保留。
- 准入在加载子插件前拒绝缺少新 Claude 包、SDK 或 native 产品版本不符，以及任一新旧产品包共存；迁入九条资格检查测试，并经真实 Host 验证目录注册、Fiber 移除与替换。旧依赖锁 settings、全部 resolutions/snapshots 不变，只新增一百个固定依赖条目及 workspace importer。
- `pnpm verify` 退出 0：**554 项 strict、0 警告；213 项测试（20 个文件）；八归档安装、Web 启动与卸载通过**。日志 `/tmp/ultra-24-full-verify.log`。关键 RED 日志 `/tmp/ultra-24-{profile,catalog,admission,duplicate,pack}-red.log`。
- [Claude 升级验证](scripts/verify-claude-upgrade.mjs) 从固定前身 `ae2ec7258146ea14ec4895d39795221c3774e29d` 的干净已构建独立 checkout `/tmp/ultra-24-predecessor` 安装实际旧归档。JSON／SQLite 均证明原 Profile Revision、成员、Binding 和 native Session 在替换包后保持一致；原生 transcript 中已有三条接受记录（含一次卸载中断），升级后新增跟进和卸载中断记录，共五条，没有新 Session。
- [归档探针](scripts/probe-claude-continuity.mjs) 使用真实 Loader、生成 Remote、Team 与存储；未支持的 fork 能力在发起 native Query 前被拒绝。确定性替身仅替换外部 SDK API；实际 adapter、SDK／payload 资格检查与 Managed Process 桥接不替换。固定只读策略逐项验证，运行中 Query 随 Fiber 移除停止，随后原 handle 恢复；完整卸载与升级后 Web 启动也通过。原命令 `pnpm verify:claude-upgrade /tmp/ultra-24-predecessor` 退出 0，日志 `/tmp/ultra-24-upgrade-final.log`。真实认证 native 验收仍是 #44。
- 本次首轮升级在 pnpm 安装新包时超过 120 秒，被外层超时中止，退出 124，未算通过。带输出观察的复跑及不带观察器的原命令随后均自然退出 0；未证明卡住的根因，没有更改 pnpm／Harness 或绕过检查。已飞书通知阻塞，临时观察器与超时遗留隔离目录已清理，日志保留。
- [Codex 升级验证](scripts/verify-codex-upgrade.mjs) 现在从旧八包中识别并移除所有已退役产品包，以支持 #22 前身同时含旧 Codex 和 Claude 的升级。更新后的完整升级验证已退出 0，日志 `/tmp/ultra-24-codex-upgrade.log`；原 Codex 成员／handle 与两轮到三轮连续性保留。ADR-0008、ADR-0014、README、领域词汇与补丁清单明确修订归属；后续 Team 工具仍由 #29／#30 单独追踪。

## #25 已实现内容与阶段 A 验收

- 新增 `pnpm migration:audit --sessions <root> --json <storage>`／`--sqlite <database>`。CLI 从完整源文件、正式 schema、真实 Session read handle 和锁定 Team 投影读取；不打开会迁移／写入的 Ultra Domain。JSON per-record envelope、整体 unit、SQLite 物理版本及 Ultra Generation 在业务读取前检查，未来格式和未知布局不当作空库。
- 审计区分 Session `0`、Team payload `2`、projection `3`、descriptor `3`、Ultra v0/v1；核验 Profile Head／Revision／fingerprint、Binding、Team 成员、descriptor、固定 route、native handle／Launch Request 与实际能力需求。Host 与审计复用纯 Revision 补全、v0 投影及不可变关系校验；审计结果仅在内存中生成。
- checkpoint 使用真实 cache schema、Session identity、投影版本、日志游标和冷重建状态核验。匹配报告 reusable，不匹配报告 rebuild 及原因，源文件保留。v0 和实际中断的 pending v1 均可重复审计，相同记录复用、不同目标拒绝，不创建迁移目标或提交完成标记。
- SQLite 的数据库／WAL 复制到私有临时目录，再以只读连接读取，避免创建或修改源 SHM；报告摘要包含全部旁文件并在成功前复核，临时副本退出时清除。RED 复现了只摘要主文件会漏掉 WAL 已提交变更的问题；修正后保持源数据库和旁文件字节不变。Session Zstd 解码逐帧复制上游复用的 buffer，SQLite 表检查使用完整 unit/table 集合区分 v0/v1 前缀。
- [ADR 0016](docs/adr/0016-audit-and-plan-format-aware-migration.md) 接受阶段 C 的 Session `2`、Team payload `3`、projection `4`、descriptor `3` 方案，规定 native operation／发送请求／回复关联进入正式 schema、codec、生成词汇和投影，业务提交与操作回执同批持久化。迁移保留源、关闭 pending 目标写入、幂等复用并拒绝分歧、最后提交 manifest；禁止双向写入。包归属变化不触发 Ultra 新代际。当前运行锁不变，阶段 A 完成后进入 B，执行迁移与新 fork 资格仍由阶段 C 交付。
- 完整 `pnpm verify` 已退出 0：**554 项 strict、0 警告；240 项测试（21 个文件），其中新增审计集成测试 27 项；八个归档真实安装、Web 启动及无残留卸载通过**。日志 `/tmp/ultra-25-final-verify.log`。关键 RED 日志 `/tmp/ultra-25-{descriptor,formats,revision,wal,native-requirements,native-turn}-red.log`；所有最终用例以完整验证为准。
- Codex `61d2361`→当前归档、Claude Code `ae2ec72`→当前归档的 JSON／SQLite 升级均自然退出 0，保留原成员／Revision／native handle，后续工作、运行中卸载、注册释放、Web 启动和无残留移除通过。日志 `/tmp/ultra-25-codex-upgrade.log`、`/tmp/ultra-25-claude-upgrade.log`。外部 native SDK／进程为明确的确定性替身，真实认证产品验收仍由 #44 完成。
- 最后新增 native turn 关联检查，拒绝把 native 回执附在 DSH 成员上；报告列出有界的初始轮／消息轮关联。#25 已达到用户要求的关闭条件；提交与推送以 Git 为准，GitHub 认证仍阻塞实际关闭、PR 创建及提交后评审。

## 验证证据与限制

### #22 安装／导入前兼容性诊断

- `dsh-reference.lock.json` 新增独立的官方基础 `76fda729…`、官方对照 `d347e703…`、扩展接口资格、Session/Team/投影/Ultra 格式及 native SDK/payload 标识；原 `upstream` 提交、版本和文档摘要保持不变。当前受支持运行时仍是完整 `8b4bae0b…` fork。
- `scripts/generate-compatibility.mjs` 从严格证明的源码生成实际发货 JavaScript 摘要、依赖关系及 Host 公共入口。公开 Host 包先执行 Node-only 检查，再动态导入实现；TypeScript 公共类型和生成 Remote 保持原契约，Client 不引入 Node 预检。
- `packages/domain/src/compatibility.ts` 检查每个包实际 Node 解析路径、版本、exports、发货文件摘要及 SDK manifest。直接依赖和传递依赖分别检查；相同 semver 不能掩盖错误产物。兼容性证明缺失、源码错误、产物／SDK 不匹配均有 `ULTRA_COMPAT_*` 稳定诊断。
- profile 将七个原有子行放入 `agent-team-ultra-compatibility` Loader 组，组入口预检完成后才加载子插件。`compatible-dsh.mjs` 使用锁定 CLI 的参数解析和真实 CLI，安装前校验源码及构建，安装后校验实际依赖，启动前再次校验。
- `pack:local` 打印绝对路径的预检安装入口，归档仍为八个；新增明确的锁定 Loader peer。依赖锁只增加该 link，未改变包解析版本。
- 8 条新 CLI／包入口集成案例按 TDD 验证：错误源码不初始化 DSH home、完整 Host 可导入、证明缺失、同版本 Team 缺接口、直接 Session 被替换、Team 传递 Session 混用、原生适配器缺失及 SDK 版本不合格。
- [ADR 0015](docs/adr/0015-maintain-explicit-harness-compatibility.md)、[补丁清单](docs/reference/harness-patch-ledger.md)、术语、项目契约和 README 已更新。补丁表明确用途、公开合约、格式影响、测试责任与上游状态；没有把未来 #23/#24 的适配器迁移或 #44 的真实 native 验收标成已完成。
- 最终 `pnpm verify`：**448 项 strict、0 警告；186 项测试（16 个文件）；8 个真实归档安装、Web 启动及卸载全部通过，退出码 0**。日志：`/tmp/ultra-22-final-verify.log`。RED 日志：`/tmp/ultra-22-{import,session,transitive,profile,sdk,install,proof}-red.log`；最终比较报告：`/tmp/ultra-22-comparison-final.json`。
- 固定官方基线在 `/tmp/ultra-22-official-d347e7` 独立 worktree 中，冻结安装成功，源码保持干净。Node 22 默认打包缺少 `unrun`，`tsx` 与临时补齐的 `unrun` 路径均未完成打包；改用经过官方 SHA256 校验的 Node 24.11.1 arm64 原生配置加载后，Host 构建成功。原生依赖由 Node 22 安装，探针继续用 Node 22 运行，避免 `fs-ext` ABI 混用。维护 fork 和共享源码未被改动。
- 同一 `probe-team-contract.mjs` 对两个真实构建均通过六组公共合约：精确 live 角色、任务 CAS/DAG/所有权、墓碑与 wait cancellation、持久回执早于 delivered、永久名称、Fiber 卸载。仅 LLM 外部边界受控。`compare-harness-contract.mjs` 验证固定官方提交和源码状态，再复跑探针，并证明官方源码在安装前、实际官方 Team 包在导入前被稳定拒绝且不创建业务数据；Session 格式分别为 fork 0、官方 2。

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
- GitHub CLI 尚未认证。认证后先刷新 issue／评论状态，再使用 `gh` 创建 PR；无需重复询问已经授权的提交、推送、PR 和飞书通知操作。
- 历史交接提到的 `4317`／`3080` 常驻实例并未在本容器重新确认；本次验证使用打包脚本的隔离 home 与端口，不能据此声称用户应用已运行。

## 下一步

1. #19–#25 的实现和验证均已就绪，提交／推送状态以 Git 为准；PR 描述在 `/tmp/ultra-{19,20,21,22,23,24,25}-pr-body.md`。这些临时文件不代替最终 PR。
2. `gh` 认证可用后先按最新授权关闭开发／验证完成的 #19–#25，再创建各自 PR。#19 PR base 为 `main`，固定基线 `c3c96c9`；#20 PR base 为 `fix/19-host-profile-evaluation`，固定基线 `3046af5`。逐个在 PR 提交后执行 code-review；该技能要求 Standards 和 Spec 两路评审，允许届时按技能要求委派，开发本身没有默认委派要求。
3. 处理评审发现并补足相应验证，通知用户人工审核，同时通过飞书发送 issue 摘要和 PR 链接。不要自动合并，不要提前关闭父 Spec。
4. #21 的 PR base 为 `fix/20-host-launch-recovery`，固定评审起点 `1185bd0`；#22 的 PR base 为 `fix/21-locked-source-preparation`，固定评审起点 `a8adac0`。#23 的 PR base 为 `fix/22-runtime-compatibility-preflight`，固定起点 `61d2361`。#24 的 PR base 为 `fix/23-ultra-codex-runtime`，固定起点 `ae2ec72`。#25 的 PR base 为 `fix/24-ultra-claude-code-runtime`，固定起点 `d4e72b835362d766f402f761f4dcf29a931e2400`。接着从 #25 分支按 [#26](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/26) 继续 TDD，保留 #26–#44 的依赖与阶段 C 集成分支要求。

## 权威材料与技能

- 开发前必读：[AGENTS.md](AGENTS.md)、[PROJECT_CONTRACT.md](docs/agent/PROJECT_CONTRACT.md)、[TODO.md](TODO.md)、[reference lock](dsh-reference.lock.json)。
- 领域／历史：[CONTEXT.md](CONTEXT.md)、[领域约定](docs/agents/domain.md)、[ADRs](docs/adr/)、[历史决策](docs/decisions/)、[官方兼容性研究](docs/research/2026-09-05-official-agent-team-compatibility.md)。
- 任务管理：[Issue tracker 约定](docs/agents/issue-tracker.md)、[triage 约定](docs/agents/triage-labels.md)；GitHub Issue 是需求源，不能用本地缓存或 TODO 替代。
- 本轮已使用 `tdd`、`dsh-plugin-dev`、`domain-modeling`、`lark-im`、`lark-shared`、`writing-for-agents`、`diagnosing-bugs`；已读取 `code-review`，实际评审等待 PR 提交。技能路径以当前会话可用列表为准；不得引用旧交接中本环境不存在的技能作为完成证据。
