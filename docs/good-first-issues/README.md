# Good first issues — add an execution engine

These are **ready-to-file GitHub issues** for new execution engines. Each is scoped so a first-time
contributor can complete it in one focused sitting, using the **engine plugin seam** ([SPEC-010](../specs/SPEC-010-engine-plugin-seam.md))
and its built-in engines as worked examples.

When the repo is public, the maintainer files these as GitHub issues labelled `good first issue` +
`new-engine`. They are kept here so they stay versioned with the contract they target.

## What an engine is

Kiln projects a business model onto **execution engines**. Each engine declares — in a small data
descriptor — which of the seven **tech-capabilities** it provides and how well:

`store` · `operate` · `emit` · `react` · `sequence` · `authorize` · `serve-ui` → each `native` / `partial` / `none`.

The binding chooses which engine hosts which capability; validators check it; codegen asks each bound
engine to emit its files. You add an engine by writing **one file** — an `EngineAdapter` — and
registering it. No edits to the core dispatch. See [CONTRIBUTING.md](../../CONTRIBUTING.md) and
[SPEC-010 §4.4](../specs/SPEC-010-engine-plugin-seam.md) for the full walkthrough.

## The issues

| # | Engine | Capability role | Difficulty | Copy from |
|---|--------|-----------------|------------|-----------|
| 1 | [MySQL](engine-mysql.md) | `store` | 🟢 beginner | `engines/postgres.ts` |
| 2 | [Next.js UI](engine-nextjs.md) | `serve-ui` | 🟡 intermediate | `engines/shadcn.ts` |
| 3 | [Windmill](engine-windmill.md) | `react` + `sequence` | 🟡 intermediate | `engines/n8n.ts` |

Each issue tells you the fidelity matrix to declare, the files to create, the reference adapter to
copy, and the acceptance criteria (tests green + the generated output runs).
