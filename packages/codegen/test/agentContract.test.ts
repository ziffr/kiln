import { test } from "node:test";
import assert from "node:assert/strict";
import { agentContract, resolveAgentDefs, buildToolSchemas } from "../src/index.ts";
import type { CapabilityDoc, DomainDoc, AgentsDoc } from "@kiln/compiler";
import type { TriggersDoc } from "../src/triggers.ts";

// ── fixtures: a lead capability, a Lead entity with typed fields, two commands (one emitting), and an
//    agent that operates the capability. Plus a triggers doc routing an external + a time signal to it. ──
const caps: CapabilityDoc = {
  domain: "Solar",
  capabilities: [{ id: "leads", name: "Lead Management", purpose: "", outcomes: [] }],
} as unknown as CapabilityDoc;

const domain: DomainDoc = {
  aggregates: [{ id: "lead", name: "Lead", owner: "leads", attributes: [{ name: "email", type: "text" }, { name: "score", type: "number" }], references: [] }],
  commands: [
    { id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", capability: "leads", emits: ["lead_qualified"] },
    { id: "capture_lead", name: "Capture Lead", aggregate: "lead", capability: "leads", emits: ["lead_captured"] },
  ],
  events: [
    { id: "lead_qualified", name: "Lead Qualified", aggregate: "lead", trigger: "command" },
    { id: "lead_captured", name: "Lead Captured", aggregate: "lead", trigger: "command" },
    { id: "web_lead_arrived", name: "Web Lead Arrived", aggregate: "lead", trigger: "external" },
    { id: "nightly_sweep", name: "Nightly Sweep", aggregate: "lead", trigger: "time" },
  ],
} as unknown as DomainDoc;

const agents: AgentsDoc = {
  agents: [{ id: "lead_agent", name: "Lead Agent", capabilities: ["leads"], goal: "Qualify inbound leads" }],
} as unknown as AgentsDoc;

const triggers: TriggersDoc = {
  version: "0.1",
  triggers: [
    { id: "hook_web_lead_arrived", name: "Webhook: Web Lead Arrived", source: "webhook", path: "hook/web-lead-arrived", target: { kind: "agent", ref: "lead_agent", task: "A web lead arrived — qualify it." } },
    { id: "cron_nightly_sweep", name: "Schedule: Nightly Sweep", source: "schedule", cron: "0 * * * *", target: { kind: "agent", ref: "lead_agent", task: "Sweep open leads." } },
    { id: "hook_other", name: "Webhook: unrelated", source: "webhook", path: "hook/other", target: { kind: "notify", ref: "ops" } },
  ],
};

test("agentContract tools are byte-identical to buildToolSchemas (contract == run loop)", () => {
  const [def] = resolveAgentDefs(caps, domain, agents);
  const contract = agentContract(def, domain);
  assert.deepEqual(contract.tools, buildToolSchemas(def));
  // command tools are present (qualify_lead / capture_lead) + the notify router
  const names = contract.tools.map((t) => t.name);
  assert.ok(names.includes("qualify_lead"));
  assert.ok(names.includes("capture_lead"));
  assert.ok(names.includes("notify"));
});

test("agentContract output surfaces the emitted events + changed records", () => {
  const [def] = resolveAgentDefs(caps, domain, agents);
  const contract = agentContract(def, domain);
  assert.deepEqual([...contract.output.events].sort(), ["Lead Captured", "Lead Qualified"]);
  assert.deepEqual(contract.output.recordChanges, ["Lead"]);
});

test("agentContract context carries the owned entities + typed attributes", () => {
  const [def] = resolveAgentDefs(caps, domain, agents);
  const contract = agentContract(def, domain);
  assert.equal(contract.context.entities.length, 1);
  const lead = contract.context.entities[0];
  assert.equal(lead.name, "Lead");
  assert.deepEqual(lead.attributes, [{ name: "email", type: "text" }, { name: "score", type: "number" }]);
});

test("agentContract input carries the triggers ROUTED to this agent (not others) + a task", () => {
  const [def] = resolveAgentDefs(caps, domain, agents, undefined, undefined, undefined, triggers);
  const contract = agentContract(def, domain, triggers);
  // the notify-routed 'hook_other' must NOT appear; the two agent-routed signals must.
  assert.equal(contract.input.triggers.length, 2);
  const names = contract.input.triggers.map((t) => t.name);
  assert.ok(names.includes("Webhook: Web Lead Arrived"));
  assert.ok(names.includes("Schedule: Nightly Sweep"));
  assert.deepEqual(contract.input.triggers.map((t) => t.kind).sort(), ["schedule", "webhook"]);
  assert.match(contract.input.task, /web lead arrived/i);
});

test("agentContract input falls back to the def's own routed triggers when no triggers arg", () => {
  const [def] = resolveAgentDefs(caps, domain, agents, undefined, undefined, undefined, triggers);
  const contract = agentContract(def, domain); // no explicit triggers → use def.triggers
  assert.equal(contract.input.triggers.length, 2);
});

test("agentContract input is empty (default task) when no triggers exist", () => {
  const [def] = resolveAgentDefs(caps, domain, agents);
  const contract = agentContract(def, domain);
  assert.equal(contract.input.triggers.length, 0);
  assert.match(contract.input.task, /Work toward your goal/);
});

test("resolveAgentDefs folds the routed triggers onto the def (backward-compatible when omitted)", () => {
  const withoutTriggers = resolveAgentDefs(caps, domain, agents)[0];
  assert.deepEqual(withoutTriggers.triggers, []); // optional param omitted → empty, no crash

  const [def] = resolveAgentDefs(caps, domain, agents, undefined, undefined, undefined, triggers);
  assert.equal(def.triggers?.length, 2);
  for (const tr of def.triggers ?? []) {
    assert.equal(tr.target.kind, "agent");
    assert.equal(tr.target.ref, "lead_agent");
  }
});
