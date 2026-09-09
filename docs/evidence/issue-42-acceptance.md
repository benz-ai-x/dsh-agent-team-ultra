# #42：v2 Run 用量与完整性定向证据

历史记录：本文保留当时提交的定向验证／审查进度。最新的 PR 联合验收、支持资格与
AC 收口见 [PR #63 联合验收](pr63-studio-acceptance.md)；下文的草稿、待确认或未完成
描述均属于原阶段，不覆盖最新记录。原命令、输入、失败和验证局限保持不变。

状态：实现与 Issue 定向验证完成，待 PR #63／#43 集中验收。没有合并、切换 main、
关闭 Issue 或执行 #44 真实认证；最终历史转换到 Studio 的完整链路仍由 #43 汇总。

输入：Ultra 父提交 `04b2c9f2ed1e3e1f8357dd774881f41b44d916e4` 加本证据所在提交。
Harness 仍为干净 `3c38b1d4e8bf219750203e44b1df033ced754e92`，固定官方
`d347e703908d0406b7a7ef80e3a0e594d86b2215`；源码锁、格式、SDK/payload 未改。
Linux arm64，Node 22.22.1／pnpm 11.7.0。生产修改仅 Run 折叠，不新建存储代际。

## 三个公开 RED → GREEN

测试 `packages/domain/tests/v2-run-usage.integration.spec.ts` 注册可控的外部 LLM
adapter，其他路径均为真实 Agent Loop、Session v2 持久化、Team、Profile、Host、
生成 Remote 和 JSON／SQLite。不是手写一个 Run 结果来断言自身。

- `issue42-v2-usage-red.log`：真实日志由官方 helper 展开得到失败 14 和成功 7，只有
  一次 `turn/start`；Remote 实际返回 7。接入 attempt 后 `issue42-v2-usage-green.log`
  9/9（连同既有 Run owning tests）通过。
- `issue42-missing-terminal-red.log`：保留真实有内容和用量但没有 finish 的模型流，
  真实 Loop 提交 turn-end 后 Remote 仍显示 complete。修复后明确 incomplete；
  `issue42-missing-terminal-green.log` 10/10 通过。
- `issue42-partial-total-red.log`：成功请求只报告 input/output、没有 aggregate total，
  Run 却把失败请求的 14 作为完整 total。修复后保留已知 input/output，省略缺少完整
  来源的 total；`issue42-partial-total-green.log` 13/13 通过。

最终公开场景还验证同一次失败请求的累计快照 `9→14→14` 只计最后一次；第二次请求
仍在 streaming 时，Remote 保持已持久化的 14／unknown-terminal／incomplete，提交
成功消息后才变为 21。message 顶层 usage 和内嵌 usage 不重复累加。JSON／SQLite 冷
恢复保留同一 Run/member/Revision/actual route，重复读取不增行，结果没有 `PRIVATE_`
正文／错误内容。没有 finish 时冷恢复仍 incomplete，而非因重启补造完整证据。

## 已运行回归

- `pnpm exec vitest run`：Domain `v2-run-usage.integration`、`run-evidence`、
  `run-lifecycle.integration`、`profile-workflow.integration`；Codex
  `member-queries.integration`；Claude Code `member-operations.integration`；UI
  `studio.client`：**112/112，7 文件**，16.40s，`issue42-focused-owner.log`。
- 运维迁移 `migration-execution.integration.spec.ts -t 'rebuilds the missing|reconstructs.*native'`：
  实际选中 **DSH JSON／SQLite 2/2**，22 skipped，9.72s，
  `issue42-migration-run-regression.log`。正则没有选中 native，不扩大此日志结论。
- 另用 `-t 'rebuilds native'` 验证原生关联的独立重建场景，结果见
  `issue42-migration-native-regression.log`：**JSON／SQLite 2/2**，22 skipped，8.54s。
- `pnpm build` 完整 Host／Client／Typert／compatibility／Profile 构建通过，日志
  `issue42-partial-total-build.log`；strict **648／0 warnings**，
  `issue42-final-strict.log`。文档链接和 `git diff --check` 另行核验。

## AC 映射与 PR 边界

| AC | 定向证明 | 仍归 PR 的验证 |
| --- | --- | --- |
| 官方 helper 与 message authority | 真实 Loop 的失败／成功 settlement，last snapshot、顶层优先 | 同一最终候选重验 |
| 14＋7、不重复累计 | v2 live→settled→cold，DSH 累计快照；既有 native 最新快照 fold、双 provider 真实 owning 回归 | 完整双 native 历史归档恢复 |
| 一个工作轮次一个 Run | 同 turn 两次 provider attempt、原成员／Revision／route；既有多阶段 native 工具／重试场景 | 最终安装后跨模块旅程 |
| 缺失证据、可重建、无原文 | missing finish 和 live 缺 turn-end；既有缺关联／provider、权限与生命周期；迁移派生索引重建与 PRIVATE 负断言 | 完整历史矩阵和 UI 冒泡 |
| v2→Remote→Studio 与历史 | 已验证真实 v2→Remote 和既有 Studio 表达／双 native 回归 | 尚未在同一安装场景完成历史数据到 Studio 全链路，不勾选此项 |

公开生成 Remote 的失败用量、完整性与冷恢复证据是本项新增；Studio 既有测试使用其
公开注入接口，不冒充本次真实历史 Session 的端到端画面。常规 native 测试的外部
SDK／进程替身不等同于有效认证。实现遵循 `tdd` 小步公开 RED/GREEN 与
`dsh-plugin-dev` 的固定 stream helper、真实所有者和生命周期边界。
