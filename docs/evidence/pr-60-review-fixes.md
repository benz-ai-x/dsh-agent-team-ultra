# PR #60 review fixes

本轮范围仅为 [PR #60](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/60)
及其锁定的 Harness Team UI 改动。需求来自 #34、#35、#36。
以此前审查的 Ultra `40fdd6f` / Harness `503ad563ff` 为问题基线，
接入已有候选 `beb16ff` / `806e58873b`，并补齐键盘导航和共享 watch owner。
最终锁定 Harness 为
[`b78caad462`](https://github.com/benz-ai-x/deepseek-harness_x/commit/b78caad462c3509127761904ed59ee549b6b6160)。

## 逐项修复

| 审查项 | 实际行为与回归证据 |
| --- | --- |
| Spec P1：冲突后再次保存始终使用旧 revision；reload 失败被成功文案覆盖 | 成功的 conflict authority reload 只推进下一次显式 Save 的基准；失败保留真实错误、旧基准和草稿。TeamAction 回归等待最终 UI 状态并执行第二次 Save；watch 刷新不推进编辑基准，不自动提交。 |
| Standards P2 / Spec P1：invalidation waiter 无界 | 每个 refresh generation 共用一个 Promise 和 dirty bit；连续两轮各 4096 次公开 invalidation 仍保持常数 completion 状态，最后一次失效后发布最终权威数据。 |
| Spec P2：实现说明与 reload 失败行为不符 | owning Agent Note、README 英中配对和 Ultra 项目约定明确成功／失败分支、草稿保留及显式重试。 |
| Spec P2：已完成依赖仍标为 blocker | blocker 文案按同一 Host view 的未完成状态筛选；完整 DAG 边和 Host readiness 保留，watch 完成前置后同步更新。 |
| Spec P2：Fit view 裁切五行 DAG | fit 使用完整可见 bounds 和视口边距计算缩放，默认 260px 视口以 0.35 完整居中；手动缩放与平移继续可用。 |
| Spec P2：并发删除的草稿依赖消失 | 已选但不在当前 view 的依赖作为“不可用或已删除”原生 checkbox 保留，用户能取消，再显式提交完整依赖集合。 |
| Standards P3：首个依赖隐藏后无法访问后续可见依赖 | ArrowLeft 选择首个可见前置；component RED 在旧实现停留于 dependent，修复后焦点与共享详情移到可见前置，ArrowRight 可返回。真实 Web 场景通过 UI 创建依赖并验证相同行为。 |
| Standards P3：两份 watch 生命周期状态机重复 | Team Client 公开 `createTeamWatchOwner`；任务面板和 Ultra 消息中心各自创建 owner，并共享同一实现。浏览器 module table 显式外置该导出，未新增 Remote mount。回归覆盖正在关闭／存活 watch、重复关闭、关闭失败汇总和已释放 owner 的迟到 control。 |

## 验证

- Harness TeamAction、browser mount、共享 owner：60 项通过。
- Harness Host Team 与共享 owner：64 项通过；共享 owner 的语句、分支、函数、行覆盖率均为 100%。
- Harness 真实 Web Team panel：3 项通过，包括过滤后的前置键盘导航；既有快照内容未改。
- Harness 完整 build、最终 Client 类型检查、定向 lint、Client package 检查和正常 commit/push hooks 通过。文档全量检查 31 项通过；另一项 Client catalog 的源码行号由正式 generator 更新后，独立 freshness 检查通过。
- 全仓 lint 的剩余错误位于 `packages/experimental/agent-team/tests/message-read.spec.ts:541`，缺少 rejection callback 的 `unknown` 注解。该文件与 PR 起点 `d2d870fbe4` 完全一致，归属更早提交 `eea13874ce`，本轮按 PR #60 范围保留；不声称全仓 lint 为绿。
- Ultra 最终完整 `pnpm verify` 自然退出 0：strict 582 项／0 警告，Host／Client／Typert／compatibility 构建，30 文件／359 测试，以及八归档安装、production DAG／依赖 CAS／watch、真实 Web、Codex 与 Claude 的 JSON／SQLite 恢复、registration release 和完整卸载全部通过。独立 Client bundle 测试和 packed probe 使用真实 Team Client 导出，验证共享 owner 的 module-table 依赖。
- 补修验证期间先遇到增量构建未重发声明的 freshness 拒绝，以及新增公开导出未接入独立 bundle 测试 module table 的 358／359 失败；分别通过正式 TypeScript 声明生成和补齐真实模块映射解决，再执行上述完整验证。不把这次补修描述为首轮全绿，也不重置历史 review／正式 local-gate 计数。
- 本机日志目录为 `/root/workspace/pr60-fixes.U6WRei`；最终完整结果为 `ultra-verify.log`，Harness 的 `harness-focused.log`、`harness-owner-coverage.log`、`harness-web.log` 和 `harness-scoped-lint.log` 保留对应验证。七份变更文档的 108 个本地 Markdown 目标存在，`git diff --check` 通过。

历史 review 熔断与唯一重试次数不重置。本次完成修复和验证后保持 PR open，
后续评审以最终 Ultra HEAD 和 `dsh-reference.lock.json` 指定的 Harness 为准。
