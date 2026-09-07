# Open Issues 批处理状态

最后更新：2026-09-07T18:08:21+08:00（Asia/Shanghai）

本文件是本轮批处理的唯一进度索引。恢复时必须先用 `gh issue list`、`gh pr list`、`git log` 和 `git status` 对账；冲突时以实测为准并立即修正本文件。

## 阶段 0：冻结运行约定

- 仓库：`benz-ai-x/dsh-agent-team-ultra`；默认分支：`main`。
- 启动基线：`origin/main` = `08585631ea6e618a3adbf7143046d00fde00f5d7`（2026-09-07T11:57:01+08:00 fetch 后实测）。
- 全量测试：`pnpm verify`。该命令依次执行 strict source attestation、Host/Client build、Typert/compatibility 生成、Vitest 和 packed install/Web boot/uninstall。
- lint：仓库没有 lint/formatter script；代码改动以 `pnpm verify` 为统一闸门，文档改动另跑 `git diff --check` 和链接核验。
- 合并方式：`merge commit`，全程固定。依据：最近 12 个已合并 PR #47–#58 的 first-parent 历史均为 `Merge pull request ...`；合并命令使用 `gh pr merge --merge --delete-branch --match-head-commit <sha>`。
- CI：无。启动时 `.github/` 不存在、open PR 为空，近期 PR 的 `statusCheckRollup` 也无可用检查；因此闸门使用本地 `pnpm verify`，CI 轮数字段记为 local-gate 轮数。
- 人工合并规则：命中用户清单的 PR 只做到绿灯并通知，不自动合并。Batch 4 明确涉及 Session/Team schema、codec、数据迁移、锁和公共扩展契约，标记为“需人工合并”；后续如其他批次实际命中，也立即更新。
- 飞书通知：已由既有成功记录复核为群聊 `oc_ca0004ecdaba656865c130c88e42e57a`、bot 身份；消息按用户要求首行使用【需决策】或【仅知会】。成功以退出码 0 且 JSON `ok: true` 判断；失败不阻塞并记录待补发。

## 启动快照（本轮唯一范围）

命令：`gh issue list --state open --limit 200 --json number,title,url,labels,assignees,createdAt,updatedAt`

快照时间：2026-09-07T11:47–11:57+08:00。共 13 项：#18、#33–#44。启动后新增 issue 不纳入本轮，只进入“待下轮清单”。

| Issue | 标题 | 模块 | 复杂度 | 依赖 | 本轮状态 |
| --- | --- | --- | --- | --- | --- |
| #18 | Spec: Agent Team Ultra vNext — 官方基础与明确的 Ultra 扩展（中英双语） | 父规范 | L | #19–#44 | skipped：#44 AC 明确要求“不关闭或修改父 Spec”；保持 open 作为规范索引 |
| #33 | 从消息中心幂等发送和关联回复 | Harness Team mailbox/format；Ultra Remote/UI | L | #27、#32（均 closed） | merged：PR #59 已关闭 Issue；post-merge verify 通过 |
| #34 | 让共享任务列表和 DAG 共用任务详情 | Harness Team UI；task projection | L | #25（closed） | implemented：5/5 AC checked，Issue 保持 open 等 Batch PR |
| #35 | 点选任务依赖并保留并发冲突草稿 | Team task API；DAG UI | L | #34 | developing（Batch 2，RED 准备） |
| #36 | 让消息中心与 DAG 实时刷新并正确重连 | Team watch/Remote/UI lifecycle | L | #33、#35 | developing（Batch 2） |
| #37 | 在 Studio 如实区分普通成员、档案绑定与协作能力 | Ultra Snapshot/Studio/navigation | L | #30–#32（均 closed） | planned（Batch 3） |
| #38 | 完成协作期间的冷恢复与 provider 代际替换 | Host/provider lifecycle/recovery | L | #36、#37 | planned（Batch 3） |
| #39 | 在固定官方新基线上接通基础 Team 与固定路由 | Harness 基线/公共 Team 契约 | L | #38 | planned（Batch 4） |
| #40 | 把双 native 与协作面板迁移到新 Harness 契约 | Codex/Claude/UI migration | L | #39 | planned（Batch 4） |
| #41 | 迁移完整 Session、Team 与 Ultra 数据并可中断恢复 | migration/schema/codec/storage | L | #40 | planned（Batch 4） |
| #42 | 按 v2 Session 事实修正 Run 用量与完整性 | Session v2/Run evidence | L | #39 | planned（Batch 4） |
| #43 | 锁定新 fork 并完成真实归档升级与卸载 | lock/package/upgrade/removal | L | #41、#42 | planned（Batch 4） |
| #44 | 用真实 Codex 与 Claude Code 完成产品验收 | credentialed product acceptance | L | #43 | planned（Batch 5） |

所有 issue 启动时均带 `ready-for-agent`，无人指派，无评论。#33–#44 的 AC 与依赖已逐项通过 `gh issue view` 实时读取；后续每批开工和勾选 AC 前必须重读对应正文。

## 冻结规划

| Batch / PR | Issue（PR 内按编号） | 分支 | 理由与依赖顺序 | PR 状态 | review 轮数 | local-gate 红灯轮数 | PR |
| --- | --- | --- | --- | --- | ---: | ---: | --- |
| Batch 1 | #33 | `feat/batch-1-message-send-reply` | 单项特别复杂：跨 Ultra/Harness、引入必需持久事件/codec/投影，且接手时已有未提交 #33 WIP；独立 PR 控制 review 体量 | merged | 2 | 0 | [#59](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/59) |
| Batch 2 | #34、#35、#36 | `feat/batch-2-task-dag-live` | 同一公开 Team 面板、task id/revision 与 watch 契约；依序 #34 → #35 → #36 | developing（#34 implemented/checked，#35 RED 准备） | 0 | 0 | 未创建 |
| Batch 3 | #37、#38 | `feat/batch-3-studio-recovery` | Studio 真实能力投影与 provider/Host 跨功能恢复紧密关联；两项均为 L，为保持一次 review 可消化而不并入 Batch 2 | planned | 0 | 0 | 未创建 |
| Batch 4 | #39、#40、#41、#42、#43 | `feat/batch-4-harness-v2-upgrade` | 五个 issue 明文要求基线、契约、数据、用量修复共用升级集成分支，依序 #39 → #40 → #41/#42 → #43 | planned；需人工合并 | 0 | 0 | 未创建 |
| Batch 5 | #44 | `feat/batch-5-real-native-acceptance` | 特别复杂且为 credentialed 最终产品验收；依赖 Batch 4 合并 | planned | 0 | 0 | 未创建 |

规划冻结。调整只能因 issue 外部关闭、AC 更新、无法剥离的 issue 级阻塞、review 体量或真实依赖变化，并须在“调整/异常记录”写明原因和时间。

## Batch 1 当前事实与恢复点

- 2026-09-07T11:57:01+08:00：`git fetch origin --prune` 成功；Ultra `HEAD` 与 `origin/main` 均为 `08585631ea6e618a3adbf7143046d00fde00f5d7`。#33 仍 open，正文/AC 未更新，#27/#32 均已关闭。
- 接手分支原为 `fix/33-team-message-send-reply`，尚无相对 main 的提交且错误地跟踪 `origin/main`；已在不触碰工作区内容的情况下重命名为 `feat/batch-1-message-send-reply` 并移除错误 upstream。
- Ultra 工作树已有用户/前序改动：`HANDOFF.md`、`TODO.md`（11 行净变更），不得丢弃。
- 锁定 Harness `/root/workspace/deepseek-harness-ultra-29` 位于 `fix/ultra-33-team-message-send`，HEAD `c2940ac5039b744f962d2b264c03a6e9fb33af07`；有 13 个 tracked 文件和 1 个新文件的 #33 WIP，约 +895/-20，必须保留。
- 开工 strict：`pnpm context:check:strict` 失败 16 项、0 warning。根因是上述 Harness WIP 导致 checkout 非 clean、docs digest 不匹配且 built entries 落后；不是 CI/local-gate 轮次，尚未计入熔断。`dsh-plugin-dev` 要求报告而不得弱化 lock；完成 Harness RED/GREEN、提交/构建并同步 lock 后必须恢复 strict 绿灯。
- 既有 WIP 基线审计：四个 Agent Team focused 文件共 185 tests 全绿（7.04s），证据见 `.ultra-checks/33-harness-wip-baseline.log`。该结果没有先行 RED，只是接手基线，不冒充 TDD 证据；另发现新增取消测试触达私有 journal，须改为已确认的公开/外部边界 seam。
- 首个可核验 RED：新增 built-LIB 公开契约期待 generated Remote 含 `agentTeams/sendMessage`；`pnpm exec vitest run --config vitest.e2e.config.ts packages/experimental/agent-team/tests/built-lib.e2e.ts` 真实执行后 1/1 失败，当前构建产物确实缺该 descriptor。证据见 `.ultra-checks/33-harness-generated-remote-red.log`；下一步只生成/构建 Typert 产物并复跑同一测试。
- 首个 GREEN：`pnpm build:lib:host` 成功重建且生成 Typert，同一 built-LIB 测试复跑 1/1 通过（809ms）；公开 browser Remote 产物已含 `agentTeams/sendMessage`。证据见 `.ultra-checks/33-harness-generated-remote-green.log`。
- #33 取消语义已移出私有 journal 测试 seam：提交前取消通过 public Remote 断言无持久副作用，提交后所有权通过 public Remote + 受控 native provider 外部边界断言；聚焦 2/2 通过。证据见 `.ultra-checks/33-harness-cancellation-public-seam.log`。
- Ultra 首个 UI RED：新增公开 `TeamMessageCenter` 交互要求显式收件人/回复目标、同 tick 双击栅栏、transport failure 后可核对的原 request/草稿、刷新不自动重发及显式同请求重试。`pnpm exec vitest run packages/ui/tests/message-center.client.spec.tsx -t "preserves one explicit reply intent"` 执行后 1/1 失败，首个缺口为当前只读面板没有 `Recipient` composer。证据见 `.ultra-checks/33-ultra-compose-retry-red.log`。
- Ultra UI GREEN：同一聚焦测试 1/1 通过（1.29s）。原 `messages` child Slot 现注入 generated `agentTeams/sendMessage` Remote；composer 在首个 await 前冻结 request，按 Team 写入 versioned `sessionStorage`，同 tick 双击只调一次，外层 transport failure 保留可核对草稿/request ID，刷新/重挂载不自动重发，只有显式 retry 复用原请求。成功后仅执行一次显式 list/roster refresh；没有引入 #36 watch/重连状态机。证据见 `.ultra-checks/33-ultra-compose-retry-green.log`。
- Ultra UI 两文件聚焦回归已通过：`message-center.client.spec.tsx` 与 `mount.client.spec.ts` 共 2 files / 7 tests 全绿（2.10s）。新增收件人选择器曾令既有测试的全局 `Member` option 查询产生歧义，已仅把该查询限定到原成员筛选 select，未放宽产品断言；证据见 `.ultra-checks/33-ultra-ui-focused-suite-green.log`。
- Ultra UI 恢复/i18n 回归证明：消息中心 1 file / 7 tests 全绿（1.64s）；真实 remount 与刷新均不自动重发，显式 retry 复用完整原请求，中文生产组件显示发送、未知结果、已保存草稿与同请求重试。两次测试撰写时误用中文近义词的失败未冒充产品 RED；证据见 `.ultra-checks/33-ultra-reload-i18n-proof.log`。
- Harness 行为聚焦回归：`team`、`native-member-operations`、`persistence`、`projection-events` 共 4 files / 186 tests 全绿（6.68s），覆盖精确 owner authority、request replay/conflict、回复/跨 Team 拒绝、重启与 provider 恢复、required event/codec/投影/checkpoint 及公开 Remote 取消所有权；证据见 `.ultra-checks/33-harness-focused-behavior-green.log`。
- Harness 第二个真实 RED：公开 generated Remote 在 `team/message/request-committed@1` 已存在且受控 native provider 仍阻塞时没有返回，而是把提交回执耦合到 provider 工作完成；聚焦测试 1 failed / 78 skipped（2.00s），与“提交结果和投递阶段分离”AC 不符。外部 provider barrier 在失败路径也由 `finally` 释放；证据见 `.ultra-checks/33-harness-detached-acceptance-red.log`。下一步最小 GREEN 是提交后由 Team 生命周期后台拥有原消息 dispatch，立即返回原 acceptance + 当前 pending stage。
- Harness 第二个 GREEN：同一公开 Remote/provider barrier 测试 1 passed / 78 skipped（2.03s）。Team 在 durable acceptance 后自行跟踪原 dispatch，Remote 立即返回原 submission + `pending`；caller abort 不取消已接受投递，同请求显式重放仍为同一 submission，ack 后再重放读到 `delivered`，且仅一条 request 与 delivery 事实；证据见 `.ultra-checks/33-harness-detached-acceptance-green.log`。
- detached acceptance 改动后的 Harness owning 回归共 4 files / 186 tests 全绿（6.85s）。既有用例改为先等待权威 `team/message/delivered` 事实再断言 delivered replay；完整重启用例在关停前等待 ack，再证明重启无重复模型工作，没有把断言放宽为任意阶段。证据见 `.ultra-checks/33-harness-focused-after-detach-green.log`。
- packed probe 已先写入生产 renderer 双击发送/关联回复期待；尝试构建 UI archive 时强制 source validator 在 tsdown 前拒绝尚未提交且未更新 Ultra lock 的 Harness，符合契约。这不是产品 RED 或 local-gate 轮次，禁止绕过；证据见 `.ultra-checks/33-ultra-ui-bundle-prelock-blocked.log`。恢复顺序临时前置为完成 Harness docs/gates/commit+push 与 Ultra 精确锁更新，再回到该 packed expectation 观察真实 RED。
- Harness owner 文档、Agent Note 和生成 catalog 已同步：Cordis catalog、persistence catalog、Agent Note format/classification 均 PASS；新增 5 个公开类型首次 `verify-type-equiv` 精确红在缺少 manifest 条目，补入 1:1 manifest 后 435 primary + 435 derivative 全绿。三组中英文档已用正式 pairing writer 刷新并通过 named checks；证据见 `.ultra-checks/33-harness-type-equiv.log`、`33-harness-translation-record.log`。
- 为判断是否必须扩充 SDK golden，对现有 `agent-team-external` replay 做了可逆二分：新 request event 块存在或完全移除时，都在 initialize 阶段报同一 `cannot create effect on inactive context`，而同 runner 的 `text-turn` 通过。因此这不是 #33 event shape 的 RED，也不是必需交付路径；所有 speculative TS/Python snapshot 改动已完整撤销，不计 local-gate 轮次，不继续扩散。可复现日志见 `.ultra-checks/33-harness-sdk-required-event-red.log`、`33-harness-sdk-required-event-red-after-build.log`。
- Harness 最终 focused gates：Host build、Client typecheck、doc-typecheck（86 blocks）、export JSDoc 均 PASS；persistence catalog 中文对侧已补齐新事件并用 pairing writer 刷新，`pnpm test:docs` 复跑 15/15 PASS（46.51s）。四个 owning suites 4 files / 186 tests PASS，built Remote 1/1 PASS，整个 Agent Team package 16 files / 376 tests PASS（另 2 个既有 skipped，本次没有新增 skip）。证据见 `.ultra-checks/33-harness-doc-quick-green.log`、`33-harness-final-owning-suites.log`、`33-harness-final-built-remote.log`、`33-harness-package-tests.log`。
- Harness 独立 #33 提交已完成并推送：`d1d6b8a3e16c668e742f47a92297a0de0a20570f`（`feat(agent-team): add idempotent Lead message submission (#33)`），远端分支 `ultra/fix/ultra-33-team-message-send`；pre-commit 全闸门和 pre-push typecheck 均通过，Harness 工作树 clean。锁定文档摘要为 `1a657499e776a02559799396a590e73f06de646667ef88dda7bb8ca76ab27b7a`；push 证据见 `.ultra-checks/33-harness-push.log`。
- Ultra reference lock 已精确更新到该 Harness commit/docs digest，扩展资格为 `agent-team-ultra.phase-b.message-center.v2`，人类 message request 格式为 1、Team projection 为 7；README、ledger、CONTEXT、PROJECT_CONTRACT 与 ADR 0024 已同步。`prepare:harness` 和 `pnpm install` 通过。首次 post-lock strict 只发现提交后增量构建没有刷新部分 `.d.ts` 时间戳；对精确干净 commit 强制重建 declarations 后 `pnpm context:check:strict` 582 checks / 0 warning 全绿，不计 local-gate 轮次。证据见 `.ultra-checks/33-ultra-prepare-harness.log`、`33-ultra-context-after-rebuild.log`、`33-harness-postcommit-types-force.log`、`33-ultra-context-after-force.log`。
- Ultra compatibility/migration 格式公开 seam RED/GREEN：更新期待后，`pnpm exec vitest run packages/domain/tests/migration-audit.integration.spec.ts -t 'reads a real Session'` 对 JSON/SQLite 2/2 精确红在审计输出缺少 `messageRequest: 1`；最小实现从 lock 输出该独立格式后同命令 2/2 通过。此前一次测试收集前的旧 compatibility bytes 拒绝仅是生成物尚未刷新，不冒充 RED；随后 `pnpm build` 已用正式生成器更新 Typert/compatibility 并全绿。证据见 `.ultra-checks/33-ultra-migration-format-{red,green}.log`、`33-ultra-build-after-lock.log`。
- Ultra packed UI/Remote seam RED/GREEN：初次 `pnpm verify:pack` 在八个 archive 均完成 pack/install/resolve 后精确失败于生产消息中心缺少受控真实 Team 成员选项；补入 Loader 加载的受控外部 provider、真实 AgentLoop/Team/JSONL Host 与成员后，最终同命令退出码 0。GREEN 经已安装 archive 的生产 renderer + generated Remote 同 tick 双击，仅产生一条 `team/message/request-committed@1`；provider 缺失与 Host 冷恢复期间保持 pending 且不自动重发，恢复 provider 后投递原 message/reply，一次显式 retry 返回同一 delivered receipt；required fact 缺失/重复负控均拒绝，随后 Web profile、JSON/SQLite native recovery 与卸载全绿。中间仅修正 probe 的 React 事件与“先选回复会推断接收者”的真实 UI 操作顺序，不冒充额外产品 RED。证据见 `.ultra-checks/33-ultra-packed-send-red.log`、`33-ultra-packed-send-green-attempt6.log`。
- Ultra 最终 focused 回归：`message-center.client.spec.tsx`、`mount.client.spec.ts`、`migration-audit.integration.spec.ts` 共 3 files / 45 tests 全绿（33.40s），覆盖公开 UI 提交/恢复 seam、生产 Slot 注册及 JSON/SQLite 格式审计；证据见 `.ultra-checks/33-ultra-final-focused.log`。
- Ultra 最终 standalone strict：`pnpm context:check:strict` 通过 582 checks / 0 warnings，锁定并构建的 Harness commit、docs digest、所有依赖解析与产物 freshness 均匹配；证据见 `.ultra-checks/33-ultra-final-strict.log`。
- Ultra 最终完整验证：`pnpm verify` 自然退出 0；strict 582/0、Host/Client 与 Typert/compatibility build、全 Vitest 30 files / 343 tests、八 archive pack/install/resolve、生产 packed 消息提交/恢复、Web、Codex/Claude JSON/SQLite recovery 及完整卸载均通过。证据见 `.ultra-checks/33-ultra-final-verify.log`；这仍是 developing 阶段开发者验证，不增加 local-gate 轮数。
- #33 AC 勾选前已用 `gh issue view 33 --json number,title,state,url,updatedAt,body` 重读实时正文：Issue 仍 open，六条 AC 与冻结正文一致。逐条将 Harness exact-Lead/reply、Team/sender replay/conflict、caller-loss/restart、provider recovery、required event/codec/projection/cross-Team 无副作用，以及 Ultra 双语草稿/生产 packed Remote 证据映射后认定 6/6 满足。随后再次读取最新 body/`updated_at`，仅将这六条的 `[ ]` 改为 `[x]`，程序断言除复选框外零差异并回读成功；GitHub `updatedAt=2026-09-07T05:33:49Z`，Issue 按流程保持 open。
- 收尾文档已同步：ledger 标记 packed gate 通过，新增 `docs/evidence/issue-33-acceptance.md`，TODO/HANDOFF 改为当前 Batch 1 分支与提交阶段恢复点。`git diff --check` 和九份变更 Markdown 的 91 个本地链接均通过；删除 probe 未使用的观测字段后再次 `pnpm verify:pack` 自然退出 0，完整八归档验证及卸载全绿。证据见 `.ultra-checks/33-ultra-precommit-packed.log`。
- 主 agent 于提交后再次 `git fetch origin --prune`：`origin/main` 仍为 `08585631ea6e618a3adbf7143046d00fde00f5d7`，分支 0 behind / 1 ahead；#33 仍 open 且 6/6 AC 已勾选，无启动快照后新增 issue、无其他 open PR。Ultra 分支已推送并创建 [PR #59](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/59)，描述包含 `Closes #33`、Harness 精确提交与完整验证结果；状态转为 in-review，review/local-gate 均为 0 轮。
- PR #59 隔离 Spec review 第 1 轮已完成：0 blocking、1 high、1 medium。High：`TeamMessageCenter` 调用生成 Remote 时无 deadline，永不 settle 的请求会永久停在 submitting，无法进入保留同一 request 的 `unknown`/retry，故 AC 3 为 fail。Medium：`sessionStorage.setItem` 失败被吞掉后仍发送，重挂载可能失去原 intent/requestId；不单独阻塞，但与 high 一并交给修复会话评估。Standards 轴尚在收束，local gate 尚未启动。
- PR #59 隔离 Standards review 第 1 轮已完成：0 blocking、1 high、2 medium。High：Harness 新增 `SessionEventMap` 事件但固定 diff 没有规范强制的 keyless recorded-session 与 TypeScript/Python SDK 双侧快照。Medium：中英 subsystem 文档一处仍写 projection v6；旧 implemented Agent Note 未与新人类 send/reply Note 建立部分 supersession/current-state 链接。第 1 轮因两个 high 不通过；两项 medium 不独立阻塞，但交修复会话同范围处理。
- 2026-09-07T14:02:09+08:00：第 1 轮 review-fix 隔离开发已启动。按 `dsh-plugin-dev`/TDD 已完整读取指定契约、测试、snapshot 与 Agent Note 规范；修改前 `pnpm context:check:strict` 通过 582 checks / 0 warnings。已确认公开 seams 为 Harness 正式 recorded-session/SDK 投影快照与 Ultra 公开 `TeamMessageCenter` 交互；先完成 Harness RED→GREEN，不把已知 inactive-context 基线故障或陈旧生成物计为产品 RED。
- 2026-09-07T14:07:43+08:00：Harness `agent-team-external` 基线已用精确 focused 命令复现：source mode 为 1 failed / 16 skipped，在 `session/prompt` 返回 `cannot create effect on inactive context`；同一用例设 `DSH_EXAMPLE_MODE=lib` 为 1 passed / 16 skipped。这是 #33 事件块存在前的 fixture source-mode 装载 seam 故障，不记为产品 RED；已收窄到 `sdk-event-fixture.mjs` 的 source/lib 依赖解析差异，继续修复正式 seam 后再写持久事件 golden RED。
- 2026-09-07T14:12:38+08:00：Harness TypeScript SDK snapshot 正式 lib seam 首个真实 RED：先在公开 SDK `session.event` notification 断言中要求一条含真实回复关联的 `team/message/request-committed@1`，再运行 `DSH_EXAMPLE_MODE=lib pnpm exec vitest run --config vitest.snapshot.config.ts -t 'replays agent-team-external'`；结果 1 failed / 16 skipped，精确为期望 1 条但收到 0 条，旧 native message/task 投影均已通过。下一步仅向该录制场景加入合法 request/reply 事实并用正式 refresh 更新 golden。
- 2026-09-07T14:14:28+08:00：Harness TypeScript SDK snapshot GREEN：录制 fixture 在 active external member 的 native message 之后追加一条 Lead 回复，request receipt 与新 message 原子共存，`replyTo` 指向同 Team 真实旧 message；正式 `DSH_SNAPSHOT=refresh DSH_EXAMPLE_MODE=lib` 工作流刷新 session/notification golden 后，同一 replay 命令 1 passed / 16 skipped。新断言同时固定 version、sender/recipient、literal text、request/result identity 与 reply 关联。
- 2026-09-07T14:19:44+08:00：Harness Python SDK single-exe snapshot 真实 RED：先在 `smoke_sdk_snapshot` 的公开 `result.events` 投影断言中要求同一 human request/reply 事实，再用官方 `build-exe-for-python-sdk.ts` 构建 host `node24-linux-arm64` single executable；`PYTHONPATH=python/sdk/src python3 scripts/smoke-python-runtime.py --scenario sdk-snapshot --exe dist-exe/deepseek-harness-sdk-runtime-linux-arm64` 精确失败于新事件 expected 1 / received 0，既有 native message/task 投影均已通过。之前直接使用 Node CLI 的 TypeScript-support 环境错误未冒充为 RED。
- 2026-09-07T14:21:11+08:00：Harness Python SDK single-exe snapshot GREEN：最小 fixture 在同一录制 Team 中追加与 TypeScript 场景同构的 Lead request/reply 事实，正式 `--update-snapshots` 刷新 `scripts/snapshots/python-sdk-single-exe/advanced/` 后，不带 refresh 的同一 single-exe 命令通过。断言固定 version、message sender/recipient/text、request/sender/fingerprint/replyTo 与 accepted result，实际刷新仅涉及 `result.json` 和主 `session.jsonl`。
- 2026-09-07T14:27:30+08:00：Harness 同范围 medium 文档已修复：Agent Team subsystem 中英残留 projection version 6 均更新为 7；新 human-request Note 与旧 Web Note 双向记录「部分取代」及各自 current owner，旧 Note 不再声称 Web 无 send/reply。三对 sidecar 已用正式 pairing writer 刷新，named pairing 通过；Agent Note format 693/693 与 classification 693/693 均通过，`git diff --check` 通过。single-exe deploy 遗留的忽略 pnpm production/hoisted 状态已用 frozen-lockfile install 恢复，未冒充 gate RED。
- 2026-09-07T14:29:49+08:00：Harness 拥有者验证全绿：`pnpm typecheck` 自然退出 0；Agent Team package 16 files / 376 tests 通过（保留既有 2 files / 2 tests skipped，本次无新 skip）；正式 lib-mode `agent-team-external` replay 1 passed / 121 skipped；Python SDK single-exe replay 通过；`pnpm test:docs` 15 passed / 0 failed / 0 skipped，其中 pairing、links、Note format/classification/archive 均通过。再次 `git diff --check` 通过。
- 2026-09-07T14:32:05+08:00：Harness 第 1 轮 review-fix 已形成独立提交 `d2d870fbe40bc0e968abdac854a3aae495162bec`（`test(agent-team): cover human message SDK projections (#33)`）；pre-commit staged translation pairing、lint、whitespace 与 vendor guard 全绿，提交后 Harness 工作树 clean。下一步只 push 既有 `ultra/fix/ultra-33-team-message-send` 远端分支，再让 Ultra 精确锁定该 SHA。
- 2026-09-07T14:35:02+08:00：Harness 首次 push 未改变远端：SSH `github.com:22` 等待后 connection timeout，本地仍 ahead 1，远端仍为 `d1d6b8a3e16c668e742f47a92297a0de0a20570f`。HTTPS `ls-remote` 已用现有 GitHub credential 成功核对；下一步用同一 repo/branch 的 HTTPS transport 重试，不改历史。
- 2026-09-07T14:37:02+08:00：Harness HTTPS push 成功：pre-push `typecheck` 通过，远端 `ultra/fix/ultra-33-team-message-send` 已由 `d1d6b8a3e1` fast-forward 到 `d2d870fbe40bc0e968abdac854a3aae495162bec`；HTTPS `ls-remote` 和本地 tracking ref 复核均精确匹配，Harness 工作树 clean 且无 ahead/behind。
- 2026-09-07T14:40:02+08:00：Ultra 已把运行锁和当前来源文档切到评审修复后的 Harness `d2d870fbe40bc0e968abdac854a3aae495162bec`，按正式摘要算法得到 docs digest `9e71a33224fa8755fd225764705ea16b6cc7df351edbf908e184153bf2048d8a`；ledger 另保留原功能提交并新增快照证据提交行。下一步对这一精确 clean source 运行 `prepare:harness`／冻结安装／构建。
- 2026-09-07T14:41:34+08:00：`DSH_HARNESS_ROOT=/root/workspace/deepseek-harness-ultra-29 pnpm prepare:harness` 自然退出 0；输出的 repository、version、commit 与 docs digest 均精确匹配 lock。继续执行 `pnpm install`，随后构建并复核 strict freshness。
- 2026-09-07T14:42:07+08:00：Ultra `pnpm install` 自然退出 0，6 个 workspace 均已是 lock 对应依赖。下一步运行正式 `pnpm build`，再以 strict 确认 source identity、生成物与 freshness。
- 2026-09-07T14:42:43+08:00：Ultra `pnpm build` 自然退出 0；Host、Client、四包 bundle、Typert 与 compatibility 均针对 `d2d870fbe40bc0e968abdac854a3aae495162bec` 生成完成。继续运行独立 `pnpm context:check:strict`，确认无 stale source/build 后开始 UI RED。
- 2026-09-07T14:43:07+08:00：post-lock `pnpm context:check:strict` 自然退出 0：582 checks / 0 warnings，Harness source identity、docs digest、依赖解析和所有 built entry freshness 均匹配。固定依赖阶段完成；下一步按公开组件 seam 写永不 settle 的 fake-timer deadline RED。
- 2026-09-07T14:45:39+08:00：Ultra deadline 产品 RED 已精确复现：公开 `TeamMessageCenter` 的受控 Remote 永不 settle，fake clock 推进 15 秒后测试 1 failed / 7 skipped，首个断言为传入 signal 仍未 abort（received `false`）；因此现状确实会永久停在 submitting。测试同时锁定完整 recipient/reply/text/requestId、迟到 rejection 隔离与显式 same-request retry；这不是测试撰写或生成物错误。下一步实现有界 deadline 与 unmount/late-settle cleanup。
- 2026-09-07T14:47:00+08:00：deadline GREEN：同一公开组件测试 1 passed / 7 skipped。生产组件以 15 秒确认 deadline race 受控 Remote 与 abort；超时进入双语 unknown、保留完整 intent，迟到 rejection 已被 race handler 消费且不改 UI，显式 retry 复用完全相同请求。session change／unmount／新意图均清理 timer 并 abort，generation guard 阻止 stale settle。下一步新增独立 unmount cleanup 与 storage-failure 产品 RED/证明。
- 2026-09-07T14:48:16+08:00：Ultra browser-storage 产品 RED 已精确复现：让公开 `sessionStorage.setItem` 抛出 `QuotaExceededError` 后，focused test 1 failed / 8 skipped，Remote 实际仍被调用 1 次；这证明现状会在无法保留 request intent 时产生不可安全恢复的发送。测试还要求英文／中文可诊断错误、原草稿可核对且不虚报已保存 intent。下一步让持久保留确认成为 Remote 调用的前置条件。
- 2026-09-07T14:49:49+08:00：browser-storage GREEN：同一公开组件测试 1 passed / 8 skipped。组件现在先写入再读回精确 versioned intent；缺失 storage、写入异常、读回异常或内容不一致均在调用 Remote 前停止，保留原草稿、不虚报 saved intent，并显示中英文“消息未发送”加浏览器异常诊断。若 setItem 报错但既有存储仍精确等于同一请求，则允许幂等 retry。下一步补 unmount timer/abort 的独立回归并运行消息中心全文件。
- 2026-09-07T14:50:59+08:00：首次 unmount 回归执行在 timer 总数断言处 1 failed / 9 skipped：jsdom/React 在组件 deadline 外已有另一个 fake timer，实际总数 2；signal 与产品行为尚未进入失败点，因此这是测试撰写假设错误，不计产品 RED。将断言改为提交前后 timer 增量及卸载恢复基线，再验证 abort 与迟到 rejection。
- 2026-09-07T14:51:56+08:00：unmount 回归的 timer 增量假设仍受 React click 调度 timer 干扰（期望 +1、实际 +2），第二次失败仍停在测试计数且不是产品 RED。改为精确捕获 15 秒 deadline timer handle，并断言 unmount 对该 handle 调用 clear、同时 signal abort；不再依赖框架 timer 总数。
- 2026-09-07T14:52:45+08:00：unmount cleanup 回归通过 1 passed / 9 skipped：测试精确捕获 15 秒 deadline handle，组件卸载后 signal 已 abort 且对应 handle 已 clear；随后受控 Remote 迟到 reject 未产生未处理 rejection。下一步运行消息中心全文件，处理真实回归后更新 ADR/evidence 和 packed production seam。
- 2026-09-07T14:54:06+08:00：首次消息中心全文件为 3 passed / 7 timed out；定位为新增测试的清理顺序错误：在 fake timer 上建立 spy 后先 `useRealTimers`、再 `restoreAllMocks` 会把 spy 捕获的 fake `setTimeout` 恢复并污染后续测试。7 个 timeout 均非产品断言且单独运行过的 storage/deadline/unmount 测试已绿，故不计产品 RED；调整为先 restore spies 再切回 real timers后重跑全文件。
- 2026-09-07T14:54:40+08:00：修正测试清理顺序后，消息中心完整组件套件 1 file / 10 tests 全绿（1.79s）；既有双击、transport failure、remount、中英文、分页/detail/stale generation/roster 场景与新增 deadline/storage/unmount 场景共同通过。下一步更新 ADR/验收证据与 packed probe，使安装后 production renderer 也证明 deadline/drop-response 和 storage fail-closed。
- 2026-09-07T14:57:23+08:00：packed production probe 已把原先测试侧手工写 retry intent 改为真实“Host 已接受、Client 响应丢失”：wrapper 只吞一次 installed generated Remote 的已返回回执，生产组件自行在 15 秒 deadline abort/unknown，并要求 exact storage intent 后再走冷恢复/显式 replay。脚本 `node --check` 与 `pnpm build:client` 均自然退出 0；现在运行完整八归档 `pnpm verify:pack`。
- 2026-09-07T14:58:03+08:00：首次 `pnpm verify:pack` 在运行新 probe 前由 ordinary-resolution compatibility guard 拒绝：单独 `build:client` 后 `lib/client.js` 已更新，而 compatibility manifest 仍是上一轮 full-build 摘要，报 `ULTRA_COMPAT_ARTIFACT_MISMATCH`。这是预期的陈旧生成物阻断，不是产品 RED/local-gate；运行完整 `pnpm build` 刷新正式 compatibility 后重试同一 packed gate。
- 2026-09-07T14:59:01+08:00：用于恢复 packed 前置的完整 `pnpm build` 自然退出 0，Host/Client、Typert、compatibility 与全部 bundle 已一致刷新；立即重跑相同 `pnpm verify:pack`，本次才可作为 production dropped-response seam 的行为结果。
- 2026-09-07T15:00:15+08:00：`pnpm verify:pack` 重跑自然退出 0。八归档 pack/install/resolve 后，installed production renderer + generated Remote 真实完成 durable acceptance、刻意丢失一次回执、15 秒 deadline abort/unknown、exact request intent 保留、Host 冷恢复不自动重发、provider 回归投递原消息、显式 same-request replay 且无重复事实/work；随后 Web、Codex/Claude JSON/SQLite recovery 与完整 uninstall 全绿。下一步同步 ADR/evidence/TODO/HANDOFF 并跑 focused/full gates。
- 2026-09-07T15:03:26+08:00：ADR 0024、PROJECT_CONTRACT 与 #33 evidence 已同步 fail-closed storage、15 秒 deadline、late-settle/unmount 和 packed lost-response 决策；验收证据也加入 Harness keyless TS/Python SDK 投影。Ultra focused 复跑 3 files / 48 tests 全绿（message center、mount、JSON/SQLite migration audit）。下一步 docs/link/diff 与 strict，再运行完整 `pnpm verify`。
- 2026-09-07T15:05:32+08:00：评审修复后独立 `pnpm context:check:strict` 再次通过 582 checks / 0 warnings；`git diff --check` 退出 0，8 份 changed Markdown 的 91 个本地链接全部存在。focused/packed/strict 均绿，开始完整 `pnpm verify`；该运行仍是修复期 validation，不增加 local-gate 红灯轮数。
- 2026-09-07T15:07:48+08:00：评审修复后的完整 `pnpm verify` 自然退出 0：strict 582/0，Host/Client/Typert/compatibility build 全绿，Vitest 30 files / 346 tests 全绿，八归档 install/resolve、production lost-response deadline/recovery、Web、Codex/Claude JSON/SQLite recovery 与完整 uninstall 全绿。仅出现既有 SQLite experimental 和 Claude allowlist diagnostic，无失败；仍不增加 local-gate 红灯轮数。下一步把精确数字写回 evidence/TODO/HANDOFF，复核最终 diff 后提交 Ultra（不 push）。
- 2026-09-07T15:10:30+08:00：精确验证数字与新恢复入口已写回 evidence/TODO/HANDOFF；最终 `git diff --check` 再次退出 0，8 份 changed Markdown 的 91 个本地链接再次通过。Harness HEAD/upstream 均为 `d2d870fbe40bc0e968abdac854a3aae495162bec`、0 ahead/behind 且 clean。Ultra 13 个预期文件（包含主 agent 原有 `PIPELINE_STATE.md` findings）准备形成一个本地 review-fix commit，明确不 push，随后由主 agent双轴复审。
- 2026-09-07T15:15:18+08:00：Ultra review-fix 提交 `cf9ab192586ee5aa0aaef0e06c81de6a6956a334` 已形成并由主 agent 推送；fetch 后 `origin/main` 仍为 `08585631ea6e618a3adbf7143046d00fde00f5d7`，PR 分支相对 main 0 behind / 3 ahead。GitHub PR #59 head 已回读为 `cf9ab192…`、mergeable/CLEAN、无 checks；PR 描述已更新为 Harness `d2d870f…`、第 1 轮修复和 48/346 最新验证数字。#33 仍 open、6/6 AC 保持勾选，无启动快照后新增 issue。
- 2026-09-07T15:27:21+08:00：PR #59 第 2 轮在两个全新隔离会话对固定 Ultra `08585631…df534403` 与 Harness `c2940ac…d2d870fb` 完成复审。Standards：0 blocking / 0 high / 0 medium / 0 low，确认双 SDK recorded-session、projection v7 文案与 Agent Note partial-supersession 已补齐。Spec：0 finding，六条 AC 全部 PASS，独立确认 deadline/late-settle、storage fail-closed、exact authority/idempotency、provider/restart、codec/projection 与 packed 负控。review 轮数记为 2，本轮通过，无未解决 blocking/high。
- 2026-09-07T15:30:19+08:00：复审后再次 fetch，`origin/main` 未前进，PR head 为 `df534403…`，#33 仍 open 且无新增 issue；正式 local gate `pnpm verify` 自然退出 0：strict 582/0、build/Typert/compatibility 通过，Vitest 30 files / 346 tests，通过八 archive、真实丢回执 deadline/exact retry、Web、Codex/Claude JSON/SQLite recovery 与 uninstall。仓库无 CI；local-gate 红灯轮数保持 0，PR #59 满足全部自动闸门。
- 2026-09-07T15:31:08+08:00：因 public Remote 与 persistent event/projection schema 命中人工合并规则，已按 `lark-im` 以 bot 向既定群聊发送【需决策】通知，回执 `ok: true`，message `om_x100b66d2cd703104c44a760eec861ed`；请求按冻结 merge commit 方式确认合并 PR #59。发送成功，无待补发通知。
- 2026-09-07T15:40:14+08:00：用户明确回复“确定”，人工授权按冻结 merge commit 方式合并 PR #59。恢复对账已完成：PR head `9474a8e775f4bc7fa93db74640f6c1b2a5a7494a`、CLEAN/MERGEABLE、无 checks；`origin/main` 仍为 `08585631…`，#33 仍 open 且 6/6 AC 已勾选，无新增 issue，工作树 clean。先把本授权记录提交/push，再以更新后的精确 head 执行合并。
- 2026-09-07T15:44:28+08:00：人工确认记录提交 `c1e5e7abaff3fb1b4d0788f7a984cdd1d414c791` 推送后，再次 fetch 并确认 PR #59 为 CLEAN/MERGEABLE、main 未前进；`gh pr merge --merge --delete-branch --match-head-commit c1e5e7a… 59` 在 GitHub 成功创建 merge commit `2c5a355deefcf3c9dfc3384787e9cfe3de4678e3`。合并提交双亲为原 main 与精确 head，tree 与 head tree `fb72fc38…` 相同；PR 回读 MERGED，#33 于 15:42:39+08:00 自动 CLOSED。命令随后仅在本地 SSH fetch 挂住，已终止并用 HTTPS fast-forward main；远端残留功能分支经精确 SHA 核验后用 GitHub API 删除，本地分支也已删除。当前 main/origin main 均为 `2c5a355…`，等待 post-merge 全量验证。
- 2026-09-07T15:47:14+08:00：main `2c5a355…` 的 post-merge `pnpm verify` 自然退出 0：strict 582/0、build/Typert/compatibility、Vitest 30 files / 346 tests、八 archive、真实丢回执 deadline/recovery、Web、Codex/Claude JSON/SQLite 与 uninstall 全绿。Batch 1 最终 merged。飞书【仅知会】合并摘要发送成功，回执 `ok: true`，message `om_x100b66d28eed8cb0c26d7beda8aae21`。Batch 2 状态立即转为 developing（开工对账），尚未创建分支或修改 #34–#36。

## Batch 2 当前事实与恢复点

- 2026-09-07T15:48:39+08:00：`git fetch origin --prune` 后本地 main、`origin/main` 与 PR #59 merge commit 均为 `2c5a355deefcf3c9dfc3384787e9cfe3de4678e3`；工作树仅有本状态文件的 Batch 1/2 进度更新。远端 Batch 1 分支已删除，无 open PR。
- #34、#35、#36 均实时回读为 OPEN、`ready-for-agent`、无人指派且正文/AC 与启动快照一致，`updatedAt` 分别为 `2026-09-05T03:34:59Z`、`03:35:06Z`、`03:35:13Z`。外部依赖 #25、#33 已 CLOSED；#35→#34 与 #36→#35 为本 PR 内顺序，不调整冻结规划。
- 启动快照后没有新增 open issue；当前 open 范围为 skipped 父 #18 与待处理 #34–#44。Ultra Batch 2 分支 `feat/batch-2-task-dag-live` 已由精确 main 创建，起始状态提交为 `09383fba057868315e72088a5c8a999570ac7f98`；接手时工作树 clean。
- 2026-09-07T16:02:57+08:00：Batch 2 隔离开发必读完成：`dsh-plugin-dev` 主 skill 与 core-contracts、agent-team、client-plugin、service-plugin、runtime-capabilities、packaging-testing，`tdd` 主 skill 与 tests/mocking，以及两仓适用 AGENTS、Ultra PROJECT_CONTRACT/TODO/lock/CONTEXT、Harness testing/Agent Team/Session/Persistence/Projection/Client Modules/Web Client/Slots/Typert/API Gateway 规范均完整读取。开工 `pnpm context:check:strict` 自然退出 0：582 checks / 0 warnings；实时回读 #34–#36 正文与上述 AC/updatedAt 一致且仍 OPEN。
- 2026-09-07T16:02:57+08:00：Harness 从精确 clean `d2d870fbe40bc0e968abdac854a3aae495162bec` 新建维护分支 `fix/ultra-34-36-task-dag-live`，未重写旧 #33 分支历史。现有 Host seam 已有同一 Lead-log 权威 `view`、`createTask`、CAS `updateTask`、含 tombstone 的 Host-only `getTask`、完整 missing/duplicate/self/indirect-cycle DAG 校验，以及 owner/readiness/blocker 派生；generated Remote 尚无 task detail/watch。公开 owner `TeamAction` 已有平铺任务与创建、编辑、分配/取消分配、完成、重开、删除控件，但没有共享 selection/detail、列表/DAG 切换、布局/zoom/pan/fit/filter/键盘图交互，依赖编辑仍是逗号 id 文本。下一步在该公开 production 组件 seam 建立 #34 首个真实 RED，锁定真实 task id、前置→依赖边与列表/图共享详情/控件。
- 2026-09-07T16:05:46+08:00：#34 首个公开 UI 产品 RED 已精确复现：先加入两条真实 `TeamTaskView`（`task-2.blockedBy = [task-1]`）并要求列表选择 `task-2`、共享详情、依赖图真实边 `task-1 → task-2` 及切回列表仍保留选择；focused `pnpm exec vitest run packages/experimental/client-ui-agent-team/tests/team-action.client.spec.tsx -t 'shares real task selection and detail between the list and dependency graph'` 真实执行为 1 failed / 22 skipped。首个失败是找不到可选择的 `task-2 · Publish result` button，现有 UI 只有无名称 article 与各卡片内重复控件；测试已完成编译并加载两条任务，不是陈旧构建或测试撰写错误。下一步最小 GREEN 是以同一 `view.tasks` 派生列表/图、共享 `selectedTaskId` 与一份现有详情/控件，不新增持久状态或 Remote。
- 2026-09-07T16:12:35+08:00：首个 #34 slice GREEN：同一 focused 测试为 1 passed / 22 skipped。生产 `TeamAction` 只从同一 `TeamView.tasks` 派生 list 与 graph，保存一个非持久 `selectedTaskId`，两种显示共用一份详情和既有 mutation 控件；边按每个 task 的 `blockedBy` 渲染为真实 `blockerId → task.id`，没有新 Remote 或第二状态。第一次 GREEN 尝试仍 1 failed，因为实现把原生 button 覆盖为 `role=listitem`，测试正确识别它失去 button 语义；改成 listitem 容器内真实 button 后通过，该实现期修正不是新增产品 RED。下一步运行整个 owner UI 文件确认既有 22 条任务/Slot/竞态行为无回归，再按 #34 下一个公开行为写 RED。
- 2026-09-07T16:13:17+08:00：Harness owner UI 全文件回归自然退出 0：`team-action.client.spec.tsx` 1 file / 23 tests 全绿，既有 Slot、加载代际、完整 task CRUD/CAS/conflict/失败与 session-switch 负控均与新增共享 list/graph/detail 行为共同通过。下一步为自动布局、zoom/pan/fit、图键盘导航及列表替代建立第二个公开 UI RED。
- 2026-09-07T16:15:50+08:00：#34 第二个公开 UI 产品 RED 已精确复现：三层真实 DAG `task-1 → task-2 → task-3` 要求按依赖自动分列、交互图 `application` 语义、zoom、pointer pan、fit 与左右方向键选择/聚焦，并确认切回列表仍保留选择；focused 执行为 1 failed / 23 skipped。首个失败是找不到 `role=application` 的依赖图，现有最小 slice 仍是静态 `role=img`；三条任务已成功编译/渲染，因此是明确的产品缺口。下一步在无新增依赖下加入确定性 DAG layout 与有界 viewport transform/键盘导航。
- 2026-09-07T16:20:40+08:00：第二个 #34 slice GREEN：同一 focused 测试 1 passed / 23 skipped。生产 UI 以 Host 已校验的 `blockedBy` 做确定性依赖深度分列，实际 SVG line 仍保持 `blockerId → dependentId`；交互 application 提供 0.5–2 倍有界 zoom、pointer pan、按 canvas/viewport 计算的 fit，以及 ArrowLeft/Right 沿依赖关系、ArrowUp/Down/Home/End 沿布局顺序的选择与焦点移动，切回原生 button 列表仍保留同一 selection。没有引入图形依赖或新状态源。下一步跑 owner UI 全文件回归，再为过滤隐藏依赖提示且不改变 Host readiness 建 RED。
- 2026-09-07T16:21:22+08:00：第二个 slice 后 owner UI 全文件回归自然退出 0：1 file / 24 tests 全绿。下一步只新增过滤/隐藏依赖 public behavior 测试，先观察真实 RED。
- 2026-09-07T16:22:49+08:00：#34 第三个公开 UI 产品 RED 已精确复现：选择 `task-2` 后按 subject 过滤隐藏其 `task-1` 前置，要求 list/graph 均只隐藏呈现而显示 `隐藏依赖：task-1`，详情继续展示 Host 的 blocked/readiness，清除过滤恢复节点与边；focused 执行为 1 failed / 24 skipped，首个失败是找不到有名称的 task filter searchbox。测试已正常加载选择两条真实 task view，故不是 fixture/编译错误。下一步最小 GREEN 只派生 `visibleTasks` 与 hidden blocker ids，绝不回算或写入 readiness。
- 2026-09-07T16:25:14+08:00：第三个 #34 slice GREEN：同一 focused 测试 1 passed / 24 skipped。搜索仅从同一 Host view 派生 `visibleTasks`，list 与 graph 对被过滤的 blocker 显示真实 id 提示；详情继续原样读取选中 `TeamTaskView.ready/status/blockedBy`，过滤不产生 mutation、readiness 重算或额外状态源。下一步运行 owner UI 全文件，再补英文 copy/浏览器注册与真实 Host→Remote→UI 组合证据。
- 2026-09-07T16:25:52+08:00：第三个 slice 后 owner UI 全文件回归自然退出 0：1 file / 25 tests 全绿。下一步审计 browser-plugin/built-lib/真实 Host 测试入口，先建立缺失的生产组合 RED；#34 AC 此时仍全部未勾选。
- 2026-09-07T16:27:33+08:00：#34 Host public task-detail RED 已精确复现：现有 Team Remote API 测试在真实 `remoteCreateTask` durable success 后要求以相同 id 读取公开详情；focused 执行为 1 failed / 55 skipped，精确错误为 `ctx.agentTeams.remoteGetTask is not a function`。Host-only `getTask` 已存在且创建已提交，因此失败只证明 generated/public Remote 缺 detail，并非 storage 或 fixture 问题。下一步最小 GREEN 是新增 `@Remote('getTask')` 直接委托同一 authority/task board，不改变 schema 或权限。
- 2026-09-07T16:28:30+08:00：#34 Host public task-detail GREEN：同一 focused 测试 1 passed / 55 skipped。`remoteGetTask` 仅以 exact live `Agent` 与真实 `TeamTaskId` 委托既有 `getTask`，所以 authority、tombstone、owner/readiness 与 Host task board 完全共源；未新增 schema、权限或持久状态。下一步先让 built-LIB descriptor 断言产生真实生成物 RED，再运行官方 build 生成，不手改 artifact。
- 2026-09-07T16:29:19+08:00：#34 generated/built protocol RED 已精确复现：在 plain-Node built-LIB 契约中加入 `agentTeams/getTask` descriptor 后，`pnpm exec vitest run --config vitest.e2e.config.ts packages/experimental/agent-team/tests/built-lib.e2e.ts` 为 1 failed（e2e 配置 retry 共展示 3 次）。唯一 diff 是实际 production descriptor 列表缺 `getTask`；Host source focused 已先 GREEN，故这是预期的陈旧生成物 RED，不是产品实现失败或环境问题。下一步仅运行官方 Harness build 生成 Typert/built artifacts，并复跑完全相同测试。
- 2026-09-07T16:31:24+08:00：#34 generated/built protocol GREEN：官方 `pnpm build:lib:host`（TypeScript + Typert generator/tsdown）自然退出 0，随后完全相同的 plain-Node built-LIB 测试 1/1 通过，实际 production Remote descriptor 已含 `agentTeams/getTask`。未手改任何生成物。下一步审计全仓 build 产生的 tracked diff，只保留官方生成且属于本 issue 的文件，再补 browser owner Slot/production renderer 组合测试。
- 2026-09-07T16:32:55+08:00：#34 graph-node authoritative facts RED 已精确复现：在已绿的真实两节点 UI 测试中进一步要求依赖节点自身显示同一 Host task view 的 owner、claimability 与 blocker；focused 为 1 failed / 24 skipped，首个失败为节点文本只有 `task-2 / Publish result / 待处理`、缺 `未分配`，后续 blocked 与 `task-1` 尚未触发。这证明详情共源已实现但图节点状态摘要尚不完整。下一步只渲染现有 `ownerName/status/ready/blockedBy`，不客户端推断。
- 2026-09-07T16:34:03+08:00：#34 graph-node authoritative facts GREEN：同一 focused 测试 1 passed / 24 skipped。每个图节点现在直接显示传入 `TeamTaskView` 的 owner、status、pending readiness 与 blocker ids；没有由可见边或过滤结果重算。节点高度与 edge anchor 同步由同一常量调整。下一步运行 owner UI 全文件与 Client build，再建立真实 public Slot/browser composition 证据。
- 2026-09-07T16:34:46+08:00：Harness public owner component + browser Slot lifecycle focused 回归自然退出 0：2 files / 35 tests 全绿，包含新增 list/DAG/detail 行为及既有 generated Remote mount、`agent-team.panel.view` child Slot ownership/registration/disposal、Lead route 与失败负控。下一步运行 Client 官方 build/type boundary；随后在 Ultra 锁到 Harness 提交前先扩展 packed production probe 形成 #34 archive RED。
- 2026-09-07T16:35:47+08:00：Harness 官方 `pnpm build:lib:client` 自然退出 0，`tsc -b tsconfig.client.json` 与 production browser bundles（含 `dsh-experimental-client-ui-agent-team/client`）均通过；说明 React/CSS/Remote client 边界 browser-safe。build 后 tracked diff 仍需复核。下一步补中英文 rendered copy 断言和 Agent Note/双语 subsystem docs，再运行 #34 Harness owning gates并独立提交。
- 2026-09-07T16:40:01+08:00：#34 可视边方向 RED 已精确复现：已有 edge 的 `data-from-task-id=task-1` / `data-to-task-id=task-2` 与 aria 方向均正确，但 focused 断言 SVG 需有可见箭头时为 1 failed / 24 skipped，首个且唯一失败是 `marker-end` 实际 `null`。这是“前置→依赖”已有机器可读方向但缺可见方向的有界产品缺口；下一步只用 SVG `marker` 补箭头并复跑同一 focused。
- 2026-09-07T16:41:22+08:00：#34 可见边方向 GREEN：同一 focused 测试 1 passed / 24 skipped。依赖边现在使用 SVG arrow marker 在视觉上标明 `blocker → dependent`，同时保留已验证的 aria label 与真实 from/to task id；未改变 layout 或 Host 任务事实。下一步只补英文 production render 验证，然后直接运行 #34 owning suites。
- 2026-09-07T16:43:01+08:00：#34 owning suites 首次组合命令自然退出 0：常规 Vitest 实际执行 3 files / 92 tests 全绿（Host `team.spec.ts` + owner production `team-action.client.spec.tsx` + browser Slot `browser-plugin.client.spec.ts`），包含新增英文图状态/控件渲染验证。命令虽列出 `built-lib.e2e.ts`，但普通 config 排除 e2e，所以它未计入 3 files；现在用其 owning `vitest.e2e.config.ts` 单独补跑，不继续编辑。
- 2026-09-07T16:43:42+08:00：#34 built production protocol owning suite 用 `vitest.e2e.config.ts` 单独执行并自然退出 0：1 file / 1 test 通过。因此本轮精确结果为常规 3 files / 92 tests + built e2e 1 file / 1 test，共四个指定文件均绿。下一步只收口 Harness 双语文档/Agent Note，然后依规则运行 owning type/docs/generated gates 并独立提交 #34。
- 2026-09-07T17:01:00+08:00：#34 直接 owner docs 已收口：更新 Agent Team service README 的 generated `getTask`/同 Lead-log tombstone 契约、Client UI README 的共享 list/DAG/selection/detail/layout/filter 契约，以及已有且仍权威的 `2026-08-06-agent-teams-web` Agent Note；未新建重复 Note。英中三组 pair 均已落盘，官方 `verify-translation-pairing --write` 自然退出 0 并刷新 3 个 sidecar。`docs/subsystems/agent-team*` 属于 generated cordis surface，将只用官方 `doc-sync` 从 JSDoc 生成，不手改。
- 2026-09-07T17:06:54+08:00：#34 首次 `pnpm run doc-sync` 真实结果为 30 passed / 2 failed / 0 skipped；首个失败是 Cordis catalog 明确报告 `packages/extensions/tool-cordis/src/api-catalog.ts` 与双语 `docs/subsystems/agent-team*` 陈旧，第二个是 `docs/config-catalog.md` 陈旧。这两个 check-only failure 均来自公开 `remoteGetTask` 后未刷新的官方生成物，不是产品 RED；其余 links/typecheck/graphs/site/i18n/Agent Note 等 30 gates 全绿。下一步仅运行失败信息指定的 `gen-cordis-catalog` 与 `gen-config-catalog`，复核 diff 后重跑 `doc-sync`。
- 2026-09-07T17:08:48+08:00：两个官方生成器均自然退出 0：`gen-cordis-catalog` 计算 97 artifacts，写入 3 份并刷新 1 个 pair record；`gen-config-catalog` 写入 1 份。复核显示 Cordis 变更只是 `remoteGetTask` JSDoc 生成到 API catalog/双语 subsystem，config catalog 只校正一处源码行号 358→364；无手改生成物或额外 schema。现在重跑完整 `doc-sync`。
- 2026-09-07T17:12:04+08:00：生成后第二次 `doc-sync` 为 31 passed / 1 failed / 0 skipped；Cordis/config catalog 、type/docs/site/links/Agent Note 等均已绿，唯一失败是官方 `gen-config-catalog` 改写英文生成页的 source line 后，`docs/config-catalog.i18n.yaml` 尚未重录。这是生成后 pair sidecar 顺序问题，非产品 RED；现用官方 pairing writer 精确重录该 pair，再复跑。
- 2026-09-07T17:15:20+08:00：官方 pairing writer 重录 `docs/config-catalog` pair 后，第三次完整 `pnpm run doc-sync` 自然退出 0：32 passed / 0 failed / 0 skipped（138.10s）。Doc typecheck、type equivalence、Cordis/config/client/tool/persistence catalogs、双语 pairing、Agent Note、links/site 等全绿。下一步补跑最新 SVG/English UI 的 Client production build、built e2e 与 `git diff --check`，然后审核精确 diff 并提交 #34。
- 2026-09-07T17:18:01+08:00：最新 Client production build 自然退出 0，built e2e 1 file / 1 test 通过，`git diff --check` 退出 0。但提交前自审发现 pan 原测试将 pointerdown 直接发到外层，未覆盖真实大画布的子层 target；将同一公开测试改为从真实 edge/canvas 子层冒泡后，focused 精确为 1 failed / 25 skipped，失败为期望 pan-x 35、实际 0。这是现有 `event.target !== currentTarget` guard 使大图需要平移时无法从画布开始拖动的真实产品 RED；下一步只拒绝 task button target，允许非交互子层开始 pan，然后重跑同 focused 与 owning suites/build。
- 2026-09-07T17:19:12+08:00：#34 真实 canvas pan GREEN：同一 focused 测试 1 passed / 25 skipped。`beginGraphPan` 现在仅当事件来自 task button 时拒绝，SVG/canvas 非交互子层可在外层 viewport 上安全建立 pointer capture；既保留节点选择，也使需要平移的大图可真实拖动。因 gate 后发生了这一产品/测试修正，现立即重跑 owning suites 与 Client build，不沿用旧结果。
- 2026-09-07T17:20:52+08:00：真实 canvas pan 修正后最终 owning 验证全绿：常规 3 files / 92 tests passed，`pnpm build:lib:client` 自然退出 0 且 production Agent Team Client bundle 完成，built-LIB e2e 1 file / 1 test passed，`git diff --check` 退出 0。结合已通过的 `doc-sync` 32/0，#34 Harness 源码、生成 Remote、owner UI/Slot、英中文与 docs gates 已满足提交条件；下一步审核精确 staged files 并形成独立 `(#34)` Harness commit。
- 2026-09-07T17:22:06+08:00：#34 Harness 独立提交已形成：`709f96c5a16ff3e34c385ba79f45dd4435d8418c` (`feat: share task detail with dependency graph (#34)`)，22 个预期源码/测试/直接 owner docs/官方生成文件，pre-commit translation pairing/lint/whitespace/vendor guards 全绿。Harness 工作树已 clean；现将新维护分支 `fix/ultra-34-36-task-dag-live` push 并核对 remote SHA。
- 2026-09-07T17:24:46+08:00：Harness push 异常：`origin` 为 SSH upstream，首次 `git push -u origin fix/ultra-34-36-task-dag-live` 在 `git-receive-pack` 无输出挂起 86s，已只终止该本地 push 进程；随后 HTTPS `ls-remote` 确认远端尚无该分支。用当前 `benz-ai-x` HTTPS 身份精确 push 到 `deepseek-ai/deepseek-harness` 返回 403 无 upstream 写权。本地 commit 与 clean 状态未受影响；现只读审计已配置 remote/当前账号 fork，不更改历史或覆盖旧分支。
- 2026-09-07T17:26:19+08:00：审计确认旧 #26–#33 维护分支均跟踪已配置 fork remote `ultra` (`benz-ai-x/deepseek-harness_x`)，当前账号对该 fork 为 ADMIN。用临时 HTTPS URL rewrite 将新分支 push 到 `ultra` 成功，pre-push Host + Client typecheck 通过；HTTPS `ls-remote` 回读为精确 `709f96c5a16ff3e34c385ba79f45dd4435d8418c`，本地跟踪 `ultra/fix/ultra-34-36-task-dag-live` 且 0 ahead / 0 behind，Harness clean。下一步在 Ultra 以该精确 clean SHA 更新 lock/docs digest，prepare/install/build 后建立 packed production UI RED。
- 2026-09-07T17:28:19+08:00：Ultra reference lock 已指向精确 Harness `709f96c5a16ff3e34c385ba79f45dd4435d8418c`，docs digest `09c3afac913fa2a8e708b57014421f9fe4b618f964bbd7fddd9a43e45298a39f`。`DSH_HARNESS_ROOT=/root/workspace/deepseek-harness-ultra-29 pnpm prepare:harness` 自然退出 0，回显 repository/version/commit/digest 全部精确匹配且 Harness clean。下一步按契约运行 `pnpm install` 和 Ultra build，再以 packed production renderer 建立 #34 验收 RED。
- 2026-09-07T17:29:14+08:00：Ultra `pnpm install` 自然退出 0（workspace already up to date）；紧接的首次 `pnpm build` 在进入 Ultra TypeScript 前被 source freshness guard 拒绝，唯一类错误是 Harness Agent Team Client 的 built `types` mtime 早于 source（同一 package 由 3 个 Ultra link 报告）。这是 Harness commit/pre-push staged lint 后的忽略生成物 freshness 问题，非产品 RED；commit/digest/clean 证明仍通过。下一步只在精确 Harness SHA 上复跑官方 `build:lib:client` 刷新 types，再重跑同一 Ultra build。
- 2026-09-07T17:30:29+08:00：Harness `build:lib:client` 再次自然退出 0，但 Ultra build 仍以同样 3 条 root `types` freshness 失败。只读 mtime 定位为：Client 源码 `TeamAction.tsx` 为 09:18:53Z，production `lib/index.js` 已刷到 09:29:54Z，但不变的惰性 root declaration `lib/types/index.d.ts` 仍为 2026-09-06 23:57:14Z；增量 `tsc -b` 判定内容无需 emit，而 Ultra guard 按整包最新 `src` 对每个 root entry 检查 mtime。这是官方增量声明生成与 freshness guard 的环境差异，非产品 RED；下一步用 TypeScript 官方 `tsc -b tsconfig.client.json --force` 强制刷新忽略声明生成物，不手改 artifact，再重跑。
- 2026-09-07T17:33:36+08:00：Harness 官方 `tsc -b tsconfig.client.json --force` 自然退出 0，root/client declaration 均刷新到 source 之后；第三次 Ultra `pnpm build` 自然退出 0，Host/Client、Ultra Typert Host+Remote（精确 against `709f96c5…`）、Codex/Claude/domain/profile 与 production UI bundle 全绿。随后 `pnpm context:check:strict` 通过 582 checks / 0 warnings，确认 exact commit/digest/clean/fresh links。下一步在 Ultra packed production probe 中先建立 #34 真实 renderer→generated Remote→Host 任务 list/DAG RED。
- 2026-09-07T17:44:35+08:00：#34 packed probe 已落盘到现有 `probe-packed-message-center.mjs` 真实 production renderer→公开 Team owner Slot→generated Remote→Host/JSONL seam：Host 用权威 API 创建 `task-1` 与依赖它的 `task-2`，探针要求真实 id/箭头方向、共享 selection/detail/旧控件、layout/zoom/keyboard/list/filter/hidden-dependency/readiness。首次以 9 月 5 旧 archive Team Client 执行在任务断言之前就因旧 bundle 无当前 child Slot 而报 `packed Team owner/message entries are missing`，且 legacy 失败清理超过 25s 被有界终止（exit 124）；这是基线不兼容/测试编排问题，不计产品 RED。现将 message child 检查延迟到 task DAG 断言之后，使同一旧 production owner bundle 真正到达缺失 DAG 的首个公开行为点；未获得有效 RED 前不运行 GREEN gate。
- 2026-09-07T17:46:15+08:00：#34 packed production UI 有效 RED 已精确复现：同一探针以 9 月 5 旧 Team Client archive + 当前 production Ultra child/Host 执行，exit 1；真实 Host `task-1`/`task-2` 已经通过 generated Remote 进入公开 Team owner 面板，DOM 明确显示两个平铺 article、真实 id、Pending/Ready/Blocked 及原 Edit/Delete/Owner 控件；首个失败为找不到可选中的 `button[aria-label="task-2 · Publish packed dependency graph"]`，因而尚不可共享 selection/detail 或进入 DAG。这是旧 production renderer 对已成功读到的权威任务事实缺公开 UI 行为，不是 fixture/编译/编排问题。下一步立即用已锁定 `709f96c5…` 的当前源码运行完整 `pnpm verify:pack` 重打八 archive 并取得同一探针 GREEN。
- 2026-09-07T17:48:18+08:00：#34 packed production UI GREEN：完整 `pnpm verify:pack` 自然退出 0。官方重打并安装 8 archive 后，同一探针在 actual production renderer + 公开 Team owner/child Slot + generated Remote + 真实 Host/AgentLoop/JSONL 上通过：权威 task id、`task-1 → task-2` 可见箭头、共享 selection/detail/原 owner/Edit/Delete/create 控件、自动 layout、zoom/fit、键盘导航、list fallback、filter hidden-dependency 与不变 readiness 均 PASS；既有消息分页/丢回执/冷恢复、Web，Codex/Claude JSON+SQLite recovery/registration release 及全量 uninstall 也全绿。下一步只收口 #34 Ultra 直接 evidence/TODO/HANDOFF，跑 focused/strict/diff-check 并形成独立 `(#34)` 本地 commit，不 push。
- 2026-09-07T18:04:08+08:00：#34 Ultra 文档与候选 gate 收口完成：ADR 0025 记录同一权威 task board 的 owner UI 投影边界，acceptance evidence 将 5 条 AC 映射到 Harness/packed 真实证据；CONTEXT、PROJECT_CONTRACT、README、patch ledger、TODO 与 HANDOFF 已同步精确 `709f96c5…` / digest，并明确 #35/#36 未实现。四项验证均自然退出 0：packed probe `node --check`，9 个 changed Markdown / 100 个本地链接，`pnpm context:check:strict` 582 checks / 0 warnings，`git diff --check`。下一步只审核精确 diff/staged set 并形成 #34 Ultra 独立 commit，不 push；随后实时重读 #34 正文，仅在 5/5 仍成立时精确 patch checkbox。
- 2026-09-07T18:06:08+08:00：#34 提交前精确 diff 自审完成：用旧 archive 形成 RED 时曾临时延后 message child Slot 检查，获得有效失败点后已恢复原严格 owner+child 前置 guard，不把基线兼容绕过留入最终探针。该等价收紧后 `node --check` 与 `git diff --check` 再次 exit 0；已通过的 current archive GREEN 在 child 存在时走相同路径。现形成 Ultra #34 独立 commit。
- 2026-09-07T18:08:21+08:00：#34 Ultra 独立提交 `dfd55e07999abdf845df89be39e64bc021d86ad8`（`feat: qualify shared task dependency graph (#34)`）已形成，11 个预期 lock/probe/直接 docs/evidence 文件，未 push。提交后实时 `gh issue view 34` 确认 title/body/state 未发生外部更新，5 条 AC 仍与已验证行为逐项一致；程序只将这 5 个 `- [ ]` 改为 `- [x]`，回读 `checked=5`、除 checkbox marker 外 before/after 字节相同，GitHub `updatedAt=2026-09-07T10:08:21Z`，Issue 按 Batch PR 流程保持 OPEN。Harness #34 提交仍为已推送且 remote 精确核对的 `709f96c5a16ff3e34c385ba79f45dd4435d8418c`。下一步以 clean 工作树进入 #35 首个 dependency-selector/concurrent-draft RED，不提前开始 #36。

## AC 进度

### #33

- [x] Host 解析当前精确 Lead，确定发送者；回复绑定同 Team 真实原消息与明确接收者。
- [x] Team/发送者隔离请求 ID；同请求同输入重放原消息，改输入冲突。
- [x] 双击、提交后断网、超时和重启不新增 queued 消息。
- [x] 提交结果与 pending/delivered/unknown 分离；provider 回归投递原消息且不伪造完成。
- [x] 正式请求/回复持久格式、codec/投影/恢复；跨 Team 拒绝无持久副作用。
- [x] 中英文、失败后保留可核对草稿、真实打包 UI/Remote 证据。

### #34

- [x] 节点使用真实 Task id，边从前置任务指向依赖任务；owner、状态、claimability 与 blocker 来自同一 Host 任务状态。
- [x] 列表/图切换保留选择，节点打开同一详情及原有创建、编辑、分配/取消分配、完成、重开和删除控件。
- [x] 提供自动布局、缩放、平移、适配视野、键盘导航和列表替代；过滤显示隐藏依赖提示，不改变 readiness。
- [x] 复用现有 Team 任务 API/权限/Revision，不创建第二套状态、自动调度、文件锁或启动成员。
- [x] 通过公开 Team UI 组成同一面板，提供中英文状态文案与打包 UI 验证。

### #35

- [ ] 图与列表共用同一 Task id/expectedRevision；选取或删除依赖都由真实 Team API 校验引用、角色、自环和间接环。
- [ ] 创建 A/B/C 并令 C 依赖 A/B，只有 A/B 全部完成后 C 可认领，边和 blocker 提示同步正确。
- [ ] 两个 Client 并发编辑得到冲突和当前权威版本，旧草稿明确未保存，不自动覆盖重试。
- [ ] 删除墓碑、重开、所有权保留和过滤隐藏依赖时展示仍正确；Client 预览不视为提交。
- [ ] 过期 Lead、跨 Team 与无权限写入拒绝且无持久副作用；点选依赖具备键盘/列表替代及中英文反馈。

### #36

- [ ] 在 Team 公开变化订阅边界先建立完整 baseline，再以有界失效重新读取权威消息页/任务视图；不维护第二份持久状态。
- [ ] 处理分页/live 竞争、筛选变更、迟到页、切 Team 与服务替换；旧代际页、草稿和提交不能进入新 Team。
- [ ] 重连只恢复读取，不自动重发；避免漏页、重复消息、错误 cursor 或用 pending 状态冒充完成。
- [ ] 消息和 DAG 共用 Host 提交事实，保持空/加载/stale/disconnected/冲突/不可用及中英文文案。
- [ ] 新增 watch、Remote、locale、Slot 随 Fiber 完整释放；真实生成协议和打包 UI 覆盖竞态与卸载。

其余 issue 的逐项 AC 在对应 Batch 开工时从 GitHub 最新正文复制到本节，避免状态文件把未来可能更新的正文冒充真相。

## 调整、异常与熔断记录

- 2026-09-07：启动时发现前序流程按每 issue 单独 PR 推进，与本轮批处理规则不同；本轮只把已有 #33 WIP 纳入 Batch 1，其余按冻结批次重新规划，未重做 #27–#32。
- 2026-09-07：Batch 1 单独包含 #33，理由是持久格式、跨仓 Harness/Ultra 改动和既有 895 行 WIP已超过普通批量 review 体量，适用“特别复杂可单独”。
- 2026-09-07：Batch 3 仅含两个 L issue；若并入 Batch 2 会形成五个跨 Studio/Team/provider 的 L issue，超过一次 review 可消化上限，故记录为体量例外。
- 2026-09-07：#18 记 skipped，不关闭、不修改；这是 #44 的显式 AC，不是遗漏。
- 2026-09-07T13:43:19+08:00：Batch 1 实际新增 public `agentTeams/sendMessage` Remote 与 required persistent event/projection schema，命中“公开接口或 schema 的首个基建 PR”人工合并清单；PR #59 标记“需人工合并”。先完成隔离 review 与本地闸门，再飞书【需决策】通知并等待确认，不自动合并。
- 当前无 review 熔断、local-gate 熔断、PR blocked 或飞书待补发。

## 待下轮清单

- 启动快照后暂无新增 open issue。每次 PR 合并前重新运行 `gh issue list`，仅把新增项记录在这里，不纳入本轮。

## 下一步（唯一恢复入口）

1. 先确认 Ultra 工作树只含记录 #34 完成的第二个状态 commit，Harness 仍 clean 且跟踪 fork 精确 `709f96c5…`；不 push Ultra、不建 PR。
2. 实时重读 #35 正文，在现有 `TeamAction` 共享 selection/detail 与真实 `updateTask(expectedRevision)` seam 先建立依赖多选的公开 UI RED；不把 Client preview 当作提交。
3. 按 #35 的实际依赖顺序分别验证 A/B/C readiness、CAS 并发冲突保留草稿、循环／跨 Team／无权限／过期 Lead 无持久副作用、墓碑／重开／owner／隐藏依赖与中英文反馈；每个公开行为 RED→最小 GREEN，形成独立 `(#35)` commit 后才进入 #36。
