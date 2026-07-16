/**
 * Built-in engine: n8n — a cross-system orchestrator (its whole point is reacting + sequencing across
 * services). The one built-in whose output is WORKFLOWS, not files: `generate` returns
 * `{ files: {}, workflows }`. Wraps the existing `n8nAdapter` (kept in targets.ts).
 *
 * SPEC-012 Phase 2b — SEAM-URL AUTO-WIRING: the n8n HTTP nodes call the spine's command API. When the
 * spine (`node` engine) is placed remotely, the nodes target the spine's reach var via an n8n env
 * expression (`={{$env.SPINE_URL}}/api`) instead of the local default. When the spine is local, baseUrl
 * stays `undefined` → the adapter's default `http://spine.local/api` — byte-for-byte unchanged.
 */
import { n8nAdapter, resolvePlacement, type Engine } from "../targets.ts";
import type { EngineAdapter } from "./registry.ts";

export const N8N: Engine = {
  id: "n8n",
  name: "n8n",
  reach: "http",
  provides: { react: "native", sequence: "native", emit: "partial", operate: "partial", store: "none", authorize: "none", "serve-ui": "none" },
};

export const n8nEngineAdapter: EngineAdapter = {
  engine: N8N,
  generate: (ctx) => {
    const spine = resolvePlacement(ctx.binding, "node");
    const baseUrl = spine.mode !== "local" ? `={{$env.${spine.urlEnv ?? "SPINE_URL"}}}/api` : undefined;
    return { files: {}, workflows: n8nAdapter(ctx.resolved, ctx.domain, ctx.workflows, baseUrl, ctx.services) };
  },
};
