# Official-first, DSH-only B0 contract

Status: implementation authorized by the user on 2026-09-09.
Decision: [ADR 0028](../adr/0028-establish-official-dsh-only-baseline.md).
Vocabulary: [CONTEXT.md](../../CONTEXT.md). Execution: [TODO.md](../../TODO.md).
Evidence and qualification limits: [B0 acceptance](../evidence/b0-baseline-acceptance.md).

## Product boundary

B0 is a reduced new baseline, not fulfillment of the former full-feature Spec #18/#44.
Use exactly the official source in [dsh-reference.lock.json](../../dsh-reference.lock.json), without business-source patches.
Historical Ultra `f84584def627b4af78a029af8788de73da0ad567` and maintained Harness
`3c38b1d4e8bf219750203e44b1df033ced754e92` remain the matching legacy program pair.
Do not change old Issues' acceptance or reopen their development pipeline under this cleanup task.

| Owner | B0 responsibility |
| --- | --- |
| Official Harness | Agent/Team/Session authority, spawn/fork continuations, model execution and route inheritance, task board, messages, approvals, conversation and resume |
| Ultra Domain | Immutable Profile Revisions, Head CAS, manual activation/rollback/archive/restore, launch intent and exact Binding, child-scoped Profile contributions |
| Ultra Studio | Profile form/advanced JSON, versions/diff, explicit release actions, launch/retry, instances and official conversation navigation |
| Ultra Profile | Compatibility guard, isolated data admission and composition of unchanged official Team settings with Ultra |

No persistent Codex/Claude adapters, Runtime Backend catalog/grants/receipts, per-employee model picker,
Run evidence console, Eval/Pipeline/Promotion Gate, enhanced message center, custom DAG/watch contract,
model-authored Profile tools or automated memory extraction is shipped.
Official one-shot external tools, if present in the underlying DSH installation, are not B0 employee runtimes.

## Durable data

Use a fresh isolated `DSH_HOME`, initialize `DSH_HOME/ultra-b0` explicitly, then install.
The data plugin derives both Session and storage locations from that single root.
B0 supports uncompressed Session 3 JSONL and JSON `agent_team_ultra_b0` version 1 only.
SQLite and old maintained-fork data remain with the legacy program; do not copy, convert or clear them.

A missing, malformed or future marker, missing owned directory, symlink/special media, legacy Session header
or old Ultra domain is refused before writable backend registration. A valid marker is not an import tool.
Underlying official codecs continue validating Session contents; Ultra validates Profile/Binding schema,
fingerprints and cross-record references before public admission.
Any future import is separately authorized, validated, explicit and initially unactivated.

## Behavior and acceptance

| ID | Acceptance condition | Primary evidence |
| --- | --- | --- |
| B0-01 | Clean fixed official source, exact built dependency links, no mixed-source TypeScript or runtime consumers | strict source tests |
| B0-02 | Legacy/unknown data refused without changing bytes; explicit initialization and repeat/cold admission work | data and installed admission tests |
| B0-03 | Only exact live Lead authority; forged, retired and teammate callers rejected | generated Remote integration |
| B0-04 | Immutable content, explicit activation, exact Head CAS, rollback, archive/restore and cold persistence | Profile integration |
| B0-05 | Stable launch UUID, normalized-input conflict refusal, no repeated creation, no ordinary-member adoption | launch integration |
| B0-06 | Official child identity and pinned Profile survive retries and restart; unresolved evidence cannot authorize replacement | recovery integration |
| B0-07 | Persona replaces only the official prefix; suffix/context policy survive; context/memory/hooks/tool filters remain child-local | Agent Loop and scope tests |
| B0-08 | Pre-admission cancellation is empty; shutdown closes admission, settles writes, drains bound children, then removes registrations | lifecycle tests |
| B0-09 | Studio surfaces business/transport errors; retains drafts on CAS conflict, labels stale views, fences late responses and retries the same intent | Client tests |
| B0-10 | No retired packages, interfaces, tests or executable/declaration files in delivered archive closure | generated contract and archive inspection |
| B0-11 | Actual archives install through locked CLI, public imports/Loader/Host workflows run, Web listens and exits gracefully, uninstall preserves data | verify:pack |
| B0-12 | Authenticated DSH account can create an employee, inspect Profile effect and continue its official conversation | operator acceptance, reported separately |

A controlled model adapter exercises real Agent Loop/Team/Session/Remote/JSON paths but does not satisfy B0-12.
Automated cleanup qualification may finish with B0-12 explicitly unverified; do not call that a production account acceptance or approval to merge.

## Validation policy

During changes, run only tests relevant to changed boundaries. At the final candidate/PR run
`pnpm verify`: strict source attestation, complete Host/Client build and generated Typert,
all retained product tests, actual archives/install/Web/uninstall. Never weaken assertions merely to pass.
Historical retired-feature tests belong to the historical revision; retained behaviors need replacement public-seam coverage.
Documentation-only changes require active-link validation and `git diff --check`.

## Delivery and safety

Three Ultra packages under `@benz-ai-x`; official packages retain `@deepseek-ai`.
Local archives only; derive the complete closure from the Profile, not a magic package count.
Keep original worktrees, dirty source inputs, stashes, history and real data. No automatic commit, push,
Issue update, PR action, merge, credential access or message is authorized by baseline cleanup.

[Historical contract](../history/pre-b0-project-contract.md) is a record, not current instructions.
