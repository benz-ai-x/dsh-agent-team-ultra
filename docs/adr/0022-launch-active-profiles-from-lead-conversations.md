---
status: accepted
---

# Launch Active Profiles from exact Lead conversations

[Issue #31](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/31)
adds a model-facing entry to the existing Profile launch boundary. The durable
Profile lifecycle, generated Remote, Launch Workflow, Agent Team roster, and
`agent_team_ultra_v1` format remain authoritative.

## 中文规范

Ultra 在每个当前及后续实时 Team Lead 的精确 Agent 作用域注册三个固定工具：
`ultra_profile_list`、`ultra_profile_detail` 和 `ultra_profile_launch`。名称冲突会
拒绝服务启动；工具不会作为可选 Profile 能力继承给队友，普通 Team teammate
会在自身作用域明确屏蔽，隔离 Evaluation Worker 则在 Agent 发布前排除。库存
`spawn_teammate` 继续创建不绑定 Profile 的普通成员。

列表和详情只读取与 Studio 相同的 Host 投影及不可变 Revision：区分 latest
Candidate 与 Active Revision，公开发布门禁、固定 Runtime Target、Required
Capabilities、当前 Runtime Availability 及既有 Binding／实例。它们不会创建、
保存、激活、回滚、归档或恢复 Profile。启动工具只接受既有 `profile_id` 和可选
assignment，并在描述中要求只有用户明确请求 Team 协作时才调用；未激活、已归档、
门禁、能力、路由、永久名称及成员上限仍由同一 Host 操作判断。

对话启动把精确 Team、Lead Agent 和 Lead Session 中持久的 `tool/call` id 在固定
命名空间下散列为 canonical UUIDv8 Launch Request ID。同一次持久工具调用在回调
重试、响应丢失、服务替换或 Host 冷恢复后得到同一 ID；规范化输入相同则返回或
恢复原 Binding，输入变化由既有流程返回 `launch-request-conflict`。新的工具调用
表示新的 Launch Intent，不复用旧 ID。

启动仍先固定 Active Revision 快照并写入 pending Binding，之后才调用 Agent Team
或耐久外部 provider；取消前后、Team 接纳、原生 handle、所选／预检／实际路由、
Provisioning Phase 和 Studio 收敛均沿用原 Launch Workflow。结果直接返回同一有界
实例 DTO。Fiber 关闭先撤销工具 schema 和监听器，再等待已接纳回调收敛；不新增
Remote 方法、Team event 或持久格式。

## English counterpart

Ultra registers three fixed tools in the exact Agent scope of every current and
future live Team Lead: `ultra_profile_list`, `ultra_profile_detail`, and
`ultra_profile_launch`. A visible name collision refuses startup. The names are
reserved outside Profile-selectable capabilities, explicitly denied in each
ordinary teammate scope, and excluded from isolated Evaluation Workers before
Agent publication. Stock `spawn_teammate` remains the unbound member path.

List and detail read the same Host Studio projection and immutable Revision
operation. They distinguish the latest Candidate from the Active Revision and
expose the Promotion Gate, pinned target, Required Capabilities, current
availability, and existing instances without authoring or releasing a Profile.
Launch accepts only an existing Profile id and optional assignment and is
described for use after an explicit user request for Team collaboration. The
same Host operation continues to enforce activation, archive, gate, capability,
route, permanent-name, and member-limit rules.

Conversation launch hashes the exact Team, Lead Agent, and Lead Session's
persisted `tool/call` id under a fixed namespace into a canonical UUIDv8 Launch
Request ID. Callback retry, lost response, service replacement, and Host cold
recovery reproduce that identity. Equal normalized input returns or resumes the
same Binding; changed input produces the existing launch conflict. A new tool
call denotes a new Launch Intent.

The existing Launch Workflow still pins the Active Revision and persists a
pending Binding before Team or external-provider provisioning. Cancellation,
acceptance, native handle, selected/preflight/resolved routes, Provisioning
Phase, and Studio convergence retain their current semantics, and the tool
returns the same bounded instance DTO. Fiber shutdown revokes schemas and
listeners before awaiting admitted callbacks. This decision adds no Remote
method, Team event, or durable format.
