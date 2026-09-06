---
status: accepted
---

# Complete Claude Code shared-task operations through the controlled SDK channel

[Issue #30](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/30)
applies the provider-neutral task contract from
[ADR 0019](0019-persist-native-task-operation-receipts.md) to the controlled
Claude Code channel established by
[ADR 0020](0020-authorize-claude-team-tools.md). The locked Harness owner and
its existing payload 4 / checkpoint 5 formats remain authoritative.

## 中文规范

Claude Code 的进程内 `dsh_team` MCP server 增加 `team_task_update` 和
`team_wait`，与既有成员读取、任务读取和消息发送组成明确列出的六项工具。
每次调用仍只使用 provider 当前 query 闭包中的 Team grant、canonical turn id
和 SDK 提供的 `claudecode/toolUseId`；模型参数不能选择 Team、成员、角色、
provider、handle 或 Host operation。六项工具共用原有 16384 字节请求、65536
字节完整转义响应、每轮 64 个不同 call id 和五秒 grant 等待限制。

`team_task_update` 只把严格参数映射为 Host 的 `tasks.update`。认领、释放、编辑、
依赖修改、完成、重开和删除继续由同一个 TeamTaskBoard 执行 expectedRevision、
所有权、DAG、墓碑、Lead-only 和 writeScopes 建议规则。任务变化及其 Native
Operation Receipt 在同一 Host 必需事实中提交并 flush，之后 MCP 才返回成功。
相同 turn／call 和规范化输入先于 CAS 恢复原结果，不增加 Revision；改变输入
返回 operation conflict。adapter 不缓存业务结果，也不构造 Agent 冒充成员。

`team_wait` 映射为 Host 的 `wait`，只观察调用之后的 TeamActivity。超时范围仍为
10 秒至 1 小时；取消、grant 撤销或 query 结束会停止等待。等待不保存回执、
不创建任务、不启动成员、不建立文件锁，也不释放被中断成员的任务所有权。
任务认领或依赖解除同样不会启动新 native turn。

更新不改变正在执行的 SDK query；更新后创建或恢复的后续工作 query 在同一个
native Session／handle 上取得六项工具。Profile Revision、成员、Binding、sandbox、
Read／Glob／Grep 目录约束、禁用 shell／写入／网络／交互审批／Hooks／外部 MCP，
以及 Evaluation Worker 不取得生产 grant 的边界保持不变。Runtime Catalog 的
`memberOperations` 如实声明六项 Host 操作。

测试通过公开 Host、真实 Team 持久日志、生成 Remote 和现有 Team task view，
只替换外部模型服务。确定性 SDK/MCP 场景覆盖 DSH/Claude 规则对照、CAS、DAG、
墓碑、所有权、等待、取消、丢回执、同 call 重放、Lead generation 更换和
JSON／SQLite 冷恢复。锁定的真实 SDK 与 native payload 通过本地模型端点实际
认领、编辑、完成任务并等待；归档安装和历史升级使用相同六项工具。真实凭据
产品验收仍由 #44 完成。

## English counterpart

The in-process `dsh_team` MCP server adds `team_task_update` and `team_wait`,
for six explicitly named tools in total. Every call still derives authority
from the current provider-owned query closure and uses the canonical turn plus
the SDK-supplied `claudecode/toolUseId`. Model arguments select no Team,
identity, role, provider, handle, or Host method. All six tools share the
existing request, escaped-result, call-count, grant-wait, cancellation, and
generation limits.

`team_task_update` maps strict input to the existing Host `tasks.update`
operation. The authoritative TeamTaskBoard retains CAS, ownership, DAG,
tombstone, Lead-only, and advisory write-scope rules. A task transition and
its replayable receipt commit and flush as one required Host fact before the
MCP result succeeds. An identical turn/call/input recovers that result before
CAS without another revision; changed input conflicts. The adapter holds no
business-result cache and fabricates no Agent identity.

`team_wait` delegates to the existing Host activity observer for 10 seconds to
one hour. Cancellation, grant revocation, or query shutdown ends the wait. It
stores no receipt, creates no task or file lock, starts no member, and releases
no task owner. Claiming and dependency readiness likewise do not start native
work.

An in-flight SDK query is unchanged. Subsequent new or resumed work under the
updated adapter receives the six-tool server while preserving the same native
Session, handle, member, Binding, and Profile Revision. The read-only sandbox,
workspace-confined Read/Glob/Grep, denied shell/write/network/approval/Hooks,
external MCP exclusion, and evaluation isolation remain unchanged. Catalog
metadata declares the six effective member operations.

Public-boundary tests cover DSH parity, CAS/DAG/tombstones, ownership, waits,
cancellation, lost receipts, same-call replay, Lead-generation replacement,
JSON/SQLite cold recovery, generated views, installed archives, and historical
upgrade. The pinned SDK and native payload perform real MCP task changes and a
wait against a deterministic local model endpoint. Credentialed product
acceptance remains Issue #44.
