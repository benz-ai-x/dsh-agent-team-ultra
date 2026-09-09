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

第二次补修后须重新固定最终候选、复查和完整验证，不复用上述中间候选或
更早 `issue43-complete-candidate-verify.log` 的结果冒充最终门禁。

## 验收与发布界限

`dsh-plugin-dev` 要求公开生产入口和归档一致性；`tdd` 沿用已确认的真实
Loader / 迁移 CLI / Host / 生成 Remote / JSON / SQLite / Fiber 边界，先保留
失败再修复。新的历史迁移 → Host / Remote → 发货 Studio 展示、用量、完整性
及错误冒泡联合入口仍待用户确认，未宣称 #43 全部验收或支持资格已提升。
`code-review` 将对固定 main → 最终候选进行 Standards / Spec 独立复查。

main 已快进到 `c1632755` 且工作区 clean，strict 590 / 0 warnings；原 HANDOFF
安全保存为 stash `f473bf762b5583558031f2aa0bdad6a677bea768`，另三个旧 stash
和其他工作树保留。PR #63 尚未推送本轮修复；最终以回读到的远端 head 为准。
