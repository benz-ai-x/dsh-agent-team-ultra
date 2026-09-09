# 官方 Harness 0.1.5 重新评估：复用边界、迁移与下一步

日期：2026-09-09（Asia/Shanghai）。用户已暂停开发；这是研究结论和待确认方案，**不是升级完成、功能删减授权或新开发指令**。

## 结论

1. **官方基础已经很完整，但没有证据表明本次新版可以整体替代 Ultra。** 普通 Team、持久消息、任务依赖、可续作 DSH 子代理、Preset、Skills、审批和工作流应继续复用官方。相对我们已经合入的官方 `d347e703`，普通 Team 的核心业务实现几乎没有变化，不能把原来就复用的能力再次算作“刚被官方取代”。
2. **Ultra 的实际差异是员工治理和持久的异构协作，不是“能启动 Codex／Claude”。** 已有的不可变员工版本、显式发布／回滚、幂等 Binding、native 成员授权／任务回执／同身份恢复、消息中心、交互 DAG、Run 关联及评测发布链仍有保留价值。但双 native 交付仍待 #44 的真实账号验收，不能宣传为已经完成真实产品验收。
3. **先保留当前已验收版本，不能直接把 `.dsh/harness` 换成官方目录。** 最新官方已使用 Session 3，我们的维护数据还有官方不认识的必需 Team 事实；接口、迁移发布时机和 native SDK 版本也有变化。升级是完整的契约与数据迁移，不是修改版本号。
4. 建议长期减少维护补丁、复用官方；短期如果必须保留现有完整行为，需要先移植必要扩展并重新验证。若要求完全不改官方，就必须先明确缩减产品承诺和历史资料的使用方式，两条路线不能混称一个无损升级。

## 1. 分析对象与证据强度

| 对象 | 固定身份与状态 |
| --- | --- |
| 用户指定官方源码 | `/root/workspace/deepseek-harness`，`master`，`5dda764ed3aa172535a7967b06ff95d9cbfe536a`，`0.1.5-alpha.1` |
| 上一次已合入的官方基础 | `d347e703908d0406b7a7ef80e3a0e594d86b2215`，`0.1.3-alpha.1` |
| 当前受支持维护源码 | `/root/workspace/batch4-upgrade.VkSXdm/harness`，`3c38b1d4e8bf219750203e44b1df033ced754e92`，`agent-team-ultra.phase-c.v1` |
| 当前 Ultra | `main`／`origin/main` 均为 `f84584def627b4af78a029af8788de73da0ad567`；PR #63 已合并，本轮开始时工作区干净 |
| 当前持久格式 | Session 2；基础 Team payload 2；native operation 4（兼容已支持的 3）；message request 1；Team projection 7；Ultra domain v1 |

官方提交页也确认了 [0.1.5-alpha.1 发布提交](https://github.com/deepseek-ai/deepseek-harness/commit/5dda764ed3aa172535a7967b06ff95d9cbfe536a)。本报告针对这份固定源码，不承诺其他时间的 master、npm 实物或用户当前运行的应用与它完全相同。

官方目录有十个既有未提交文件：根 `package.json`／`pnpm-lock.yaml`、`packages/client/tsdown.client.ts`、`scripts/client-bundle-purity.spec.ts`、`docs/development` 三种文件，以及 `.agents/notes/implemented/process/2026-06-17-ts-build-config` 三种文件。涉及这些路径时读取提交内容；没有把本地构建修改算成官方功能，也没有覆盖它们。

证据分三类：源码实现／声明已核对；一个无持久副作用的迁移 admission 小实验已运行；实际构建、安装、GUI、真实账号和完整历史资料迁移未在 0.1.5 上执行。报告所说“未发现”限定为所列模块和接口，不等于断言官方未来不会做。

专项证据：

- [Team、native、任务与消息 UI](2026-09-09-official-015-team-native.md)。
- [Session、协议、依赖与数据迁移](2026-09-09-official-015-migration.md)。
- [Preset、Skills、审批、工作流与 Ultra 产品边界](2026-09-09-official-015-product.md)。

## 2. 官方做了什么，哪些仍不能替代我们

下表“官方有”指固定源码中已有；**不自动代表默认安装启用、公开包已发布或完整满足 Ultra 的产品语义**。

| 能力 | 官方 0.1.5 的实际范围 | Ultra 的处置 |
| --- | --- | --- |
| 普通 Team／DSH 队友 | 隐式 Lead、永久 roster、权限、消息持久接受、任务 CAS／依赖／墓碑、等待和冷恢复已有；基本不是本次新增 | 继续以官方 Team 为唯一权威，不另写引擎或第二套状态 |
| 模型选择与恢复 | 普通 subagent descriptor 已保存模型等配置供续作；Team 创建没有我们的独立 Runtime Target 输入和 requested／resolved route 校验 | 复用官方续作；保留最小的员工路由选择和接受时校验，不能宣传“官方不能固定模型” |
| Codex／Claude 启动 | 两种官方 one-shot provider 已有。Codex 强制 ephemeral thread；Claude 设置 `persistSession: false`，没有相应 `prepareContinuable` | 官方可承担独立一次性委派，不能直接替换持久员工 adapter |
| native 持久 Team 协作 | 未发现等价的 native 成员 grant、多轮原 handle 恢复、消息／任务幂等回执与 Host 对账读取 | 保留 Ultra 两个 adapter 及 Team 所有者上的必要扩展；真实资格仍待 #44 |
| native 执行权限 | 官方一次性 provider 有多种部署级非交互权限模式；不都是只读 | Ultra 发货的持久 native 仍只读，双方不是包含关系。不要因迁移顺便开放写入、shell 或网络 |
| Team 消息 UI | 有 Team mailbox 与模型工具；普通 subagent prompt／steer 不是 Team-wide 人类消息中心 | 保留分页／筛选／安全详情、显式发送和回复、同请求重试、断线不重发 |
| 任务 UI | 有任务列表、依赖 ID 输入与 Host DAG 校验；未发现我们的可视 DAG。官方编辑文本和依赖仍为两步操作 | 保留 graph／共享详情／依赖点选及一次 CAS；不重写任务规则和自动调度 |
| Preset／Persona | 配置文件组合、目录选择／复制／删除／默认、空白 Session 选择及代际管理已有 | 复用配置执行基础；不把可变文件或进程内 generation 当不可变 Profile Revision |
| 员工发布治理 | 未发现等价的 Profile Revision fingerprint、Head CAS、显式 Activation／Rollback、不可变员工 Binding | 保留 Profile 与发布链；不是把 Studio 简单改为 Preset 管理页 |
| Skills／指令／上下文 | 已有分层发现／provider、文件 watch、用户和模型调用控制及 UI 入口 | 不再独立开发通用技能加载器；未来只考虑版本化引用和依赖身份 |
| Hooks／审批／sandbox | 官方已有 hooks 桥接、exact-call 一次审批、审计和工具策略边界 | 复用官方权限执行和 UI；保留 Profile 的非任意代码、版本化安全规则 |
| Run／用量／轨迹 | 有官方 Session、stream helper、用量投影、轨迹和 telemetry | 复用事实和 helper；保留“本轮由哪个员工版本／实际路由执行”、关联修复、缺失证据标记，不另存原始 transcript |
| 工作流与评测 | Workflow／worker 执行基础已有；未发现等价的 Eval Set／Eval Run／Promotion Gate 发布域 | 不再做通用工作流引擎；保留员工评测与发布关联。官方 workflow 不自动满足隔离 Eval Worker 的权限边界 |
| 记忆 | 官方有可选第三方 MCP 记忆接入；Ultra 当前 memory 也是 curated 文本块，并非自动长期记忆系统 | 不将“有记忆”当独有卖点，也不把检索、学习或自动提炼说成已做 |
| Workspace／worktree | 有目录与 Session 管理；workflow 的 `isolation: 'worktree'` 当前明确拒绝 | 托管 worktree 仍是双方未完成的相关方向，应推迟到写权限、所有权和清理边界明确之后 |
| 交付与发布 | 五个 Agent Team 家族包仍 `private: true`，发行脚本跳过 private 包 | 不能据此宣布纯 npm／公开市场交付已解决；当前仍保留本地完整闭包 |

关键反例可以直接核对：[Codex 临时线程](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent-codex/src/wire.ts#L284)、[Claude 不持久化 Session](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent-claude-code/src/run.ts#L325)、[官方 Team 的严格基础字段](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/agent-team/src/projection.ts#L101)。完整正反例和 Ultra 对应源码见三个专项报告。

**可以减少的是下一步基础层投入，不是立即删除现有五个 Ultra 包。** 目前没有取得“官方完整语义覆盖、所有调用者可迁、旧数据可恢复”的整包删除证据。低层请求、进程、传输和 UI 基础可以逐项收敛，但不能把非等价 one-shot adapter 包一层就假装成 durable Team provider。

### 本次新版真正值得跟进的变化

重点是 Session 3 的 system-message／引用迁移、持久读取的返回值与准备／发布分离、Subagent 的人类 queue／steer 控制、stream 读取 helper、原生依赖／清理和生成协议调整。Preset、Skills、审批、工作流与普通 Team 的大量核心逻辑在旧官方基础已经存在；Persona 的组合和上下文预算等局部演进应按实际调用处适配。详细端点对照见专项报告，不把新文件拆分或 release 标题本身计为新产品能力。

## 3. 真正值得保留和发展的机会

这些是源码差异支持的技术机会，尚未验证用户规模、付费意愿或市场壁垒。

### 第一优先：可发布、可回退、可追溯的员工定义

把“配置能运行”提升到“哪个版本允许投入使用、已运行员工究竟绑定哪个版本”。核心仍是 Profile → Candidate → Eval → 显式 Active → Binding → Run 这条关系；官方管理可执行配置，Ultra 管理版本与发布决策。优先让已有闭环简单、可靠、能从真实用户任务证明价值，不扩展第二套配置运行时。

当前限制要说清：我们的环境 fingerprint 只覆盖已建模的工具名单、限制与 fixtures 等输入，不覆盖所有 Skill／AGENTS／Preset 内容、工具实现或远端模型权重。后续机会是补齐**受控依赖身份与变更失效规则**，而不是宣称已有评测完全可复现。[现有环境指纹](../../packages/domain/src/evaluation.ts)、[门禁选择](../../packages/domain/src/evaluation-workflow.ts)。

评测框架存在也不等于两个 native 已具备隔离评测能力。当前 [Codex](../../packages/codex/src/index.ts) 和 [Claude](../../packages/claude-code/src/index.ts) 的发货声明不含 evaluation、native fork 或 exact-call approval；这些都不能由“full-collaboration”标签自动推出。是否补齐，先看真实产品任务需要，不一并塞进 Harness 升级。

### 第二优先：真实可恢复的跨 native 协作

价值不是出现两个后端名称，而是同一员工跨工作轮次和重启保留身份、按实际成员权限协作、丢回执不重复改任务、结果能追溯到原工作。现有 grant／receipt／recovery 是支撑这件事的实现成本，不适合继续拆成用户感知不到的新功能清单。

先完成选定目标上的 #44，证明这项差异在真实 Codex 和 Claude 上成立。若真实需求只是一轮代码检查，官方 one-shot 已可能足够，不应为此强制安装全部 durable 协作层。写代码能力另作产品和权限决策，不能从“完整协作”偷换为“任意执行”。

### 第三优先：统一但不过度复制的协作观察入口

保留 Studio 的员工／版本／运行／评测关系，以及 Team 内的消息中心和 DAG。官方拥有 Team 事实和导航，Ultra 提供产品级关联与少量必要展示；避免复制整个聊天、设置、技能、文件浏览和工作流 UI。现有 graph 是任务状态视图，不应继续长成第二套调度系统。

建议优先考虑的后续增量是 Profile 导入／导出、可校验依赖引用及脱敏证据导出。secret-reference 只引用本地配置身份，不运送凭据。托管 worktree、通用长期记忆和公开市场交付保持条件性 backlog，不因官方有相近目录或第三方插件就默认进入本轮范围。

## 4. 已开发代码如何迁移

| 现有资产 | 保留什么 | 迁移边界 |
| --- | --- | --- |
| `profile-lifecycle`、storage、spec | Revision／fingerprint／Head CAS、发布与历史数据 | 不把原 Revision 降级为可变 Preset id；不因 Harness 换版无故新建 Ultra generation |
| `profile-capabilities` | 精确 child scope 的 persona、上下文、工具限制和安全规则 | 对齐新的 Agent／system-message 组织方式；继续调用官方能力入口，不复制其实现 |
| `launch-workflow`、Binding | Launch Request ID、不可变 Revision、成员与原 native handle、selected／resolved route | 先 Team 对账再修 Binding；重启不得用“重新创建”冒充恢复 |
| `runtime`、Codex／Claude adapters | catalog 与执行注册共同生命周期、真实 capability、grant、receipt、精确中断与恢复 | 只保留 provider 产品协议和持久协作职责；新官方 one-shot 可参考，不能直接替换 |
| `run`、`run-workflow` | 每项已接受工作一个 Run、来源关联、脱敏和 completeness | 消费 v3 与官方 helper；保留失败 attempt、权威 message usage 和累计 native 用量去重 |
| `evaluation-workflow` | 独立 Eval Set／Run、非 roster worker、显式 Promotion Gate | 保留历史结果但重新确认新目标资格，不能把旧成功结果自动当新环境通过 |
| Studio／TeamMessageCenter／维护 DAG | 已验收交互、草稿／同请求重试、baseline／旧代际隔离、Fiber 清理 | 使用正式 Typert 生成和公开 Slot／Remote；不导入其他 UI 的私有实现 |
| prepare／compatibility／pack／migration 脚本 | 一个锁定来源、加载前拒绝、隔离数据、完整安装卸载 | 适配 v3 真正的准备／发布流程与新增依赖闭包，保留旧支持线与历史安装样本 |

以上沿现有职责收口，不要求为了升级新增通用多版本框架或拆新包。必要的 Team 扩展仍由原 Team 所有者统一验证／提交；不得另建 roster、伪造 DSH Agent 或在边上代理替换 `agentTeams`。[当前补丁清单](../reference/harness-patch-ledger.md) 是候选保留项，不是所有历史补丁永久保留的命令；每项只有找到等价官方契约并验证所有调用者后才可删除。

### 六个必须先解决的迁移边界

1. **外层 Session 3 不等于内部 Team 格式兼容。** 官方未分类我们的 `team/native-operation/committed` 和 `team/message/request-committed`，普通 Team schema 也没有所需 route／externalRuntime／native 关联。必须显式维护所需 codec／词汇／投影，不能丢字段、标为 ignorable 或伪造完成标记。
2. **官方自己的历史 Team 也要做负控。** 本轮内存实验中，V2→V3 admission 接受基础 `team/member` payload 1，却拒绝相同基础字段的 payload 2；后者是当前 Team writer 使用的版本。这个结果只证明具体 admission 路径，尚不是完整 JSONL 升级复现。新候选应先覆盖基础 Team 1／2、维护 native 3／4、message request 1 和未知未来格式，不能先承诺“官方旧会话都能升级”。[转换入口](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-format-v2-to-v3/src/payload.ts#L42)。
3. **逻辑读取与物理发布已分开。** 官方只读 open 可以返回准备好的新表示，write open 才在取得 lease 后发布 successor。当前 [Ultra 准备脚本](../../scripts/migration-prepare.mjs) 依赖 read 的旧发布行为且硬编码版本 2；只改常量会遗漏真实目标文件发布。未来也只能在隔离副本上显式发布，绝不能对用户源目录做写开。[官方 open](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-persistence-jsonl/src/index.ts#L335)。
4. **读取载体、协议生成和请求语义要跟随 owning source。** `SessionHandle.read()` 已从事件数组改为 `{ events, eventState }`，而 [当前冷恢复读取](../../packages/domain/src/run-workflow.ts) 仍直接对返回值 `slice()`；这是明确的 API 适配点。Typert context adapter 接口也发生收口，Agent Loop 的 system prompt 进入 messages 首条 system-role。`expandAssistantStream` 没被删除，不能因为某个底层请求不再设置 `options.system` 就判定员工 persona 丢失。按新公开入口验证并正式重生，不手改生成物。[新读取契约](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-persistence/src/handle.ts#L22)。
5. **Persona 的注册名称变了，编译通过不代表员工身份提示保持不变。** 官方由 `deployment:persona` 拆为 `deployment:persona-prefix`／`deployment:persona-suffix`，Ultra 仍使用旧名。同名遮蔽不能自动跨不同名称生效，须检查实际组装后的 prompt，避免新默认 Persona 和旧员工提示意外并存，也要保留正确工作目录上下文。本轮只是定位适配风险，未运行实际模型验证。[官方 Persona](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/preset/persona/src/index.ts#L58)、[当前安装逻辑](../../packages/domain/src/profile-capabilities.ts)。
6. **不要把 Harness 与两个 native SDK 升级捆成一个未知变量。** 当前 Ultra 是 Codex 0.149.1、Claude SDK 0.3.241／payload 2.1.241；官方 one-shot 包分别依赖 Codex 0.153.4 和 Claude SDK 0.3.263。建议先保留已审计 native 选择完成 Harness 迁移；确需新 SDK 时再单列其 handle／历史证据／工具协议资格，不仅比较版本号或类型。

### 数据迁移次序（尚未执行）

1. 先确认必须保留的数据，默认保护全部现存资料；识别实际 writer／格式，不仅看包版本。获得可一致复制的离线或受控静止输入，并保留原环境和匹配旧程序。
2. 在独立目标中转换整个 Session 关系及维护 Team 事实，保留父子关系、成员、任务、消息、回执、原生关联与可证明时间。不从新版空目录重新创建旧员工。
3. 迁入原 Profile／Revision／Binding／Eval 历史；从转换后权威日志重建 Team checkpoint 和 Run Index，不把旧 cache 当新日志事实，也不复制原始 native transcript。
4. 校验原身份与内容，跑中断重试／冲突／缺实体拒绝；目标完成前关闭业务写入，完成标记最后提交。新执行环境的评测结果需要重新取得资格，历史记录继续可查。
5. 实际安装后验证 Host、生成 Remote、发货 Studio、冷恢复和卸载，再提出切换支持锁。保留源资料只支持按明确边界回到旧快照；目标产生新工作后，不能无损双向写回旧格式。

## 5. 未开发工作怎样重新规划

GitHub 本轮回读：**#19–#43 全部 CLOSED，只有 [Spec #18](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18) 与 [#44](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/44) OPEN**。[PR #63](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/63) 已于 `2026-09-09T05:30:02Z` 合并。旧 TODO 中“继续 #39–#43”已在本地标为历史，不重开已完成 Issue，不修改它们过去的验收结论。

### 先选路线

| 路线 | 适用目标 | 代价与限制 |
| --- | --- | --- |
| 保留完整产品，移植必要扩展（本报告建议的短期路线） | 现有员工、native 连续身份和协作功能必须保留 | 仍维护一份有明确清单的 Harness 补丁；是否能进一步缩小须用实现与回归证明 |
| 完全不改官方，重新定义较小产品 | 零 fork 比现有完整协作更重要 | 当前并无现成的兼容模式；须重新设计公开接口边界，明确不支持的功能与旧 native 资料的归档／只读方式，不能假称原 Spec 无损完成 |

这不是现在就让用户选择新代码实现。尚未回答的两个问题是：必须保留哪些实际数据，以及“完整功能”与“完全不改官方”发生冲突时优先哪一个。未得到新决定前，保留全部资料和当前运行锁。

### 若确认保留完整产品并跟进 0.1.5，建议三个 PR 边界

1. **范围与验收计划 PR（文档）。** 确认目标／非目标、保留能力清单、数据输入和新的兼容矩阵；按用户授权补充 Spec／ADR 与 Issue 依赖。旧 #39–#43 是已完成的 0.1.3 集成，新增差异另跟踪，不改写旧验收。此 PR 不切运行锁。
2. **完整 0.1.5 集成迁移 PR。** 在隔离的集成工作树处理必要 Team 扩展、v3 历史 codec、物理发布、Run／Client／生成物／包闭包。其内部 Issue 只做相关定向验证；最终候选集中跑完整验证与历史升级，全部通过后才允许提出合并／支持锁切换。不要把不具备完整数据迁移的中间包先发货。
3. **#44 真实产品验收 PR。** 对最终选定且完成自动化资格的打包候选，集中执行真实 Codex、Claude、DSH 双向消息／任务、native↔native 往返、消息中心／DAG、原身份重启、精确中断／替换与卸载。记录实际 SDK／payload／认证条件；没有环境就明确未验证，不能由替身补齐。

如果决定暂不升级，保留现在 C 线并在恢复开发授权后只完成其 #44 即可；不要为了重新规划凭空重做 25 个已关闭 Issue。若选择 stock-only 路线，则先重写并确认范围，不能沿用上面的“完整保留”迁移 PR。

### 延续 Issue 轻量、PR 集中验收

- Issue 当次运行受影响的来源／类型和定向测试；权限拒绝、事实丢失、取消／恢复、迁移中断与源数据保护的关键负控随改动运行，不拖到最后才发现不可恢复的问题。
- PR 集中复用少量公共旅程：员工发布／启动；DSH↔native 协作与去重；历史迁移→冷恢复→Run／Studio；provider／Fiber 替换→卸载。每个旅程同时映射多条 AC，正常冒烟和失败状态冒泡都检查。
- 固定候选只做一次完整收口，而不是每个 Issue 重复全仓／归档／双 native 旅程。若代码、依赖、SDK、锁或验收输入有实质改变，重跑受影响部分并让最终完整门禁覆盖新候选；不是“运行一次后永不复验”。
- #44 对新目标必须真实重做，不能拿旧基线的自动化或 source-level 小实验替代。仅研究／文档变更做链接与 diff 检查，不为本轮启动完整产品测试。

## 6. 本轮执行与未执行

- 已执行：固定 Git 身份／差异和 live Issue／PR 只读核对；官方与 Ultra 源码及已有测试审读；当前支持源 `pnpm context:check:strict`，648 PASS／0 warnings；官方 V2→V3 的基础 Team 与两类维护扩展内存 admission 检查。后者不打开 Session／Storage，不调用模型，复现命令与结果见迁移专项。
- 文档复核：四份研究报告及 HANDOFF／TODO 的 96 个本地链接、238 个固定源码引用（180 个不同 Git 对象文件）均通过目标／行号／引用定义检查，空白检查通过。修正过一处来源链接行号越界；这不是新官方运行资格。
- 仅作为历史证据：PR #63 的 452 tests、实际归档／Studio／恢复／卸载与三组历史升级，详见 [联合验收](../evidence/pr63-studio-acceptance.md)。这些证明旧固定候选，不是 0.1.5 已通过。
- 未执行：新官方 build／install、完整 reader 或数据迁移、真实 native 登录／旅程、运行锁切换、产品代码修改、Issue／PR 改写、提交／推送、worktree／stash 清理或外部通知。
- 本轮只新增本地研究文档并更新根 HANDOFF／TODO。`research` 使结论按 primary source 分工留证；`dsh-plugin-dev` 限定公开契约与升级资格；`codebase-design` 使建议按职责复用和收口，而非新增通用引擎或多层包装。
