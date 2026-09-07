# Open Issues 批处理状态

最后更新：2026-09-07T15:10:30+08:00（Asia/Shanghai）

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
| #33 | 从消息中心幂等发送和关联回复 | Harness Team mailbox/format；Ultra Remote/UI | L | #27、#32（均 closed） | in-review（Batch 1；第 1 轮修复已验证，待双轴复审） |
| #34 | 让共享任务列表和 DAG 共用任务详情 | Harness Team UI；task projection | L | #25（closed） | planned（Batch 2） |
| #35 | 点选任务依赖并保留并发冲突草稿 | Team task API；DAG UI | L | #34 | planned（Batch 2） |
| #36 | 让消息中心与 DAG 实时刷新并正确重连 | Team watch/Remote/UI lifecycle | L | #33、#35 | planned（Batch 2） |
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
| Batch 1 | #33 | `feat/batch-1-message-send-reply` | 单项特别复杂：跨 Ultra/Harness、引入必需持久事件/codec/投影，且接手时已有未提交 #33 WIP；独立 PR 控制 review 体量 | in-review；需人工合并 | 1 | 0 | [#59](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/59) |
| Batch 2 | #34、#35、#36 | `feat/batch-2-task-dag-live` | 同一公开 Team 面板、task id/revision 与 watch 契约；依序 #34 → #35 → #36 | planned | 0 | 0 | 未创建 |
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

## AC 进度

### #33

- [x] Host 解析当前精确 Lead，确定发送者；回复绑定同 Team 真实原消息与明确接收者。
- [x] Team/发送者隔离请求 ID；同请求同输入重放原消息，改输入冲突。
- [x] 双击、提交后断网、超时和重启不新增 queued 消息。
- [x] 提交结果与 pending/delivered/unknown 分离；provider 回归投递原消息且不伪造完成。
- [x] 正式请求/回复持久格式、codec/投影/恢复；跨 Team 拒绝无持久副作用。
- [x] 中英文、失败后保留可核对草稿、真实打包 UI/Remote 证据。

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

1. 第 1 轮两个 high 与三个 medium 已按 TDD 修复并完成 Harness push、Ultra focused/packed/full 验证；Ultra review-fix 以当前本地提交落盘但不 push。
2. 主 agent 对新的精确 Ultra HEAD 重跑 Standards／Spec 两个全新隔离 review 轴；任何 blocking/high 继续修复并使 review 轮数 +1，连续第 3 轮不通过才熔断。
3. 无 blocking/high finding 后再 fetch main，若未前进则执行独立完整 `pnpm verify` local gate；通过后发送飞书【需决策】人工合并通知并等待确认。不得自动合并，也不得在 #33 合并关闭前开始 #34。
