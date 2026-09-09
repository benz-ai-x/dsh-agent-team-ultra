# PR #62 审查修复

状态：两项运行时修复与文档修正已完成定向验证，最终完整门禁、独立复查和推送待完成。
范围仅 [PR #62](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/62)／#38，
基于初版 `4cecfe2808182c64124abd6634597bd8c46ec5f8`；不合并、不更改 PR #63 或父 Spec #18。

## 固定边界

- B Harness `57670c6b320f7f240cbad360a9f691c8598e1571`，docs digest
  `331387e2a9fb7495b7160c93da853e0fe2c670b7de1f927ab8f4d0291962b675`；支持锁、SDK／payload 与持久格式不变。
- Node 22.22.1／pnpm 11.7.0，Linux arm64；Codex 0.149.1，Claude SDK 0.3.241／payload 2.1.241。
- 延用已确认的真实 Host／生成 Remote、Team／JSON／SQLite、Cordis Fiber 入口，只有外部 SDK／进程受控。不是 #44 的真实认证验收。

## 发现与修复

首次独立审查 Standards 为 3 项（2 P2、1 P3），Spec 为 1 项 P2；其中部分历史完整性跨轴重叠。

1. 原生协议 `completedAt: number | null` 的缺失值曾回退到 `Date.now()`，在恢复后变成 Run 的完成时间。
   现在只接受可表示的非负整数毫秒；缺失／非法时间不生成带伪时间的 terminal evidence，页面标为 incomplete。
   Team 结果结算仍独立进行；固定 B 证据接口要求 timestamp，因此 Run 可保留 unknown-terminal，而不是虚构有日期的终态。
2. 恢复前已有工具证据，恢复后只补 terminal，却把读到数组末尾当作完整历史。
   当前恢复不重建全部历史工具／usage 时间线，明确令该 provider generation 的证据页保持 incomplete；
   后续工作不能清除旧缺口。这是现有页级契约下的保守完整性，不更换原成员、handle 或操作回执。
3. 修正 HANDOFF／TODO 仍要求开始已完成的 #38、仍待确认已确认事项的过期状态，区分初版与修复版验收。

对应规范：[项目契约](../agent/PROJECT_CONTRACT.md#truthful-run-evidence)、
[Run ADR](../adr/0009-index-runs-and-fold-canonical-evidence-lazily.md)、
[父 Spec #18 D-18／US-40](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18)。

## RED → GREEN 与验证

日志位于 `/root/workspace/issue38-provider-recovery.I3s6PT/`。

| 共享公开场景 | RED | GREEN |
| --- | --- | --- |
| JSON／SQLite 缺失完成时间，live 与 provider 替换后都不生成 endedAt | `pr62-missing-time-red.log`：2 项失败，实际为 complete | `pr62-missing-time-green.log`：2／2 通过 |
| 正常原生时间下的工具历史缺口，包含后续工作与 Host 冷恢复 | `pr62-partial-history-red.log`：2 项失败，末页 complete 错误为 true | `pr62-recovery-green.log`：完整文件 6／6 通过，其中新增 4 项 |

另补 JSON／SQLite 的旧完成时间索引检查：移除 provider 后，原生历史不再提供日期，
通过公开读取确认旧 endedAt 不会成为新证据。该检查在上述修复后已通过（
`pr62-cached-time-existing-green.log`），既有 Host 重建会清理旧索引，本轮不另改 Host。
这两项不是新的 RED → GREEN 切片，也不宣称发现额外运行时问题。

最终公开恢复文件为 8／8（本修复新增 6 项），日志 `pr62-recovery-final-green.log`。
最初审查的两个 PR 外公开探针也原样转为 2／2 GREEN，日志
`pr62-original-review-probes-green.log`；缺失时间不再返回 endedAt，缺工具历史明确为 incomplete。

回归位于 [Codex 公开恢复测试](../../packages/codex/tests/recovery-lifecycle.integration.spec.ts)。
它保留原 Run／member／Revision／handle，通过真实生成 Remote 检查完整性与时间，
并确认终态文字、私有推理和 commentary 不进入 Run；真实 JSON／SQLite 冷启动继续读原身份。
没有复制原生 transcript 到 Run，也没有修改 Harness 契约来绕开缺失时间。

开工严格检查为 590 项／0 警告；两个切片均重新构建实际发货入口并生成兼容证明后运行 GREEN。
完整 `pnpm verify` 和最终独立双轴复查结果待后续记录，初版 394 项验收不冒充本次结果。
