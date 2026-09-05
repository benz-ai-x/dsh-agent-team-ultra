# 0014: Own Ultra packages under the maintainer's scope

Status: accepted — 2026-09-05

## Decision

The Host package, Client package, profile bundle, and private workspace root
use the `@benz-ai-x` scope. The pinned Harness packages keep their original
`@deepseek-ai` identities.

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
