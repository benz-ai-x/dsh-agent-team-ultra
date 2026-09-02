# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/adr/`** for ADRs touching the area being changed.
- **`docs/decisions/`** for the repository's existing accepted decisions.

If these files don't exist, proceed silently. The domain-modeling workflows create them lazily when terminology or decisions are resolved.

## File structure

This repository uses a single-context layout:

/
├── CONTEXT.md
├── docs/
│   ├── adr/          ← new ADRs
│   └── decisions/    ← existing accepted decisions
└── packages/
    ├── domain/
    ├── profile/
    └── ui/

## Use the glossary's vocabulary

When output names a domain concept—in an issue title, refactor proposal, hypothesis, or test—use the term defined in `CONTEXT.md`. Do not drift to synonyms the glossary explicitly avoids.

If a required concept is absent, reconsider whether new language is necessary or record the gap for the domain-modeling workflow.

## Flag ADR conflicts

If output contradicts an existing ADR or accepted decision, surface it explicitly instead of silently overriding it.
