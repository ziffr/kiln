# CLAUDE.md — operating manual for VerticalBusinessDesigner (VBD)

This file is loaded into context every session. It is the rules of the road. Read it, follow it,
and update it when a rule changes. Product name: **VerticalBusinessDesigner**; the repo dir is
`VerticalBusinessDesiger` (historical misspelling — don't rename it).

## What this is
An LLM-guided **"Business Compiler"**: describe a vertical business in structured text → an LLM
derives a formal model → deterministic validators check it → it renders as an interactive,
reviewable **Capability Map**. Text is the source of truth; the graphic is a projection.

## Golden invariants (do not violate)
1. **Text is the source of truth; the UI/graph is a projection of the IR.** Never store truth in
   the canvas. Node positions are computed (elk), never persisted.
2. **Every IR node/edge is `authored` or `derived`.** Only `authored` elements round-trip to text
   and are editable; `derived` elements are read-only projections.
3. **Secrets never reach the browser.** The Anthropic key (`VBD_ANTHROPIC_API_KEY`, in the
   gitignored root `.env`) lives only in `apps/service`. The web app POSTs to the service; it
   never calls the model or holds the key.
4. **Pure packages are isomorphic + dependency-free.** `@vbd/ir|compiler|validation|narrative|skills|eval`
   run in Node tests AND the browser. No `node:*` builtins in them (use the isomorphic `sha256`
   from `@vbd/ir`, not `node:crypto`). `@vbd/store` and `apps/service` are the server-only exception.
5. **The model proposes; validators + the human decide.** LLM output is coerced, validated, and
   human-editable. Generated capabilities must carry grounded provenance (`meta.derivedFrom`,
   enforced by validator V8).

## Architecture (where things live)
```
packages/
  ir/          IR types (the spine) + isomorphic sha256/canonical/slug/edgeId
  schema/      JSON Schemas (capability.schema.json)
  compiler/    authored artifacts → IR (+ computeBuildHash)
  validation/  deterministic validators over the CapabilityDoc/IR (V1–V2, V8; V3–V7 WIP)
  narrative/   Business Narrative parser (heading-anchored) + completeness validators (NV1–NV4)
  store/       .vbd/ derived cache with buildHash-on-load (server-only; ADR-002)
  eval/        seeded-defect + generation-coverage scoring (gold-free)
  skills/      LLM skill runtime: CapabilityGenerator, MockProvider, NarrativeCoach prompt
apps/
  web/         React + Vite SPA (narrative interview/markdown, capability map, forms, projects)
  service/     Node API holding the key: /api/generate, /api/coach, /api/models, /api/usage
workspaces/    user data (solar-example fixture)
docs/          governed plans/specs/reviews/ADRs — see docs/CONVENTIONS.md
```
The **IR is the contract**: every view and validator reads it. Validators are pure functions.

## Tech & conventions
- **TypeScript end-to-end** (ADR-001). Node ≥ 20 runs `.ts` natively (type-stripping) — packages
  have **no build step**. `@types/node`/`typescript` are intentionally not installed, so the editor
  shows "cannot find module 'node:*'" squiggles — harmless; runtime is fine.
- **Tests:** `node:test` + `node:assert/strict`. Run `npm test` (currently **134** passing). Every
  new pure function gets a test in `packages/*/test/*.test.ts`.
- **Web:** Vite. `npm run build --workspace @vbd/web` must pass. Verify UI changes **in the browser**
  (the preview tools), not just tests — the invariants are visual.
- **Storage:** git for authored docs (ADR-002); the web app persists projects to **localStorage**
  (`vbd.projects`, ADR-005 — interim until a git-backed workspace API).

## Running it
```
npm install                          # links workspaces only (offline; no registry fetch for pkgs)
npm run dev --workspace @vbd/web      # http://localhost:5188
npm run dev --workspace @vbd/service  # http://localhost:8787 (loads root .env)
npm test                              # all package tests
```
Real LLM generation/interview needs `VBD_ANTHROPIC_API_KEY=sk-ant-...` in the gitignored root `.env`.

## LLM rules
- The project is TypeScript → use the **official `@anthropic-ai/sdk`**, never raw HTTP. SDK usage
  lives only in `apps/service`.
- **Do not guess the Anthropic API.** Consult the `claude-api` skill for model ids, effort/thinking,
  and structured outputs before writing LLM code.
- Default model **`claude-sonnet-5`**, effort **`medium`** ("sonnet medium"). `output_config.effort`
  is GA on Sonnet 5 / Opus 4.x but **errors on Haiku 4.5** → effort is coupled per-model.
- Use **structured outputs** (`output_config.format`) to lock JSON shapes; keep a one-shot repair
  retry; wrap user/business text as DATA (prompt-injection safety).

## Docs & process discipline
- All plans/specs/reviews/ADRs go under `docs/` per **`docs/CONVENTIONS.md`** (ID prefixes, frontmatter,
  **status lifecycle**). Update `docs/INDEX.md` when adding/changing a doc.
- Specs and plans get **independent, multi-lens review to closure** before `Approved`; log finding
  disposition in the doc. ADRs record decisions.

## Git
- Commit when a coherent unit is green. **Before committing: `npm test` + web build.** Commit
  often; small, clear messages.
- End every commit message with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- `.env`, `node_modules/`, `.vbd/`, `dist/` are gitignored — never commit them.

## Status (keep current)
- **M0, M1 complete.** **M2 engineering-complete** — only the human gate is open (a design partner
  to confirm A1 capability correctness). Provenance + V8 done.
- **SPEC-002 (domain layer, aggregates-first) engineering-complete** — DM1 mock, DM2
  `DomainGenerator` (+ `/api/domain`), DM validators in the UI, editable entity forms, DM eval. Exit
  gate GREEN on solar. **A4 (second-domain) now MET** via SPEC-003 §14. Open: A1/A6 design-partner.
- **SPEC-003 (business areas / subdomains) engineering-complete** — the capabilities→areas layer
  (the methodology's `bounded_contexts` rung, surfaced as "Business Areas", honestly a subdomain
  partition). 5-lens reviewed to closure (REV-012..016). Shipped: BC-M0 IR compose (`bctx:` nodes +
  `groups` edges), BC-M1 mock partitioner (affinity+size-cap, no single-blob), BC-M2 `validateContexts`
  (BC1–BC9; BC2 partition guarantee), BC-M3 `ContextGrouper` + `/api/contexts`, BC-M4 backdrop UI
  (colour+legend over the SINGLE map, form-select reassignment, Area-detail, reconcile-not-clear),
  BC eval with an ARI partition-agreement gate. Exit gate (§14): structural GREEN + **A7 second-domain
  PASSED** (dental, no code change); A5 ARI a qualified pass (LLM over-segments vs a coarse single
  reference); **HOLD** on `Approved` pending A6 partner value check.
- **Design partner validated capabilities + entities + areas** → **SPEC-002 & SPEC-003 `Approved`** (v1.0.0).
- **RES-001 codegen probe done** — `@vbd/codegen` (deterministic model→code projection: TS types +
  OpenAPI + area-module map + gap report). **Thesis holds for scaffolding** (solar → 8 TS interfaces,
  16 OpenAPI paths, 3 area modules, no LLM). Two gaps named the next work, both now CLOSED: typed
  attributes + commands/events. `@vbd/codegen` is the yardstick for future layers.
- **Typed entity attributes** — `AttributeSpec {name, type}` (text/number/boolean/date/money/reference);
  codegen emits real TS/OpenAPI types; LLM + human editor both set types. The codegen "untyped" gap is
  closed.
- **SPEC-004 (commands & events) reviewed to closure (REV-017..021), then BUILT** after RES-001
  justified it. IR: command/event nodes + issues/changes/emits/on edges. `validateEvents` (CE1–CE8 +
  emit-boundary). `EventModeler` = events-first, command-is-a-request (emits 0..n), **per-aggregate
  fan-out**, trigger discriminator (command/time/external), `/api/events`. In-context "What happens"
  UI. CE eval with a **commandRecall** quality metric. Exit gate GREEN (§14): commandRecall **1.0**,
  dental second-domain clean, 0 findings. Status `Revised`, **A6 (partner review of behaviour) the
  one open item.**
- Full arc works end-to-end: narrative interview (or markdown) → capabilities (mock / real Sonnet 5)
  → elk map with **Business-Areas backdrop** → editable capability/entity/area forms → validators
  (V1–V8, DM, BC) → multi-project (server + localStorage) → spend estimate.
