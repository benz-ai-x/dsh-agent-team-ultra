# #40：双 native 与协作面板的新基线验证

历史记录：本文保留当时提交的定向验证／审查进度。最新的 PR 联合验收、支持资格与
AC 收口见 [PR #63 联合验收](pr63-studio-acceptance.md)；下文的草稿、待确认或未完成
描述均属于原阶段，不覆盖最新记录。原命令、输入、失败和验证局限保持不变。

状态：实现与 Issue 定向验证完成，待 Batch 4 PR #63 集中验收。没有切换 main、关闭
Issue 或宣称真实认证通过。配套移植在 #39 的同一 Harness 合并提交中完成；本项没有为
已经保留的行为新增另一套实现。

输入：Ultra `b27f3cc`（运行代码与 #39 `49d0366` 相同）；Harness
`3c38b1d4e8bf219750203e44b1df033ced754e92`，固定官方 `d347e703`，正式候选锁与文档
摘要不变。Node 22.22.1／pnpm 11.7.0／Linux arm64；built CLI 使用隔离官方 Node 22
同 ABI 127。两个 provider 仍使用锁定的 Codex `0.149.1` 与 Claude Agent SDK
`0.3.241`／native `2.1.241`，没有升级 SDK、放宽权限或替换 Team 所有者。

## 已运行证据

- `pnpm exec vitest run` 选择 Codex 的 `member-tasks`、`member-queries`、
  `studio-capabilities`、`recovery-lifecycle`，Claude 的 `member-tasks`、
  `member-operations`、`provider-recovery`，Domain 的 `studio-members`，以及 UI 的
  `message-center`、`mount`、`studio`：**145/145，11 文件**，
  日志 `issue40-native-ui-focused.log`。
- Harness `pnpm exec vitest run packages/experimental/client-ui-agent-team/tests`：
  **63/63，3 文件**，日志 `issue40-harness-team-ui.log`。
- Harness `vitest.e2e.config.ts` 下的 `native-member-loader.e2e.ts`：**1/1**，
  真实 built CLI／Cordis Loader 与 Team owner，日志 `issue40-harness-native-loader.log`。
- 复用同一候选 #39 的完整 Host／Client／Typert 构建、590 strict、Team owning tests、
  generated Remote、Web 五项及 SDK replay；不为 Issue 重跑完整归档旅程。

## AC 映射与边界

| AC | 定向证据 | 未完成部分 |
| --- | --- | --- |
| durable runtime／grant／operation／Remote／UI | 维护版 Team owner 保留全部接口；双 provider 集成与 Loader 场景通过 | #43 最终归档闭包 |
| 固定 SDK、共用 Host 流程、权限 | Profile 对话工具与生成 Remote 启动，精确成员权限、不可用能力准入和替换后重绑定 | #44 有效本地认证 |
| 丢回执、旧代际、一个 native 工作轮次一个 Run | 两种真实 JSON／SQLite 存储；实际 Team 提交后模拟外部响应丢失，重试／冷恢复保留原 message／task／member／handle；迟到旧通知不覆盖新工作 | #43 完整历史升级矩阵 |
| 面板／消息／Studio／分页／重连／browser-safe | Studio 绑定与路由、消息去重／分页／重连／错误状态、DAG／CAS／键盘、独立 Client bundle、watch 关闭等待 | #43 整套安装后 GUI 与卸载 |
| 保留可核验批次、不提前发布 | PR #63 为草稿，以未合并 PR #62 分支为 base；候选锁仅隔离分支 | #41／#42／#43 收口后才请求正式评审与人工合并 |

公开持久化、Team、Host、生成 Remote 和 Cordis 生命周期均是真实实现；受控替身只在
外部 LLM／Codex app-server／Claude SDK 和进程边界。测试明确检查提交后的任务 CAS、
消息回执与终态、grant 失效、旧 Fiber 重复清理、另一 provider 继续工作和原身份冷恢复。
这些场景不是 native 真实认证验收，也不证明尚未实现的旧数据联合迁移或 v2 attempt 用量。

本项没有新增运行时缺陷或单独 RED。移植相关 RED／修复包括 #39 中旧物理文件名导致
的真实持久写失败注入失效、v2 Web 场景，以及维护版历史事件与严格 receipt token 解码；
本项沿用这些修复后的公开回归验证，不制造假失败来伪报 TDD。
