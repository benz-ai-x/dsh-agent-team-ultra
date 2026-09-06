---
status: accepted
---

# Persist native messages with their operation receipts

[Issue #27](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/27) and
[Spec #18](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18), D-10,
require an accepted native message to survive a lost tool response and restart
without creating another message. This extends [ADR 0017](0017-authorize-native-team-member-queries.md)
and implements the Phase B format extension allowed by [ADR 0016](0016-audit-and-plan-format-aware-migration.md).

## 中文规范

Team mailbox 在一条必需的 `team/native-operation/committed` 事实中原子接受
消息和 Native Operation Receipt，flush 后才确认和尝试投递。发送者来自当前
Native Member Grant；模型只提供收件人名称与有意发送的文本，不能指定身份。
操作摘要绑定 Team、member、provider、native handle、turn 和 tool call，
终止结算使用独立的 settlement kind。同身份和规范化输入返回原回执，改变输入
冲突。回执的 queued 只表示持久接受，不等于送达、已读或工作完成。

旧 grant 在 owner/provider 结束后失效，即使曾经提交也不能以旧代际成功重放。
当前 Host 必须验证原持久身份并签发新 grant，才能恢复原结果。写队列开始时
再次验证权限；flush 失败不确认、不投递，重试先完成原事实的 flush。

新事实使用 payload 3，配套严格 schema、生成 Session 事件词汇、真实 codec
和 Team 投影；checkpoint 升至 stateVersion 4。既有 payload 2 事件由明确的
旧版解码分支继续读取，旧 checkpoint 从可读取的日志重建。Session 仍为 0，
Ultra domain 仍为 v1。新必需事实不能标 ignorable，旧程序不能继续写入新历史。
阶段 C 仍负责官方 Session 2 的联合迁移，本次没有提前切换官方基线。

Codex 增加 `team_message_send`，工具关联来自固定产品的 thread/turn/call
envelope。终止通知与原工作 turn 关联，经同一成员 grant 发到 Lead；只选择最终
agent message，失败和中断明确标注状态，不复制 reasoning、commentary、工具
输出或完整 native transcript。冷恢复从 native 历史取得原终止结果，重放同一
settlement。多个 Team 调用和终止消息仍属于原工作轮次，不新增 Run。

新线程安装新增工具；旧线程恢复原工具集合、handle 与历史，不能声称自动补装。
消息功能不扩大文件、shell、外部网络、审批或评测权限。真实认证验收仍属于 #44。

## English counterpart

The Team mailbox commits the intentional message and its Native Operation
Receipt in one required event, then flushes before acknowledgement or delivery.
The current member grant determines attribution. Trusted member/session/turn/call
correlation selects the receipt; terminal settlement has a separate source kind.
Identical normalized input replays the original queued acceptance, while changed
input conflicts. Revoked grants cannot replay; recovery requires newly verified
authority. Failed flushes neither acknowledge nor dispatch the message.

The event uses payload 3 and generated Session vocabulary, strict schemas and
the real codec/projection. Team checkpoints use stateVersion 4. Explicit legacy
payload-2 readers retain existing history, and stale checkpoints are rebuilt.
Session 0 and Ultra v1 remain unchanged; Phase C still owns the official Session-2
migration. Older binaries cannot ignore the required event or continue writing.

Codex maps member messages to its qualified dynamic-tool protocol. Final replies
and explicit failed/interrupted notices enter the Lead mailbox under the original
turn's settlement identity. Native history supplies cold replay without copying
reasoning, commentary or full transcripts into Team state or Run evidence.
One work turn remains one Run. New threads install the added tool; old threads
keep their original tools and identities. Execution permissions remain unchanged,
and authenticated product acceptance remains #44.
