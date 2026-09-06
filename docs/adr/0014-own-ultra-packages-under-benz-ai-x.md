# 0014: Own Ultra packages under the maintainer's scope

Status: accepted — 2026-09-05

## Decision

The Host package, Client package, profile bundle, Codex runtime adapter, and
private workspace root use the `@benz-ai-x` scope. The remaining pinned Harness
packages keep their original `@deepseek-ai` identities.

## Why

Ultra is maintained outside the upstream Harness. Its package names should
identify that ownership. Local-only delivery does not require using the
upstream scope, and the scope change does not make the dependency closure
publishable.

## Consequences

Imports, peer dependencies, Loader package references, browser module ids,
CSS ownership tags, and generated Typert package and invocation ids move
together. Host and Client must be rebuilt, installed, and reloaded as one
version; old package identities are not aliases for the new packages.

The `digitalEmployees` service and Remote namespace, stable Loader row ids,
Agent authority, runtime routes, and `agent_team_ultra_v1` storage identity
remain stable. Existing Profile and Session records need no namespace migration.

An existing installation stops its Web instance, removes the old packages,
installs the renamed archive set into the same Profile and `DSH_HOME`, then
restarts and refreshes its browser. Verification covers generated contracts,
browser bundle materialization, ordinary package resolution across both scopes,
real Web composition, and complete overlay removal.

## Ownership revision — 2026-09-05, Issue #23

The initial namespace change covered Host, Client, and profile. The Codex
product adapter now moves from `@deepseek-ai/dsh-experimental-agent-team-codex`
to `@benz-ai-x/dsh-agent-team-codex`, version `0.1.0`, and is built and packed
by Ultra. Its exact SDK and native payload remain `0.149.1`; its runtime
protocol and durable identity are independent of the adapter package version.

The profile keeps the `agent-team-codex` row, `digitalEmployees` catalog owner,
and `external-agent/codex` route. No Profile, Revision, Binding, member, native
handle, or storage generation is renamed. Local upgrade removes the old Codex
package with Web stopped and installs the new complete archive set; retaining
both packages is an admission error, rather than an alias or second provider.
The Claude Code move remains separate work in #24.
