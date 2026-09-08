# PR #61：真实协作能力修复与复查

## 范围与固定点

用户要求仅修复并复查 PR #61。Ultra 起点为 `b7a5ec68a23c6cd298a5d260510089859b9a54f4`，完整 PR 比较基点为 main `9835db4361dcad500b3be09ef69f78420d71a6ab`。Harness 起点为 `bb9b48954821a29f712043b08b746085cc07a440`，完整配套比较基点为 main lock `b78caad462c3509127761904ed59ee549b6b6160`。不修复 PR #60 遗留项或推进 #38–#44。

权威要求：[Issue #37 AC2](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/37) 要求按真实可执行能力校验并分别展示；[Spec #18 D-11](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18) 将完整协作与其他能力分离。

## 修复

- DSH 成员快照读取精确 live Agent 的工具 schema；六项 Team 协作工具不齐全时不再显示完整协作。`tools/change` 使生成 Remote 的 baseline／replace 快照随工具卸载和重装更新，Host Fiber 同步回收通知订阅。
- 原生 create／resume 对显式必需的 `full-collaboration` 校验精确 handle 返回的全部成员操作；缺失、空或部分证明均拒绝。复用原有世代隔离及等待资源清理，其他提供方不受影响。恢复时不向能力不足的运行时投递排队工作，新注册恢复原身份；不替换 native handle 或升级持久格式。
- 普通原生成员的可用性还比较已接受 handle 的实时协作证明；有限或未确认能力不会因目录声明而升级。未要求完整协作的成员仍可按实际能力运行。

## 验证记录

日志位于隔离工作目录 `/root/workspace/pr61-fixes.7yIVdj/`，未提交生成文件或私有运行状态。

- RED：`fix-round2-native-red.log` 证明必需完整协作的请求原先错误成功；`fix-round2-dsh-red.log` 证明卸载实际工具后原快照仍错误显示 full。
- Harness：`fix-round2-harness-coverage-final.log` 为 258 tests／8 files 通过，`teammate-runtime.ts` statements、branches、functions、lines 均 100%。`fix-round2-harness-build.log` 完整构建通过；`fix-round2-harness-docs-quick.log` 15 项和 `fix-round2-harness-doc-sync.log` 32 项文档门禁通过。
- 正常 Harness commit hooks 通过，本地提交 `57670c6b320f7f240cbad360a9f691c8598e1571`。完整 lint 的唯一剩余项是未改 `packages/experimental/agent-team/tests/message-read.spec.ts:541` 两条既有诊断；不把全量 lint 标为通过。
- Harness built Remote／Loader 2 项和 Web 回放 5 项通过，日志为 `fix-round2-harness-e2e.log`、`fix-round2-harness-web.log`。
- Ultra：`fix-round2-studio-final.log` 的 10 项公开 Host／生成 Remote 回归通过，覆盖普通／Profile-bound DSH 工具卸载和恢复，以及原生成员的拒绝、清理、排队和原身份恢复。
- 完整 `pnpm verify` 在 `fix-round2-ultra-verify-final.log` 自然退出 0：590 strict／0 warnings、382 tests／32 files、八归档安装／解析、production DAG／CAS／watch、真实 Web 启动、Codex／Claude JSON＋SQLite 冷恢复及完整卸载。新增 packed Studio 探针在两种存储下均通过，直接验证真实 Loader 工具卸载／重装及必需原生完整协作的拒绝。
- 验证过程中的失败保留：首次新锁构建因 agent-team 的 built-types freshness 被拦截，使用正式 `tsc -b packages/experimental/agent-team/tsconfig.json --force` 重新生成后原样重跑通过。首次全量测试暴露旧模拟工具缺少公开 `schemas()`、离线成员仍预期 full 两类夹具问题；已补齐接口并断言 unknown，未给生产代码加兼容绕过。另一个未改的 Claude 64-call 测试曾在并行构建时超时；原样定向复跑和不与其他构建重叠的完整重跑均通过，未增加重试或放宽门禁。
- 夹具同步提交 `f5b2d4d08e6f4f5381ccd8ba1803bf189c35b3fc`；其运行源码、包清单、锁和脚本与修复提交 `06b736edb5415e100dbe6e3958191a0297703e6c` 完全一致。文档本地链接目标检查为 7 files／115 targets／0 missing，两库 `git diff --check` 通过。

## 独立双轴复查

完整 Ultra diff 为 `git diff 9835db4361dcad500b3be09ef69f78420d71a6ab...f5b2d4d08e6f4f5381ccd8ba1803bf189c35b3fc`，完整 Harness diff 为 `git diff b78caad462c3509127761904ed59ee549b6b6160...57670c6b320f7f240cbad360a9f691c8598e1571`。基点均有效且差异非空；两轴隔离审查，并纳入最后四文件的夹具／历史状态补查。后续交接只改文档，不扩展运行时修复。

### Standards

0 项规范违规，0 项可操作的 possible smell，最高严重度为无。审查覆盖 Ultra 50 文件和 Harness 48 文件的完整 PR 差异，并按仓库规则覆盖全部 12 项 smell 启发式。

确认 Ultra 使用 Host 权威、精确 live Agent 的公开工具 schema 和精确 native handle 操作证明；无证明时不沿用 full。Harness 在身份附着前验证 required-full 六项操作，隔离清理、世代替换和非持久化边界一致。Client 导航使用公开服务、冻结快照、精确 revision 消费及 Fiber 清理，并继续复用唯一 Team 面板。最后三个 fixture 修正与 live-only 事实一致。只读回看验证日志，未自行重跑；未把工具已报告的既有 lint 问题、PR #60 基线问题或收尾证据文字列为本 PR 发现。

### Spec

0 项发现，P1／P2／P3 均为 0。审查确认 roster／Binding 精确关联、实际 DSH 工具事实、原生 create／resume 的必需能力门禁、同一面板导航，以及脱敏、CAS、审批和评测边界；未发现新增需求遗漏、错误实现或范围扩张。复查代理只读回看完整验证日志，没有冒充自行执行验证。

结论：Standards 0 项／最高无；Spec 0 项／最高无。本地修复候选通过，两个轴不合并或重排严重度。最终交接提交只同步本记录、TODO、PIPELINE_STATE 和 HANDOFF，不改变已验证且已审查的运行源码、测试、锁或脚本。

## 交付与限制

本轮尚未推送 Ultra 或 Harness；最新远端回读 PR #61 仍为 OPEN、`b7a5ec68a23c6cd298a5d260510089859b9a54f4`、MERGEABLE／CLEAN，Harness 远端 `fix/pr61-member-capabilities` 仍为 `bb9b48954821a29f712043b08b746085cc07a440`。未合并 PR 或改变主工作区，main 仍为 `9835db4`，原 `HANDOFF.md` 的 SHA-256 保持 `72b197878e7b6cd80ae871bb3c3b9b80a22725a62156c6779794518f5c6d1c4d`。

仍为 source-linked、local-only 交付；确定性 native 边界测试不等于 #44 的真实认证产品验收。使用 `dsh-plugin-dev` 组织公开 Host／Loader／卸载验证，用 `code-review` 分别报告 Standards 和 Spec；Harness 文档与测试技能限定了双语 owner 契约、资源清理和验证范围。
