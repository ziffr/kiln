# Developer Guide — how Kiln is built and where to change it

This is the "start here" orientation for a developer touching Kiln's code. For *how to contribute*
(setup, the CI gate, commit style) read [CONTRIBUTING.md](CONTRIBUTING.md) first; for the exhaustive
operating rules read [CLAUDE.md](CLAUDE.md). This document is the map in between: the mental model,
the repository shape, and — most usefully — **where to attack** for the three changes people
actually make.

## The mental model in one paragraph

Kiln is a **business compiler**. A plain-language description of a business is compiled, layer by
layer, into a formal **model** (the IR), deterministic **validators** check that model, and
deterministic **codegen** projects it into a runnable multi-backend system. The single most important
idea: **the text/model is the source of truth; everything you see — the maps, the forms, the
generated code — is a *projection* of it.** If a projection looks wrong, you fix the model or the
generator, never the projected artifact. An LLM only ever *proposes*; validators and the human
decide.

## The pipeline (and which package owns each step)

```
 narrative ──▶ capabilities ──▶ areas ──▶ entities ──▶ behaviour ──▶ automations ──▶ roles ──▶ workflows ──▶ agents ──▶ CODE
 @kiln/narrative   └──────────────────────── @kiln/compiler builds the IR ────────────────────────┘        @kiln/codegen
                              every layer is validated by @kiln/validation · proposed by @kiln/skills
```

Each layer is **derived from the ones before it** — that is why the left-rail order is what it is
(capabilities are found first; areas are a *grouping over* capabilities, so they come after; and so
on). Any layer can be an endpoint: you can stop after capabilities and still have something useful.

## Repository map

```
packages/
  ir/          The IR — the spine every view and validator reads. Isomorphic helpers
               (sha256, canonical, slug, edgeId) live here, NOT node:crypto.
  schema/      JSON Schemas (capability.schema.json) + MODEL_SCHEMA_VERSION.
  compiler/    Authored artifacts → IR (+ computeBuildHash).
  validation/  Deterministic validators over the model (pure functions; one index.ts).
  narrative/   The Business Narrative parser (heading-anchored) + completeness checks.
  skills/      The LLM layer: one modeler per methodology layer (domain.ts, contexts.ts,
               agents.ts, …) + the critic/coach/enrich runtimes + MockProvider.
  codegen/     model → code. src/*.ts emit strings; src/engines/* wrap them as pluggable
               EngineAdapters behind a registry. This is the compiler's back end.
  eval/        Seeded-defect + generation-coverage scoring (gold-free).
  store/       .kiln/ derived cache (SERVER-ONLY — may use node:*).
apps/
  web/         React + Vite SPA. The stages, maps, forms, findings, and the in-app Guide.
  service/     The Node API that holds the Anthropic key: /api/generate, /api/coach, …
workspaces/    User data + example fixtures.
docs/          Governed plans/specs/reviews/ADRs — see docs/CONVENTIONS.md.
```

**Isomorphism is enforced.** The pure packages (`ir`, `compiler`, `validation`, `narrative`,
`skills`, `eval`) run in Node tests *and* the browser, so they must not import `node:*`. Only
`@kiln/store` and `apps/service` are the server-only exception. A CI test asserts this. See the
gotcha under "add an engine".

## The IR is the contract

Everything hangs off `@kiln/ir`. A view renders it; a validator checks it; codegen projects it.
Every node/edge is either **`authored`** (round-trips to text, human-editable) or **`derived`**
(a read-only projection). If you add a concept to the model, you add it to the IR first, and then
everything downstream reads it from there. Don't smuggle truth into a component's local state or the
canvas.

---

## Where to attack — the three common changes

### 1. Add an LLM provider

The provider seam lives entirely in the **service** (invariant: secrets never reach the browser).
The web app POSTs to the service; only the service constructs the Anthropic SDK client.

- **Files:** [`apps/service/src/server.ts`](apps/service/src/server.ts) and its serverless mirror
  [`apps/web/functions/_lib.ts`](apps/web/functions/_lib.ts) (the hosted functions). Change both.
- **Pattern:** pick the credential/`baseURL` at client construction time; keep the request code
  identical (same `@anthropic-ai/sdk`, structured outputs, one-shot repair retry). The existing
  **Langdock** path is the worked example — it routes the same SDK through an Anthropic-native
  endpoint via `authToken` + `baseURL`, takes precedence over `KILN_ANTHROPIC_API_KEY`, and
  **degrades gracefully** (on a 400 with an `output_config`, it retries once without it).
- **Never** call the model or read the key from `apps/web`.

### 2. Add an execution engine (a store, orchestrator, UI, or platform)

SPEC-010's plugin seam means you register **one** `EngineAdapter` and touch no core dispatch.

- **Files:** add `packages/codegen/src/engines/<id>.ts`, then one `registerEngine(...)` line in
  [`packages/codegen/src/engines/index.ts`](packages/codegen/src/engines/index.ts). The contract is
  in [`engines/registry.ts`](packages/codegen/src/engines/registry.ts):
  ```ts
  interface EngineAdapter {
    engine: Engine;                          // the descriptor (id, tech-capabilities, reach, fidelity)
    applies?(ctx: EngineContext): boolean;   // gate emission (default true)
    generate(ctx: EngineContext): EngineOutput;  // { files: {path→content}, workflows? }
  }
  ```
  `generate` returns the relative paths the engine **owns**; the exporter writes them verbatim (no
  bespoke branch in `assembleFullStack`). `projectTargets` dispatches through `registeredEngines()`,
  which sorts by id for deterministic output.
- **The gotcha (isomorphism):** `engines/` is a pure package, and the CI invariant test scans it for
  `node:*` **even inside emitted string literals**. So the code you *emit* for, say, a Node spine
  can contain `import "node:crypto"` — but that string must be produced by a generator in
  `packages/codegen/src/<id>.ts` (the exempt `src/` root) and the `engines/<id>.ts` file must be a
  thin wrapper that calls it. The `langdock` and `managed-agents` engines are the template.
- Propose it with the [new-engine issue template](.github/ISSUE_TEMPLATE/new-engine.md) first; see
  `docs/good-first-issues/` for three starter engines.

### 3. Add a methodology layer

A new layer (like policies, roles, or agents were) is the widest change — it threads through the
whole pipeline. Copy an existing layer end to end; **roles** or **agents** are the cleanest
templates. The anatomy:

1. **Spec** under `docs/specs/SPEC-0XX-*.md` (frontmatter + status lifecycle per
   `docs/CONVENTIONS.md`; add it to `docs/INDEX.md`).
2. **IR** — new node/edge kinds in `@kiln/ir`, composed by `@kiln/compiler`.
3. **Validator** — a pure `validate<Layer>` in `@kiln/validation` with a test in
   `packages/validation/test/`.
4. **Skill** — a modeler in `packages/skills/src/<layer>.ts` + its prompt (DATA-wrapped for
   injection safety) + a coerce/validate/one-shot-repair path.
5. **Service route** — `/api/<layer>` in `apps/service/src/server.ts` **and** the functions mirror.
6. **UI stage** — a `StageId` + view in `apps/web`, its `stageDesc_<layer>` sub-header, a Guide
   step, and findings wiring.
7. **Codegen** — a projection in `@kiln/codegen` so the layer reaches the generated system.
8. **Eval** — a quality metric in `@kiln/eval`.

If your layer only *reads* existing layers (a projection), you can skip the authored-IR + skill
pieces and generate straight from what's already there.

---

## Running, testing, verifying

```bash
./kiln.sh install        # link workspaces (offline; no build step — Node type-strips .ts)
./kiln.sh dev            # run web + service together
./kiln.sh check          # the CI gate: npm test + web build. Green here ⇒ green in CI.
```

- **Tests** are `node:test` + `node:assert/strict`. Every new pure function gets one under
  `packages/*/test/*.test.ts`.
- **UI is verified in the browser**, not just by tests — several invariants (the projection, the
  maps, the findings) are visual. Use the preview tooling; don't trust a green build alone for UX.
- No `@types/node`/`typescript` is installed on purpose, so editors show harmless
  "cannot find module 'node:*'" squiggles. Runtime is fine.

## The generated system also documents itself

When Kiln exports an app it emits its own docs next to the code — `README.md`, `ARCHITECTURE.md`
(single-app), `CLAUDE.md`, `DEPLOY.md`, plus topic files (`ORCHESTRATION.md`, `TRIGGERS.md`,
`EXTERNAL-SERVICES.md`, `AGENTS.md`, `TODO.md`). Those are generated from the model — so if the
generated docs are wrong, fix the **exporter** in `@kiln/codegen`, not the emitted file.

## The short version

- The model is the truth; code is a projection. Fix the projection, never the artifact.
- Pure packages stay isomorphic (no `node:*`, even in emitted strings inside `engines/`).
- Provider → the service (never the browser). Engine → one `EngineAdapter`. Layer → copy an
  existing one through all eight steps.
- `./kiln.sh check` is the gate; verify UI in the browser.
