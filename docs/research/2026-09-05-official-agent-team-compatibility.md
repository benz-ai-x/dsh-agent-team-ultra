# 官方 Agent Team 与 Ultra 兼容性核验

核验日期：2026-09-05。结论：**Ultra 在锁定的 Harness fork 上通过当前验证，但不能直接替换为官方 master；扩展后的团队记录也不能直接交给官方 Team 投影回放。** 普通 DSH 队友的权限、消息、任务与状态规则基本保持官方语义。Codex／Claude Code 成员具有额外的能力限制，不能据此宣称与官方 DSH 队友完全等价。

本报告只新增研究记录和复现样例，没有修改插件实现、切换运行中的应用或迁移用户会话。

**对标基线与证据范围**

| 对象 | 精确基线 |
| --- | --- |
| 官方文档 | 用户指定的 [Agent Team 中文文档](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/docs/subsystems/agent-team.zh.md)，并追踪其 README、类型、roster、mailbox、投影、生命周期及相关 Session 源码 |
| 官方源码 | `deepseek-ai/deepseek-harness`，`master` 在核验时为 `d347e703908d0406b7a7ef80e3a0e594d86b2215`，版本 `0.1.3-alpha.1` |
| Ultra 所需 Harness | `benz-ai-x/deepseek-harness_x`，`8b4bae0b620cc89a987a3ec6dd8b0b7d9025649a`，版本 `0.1.2-rc.1`，以 [reference lock](../../dsh-reference.lock.json) 为准 |
| Ultra | `c12a3b7` 基础上的当前工作区，包含本次会话已完成的 `@benz-ai-x` 包名变更 |
| 执行环境 | macOS、Node `v26.4.0`；官方与锁定 fork 分别使用独立目录，编译和回放证据固定到上述提交 |

最初主工作目录的严格检查有 5 项失败：相邻 Harness 的版本、提交、文档摘要与锁不符，以及两个 native runtime 包不存在。核验期间该相邻 checkout 又发生外部切换，因此最终官方编译与模块加载结果均在新建的、固定 `d347e70390` 的隔离目录重做。没有使用移动中的 checkout 作为最终对标依据。

**规则对照**

| 维度 | 官方规则 | Ultra 的实际实现 | 判定 |
| --- | --- | --- | --- |
| Team 身份与权限 | Root Session 对应隐式 Team；敏感操作要求精确存活的 Agent；只有 Lead 创建／中断队友 | Host 检查 `agents.get(caller.id) === caller` 并核对 Lead 身份；Remote 的 Session id 只用于解析调用者 | 对齐；Ultra 档案目录仅允许 Lead 访问，权限更窄 |
| roster 与状态 | 名称永久保留；`provisioning → active / failed`；运行状态另行派生 | Binding 由权威 roster 修复，Provisioning Phase 与 Runtime Availability／Presence 分开 | 普通 DSH 队友对齐；external 分支扩展了身份模型 |
| 消息 | 先入 Lead 日志并 flush，再投递；`send_message` 使用 Steer；`wait_agent` 不唤醒成员 | DSH 分支复用 Team mailbox；external 分支增加 native handle 投递和回执 | DSH 分支对齐；external 不具备完整的成员反向通信工具 |
| 共享任务 | 任务完整快照、CAS、DAG、删除墓碑；writeScopes 是提示，不是锁 | Ultra 没有另建任务板或接管任务真相 | 对齐 |
| 工作区 | 同一工作区；无自动 worktree、文件锁、跨 Host 团队、自动释放任务所有权 | 项目契约保留这些限制 | 对齐；外部进程并不等于跨 Host Team |
| 工具冲突 | Team profile 禁用同名全局 subagent 控制工具 | Ultra profile 使用相同禁用项及 one-shot 配置 | 对齐；实际 profile 测试通过 |
| 档案与记忆 | 官方 Team 本身没有 Ultra 的档案版本、激活、回滚与评测门禁 | 独立 `agent_team_ultra_v1` storage domain；在精确 child scope 安装不可变 Profile | 合理扩展，不应把这些侧存储当作 Team roster 的替代 |
| 模型选择 | 官方 `SpawnTeammateRequest` 没有 `agentOptions` 路由入口 | Ultra 要求固定 provider／model／reasoning，并校验 requested／resolved route | 依赖 fork，不能直接接官方 API |
| Client／Remote | Host 掌握状态，Client 消费生成协议 | 使用 Typert、完整快照流、浏览器安全类型与 Client Slot | 未发现额外的直接设计冲突；官方 Host 加载被阻断，未宣称完成官方环境的 UI 端到端验证 |
| 取消与卸载 | 官方 roster 持有创建期间的组合取消信号；清理等待有超时上限 | fork 明确在初始工作持久接受后转移取消权；清理超时变为发送 abort 后继续等待 | 有意改变的运行时语义，见下文 |

权限和恢复的 Ultra 证据见 [Host 服务](../../packages/domain/src/index.ts) 的 `leadAuthorityFailure`、`reconcileTeam`、`loadOwnSessionEvents`、`installProfileCapabilities`，以及 [真实路由／冷恢复集成测试](../../packages/domain/tests/pinned-route.integration.spec.ts)。工具配置见 [profile patch](../../packages/profile/cordis.patch.yml)。

**1. 高：官方包不能加载当前 Ultra Host，已复现**

Ultra 入口直接导入 `TeammateEvaluationId`、`TeammateLaunchRequestId` 和 `TeammateRuntimeError`，并调用 `registerTeammateRuntimeProvider`、`readTeammateRuntimeEvidence`、`runTeammateEvaluation`。它的 DSH 创建请求携带 `agentOptions`，external 请求携带 `runtime`。这些都是锁定 fork 的扩展；[官方请求类型](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/experimental/agent-team/src/types.ts#L144)没有这些字段，官方 TeamService 也没有上述新增方法。

在从精确官方提交安装并构建 Host 后，使用同一份 Ultra 源码执行只读类型检查，得到 **30 条诊断**。它们包含连带类型错误，不代表 30 个独立缺陷。随后用已验证的 Ultra Host 构建产物在该官方依赖环境直接进行 ESM 导入，得到：

```text
SyntaxError: The requested module '@deepseek-ai/dsh-experimental-agent-team'
does not provide an export named 'TeammateEvaluationId'
```

因此，即使界面不选择 Codex／Claude Code，当前 Host 也不能在原版官方包上正常加载。仅关闭两个 native 插件、修改包名或放宽版本号不能解决这一点。Ultra 的相关调用集中于 [index.ts](../../packages/domain/src/index.ts) 的第 13、1004、1838、2270、2284 行及 [runtime.ts](../../packages/domain/src/runtime.ts) 第 276 行。

**2. 高：扩展后的持久化数据不兼容官方 Team 回放，已复现**

fork 为 `team/member.member` 增加 `requestedRoute`、`resolvedRoute`、`externalRuntime`；为 `team/message/delivered` 增加 `nativeTurnId`。官方 [member 与 delivered schema](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/experimental/agent-team/src/projection.ts#L67)使用严格字段校验，无法把这些字段当作可忽略扩展。

本次直接把相同的合成日志交给两个提交的真实 `teamProjectionDefinition`：

| 合成记录 | 锁定 fork | 官方 master |
| --- | --- | --- |
| 普通队友 provisioning／active | 接受 | 接受 |
| 带固定 DSH route 的队友 | 接受 | `persisted Agent Teams team/member payload is invalid` |
| 带 externalRuntime／native handle 的队友 | 接受 | `persisted Agent Teams team/member payload is invalid` |
| 带 nativeTurnId 的投递回执 | 接受 | `persisted Agent Teams team/message/delivered payload is invalid` |

两个提交的 Team event 都使用 `version: 2`，投影都使用 `stateVersion: 3`，但接受的数据字段已经不同。官方也拒绝包含 route 或 externalRuntime 的 fork 投影 checkpoint；单独 nativeTurnId 不进入最终 checkpoint，所以该例的 checkpoint 校验可以通过，原日志重放仍失败。

这证明了**团队状态重建不兼容**，不是“高级字段在官方界面不显示”这么简单。它不等于本次已验证整个用户 `DSH_HOME` 的格式迁移：本次没有对真实会话做迁移实验。切换前还必须验证外层 Session 格式、历史 codec、子会话 descriptor、Team 投影及 Ultra Binding 的组合迁移；不能假设官方的通用 Session 升级会自动迁移 fork 字段。复现程序见 [projection-probe.mjs](agent-team-compatibility/projection-probe.mjs)。

**3. 中：外部 native 成员与官方 DSH 队友的协作能力不等价**

官方队友拥有真实 DSH Agent／Session，Team 工具从精确 `exec.agent` 获得权限。fork 的 external 成员在 roster 中有 member id，但实际运行身份是 provider-native handle；[provider 接口](https://github.com/benz-ai-x/deepseek-harness_x/blob/8b4bae0b620cc89a987a3ec6dd8b0b7d9025649a/packages/experimental/agent-team/src/service-types.ts#L266)提供 create、resume、deliver、interrupt、evidence、evaluation、dispose，没有 native 成员主动调用 Team 消息／任务操作的桥接入口。

进一步检查两个随包适配器：Claude Code 的 [queryOptions](https://github.com/benz-ai-x/deepseek-harness_x/blob/8b4bae0b620cc89a987a3ec6dd8b0b7d9025649a/packages/experimental/agent-team-claude-code/src/index.ts#L708)固定 `Read / Glob / Grep`，MCP 为空且严格限制；Codex 的 thread 创建没有注入 Team tools，native request handler 也没有对应 Team 操作。因此当前已交付通道支持 Lead 向 native 成员投递工作、查询状态／脱敏证据、精确中断，不能据此认为 native 成员已拥有官方 `send_message`、任务认领／完成等同等能力。

这一结论来自接口和适配器源码审查，**不是本次真实登录 Codex／Claude Code 后运行模型的结果**。若产品要求“所有 Runtime Backend 都能完整参加双向团队协作”，这里是需要补齐的功能差距。桥接必须由 Host 授权并关联确切 handle，不能用 native 进程自报的 member id 代替 Agent 权限。

此外，两个实际打包的 provider 当前均只声明 `fresh`、`persona / mission / context / memory`，以及 `sandbox / evidence / usage`。它们没有声明 fork、自定义 Profile tool-policy、Hooks、exact-call-approval 或 evaluation 能力。Ultra 拒绝这些不兼容组合属于正确的能力检查；评测框架存在，不代表两个真实 native provider 都能执行隔离评测。[Codex 声明](https://github.com/benz-ai-x/deepseek-harness_x/blob/8b4bae0b620cc89a987a3ec6dd8b0b7d9025649a/packages/experimental/agent-team-codex/src/index.ts#L571)、[Claude Code 声明](https://github.com/benz-ai-x/deepseek-harness_x/blob/8b4bae0b620cc89a987a3ec6dd8b0b7d9025649a/packages/experimental/agent-team-claude-code/src/index.ts#L331)。

**4. 中：升级到官方 v2 Session 后，Run 用量会漏算失败／重试请求，已复现**

官方把一次失败、重试或无可见内容的中断请求保存在 `assistant/attempt.data.stream` 中。其 [Session 文档](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/docs/subsystems/session.md#L583)明确要求统计这类 stream 中的用量，已提交 message 的顶层 usage 则保持其权威性。

Ultra 的 [run.ts](../../packages/domain/src/run.ts) 中 `eventTurn` 没有把 `assistant/attempt` 归入轮次，循环只累计 `assistant/message.data.usage`。合成一个失败／重试 attempt 报告 14 Tokens、随后成功 message 报告 7 Tokens 的轮次，官方记录实际包含 21 Tokens，Ultra 返回 7 Tokens，同时把 Evidence Completeness 标为 `complete`。

该实验使用官方 `AssistantStreamAccumulator` 生成 attempt stream，然后调用未修改的 Ultra fold。它证明升级时需要调整 Run 统计和完整性判断；不表示本次当前锁定 fork 的日常会话已经发生同一种 v2 数据错误。修复时应按 attempt 读取官方 stream helper，并避免把 message 的顶层 usage 与其内嵌 stream 重复相加。复现程序见 [run-probe.mjs](agent-team-compatibility/run-probe.mjs)。

**5. 中：同名清理配置与取消时机存在语义差异**

官方 [lifecycle.ts](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/experimental/agent-team/src/lifecycle.ts#L71)用 `Promise.race` 限制一次清理等待，超过 `disposalTimeoutMs` 报错。fork 的 [对应实现](https://github.com/benz-ai-x/deepseek-harness_x/blob/8b4bae0b620cc89a987a3ec6dd8b0b7d9025649a/packages/experimental/agent-team/src/lifecycle.ts#L67)在截止时发送 abort，但继续等待实际结束；普通已接受操作的 settle 也继续等待。

因此当前配置的 `5000` 在 fork 中不能解释为“卸载最多 5 秒完成”。不响应取消的 provider 可能延长 HMR／退出。这个选择符合 [ADR-0006](../adr/0006-use-durable-external-teammate-runtime.md) 的资源清理要求，本次没有把它判作当前实现违背项目契约的 bug，但它确实与官方同名配置不同。

创建取消也不能机械回退：fork 的 [roster](https://github.com/benz-ai-x/deepseek-harness_x/blob/8b4bae0b620cc89a987a3ec6dd8b0b7d9025649a/packages/experimental/agent-team/src/roster.ts)明确区分初始工作持久接受前后的取消所有权。移植时必须保留接受后由 Team 负责结算的规则，否则可能破坏已接受任务和 Launch Intent 重试语义。

**6. 使用与文档差异：普通创建工具没有自动接入 Ultra Profile**

fork 的 [spawn_teammate 工具](https://github.com/benz-ai-x/deepseek-harness_x/blob/8b4bae0b620cc89a987a3ec6dd8b0b7d9025649a/packages/experimental/tool-agent-team/src/index.ts#L203)直接调用 `ctx.agentTeams.spawnTeammate`，参数没有 Profile id／Revision，也不经过 `digitalEmployees.spawn`。这条路径创建的是普通队友，不会自动激活、选择或绑定已有数字员工档案。当前 Ultra 的完整创建路径是 Studio 或 Host API。需要在对话里直接使用员工档案时，应增加明确的 Profile 启动工具，而不是把原生工具产生的所有成员都标为 Ultra 员工。

来源也需要明确：基础 Agent Team、Team tools、Team UI 源自官方实验包；当前安装的 Agent Team 已有 fork 扩展。`agent-team-codex` 与 `agent-team-claude-code` 两个目录在本次官方提交中不存在，属于该 fork 的新增包，即使包名仍为 `@deepseek-ai/*`。包名和 `0.1.2-rc.1` 版本字符串不能证明二进制等同于官方发行物。官方实验包仍为 private，本项目继续属于 source-linked、local-only 交付。

核验时的文档问题：[README](../../README.md) 写的是旧提交 `4b60986f8c85a12e23ff4eb2ebbd5dc868f44587`，锁文件已是 `8b4bae0b...`。该引用已在提交整理时修正，运行基线未改变。早期 [交付决策](../decisions/0001-local-overlay-and-sidecar-state.md) 中“consume rather than fork or replace”的表述也应补充范围：Ultra 没有另起 `agentTeams` 服务，但其交付依赖的 Harness 已维护 fork 扩展。不能把旧决策理解为可直接装在原版官方上。

**本次执行的验证**

| 验证 | 结果与范围 |
| --- | --- |
| 锁定环境 `pnpm context:check:strict` | 290 项 PASS |
| 锁定环境 `pnpm test` | 12 个文件、157 项测试通过；包括真实 DSH 组合、固定路由／冷恢复、Host 权限、生成协议、存储、Client 和卸载用例 |
| fork 的 `projection-events`、`team`、`teammate-runtime` 三组测试 | 110 项通过；含投影、消息／任务、取消与 provider 清理；native 部分使用测试 provider |
| 官方精确提交安装及 `pnpm run build:lib:host` | 成功，为对标提供实际官方 Host 产物 |
| Ultra 对官方 Host 的 noEmit 类型检查 | 30 条诊断，退出码 2 |
| 已验证的 Ultra Host 产物对官方依赖进行 ESM import | 缺失 `TeammateEvaluationId`，退出码 1 |
| 两侧真实 Team 投影合成日志实验 | 普通记录接受；三类扩展记录被官方拒绝 |
| 官方 v2 attempt + Ultra Run fold 实验 | 用量 21 → 7，完整性仍为 complete |

本次没有重跑先前的完整八包安装／卸载流程，没有执行真实模型或 native 账号 canary，也没有迁移实际用户数据。测试通过证明锁定组合在这些覆盖面成立，不构成支持任意官方版本的保证。

两个研究程序只调用源码中的纯数据处理函数，不读写 DSH_HOME、不启动模型。安装两个源码目录的开发依赖后，可在官方 checkout 中执行：

```sh
pnpm exec tsx /path/to/ultra/docs/research/agent-team-compatibility/projection-probe.mjs /path/to/official-harness /path/to/locked-fork
pnpm exec tsx /path/to/ultra/docs/research/agent-team-compatibility/run-probe.mjs /path/to/official-harness /path/to/ultra
```

**建议处理顺序**

1. 当前完整功能继续绑定 `8b4bae0b...` 与匹配产物；把“官方基础＋fork 扩展”的来源、支持提交及启动兼容检查说明清楚。
2. 优先设计持久化迁移边界：明确 fork 字段／投影格式标识、保留旧数据、双向兼容范围和拒绝策略。不能只改一个版本数字或删除扩展字段。
3. 如果目标是官方原版兼容，拆出明确受限的基础模式，或先推动所需 Team API／schema 扩展进入官方；保留全部现有功能时需要维护完整补丁集，改包名不足以完成兼容。
4. 若要 native 成员完整协作，补齐受 Host 授权的 Team 工具与结果回传通道，并标明各 Runtime Backend 的实际能力；对话启动 Ultra Profile 另设明确入口。
5. 升级 v2 前修复 attempt 用量／完整性，补齐格式与冷恢复组合测试；同步清理超时语义和 README 锁定提交说明。
