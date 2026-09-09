# #43：归档与联合迁移集中验收进度

历史记录：本文保留当时提交的定向验证／审查进度。最新的 PR 联合验收、支持资格与
AC 收口见 [PR #63 联合验收](pr63-studio-acceptance.md)；下文的草稿、待确认或未完成
描述均属于原阶段，不覆盖最新记录。原命令、输入、失败和验证局限保持不变。

状态：运行时修复与下列自动化／历史归档门禁通过，**#43 尚未全部完成**。
新增 Studio 公共组件连接真实迁移后 Host／生成 Remote 的测试入口仍待用户按
`tdd` 要求补充确认；未写该新测试，未提升支持锁、正式 review、合并或执行 #44。
PR #63 保持草稿，Issue 保持 OPEN，未把未验证 AC 勾选为完成。

已验证的运行时提交是 Ultra `35f050ca1587e68724deed4717c793f90f661185`，
已正常推送 PR #63 并回读远端一致；后续提交仅同步本文和交接的发布状态。
运行时代码、依赖声明和脚本经以下门禁后只补充说明文档；不把旧日志当成新版重新执行。
Linux arm64，Node 22.22.1，构建及新安装的 pnpm 11.7.0。来源见
[锁文件](../../dsh-reference.lock.json) 和 [补丁清单](../reference/harness-patch-ledger.md)：

- 干净 maintained Harness：`3c38b1d4e8bf219750203e44b1df033ced754e92`；
  固定官方基础／对照：`d347e703908d0406b7a7ef80e3a0e594d86b2215`。
- Harness docs digest：`1cfdeaf1262f0101099ee245b9977a0ef93d56dcc631878f313dffea27adaf41`；
  仍为 `agent-team-ultra.phase-c.integration-candidate.v1`，不是 main 的支持资格。
- Codex 0.149.1／同版平台载荷；Claude SDK 0.3.241／native 2.1.241，不改变版本。
  外部 transport／SDK API 受控，不是使用有效认证的真实模型调用。

## 修复与公开失败依据

- 新 `/data` 入口使旧硬编码 peer 清单漏掉 Session persistence。归档从实际 Profile
  包入口及本地依赖闭包推导，子路径归属于原包；当前观察到 8 个归档，不固定数量。
  非归档 Harness 依赖从构建证明完整解析。普通 Node 导入包含公开 `/data`。
- 真实 CLI 的嵌套 Team 依赖曾解析到 registry brand alpha.2，顶层却链接 alpha.1。
  `--lock-local-peers` 把核验链接写入 profile overrides，并保留无冲突设置；实际
  解析仍由原兼容预检核对。错误来源和用户冲突配置不会被静默修复或覆盖。
- profile 子进程曾使用全局 pnpm 11.24.0，与声明的 11.7.0 不符；显式安装固定
  `packageManager`。SDK 从构建证明推导并直接链接已核验安装及其平台载荷；只有
  transitive link override 时，hoisted linker 的真实缺 SDK 失败也保留并修复。
- 完成目录下错误的 `storages` 原本会成功注册空后端；真实 Loader RED 后改为精确
  检查 `sessions`、`storage`／`storage.sqlite` 和后端。`--max-writes 0` 的 RED 为
  `MIGRATION_ARGUMENTS`；现支持首次发布前暂停，锁已存在但尚无 manifest 也拒绝业务。
- packed UI 回归曾在 Host CAS 完成后立即寻找尚未刷新的 Edit；改为等待公开控件，
  保留原断言与超时。新 `/data` 测试保留独立 Loader 配置副本，避免 remove 修改其
  已接管的数组后，测试把同一个已删行数组当作重新注册模板；发货 Loader 未改。

相关失败日志包括 `issue43-pack-baseline-red.log`、`issue43-retained-cli-install.log`、
`issue43-profile-package-manager-red.log`、`issue43-qualified-closure-pack.log`、
`issue43-exact-layout-red.log` 和 `issue43-all-writes-red.log`。早期诊断中两次等待
无关平台 SDK 下载的安装被终止，另一次 Claude 升级与构建重叠触发产物不一致拒绝；
这些日志不是成功证据。最终复验使用稳定构建和已核验 SDK 链接。

## 已运行的完整门禁

日志均在隔离 worktree 父目录 `/root/workspace/batch4-upgrade.VkSXdm/`，不含认证信息。

| 命令／共享场景 | 实际结果 | 日志 |
| --- | --- | --- |
| `pnpm verify` | 648 strict／0 warnings；完整构建；430 tests／39 files；实际归档安装、生成 Remote／生产 Team UI、双 native 数据入口与冷恢复、Web／卸载全部通过，退出 0 | `issue43-complete-candidate-verify.log` |
| `migration-interruption.integration`（已纳入完整 verify） | JSON 13 次发布／14 个前后边界；SQLite 7 次／8 个边界，包含首次 pending 前与 complete 后；全部重试、相同完整目标复用、源字节与原 Profile／Run／成员冷恢复通过 | 同上 |
| `verify:codex-upgrade <debde06 checkout> --keep-failed` | 旧适配包归档 → JSON／SQLite 源 → 运维隔离迁移 → 新归档原身份续跑；两次迁移后 Web 退出 0／无强杀，卸载通过 | `issue43-final-codex-history.log` |
| `verify:claude-upgrade <081357d checkout> --keep-failed` | 同上，Claude 原 native handle、SDK 历史及后续工作保留；两次 Web 正常退出，卸载通过 | `issue43-final-claude-history.log` |
| `verify:b-upgrade <4cecfe2 checkout> --keep-failed` | B 的 Codex／Claude × JSON／SQLite，包含六项成员操作、任务／消息回执、原始身份冷恢复、只读源保护；四次迁移后 Web 退出 0／无强杀及卸载通过 | `issue43-b-direct-product-upgrade.log` |
| `compatibility:compare <fixed official checkout>` | 同一 11 组官方基础语义及完整 fork 通过；stock source 安装前拒绝、stock Team 导入前拒绝，未创建业务数据 | `issue43-official-fork-comparison.log` |
| 来源／安装／数据入口定向回归 | 52／52、4 文件；后补安装保护 21／21，最终都纳入 430 tests | `issue43-focused-regression.log`、`issue43-install-admission.log` |

完整中断矩阵的点 n 是第 n 次耐久发布后／第 n+1 次发布前；0 与最后一条完成标记
都单独覆盖，不把两种描述算成重复测试。既有 execution 用例另验证临时文件前缀恢复、
分歧拒绝、未知／未来格式、checkpoint／Run 重建、保留 Eval Run 而失效旧 Gate。
这不是在每条 fsync／文件系统调用中注入掉电，也不扩大为跨平台文件系统资格。

发布记录更新后另通过 648 strict／0 warnings、本地 Markdown 文件目标检查和
`git diff --check`；日志 `issue43-postpublish-strict.log`、`issue43-postpublish-links.log`。

历史升级使用各自真实旧归档创建业务源，停止旧 context 后由当前运维入口联合迁移，
**不原地打开旧 Sessions 来冒充迁移验收**。SDK 外部状态位于独立连续性目录，不由
迁移器复制；新归档 `/data` 使用精确目标路径。源 Sessions／JSON／SQLite 的字节
在新 Host 续跑后仍不变。控制式产品的 live handles 以及真实 Loader／数据后端释放，
所有归档包与 overlay 行卸载；真实 native 进程／认证仍归 #44。

SHA-256：

- 完整 verify：`b0bbad1003969d12ca54fa2ab0cc794ac32228604d1a845850d30f01cd1b9b55`。
- 最终 Codex 历史：`bfc8c8bff715646c00541702feccc40513bb817bfa736117e20858d26cc29e00`。
- 最终 Claude 历史：`24282bd3f513070a1cc37edb5060b877cfaa6de08d4d0af80c6bc4addd06b46e`。
- B 完整升级：`048f599950142ff7858c87cfce56046543f6f154ba8dabef74ee89637e6bcffa`。
- 官方／fork 对照：`bd309250d28761758dc47c8889afea8e5ac4e6bd9ae064a37048ea21dd1c29b0`。

## 验收映射与未完成部分

| 条件 | 本次共享证据／剩余工作 |
| --- | --- |
| #39 AC2，expand→migrate→contract | 历史／B 来源 → 完整联合目标 → 当前归档与原成员续跑；支持资格提升与人工合并仍未做 |
| #40 AC5 | 最终实际归档、两个 native 的 JSON／SQLite 数据入口与完整成员协作通过；真实认证由 #44 承担 |
| #41 AC1／3／4／5 | 旧版本与 B 真实数据、全发布边界、源保护、身份／回执／Run／checkpoint／Gate 场景；见上表及 [#41 定向证据](issue-41-acceptance.md) |
| #42 AC5 | v2 折叠已在完整 430 tests 中重验，历史归档恢复通过；**迁移后真实 Host／Remote → Studio 显示与错误冒泡的新联合场景待入口确认** |
| #43 AC2–5 | 实际归档闭包、旧适配包更名与 B 升级、Cordis／Web／卸载、官方及不支持组合已有上述证据 |
| #43 AC1／6，后续 #44 | 候选资格标签未提升；完整回归与来源证据已记录，但仍等 Studio 联合场景、正式评审、人工合并和真实认证验收 |

Harness 没有新代码变化；适用的 owner 格式／重放／Team／built Remote／CLI／Web／
Python／类型／构建证据复用同一 `3c38b1d` 的 [#39](issue-39-acceptance.md) 与
[#40](issue-40-acceptance.md)，不宣称本次又跑了全 Harness。完整 verify 的 SQLite
experimental warning 与实际 Claude SDK `CAN_USE_TOOL_SHADOWED` 提示保留；后者
不能被解释成 `canUseTool` 已额外约束那些显式 allowed Team 工具，Host 的精确成员
授权与回执检查仍是实际门禁。此处不作真实认证产品已通过的结论。

本次按用户指定 `tdd` 使用公开 CLI／Loader／Host／生成 Remote 的 RED→GREEN，
`dsh-plugin-dev` 约束实际发货入口与来源，`domain-modeling` 更新 ADR 0027 的准入
责任；未启动新的正式代码审查或多代理。父 Spec #18 未修改／关闭，main 与 PR #62
的 B 支持锁保持不变。
