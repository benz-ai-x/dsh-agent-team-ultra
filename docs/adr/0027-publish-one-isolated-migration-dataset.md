---
status: accepted
---

# Publish and admit one isolated Session/Team/Ultra dataset

[#41](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/41) implements the
source-preserving plan in [ADR 0016](0016-audit-and-plan-format-aware-migration.md)
with the independent formats in [ADR 0026](0026-preserve-team-identities-on-session-v2.md).
We choose an offline, repo-only operator and one public Profile data composition
instead of allowing three independently writable plugins to upgrade live roots.

## 中文规范

源只接受审计，不原地打开会发布后继的历史 Session read handle；SQLite DB/WAL 和
Session 均在私有副本操作。真实 codec、Ultra v0→v1、checkpoint 与 Run Index 重建
完成并校验后，向独立目标确定性发布。源 writer 未记录时报告未知，reader 的精确
源码资格不是源写入来源证明。没有不兼容业务记录变化，不新增 Ultra 代际。

同一个 manifest 绑定源摘要、实际格式、目标候选、后端和状态。`pending` 先发布，
相同文件只复用；外来文件、来源变化或分歧拒绝覆盖。文件与目录同步，独占进程锁
随退出释放，只回收可证明为目标预期前缀的临时写入。重新审计目标和静止源后最后
原子提交 `complete`；错误不会通过完成标记冒充成功。投入业务后的目标不是同步副本。

公开 Profile `data` Loader 行先联合准入实际 Session／storage 路径，再以同一 Fiber
挂载真实持久化、所选 JSON／SQLite 与 Domain。迁移路径必须属于同一个已完成且
资格匹配的根；无标记的新安装可用默认路径。旧的独立数据行被 overlay 禁用，避免
只保护业务 Host 却已经让底层写入 pending 数据。此保护不约束旧二进制或 stock。

Run Index 是派生数据，可从真实工作轮次重建；native 仅有持久关联而无 SDK 终态时
保留不完整状态，不伪造成功。Eval Run 历史保留，Host 冷恢复按现有环境代际规则
使旧 Gate 失效。Profile 配置、凭据和 SDK 自有历史不属于此数据集，原生恢复须另有
原 SDK 数据和认证；源停写、单向切换、禁止 stock／旧程序回放和双向写入是运维前提。

## Consequences

The operator uses disk space for a private candidate and an isolated target to
keep the original recoverable. JSON targets use `storage`, not the default
DSH_HOME `storages`; operators configure both public data paths explicitly.
Linux arm64 fsync/flock behavior is tested; other platforms are not qualified.
Focused tests prove the implementation boundaries, not the final all-historical
archive/interruption matrix (#43) or authenticated native acceptance (#44).
