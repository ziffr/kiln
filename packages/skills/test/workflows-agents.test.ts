import { test } from "node:test";
import assert from "node:assert/strict";
import { mockGenerateWorkflows, coerceWorkflows, mockGenerateAgents, coerceAgents } from "../src/index.ts";
import { validateWorkflows, validateAgents } from "@vbd/validation";
import type { CapabilityDoc, DomainDoc } from "@vbd/compiler";

const caps: CapabilityDoc = { version: "0.2", domain: "solar", capabilities: [{ id: "lead_management", name: "Lead Management" }] };
const domain: DomainDoc = { version: "0.3", aggregates: [{ id: "lead", name: "Lead", owner: "lead_management" }], commands: [{ id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", capability: "lead_management" }, { id: "convert_lead", name: "Convert Lead", aggregate: "lead", capability: "lead_management" }] };

test("mock workflow chains all commands, validates clean", () => {
  const w = mockGenerateWorkflows(domain);
  assert.ok(!validateWorkflows(w, ["qualify_lead", "convert_lead"]).some((f) => f.severity === "major" || f.severity === "blocker"));
});
test("coerceWorkflows canonicalizes step names to command ids", () => {
  const w = coerceWorkflows({ version: "0.1", workflows: [{ name: "Flow", steps: ["Qualify Lead", "Convert Lead"], derivedFrom: [{ anchor: "x" }] }] }, domain);
  assert.deepEqual(w.workflows[0].steps, ["qualify_lead", "convert_lead"]);
});
test("mock agent operates all capabilities; coerceAgents canonicalizes by name", () => {
  assert.ok(mockGenerateAgents(caps).agents[0].capabilities.includes("lead_management"));
  const a = coerceAgents({ version: "0.1", agents: [{ name: "Sales", capabilities: ["Lead Management"], goal: "g", derivedFrom: [{ anchor: "x" }] }] }, caps);
  assert.deepEqual(a.agents[0].capabilities, ["lead_management"]);
});
