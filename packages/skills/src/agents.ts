import { PROMPTS } from "./prompts.generated.ts";
/**
 * Agent generator (SPEC-008). Mock + LLM `AgentModeler`. An agent is an autonomous operator that
 * runs a set of capabilities toward a goal (a "Sales Assistant", "Dispatch Coordinator").
 */

import { slug } from "@kiln/ir";
import type { CapabilityDoc, AgentInput, AgentsDoc } from "@kiln/compiler";
import { validateAgents, type Finding } from "@kiln/validation";
import type { LlmProvider, LlmRequest } from "./types.ts";

const grounded = (anchor: string) => ({ origin: "mock", derivedFrom: [{ anchor }] });

/** Offline default: one autonomous operator over all capabilities. */
export function mockGenerateAgents(caps: CapabilityDoc): AgentsDoc {
  const ids = caps.capabilities.map((c) => c.id);
  if (ids.length === 0) return { version: "0.1", agents: [] };
  return { version: "0.1", agents: [{ id: "operations_agent", name: "Operations Agent", capabilities: ids, goal: "Run the business end to end", instructions: "You are the Operations Agent. Pursue the goal using your tools. Act on clear cases; when a decision needs a human, use the notify tool to route it and continue when they respond. Never fabricate data.", meta: grounded("all-capabilities") }] };
}

export const AGENT_SYSTEM_PROMPT = PROMPTS["agents"];

export function renderAgentUserPrompt(caps: CapabilityDoc): string {
  const lines = ["# Capabilities (ids for an agent to operate)", ""];
  for (const c of caps.capabilities) lines.push(`- ${c.id} — ${c.name}: ${c.purpose ?? ""}`);
  lines.push("", "Return the autonomous agents that could run this business, each with a goal.");
  return lines.join("\n");
}

export const AGENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["version", "agents"],
  properties: {
    version: { type: "string" },
    agents: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "capabilities"],
        properties: {
          name: { type: "string" },
          goal: { type: "string" },
          instructions: { type: "string", description: "the agent's operating instructions / system prompt — how it should behave, when to act vs escalate" },
          capabilities: { type: "array", items: { type: "string" } },
          derivedFrom: { type: "array", items: { type: "object", additionalProperties: false, properties: { anchor: { type: "string" } } } },
        },
      },
    },
  },
} as const;

export function buildAgentRequest(caps: CapabilityDoc): LlmRequest {
  return { system: AGENT_SYSTEM_PROMPT, user: renderAgentUserPrompt(caps), schema: AGENT_SCHEMA, context: caps };
}

export function coerceAgents(json: unknown, caps: CapabilityDoc): AgentsDoc {
  const bySlug = new Map<string, string>();
  for (const c of caps.capabilities) { bySlug.set(slug(c.id), c.id); bySlug.set(slug(c.name), c.id); }
  const obj = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const raw = Array.isArray(obj.agents) ? obj.agents : [];
  const withAnchor = (df: unknown, f: string): Array<Record<string, unknown>> => {
    const arr = Array.isArray(df) ? (df as Array<Record<string, unknown>>) : [];
    return arr.some((d) => typeof d?.anchor === "string" && (d.anchor as string).trim()) ? arr : [{ anchor: f }];
  };
  const seen = new Set<string>();
  const agents: AgentInput[] = [];
  for (const r of raw) {
    const o = r as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name : "";
    let id = slug(name) || `agent_${agents.length + 1}`;
    while (seen.has(id)) id = `${id}_${agents.length + 1}`;
    seen.add(id);
    const capabilities = (Array.isArray(o.capabilities) ? (o.capabilities as string[]) : []).map((c) => bySlug.get(slug(c)) ?? c);
    agents.push({ id, name, goal: typeof o.goal === "string" ? o.goal : "", instructions: typeof o.instructions === "string" ? o.instructions : undefined, capabilities, meta: { origin: "llm", derivedFrom: withAnchor(o.derivedFrom, name || id) } });
  }
  return { version: typeof obj.version === "string" ? obj.version : "0.1", agents };
}

export interface AgentGenerationResult {
  doc: AgentsDoc;
  findings: Finding[];
  provider: string;
  repaired: boolean;
}

export async function generateAgents(caps: CapabilityDoc, provider: LlmProvider, feedback?: string): Promise<AgentGenerationResult> {
  const capIds = caps.capabilities.map((c) => c.id);
  const isRepairable = (f: Finding): boolean => f.severity === "blocker" || f.code.startsWith("AG2.");
  const req = buildAgentRequest(caps);
  if (feedback) req.user += `\n\n${feedback}`;
  let res = await provider.complete(req);
  let doc = coerceAgents(res.json, caps);
  let findings = validateAgents(doc, capIds);
  let repaired = false;
  if (findings.some(isRepairable)) {
    repaired = true;
    const bad = findings.filter(isRepairable).map((f) => f.subjects.join("/")).join(", ");
    res = await provider.complete({ ...req, user: `${req.user}\n\nThe previous output referenced unknown capabilities (${bad}). Use only the listed capability ids. Return corrected JSON only.` });
    doc = coerceAgents(res.json, caps);
    findings = validateAgents(doc, capIds);
  }
  return { doc, findings, provider: res.provider, repaired };
}
