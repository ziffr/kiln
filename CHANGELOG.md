# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) at the repository level (see
[RELEASING.md](RELEASING.md)).

## [Unreleased]

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
