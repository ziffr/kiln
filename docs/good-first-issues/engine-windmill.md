# Add a Windmill orchestrator engine 🟡

**Labels:** `good first issue`, `new-engine`
**Capability role:** `react` + `sequence`
**Difficulty:** intermediate — mirror the n8n engine, different orchestrator format.
**Reference to copy:** `packages/codegen/src/engines/n8n.ts` (+ `n8nAdapter`, `triggersAdapter`).

## Why

Automation today is projected to **n8n** workflows. [Windmill](https://www.windmill.dev) is a popular
open-source alternative — scripts + flows as versionable JSON/YAML, self-hostable. A Windmill engine
lets teams who already run Windmill get the same reactions and processes (from the model's policies and
workflows) in their tool — chosen by binding `react`/`sequence` to `windmill`.

## What to build

An engine that provides `react: "native"` and `sequence: "native"` and emits Windmill **flows** from
the same model elements the n8n engine reads: **policies** (event → command reactions) become
event-triggered flows; **workflows** (ordered command sequences) become multi-step flows. Each step
calls the spine's command endpoint (the spine stays the single writer — see [ADR-002](../adr/ADR-002-storage-and-source-of-truth.md)).

1. **`packages/codegen/src/engines/windmill.ts`** — an `EngineAdapter`:

   ```ts
   export const windmillEngineAdapter: EngineAdapter = {
     engine: {
       id: "windmill", name: "Windmill", reach: "http",
       provides: { react: "native", sequence: "native", emit: "partial", operate: "partial",
                   store: "none", authorize: "none", "serve-ui": "none" },
     },
     applies: (ctx) => ctx.resolved.some(
       (r) => (r.kind === "policy" || r.kind === "workflow") && r.engineId === "windmill"),
     generate: (ctx) => ({ files: buildWindmillFlows(ctx) }), // windmill/*.flow.json
   };
   ```

2. **`buildWindmillFlows(ctx)`** — study `n8nAdapter` for what it reads, then emit Windmill flow files
   under `windmill/`:
   - One `reaction_<policy>.flow.json` per policy bound to windmill: an input trigger (the event) → a
     step that POSTs the spine command (`{{SPINE_URL}}/…`).
   - One `process_<workflow>.flow.json` per workflow-mode process bound to windmill: an ordered chain
     of steps, one command POST each (respect the same workflow-vs-agent `mode` the n8n engine honours —
     agent-mode processes are NOT emitted as flows).
   - Use Windmill's flow schema (`modules` with `rawscript`/`http` steps). A small, honest subset is
     fine for v1; note in the flow description what a human must finish (credentials, endpoints).

3. **Register** it in `engines/index.ts`.

4. **Test** `packages/codegen/test/engine-windmill.test.ts` — assert a model with a policy + a
   workflow-mode process bound to windmill emits one reaction flow and one process flow, each valid
   JSON, each step targeting a spine command; and that an agent-mode process is NOT emitted.

## Acceptance criteria

- Tests green.
- Every emitted `windmill/*.flow.json` is valid JSON and imports into a real Windmill instance without
  a schema error (paste a screenshot or the import log in the PR).
- Respects the spine-is-the-only-writer rule (steps call command endpoints, never a store directly).
- No `node:*` in `engines/windmill.ts`.
- Conventional Commit, e.g. `feat(engines): add Windmill orchestrator engine`.

## Out of scope

Windmill credentials/resources, retries, and the `trigger_*` external-signal flows — follow-ups once
the core reaction/process flows land.
