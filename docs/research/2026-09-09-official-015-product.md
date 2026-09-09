# 官方 DSH 0.1.5 产品能力与 Ultra 发布治理对照

调研日期：2026-09-09。此报告是固定源码审计；用户已暂停 Ultra 开发，下面的机会和迁移建议均未实施。

## 主要结论

官方已经承担大量基础能力：Agent preset 的发现、选择、复制与对话创作入口，Skills 的分层发现和调用，工作区导航，执行审批、沙箱、workflow 与 Ralph 循环。继续以“能配置 Agent、能用技能、能审批、能看任务”为 Ultra 的主要差异，会重复官方已有工作。[preset UI][o-preset-ui]、[Skills][o-skill-runtime]、[审批 UI][o-approval-ui]、[标准 preset][o-standard-workflow] 均有实际实现。

官方 preset 的进程内挂载代际不等于 Ultra 的不可变 Profile Revision、Head CAS、Activation/Rollback。官方 workflow/测试设施也未提供与 Ultra 相同的候选版本隔离评测和 Promotion Gate。Ultra 可保留的差异是：将员工定义、明确激活的版本、实际运行绑定、逐轮证据和评测准入连在一起；不是另造一套 Agent 执行平台。[官方代际实现][o-standing]、[Ultra 发布实现][u-release]、[Ultra 门禁实现][u-gate]

两项需要纠正的能力判断：第一，官方 `isolation: 'worktree'` 明确报“deferred”，Workspace 只收纳既有目录，不能据此删除 Ultra 的“等官方 ownership seam 后再做 managed worktrees”待办。第二，Ultra 的 `memory` 目前是版本化的人工整理文本块，不是自动学习/检索型长期记忆；官方已有第三方 memory MCP 接入参考，二者不是同一个功能。[worktree 拒绝测试][o-worktree-test]、[Workspace][o-workspace]、[Ultra 文本层][u-capabilities]、[memory 配置][o-memory]

## 取样、来源和限制

- 官方：`/root/workspace/deepseek-harness`，HEAD `5dda764ed3aa172535a7967b06ff95d9cbfe536a`，提交内根 `package.json` 为 `0.1.5-alpha.1`。当前能力链接固定到这个提交；增量对照另用旧基线 `d347e703908d0406b7a7ef80e3a0e594d86b2215`，不代表未来版本。[提交内版本][o-version]
- Ultra：`/root/workspace/dsh-agent-team-ultra`，`main` `f84584def627b4af78a029af8788de73da0ad567`。当前合格运行源仍是维护 C `3c38b1d4e8bf219750203e44b1df033ced754e92`、`agent-team-ultra.phase-c.v1`；本次没有重新准备源、修改 lock 或宣布 stock 可替换。[Ultra lock][u-lock]
- 官方工作树有十个用户未提交的构建相关修改：根 `package.json`、`pnpm-lock.yaml`、`packages/client/tsdown.client.ts`、`scripts/client-bundle-purity.spec.ts` 和六个构建文档。均保留；版本读取使用 `git show 5dda764e:package.json`，产品源码来自未修改文件。没有把这些工作树改动算成官方 HEAD 的能力。
- 本分报告排查 `packages/preset`、`skill`、`context`、`hooks`、`interaction`、`sandbox`、`workspace`、`workflow`、相关 API/Client、默认 composition、拥有者测试、snapshot/test-support 与 benchmark 入口。Team/native 和 Session 格式/交付资格由其他分报告详述。
- “已做”表示接口、实现及相关测试/发货组合在源码中可核对；“部分”表示相似但缺少关键语义；“未找到”只限定于上述范围和文中列出的搜索，不声称全库或所有外部插件绝不存在。
- 本次只读现有测试，没有运行官方或 Ultra 产品测试、构建、真实 provider、认证或迁移。仅执行了仓库要求的 `pnpm context:check:strict`：648 checks、0 warnings，仍指向维护 C。

## 从 d347 到 5dda：哪些是增量，哪些早就存在

本报告识别出的基础重叠，大部分不是 0.1.5 新增。对两个固定提交执行 `git diff --name-only`，以下核心范围结果为空：`agent-presets/src`、`skill/src`、`skill-filesystem/src`、`tool-skill/src`、`user-approval/src`、`permission-presets/src`、`workflow/src`、`workflow-worker-thread/src`、`tool-workflow/src`、`tool-ralph/src`、Workspace 的 `src/types.ts` 与 `workspace-controller/src`、memory MCP 示例。旧基线中已经能核对 [preset 代际][b-standing]、[Skills registry][b-skill]、[一次性审批][b-approval] 和 [worktree deferred][b-worktree]。hooks 两个 bridge 和 Workspace 主实现的差异仅为归档笔记链接注释，不是新增执行能力。

本范围真正需要关注的源码增量如下；Session V3、surface/inbox 所有权变化的完整迁移影响由 Session 分报告说明。

| 实际变更 | 用户能力 / Ultra 迁移含义 |
| --- | --- |
| persona 由 `text` / `deployment:persona` 改成 `prefix`、`suffix` 两个槽位；标准 preset 把 cwd 放在 suffix。[旧实现][b-persona]、[新实现][o-persona]、[标准组合][o-standard-planes] | 这是 prompt 组合接口变化，不是 Profile 版本治理。Ultra 目前仍注册旧 `deployment:persona`；按新 registry 的同名遮蔽规则，它不会自动覆盖新 prefix/suffix。后续须检查最终 assembled prompt 的身份、顺序、cwd 与重复内容，不能只确认 TypeScript 编译通过。[遮蔽契约][o-persona-shadow]、[Ultra 安装][u-capabilities] |
| Session reference 从默认固定 64 KiB 增为模型上下文相关预算，保留显式 override 和 64 KiB floor；容量按四 bytes/token 估算。[旧预算配置][b-reference-budget]、[新预算实现][o-reference-budget] | 引用历史的容量策略改善；不是自动长期记忆，也未形成 Profile-owned memory。缺 adapter/容量回退与其他错误传播有明确区分。 |
| 截断的引用快照新增完整投影 spill，并明确报告 saved 或 unavailable；正文仍声明为不可信背景。[spill 实现][o-reference-spill] | 可复用引用保真与缺失提示，不应把截断 preview 当作完整 Run 证据。这个新增文件并非评测结果表。 |
| AGENTS 项目根标记探测不再把所有 metadata 错误吞成“不存在”，仅缺失路径可继续上探，其他错误/取消向外传播。[旧探测][b-instruction-marker]、[新探测][o-instruction-marker] | 修正上下文边界错误处理，减少错误跨到父项目的可能；仍不是创建/拥有 worktree 的接口。 |

因此，“停止再造官方基础层”是本次重新审计得到的产品取舍，不意味着这些功能刚在升级中出现；也不意味着现有 Ultra 治理层已经失去差异。上表 persona 风险是源码推断，尚未做新版本运行复现。

## 能力矩阵

| 用户需要的实际能力 | 官方状态 | 与 Ultra 的关系 |
| --- | --- | --- |
| 为不同任务准备可复用 Agent 配置 | 已做 | preset 目录组合工具、persona、上下文与 scoped services；UI 可查看、复制、删除用户副本、设默认、启动创造模式。不是结构化员工发布表单。[preset 接口][o-preset-types]、[UI 测试][o-preset-e2e] |
| 保存候选但暂不发布；并发编辑不覆盖；回退旧版本 | 未找到同等产品语义 | 文件编辑启动新 standing generation；无持久化候选/激活指针、内容 SHA 或 Profile Head CAS。Ultra 已有这些独立记录和操作。[代际][o-standing]、[发布][u-release] |
| 发现并按 scope 使用 Skills、工作区规则 | 已做 | 应复用官方 registry、文件发现/watch、用户/模型调用控制和 slash UI；不另建目录扫描器。[注册接口][o-skill-runtime]、[文件 provider][o-skill-filesystem]、[调用][o-skill-call] |
| 人工整理的员工长期规则；跨会话检索记忆 | 部分 | 官方有全局/项目 AGENTS、动态规则及外部 memory MCP；Ultra 的 curated memory 随 Profile 版本固定，但没有自动记忆提炼/检索服务。[规则配置][o-instructions-config]、[memory][o-memory]、[Ultra 文本层][u-capabilities] |
| 工具执行前拒绝/询问，显示并审计一次性审批 | 已做 | stock tools + approval + UI 已有；Ultra 的附加价值是版本化、非可执行的 Profile 策略选择。[执行链][o-tool-gate]、[审批服务][o-approval]、[Ultra hooks][u-hooks] |
| 注册/浏览工作目录、分组会话 | 已做 | 复用 Workspace registry、Remote 与 UI。不能把普通 Workspace 等同于 owned Git worktree。[Workspace 接口][o-workspace]、[Remote][o-workspace-api] |
| 自动创建/清理 Git worktree 并隔离任务工作目录 | 未找到；已知选项明确拒绝 | workflow 的 `isolation` 被列为 deferred，已有测试断言失败；应维持待定，不能标为官方已解决。[实现][o-workflow-options]、[测试][o-worktree-test] |
| 工作清单、脚本化多 Agent 工作流、循环直到完成 | 已做 | 官方 todo、workflow、Ralph 已覆盖；workflow 的 result/Chat card 是一段编排，不是 Profile 工作轮次账本或发布评测。[todo][o-todo]、[workflow][o-workflow-types]、[Ralph][o-ralph] |
| 每个候选以固定用例隔离评测，通过后才能激活 | 未找到同等运行时产品 | 官方 workflow 有 child cap/结构化输出等执行机制，测试设施验证工程行为；Ultra 才在所查范围内有 Eval Set Revision、Eval Run 与完整身份匹配门禁。[worker 调用][o-workflow-child]、[工程测试][o-snapshot]、[Ultra eval][u-eval] |
| 按员工版本归属逐工作轮次查询结果和用量 | 部分 | stock Session/telemetry 提供原始事实与展示；Ultra Run 把 exact turn、Profile Revision、owner、runtime 与有界完整性投影连接起来。[telemetry][o-telemetry]、[Run 身份][u-run] |

## 1. Preset：已是完整的配置组合机制，尚非版本发布治理

官方 `AgentPreset` 是 `id/trust/path` 加展示元数据；`AgentPresetDocument` 返回存储的 composition 文本，没有 Profile Revision、candidate、active 或 expectedHead 字段。preset 本质是目录，复制连同 skills/assets 一起复制。Host authoring 明确只支持复制和删除，不接受浏览器提交任意 composition 文本；系统预设不可写，用户预设可删除。UI 的“创造模式”会创建 `cordis` preset 的会话，让 Agent 改用户目录里的文件；它不是尚未实现的占位按钮。[preset 类型][o-preset-types]、[文档类型][o-preset-document]、[authoring][o-preset-author]、[UI 入口][o-preset-ui]、[公开创造模式][o-creator]

这里的重叠应当承认：用户已经能创建和维护自定义 Agent。界面也有真实测试，断言系统预设只读 viewer 不含 textbox、复制后文件与源相同、用户副本能删除。不能把“官方没有结构化员工表单”写成“官方不能创建 Agent 配置”。[UI 测试][o-preset-e2e]

但发布语义确实不同。`ensureStanding()` 以 `mtimeMs + size` 检测 composition 文件变动，新会话挂新 generation，已加入会话保留旧 generation；测试实际将工具从 `before` 改成 `afterwards` 并验证两个会话各自保持所用工具。该实现还明确留下旧 generation 在最后一个 Agent 离开后回收的 TODO。因此这是有效的进程内代际隔离，并非虚假的“配置每次实时重读”，也不是持久化不可变版本仓库。[挂载与 stamp][o-standing]、[代际测试][o-standing-test]

日志记录的 `agent-preset/selected` 只有 preset ID；创建头与后续选择共同供 projection 重建。空白会话的选择在 Host 按会话串行化，已经开始的会话会被拒绝，这种运行期锁定不是 Profile Head CAS。冷恢复路径以日志选出的 ID 调 `composeAgent()`，再 `presets.resolve()`/`presets.mount()`，没有读取历史内容 SHA 或历史 generation。[选择与日志][o-preset-selection]、[projection][o-preset-log]、[冷恢复][o-preset-resume]

由此可以推出：把 Ultra Revision 简化为 preset ID 会丢失版本承诺。Ultra 当前保存时先检查 Head CAS、对完整规范化内容算 fingerprint、未变内容 no-op、先写不可变 Revision 再写 Head；保存不自动激活。激活只能选择最新 candidate，rollback 选择 active 或更旧版本，archive/restore 也走 Head。[类型][u-profile-types]、[保存实现][u-save]、[发布实现][u-release]、[候选测试][u-profile-test]

官方标准 preset 还明确将 model route、sandbox/approval、persistence 和 registry 留在 Host plane。因此 preset 不是 Ultra 所有字段的一一对应序列化格式：Runtime Target 和 Required Capabilities 仍需由发布域保存并预检。[标准 composition 的分层][o-standard-planes]

## 2. Skills、上下文与记忆：复用基础层，精确说明 Ultra 已有什么

官方 `ctx.skills` 提供 provider 和 runtime registration，按作用域分层，list/get 接受 `cwd`、`signal`、`scope`。最近的 scope 覆盖父层同名 skill；provider 的 Fiber 释放移除注册、撤销观察并失效缓存。文件 provider 支持项目 `.dsh/skills`、`.agents/skills`、自定义目录、用户目录及 bundled roots，默认启用 watcher。[注册实现][o-skill-runtime]、[文件 provider][o-skill-filesystem]、[scope 行为测试][o-skill-test]

模型 `skill` 工具在 summary 与完整 body 加载后都检查 model invocation；用户显式 `/name` 只从真实 user message 触发，允许 `disable-model-invocation` 的技能走人类入口；缺失和 user-disabled 项保持普通文字。官方已经做了具体的执行入口判断，而不仅是 UI 隐藏。Client 的 slash 候选和工具卡片也已有实现；这表示发现/调用管理，不代表已有技能版本发布平台。[调用实现][o-skill-call]、[技能 UI][o-skill-ui]

上下文方面，官方支持全局、项目和 local overlay 的 AGENTS/CLAUDE 文件、字节限制、动态变更协调与已记录上下文去重。它还识别 `.git` 是文件的已有 worktree 项目根；这只是规则文件发现语义，不能据此证明 managed worktree 实现。[配置][o-instructions-config]、[上下文协调][o-instructions-runtime]、[gitfile 测试][o-instructions-test]

官方 memory 证据是三个默认关闭的 MCP reference overlays（Memorix、reference memory、Engram）；实际接入仍由通用 `dsh-mcp-client` 完成，配置测试替换外部服务为 keyless fixture 并验证工具发现。它们没有成为一个 stock Profile-owned immutable memory 表，也不能据此声称官方原生实现了这些第三方服务的全部能力。[reference overlay][o-memory]、[拥有者测试][o-memory-test]

Ultra 的 `memory: ProfileTextBlock[]` 只由 `blockSection('Curated long-term memory', ...)` 渲染到 prompt。其实际差异是“经人整理且随 Revision 保存的规则”；会话记忆仍由 DSH/native 历史拥有。因此可复用 stock 发现、加载与连接能力，保留 curated memory 的发布归属；没有源码依据要求再做一个通用记忆数据库。[Ultra 字段和安装][u-capabilities]

## 3. Hooks、审批、沙箱：执行机制已有，策略语义不可互换

官方 Claude Code bridge 读取 command hooks，经 `ctx.shell.resolve/run` 执行；匹配的命令结果合并后，PreToolUse 可以 deny/ask，PostToolUse 可阻断结果或加上下文，Stop 可追加继续执行的 steering。Codex bridge 支持五个事件，pre-tool 只接受阻断，不支持 ask 或参数改写；Claude bridge 的 `updatedInput` 也只解析并告警，未执行。这些是实际边界，不能写成“完整兼容原生 hooks”。[Claude bridge][o-cc-hooks]、[Codex bridge][o-codex-hooks]

官方 command hook 执行器遇到不能启动 shell 等基础设施错误时将其作为 non-blocking hook error 记录，让 turn 继续。这个 hook 错误策略不能直接替代 Ultra 的安全声明式规则。Ultra 不执行 command/JS；Profile 只提供 context/deny/ask，before-tool 按 Profile 顺序取第一个匹配规则。两者虽使用相同事件 seam，信任和决策语义不同。[command runner][o-hook-runner]、[Ultra hooks][u-hooks]

审批底座不应重复。官方服务发出 `approval/asked` 和 `approval/decided`，关联请求 ID 和 exact `callId`；`allowed-once` 是唯一许可，`never` 在派发 answerer 前拒绝，异常或非法答复规范化为 `unavailable`。tools 在处理 ask 后仍执行 monotonic guards；ui-approval 注册 composer 和 Remote answerer。已有 bridge 测试直接断言缺少 approval service 时 ask 不执行工具。[审批][o-approval]、[执行链][o-tool-gate]、[UI][o-approval-ui]、[测试][o-hook-test]

沙箱也已有独立 policy/provider：每次执行明确 mode、workspaceRoot、sessionId，区分 `full/partial` enforcement，无可用 backend 时拒绝 confined execution。官方 permission presets 是 sandbox/approval 的用户选择组合，并可支持经过显式审批的较宽单次调用；不能把“allowed-once hook 策略”误当“允许改变整个 Profile 的沙箱约束”。Ultra Eval 的 read-only/never 要继续在实际 executor 和新 provider 上证明，不能只读 UI 的 permission label。[Sandbox 接口][o-sandbox]、[调用策略][o-sandbox-policy]、[permission preset][o-permission]

## 4. Workspace、todo、workflow 与 Ralph

Workspace registry 的持久实体是稳定 UUID、已有 canonical directory、标题和经 Session header cwd 校验的会话顺序。`create(path)` 通过 realpath 和目录检查，Remote 支持登记、重命名、排序、移除登记和归档 Session；这些导航/组织功能可委托官方。接口没有 owned branch、创建 worktree、清理 worktree、合并或文件锁字段。[Workspace][o-workspace]、[Remote][o-workspace-api]

更明确的反证来自 workflow：支持的 agent options 只有 label/phase/schema/provider/model；`effort/isolation/agentType` 被列为 deferred。现有测试传 `isolation: 'worktree'` 后断言 `stopReason === 'error'` 且报 deferred。允许用户预先准备 worktree 后将目录登记为 Workspace，与产品管理 worktree 生命周期是两件事。因此 root TODO 的 managed worktrees 项应保留为待定，不能当作“重复待办”关闭。[options][o-workflow-options]、[测试][o-worktree-test]、[Ultra TODO][u-todo]

普通 todo 是 `todo_write` 整表替换，`todo/write` 进入调用者 Session，下一轮 turn/start 清空当前展示；它是当前工作清单。Team task board 的权威归属和 DAG/CAS 见 Team 分报告，不能用 todo 的同名“task”功能直接作替代判断。[todo 投影][o-todo]

workflow 的用户能力已经丰富：JS body、并行/流水线、phase/log、单项结构化输出、并发和总 Agent 上限、取消/清理、已记录的 run/child 事件及 Chat card。每个 workflow 必须有 parent Agent，执行 child 时直接传这个 parent 给 subagents。其 VM 明确不是安全边界；worker 提供主循环隔离与强制终止，不能推导出独立文件系统隔离。[请求接口][o-workflow-request]、[执行环境][o-workflow-runtime]、[执行 child][o-workflow-child]、[VM 限制][o-workflow-vm]、[Chat 投影][o-workflow-ui]

标准 preset 同时挂载 workflow 和 Ralph；Ralph 使用固定脚本逐轮创建 fresh structured-output child，携带 objective 和上一轮有界 handoff。它有 `complete/blocked/budget-limited` 结果，但这些是循环控制状态，没有关联 Profile candidate、Eval Set Revision 或激活门禁。[默认组合][o-standard-workflow]、[Ralph 实现][o-ralph]

## 5. Eval、Run、Studio：保留业务关联，收紧承诺

在 preset/workflow/API/Client、test-support、benchmarks、scripts 的类型、实现及关键字搜索中，没有找到与 Ultra 同等的 Eval Set/Eval Run/Promotion Gate 发布实体。发现的 `evaluator.ts` 是动态 Client 插件源码的闭包执行器；snapshot suite 是 Vitest 驱动的实际进程回放；Session benchmark 用合成历史测冷开、首屏、恢复耗时。它们是有价值的工程验证基础，不是最终用户对候选员工运行隔离评测并据此改变可激活状态的产品。[闭包 evaluator][o-dynamic-evaluator]、[snapshot][o-snapshot]、[benchmark][o-benchmark]

Ultra 的差异已有代码：先固定 Profile/Eval Set 指纹、route、capability generation、工具交集、assertion schema 和环境 fingerprint；每个 DSH Case 创建 parentless Agent、固定 read-only/never、限制工具和资源；flush/fold 规范证据并保存 Case 后才 dispose。Profile 激活是独立 CAS 操作，只有精确匹配的 passed Eval Run 能满足 gate；旧通过结果仍可见但变为 invalidated。[运行前计划][u-eval-plan]、[worker][u-eval]、[门禁完整元组][u-gate]、[激活执行][u-release]。已有集成测试覆盖评测前禁止激活，以及 parentless worker 和结果提交顺序；这里仅阅读，未重新运行。[集成测试][u-eval-test]

这仍不是“所有外部依赖都被锁定”的证明。当前 `evalEnvironmentFingerprint()` 只枚举固定 sandbox/approval、effective tool names、资源上限和文本 fixtures；没有显式纳入 preset 文件内容、skill/AGENTS body、工具实现或 schema digest、服务端模型权重版本。因此精确性只针对已建模的身份元组成立。将官方可热变更的 preset/skills 接入后，应明确哪些外部内容被固定、哪些作为实际运行事实记录；不能把工具名字不变误认为能力实现不变。[环境 fingerprint][u-eval-environment]、[门禁比对][u-gate]

官方 Session telemetry 的 ledger 记录逐个镜像 Session event，ops 另记运行错误/关闭；payload 是 event data 的完整副本。它的语义和数据范围与 Ultra 的有界、去内容 Run Index 不同。Ultra Run ID 基于 exact Session+turn 或 provider+native handle+turn；其业务价值是关联 immutable Profile Revision 与 owner，再返回经过规范化且明确 incomplete/unavailable 的证据。迁移应继续用官方事实作为输入，不把 telemetry 仓库或 Chat node 当成 Run 权威表。[telemetry][o-telemetry]、[Run ID][u-run]、[索引记录][u-run-record]、[现有数据域][u-storage]

Studio 应集中显示“候选/激活差异、评测要求和通过依据、实例所用 Revision、逐轮结果的完整性”。普通文件树、技能选择器、权限选择器、审批 composer、工作区/会话导航与 workflow 进度已有 owner 和 slots；复刻这些窗口会增加双重状态及维护负担。这个产品收敛建议来自以上重叠证据，不是已经完成的 UI 迁移。

## 6. 基于证据的机会与待办取舍

以下都是推断和建议，不是市场需求结论、排期或开工授权。

1. 保留“有评测依据的员工版本发布”：结构化 Profile、immutable Revision/Head CAS、显式激活/回滚/归档、Profile-owned Eval Sets、不可复用过期 pass 的门禁。官方当前缺少的正是这些跨生命周期关系，现有 Ultra 已有可复用实现。[发布][u-release]、[门禁][u-gate]
2. 保留“实例与逐轮证据能追溯到发布版本”：Binding 和 Run Index 作为业务关联层，以官方 Session/Team/native owner 的事实重建；不用复制执行器、历史正文或遥测 pipeline。[Run][u-run]、[数据表][u-storage]
3. 将“未来引用了哪些可变 preset/skill/规则输入”作为待评估改进：优先用官方 registry 元数据和实际内容来源建立可解释的依赖身份，而非另做 registry。当前 Profile/Eval fingerprint 的范围应明示；尚未实现依赖级完整重现。[官方 Skills][o-skill-runtime]、[环境元组][u-eval-environment]
4. 停止新增重复的通用 preset CRUD/任意 YAML 编辑器、Skill 扫描/watch/slash 入口、审批 UI、普通 workspace tree、todo/workflow 执行器。Ultra 已完成的版本治理代码不因名字重叠而删除；“停止重复”指后续计划归属，不是本次改源码或关闭 Issue。[现有官方 UI][o-preset-ui]、[Skills UI][o-skill-ui]、[workspace API][o-workspace-api]、[workflow UI][o-workflow-ui]
5. managed worktrees 继续待定；Profile import/export 仍有发布数据和依赖清单的价值，但不能以复制可执行 preset 目录冒充安全 Profile 导入。对 credentials 只允许引用边界，不运输秘密；本次没有导出任何真实配置。[待办][u-todo]、[preset trust][o-preset-types]

## 7. Profile / Eval / Run 数据模块迁移建议

| 模块 | 保留的事实 | 可交给官方的基础层 | 后续迁移必须证明的边界 |
| --- | --- | --- | --- |
| Profile / Revision / Head | immutable 完整内容、fingerprint、候选/激活指针、Head CAS、历史及归档 | preset 挂载、scope registry、persona/context provider | 若新增 `basePreset`/技能引用，必须固定或说明其内容身份；不可只写可变 ID。旧 Revision 不原地补写新指纹。 |
| Binding | exact Team member、launch identity、Profile Revision、选择/实际 route、原始 snapshot | 官方 Team/Agent 生命周期与 continuation | 映射新 preset scope 时仍恢复原 Profile 和 route；不因目录同名而把旧 Binding 当成新配置。Team/native 细节由对应报告接续。 |
| Eval Set / Eval Run | Case/fixtures/allowlist/ceilings/assertions、独立 Revision、原有终态及证据 | 官方 Agent 创建、tool guard、sandbox、approval、Session durability | 新官方 preset 组合在 worker 发布前接好；fresh/parentless、production tool 排除、结果保存后 dispose 逐项重验。workflow 不能无条件替换 worker。 |
| Promotion Gate | 精确通过元组、独立用户激活决定、过期结果 invalidated | 官方运行能力与内容来源作为观察输入 | 新运行实现须产生新的环境/能力资格；保留旧 pass 的历史，不把它自动认定为新 stock 环境的可发布证明。 |
| Run Index / Run evidence | 每 accepted turn 一个稳定 Run、Profile/owner 关联、来源及完整性 | 官方 Session/usage/event/query 和 provider-native 历史 | 继续按规范来源重建有界投影，不复制 raw telemetry；源不可证明的结果/时间/用量继续标 incomplete/unavailable。 |
| Studio | 发布、版本比较、实例归属、评测及 Run 业务视图 | stock Workspace、Session、Skill、approval、workflow owners 与公共 slots | 新 Remote/Client 所有权和生命周期须重新验证；引用现有 UI 不能跨包私有组件导入。 |

这是一份迁移分层建议。当前六表 `agent_team_ultra_v1` 是现有权威数据，不应为了“更像 preset”而直接折叠或丢弃。新增依赖身份若造成不兼容记录，应按仓库既有迁移策略设计新格式/明确 reader；没有必要仅为复用官方服务便立即更换存储 generation。[六表定义][u-storage]、[当前项目契约][u-contract]

适合下一次获准落地时验证的最小业务场景是：保存 candidate A，设精确 Eval Set 并通过后激活；启动绑定 A 的实例；保存候选 B 和改变相关可变外部依赖；确认 A 的身份不变、B 不能借 A 的过期 pass 激活、Run 能追溯原版本，重启后仍保持这些事实。此报告没有执行这个场景，也没有证明官方 0.1.5 已通过 Ultra 的兼容资格。

## 固定源码引用

[o-version]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/package.json#L1-L9
[o-preset-types]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/preset/agent-presets/src/preset.ts#L3-L69
[o-preset-document]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/preset/agent-presets/src/types.ts#L47-L59
[o-preset-author]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/preset/agent-presets/src/authoring.ts#L105-L190
[o-preset-ui]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/client/ui-agent-preset/src/client/index.ts#L137-L203
[o-preset-e2e]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/apps/web/tests/agent-preset-authoring.e2e.ts#L71-L159
[o-creator]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/preset/agent-presets/presets/cordis/agent.cordis.yml#L1-L28
[o-standing]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/preset/agent-presets/src/index.ts#L746-L830
[o-standing-test]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/preset/agent-presets/tests/mount.spec.ts#L682-L730
[o-preset-selection]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/preset/agent-presets/src/index.ts#L674-L727
[o-preset-log]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/preset/agent-presets/src/session.ts#L1-L42
[o-preset-resume]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/api/session-controller/src/agent.ts#L369-L434
[o-standard-planes]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/preset/agent-presets/presets/standard/agent.cordis.yml#L1-L34
[o-standard-workflow]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/preset/agent-presets/presets/standard/agent.cordis.yml#L222-L234
[o-skill-runtime]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/skill/skill/src/index.ts#L382-L502
[o-skill-filesystem]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/skill/skill-filesystem/src/index.ts#L49-L258
[o-skill-call]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/skill/tool-skill/src/index.ts#L128-L226
[o-skill-ui]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/client/ui-skill/src/client/index.ts#L61-L79
[o-skill-test]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/skill/skill/tests/skill.spec.ts#L1108-L1169
[o-instructions-config]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/context/agent-instructions/src/config.ts#L11-L45
[o-instructions-runtime]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/context/agent-instructions/src/index.ts#L226-L275
[o-instructions-test]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/context/agent-instructions/tests/agent-instructions.spec.ts#L425-L448
[o-memory]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/apps/cli/config/examples/mcp-memory/mcp-reference-memory.cordis.yml#L1-L13
[o-memory-test]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/apps/cli/tests/memory-mcp-configs.spec.ts#L37-L104
[o-cc-hooks]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/hooks/hooks-claude-code/src/index.ts#L136-L290
[o-codex-hooks]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/hooks/hooks-codex/src/index.ts#L223-L267
[o-hook-runner]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/hooks/hook-protocol/src/runner.ts#L67-L104
[o-hook-test]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/hooks/hooks-claude-code/tests/bridge.spec.ts#L228-L248
[o-approval]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/interaction/user-approval/src/index.ts#L203-L295
[o-tool-gate]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/core/tools/src/index.ts#L1463-L1495
[o-approval-ui]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/client/ui-approval/src/client/index.ts#L35-L92
[o-sandbox]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/sandbox/sandbox/src/index.ts#L24-L140
[o-sandbox-policy]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/sandbox/sandbox-policy/src/index.ts#L154-L168
[o-permission]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/interaction/permission-presets/src/index.ts#L162-L201
[o-workspace]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/workspace/workspace/src/types.ts#L25-L111
[o-workspace-api]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/api/workspace-controller/src/types.ts#L52-L128
[o-workflow-options]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/workflow/workflow-worker-thread/src/runtime.ts#L39-L42
[o-worktree-test]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/workflow/workflow-worker-thread/tests/workflow-worker-thread.spec.ts#L340-L345
[o-workflow-types]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/workflow/workflow/src/types.ts#L24-L107
[o-workflow-request]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/workflow/workflow/src/runtime-types.ts#L14-L49
[o-workflow-runtime]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/workflow/workflow-worker-thread/src/runtime.ts#L65-L151
[o-workflow-child]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/workflow/workflow-worker-thread/src/host.ts#L351-L368
[o-workflow-vm]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/workflow/workflow-worker-thread/src/realm.ts#L1-L8
[o-workflow-ui]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/client/ui-workflow-run/src/client/workflow-definition.ts#L148-L182
[o-ralph]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/workflow/tool-ralph/src/index.ts#L1-L60
[o-todo]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/todo/tool-todo/src/index.ts#L123-L164
[o-dynamic-evaluator]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/extensions/cordis-client-runner/src/client/evaluator.ts#L1-L29
[o-snapshot]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/test-support/session-snapshot/src/suite.ts#L1-L27
[o-benchmark]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/benchmarks/session-open/session-open.bench.ts#L1-L43
[o-telemetry]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-telemetry/src/index.ts#L57-L87
[u-lock]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/dsh-reference.lock.json#L1-L54
[u-profile-types]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/domain/src/types.ts#L152-L207
[u-save]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/domain/src/profile-lifecycle.ts#L234-L304
[u-release]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/domain/src/profile-lifecycle.ts#L431-L505
[u-profile-test]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/domain/tests/profile-service.spec.ts#L636-L696
[u-capabilities]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/domain/src/profile-capabilities.ts#L74-L106
[u-hooks]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/domain/src/profile-capabilities.ts#L147-L185
[u-eval]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/domain/src/evaluation-workflow.ts#L580-L675
[u-eval-plan]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/domain/src/evaluation-workflow.ts#L435-L507
[u-gate]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/domain/src/evaluation-workflow.ts#L895-L968
[u-eval-environment]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/domain/src/evaluation.ts#L78-L92
[u-eval-test]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/domain/tests/pinned-route.integration.spec.ts#L1154-L1263
[u-run]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/domain/src/run.ts#L81-L97
[u-run-record]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/domain/src/types.ts#L387-L446
[u-storage]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/packages/domain/src/storage.ts#L461-L479
[u-todo]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/TODO.md#L167-L171
[u-contract]: https://github.com/benz-ai-x/dsh-agent-team-ultra/blob/f84584def627b4af78a029af8788de73da0ad567/docs/agent/PROJECT_CONTRACT.md#L253-L282
[b-standing]: https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/preset/agent-presets/src/index.ts#L746-L830
[b-skill]: https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/skill/skill/src/index.ts#L382-L502
[b-approval]: https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/interaction/user-approval/src/index.ts#L203-L295
[b-worktree]: https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/workflow/workflow-worker-thread/src/runtime.ts#L39-L42
[b-persona]: https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/preset/persona/src/index.ts#L29-L63
[o-persona]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/preset/persona/src/index.ts#L29-L74
[o-persona-shadow]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/core/system-prompt/src/index.ts#L241-L256
[b-reference-budget]: https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/context/session-reference/src/config.ts#L1-L20
[o-reference-budget]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/context/session-reference/src/index.ts#L359-L375
[o-reference-spill]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/context/session-reference/src/spill.ts#L15-L81
[b-instruction-marker]: https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/context/agent-instructions/src/files.ts#L147-L167
[o-instruction-marker]: https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/context/agent-instructions/src/files.ts#L149-L177
