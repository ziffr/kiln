---
id: ADR-001
title: TypeScript end-to-end (shared IR contract)
type: adr
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-10
updated: 2026-07-10
supersedes: null
related: [SPEC-001, REV-002]
---

# ADR-001 — TypeScript end-to-end

## Status
Approved. Ratifies the decision reached in SPEC-001 §6.1/§12 Q1 and endorsed by REV-002.

## Context
VBD's spine is the Intermediate Representation (IR): authored text → compiler → `ir.json` →
(validators, review, UI projections). The IR type is the single most important contract in
the system — every layer reads it. SPEC-001 Q1 asked: TypeScript end-to-end, or a Python
service (e.g. FastAPI) behind a TS client?

Forces:
- The IR type must be shared, unambiguously, between compiler, validators, and client.
- Later phases add code generation, but generation emits **target-language text** (FastAPI,
  React, adapters) — it does not require the generator itself to run in that language.
- Team velocity favors one language, one build, one type system over a polyglot seam.
- JSON-Schema validation of LLM output (ajv) and graph libs (React Flow, dagre/elk) are
  first-class in the TS ecosystem.

## Decision
**Use TypeScript end-to-end** for client and service. The IR and all artifact types are
defined once in a shared `@vbd/ir` package and imported by every other package. No Python
service in the MVP.

## Alternatives considered
- **Python (FastAPI) service + TS client.** Rejected: introduces a type seam across the most
  critical contract (IR), duplicating types or relying on codegen'd bindings; the only real
  pull toward Python (ML/codegen) does not apply because generation produces text and LLM
  calls are HTTP.
- **Polyglot from day one.** Rejected: premature; adds ops/build complexity with no MVP payoff.

## Consequences
- (+) Single shared IR type; no cross-language drift; one toolchain, one test runner.
- (+) Straightforward path to embedding the compiler/validators in the client later if desired.
- (−) If a future component genuinely needs Python (e.g. a heavy numeric planning engine), it
  enters as a **separate service behind an interface**, not as the core — acceptable and
  deferred.
- Node ≥ 20 (dev env is Node 26). Package manager: npm workspaces (monorepo).

## Follow-ups
- `@vbd/ir` package owns `IR`, `IRNode`, `IREdge`, `SourceRef`, `Origin` (SPEC-001 §3.4).
- Codegen ADR (later) will specify how target-language text is emitted and tested.
