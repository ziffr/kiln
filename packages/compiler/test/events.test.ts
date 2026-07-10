import { test } from "node:test";
import assert from "node:assert/strict";
import { compileCapabilities, commandNodeId, eventNodeId, aggregateNodeId, type CapabilityDoc, type DomainDoc } from "../src/index.ts";

const doc: CapabilityDoc = {
  version: "0.2",
  domain: "solar",
  capabilities: [{ id: "lead_management", name: "Lead Management" }],
};
const domain: DomainDoc = {
  version: "0.2",
  aggregates: [{ id: "lead", name: "Lead", owner: "lead_management" }],
  events: [{ id: "lead_qualified", name: "Lead Qualified", aggregate: "lead", trigger: "command" }],
  commands: [{ id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", capability: "lead_management", emits: ["lead_qualified"] }],
};

test("composes command + event nodes (authored, namespaced)", () => {
  const ir = compileCapabilities(doc, domain);
  const cmd = ir.nodes.find((n) => n.id === commandNodeId("qualify_lead"));
  const evt = ir.nodes.find((n) => n.id === eventNodeId("lead_qualified"));
  assert.equal(cmd?.type, "command");
  assert.equal(cmd?.origin, "authored");
  assert.equal(evt?.type, "event");
  assert.equal((evt?.meta as { trigger?: string }).trigger, "command");
});

test("composes issues/changes/emits/on edges", () => {
  const ir = compileCapabilities(doc, domain);
  const has = (from: string, to: string, type: string) => ir.edges.some((e) => e.from === from && e.to === to && e.type === type);
  assert.ok(has("lead_management", commandNodeId("qualify_lead"), "issues"));
  assert.ok(has(commandNodeId("qualify_lead"), aggregateNodeId("lead"), "changes"));
  assert.ok(has(commandNodeId("qualify_lead"), eventNodeId("lead_qualified"), "emits"));
  assert.ok(has(eventNodeId("lead_qualified"), aggregateNodeId("lead"), "on"));
});

test("no behaviour → no command/event nodes (back-compat)", () => {
  const ir = compileCapabilities(doc, { version: "0.1", aggregates: [{ id: "lead", name: "Lead", owner: "lead_management" }] });
  assert.ok(!ir.nodes.some((n) => n.type === "command" || n.type === "event"));
});
