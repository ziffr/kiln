import { test } from "node:test";
import assert from "node:assert/strict";
import { mockOrchestration, applyOrchestration, coerceOrchestration, generateOrchestration } from "../src/orchestration.ts";
import type { LlmProvider, LlmRequest, LlmResult } from "../src/types.ts";
import type { WorkflowsDoc } from "@vbd/compiler";

const workflows: WorkflowsDoc = {
  version: "0.1",
  workflows: [
    { id: "order_to_cash", name: "Order to Cash", steps: ["issue_invoice", "record_payment", "schedule_install"] },
    { id: "qualify_lead", name: "Qualify Lead", steps: ["capture_lead", "score_lead", "convert_lead"] },
    { id: "handle_signature", name: "Collect Signature", steps: ["request_signature"] },
  ],
};

test("mockOrchestration: fixed multi-step → workflow; judgement/single → agent", () => {
  const doc = mockOrchestration(workflows);
  const byId = new Map(doc.decisions.map((d) => [d.id, d]));
  assert.equal(byId.get("order_to_cash")!.mode, "workflow"); // deterministic pipeline
  assert.equal(byId.get("qualify_lead")!.mode, "agent"); // "qualify" signals judgement
  assert.equal(byId.get("handle_signature")!.mode, "agent"); // single-step → a decision
  for (const d of doc.decisions) { assert.ok(d.rationale, "has a rationale"); assert.ok(d.confidence >= 0 && d.confidence <= 1); }
});

test("applyOrchestration folds the decision onto WorkflowInput.mode (source of truth)", () => {
  const applied = applyOrchestration(workflows, mockOrchestration(workflows));
  const byId = new Map(applied.workflows.map((w) => [w.id, w]));
  assert.equal(byId.get("order_to_cash")!.mode, "workflow");
  assert.equal(byId.get("qualify_lead")!.mode, "agent");
  // no decision → defaults to workflow (codegen stays total)
  const partial = applyOrchestration(workflows, { decisions: [{ id: "qualify_lead", name: "Qualify Lead", mode: "agent", rationale: "", confidence: 1 }] });
  assert.equal(partial.workflows.find((w) => w.id === "order_to_cash")!.mode, "workflow");
});

test("coerceOrchestration maps by name, clamps confidence, and defaults missing decisions", () => {
  const doc = coerceOrchestration({ version: "0.1", decisions: [{ name: "Order to Cash", mode: "agent", confidence: 5 }] }, workflows);
  const byId = new Map(doc.decisions.map((d) => [d.id, d]));
  assert.equal(byId.get("order_to_cash")!.mode, "agent");
  assert.equal(byId.get("order_to_cash")!.confidence, 1); // clamped
  // the two un-ruled workflows get a defaulted workflow decision
  assert.equal(byId.get("qualify_lead")!.mode, "workflow");
  assert.equal(doc.decisions.length, 3);
});

test("generateOrchestration returns modes folded onto the workflows", async () => {
  const provider: LlmProvider = {
    name: "test",
    async complete(_req: LlmRequest): Promise<LlmResult> {
      const json = { version: "0.1", decisions: [{ name: "Order to Cash", mode: "workflow" }, { name: "Qualify Lead", mode: "agent" }] };
      return { json, raw: JSON.stringify(json), provider: "test" };
    },
  };
  const { doc, workflows: out } = await generateOrchestration(workflows, provider);
  assert.equal(doc.decisions.find((d) => d.id === "qualify_lead")!.mode, "agent");
  assert.equal(out.workflows.find((w) => w.id === "qualify_lead")!.mode, "agent");
  assert.equal(out.workflows.find((w) => w.id === "order_to_cash")!.mode, "workflow");
});
