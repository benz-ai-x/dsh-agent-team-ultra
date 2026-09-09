# B0 精简基线验收

日期：2026-09-09（Asia/Shanghai）。候选 `0.2.0-b0.1`；发布状态见 [根交接](../../HANDOFF.md)，本证据不构成合并许可。
范围：[ADR 0028](../adr/0028-establish-official-dsh-only-baseline.md)、
[项目契约](../agent/PROJECT_CONTRACT.md)、[TODO](../../TODO.md)。

## 结论

已完成官方优先、DSH-only 的代码／依赖／活动文档清理。
最终完整 `pnpm run verify` 自然退出 0，自动化清理验收通过；六个 B0 本地归档已生成。
B0-12 真实账号任务／人工浏览器验收未执行，不宣称生产可用、PR 审批通过或旧 Spec #18/#44 完成。

## 固定输入

| 输入 | 值 |
| --- | --- |
| Ultra 旧基线与 main | `f84584def627b4af78a029af8788de73da0ad567` |
| 工作分支 | `chore/official-dsh-only-baseline` |
| 官方 Harness | `0.1.5-alpha.1` / `5dda764ed3aa172535a7967b06ff95d9cbfe536a` |
| docsDigest | `fde0d2d31418311ee2ca0cdbf07a163917e7affbe6d2720de27fda52cd0b6632` |
| 实际来源 | `.dsh/official-015`，由 `.dsh/harness` 统一引用 |
| Node / pnpm | 运行 Node 22.22.1；官方配置加载用 Node 24.11.1；pnpm 11.7.0 |
| 新数据 | Session 3、不压缩 JSONL、JSON domain `agent_team_ultra_b0` version 1 |
| 本地闭包 | 三个 Ultra 包＋三个未修改的官方 Team 包，精确官方 peers 来自固定源码 |
| 最终运行输入指纹 | 67 个文件，SHA-256 `32f4f858944786be584a4f61aae72eda01dc7d10625f01fb9ee7295305eab9ea` |

运行输入指纹算法：按路径排序，逐文件计算 SHA-256，汇总为 `[path, digest]` 数组，
对无缩进 `JSON.stringify` 结果再取 SHA-256。范围为根 `package.json`、`pnpm-lock.yaml`、
`pnpm-workspace.yaml`、`dsh-reference.lock.json`、`tsconfig.host.json`、`tsconfig.client.json`、
`vitest.config.ts`，加 `packages/` 与 `scripts/` 中的 `.ts/.tsx/.css/.mjs/.json/.yaml/.yml`，
排除 `lib` 和 `node_modules`。最终验证后没有再修改这些输入；只回填说明文档。

用户提供的 `/root/workspace/deepseek-harness` 十个既有 dirty 文件不作为官方输入，也没有修改。
旧维护 Harness `3c38b1d4e8bf219750203e44b1df033ced754e92` 与旧程序、数据保留。

## 已执行与最终门禁

- 改动前 strict：648 PASS／0 warnings；旧 Git 历史 bundle 已创建并验证。
- 官方原生 addon、Host、Client、Web 的独立构建及新 `build:harness` 聚合入口均成功；源码身份保持干净。
- 新数据准入、生成 Remote、发布与启动、Client、Profile、来源／兼容性测试已有一轮 39 tests／8 files 通过。
- 后续增加冷 pending／不可证明恢复、完整 child-scope hooks／工具／记忆、官方 fork／续接、请求入队快照；最新真实 Host 工作流 11 项通过。
- 六归档实际 CLI 安装、普通 package imports、官方 Loader 组成、安装后的 Host 工作流、Web 监听与自然退出、完整卸载并保留数据已有一轮通过。
- 最终 `pnpm run verify` 自然退出 0：strict／Host＋Client build／正式 Typert 与兼容性证明生成通过；**46 tests／9 files** 全绿。
- 同一最终命令打包并真实安装六归档；对安装后的 Host／生成 Remote／Studio 字节运行 **12 tests／2 files** 全绿。浏览器模块只允许官方加载槽提供 React／JSX，不内联 Host 运行时。
- 同一最终命令真实 Web 冒烟输出 `{"ready":true,"forced":false,"code":0,"signal":null}`；完整卸载后六包及其 Loader 配置无残留，B0 marker 与数据哨兵保留。
- 随后直接执行 `node scripts/pack-local-overlay.mjs`，复用同一已验构建生成六个 B0 本地归档，不重复跑全部门禁；不发布／不安装到用户工作环境。
- 9 份活动文档的 45 个本地链接与 `git diff --check` 通过；main／tracking 本地引用、四个 stash、旧维护源码及官方目录十个既有改动保留。正式官方输入源码仍 clean，旧历史 bundle 再验有效。

旧 452 项测试包含已退役的 native、消息中心、Run／Eval、历史迁移等产品功能；
数量下降不代表同一功能降低了覆盖要求，也不能直接以两组数量比较质量。
保留行为改用以下公共入口验收，最终总门禁集中执行，不在每个编辑步骤重复跑全套。

## 验收映射

| AC | 公共边界与断言 | 证据入口 |
| --- | --- | --- |
| B0-01 | 固定 clean source／真实依赖解析／TypeScript 来源／同版本改字节拒绝 | `scripts/tests/locked-source.spec.ts`、`runtime-compatibility.spec.ts`、strict |
| B0-02 | 显式初始化／重复准入／损坏、旧格式、软链接零写入拒绝／加载前拒绝 | `packages/domain/tests/baseline-data.spec.ts`、runtime compatibility |
| B0-03–04 | 真 Host、生成 Remote、真实 JSON；伪造／旧／teammate Agent 拒绝；Revision／CAS／手动发布／归档恢复 | `packages/domain/tests/b0-workflow.integration.spec.ts` |
| B0-05–06 | UUID 重试／输入冲突、入队快照、普通同名成员不收编、旧 Profile 固定、active/pending/unproven 冷恢复、官方 fork／同一成员续接 | 同一 Host 工作流 |
| B0-07–08 | 真 Agent Loop 的 persona prefix／官方 suffix、child-only hooks／记忆／工具、取消／drain／Fiber 撤销 | 同一 Host 工作流 |
| B0-09 | 保存冲突保草稿、刷新失败保快照、晚响应隔离、丢响应仍用同 UUID、关闭取消、Slot／Remote 清理 | `packages/ui/tests/` |
| B0-10 | 八个生成 Remote 方法；旧字段传递到 Host 后拒绝；真实归档没有退役包、实现／声明、测试／源码／map | `generated-remote.spec.ts`、`scripts/verify-pack.mjs` |
| B0-11 | 真 CLI 安装／普通解析／Loader；安装版 Host、生成 Remote 和 Studio 字节；Web 启停／卸载后 marker 与哨兵保留 | `scripts/verify-pack.mjs` |
| B0-12 | 真实认证账号完成员工任务、Profile 效果与官方会话续接 | **未验证，需另行授权环境** |

测试只控制模型适配器和联验的进程内传输／导航端点；产品 Profile、Team、Session、JSON 持久化、Host 与生成协议不替换。
Studio 交互使用 JSDOM，不是人工浏览器；Web 冒烟启动真实服务器，不触发认证模型调用。
标记与 Session 头准入不等于 Ultra 自行全量重放 Session，完整事件合法性仍归官方 codec。

## 发现与修复过程

- 官方 Node 22 默认配置加载器无法解析官方 workspace 导入。Node 24.11.1 原生加载器完整构建通过，不为此改官方业务源码。
- 官方 Session JSONL 默认压缩为 zstd，与 B0 明确不压缩策略冲突；Profile 现显式配置 `compression: none`。
- JSON storage 的 key 不能直接使用 JSON tuple 字符串，已改为该 tuple 的 SHA-256，复用同一纯函数验证恢复。
- 生成的普通 `z.object` 会删未知字段，现使用可生成的 JSON index signature 将未知字段送到 Host 严格拒绝，不静默丢弃旧 runtime／gate 输入。
- 官方 CLI 导入后不再自动启动；包装器改用其公开 `runCli()`，随后实际 Web 启停成功。
- 入队后调用者改写请求导致 CAS／启动判断漂移：公共 Host 回归先失败，加入入队快照后同一测试及 11 项工作流通过。
- 沙箱 pnpm 数据库访问和子进程 `EPERM` 导致检查失败；授权原命令在沙箱外重跑通过，没有放宽业务断言。
- 发货 Studio 联验初次装配缺直接声明的官方测试依赖，已补 devDependencies；JSDOM 会改写本地 Host 的 URL，现让发货 Host 保持原生 Node ESM 加载，保留兼容性检查。
- 同一发货联验随后暴露真实 UI 作用域漏声明 `remote`，页面读取／保存失败。补上明确依赖后，发货 bundle → 官方 Client Gateway → 生成 Host Remote → 真实存储的 CAS／丢响应重试／官方会话跳转／清理联验通过；UI 三文件合计 10 项通过。
- 启动的确定业务拒绝不再误标为“结果未知”；只有传输／Remote 层结果不明才提示沿用原 UUID 重试。

## 历史与可恢复性

旧 Git 历史 `.dsh/pre-b0-f84584d.bundle` 已验证；原三个包的忽略 lib、两个 native 包的剩余依赖／构建产物
移入 `.dsh/pre-b0-generated/`，不删除用户应用数据。新归档单独位于 `artifacts/agent-team-ultra-b0`。
旧契约／词汇／TODO／交接归档在 `docs/history/`；历史研究与验收报告保留其原结论。
清理阶段未重新启用 `dsh-plugin-dev`，没有提交、推送、远端 Issue／PR 更新或消息通知。
用户随后单独授权创建 B0 PR，发布阶段记录如下；不覆盖清理阶段的历史事实和数据保护要求。

## PR 发布前复核

创建 PR 前再次执行 `pnpm verify`，自然退出 0：496 strict／0 warnings、46 tests／9 files，
六归档真实安装与安装版 Host／Studio 12 tests／2 files 通过，Web 正常监听并自然退出，完整卸载保留数据。
67 个运行输入仍为上文相同指纹；本轮没有改运行代码或依赖，仅补发布状态和截图。
远端 main 已 fetch 核对为 `f84584d`；旧 #18、#44 仍 OPEN，不设置自动关闭关系。

以下截图由 Chromium 实际渲染当前 `packages/ui/lib/client.js`，使用只读演示数据和隔离预览容器；
不是官方 Web 的完整外壳，也没有真实模型调用。模型／持久化／错误冒泡以自动化联验为据，真实账号验收仍单列。
Client bundle SHA-256：`2b345b549df697d87d47a18283a0ff545bd8f2e5c89afe28d8d8e6513fd95df8`。

![B0 Studio 发货界面预览（演示数据）](b0-studio-preview.png)
