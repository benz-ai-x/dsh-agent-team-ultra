# #39：固定官方基线与完整维护版 Team 集成

历史记录：本文保留当时提交的定向验证／审查进度。最新的 PR 联合验收、支持资格与
AC 收口见 [PR #63 联合验收](pr63-studio-acceptance.md)；下文的草稿、待确认或未完成
描述均属于原阶段，不覆盖最新记录。原命令、输入、失败和验证局限保持不变。

状态：实现及 Issue 定向验证完成，Batch 4 PR 验收待 #43。Issue 保持 OPEN，
未获正式评审或合并许可；#40–#44 仍未完成。父 Spec #18 未修改。

## 固定输入与来源

- Ultra 集成分支：`feat/batch-4-harness-upgrade`，起点为 #38 的 `4cecfe2`。
- Harness 候选：`3c38b1d4e8bf219750203e44b1df033ced754e92`，正常合并双亲为完整 B
  `57670c6b320f7f240cbad360a9f691c8598e1571` 与固定官方
  `d347e703908d0406b7a7ef80e3a0e594d86b2215`；未选移动 master。
- 候选版本 `0.1.3-alpha.1`；文档摘要
  `1cfdeaf1262f0101099ee245b9977a0ef93d56dcc631878f313dffea27adaf41`。
- `dsh-reference.lock.json` 只在隔离集成分支标记 `phase-c.integration-candidate.v1`。
  main、PR #62、原 B 源码均未换源；候选不是受限产品发布。
- Node 22.22.1、pnpm 11.7.0、Linux arm64。系统 Node 缺少 TypeScript stripping；
  Python SDK 的 PTC 场景使用隔离安装的官方 Node 22.22.1（同 ABI 127），未替换系统
  Node 或重建共享原生依赖。Node 24 的试跑因 ABI 137 不兼容而失败，不作为验收。

## AC → 已运行证据

| AC | Issue 证据 | PR 收口边界 |
| --- | --- | --- |
| 固定官方源码 | 实际合并父提交、干净工作区、正式 source preparation、590 strict／0 warnings | #43 核对最终候选身份 |
| 扩展→迁移→收口，保留 B | 独立 worktree／分支；#38 既有完整验证和 B 锁未变 | 迁移、归档及支持锁晋级仍待 #41／#43 |
| Team 所有者扩展和真实 codec | 原 Team service 未替换；冻结历史 codec 明确 Team 2、native 3／4、request 1；真实 `0→1→2` 解码与拒绝测试 | 跨存储联合迁移不是本项 codec 测试 |
| 普通 DSH 及固定路由 | 同一公开 Host 探针在候选和未修改官方源码各通过 11 组；生成 Remote 的 Profile 启动及 v2 冷恢复 tracer 通过 | 最终产品回归、完整 GUI 和归档重启待 #43 |
| 非 stock 伪兼容、来源与范围 | [补丁清单](../reference/harness-patch-ledger.md)、[ADR 0026](../adr/0026-preserve-team-identities-on-session-v2.md)、维护 fork Agent Note | #43 运行完整不支持组合拒绝检查 |

Host 探针覆盖精确 live 角色／Lead 权限、CAS／DAG／所有权、墓碑／wait 取消、queued
flush 先于投递、发送顺序与来源、持久回执先于 delivered、永久成员名称、保留任务所有者、
Fiber 清理，以及冷恢复后 wait／继续工作。固定路由 tracer 使用真实 AgentLoop、Team、
Session JSONL、Ultra JSON 存储与生成 Remote；只替换外部 LLM，重启后保持原 member、
Profile Revision 和固定 route，继续发送到原成员并得到两个 Run。

## TDD 与命令结果

日志保存在隔离 worktree 的父目录；不把未经脱敏的运行数据写进仓库。

| 命令／场景 | 结果 | 日志 |
| --- | --- | --- |
| B 上 `pnpm exec vitest run packages/domain/tests/phase-c-team.integration.spec.ts` | RED：实际 Session 0，要求 2；缺构建产物的首次启动错误不算 RED | `phase-c-v2-red.log` |
| 正式 `DSH_HARNESS_ROOT=… pnpm prepare:harness`、冻结离线安装、`pnpm context:check:strict` | 干净候选身份通过；590 项／0 warnings | `ultra-phase-c-{prepare,install,strict}.log` |
| Ultra `pnpm build` 与同一 v2 tracer | Host／Client／Typert／compatibility 构建通过；tracer 1/1 GREEN | `ultra-phase-c-build.log`、`phase-c-v2-green.log` |
| `node scripts/probe-team-contract.mjs <source>`，候选／固定官方各一次 | 各 11 组通过，双方 Session 2 | `harness-phase-c-team-contract.log`、`official-phase-c-team-contract.log` |
| Harness v0→1、v1→2、catalog 与 replay owning tests，三个实际修改实现文件显式 coverage | 389 项／13 文件；statements、branches、functions、lines 均 100% | `harness-format-owner-coverage-qualified.log` |
| Harness `pnpm exec vitest run packages/experimental/agent-team/tests` | 258 项／8 文件通过；存在 FileHandle GC 警告，未抑制或当作资源验收 | `harness-team-final-unit.log` |
| built `agent-team/tests/built-lib.e2e.ts` | 1/1，真实 Host 与生成浏览器 Remote 导入 | `harness-team-integrated-built.log` |
| built CLI `headless.expected.e2e.ts -t 'runs a keyless Agent Team'` | 选中场景 1/1；其余 11 项未选，不算通过 | `harness-team-profile-built.log` |
| Web `agent-team-panel.e2e.ts` | 5/5，保留 DAG／键盘／新任务／导航／Slot 断言 | `harness-team-web-qualified.log` |
| Python `smoke-python-runtime.py --scenario sdk-snapshot --exe apps/cli/lib/bin.js` | 通过；v2 输出保留 native 回执、request/reply、CAS 和两个子 Session | `harness-sdk-stock-node22-replay.log` |
| Harness `pnpm build`、完整类型检查与 `lint:contracts-ready` | 通过；历史 catch 的 unknown lint 与新增 lint 均修正，没有绕过 hooks | `harness-integrated-codec-build.log`、`harness-phase-c-push.log`、`harness-integrated-lint-qualified.log` |
| Harness `pnpm doc-sync` | 首轮 32/33；配置目录行号过期，正式生成并同步中译／配对后，失败叶检查通过 | `harness-integrated-doc-sync.log`、`harness-config-catalog-qualified.log` |
| 正常 merge commit 与 pre-push hooks | 双语配对、归档保护、staged lint、第三方声明、空白、vendor 及类型检查通过 | `harness-integration-merge-qualified.log`、`harness-phase-c-push.log` |

快照 corpus 首先真实拒绝未知 native-operation 事件；补齐严格历史 codec 后又拒绝测试
receipt token。新增公开 replay RED 后，只在测试入口处理明确 token，生产 SHA-256
校验不放宽。新 codec 的拒绝用例覆盖未知必需字段、route／native identity 冲突、非规范
能力声明、缺少 handle 和不同 payload 代际混用。完整输入校验与业务关联校验仍分属各自
所有者；通过 codec 不等于完成联合迁移。

## 尚未取得的资格

- #40 的完整 native／UI 集成、#41 的跨 Session／Team／Binding 联合迁移、#42 的 v2
  attempt 用量、#43 的最终完整 `pnpm verify` 和真实历史归档升级／卸载。
- Python 此处使用真实 built CLI 启动器，不是 packed 单文件可执行物验收。
- 尚未运行 #44 的真实认证原生场景；自动化 SDK／进程替身不能替代它。
- PR 正式审查与人工合并仍待完成。Issue 的 PR 级条件不因本项定向测试而勾选。
