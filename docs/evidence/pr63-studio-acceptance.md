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
  没有重复 Run、原 member 的消息链接仍相同。探针的原始 native turn 没有可恢复的
  完成时间，必须显示 incomplete；这不意味着所有 native 历史都不完整。
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

当前仍在执行完整候选门禁；支持资格尚未提升，PR 尚未合并。不提前勾选未完成 AC。
完成后在本节记录同一候选的命令、准确提交、日志摘要、复查和发布结果。

本轮按 `tdd` 的已确认公开边界验证，通过 `dsh-plugin-dev` 保持真实发货入口和
精确来源；最终使用 `code-review` 独立检查 Standards／Spec 两轴。
