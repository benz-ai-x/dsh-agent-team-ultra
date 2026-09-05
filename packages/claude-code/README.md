# Ultra Claude Code runtime

`@benz-ai-x/dsh-agent-team-claude-code` owns Ultra's durable Claude Code adapter.
The implementation, process bridge and qualification originate unchanged from
maintained Harness commit `8b4bae0b620cc89a987a3ec6dd8b0b7d9025649a`,
`packages/experimental/agent-team-claude-code`, under the retained [MIT license](LICENSE).

The provider-neutral Agent Team contract remains in the locked Harness.
This namespace plugin exports `name`, `inject`, `Config`, and `apply`; the
profile sets `catalogOwnerService: digitalEmployees` so one complete provider
registration owns execution and Studio metadata together.

Only package-local Claude Agent SDK `0.3.241` and Claude Code `2.1.241` qualify.
The `claude-code` route, deterministic native Session, transcript markers,
read-only tools and sandbox, denied interactive permission, disabled network,
and Fiber-owned query/process cleanup remain unchanged. The package move does
not change durable formats or grant Team tools.

Use the complete archive set and stopped-Web upgrade procedure in the
[workspace README](../../README.md#安装到本地-dsh-web).
The [ownership decision](../../docs/adr/0008-activate-package-local-claude-code-runtime.md)
records provenance, permission boundaries and validation limits.
