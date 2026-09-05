# Ultra Codex runtime

`@benz-ai-x/dsh-agent-team-codex` owns Ultra's durable Codex product adapter.
The implementation and qualification originate from the maintained Harness
snapshot `8b4bae0b620cc89a987a3ec6dd8b0b7d9025649a`,
`packages/experimental/agent-team-codex`, under the retained [MIT license](LICENSE).

The provider-neutral Agent Team contract remains in the locked Harness.
This package exports a namespace plugin with `name`, `inject`, `Config`, and
`apply`; the shipped profile sets `catalogOwnerService: digitalEmployees` so
one complete provider registration owns both execution and Studio metadata.

The adapter qualifies only package-local `@openai/codex` `0.149.1` and its exact
platform payload. It preserves read-only sandboxing, approval `never`, disabled
network, the `codex` route, native project correlations, thread handles, and
Fiber-owned process cleanup. Package renaming changes no durable format.

Use the complete local archive set and the stopped-Web upgrade procedure in
the [workspace README](../../README.md#安装到本地-dsh-web).
The [ownership decision](../../docs/adr/0007-activate-package-local-codex-runtime.md)
records the migration boundary and validation limits.
