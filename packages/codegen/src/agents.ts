/**
 * @vbd/codegen/agents — wire agents to concrete TOOLS.
 *
 * An agent (SPEC-008) is a goal + the capabilities it operates. That only becomes real when its tools
 * are the actual invokable actions. This resolves, per agent, the tools it can use:
 *   • commands — the domain operations on the entities its capabilities own (call the spine endpoint),
 *   • notify   — a general "message a person/channel" tool (the human-in-the-loop router:
 *                "qualify the lead, or email a human to qualify it"),
 *   • comm actions — the pre-built templated notifications relevant to its entities.
 *
 * Emits an agent definition per agent (goal + tools with concrete invocation specs) that an agent
 * runtime (Claude Agent SDK, LangGraph, …) loads. Commands are the universal action surface — the UI
 * clicks them, workflows sequence them, agents choose them. Pure and isomorphic.
 */

import { slug } from "@vbd/ir";
import { attributeSpecs, type CapabilityDoc, type DomainDoc, type AgentsDoc } from "@vbd/compiler";
import type { CommunicationsDoc } from "./comms.ts";

const CREATE_VERB = /^(create|add|register|open|new|capture|issue|request|submit|plan|record)_/;

export type AgentToolKind = "command" | "notify" | "email" | "slack" | "pdf";

export interface AgentTool {
  name: string;
  kind: AgentToolKind;
  description: string;
  invoke: Record<string, unknown>;
  input?: string[];
}

export interface AgentDef {
  id: string;
  name: string;
  goal: string;
  capabilities: string[];
  tools: AgentTool[];
}

function commandTool(c: { id: string; name?: string; aggregate: string; emits?: string[] }, fields: string[], evName: Map<string, string>): AgentTool {
  const res = `${slug(c.aggregate)}s`;
  const action = slug(c.name || c.id);
  const create = CREATE_VERB.test(`${action}_`);
  const emits = (c.emits ?? []).map((e) => evName.get(e) ?? e);
  return {
    name: slug(c.id),
    kind: "command",
    description: `${c.name || c.id} (on ${c.aggregate})${emits.length ? ` — emits ${emits.join(", ")}` : ""}`,
    invoke: { method: "POST", url: `{{SPINE_URL}}${create ? `/${res}` : `/${res}/{id}/${action}`}` },
    input: fields,
  };
}

/** Resolve each agent's toolset and emit agent definitions + a runtime README. */
export function agentsAdapter(caps: CapabilityDoc, domain: DomainDoc, agents?: AgentsDoc, comms?: CommunicationsDoc): Record<string, string> {
  if (!agents?.agents?.length) return {};
  const evName = new Map((domain.events ?? []).map((e) => [e.id, e.name || e.id]));
  const capName = new Map(caps.capabilities.map((c) => [c.id, c.name || c.id]));
  const files: Record<string, string> = {};
  const defs: AgentDef[] = [];

  for (const a of agents.agents) {
    const agentCaps = new Set(a.capabilities ?? []);
    const ownedEntities = new Set(domain.aggregates.filter((x) => agentCaps.has(x.owner)).map((x) => x.id));

    const tools: AgentTool[] = [];
    for (const c of domain.commands ?? []) {
      if (!ownedEntities.has(c.aggregate)) continue;
      const agg = domain.aggregates.find((x) => x.id === c.aggregate);
      tools.push(commandTool(c, attributeSpecs(agg ?? { attributes: [] }).map((f) => slug(f.name)), evName));
    }
    // the human-in-the-loop router: send a message to a person/channel (e.g. route a lead for approval).
    tools.push({ name: "notify", kind: "notify", description: "Send an email or Slack message to a person or channel — e.g. route to a human for a decision, then continue when they respond.", invoke: { channels: ["email", "slack"], via: "n8n" } });
    // pre-built notifications relevant to this agent's entities.
    for (const cm of comms?.actions ?? []) {
      if (!ownedEntities.has(cm.entity) || cm.channel === "pdf") continue;
      tools.push({ name: slug(cm.id), kind: cm.channel, description: `${cm.name} → ${cm.recipient}`, invoke: { channel: cm.channel, on: cm.on, template: `templates/${cm.id}.md` } });
    }

    defs.push({ id: slug(a.id), name: a.name || a.id, goal: a.goal || "", capabilities: (a.capabilities ?? []).map((c) => capName.get(c) ?? c), tools });
  }

  for (const d of defs) files[`agents/${d.id}.json`] = JSON.stringify(d, null, 2);
  files["agents/README.md"] = `# Agents

Goal-driven operators. Each \`<agent>.json\` is a definition an agent runtime (e.g. the Claude Agent SDK)
loads: a **goal** and its **tools**. Commands are the universal action surface — the same spine endpoints
the UI and workflows call; the agent *chooses* which to call.

## Tool kinds
- **command** — a domain operation. \`invoke.url\` is the spine endpoint (set \`SPINE_URL\`); POST the
  \`input\` fields. Running it changes state and emits the command's events (which may fire comms).
- **notify** — send an email/Slack message to a person or channel. This is the human-in-the-loop router:
  the agent can email a human for a decision and continue when the resulting event arrives.
- **email/slack** — a pre-built templated notification (see \`templates/\`).

## Wiring a runtime (sketch)
Give the LLM the agent's \`goal\`, expose each tool (command tools → an HTTP call to \`SPINE_URL\`; notify
→ your email/Slack integration or the n8n webhook), and run the agent loop. Agent-vs-workflow: use an
agent when the path is open-ended/judgement-heavy; a workflow when the steps are fixed.
`;
  return files;
}
