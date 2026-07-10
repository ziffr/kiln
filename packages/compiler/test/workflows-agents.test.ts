import { test } from "node:test";
import assert from "node:assert/strict";
import { compileCapabilities, workflowNodeId, agentNodeId, commandNodeId, type CapabilityDoc, type DomainDoc, type WorkflowsDoc, type AgentsDoc } from "../src/index.ts";

const doc: CapabilityDoc = { version: "0.2", domain: "solar", capabilities: [{ id: "lead_management", name: "Lead" }] };
const domain: DomainDoc = { version: "0.3", aggregates: [{ id: "lead", name: "Lead", owner: "lead_management" }], commands: [{ id: "qualify_lead", name: "Qualify", aggregate: "lead", capability: "lead_management" }] };
const workflows: WorkflowsDoc = { version: "0.1", workflows: [{ id: "otc", name: "OTC", steps: ["qualify_lead"] }] };
const agents: AgentsDoc = { version: "0.1", agents: [{ id: "sa", name: "SA", capabilities: ["lead_management"] }] };

test("composes workflow node + step edge and agent node + operates edge", () => {
  const ir = compileCapabilities(doc, domain, undefined, undefined, workflows, agents);
  assert.ok(ir.nodes.some((n) => n.id === workflowNodeId("otc") && n.type === "workflow"));
  assert.ok(ir.edges.some((e) => e.from === workflowNodeId("otc") && e.to === commandNodeId("qualify_lead") && e.type === "step"));
  assert.ok(ir.nodes.some((n) => n.id === agentNodeId("sa") && n.type === "agent"));
  assert.ok(ir.edges.some((e) => e.from === agentNodeId("sa") && e.to === "lead_management" && e.type === "operates"));
});
