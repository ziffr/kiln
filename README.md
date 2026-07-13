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

**M0 & M1 complete; M2 pipeline delivered (mock generator)** — 42 passing package tests; app builds & runs. The web app now generates the Capability Map from the narrative live.

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
  skills/             @vbd/skills — LLM skill runtime; CapabilityGenerator + MockProvider (M2)
apps/
  web/                @vbd/web — React + Vite SPA (narrative editor + Capability Map, DE/EN)
  service/            @vbd/service — server-side API (holds the LLM key; @anthropic-ai/sdk)
workspaces/
  solar-example/      reference solar-installer narrative + capabilities
```

## Run the app

The web app runs standalone with an **offline mock** generator. For **real LLM generation**,
also run the service (it holds the Anthropic key). Put your key in a git-ignored `.env` at the
repo root: `VBD_ANTHROPIC_API_KEY=sk-ant-...`

The easiest entrypoint is the **`vbd.sh`** helper — one script wrapping every CLI task
(`./vbd.sh help` lists them all; `./vbd.sh doctor` checks your environment):

```bash
./vbd.sh install     # install deps (links workspaces)
./vbd.sh dev         # run the service (:8787) + web app (:5188) together
./vbd.sh export      # project the model → a complete multi-backend system in ./out/targets
./vbd.sh app:up      # build + run that generated system (docker compose + schema)
```

Or drive the underlying tools directly:

```bash
npm install                          # links workspaces + installs deps
npm run dev --workspace @vbd/web     # web (Vite) on http://localhost:5188
npm run dev --workspace @vbd/service # API on http://localhost:8787 (loads .env)
```

Then open the web app, pick a model (default **Sonnet 5 / medium**), and click **Generate with
LLM**. The key never reaches the browser — the app POSTs the narrative to the service, which calls
Anthropic via the official SDK. The pure packages (`ir`/`compiler`/`validation`/`narrative`) run
in Node (tests), the browser (live mock), and the service (real generation).

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
