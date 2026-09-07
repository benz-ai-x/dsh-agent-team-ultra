---
status: accepted
---

# Compose persisted Team message reads through the owner panel

[Issue #32](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/32)
adds a Lead-only message center to the existing Agent Teams panel. The Agent
Team Session log remains authoritative for messages and delivery facts; Ultra
contributes presentation through public generated Remote and Slot contracts.

## 中文规范

Harness 的 Agent Teams Client 继续唯一拥有会话头部入口、弹窗和顶层导航。它发布
session-scoped 子 Slot `agent-team.panel.view`，owner props 只包含由现有会话地址解析的
`teamSessionId`。Ultra 在该 Slot 注册稳定 id `messages`，使用公开 Team Client 类型和
Slot props 渲染消息中心；不导入、复制或替换 Harness Team UI 的私有组件，也不重复
挂载 Agent Team Remote。

消息读取只通过 Team 所有者生成的 `agentTeams.listMessages` 和
`agentTeams.getMessage` Remote。Client 传入 Session id 仅作为 Host 查找键；Host 在
事务进入、持久 flush 前后都重新解析同一个精确 live Agent，并要求它仍是当前 Team
Lead。过期对象、普通 teammate、伪造持久 sender、非 Team participant、跨 Team
cursor、变更后的查询和损坏或未来 cursor 都拒绝。Opaque cursor 是固定查询窗口的
标识和完整性载体，不是权限凭据；每次读取仍以 live Lead 身份授权。

首个 list 在 flush 后固定 Team id、规范化筛选和已提交 `through` Session sequence。
结果按 queue sequence 从新到旧排序，limit 默认为 20，范围为 1–100；continuation
再加入排他的 `before` sequence。每页只返回稳定 message id、Host roster 解析的
sender／recipient、queue 时间及截至固定 `through` 的 delivery stage，并返回同一个
committed window cursor、可选 next cursor 和明确完整性。后续 Team 事件不会改变旧
cursor 的顺序或投递结论。

正文只在用户选择某行后通过 message id 和 committed cursor 读取。Host 原样保留
intentional text，由 React 作为文本渲染；image 仅公开 media type、字节数和尺寸，
不公开 attachment id、路径或数据。reasoning、tool call/result、provider-private 及
未知 block 统一替换为 omitted 标记，并返回 `complete | partial | unavailable`、
omitted count 和安全 parts。列表响应、Studio Snapshot、Run Index 和 Ultra storage
都不包含正文；读取来源只限权威 Team log，不复制 raw native transcript 或凭据。

`pending` 表示固定窗口内没有 delivery acknowledgement；`delivered` 只表示该 ack
已提交，并包含其时间；`unknown` 为公开 Client 合约保留，要求无法证明当前事实时
显式显示。三者都不表示接收者已读，也不表示任何共享任务或原生工作完成。UI 使用
独立文案展示投递含义、正文省略和不可用状态。

Team projection stateVersion 从 5 升至 6，新增由既有 queue/delivered 事件重建的
message index：message id、queue sequence/time 及可选 delivered sequence/time。
没有新增 Team event、native-operation payload、Session 格式或 Ultra storage
generation。旧 checkpoint 因版本变化从原日志重建。

Harness 的 owner Slot、导航 roster 和 locale 监听器随其 Fiber 清理；Ultra 的 child
Slot、locale 和 generated Digital Employee Remote 随 Ultra Fiber 清理。发送、回复和
幂等写入由 #33 负责；实时订阅、断线重连和 stream generation 由 #36 负责。

## English counterpart

The Harness Agent Teams Client remains the sole owner of the conversation
header entry, dialog, and top-level navigation. It publishes the session-scoped
`agent-team.panel.view` child Slot whose owner props contain only the
`teamSessionId` resolved from the existing conversation address. Ultra
registers stable id `messages` in that Slot and renders with public Team Client
types and Slot props. It does not import, copy, or replace private Harness Team
UI components, and it does not mount another Agent Team Remote.

Reads use only the Team owner's generated `agentTeams.listMessages` and
`agentTeams.getMessage` Remote operations. A Client Session id is a Host lookup
key. The Host resolves the same exact live Agent before entering the
transaction and again around the durable flush, and requires it to remain the
current Team Lead. Stale objects, ordinary teammates, forged persisted senders,
non-Team participants, cross-Team cursors, changed queries, and corrupt or
future cursors fail closed. The opaque cursor identifies a fixed query window
and detects corruption; it carries no authority. Every read still requires the
live Lead.

The first list fixes the Team id, normalized filters, and committed `through`
Session sequence after flush. Results use newest-first queue sequence order.
The limit defaults to 20 and is bounded from 1 through 100; a continuation adds
an exclusive `before` sequence. Each page contains only stable message id,
Host-roster sender and recipient, queue time, and delivery stage as of the fixed
`through`, plus the same committed-window cursor, an optional next cursor, and
explicit completeness. Later Team events cannot change ordering or delivery
facts observed through an older cursor.

Content loads only after the user selects a row, using its message id and the
committed cursor. The Host retains intentional text literally and React renders
it as text. An image exposes only media type, byte count, and dimensions, never
its attachment id, path, or data. Reasoning, tool call/result,
provider-private, and unknown blocks become omitted markers. The response says
`complete | partial | unavailable`, reports the omission count, and returns
only safe parts. List responses, Studio Snapshots, the Run Index, and Ultra
storage contain no body. Reads use only the authoritative Team log and never
copy a raw native transcript or credential.

`pending` means no delivery acknowledgement exists inside the fixed window.
`delivered` means only that the acknowledgement committed and includes its
time. `unknown` remains explicit in the public Client contract when a current
fact cannot be proven. None means that a recipient read the message or that a
shared task or native operation completed. The UI states those semantics and
shows separate omission and unavailable copy.

Team projection stateVersion advances from 5 to 6 with a message index rebuilt
from existing queue and delivered events: message id, queue sequence/time, and
optional delivered sequence/time. This adds no Team event, native-operation
payload, Session format, or Ultra storage generation. Older checkpoints rebuild
from their original log because the projection version changed.

The Harness owner Slot, navigation roster, and locale listeners dispose with
its Fiber. Ultra's child Slot, locale, and generated Digital Employee Remote
dispose with the Ultra Fiber. Issue #33 owns send, reply, and idempotent writes;
#36 owns live subscription, reconnect, and stream-generation behavior.
