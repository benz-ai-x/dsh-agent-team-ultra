# Issue #38 验收记录

2026-09-08：实现与自动化验收通过，待 PR 评审及人工合并。
权威需求为 [#38](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/38)
及 [Spec #18](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18)。
本报告不关闭父 Spec，不代表 #39–#44 或真实认证 native 验收完成。

## 固定候选与输入

- Ultra 最终验证提交：`7caa05e3a951dac88eaf93067d0db1985088d966`，分支 `feat/batch-3b-provider-recovery`；起点 main `ec88d85a2ec668388ff37b0b6cba4bab3e332040`。
- 运行时实现提交：`c91a3b7116ed2862384f812b751ec665c8daa5af`；后续候选只修正旧夹具的不完整时间断言和记录，不改变产品实现。
- Harness：`57670c6b320f7f240cbad360a9f691c8598e1571`，docsDigest `331387e2a9fb7495b7160c93da853e0fe2c670b7de1f927ab8f4d0291962b675`；来源、依赖锁、持久格式与公共协议没有变更。
- 支持锁 SHA-256：`b111cef9c278e5d02ec81f906458af890492883167a9006f651500e4577659de`；pnpm lock SHA-256：`2e944f474da3ffb0d6d111aef52603ce906eb10b9e4e4cd1fb7f64f743153133`。
- 环境：Linux、Node 22.22.1、pnpm 11.7.0；Codex 0.149.1，Claude Agent SDK 0.3.241／payload 2.1.241，均为当前支持锁规定的包。

## AC → 共享证据

| AC | 公开行为与证据 |
| --- | --- |
| 1：协作期间并发恢复／替换 | [共享恢复集成](../../packages/claude-code/tests/provider-recovery.integration.spec.ts) 的 `recovers one bound member, receipts and task ownership with evaluation and watches on %s` 在 JSON／SQLite 下保留实际 Host、Team、Session、adapter 和生成 Remote。真实对话工具创建绑定员工，消息／任务已持久提交后丢回执，原调用去重；native 完成通知丢失后替换 provider，修复 Run。评测和 Studio／Team watch 同时保持活动，再关闭整个 Host 并恢复；评测成为 interrupted，旧流结束，消息／任务继续使用原身份。创建过程的取消／卸载边界同时由 [Launch 集成](../../packages/domain/tests/launch-workflow.integration.spec.ts) 覆盖。 |
| 2：原 Team/member/handle 与重新授权 | 上述共享场景在 provider 缺失时保留原 Binding／Revision／member／handle，只报告 unavailable；恢复后只有原 native thread，保留两轮 Run ID。冷恢复使用新授权在原 handle 完成已认领任务，原依赖任务变为 ready。两种实际 adapter 的 [Codex 查询](../../packages/codex/tests/member-queries.integration.spec.ts) 与 [Claude 操作](../../packages/claude-code/tests/member-operations.integration.spec.ts) 同时验证已退出 Lead 拒绝、原身份恢复和新 grant。 |
| 3：取消所有权与精确 interrupt | Launch 的 `keeps cancellation ownership at the durable %s boundary` 覆盖接受前／后归属。共享场景在 native wait 已进入后精确中断 Codex，任务仍为原 owner／revision，另一 Claude provider 仍 running 且能通过真实 MCP 读取同一任务。已有 [Codex tasks](../../packages/codex/tests/member-tasks.integration.spec.ts)／[Claude tasks](../../packages/claude-code/tests/member-tasks.integration.spec.ts) 覆盖超时、中断、旧 wait、丢回执与冷重试。 |
| 4：关闭准入、结算、静止与幂等释放 | [Run 生命周期](../../packages/domain/tests/run-lifecycle.integration.spec.ts) 的 JSON／SQLite × run/view/watch 六种组合证明已接纳的真实冷读取／修复先静止，Host 后完成卸载；DSH 与 [Codex Run](../../packages/codex/tests/recovery-lifecycle.integration.spec.ts) 均拒绝异步读取期间退出的精确 Lead。共享场景观察 native 进程退出前的 unavailable 与挂起 Fiber，另一 provider 不受影响；重复释放旧 Fiber 不清除新连接，迟到旧通道通知不改变新工作。归档门禁还证明卸载后公开入口和注册移除。 |
| 5：abort 宽限期不是硬卸载上限 | Codex `reports elapsed cleanup grace without completing disposal before the native process exits` 与 Claude `reports elapsed Claude cleanup grace while awaiting actual process quiescence` 使用实际 adapter／Cordis Fiber，只在外部进程边界延后退出。公开 Logger 先报告 grace elapsed，Fiber 仍挂起且进程仍存活；释放进程后才报告 quiescence 并完成清理。没有把超时改成提前返回。 |
| 6：B 阶段打包／Web／消息／DAG／卸载 | 同一最终 `pnpm verify` 调用 [归档门禁](../../scripts/verify-pack.mjs)：实际八归档普通解析、真实 Loader／Profile 安装、生产消息／DAG／分页／CAS／watch 和丢响应冷恢复、Web 监听、两个 native adapter 在 JSON／SQLite 上的原 member／handle 与消息／任务回执恢复，最后通过公共 CLI 卸载并检查包及 Loader 行无残留。 |

## 本次修复

Run 详情和直接 view/watch 修复工作纳入 Host 清理等待，读取合并 Host 生命周期取消，
并在异步证据读取／写入后重验精确 live Lead。Codex 恢复绑定新 grant 后补回有界
terminal 证据，避免已有最终结果但 Run 仍 unknown。两个 adapter 区分清理宽限期和
实际静止的诊断，不改变等待真实进程退出的语义。

原生终态时间可能因秒级精度或时钟差早于 Host 接受时间。现在保留真实 terminal 与
脱敏原生时间线，但不写入无效 endedAt，并明确标为 incomplete；不伪造一个较晚时间，
不放宽存储校验。共享场景证明后续真实冷启动能够读取这些记录。

## 执行结果与限制

最终 `pnpm verify` 在上述候选自然退出 0：590 strict checks／0 warnings，Host、Client、
生成 Typert／compatibility 构建，394 tests／35 files，以及完整归档门禁全部通过。
新增公开集成用例为 12 项；复用同一共享场景验证多个 AC，没有为每条 AC 重复整套旅程。

日志：`/root/workspace/issue38-provider-recovery.I3s6PT/issue-38-qualified-verify.log`。
SHA-256：`7e3125c001733492b11fc6e324223c46be3acf8931340496852a62cd43469943`。
逐条 RED／GREEN、首轮全量失败原因及修正见 [覆盖盘点](issue-38-coverage-audit.md)。
首轮的旧夹具使用 `5/15/25` 作为原生终态时间；最终断言保留该输入与原用量，并验证
它不能被报告为具有完整完成时间，而非放宽产品要求。

Host／Team／真实 JSON／SQLite／Session／生成 Remote／Loader／生产 UI 保持真实；
常规自动化只控制外部 LLM、SDK／进程响应。这里的 native 证据不等于真实账号／模型
的产品验收，后者仍由 #44 单独执行。没有更改共享 Harness，未重跑其无关 owning gates，
也没有声称阶段 C 的联合数据迁移或历史归档升级已完成。

本报告及后续 PR／通知状态是说明性文档；运行时、锁、依赖和验收输入不变时可复用
上述完整结果。实质变更必须重跑受影响回归，并由新的最终完整门禁覆盖候选。
