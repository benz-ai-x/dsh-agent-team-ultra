# DSH Agent Team Ultra 交接文档

> 交接快照：2026-08-30（Asia/Shanghai）
>
> 当前阶段：首个端到端 vertical slice 已完成，包含 Web 创建数字员工、真实模型调用和进程重启后的冷恢复。

## 1. 接手结论

本项目是依赖 DeepSeek Harness（DSH）的本地 Agent Team 强化插件。当前版本已经可以在 DSH Web 中可视化维护 Agent Profile，并把 Profile 创建为真实、可恢复的 Agent Team 队友。Profile 覆盖命名、provider、上下文模式、persona、mission、工具策略、上下文块、策展记忆和声明式 Hook。

接手后先运行：

```sh
pnpm install
pnpm context:check:strict
pnpm verify
```

只有严格上下文检查通过后才应修改代码。项目当前绑定的 Harness 基线是：

| 项目 | 固定值 |
|---|---|
| DSH 版本 | `0.1.2-alpha.1` |
| Harness commit | `cd5ef8148158c3a752a658978873241fdf8e2bbc` |
| Harness docs digest | `80f2fb6fc17b9d071a7985ae331ccd6cec0be637d53916c574f92fdce1b75c07` |
| Node.js | `^22.19.0 || >=24.0.0` |
| pnpm | `11.7.0` |
| 交付方式 | local-only、六个源码 `link:` |

固定值的唯一机器可读来源是 [`dsh-reference.lock.json`](../dsh-reference.lock.json)。默认 Harness checkout 位于相邻目录 `../deepseek-harness`，也可以通过 `DSH_HARNESS_ROOT` 指定。

## 2. 当前仓库状态

- 分支：`main`
- 远端：`git@github.com:benz-ai-x/dsh-agent-team-ultra.git`
- 已推送基线提交：`c7ca014`（`feat: initialize DSH agent team plugin`）
- 本交接快照中的本地待提交内容：人工冷恢复验收已在 [`TODO.md`](../TODO.md) 勾选，以及本交接文档和 README 入口。
- 锁定的 Harness checkout 当前位于 `/Users/pc2026/Dev-Space/deepseek-harness`，commit 正确；但交接末次复验时该 checkout 出现了其他进行中的 `ui-workspace` 修改，详见“本次复验状态”。
- 人工验收使用的隔离 DSH Profile 仍保留在 `/Users/pc2026/.dsh/profiles/agent-team-ultra-e2e`；测试 Web 服务已停止。
- 本机没有全局 `dsh` 命令。需要使用 `/Users/pc2026/Dev-Space/deepseek-harness/apps/cli/lib/bin.js`，或自行安装与锁定版本一致的 CLI。

交接文档不会记录 API key、凭据正文、临时 Web token 或 Session URL。隔离 Profile 只应保留在本机，不能提交进仓库。

## 3. 系统边界与数据流

```mermaid
flowchart LR
  WEB[DSH Web\n数字员工工作室] --> REMOTE[生成的 Typert Remote]
  REMOTE --> HOST[DigitalEmployeeService]
  HOST --> STORE[(agent_team_ultra\nprofiles + bindings)]
  HOST --> TEAM[DSH Agent Team]
  TEAM --> CHILD[Continuable child Agent]
  STORE --> SETUP[Child-scope setup]
  SETUP --> CHILD
  SETUP --> CAP[Persona / Context / Memory\nTool policy / Hooks]
```

职责边界如下：

| 模块 | 责任 | 关键入口 |
|---|---|---|
| `packages/domain` | Host 服务、schema、CAS、持久绑定、child-scope 能力安装、Typert 合约 | [`src/index.ts`](../packages/domain/src/index.ts)、[`src/spec.ts`](../packages/domain/src/spec.ts)、[`src/types.ts`](../packages/domain/src/types.ts) |
| `packages/ui` | Web Remote 挂载、会话头部 Slot、Profile 编辑器、中英文文案 | [`Studio.tsx`](../packages/ui/src/client/Studio.tsx)、[`mount.ts`](../packages/ui/src/client/mount.ts) |
| `packages/profile` | 组合 Ultra 与上游 Agent Team，关闭冲突工具行 | [`cordis.patch.yml`](../packages/profile/cordis.patch.yml) |
| `scripts` | 上游契约锁定、Typert 生成、本地打包和真实 DSH 启动门禁 | [`verify-dsh-context.mjs`](../scripts/verify-dsh-context.mjs)、[`verify-pack.mjs`](../scripts/verify-pack.mjs) |

Host 依赖 `agents`、`agentTeams`、`storageDomain`、`subagents`、`systemPrompt` 和 `tools` 六项 DSH 服务。浏览器只维护草稿和显示结果，不拥有权限或持久化真相。

## 4. 不可破坏的实现约束

### 权限

- Remote 只接收 Session ID；Host 必须通过 `ctx.agents.get()` 解析为当前精确的 live `Agent`。
- Team、角色和 member 身份必须由 Agent Team 服务推导，不能相信 Client 声明。
- 只有当前 Team 的精确 live Lead 能创建数字员工。
- 保存和删除 Profile 要求 live Session，但目前不要求 Lead；创建员工明确要求 Lead。

### 持久化与恢复

- Profile 和 Team/member 绑定写入版本化 storage domain `agent_team_ultra`，当前 domain version 为 `0`。
- `profiles` 保存完整版本化 Profile；`bindings` 保存 Team、成员名、成员 ID、Profile revision、不可变 Profile 快照和 `pending | active | failed` 状态。
- 创建流程必须先持久化 `pending` 绑定，再调用 Agent Team provisioning。否则 child 可能在 Profile 快照存在前启动。
- 已创建员工始终使用绑定时的快照。后续修改或删除 Profile 不会热更新已有员工。
- 不要向 DSH 的闭集 Session event catalog 添加自定义事件；本插件使用独立 storage domain。
- 修改 storage schema 前必须先设计迁移并提升 domain version，不能原地改变 version `0` 的持久格式。

### 工具、提示词与 Hook

- 工具策略支持 `inherit`、`allow`、`deny`。工具名在创建时相对当前 Lead 的真实工具目录再次校验。
- Agent Team 自有协作工具不进入 Profile 选择列表，也不能被 Profile 过滤掉；它们由 Team child scope 安装。
- persona 使用 system-prompt section；context 和 memory 使用有序 context section。
- Hook 只允许安全的声明式行为：

  - `session-start`：注入上下文。
  - `before-step`：在步骤前注入上下文。
  - `before-tool`：按支持 `*` 的工具 matcher 拒绝调用。
  - `after-tool`：按 matcher 追加上下文。

- Hook 不执行任意 JavaScript、shell 或用户代码。

### 并发与生命周期

- Profile 保存/删除使用 `expectedRevision` compare-and-set；过期编辑必须返回 `profile-conflict`，不能覆盖新版本。
- 读改写通过 Host mutation queue 串行化；Profile 对外和绑定内均使用深拷贝冻结快照。
- spawn 接受调用方取消信号，并与服务生命周期信号合并。
- 服务 dispose 时先关闭 admission，再撤销 child setup，等待已接纳 launch 和 mutation queue 收敛，最后关闭 storage domain。
- child-scope 能力必须逐项安装并按逆序释放；会话历史可见性不等于工具、权限或服务继承。

完整设计依据见 [`PROJECT_CONTRACT.md`](agent/PROJECT_CONTRACT.md) 和 [`0001-local-overlay-and-sidecar-state.md`](decisions/0001-local-overlay-and-sidecar-state.md)。

## 5. Remote 与错误语义

生成的 `digitalEmployees` Remote 提供四个操作：

| 操作 | 用途 | 可取消 |
|---|---|---:|
| `view` | 获取完整可替换 Studio view：Profiles、Lead 可继承工具、当前 Team 实例 | 否 |
| `save` | 按 `expectedRevision` 新建或更新 Profile | 否 |
| `deleteProfile` | 按 revision 删除 Profile | 否 |
| `spawn` | 使用 Profile 和可选 assignment 创建真实队友 | 是 |

业务拒绝通过成功 transport 内的 `{ ok: false, error }` 返回，transport 故障保持为异常。稳定业务码包括 `profile-invalid`、`profile-not-found`、`profile-conflict`、`profile-limit`、`profile-in-use`、`tool-unavailable`、`team-lead-required`、`team-rejected`、`assignment-too-large` 和 `service-disposed`。

修改 Remote 装饰方法后必须重新运行构建；[`generate-typert.mjs`](../scripts/generate-typert.mjs) 会调用官方 Typert generator 更新 Host 与 Client 产物，不能手写生成文件。

## 6. 自动化验证

`pnpm verify` 是合并前总门禁，顺序如下：

1. 严格核对 Harness commit、文档摘要、声明版本和生成/链接产物新鲜度。
2. 构建 Host、Client、Profile 和 Typert Remote。
3. 运行 Vitest。
4. 检查打包白名单和干净消费者安装。
5. 创建临时真实 DSH Web Profile，安装六个 source links，验证 Host import、最终 Cordis 组合和随机端口监听。

最近一次干净基线全量验证（本交接文档生成前）的结果：

- 严格上下文检查：`182 passed, 0 warnings`。
- Vitest：`6` 个测试文件、`18` 个测试全部通过。
- 归档内容：Ultra domain `11` 个文件、UI `8` 个文件、Profile `4` 个文件，无源码、测试、source map 或 tsbuildinfo 泄漏。
- 六个归档可在干净消费者中安装，browser-safe ESM import 正常。
- 六个源码链接可被真实 DSH Profile 解析；最终配置包含 `agent-team`、`tool-agent-team`、`agent-team-ultra`、`ui-agent-team`、`ui-agent-team-ultra`，Web 可监听随机端口。

测试职责分布：

- `packages/domain/tests/profile-service.spec.ts`：schema、不可变快照、并发 CAS、先绑定后 provisioning、Lead 权限、大小限制和 dispose 边界。
- `packages/domain/tests/generated-remote.spec.ts`：四个生成 Remote 操作及 Client namespace。
- `packages/domain/tests/loader-composition.spec.ts`：真实 Loader 和部署限制。
- `packages/profile/tests/profile.spec.ts`：private bundle 与稳定、无冲突 Loader rows。
- `packages/ui/tests/studio.client.spec.tsx`：重复操作围栏、Session 切换、错误分层、launch 取消和独立 Client bundle。
- `packages/ui/tests/mount.client.spec.ts`：Remote/Slot 安装与失败回滚。

### 本次复验状态

生成交接文档前，`pnpm context:check:strict` 在干净基线上通过了 `182` 项检查。文档生成后再次执行 `pnpm verify` 时，锁定 Harness checkout 新出现以下未提交修改：

```text
packages/client/ui-workspace/src/client/contract/slots.ts
packages/client/ui-workspace/src/client/index.ts
packages/client/ui-workspace/src/client/rows/WorkspaceBrowser.module.css
packages/client/ui-workspace/src/client/rows/WorkspaceBrowser.tsx
packages/client/ui-workspace/tests/apply.client.spec.ts
packages/client/ui-workspace/tests/workspace-browser.client.spec.tsx
```

因此末次 `pnpm verify` 在严格上下文阶段按设计退出，后续 build、test 和 pack 阶段没有在该次命令中执行。随后独立执行的 `pnpm build` 通过，`pnpm test` 仍为 `6` 个文件、`18` 项测试全部通过；pack/Web 组合门禁没有绕过严格基线检查重复执行。这些文件位于相邻 Harness 仓库，不属于本交接任务，未被修改或回退。确认这些改动已由其所有者处理、Harness 工作区重新干净后，再运行：

```sh
pnpm context:check:strict
pnpm verify
```

## 7. 真实模型与冷恢复验收证据

2026-08-30 已在隔离 Profile `agent-team-ultra-e2e` 完成一次人工 credentialed acceptance。凭据复用了本机既有 credential reference，没有复制到仓库或测试日志。

验收环境与对象：

- 模型路由：`zai-coding-cn / glm-5.3`。
- Lead 首次真实调用返回：`LEAD_MODEL_OK`。
- Web 创建的 Profile：`ultra-reviewer-0830-1505`，revision `1`。
- Profile 配置包含只允许所选工具、独立 context、memory 和 `session-start` Hook。

首个 child 真实响应同时包含：

```text
COLD_RESUME_OK
ULTRA_PROFILE_MARKER_0830_1505
CONTEXT_MARKER_0830_1505
MEMORY_MARKER_0830_1505
HOOK_MARKER_0830_1505
```

随后完整停止测试 Web 进程，确认监听消失，再用同一 DSH Home 和 Profile 重启。重新打开 Lead 使 live Agent/Team 激活后，Studio 恢复 Profile v1 与 active r1 绑定；恢复后的同一 child 第二次真实模型调用返回：

```text
COLD_RESUME_SECOND_CALL_OK ULTRA_PROFILE_MARKER_0830_1505 CONTEXT_MARKER_0830_1505 MEMORY_MARKER_0830_1505 HOOK_MARKER_0830_1505
```

一个重要运行时现象：进程刚重启、Lead 尚未重新打开时，历史 child 会先以只读历史存在；打开对应 Lead 后，Team 和 continuable child 才重新成为 live 对象。这符合 DSH 的 Session/Agent 激活模型，不应通过信任历史 Session ID 绕过。

## 8. 本机启动与复验 Runbook

本机没有全局 `dsh`，可用锁定源码 CLI：

```sh
export DSH_HARNESS_ROOT=/Users/pc2026/Dev-Space/deepseek-harness
export DSH_HOME=/Users/pc2026/.dsh

node "$DSH_HARNESS_ROOT/apps/cli/lib/bin.js" \
  --profile agent-team-ultra-e2e \
  --dump-config

node "$DSH_HARNESS_ROOT/apps/cli/lib/bin.js" \
  --profile agent-team-ultra-e2e \
  web --no-open --port 4317
```

端口被占用时换一个空闲端口。不要停止或修改用户已有的其他 DSH Web 进程。

重新做完整冷恢复验收时：

1. 用隔离 Profile 启动 Web，创建新的 Lead 会话并完成一次真实模型调用。
2. 在 Lead 会话头部打开“数字员工”，创建带唯一 marker 的 Profile。
3. 保存、创建员工，并让 child 返回 persona/context/memory/hook marker。
4. 正常停止该隔离 Web 进程，确认端口不再监听。
5. 使用相同 `DSH_HOME`、Profile 名和模型配置重启。
6. 先重新打开 Lead，再进入已恢复的 child。
7. 发起第二次真实模型调用；Profile revision、active binding、历史和全部 marker 都恢复才算通过。

若要创建一套全新的可运行安装，先运行：

```sh
pnpm run pack:local
```

该命令生成六个审计归档并打印六个绝对源码 `link:`。归档用于内容验收；当前可运行交付仍必须使用打印出的六个源码链接。完整安装命令见 [`README.md`](../README.md#安装到本地-dsh-web)。

## 9. 已知限制与下一阶段

当前限制：

- 上游三个 Agent Team 包仍是 private，不能声称 npm 独立可安装。
- 只支持同一进程内的现有 Agent Team；不支持嵌套 Team 或跨进程 Team 消息。
- 已创建员工不热更新 Profile，策展记忆也不会自动写回。
- 不提供托管 worktree、自动任务所有权、Profile 导入导出或 secret-reference 字段。
- Hook 首版只支持上下文注入与工具拒绝。

[`TODO.md`](../TODO.md) 中剩余工作按优先级建议为：

1. 在 DSH 提供可强制执行的 ownership seam 后增加可选 managed worktree。
2. 增加 Profile 导入/导出与 secret reference，同时确保凭据不经过浏览器或持久 Profile 明文传输。
3. 在任何 storage-domain 格式变化前实现迁移工具和失败恢复策略。
4. 上游 experimental Agent Team 包发布后，重新评估公开包和 registry 安装闭包。

## 10. 修改前后的检查清单

修改前：

- 完整阅读 [`AGENTS.md`](../AGENTS.md)、[`PROJECT_CONTRACT.md`](agent/PROJECT_CONTRACT.md)、[`TODO.md`](../TODO.md) 和 [`dsh-reference.lock.json`](../dsh-reference.lock.json)。
- 运行 `pnpm context:check:strict`。
- 确认锁定 Harness checkout 干净；不要在 Harness 源码目录生成或保留临时文件。
- 修改上游相关行为前先阅读锁定 checkout 中对应 subsystem 文档和真实实现。

修改后：

- 更新或新增最靠近行为边界的测试，不只测试 helper。
- Remote 变化后检查生成产物；Loader 变化后检查最终 `--dump-config`。
- 运行 `pnpm verify` 和 `git diff --check`。
- 涉及恢复、权限、取消、工具策略或模型提示词时，再做一次隔离 Profile 的人工真实 Web 验收。
- 检查 `git status`，确认没有凭据、Profile 数据、临时 token、归档或 Harness 工作区副作用进入提交。
