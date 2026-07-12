import { test } from "node:test";
import assert from "node:assert/strict";
import { agentsAdapter } from "../src/index.ts";
import type { CapabilityDoc, DomainDoc, AgentsDoc } from "@vbd/compiler";
import type { CommunicationsDoc } from "../src/comms.ts";

const caps: CapabilityDoc = { domain: "Solar", capabilities: [{ id: "leads", name: "Lead Management", purpose: "", outcomes: [] }] } as unknown as CapabilityDoc;
const domain: DomainDoc = {
  aggregates: [{ id: "lead", name: "Lead", owner: "leads", attributes: [{ name: "email", type: "text" }], references: [] }],
  commands: [
    { id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", emits: ["lead_qualified"] },
    { id: "capture_lead", name: "Capture Lead", aggregate: "lead", emits: ["lead_captured"] },
  ],
  events: [{ id: "lead_qualified", name: "Lead Qualified", aggregate: "lead", trigger: "command" }],
} as unknown as DomainDoc;
const agents: AgentsDoc = { agents: [{ id: "lead_agent", name: "Lead Agent", capabilities: ["leads"], goal: "Qualify inbound leads" }] } as unknown as AgentsDoc;
const comms: CommunicationsDoc = { actions: [{ id: "slack_lead_qualified", name: "Slack on qualified", channel: "slack", on: "lead_qualified", entity: "lead", recipient: "#sales", subject: "", template: "" }] };

test("agentsAdapter emits a runnable runtime + a definition per agent with wired tools", () => {
  const files = agentsAdapter(caps, domain, agents, comms);
  // the runtime — provider-flexible (Anthropic native + OpenRouter)
  for (const p of ["agents/package.json", "agents/src/runner.ts", "agents/src/run.ts", "agents/src/server.ts", "agents/src/tools.ts", "agents/src/def.ts", "agents/src/providers/anthropic.ts", "agents/src/providers/openrouter.ts", "agents/tsconfig.json", "agents/README.md"]) assert.ok(files[p], `${p} missing`);
  assert.match(files["agents/package.json"], /@anthropic-ai\/sdk/);
  assert.match(files["agents/package.json"], /"openai"/);
  // HTTP mode — a webhook/trigger can WAKE an agent via POST /run
  assert.match(files["agents/package.json"], /"express"/);
  assert.match(files["agents/package.json"], /"serve":/);
  assert.match(files["agents/src/server.ts"], /\/run/);
  assert.match(files["agents/src/server.ts"], /runAgent/);
  assert.match(files["agents/src/run.ts"], /export async function runAgent/);
  assert.match(files["agents/src/runner.ts"], /runAgent/); // CLI reuses the shared helper
  assert.match(files["agents/src/providers/anthropic.ts"], /client\.messages\.create/);
  assert.match(files["agents/src/providers/openrouter.ts"], /chat\.completions\.create/);
  assert.match(files["agents/src/run.ts"], /openrouter|anthropic/);
  // the behaviour playbook (the "HOW") — a markdown file the runtime loads as the system prompt
  assert.ok(files["agents/behaviours/lead_agent.md"], "behaviour playbook");
  assert.match(files["agents/behaviours/lead_agent.md"], /How you work/);
  assert.match(files["agents/behaviours/lead_agent.md"], /edit it to change HOW/i);
  assert.match(files["agents/src/run.ts"], /behaviours/); // runtime loads it
  // the definition
  assert.ok(files["agents/definitions/lead_agent.json"]);
  const def = JSON.parse(files["agents/definitions/lead_agent.json"]);
  assert.equal(def.goal, "Qualify inbound leads");
  const toolNames = def.tools.map((t: { name: string }) => t.name);
  // its capability's commands are tools
  assert.ok(toolNames.includes("qualify_lead") && toolNames.includes("capture_lead"));
  // a command tool points at the spine endpoint
  const qualify = def.tools.find((t: { name: string }) => t.name === "qualify_lead");
  assert.equal(qualify.kind, "command");
  assert.match(qualify.invoke.url, /\{\{SPINE_URL\}\}\/leads\/\{id\}\/qualify_lead/);
  // the human-in-the-loop notify tool (qualify itself OR email a human)
  assert.ok(def.tools.some((t: { kind: string }) => t.kind === "notify"));
  // the relevant pre-built comm is a tool
  assert.ok(def.tools.some((t: { name: string }) => t.name === "slack_lead_qualified"));
});

test("no agents → nothing emitted", () => {
  assert.equal(Object.keys(agentsAdapter(caps, domain, { agents: [] } as unknown as AgentsDoc)).length, 0);
});
