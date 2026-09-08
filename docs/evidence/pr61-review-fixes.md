# PR #61 三项审查修复

本轮仅修复 PR 头 `c42b9d80532e81f6a6e83761290a0e189253ea02` 的三项已确认问题，不合并 main、不推送或更新 GitHub。Ultra 分支是 `fix/pr61-review-findings`；配套 Harness 本地提交为 `4490b43a0f67b2851e23109edf5ae6232bea223d`。

## 修复与回归

| 问题 | 修复及验证边界 |
| --- | --- |
| 历史 Codex 线程被当前目录误报为完整协作 | Harness 将 create/resume 返回的 `memberOperations` 限于精确句柄及当前提供方世代，列表分离并冻结；未知、空集、部分操作与完整操作不会混同。Codex 只对本世代实际新建并安装六项工具的线程给出证明；冷恢复保持原线程及已安装工具，显示未知。Claude 每次 query 重新安装完整 MCP 工具，可给出 live 证明。Host/Studio 测试见 [Codex 回归](../../packages/codex/tests/studio-capabilities.integration.spec.ts)及[成员投影回归](../../packages/domain/tests/studio-members.integration.spec.ts)。打包 create/restart 的 Codex、Claude 探针也验证 Profile-bound 行。 |
| 普通外部成员能力降级后仍显示可用 | 投影使用成员持久保存的全部 requirements 与当前后端逐项比较。context、Profile、runtime 三类降级均显示 capability-mismatch；Host 保持排队且不调用失去能力的提供方，能力恢复后继续投递并保持身份。没有修改已有 Host 准入权限。 |
| 消息导航后 Studio 遮挡目标 | 公开导航调用后关闭 Studio；重新打开刷新快照并保留编辑草稿。现有 [Studio 测试](../../packages/ui/tests/studio.client.spec.tsx)验证目标身份、弹窗关闭和草稿保留。Chromium 组合真实 Studio、TeamAction、TeamMessageCenter、公开 navigation 及生产 header CSS：1280×900 下目标 SELECT 的命中点为 `(224, 451)`，选中 `review-worker`，trial click 成功，Studio 不再拦截。 |

## 已执行证据

- 普通成员原始 RED 是 `available` 与 `capability-mismatch` 断言失败；消息导航原始 RED 是 Studio dialog 未关闭；历史 Codex 原始 RED 是 `runtimeCapabilities` 仍含 `full-collaboration`。错误测试准备和构建新鲜度失败不计为产品 RED。
- Harness `teammate-runtime.spec.ts`、`native-member-operations.spec.ts`、`team.spec.ts`：3 files / 182 tests 通过；检查精确句柄隔离、列表分离、在线状态/投递/中断保留、resume/替换/释放清理。修改文件 lint 和 pre-commit 检查通过。
- Harness 完整 build 通过；doc-sync 在重新生成源文件行号目录并同步双语记录后为 32 passed / 0 failed。全量 lint 的 4 项既有违规位于未改的 `message-read.spec.ts:541`、`team.spec.ts:1165`、`team.spec.ts:1242`，未修复或绕过。
- Chromium 浏览器检查通过，pageErrors 为空，浏览器、Vite 与 HTTP listener 均完成清理。截图仅作为交互命中证据；组合未加载应用级主题，不作为视觉样式验收。
- Ultra 专项回归为 3 files / 38 tests，通过旧 Codex、普通成员需求漂移、Studio 全套交互测试。最终 `pnpm verify` exit 0：582 strict checks / 0 warnings、32 files / 364 tests、八个归档安装与解析、生产 renderer/Remote/Loader 恢复、真实打包 Web 启动、Codex 和 Claude 在 JSON/SQLite 下的 create/restart 与同一成员恢复、完整卸载均通过。来源检查前使用正式 build 与 `tsc -b packages/experimental/agent-team --force` 重建声明；没有修改时间戳或放宽来源锁。

工作日志及浏览器截图保留于 `/root/workspace/pr61-fixes.7yIVdj/`，包括 `ordinary-availability-red.log`、`member-navigation-red.log`、`codex-capabilities-red.log`、`harness-tests.log`、`harness-doc-sync-final.log`、`three-findings-green.log`、`ultra-verify.log`、`navigation-browser.log` 和 `nav-layering-after.png`。

## 明确限制

固定 Codex 0.149.1 生成协议的 `Thread`、`ThreadResumeResponse` 不包含已安装工具清单；不能把测试原生存储内的 `dynamicTools` 当作真实协议字段。因此，冷恢复后即便实际工具齐全，也只能显示“未确认”。本轮未增加原生私有存储读取、工具补装、线程替换或持久格式迁移。生成协议副本位于上述工作目录的 `codex-protocol/`。

认证原生验收仍归 #44；本轮未申请或使用新的真实模型凭据。修复验证不代表 PR 已重新评审、推送或合并。

最后 GitHub 回读的 PR #61 仍为原头、OPEN、CONFLICTING；与 main 的合并冲突未纳入本轮。主工作区的 HEAD、原 HANDOFF 改动和 `.dsh/harness` 链接均保持原样，原 Harness 924a622 工作区也保持干净。
