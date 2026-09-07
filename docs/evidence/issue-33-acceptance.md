# Issue #33 acceptance

The Team Message Center now submits human-authored work and correlated replies
through the Team owner's generated Remote. The Host remains authoritative for
the exact Lead, sender, Team, recipient, durable request identity, original
message, and delivery state. The browser owns only an inspectable retry intent;
it never treats that intent as proof that the Team accepted or delivered work.

Requirement: [Issue #33](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/33);
parent [Spec #18](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/18).
The authority, idempotency, persistence, delivery, recovery, and UI boundaries
are recorded in [ADR 0024](../adr/0024-submit-idempotent-team-message-replies.md).
Ultra starts from main `08585631ea6e618a3adbf7143046d00fde00f5d7` and pins
qualified Harness commit
[`d2d870fbe4`](https://github.com/benz-ai-x/deepseek-harness_x/commit/d2d870fbe40bc0e968abdac854a3aae495162bec).

| Acceptance criterion | Repeatable evidence and conclusion |
| --- | --- |
| Resolve the current exact Lead and sender in Host; correlate a reply to a real message in the same Team and an explicit recipient | `TeamService.submitMessage` and generated `agentTeams/sendMessage` accept no caller-supplied Team or sender. The owner resolves the exact live Agent at admission and again in the serialized write, requires the Lead role, resolves an explicit active recipient from the authoritative roster, and finds `replyTo` in that Team's projected log before appending. Harness's public Remote test sends a real same-Team reply, observes Lead attribution, explicit recipient and reply id in both the receiver and message projection, then rejects a teammate caller and a foreign-Team reply with the Lead log unchanged. The production composer displays both explicit controls and lets the operator override the recipient inferred from the selected message. |
| Reuse Team durability; scope request identity by Team and Host-resolved sender; replay identical input and conflict on changed input | Required `team/message/request-committed@1` atomically stores the canonical SHA-256 input fingerprint, immutable accepted result, optional reply id, and queued message. The projection indexes receipts by sender/request within its Team root. Concurrent identical public Remote calls return the same submission/message and create one fact; later replay returns that original result and current delivery stage. Changing recipient, literal text, or reply conflicts without another event. A second Team accepts the same request token independently. |
| Reuse the original request across double-click, post-commit carrier loss or timeout, and restart; never create a second queued message | [TeamMessageCenter.tsx](../../packages/ui/src/client/TeamMessageCenter.tsx) freezes a UUID request plus recipient/reply/text before its first await, installs a synchronous in-flight guard, and calls the Remote only after writing and reading back the exact Team-scoped versioned `sessionStorage` intent. A 15-second confirmation deadline aborts a non-settling carrier and exposes `unknown` with that same request. Component tests prove double-click calls once, storage failure calls zero times with a bilingual diagnostic, deadline/unmount clear the timer and abort, late settle cannot alter UI or leak an unhandled rejection, refresh/remount never sends, and only explicit retry reuses every field. Harness tests prove caller cancellation after durable acceptance cannot cancel Team-owned delivery, a real persistence flush failure reflushed the retained event, and full Host restart replays one receipt/message without another target work item. The packed recovery probe lets the real Host accept through the generated Remote, deliberately drops only its returned receipt, observes the installed production UI deadline/exact saved intent, cold-restarts, and replays only on command. |
| Keep submission separate from delivery; retain pending work while its provider is absent and deliver the original after return without fabricated completion | The public result has an immutable accepted submission plus independently observed `pending` or `delivered` state. A provider barrier test proves the Remote returns pending while delivery is still blocked and that post-commit caller cancellation does not abort it. Another owning test removes the registered native provider, accepts one pending message, registers the replacement provider, and observes exactly one delivery with the original message id/native handle before a delivered fact appears. The packed probe repeats provider removal, Host disposal/recovery, provider return, pre-ack negative observation, and final acknowledgement through Loader, AgentLoop, TeamService, JSONL persistence, and the installed UI. No result claims task completion or message read state. |
| Add a formal request/reply fact, codec/projection/checkpoint and recovery proof; reject cross-Team replies without durable side effects | The new event is listed as required, has strict version-1 wire and checkpoint schemas, and advances Team projection stateVersion from 6 to 7. Projection tests round-trip Unicode request ids and same-Team replies; retain `requestId`/`replyTo`; reject mismatched fingerprints, sender/result/message fields, duplicates, malformed input, unknown replies, and future versions. The authored keyless `agent-team-external` recorded Session includes the required request receipt and reply correlation; official refresh/replay projects it through the TypeScript SDK, while the Python single-executable snapshot independently asserts the same event fields. Older queue events remain readable, old checkpoints rebuild, and full JSONL Host recovery retains the original receipt. Ultra's migration audit reports independent `messageRequest: 1` while Session 0, base Team event 2, native operation 4, and Ultra v1 stay fixed. The public cross-Team test observes no new Lead fact on rejection. |
| Provide English and Chinese UI, inspectable failed drafts, and real packed UI/Remote interaction evidence | [locales.ts](../../packages/ui/src/client/locales.ts) contains paired English/Chinese copy for recipient, reply, submission, deadline, browser-storage failure, unknown/rejected results, saved request, retry, pending, and delivered states. UI tests render both locales; retain body, recipient, reply id, and request id after failure/remount; and keep the draft editable while explicitly saying nothing was sent when intent persistence fails. The packed gate installs all eight archives, mounts the production renderer/root/session/Team-owner child Slot, drives the installed Ultra composer, and invokes the built generated Remote against a Loader-mounted real Team/Host/persistence stack. A double-click produces one required fact and one provider work item; the carrier drops the already-returned acceptance and the production UI reaches its deadline with the exact intent; Host recovery does not auto-send; explicit replay returns the original delivered result. Negative controls make the gate reject either a missing required fact or a duplicate fact. |

## Verification

- Harness owning suites: 4 files / 186 tests; complete Agent Team package:
  16 files / 376 tests, with only the two pre-existing skips.
- Harness generated-Remote built-library test: 1/1; Host build, Client
  typecheck, 86 documentation code blocks, exported JSDoc, generated catalogs,
  bilingual document pairing, and 435 primary plus 435 derivative declaration
  comparisons all pass. The official keyless TypeScript SDK snapshot and
  Python single-executable snapshot both refresh and replay the request fact.
- Ultra focused UI/mount/migration run: 3 files / 48 tests.
- Ultra `pnpm context:check:strict`: 582 checks, zero warnings.
- Ultra `pnpm verify`: 30 files / 346 tests, build and generated artifacts,
  eight-archive install/resolve, packed production send/recovery, real Web boot,
  controlled Codex/Claude JSON and SQLite recovery, and complete uninstall all
  pass.

The first public Harness RED was a missing generated send descriptor. A second
public provider-barrier RED showed the accepted Remote result was still coupled
to delivery. Review round 1 added a snapshot RED on the missing required event
in both SDK projections. Ultra's first UI RED had no recipient composer, its
migration RED omitted request format 1, and its packed RED had no controlled
real Team member. Review round 1 then reproduced a non-settling Remote that did
not abort at 15 seconds and a storage exception that still called the Remote.
The corresponding GREEN logs are under `/root/workspace/.ultra-checks/33-*`.
Intermediate stale-build and probe-event failures are retained there but are
not presented as product RED evidence.

Continuous watch/automatic refresh/reconnect state machines remain owned by
#36. Authenticated Codex and Claude Code canaries remain owned by #44; the
packed test controls only the actual external provider boundary and does not
claim credentialed product acceptance.
