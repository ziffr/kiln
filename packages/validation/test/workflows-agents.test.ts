import { test } from "node:test";
import assert from "node:assert/strict";
import { validateWorkflows, validateAgents } from "../src/index.ts";
import type { WorkflowsDoc, AgentsDoc } from "@vbd/compiler";

const g = { origin: "llm", derivedFrom: [{ anchor: "process" }] };
test("clean workflow (≥2 known steps) has no major findings", () => {
  const w: WorkflowsDoc = { version: "0.1", workflows: [{ id: "otc", name: "Order to Cash", steps: ["qualify_lead", "issue_invoice"], meta: g }] };
  assert.ok(!validateWorkflows(w, ["qualify_lead", "issue_invoice"]).some((f) => f.severity === "major" || f.severity === "blocker"));
});
test("WF2 flags an unknown step; WF5 flags <2 steps", () => {
  const w: WorkflowsDoc = { version: "0.1", workflows: [{ id: "x", name: "X", steps: ["ghost"], meta: g }] };
  const f = validateWorkflows(w, ["qualify_lead"]);
  assert.ok(f.some((x) => x.code === "WF2.step" && x.subjects.includes("ghost")));
  assert.ok(f.some((x) => x.code === "WF5.length"));
});
test("clean agent has no major findings; AG2 flags unknown capability", () => {
  const ok: AgentsDoc = { version: "0.1", agents: [{ id: "sa", name: "Sales Assistant", capabilities: ["lead_management"], goal: "sell", meta: g }] };
  assert.ok(!validateAgents(ok, ["lead_management"]).some((f) => f.severity === "major"));
  const bad: AgentsDoc = { version: "0.1", agents: [{ id: "x", name: "X", capabilities: ["ghost"], meta: g }] };
  assert.ok(validateAgents(bad, ["lead_management"]).some((f) => f.code === "AG2.capability"));
});
