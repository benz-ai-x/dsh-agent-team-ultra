# 官方 0.1.5：Session、持久化、流式协议与本地交付迁移研究

日期：2026-09-09。用途：重新规划 Ultra 迁移，开发暂停期间的源码研究；不构成支持锁晋级、数据迁移执行或 npm 发布资格。

## 结论与证据边界

**不能直接把 Ultra 的支持源切到官方 0.1.5，并让官方打开维护 fork 的历史数据。** 官方已经提供 Session 0→1→2→3 的完整相邻转换链，但它只转换已审计的历史词汇和字段。维护 fork 的固定路由、durable native metadata、native operation 3/4、message request 1 既没有被这条官方历史边完整接纳，也没有被官方当前 Team 投影完整实现。Session 格式、Team payload、Team 投影、Ultra sidecar 与 native SDK 是独立兼容维度。[官方 catalog][O1]、[历史源准入][O2]、[官方 Team schema][O3]、[维护格式锁][U1]

本报告以以下三个固定身份为准：

| 对象 | 固定身份 | 本报告解释 |
| --- | --- | --- |
| Ultra | f84584def627b4af78a029af8788de73da0ad567 | 当前 main；phase-c.v1，Session 2、Team payload 2、projection 7、native operation 4、message request 1、Ultra v1 |
| 维护 Harness | /root/workspace/batch4-upgrade.VkSXdm/harness，3c38b1d4e8bf219750203e44b1df033ced754e92 | 0.1.3-alpha.1；官方 d347e703 上的已维护扩展 |
| 官方 Harness | /root/workspace/deepseek-harness，5dda764ed3aa172535a7967b06ff95d9cbfe536a | 0.1.5-alpha.1；产品源码按此提交分析 |

官方目录的 10 个未提交文件是用户的构建修复：package.json、pnpm-lock.yaml、packages/client/tsdown.client.ts、scripts/client-bundle-purity.spec.ts，以及 6 个构建文档。涉及这些文件的正式接口判断使用 git show 5dda…:PATH；dirty 修改仅作为环境事实，不被纳入“官方已发布”或“干净源码可构建”的证明。修复增加 unrun 依赖，并规避配置加载时嵌套模板字符串影响 import.meta.url 的问题；本次没有修改它们，也没有执行构建。[官方提交的 manifest][O4]、[官方提交的 Client preset][O5]

方法是固定源码与测试源对照，另运行了一次不创建产品文件、无 Context、无存储打开的内存 admission 检查。没有读取凭据、真实 Session 或 native history；没有 install、build、重型测试、Issue/PR/git 修改。主任务此前已完成 648 strict / 0 warnings 环境前置；本报告不会把该结果算作 0.1.5 的运行资格。

## 1. Session 3 实际改变了什么

相邻 2→3 转换不只是改 header.version。它把 request/header.header.system 提升为独立 system/message，必要时生成确定性 message id；step 首次进入时建立受保护的 system head，后续变更替换该 head。额外事件改变 Session seq，所以同一 artifact 内的 surface/source references、compaction 引用、title messageSeqs 与 inherited cut 都需要重映射；Session id、业务 message id、turn/step、workflow 的 owner-local seq、历史跨代捕获保持原本意义。[转换 stage][O6]、[引用映射][O7]

同时发生三类外部可见变化：

- surface replacement 字段从 start/end 变为 startSeq/endSeq；当前 surface 事件必须带 surfaceOp，assistant/message 不再允许 sourceEventSeqs。
- 历史 agentPreset 的 code→ptc、tool/code-dispatch(-start)→tool/ptc-dispatch(-start)，仅按明确归属的位置转换；不是遍历任意 JSON 字符串替换。
- loop-built GenerateOptions 通过 messages 中的 system-role message 携带系统提示，options.system 留给 one-shot 调用；request/context 增加 systemPromptUpdate，只有具体 prepared route 声明 in-history 才能采用相应系统提示更新策略。[Session 类型][O8]、[精确改名][O6]、[LLM 请求契约][O9]

因此 Ultra 的 Run id 可以继续由 Session id + turn 确定，但所有按 Session seq 保存的缓存/引用必须随正式转换处理。检查 persona/context/hooks 的测试不能继续仅观察 options.system；应比较最终 provider 请求中实际生效的 system messages，尤其是 cold resume、fork 和路由改变之后的请求。[Run id][U2]、[LLM 请求契约][O9]

源码明确保留无法安全转换时的拒绝：例如 surface 出现在首个 step 之前、系统提示在没有打开的 step 时改变、未知 message source/content、无法审计的引用或生成 id 冲突。完整相邻链意味着“存在转换实现”，并不承诺每份历史日志都能升级。[stage 的拒绝条件][O6]、[content/source admission][O2]

## 2. required/ignorable、历史 codec 与 Team payload 必须分别验收

### 2.1 三层读取边界

1. **物理 codec** 解析 header、dense seq、压缩或紧凑记录与 inherited provenance。
2. **历史结构转换** 判断每种源事件是否已分类，校验完整字段并重映射引用。V2→V3 对未在 RELEASED_V2_EVENT_DISPOSITIONS 中的类型直接报 unclassified；标记 ignorable 也不赋予跨代结构转换权限。
3. **当前 vocabulary 与 owner fold** 再判断 installed event types、Session 语义与 Team 业务状态。当前同代 unknown ignorable 可以保留为 opaque，但未知 required 不能被当作可截断损坏；知道一个类型名也不能代替 Team schema 与状态转移验证。[V3 codec][O10]、[V2→V3 源准入][O2]、[当前 vocabulary restore][O11]、[官方 Team 投影][O3]

官方生成的 KNOWN_SESSION_EVENT_TYPES 只有 team/member、team/task、team/message/queued、team/message/delivered 四个 Team 类型，没有维护 fork 的两个 committed receipt 类型。TypeScript 声明合并只增加静态类型，不能给 build-static catalog 注册一种历史语义；把原子回执标为 ignorable 会破坏幂等与恢复事实，不能采用。[官方词汇][O12]、[维护事件定义][M1]、[ADR 0026][U3]

### 2.2 格式与字段差异

| 数据维度 | 维护 3c38b1d4 | 官方 5dda 当前 reader/fold | 迁移判断 |
| --- | --- | --- | --- |
| Session header | 2 | 3；历史链 0→1→2→3 | 必须真实转换，不能原样改 header |
| Team 基础 payload | 2 | 当前四类事件为 2 | 相同数字不代表相同字段 |
| Team member 路由 | requestedRoute、resolvedRoute | member strict schema 没有这两个字段 | 直接进入官方 Team fold 会失败 |
| durable native metadata | externalRuntime，含 launchRequestId、requestFingerprint、requirements、nativeHandle、initialTurnId | member strict schema 无 externalRuntime | 不能降为普通 continuable member 来保留语义 |
| native-operation/committed | 读取 3/4；4 区分 message/task，携带原子 receipt | 未列入官方词汇和 Team fold | 官方历史转换拒绝；不能丢弃回执 |
| message/request-committed | 1，原子保留 request、reply、queued message | 未列入官方词汇和 Team fold | 官方历史转换拒绝；重放去重不能靠 UI 恢复 |
| message/delivered | 可带 nativeTurnId | 当前 strict schema 仅 version/teamId/messageId/targetId | 删除会丢失具体 native work turn 关联 |
| Team projection | stateVersion 7 | stateVersion 3 | 旧 checkpoint 无法证明目标 fold |
| subagent descriptor | 3 | 3，字段逐文件对照一致 | 可保留其独立身份；不足以补齐上列父 Team 元数据 |
| projection cache envelope | 7 | 7 | formatVersion 2→3 仍导致失配，不能因 envelope 数字相同沿用 |
| Ultra Storage Generation | agent_team_ultra_v1 / 1 | 官方 Session 不拥有此领域 | 需要 Ultra reader 与联合一致性检查，不属于官方 Session 自动迁移 |

证据：[维护类型与 native 关联][M1]、[维护 strict member/native schema][M2]、[维护投影版本][M3]、[官方 strict schemas 与版本选择][O3]、[官方 descriptor 3][O13]、[cache spec][O14]、[Ultra sidecar][U4]。

### 2.3 官方 Team 历史还有一个应先查清的窄风险

官方当前 Team writer/projection 使用 payload version 2，但 V2→V3 的 assertEvent(event, 2) 会在任何重映射之前调用 frozen assertReleasedPayloadSemantics。后者对四个 Team 类型均调用 teamSelector(data, label)，此函数没有接收外层 version 参数，且只接纳 data.version = 1。检查了三个相邻 migration 文件，未见在此前把 Team payload 2 改成 1 的分支；V3 的原生同代 payload 路径与该历史源准入不同。[源 admission 调用][O2]、[frozen Team selector][O15]、[当前 Team payload 2][O3]

一次最小内存检查直接 import 官方 packages/session/session-format-v2-to-v3/src/payload.ts，并调用 assertEvent(event, 2)。四个输入仅用于定位 admission：

| 输入 | 结果 |
| --- | --- |
| 基础 member shape，Team payload 1 | 通过 |
| 同一基础 member shape，Team payload 2 | 拒绝：team/member 0 version must be one of 1 |
| team/native-operation/committed，version 4 | 拒绝：cannot safely transform unclassified event team/native-operation/committed |
| team/message/request-committed，version 1 | 拒绝：cannot safely transform unclassified event team/message/request-committed |

这些结果证明当前源函数的 admission 行为，**没有证明完整 JSONL reader、真实历史数据或官方发布二进制上的端到端复现**。两个未知类型的 fixture 只提供最小 payload，因为拒绝发生在读取 payload 细节之前。下一轮应分别用官方基础 Team payload 1/2 和维护完整事件做真实 reader fixture；不能先把所有“官方旧日志”列为已兼容，更不能把 payload 1 源准入成功当作当前 payload 2 Team 投影成功。

可复现命令（工作目录 /root/workspace/deepseek-harness；使用现有 tsx，不安装依赖；排版成多行，逻辑与本次执行一致）：

```bash
node --import tsx/esm --input-type=module -e '
import { assertEvent } from "./packages/session/session-format-v2-to-v3/src/payload.ts"
const member = {
  id: "fixture-member", name: "fixture", description: "",
  provider: "spawn", context: "fresh", phase: "provisioning"
}
const cases = [
  { name: "stock-team-payload1", type: "team/member", data: { version: 1, teamId: "fixture-team", member } },
  { name: "stock-team-payload2", type: "team/member", data: { version: 2, teamId: "fixture-team", member } },
  { name: "maintained-native4", type: "team/native-operation/committed", data: { version: 4 } },
  { name: "maintained-request1", type: "team/message/request-committed", data: { version: 1 } }
]
for (const item of cases) {
  const { name, ...value } = item
  try {
    assertEvent({ ...value, seq: 0, time: 1 }, 2)
    console.log(JSON.stringify({ name, admitted: true }))
  } catch (error) {
    console.log(JSON.stringify({ name, admitted: false, error: error.message }))
  }
}'
```

本次输出：

```jsonl
{"name":"stock-team-payload1","admitted":true}
{"name":"stock-team-payload2","admitted":false,"error":"team/member 0 version must be one of 1"}
{"name":"maintained-native4","admitted":false,"error":"format v2 to v3 cannot safely transform unclassified event team/native-operation/committed"}
{"name":"maintained-request1","admitted":false,"error":"format v2 to v3 cannot safely transform unclassified event team/message/request-committed"}
```

## 3. JSONL reader 的新行为会直接影响 Ultra 现有迁移 operator

首先存在独立的 **API 返回形状断点**：SessionHandle.read() 不再返回事件数组，而返回 SessionHandleReadResult，即 { events, eventState }。events 是调用方拥有的外层数组，eventState 明确事件值为 detached 或 shared-frozen；不能丢掉这个所有权标记后假定所有事件值可原地修改。对应的 RestoredSessionOptions 也用 eventState 替换旧 seedSource: 'persistence'。[read 结果契约][O43]、[Session seed 所有权][O44]

Ultra run-workflow.ts:142–153 当前把 await handle.read() 直接赋给 events 并调用 events.slice()；migration-prepare.mjs:47–51 也把整个 read 返回值当事件数组保存。迁移时应显式解构 events，再交给 Run/Team fold；需要构造 restored Session 的路径应继续传递 eventState。这是读取当前原生 v3 文件时也会遇到的 API 不兼容，独立于下面的历史文件发布语义，不能只改 Session 版本常量来解决。[Ultra cold Run reader][U22]、[现有 operator][U5]

官方 open(id, 'read') 现在允许在内存中 prepare 历史转换，返回逻辑当前事件而**不发布 successor 文件**。open(id, 'write') 才先取得单写 lease，再 publishStoredMigration 并开放写 handle。源码还按源文件 revision 合并准备工作、对取消与源变化进行处理；失败保留源代文件。[JSONL open][O16]、[prepare/publish][O17]

Ultra migration-prepare.mjs 当前在私有副本里只 open(..., 'read')，随后硬编码要求 handle.header.version === 2，并依赖旧实现使副本中的 Session 得到当前物理代。迁到 0.1.5 时，仅把常量 2 改成 3 不够：逻辑 header 已是 3，待发布的数据目录仍可能只有 session.v2.jsonl。[现有 operator][U5]

必须保留“只转换私有副本→确定性发布独立目标→最后完成 manifest”的边界，并在副本中使用经确认的显式写 open/close，或官方 prepare + publish 接口，确保实际生成 v3 successor。之后通过新进程/新 Context 的目标 reader 打开真实文件，检查物理 header、完整事件、inherited cut、源摘要不变与目标再次启动无新迁移。不能靠 reader 内存视图证明物理发布完成。[官方 generation API][O18]、[联合迁移 ADR][U6]

官方 read 的副作用缩小是可利用的改进，但 Ultra 当前审计还要读取 SQLite DB/WAL、sidecar、Team fold 与跨数据集身份。它并不因此可以退化为 list()/stat() 的标题或 header 检查；列表可能遗漏不可读 Session，cache service 还存在派生状态写回。源数据审计仍使用冻结快照/私有副本与摘要保护。[审计入口][U7]、[ADR 0027][U6]

## 4. Checkpoint、Run Index 与 Ultra sidecar 的保留策略

官方 session_projcache envelope 仍为 7，兼容接纳 3/4/5/6 的可读结构，但 identityMatches 要求 formatVersion 相等，再检查 createdAt/cwd/isSeeded/inheritedEventCount。row.ver 与注册投影的 stateVersion 还要一致，超出日志末尾的 checkpoint 不能当作有效前缀。缺失、旧格式或错误状态从权威日志冷重建；读取到旧标题 hint 只说明能展示旧标题，不说明可以据此恢复 Team。[cache 身份判断][O19]、[cache 版本语义][O14]、[projection restore][O20]

迁移目标应丢弃副本中的旧 checkpoint 后重建，原源文件保留。尤其不能把维护 Team projection 7 的 val 塞进官方 projection 3；即便给它新的 row.ver，丢失的 receipt/native/route 语义也不会出现。现有 Ultra 审计已经比较真实 prefix fold 与缓存 val，保留这条检查。[checkpoint 审计][U7]、[重建逻辑][U5]

Ultra sidecar 的 Profile Heads/Revisions、Binding、Eval Sets/Eval Runs 由 agent_team_ultra_v1/1 拥有；包版本和 Session 格式提升本身不要求新建 Ultra v2。Binding schema 同时校验 launch identity tuple、所选/预检/实际 route、native handle 与 provisioning phase，不能只 copy JSON 之后视为业务可恢复。[sidecar schema][U4]、[一致性检查][U8]

完整历史迁移应保存 Profile revision/fingerprint、Head CAS、Binding、Team/member/task/message id、原始 timestamps、launch request、native handle/turn correlation。Run Index 是可重建派生数据：DSH 由 child Session 的 own suffix 重建，native 从父 Team 的 active member 与 delivery 事实恢复 bounded 索引。native SDK 没有提供可验证终态时继续标记 incomplete/unavailable，不从“投递成功”推断“任务完成”，也不借迁移时间伪造 endedAt。[Run rebuild][U9]、[native 关联 fold][U10]、[ADR 0027][U6]

可行迁移路线必须先选择其信息保留范围：

| 路线 | 可保留与新目标行为 | 进入实施前的条件 |
| --- | --- | --- |
| 保留完整业务状态 | 保留全部 sidecar 和 Team/native authoritative facts，按 Session 3 重建投影/Run | 官方基线加有明确所有者的必要 Maintained Extension，或者先使相同正式能力进入官方；历史 inventory、codec、vocabulary、Team fold 同时具备 |
| 仅迁可复用配置 | 复制经校验的 Profile 定义/Revision、Eval Set 定义到新目标；重新 preflight/激活/启动，创建新 Team、Binding、Launch Intent | 明确这是新部署，不承诺旧成员/native 会话连续；原 sidecar、Session、SDK 数据及其 reader 留在原数据集供审计 |

“仅迁配置”不应直接复用旧 active Binding、Run Index、Promotion Gate 或旧 Migration Manifest 的 complete 标记。若 route/capability 变化影响 Profile 指纹，创建新 Candidate Revision 并重新评估，而非改写旧不可变 Revision。旧 Eval Run 可留作旧环境历史，不能成为新环境的通过依据。该路线更容易避开维护 Team 数据格式，但并不自动补齐新目标缺少的运行能力。[Profile/Binding 约束][U8]、[环境与 Gate 迁移规则][U6]

这两条路线都不授权 stock/旧程序与新目标双向写入；旧 native 自有数据和认证也不属于官方 Session 转换链。[ADR 0027][U6]

## 5. Run usage：保留事实模型，局部替换解包开销

Ultra 已经消费 Session 2 的 assistant/attempt 与 assistant/message，并没有停留在顶层 assistant/chunk。run.ts 在每个 settlement 完整 expandAssistantStream，检查最后一个 chunk 是否 finish，再取该 attempt 最后一次 usage；assistant/message.data.usage 优先，多次 retry attempt 加总为同一 Run。[Ultra fold][U11]

官方 0.1.5 **没有移除 expandAssistantStream**。它新增 lastAssistantStreamChunk、assistantStreamChunks、first-token/visible-content helpers 与 assembleAssistantStream，以 record 为单位回答常见查询。官方 token-meter/turn-usage.ts 与维护基线的差异主要是把展开扫描换成 lastAssistantStreamChunk；deriveTurnTokenUsage 的完整生命周期/精确计数原则此前已经存在。[展开器与 reader][O21]、[官方 usage fold][O22]

适合 Ultra 的切口是只改 run.ts 的“usage/terminal 取样层”，保持 Run 身份、timeline、partial total 与 incomplete 语义：已由 durable reader 完整验证过的 stream 可以直接倒序查 raw usage；未受信的记录仍需要边界验证。官方 helpers 明确不负责校验。检查 finish 时不能仅以“历史上某处存在 finish”替代“最后一个有效 stream member 为 finish”，否则 finish 后异常尾部会被误判完整。[reader 信任前提][O21]、[当前末尾校验][U11]

也不宜把 deriveTurnTokenUsage 原样替换 Ultra 的 fold：官方函数对 incomplete attempt、缺少生命周期、矛盾 total 等返回整体 unavailable；Ultra 已提供“已结算 attempt 的部分用量”，并在 total 不可确定时仍保留 input/output，已有公开 Host/Remote 测试明确要求此行为。重新选择产品语义属于另一个决策，不是升级 helper 的顺带改变。[官方完整计数规则][O22]、[Ultra v2 usage 验收][U12]

实时 agent/assistant-stream 仍是 process-local 的 start/chunk/end，具有 attemptId、revision、index；end 在 durable assistant/message 或 assistant/attempt 提交后指向其 seq，或者报告 abandoned。它是展示与重连事实，不能混入权威 Run fold 再计数一遍。[Agent stream settlement][O23]

## 6. SDK、Remote 与 Client 订阅的实际差异

### 6.1 Harness SDK 与 native SDK 分开锁定

逐文件比较维护基线和官方源码，packages/sdk/protocol/src/types.ts、packages/sdk/server/src/index.ts、packages/sdk/client/src/api.ts 没有差异。Harness SDK 仍是 initialize、session/prompt、shutdown 三类请求，以及 session.event/status、subagent.started/finished 四类通知；server 将持久化 Session event 原样作为 session.event 发布，并未把 Web transient assistant frames 加入该协议。[SDK wire][O24]、[SDK event publisher][O25]

因此低层 JSON-RPC/request shape 不需要凭空重写，但 session.event.event 引用的是当前 SessionEvent：system/message、surfaceOp 新字段、PTC 名称及 header/request 语义会随 Session 3 到达消费者。低层握手成功不等于旧事件 switch、历史 renderer 或 Run projection 已兼容；SDK 消费 fixture 要包含 v3 system message 与 compact attempt settlement。

native 产品是另一层变量：

| 产品 | Ultra 已锁定 | 官方 0.1.5 的 one-shot provider 依赖 | 本轮迁移建议 |
| --- | --- | --- | --- |
| Codex | @openai/codex 0.149.1，native payload 0.149.1-*，app-server-v2 | @openai/codex 0.153.4 | 先保留 Ultra 已审计版本；独立评估新协议与旧 durable handle 恢复 |
| Claude Code | @anthropic-ai/claude-agent-sdk 0.3.241，native 2.1.241 | SDK 0.3.263，@anthropic-ai/sdk 0.93.0 | 独立检查 query/resume、tools、turn identity、usage/terminal 事实；不从新版 one-shot 可运行推断 durable 恢复 |

来源：[Ultra native lock][U1]、[官方 Codex manifest][O26]、[官方 Claude manifest][O27]。同名 app-server 或 Agent SDK 不是协议资格证明；本次没有升级依赖或执行认证验收。

### 6.2 Typert 与 Session Remote

官方删除 TypertContextAdapter、TypertHostContextIdentity 和 context.identifyHost。Host adapter 只保留 wire、wireTypeSymbol、resolve，Client adapter 仍有 identity + resolve。Generator 新增包内 forwarding export 的追踪，继续要求跨包引用最终经过正式 package export。Ultra 没有必要自行恢复删除的 Host 反向识别层；生成器隔离工作区与 Agent facade 要按新实际声明重新审计，再重生成所有 Host/Remote artifacts。[Typert 当前 adapter][O28]、[generator forwarding][O29]、[Ultra generator][U13]

Session Controller 的核心 follow 模式仍是完整 opening snapshot，后接 ordered durable event，以及显式 opt-in 的 assistant-stream；control 仍以 baseline 开始。0.1.5 增加 Client 的 assertSessionWireEvent，对 history page/follow event 执行当前 envelope、surface metadata 与 event-local data 校验。旧 start/end replacement 不能继续通过宽松 cast 混入当前 Client。[Session follow 类型][O30]、[Client wire admission][O31]

Ultra 的 StudioSnapshot 全量替换流不应被改造成 token/event 增量存储。迁移重点是用新生成的 Remote 证明 exact live Agent 解析、首帧 snapshot、断线后重读、旧 generation 回调隔离，以及 Fiber disposal 后取消订阅；基础 Session 订阅的重连机制可继续复用。该建议遵循既有 Studio 与 Team watch 边界，而不是另外建一套 Client authority。[现有契约][U14]

## 7. 构建、Client bundle 与插件交付

官方提交已经采用 Host/Client 两个 build face：先 host tsc/tsdown，再 client tsc/tsdown。clientBundle 对不同 build face 返回不同产物，正式 Client pass 从 lib/types/client/index.js 消费 emitted JavaScript，并支持 hostPhase、companions、staticLinked 等明确边界。完整 build 还构建 native system/Web 并写 Client build environment record。Node 范围和 pnpm 11.7.0 与当前仓库要求一致。[提交 manifest][O4]、[提交 preset][O5]、[build orchestrator][O32]

Client 插件的运行时交付形式仍是 window.__ModuleLoader__.load({ id, factory }) 与注入 require 的 module table；generated /remote 可以内联，跨插件 singleton/DI 身份要 external，Host 实现不能进入浏览器。Ultra 的独立 preset 也使用这个 factory 形式，因此“新版官方构建调整”不意味着 Ultra 必须导入官方未发布的仓库 helper。应保留窄 compatibility preset，核对 platform external 清单、ModuleLoader/CSS 生命周期与 generated Remote 产物，只有在官方提供可消费的公开 build 包之后才考虑退役它。[官方 purity 边界][O5]、[平台 module table][O33]、[Ultra preset][U15]

**npm 独立闭包仍未成立。** 官方 agent-team、tool-agent-team、client-ui-agent-team、agent-team-profile、agent-team-web-profile 五个包全部 private:true，release/families.ts 明确跳过 private。官方 Codex/Claude one-shot provider 的 public manifest 不会让这组 Team 包自动公开；本报告未查询 registry，不能宣称所有 public peer 的 0.1.5 版本已可安装。[Team manifest][O34]、[tool manifest][O35]、[UI manifest][O36]、[profile manifest][O37]、[web profile manifest][O38]、[发布筛选][O39]

Ultra 当前本地归档应按 profile contribution 与依赖图推导，不能把历史 ADR 的“八包组成”写死为今天的包单。当前 profile 直接组合五个 Ultra 包与 Team Host/tool/UI 三包；本地 pack、真实 consumer resolution、Web/Studio 恢复与完整卸载仍然必要。本地八归档证明的是选定闭包，不是 npm 独立发布。[当前 overlay][U16]、[动态闭包][U17]、[pack 验收][U18]

## 8. 迁移实施切口与验证资产取舍

| 切口 | 保留资产 | 需要修订或有条件退役的部分 |
| --- | --- | --- |
| Compatibility Identity | prepare-harness、harness-source、check-harness-source、generate-compatibility、运行时来源准入 | 为新官方 commit 与明确维护扩展重新资格化；旧 phase-c.v1 与旧源码指纹不能被“版本改名”代替 |
| 合并数据集迁移 | audit-migration、migration-durable-files、源摘要、pending/complete、目标路径联合准入、JSON/SQLite 一致性 | read() 的 { events, eventState } 结果；migration-audit-plan 中 Session2 目标；migration-prepare 的只读发布假设；新增 v3 与 fork 事实的正式转换/拒绝分支 |
| Team 历史 reader | strict schema、原子 receipts、真实 projection、descriptor/route/native 联合校验 | 官方未吸收的扩展不能退役；投影缓存旧数据只在目标丢弃重建 |
| Run evidence | Run id、Binding correlation、redaction、partial usage、native terminal 时间和 completeness | v2 格式常量与 helper 层；stream 全展开仅在验证边界或确需每个 chunk 时保留 |
| Typert/Client | 官方 generator、外部工作区、普通浏览器消费验证、Studio 首帧与 generation/disposal 测试 | Agent facade 与导出映射按新版重审；不能继续沿用旧生成物或手改 codec |
| 交付/历史验证 | 动态归档闭包、锁定 CLI、隔离 DSH_HOME、一次真实安装/恢复/卸载验收 | 与旧 B/C 路线绑定的 hardcoded commit/版本预期改为清楚命名的历史 source fixture；已经由官方正式接口覆盖的替代逻辑可在等价验证后退役 |

具体可复用入口：[migration plan][U19]、[operator][U5]、[Run rebuild][U9]、[generator][U13]、[package closure][U17]、[pack gate][U18]。不能因为某条旧路径测试昂贵就删除其唯一保护；也不应把每个 Issue 都升级成“所有历史产品与所有归档重新构建”。

建议最小验证闭环分三层，任务中修改了哪一层，就先跑该层的相关检查：

1. **纯格式与消费 fixture**：官方普通 V2→V3；官方 Team payload1/2；维护 native3/4、request1、route/externalRuntime/nativeTurn；未知 required/ignorable；一个 fork inherited cut + compaction/title 引用。正例必须通过真实 catalog 与目标 Team fold，反例必须拒绝且源字节不变。usage 用 retry→settlement、缺 finish、partial total 三个关键场景验证不重复计数。此层不启动模型/native 进程。
2. **一个贯穿产品的合成数据集**：固定路由 DSH child、一名 native member 的持久回执与一条 reply；保存 Profile/Binding/Eval 历史，通过迁移→真实目标 JSONL reopen→JSON/SQLite sidecar→generated Remote→Studio，核对稳定身份、Run usage/completeness 与两个早期 smoke 中断点（pending、complete 提交前）。这两个点仅用于快速建立贯穿路径，不替代正式中断矩阵。错误必须到达用户可见状态，不能变成空列表。
3. **候选收口一次**：在干净、完成资格化的候选上跑现有 pnpm verify 和相关历史归档升级组合、真实安装/Web/恢复/卸载；保留现有 JSON/SQLite 每一个持久发布边界及 complete marker 两侧的中断/重试矩阵，不删减原迁移 AC。只在新修改或失败要求时重跑相关层。改变 native SDK 时再单独追加旧 handle/resume/settlement/取消/disposal 兼容验证；认证验收保持独立，不由测试 double 宣告完成。[现有逐发布边界矩阵][U21]

现成测试源可直接扩展为这些场景：[官方 migration 测试][O40]、[官方 combined catalog 测试][O41]、[JSONL publication 测试][O42]、[Ultra usage 测试][U12]、[Ultra migration execution][U20]、[Ultra interruption][U21]。这些测试文件本次仅阅读，未运行；唯一已执行检查是第 2.3 节的四个纯内存 admission 输入。

## 9. 本报告不覆盖的资格

没有证明用户 dirty 构建修复可在干净官方源复现；没有运行 v3 完整 JSONL 恢复、真实旧数据升级、pnpm build/verify、归档安装或浏览器；没有连接 Codex/Claude、执行模型请求、迁移 native 自有历史、更新支持锁或改变现有数据路径。报告中的迁移路线与最小闭环是下一轮开发/验收设计，而不是已完成结果。

保留完整状态的路线延续 ADR 0026/0027 的要求，但需要新的具体目标资格。仅迁配置是替代产品范围，若采用，应先把“不保留旧部署连续性”的决策写进新 ADR/迁移说明，再实施；本报告没有改变现有 accepted ADR 或 Issue 的状态。[ADR 0026][U3]、[ADR 0027][U6]

## 固定来源

[O1]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-format-catalog/src/generated.ts#L13-L31
[O2]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-format-v2-to-v3/src/payload.ts#L37-L171
[O3]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/agent-team/src/projection.ts#L67-L316
[O4]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/package.json#L1-L26
[O5]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/client/tsdown.client.ts#L55-L161
[O6]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-format-v2-to-v3/src/migration.ts#L11-L172
[O7]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-format-v2-to-v3/src/references.ts#L7-L50
[O8]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/core/session/src/types.ts#L296-L491
[O9]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/llm/llm/src/types.ts#L339-L447
[O10]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-format-v2-to-v3/src/codec.ts#L14-L85
[O11]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-format-v1-to-v2/src/validation.ts#L54-L102
[O12]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/core/session/src/known-event-types.ts#L55-L77
[O13]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent/src/descriptor.ts#L42-L85
[O14]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-projection-cache/src/spec.ts#L74-L105
[O15]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-format-v0-to-v1/src/payload-validation.ts#L994-L1007
[O16]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-persistence-jsonl/src/index.ts#L329-L405
[O17]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-persistence-jsonl/src/index.ts#L598-L676
[O18]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-persistence-jsonl/src/generation.ts#L940-L1007
[O19]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-projection-cache/src/index.ts#L395-L442
[O20]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-projection/src/index.ts#L472-L538
[O21]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/llm/llm/src/assistant-stream.ts#L196-L447
[O22]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/llm/token-meter/src/turn-usage.ts#L77-L258
[O23]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/core/agent-loop/src/assistant-stream.ts#L48-L107
[O24]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/sdk/protocol/src/types.ts#L64-L119
[O25]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/sdk/server/src/server.ts#L89-L109
[O26]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent-codex/package.json#L35-L48
[O27]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/subagent/subagent-claude-code/package.json#L35-L49
[O28]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/typert/protocol/src/types.ts#L367-L399
[O29]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/typert/generator/src/analyzer.ts#L879-L937
[O30]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/api/session-controller/src/types.ts#L435-L522
[O31]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/api/session-controller/src/client/session-wire-event.ts#L7-L46
[O32]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/scripts/build.ts#L31-L50
[O33]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/client/web/src/platform.ts#L7-L18
[O34]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/agent-team/package.json#L1-L5
[O35]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/tool-agent-team/package.json#L1-L5
[O36]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/client-ui-agent-team/package.json#L1-L5
[O37]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/agent-team-profile/package.json#L1-L5
[O38]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/experimental/agent-team-web-profile/package.json#L1-L5
[O39]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/scripts/release/families.ts#L122-L143
[O40]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-format-v2-to-v3/tests/migration.spec.ts#L211-L219
[O41]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-format-v2-to-v3/tests/combined-migration.spec.ts#L53-L68
[O42]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-persistence-jsonl/tests/generation.spec.ts#L335-L374
[O43]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-persistence/src/handle.ts#L22-L83
[O44]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/core/session/src/types.ts#L159-L184
[M1]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/agent-team/src/types.ts#L503-L530
[M2]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/agent-team/src/projection.ts#L101-L168
[M3]: https://github.com/benz-ai-x/deepseek-harness_x/blob/3c38b1d4e8bf219750203e44b1df033ced754e92/packages/experimental/agent-team/src/projection.ts#L428-L654
[U1]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/dsh-reference.lock.json#L14-L49
[U2]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/domain/src/run.ts#L80-L85
[U3]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/docs/adr/0026-preserve-team-identities-on-session-v2.md#L12-L42
[U4]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/domain/src/storage.ts#L204-L479
[U5]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/scripts/migration-prepare.mjs#L9-L94
[U6]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/docs/adr/0027-publish-one-isolated-migration-dataset.md#L12-L44
[U7]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/scripts/migration-audit-input.mjs#L220-L264
[U8]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/domain/src/storage.ts#L900-L976
[U9]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/scripts/migration-run-index.mjs#L5-L38
[U10]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/domain/src/run-binding.ts#L39-L57
[U11]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/domain/src/run.ts#L346-L406
[U12]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/domain/tests/v2-run-usage.integration.spec.ts#L33-L100
[U13]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/scripts/generate-typert.mjs#L29-L154
[U14]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/docs/agent/PROJECT_CONTRACT.md#L170-L192
[U15]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/build/client-bundle.ts#L54-L120
[U16]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/profile/cordis.patch.yml#L31-L93
[U17]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/scripts/local-package-closure.mjs#L24-L60
[U18]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/scripts/verify-pack.mjs#L20-L105
[U19]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/scripts/migration-audit-plan.mjs#L1-L29
[U20]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/domain/tests/migration-execution.integration.spec.ts#L1
[U21]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/domain/tests/migration-interruption.integration.spec.ts#L26-L95
[U22]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/domain/src/run-workflow.ts#L142-L153
