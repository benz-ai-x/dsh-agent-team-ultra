---
status: accepted
---

# Keep Session representation separate from maintained Team formats

The [Phase C integration](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/39)
uses fixed official `d347e703908d0406b7a7ef80e3a0e594d86b2215` and preserves the
complete Phase B Team implementation. This is an integration decision, not a
release qualification or permission to replace the supported B runtime.

## 中文规范

[ADR 0016](0016-audit-and-plan-format-aware-migration.md) 的阶段 A 方案早于阶段 B
已落地的独立 native-operation 和 message-request 格式。本决策只补充实际目标身份，
不改变其源数据保护、pending 目标关闭写入、确定性重试与完成标记最后提交的要求。

| 层次 | 集成目标 | 理由 |
| --- | --- | --- |
| Session header／physical codec | `2` | 官方相邻 `0→1→2` 链处理 embedded Assistant streams、序号与 inherited cut |
| Team member／task／queued／delivered payload | `2` | 既有完整字段和状态语义未改变，不为外层 codec 转换重新编号 |
| Native operation payload | `4`；保留已支持的 `3` 读取 | 保留消息、任务、终态与幂等回执的已发布身份 |
| Human message request payload | `1` | 独立必需事件保存请求、回复与 queued 消息的原子接受事实 |
| Team projection stateVersion | `7` | 保留已发布 fold；转换后从目标权威日志重建，不沿用旧序号缓存 |
| Projection cache envelope | `session_projcache`／`7` | 新官方缓存身份包含 Session format 与 inherited cut，旧缓存不能证明当前 fold |
| Child descriptor | `3` | 固定双方已具备相同的公开延续描述，固定 route 和身份保留 |
| Ultra domain／SQLite layout | `agent_team_ultra_v1`／`1`；SQLite `1` | 尚无不兼容业务字段变化，不新建无意义代际 |

外层相邻格式边保留严格、封闭的历史字段校验；维护 fork 对自己的历史 Team 事件
补齐显式解码与目标校验，未知必需事实继续拒绝。当前 Session 的 generated vocabulary
保留 native-operation 与 message-request；不得用声明合并或 ignorable 绕过持久化。

升级集成分支可以记录实际干净提交的候选锁并使用正式 source preparation 验证，
但不得把它冒充原 B 提交或直接切换 main。每次源码身份变化重新构建、核验和锁定；
[#43](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/43) 收口完整行为、迁移和
真实归档验收后才能提出支持锁晋级，并保留人工合并确认。

## Alternatives and consequences

Uniformly renumbering Team facts to payload 3 would discard the distinction
between existing native operation 4 and message request 1 and would introduce
an unnecessary data rewrite. Keeping the stock historical codec unchanged
would instead refuse maintained Team records. The maintained fork owns the
explicit historical extension inventory while retaining the official adjacent
Session transformation and fail-closed policy. A passing current-session test
does not prove historical joint migration or authenticated native acceptance.
