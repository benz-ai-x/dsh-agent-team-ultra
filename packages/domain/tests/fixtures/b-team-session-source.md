# B-written Session fixture

`b-team-session-source.json` stores the exact compressed bytes produced by the
real B Harness `57670c6b320f7f240cbad360a9f691c8598e1571`. Each file has its own
SHA-256; the JSON contains provenance and a base64 transport encoding, not a
hand-converted v2 log. The data is test-authored and contains no credentials or
private conversation. The only substitute is the external LLM adapter.

The public `scripts/probe-team-contract.mjs` created a Lead and two DSH members,
persisted messages and CAS/DAG/tombstone facts, disposed all Fibers, cold-resumed
the same member, and completed all 11 checks. Its explicit third argument
captures that probe's data only after quiescence and refuses an existing target:

```sh
node scripts/probe-team-contract.mjs /absolute/clean/b-harness /new/capture-directory
```

The fixture embeds those three `session.jsonl.zstd` files unchanged. Decode
Zstandard iterator chunks with an immediate copy per yielded chunk; the decoder
may reuse its output buffer. Reproduction uses the exact producer digest stored
in the fixture. Fresh IDs and times naturally produce a different capture.

This fixture proves old Team and child-descriptor reading with original source
bytes preserved. It contains no Ultra Binding or native member and is not the
complete joint-migration or installed-archive acceptance required by #41/#43.
