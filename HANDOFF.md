# Agent Team Ultra 交接

交接日期：2026-09-09（Asia/Shanghai）。用户使用中文。

本文件是最新交接的唯一入口，存放规则见 [AGENTS.md](AGENTS.md)。
[docs/HANDOFF.md](docs/HANDOFF.md) 保留历史运行手册；其中的路径、运行实例和剩余范围不能覆盖当前仓库状态及权威需求。

## 当前 PR #62 审查修复

- 用户授权按审查建议修复 PR #62，仅处理两个运行时 P2 和一个过期状态 P3；不合并、不改 PR #63、父 Spec #18 或已确认的 B 支持锁／SDK。首次独立审查 Standards 3 项、Spec 1 项（工具历史完整性项跨轴重叠），不是四个独立问题。
- 缺失／非法原生终态时间不再回退到当前时刻。Team mailbox 仍结算已知结果，必须带时间戳的证据入口不生成无日期 terminal，Run 明确 incomplete。恢复只补回可证明时间的终态，不假装重建全部工具／usage 历史；同一 provider generation 的证据页及后续工作保持 incomplete。
- 公开 Host／生成 Remote、真实 Team 与 JSON／SQLite、真实 Fiber 的两组回归分别 RED → GREEN，并补充 2 项旧索引检查，共新增 6 项；恢复生命周期文件 8／8、最初 PR 外审查探针 2／2 通过。旧索引已有 Host 重建覆盖，无需扩大 Host 修改。当前完整验证与新的两路复查仍待完成，不能沿用初版 394 项日志宣称修复版已通过。进度见 [修复证据](docs/evidence/pr62-review-fixes.md)。
- 本轮使用 `tdd` 的既有已确认测试入口、`dsh-plugin-dev` 的精确协议与生命周期约束，并计划以 `code-review` 做两路独立复查。没有新增测试边界；只控制外部 SDK／原生进程，不等于 #44 真实认证验收。

## #38 初始实现与验证记录

- 用户已确认持续从 #38 开始按 `tdd` 开发，并在每个 Issue 完成后通过飞书 CLI 通知。PR 范围保持 #38、#39–#43、#44；Issue 定向验证，完整跨功能／冒烟／错误冒泡／真实归档验证在最终 PR 候选收口。未验 AC 不勾选，Issue 合并后关闭，父 Spec #18 不修改；开发授权不自动包含 PR 合并。
- #38 实现与自动化验收完成，已推送并创建 [PR #62](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/62)，待正式评审及人工合并。独立工作区 `/root/workspace/issue38-provider-recovery.I3s6PT/ultra`，分支 `feat/batch-3b-provider-recovery`；实现提交 `c91a3b7`，最终验证提交 `7caa05e3a951dac88eaf93067d0db1985088d966`。GitHub 回读 OPEN／CLEAN、无远端 checks；六条 AC 按证据勾选，Issue 保持 OPEN，标题／标签／指派及父 Spec #18 均未改。
- [验收记录](docs/evidence/issue-38-acceptance.md) 逐项映射六条 AC。真实公开入口 RED → GREEN 修复 run/view/watch 冷读取清理、旧 Lead 的 DSH／Codex 详情、双 native 宽限期诊断、Codex 恢复终态及无效原生结束时间。共享 JSON／SQLite 场景保留原 member／handle、丢失回执去重、任务所有权与 DAG、另一 provider、评测、Run 和 watch；迟到旧代际通知与重复旧 Fiber 清理不影响新工作。
- 最终 `pnpm verify` 自然退出 0：590 strict／0 warnings，Host／Client／Typert／compatibility 构建，394 tests／35 files，八归档普通解析与安装、生产消息／DAG／CAS／watch／丢响应恢复、Web 启动、Codex／Claude JSON＋SQLite 冷恢复及完整卸载通过。日志为 worktree 父目录 `issue-38-qualified-verify.log`。首轮唯一失败是旧夹具的相对终态时间却要求完整；保留输入、用量与终态，明确验证 incomplete／无 endedAt 后重新跑完整门禁通过。
- Node 22.22.1／pnpm 11.7.0，Harness `57670c6b320f7f240cbad360a9f691c8598e1571` 位于 `/root/workspace/pr61-fixes.7yIVdj/harness`，来源和锁均未修改。main 仍为 `ec88d85a2ec668388ff37b0b6cba4bab3e332040`；主工作区既有 HANDOFF、3 个 stash、历史工作树和维护源码均保留。
- 飞书 #38 完成通知已于 2026-09-08 20:22:54 成功发送，CLI 返回 `ok: true`／bot，幂等键 `ultra-38-7caa05e-qualified`；内容包含 PR #62、实现／验证结果与待评审／合并和 #44 限制。不要重复发送。凭据、收件人私有标识和私人会话不写入仓库。
- 下一步从 #38 候选建立 #39–#43 升级集成线，不切换 B 发布线；#38 PR 不自动合并。已回读 #39–#44，固定官方比较为 `d347e703908d0406b7a7ef80e3a0e594d86b2215`；#43 完整迁移／归档门禁与人工合并、#44 真实认证验收仍不可省略。没有开始修改新 Harness 基线。旧 `gh pr edit` 因 Projects classic GraphQL 字段失败，已用 `gh api` 仅 PATCH 同一 PR body 并回读成功，不重建 PR。
- 本轮使用 `tdd`、`dsh-plugin-dev`、`lark-im`／`lark-shared`。没有新正式代码审查、多代理或真实 native 认证验收；自动化通过不等于 PR 已审查批准，#38–#44 总目标尚未完成。

## PR #61 发布交接（历史记录，已合并）

- 最新用户已授权按建议依序推送配套 Harness、更新 [PR #61](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/61)，核对远端和检查后合并该 PR。只交付已经修复并复查通过的两类能力问题；不修改其他 PR／Issue 正文，不通知或恢复历史流水线，不删除分支或 worktree。主工作区 `/root/workspace/dsh-agent-team-ultra` 的 main、既有 `HANDOFF.md` 改动与来源链接均保留。
- 修复工作区仍为 `/root/workspace/pr61-fixes.7yIVdj/ultra` 的 `fix/pr61-review-findings`，配套 Harness 为相邻 `harness` 的 `fix/pr61-member-capabilities`。Harness `57670c6b320f7f240cbad360a9f691c8598e1571` 已经正常 pre-push 类型检查后推送维护 fork 同名分支，Git 与 GitHub 回读一致；没有推送官方 upstream。Ultra `9aa53d96e56efafbce93100b9f25327f6168b1a6` 已正常推送原 PR 分支并回读一致。当前交接只补充发布记录，不修改已验证代码或锁。
- DSH 成员完整协作由精确 live Agent 的六项 Team 工具证明，工具注册／卸载通知驱动 Studio 快照刷新。原生 create／resume 若明确要求完整协作，必须返回精确 handle 的全部六项成员操作；缺失或不完整时拒绝，沿用世代隔离及等待资源清理。同一成员身份可由恢复后的新注册重新接续排队工作；没有该必需项的有限／未确认成员仍允许运行。
- Harness 258 项 owning tests 和目标模块四项 100% coverage、完整 build、15 项快速文档检查、32 项 doc-sync、2 项 built Remote／Loader、5 项 Web 回放通过。全量 lint 仅剩未改 `message-read.spec.ts:541` 两项基线违规。Ultra 完整 `pnpm verify` 自然退出 0：590 strict／0 warnings、382 tests／32 files、八归档安装／解析、production DAG／CAS／watch、Web、Codex／Claude JSON＋SQLite 冷恢复和卸载通过；新增 packed 能力探针在两种存储下均通过。夹具同步为 `f5b2d4d08e6f4f5381ccd8ba1803bf189c35b3fc`，运行源码／锁／脚本与修复提交 `06b736e` 一致。
- 双轴复查固定 Ultra `9835db4…f5b2d4d`（50 文件）、Harness `b78caad…57670c6`（48 文件）的完整差异：Standards 0 项、Spec 0 项，各轴最高严重度均为无。发布前 strict 再次通过 590／0；两侧远端没有 Actions 运行或 check runs，PR 没有评审线程。合并使用普通 merge commit 和精确 `--match-head-commit`，不强推、不绕过门禁。最终 `state`／`mergedAt`／`mergeCommit` 以 [PR #61](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/61) 的 GitHub 记录为准；恢复时先回读，若已 MERGED 不重复合并。权威需求为 [#37 AC2](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/37)、[Spec #18 1.1 D-11](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18) 与既有 ADR。详见 [修复与发布证据](docs/evidence/pr61-capability-review-fixes.md)。
- 环境仍为 Node 22.22.1／pnpm 11.7.0；修复阶段使用 `code-review`、`dsh-plugin-dev` 及 Harness 测试／文档技能，当前发布使用 `dsh-plugin-dev`、`dsh-pre-push-checks` 并核对既有 `dsh-ci-test-reliability` 证据。没有新持久格式或权限扩张。发布日志为相邻目录的 `publish-pr61-*.log`；原始修复验证日志保持不变。

## 上轮 PR #61 冲突处理（历史记录）

- 最新用户要求使用 `resolving-merge-conflicts` 解决 [PR #61](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/61) 与 main 的冲突。仅在独立 worktree 整合、验证并推送原 PR 分支；不把 PR #61 合并进 main，不推进其他 Issue／PR，不发送通知。
- Ultra：`/root/workspace/pr61-fixes.7yIVdj/ultra`，本地 `fix/pr61-review-findings`，起点 `2491023814b71ce267cd55883459e2096d42e0e0`，合入 main `9835db4361dcad500b3be09ef69f78420d71a6ab`。主工作区 main、原 HANDOFF 改动和来源链接保持不动。PR #60 已合并，#34–#36 已关闭且各 5/5 AC。
- Harness：`/root/workspace/pr61-fixes.7yIVdj/harness`，`fix/pr61-member-capabilities`，以 `4490b43a0f67b2851e23109edf5ae6232bea223d` 和 `b78caad462c3509127761904ed59ee549b6b6160` 为双亲合并为 `bb9b48954821a29f712043b08b746085cc07a440`，已正常推送维护 fork 同名分支且远端回读一致；未推送官方 upstream。新 lock 及正式 docs digest 已同步，worktree clean。
- 精确 native handle 的已确认成员操作仅作为当前提供方世代的 live roster 事实。Codex 新线程可证明六项工具安装，冷恢复无法从固定 0.149.1 协议读取工具清单，因此显示“未确认”，包括工具齐全但无法证明的冷恢复线程；不安装新工具、不替换线程、不新增持久格式。Claude 每次 query 安装六项 Team MCP 工具，create/resume 均返回对应证明。
- 普通成员使用持久 requirements 校验当前后端的 context、Profile 与 runtime 能力，降级显示 capability-mismatch，恢复后沿用原身份和排队工作。消息导航仍走公开 Team panel navigation，随后关闭 Studio；重新打开刷新 Host 快照但保留编辑草稿。
- 合并保留 main 的同一任务列表／DAG／详情、单 revision 依赖 CAS、冲突草稿和共享有界 watch owner，以及 PR #61 的成员能力证明、Studio 草稿与同一面板导航。消息导航同时更新 watch 的筛选引用，服务替换不重置同 Team 草稿。新增定向导航／watch 竞争回归；Harness 双语 owner 文档合并并由官方命令重生目录。
- 当前验证：Harness 合并提交为 `bb9b48954821a29f712043b08b746085cc07a440`，完整 build、316 owning tests、2 Remote／Loader、5 Web replay、32 doc gates 与变更文件 lint／正常 commit hooks 通过；全量 lint 仍有未改 `message-read.spec.ts:541` 两条基线违规。Ultra 完整 `pnpm verify` 自然退出 0：582 strict／0 warnings、32 files／378 tests、八归档安装、production DAG／CAS／watch、Web、Codex／Claude JSON＋SQLite 恢复和卸载均通过。首次仅因 built-types freshness 被拦截，用官方 project `tsc -b --force` 恢复后原样重跑；未放宽锁或门禁。直接证据见 [冲突处理记录](docs/evidence/pr61-merge-resolution.md)，日志在 `/root/workspace/pr61-fixes.7yIVdj/merge-*.log`。
- Ultra 合并提交 `309c778ed665ea78538a234a2897d4907eeb0a6f` 的双亲为 PR 原头 `2491023` 与 main `9835db4`；已正常推送原分支 `feat/batch-3-studio-recovery`，GitHub head 回读一致，PR 仍 OPEN，冲突状态已转为 MERGEABLE／CLEAN，无远端 checks。Harness 正常 pre-push 类型检查通过；发布后 Ultra strict 再次通过 582／0。本交接提交只同步发布结果，不改变已验证代码或锁；恢复时回读 GitHub 当前 head，不把该文档提交当作另一次产品变更。未强推、未合并 PR、未改 main。
- 环境：Node 22.22.1、pnpm 11.7.0。本次使用 `resolving-merge-conflicts`、`dsh-plugin-dev`，Harness 按 `dsh-ci-test-reliability`／`dsh-pre-push-checks` 验证，按 `dsh-doc`／`dsh-prose-standard` 合并双语资料。未启动新评审 agent；验证与发布不等于 PR 已重新批准或合并。
- 权威需求保持 [Spec #18 1.1](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18)、[#34](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/34)、[#35](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/35)、[#36](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/36)、[#37](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/37) 与现有 ADR。下文历史状态和当时授权不能覆盖本节。

## PR #60 历史交接（已合并，保留证据与已知限制）

以下为原合并前记录；PR #60 已于 2026-09-08 合并为 `9835db4`。其中待合并／暂停 PR #61 等措辞仅代表当时状态，剩余 3 P2 + 1 P3 未在本轮扩大修复。

- 最新用户已明确授权仅合并 **PR #60**。全新隔离双轴审查已完成：固定 Ultra `22c0436429ccf449283bf3ecc33c2d0a497144ad`／main `2c5a355deefcf3c9dfc3384787e9cfe3de4678e3`、Harness `b78caad462c3509127761904ed59ee549b6b6160`；Standards 为 1 个 P2、1 个 P3，Spec 为 2 个 P2，无 blocking/high，达到既定门槛但不是零问题。此次只追加合并交接，不修改运行时代码、锁或剩余发现，不启动 PR #61 或其他工作。历史 review=3、唯一统一重试=1/1、local-gate 历史红=1 均保留。
- 剩余发现：Standards P2 是同 Team 服务替换时未发送草稿保留的真实 Slot/Fiber 组合验证缺口（尚未动态复现草稿丢失），P3 是公开 watch 文档遗漏 Lead-only 权限及拒绝条件；Spec 两个 P2 是删除最后一个任务后墓碑详情被空列表条件隐藏，以及 50 行 DAG 的 Fit 百分位舍入裁切。后两者已由独立公开组件探针复现，五行 Fit／仍有其他任务的对照通过；不以既有套件全绿声称这些发现已修复。审查证据在 `/root/workspace/pr60-review.QNJYiG/review-checks.json`。
- 本次合并前重新运行的完整 `pnpm verify` 已自然退出 0：582 strict／0 warning、Host／Client／Typert／compatibility 构建、30 files／359 tests，以及八归档安装、production DAG／CAS／watch、Web、Codex／Claude JSON＋SQLite 恢复和完整卸载均通过。日志为 `/root/workspace/pr60-merge.h817ck/pre-merge-verify.log`；与已审查头的差异仅有本次三份交接文档，运行时和锁不变。
- 合并方式保持普通 merge commit，执行时固定 GitHub live head，不绕过保护规则；PR 的 `state`／`mergedAt`／`mergeCommit` 和 main 的 Git 历史是实际完成凭据。唯一进度索引仍为 [PIPELINE_STATE.md](PIPELINE_STATE.md)。本记录后的更改只允许合并 PR #60、同步本地 main 与合并后验证；保留来源分支、既有 stash 和其他工作树，不发送外部通知。
- 以下为开发阶段历史记录；其中“等待全新评审”“本轮不合并”以及 `806e5887…`／`ca17782…` 已被上面的最新审查与用户合并授权取代，不再作为当前阻塞。
- 当前主工作区分支为 `feat/batch-2-task-dag-live`，从 main `2c5a355deefcf3c9dfc3384787e9cfe3de4678e3` 建立。PR #60 历史 review 连续失败3轮、local-gate历史红1；用户已显式启用唯一统一重试1/1，该开发和正式全量闸门现已完成，绝不能重置成普通review 4。Batch 1 的 [PR #59](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/59) 已按人工确认 merge commit 合并，#33 自动关闭；合并后 `pnpm verify` 再次通过582 strict、346 tests与完整八归档/Web/恢复/卸载。
- #27–#32 已在本轮启动前分别合并 PR #53–#58 并关闭，不属于本次快照范围。Batch 2 冻结包含 #34、#35、#36；三项最新正文与 AC 已重读且未更新，依赖 #25/#33 已关闭，#35→#34、#36→#35 保持批内顺序。后续恢复只读 `PIPELINE_STATE.md`，不再使用历史 `/root/workspace/.ultra-checks/frozen-issues-27-44.json` 作为进度源。
- 权威需求为 [Spec #18，修订 1.1](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18)，中文为规范主版。已读取父 Spec 和 #19–#44 的任务、依赖与验收内容；全部实现和最终验收完成前保持父 Spec open。
- #19 已推送到 `fix/19-host-profile-evaluation`（`3046af5`），main 起点为 `c3c96c926f1ba05b04e7ca82a6d531a0570e0a84`；#20 为 `fix/20-host-launch-recovery`（`1185bd0`），#21 为 `fix/21-locked-source-preparation`（`a8adac0`），#22 为 `fix/22-runtime-compatibility-preflight`（`0ccd4c0`），#23 为 `fix/23-ultra-codex-runtime`（`7ad2602`），#24 为 `fix/24-ultra-claude-code-runtime`（`ef3ecde`）。#25 的 PR 分支 `fix/25-read-only-migration-audit` 本轮已整合 main 并补修至 `5539b5e0d214e4a34397cd3c6fa2bec3611dd16b`。历史 #26 分支 `fix/26-authorized-codex-team-queries` 已整合 main `ce6cb395682ce5c23d11c7542c8ea172f1fabd3a`；原有开发内容已备份并恢复，升级脚本修复已接入 main 的共享驱动。远端为 [benz-ai-x/dsh-agent-team-ultra](https://github.com/benz-ai-x/dsh-agent-team-ultra)，实时提交／推送状态以 Git 为准。
- **历史轮次按当时指示在开发和验证后关闭 #19–#26；本轮 #27 起须在 PR 验收、评审和合并后关闭。PR #45–#52 已按用户逐项授权合并；PR #48 的评审发现和额外模块类型漏检已修复，最终 Standards / Spec 均为 0 项未解决发现。PR #51 已完成 main 整合，修复缓存与 Team 历史审计两项 P2，通过完整验证和双轴复审后合并。** 用户已完成 `gh` 设备授权登录，本仓库权限为 `ADMIN`。此前的认证阻塞已经解决，不能继续将其列为未完成原因。
- 阶段 A 的既有开发和验证记录保留；PR #45–#52 已合并，#27–#33 也已通过各自复审、验证和合并流程进入 main `2c5a355deefcf3c9dfc3384787e9cfe3de4678e3`。Batch 2 的 #34–#36 唯一统一重试已修复review 3的2 high与4 medium，Harness最终head `806e58873bb055e258b4623d03c9fbad41a26dc7`与Ultra development/acceptance head `ca17782415c4a209a972c4b42636f52edaa72121`已推送并由HTTPS回读；Ultra精确prepare/install/build、focused 25/25和首次正式`pnpm verify`均绿。六个live marker已逐一通过双读/单字节/完整回读证明恢复，三项均保持OPEN且5/5；PR正文完整回读为3个`Closes`、0个`Refs`。开发收口后唯一入口是全新隔离review；本agent不评审或合并。PR #61/#37开发成果保持暂停于review 2前。阶段 C 与#44仍未完成，父Spec #18保持open。
- 本轮先按用户指示创建 #19 的 PR，再依照“继续”按顺序创建 #20–#25 的 PR、评审并关闭已完成 Issue。评审使用各自固定提交的独立工作区，未把 #26 WIP 混入 PR。#25 的补修在 `/tmp/ultra-25-audit-fix-vHVNjX` 完成，其锁定 Harness 与主工作区 #26 的来源分别验证。

- **#19–#26 Acceptance criteria 已同步**：按用户要求，以 main `6253119`、PR #45–#52 的实际合并记录、逐项代码／测试断言和既有验证日志重新审计 39 项验收条件。已实际将 GitHub #19／#20／#21 各 4 项，#22／#23／#24 各 5 项，#25／#26 各 6 项全部勾选，并逐项回读确认；仅改变该小节的复选框，正文与 closed 状态保留。#25 的完成范围是只读审计和迁移设计，#26 为授权查询，阶段 C 迁移及 #44 真实认证 native 验收仍是后续任务。本轮 strict 554 项／0 警告通过，未重复运行既有通过的完整测试；逐项证据及更新前后快照在 `/tmp/ultra-19-26-acceptance-audit/audit.json`。

- **再次回读核对 #19–#26（最新：2026-09-06 14:30，Asia/Shanghai）**：GitHub main 仍为 `6253119`，39 项验收文字与逐项审计一致且均已勾选；8 个对应合并提交都在当前 main 中。最终完整验证记录中的 112 个输入 SHA-256 与现有文件全部一致，锁定 Harness `fdfdbaeb0e` 工作区干净。本次重新运行 strict，554 项／0 警告通过；既有运行时验证仍适用，未重复运行完整测试，也无需重复写入 GitHub 正文。最新回读快照和证据映射保存在 `/tmp/ultra-19-26-latest-recheck.json`，严格检查日志为 `/tmp/ultra-19-26-latest-strict.log`；前次记录保留于 `/tmp/ultra-19-26-recheck-9heliuay/recheck.json`。

## #33 与 #32 完成状态

- **#32 已完成（2026-09-07，Asia/Shanghai）**：分支 `fix/32-team-message-center` 从 main `5ab1c5a2c5e16b6832edbdef8dd1473bc913e022` 建立；[PR #58](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/58) 已普通合并为 `08585631ea6e618a3adbf7143046d00fde00f5d7`，Issue 自动关闭并回读为六项 AC 全部勾选。维护 Harness 分支 `fix/ultra-32-team-message-read` 已提交并推送 `c2940ac5039b744f962d2b264c03a6e9fb33af07`。Team projection stateVersion 6 从既有 queue／delivered 事件重建 message id、sequence 和 time 索引；Host 以精确 live Lead、持久 flush 和固定 committed cursor 提供有界 metadata list 与按需安全 detail。伪造参与者、过期身份、跨 Team／变更查询／损坏／未来 cursor 均拒绝。没有新增 Team event、Session、native-operation 或 Ultra storage 格式。
- Harness 的 Agent Teams Client 继续唯一拥有入口、弹窗和导航，并发布公开 session-scoped `agent-team.panel.view`。Ultra 通过生成 `agentTeams.view/listMessages/getMessage` Remote 注册一个稳定 `messages` 子视图，显示 sender／recipient／event time 与 pending／delivered／unknown，明确投递不代表已读或任务完成。正文只在选择后加载；literal text、脱离附件的图片元数据和显式 omissions 可见，Studio Snapshot／Run Index／list／cursor 不含正文，也不读取 raw native transcript。ADR 0023 记录权限、内容、cursor 和 Slot 边界；#33 仍负责发送／回复，#36 负责实时订阅／重连，#44 负责真实认证 native 验收。
- TDD RED 为 Harness 8 项缺失行为和 Ultra 缺少 UI。首轮固定 SHA Standards／Spec 审查进一步发现：owner Client 绕过保留的 injected-hook surface、筛选／刷新未清除 pending detail、roster 错误被 list 结果覆盖且刷新不重试、cursor 可包含 flush 后追加事实、Team dispose 不等待已接纳读取、稳定 id 未显示，以及缺少实际归档 owner UI 到 Host 的完整链路。各项均先用 RED 复现后修复。首轮复审确认这些问题全部关闭，同时新增发现打包探针手工替代 renderer、README／补丁账本仍引用首版 pin；现已改为 production renderer、root、session scope 和 child Slot 实际组装，同一 `renderSlot` 故障注入稳定以预期错误退出，来源身份和 `eea13874ce`／`c2940ac503` 记录也已同步。最终 Harness 两个 owner 包 **271 tests／10 files** 通过，reader 九项测试的语句／分支／函数／行均为 100%；built-lib Remote、Host／Client build 和 32／32 doc-sync 通过。最新 `pnpm verify` 通过 **582 strict／0 警告、340 tests／30 files**，八归档的真实 owner UI 经认证 HTTP 分两页读取 22 条 DSH／Codex／Claude 消息，按需显示正文和稳定 id，Host 重启后复用 committed cursor；真实 Web、Codex／Claude 新建与恢复、完整卸载均成功。两个历史升级与维护／官方 11 组对照也已复跑通过。最终 head `47aac4f72456db6292cdb9e0a8ea900d92f9a21a` 的 Standards／Spec 精确复审均为 0 项未解决发现；merge tree 与该 head 相同。飞书完成通知成功，日志 `/root/workspace/.ultra-checks/32-completed-feishu.log`。逐项记录见 [#32 验收证据](docs/evidence/issue-32-acceptance.md)。

- **#33 PR #59 已完成（2026-09-07，Asia/Shanghai）**：维护 Harness `fix/ultra-33-team-message-send` 的补充证据提交已推送为 `d2d870fbe40bc0e968abdac854a3aae495162bec`。Team owner 新增 exact-Lead-only `submitMessage` 与 generated `agentTeams/sendMessage`，按 `(Team, Host sender, request id)` 用 canonical fingerprint 持久重放／冲突；required `team/message/request-committed@1` 原子保存 accepted receipt、同 Team reply 和 queued message，projection 7／checkpoint／旧格式重建／未来格式拒绝均已同步，keyless recorded Session 现由 TypeScript/Python SDK 双侧快照证明。提交后投递由 Team 生命周期拥有，caller 断开、Host 重启或 provider 缺失不会新建消息；provider 回归只送达原 message，只有 delivered 事实改变阶段。跨 Team reply、普通 teammate、接受前取消和坏输入均在无持久副作用下拒绝。
- Ultra 在既有 Team owner `messages` Slot 中加入中英文发送／回复 composer：首个 await 前冻结 Team-scoped UUID 意图，并须先向 `sessionStorage` 写入和读回精确内容；保留失败时不调用 Remote，保留草稿并给出双语“未发送”诊断。每次提交有 15 秒确认 deadline；永不 settle 的 Remote 被 abort 并转为 unknown，完整 request／recipient／reply／正文留待显式同请求 retry。换 Session、卸载和新意图清理 timer/abort，迟到 settle 不改 UI。刷新和重挂载不自动重发。持续 watch／自动刷新／重连状态机仍属于 #36；真实凭据 canary 仍属于 #44。
- 实际 packed gate 安装八归档并经 production renderer、generated Remote、owner child Slot 调用 Loader 装载的真实 TeamService，组合 AgentLoop、Agent Registry、JSONL persistence 与受控 external provider。真实 durable acceptance 后刻意丢失一次返回回执，生产 UI 到达 deadline、保留 exact intent，Host 冷恢复不自动发送，provider 恢复和显式 replay 全程只见一条 required fact／一次 provider work；缺失／重复 required fact 的负控均拒绝。Harness 4 个 owning suites 186 tests、整个 Team package 376 tests（2 个既有 skip）、TS/Python SDK 快照及 Host/Client/docs/types/build 均通过。Ultra focused 为 3 files／48 tests；合并前后 `pnpm verify` 均为 582 strict／0 警告、30 files／346 tests、八归档／Web／Codex＋Claude JSON/SQLite recovery／卸载全部通过。实时重读 Issue 后六项 AC 逐条成立，仅更新六个 checkbox；PR #59 merge commit 为 `2c5a355deefcf3c9dfc3384787e9cfe3de4678e3`，Issue 已自动关闭。详见 [#33 验收证据](docs/evidence/issue-33-acceptance.md) 与 [pipeline state](PIPELINE_STATE.md)。

## #34–#36 Batch 2 唯一统一重试候选

- 本轮接入 `beb16ff` 已有的六项功能修复，并以 Harness `b78caad462c3509127761904ed59ee549b6b6160` 补齐过滤后的 ArrowLeft 和公开 `createTeamWatchOwner`。任务面板与 Ultra 消息中心通过浏览器 module table 共用清理实现，各 registration 仍独立。八项去重审查发现与回归映射见 [PR #60 修复记录](docs/evidence/pr-60-review-fixes.md)。验证使用 `/root/workspace/pr60-fixes.U6WRei` 隔离工作树；原 stash 和并行开发记录保留。
- 本轮补修后的完整 `pnpm verify` 自然退出 0：582 strict／0 warning、30 files／359 tests、八归档安装／production DAG／CAS／watch／Web／Codex＋Claude JSON与SQLite恢复／完整卸载全部通过。Harness 定向检查与真实 Web 回归通过；全仓 lint 的剩余错误属于 PR 起点前的 `message-read.spec.ts:541`，按范围保留。声明 freshness 和独立 bundle 模块映射的中途失败及修复均记入上述证据，不冒充首轮全绿。

以下保留 `beb16ff`／Harness `806e5887…` 收口时的历史验证；其中的“最终”仅指当时的候选，当前来源和结果以上两条为准。

- 维护 Harness 分支 `fix/ultra-34-36-task-dag-live` 最终为 `806e58873bb055e258b4623d03c9fbad41a26dc7`，本地、tracking与HTTPS `ls-remote`一致且worktree clean。重试提交按issue顺序为：#34 `ec0f240b03`，#35 `13f5fb25d7`与docs `938adcc566`，#36 `806e58873b`。公开 Team owner `TeamAction`仍只把同一`TeamView.tasks`投影为list/DAG/shared detail，不创建Client权威状态。
- #34：blocker copy只列同一Host view里status未完成的前置项，完整历史`blockedBy`关系和DAG边保留，ready/claimability直接显示Host事实；watch完成一个dependency会同步更新提示。fit-to-view按实际视口与16px margin计算完整缩放，默认260px五行DAG得到0.35并居中；手动0.5–2 zoom、pan、keyboard与native list替代不变。两个公开用例分别先真实RED再GREEN，完整TeamAction 38/38。
- Harness最终验证：TeamAction 42/42，TeamAction/browser/Fiber owner 55/55，Host+Client owner 115/115；built Remote 1/1、Team Web replay 3/3、snapshot corpus 2/2、GUI 283 files／3925 pass／1既有skip、doc-sync 32/32、full typecheck、production Host/Client/Web build、focused lint、i18n/pairing/generated与`git diff --check`全绿。Ultra #34 archive继续以真实Host task API经production renderer→Slot→generated Remote→AgentLoop/Team/JSONL验证list/DAG/detail。逐项证据见 [#34 验收证据](docs/evidence/issue-34-acceptance.md)。
- #35：编辑期间watch仍不推进edit-start base。第一次CAS冲突成功重读权威revision时保留旧草稿，只为下一次用户显式Save推进base，绝不自动重交；重读失败保留真实错误、旧base与草稿，不显示假成功。并发删除已选dependency时，picker保留明确英中unavailable/deleted原生checkbox，用户可取消，预览仍不算Host提交。三条公开行为均先RED后GREEN；正式双语Agent Note/README pairing同步。Host missing/self/indirect-cycle、role、A/B/C ready与tombstone契约不变。逐项证据见 [#35 验收证据](docs/evidence/issue-35-acceptance.md)。
- #36：公开`agentTeams/watch`与Fiber ownership不变；TeamAction不再为每个pending-read invalidation分配Promise/resolver waiter，而是每generation共用一个completion和dirty bit，同时最多一条权威read。公开`async_hooks`测试在首读和trailing读各灌入4096次失效，均保持常数completion并最终发布最后一次Host authority。message page/roster原有有界coalesce、old-generation fence、same-Team draft、Team切换、stale/disconnected/unavailable英中文案与no-resend保持。逐项证据见 [#36 验收证据](docs/evidence/issue-36-acceptance.md)。
- Ultra精确锁定上述Harness与不变docs digest `d4028c4f…e767`；正式prepare/install成功，Client声明按source guard要求用官方4GiB project `tsc -b --force`重发后build与strict 582/0通过。message/mount owning 25/25。唯一统一重试正式`pnpm verify`第1轮即通过582 strict／0 warning、30 files／359 tests与8归档：production task DAG/dependency CAS/watch、真实Web、Codex/Claude JSON+SQLite recovery、registration release及完整uninstall均绿。历史local-gate红仍1、连续红0。精确恢复点只以 [pipeline state](PIPELINE_STATE.md) 为准。
- #34/#35/#36勾选前各marker均连续两次fresh读取并确认OPEN/body/updatedAt稳定；每次PATCH只改唯一checkbox字节，反向替换恢复before全文，写后完整回读一致。三项现在均OPEN、5 checked / 0 unchecked，因此PR正文应从三个`Refs`改为三个`Closes`；只有合并才关闭Issue。唯一后续入口是最终heads上的全新隔离review，禁止把历史review 3或本次唯一重试1/1重置。
- PR #60正文已通过REST单字段更新并完整回读，SHA-256 `b9dcb11a…da754`，记录全部RED/GREEN、Harness精确head、full gate和3个`Closes`。Ultra `ca17782…`为development/acceptance head；本交接只追加最终state-only记录，不改变已验证产品。最终review须用GitHub API返回的live PR head与Harness `806e5887…`，不要复用旧`/tmp/dsh-agent-team-ultra-pr60-review-40fdd6fe`。

- **#31 已完成（2026-09-07，Asia/Shanghai）**：分支 `fix/31-conversation-profile-launch` 的固定起点为 `1a74d7fe28b11b8c014e648c9bb43bf246112539`；[PR #57](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/57) 已普通合并为 `5ab1c5a2c5e16b6832edbdef8dd1473bc913e022`，Issue 自动关闭并回读为 6／6 AC checked。三个固定 Lead 对话工具列出／读取既有 Profile 并沿 Studio 同一 Host 流程启动 Active Revision；普通 teammate 由自身作用域显式屏蔽，Evaluation Worker 在发布前排除，名称冲突拒绝启动并回滚。
- 持久 `tool/call` id 与精确 Team／Lead 确定性生成 canonical UUIDv8 Launch Request ID；同 call 重放、规范化等价输入、改输入冲突、新意图、pending Binding、Team 接纳前后取消、服务替换及 JSON／SQLite 冷恢复均收敛到至多一个永久成员／Binding。实际 AgentLoop 请求包含三个工具且 Lead Session 持久 call/result；generated Remote `spawn` 与 Studio 返回相同实例。
- [#31 验收证据](docs/evidence/issue-31-acceptance.md)映射全部六项 AC；[ADR 0022](docs/adr/0022-launch-active-profiles-from-lead-conversations.md)记录权限、身份和复用边界。初始 head `247a42a` 的 Standards 审查为 0；Spec 发现一项 P2：打包探针只执行 list 后由 Remote 启动，不能证明归档内对话启动。新增门禁先稳定 RED 为零项持久对话调用，再由受控 Lead 模型通过安装后的 AgentLoop 依次调用 list／detail／launch；新建 Codex／Claude native 成员由 launch 工具产生，生成 Remote 以派生 ID 得到同一结果，JSON／SQLite 恢复重放同一持久调用。补修后完整 `pnpm verify` 通过 **562 strict／0 警告、336 tests／29 files**，八归档、真实 Web 和卸载均成功。
- 固定历史 Codex `debde06c`／Claude `081357d` 归档升级保留 Profile Revision、成员、native handle／session；升级后的受控模型取得并执行三项工具，新 launch 意图遵守永久名称，原 ID 仍恢复同一成员。维护 fork 与官方 `d347e7` 的 11 组 Team 公共行为对照和拒绝准入此前已通过且补修不改变 Harness／业务实现。历史升级复跑前，旧 Harness 工作区依赖链接仍会被上一次归档卸载移除；按旧 lock 离线恢复后原命令均退出 0，三个源码工作树保持干净。独立 Standards／Spec 审查者完整复核固定差异 `1a74d7fe..fc55822`，均报告 0 项未解决发现；最终精确 head `22c11003a2e643c54a76579888f9869e765a3cd0` 的两轴复核仍各为 0。GitHub 无 checks、main 无保护规则；锁定 head 普通 merge 的双亲正确，merge tree 与评审 head 相同。飞书完成通知发送成功。

- **#30 已完成**：Ultra 分支 `fix/30-claude-task-operations` 固定起点为 `c3a95739c2a4e474d1f95f76c526c7a2ae86762f`。Claude 的进程内 SDK MCP server 新增 `team_task_update`／`team_wait`，与四项既有工具组成六项明确声明；直接复用 Host `tasks.update`／`wait`、当前 grant、可信 turn/call 和持久任务回执，不新增 Harness 改动或持久格式。
- 新增八项共享任务集成回归：与真实 DSH 队友逐结果对照 CAS、DAG、墓碑、所有权和 Lead-only 规则；覆盖第 64 次提交后丢回复的同 call 重放／冲突、依赖解除 wait、超时／中断保留 owner、旧 Lead generation wait 撤销与新 grant 精确重放，以及 JSON／SQLite 两次冷恢复。现有 TeamAction 通过生成视图显示 Pending → Claude owned In progress → Completed。目录六个测试文件共 **55 tests** 通过。
- 锁定实际 SDK 0.3.241／Claude Code payload 2.1.241 使用本地确定性模型端点，实际读取已完成依赖、认领／编辑／完成任务并完成一次真实超时 wait；Team 日志得到三条原任务事实且现有 task view 为 completed。真实凭据验收仍归 #44。Catalog 将六项 `memberOperations` 与 `fresh`、Profile 能力和 `sandbox/evidence/usage` 分开声明，不冒充 fork、Hooks、exact-call approval、evaluation 或 workspace-write 能力。
- 完整 `pnpm verify` 通过 **562 strict／0 警告、327 tests／28 files**，Host／Client build、八归档安装、JSON／SQLite 的 Claude 任务回执／wait／冷恢复、真实 Web 和完整卸载均成功。固定前身 `081357d` 的历史 Claude 归档升级保留 member、Revision 1、Session／handle，由 0 项变为六项操作；维护 fork `b85ebb3fca` 与官方 `d347e70390` 的 11 组公共行为对照和拒绝准入均通过。首次升级运行仅因历史 Harness 的 frozen 依赖未恢复而在安装预检失败；恢复原锁定依赖后同一命令自然退出 0，历史源码始终干净。
- [#30 验收证据](docs/evidence/issue-30-acceptance.md)映射全部四项 AC，GitHub 回读为 4／4 checked。[PR #56](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/56) 的 Spec 初评为 0；Standards 两项 P3 文档错误在 `774817f` 修正。完整复审及最终精确 head `7ad45dfdb66d481ffa3af6d6bc85825b1988b776` 确认均为 0 项未解决发现。GitHub 未报告 checks，main 无保护规则；PR 为 CLEAN／MERGEABLE 后使用 `--match-head-commit` 普通 merge，于 2026-09-07 03:09:52（Asia/Shanghai）合并为 `1a74d7fe28b11b8c014e648c9bb43bf246112539`。合并提交双亲正确且 tree 与审查 head 相同；Issue 自动关闭，飞书 bot 完成通知于 03:11:29 发送成功。
- **#29 已完成**：[PR #55](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/55) 的精确审查 head `f53fd270402758f73bcb9a5049718211de22e711` 已普通 merge 为 `c3a95739c2a4e474d1f95f76c526c7a2ae86762f`；merge tree 与 head tree 一致。Issue 自动关闭并回读为 5／5 AC，最终 Standards／Spec 均为 0 项未解决发现，飞书完成通知成功。
- 锁定 Harness 已切到干净且完成构建、提交和推送的 `/root/workspace/deepseek-harness-ultra-29`、`b85ebb3fca3da0c735cfed0b4532f926a4221e24`。它增加 Host-only `turns.recover`：当前 grant 只能读取精确成员／provider／handle 的 launch、入站 delivery id 和已提交 settlement；严格分页、限额、取消和代际核对，不向模型声明工具，也不新增持久格式。229 项 owning tests 通过，四个改动运行时文件语句／分支／函数／行覆盖均为 100%；Host／Client build、真实 Loader、生成目录、类型等价、文档同步和 lint 通过。
- Claude 通过锁定 SDK 0.3.241／payload 2.1.241 的进程内 MCP 暴露四项工具：成员列表、任务列表、任务详情和消息发送。调用身份只取 SDK `claudecode/toolUseId`，消费当前 Host grant 和持久回执；请求／转义结果／每轮调用数／授权等待、取消和代际边界均有测试。Read／Glob／Grep 仍由原生 cwd 与符号链接约束执行，shell、写入、外网、审批、额外 MCP、任务写入／等待和 Evaluation Worker 的生产成员权限未开放。[ADR 0020](docs/adr/0020-authorize-claude-team-tools.md) 已 accepted。
- Claude 终止结算使用原 turn 的独立持久身份。Host 已提交结果优先；没有 Host 结果时只接受可信普通 `end_turn` 或锁定 payload 的合成 API 失败，缺失终态结算为 interrupted。重复／冲突／晚到旧代际终态及有效结果后的 iterator 错误不能覆盖首个可信结果。恢复先对账 Host 事实，再读取公开 transcript；失败的 flush 保留快照并在同 provider 新 grant 上重试。canonical marker、legacy 无 turn marker、工具结果续轮、分页缩页、畸形／重复边界、非法时间和溢出用量均有回归。
- 双轴首评各发现同一项 P2：恢复拒绝后的首次投递失败被 ordering tail 吞掉，第二次投递可绕过恢复启动 native turn。真实 Host／持久化夹具稳定复现；新增正式回归并使 `deliverOnce` 每次独立等待当前 recovery。补修后的 Claude 目录 **46 tests／4 files**、完整 `pnpm verify` **562 strict／0 警告、318 tests／26 files** 均通过，八归档安装、真实 Web、Codex 与 Claude 的 JSON／SQLite 新建和冷恢复、消息／最终回执去重及完整卸载再次通过。历史升级与官方 11 组对照也在补修源码上重跑通过。真实凭据产品验收仍归 #44。
- 从 `081357d17f7a0535b75bb7d3133177febddee4a2` 生成的历史 Claude 归档在 JSON／SQLite 升级后保留原 member、Profile Revision 1、native handle 和单一 Session，并由 0 项变为 4 项成员操作；Web 与卸载通过。维护 fork `b85ebb3fca` 和官方 `d347e70390` 都通过同一 11 组行为契约；未授权官方源在安装／导入前拒绝，且不创建业务数据。
- [#29 验收证据](docs/evidence/issue-29-acceptance.md)映射全部 5 项 AC。首评 Standards／Spec 各 1 项 P2，修复后完整复审和最终精确 head 复审均为 0 项未解决发现；独立最终报告为 `/root/workspace/.ultra-checks/29-{standards,spec}-exact-head-review.md`。#39–#43 分支冲突仍待用户决策，只暂停相关阶段。
- #28 最终候选 `112042507ac25a71b1e36dc422fcb4019a320ddb` 经独立 Standards／Spec 复审均无未解决发现；[PR #54](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/54) 已合并为 `e728af1a60b7685ac622582a90429f9d639b0ee2`，Issue 关闭、5／5 AC 已回读、飞书通知成功。
- frozen manifest 当前为 #27–#31 complete、#32 in_progress、currentIssue 32；原 18 项范围和顺序不变。

## #27–#28 过程记录（已完成）

- **18:11 OOM 中断后的恢复核对**：内核于 2026-09-06 18:11:42 杀掉 `tsgolint`（PID 1048467，anon RSS 2917116 KiB），原 tmux 窗格 scope 同时以 `oom-kill` 结束，峰值 7.2 GiB；当前 tmux 于 18:12:56 新建。`/tmp` 为 tmpfs、占用约 6.5 GiB，其中 `/tmp/.pnpm-store` 约 4 GiB；`vm.swappiness=0`，事发时 4 GiB swap 全部空闲。当前 scope 为 `OOMPolicy=stop`／`KillMode=control-group`，与 OOM 导致整组终止、最后窗格消失后 tmux 退出的链路一致；没有重演主机 OOM，也没有更改系统配置或删除临时数据。已确认旧 lint／doc-sync 进程结束，全部 WIP 保留。恢复后 strict 554 项／0 警告通过，GitHub main 仍为 `2568444`、#27 closed／PR #53 merged；#28 open、无评论。
- OOM 恢复后验证完成：最终全 lint、32／32 doc-sync（439.31 秒）、真实 Loader、TS SDK `agent-team-external` 回放通过。Python 单文件打包先触及独立 3 GiB scope 上限，随后单独使用 5 GiB scope 构建 251.8 MB 实际可执行文件，refresh／只读 replay 均通过。开发依赖已按 frozen lock 恢复。重型命令使用 `/root/workspace/.ultra-checks/tmp` 磁盘目录及独立 systemd scope；Go 限制 `GOMEMLIMIT=768MiB`／`GOMAXPROCS=2`，文档门禁串行。全仓 force 声明生成触及 Node 堆上限，改用 Session／Agent Team 两个实际 `tsc -p` 编译及独立 tsBuildInfo 后解决 freshness 失败；没有触摸时间戳或弱化检查。OOM 飞书通知成功，日志 `/tmp/ultra-28-oom-feishu.log`。
- PR #53 于 2026-09-06 17:33:33（Asia/Shanghai）合并，main `2568444`，#27 随后关闭，6/6 验收均已勾选。最终 head `472145a`，固定基准 `6253119`，Standards／Spec 各 0 项未解决发现。GitHub 未配置必需 checks／审批／保护规则；使用 `--match-head-commit` 正常合并，没有绕过门禁。
- 修复后完整 verify：554 strict、274 tests、八归档实际安装／消息／回执／JSON＋SQLite 冷恢复／Web／卸载全部通过（`/tmp/ultra-27-review-final-verify.log`）。Harness build、196 owning tests／业务源码 100% coverage、两 SDK 回放、32 doc-sync、全 lint 和正常 push hooks 通过。147 个最终输入摘要在 `/tmp/ultra-27-final-verified-inputs.json`；52 个本地文档链接与差异格式检查通过。
- 飞书完成通知使用既有 bot／收件人成功（`/tmp/ultra-27-completed-feishu.log`），先前阻塞通知也成功；不记录收件人身份信息。
- #28 正文和评论已完整读取（无评论），缓存 `/tmp/ultra-28-issue.json`。任务为共享成员任务读取／认领／更新／完成／等待；须复用 expectedRevision／DAG／墓碑／所有权，持久回执重放不增 Revision，wait 仅观察、不启动成员或创建文件锁，中断不释放所有权，现有 UI 展示结果。
- #28 来源首版 `7efa653185a9986a46f52727f49a70d2c147a659` 已正常提交／推送，任务及回执格式为 payload 4／checkpoint 5，Session 0／Ultra v1 不变。Codex 集成发现注册名单仍缺任务／等待操作；将宿主及 Loader fixture 改为完整六项声明，观察 RED 后修复，提交／推送 `d02bfcdf13171e1167ece7b4ea29938900678de9`。补修后 222 owning tests／业务源码 100% coverage、Host build、真实 Loader、正常 staged lint／pre-push typecheck 通过。最终 doc digest `6daca9531f0e98ac6b09bfe768cd6db008f39381c93d692b116ac75af46c2d53`，扩展资格 `agent-team-ultra.phase-b.member-tasks.v1`。两个 SDK 的格式录制在首版通过，注册补修不改变格式；普通 inline-image SDK 快照的全局技能注入失败已在干净 #27 基线复现，未刷新无关快照。
- Ultra 当前锁及补丁表已更新至 `d02bfcdf13`。首条真实 Codex 认领／完成／原回执重试已 GREEN；回执按 JSON 值比较，键顺序不作为接受语义。原 22 项 Codex 测试通过；共用真实 Host／外部 native fixture 已提取至 `packages/codex/tests/fixtures/member-workflow.ts`，原 21 项再次通过。新增 `member-tasks.integration.spec.ts` 的 5 个案例分别通过：DSH/Codex 同角色的所有权／CAS／DAG／墓碑／Lead-only 对照、依赖解除及重叠写入范围只作建议、wait 超时／中断保留所有权、JSON／SQLite 丢任务回执与两次冷重启保持原记录。测试期间只替换外部 native／LLM；执行策略仍由 fixture 断言 read-only／approval-never／network-disabled。
- 现有 TeamAction UI 通过真实 Host 任务／视图展示 Pending → In progress／Codex owner → Completed。新增根 dev link 到锁定 UI 包，lockfile 仅增加该 link；JSON fixture 按需导入 SQLite。Vitest 为该 UI 场景单独配置 Host Node 导入，避免影响普通测试的错误类型身份；相关 92 项回归通过。
- 最终完整验证 `/root/workspace/.ultra-checks/28-ultra-final-qualified-verify.log` 退出 0：562 strict／0 警告、281 测试／24 文件、八归档安装、任务读写／原回执／wait、JSON＋SQLite 冷恢复、真实 Web 启动、完整卸载。归档中旧任务仍保持原 Revision，新增任务使列表分页，断言已纳入真实游标。固定官方与 fork 的 11 组公共行为对照通过（`28-official-comparison.log`）。[逐项验收记录](docs/evidence/issue-28-acceptance.md) 已写入；Codex 历史归档升级通过。Claude 旧基线缺失 brand→Cordis 依赖，按原 frozen lock 恢复后来源仍干净；其升级安装触及独立 2 GiB scope 上限，20:11:59 内核记录为 MEMCG OOM，tmux 始终存活。旧基线依赖再次缺失后按原锁恢复并先通过原兼容性检查，单独以 4 GiB scope 直接执行同一升级脚本，最终通过（`28-claude-upgrade-direct.log`）；未改系统内存配置。#28 实现已提交／推送 `8711d28`，五项验收已逐项核验并勾选，Issue 保持 open。[PR #54](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/54) 已创建，正在以固定 main `25684448723ffa83e6aeb5c37a42f65df1461682` 开展并行 Standards／Spec 审查；通过后才能合并。

- **PR #54 首评需修复**：候选 `1a32c83`、固定 main `2568444`；Standards 1 项 P3（共享诊断使用 DSH 专属 blocked_by／write_scopes），Spec 1 项 P2（第 64 次 task claim 提交后丢回执，同 call 重试在 grant 前被调用计数拒绝）。独立报告与真实 RED 位于 `/root/workspace/.ultra-checks/28-standards-review.md`、`28-spec-review.md`、`28-spec-rate-limit.log`。已撤回第 3 项验收勾选，其他 4 项保留；PR 不合并。飞书审查阻塞通知已发送。将沿既有公开 native transport／Host grant 边界做 TDD 修复，再复验最终候选及两轴。

- **PR #54 补修后验证**：Codex 按每个 live turn 的不同可信 call 身份限制 64 个新调用；原身份重试交给 Host 恢复回执或拒绝输入冲突，不在 adapter 缓存业务结果。真实第 64 次 claim 丢回执 RED→GREEN，改输入仍冲突、新调用仍限流；原大小／下一轮预算测试通过。Harness 通用依赖列表／写入范围诊断分别在 DSH 与 native grant 完成 RED→GREEN，`7119c51c8d09ac56370e884e492c66a102c779af` 已正常提交／推送；224 owning tests／业务源码 100%、build、Loader、正常 hooks 通过。格式和 docsDigest 不变；先前两个 SDK 的格式回放、历史归档升级和官方对照证据不受这两项补修影响。
- 修复后 prepare／frozen install 与完整 `pnpm verify` 退出 0（`28-review-final-verify.log`）：562 strict／0 警告，282 测试／24 文件，八归档任务／wait／receipt／JSON＋SQLite 冷恢复／Web／卸载。第 3 项验收可以恢复勾选；五项证据已更新。下一步提交此补修并请两个原审查 agent 对最终提交重新审查，尚未合并。

## #27 本轮进展（2026-09-06，Asia/Shanghai）

- 冻结范围仍为 #27–#44，按编号逐个完成；main 基准 `62531191d909a890394d7e922259a8e63eb80f32`。PR #53 的首版阶段记录保留如下；当前已合并／关闭，最新状态见上。完整 Issue 正文／评论缓存于 `/tmp/ultra-27plus-current-issues.json`，权威需求为 GitHub。
- Harness 原实现提交 `9649602da9` 使 native 消息／终止结算与回执在一个 required payload-3 事件中原子提交，Team checkpoint 4、Session 0、legacy payload 2；真实 flush 故障、冷重启、旧 grant 撤销、schema／projection 拒绝、Loader 和 authored recorded-session 均有验证。共享旧 checkout 未修改。
- Ultra 实现 `team_message_send` 与 `turns.settle`：可信 turn／call 独立传入 grant；最终／失败／中断消息归属 native 成员，进入 Lead mailbox。大结果按完整 JSON 的 4096 UTF-8 字节限额明确截断，不复制 reasoning／commentary／完整 transcript。一次工作轮次只有一个 Run，按需详情证明完成和 7 Tokens；Codex↔DSH 往返保留 native thread。
- [ADR 0018](docs/adr/0018-persist-native-team-message-receipts.md)、词汇、项目契约、补丁表和 Codex README 已更新；audit 输出脱敏 operation／settlement 关联。真实认证 native 验收仍归 #44，阶段 C 联合迁移仍归 #39–#43。
- 首版完整 verify 曾通过 554 strict、273 项测试／22 文件、八归档安装／消息／回执／结果／JSON＋SQLite 冷恢复／Web／卸载，日志 `/tmp/ultra-27-final-verify.log`。首次 PR 审查发现的补修和新验证见下；旧日志不能替代修复后验证。
- 本轮使用 tdd、dsh-plugin-dev、domain-modeling、writing-for-agents、code-review、lark-im／lark-shared；维护 Harness 遵循 dsh-pre-push-checks／dsh-ci-test-reliability。用户已授权按确认的 bot／收件人通知。

## #27 PR #53 首次审查后的修复（已完成）

- PR #53 已创建，固定审查基准 main `62531191d909a890394d7e922259a8e63eb80f32`、首版 head `1fbde8a097010d7c6776a05e0dda676865a1eaef`；该首评已完成修复和复审，当前已合并。
- Standards 首评：缺少 TS／Python SDK 的新事件回放证据（P2）；接口 JSDoc 仍称 read-only（P3）；工具 query 命名不准确（P3 判断项）。后二者已修正；SDK 夹具已补齐，TS 真实进程和 Python 实际单文件运行时的刷新／回放均通过，且断言原始回执和 messageId 关联。
- Spec 首评确认崩溃后追加工作未重新绑定 grant（P1）。新 Host 测试已 RED→GREEN：inactive 成员的 mailbox 投递先走现有 roster 恢复和重新授权。修复已提交 Harness `d5eca257c2a0a21392ae8af0ee050f28358362f6`，Ultra lock／prepare 已更新；完整 verify 已通过端到端恢复及归档测试。
- Spec 随后撤回要求历史 turn 重放的 P1 判断：锁定 Codex 的原 RPC callback 仅保存在进程内，冷启动会将孤立 turn 标为 interrupted。保留 active-turn 校验；修正替身与证据，分别验证存活 turn 重试、Host 持久回执恢复和 Codex 冷启动中断结算。完成通知丢失的测试改为原生已落盘、传输未通知后重启。
- GitHub 撤回受影响的第 3／4／6 项验收勾选；首次验证不能作为修复后证明。使用已确认 bot／收件人发送首次审查阻塞通知成功，日志 `/tmp/ultra-27-review-blocker-feishu.log`，不需要用户操作。
- 验证：Harness 196 项测试通过；业务源码 100% coverage（未改动的公开 testkit 不属于此次覆盖选择）。完整 build、32 项 doc-sync、全 lint 通过；正常 push hook 通过。TS SDK 日志 `/tmp/ultra-27-ts-sdk-replay.log`，Python 实际产物回放 `/tmp/ultra-27-python-sdk-replay.log`。打包后按锁恢复 workspace 开发依赖，未更改锁定版本。
- 最终完整 `pnpm verify` 退出 0（`/tmp/ultra-27-review-final-verify.log`）：554 strict、274 项测试、八归档安装／消息／回执／终态／JSON＋SQLite 冷恢复／Web／卸载全部通过。此前补修中仅错误文案断言与嵌套 matcher lint 失败，均已修正。
- 收尾结果：最终 head 双轴通过，六项验收已勾选，合并／关闭／通知全部完成。

## PR 与提交后评审

| Issue | PR | 合并目标 | Standards 初评 | Spec 初评 |
| --- | --- | --- | --- | --- |
| #19 | [#45](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/45)，已合并 | `main` | 0 | 0 |
| #20 | [#46](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/46)，已合并 | `main` | 0 | 0 |
| #21 | [#47](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/47)，已合并 | `main` | 0 | 0 |
| #22 | [#48](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/48)，已合并 | `main` | 修复后 0 项未解决 | 修复后 0 项未解决 |
| #23 | [#49](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/49)，已合并 | `main` | 0 项未解决 | T-14 补修后 0 项未解决 |
| #24 | [#50](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/50)，已合并 | `main` | 共享升级驱动补修后 0 项未解决 | 0 项未解决 |
| #25 | [#51](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/51)，已合并 | `main` | 本轮 P2 修复后 0 项未解决 | 本轮 P2 修复后 0 项未解决 |
| #26 | [#52](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/52)，已合并 | `main` | 限额测试 P3 补修后 0 项未解决 | 0 项未解决 |

- #48 历史评审发现 NODE_PATH、私包闭包、Loader 根目录和 T-04 对照覆盖缺口；本轮以 `80464c4` 修复，再以 `0ccd4c0` 补齐 Standards 新发现的模块类型诊断。最终两轴均通过，见下方 #22 验证与合并记录。
- #51 初评发现丢弃 schema 规范化结果，以及损坏旧布局 checkpoint 会中止审计。`b72fef9` 已修复，新增三条真实 CLI 回归；修复后 Standards 与 Spec 分别复核，均无新增或未解决问题。详见下方 #25 证据。
- #45–#50 复核既有完整验证记录；#51 补修重新执行完整 `pnpm verify`。六个新增 PR 的 286 个本地文档链接检查通过。GitHub 没有报告 CI checks，静态 code-review 不等于 GitHub 人工批准。

## #19 已实现内容

- `packages/domain/src/index.ts` 保留公开 Host／生成 Remote 入口与组合根；Profile 发布、隔离评测、能力安装分别归入 `profile-lifecycle.ts`、`evaluation-workflow.ts`、`profile-capabilities.ts`。
- `host-context.ts` 统一精确 live Lead 校验、公共写入准入、串行 mutation、runtime catalog、生命周期信号和 storage handle；关闭公共准入后，内部已接纳结算仍能落盘。
- 配置、不可变 Profile 快照及错误构造分离为内部辅助模块；公开结果、Remote 名称、持久化 generation 和权威 `agentTeams` 服务保持既有契约。Typert 已通过正式 build 重新生成。
- TDD 复现并修复：Lead 在 runtime preflight 或写队列等待期间退出后，保存、激活、归档及评测仍可能提交的问题。现在在实际执行业务决策以及异步预检后重新校验精确 live authority。
- TDD 复现并修复：Host 替换使进程内 capability generation 从头计数，历史失效 Promotion Gate 因编号复用而重新变成 passed。新 catalog 在开放准入前推进到所有持久 Eval Run、Binding、Run Index generation 之后；历史结果和已有 Active Revision 保留，新 catalog 生命周期的后续激活需要新评测证明。
- 更新了 [项目契约](docs/agent/PROJECT_CONTRACT.md)、[ADR 0003](docs/adr/0003-separate-profile-authoring-from-release.md) 和 [ADR 0011](docs/adr/0011-gate-promotion-with-exact-isolated-evaluations.md)，记录共享业务入口、权限检查时机及评测有效期规则。
- PR #45 提交后，使用 `code-review` 技能要求的两路并行静态评审，范围固定为 `c3c96c9...3046af5`。Standards：0 项明确规范违规、0 项值得报告的 smell；共享 Host 上下文、权限复核、不可变快照、评测结算与目录代际恢复符合仓库规范和 ADR。Spec：0 项明确缺失、范围扩张或行为错误；档案发布、隔离评测、CAS、审批 Hook、历史保留和清理顺序满足 #19。
- 本轮复核远端提交、PR base/head 与既有完整验证日志，PR 差异的 `git diff --check` 和 18 个本地文档链接检查通过。既有验证为 290 项 strict、164 项测试及八归档安装／Web 启动／卸载通过；此次静态评审没有重跑测试，也没有完成 #44 的真实 native 验收。评审时 PR 尚未合并；后续授权合并结果见下。
- 用户随后显式执行 `$code-review #45`，已重新获取 Issue #19 与父 Spec #18，并在干净工作区 `/tmp/ultra-19-pr-review-sgB4Og` 固定 `c3c96c9...3046af5`，由两个独立子代理重新审查全部 15 个变更文件。Standards：硬性违规 0、可报告异味 0；Spec：缺失／部分实现 0、范围扩张 0、错误实现 0。复核 14 个 Remote 声明与基线一致，差异格式和 18 个本地文档链接通过；本次仍为静态评审，未重新构建或执行运行时测试，未修改 PR 分支或提交 GitHub 审批。
- 用户再执行 `$resolving-merge-conflicts #45`：已读取该技能并核对 GitHub 与本地 Git。PR 状态为 `OPEN / MERGEABLE / CLEAN`，base `c3c96c9` 是 head `3046af5` 的祖先；本地没有进行中的 merge/rebase 或未合并文件，因此没有冲突需要解决。未创建合并提交、未修改 PR 分支、未合并 PR；没有代码改动，未重跑运行时测试。
- 用户随后明确要求“合并 PR #45 到 main”。合并前再次确认 head 仍为已评审和验证的 `3046af5`、状态 clean、无 GitHub CI checks；使用带 `--match-head-commit` 的 merge commit 方式，于 2026-09-06 08:43:46（Asia/Shanghai）成功合并。GitHub 回读 PR 为 `MERGED`，main 为 `c6ea879c1e1d1cf766e7c10ad69152e924b36278`。保留源分支及堆叠提交祖先关系；PR #46 的 base 仍为 `fix/19-host-profile-evaluation`。主工作区继续停留在 #26，未切分支或混入其未提交变更。

## #20 已实现内容

- `launch-workflow.ts` 接管 Launch Intent、pending Binding、provisioning、固定路由、能力安装触发和权威 roster 派生恢复；`run-workflow.ts` 接管 canonical evidence、Run Index 修复和审批关联；`studio-projection.ts` 接管共用 Instance DTO、完整 Snapshot 与 stream feed。
- 公开 Host 和生成 Remote 入口保持原样，主服务负责组合、订阅和清理顺序；新模块复用 #19 的 Host 上下文，不包装或替换 `agentTeams`，不引入新的持久化格式。
- TDD 复现并修复新启动和 pending 重试在 Lead 退出后抛出非稳定 `TeamError` 的问题。启动工作流在异步预检、队列执行和预订落盘后重新校验 exact live authority。
- 新增 [启动与恢复集成测试](packages/domain/tests/launch-workflow.integration.spec.ts) 共 7 个案例；与 #19 共享 [真实 Host 测试装配](packages/domain/tests/fixtures/host-workflow.ts)，仅 LLM 外部边界使用可控 adapter。
- JSON／SQLite 整个 Host 重启测试先通过真实 Domain handle 删除派生 Run Index，再证明 canonical Session 能重建相同 Run 身份、时间、用量和路由。重试不唤醒已有冷成员；之后 Team 消息才恢复同一成员，并继续使用原 Revision 的能力和路由。
- 取消测试区分 Ultra pending Binding 与 Team 已持久接受初始工作的边界；另在真实 pending 落盘事件触发 Fiber 卸载，验证 drain 后仍可重放同一意图。
- 用户显式执行 `$code-review #46` 并授权通过后合并到 main。已将 PR base 从 #19 分支改为 main，并更新正文；固定审查 `c6ea879...1185bd0`，merge-base 为 `3046af5`，差异仍仅包含 #20 的一个提交。两个独立子代理重新核对全部 12 个变更文件：Standards 硬性违规／可报告异味均 0；Spec 缺失／部分实现、范围扩张、错误实现均 0。
- 新检查证明合并无冲突且结果树与 PR head 完全一致，14 个 Remote 声明保留，差异格式和 20 个本地文档链接通过。复核该提交既有完整验证：290 项 strict、171 项测试（14 文件）、八归档安装／Web 启动／卸载通过；本轮静态评审没有重跑运行时测试或真实 native 认证验收。证据摘要 `/tmp/ultra-pr46-main-review-verification.json`。
- 合并前再次确认 head、base 和 clean 状态，使用 `--match-head-commit 1185bd0…` 的 merge commit 方式，于 2026-09-06 08:50:32（Asia/Shanghai）合并成功。GitHub 回读 PR #46 为 `MERGED`，main 为 `f702040725d9fa6e6ada50c614f45f3fd2abb90b`。源分支保留，PR #47 仍以 `fix/20-host-launch-recovery` 为 base；主工作区仍为 #26，未切换或提交其 WIP。

## #21 已实现内容

- 新增 `scripts/harness-source.mjs` 统一源码选择、锁定证明、实际 Node 依赖解析和 TypeScript 来源校验；`prepare-harness.mjs` 在校验成功后原子准备 `.dsh/harness`，重复执行输出相同来源证明。
- `DSH_HARNESS_ROOT` 的相对路径固定从 Ultra 仓库根解析；未指定时沿用已准备链接，首次才回退到相邻目录。准备过程只调整本仓库链接，保留 Harness checkout、现有目录及应用数据。
- pnpm links、TypeScript、Vitest alias、Typert、构建、测试和打包均使用统一来源。构建入口检查实际已安装依赖；生成器在检查之后动态导入所选 Typert 实现。打包打印所选 CLI 的绝对路径。
- pnpm lock 仅更新 link 路径；已比较确认 package resolutions、snapshots、settings 和依赖版本不变，`dsh-reference.lock.json` 未改。
- 7 个 [CLI 集成测试](scripts/tests/locked-source.spec.ts) 覆盖 CWD、非相邻来源、重复准备、已安装依赖混用、TypeScript bases/references 混用、拒绝无效选择及保留已有目录。构建通过，strict 为 436 项通过、0 警告；完整隔离验收亦已通过，见下文。
- 用户显式执行 `$code-review #47` 并授权通过后合并到 main。已改 PR base 和正文，固定 `f702040...a8adac0`（merge-base `1185bd0`）对 26 个变更文件重新开展两路独立静态评审：Standards 规范违规／可报告异味 0；Spec 缺失／部分实现、范围扩张、错误实现均 0。
- 新检查证明合并无冲突且结果树与 head 完全一致，差异格式与 50 个本地文档链接通过。复核既有隔离验证的 436 项 strict、178 项测试（15 文件）、八归档安装／Web 启动／卸载及独立打包；原 103 项输入清单与 head 比对，101 项一致，另两项仅 HANDOFF／TODO 的验收后状态更新，所有代码／配置相同。本轮未重跑运行时测试，证据摘要 `/tmp/ultra-pr47-main-review-verification.json`。
- 在再次核对 base/head/clean 后，使用带 `--match-head-commit a8adac0…` 的 merge commit 方式，于 2026-09-06 08:56:39（Asia/Shanghai）合并成功。GitHub 回读 PR #47 为 `MERGED`，main 为 `85b80c25a50c67e3833adc79417917d1398fc918`。源分支保留，PR #48 仍以 `fix/21-locked-source-preparation` 为 base；主工作区仍为 #26，未切换或提交其 WIP。

## #23 已实现内容

- **PR #49 本轮整合与复审（2026-09-06）**：用户授权 review 通过后合并到 main。隔离工作树 `/tmp/ultra-49-review-cc6edu_i` 将 main `debde06` 合入原 `ae2ec72`，逐项解决 6 个冲突文件；提交 `e0a9ee0` 保留 #48 完整闭包、ESM 自引用／模块类型、真实 Loader 根目录及 11 组对照，同时接入 Ultra-owned Codex 和旧包提前拒绝。运行时源文件与锁定 Harness 前身逐字节一致。
- 整合后的完整 `pnpm verify` **506 strict、0 警告；204 测试／18 文件；实际八归档安装、Web 启动及完整行／包卸载通过**。日志 `/tmp/ultra-49-merged-verify.log`。固定前身升级改为当前 main `debde06`，独立干净且已构建的 checkout 为 `/tmp/ultra-49-predecessor-cpcyoykc`。
- 真正从当前 main 的归档升级到 PR #49，在 JSON / SQLite 上保留原成员、Profile Revision 与 native handle，后续消息没有新线程；Catalog 移除／回归、升级 Web 和无残留卸载通过。第一次升级日志 `/tmp/ultra-49-current-main-upgrade.log`。官方／fork 同一 11 组契约通过，日志 `/tmp/ultra-49-comparison.log`。
- Standards 全量 review 为 0；Spec 发现 T-14 的 P3：升级脚本不应固定归档数量。提交 `7ad2602` 改为按每个版本的 Profile bundle 和嵌套 Loader group 得出贡献包身份，与真实归档 manifest 的完整集合精确比对。补跑升级 `/tmp/ultra-49-closure-upgrade.log` 再次通过；本次增量仅改验收脚本／交接，运行时代码仍是完整验证覆盖的 `e0a9ee0`。
- 最终两路对 `debde06...e0a9ee0` 全量及 `e0a9ee0..7ad2602` 增量分别复核：**Standards 0、Spec 0 项未解决问题**。53 个本地 PR 文档链接、差异格式检查通过；已有 pnpm resolutions/snapshots/settings 全保留，仅增加 7 个固定 Codex 条目。
- 核对远端 base/head 与 CLEAN / MERGEABLE 后，通过 `--match-head-commit 7ad2602…` 于 **2026-09-06 09:58:11（Asia/Shanghai）** 合并。GitHub 回读 PR #49 为 MERGED，main 为 `081357d17f7a0535b75bb7d3133177febddee4a2`；源分支保留。当时 #50–#51 未合并，#50 后续结果见下节；主工作区 #26 WIP 与其暂存状态没有同步或提交，后续整合须保留本次兼容性及归档集合检查。
- native app-server 仍使用明确的外部确定性替身；SDK／payload 资格、adapter、Loader、Remote、Team 和存储均走实际发货代码。真实认证模型验收仍属 #44。


- Codex 实现与资格校验迁入 `packages/codex`，包名为 `@benz-ai-x/dsh-agent-team-codex@0.1.0`。`src/index.ts`／`src/product.ts` 与固定 Harness 前身逐字节一致，并保留 MIT license 和来源说明；SDK／平台 payload 仍为 `0.149.1`，不搜索 PATH，不扩大沙箱或能力。
- 保留 `agent-team-codex` Loader 行、`digitalEmployees` Catalog Owner、`external-agent/codex` 路由、native project correlation、成员、Profile Revision、Binding、native handle 及存储代际。完整 provider 仍经同一个通用 Catalog Owner 注册，目录与执行注册随 Fiber 一起释放。
- Profile peers／workspace 依赖、TS references、Host 构建顺序、生成兼容性证明及安装／卸载清单一起调整；归档仍为八个，现为四个 Ultra 包和四个 Harness private 包。Typert 通过正常构建重新生成。pnpm lock 保留全部已有 resolutions／snapshots／settings，只增加 Codex wrapper 与六个平台载荷的七个固定条目。
- 迁移测试发现 Node `createRequire().resolve.paths()` 会接纳 `NODE_PATH` 中的工作区副本，掩盖 ESM 实际缺包。预检现仅沿真正的 ESM `node_modules` 祖先路径查找，并保留 SDK 未导出 package.json 的读取能力；明确的 NODE_PATH 回归测试通过。
- 新版 Profile 在子插件加载前拒绝仍可解析的旧 Codex 包，返回 `ULTRA_COMPAT_LEGACY_RUNTIME`。README、打包输出、ADR-0007、ADR-0014 和补丁清单给出停止 Web、仅移除旧 Codex、安装新八包并沿用原 DSH_HOME 的升级流程；历史归档不可用目录通配符混装。
- 新增真实 Host catalog／Fiber 替换测试，迁入原有十条 native 产品资格校验测试，并新增完整 Profile 准入与旧新共存拒绝案例。
- 初次实现的完整 `pnpm verify` 退出 0：**506 项 strict、0 警告；199 项测试（18 个文件）；八个真实归档安装、Web 启动和卸载全部通过**。日志 `/tmp/ultra-23-full-verify.log`。RED 日志为 `/tmp/ultra-23-{profile,catalog,admission,duplicate,pack}-red.log`。
- [升级验证脚本](scripts/verify-codex-upgrade.mjs) 从固定前身 `61d23615bb8987e85f2397ed57b94ef23c79ade3` 的独立已构建 checkout `/tmp/ultra-23-predecessor` 重新打包并安装实际旧八包。经真实 Loader、生成 Remote、Team 与 JSON／SQLite 存储分别创建员工并完成两轮工作；停止旧 context、仅移除旧 Codex、安装新八包后，原成员／Revision／handle 保持不变，新增第三轮消息没有创建新线程。目录移除／回归、执行注册释放、升级后 Web 启动、完整卸载及无残留均通过，退出 0。最终日志 `/tmp/ultra-23-upgrade-final.log`。
- 升级探针的 native app-server 通道是明确的外部确定性替身；实际 adapter、SDK／payload 资格校验、协议传输、Loader、Remote 和持久化均使用发货代码。没有使用用户认证或运行真实 native 模型会话；#44 的产品验收要求仍未完成。
- 曾有一次 pnpm 11.7.0 在输出 Done 后超过四分钟不退出，已通过飞书报告并终止该隔离安装进程。带诊断观察的完整场景和不带观察器的原命令随后均自然退出 0；固定 11.7.0 的最小归档更新案例也未复现。没有修改 pnpm／Harness 版本、跳过检查或把被终止的运行当成成功；根因未证明，作为一次未稳定复现的环境限制保留。临时观察器不进入项目。

## #24 已实现内容

- **PR #50 本轮整合、补修与复审（2026-09-06）**：用户授权 review 通过后合并到 main。隔离工作树 `/tmp/ultra-50-review-iylhpqml` 将 main `081357d` 合入原 head `d4e72b8`，解决 6 个冲突文件，提交 `f38ee19` 保留完整依赖闭包、真实 Loader 根、自引用／模块类型诊断和两类旧包拒绝；Claude Code 的三个运行时源文件与锁定 Harness 前身逐字节一致。
- 整合后的完整 `pnpm verify` **554 strict、0 警告；218 测试／20 文件；实际八归档安装、Web 启动和完整行／包卸载通过**，日志 `/tmp/ultra-50-merged-verify.log`。已有 pnpm settings / resolutions / snapshots 保留，只新增 100 个 Claude 依赖条目。
- Claude Code 从当前 main 前身 `081357d` 的独立干净已构建工作树 `/tmp/ultra-50-predecessor-uv1f6gf8` 安装旧归档再升级；Codex 从 `debde06` 的 `/tmp/ultra-49-predecessor-cpcyoykc` 回归，移除两个退役产品包。JSON / SQLite 均保留原成员、Revision 和 native handle，后续消息、权限拒绝、运行中 Query 的 Fiber 清理、provider 替换／冷恢复、升级后 Web 与完整卸载通过。日志 `/tmp/ultra-50-{claude,codex}-upgrade.log`；同一 11 组官方／fork 契约通过，日志 `/tmp/ultra-50-comparison.log`。
- 首轮 Standards 硬性违规 0，但发现 P3 Possible Duplicated Code；Spec 0。提交 `ef3ecde` 提取 `scripts/verify-runtime-archive-upgrade.mjs`，两入口保留固定前身、provider、独立协议探针与 native 验收边界；Profile 包身份集合检查共用。共享驱动的两条实际升级再次自然退出 0，日志 `/tmp/ultra-50-shared-{claude,codex}-upgrade.log`。增量仅验收脚本和交接，运行时代码仍为完整验证覆盖的 `f38ee19`。
- 两路独立最终复核 `081357d...f38ee19` 全量及 `f38ee19..ef3ecde` 增量：**Standards 0、Spec 0 项未解决问题**。55 个本地 PR 文档链接和差异格式检查通过；实际 SDK / app-server 为明确的外部受控边界，真实认证 native 验收仍属 #44，Team 工具仍属 #29 / #30。
- 核对远端 base/head 和 CLEAN / MERGEABLE 后，以 `--match-head-commit ef3ecde…` 于 **2026-09-06 10:16:14（Asia/Shanghai）** 合并。GitHub 回读 PR #50 为 MERGED，main 为 `cd15e97993b2d3ee43aefa3daed4ef3f4d9742de`，合并结果树与已评审 head 一致。保留源分支；当时 PR #51 仍 open，其后续合并结果见 #25 节。主工作区 #26 的 19 个业务／配置 WIP 文件与暂存状态保持不变，仅更新根交接和 TODO。

- Claude Code 实现、产品资格检查与受控进程桥接迁入 `packages/claude-code`，包名为 `@benz-ai-x/dsh-agent-team-claude-code@0.1.0`。三个源文件与固定 Harness 前身逐字节一致，保留 MIT license 和来源说明；SDK `0.3.241`、native `2.1.241`、只读工具／文件／网络与交互权限约束均未改变。
- Profile、peer/workspace 依赖、TS references、构建、兼容性证明及安装／卸载清单同步调整；现在仍为八个归档，组成是五个 Ultra 包与三个 Harness private 包。`agent-team-claude-code` 行、`digitalEmployees` Catalog Owner、`claude-code` 路由、确定性 native Session 与 transcript marker 均保留。
- 准入在加载子插件前拒绝缺少新 Claude 包、SDK 或 native 产品版本不符，以及任一新旧产品包共存；迁入九条资格检查测试，并经真实 Host 验证目录注册、Fiber 移除与替换。旧依赖锁 settings、全部 resolutions/snapshots 不变，只新增一百个固定依赖条目及 workspace importer。
- `pnpm verify` 退出 0：**554 项 strict、0 警告；213 项测试（20 个文件）；八归档安装、Web 启动与卸载通过**。日志 `/tmp/ultra-24-full-verify.log`。关键 RED 日志 `/tmp/ultra-24-{profile,catalog,admission,duplicate,pack}-red.log`。
- [Claude 升级验证](scripts/verify-claude-upgrade.mjs) 从固定前身 `ae2ec7258146ea14ec4895d39795221c3774e29d` 的干净已构建独立 checkout `/tmp/ultra-24-predecessor` 安装实际旧归档。JSON／SQLite 均证明原 Profile Revision、成员、Binding 和 native Session 在替换包后保持一致；原生 transcript 中已有三条接受记录（含一次卸载中断），升级后新增跟进和卸载中断记录，共五条，没有新 Session。
- [归档探针](scripts/probe-claude-continuity.mjs) 使用真实 Loader、生成 Remote、Team 与存储；未支持的 fork 能力在发起 native Query 前被拒绝。确定性替身仅替换外部 SDK API；实际 adapter、SDK／payload 资格检查与 Managed Process 桥接不替换。固定只读策略逐项验证，运行中 Query 随 Fiber 移除停止，随后原 handle 恢复；完整卸载与升级后 Web 启动也通过。原命令 `pnpm verify:claude-upgrade /tmp/ultra-24-predecessor` 退出 0，日志 `/tmp/ultra-24-upgrade-final.log`。真实认证 native 验收仍是 #44。
- 本次首轮升级在 pnpm 安装新包时超过 120 秒，被外层超时中止，退出 124，未算通过。带输出观察的复跑及不带观察器的原命令随后均自然退出 0；未证明卡住的根因，没有更改 pnpm／Harness 或绕过检查。已飞书通知阻塞，临时观察器与超时遗留隔离目录已清理，日志保留。
- [Codex 升级验证](scripts/verify-codex-upgrade.mjs) 现在从旧八包中识别并移除所有已退役产品包，以支持 #22 前身同时含旧 Codex 和 Claude 的升级。更新后的完整升级验证已退出 0，日志 `/tmp/ultra-24-codex-upgrade.log`；原 Codex 成员／handle 与两轮到三轮连续性保留。ADR-0008、ADR-0014、README、领域词汇与补丁清单明确修订归属；后续 Team 工具仍由 #29／#30 单独追踪。

## #25 已实现内容与阶段 A 验收

- **PR #51 本轮整合、补修与复审（2026-09-06）**：用户授权 review 通过后合并到 main。隔离工作树 `/tmp/ultra-51-review-jjko946m`、分支 `review/pr51-main` 从原 head `b72fef9` 合入 main `cd15e97`，仅 HANDOFF / TODO 冲突；提交 `21f1cb4` 保留 #48/#49 的兼容性闭包、真实 Loader 根、自引用／模块类型和 #50 共享升级驱动。源码按锁定 Harness `8b4bae0b` 准备，编辑前 strict 554 项通过。
- 整合后的完整验证先通过 554 strict、248 测试／21 文件（30 项审计案例）和实际八归档安装／Web／卸载，日志 `/tmp/ultra-51-merged-verify.log`。Claude 从固定 `081357d`、Codex 从固定 `debde06` 的真实归档升级均通过：JSON / SQLite 原成员、Revision、native handle 保留，后续工作、Fiber 清理、Web 和完整卸载通过，日志 `/tmp/ultra-51-{claude,codex}-upgrade.log`。同一 11 组官方／fork 契约对照通过，日志 `/tmp/ultra-51-comparison.log`。
- 首轮 **Standards 1 项 P2**：SQLite checkpoint 表缺失／不可读会使有效源审计失败；**Spec 1 项 P2**：投影先过滤 Team ID，跨 Team 的未来／无效 payload 被跳过后错误通过。提交 `5539b5e` 修复两项：缓存局部读失败转为 `cache-unreadable` 冷重建，权威业务错误仍拒绝；全部 Team 历史含继承前缀经正式 schema / projection 校验，非继承事件须归属所在 Session。
- 六条新增真实源回归先 RED（`/tmp/ultra-51-cache-red.log`、`/tmp/ultra-51-team-red.log`）后通过，覆盖缓存缺表／缺列、未来 Ultra 格式继续拒绝、三类跨 Team payload、合法继承前缀与其中未来事件；全部确认源字节不变。36 项审计测试通过 `/tmp/ultra-51-audit-green.log`；最终完整 `pnpm verify` **554 strict、0 警告；254 测试／21 文件；八归档安装、Web 启动、完整行／包卸载通过**，日志 `/tmp/ultra-51-fixed-verify.log`。
- 两路独立最终复核 `cd15e97...21f1cb4` 全量及 `21f1cb4..5539b5e` 增量：**Standards 0、Spec 0 项未解决问题**。56 个 PR 本地文档链接、差异格式通过；依赖锁及 Harness 锁未改。审计补修未改变发货 Host 或升级探针，所以上述真实升级结果仍适用；外部 SDK／进程边界为明确替身，#44 认证验收与阶段 C 迁移仍未执行。
- 核对远端 base/head 和 CLEAN / MERGEABLE 后，以 `--match-head-commit 5539b5e…` 于 **2026-09-06 10:40:50（Asia/Shanghai）** 合并。GitHub 回读 PR #51 为 MERGED，main 为 `ce6cb395682ce5c23d11c7542c8ea172f1fabd3a`，合并结果树与最终评审 head 一致。源分支保留；主工作区 #26 的 19 个业务／配置 WIP 文件及暂存状态不变，仅更新根交接和 TODO。

- 新增 `pnpm migration:audit --sessions <root> --json <storage>`／`--sqlite <database>`。CLI 从完整源文件、正式 schema、真实 Session read handle 和锁定 Team 投影读取；不打开会迁移／写入的 Ultra Domain。JSON per-record envelope、整体 unit、SQLite 物理版本及 Ultra Generation 在业务读取前检查，未来格式和未知布局不当作空库。
- 审计区分 Session `0`、Team payload `2`、projection `3`、descriptor `3`、Ultra v0/v1；核验 Profile Head／Revision／fingerprint、Binding、Team 成员、descriptor、固定 route、native handle／Launch Request 与实际能力需求。Host 与审计复用纯 Revision 补全、v0 投影及不可变关系校验；审计结果仅在内存中生成。
- checkpoint 使用真实 cache schema、Session identity、投影版本、日志游标和冷重建状态核验。匹配报告 reusable，不匹配报告 rebuild 及原因，源文件保留。v0 和实际中断的 pending v1 均可重复审计，相同记录复用、不同目标拒绝，不创建迁移目标或提交完成标记。
- SQLite 的数据库／WAL 复制到私有临时目录，再以只读连接读取，避免创建或修改源 SHM；报告摘要包含全部旁文件并在成功前复核，临时副本退出时清除。RED 复现了只摘要主文件会漏掉 WAL 已提交变更的问题；修正后保持源数据库和旁文件字节不变。Session Zstd 解码逐帧复制上游复用的 buffer，SQLite 表检查使用完整 unit/table 集合区分 v0/v1 前缀。
- [ADR 0016](docs/adr/0016-audit-and-plan-format-aware-migration.md) 接受阶段 C 的 Session `2`、Team payload `3`、projection `4`、descriptor `3` 方案，规定 native operation／发送请求／回复关联进入正式 schema、codec、生成词汇和投影，业务提交与操作回执同批持久化。迁移保留源、关闭 pending 目标写入、幂等复用并拒绝分歧、最后提交 manifest；禁止双向写入。包归属变化不触发 Ultra 新代际。当前运行锁不变，阶段 A 完成后进入 B，执行迁移与新 fork 资格仍由阶段 C 交付。
- 首轮完整 `pnpm verify` 退出 0：554 项 strict、0 警告；240 项测试（21 个文件），其中审计集成测试 27 项；八归档安装、Web 启动及无残留卸载通过。日志 `/tmp/ultra-25-final-verify.log`；补修后的最新验证见下。
- Codex `61d2361`→当前归档、Claude Code `ae2ec72`→当前归档的 JSON／SQLite 升级均自然退出 0，保留原成员／Revision／native handle，后续工作、运行中卸载、注册释放、Web 启动和无残留移除通过。日志 `/tmp/ultra-25-codex-upgrade.log`、`/tmp/ultra-25-claude-upgrade.log`。外部 native SDK／进程为明确的确定性替身，真实认证产品验收仍由 #44 完成。
- native turn 关联检查拒绝把 native 回执附在 DSH 成员上；报告列出有界的初始轮／消息轮关联。
- PR #51 评审补修：`validateUnits` 在内存中保留共享 schema 的返回值，使旧 `provider`／`phase` 字段及缺省 Required Capabilities 与 Host 的兼容读取一致。损坏的旧 `session_projcache.json` 转为 `cache-unreadable`，从可读取的权威 Session 重建并逐 Session 报告，不更改源缓存。
- 新增 JSON／SQLite 旧 Binding 和损坏旧缓存共三条 CLI 回归，分别先复现 `AUDIT_ULTRA_CONFLICT`／`AUDIT_INVALID_JSON`，修复后通过；所有案例验证源文件字节不变。RED/GREEN 日志为 `/tmp/ultra-51-transitional-{red,green}.log` 与 `/tmp/ultra-51-checkpoint-{red,green}.log`。
- 补修提交 `b72fef9` 已推送到 PR #51。新隔离环境冻结安装后，完整 `pnpm verify` **通过 554 项 strict、0 警告、243 项测试（21 个文件，含 30 项审计案例）及八归档安装／Web 启动／卸载**，日志 `/tmp/ultra-51-review-fix-verify.log`。补修未重复旧归档升级，未执行 #44 真实 native 验收。两轴修复复核完成后，Issue #25 已关闭。

## #26 开发与验证完成

- 用户此前要求“继续这个分支开发”。继续 `fix/26-authorized-codex-team-queries`，已接入 main `ce6cb39`，保留 #48–#51 的兼容性、升级驱动与只读审计修复。开发与完整验证已完成，按既有指示关闭 #26 并提交 [PR #52](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/52)。初评 Standards 两项、Spec 零项；两项已修复，独立复审固定 Ultra `04a50c9722` 与 Harness `fb03045fbe`，最终 Standards／Spec 均为 0 项未解决发现。用户本轮明确要求 `$code-review #52`，并授权 review 通过后合并到 main；此前的无合并授权状态已失效。
- 原 Ultra／Harness 未提交内容已完整备份到 `/tmp/ultra-26-resume-backup-3guni4th`，包含文件、SHA256 清单、二进制 diff 和 index diff。整合 main 前的 stash 仍保留，SHA 记录在 `/tmp/ultra-26-resume-stash.txt`。冲突按两边意图解决：升级入口使用 main 的固定前身和共享驱动，驱动与探针在新旧阶段分别使用各自锁定的 Harness、兼容证明和 CLI；HANDOFF／TODO 更新真实合并状态。
- Team 所有者实现不可序列化 Native Member Grant，绑定精确 live Lead、成员、provider、native handle 与当前注册。注册、handle、Lead 释放或 inactive presence 永久撤销旧 grant；后续 presence 不能复活它。恢复验证原持久身份后重授当前权限，拒绝外部证据／身份违约及未知／重复能力声明，Evaluation Worker 不获生产权限。普通 DSH／Remote／Profile 入口仍要求精确 live Agent。
- Codex 通过锁定 `@openai/codex@0.149.1` 的 `dynamicTools`／`item/tool/call` 调用真实 roster／task board，只允许 `members.list`、`tasks.list`、`tasks.get`。完整 native envelope 16384 字节、Host 请求 4096 字节、含 JSON 转义的完整结果 65536 字节；任务页默认 20、上限 100，单轮 64 次，首次 grant 等待最多 5 秒。严格 schema、thread／turn／call 关联、取消、返回前授权复核与原只读／approval-never／网络策略共同生效。
- 固定 SDK 将 dynamic tools 随 thread 持久保存，resume 无补装字段。因此本版本新线程及其恢复可查询；未安装工具的旧线程保留原 handle／历史，不宣称自动获得查询工具。不得修改 SDK 私有存储或创建替代线程。正式解释见 [ADR 0017](docs/adr/0017-authorize-native-team-member-queries.md)，真实认证 native 验收仍属于 [#44](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/44)。
- 历史 TDD 证据包括未支持的 native query、模型 operation 注入、授权释放／排队取消、inactive→idle 复活旧 grant、非法 provider 声明；后两项见 `/tmp/ultra-26-presence-revival-{red,green}.log` 与 `/tmp/ultra-26-member-catalog-schema-{red,green-fixed}.log`。首次新通道完整验证为 554 strict、249 测试／22 文件及八归档安装／Web／JSON+SQLite 查询冷恢复；它只覆盖本地 `3b27b0e65e`，不作为最新整合结果。
- 本轮 Harness 受影响 owning／consumer 测试 **246 passed、1 skipped**，4 个受影响源文件所有覆盖指标 **100%**，日志 `/tmp/ultra-26-resumed-coverage.log`；真实 Loader／built-lib 两项通过。`pnpm build`、15 项文档快速检查、32 项 doc-sync 和 16 项 hygiene 通过。完整 lint 发现测试中的两处 any 使用，已修正日志参数类型和断言；对应清理失败回归及全仓 `lint:contracts-ready` 复验均退出 0。
- 维护源码仍位于独立 `/root/workspace/deepseek-harness-ultra-b` 分支 `fix/ultra-26-native-team-queries`；共享 `/root/workspace/deepseek-harness` 保持干净的阶段 A `8b4bae0b`。最终源码 `fdfdbaeb0e7d06f3e2103fe2721639c115eb8dc3` 已通过常规提交／推送 hook 并推送至维护 fork 同名分支，docs digest 为 `f34086b46fe7e1cfdabbdc335a4ea5a8fe8beb23f0fab5a2b443d606e9b66432`。Ultra 已更新 lock，准备来源并冻结安装；Team 类型入口因增量构建保留旧时间戳，已用 TypeScript `--force` 真正重新生成，严格检查恢复通过。

- 本轮整合后的完整 `pnpm verify` **554 strict、0 警告；263 测试／22 文件；八归档安装、Web 启动、JSON／SQLite 的 Codex 查询与原成员冷恢复、完整卸载全部通过**，日志 `/tmp/ultra-52-final-verify.log`。九项 Codex 查询集成测试使用真实 Team／Host，只有外部 app-server 进程边界受控。
- 共享驱动对 Codex 固定前身 `debde06`、Claude Code 固定前身 `081357d` 的实际归档升级均自然退出 0，JSON／SQLite 保留成员、Revision 和 native handle，后续运行、清理、Web 和完整卸载通过；日志 `/tmp/ultra-52-final-{codex,claude}-upgrade.log`。新维护 fork 与固定官方 `d347e703` 的同一 11 组公共契约对照及不兼容来源拒绝全部通过，日志 `/tmp/ultra-52-final-comparison.log`。未执行 #44 真实认证 native 验收。


- **PR #52 审查补修**：初评固定 Ultra `ce6cb39...dcf8ec4`、Harness `8b4bae0b...b4d2a731`。Standards 发现缺少正式记录会话（P2）及分页游标丢失 `TeamTaskId` 品牌（P3），Spec 无发现。Harness `fb03045fbe` 修复两项：扩展现有 `agent-team-profile` 记录场景，通过真实发货 headless CLI 和 provider 实际绑定的 grant 查询非空 roster／task board，记录三种查询、分页返回及后续模型上下文；类型、双语文档、生成目录同步。外部 provider 场景改用 `.mjs`，满足 Node 22 的 built Loader；未改四个已有 100% 覆盖率的运行时源文件。
- 新记录场景先失败后刷新通过；移除 grant 绑定的 source 模式负对照确实失败，证明固定模型最终输出不能掩盖授权查询失效。最终 `DSH_EXAMPLE_MODE=lib` 回放及两项场景守卫 **3 passed**，日志 `/tmp/ultra-52-recorded-session-replay.log`、`/tmp/ultra-52-recorded-session-negative-control.log`。额外 Claude consumer **58 passed、1 skipped**；完整 build、15 项 docs quick、32 项 doc-sync、全仓 lint、261 个包公开声明类型检查通过。该源码准备及冻结安装后，Ultra 完整验证、两类升级和官方对照均重新通过。
- **最终双轴复审通过**：两个独立代理分别检查 Harness `b4d2a731...fb03045fbe`、Ultra `dcf8ec4...04a50c9722`，结合原全量审查，Standards 规范违规／判断性异味均 0，Spec 缺失／范围扩张／错误实现均 0。原 P2／P3 均确认关闭。本记录之后仅更新 HANDOFF／TODO 的验收状态，不更改已验证的运行时、锁或测试。GitHub 未报告本 PR 的 CI checks；自动化静态复审不等于人工批准。


- **PR #52 本轮 main 审查与限额补修（2026-09-06）**：固定 Ultra `ce6cb39...993698d`、Harness `8b4bae0b...fb03045fbe` 重新进行独立双轴审查。Spec 0；Standards 发现 `packages/AGENTS.md` 要求的精确 UTF-8 限额测试缺口（P3），未发现计数实现错误。Harness `fdfdbaeb0e` 仅新增 4 项公开 grant 用例，覆盖 ASCII／多字节请求 4096／4097 字节与完整结果 65536／65537 字节。两种临时负对照分别触发 4／2 项预期失败，源码原样恢复；拥有者测试 **48 passed**，查询模块各项覆盖率 **100%**，日志 `/tmp/ultra-pr52-boundary-coverage.log`、`/tmp/ultra-pr52-boundary-negative-{inclusive,characters}.log`。类型、Host bundle 和常规 commit／push hooks 通过。维护分支已推送，文档摘要及所有运行时源文件不变；Ultra 已更新 lock、准备来源并冻结安装。两路代理已完成 Harness `fdfdbaeb0e` 与 Ultra `0f0a83310f` 的最终复审，Standards 规范违规／判断性异味均 0，Spec 缺失／范围扩张／错误实现均 0，P3 已确认关闭。 最新锁定来源的完整 `pnpm verify` 再次通过 554 strict／0 警告、263 测试／22 文件、八归档安装／查询／冷恢复／Web／卸载；Codex／Claude Code 实际升级和 11 组官方对照也全部退出 0，日志 `/tmp/ultra-pr52-merge-{verify,codex-upgrade,claude-upgrade,comparison}.log`。

- **PR #52 合并完成**：补修与复审通过后，再次确认 base/head 和 CLEAN／MERGEABLE，以 `--match-head-commit a7f98069e7274095414c153ac89a7eabc065749b` 于 **2026-09-06 13:09:42（Asia/Shanghai）** 合并到 main。GitHub 回读 PR 为 MERGED，合并提交 `62531191d909a890394d7e922259a8e63eb80f32`，结果树与已验证 head 一致；源分支保留。#26 保持 closed，父 #18 保持 open。最终证据 `/tmp/ultra-pr52-main-review-verification.json`。本次合并回读只更新本地 HANDOFF／TODO，尚未提交这两份结果记录。

## 验证证据与限制

### #22 安装／导入前兼容性诊断

- 用户要求修复 PR #48，并已授权 review 通过后合并。隔离工作树 `/tmp/ultra-48-fix-1dhwh7na` 以 `61d2361` 为起点，提交 `80464c4` 修复原 Standards 2 / Spec 3 项发现，再以 `0ccd4c0` 修复新增的模块类型 P2；主工作区 #26 业务代码和暂存状态保持原样。
- 完整 `pnpm build` 在 Host、Typert、Profile、Client 产物之后生成证明，覆盖 Ultra Host / UI / Profile 和各自实际依赖。Profile 在导入时检查私有闭包，并在初次加载／配置更新时检查真实 Loader source directory；CLI 使用同一安装根目录。ESM 查找支持包自引用和祖先 `node_modules`，忽略 `NODE_PATH`；模块 type、版本、main、exports 和发货 JS 摘要均须匹配。
- 13 条公开准入测试包含缺 UI、Loader 根混用 Team、CLI 根缺 Team、Host 私有 Session 混用、仅 NODE_PATH 有合格依赖和仅修改模块 type。真实 Loader 的包装错误保留稳定诊断于 message，直接导入和 CLI 保留 code。所有拒绝案例不执行不兼容业务子项或创建业务目录。
- 清空本隔离工作树旧产物后第一轮完整验证通过 190 测试；模块类型补修后再次完整 `pnpm verify` **448 strict、0 警告；191 测试／16 文件；八归档真实安装、Web 启动和全部行／包卸载通过**，日志 `/tmp/ultra-48-module-type-verify.log`。公开模块类型 RED / GREEN 为 `/tmp/ultra-48-module-type-{red,green}.log`；此前缺口 RED 为 `/tmp/ultra-48-{node-path,ui-closure,loader-anchor,cli-anchor}-red.log`。
- 固定官方 `d347e703…` 与维护 fork `8b4bae0b…` 在同一脚本通过 11 组公共契约，新增 queued flush 屏障、三条消息顺序和发送方、真实上下文冷重启、10 秒 wait 超时不创建冷 Agent、消息恢复同一成员，以及中断和恢复后的任务 owner 保留。最终报告 `/tmp/ultra-48-module-type-comparison.log`；两份 Harness 源码保持干净，官方源码／Team 仍在安装／导入前被拒绝且无业务数据写入。
- 两路独立 code-review 对完整 `85b80c2...80464c4` 及补修 `80464c4..0ccd4c0` 分别复核，最终 **Standards 0、Spec 0 项未解决发现**。52 个本地文档链接及 `git diff --check` 通过。GitHub 未配置本 PR 的 CI checks；191 测试与真实安装验证在锁定隔离环境执行。
- 核对远端 base/head 和 CLEAN / MERGEABLE 后，用 `--match-head-commit 0ccd4c0…` 于 **2026-09-06 09:37:45（Asia/Shanghai）** 合并成功。回读 PR #48 为 `MERGED`，main 为 `debde06ce5c75658f9ad741cbfc8d535df118455`，合并后 tree 与已验证 head 一致。源分支保留；#49–#51 没有被合并，后续集成需同步这次闭包与模块类型修复。#22 仍 closed，父 Spec #18 仍 open。

- `dsh-reference.lock.json` 新增独立的官方基础 `76fda729…`、官方对照 `d347e703…`、扩展接口资格、Session/Team/投影/Ultra 格式及 native SDK/payload 标识；原 `upstream` 提交、版本和文档摘要保持不变。当前受支持运行时仍是完整 `8b4bae0b…` fork。
- `scripts/generate-compatibility.mjs` 从严格证明的源码生成实际发货 JavaScript 摘要、依赖关系及 Host 公共入口。公开 Host 包先执行 Node-only 检查，再动态导入实现；TypeScript 公共类型和生成 Remote 保持原契约，Client 不引入 Node 预检。
- `packages/domain/src/compatibility.ts` 检查每个包实际 Node 解析路径、版本、exports、发货文件摘要及 SDK manifest。直接依赖和传递依赖分别检查；相同 semver 不能掩盖错误产物。兼容性证明缺失、源码错误、产物／SDK 不匹配均有 `ULTRA_COMPAT_*` 稳定诊断。
- profile 将七个原有子行放入 `agent-team-ultra-compatibility` Loader 组，组入口预检完成后才加载子插件。`compatible-dsh.mjs` 使用锁定 CLI 的参数解析和真实 CLI，安装前校验源码及构建，安装后校验实际依赖，启动前再次校验。
- `pack:local` 打印绝对路径的预检安装入口，归档仍为八个；新增明确的锁定 Loader peer。依赖锁只增加该 link，未改变包解析版本。
- 8 条新 CLI／包入口集成案例按 TDD 验证：错误源码不初始化 DSH home、完整 Host 可导入、证明缺失、同版本 Team 缺接口、直接 Session 被替换、Team 传递 Session 混用、原生适配器缺失及 SDK 版本不合格。
- [ADR 0015](docs/adr/0015-maintain-explicit-harness-compatibility.md)、[补丁清单](docs/reference/harness-patch-ledger.md)、术语、项目契约和 README 已更新。补丁表明确用途、公开合约、格式影响、测试责任与上游状态；没有把未来 #23/#24 的适配器迁移或 #44 的真实 native 验收标成已完成。
- 初次实现的 `pnpm verify`：**448 项 strict、0 警告；186 项测试（16 个文件）；8 个真实归档安装、Web 启动及卸载全部通过，退出码 0**。日志：`/tmp/ultra-22-final-verify.log`。RED 日志：`/tmp/ultra-22-{import,session,transitive,profile,sdk,install,proof}-red.log`；最终比较报告：`/tmp/ultra-22-comparison-final.json`。
- 固定官方基线在 `/tmp/ultra-22-official-d347e7` 独立 worktree 中，冻结安装成功，源码保持干净。Node 22 默认打包缺少 `unrun`，`tsx` 与临时补齐的 `unrun` 路径均未完成打包；改用经过官方 SHA256 校验的 Node 24.11.1 arm64 原生配置加载后，Host 构建成功。原生依赖由 Node 22 安装，探针继续用 Node 22 运行，避免 `fs-ext` ABI 混用。维护 fork 和共享源码未被改动。
- 初次实现的 `probe-team-contract.mjs` 通过六组公共合约（已由本轮 11 组补足）：精确 live 角色、任务 CAS/DAG/所有权、墓碑与 wait cancellation、持久回执早于 delivered、永久名称、Fiber 卸载。仅 LLM 外部边界受控。`compare-harness-contract.mjs` 验证固定官方提交和源码状态，再复跑探针，并证明官方源码在安装前、实际官方 Team 包在导入前被稳定拒绝且不创建业务数据；Session 格式分别为 fork 0、官方 2。

- 初始 `pnpm context:check:strict`：290 项检查通过、0 警告。
- 改动前完整 `pnpm verify`：157 项测试通过，并通过 8 个归档的真实安装、Web 启动与卸载。日志：`/tmp/ultra-19-baseline-verify.log`。
- 改动后完整 `pnpm verify`：**164 项测试通过（13 个测试文件）**，严格检查、Host／Client 构建、Typert 生成、8 个归档安装、固定 CLI Web 启动及卸载全部通过，进程退出码 0。日志：`/tmp/ultra-19-final-verify.log`。
- 新增 [Profile 工作流集成测试](packages/domain/tests/profile-workflow.integration.spec.ts) 的 7 个案例经真实生成 Remote、Host、Agent／Team 和 JSON／SQLite storage，覆盖 Revision 不可变、独立 CAS、显式激活、archive／restore／rollback、精确门禁与历史保留、权限失效及 Fiber 卸载时评测结算。
- 这些测试仅在 LLM 外部边界使用可控 adapter，隔离 Worker 仍使用真实 Host 生命周期与工具／sandbox／approval 策略。未进行用户授权 native 登录后的真实产品会话验收；该要求仍属于后续 issue，尤其 [#44](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/44)。
- 关键 RED 日志位于 `/tmp/ultra-19-{red,queue-red,gate-red,eval-red,activation-red}.log`。`/tmp` 为本容器辅助证据，不是仓库中持久规范；复核以提交内容和可重跑测试为准。
- #20 开始前 strict 再次通过 290 项、0 警告；新启动和 pending 重试 RED 分别保存在 `/tmp/ultra-20-launch-red.log`、`/tmp/ultra-20-replay-red.log`。改动后的完整 `pnpm verify` **通过 171 项测试（14 个文件）**、严格检查、Host／Client 构建、Typert 生成及 8 个归档安装／Web 启动／卸载，退出码 0。完整日志：`/tmp/ultra-20-final-verify.log`。
- #21 在 `/tmp/ultra-21-acceptance-M0KXbd/checkout with spaces` 完成整个验收；相邻没有 Harness，103 个复制输入在验收完成时仍与主工作区逐字节一致。冻结依赖安装、436 项 strict、完整 `pnpm verify` **178 项测试（15 个文件）**、8 个归档安装／Web 启动／卸载和从其他 CWD 独立打包全部通过，进程退出码 0。
- 隔离准备从不同 CWD 输出相同来源证明，清除 `DSH_HARNESS_ROOT` 后也保留同一选择。安装／卸载输出使用所选 CLI 的绝对路径，含空格路径的命令通过 shell 语法检查。日志与清单：`/tmp/ultra-21-isolated-verify.log`、`/tmp/ultra-21-isolated-pack.log`、`/tmp/ultra-21-isolated-provenance.json`、`/tmp/ultra-21-acceptance.json`。
- 首次隔离离线安装缺少 `detect-libc@2.1.2` 缓存，已通过飞书报告；随后使用同一 frozen lock 联网补齐并完成验收。依赖版本与 Harness 锁未变，该缓存阻塞已解决。

## 当前环境

- 仓库：`/root/workspace/dsh-agent-team-ultra`；Node `v22.22.1`，pnpm `11.7.0`。
- `/root/workspace/deepseek-harness` 保持干净的 `8b4bae0b620cc89a987a3ec6dd8b0b7d9025649a` 和完整构建，供阶段 A 的 #25 和 #48 补修环境使用。该独立环境位于 `/tmp/ultra-25-audit-fix-vHVNjX`，已按其 lock 完成源码准备、冻结安装及完整验证；未重置共享 checkout。
- 本轮验证工作树的 `.dsh/harness` 指向 `/root/workspace/pr60-fixes.U6WRei/harness`，锁定 `b78caad462c3509127761904ed59ee549b6b6160`，该提交已推送到 `fix/ultra-34-36-task-dag-live`；docs digest 仍为 `d4028c4f143f72a99ded5c0ee39c3463c13ff258bbb70ba9ce74af0aa426e767`。来源准备、冻结安装和 582 strict／0 warning 通过。原 Harness worktree 保留，首次或换源时先准备再安装依赖。
- 飞书 CLI 已验证当前 user／bot 身份可用；认证阻塞、#21 缓存阻塞及恢复、#22 官方构建阻塞及恢复均已通知。不要在本文件记录凭据、用户标识或私人消息。
- GitHub CLI 已完成设备授权登录，`gh auth status` 退出 0，Git 使用 SSH；`gh repo view` 已验证本仓库 `ADMIN` 权限。Issue／PR 的实际操作仍按任务边界和既有授权执行；无需重复询问已经授权的提交、推送和 PR 操作；对外消息仍须当前会话明确授权。不记录登录验证码或凭据。
- 当前 `gh pr edit` 因已停用的 Projects classic GraphQL 字段报错；已通过 `gh api --method PATCH repos/benz-ai-x/dsh-agent-team-ultra/pulls/<number> --input <JSON文件>` 成功更新 #48、#51 正文。该错误与认证无关。
- 历史交接提到的 `4317`／`3080` 常驻实例并未在本容器重新确认；本次验证使用打包脚本的隔离 home 与端口，不能据此声称用户应用已运行。

## 下一步

1. 完成本 PR #62 修复候选的完整验证和独立 Standards／Spec 复查，通过后正常提交／推送原分支并回读远端；不自动合并。
2. #38 的测试入口与飞书通知方式已经确认，初版完成通知已经成功，不重复发送。本轮不继续 #43 或 #44；其他批次保持自己的待验收状态，父 Spec #18 不修改。
3. PR #61 已合并，不重复处理。保留主工作区原 HANDOFF、3 个 stash、既有分支／Harness 与历史证据；父 Spec #18 保持 open，PR #60 的历史已知问题不因此宣称修复。

## 权威材料与技能

- 当前使用 `tdd` 在已确认的公开 Host／生成 Remote、真实 Team／持久化／Fiber 入口修复 PR #62，使用 `dsh-plugin-dev` 核对锁定来源与证据语义，最终用 `code-review` 独立复查；无需重复确认既有入口或通知身份。以下技能记录属于各历史轮次。

- 本轮修复使用 `dsh-plugin-dev`；Harness 按 `dsh-ci-test-reliability` 设计异步回归，按 `dsh-pre-push-checks` 验证提交，按 `dsh-doc`／`dsh-prose-standard` 更新 owning README 和 Agent Note 的英中配对。没有发送外部通知。

- 开发前必读：[AGENTS.md](AGENTS.md)、[PROJECT_CONTRACT.md](docs/agent/PROJECT_CONTRACT.md)、[TODO.md](TODO.md)、[reference lock](dsh-reference.lock.json)。
- 领域／历史：[CONTEXT.md](CONTEXT.md)、[领域约定](docs/agents/domain.md)、[ADRs](docs/adr/)、[历史决策](docs/decisions/)、[官方兼容性研究](docs/research/2026-09-05-official-agent-team-compatibility.md)。
- 任务管理：[Issue tracker 约定](docs/agents/issue-tracker.md)、[triage 约定](docs/agents/triage-labels.md)；GitHub Issue 是需求源，不能用本地缓存或 TODO 替代。
- 既有开发已使用 `tdd`、`dsh-plugin-dev`、`domain-modeling`、`lark-im`、`lark-shared`、`writing-for-agents`、`diagnosing-bugs`；本轮使用 `code-review` 完成七个 PR 的 Standards／Spec 并行评审，并使用 `tdd` 修复 #51 的发现。测试沿用 #25 已明确的公开审计 CLI 和真实 JSON／SQLite 边界。技能路径以当前会话可用列表为准；不得引用旧交接中本环境不存在的技能作为完成证据。

- 本轮 #33 使用 `dsh-plugin-dev` 固定 Team owner／generated Remote／Loader／packed 生命周期边界，使用 `tdd` 保存公开 Remote、UI、提交／投递分离、migration 和 packed RED/GREEN，并使用 `domain-modeling` 更新术语与 ADR 0024；没有开始 code review 或后续 Issue。

- 本轮PR #61 review 1修复使用`tdd`逐项保存7 high/1 medium的真实RED/GREEN，使用`dsh-plugin-dev`固定Host/Gateway、公开Client Slot、官方catalog、Fiber生命周期及keyless recorded-session边界；没有启动review 2或后续Issue。

- 本轮 PR #48 修复使用 `tdd`、`dsh-plugin-dev`、`domain-modeling` 和 `code-review`；评审技能要求的两路独立代理已完成最终复核。

- 本轮 PR #49 使用 `code-review`、`resolving-merge-conflicts`、`dsh-plugin-dev`；按评审技能执行两路独立代理，全量和补修复核均已完成。

- 本轮 PR #50 使用 `code-review`、`resolving-merge-conflicts`、`dsh-plugin-dev`；按评审技能运行两路独立代理，全量及共享升级驱动补修复核均已完成。

- 本轮 PR #51 使用 `code-review`、`resolving-merge-conflicts`、`dsh-plugin-dev`；按评审技能运行两路独立代理，初评及补修复核已完成。

- 本轮 #26 使用 `dsh-plugin-dev`、`tdd`、`resolving-merge-conflicts` 和 `code-review`（按技能要求两路独立审查）；维护 Harness 使用 `dsh-ci-test-reliability`、`dsh-pre-push-checks`、`dsh-doc`、`dsh-prose-standard`，范围仅本次成员授权及其验证／文档。
