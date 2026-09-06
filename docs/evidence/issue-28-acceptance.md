# Issue #28 acceptance

需求：[Issue #28](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/28)，
父 [Spec #18](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18)。
实现决策：[ADR 0019](../adr/0019-persist-native-task-operation-receipts.md)。
Harness 固定为 `d02bfcdf13171e1167ece7b4ea29938900678de9`，Session 0、
legacy Team payload 2、native operation payload 4、Team checkpoint 5、Ultra v1。

| 验收条件 | 可重跑证据与结论 |
| --- | --- |
| 共享任务读取、认领、更新、完成与等待，由 Codex 调用 | [Codex 工具集成](../../packages/codex/tests/member-queries.integration.spec.ts) 与 [任务场景](../../packages/codex/tests/member-tasks.integration.spec.ts) 通过实际 adapter、app-server 动态工具及真实 Host grant 执行。注册目录声明六项成员操作，任务更新回执保持大小限制。 |
| 同一 expectedRevision、DAG、墓碑、所有权和 Lead-only 规则 | 同一任务场景分别由真实 DSH 成员与 Codex 执行，比较 14 个结果；过期写入返回当前版本，阻塞任务不能认领，循环依赖和带后继的删除被拒绝，墓碑不可认领，重新打开清除所有者。Harness 的普通与 native 写入口共用任务转换规则。 |
| 丢回执／冷恢复保留原结果和 Revision，改输入冲突 | 工具回复在 Host 提交后丢失，存活调用重试返回原结果；完成后的旧认领重试仍返回原 Revision 2，当前任务保持 Revision 3。Harness 完整 Host 重启重新授予 grant 后重放原回执、拒绝冲突及旧 grant；Ultra JSON／SQLite 两次冷恢复只保留一次原任务提交和一次中断结算。 |
| wait 只观察，不启动成员／创建文件锁，中断保留所有权 | 真实依赖完成唤醒 wait；超时范围 10 秒至 1 小时，超时与中断有明确结果。重叠 writeScopes 只给建议，解除依赖保持后继 pending；没有新增 native 线程或工作轮次，任务所有者在中断后保留。 |
| 现有任务 UI 可见，DSH／Codex 语义一致，执行权限不扩大 | [真实 TeamAction 场景](../../packages/codex/tests/member-task-ui.client.spec.tsx) 从 Host 权威视图展示 Pending → In progress／Codex owner → Completed；同角色场景验证语义一致。外部传输夹具断言 read-only／approval-never，并返回禁用网络的策略，由实际 adapter 校验；完整回归保留原生权限、评测隔离、Profile 和 Run 规则。 |

自动化仅替换外部 app-server／LLM，Team、Host、任务投影、Session 持久化、Loader
及归档使用产品代码。原生 SDK／payload 已按锁定版本资格检查；真实认证产品验收
仍属于 #44。旧线程保留原工具集，不通过 resume 补装工具。

Codex 冷恢复不会恢复已经死亡的工具 RPC callback，也不允许历史 turn 重新写入。
存活 native 工具重试、Host 持久回执重放和 Codex 冷启动中断结算分别验证；不声称
向已死亡的 native 调用重新送达结果。相同输入以规范化 JSON 值比较，不承诺键顺序。

Harness 的 [原回执重启及真实 flush 故障测试](https://github.com/benz-ai-x/deepseek-harness_x/blob/d02bfcdf13171e1167ece7b4ea29938900678de9/packages/experimental/agent-team/tests/native-member-operations.spec.ts)
覆盖完整 Host 重建、旧 grant、持久写入失败重试及原 Revision。222 项 owning tests
通过，业务源码语句、分支、函数、行覆盖均为 100%；未改动的公共 testkit 不在业务源码
覆盖选择内。真实 Loader、Host build、完整 lint、32 项 doc-sync 和正常提交／推送
检查通过。TS SDK 真实进程与 Python 实际单文件运行时录制及回放保留新任务事实。
两个 SDK 的格式证据基于 `7efa653185`；其后的注册名单补修没有改变持久格式。
普通 inline-image SDK 快照受机器全局技能注入影响，已在干净 #27 基线复现；未更新
无关快照，也不将相关 SDK 定向通过表述为全部 SDK 测试通过。

2026-09-06 最终完整 `pnpm verify` 退出 0：562 项 strict 检查／0 警告，281 项测试／
24 文件，八归档安装、任务／等待／丢回执重放、JSON／SQLite 原身份冷恢复、真实 Web
启动及完整卸载通过。固定官方与维护 fork 的 11 组公共行为对照及拒绝导入检查通过。
UI 的 Host 加载设置只作用于专用 Vitest project，现有 92 项相关回归先通过，随后
完整测试集通过。此次使用现有任务组件，未改变界面视觉设计。
归档任务、等待、丢回执重试及 JSON／SQLite 冷恢复断言在
[probe-codex-continuity.mjs](../../scripts/probe-codex-continuity.mjs)。
Standards／Spec 审查和合并状态以 PR 记录为准，验收记录不代表已获批准或已合并。
