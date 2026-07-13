/**
 * Built-in engine: Langdock — an AGENT RUNTIME target (SPEC-010 plugin seam). Scoped to agents ONLY:
 * instead of the generated Node agents runtime, it provisions the SAME agents into a governed Langdock
 * workspace via its Agent API (create → chat/completions) — EU-resident, audited. NOT a workflow-codegen
 * target (Langdock workflows are a visual builder with no importable definition; n8n owns react/sequence).
 *
 * App-level runtime (like serve-ui), not per-element: it emits only when the binding selects it
 * (`binding.agentRuntime === "langdock"`) AND the model has agents. The string-emitting generator lives in
 * ../langdock.ts (out of engines/ so this dir stays free of `node:*`); this file is the thin wrapper.
 */
import { langdockAdapter } from "../langdock.ts";
import type { Engine } from "../targets.ts";
import type { EngineAdapter } from "./registry.ts";

export const LANGDOCK: Engine = {
  id: "langdock",
  name: "Langdock",
  reach: "http",
  // operate = native (its Agent API runs goal-directed operators); react/sequence = partial (agents can be
  // woken by a webhook trigger, but Langdock workflows aren't a codegen target — n8n owns those).
  provides: { operate: "native", react: "partial", sequence: "partial", emit: "partial", store: "none", authorize: "none", "serve-ui": "none" },
};

export const langdockEngineAdapter: EngineAdapter = {
  engine: LANGDOCK,
  // App-level agent runtime: emit only when the binding selects Langdock AND the model has agents.
  applies: (ctx) => ctx.binding.agentRuntime === "langdock" && !!ctx.agents?.agents?.length,
  generate: (ctx) => ({ files: langdockAdapter(ctx.caps, ctx.domain, ctx.agents) }),
};
