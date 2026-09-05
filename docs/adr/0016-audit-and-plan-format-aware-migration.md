---
status: accepted
---

# Audit existing data before migrating the combined formats

[Spec #18](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18), D-14/D-15,
requires an operator to distinguish authoritative formats, disposable caches,
and package ownership. Issue #25 supplies a read-only audit and the migration
design. It does not execute the Phase C migration or authorize a stock official
binary to open the maintained fork's data. This supplements the original local
overlay decision and [ADR-0002](0002-isolate-the-v1-storage-generation.md).

## 中文规范：格式身份

| 层次 | 阶段 A 读取源 | 阶段 C 目标方案 |
| --- | --- | --- |
| 外层 Session header / codec | Session `0`，锁定读写器及生成事件词汇 | 官方 Session `2` codec，加经过核验的 Ultra 必需事件词汇 |
| Team event payload | 维护 fork 的 payload `2`，包含 route、externalRuntime、native turn | payload `3`，显式承载既有字段、native operation、发送请求与回复关联 |
| Team projection stateVersion | `3` | `4`；从目标权威日志重建，旧 checkpoint 不直接升级 |
| 子会话 descriptor | `3` | `3`；当前固定双方源码一致，新增不兼容字段前必须另行改版 |
| Ultra Storage Generation | `agent_team_ultra` / `0` 或 `agent_team_ultra_v1` / `1` | 继续 `agent_team_ultra_v1` / `1`；包改名和 Team 扩展不触发无意义换代 |
| SQLite 物理表布局 | `user_version = 1` | 保持 `1`，不与业务记录版本混用 |
| projection cache envelope | `session_projcache` / `6`，兼容 `3/4/5` | 可丢弃重建；独立于每行投影 `ver` |

目标数字是本次接受的方案，不是阶段 A 已能写入或运行的格式。
官方对照仍固定在 `d347e703908d0406b7a7ef80e3a0e594d86b2215`；阶段 C
须将扩展集成到独立 fork、重做来源与完整行为核验，再锁定生成的实际提交。
阶段 A 不替换当前受支持的 `8b4bae0b…`，阶段 B 的每次必要 Harness 扩展也必须
保有明确的源码提交与兼容性资格，不能把修改后的代码冒称原提交。

## 只读审计边界

审计读取完整源文件并检查物理版本、记录 envelope 和 schema，之后使用真实
Session read handle、codec 与 Team 投影验证权威历史。不能仅使用会跳过不可读
Session 的列表，也不能借用会将未知 envelope 当缺失的业务 Domain 打开过程。
SQLite 的数据库及 WAL 复制到私有临时目录后使用只读连接，以免 SQLite 在源位置
创建或修改 SHM。摘要同时覆盖源数据库和所有旁文件；临时副本在退出前删除。
存在 rollback journal 的源须先显式恢复。审计不修复、截断、备份改名或初始化源库。

Schema 合法不代表组合身份合法。还必须核对 Profile Head / Revision / fingerprint、
Binding、Team member、route、descriptor、externalRuntime / native handle 和历史
关联。报告保留有界身份与拒绝原因，不输出 prompt、消息正文、环境、凭据或 native
transcript。审计前后检查源摘要；变化中的源需要重新取得静止快照。

Checkpoint 是缓存。Session 身份、投影版本、游标或状态不匹配时，从可读取的
权威日志冷重建并报告原因，保留源缓存原文件；未知必需事件或未来业务格式则拒绝。
历史缓存可被丢弃的规则不能用于掩盖必要事实。

## 正式事件与生成方案

Team 所有者定义 payload `3` 的完整运行时 schema 和投影，不通过 TypeScript
声明合并来注册持久化事实。维护 Harness 的事件源定义、词汇生成器、Session `0/2`
历史 codec、读写校验和 Team 投影一起演进，并通过实际编解码与冷恢复测试。
必要字段或事件不标为 ignorable。

- `team/member@3` 保留完整成员、固定 route、externalRuntime、Launch Request、
  native handle 与首轮关联。`team/task@3` 保留任务身份、CAS、依赖和历史时间。
- `team/message/queued@3` 保留原 message id，并声明 Team/发送者作用域的发送请求
  ID、规范输入指纹及可选同 Team `replyTo`。历史 v2 消息采用明确的 legacy 分支，
  不伪造历史请求 ID；之后新请求必须使用完整的新分支。
- `team/message/delivered@3` 保留原投递与 native turn 关联，表达已投递，不能推导
  已读、已处理或任务完成。
- `team/native-operation/committed` 的 payload `3` 包含 Team、成员、provider、
  native handle、稳定 operation ID、限定操作名、输入指纹和可重放的有界业务结果。
  身份与授权由当前 Host grant 验证；不持久化 grant 凭据或原始 SDK payload。
  业务变更与其 operation 结果必须在 Team 同一持久提交批次内接受，避免变更成功
  后遗失去重事实。相同请求返回原结果，变更输入冲突。#27/#29/#32 负责具体落地。

## 执行顺序与完成边界

1. 停止源业务写入，保留经过摘要核验的源 Session、存储代际和兼容性身份。
2. 在隔离目标建立 pending Migration Manifest，绑定 source digest、双方兼容性、
   实际 target fork commit 和各层格式。目标启动预检在 complete 前拒绝业务写入。
3. 按稳定 Session / seq 顺序转换 codec，再升级 Team payload；保留 Session/成员、
   任务/消息、Launch Request、native handle/turn、时间和 lineage，转换 inherited cut。
4. 校验并迁移 Ultra 记录；沿用 v0→v1 的 Revision、Head、Binding 顺序和最后完成
   Marker。只有另行证明存在不兼容 Ultra 记录时才新建独立 Storage Generation。
5. 从目标权威日志重建 checkpoint 与 Run Index，验证所有跨源身份、CAS、指纹和
   关联。保留历史评测；环境变化使旧 Promotion Gate 失效，不删除历史结果。
6. 源记录和已写目标记录都按确定身份校验：相同记录复用，差异拒绝；中断后可重试，
   不跳过未完成步骤，不开放 pending 目标。所有目标持久化完成并核验后，最后原子
   提交 `ultra-migration-manifest.json` 的 complete 标记，再开放目标业务。

保留源数据用于审计与离线恢复，不支持源/目标双向继续写。旧二进制可能不理解新的
manifest，因此不能把新程序的预检当作旧程序的写入保护；源写入者必须保持停止。
阶段 A 审计成功只证明已实现检查通过，报告的迁移计划不等于阶段 C 迁移已经完成。

## English counterpart

The audit reads source files, real Session codecs/read handles and the Team
projection without opening a mutation-capable Ultra domain. JSON record
envelopes and SQLite physical/unit versions are checked before domain readers
could interpret unsupported data as absent. Unknown authoritative formats and
conflicting identities are refused. Cache mismatches trigger a reported cold
rebuild from readable logs, leaving the original cache untouched.

The accepted Phase C plan is Session codec 2, Team payload 3 and Team projection
4. Descriptor 3 remains unchanged because the fixed sources agree. Ultra v1
and SQLite layout 1 remain unless an incompatible Ultra change is established.
Generated vocabulary, schemas, historical codecs and projections must include
required native-operation, send-request and reply facts together. Durable
operation receipts share the authoritative commit with their business changes;
neither declaration merging nor ignorable events can replace persistence.

Execution freezes and preserves the source, creates a closed pending target,
converts Session/Team facts, validates Ultra records, rebuilds derived data,
verifies identities and commits completion last. Equal target records are
reused; divergence is refused. IDs, CAS, fingerprints, timestamps and native
correlations survive. Source retention does not permit dual writing or stock
official replay. Phase A stays on the qualified fork; Phase B adds collaboration,
and Phase C implements this migration and qualifies the new integration commit.
