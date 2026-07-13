<div align="center">

# 🔥 Kiln

### The business compiler — describe a business, get the software that runs it.

[![License](https://img.shields.io/badge/license-Apache--2.0-5b8cff)](LICENSE)
[![CI](https://github.com/ziffr/kiln/actions/workflows/ci.yml/badge.svg)](.github/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933)](package.json)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-ff8a3d)](CONTRIBUTING.md)
[![Built &amp; maintained by Claude](https://img.shields.io/badge/built%20%26%20maintained%20by-Claude-D97757)](#built-and-maintained-by-claude)

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

> 🤖 **Kiln is designed, built, and maintained end-to-end by [Claude](https://claude.com/claude-code)**
> (Anthropic's AI), working with a non-technical product owner. We're open about that on purpose — Kiln
> is itself a demonstration of the thesis. See [Built and maintained by Claude](#built-and-maintained-by-claude).

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

## Built and maintained by Claude

Kiln is **designed, written, tested, documented, and maintained end-to-end by [Claude](https://claude.com/claude-code)**
(Anthropic's AI) — working with a **non-technical product owner** who sets the vision, priorities, and
scope. The human decides *what* to build and *why*; the AI does the *how*.

That's true of the ongoing project too, not just the initial build:

- **Every commit** is co-authored by Claude (check the git history — `Co-Authored-By: Claude`).
- **Every pull request** is reviewed and merged by the AI maintainer; **green CI is required**, and the
  owner is consulted only on product/scope, in plain language. See **[GOVERNANCE.md](GOVERNANCE.md)**.
- **Releases** are cut automatically ([release-please](RELEASING.md)); you can even mention **`@claude`**
  on an issue to have the AI draft a fix as a normal, reviewed PR.

We're deliberately open about this. Kiln's whole premise is that you can describe intent in plain
language and get real, working software — so it would be strange to hide that Kiln itself is made that
way. It's the thesis, applied to itself.

## Examples

The app opens on a gallery of worked verticals, each demonstrating a different way in:

| Vertical | How it was captured |
|---|---|
| ☀️ **Sonnenkraft Solar** — residential & commercial solar installer | owner-written narrative (ships a fully-baked model) |
| ⚖️ **Kanzlei Berger** — commercial law firm | an uploaded **Zoom-call transcript** |
| ☕ **Röstwerk** — specialty-coffee **franchise** | a **structured interview** run by the agent |
| ⚰️ **Abschied & Würde** — funeral-service **franchise** | owner-entered content |

> **Naming:** everything is **Kiln** — the product, the `@kiln/*` packages, and the `kiln.sh` CLI. The only
> pre-Kiln remnants are the local git-directory name (`VerticalBusinessDesiger`, kept for history; the public
> repo is `kiln`) and an accepted legacy `VBD_ANTHROPIC_API_KEY` env alias, so existing setups keep working.

## Repository layout

```
docs/                 governed plans, specs, reviews, ADRs (see docs/CONVENTIONS.md)
packages/
  ir/                 @kiln/ir — IR types + isomorphic SHA-256 hashing (the spine)
  schema/             @kiln/schema — JSON Schemas (capability.schema.json)
  compiler/           @kiln/compiler — authored artifacts → IR (+ computeBuildHash)
  validation/         @kiln/validation — deterministic validators V1–V2 (V3–V8 in M3)
  store/              @kiln/store — .kiln/ derived cache with buildHash-on-load (ADR-002)
  eval/               @kiln/eval — seeded-defect corpus + recall/precision scorer
  narrative/          @kiln/narrative — Business Narrative parser + completeness validators (M1)
  skills/             @kiln/skills — LLM skill runtime; CapabilityGenerator + MockProvider (M2)
apps/
  web/                @kiln/web — React + Vite SPA (narrative editor + Capability Map, DE/EN)
  service/            @kiln/service — server-side API (holds the LLM key; @anthropic-ai/sdk)
workspaces/
  solar-example/      reference solar-installer narrative + capabilities
```

## Run the app

The web app runs standalone with an **offline mock** generator. For **real LLM generation**,
also run the service (it holds the Anthropic key). Put your key in a git-ignored `.env` at the
repo root: `KILN_ANTHROPIC_API_KEY=sk-ant-...`

The easiest entrypoint is the **`kiln.sh`** helper — one script wrapping every CLI task
(`./kiln.sh help` lists them all; `./kiln.sh doctor` checks your environment):

```bash
./kiln.sh install     # install deps (links workspaces)
./kiln.sh dev         # run the service (:8787) + web app (:5188) together
./kiln.sh export      # project the model → a complete multi-backend system in ./out/targets
./kiln.sh app:up      # build + run that generated system (docker compose + schema)
```

Or drive the underlying tools directly:

```bash
npm install                          # links workspaces + installs deps
npm run dev --workspace @kiln/web     # web (Vite) on http://localhost:5188
npm run dev --workspace @kiln/service # API on http://localhost:8787 (loads .env)
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
