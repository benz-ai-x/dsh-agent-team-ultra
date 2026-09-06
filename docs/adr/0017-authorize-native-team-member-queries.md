---
status: accepted
---

# Authorize native Team queries with Host-owned grants

[Spec #18](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18), D-08/D-09,
and [#26](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/26) require native
members to query their Team without impersonating a DSH Agent or the Lead.

## 中文规范

Team 所有者提供 provider-neutral 的 Native Member Grant。Host 在 Team 成员及
native handle 已持久接受、provider 注册仍有效后，向该 provider 交付不可序列化的
调用对象。对象捕获 Team、成员、provider、确切 native handle、当前注册及存活 Lead
对象；不是模型提供的 role、Agent 或 token。恢复必须先验证原持久身份，再交付当前
grant。Evaluation Worker 不属于生产 roster，因此不会得到生产 Team grant。

Grant 的公开调用按对应成员执行 `members.list`、`tasks.list` 和 `tasks.get`，使用
同一 roster 与 task board。请求有严格运行时 schema，拒绝额外身份字段、任意 RPC
和超出本次操作集合的调用；分页及完整请求／结果都有大小限制，取消和失效返回稳定
错误。普通 DSH、生成 Remote、headless 和 Profile 管理继续要求精确 live Agent，
原 Lead-only 操作不通过这个入口提供。任务修改、消息和等待由后续 issue 实现。

注册关闭准入时同步撤销 grant，具体 handle 的释放也先撤销其调用。旧 generation
的对象不能操作新 generation；执行前及异步返回前都确认当前授权。Grant、注册对象
及其凭据不进入 Team 日志、Ultra Storage、Remote 或 Studio。查询不增加新的 Team
持久字段，原 Session／Team／Ultra 格式保持不变。

原生进程报告 inactive 时永久撤销当次 grant；后续 idle／running 报告不能复活它。
只有重新验证持久成员身份后的绑定才能签发新 grant。外部证据或身份违约、绑定失败
与 provider 替换失败都会关闭相关代际的权限；其他 Team、普通 subagent 和隔离评测
不能借此取得或改变权限。

Codex 消费固定 `0.149.1` 产品自身生成的 app-server 协议，使用 `dynamicTools` 与
`item/tool/call`，只映射三个明确的查询工具。Thread／turn／call 关联由受控 native
通道校验，模型参数不选择 grant。首次查询若早于 Host 授权完成，只能在受限时间内
等待绑定或返回不可用，不能降级为 Lead 查询。readonly、approval-never、网络禁用
和既有审批拒绝继续独立执行；本地 Team 查询不授予文件、shell、外部网络或任意 MCP。

本次具体限制为 native envelope 16384 UTF-8 字节、Host 请求 4096 字节、含 JSON
转义的完整工具结果 65536 字节，任务页最多 100 项、默认 20 项，单轮最多 64 次
查询。首次授权等待最多 5 秒；轮次中断或结束立即取消该轮查询，返回前再次检查
捕获的 grant 和轮次。超时只结束该次等待，后续合法调用仍可执行。

固定版本的 [Session 实现](https://github.com/openai/codex/blob/rust-v0.149.1/codex-rs/core/src/session/mod.rs#L644)
把启动时的 dynamic tools 写入持久历史，并在恢复时读取它们；其
[ThreadResumeParams](https://github.com/openai/codex/blob/rust-v0.149.1/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L320)
没有工具补装字段。本版本新建线程及其恢复可使用该通道；未安装这些工具的旧线程
保持原 handle 和历史，不能声明已自动获得查询工具。不得修改 SDK 私有存储或创建
替代线程来掩盖这一限制。

目录只描述实际 provider 已实现的查询操作，查询不等于完整双向协作。真实 Cordis
与持久 Team 验证授权、代际、schema、取消、结果限制及恢复；实际 Loader／Codex
协议验证模型可见查询闭环。外部 SDK／进程替身只用于确定性自动化，真实认证产品
验收仍须完成 [#44](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/44)。

阶段 B 在独立的维护 fork worktree 扩展 Team 所有者，测试、构建后记录实际新提交
和兼容性身份；共享旧源码不改动，也不冒称原 `8b4bae0b…`。这不是阶段 C 的官方
基线移植；[ADR 0016](0016-audit-and-plan-format-aware-migration.md) 的格式迁移顺序仍有效。

## English counterpart

The Team owner gives a nonserializable member grant to the current provider
after its durable member and native handle are accepted. The grant captures
the exact Team/member/provider/handle, live Lead object and registration; model
arguments cannot supply authority. Recovery verifies the original identity
before granting current access. Evaluation workers receive no production grant.

The initial operations list members, list tasks and read one task through the
existing roster/task board, with strict JSON validation, cancellation, bounded
pages/results and stable failures. DSH and Profile APIs retain exact live Agent
and Lead requirements. Registration or handle disposal revokes access before
cleanup, and obsolete objects cannot act on replacements. Grants are never
persisted or exposed through Remote/Studio; queries change no durable format.

Inactive native presence permanently revokes the current grant. Later idle or
running reports cannot revive it; a new binding requires verified durable
member identity. Invalid external evidence or identity, failed binding and
failed provider replacement close authority for the affected generation.

Codex maps only these queries onto the qualified product's dynamic-tool
protocol, verifying thread/turn/call correlation and retaining all filesystem,
approval and network restrictions. The catalog describes executable queries,
not complete collaboration. Deterministic external-process tests complement
real Loader/Team recovery; authenticated product acceptance remains mandatory.

Limits are 16384 UTF-8 bytes for the native envelope, 4096 for the Host request,
65536 for the complete escaped tool result, 100 tasks per page (default 20),
and 64 queries per native turn. Authorization startup waits at most five seconds.
Interruption or turn completion cancels that turn's queries, and the captured
grant/turn are checked again before returning. A timed-out wait does not disable
later authorized calls.

The qualified Codex version persists the dynamic tools supplied at thread start
and restores them from native history. Its resume request cannot install new
tools. Threads started with these queries retain them on resume; older threads
without the definitions keep their original handles/history and are not claimed
to have acquired the query channel. The adapter does not edit private SDK storage
or replace threads to hide that limitation.
