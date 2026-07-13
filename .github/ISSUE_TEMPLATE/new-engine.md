---
name: New execution engine
about: Propose or contribute a new execution engine (store / orchestrator / UI / platform)
title: "new-engine: "
labels: new-engine, enhancement
assignees: ''
---

<!--
VBD projects a reviewed business model onto execution ENGINES via a fixed tech-capability taxonomy.
Existing engines include Postgres and SQLite (store), the spine (command API), n8n (orchestration),
Odoo (platform), a shadcn UI, and agent runtimes. Use this template to propose a new one.
-->

## The engine

- **Name:**
- **Kind:** <!-- store / orchestrator / UI / platform / other -->
- **What it is / link:**

## Why VBD should support it

<!-- What does it unlock that existing engines don't? -->

## Tech-capabilities provided (and at what fidelity)

For each capability the engine provides, note the **fidelity** — full, partial, or none — and any
caveats. Leave blank / mark "none" for capabilities it does not cover.

| Capability   | Provided? | Fidelity (full / partial / none) | Notes |
| ------------ | --------- | -------------------------------- | ----- |
| `store`      |           |                                  |       |
| `operate`    |           |                                  |       |
| `emit`       |           |                                  |       |
| `react`      |           |                                  |       |
| `sequence`   |           |                                  |       |
| `authorize`  |           |                                  |       |
| `serve-ui`   |           |                                  |       |

## Reach

<!-- The engine's `reach`: how much of a generated system it can cover on its own — a narrow
     single-capability adapter, or a broad multi-capability platform? -->

## Does it couple its own store?

<!-- Does this engine bring/require its own data store (like Odoo does), or does it compose with a
     separate store engine (like n8n or the spine)? This affects how it binds in the model. -->

## Deployment / runtime notes

<!-- How does it run — docker container, hosted service, embedded? Any secrets, ports, or env it
     needs? How would it fit the generated docker-compose + Makefile? -->

## Willing to contribute it?

<!-- Are you offering to implement the adapter, or proposing it for someone else to build? -->
