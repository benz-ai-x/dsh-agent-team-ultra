# #41：隔离联合迁移定向证据

状态：实现与 Issue 定向验证完成，待 PR #63／#43 集中验收。Issue 保持 OPEN；未运行
全部历史归档和每个写入前后中断矩阵，不宣称正式评审、合并或真实认证通过。

输入：Ultra 父提交 `dcc022c160664a8021c605a4a7a34a90cbf2c761` 加本证据所在提交；
干净 Harness `3c38b1d4e8bf219750203e44b1df033ced754e92`，docs digest
`1cfdeaf1262f0101099ee245b9977a0ef93d56dcc631878f313dffea27adaf41`；固定官方
`d347e703908d0406b7a7ef80e3a0e594d86b2215`，候选锁不变。Linux arm64，Node
22.22.1／pnpm 11.7.0；真实 JSON／SQLite、Session／Team、Host／生成 Remote、
Cordis Loader。仅外部 LLM／native 进程边界使用受控替身。

## 运行结果

`pnpm exec vitest run` 选择以下 5 个文件，**70/70**，日志
`issue41-focused-owner.log`（2026-09-08 22:45，96.15s）：

- Domain `migration-audit.integration.spec.ts`：37 项，只读审计／历史 codec／版本／
  物理布局／继承 Team／缓存身份／JSON 和 SQLite 源保护及有界错误。
- Domain `migration-execution.integration.spec.ts`：24 项，公开运维 CLI、真实数据
  Loader 及生成 Remote；包括原员工恢复、历史转换、v0→v1、暂停／重试／复用、
  截断发布、分歧拒绝、路径别名、缓存重建、Eval 历史与 Gate、DSH/native Run 重建。
- Domain `profile-workflow.integration.spec.ts`、`phase-c-team.integration.spec.ts`
  和 Profile `profile.spec.ts`：共 9 项公开业务与组合回归。

`pnpm install --offline` 成功（缓存元数据时效提示，不更改 SDK）；strict **648／0
warnings**，日志 `issue41-data-strict.log`；完整 Host／Client／Typert／兼容证明与
Profile 双入口构建成功，日志 `issue41-mixed-roots-build.log`。最后的文档／脚本变更
补做 strict 和差异／链接检查，见提交记录；完整 `pnpm verify` 不在每个 Issue 重复。

## TDD 与真实历史输入

公开 CLI 从 `MIGRATION_NOT_AVAILABLE` 开始，依次复现并修复历史 Session 未转换、
Ultra pending、暂停参数、checkpoint、源路径祖先别名和缺失 Run Index。真实 Loader
先复现 pending／混合根仍注册可写数据，再经联合准入修复；CLI 在业务启动前拒绝。
可重复日志对包括 `issue41-joint-entry-{red,green}`、`issue41-joint-b-{red,green}`、
`issue41-joint-ultra-{red,green}`、`issue41-migration-cli-admission-{red,green}`、
`issue41-mixed-roots-{red,green}`、`issue41-source-alias-{red,green}`、
`issue41-joint-run-index-{red,green}`；native 两个工作轮次 RED 为 0 而非 2，最终
`issue41-joint-native-index-green.log` 为 JSON／SQLite 两项通过。初始夹具路径／超时／
断言笔误和未构建错误保留在日志中，但不当作产品 RED。

另由未改动的 B `57670c6b320f7f240cbad360a9f691c8598e1571` 实际运行 11 组公开 Team
探针，产生 3 个压缩 Session（12／19／36 事件），原 bytes、SHA256 和产生说明在
[黄金输入](../../packages/domain/tests/fixtures/b-team-session-source.md)。它覆盖 Team、
消息、任务 CAS／DAG／墓碑、child descriptor 和原身份冷恢复；**不含 Ultra Binding
或 native 成员**。当前真实员工、双存储 v0 和 native 关联场景是另一些测试，不能把
它们拼成尚未执行的完整历史 native 归档升级结论。

## AC → 场景 → 验证边界

| AC | 已完成的定向证明 | PR 集中验收仍需 |
| --- | --- | --- |
| 联合历史格式 | B 真实压缩日志经过 `0→1→2`，原历史 bytes 保留；当前 Binding、继承描述和新缓存实读 | #43 全部支持的历史／B 归档组合 |
| 源不变、pending、最后完成 | 两种真实存储快照逐字节不变；真实 Loader 无可写注册；候选／目标／源三次校验后完成 | 定向 AC 已证明；#43 再覆盖归档入口 |
| 中断、复用、拒绝、重建 | JSON／SQLite 耐久发布后暂停、预期临时前缀恢复、源／目标／临时分歧拒绝；未知／未来审计拒绝，错误缓存真实重建 | #43 每个写入／标记前后完整矩阵 |
| 身份、时间、CAS、格式 | 当前原 member／Revision／route；真实 v0 Profile/CAS/时间；B Team 身份；native 原 handle／两 turn 关联；Ultra 仍 v1 | #43 历史归档一次旅程中的完整联合身份集合 |
| 恢复、Run、Gate | 生成 Remote 冷恢复原员工并继续第二个 Run；两种存储在完成前重建 DSH 与 native 两轮 Index；Eval Run 原样、旧 Gate 失效 | #43 历史双 native 全旅程与 #42 最终 usage fold |
| 支持边界与脱敏 | README／ADR 0027 明确旧程序、stock、双向写入不支持；报告 PRIVATE 负断言，有界错误 | 定向 AC 已证明；真实 SDK 认证仍是 #44 |

派生 native Index 不包含原始 transcript，缺少终态时明确 unknown／incomplete。
迁移不启动 native 工作、不调用外部产品，也不搬运 SDK 自有历史或认证；测试中的
native 数据 bytes 不变。`data` JSON／SQLite Loader 释放后服务／后端注册消失，
重新挂载能读取同一记录；这不是完整打包卸载与 Web Slot／watch 清理的替代证据。

实现使用 `tdd` 的公开边界小步 RED/GREEN，`dsh-plugin-dev` 的真实所有者与 Fiber
生命周期，`codebase-design` 收拢运维发布和联合数据入口，`domain-modeling` 记录
[ADR 0027](../adr/0027-publish-one-isolated-migration-dataset.md)。未扩大到主发布线或修改父 Spec #18。
