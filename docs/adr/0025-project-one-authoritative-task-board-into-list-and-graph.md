---
status: accepted
---

# Project one authoritative Team task board into list and graph views

[Issue #34](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/34)
adds an interactive dependency graph beside the shared task list. The Agent
Team owner remains the only task authority and UI composition owner: list,
graph, and detail are projections of one `TeamView.tasks` result, while every
write continues through the existing revision-checked Team mutation API.

## 中文规范

公开 Agent Team 面板把同一份 Host `TeamTaskView` 同时投影为列表、依赖图和共享
详情。节点 id 是真实 `TeamTaskId`；每条边从 `blockedBy` 中的前置任务指向依赖任务。
Owner、状态、可认领性、blocker、Revision 和墓碑语义均来自 Team owner，不从可见
节点、Client 草稿或图布局推导。公开 `getTask` Remote 只把当前 Session key 交给 Host
解析精确 live Lead，并委托同一任务板详情读取。

Client 只保留可丢弃的显示状态：当前选中 id、列表／图模式、筛选文本及 viewport
变换。筛选可隐藏节点和边，但必须列出被隐藏的 blocker，且不得改变权威 readiness。
自动布局由真实依赖关系确定；缩放、平移、适配视野与键盘焦点都不提交任务写入。
原生按钮列表始终作为图的等价替代，列表与图打开同一详情，并复用原创建、编辑、
分配／取消分配、完成、重开和删除控件。

该边界刻意不引入第二套任务存储、自动调度器、图数据库、文件锁或成员启动逻辑，
也不把任务面板放进 Ultra Studio。无额外图形依赖的确定性布局使 production bundle
保持 browser-safe；公开 Team owner Slot 和所有现有注册仍随其 Fiber 释放。#35 的依赖
多选和并发草稿、#36 的 watch/reconnect 必须扩展这同一权威边界，而不是建立旁路状态。

## English counterpart

The public Agent Team panel projects the same Host `TeamTaskView` values into
the list, dependency graph, and shared detail. Node ids are real
`TeamTaskId`s, and every edge points from a prerequisite named in `blockedBy`
to its dependent. Owner, status, claimability, blockers, revision, and
tombstone semantics come from the Team owner, never from visible nodes, Client
drafts, or graph layout. The public `getTask` Remote supplies only a current
Session key for exact-live-Lead resolution and delegates detail reads to that
same task board.

The Client retains only disposable presentation state: selected id, list or
graph mode, filter text, and viewport transform. Filtering may hide nodes and
edges, but reports hidden blockers and cannot alter authoritative readiness.
Automatic layout follows real dependencies; zoom, pan, fit, and keyboard focus
perform no task mutation. A native-button list remains the graph's equivalent
alternative. Both views open one detail and reuse the existing create, edit,
assign or release, complete, reopen, and delete controls.

This boundary deliberately adds no second task store, scheduler, graph
database, file lock, member launch, or parallel Studio panel. A deterministic
layout without another graph dependency keeps the production bundle
browser-safe, while the public Team owner Slot and existing registrations
remain Fiber-scoped. Issue #35's dependency selector and conflict drafts and
Issue #36's watch/reconnect must extend this same authority boundary rather
than introduce a side channel.
