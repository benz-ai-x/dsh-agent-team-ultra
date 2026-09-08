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
- Ultra 的新锁构建、定向生成 Remote 回归、完整 `pnpm verify` 与最终双轴复查待完成后补记。

## 交付与限制

本轮尚未推送 Ultra 或 Harness；远端 PR 未因本地修复自动更新，未合并 PR 或改变主工作区。仍为 source-linked、local-only 交付；确定性 native 边界测试不等于 #44 的真实认证产品验收。使用 `dsh-plugin-dev` 组织公开 Host／Loader／卸载验证，用 `code-review` 分别报告 Standards 和 Spec；Harness 文档与测试技能限定了双语 owner 契约、资源清理和验证范围。
