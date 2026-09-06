---
status: accepted
---

# Authorize Claude Code Team tools through its controlled SDK channel

[Issue #29](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/29) extends
[ADR 0008](0008-activate-package-local-claude-code-runtime.md)'s fixed native
tool list with explicitly authorized Team queries and messages. The Team owner
and durable receipts from [ADR 0017](0017-authorize-native-team-member-queries.md)
and [ADR 0018](0018-persist-native-team-message-receipts.md) remain authoritative.

## 中文规范

锁定 Claude Agent SDK 0.3.241／payload 2.1.241，每个受控 query 配置一个进程内
`dsh_team` MCP server，仅声明 `team_members_list`、`team_tasks_list`、
`team_tasks_get`、`team_message_send`。内置工具仍为 Read／Glob／Grep，allowedTools
只逐个列出这四个 MCP 工具，不使用通配符。真实原生测试证明裸 Read 自动授权
会绕过权限回调并读取 cwd 外文件；移除内置工具的裸 allowedTools 条目后，工作
目录内读取仍成功，外部 Read／Glob／Grep、指向外部的符号链接均被拒绝，目录内
Grep 也不会沿链接泄露外部内容。继续禁用外部 MCP、环境配置、插件、
skills、shell、写入、外网及交互审批；Profile 工具策略和 Hooks 的资格不改变。
任务修改与等待属于 #30。Evaluation Worker 不取得生产 Native Member Grant。

调用始终使用当前 Team owner 签发的 grant。Session 与工作 turn 来自 provider
持有的 query 闭包，call id 来自原生程序的 MCP `_meta['claudecode/toolUseId']`。
锁定程序从 tool-use block 生成该元数据并传给 MCP call；SDK 原样交付给进程内
server。缺失或无效身份拒绝，不能回退到 MCP request id、计数器或模型参数。
使用 MCP 公开 request handler 保留原始 arguments，让 Host 的严格 schema 拒绝
额外身份字段；不使用会先移除未知字段的工具参数转换来掩盖非法输入。

原生请求限 16384 UTF-8 字节，完整转义结果限 65536 字节，每个 live turn 至多
64 个不同 call id。同 id 重试继续交给 Host 返回原回执或输入冲突；adapter 不缓存
业务结果。首次授权最多等待 5 秒。中断／结束取消该轮请求，代际释放撤销 grant；
异步响应返回前重新核对 grant 与 turn。所有 server、query 和请求随原 Fiber 释放。

终止结果通过同一 grant 的独立 settlement 身份持久返回 Lead；成功只选择第一个
可信最终回复，失败／中断如实标注。相同 settlement 身份重放原回执，不重复发布
结果；旧 grant 在提交后失效时，pending terminal 等同 provider 的新 grant 绑定后
再重试。成员、handle、原 Session 和不可变 Profile 始终不变，完整 transcript 不
复制到 Team／Run。既有 Team payload 4、checkpoint 5、Session 0、Ultra v1 不变。

Host 增加不向模型声明的 `turns.recover` 读取。它在当前 grant 和 Team 写队列内
flush 后，只返回该成员／provider／handle 的 launch request、发给该成员的 delivery
id 和已提交 settlement；不返回入站正文、其他成员结果或任意查询入口。结果严格
分页，adapter 遇到完整转义结果超限时缩小页长，并拒绝不前进或互相冲突的事实。
恢复在新 delivery 和 evidence 之前完成。若 flush／读取失败，adapter 保留待对账的
公开历史；同 provider 绑定当前新 grant 后重试，成功前不接受新 delivery。

新 query 在原有 launch／delivery marker 后增加原 canonical turn id 标记，不改变
turn id 算法。adapter 从 Host 事实重新计算工作 marker 与 turn id，只关联顶层用户
边界；工具结果 user block 可连续同一轮，nested／unowned 历史被排除。识别出的
畸形 turn marker、重复工作边界或不一致 launch／settlement 均拒绝。旧 transcript
没有 turn marker 时仍可由 Host 已验证的 launch／delivery 身份关联，无需反推不可逆
hash，也不为旧 Session 补装工具。

已提交 Host settlement 是终态权威，即使历史中后来出现旧代结果也不能替换文字、
状态或用量。没有已提交结果时，只接受普通非空 model 的 `end_turn`，或锁定 payload
写出的 `<synthetic>`／`stop_sequence` API 失败；缺少 terminal 结算为 interrupted。
第一个可信终态结束该轮，后续重复／冲突终态或 iterator 错误不覆盖它。多段
assistant 与纯 tool-result continuation 的 usage 合并为一个 occurrence；非法时间与
溢出 safe integer 的计数不进入规范值。API 失败诊断不进入 Team 消息。

测试沿父 Spec T-01 使用真实 Host／生成 Remote／Loader、真实 SDK/MCP/native
进程桥和 Team 持久日志；只以本地确定性模型端点替代外部模型服务。JSON／SQLite
冷恢复、缺终态、legacy marker、分页、丢回执、重复及晚到终态、同 provider 重绑、
Claude→Lead、Claude↔DSH、Claude↔Codex、权限和代际释放均走公开边界。归档安装
与历史版本升级门禁验证实际发布形态。真实凭据产品验收仍属于 #44。

## English counterpart

The pinned SDK exposes exactly four in-process `dsh_team` MCP tools for member
and task reads plus intentional messages. Only those names appear in
`allowedTools`. `Read`, `Glob`, and `Grep` remain built-ins under native cwd and
symlink confinement; shell, writes, external network, interactive approval,
Hooks, external MCP, plugins, skills, task mutation/wait, and evaluation remain
unavailable. Every Team call uses the current Host grant and the SDK-supplied
`claudecode/toolUseId`; neither model arguments nor MCP request ids confer
identity. Request, escaped-response, per-turn call, grant-wait, cancellation,
and generation checks apply at the adapter and Host boundaries.

Terminal messages use a distinct durable settlement correlation. The first
trusted terminal is authoritative and an identical retry returns the original
receipt. A result that loses authority remains pending until a current grant for
the same provider is bound. Host `turns.recover` is not a model tool: after
authorization and a Lead-Session flush, it returns paged launch, inbound
delivery, and committed-settlement facts only for the exact member, provider,
and native handle. The adapter adapts oversized pages, derives canonical work
identities, and reconciles only matching top-level transcript boundaries before
allowing evidence reads or new delivery. Failed recovery retains its public
history snapshot and retries after the same provider receives a current grant.

Committed Host settlement wins over native history. Without one, a qualified
regular `end_turn` or the pinned payload's synthetic API-failure marker supplies
the terminal; no terminal becomes interrupted. Duplicate and late terminals or
a later iterator failure do not replace the first result. Tool-result
continuations and assistant stages fold to one safe usage occurrence. Malformed
markers, timestamps, counters, or conflicting Host facts cannot become canonical evidence. Legacy transcripts may
use Host-verified launch/delivery facts when the newer turn-marker line is absent.
No transcript or new durable schema is added.

## Evidence and consequence

The SDK's [custom-tool documentation](https://code.claude.com/docs/en/agent-sdk/custom-tools)
describes in-process servers, per-tool allowedTools, and an independent built-in
tool list. The exact installed payload supplies `claudecode/toolUseId` outside
model arguments. Tests must exercise that metadata through the real MCP server,
including rejection when it is absent; transport request ids cannot provide
durable retry identity. `native-sdk.integration.spec.ts` now exercises the
unmodified SDK, packaged native executable, managed process transport, sandbox,
real Team authority and receipts against a local deterministic model endpoint.
Only dummy API authentication is supplied. Linux needs the native sandbox's
`bubblewrap` and `socat` dependencies; `failIfUnavailable` remains enabled.
This proves tool exposure, native call correlation, filesystem confinement,
final messages, API-error isolation, and public-history recovery without
claiming credentialed acceptance. No SDK private history is rewritten.
