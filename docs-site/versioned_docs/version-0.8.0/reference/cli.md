---
sidebar_position: 6
title: The kiln.sh CLI
---

# The `kiln.sh` CLI

`kiln.sh` is one entrypoint for every Kiln command-line task — running and developing Kiln itself,
generating a system from a business model, and running the generated system. It wraps the underlying
`npm` / `node` / `docker` incantations so you don't have to remember them.

```bash
./kiln.sh <command> [args]     # run a command
./kiln.sh help                 # show every command
./kiln.sh doctor               # check your environment is ready
```

Nothing here is magic: **every command prints the underlying invocation it runs**, so you can always see
(and copy) the real `npm` / `node` / `docker` call behind it.

The commands fall into three groups — **Designer** (run and develop Kiln itself), **Model** (generate a
system from a business model), and **App** (run a *generated* system) — plus a few optional extras.

## Getting started

| Command | What it does |
| --- | --- |
| `install` | Install dependencies (links the npm workspaces; offline). |
| `doctor` | Check the environment (node, `.env` + key, docker, git). |

## Designer — run & develop Kiln

| Command | What it does |
| --- | --- |
| `dev` | Run the service (:8787) **and** the web app (:5188) together. Ctrl-C stops both. |
| `stop` | Stop any running dev processes + free ports :8787 / :5188 (clears stale servers). |
| `web` | Run only the web app → `http://localhost:5188`. |
| `service` | Run only the API service → `http://localhost:8787` (holds the Anthropic key). |
| `test` | Run the package test suite (`node --test`). |
| `build` | Production-build the web app. |
| `typecheck` | Type-check with `tsc` (via `npx`; `@types` are intentionally not vendored). |
| `check` | The pre-commit gate: **test + build** (what `CLAUDE.md` requires before a commit). |
| `prompts` | Rebuild the bundled LLM prompts (`packages/skills`). |

## Model — generate a system from a business model

| Command | What it does |
| --- | --- |
| `export [flags]` | Project the model → a complete multi-backend repo in `./out/targets`. |

Flags are passed straight through to the exporter. Common ones:

| Flag | Effect |
| --- | --- |
| `--sqlite` | Embedded SQLite store (single-container app). |
| `--enrich [depth]` | Thicken the model first (`conservative` \| `standard` \| `exhaustive`). |
| `--model <path>` | A `model.json` (default: the baked solar example). |
| `--out <dir>` | Output directory (default: `./out/targets`). |
| `--since <old-model>` | Emit an incremental migration vs a deployed model. |
| `--no-git` | Skip the initial git commit in the output. |

```bash
./kiln.sh export
./kiln.sh export --sqlite --enrich standard
./kiln.sh export --model ./my-business.json --out ./build
```

## App — run a generated system

These operate on `./out/targets`, or a directory you pass.

| Command | What it does |
| --- | --- |
| `app:up [dir]` | `docker compose up -d` + apply the schema (Postgres/SQLite + n8n + Odoo + spine + UI). |
| `app:down [dir]` | Tear the stack down. |
| `app:ui [dir]` | Run the generated UI on the host (Vite dev server, live reload). |
| `app:spine [dir]` | Run the generated command API on the host. |
| `app:logs [dir]` | Follow the docker compose logs. |

## Alternative AI engines

Optional — Anthropic is the default; OpenRouter needs only a key.

| Command | What it does |
| --- | --- |
| `omniroute:up` | Run the self-hosted omniroute AI gateway as a sidecar (via `npx`, MIT). Prints next steps. |
| `omniroute:down` | Stop it. |

See [Choosing an engine](./choosing-an-engine.md) for the full picture.

## Connectors — a local Nango

**Optional convenience; not required.** Connectors broker agent OAuth through [Nango](./connectors.md).
Kiln and every exported app reach whichever Nango you set via `NANGO_HOST` + `NANGO_SECRET_KEY` — three
**equal** options: **Nango Cloud**, **an existing company Nango**, or the local helper below.

| Command | What it does |
| --- | --- |
| `nango:up` | Boot a local Nango (OAuth broker) via docker compose, generate `NANGO_ENCRYPTION_KEY` if absent, and print setup steps. |
| `nango:down` | Stop it (volumes kept — it does not delete connections). |

`nango:up` is a developer convenience only; it is never the required posture. See
[Agent tool connectors](./connectors.md) for the end-to-end setup.

## Verify sandbox

| Command | What it does |
| --- | --- |
| `verify:up` | Build + start the Docker verifier (lets the app build / run / smoke-test generated apps). |

Run `./kiln.sh doctor` first if anything misbehaves.
