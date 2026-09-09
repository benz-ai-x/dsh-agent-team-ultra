# Agent Team Ultra · B0 交接

更新：2026-09-09（Asia/Shanghai）。用户使用中文。
本文件为当前交接入口；[旧交接](docs/history/pre-b0-handoff.md) 和
[docs/HANDOFF.md](docs/HANDOFF.md) 只保留历史，不能覆盖当前授权。

## PR #64 合并交付（当前）

用户在修复复查后明确授权“合并 PR64”。服务重载准入修复已提交为
`0dc70acd1e363926ad5968ce7d7deb185c7d5c59` 并推送到原 PR 分支
`chore/official-dsh-only-baseline`，回读确认 PR 包含该提交；后续提交仅同步交接文档。
本次授权包含将已验修复随 PR 合入 main 并快进本地 main，不包含删除分支／历史 worktree、
旧 Issue 更新或真实账号使用。最终合并状态与提交以 [PR #64](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/64)
和 `origin/main` 回读为准；下方旧 OPEN 状态仅为历史，不能据此重复发布。
实施 worktree 保留在 `/tmp/ultra-pr64-review.p7Wub1/ultra`。

- 原 P1：单独停用／启用 Ultra 时 data Fiber 不变，坏 Head 被官方 reader 忽略，后续空 CAS 保存可重置已激活 Profile。此前 61／18 项测试通过仍遗漏此路径，违反 B0-02 重复准入要求。
- 已补实际 Loader 回归并获得有效 RED：重新启用本应拒绝，实际成功。修复后由 Profile data Fiber 持有固定数据根及其 storage facility 的只读准入能力；每次 Domain 打开前必须复检，能力随 owner 撤销，不增加第二份路径配置、不修改官方源码。
- 新增 3 项工作流回归：损坏／未来 Head 的 Loader 再启用均拒绝且原字节保留，恢复原文件后激活状态、历史和 CAS 不重置；停用 data entry 撤销准入与 Host，重启恢复原 Profile。共享 fixture 使用实际 Profile data／兼容性 Group；安装联验显式加载归档安装后的 Profile 字节。
- 完整 `pnpm verify` 自然退出 0：496 strict／0 warnings、64 tests／9 files、六归档真实安装、安装版 21 tests／2 files、Web `ready=true / forced=false / code=0`、完整卸载且数据保留。日志 `/tmp/ultra-pr64-review.p7Wub1/reload-fix-verify.log`；有效失败与首次通过为同目录 `reload-fix-red.log`、`reload-fix-green.log`。
- 已冻结 67 个运行输入，SHA-256 `1e67d4b2ff09b9f3f097f275492340f0b250c39b137dad16b8ae85720a8ac4db`；复查时包含未提交修复的 `git diff f84584def627b4af78a029af8788de73da0ad567 -- packages scripts` SHA-256 为 `f9e1de6db3101119a00aeef09ecc7f41849ec1b15faaaa09f426d98edcf8909b`。这些运行修复现已全部进入 `0dc70ac`。
- 独立两轴复查通过：Standards 0 项硬性违例／0 项异味，Spec 0 项／原 P1 关闭；另行重跑 7 项／34 项相关回归通过，运行差异指纹一致。B0-12 真实账号仍未验证。
- 收尾：9 份活动文档的 54 个本地链接／2 个锚点与 `git diff --check` 通过；运行输入及差异指纹未漂移，main／固定官方源码 clean，四个 stash 保留。
- 合并前重新通过 strict：496 checks／0 warnings；fetch 确认 main 仍为 `f84584d`，运行输入及差异指纹与上述完整验证／两轴复查相同，复用已验结果而不重复全套测试。采用普通推送及保留提交历史的合并，不强推、不绕过保护规则。日志 `merge-pr64-strict.log` 位于同一日志目录。
- 后续由用户另行安排 B0-12 隔离账号验证及下一步产品方向，不自动重启旧开发流水线或清理旧资料。
- 修复阶段用 `tdd` 固定 Loader／Host 公共边界先失败再修复，`codebase-design` 明确数据 owner 与 Domain 的责任，`code-review` 独立复查两轴；本次用 `writing-for-agents` 同步已发布修复、合并授权及验证限制。

此前诊断 `/tmp/pr64-pushed-spec.oS3tUy/loader-admission.mjs` 断言旧坏行为，不能作为修复验收；
只可在新隔离临时数据中使用，不能指向真实数据或已有 Profile 目录。

## PR #64 修复、复查与推送（此前）

用户审查后授权“修”，复查通过后再授权“推送 PR”。隔离 worktree
`/tmp/ultra-pr64-review.p7Wub1/ultra` 位于原分支 `chore/official-dsh-only-baseline`。
三项运行修复已提交为 `dd5cfa8d9c63e9bdaa256b8718bd8bf635754e3d` 并推送，回读确认 PR 包含该提交；
随后仅同步发布交接文档，最新 head 以 PR／Git 回读为准。主目录继续为干净 main `f84584d`，PR 保持 OPEN。
复查时使用的完整工作树已提交；当前完整 PR 差异可用 `git diff f84584def627b4af78a029af8788de73da0ad567...HEAD` 查看。

- 原 Standards P1 已修：中间已发布 Revision 缺失／损坏／未来封装会拒绝服务准入；原字节恢复后历史与写入恢复，未发布孤立 Revision 可重试。
- 原 Spec P1 已修：物理 B0 记录封装和布局在可写后端注册前校验；损坏／未来 Head 不会再被当作空数据覆盖，失败保留原字节与 CAS，官方未发布 UUID 临时文件保留。
- 原 Spec P2 已修：Studio 区分未知／pending 重试与已确认终态；已完成意图释放 UUID，新发布员工可重新启动；取消后的迟到响应不清除重试身份。
- 最终完整 `pnpm verify` 自然退出 0：496 strict／0 warnings、61 tests／9 files、六归档真实安装、安装版 Host／生成 Remote／Studio 18 tests／2 files、Web 正常启停及完整卸载保留数据。67 个运行输入指纹为 `aa007fb3ebec1886c029dfa2b47b836c3b7956fd19622be85453105e3f75fb0a`。
- 独立两轴复查通过：Standards 0 项硬性问题／0 项异味，原 P1 关闭；Spec 0 项，原 P1、P2 关闭。两轴独立重跑 4 项／14 项定向回归通过，运行差异指纹一致。B0-12 真实账号验收仍未验证，不以自动化结果代替人工审批或合并许可。
- 修复阶段收尾：9 份活动文档的 54 个本地链接及相关锚点、`git diff --check` 通过；运行输入未漂移，主目录 main 与固定官方来源 clean，四个 stash 及用户官方目录十个既有改动保留。
- 推送前重跑 strict：496 checks／0 warnings；运行输入和两轴复查指纹均与已验候选一致，复用上述完整 `pnpm verify`，本次没有重复运行全套测试。已 fetch 核对远端分支无新提交，采用普通快进推送，不改写历史。
- 日志目录 `/tmp/ultra-pr64-review.p7Wub1/`：`fix-history-red-qualified.log`、`fix-envelope-red.log`、`fix-ui-intent-red.log` 为三项有效失败复现；最终 `fix-final-verify.log`。原 `.dsh/pr64-*-review*`／`.dsh/pr64-root-ui*` 及 `standards-data-probe.mjs` 是审查阶段诊断，部分断言坏行为，不作为修复后的验收测试。
- 下一步由用户决定 B0-12 真实账号验证安排及是否合并；修复已进入远端 PR。本次未发布 GitHub review、合并、修改远端 Issues 或使用真实模型凭据。
- 此前用 `tdd` 将三项复现加入已有公共测试入口，`code-review` 独立复查两轴；本次用 `writing-for-agents` 将待推送状态更新为已发布并保留验证边界。官方来源仍为固定 clean checkout，旧源码、真实数据与四个 stash 保留。

## 此前基线实施与发布

用户授权制定 TODO 并实施“官方优先、DSH-only”的精简基线，随后明确要求“建 PR”。
本地分支 `chore/official-dsh-only-baseline`，起点
`f84584def627b4af78a029af8788de73da0ad567`；B0 运行提交为
`19e07a580b443e5647100971c28a59c46c282374`，已推送并创建
[PR #64](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/64) → main。
创建后回读 OPEN／非草稿／MERGEABLE／CLEAN，GitHub 没有提供 CI checks；本地完整验证不是人工审批。
PR head、远端分支和本地运行提交一致；之后仅追加发布交接文档，最新 head 以 PR／Git 回读为准。
远端 main 仍为 `f84584d`。没有合并或修改旧 Issues。

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
缺失／损坏／未知标记、缺目录、旧 Session 头、旧 Ultra domain、符号链接及损坏／未知 B0 记录封装在注册可写后端前拒绝；每次 Domain 打开前再次只读校验。
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

此前基线清理阶段的最终 `pnpm run verify` 自然退出 0：来源 strict、完整构建、46 tests／9 files、
六归档真实安装、安装版 Host／生成 Remote／Studio 12 tests／2 files、
Web 真实监听后自然退出（ready=true、forced=false、code=0）、完整卸载且数据保留。
发货 UI 联验修复了嵌套作用域漏声明 Remote 的真实问题；请求入队快照也有失败→通过的回归。
随后直接运行打包脚本复用已验构建，六个归档位于 `artifacts/agent-team-ultra-b0`。
活动文档 45 个本地链接、`git diff --check`、旧版本保护点及源码 clean 核对通过；
具体输入指纹与限制见验收文档。该阶段没有开展独立 PR 审查。
用户建 PR 授权后重新通过完整 `pnpm verify`：496 strict／0 warnings、46 tests／9 files、
安装版 12 tests／2 files 和同样的实际安装／Web／卸载门禁；67 个运行输入指纹未变。
补充 Chromium 的真实发货 bundle 截图，使用隔离演示数据和预览容器，仅说明 UI，不计入 B0-12。
前轮沙箱曾引起 pnpm 数据库／子进程 EPERM，本轮环境已开放，不需要或请求提权。
没有使用真实模型账号／凭据；B0-12 保持未验证。

本地清理与 B0 PR 创建已完成；当前已发布修复及合并授权见顶部“PR #64 合并交付”。
最初的建 PR 授权不包含合并；本次用户已另行授权合并，旧 Issue、真实模型凭据和消息仍不在范围内。

## 技能与设计依据

此前基线实施使用 `codebase-design` 明确官方和 Ultra 的模块责任；
`domain-modeling` 记录 B0 词汇和 ADR 替代关系；
`writing-for-agents` 收口活动执行文档、归档旧指令；
`diagnosing-bugs` 定位官方配置加载器与 CLI 入口变化。
当前修复与复查使用的技能见顶部；已删除的技能没有重新启用。
