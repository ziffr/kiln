import { test } from "node:test";
import assert from "node:assert/strict";
import { compileCapabilities, policyNodeId, eventNodeId, commandNodeId, type CapabilityDoc, type DomainDoc } from "../src/index.ts";

const doc: CapabilityDoc = { version: "0.2", domain: "solar", capabilities: [{ id: "billing", name: "Billing" }, { id: "install", name: "Install" }] };
const domain: DomainDoc = {
  version: "0.3",
  aggregates: [{ id: "invoice", name: "Invoice", owner: "billing" }, { id: "work_order", name: "Work Order", owner: "install" }],
  events: [{ id: "invoice_paid", name: "Invoice Paid", aggregate: "invoice", trigger: "command" }],
  commands: [{ id: "schedule_installation", name: "Schedule Installation", aggregate: "work_order", capability: "install", emits: [] }],
  policies: [{ id: "p1", name: "When paid, schedule install", on: "invoice_paid", then: "schedule_installation" }],
};

test("composes a policy node + when/then edges", () => {
  const ir = compileCapabilities(doc, domain);
  const pol = ir.nodes.find((n) => n.id === policyNodeId("p1"));
  assert.equal(pol?.type, "policy");
  assert.equal(pol?.origin, "authored");
  const has = (from: string, to: string, type: string) => ir.edges.some((e) => e.from === from && e.to === to && e.type === type);
  assert.ok(has(eventNodeId("invoice_paid"), policyNodeId("p1"), "when"));
  assert.ok(has(policyNodeId("p1"), commandNodeId("schedule_installation"), "then"));
});

test("no policies → no policy nodes (back-compat)", () => {
  const ir = compileCapabilities(doc, { ...domain, policies: undefined });
  assert.ok(!ir.nodes.some((n) => n.type === "policy"));
});
