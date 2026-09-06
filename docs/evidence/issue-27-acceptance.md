# Issue #27 acceptance

需求：[Issue #27](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/27)，
父 [Spec #18](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18)。
实现决策：[ADR 0018](../adr/0018-persist-native-team-message-receipts.md)。
Harness 固定为 `9649602da984ff1f3aeb8f3b30dc4ad0d6d32391`，Session 0、
legacy Team payload 2、native operation payload 3、Team checkpoint 4、Ultra v1。

| 验收条件 | 可重跑证据与结论 |
| --- | --- |
| 权威 mailbox、flush 后确认／投递、真实发送者、queued 语义 | Harness `native-member-operations.spec.ts` 的真实 flush 失败／重试案例；Ultra [Codex 集成测试](../../packages/codex/tests/member-queries.integration.spec.ts) 读取实际 Session 持久记录，断言成员发送者、目标、queued 回执；Codex↔DSH 往返保留线程。 |
| 可复用持久接受／回执及可信调用关联 | Harness 同一 `team/native-operation/committed` 包含 message 和 receipt，schema／projection 验证摘要、成员、native handle 与 source；工具 JSON 不授予身份。消息与终止结算共用 mailbox。 |
| 丢回执、重启、同输入重放、改输入冲突、旧代际拒绝 | Ultra 丢 native 回复后的完整 Host 重启测试恢复原回执，权威日志仍仅一个操作；Harness `recovers the original native receipt...` 与 `keeps a committed message when provider retirement...` 验证旧 grant 拒绝和新 grant 恢复。 |
| 最终／失败／中断结果持久回 Lead，结算不重复 | Ultra 在线结果、failed/interrupted 文本状态、JSON／SQLite 离线完成和重复 Host 重启测试；Harness settlement 重放覆盖原回执。超大 UTF-8 结果明确截断，保留完整请求限额。 |
| 正式版本、schema、codec、投影，单一 Team 状态 | Harness 生成事件词汇、严格 payload-3 schema、真实 Session 编解码、checkpoint 4 及显式 legacy payload-2 reader；真实 Loader 和 authored recorded-session 回放。Ultra [审计测试](../../packages/domain/tests/migration-audit.integration.spec.ts) 验证新关联和脱敏格式报告。 |
| 真实持久故障、一个工作轮次一个 Run、不复制 transcript | Team 持久提交参与丢回执和 flush 故障；Ultra 多个 Team 调用与最终结果只产生一个 bound employee Run，按需详情为 completed／7 Tokens；Snapshot、Run 及审计不含消息正文、commentary 或 reasoning。 |

2026-09-06 本地验证：`pnpm context:check:strict` 554 项／0 警告；完整
`pnpm verify` 273 项测试／22 文件、八归档实际安装、成员消息／回执重放／终止
结果、JSON／SQLite 原身份恢复、真实 Web 启动和卸载全部通过。归档断言位于
[probe-codex-continuity.mjs](../../scripts/probe-codex-continuity.mjs)。
Harness owning tests 199 项，相关源码覆盖率 100%；build、32 项 doc-sync、
全 lint、push hook 类型检查、built Loader 与 recorded replay 均通过。

自动化只替换外部 app-server／LLM 边界，Team、Host、Loader、持久化与实际归档
均使用产品代码。真实认证 native 产品验收仍属于 #44；旧 Codex 线程保留原工具
集合，不声称通过 resume 补装新工具。Standards／Spec 审查和 PR 合并状态以 PR
实时记录为准，此验收记录不代表 PR 已获批准或已合并。
