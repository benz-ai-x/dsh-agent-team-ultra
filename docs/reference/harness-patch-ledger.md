# Harness 补丁清单 / Harness patch ledger

本清单对应 [Spec #18 修订 1.1](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18)
与 [#22](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/22)。中文规范中的
US-01、US-02、US-03、US-15、US-20、US-24、US-25、US-26、US-47、US-50、US-51，
D-01–D-04、D-21、D-22，以及 T-03、T-04、T-09 在英文版本中沿用相同编号。

The Chinese Spec is normative. Requirement identifiers above are shared by
both language versions. This ledger records maintained changes; it does not
claim that an upstream contribution was submitted or accepted.

## 固定身份 / Fixed identities

| 身份 / Identity | 固定值 / Pinned value | 意义 / Meaning |
| --- | --- | --- |
| 官方基础 / Official foundation | `76fda729799fe9b3848dbe2c211d4b231032b81e`, `0.1.2-rc.1` | 当前 fork 与较新官方基线的共同祖先 / common ancestor of the maintained fork and comparison baseline |
| 维护 fork / Maintained fork | `8b4bae0b620cc89a987a3ec6dd8b0b7d9025649a`, `0.1.2-rc.1` | 当前完整运行资格 / current complete runtime qualification |
| 官方对照 / Official comparison | `d347e703908d0406b7a7ef80e3a0e594d86b2215`, `0.1.3-alpha.1` | 对照及阶段 C 移植目标，当前不能直接替换 / comparison and phase C port target, currently unsupported as a replacement |
| 文档摘要 / Documentation digest | `2bdc220516b6fa090ca99215fd3a2ff8f5805c4bec6bd0f48e8e51fba77a8656` | 锁定文档内容 / locked documentation content |
| 扩展接口资格 / Extension API qualification | `agent-team-ultra.phase-a.v1` | Ultra 声明的组合资格标签，不冒充 Harness 导出常量 / Ultra qualification label, not a Harness export |
| Session 格式 / Session format | fork `0`; official comparison `2` | 不可只比较软件版本 / independent from package semver |
| Team 事件 / Team events | `2` | 数字相同但严格 schema 不同 / same number, different strict schemas |
| Team 投影 / Team projection | `3` | fork 增加固定路由、native handle 和回执字段 / fork adds routes, native handles, and receipt fields |
| Ultra domain | `agent_team_ultra_v1`, version `1` | 独立 sidecar generation / independent sidecar generation |
| Codex wrapper / payload / protocol | `@openai/codex@0.149.1`; `0.149.1-<platform>-<arch>`; `app-server-v2` | 具体平台 payload 由 provider 的资格检查确认 / provider qualification resolves the exact platform payload |
| Claude SDK / payload / protocol | `@anthropic-ai/claude-agent-sdk@0.3.241`; Claude Code `2.1.241`; `claude-agent-sdk` | SDK 与 native 产品版本独立 / SDK and native product versions are separate |

权威机器记录为 [reference lock](../../dsh-reference.lock.json)。构建以该锁验证源码，
再生成每个运行包的公开入口和实际发货 JavaScript 摘要；安装后的检查会沿每个包自己的
Node 依赖路径验证，不能用相同 semver 或另一个包的正确依赖掩盖混用。
Source attestation and installed artifact validation are complementary: the
former identifies the source and documents; the latter verifies the actual
executable closure selected by Node. Neither proves valid native user login.

## 维护变更 / Maintained changes

提交链接固定到维护仓库。下列变更尚未被本清单证明已合入官方仓库；阶段 C 按
[#39](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/39) 重新移植和验证，
不把“有类似 API”当作格式兼容证明。

| 提交 / Commit | 用途与公开契约 / Purpose and public contract | 格式影响 / Format impact | 验证 / Verification | 上游状态 / Upstream disposition |
| --- | --- | --- | --- | --- |
| [a1763182b2](https://github.com/benz-ai-x/deepseek-harness_x/commit/a1763182b2) | 固定 teammate 请求及解析后的模型路由 / pin requested and resolved teammate routes | Team member 增加路由字段 / member route fields | `agent-team/tests/team.spec.ts`; Ultra pinned-route integration | maintained; official comparison lacks these fields |
| [9b76fa2282](https://github.com/benz-ai-x/deepseek-harness_x/commit/9b76fa2282), [a38141f78a](https://github.com/benz-ai-x/deepseek-harness_x/commit/a38141f78a) | 初始工作持久接受后转移取消所有权 / transfer cancellation ownership after initial-work durability | 无新版本号；影响 accepted 边界 / acceptance semantics | `agent-team/tests/team.spec.ts`; Ultra launch workflow integration | maintained; preserve during port |
| [ba8b9fc4ea](https://github.com/benz-ai-x/deepseek-harness_x/commit/ba8b9fc4ea) | durable external runtime provider 与 create/resume/deliver/interrupt/dispose / durable provider lifecycle | Team member external runtime、native handle、native turn receipt | `agent-team/tests/teammate-runtime.spec.ts`, `projection-events.spec.ts` | maintained; absent from official comparison |
| [655d53bf4e](https://github.com/benz-ai-x/deepseek-harness_x/commit/655d53bf4e) | Codex App Server 产品适配 / Codex product adapter | provider-owned runtime metadata and evidence | Ultra `packages/codex/tests`; `verify:codex-upgrade` (Loader, Remote, JSON/SQLite); authenticated canary remains #44 | moved to Ultra `packages/codex` / `@benz-ai-x/dsh-agent-team-codex` in #23; no upstream acceptance claimed |
| [19c4e08761](https://github.com/benz-ai-x/deepseek-harness_x/commit/19c4e08761) | Claude Code SDK 产品适配 / Claude Code product adapter | provider-owned runtime metadata and evidence | Ultra `packages/claude-code/tests`; `verify:claude-upgrade` (Loader, Remote, JSON/SQLite); authenticated canary remains #44 | moved to Ultra `packages/claude-code` / `@benz-ai-x/dsh-agent-team-claude-code` in #24; no upstream acceptance claimed |
| [5dd31c6454](https://github.com/benz-ai-x/deepseek-harness_x/commit/5dd31c6454) | 按精确 native turn 读取有界证据 / bounded exact-turn evidence | native turn / evidence identities and payloads | runtime provider suites; Ultra run evidence suite | maintained; provider-neutral Host contract stays in Harness |
| [03726d7baa](https://github.com/benz-ai-x/deepseek-harness_x/commit/03726d7baa) | 精确调用审批证据与 correlation / exact-call approval evidence | native approval and tool-call evidence | provider suites; Ultra evaluation and run evidence suites | maintained; stock approval authority is reused |
| [66c46893a6](https://github.com/benz-ai-x/deepseek-harness_x/commit/66c46893a6) | 不入 Team roster 的隔离评测 runtime / isolated evaluation runtime outside production roster | evaluation handle and terminal result contracts | `teammate-runtime.spec.ts`; Ultra evaluation suite | maintained; Profile and gate policy remain Ultra-owned |
| [4b60986f8c](https://github.com/benz-ai-x/deepseek-harness_x/commit/4b60986f8c) | 扩展与当时 Harness 合约对齐 / align extensions with then-current Harness contracts | 以固定 schema 与产物为准 / fixed schemas and artifacts remain authoritative | Agent Team package suites and complete Ultra archive verification | maintained compatibility adjustment |
| [f9e8a4d0fc](https://github.com/benz-ai-x/deepseek-harness_x/commit/f9e8a4d0fc), [8b4bae0b62](https://github.com/benz-ai-x/deepseek-harness_x/commit/8b4bae0b62) | catalog owner 控制的 provider generation 注册 / catalog-owner registration | 无持久 schema 变化 / no durable schema change | `runtime-provider-mount.spec.ts`; both adapter Loader suites; [ADR 0013](../adr/0013-route-durable-runtimes-through-the-catalog-owner.md) | maintained; disposal precedes native resource cleanup |

表中列出可重跑的测试责任，不表示本次运行了每个上游测试或真实产品 canary。
The test column identifies validation owners, not a claim that all those suites
or authenticated native canaries ran in this change. Final real native product
acceptance remains mandatory in [#44](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/44).

## 迁移方案 / Migration plan

[#25](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/25) 的
[ADR 0016](../adr/0016-audit-and-plan-format-aware-migration.md) 与
`pnpm migration:audit` 区分当前源格式和未来目标资格。阶段 C 方案为 Session `2`、
Team payload `3`、projection `4`；descriptor `3` 在固定双方源码中一致，Ultra v1
继续使用。native operation、发送请求和回复关联必须进入正式 schema、codec、
生成事件词汇及投影；没有已产生的目标提交前，审计报告明确标为尚未取得运行资格。
本次不修改 Harness 运行锁，阶段 A 完成后先进入 B。

The audit preserves source bytes, checks real Session projections plus JSON and
SQLite snapshots, and reports deterministic v0/v1 retry conflicts. The accepted
format plan is implemented in Phase C, with pending-target writes closed until
the final completion marker. Package ownership moves alone require no new Ultra
generation and provide no permission for dual writing.

## 共用行为探针 / Shared behavior probe

对分别构建的两个源码目录运行同一个脚本：

```sh
node scripts/probe-team-contract.mjs /absolute/path/to/locked-fork
node scripts/probe-team-contract.mjs /absolute/path/to/official-d347e7
```

The probe mounts real AgentLoop, Team, Session and JSONL persistence services.
Only the external model boundary uses a controlled adapter. It checks exact
live roles, Lead-only spawning, permanent names, task CAS, DAG cycles,
ownership, tombstones, change notification, wait cancellation, durable receipt
before delivery acknowledgement, and Fiber disposal through public APIs.
Passing these common contracts does not admit the official build as an Ultra
runtime: extensions and persistent formats still differ.

Node 22.22.1 的官方冻结安装成功，但默认 Host bundler 缺少 `unrun`；`tsx`
加载也失败。使用 Node 24.11.1 的原生配置加载完成同一干净源码的 Host bundle，
运行探针仍使用安装原生依赖时的 Node 22，避免 `fs-ext` 的 ABI 混用。
These are explicit build-environment conditions, not source or dependency-lock
changes. The maintained fork remains on its existing locked build.
