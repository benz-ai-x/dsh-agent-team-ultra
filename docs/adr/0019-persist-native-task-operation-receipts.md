---
status: accepted
---

# Persist native task changes with their operation receipts

[Issue #28](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/28) extends
[ADR 0018](0018-persist-native-team-message-receipts.md) under
[Spec #18](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18),
D-03 and D-08 through D-11. The delivery remains a local overlay on a locked,
built maintained Harness source.

## 中文规范

native 成员通过同一 Native Member Grant 认领、更新和完成共享任务，并观察
Team 活动。任务转换继续由现有 TeamTaskBoard 执行，复用 expectedRevision、
所有权、DAG、删除墓碑和 writeScopes 建议语义。DSH 入口仍以精确 live Agent
授权，native 入口使用 grant 绑定的成员身份；不构造伪 Agent。任务重新分配等
Lead-only 操作仍由业务执行器拒绝。过期写入返回冲突及当前 Revision。

任务变化与 Native Operation Receipt 在同一必需事实中提交并 flush，之后才
返回成功。同一可信 turn／call 与规范化输入返回原已提交结果，先于 CAS 检查，
不增加 Revision；改变输入冲突。写队列中重新检查 grant 和取消。回执包含
已验证的任务请求、规范化输入指纹及原返回值，使恢复验证能够核对操作、任务变化和原结果。
任务写入回执仅返回 id、revision、状态、所有者名称和就绪状态，避免大任务描述
经过原生文本响应二次 JSON 转义后超限；完整详情继续通过任务读取获取。

Codex 每个存活 turn 最多接受 64 个不同的可信 call 身份。同一身份重试仍交给
Host 判断原回执或输入冲突，不消耗新的调用名额，也不在 adapter 中缓存任务结果；
每个传输请求的大小、当前 turn 校验及取消限制仍逐次执行。

现有 native-operation 事件扩展为显式消息／任务变体，payload 升至 4，Team
checkpoint 升至 5。明确保留 payload 3 消息和 legacy payload 2 的读取分支，
更新 codec、schema、生成事件词汇及两个 SDK 的录制回放。Session 0、Ultra v1
不变；旧 reader 拒绝新必需事实。阶段 C 联合迁移仍由 #39–#43 处理。

等待调用复用 TeamActivity，只观察后续变化，受原 10 秒至 1 小时范围、调用
取消及 grant 生命周期约束，不保存回执、不发起任务、不启动成员。认领、依赖
解除和中断均不创建文件锁；中断不自动释放所有权。

Codex 将工具映射为任务更新与等待，保留固定 sandbox、approval-never 和执行
网络限制。新工具只安装到新线程；旧线程保留其原有工具集。存活调用重试、
Host 存储重建后的回执恢复，以及 Codex 冷启动中断结算分开验收，不声称恢复
已死亡的 native RPC callback。现有任务 Remote／UI 从权威投影显示任务变化。

测试入口沿用 T-01：真实 Team grant／公开服务／权威持久日志；Ultra 中只替换
外部 app-server，经过实际 Codex 动态工具；真实 Loader、打包 Profile 和现有
任务 UI 读取验证输出。逐条 TDD 覆盖认领、所有权、CAS、重放、DAG／墓碑、等待、
中断／释放和权限隔离；完整 verify 与双轴审查通过后才交付。

## English counterpart

Native members use their current grant and the existing task board's CAS,
ownership, DAG, tombstone and advisory-scope rules. Exact live-Agent authority
remains at DSH entry points; native identity comes from the grant without a
fabricated Agent. Lead-only changes remain executor-enforced. Stale writes
return a conflict and the current revision.

A task mutation and its original receipt commit and flush together. Valid retries
recover that result before CAS and cannot increment the revision twice. Changed
input conflicts; queued execution rechecks authority and cancellation. The receipt
retains validated task input, its normalized fingerprint and the original result for replay validation.
Mutation results contain only task id, revision, status, owner name and readiness,
so escaped native text envelopes stay bounded; task reads retain full details.

Codex admits at most 64 distinct trusted call identities per live turn. Retrying an
admitted identity reaches the Host for original-receipt recovery or input-conflict
rejection without consuming another slot or caching task results in the adapter.
Every request still passes transport-size, current-turn and cancellation checks.

The required native-operation event gains explicit message/task variants at
payload 4 and checkpoint 5, with explicit payload-3 and payload-2 readers.
Session 0 and Ultra v1 remain unchanged. Both SDK event recordings cover the new
facts. Phase C retains responsibility for the joint migration.

Waiting uses existing Team activity observation and timeout/cancellation rules;
it neither mutates tasks nor starts members. Claiming or unblocking work creates
no file lock, and interruption preserves ownership. Codex execution permissions
and older threads' original tool sets remain unchanged. Host receipt replay,
live native retries and interrupted cold recovery are validated separately.
Existing task UI reads the authoritative projection. Public-boundary TDD, real
Loader/packed acceptance and both review axes gate delivery.
