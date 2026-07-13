/**
 * @vbd/codegen/engines/registry — the ENGINE PLUGIN SEAM (SPEC-010, Phase 1).
 *
 * RES-002 (targets.ts) proved the model projects onto heterogeneous execution engines, but the
 * code-generation half of that story was CLOSED: each engine was hardcoded by name inside
 * `projectTargets`'s `artifacts` object, and `ENGINES` was a literal map. Adding an engine meant
 * editing core dispatch in ~4 places. This file introduces the missing CONTRACT + REGISTRY so an
 * engine is REGISTERED, not hardcoded — the single highest-leverage change before inviting
 * community contributions.
 *
 * The uniform contract: one `generate(ctx) → { files, workflows? }` signature for EVERY engine, and
 * an `applies(ctx)` gate. Stores return `{ files: { "postgres/schema.sql": … } }`; the UI/spine/odoo
 * return their existing file maps under their own path prefix; n8n returns `{ files: {}, workflows }`.
 * The engine OWNS its path prefix, so the exporter needs no per-engine flatten branch (SPEC-010 §4.1).
 *
 * PURE + ISOMORPHIC (golden invariant #4): NO `node:*`, NO `process`, NO fs. Every import below is a
 * TYPE-ONLY import (erased by Node's type-stripping) so this module has NO runtime dependency on
 * targets.ts — it is a leaf, and the browser full-stack export keeps working unchanged.
 */

import type { Engine, N8nWorkflow, Binding, ResolvedElement } from "../targets.ts";
import type { CapabilityDoc, DomainDoc, ContextsDoc, RolesDoc, WorkflowsDoc, AgentsDoc } from "@vbd/compiler";
import type { Theme } from "../ui.ts";
import type { ExternalServicesDoc } from "../services.ts";

// ─────────────────────────────────────────────────────────────────────────────
// The contract (SPEC-010 §4.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Everything an engine adapter may need. ONE object; adapters read only what they use. This is the
 * normalization of the old bespoke per-adapter signatures (`postgresAdapter(resolved, domain, roles)`,
 * `n8nAdapter(resolved, domain, workflows, baseUrl, services)`, `shadcnAdapter(caps, domain, contexts,
 * theme, workflows, roles, i18n)`, …) into a single context. Pure/isomorphic — no runtime handles.
 */
export interface EngineContext {
  binding: Binding;
  /** the binding resolution: which model element landed on which engine. */
  resolved: ResolvedElement[];
  /** the active store dialect (a store engine only emits for the matching dialect). */
  dialect: "postgres" | "sqlite";
  caps: CapabilityDoc;
  domain: DomainDoc;
  contexts?: ContextsDoc;
  roles?: RolesDoc;
  workflows?: WorkflowsDoc;
  agents?: AgentsDoc;
  theme: Theme;
  /** LLM-drafted command bodies (the spine folds these into its handlers). */
  handlers: Record<string, string>;
  services: ExternalServicesDoc;
  i18n?: { sourceLang?: string; translations?: Record<string, Record<string, string>> };
}

/**
 * What an engine emits: a file map (the relative paths the engine OWNS) + optional n8n workflows for
 * engines whose reach is orchestration. The exporter writes `files` verbatim and each workflow as
 * `n8n/<slug>.json` — so a new engine needs NO bespoke flatten branch in `assembleFullStack`.
 */
export interface EngineOutput {
  /** relative path → content, e.g. `{ "mysql/schema.sql": "…" }`, `{ "ui/…": "…" }`. */
  files: Record<string, string>;
  /** importable orchestration workflows (n8n and kin emit these). */
  workflows?: N8nWorkflow[];
}

/**
 * The plugin unit. `engine` is the descriptor the binding + validators read; `applies` gates emission
 * (a store engine only runs for the active dialict; the UI engine only when it serves the UI);
 * `generate` projects the bound elements into that engine's artifacts. This is the ONE thing a
 * contributor writes to add a backend, store, UI, or orchestrator.
 */
export interface EngineAdapter {
  engine: Engine;
  /** default: true. Return false to skip this engine for the current model/binding. */
  applies?(ctx: EngineContext): boolean;
  generate(ctx: EngineContext): EngineOutput;
}

// ─────────────────────────────────────────────────────────────────────────────
// The registry (SPEC-010 §4.2)
// ─────────────────────────────────────────────────────────────────────────────

/** The single source of truth for the engines the system knows about. Keyed by engine id. */
const REGISTRY = new Map<string, EngineAdapter>();

/** Register an engine. Built-ins do this at import time (engines/index.ts); a future package could too. */
export function registerEngine(adapter: EngineAdapter): void {
  REGISTRY.set(adapter.engine.id, adapter);
}

/** Look up a single adapter by engine id (used by `projectTargets`' registry dispatch). */
export function getEngineAdapter(id: string): EngineAdapter | undefined {
  return REGISTRY.get(id);
}

/**
 * All registered engine descriptors, DETERMINISTICALLY SORTED BY ID (SPEC-010 §7 risk: iteration for
 * output must not depend on registration order). `ENGINES` in targets.ts is derived from this, so the
 * binding + validators see every registered engine with no second edit.
 */
export function registeredEngines(): Engine[] {
  return [...REGISTRY.values()].map((a) => a.engine).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
