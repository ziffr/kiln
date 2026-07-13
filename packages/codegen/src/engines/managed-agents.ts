/**
 * Built-in engine: Anthropic Managed Agents — a FIRST-PARTY agent-runtime target (SPEC-010 seam). Scoped
 * to agents: provisions the model's agents as managed Agents (create once, run in Sessions on Anthropic's
 * orchestration + hosted container). Best Claude fidelity; no third-party dependency. NOT a workflow
 * target (n8n owns react/sequence). App-level runtime (like serve-ui): emits only when the binding selects
 * it (`binding.agentRuntime === "managed-agents"`) AND the model has agents. Thin wrapper; the string-
 * emitting generator lives in ../managedAgents.ts (out of engines/ so this dir stays free of `node:*`).
 */
import { managedAgentsAdapter } from "../managedAgents.ts";
import type { Engine } from "../targets.ts";
import type { EngineAdapter } from "./registry.ts";

export const MANAGED_AGENTS: Engine = {
  id: "managed-agents",
  name: "Anthropic Managed Agents",
  reach: "http",
  provides: { operate: "native", react: "partial", sequence: "partial", emit: "partial", store: "none", authorize: "none", "serve-ui": "none" },
};

export const managedAgentsEngineAdapter: EngineAdapter = {
  engine: MANAGED_AGENTS,
  applies: (ctx) => ctx.binding.agentRuntime === "managed-agents" && !!ctx.agents?.agents?.length,
  generate: (ctx) => ({ files: managedAgentsAdapter(ctx.caps, ctx.domain, ctx.agents) }),
};
