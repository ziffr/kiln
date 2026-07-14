# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) at the repository level (see
[RELEASING.md](RELEASING.md)).

## [Unreleased]

## [0.2.0] - 2026-07-14

A large capability release: multiple selectable AI engines, a local "Run app" loop, AI passes that
improve the generated app, and — new in this release — a clearer View-code action bar, adaptive
per-stage model defaults, and full engine parity in the exported app.

### Added

- **Selectable AI engines (Anthropic-first, plus OpenAI-compatible gateways).** Anthropic stays the
  default and preferred engine; **OpenRouter** and self-hosted **omniroute** are selectable in
  Settings → Engine, wired through one dependency-free adapter and available on the hosted API too.
- **Per-stage provider / model / effort.** Any modeling stage can run on a different engine, model,
  and effort than the global default.
- **Adaptive Anthropic model defaults (on by default).** With no per-stage override, each stage picks
  a model and effort by tier — heavy reasoning (capabilities, business areas, automations) → Opus·high,
  standard → Sonnet, light (entities, roles, agents) → Haiku. Overrides always win; gateways use the
  flat default. A one-time migration re-enables it on projects that had it turned off in the old UI.
- **Engine parity in the exported app.** The generated agent runtime runs on the same engines —
  Anthropic, OpenRouter, omniroute, or any OpenAI-compatible endpoint (LiteLLM/vLLM/Ollama/Azure) — via
  one `PROVIDER` switch. The export is **pre-pointed at the engine you built on**: its `.env.example`
  leads with that provider and model, so an app built on a gateway doesn't ship Anthropic-first.
- **Local "Run app".** Boot the generated zero-dependency app on your machine from the View-code stage
  and use it in a new tab — closing the loop describe → adjust → run → export.
- **AI passes over the generated app.** Code review + auto-fix, sandbox verify + auto-fix, **Polish
  layout** (rules-based screen design) and **Visual review** (screenshot → vision critique) — each
  reviewed before it applies.
- **Runnable full-stack export.** The shadcn UI fetches real data from the spine and drives its
  actions, with sortable tables, detail sheets, tabs, and a KPI chart; SQLite spine auto-creates its
  schema on boot.
- **Versioned documentation site** (Docusaurus → GitHub Pages) and a responsive, off-canvas mobile
  sidebar.

### Changed

- **View-code action bar redesigned** into three self-explaining controls — an **Improve with AI**
  menu, **Run app**, and an **Export** menu — each item describing what it does, replacing a crowded
  flat toolbar. Per-stage Settings gained hover tooltips explaining each stage.

## [0.1.0] - 2026-07-13

First public release.

### Added

- **LLM-guided business modeling across the full methodology stack.** Describe a vertical business
  in structured text; an LLM derives a formal model — narrative, capabilities, business areas,
  entities with typed attributes, commands and events, policies, roles, workflows, and agents —
  which deterministic validators check and a human reviews and edits. Text is the source of truth;
  the Capability Map is a projection of it.
- **Deterministic multi-backend codegen.** The reviewed model is projected — with no LLM in the
  loop — into a complete, runnable system: a data store (Postgres or embedded SQLite), a command
  API (spine), workflow orchestration (n8n), an ERP option (Odoo), a shadcn-styled UI, and agent
  runtimes.
- **Full-stack export from both the CLI and the web app.** Generate a whole system from a single
  model, with model-diff migrations for growing a live database incrementally.
- **Docker-ready generated repositories.** Each export ships with docker-compose and a Makefile so a
  generated system builds and runs as a stack out of the box.

[Unreleased]: https://github.com/ziffr/kiln/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ziffr/kiln/releases/tag/v0.1.0
