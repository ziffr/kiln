---
id: SPEC-010
title: Engine Plugin Seam — a contract + registry for pluggable execution engines
type: spec
status: Draft
version: 0.1.0
author: Claude (Opus 4.8)
created: 2026-07-13
updated: 2026-07-13
supersedes: null
related: [ADR-002, SPEC-007, SPEC-008]
reviewers: []
---

# SPEC-010 — Engine Plugin Seam

## 1. Problem

VBD projects a business model onto a set of **execution engines** (Postgres, SQLite, n8n, Odoo,
shadcn/ui, the generated Node spine). Which engine hosts which capability is chosen by the
**binding**, validated against a **fixed tech-capability taxonomy** (`store`, `operate`, `emit`,
`react`, `sequence`, `authorize`, `serve-ui`) and a per-engine **fidelity matrix** (`native` /
`partial` / `none`). That taxonomy is genuinely data-driven and extensible.

**But adding an engine today requires editing core in ~4 places:**

1. register the `Engine` descriptor in the `ENGINES` map (`packages/codegen/src/targets.ts`);
2. write an adapter function with a **bespoke signature** (`postgresAdapter(resolved, domain, roles)`,
   `n8nAdapter(resolved, domain, workflows, baseUrl, services)`, `shadcnAdapter(caps, domain,
   contexts, theme, workflows, roles, i18n)`, …);
3. wire that call into the hardcoded `artifacts` object literal inside `projectTargets`;
4. add a bespoke flatten branch in the exporter (`assembleFullStack`) that knows the engine's output
   shape and file-path convention.

So the *conceptual* half of the plugin story (what an engine can do, and whether a binding is valid)
is open, but the *code-generation* half is closed: there is **no adapter contract** and **no
registry**. This bottlenecks exactly the contributions we most want — new backends, stores, UIs, and
orchestrators — on a core maintainer.

This is the single highest-leverage change to make before inviting community contributions.

## 2. Goals / Non-goals

**Goals**
- A uniform **`EngineAdapter` contract**: one signature, one output shape, for every engine.
- A **registry** so an engine is added by *registering* it, never by editing `projectTargets`.
- Adding an engine = **one new file** (descriptor + adapter + a test) + one `registerEngine(...)`
  line. No edits to core dispatch.
- **Byte-identical output** through the migration (the proven regression guarantee — the built-in
  engines must emit the same bytes, so the change is dispatch-only).
- Keep the pure/isomorphic rule (invariant #4): the registry and adapters have **no `node:*`**, so
  the browser full-stack export (`assembleFullStack`) keeps working unchanged.

**Non-goals**
- **Not** a runtime/dynamic plugin loader. Engines are registered at import time, in-tree (or via a
  future package that calls `registerEngine`). No `fs`-based discovery, no arbitrary code loading —
  that would break isomorphism and the security posture.
- **Not** a rework of the cross-cutting **layer** generators (comms, integrations, agents, triggers,
  external-services). Those are always-on, not *bound* engines; they stay as-is in Phase 1.
- **Not** a change to the binding validators (TB1–TB5) or the fidelity taxonomy — they already work
  generically over `Engine.provides` and need no change.

## 3. Current shape (for reference)

```ts
// packages/codegen/src/targets.ts
export interface Engine {
  id: string;
  name: string;
  reach: "http" | "sql" | "event" | "in-process";
  provides: Record<TechCapability, Fidelity>;
  couplesStore?: boolean;
}
export const ENGINES: Record<string, Engine> = { postgres, sqlite, n8n, node, odoo, shadcn };

// projectTargets(...) — the hardcoded dispatch:
const artifacts = {
  postgres: dialect === "postgres" ? postgresAdapter(resolved, domain, roles) : "",
  sqlite:   dialect === "sqlite"   ? sqliteAdapter(resolved, domain) : "",
  n8n:      n8nAdapter(resolved, domain, workflows, undefined, servicesDoc),
  odoo:     odooAdapter(resolved, caps, domain, roles),
  ui:       uiGenerated ? shadcnAdapter(caps, domain, contexts, theme, workflows, roles, i18n) : {},
  spine:    spineHosted ? spineAdapter(caps, domain, handlers, dialect) : {},
  /* + always-on layer adapters: comms, integrations, agents, triggers, services */
};
```

The `artifacts` object is heterogeneous (a `string` for schemas, `N8nWorkflow[]` for n8n, a
`Record<path,content>` for odoo/ui/spine) and is consumed by three places: `assembleFullStack`
(CLI + browser), the web `CodePreview`, and the codegen tests. This heterogeneity is why the
migration is **staged**.

## 4. Design

### 4.1 The contract

```ts
/** Everything an engine adapter may need. One object; adapters read what they use. Pure/isomorphic. */
export interface EngineContext {
  binding: Binding;
  resolved: ResolvedElement[];          // the binding resolution (which element → which engine)
  dialect: "postgres" | "sqlite";
  caps: CapabilityDoc;
  domain: DomainDoc;
  contexts?: ContextsDoc;
  roles?: RolesDoc;
  workflows?: WorkflowsDoc;
  agents?: AgentsDoc;
  theme: Theme;
  handlers: Record<string, string>;     // LLM-drafted command bodies (spine)
  services: ExternalServicesDoc;
  i18n?: { sourceLang?: string; translations?: Record<string, Record<string, string>> };
}

/** What an engine emits: a file map (relative paths the engine OWNS) + optional n8n workflows. */
export interface EngineOutput {
  files: Record<string, string>;        // e.g. { "postgres/schema.sql": "…" }, { "ui/…": "…" }
  workflows?: N8nWorkflow[];             // engines whose reach is orchestration (n8n) emit these
}

/** The plugin unit. `applies` gates emission (e.g. a store engine only runs for the active dialect). */
export interface EngineAdapter {
  engine: Engine;
  applies?(ctx: EngineContext): boolean;   // default: true
  generate(ctx: EngineContext): EngineOutput;
}
```

Rationale: a single `generate(ctx) → { files, workflows? }` normalizes every current adapter. Stores
return `{ files: { "postgres/schema.sql": … } }`; the UI/spine/odoo return their existing file maps
under their prefix; n8n returns `{ files: {}, workflows: [...] }`. The engine owns its path prefix, so
the exporter no longer needs per-engine flatten branches.

### 4.2 The registry

```ts
// packages/codegen/src/engines/registry.ts
const REGISTRY = new Map<string, EngineAdapter>();
export function registerEngine(a: EngineAdapter): void { REGISTRY.set(a.engine.id, a); }
export function getEngineAdapter(id: string): EngineAdapter | undefined { return REGISTRY.get(id); }
export function registeredEngines(): Engine[] { return [...REGISTRY.values()].map(a => a.engine); }

// built-ins register themselves on import (packages/codegen/src/engines/index.ts imports each):
registerEngine(postgresEngineAdapter);
registerEngine(sqliteEngineAdapter);
registerEngine(n8nEngineAdapter);
registerEngine(odooEngineAdapter);
registerEngine(shadcnEngineAdapter);
registerEngine(spineEngineAdapter);
```

`ENGINES` (the descriptor map the validators read) becomes a **derived view** of the registry:
`ENGINES = Object.fromEntries(registeredEngines().map(e => [e.id, e]))`, so registering an adapter
also makes its descriptor visible to binding + validation — no second edit.

### 4.3 How `projectTargets` uses it

```ts
const boundEngineIds = new Set(resolved.map(r => r.engineId));           // engines actually in play
const engineOutputs = [...boundEngineIds]
  .map(getEngineAdapter).filter(Boolean)
  .filter(a => a!.applies?.(ctx) ?? true)
  .map(a => ({ id: a!.engine.id, out: a!.generate(ctx) }));
```

To preserve **byte-identity and the existing `artifacts` shape** during Phase 1, `projectTargets`
keeps returning the same `artifacts` object — but now assembles it *from* `engineOutputs` (a thin
adapter that maps each engine's `EngineOutput` back into the named slot it occupies today). New,
third-party engines land in a new generic channel `artifacts.engines: Record<engineId,
EngineOutput>`, which `assembleFullStack` flattens generically (`files` written verbatim, `workflows`
written as `n8n/<slug>.json` — the same convention the built-ins use). Built-in engines may migrate to
the generic channel later (Phase 2) once we've confirmed nothing else reads the named slots.

### 4.4 Contributor workflow (the payoff)

To add, say, a **MySQL store** engine, a contributor creates **one file**
`packages/codegen/src/engines/mysql.ts`:

```ts
import type { EngineAdapter } from "./registry";
export const mysqlEngineAdapter: EngineAdapter = {
  engine: {
    id: "mysql", name: "MySQL", reach: "sql",
    provides: { store: "native", authorize: "partial", emit: "none", operate: "partial",
                react: "none", sequence: "none", "serve-ui": "none" },
  },
  applies: (ctx) => ctx.resolved.some(r => r.kind === "aggregate" && r.engineId === "mysql"),
  generate: (ctx) => ({ files: { "mysql/schema.sql": buildMysqlSchema(ctx) } }),
};
```

…adds one line to `engines/index.ts` (`registerEngine(mysqlEngineAdapter)`), and a test in
`packages/codegen/test/`. Binding, validation, seam analysis, the CLI export, and the web full-stack
export all pick it up automatically. **No edits to `projectTargets`, `assembleFullStack`, the CLI, or
the web app.**

## 5. Migration plan (staged, byte-identical)

- **Phase 1 (this spec):** introduce `EngineContext` / `EngineOutput` / `EngineAdapter` + the registry;
  wrap the six existing adapter functions as built-in `EngineAdapter`s (they keep emitting identical
  bytes); make `ENGINES` a derived view; make `projectTargets` dispatch through the registry while
  keeping the `artifacts` shape and adding the generic `engines` channel; teach `assembleFullStack` to
  flatten the generic channel. **Acceptance: the solar export is byte-identical (both dialects) to the
  pre-change baseline; 268+ tests green; web build green.**
- **Phase 2 (future spec):** optionally normalize the built-ins fully onto the generic channel and
  retire the named slots; let engines contribute their own `docker-compose` service fragment and a
  short docs stanza (so a new engine is self-documenting in the generated repo).

## 6. Testing

- A registry unit test: register a fake engine, assert `getEngineAdapter` / `registeredEngines` /
  derived `ENGINES` see it; assert `applies` gating.
- The existing `targets`/`spine`/`fullstack` tests continue to pass unchanged (proves byte-identity of
  the built-ins through the new dispatch).
- The byte-identical exporter diff (captured baseline → regenerate → `shasum` compare) is the
  acceptance gate, as used for the `assembleFullStack` extraction.

## 7. Risks & mitigations

- **Blast radius of the `artifacts` shape.** Mitigated by Phase 1 keeping the named slots and only
  *deriving* them from the registry; third-party engines use the additive generic channel.
- **Registration order / determinism.** The registry is a `Map`; iteration for output must be sorted
  by engine id so output is deterministic regardless of registration order.
- **Isomorphism.** Registry + adapters stay `node:*`-free; a CI check greps the engines dir for
  forbidden imports.
- **Two sources of truth for `ENGINES`.** Resolved by making `ENGINES` derived from the registry, not
  a second literal.

## 8. Decision

Adopt the `EngineAdapter` contract + registry (Phase 1) as the extensibility seam for execution
engines. This is the mechanism that lets the community add stores, orchestrators, UIs, and full
platforms without touching core dispatch, while preserving the model→binding→validation→codegen spine
and the byte-identical guarantee.

## 9. Review & closure

_(to be completed on review — record each lens's verdict and the disposition of any
Approve-with-changes items here before moving to `Approved`.)_
