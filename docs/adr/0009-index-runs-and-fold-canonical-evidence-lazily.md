---
status: accepted
---

# Index Runs and fold canonical evidence lazily

Every work turn accepted by a Team member or isolated evaluation worker has one
deterministic Run identity. Ownership is a discriminated identity; evaluation
workers are never represented as invented Team members.
A DSH Run derives from the exact child Session id and turn number; an external
Run derives from the selected provider, stable native runtime handle, and
provider-native accepted turn id. Provider loops, tool calls, and transport
retries are evidence inside that Run, not additional Runs.

Ultra persists only a bounded, repairable Run Index. Each row contains source,
Team plus exact member-or-evaluation identity, immutable Profile identity, selected and actual routes,
capability generation, normalized terminal class, provider-reported usage,
timestamps, and evidence completeness. The index never copies prompts,
replies, tool arguments/results, files, environment values, credentials, or
raw provider payloads.

The canonical evidence remains owned by the DSH Session or external provider.
Studio lists and filters index rows, then lazily requests a bounded normalized
timeline for one Run. Startup and relevant Session events rebuild missing or
stale rows from canonical correlations. Missing terminals, pagination,
truncation, absent providers, and unavailable correlations remain explicitly
incomplete or unavailable; they are never presented as successful completion.

## Consequences

The v1 storage generation gains a bounded `run_index` table without becoming a
second transcript store. External runtime creation and mailbox delivery retain
stable native turn correlations, and the Lead-only Host evidence seam resolves
the roster-owned native handle rather than trusting a caller-supplied one.
Service disposal waits for admitted repair writes, while provider and Session
lifecycles continue to own their canonical histories.

The [vNext A02 implementation](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/20)
keeps canonical folds, approval correlation, and event-driven repair in one
internal Run workflow. Studio projection builds the same detached Run rows for
unary and complete replacement snapshots. Removing the derived index does not
change the immutable Binding or canonical Session: a cold Host rebuilds the
same Run identities, timestamps, routes, and reported usage from those owners.
