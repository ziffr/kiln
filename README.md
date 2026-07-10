# VerticalBusinessDesigner (VBD)

An LLM-guided **Business Compiler**: describe a vertical business in structured text, an LLM
derives a formal model, deterministic validators check it, and it renders as an interactive,
reviewable **Capability Map**. **Text is the source of truth; the graphic is a projection of it.**

> Note: the git repository directory is named `VerticalBusinessDesiger` (historical); the
> product name is **VerticalBusinessDesigner**.

## Status

MVP in progress — see the governed docs under [`docs/`](docs/INDEX.md):

- [SPEC-001](docs/specs/SPEC-001-mvp-narrative-capability-loop.md) — MVP spec (Approved)
- [PLAN-001](docs/plans/PLAN-001-mvp-execution-plan.md) — execution plan M0–M5 (Approved)
- [ADR-001](docs/adr/ADR-001-typescript-end-to-end.md), [ADR-002](docs/adr/ADR-002-storage-and-source-of-truth.md) — key decisions
- [CONVENTIONS.md](docs/CONVENTIONS.md) — documentation policy (status lifecycle, review process)

**M0 complete; M1 complete (engine + web UI shell)** — 35 passing package tests; app builds & runs.

## Repository layout

```
docs/                 governed plans, specs, reviews, ADRs (see docs/CONVENTIONS.md)
packages/
  ir/                 @vbd/ir — IR types + isomorphic SHA-256 hashing (the spine)
  schema/             @vbd/schema — JSON Schemas (capability.schema.json)
  compiler/           @vbd/compiler — authored artifacts → IR (+ computeBuildHash)
  validation/         @vbd/validation — deterministic validators V1–V2 (V3–V8 in M3)
  store/              @vbd/store — .vbd/ derived cache with buildHash-on-load (ADR-002)
  eval/               @vbd/eval — seeded-defect corpus + recall/precision scorer
  narrative/          @vbd/narrative — Business Narrative parser + completeness validators (M1)
apps/
  web/                @vbd/web — React + Vite SPA (narrative editor + Capability Map, DE/EN)
workspaces/
  solar-example/      reference solar-installer narrative + capabilities
```

## Run the app

```bash
npm install                      # links workspaces + installs web deps
npm run dev --workspace @vbd/web # Vite dev server on http://localhost:5188
npm run build --workspace @vbd/web
```

The pure packages (`ir`/`compiler`/`validation`/`narrative`) run **both** in Node (tests) and
the browser (the app computes parse→validate live client-side).

## Develop

Requires **Node ≥ 20** (tests run on Node's native TypeScript — no build, no external deps).

```bash
npm install     # links workspaces only; no registry fetch needed
npm test        # runs the M0 test suite (node --test on .ts sources)
```

Optional type-checking:

```bash
npm i -D typescript @types/node
npm run typecheck
```
