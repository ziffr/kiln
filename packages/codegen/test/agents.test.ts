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

test("agentsAdapter emits a definition per agent with command tools + a notify tool + relevant comms", () => {
  const files = agentsAdapter(caps, domain, agents, comms);
  assert.ok(files["agents/lead_agent.json"] && files["agents/README.md"]);
  const def = JSON.parse(files["agents/lead_agent.json"]);
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
