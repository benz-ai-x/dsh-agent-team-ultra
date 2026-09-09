# Agent Team Ultra · B0

一个“官方优先、DSH-only”的本地员工 Profile 层。
官方 DeepSeek Harness 负责运行 Agent、Team、Session、模型调用、任务、消息和对话；
Ultra 只保留可复用员工定义及其部署关系。

当前为本地候选 `0.2.0-b0.1`。固定官方 `0.1.5-alpha.1` /
`5dda764ed3aa172535a7967b06ff95d9cbfe536a`，不修改官方业务源码。
[范围契约](docs/agent/PROJECT_CONTRACT.md) · [TODO](TODO.md) ·
[验收记录](docs/evidence/b0-baseline-acceptance.md) · [交接](HANDOFF.md)。

## 保留与移除

| 保留 | 交回官方／退出 B0 |
| --- | --- |
| 不可变 Profile Revision、Head CAS、手动激活／回滚／归档 | 自动晋级门禁、Eval、独立 Run 证据台 |
| persona、mission、上下文、人工维护的记忆、声明式 hooks、继承工具过滤 | 自动记忆系统、可执行脚本型 hooks |
| 官方 spawn/fork 队友、启动 UUID 去重、固定 Revision 的 Binding | 持久 Codex／Claude 员工、运行时目录和独立模型选择 |
| 最小 Studio、版本查看、启动、实例、官方对话入口 | 自建消息中心、任务 DAG／watch 扩展、对话式 Profile 工具 |

保存产生候选版本，必须手动激活才能用于新启动。激活／回滚不改变已存在的员工。
每个 Team 的队员名称由官方永久保留，启动失败也不能用新 UUID 强行替换。
模型由官方续接机制继承；Studio 只展示实际观测到的子 Agent 路由，不承诺独立选模。
Studio 手动刷新；高级上下文、记忆、hooks、工具策略使用 JSON 编辑并由 Host 严格校验。

## 开发与验证

运行环境：Node `^22.19.0 || >=24.0.0`、pnpm `11.7.0`。
官方原版 tsdown 配置在本机 Node 22 默认加载器下会失败；构建时使用
Node >=24.11.1 原生配置加载器即可，无须修改官方源码。运行测试与 CLI 可继续使用 Node 22。

准备一个固定提交的干净官方 checkout（不要覆盖已有工作目录）：

```bash
git clone https://github.com/deepseek-ai/deepseek-harness.git /absolute/clean-official-harness
git -C /absolute/clean-official-harness switch --detach 5dda764ed3aa172535a7967b06ff95d9cbfe536a
pnpm --dir /absolute/clean-official-harness install --frozen-lockfile
DSH_HARNESS_ROOT=/absolute/clean-official-harness DSH_BUILD_NODE=/absolute/node-24.11.1/bin/node pnpm build:harness
DSH_HARNESS_ROOT=/absolute/clean-official-harness pnpm prepare:harness
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm verify
```

`build:harness` 构建官方原生组件、Host／Client 库和 Web 静态资源；不改源码或放宽锁。
首次准备前需有可用 pnpm；普通升级仍先完成来源准备，再安装本仓库依赖。
`.dsh/harness` 是所有消费者唯一使用的准备链接；不要分别改依赖或 TypeScript 路径。

`pnpm verify` 在最终候选集中执行来源校验、构建、所有产品测试、真实归档安装、
受控模型的完整 Host 工作流、Web 启停和卸载。真实账号验收独立记录，不冒充自动化通过。

## 安装到本地 dsh web

B0 不支持覆盖旧版安装或迁入旧数据。创建一个新的绝对路径 `DSH_HOME`，
显式初始化其 B0 数据目录，之后再安装。不要使用旧工作目录、旧 sessions 或旧 SQLite 文件。

```bash
export DSH_HOME=/absolute/new-isolated-dsh-home
pnpm data:init /absolute/new-isolated-dsh-home/ultra-b0
pnpm pack:local
```

`pack:local` 输出完整归档和实际安装／卸载命令；当前为三个 Ultra 包和三个官方 Team 包。
保持同一个 `DSH_HOME`，执行输出的 `dsh:checked` 安装命令后启动：

```bash
pnpm dsh:checked web --no-open --port 4317
```

使用空闲端口。数据仅位于 `DSH_HOME/ultra-b0/sessions` 和 `storage`：
Session 3、不压缩 JSONL、JSON domain `agent_team_ultra_b0`。
坏标记、缺目录、旧格式或软链接会直接拒绝，不会重新初始化为空数据。
卸载前先停止 Web；运行输出的完整卸载命令。卸载不删除员工数据。

## 旧版本与后续方向

旧完整产品：Ultra `f84584def627b4af78a029af8788de73da0ad567` +
维护 Harness `3c38b1d4e8bf219750203e44b1df033ced754e92`。
历史实现、旧测试和研究记录保留；B0 不是它们的无损迁移版，也不代表旧 Spec #18/#44 已验收。
任何未来导入须另行设计；不得把旧 gate、native handle 或 route 字段静默丢弃后导入。

下一步先验证一个真实 DSH 员工使用场景，再决定 Profile 工作流是否值得继续深化。
暂不恢复多运行时、完整评测平台或第二套 Team 管理界面。
见 [决策](docs/adr/0028-establish-official-dsh-only-baseline.md) 和
[官方重新评估](docs/research/2026-09-09-official-015-reevaluation.md)。
