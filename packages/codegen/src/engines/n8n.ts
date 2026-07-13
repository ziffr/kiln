/**
 * Built-in engine: n8n — a cross-system orchestrator (its whole point is reacting + sequencing across
 * services). The one built-in whose output is WORKFLOWS, not files: `generate` returns
 * `{ files: {}, workflows }`. Wraps the existing `n8nAdapter` (kept in targets.ts) byte-for-byte —
 * the `undefined` baseUrl preserves the adapter's default (`http://spine.local/api`) (SPEC-010 Phase 1).
 */
import { n8nAdapter, type Engine } from "../targets.ts";
import type { EngineAdapter } from "./registry.ts";

export const N8N: Engine = {
  id: "n8n",
  name: "n8n",
  reach: "http",
  provides: { react: "native", sequence: "native", emit: "partial", operate: "partial", store: "none", authorize: "none", "serve-ui": "none" },
};

export const n8nEngineAdapter: EngineAdapter = {
  engine: N8N,
  generate: (ctx) => ({ files: {}, workflows: n8nAdapter(ctx.resolved, ctx.domain, ctx.workflows, undefined, ctx.services) }),
};
