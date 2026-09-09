# PR #62 审查修复

状态：原三项问题及复查追加的清理日志异常均已修复；最终候选完整门禁和独立双轴复查通过。
PR 未合并；远端发布状态以原 [PR #62](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/62) 的 head 为准。
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

### 独立复查追加：清理日志异常隔离

`ec88d85…d5054de` 全 PR 独立复查为 Standards 1 项 P2、Spec 0 项。
新增的 Codex／Claude 清理 warning 直接作为 abort listener 执行，固定 Logger 会传播
exporter 异常，导致未捕获异常；静止后的 info 异常还会被上层当成清理失败。
这违反 canonical `dsh-plugin-dev` 的 observer／logging 故障隔离要求。

每个 adapter 只在这两项新增诊断外围设置安全边界，不捕获 native disposer 的异常，
不改日志正常内容、不提前完成卸载、不改 Harness。复用原公开 Logger／Fiber／原生退出
场景，各扩展 `none`／`warn`／`info` 三变体，共新增 4 项，没有另建重复旅程。
Codex 和 Claude 分别先 RED（1 断言失败及 1 uncaught abort-listener exception），
重建实际发货入口后各 3／3 GREEN；原生退出前仍挂起，退出后重复 dispose 无额外清理失败。

- `pr62-codex-cleanup-log-red.log` → `pr62-codex-cleanup-log-green.log`
- `pr62-claude-cleanup-log-red.log` → `pr62-claude-cleanup-log-green.log`

两份恢复文件合并回归为 15／15，日志 `pr62-cleanup-recovery-green.log`。

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

时间／历史修复阶段的公开恢复文件为 8／8（新增 6 项），日志 `pr62-recovery-final-green.log`。
最初审查的两个 PR 外公开探针也原样转为 2／2 GREEN，日志
`pr62-original-review-probes-green.log`；缺失时间不再返回 endedAt，缺工具历史明确为 incomplete。

回归位于 [Codex 公开恢复测试](../../packages/codex/tests/recovery-lifecycle.integration.spec.ts)。
它保留原 Run／member／Revision／handle，通过真实生成 Remote 检查完整性与时间，
并确认终态文字、私有推理和 commentary 不进入 Run；真实 JSON／SQLite 冷启动继续读原身份。
没有复制原生 transcript 到 Run，也没有修改 Harness 契约来绕开缺失时间。

开工严格检查为 590 项／0 警告；两个切片均重新构建实际发货入口并生成兼容证明后运行 GREEN。
时间／历史修复候选 `d5054debc89a13070938e7863125fdccaafac900` 的完整 `pnpm verify`
自然退出 0：590 strict checks／0 warnings、400 tests／35 files、Host／Client／Typert／
compatibility 构建，以及八归档普通解析、真实安装、生产消息／DAG／CAS／watch、
丢响应恢复、Web 启动、两个 native 的 JSON＋SQLite 冷恢复和完整卸载全部通过。
日志为 `pr62-fix-qualified-verify.log`，SHA-256：
`8dac0818d7d9ceb9629ae7a182356cb0108a67f4510d7ab2d1fdc9e48347e06a`。
初版 394 项验收不冒充本次结果；后续仅说明文档变化可复用本次同输入、同环境证据。
该 400 项结果先于清理日志补修；最终新候选门禁与两路复查须重新记录，不能以它覆盖后续运行时变化。

## 最终资格

- 运行候选：`e7a5f2da5706449010d6a710c57175b44431e5f7`；完整比较基准
  `ec88d85a2ec668388ff37b0b6cba4bab3e332040`，范围为 PR #62 的全部 21 个文件。
- 新的 `pnpm verify` 自然退出 0：590 strict checks／0 warnings、404 tests／35 files、
  完整 Host／Client／Typert／compatibility 构建、八归档普通解析与安装、生产消息／DAG／
  CAS／watch／丢响应恢复、真实 Web 监听、两个 native 的 JSON＋SQLite 冷恢复及完整卸载。
- 日志：`pr62-final-qualified-verify.log`；SHA-256：
  `20899160b78e15b01e3e0387a8a48580070b6d97f2d6b15267085098c2695186`。
- 最终独立 Standards：0 项未解决问题，最高严重度无；最终独立 Spec：0 项发现，最高严重度无。
  初次及中间复查结果保留在上文，不将历史发现清零或跨轴合并。
- 后续说明提交只更新验收和交接；运行时、测试、来源锁、依赖及验收输入与上述候选一致，
  可复用同环境完整门禁，仍检查文档链接与 `git diff --check`，并复核说明增量。
- 仅更新原 PR 分支，不自动合并、不改 PR #63 或父 Spec #18，不重复发送完成通知。
  部分历史仍保守 incomplete；未宣称重建完整原生工具／usage 时间线，也未代替 #44 真实认证验收。
