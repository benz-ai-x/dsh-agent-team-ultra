---
status: accepted
---

# Separate Profile authoring from release

Agent Team Ultra records each normalized Profile and Runtime Target as an immutable Profile Revision with a canonical SHA-256 content fingerprint. A Profile Head owns stable catalog identity, a monotonic CAS revision, latest and optional active Revision pointers, archive state, optional evaluation requirement, and catalog timestamps. Saving publishes only a candidate: unchanged normalized content is a no-op, while changed content writes the Revision before advancing the Head. Activation explicitly promotes only the latest candidate, rollback selects an existing older Revision, and launch resolves only the Head's active Revision.

## Consequences

A newly created Profile cannot launch until a Team Lead activates it. Stale save and release operations return the current Head instead of overwriting another editor. Archive replaces hard delete, preserves history and existing Binding snapshots, and blocks activation and launch until an explicit CAS-guarded restore. Studio baselines contain bounded Revision summaries; full immutable content and bounded structured differences are loaded only for the selected Revision. A crash between Revision persistence and Head publication may leave an orphan, so a retry reuses the lowest matching unpublished fingerprint rather than creating a duplicate Revision. Fingerprints exclude Head counters and operational timestamps, and transitional v1 rows without a fingerprint are deterministically enriched before mutation admission.

The [vNext A01 implementation](https://github.com/benz-ai-x/dsh-agent-team-ultra/issues/19)
keeps these rules in one internal Profile lifecycle module used by both generated
Remote and headless entry points. Its shared Host context owns serial writes
and checks exact live Lead authority again when a queued mutation starts and
after asynchronous runtime preflight. A caller that retires while waiting cannot
publish a candidate or change a Profile Head.
