/**
 * @kiln/codegen/connectors/registry — the CONNECTOR PLUGIN SEAM (SPEC-013 §4.3, Phase A).
 *
 * Mirrors the engine seam (SPEC-010, `engines/registry.ts`): a connector is REGISTERED, not hardcoded.
 * A `ToolDef` (@kiln/compiler) is grant-surface metadata ONLY — provider label + typed operations, no
 * destination. ALL provider glue (the endpoint, the node id, how the Nango token is presented) lives in
 * the registered `ConnectorAdapter` here, in code (ADR-002) — never in `model.json`. That separation is
 * what keeps a connector from degenerating into the forbidden `fetch(url)` (invariant #6).
 *
 * Phase A ships the SEAM + registry only — NO real connector (Spreadsheet/Nango is Phase B). The registry
 * is exercised by the §6 acceptance probe: register a fake connector as ONE file, assert it resolves via
 * the registry and that projection is byte-identical when no grant references it.
 *
 * PURE + ISOMORPHIC (golden invariant #4): NO `node:*`, NO `process`, NO fs. Every import is TYPE-ONLY
 * (erased by Node's type-stripping), so this module is a browser-safe leaf.
 */

import type { ToolDef } from "@kiln/compiler";
import type { DomainDoc, AgentsDoc } from "@kiln/compiler";
import type { Binding } from "../targets.ts";

// ─────────────────────────────────────────────────────────────────────────────
// The contract (SPEC-013 §4.3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Everything a connector adapter may need to emit an op's runtime. `connectionRef` is the OPAQUE Nango
 * connection reference (never a token, never PII — SEC6/TC7); the adapter resolves the live token at call
 * time in the generated runtime (Phase B), it is not present here at build time.
 */
export interface ConnectorCtx {
  domain: DomainDoc;
  agents: AgentsDoc;
  binding: Binding;
  toolId: string;
  connectionRef: string; // opaque Nango connection reference (never a token)
}

/**
 * The plugin unit. `toolDef` is the grant surface it backs. `emitNango` returns the TS that calls the
 * provider with a Nango-brokered token (the shipped default, no n8n). `emitN8n` is the OPTIONAL n8n-node
 * alternative for owners who already run n8n. `applies` gates emission. This is the ONE thing a
 * contributor writes to add a connector — no edits to core dispatch (SPEC-013 §4.3, DX2).
 */
export interface ConnectorAdapter {
  toolDef: ToolDef;
  emitNango(op: string, ctx: ConnectorCtx): { runtime: string };
  emitN8n?(op: string, ctx: ConnectorCtx): { node: string; operation: string; params: Record<string, unknown> };
  applies?(ctx: ConnectorCtx): boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// The registry (SPEC-013 §4.3, mirrors engines/registry.ts)
// ─────────────────────────────────────────────────────────────────────────────

/** The single source of truth for the connectors the system knows about. Keyed by the tool id. */
const REGISTRY = new Map<string, ConnectorAdapter>();

/** Register a connector. A built-in (Phase B) does this at import time; a future package could too. */
export function registerConnector(adapter: ConnectorAdapter): void {
  REGISTRY.set(adapter.toolDef.id, adapter);
}

/** Look up a single adapter by its tool id. Returns undefined for an unknown/unregistered connector. */
export function getConnectorAdapter(id: string): ConnectorAdapter | undefined {
  return REGISTRY.get(id);
}

/**
 * All registered connector adapters, DETERMINISTICALLY SORTED BY tool id (iteration for output must not
 * depend on registration order — same discipline as `registeredEngines()`).
 */
export function registeredConnectors(): ConnectorAdapter[] {
  return [...REGISTRY.values()].sort((a, b) => (a.toolDef.id < b.toolDef.id ? -1 : a.toolDef.id > b.toolDef.id ? 1 : 0));
}
