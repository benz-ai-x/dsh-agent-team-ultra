# Agent Team Ultra · B0 交接

更新：2026-09-09（Asia/Shanghai）。用户使用中文。
本文件为当前交接入口；[旧交接](docs/history/pre-b0-handoff.md) 和
[docs/HANDOFF.md](docs/HANDOFF.md) 只保留历史，不能覆盖当前授权。

## 当前结果与范围

用户授权制定 TODO 并实施“官方优先、DSH-only”的精简基线，随后明确要求“建 PR”。
本地分支 `chore/official-dsh-only-baseline`，起点
`f84584def627b4af78a029af8788de73da0ad567`；本轮正在提交／推送并创建到 main 的 PR。
已 fetch 并核对远端 main 仍为该提交，没有重复的打开 PR。没有合并或修改旧 Issues。

B0 版本 `0.2.0-b0.1`，只保留 domain／ui／profile 三个 Ultra 包：

- 官方负责 Agent／Team／Session、模型执行、消息、任务、审批、对话和续接。
- Ultra 保留 Profile Revision／Head CAS／手动发布、UUID Launch／Binding、child-scope 能力及最小 Studio。
- 持久 Codex／Claude、运行时目录／独立选模、Run／Eval／Promotion Gate、自建消息中心／任务图／watch、模型侧 Profile 工具和旧迁移执行器已移出当前代码与发货闭包。
- 不再重启旧 #38–#44 流水线；旧 Spec #18／#44 的完成状态没有改写，不把 B0 裁剪视为旧需求通过。

权威入口：[ADR 0028](docs/adr/0028-establish-official-dsh-only-baseline.md)、
[CONTEXT](CONTEXT.md)、[项目契约](docs/agent/PROJECT_CONTRACT.md)、
[TODO](TODO.md)、[验收证据](docs/evidence/b0-baseline-acceptance.md)、
[官方源码重新评估](docs/research/2026-09-09-official-015-reevaluation.md)。

## 数据与旧版本保护

B0 只能安装到新的绝对路径 `DSH_HOME`，先显式初始化其 `ultra-b0`。
B0 身份为 Session 3、不压缩 JSONL、JSON domain `agent_team_ultra_b0` version 1。
没有自动迁移或兼容导入，SQLite 与历史 native 数据仍使用匹配的旧程序。
缺失／损坏／未知标记、缺目录、旧 Session 头、旧 Ultra domain、符号链接在注册可写后端前拒绝。
marker 不是导入许可；完整 Session 内容继续由官方 codec 校验。
卸载保留应用数据。不要拿生产目录试装，也不要删除或重写旧资料。

保护点：

- 旧产品 Ultra `f84584d` + 维护 Harness `3c38b1d4e8bf219750203e44b1df033ced754e92`。
- 完整 Git 历史备份 `.dsh/pre-b0-f84584d.bundle` 已验证；旧源码和旧验收文档保留。
- 旧维护源码 `/root/workspace/batch4-upgrade.VkSXdm/harness` 不动。
- `/root/workspace/deepseek-harness` 的十个既有 dirty 文件不动；只克隆其固定提交，不复制脏内容。
- `/root/workspace/pr63-source-repair.UKB4f7` 是永久 Git 元数据修复，不是临时垃圾。
- 四个 stash 保留：`f473bf762b5583558031f2aa0bdad6a677bea768`、
  `d3bf31945b3100655e61f3dc3d66c5c8c168cde4`、
  `e03d0b79f61ecdc9abd8d334cab55f1d481bf0c8`、
  `f57dfb84085de081996de5909427daf37090dee6`。
- 旧 native 忽略产物／依赖和原 lib 已移至 `.dsh/pre-b0-generated/`，可恢复；不作为 B0 发货内容。
- 过时 `dsh-plugin-dev` 保持停用；原源码 `/root/workspace/dsh-plugin-dev` 与
  启用链接回收位置 `/root/.local/share/Trash/files/dsh-plugin-dev-removed.PDtVxq` 保留，不重新启用。

## 环境与验证

当前 Node 22.22.1、pnpm 11.7.0。固定官方来源：
`.dsh/official-015`，提交 `5dda764ed3aa172535a7967b06ff95d9cbfe536a`，
`0.1.5-alpha.1`；`.dsh/harness` 指向它。来源锁没有放宽。

官方 tsdown 默认配置加载器在本机 Node 22 失败，使用 Node >=24.11.1 的原生加载器可完整构建，
无需改官方源码。新 `build:harness` 入口已完整成功执行，包括原生 addon、Host／Client 和 Web；
保留官方构建弃用／bundle 大小警告。README 记录从干净 checkout 的完整步骤。

最终 `pnpm run verify` 已自然退出 0：来源 strict、完整构建、46 tests／9 files、
六归档真实安装、安装版 Host／生成 Remote／Studio 12 tests／2 files、
Web 真实监听后自然退出（ready=true、forced=false、code=0）、完整卸载且数据保留。
发货 UI 联验修复了嵌套作用域漏声明 Remote 的真实问题；请求入队快照也有失败→通过的回归。
随后直接运行打包脚本复用已验构建，六个归档位于 `artifacts/agent-team-ultra-b0`。
活动文档 45 个本地链接、`git diff --check`、旧版本保护点及源码 clean 核对通过；
具体输入指纹与限制见验收文档。本次没有开展独立 PR 审查。
用户建 PR 授权后重新通过完整 `pnpm verify`：496 strict／0 warnings、46 tests／9 files、
安装版 12 tests／2 files 和同样的实际安装／Web／卸载门禁；67 个运行输入指纹未变。
补充 Chromium 的真实发货 bundle 截图，使用隔离演示数据和预览容器，仅说明 UI，不计入 B0-12。
前轮沙箱曾引起 pnpm 数据库／子进程 EPERM，本轮环境已开放，不需要或请求提权。
没有使用真实模型账号／凭据；B0-12 保持未验证。

本次本地清理已完成，当前只按新授权发布 B0 PR。之后再单独评审及决定真实 DSH 员工验收／合并。
建 PR 不包含合并、关闭旧 Issue、真实模型凭据使用或消息通知。

## 技能与设计依据

使用 `codebase-design` 明确官方和 Ultra 的模块责任；
`domain-modeling` 记录 B0 词汇和 ADR 替代关系；
`writing-for-agents` 收口活动执行文档、归档旧指令；
`diagnosing-bugs` 定位官方配置加载器与 CLI 入口变化。
本轮没有使用已删除的技能，也没有开展独立 PR code-review。
