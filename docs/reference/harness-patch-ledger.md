# Harness 补丁清单 / Harness patch ledger

本清单对应 [Spec #18 修订 1.1](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18)
与 [#22](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/22)、
[#33](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/33)、
[#34](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/34)、
[#35](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/35)、
[#36](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/36)。中文规范中的
US-01、US-02、US-03、US-15、US-18、US-19、US-20、US-24–US-26、US-28、
US-33、US-47、US-50、US-51、US-56–US-59、US-66，D-01–D-04、D-10、
D-14–D-16、D-21、D-23、D-25，以及 T-01、T-03、T-04、T-06、T-07、
T-09、T-16、T-18 在英文版本中沿用相同编号。

The Chinese Spec is normative. Requirement identifiers above are shared by
both language versions. This ledger records maintained changes; it does not
claim that an upstream contribution was submitted or accepted.

## 固定身份 / Fixed identities

| 身份 / Identity | 固定值 / Pinned value | 意义 / Meaning |
| --- | --- | --- |
| 官方基础 / Official foundation | `76fda729799fe9b3848dbe2c211d4b231032b81e`, `0.1.2-rc.1` | 当前 fork 与较新官方基线的共同祖先 / common ancestor of the maintained fork and comparison baseline |
| 维护 fork / Maintained fork | `503ad563ff226c2afc77608c432af3a80aae3279`, `0.1.2-rc.1` | 阶段 B 持久消息、共享任务面板与 Team live watch 运行源 / Phase B persisted-message, Shared Task Panel, and Team live-watch runtime source |
| 官方对照 / Official comparison | `d347e703908d0406b7a7ef80e3a0e594d86b2215`, `0.1.3-alpha.1` | 对照及阶段 C 移植目标，当前不能直接替换 / comparison and phase C port target, currently unsupported as a replacement |
| 文档摘要 / Documentation digest | `d4028c4f143f72a99ded5c0ee39c3463c13ff258bbb70ba9ce74af0aa426e767` | 锁定文档内容 / locked documentation content |
| 扩展接口资格 / Extension API qualification | `agent-team-ultra.phase-b.message-center.v2` | Ultra 声明的组合资格标签，不冒充 Harness 导出常量 / Ultra qualification label, not a Harness export |
| Session 格式 / Session format | fork `0`; official comparison `2` | 不可只比较软件版本 / independent from package semver |
| Team 事件 / Team events | legacy `2`; native operation `4`, with explicit payload-3 message reader | 显式版本解码 / explicit versioned decoding |
| 人类消息请求 / Human message request | `1` | 必需事件原子保存请求回执、回复关联与 queued 消息 / required event atomically stores the request receipt, reply correlation, and queued message |
| Team 投影 / Team projection | `7` | fork 增加不可变请求回执及事件派生的稳定消息 queue/delivery 索引 / fork adds immutable request receipts and an event-derived stable message queue/delivery index |
| Ultra domain | `agent_team_ultra_v1`, version `1` | 独立 sidecar generation / independent sidecar generation |
| Codex wrapper / payload / protocol | `@openai/codex@0.149.1`; `0.149.1-<platform>-<arch>`; `app-server-v2` | 具体平台 payload 由 provider 的资格检查确认 / provider qualification resolves the exact platform payload |
| Claude SDK / payload / protocol | `@anthropic-ai/claude-agent-sdk@0.3.241`; Claude Code `2.1.241`; `claude-agent-sdk` | SDK 与 native 产品版本独立 / SDK and native product versions are separate |

权威机器记录为 [reference lock](../../dsh-reference.lock.json)。构建以该锁验证源码，
再生成每个运行包的公开入口和实际发货 JavaScript 摘要；安装后的检查会沿每个包自己的
Node 依赖路径验证，不能用相同 semver 或另一个包的正确依赖掩盖混用。
Source attestation and installed artifact validation are complementary: the
former identifies the source and documents; the latter verifies the actual
executable closure selected by Node. Neither proves valid native user login.

## 维护变更 / Maintained changes

提交链接固定到维护仓库。下列变更尚未被本清单证明已合入官方仓库；阶段 C 按
[#39](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/39) 重新移植和验证，
不把“有类似 API”当作格式兼容证明。

| 提交 / Commit | 用途与公开契约 / Purpose and public contract | 格式影响 / Format impact | 验证 / Verification | 上游状态 / Upstream disposition |
| --- | --- | --- | --- | --- |
| [a1763182b2](https://github.com/benz-ai-x/deepseek-harness_x/commit/a1763182b2) | 固定 teammate 请求及解析后的模型路由 / pin requested and resolved teammate routes | Team member 增加路由字段 / member route fields | `agent-team/tests/team.spec.ts`; Ultra pinned-route integration | maintained; official comparison lacks these fields |
| [9b76fa2282](https://github.com/benz-ai-x/deepseek-harness_x/commit/9b76fa2282), [a38141f78a](https://github.com/benz-ai-x/deepseek-harness_x/commit/a38141f78a) | 初始工作持久接受后转移取消所有权 / transfer cancellation ownership after initial-work durability | 无新版本号；影响 accepted 边界 / acceptance semantics | `agent-team/tests/team.spec.ts`; Ultra launch workflow integration | maintained; preserve during port |
| [ba8b9fc4ea](https://github.com/benz-ai-x/deepseek-harness_x/commit/ba8b9fc4ea) | durable external runtime provider 与 create/resume/deliver/interrupt/dispose / durable provider lifecycle | Team member external runtime、native handle、native turn receipt | `agent-team/tests/teammate-runtime.spec.ts`, `projection-events.spec.ts` | maintained; absent from official comparison |
| [655d53bf4e](https://github.com/benz-ai-x/deepseek-harness_x/commit/655d53bf4e) | Codex App Server 产品适配 / Codex product adapter | provider-owned runtime metadata and evidence | Ultra `packages/codex/tests`; `verify:codex-upgrade` (Loader, Remote, JSON/SQLite); authenticated canary remains #44 | moved to Ultra `packages/codex` / `@benz-ai-x/dsh-agent-team-codex` in #23; no upstream acceptance claimed |
| [19c4e08761](https://github.com/benz-ai-x/deepseek-harness_x/commit/19c4e08761) | Claude Code SDK 产品适配 / Claude Code product adapter | provider-owned runtime metadata and evidence | Ultra `packages/claude-code/tests`; `verify:claude-upgrade` (Loader, Remote, JSON/SQLite); authenticated canary remains #44 | moved to Ultra `packages/claude-code` / `@benz-ai-x/dsh-agent-team-claude-code` in #24; no upstream acceptance claimed |
| [5dd31c6454](https://github.com/benz-ai-x/deepseek-harness_x/commit/5dd31c6454) | 按精确 native turn 读取有界证据 / bounded exact-turn evidence | native turn / evidence identities and payloads | runtime provider suites; Ultra run evidence suite | maintained; provider-neutral Host contract stays in Harness |
| [03726d7baa](https://github.com/benz-ai-x/deepseek-harness_x/commit/03726d7baa) | 精确调用审批证据与 correlation / exact-call approval evidence | native approval and tool-call evidence | provider suites; Ultra evaluation and run evidence suites | maintained; stock approval authority is reused |
| [66c46893a6](https://github.com/benz-ai-x/deepseek-harness_x/commit/66c46893a6) | 不入 Team roster 的隔离评测 runtime / isolated evaluation runtime outside production roster | evaluation handle and terminal result contracts | `teammate-runtime.spec.ts`; Ultra evaluation suite | maintained; Profile and gate policy remain Ultra-owned |
| [4b60986f8c](https://github.com/benz-ai-x/deepseek-harness_x/commit/4b60986f8c) | 扩展与当时 Harness 合约对齐 / align extensions with then-current Harness contracts | 以固定 schema 与产物为准 / fixed schemas and artifacts remain authoritative | Agent Team package suites and complete Ultra archive verification | maintained compatibility adjustment |
| [f9e8a4d0fc](https://github.com/benz-ai-x/deepseek-harness_x/commit/f9e8a4d0fc), [8b4bae0b62](https://github.com/benz-ai-x/deepseek-harness_x/commit/8b4bae0b62) | catalog owner 控制的 provider generation 注册 / catalog-owner registration | 无持久 schema 变化 / no durable schema change | `runtime-provider-mount.spec.ts`; both adapter Loader suites; [ADR 0013](../adr/0013-route-durable-runtimes-through-the-catalog-owner.md) | maintained; disposal precedes native resource cleanup |
| [fdfdbaeb0e](https://github.com/benz-ai-x/deepseek-harness_x/commit/fdfdbaeb0e7d06f3e2103fe2721639c115eb8dc3) | Team 所有者签发可撤销成员 grant；三项真实 roster/task 查询 / revocable member authority and three canonical reads | 无新增持久字段／版本 / no durable format change | `native-member-operations.spec.ts`, `native-member-loader.e2e.ts`, built `snapshots/session/agent-team-profile` recorded queries; branded `TeamTaskId` cursor and exact ASCII/multibyte UTF-8 request/result limits; Ultra Codex query integration and installed JSON/SQLite recovery; [ADR 0017](../adr/0017-authorize-native-team-member-queries.md) | maintained branch `fix/ultra-26-native-team-queries`; four affected source files pass 100% scoped coverage; build, Loader, docs and lint validated |
| [9649602da9](https://github.com/benz-ai-x/deepseek-harness_x/commit/9649602da984ff1f3aeb8f3b30dc4ad0d6d32391) | native 消息及终止结算与回执原子提交 / atomic native message and terminal-settlement receipts | required payload 3 event; Team checkpoint 4; explicit legacy payload 2 readers | Team scoped 199 tests / 100% coverage; Loader and recorded replay; Ultra Codex message/restart tests; [ADR 0018](../adr/0018-persist-native-team-message-receipts.md) | maintained branch `fix/ultra-27-native-team-messages`; authenticated product acceptance remains #44 |
| [7d1b82bfd9](https://github.com/benz-ai-x/deepseek-harness_x/commit/7d1b82bfd9c5e1a2384b8fb7cd806bf703f8c953) | inactive native 成员投递前恢复身份并重新授权 / reauthorize inactive native members before delivery | no format change | 196 owning tests; product source 100% coverage; TypeScript SDK and packaged Python SDK receipt replay | same maintained branch and source lock |
| [7efa653185](https://github.com/benz-ai-x/deepseek-harness_x/commit/7efa653185a9986a46f52727f49a70d2c147a659) | native 任务变更与原回执原子提交，复用任务规则与等待 / atomic task receipts, shared task transitions and activity observation | required payload 4 message/task variants; Team checkpoint 5; explicit payload-3 message and payload-2 readers | 222 owning tests / 100% product-source coverage; built Loader; TS SDK and actual single-executable Python SDK replay; full lint and 32 doc-sync gates; [ADR 0019](../adr/0019-persist-native-task-operation-receipts.md) | maintained branch `fix/ultra-28-native-task-operations`; Ultra integration and authenticated #44 acceptance are separate |
| [d02bfcdf13](https://github.com/benz-ai-x/deepseek-harness_x/commit/d02bfcdf13171e1167ece7b4ea29938900678de9) | 注册目录接受任务／等待声明 / admit declared task and wait operations | no format change | registration RED/GREEN, 222 owning tests / 100% product-source coverage and real Loader with all six declared operations; Ultra Codex #28 and Claude #30 integrations | same maintained branch; follows the atomic task implementation |
| [7119c51c8d](https://github.com/benz-ai-x/deepseek-harness_x/commit/7119c51c8d09ac56370e884e492c66a102c779af) | 共享任务诊断适配所有调用者 / caller-neutral shared task diagnostics | no format change | DSH/native error correction RED/GREEN; 224 owning tests / 100% business-source coverage, Host build and real Loader | same maintained branch; PR #54 Standards follow-up |
| [b85ebb3fca](https://github.com/benz-ai-x/deepseek-harness_x/commit/b85ebb3fca3da0c735cfed0b4532f926a4221e24) | 当前 grant 下读取精确成员的 launch、入站 delivery 与已提交 settlement，供 provider 冷恢复对账 / grant-bound Host recovery facts for provider reconciliation | no format change; existing launch/message/receipt facts only | 229 owning tests; four changed runtime files at 100% scoped coverage; build, Loader, generated catalog, docs and lint; Ultra Claude public-history JSON/SQLite recovery and Run evidence; [ADR 0020](../adr/0020-authorize-claude-team-tools.md) | maintained branch `fix/ultra-29-native-recovery-reader`; Host-only operation is not advertised as a model tool |
| [a1342a76f5](https://github.com/benz-ai-x/deepseek-harness_x/commit/a1342a76f53fce70f5bae95cad435557d46d1411) | exact live Lead 的持久消息 metadata 分页、筛选和按需安全正文，并发布 Team owner child Slot / persisted-message metadata paging, filtering, safe on-demand content, and a Team-owner child Slot for the exact live Lead | projection 6 adds queue/delivery sequence/time index; no event or native payload change | 269 Agent Team/Client regressions; message reader at 100% scoped coverage; built-library Remote test; keyless Session replay; real browser composition; build, generated catalogs, 32 doc gates and lint; [ADR 0023](../adr/0023-compose-persisted-team-message-reads.md) | maintained branch `fix/ultra-32-team-message-read`; #33 owns writes and #36 owns live subscription |
| [eea13874ce](https://github.com/benz-ai-x/deepseek-harness_x/commit/eea13874ce), [c2940ac503](https://github.com/benz-ai-x/deepseek-harness_x/commit/c2940ac5039b744f962d2b264c03a6e9fb33af07) | 在 flush 前固定已提交读取上界、让 Team 清理等待已接纳读取，并由 renderer 注入 owner selector hook；补全 pending-read 快照契约 / capture the committed read cutoff before flush, settle accepted reads during Team disposal, bind the owner selector hook through the renderer, and document pending-read snapshots | no format change; projection remains 6 and Session/event/native-operation versions remain fixed | 271 Agent Team/Client regressions; nine reader tests with 100% scoped coverage; cutoff-race and disposal RED/GREEN; built-library Remote; 32 doc gates; Ultra installed-bundle renderer/Remote/Host/recovery gate | same maintained branch; post-review hardening, with no upstream acceptance claimed |
| [d1d6b8a3e1](https://github.com/benz-ai-x/deepseek-harness_x/commit/d1d6b8a3e16c668e742f47a92297a0de0a20570f) | 精确 live Lead 通过 Team owner `submitMessage` 与 generated `agentTeams/sendMessage` 提交明确接收者、字面正文和可选同 Team 回复；`(Team, sender, request id)` 的同输入重放原结果，变更输入冲突；durable acceptance 后由 Team 生命周期拥有原消息投递 / exact live Lead submits an explicit recipient, literal body, and optional same-Team reply through Team-owned `submitMessage` and generated `agentTeams/sendMessage`; `(Team, sender, request id)` replays identical input and conflicts on changed input; Team lifecycle owns delivery after durable acceptance | required `team/message/request-committed@1`; projection 7 retains immutable receipts and reply correlation; Session 0, base Team event 2, and native operation 4 remain fixed; legacy reads rebuild and future formats fail closed | 376 package tests plus 186 owning tests; public Remote cancellation/acceptance barrier, replay/conflict, cross-Team no-effect, JSONL restart/provider recovery, built-library Remote, Host/Client/docs/type gates; Ultra packed production renderer/generated Remote plus Loader/AgentLoop/Team/JSONL controlled-provider recovery and required-fact negative controls pass; authenticated canary remains #44 | maintained branch `fix/ultra-33-team-message-send`; no upstream acceptance claimed |
| [d2d870fbe4](https://github.com/benz-ai-x/deepseek-harness_x/commit/d2d870fbe40bc0e968abdac854a3aae495162bec) | 为人类消息请求补齐 keyless recorded Session，以及 TypeScript／Python SDK 对 `team/message/request-committed@1` 与同 Team reply 关联的双侧投影 / add a keyless recorded Session and paired TypeScript/Python SDK projections for `team/message/request-committed@1` and same-Team reply correlation | no format change; request format 1 and projection 7 remain fixed | official TS snapshot refresh/replay; Python single-executable refresh/replay; 376 Agent Team tests; typecheck, documentation, Agent Note, pairing, whitespace and push gates | same maintained branch; PR #59 review-round-1 evidence hardening, with no upstream acceptance claimed |
| [709f96c5a1](https://github.com/benz-ai-x/deepseek-harness_x/commit/709f96c5a16ff3e34c385ba79f45dd4435d8418c) | 公开 Team owner 面板从同一权威 task view 投影列表、依赖图与共享详情；generated `agentTeams/getTask` 委托现有 Host 任务板 / project list, dependency graph, and shared detail from one authoritative task view in the public Team owner panel; generated `agentTeams/getTask` delegates to the existing Host task board | no format change; task events, projection 7, Session 0, message request 1, and native operation 4 remain fixed | 3 owner files / 92 tests; built Remote 1/1; Client production build; 32 doc gates; installed eight-archive renderer/Remote/Host task DAG and recovery probe; [ADR 0025](../adr/0025-project-one-authoritative-task-board-into-list-and-graph.md) | maintained branch `fix/ultra-34-36-task-dag-live`; no upstream acceptance claimed |
| [75c23c47e7](https://github.com/benz-ai-x/deepseek-harness_x/commit/75c23c47e7f25ebd30fcd313e9774562fb46c003) | 原生 task-id checkbox 与同一 `edit` CAS 原子提交正文、scope 和完整依赖；冲突重读权威版本并保留明确未保存的 Client 草稿，不自动覆盖重试 / native task-id checkboxes and one `edit` CAS atomically submit text, scope, and complete dependencies; conflicts reload authority while retaining an explicit unsaved Client draft without automatic overwrite retries | no format or new Remote change; existing task events, graph validation, revision, projection 7, Session 0, message request 1, and native operation 4 remain fixed | Host/UI/Slot 3 files / 96 tests; built-library Remote 1/1; isolated Agent Team recorded replay; type/docs gates; installed production renderer/generated Remote/Host dependency edit and bilingual stale-CAS negative controls; [ADR 0025](../adr/0025-project-one-authoritative-task-board-into-list-and-graph.md) | same maintained branch; no upstream acceptance claimed |
| [d863030852](https://github.com/benz-ai-x/deepseek-harness_x/commit/d8630308520c028e8ae4511a2c0476c5967ced89) | exact live Lead 打开公开 `agentTeams/watch` stream 时先取得完整权威 `TeamView` baseline；消息或任务 durable commit 只合并为有界 invalidation，Client 再读既有权威页／视图，断线不重发 / exact live Lead opens a public `agentTeams/watch` stream with a complete authoritative `TeamView` baseline; durable message or task commits coalesce into bounded invalidation so Clients reread existing authoritative pages/views without resending after disconnect | no persistent format change; projection 7, Session 0, Team event 2, message request 1, and native operation 4 remain fixed | Host/UI/Slot 3 files / 101 tests; generated stream descriptor e2e; 435 type-equivalence blocks; 15 docs gates; service-generation, stale, bilingual conflict, cancellation and Fiber-disposal negative controls | same maintained branch; no upstream acceptance claimed |
| [aa05b41e66](https://github.com/benz-ai-x/deepseek-harness_x/commit/aa05b41e66), [b91c45098a](https://github.com/benz-ai-x/deepseek-harness_x/commit/b91c45098a) | 把共享 task list/DAG 迁入正式 keyless Web snapshot corpus，并让过滤后的键盘导航只选择可见节点 / record the shared task list/DAG in the official keyless Web snapshot corpus and keep filtered keyboard navigation on visible nodes | no format change | focused Web replay 3/3; snapshot corpus 2/2; filtered graph keyboard RED/GREEN | same maintained branch; PR #60 review-round-1 hardening |
| [945feb92c0](https://github.com/benz-ai-x/deepseek-harness_x/commit/945feb92c0) | 开始编辑时钉住 task revision，并在 conflict reload/watch 竞态中保留明确未保存草稿 / pin the task revision when editing starts and retain the explicit unsaved draft across conflict reload/watch races | no format change | two-Client watch/CAS and reverse-race RED/GREEN; TeamAction 34/34 | same maintained branch; PR #60 review-round-1 hardening |
| [41291bc977](https://github.com/benz-ai-x/deepseek-harness_x/commit/41291bc9779ba954b774880c634fe90c9945b966) | 生成公开 watch catalog，并以 in-flight/dirty queue 有界串行权威 task 读取；统一中文 stale 术语 / generate the public watch catalog, serialize authoritative task reads with a bounded in-flight/dirty queue, and normalize Chinese stale terminology | no persistent format change; public watch contract unchanged | catalog 97/97; burst barrier RED/GREEN; Host 60/60; TeamAction 34/34; browser mount 10/10; docs/type/lint gates | same maintained branch; PR #60 review-round-1 hardening |
| [07bbff8a1f](https://github.com/benz-ai-x/deepseek-harness_x/commit/07bbff8a1f785cc9acbf57460d8aff9d90a3c5d3), [40e833393c](https://github.com/benz-ai-x/deepseek-harness_x/commit/40e833393c) | 让production Team面板消费generated `getTask`，权威list删除选中任务后保留相同id并读取只读墓碑；正式刷新Client catalog / consume generated `getTask` in the production Team panel, retain the selected id after authoritative list deletion, and read its tombstone as a read-only detail; refresh the Client catalog formally | no persistent format change; existing public `getTask` gains its current consumer | deletion/team-generation RED/GREEN; TeamAction 36/36; browser/generated mount 13/13; Client catalog generator/verification | same maintained branch; PR #60 review-round-2 hardening |
| [443791f7da](https://github.com/benz-ai-x/deepseek-harness_x/commit/443791f7da) | 按现行neutral-token gate修正Team面板hairline border / align the Team panel hairline border with the current neutral-token gate | no contract or format change | elevation 7/7; full GUI 283 files, 3925 passed, 1 skipped | same maintained branch; PR #60 review-round-2 standards hardening |
| [503ad563ff](https://github.com/benz-ai-x/deepseek-harness_x/commit/503ad563ff226c2afc77608c432af3a80aae3279) | 将所有live/replaced Team watch control所有权上移到Client context/Fiber；React cleanup立即触发幂等释放，生命周期等待Remote stream真正静止 / move ownership of all live and replaced Team watch controls to the Client context/Fiber; React cleanup triggers idempotent disposal immediately while lifecycle teardown awaits Remote-stream quiescence | no persistent or public API change | deferred transport, disposal-failure and service-generation RED/GREEN; TeamAction+browser 49/49; doc-sync 32/32; formal generated and type gates | same maintained branch; PR #60 review-round-2 hardening |

表中列出可重跑的测试责任，不表示本次运行了每个上游测试或真实产品 canary。
The test column identifies validation owners, not a claim that all those suites
or authenticated native canaries ran in this change. Final real native product
acceptance remains mandatory in [#44](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/44).

## 迁移方案 / Migration plan

[#25](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/25) 的
[ADR 0016](../adr/0016-audit-and-plan-format-aware-migration.md) 与
`pnpm migration:audit` 区分当前源格式和未来目标资格。阶段 C 方案为 Session `2`、
Team payload `3`、projection `4`；descriptor `3` 在固定双方源码中一致，Ultra v1
继续使用。native operation、发送请求和回复关联必须进入正式 schema、codec、
生成事件词汇及投影；没有已产生的目标提交前，审计报告明确标为尚未取得运行资格。
阶段 A 审计不改运行锁；阶段 B 按 [ADR 0017](../adr/0017-authorize-native-team-member-queries.md) 为成员查询扩展更新锁，不提前执行阶段 C 格式迁移。

The audit preserves source bytes, checks real Session projections plus JSON and
SQLite snapshots, and reports deterministic v0/v1 retry conflicts. The accepted
format plan is implemented in Phase C, with pending-target writes closed until
the final completion marker. Package ownership moves alone require no new Ultra
generation and provide no permission for dual writing.

## 共用行为探针 / Shared behavior probe

对分别构建的两个源码目录运行同一个脚本：

```sh
node scripts/probe-team-contract.mjs /absolute/path/to/locked-fork
node scripts/probe-team-contract.mjs /absolute/path/to/official-d347e7
```

The probe mounts real AgentLoop, Team, Session and JSONL persistence services.
Only the external model boundary uses a controlled adapter. It checks exact
live roles, Lead-only spawning, permanent names, task CAS, DAG cycles,
ownership, tombstones, change notification, wait cancellation, durable receipt
before delivery acknowledgement, and Fiber disposal through public APIs.
Passing these common contracts does not admit the official build as an Ultra
runtime: extensions and persistent formats still differ.

Node 22.22.1 的官方冻结安装成功，但默认 Host bundler 缺少 `unrun`；`tsx`
加载也失败。使用 Node 24.11.1 的原生配置加载完成同一干净源码的 Host bundle，
运行探针仍使用安装原生依赖时的 Node 22，避免 `fs-ext` 的 ABI 混用。
These are explicit build-environment conditions, not source or dependency-lock
changes. The maintained fork remains on its existing locked build.
