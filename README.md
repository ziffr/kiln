<div align="center">

# 🔥 Kiln

### The business compiler — describe a business, get the software that runs it.

[![License](https://img.shields.io/badge/license-Apache--2.0-5b8cff)](LICENSE)
[![CI](https://github.com/ziffr/kiln/actions/workflows/ci.yml/badge.svg)](.github/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933)](package.json)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-ff8a3d)](CONTRIBUTING.md)

![Kiln: describe → model → run](docs/assets/kiln-demo.gif)

**[▶ Try it live](https://vertical-business-designer-web.vercel.app)** · [Quickstart](#run-the-app) · [How it works](#how-it-works) · [Add an engine](docs/good-first-issues/README.md) · [Contribute](CONTRIBUTING.md)

</div>

Kiln is an LLM-guided **"business compiler."** You describe a vertical business in plain, structured
text; an LLM derives a formal **model** (capabilities, entities, behaviour, policies, roles, workflows,
agents); deterministic validators check it; it renders as an interactive, reviewable **Capability
Map**; and codegen **projects the model into a runnable multi-backend system** — a PostgreSQL/SQLite
schema, a command API, n8n automations, an Odoo module, a shadcn/ui front-end, and an agent runtime —
exportable as a complete, docker-ready repo. **Text is the source of truth; everything downstream is a
projection of it, and a human reviews the AI's work at every step.**

## How it works

```
describe            →   model (reviewed)                    →   run
plain-language          capabilities · business areas ·         PostgreSQL/SQLite · command API ·
narrative,              entities · commands/events ·            n8n · Odoo · shadcn/ui · agents ·
transcript, or          policies · roles · workflows ·         docker-compose — a complete,
agent interview         agents  (validated + human-edited)     git-initialized repo
```

Content enters three ways — paste a **transcript**, let the **agent interview** you, or **write it**
directly — and the same pipeline derives the model. The projection is deterministic; the **engines are
pluggable** (add a store, orchestrator, UI, or platform by registering one adapter — see
[SPEC-010](docs/specs/SPEC-010-engine-plugin-seam.md)).

## Examples

The app opens on a gallery of worked verticals, each demonstrating a different way in:

| Vertical | How it was captured |
|---|---|
| ☀️ **Sonnenkraft Solar** — residential & commercial solar installer | owner-written narrative (ships a fully-baked model) |
| ⚖️ **Kanzlei Berger** — commercial law firm | an uploaded **Zoom-call transcript** |
| ☕ **Röstwerk** — specialty-coffee **franchise** | a **structured interview** run by the agent |
| ⚰️ **Abschied & Würde** — funeral-service **franchise** | owner-entered content |

> **Naming:** **Kiln** is the product; the code uses the internal codename **VBD** (`@vbd/*` packages +
> the historically-misspelled repo dir), which are not renamed.

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
