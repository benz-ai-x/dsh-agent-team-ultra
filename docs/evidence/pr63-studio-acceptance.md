# PR #63：发货 Studio 联合验收与阶段 C 收口

日期：2026-09-09（Asia/Shanghai）。用户确认先完成联合验收、提升资格和复查，
通过后合并 PR #63 并同步 main。本文接续 [审查修复记录](pr63-review-fixes.md)，
只涉及 #39–#43；父 Spec #18 保持开放，#44 真实认证 native 不在本轮范围。

## 公开联合入口

`scripts/probe-packed-studio.mjs` 由 Codex／Claude 归档连续性探针共同调用，
并进入既有 `verify:pack`、旧 Codex／旧 Claude／B 三组归档升级门禁，不为每条
Issue 再建立重复的全量流程。

- 历史前身归档通过真实 Loader／Host 创建数据，记录原 canonical work turn；
  停止旧 Context，执行公开 `migrate-data.mjs`，再用新归档 `/data` 打开独立目标。
  原业务源字节不变，原 SDK 连续性目录保留、不由迁移器复制。
- Studio 及 Team owner 加载安装包 `./client` 的实际 lazy-CJS bundle；真实
  production renderer、Session scope、Slot、生成 Client Remote，经认证 HTTP／
  WebSocket 调用真实 Host，不手写 `load`／`run` 返回值或直接渲染源组件。
- 逐行查看 Run 规范证据源和 Remote 详情时间线，确认包含前身记录的原 work turn、
  没有重复 Run、原 member 的消息链接仍相同。Codex 冷历史缺完整工具／用量，
  Claude 原始 result-only turn 缺可恢复时间，均须显示 incomplete；这不意味着
  所有 native 历史都不完整。
- 只控制外部 LLM 流：失败 attempt 的累计快照 `9→14→14`，随后成功 `7`；
  正式 Agent Loop 持久化 v2 settlement，生成 Remote 发起保存／激活／启动。
  界面显示一个 Run、`15 / 6 / 21`；缺 finish／缺 total 的另一轮显示 incomplete、
  `15 / 6`，不补造 total，不泄露 `PRIVATE_` 输入／输出／错误。
- 真实销毁 Lead 后，生成 Remote 返回 `gateway/lookup-not-found`，Studio 的
  Refresh 将同一错误显示为 alert；不是注入假错误对象。卸载 Studio Fiber 后，
  它的 Slot 和 `remote.digitalEmployees` 消失，随后关闭 Client／Web 连接。

界面环境为 JSDOM + 实际发货 React renderer，不宣称像素截图或人工浏览器验收。
测试外壳提供最小 Root／Session scope 和图标占位；业务组件、Remote、Host、
持久化、权限和生命周期不替换。真实 CLI Web 启动／正常退出另由原归档门禁证明。

## 定向证明与失败记录

实现提交：`633fe3f6099d10e55fd5249ce12eafef973263b4`。

- 移除真实 Studio contribution 的负向对照必定失败：
  `/root/workspace/pr63-studio-negative.ldR1el/studio-negative.log`，
  `shipping Studio entry did not become visible`；SHA-256
  `140c4c9304da6788c34de35442c5c1ff2ab3eda49fa0412143fc5667edc0cf09`。
  完成对照后已恢复正式注册，不保留产品旁路或测试开关。
- Claude／SQLite 的公开创建→迁移→Studio、v2 用量／完整性、失效 Lead 错误、
  卸载已自然退出 0：`/root/workspace/pr63-studio-claude.iVcmB6/studio.log`，
  SHA-256 `8ab99e4cc097c2786388d23e83721ad95d7aa58a4a722e6f73bae034c27cf668`。
  定向调试使用先前保留的候选安装，不代替下列最终重新打包验收。
- 初始探针的等待服务注册、按钮选择及卸载后访问已释放 registry 的失败，均为
  验证外壳组装问题，已修正；不计为生产业务修复。早期错误 selector 导致的失败
  不作为有效负向对照，以上最终对照使用修正后的同一入口和断言。
- `633fe3f` 完整门禁在测试阶段退出 1：441 passed／6 failed。六项均为 5000ms
  测试框架超时：两个 checkpoint 审计矩阵、JSON 原员工联合迁移、B 格式转换、
  两个 legacy domain 后端迁移；没有业务断言失败，未进入 pack。日志
  `pr63-studio-candidate-verify.log`，SHA-256
  `a787484294c73792601cf5e5ccdc54eefd9cec739cb0388ab321c872f9b1cd94`。
  这些场景包含多个真实 CLI 进程，将其单场景预算设为 20s；保留所有断言、全部
  场景和其余测试的超时。完整中断矩阵的既有 300s 预算不变；不能把失败计为通过。
- `c5ceeb4` 重跑已通过 447 tests／39 files，但 pack 在 Claude JSON 冷恢复的
  Studio 完整性断言失败，整条 `pnpm verify` 仍退出 1。日志
  `pr63-studio-candidate-verify-green.log`（文件名不是结果），SHA-256
  `f36cc441c016ba7e1005718943f86f865aabb1af26397a771d2b0f03c49a97c8`。
  单独 `query-new → query-resume` 同样失败，排除仅全量执行时的资源问题。
- 定位：Claude 的历史恢复用 `Date.now()` 代替缺失原生时间，把已知终态但未知
  完成时间的 Run 标为 complete。`6d5499f` 第一轮改用 0，虽使 endedAt 缺省、
  Run incomplete，却仍在时间线显示伪造的 1970 年；Standards 独立复查判定一项
  P2，Spec 该轮为 0。不是可交付修复，不能借用重启时钟、epoch 或前一 stage 时间。
- 同一公开 Host／生成 Remote 回归保留有日期历史的 complete＋`5 / 2 / 7`，
  新增 result-only 历史的 incomplete＋无 endedAt／usage。修复前 1 pass／1 fail：
  `pr63-studio-native-time-red.log`，SHA-256
  `adc97a7237b525350280eeeecc671a1e96ab915053a541c60b842af749c4f0d4`；
  修复后 Claude operations 全文件 37／37：`pr63-studio-native-time-green.log`，
  SHA-256 `d802aaf908bb3bfa9cf10ee9f6ae3dc0a0a5af448452fe7ffb8285ceb44694db`。
  调试标记已移除，归档与完整门禁须以修复后新 build 重跑。
- Standards P2 的公开 Remote 负向回归看到实际 `{ kind: 'turn', timestamp: 0 }`：
  `pr63-studio-native-undated-red.log`，SHA-256
  `91504cd0cf5e42c807ae2d628ecb4ef1f450fb7f46d60edf2711192be50bae72`。
  最终改为省略无来源时间的证据项，provider 页保持 incomplete；独立 Team
  settlement 保留原 outcome／turn／单次回执，Run 证据保持 unknown-terminal、
  无 endedAt。发货 Studio 检查无 epoch 日期，并等待实际 Remote 的时间线或
  明确“无规范证据”结果，而非把索引占位当详情。
- 四个既有中断／不可信历史场景此前期待伪造时间的 terminal 项；更新为零项、
  incomplete，并保留／补强真实 Team 结算、拒绝迟到结果和脱敏断言。初次回归
  33 pass／4 fail 的日志 `pr63-studio-native-undated-first-green.log` 保留。
  更新后 `pr63-studio-native-undated-green.log` 37／37；整个 Claude 套件的最终
  结果见 `pr63-studio-native-undated-suite.log`（7 files／62 tests）。
- 发现 Standards P2 后停止旧 `6d5499f` 的全量运行，退出 143；日志
  `pr63-studio-candidate-final-verify.log`，SHA-256
  `de3d2cb0c339b3b333cf5d72a6ef7ba8b40c73e9f1c640ce9f09aab8605d5ff7`。
  仅终止已核对的本轮验证进程组，不影响其他工作；不计为完整通过。
- `7739f64` 新归档 pack 和旧 Codex／旧 Claude／B 的三组历史升级全部退出 0，
  Studio 经 JSON／SQLite 真正显示原 Run、v2 用量、完整性、失效 Lead 错误，
  Web 与卸载完成。对应 `pr63-studio-undated-packed.log`、
  `pr63-studio-candidate-{codex,claude,b}-history.log`；属于中间候选，不能替代
  后续运行时代码修复的最终门禁。
- 同一候选的 Standards 已 0，Spec 另发现 P2：末条 assistant 没有时间时，
  前一阶段有日期的用量也被丢弃。公开恢复用例 RED 2 pass／2 fail：
  `pr63-studio-native-partial-usage-red.log`，SHA-256
  `e8eb4093610880c3f77ea63657682a2c4164ae319dc786fe1cb0c5cc8d01bbe5`。
  最终按用量自己的来源时间保留 `3 / 1 / 4`，无日期终态仍不发布；后续无日期
  的额外计数也不能借用早先时间进入规范时间线，证据页继续 incomplete。
  原日期完整／result-only 对照不变，Claude 全套 `7 files／64 tests` 通过：
  `pr63-studio-native-partial-usage-green.log`。最终全量门禁待两轴复查关闭后执行。
- `1873bc1` 两轴均指出相同 P2：无日期的负数／null usage 仍能使有日期累计
  失效。继续在同一公开矩阵 RED（4 pass／2 fail），把累计有效性判定也隔离在
  有日期事实内；原有有日期非法计数／溢出规则不变。六种历史形状均通过，Claude
  全套 `7 files／66 tests` 通过；日志 `pr63-studio-native-invalid-usage-{red,green}.log`。

## 固定环境与来源恢复

Node 22.22.1／pnpm 11.7.0，Linux arm64。维护 C 源仍
`3c38b1d4e8bf219750203e44b1df033ced754e92`，官方基础／对照仍
`d347e703908d0406b7a7ef80e3a0e594d86b2215`，docs digest 仍
`1cfdeaf1262f0101099ee245b9977a0ef93d56dcc631878f313dffea27adaf41`。
Codex 0.149.1、Claude SDK 0.3.241／payload 2.1.241 均未改。

开工时共享 `/root/workspace/deepseek-harness` 已被外部更换为官方 `5dda764`，
旧 worktree 的 Git 管理目录消失。没有重置或改写该共享仓库：

- C `3c38b1d`、B `57670c6b32`、官方 `d347e703` 分别在
  `/root/workspace/pr63-source-repair.UKB4f7/{c,b,official}-harness.git` 恢复独立
  Git 管理数据。先以取回的精确 commit 建立新索引，确认保留源码全部 tracked
  字节完全相同，再修复原 `.git` 指针。源码和构建物不覆盖，旧指针文本另存备份。
- A `8b4bae0b62` 在同目录 `a-harness` 建立全新独立 checkout，frozen install、
  完整 build 通过；旧 Codex `debde06`／旧 Claude `081357d` 前身重新正式
  prepare、install、strict、build。B 归档前身固定 `4cecfe2`，专用临时树
  `/root/workspace/pr63-b-history.9OelaO/ultra` 也按原 B 锁完整准备。
- C strict 648／0 warnings；A 两个前身 strict 448／506、B 前身 strict 590
  均无 warnings。修复过程日志位于独立恢复目录；C 起始／恢复 strict 日志位于
  Batch 4 工作树父目录。这些管理目录是有效来源链接的依赖，不能作为垃圾删除。
- 同一已恢复官方／fork 的 11 组比较与错误组合导入／安装前拒绝通过：
  `pr63-studio-candidate-comparison.log`，SHA-256
  `98d2573f504647fdd2429c492ed5d1bac618a2b787ec557412c8975d43ff44ef`。

## 最终门禁与 AC 收口

### 提升前的完整候选

精确 Ultra 提交 `e85c3a206ce10319951b60c7061190a6e5967b45`，当时支持标签仍为
`agent-team-ultra.phase-c.integration-candidate.v1`。下列五项全部自然退出 0，
之后才提升资格；日志均位于 `/root/workspace/batch4-upgrade.VkSXdm/`。

| 命令／结果 | 日志 | SHA-256 |
| --- | --- | --- |
| `pnpm verify`：648 strict／0 warnings，452 tests／39 files，完整归档／Studio／Web／卸载 | `pr63-studio-reviewed-candidate-verify.log` | `e392b2bd1fb1e0ef3812948a06244ee6543f9fa78951b3881af2bdb6220dc4c9` |
| `pnpm verify:codex-upgrade /root/workspace/batch4-upgrade.VkSXdm/codex-predecessor --keep-failed`：旧 Codex × 两后端 | `pr63-studio-reviewed-candidate-codex-history.log` | `2d31620f27d8f0f8ad782e88473fd00ac92c1b602daa6619e2ed48d82119678a` |
| `pnpm verify:claude-upgrade /root/workspace/batch4-upgrade.VkSXdm/claude-predecessor --keep-failed`：旧 Claude × 两后端 | `pr63-studio-reviewed-candidate-claude-history.log` | `868d1f20725b46c21659b1c9ea8e04700811c81dc334847da2b28b0e4d393ea6` |
| `pnpm verify:b-upgrade /root/workspace/pr63-b-history.9OelaO/ultra --keep-failed`：B 双 native × 两后端 | `pr63-studio-reviewed-candidate-b-history.log` | `401809d229fc8fad7be86dc5e1b1b3d5aa28e479f38c8aa5e5305128d8fbe18b` |
| `pnpm compatibility:compare /root/workspace/deepseek-harness-official-29`：双方各 11 组；错误安装／导入前拒绝 | `pr63-studio-reviewed-candidate-comparison.log` | `98d2573f504647fdd2429c492ed5d1bac618a2b787ec557412c8975d43ff44ef` |

完整测试包括 JSON 13 次耐久发布／14 个边界和 SQLite 7 次／8 个边界，保留全部
每次发布后的重试与源字节检查。三组历史链均包含本文的实际 Studio 联合入口、
原身份续跑、迁移后 Web 正常退出（code 0、无强杀）和卸载。
完整 `c1632755c4fbabe5b34af7ddb5f3628aaf5037a6...e85c3a2` 独立复查：
Standards 0 项、Spec 0 项，各轴最高严重度均无；所有前述 P2 已关闭。

### 同源支持资格与最终复验

只有提升前五项门禁与复查通过后，才把仓库自有标签改为
`agent-team-ultra.phase-c.v1`，验证日期 2026-09-09。源码提交、官方来源、格式、
SDK／payload 不变；标签不是 Harness 导出，也不证明 #44 真实认证。

同一个 B 历史只读审计测试先 RED：实际报告仍为 candidate／`qualified: false`；
随后正式 prepare、frozen install、build 并 GREEN，仍验证源字节不变、writer
provenance 未知、业务目标 `closed-until-complete`。`qualified` 只表明锁定目标
源码的支持资格，不创建数据集或放宽 complete 准入。日志
`pr63-qualified-audit-red.log`（SHA-256
`c7f80270e22e85eb69f65de380a2c1eaec9ac60b57d40052d5846f2373f43d52`）与
`pr63-qualified-audit-green.log`（SHA-256
`d968353b4fa89818734e0517b51c4762b1bde7b155319f7cff04021da4eb48e9`）。

旧 candidate 的 complete 目标不跨资格复用；最新业务数据必须在停写备份后迁移到
新目标，不能手改 manifest 或丢弃候选期新增事实。README、契约和补丁清单同步说明。
新资格提交为 `54280d16e0a172d7443e80c00106b28772abcafd`。其完整测试再次通过
452／452，14／8 个中断边界全部通过；但与三组历史归档并行的 pack 在 Claude
JSON `query-resume` 的受控 MCP 请求触发 60000ms 超时，整条 verify 退出 1，
不能算作通过。日志 `pr63-phase-c-supported-verify.log`，SHA-256
`fa2410b65e184925ce15e9b7ec4ed0d4b0d27543c69b3ae778c1a12c1a8a203f`。
同一提交的三组历史升级和官方对照均退出 0。没有足够证据把超时定性为资源争用
或产品缺陷；没有修改源码、断言或 MCP 超时，随后单独重跑完整门禁。重跑通过不
表示已找到或修复该偶发超时，也不把提升前绿灯当成新标签的重打包结果。

同一 `54280d1` 的新资格升级／对照记录如下，命令及前身路径与提升前表格相同；
每项都重新生成、安装本资格的归档和迁移目标，未复用旧 candidate complete 目标。

| 新资格门禁（全部退出 0） | 日志 | SHA-256 |
| --- | --- | --- |
| 旧 Codex × JSON／SQLite | `pr63-phase-c-supported-codex-history.log` | `150830fa64b58cb8390c493f4d2f6a8922bf48bd01e36f77a6340bdd98e92edd` |
| 旧 Claude × JSON／SQLite | `pr63-phase-c-supported-claude-history.log` | `6466a8559c233753afef97407008e01a701081f032ddf82d971b8300239a0cdb` |
| B 双 native × JSON／SQLite | `pr63-phase-c-supported-b-history.log` | `1ee0bdefd494bc42703fe03e703aa934483efd65aa438f6b1e1eeb7de6c687b7` |
| 固定官方／维护 fork／错误组合 | `pr63-phase-c-supported-comparison.log` | `98d2573f504647fdd2429c492ed5d1bac618a2b787ec557412c8975d43ff44ef` |

最终独立执行的 `pnpm verify` 在同一 `54280d1` 运行代码／支持锁／依赖下自然
退出 0：648 strict／0 warnings、452 tests／39 files（275.27s）、JSON 14／SQLite
8 个边界，以及重新生成的完整实际归档集合、认证 Remote／发货 Studio、双 native
JSON＋SQLite 冷恢复、真实 CLI Web（code 0、无强杀）和无残留卸载全部通过。
日志 `pr63-phase-c-supported-serial-verify.log`，SHA-256
`d4dda59cc08ccb74839386a8c7209da9147b9ef4cc1c3cb651bcc7566e5dc789`。
上一轮 Claude JSON `query-resume` 同一路径本次通过，没有改动其生产代码、受控
夹具、断言或 timeout；保留原失败，不作原因已证实或缺陷已修复的声明。

固定 `c1632755c4fbabe5b34af7ddb5f3628aaf5037a6...54280d1` 完整独立复查：
Standards 0 项，Spec 0 项，各轴最高严重度均无。资格提升的顺序、27 条 AC 映射、
未知 writer／目标 closed-until-complete、旧候选目标与 #44 边界均已复核。
此后只收口 README／证据／HANDOFF／TODO 说明，不再改运行代码或已验证输入；
最终文档检查与复核完成后按用户已给授权正常推送及合并。实际发布、合并提交和
Issue 关闭以 [PR #63](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/63) 为准，
重复执行前先读取实时状态。主工作区仅安全快进到远端结果并正式准备同一 C 来源，
原 stash、其他 worktree、B 源和固定官方源码保留；不自动开展 #44 或修改父 #18。

### 27 条 AC 共用证据映射

同一场景覆盖多个 AC，不逐 Issue 重建整套流程。Issue 的实际关闭和 PR 合并以
[PR #63](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/63) 实时状态为准；
未完成的发布动作不提前勾选。

| AC | 共享场景／测试与可核验边界 |
| --- | --- |
| #39 AC1、3–5；#40 AC1–4 | 固定 C／官方来源、strict 与原 [#39](issue-39-acceptance.md)／[#40](issue-40-acceptance.md) owning 定向证据；最终 verify 的真实 Host／生成 Remote、双 native、生产 Team UI、权限与 disposal；比较探针双方各 11 组。没有改 stock 或替换 Team 所有者。 |
| #39 AC2；#40 AC5；#43 AC1 | 保留 B 源与前身归档、先完整候选五项门禁及双轴复查，再提升同源资格、重打包复验；用户已明确授权通过后合并，合并本身以实时 PR 为准。 |
| #41 AC1、2、4 | 三组真实前身归档 × JSON／SQLite → 运维迁移 → 新 `/data`／Host；`migration-execution.integration` 的 B 各代 Session、legacy domain 和原员工场景核验源不变、隔离目标、complete-last、全部原身份／时间／CAS／fingerprint。Ultra v1 没有不必要升级。 |
| #41 AC3 | 完整 `migration-interruption.integration` 的 14／8 个边界；`migration-execution.integration` 的 paused retry、临时前缀恢复、分歧／源身份拒绝；`migration-audit.integration` 的未来格式与 checkpoint 校验及真实日志重建。 |
| #41 AC5 | `migration-execution.integration` 的原员工续跑、missing Run Index、native correlations 与 `retains historical ... evaluation evidence but invalidates its gate after migration and cold startup`；归档链原 member／handle 保留。 |
| #41 AC6 | 审计／执行的脱敏和未知 provenance 断言；README 的旧程序／stock／双写不支持、源冻结、SDK 历史不复制与新资格目标规则。 |
| #42 AC1–4 | [#42](issue-42-acceptance.md) 真实 Loop v2→Run fold 的定向 RED → GREEN，全部纳入最终 verify；本文发货 Studio 的 `9→14→14` 失败＋成功 `7`、one Run、partial total、缺终态以及六形状 Claude 日期／usage 回归。 |
| #42 AC5 | 新、旧 Codex、旧 Claude、B 四组归档链共用 `probe-packed-studio.mjs`：历史原 Run→认证 Host／生成 Remote→实际 Client bundle；用量、incomplete、消息链接、错误 alert 与 Fiber 清理。 |
| #43 AC2–4 | `verify:pack` 与三组升级从真实 Profile package closure 推导归档（当前八包，无数量常量）；普通解析／Typert／SDK qualification／browser-safe、新旧包互斥／冲突工具禁用、真实 Cordis／Web／Loader／grant／watch／Slot／受控产品释放、原历史保留。 |
| #43 AC5、6 | `compatibility:compare` 的官方／fork／错误组合；完整 verify 的 Profile／Revision／Promotion Gate／Eval／审批策略／恢复／生命周期。精确输入与边界见本文；交付给 #44 的是未做真实认证验收的候选，不是认证结果。 |

本轮按 `tdd` 的已确认公开边界验证，通过 `dsh-plugin-dev` 保持真实发货入口和
精确来源；最终使用 `code-review` 独立检查 Standards／Spec 两轴。
