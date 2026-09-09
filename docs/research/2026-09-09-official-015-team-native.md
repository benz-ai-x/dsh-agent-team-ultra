# 官方 0.1.5 Agent Team / Subagent / Native 与 Ultra 源码对照

研究日期：2026-09-09。范围为 Team、Subagents、Codex / Claude 原生执行、成员权限、消息、共享任务、恢复及 Team UI。结论来自指定本地源码与测试源码的只读检查；本轮没有执行这些测试，没有 build / install / 原生认证，也没有切换支持源或修改依赖、锁、Issue、Git 引用。主研究者已完成仓库前置阅读与 `pnpm context:check:strict`（648 checks / 0 warnings）；该结果不是官方 0.1.5 的兼容性验收。

| 代号 | 固定对象 | 本轮用途 |
| --- | --- | --- |
| O | 官方 `deepseek-ai/deepseek-harness@5dda764ed3aa172535a7967b06ff95d9cbfe536a`，0.1.5-alpha.1 | 当前官方比较快照；本地 `/root/workspace/deepseek-harness` |
| B | 官方 `d347e703908d0406b7a7ef80e3a0e594d86b2215`，0.1.3-alpha.1 | Ultra 锁内官方基础 / 比较基线，用于判断“是否新增” |
| F | 维护源 `benz-ai-x/deepseek-harness_x@3c38b1d4e8bf219750203e44b1df033ced754e92` | 本地 `/root/workspace/batch4-upgrade.VkSXdm/harness`；保留当前 Team / native 扩展 |
| U | Ultra `f84584def627b4af78a029af8788de73da0ad567` | 已合并 PR #63 后源码；本地 `/root/workspace/dsh-agent-team-ultra` |

O 的工作区有 10 项用户未提交的构建相关变更：根 `package.json`、`pnpm-lock.yaml`、`packages/client/tsdown.client.ts`、`scripts/client-bundle-purity.spec.ts` 与 6 份构建文档。本报告不把这些变更计为官方能力，引用的业务源文件没有这些修改。本文链接固定到上述 commit；“可发布”只描述源码中的发布配置和包族，不声称本轮查询过 npm 或完成安装。

## 结论

官方已经实现普通 DSH Team 的主要协作底座：真实成员与 Lead 权限、持久 roster / mailbox / task、任务 CAS 与依赖 DAG 规则、冷恢复和 roster / task Web 面板。它们在 B 已经存在；O 并没有新实现一套与 Ultra 等价的数字员工产品。B→O 的 Team / Team Tool / Team UI 业务源码差异只落在 `persisted.ts` 的持久读取返回值适配，不能把历史合并日志中的 Team、durable inbox 或 descriptor 固定模型当成这次新增。[O-Team API][O-persisted][B-persisted]

O 的 Codex / Claude 是可选的一次性 `SubagentProvider`。Codex 强制 `ephemeral: true`，Claude 强制 `persistSession: false`，两者都不实现 `prepareContinuable`。普通 Team 的创建路径只调用 `startContinuable`，所以这些官方原生 Provider 不能直接变成其持久 Team 成员。U / F 的非临时原生身份、可撤销成员授权、持久操作回执、精确 handle 恢复与消息中心仍有明确的实现差异。[O-Codex provider][O-Codex thread][O-Claude options][O-prepare][O-roster spawn][U-Codex durable thread][U-Claude options]

固定 DSH 模型的持久恢复不是 Ultra 独有：O 的 continuable descriptor 已保存 provider / model / reasoning effort / persona / toolFilter，并在冷恢复时使用这些记录。Ultra 增加的是 Team 层独立选择与校验 Runtime Target、Binding 和成员 requested / resolved route，而不是重新发明底层 descriptor。[O-continuation create][O-continuation resume][O-descriptor][U-launch]

两者也不是全面的包含关系。官方一次性原生插件允许部署者选择更广的原生权限模式；Ultra 当前发货的持久 Codex / Claude 路径均配置只读。已有持久原生成员协作不意味着这些员工已能自动改代码或拥有独立 worktree。[O-Codex permissions][O-Claude options][U-profile][U-Claude options]

## 四层能力口径

| 能力 / 入口 | 源码是否存在 | 默认 profile / preset 是否启用 | 发布层级 | 与 Ultra 的语义关系 |
| --- | --- | --- | --- | --- |
| 普通 Agent Team、Team 工具、Team Web | 是 | 通过私有 Team profile / web profile 显式组合；普通发布组合不能依赖 experimental 包 | 五个包均 `private: true`；官方 release family 排除 `packages/experimental` | 是 Ultra 已复用的协作底座；不含后述 durable native 与消息中心增量。[O-Team manifests][O-Team profile][O-Team web profile][O-release] |
| DSH continuable spawn / fork | 是 | standard preset 中 `subagent` / `subagent_fork` 配置 `backgroundMode: continuable` | 正式 subagent 包族 | 持久 Session、父子权限、冷恢复和 descriptor 可复用。[O-standard preset][O-subagent provider][O-continuation resume] |
| 官方 Codex / Claude one-shot | 是 | standard / cordis / ptc 的相应工具行 `disabled: true`；需安装可选 Provider bundle 并显式启用工具 | 包有 `publishConfig.access: public`，属于发布包族；本轮未验证 registry 安装 | 一次性委派；不能替代 U 的长期原生成员。[O-standard preset][O-Codex manifest][O-Claude manifest] |
| U 的 Codex / Claude durable member | 是 | Ultra overlay 显式挂载两者，`sandbox: read-only` | Ultra local-only 交付，仍依赖私有 Team 包 | 两种原生后端保留 opaque handle、多轮 / 恢复和六项成员操作，但能力声明与权限受限。[U-profile][U-Codex runtime][U-Claude runtime] |
| Team list / DAG graph / 消息中心 | O 有 list；F / U 有 graph 与消息中心 | 仅在相应 Team / Ultra Web 组合可见 | private / local-only | “后端有 DAG”不等于“界面已有交互任务图”。[O-Team UI][F-Team UI graph][U-message UI] |

## 相对 B 真正发生了什么

本轮使用端点差异检查，而非只看合并提交标题：

```sh
git diff --name-only d347e703908d0406b7a7ef80e3a0e594d86b2215 5dda764ed3aa172535a7967b06ff95d9cbfe536a -- packages/experimental/agent-team/src packages/experimental/tool-agent-team/src packages/experimental/client-ui-agent-team/src packages/subagent/subagent/src/descriptor.ts
```

结果仅为 `packages/experimental/agent-team/src/persisted.ts`。该文件从直接使用 `await handle.read(...)`，变为取返回对象的 `{ events }`；roster、mailbox、task-board、projection、types、Team Tool 和 TeamAction 业务源码及 descriptor 在此比较范围内未变。[B-persisted][O-persisted]

| B→O 变化 | 实际意义 | 不应推导出的结论 |
| --- | --- | --- |
| Team 持久读取适配 `{ events }` | 跟随 Session 持久读取接口变化；普通 Team 本身仍是原有领域模型 | “官方新增 Ultra 的持久成员或消息中心”。[O-persisted] |
| Subagent continuable 实现拆分为 activation、messages、inbox 等模块 | 新的源码组织和 admission / lifecycle 适配要在迁移时对照调用点 | “拆分文件就是新的数字员工生命周期”。[O-continuation create][O-subagent inbox] |
| 浏览器 `subagents.prompt` 新增显式 `delivery: queue | steer` | 人类可选下一轮投递或最近 step 的 steer；代码保留 `requestId` 为用户消息 `rpcId` | “它等于 Team sender-scoped 幂等提交、回复关系和统一消息中心”。[O-subagent prompt][O-subagent prompt types] |
| `@openai/codex` 从 0.149.1 到 0.153.4；Claude Agent SDK 从 0.3.241 到 0.3.263 | 官方一次性插件更新原生依赖；对应 process / cleanup 实现与测试有变化 | “U 的旧锁定 native 协议已自动资格通过”或“原生 Provider 已支持长期 Team”。[O-Codex manifest][O-Claude manifest] |
| 原生 teardown / 发布前启动证据相关实现与测试更新 | 是可借鉴、需重新核验的执行器维护内容 | 不足以证明 U 的项目 / thread / session 恢复、dynamic tools / MCP grants 适配成功。[O-Codex run][O-Claude run] |

## 逐项比较与处置

“未找到”在这里表示：检查了该能力所属的实际公共接口、调用实现、持久 schema / vocabulary、Web mount / renderer 和相邻测试，未发现等价实现；并不声称未来版本、其他分支或任何插件都不可能提供。

| 项目 | O 结论与证据 | F / U 已有增量与证据 | 建议 |
| --- | --- | --- | --- |
| 普通 Team roster / 权限 | **已做，B 已有**。exact live Agent 解析；root 是 Lead，持久 direct-child roster 决定 teammate；非 Team 子代理和伪造同 id Agent 不获得权限。[O-membership][O-authority tests] | 沿用该 Team owner，另加 external member 的授权路径。[F-grant issuer] | 复用；退役“再做普通 Team”的重复计划。现有 Ultra 没有理由重新实现普通 roster。 |
| DSH 子代理持久 Session / 冷恢复 | **已做，B 已有**。manager 持有持久 child identity；provider 只贡献 creation seed；cold resume 不重新调用 provider。[O-subagent provider][O-continuation resume] | 在 Team / Binding 层保留不可变 Profile 和 Runtime Target。[U-launch] | 改接 O 的新入口和持久读接口，保留 Profile / Binding 层。 |
| 固定精确模型路线 | **部分**。底层 descriptor 固定显式 route；但 Team `SpawnTeammateRequest` 没有 `agentOptions`，roster 只传 parent / prompt，列表对非驻留成员还会回退显示 Lead model。[O-descriptor][O-Team types][O-roster spawn][O-membership] | F 接收 agentOptions、持久 requested / resolved route 并核对；U 将 Profile target 的 provider / model / effort 显式传入。[F-route][U-launch] | 保留独立 target / 证据校验；Team 透传与校验属于可单独提案的窄扩展。不要复制 descriptor。 |
| 可恢复外部原生 Team Provider | **未找到等价**。Team 只有 continuable 分支；Codex / Claude 只有 one-shot start。[O-roster spawn][O-Codex provider][O-Claude provider] | 完整 `create/resume/deliver/interrupt/dispose` typed contract，按 opaque nativeHandle 路由，Provider 注册归 Fiber 所有。[F-runtime contract][F-provider contract][F-Team API] | 保留原生能力；不能用官方 one-shot Provider 直接换包。该增量跨权限、持久事实、恢复和生命周期，不应承诺只是小 UI 扩展。 |
| Native Member Grant | **未找到等价**。普通 Team 权限要求真实 DSH Agent；官方原生进程没有这个 Agent / roster 身份。[O-membership][O-Codex provider] | Host 绑定 exact Lead / Team / member / provider / handle / 当前注册；非序列化 grant，撤销信号与操作前后校验。[F-grant issuer][F-grant contract][F-grant execution] | 保留；不能把 memberId、RPC 参数或普通 MCP 连接当权限凭据。 |
| 六项成员操作及“完整协作”证明 | **普通 DSH Team 已做；native 未找到等价**。Team model tools 调用 ordinary Team API。[O-Team API][O-Team tools] | `members.list / tasks.list / tasks.get / messages.send / tasks.update / wait`，以当前精确 handle 的确认结果满足 full-collaboration，不只看 catalog 标签。[F-runtime contract][F-collaboration proof][U-Codex runtime][U-Claude tools] | 保留 native 实现与当前 handle 能力核验；普通 DSH 工具继续复用。 |
| 原生消息与任务操作回执 | **未找到等价**。O `team/message/queued` / delivered 是消息交付事实；没有 native operation 事件。[O-Team types][O-known events] | 同一事务持久 task/message + 原调用 receipt；重放先查原 receipt，再做 CAS；改变 normalized input 冲突。[F-native task][F-native message][F-native tests] | 保留原子事实与幂等语义；不能用“已有消息去重”替代。 |
| Host-only native recovery reader | **未找到等价**。O 可读 DSH Session，但没有成员限定的 native launch / delivery / settlement reader。[O-Team API][O-subagent provider] | grant 下 `turns.recover` 页只暴露本成员 launch / inbound IDs / 已提交终态文本；Claude 以此核对 native transcript，先恢复再新投递。[F-recovery][F-grant execution][U-Claude recovery] | 保留；底层 SessionQuery 可共用，但成员授权和恢复选择规则不能省略。 |
| 模型间持久 peer messaging | **已做，B 已有**。先 queue+flush，再 steer；target inbox / history 的 message identity 负责恢复去重。[O-mailbox][O-mailbox recovery tests] | native delivery 与持久 native receipt 加到同一权威 Team log | 保留官方实现并移植扩展分支；无需新建第二份消息存储。 |
| 人类 Team 消息提交、同请求重试与 reply | **部分**：普通 model send 存在；generic browser subagent prompt 也存在；Team Remote 只有 view / createTask / updateTask，没有 Team 发送接口或 reply 字段。[O-Team API][O-Team types][O-subagent prompt] | Team owner Remote sendMessage；Team+sender+requestId 与输入 fingerprint 回执；同 Team reply，queued 与 delivered 分开。[F-human submit][F-Team Remote] | 保留 Team 幂等提交；generic subagent prompt 适合直接向子代理说话，不能无损替代这个产品动作。 |
| 消息列表 / 分页 / 详情 | **未找到等价**。O TeamView 只有 members / tasks；messages 留在内部 fold / mailbox。[O-Team types][O-Team projection] | committed cursor 绑定 Team、filters、Session cutoff，元数据无正文，单条内容按需脱敏；恢复后可重建。[F-message reader][F-message read tests] | 保留 reader 与 UI；底层 Session read 的升级只处理读取载体。 |
| 等待 Team 变化与 UI watch | **部分**。`waitForChange` 是模型 / Host 的一次性活动等待；不是浏览器持续 watch，O Team UI 打开 / 操作后 / refresh 按钮重新读取。[O-Team API][O-Team UI] | generated watch 先完整 baseline，后 bounded invalidation；共享 owner 等待流关闭，消息页有游标与世代 fencing。[F-Team Remote][F-watch owner][F-watch tests][U-message mount] | 保留 streamed invalidation / 生命周期层；不要将 wait 循环等同现有 watch 的协议保证。 |
| 任务 DAG 的领域规则 | **已做，B 已有**。blockedBy、环 / 缺失依赖拒绝、CAS、owner/Lead、readiness、tombstone；writeScopes 仅提示。[O-task board][O-task tests] | native mutation 复用同一规则；核心整合为共享 `prepareTaskUpdate`。[F-native task][F-task state] | 复用；退役“从零做任务依赖”的计划，保留 native receipt 集成。 |
| DAG 可视图 / 点选依赖 / 共享详情 | **未找到等价**。O 为列表，依赖输入是逗号分隔 ID；没有此 Team UI 的 graph / 节点连线 / 缩放平移。[O-Team UI] | F list / graph 共享真实 task selection 与 detail；SVG 边、真实 ID 节点、缩放平移 / fit / 键盘；依赖候选按真实 ID 选择。[F-Team UI graph][F-Team UI tests] | 保留前端增量，继续由 Host 决定 readiness / permissions；既有 UI 已有已知限制，不能因旧套件存在就声称无缺陷。 |
| 文本与依赖同笔 CAS | **部分**。O 先 `edit`，成功后 `set_dependencies`；领域 edit 不接收 blockedBy 变化。[O-Team UI edit][O-task board] | F 单次 edit 携带 blockedBy，保留起始 revision，冲突重读不自动覆盖。[F-Team UI edit][F-task state][F-Team UI tests] | 保留这个窄语义增强；迁移测试应专门证明原子性和冲突草稿。 |
| Team 公共 child Slot | **未找到等价**。O mount 只注册 conversation header action / Team Remote。[O-Team mount] | F 暴露 `agent-team.panel.view` 与导航；U messages 插件挂进同一个 owner 面板。[F-panel slot][U-message mount] | 可以作为独立、较窄的上游扩展提案；不必为了消息中心复制整块官方 Team UI。 |
| Native 写入 / 工作区隔离 | **定位不同**。O one-shot 提供可配置原生权限；本范围 Team 仍共享 cwd，writeScopes 不是锁。[O-Codex permissions][O-Claude options][O-task board] | U overlay 两者只读；Claude 固定工具 / MCP、禁网、路径限制；没有承诺每成员可写 worktree。[U-profile][U-Claude options] | 条件性新规划；不能把现有协作完成标记成“可执行写代码员工”，也不应在本次分析中直接放宽权限。 |

## 四个容易误判的具体场景

1. **“把 Codex Provider 名填到 spawn_teammate 就好了”。** O 的 Team roster 先写 provisioning，再调用 `ctx.subagents.startContinuable({ provider: 'codex', ... })`。Codex Provider 没有 `prepareContinuable`，Subagent service 返回 `UNSUPPORTED_CAPABILITY`；Team 会沿 provisioning 失败路径记录 failed。方法名为 Provider，并不意味着它实现了 Team 所需生命周期。U 的路径是独立 `runtime: { kind: 'external-agent', ... }`，由 Team owner 接入另一套持久 handle contract。[O-roster spawn][O-prepare][O-Codex provider][U-launch][F-runtime contract]

2. **“官方消息已经去重，所以浏览器丢回复直接重发即可”。** O 普通 Team `sendMessage` 每次分配新的 `team-message-${randomUUID()}`。恢复去重针对已经接受的同一 messageId 在目标 inbox / history 是否存在；不等于两次提交的内容被识别为同一意图。F 的人类提交在调用前拥有稳定 requestId，同 Team / sender 下相同 fingerprint 返回原 messageId，变更输入则拒绝。U 把意图写入并读回 sessionStorage，确认超时进入 unknown，显式重试才复用该意图。[O-mailbox][F-human submit][U-message retry][U-message deadline]

3. **“官方 UI 已经能编辑依赖，所以任务图增量可以删除”。** O 依赖编辑是文本 input；一次保存可能先提交文本 revision N+1，再提交依赖 revision N+2。第二步拒绝时第一步已经成立。F 的图只是 Host DAG 的展示，而同笔 edit+blockedBy 才消除这两个业务提交之间的中间态；两项价值应分别保留 / 评估。[O-Team UI edit][O-Team UI][F-Team UI edit][F-task state]

4. **“只有 Ultra 冷恢复固定模型”。** O descriptor 已能在 parent 后续设置改变后按 child 的显式 provider / model / effort 重建；没有声明 route 的 descriptor 则不凭空制造字段。差异在 Team spawn 没有独立 route 输入，且 O 非驻留 roster 的显示 model 可能取 Lead；F / U 将成员实际 route 及 Profile target 作为持久可核验关系。迁移时可继续使用官方 descriptor，保留上层关联和显示真实性。[O-continuation resume][O-descriptor tests][O-membership][F-route][U-launch]

## 已开发内容如何迁移

| 代码 / 责任 | 可退役、保留或改接 | 条件与限制 |
| --- | --- | --- |
| 普通 roster、DAG 校验、mailbox queue/delivered、DSH descriptor | 继续以官方实现为基础；退役重复建设计划 | 这些责任本来就主要归 Team / Subagent owner；不是“删除 Ultra 就自动完成产品”。 |
| F Team 中 agentOptions、requested / resolved route | 保留语义，移植为窄扩展 | O 已有下层 descriptor；只扩 Team 入口、核验和成员投影，避免恢复时改用当前 Lead route。 |
| F durable runtime registry、native grant、receipt、recovery reader | 保留，围绕 O 当前接口重新整合 | 涉及 authority、Session 必需事件、projection、disposal、native adapter；范围明显超过改 manifest 或增加几个 UI 控件。 |
| U `packages/codex` / `packages/claude-code` | 保留产品语义；单独评估采用新版官方 native 依赖与进程实现 | O one-shot 包可作协议 / cleanup 对照，不能直接替换；U 当前资格锁定 Codex 0.149.1、Claude SDK 0.3.241，真实认证验收仍有独立工作。[U-lock][U-native acceptance] |
| F task list / graph / 单笔编辑 / watch owner | 保留 UI 与协议增量，考虑拆成更小的上游提案或 owner 扩展 | 必须保留一致的 authoritative task ID、CAS、bounded stream 和异步清理；不可把 UI 本地 state 当任务状态。 |
| U TeamMessageCenter、retry intent、过滤 / 分页 / reply | 保留 UI；改接迁移后的 Team owner API / public Slot | O 的直接子代理消息 UI 可复用部分基础交互，但没有同等 Team submission / history 语义。 |
| 旧版本适配和兼容性 qualification | 暂不判定可删除 | 需由主报告结合 Session 格式、交付链和用户对历史的选择决定；本报告未执行兼容或迁移。 |

有一个直接的数据边界：O 虽然 Team payload 仍为 2，其 member strict schema 没有 F 的 `externalRuntime`、`requestedRoute`、`resolvedRoute`，projection stateVersion 为 3，而 F 为 7；O 的 generated known event vocabulary 也没有 `team/native-operation/committed` 和 `team/message/request-committed`。相同 Team payload 数字不能证明 F 数据可由 O 无损回放。必需操作回执不应标成可忽略来绕过拒绝。[O-Team projection][O-projection version][O-known events][F-Team formats][F-projection version]

这不预设必须保存所有历史：若用户选择仅迁移 Profile / 新建成员，所需数据转换范围会变化；若选择沿用原成员与 native handle，则必须保持上述身份与回执的恢复语义。无论选择哪条路径，本轮都没有对真实业务数据做试读或迁移。

## 未开发内容怎样重规划

优先把普通 Team / continuable / DAG 基础能力从“新增产品功能”中去掉，归入官方底座。数字员工差异应按用户要解决的工作保留：可重复使用的员工配置、确定的执行后端、长期 native 成员、多方协作消息可追踪、可解释的任务依赖与恢复。其 Profile / Eval / Run 规划由主报告和其他分项报告合并判断。

若下一阶段首要目标是“可靠委派一个原生产品完成一次任务”，官方 one-shot 路径可以独立评估，长期原生 Team 的路线和验收可以延后；这是产品范围选择，不是技术上证明两者等价。若首要目标是“长期员工跨轮协作并在重启后接续”，则保留 durable native / grant / receipt / recovery，围绕官方新底座移植必要扩展。若首要目标变成“多个员工实际编辑代码”，还需单独规划执行权限、共享工作区冲突或 worktree 隔离及相应验收，不能从当前只读发货配置推导完成。

可以优先准备的窄上游提案是 Team 的 per-child options / route 校验、公共 panel child Slot、原子文本+依赖编辑和 bounded watch；durable external Team provider 则应作为完整能力提案，明确 caller authority、持久接受点、恢复 reader、schema 与资源所有权。本轮不假定必须永久维护 fork，也不假定上游会接受提案。

## 检索范围与验证限度

- 官方正向检查：完整 Team façade / types，roster 创建和 exact identity，mailbox 提交 / 恢复，task-board / projection，TeamAction / mount / profile，Subagent provider contract / descriptor / create / resume / browser prompt，Codex / Claude Provider 与 thread / query 生命周期；包 manifest、release family 与 disabled preset rows。
- 官方负面检索：在 `packages` 下 `.ts` / `.tsx` / `.md` 搜索 `NativeMemberGrant`、`TeammateRuntimeProvider`、`registerTeammateRuntimeProvider`、`team/native-operation`、`team/message/request-committed`、`agent-team.panel.view`、`agentTeams/watch`、`TeamMessageRequestId`、`turns.recover`，没有命中。该结果结合封闭 Team 接口、schema、生成词表与实际 UI 才支持本文的“未找到等价”，不是仅凭关键词判断。
- 维护源 / Ultra 正向检查：对应 registry / service-types / grant / receipts / reader / Remote / graph / watch owner，以及 U 两个 native adapter、Launch、profile overlay、消息中心和直接调用 mount。
- 测试仅阅读：官方 authority / CAS / persistence / ephemeral thread / persistSession 测试；F native operations / message reader / UI graph / watch 测试；U native task receipts 与 cold recovery 测试。源码中的断言可支持意图和覆盖入口，不能表示本轮测试通过、真实登录成功、性能达标或 O / U 兼容成功。[O-authority tests][O-task tests][O-mailbox recovery tests][O-Codex tests][O-Claude tests][F-native tests][F-message read tests][F-Team UI tests][U-native tests]
- 没有变更运行代码、锁、依赖、Issue 或远端；本文件是该分项研究唯一写入。根 HANDOFF 和总规划由主研究者统一处理。

## 固定源码索引

[O-Team API]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/agent-team/src/index.ts#L129-L320
[O-Team types]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/agent-team/src/types.ts#L43-L234
[O-persisted]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/agent-team/src/persisted.ts#L22-L34
[B-persisted]: https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/experimental/agent-team/src/persisted.ts#L22-L33
[O-Team manifests]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/AGENTS.md#L3-L9
[O-Team profile]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/agent-team-profile/cordis.patch.yml#L1-L37
[O-Team web profile]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/agent-team-web-profile/cordis.patch.yml#L1-L6
[O-release]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/scripts/release/families.ts#L321-L325
[O-standard preset]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/preset/agent-presets/presets/standard/agent.cordis.yml#L182-L220
[O-membership]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/agent-team/src/roster.ts#L92-L159
[O-roster spawn]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/agent-team/src/roster.ts#L245-L335
[O-mailbox]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/agent-team/src/mailbox.ts#L109-L150
[O-task board]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/agent-team/src/task-board.ts#L125-L256
[O-Team projection]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/agent-team/src/projection.ts#L67-L124
[O-known events]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/core/session/src/known-event-types.ts#L8-L77
[O-Team tools]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/tool-agent-team/src/index.ts#L159-L379
[O-Team UI]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/client-ui-agent-team/src/client/TeamAction.tsx#L243-L425
[O-Team UI edit]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/client-ui-agent-team/src/client/TeamAction.tsx#L206-L240
[O-Team mount]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/client-ui-agent-team/src/client/mount.ts#L21-L101
[O-prepare]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent/src/index.ts#L565-L582
[O-subagent provider]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent/src/types.ts#L344-L389
[O-continuation create]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent/src/continuation.ts#L101-L170
[O-continuation resume]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent/src/continuation.ts#L395-L448
[O-descriptor]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent/src/descriptor.ts#L8-L85
[O-subagent inbox]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent/src/inbox.ts#L15-L69
[O-subagent prompt]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent/src/index.ts#L393-L458
[O-subagent prompt types]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent/src/control-types.ts#L97-L119
[O-Codex provider]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent-codex/src/index.ts#L63-L140
[O-Codex thread]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent-codex/src/wire.ts#L283-L300
[O-Codex permissions]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent-codex/src/wire.ts#L31-L42
[O-Codex manifest]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent-codex/package.json#L1-L48
[O-Codex run]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent-codex/src/run.ts#L184-L228
[O-Claude provider]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent-claude-code/src/index.ts#L73-L155
[O-Claude options]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent-claude-code/src/run.ts#L309-L377
[O-Claude manifest]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent-claude-code/package.json#L1-L49
[O-Claude run]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent-claude-code/src/run.ts#L263-L388
[O-authority tests]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/agent-team/tests/team.spec.ts#L421-L510
[O-task tests]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/agent-team/tests/team.spec.ts#L593-L740
[O-mailbox recovery tests]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/agent-team/tests/persistence.spec.ts#L284-L438
[O-descriptor tests]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent/tests/continuation.spec.ts#L358-L389
[O-Codex tests]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent-codex/tests/subagent-codex.spec.ts#L638-L687
[O-Claude tests]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent-claude-code/tests/subagent-claude-code.spec.ts#L872-L889
[F-Team API]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/agent-team/src/index.ts#L276-L317
[F-Team Remote]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/agent-team/src/index.ts#L480-L549
[F-runtime contract]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/agent-team/src/service-types.ts#L74-L175
[F-grant issuer]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/agent-team/src/index.ts#L248-L263
[F-grant contract]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/agent-team/src/service-types.ts#L32-L72
[F-grant execution]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/agent-team/src/native-member-operations.ts#L55-L158
[F-collaboration proof]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/agent-team/src/teammate-runtime.ts#L1397-L1422
[F-route]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/agent-team/src/roster.ts#L543-L583
[F-native task]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/agent-team/src/task-board.ts#L102-L157
[F-native message]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/agent-team/src/mailbox.ts#L100-L148
[F-recovery]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/agent-team/src/mailbox.ts#L152-L195
[F-human submit]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/agent-team/src/mailbox.ts#L267-L350
[F-message reader]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/agent-team/src/message-reader.ts#L80-L180
[F-task state]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/agent-team/src/task-state.ts#L37-L138
[F-Team formats]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/agent-team/src/types.ts#L505-L531
[F-panel slot]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/client-ui-agent-team/src/client/mount.ts#L27-L61
[F-Team UI edit]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/client-ui-agent-team/src/client/TeamAction.tsx#L485-L511
[F-Team UI graph]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/client-ui-agent-team/src/client/TeamAction.tsx#L795-L890
[F-watch owner]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/client-ui-agent-team/src/client/watch-owner.ts#L1-L70
[F-native tests]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/agent-team/tests/native-member-operations.spec.ts#L417-L573
[F-message read tests]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/agent-team/tests/message-read.spec.ts#L116-L331
[F-Team UI tests]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/client-ui-agent-team/tests/team-action.client.spec.tsx#L390-L608
[F-watch tests]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/client-ui-agent-team/tests/team-action.client.spec.tsx#L131-L279
[U-lock]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/dsh-reference.lock.json#L1-L54
[U-native acceptance]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/TODO.md#L70-L84
[U-profile]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/profile/cordis.patch.yml#L41-L93
[U-launch]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/domain/src/launch-workflow.ts#L320-L355
[U-Codex runtime]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/codex/src/index.ts#L751-L795
[U-Codex durable thread]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/codex/src/index.ts#L441-L478
[U-Claude runtime]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/claude-code/src/index.ts#L392-L465
[U-Claude options]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/claude-code/src/index.ts#L833-L881
[U-Claude recovery]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/claude-code/src/index.ts#L1048-L1110
[U-Claude tools]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/claude-code/src/team-tools.ts#L1-L69
[U-message UI]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/ui/src/client/TeamMessageCenter.tsx#L22-L69
[U-message retry]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/ui/src/client/TeamMessageCenter.tsx#L130-L163
[U-message mount]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/ui/src/client/mount.ts#L94-L158
[U-native tests]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/codex/tests/member-tasks.integration.spec.ts#L170-L215
[O-projection version]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/agent-team/src/projection.ts#L307-L316
[F-projection version]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/agent-team/src/projection.ts#L644-L654
[F-provider contract]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/agent-team/src/service-types.ts#L298-L341
[U-message deadline]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/ui/src/client/TeamMessageCenter.tsx#L449-L508
