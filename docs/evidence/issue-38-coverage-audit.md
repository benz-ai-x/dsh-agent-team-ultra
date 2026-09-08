# #38 覆盖盘点：尚未验收

日期：2026-09-08。权威需求为 [Issue #38](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/38)
及其引用的 [Spec #18](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18)。
本次回读 #38 为 OPEN，六条 AC 均未勾选，正文更新时间为
`2026-09-08T10:48:53Z`。本文保留开工盘点并追加定向验证，不是通过报告；不更新远端 AC。

## 已核验的基线

- Ultra：`ec88d85a2ec668388ff37b0b6cba4bab3e332040`；分支 `feat/batch-3b-provider-recovery`。
- Harness：`57670c6b320f7f240cbad360a9f691c8598e1571`，来源与构建按 [锁](../../dsh-reference.lock.json) 严格校验，未改源码或锁。
- Node 22.22.1、pnpm 11.7.0；正式来源准备及 frozen/offline install 已通过。
- `pnpm context:check:strict`：590 checks、0 warnings。
- `pnpm build`：Host、Client、生成 Typert 和 compatibility proof 均通过。
- `pnpm test packages/domain/tests/launch-workflow.integration.spec.ts packages/domain/tests/profile-workflow.integration.spec.ts packages/domain/tests/pinned-route.integration.spec.ts`：20 tests／3 files 通过。
- 日志位于本 worktree 父目录：`pre-edit-strict.log`、`coverage-audit-strict.log`、`baseline-build.log`、`baseline-focused.log`。基线阶段没有新增测试、运行完整 `pnpm verify` 或进行真实认证 native 验收。

## 六条 AC 与现有证据边界

表中“已有”表示已检查相应代码和断言；只有上一节列出的 20 项在本次开工运行。
其他测试和归档探针尚未在 #38 候选上执行，不能据此勾选 AC。

| AC | 已有测试／入口 | #38 仍需证明的内容 |
| --- | --- | --- |
| 1：并发恢复／替换 | [Launch 集成](../../packages/domain/tests/launch-workflow.integration.spec.ts) 的真实 Host 冷恢复；[Profile 集成](../../packages/domain/tests/profile-workflow.integration.spec.ts) 的评测中断；[Codex Run](../../packages/codex/tests/member-queries.integration.spec.ts) 的一个工作轮次对应一个 Run | 创建、消息／任务回执、最终结算、Run 修复、评测和 watch 不能只分别通过；最终 PR 需覆盖这些工作共存时的 Host／provider 故障。 |
| 2：原身份、授权和可用性 | [Codex](../../packages/codex/tests/member-queries.integration.spec.ts) 与 [Claude](../../packages/claude-code/tests/member-operations.integration.spec.ts) 的旧授权撤销、provider 回归、原 handle；[Launch 集成](../../packages/domain/tests/launch-workflow.integration.spec.ts) 的 JSON／SQLite Binding 恢复 | 原生成员恢复需同时保留真实持久的 Ultra Binding、Profile Revision 和 Team 身份，不能以仅普通成员或内存 sidecar 的示例代替。 |
| 3：取消归属与精确中断 | Launch 集成的 Binding／Team 接受边界；[Claude task 集成](../../packages/claude-code/tests/member-tasks.integration.spec.ts) 的 wait 中断后所有权保留；[Codex task 集成](../../packages/codex/tests/member-tasks.integration.spec.ts) 的对应路径 | 同时存在另一 handle／provider 时，中断不能串代或产生旁路影响；已提交回执必须由新授权恢复，不重新认领或重复提交。 |
| 4：关准入、结算、静止、幂等释放 | [Host 卸载顺序](../../packages/domain/src/index.ts)；[Runtime catalog](../../packages/domain/src/runtime.ts) 的两侧注册；锁定 Harness 的 provider retirement 与 mount owner 生命周期 | 通过公开入口验证已接受工作在存储关闭前结束，重复 Fiber／注册清理不会再次清理新代际。Run 路径的跟踪范围需要首先验证，见下节。 |
| 5：忽略 abort 与真实静止 | 锁定 Harness `teammate-runtime.spec.ts` 中 `keeps provider retirement pending until an admitted operation reaches quiescence`、`aborts but still awaits a native disposer until it reaches quiescence` | 这些旧用例直接访问内部 runtime registry，且使用实际时间等待；不是 #38 新公共边界验收。需通过已确认的公开边界观察准入关闭、abort 宽限期和最终真正静止，不能宣称固定卸载上限。 |
| 6：打包、Web、消息／DAG 恢复、卸载 | [统一归档门禁](../../scripts/verify-pack.mjs)、[消息／任务 UI 探针](../../scripts/probe-packed-message-center.mjs)、[Codex 连续性](../../scripts/probe-codex-continuity.mjs)、[Claude 连续性](../../scripts/probe-claude-continuity.mjs) | 扩展现有归档旅程并在最终候选统一运行；各 Issue 不重复安装／启动／卸载一遍。必须保留完整包闭包、真实存储和生成 Remote／生产 UI，外部替身不算 #44 认证验收。 |

### 不能复用为完整真实恢复证据的旧夹具

[pinned-route 集成](../../packages/domain/tests/pinned-route.integration.spec.ts) 中
`keeps one native identity across Ultra restart, provider absence, and multiple turns`
使用真实 Team JSONL，但 Ultra sidecar 是 `installMemoryStorageDomain`，并直接清除
内存 Run 表。它可证明部分路由行为，不能单独证明真实 JSON／SQLite Ultra 冷恢复。

应优先复用 [Host workflow](../../packages/domain/tests/fixtures/host-workflow.ts) 的真实
Session／Team／JSON／SQLite，以及其上的 [Codex workflow](../../packages/codex/tests/fixtures/member-workflow.ts)
和 [Claude workflow](../../packages/claude-code/tests/fixtures/member-workflow.ts)。两者保留实际
adapter，只控制外部协议／SDK；现有归档连续性探针也已使用真实 Profile Binding。

## 开工检查方向：Run 工作是否全部纳入卸载等待

以下描述开工基线，公开读取部分已由后续 RED → GREEN 修复：

- [RunWorkflow](../../packages/domain/src/run-workflow.ts) 的 `whenSettled()` 只等待 `runRepairs`；只有 `scheduleRunRepair()` 向该集合加入工作。
- `runEvidence()` 在等待 Session 或外部证据后写入 Run Index，没有加入上述集合，使用的是调用者 signal。
- `remoteView()`／`watch()` 直接调用 `repairTeamRuns()`；这些调用本身不通过 `scheduleRunRepair()` 登记。
- [Host 清理](../../packages/domain/src/index.ts) 在 `runWorkflow.whenSettled()` 后关闭 storage；[Host context](../../packages/domain/src/host-context.ts) 的 mutation queue 也不自动收集直接的 Run 写入。

公开冷 Run 读取已在两种真实存储下复现提前卸载并修复。直接 view 准备阶段也已通过
公开入口复现同类缺口并修复；JSON／SQLite 的 run、view、watch 六种组合均通过。

## 定向 TDD 进展

- `run-lifecycle-red.log`：JSON／SQLite 均先完成 Fiber 卸载再结束已接纳冷读取；`run-lifecycle-green.log`：2 tests 通过。
- `run-authority-red.log`：DSH 冷读取仍向已退出 Lead 返回成功；`run-authority-green.log`：修复及 Launch 回归 10 tests 通过。
- `native-run-authority-red.log`：实际 Codex adapter 的同类旧 Lead 读取仍成功；`native-run-authority-green.log`：两种读取边界 4 tests 通过。
- `native-quiescence-red.log`／`claude-quiescence-red.log`：实际 adapter 的原生进程保持未退出时没有宽限期诊断；`claude-quiescence-green.log`：三个新文件共 6 tests 通过。替身只控制外部进程何时退出，Host／Team／持久化／adapter 保持真实。
- `combined-recovery-first.log` 和 `combined-recovery-second.log` 是夹具缺少显式导入／MCP 身份元数据，不是产品 RED。`combined-recovery-third.log` 真正复现 Codex 恢复后的 Run 终态仍为 unknown；补充终态证据后，`combined-recovery-fourth.log` 暴露秒级原生时间早于 Host 接受时间导致下次冷启动拒绝 Run 记录。
- `native-clock-red.log` 固定不一致时钟证明详情虚报完整并保留早于开始的 endedAt。修复保留真实 terminal 和原生时间线，不伪造完成时间；`native-clock-green.log`：完整 JSON／SQLite 共享恢复与 Run 回归 11 tests 通过。最终 PR 完整门禁仍未执行。
- `combined-recovery-final.log`：共享场景加强后 3 tests 通过，覆盖旧代际迟到通知不改变新工作、重复旧 Fiber 清理不影响新 grant、冷恢复后原 handle 完成原任务并使依赖任务 ready。`recovery-focused.log` 的较早相关回归为 111 tests／11 files 通过，不替代最终门禁。
- `snapshot-lifecycle-first.log`：直接 view 的真实冷 Run repair 未静止而 Host 已卸载，4 tests 中 1 项 RED。`snapshot-lifecycle-green.log`：跟踪直接 repair 后 4 项通过；`snapshot-lifecycle-matrix.log`：扩展 JSON／SQLite 的 run、view、watch 与旧 Lead 回归共 7 项通过。
- 实现提交 `c91a3b7116ed2862384f812b751ec665c8daa5af` 首次完整验证为 393 通过／1 失败，尚未进入归档阶段（`issue-38-final-verify.log`）。唯一失败是旧内存 native 夹具输出 `5/15/25` 作为终态时间却要求当前真实 Team 的完整时间；保留输入并明确断言 incomplete、原终态／用量及缺失 endedAt。对应真实恢复、旧路由和 Run fold 共 17 tests 通过（`legacy-clock-expectation-green.log`）；仍须对最终候选重跑完整门禁。

## 后续执行

用户已确认 `tdd` 所要求的公共测试边界，继续逐条 RED → GREEN。开发时只运行相应
改动的最小有效回归；上述共享场景的完整矩阵及 `pnpm verify` 在 Batch 3B 最终 PR
候选统一执行。不得批量写想象中的失败测试、替换内部持久化或提前勾选 AC。

本次使用 `tdd` 确定测试边界与暂停点，使用 `dsh-plugin-dev` 核对真实持久化、
Host／Client 和生命周期证据。用户已确认飞书 bot 私信当前用户及逐项完成通知范围；尚未发送。
