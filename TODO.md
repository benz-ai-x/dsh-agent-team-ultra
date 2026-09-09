# TODO · 官方优先、DSH-only 精简基线

用户于 2026-09-09 授权本地清理。当前工作分支：`chore/official-dsh-only-baseline`。
用户随后明确要求“建 PR”，该发布已完成。PR #64 三项审查修复及复查完成后，用户授权“推送 PR”；修复已提交并推送原分支，不自动合并或关闭旧 Issues。
随后审查发现服务单独重载遗漏 B0 数据准入；修复及复查完成后，用户明确授权“合并 PR64”。重载修复 `0dc70ac` 已提交并推送原 PR 分支，合并状态以 PR／Git 回读为准。
产品边界以 [ADR 0028](docs/adr/0028-establish-official-dsh-only-baseline.md) 和
[项目契约](docs/agent/PROJECT_CONTRACT.md) 为准；[验收记录](docs/evidence/b0-baseline-acceptance.md) 区分自动化与真实账号验证。

## 本次清理

- [x] 保留已有研究／交接改动，从 `f84584d` 创建独立 B0 分支；main、旧维护源码和四个 stash 不动。
- [x] 改动前 strict：648 PASS／0 warnings；创建并验证旧 Git 历史 bundle。
- [x] 固定干净官方 `5dda764ed3aa172535a7967b06ff95d9cbfe536a`／`0.1.5-alpha.1`，不覆盖用户官方目录的十个既有改动。
- [x] 官方原生组件、Host、Client、Web 构建完成；提供并完整跑通 Node 24.11.1 原生配置加载器构建入口，不修改官方业务源码。
- [x] 只保留三个 Ultra 包；删除持久 Codex／Claude、Runtime catalog／独立选模、Run／Eval／Promotion Gate、自建消息中心／DAG／watch、模型侧 Profile 工具及旧迁移脚本。
- [x] 保留不可变 Profile Revision、Head CAS、手动激活／回滚／归档／恢复；请求入队快照，精确 live Lead 权限。
- [x] 使用官方 DSH spawn/fork；UUID 幂等启动、固定 Profile 的 Binding、同成员冷恢复，不按姓名收编或替换普通队员。
- [x] 保留 child-scope persona／context／人工记忆／声明式 hooks／工具过滤；卸载先停止本插件员工，再撤销能力。
- [x] 最小 Studio：表单／高级 JSON、版本／差异、显式发布、启动／重试、实例、官方对话入口，手动刷新。
- [x] 新建独立 B0 数据身份：显式初始化、Session 3 不压缩 JSONL＋JSON storage；旧／未知／损坏数据只读拒绝，不迁移、不清空。
- [x] 对齐来源锁、依赖闭包、官方 Typert 生成、CLI 显式入口、本地打包和完整卸载；旧生成产物可恢复地移出发货树。
- [x] 定向验证发布、权限、UUID／取消、冷恢复、隔离／清理、UI 错误冒泡／旧快照／保留草稿／重试；11 项真实 Host 工作流通过。
- [x] 最终 `pnpm verify` 自然退出 0：strict／build、46 tests／9 files、六归档安装、安装版 Host／Studio 12 tests／2 files、真实 Web 启停、完整卸载并保留数据；失败与修复过程已记录。
- [x] 六个独立 B0 归档已生成到 `artifacts/agent-team-ultra-b0`；更新验收／交接，45 个活动文档本地链接、残留接口和 `git diff --check` 检查通过；main／旧源码／十个 dirty 文件／四个 stash 保留。

## B0 PR 发布（此前）

- [x] 核对远端 main 仍为 `f84584d`、没有重复 PR；当前 67 个运行输入的指纹与已验候选一致。
- [x] 发布前重跑 `pnpm verify`：496 strict／0 warnings、46 tests／9 files、六归档安装、安装版 Host／Studio 12 tests／2 files、Web 自然退出和卸载保留数据通过。
- [x] 补充发货 Client bundle 的 Chromium 截图，明确使用演示数据，不作为真实账号验收。
- [x] B0 已提交为 `19e07a5` 并推送原分支，创建 [PR #64](https://github.com/benz-ai-x/dsh-agent-team-ultra/pull/64) → main；回读 OPEN／非草稿／MERGEABLE／CLEAN，PR head、远端与本地一致。随后只同步发布交接文档，不自动合并。

## PR #64 首轮审查修复（此前已推送）

- [x] Standards P1：恢复已发布 Revision 历史连续性校验；中间记录缺失、损坏、未来封装拒绝开放写入，恢复原字节后可继续；未发布孤立 Revision 仍可安全重试。
- [x] Spec P1：可写后端注册前拒绝损坏／未知 B0 per-record 封装与布局，保留原字节；官方未发布 UUID 临时文件保留，不当作正式记录。真实 CLI 与冷 Host 准入回归通过。
- [x] Spec P2：Studio 未知／pending 结果保留 UUID，明确 active／failed 后结束该意图；迟到响应不清除重试身份，新发布员工可用新 UUID 启动。
- [x] 三项修复先复现失败再改实现；最终 `pnpm verify`：496 strict／0 warnings、61 tests／9 files、安装版 18 tests／2 files、六归档安装／Web 自然退出／完整卸载保留数据通过。
- [x] 最终本地候选独立复查通过：Standards 0 项／原 P1 关闭；Spec 0 项／原 P1、P2 关闭。两轴另行重跑 4 项／14 项定向回归均通过；结果及指纹见验收记录与根交接。
- [x] 用户授权后将三项修复提交为 `dd5cfa8` 并推送到 PR #64，回读确认远端包含该提交；随后仅同步发布文档。worktree `/tmp/ultra-pr64-review.p7Wub1/ultra`，主目录 main 不变。

## PR #64 服务重载准入修复与合并授权（当前）

- [x] 实际 Loader 停用／启用回归先证明坏 Head 被忽略；data owner 提供绑定固定根与 facility 的只读准入能力，每次 Domain 打开前必检。
- [x] 损坏／未来 Head 拒绝且保留字节；恢复后历史、激活状态及 CAS 不重置；data Fiber 停用撤销准入与 Host，再启用恢复原 Profile。
- [x] 本地与安装版共用实际 Profile data／兼容性 Group；完整 `pnpm verify`：496 strict／0 warnings、64 tests／9 files、安装版 21 tests／2 files，六归档安装／Web 正常退出／卸载保留数据通过。
- [x] 冻结候选独立复查通过：Standards 0 项／Spec 0 项，原 P1 关闭；两轴另行重跑 7 项／34 项相关回归通过，运行差异指纹一致。
- [x] 用户授权合并后，将重载修复提交为 `0dc70ac` 并推送到 PR #64，回读确认已包含；合并前 strict 496 checks／0 warnings，运行输入和复查指纹不变，复用已有完整验证。

## PR 创建后再决定

- [ ] B0-12：用户提供并授权隔离 DSH 账号环境后，验证一个真实员工任务、Profile 效果和官方会话续接。自动化受控模型不替代此项。
- [x] 用户已明确授权合并 PR #64；真实账号验证限制仍单列，最终合并状态以 PR／Git 回读为准。
- [ ] 先根据真实使用反馈判断是否深化 Profile 工作流；不默认恢复多运行时、自动评测或第二套 Team 界面。
- [ ] 如确需历史 Profile 导入，另行设计显式、先校验、默认未激活的导入；不得删除旧 gate／route 字段后假称无损兼容。

旧 #18／#44 不因范围缩小而视为验收通过；本轮不更新远端 Issues。
[旧 TODO](docs/history/pre-b0-todo.md)、[旧交接](docs/history/pre-b0-handoff.md) 和
[旧流水线](PIPELINE_STATE.md) 仅供历史查阅，不能恢复执行。
