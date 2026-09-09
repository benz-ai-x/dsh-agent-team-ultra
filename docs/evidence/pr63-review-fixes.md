# PR #63 审查修复与同步证据

日期：2026-09-09（Asia/Shanghai）。本轮只修复并发布
[PR #63](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/63)，不合并、不关闭
Issue、不通知、不执行 #44 真实认证验收。

## 固定范围与来源

- 原审查候选 `788ae938d134147eeb32fe8f71f25799db89c0c4`。
- 已合入 main / PR #62 `c1632755c4fbabe5b34af7ddb5f3628aaf5037a6`，合并提交
  `21a22b0`；保留最后的原生结束时间、恢复完整性和清理日志隔离修复。
- C Harness `3c38b1d4e8bf219750203e44b1df033ced754e92`、官方对照
  `d347e703908d0406b7a7ef80e3a0e594d86b2215` 与 SDK pin 均不变；资格仍为
  `agent-team-ultra.phase-c.integration-candidate.v1`。
- Node 22.22.1 / pnpm 11.7.0；实现工作树
  `/root/workspace/batch4-upgrade.VkSXdm/ultra`。下列日志均在其父目录。

## 修复与公开回归

| 审查项 | 修复 | 真实边界与证据 |
| --- | --- | --- |
| Spec P2：data 可先写后拒绝错误 Loader 来源 | data 与 Profile group 共用 owning Loader 来源准入，在注册 Session / storage / Domain 前拒绝；两个归档入口自包含 | 实际 Loader 安装合格私有依赖但错误根 Team，RED 生成业务 SQLite，GREEN 可见兼容错误且业务目录不存在；`pr63-loader-admission-red.log` / `pr63-loader-admission-green.log` |
| Spec P2：complete 目标缺必要实体被初始化为空库 | complete manifest 要求真实 Session 目录与对应 JSON 目录 / SQLite 文件存在；新安装豁免不变，不做运行时业务 hash 比对 | 真实迁移 CLI 后移走四种必要实体，实际 data Loader RED 接受、GREEN 零注册零写入拒绝；原实体还原后真实 Host / 生成 Remote 读取原 Profile；`pr63-missing-target-red.log` / `pr63-missing-target-green.log` |
| Standards P3：Run 身份 / native 关联规则重复 | 共享纯 `run-binding`；Host 与迁移保留各自 I/O、权限、owned event suffix 和持久化边界 | `pr63-run-binding-regression.log` 的迁移 / v2 用量 34 项，以及 `pr63-run-owner-regression.log` 的 Run 证据 / 生命周期 15 项通过 |

第一次 Loader GREEN 运行暴露实际的 `AggregateError`：断言现在读取其公开嵌套错误，
同时仍要求零业务写入。第一轮缺失实体 GREEN 中用于冷恢复的空白 Lead 未落盘，
夹具补充真实 followup / whenIdle 后四项全部通过；这是夹具修正，不计为产品修复。
共享 Profile helper 的初次打包生成未收录私有 chunk，最终改为两个自包含入口；
后续完整 build 通过，不手工修改生成物。

## 已执行验证

- 初始 strict：648 / 0 warnings，`pr63-fix-initial-strict.log`。
- 合入最终 PR #62 后 build 与原生恢复 15 项通过：
  `pr63-main-integration-build.log` / `pr63-main-integration-tests.log`。
- Loader / data 生命周期定向 8 项通过：`pr63-loader-admission-green.log`。
- 缺失迁移实体四项通过：`pr63-missing-target-green.log`。
- 最终实现 build 通过：`pr63-run-binding-build.log`；迁移 / v2 用量 34 项
  （2 个文件）与 Run 证据 / 生命周期 15 项（2 个文件）通过。
  前一条命令额外给出的两个旧 Run 文件名并不存在，未计作执行过的文件；
  正确 owning suites 已单独运行，见上表。

## 中间候选完整验证与新增复查

固定 `ddc77697839c7d516e611fd03d1260d344bd011d` 的 `pnpm verify` 自然退出 0：
648 strict / 0 warnings，完整 build，445 tests / 39 files，实际八归档安装、
普通解析、生成 Remote / Team 生产 UI、消息 / DAG / CAS / watch、Web、双 native
JSON / SQLite 冷恢复与全部卸载均通过。JSON 13 次耐久发布 / 14 个边界、SQLite
7 次发布 / 8 个边界的中断恢复也全部通过。

同一候选的实际历史归档升级自然退出 0：旧 Codex `debde06`、旧 Claude
`081357d`，以及固定 B 前身 `4cecfe2808182c64124abd6634597bd8c46ec5f8`。
B 使用专用干净工作树 `/root/workspace/pr63-b-history.igiW8o/ultra`，按不变 B
Harness `57670c6b32` 正式 prepare、frozen/offline install、strict 和 build；
没有把 PR #62 最终 `5d25394` 冒充这个历史输入。各产品 JSON / SQLite 的源
字节保护、原身份 / 原 handle 续跑、迁移目标 Web 正常退出和无残留卸载通过。

| 中间候选日志 | SHA-256 |
| --- | --- |
| `pr63-repaired-candidate-verify.log` | `7c330a6df5f2126791cb0729771ed7fa22bc4523a2a064d125d6e7f1e654167d` |
| `pr63-repaired-codex-history.log` | `b699531a237178a5d7569dedf1c0a1e0a05a1f8fc364c3927e471562d67dcee8` |
| `pr63-repaired-claude-history.log` | `08798e450f563f61456278f5f79d934db5faf02086ede7aa888c27ec9425c388` |
| `pr63-repaired-b-history.log` | `9c062cc2132af581da4c6b9ac3fb30c56ecea24a9f3583b38ba7fa24477993a7` |

该候选的独立完整差异复查（main `c1632755` → `ddc7769`）发现新增两项 P2，
因此上述绿色自动化不是最终批准：

- Standards 1 项 P2：README 旧包名升级段仍允许直接在原业务根启动，与 ADR
  0027 的私有副本 / 独立目标流程冲突。现已明确包身份步骤不替代数据迁移，
  B / 更旧源必须先停止全部 writer、迁移完成并配置两个目标路径后再首次启动。
- Spec 1 项 P2：manifest 的枚举检查先做 `String()`，`["pending"]` 可绕过随后
  严格 pending 分支。真实 data Loader 在 JSON / SQLite 上均 RED 接受了非法
  状态；改为只接受原始字符串状态与后端枚举，`pending` / `complete` 数组和
  backend 数组均零注册、零写入拒绝，两个后端场景 GREEN（各覆盖三种非法值）。
  完整 build 通过；日志 `pr63-manifest-enum-red.log` /
  `pr63-manifest-enum-green.log` / `pr63-manifest-enum-build.log`。

## 最终运行候选与发布

最终修复候选 `32122251c4a1b8086952a7a0274e752b51c5a6ca` 已重新完成：

- `pnpm verify` 自然退出 0：648 strict / 0 warnings，完整 Host / Client / Typert /
  compatibility 构建，447 tests / 39 files（201.72 秒），JSON 14 / SQLite 8 个
  全部中断边界，以及实际八归档普通安装、生产消息 / DAG / CAS / watch、Web
  正常退出、双 native JSON / SQLite 冷恢复和完整卸载通过。
- 同一新候选的旧 Codex、旧 Claude 和固定 B 三组真实历史归档升级重新全部
  退出 0；使用上一节相同固定前身、支持锁和 SDK，而非沿用中间候选日志。
- 固定完整差异 `git diff c1632755c4fbabe5b34af7ddb5f3628aaf5037a6...32122251c4a1b8086952a7a0274e752b51c5a6ca`
  的独立 Standards / Spec 复查各 0 项未解决代码或文档 finding，各轴最高
  严重度无。Studio / 支持资格的已知 readiness 限制仍单列，不因此消失。
- 14 个变化 Markdown 文件的 141 个本地文件链接与 `git diff --check` 通过。
- 正常推送原 `feat/batch-4-harness-upgrade`，回读本地、tracking、`ls-remote`
  和 PR #63 head 均为上述运行候选；PR base 已改为 main，保留草稿、不合并。
  后续仅本证据、TODO、HANDOFF 的说明文档提交；实际最新 head 以 PR 回读为准。

第一次在同一新候选并行运行全量测试与三组归档升级时，四个既有迁移用例触发
5 秒超时（443 passed / 4 failed），完整 verify 未进入 pack。保留日志后，
代码、测试超时和断言均不变，独立重跑完整 `pnpm verify` 才得到上述全绿。
这与并行资源争用的解释一致，但不把一次成功当作所有环境的性能保证。

| 最终候选日志 | SHA-256 |
| --- | --- |
| `pr63-final-qualified-verify.log` | `c22cce206632e6f444259aa151e435507fc70efbfbcf168bdadacffa49051dde` |
| `pr63-final-codex-history.log` | `733ba88f75f2bf358c3acde32ded8b5f3a5da51506e2d71c59816cb44353e1d4` |
| `pr63-final-claude-history.log` | `3aa2dccbb93a15a38e4498da954a083b5818ae514d902819877ebf7c06e046ba` |
| `pr63-final-b-history.log` | `2ddf083e9356991a8127d747059b52eff4f0c3af510619078f22d7ba0e3587ba` |
| `pr63-final-concurrent-timeouts.log` | `48206961c7b71a67ae7068abb84d10e5e6817fe9cadde0a85dc2c5d6d5a3826d` |

本轮临时 B 前身工作树在全部升级验证退出后已清理；可从固定 `4cecfe2` 和 B
Harness 锁重建，prepare / install / strict / build 日志保留。原有其他 worktree
及源数据没有删除或修改。

## 验收与发布界限

`dsh-plugin-dev` 要求公开生产入口和归档一致性；`tdd` 沿用已确认的真实
Loader / 迁移 CLI / Host / 生成 Remote / JSON / SQLite / Fiber 边界，先保留
失败再修复。新的历史迁移 → Host / Remote → 发货 Studio 展示、用量、完整性
及错误冒泡联合入口仍待用户确认，未宣称 #43 全部验收或支持资格已提升。
`code-review` 已对固定 main → 最终运行候选完成 Standards / Spec 独立复查。

main 已快进到 `c1632755` 且工作区 clean，strict 590 / 0 warnings；原 HANDOFF
安全保存为 stash `f473bf762b5583558031f2aa0bdad6a677bea768`，另三个旧 stash
和原有其他工作树保留。PR #63 修复已推送；main 的本地与远端仍同为 `c1632755`，
未把 C 候选合入 B 支持线。
