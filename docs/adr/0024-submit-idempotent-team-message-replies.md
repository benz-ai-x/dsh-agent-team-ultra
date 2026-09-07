---
status: accepted
---

# Submit idempotent Team messages and correlated replies

[Issue #33](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/33)
adds human-authored work and replies to the Team Message Center. The Agent Team
owner remains the authority for sender resolution, persistence, idempotency,
and delivery; Ultra owns the browser interaction and retry presentation.

## 中文规范

Client 只把当前 Session id 当作 Host 查找键。Team owner 在操作时解析该键，要求
得到的精确 live Agent 仍是当前 Team Lead，并由 Host 确定 Team 和 sender。请求不能
提供或覆盖 sender／Team；明确 recipient 必须是该 Team 的 active 成员。可选 `replyTo`
必须指向同一 Team 权威日志中已存在的原消息，且不会把原正文复制进新消息。跨 Team、
未知、inactive recipient 或非 Lead 请求在任何持久追加前拒绝。

一份人类发送意图由调用方生成的 `TeamMessageRequestId` 标识，幂等范围是
`(Team, Host 解析的 sender, request id)`。recipient、字面 text 和可选 reply id 的
规范输入指纹不可变：同请求同输入返回原 message/submission；同请求改变任一输入则
稳定冲突，不追加新事实。request id 不是权限、全局主键或一次 transport attempt。

新请求用必需的 `team/message/request-committed@1` 原子保存规范输入指纹、原始 accepted
结果、可选回复关联和 queued message，并在确认前 flush。Team projection stateVersion
升至 7，保存不可变 request receipts，并让 message index 暴露 `requestId`／`replyTo`。
旧 queue 事件仍可无请求元数据地读取；旧 checkpoint 从权威日志重建；损坏或未来事件
版本安全失败。Session 0、基础 Team event 2、native-operation payload 4 和 Ultra v1
保持不变。

持久提交和投递是两个阶段。提交后 caller cancellation、Remote timeout 或连接丢失不再
拥有该消息；Team Fiber 跟踪原 message 的投递。provider 缺失时 receipt 与 queued
message 保持 `pending`，provider 回归或冷恢复后只投递原 message；只有权威 delivered
事实出现才返回 `delivered`，不会把“已接纳”伪装成完成。相同 request 的重放只读取原
结果和当前投递阶段，绝不生成第二条 queued message。

Ultra composer 在第一个 `await` 前冻结 recipient、reply、text 和 UUID request id，并按
Team 把有界 retry intent 放入 `sessionStorage`。同步双击共享同一个 in-flight intent；
业务拒绝保持可编辑草稿，未知 transport 结果保留完整 request id 与冻结内容供核对。
重新挂载、页面刷新或 Remote 重连都不会自动发送；用户必须显式选择同请求重试或新建
意图。成功提交后只做一次显式消息／成员刷新。持续 watch、自动刷新和重连状态机仍由
#36 负责。

归档验证必须从安装后的 Ultra Client 和 Harness Agent Team 包加载生产 renderer、owner
Slot 与 generated Remote，并挂载真实 AgentLoop/Agent Registry、TeamService、Session
projection、JSONL persistence 和 Loader 组合。只有受控 external provider 是测试替身；
它用 barrier 证明 durable acceptance 先返回、双击只产生一次 provider work、恢复后复用
原 message，并用缺少 request fact／重复事实的负控防止绕过。真实 Codex／Claude Code
凭据和人工产品 canary 保留给 #44。

## English counterpart

The Client supplies the current Session id only as a Host lookup key. At
operation time, the Team owner resolves that key, requires the exact live Agent
to remain the current Team Lead, and derives both Team and sender on the Host.
A request cannot supply or override either authority. Its explicit recipient
must be an active member of that Team. An optional `replyTo` must identify a
real prior message in the same authoritative Team log and never copies the
prior body. Cross-Team, unknown, inactive-recipient, and non-Lead requests fail
before any durable append.

A caller-minted `TeamMessageRequestId` identifies one human submission intent
within `(Team, Host-resolved sender, request id)`. The canonical fingerprint of
recipient, literal text, and optional reply id is immutable. Identical input
replays the original message and submission; changing any input produces a
stable conflict with no new fact. A request id is neither authority, a global
primary key, nor one transport attempt.

A new request atomically stores its canonical input fingerprint, original
accepted result, optional reply correlation, and queued message in required
`team/message/request-committed@1`, flushed before confirmation. Team projection
stateVersion advances to 7, retaining immutable request receipts and exposing
`requestId` and `replyTo` through the message index. Older queue events remain
readable without request metadata, old checkpoints rebuild from the
authoritative log, and corrupt or future event versions fail closed. Session 0,
base Team event 2, native-operation payload 4, and Ultra v1 stay unchanged.

Durable submission and delivery are separate stages. After commit, caller
cancellation, Remote timeout, or carrier loss no longer owns the message; the
Team Fiber tracks delivery of the original message. With no provider, its
receipt and queued message remain `pending`. Provider return or cold recovery
delivers only that original message. Only an authoritative delivered fact can
produce `delivered`; acceptance never masquerades as completion. Replaying the
same request reads its original result and current stage and never creates a
second queued message.

Before its first `await`, the Ultra composer freezes recipient, reply, text,
and a UUID request id, storing the bounded retry intent in `sessionStorage` by
Team. Synchronous double-clicks share that in-flight intent. A business
rejection leaves an editable draft; an unknown transport outcome retains the
complete request id and frozen fields for inspection. Remount, page refresh,
and Remote reconnect never send automatically. The user must explicitly retry
the same request or start a new intent. A successful submission performs only
one explicit message/roster refresh. Continuous watch, automatic refresh, and
reconnect state machines remain owned by #36.

Archive verification must load the installed Ultra Client and Harness Agent
Team packages through the production renderer, owner Slot, and generated
Remote while composing real AgentLoop/Agent Registry, TeamService, Session
projection, JSONL persistence, and Loader services. Only the controlled
external provider is replaced: its barrier proves acceptance returns before
delivery, a double-click creates one provider work item, and recovery reuses
the original message. Negative controls reject a missing request fact and
duplicate facts. Authenticated Codex and Claude Code product canaries remain
owned by #44.
