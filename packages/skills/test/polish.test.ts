/**
 * polishComponents — the automated UX pass. Verifies it applies a designer's improved view spec, stays
 * build-safe (drops any field the entity doesn't have), collects the per-screen rationale, and converges
 * (the bounded loop stops when the agent reports `done`). Uses a stub provider — no real model.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { polishComponents } from "../src/index.ts";
import type { LlmProvider } from "../src/types.ts";

const caps = { version: "0.2", domain: "solar", capabilities: [{ id: "lead_management", name: "Lead Management" }] };
const domain = {
  version: "0.1",
  aggregates: [{
    id: "lead", name: "Lead", owner: "lead_management", references: [],
    attributes: [
      { name: "leadId", type: "text" }, { name: "customerName", type: "text" },
      { name: "amount", type: "money" }, { name: "status", type: "text" }, { name: "notes", type: "text" },
    ],
  }],
  commands: [{ id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", capability: "lead_management", emits: [] }],
  events: [],
};

/** A stub senior designer: hides the raw id, badges status, formats money, sets a title — and reports done. */
function stubDesigner(): LlmProvider {
  return {
    name: "stub",
    async complete() {
      return {
        provider: "stub", raw: "",
        json: {
          description: "Manage sales leads.",
          titleField: "customerName",
          columns: [
            { field: "customerName", format: "text" },
            { field: "status", format: "badge" },
            { field: "amount", format: "money" },
            { field: "bogusField", format: "text" }, // not a real field → must be dropped (build-safe)
          ],
          formFields: ["customerName", "amount", "status", "notes"],
          improvements: ["Hid raw leadId column", "Badged status", "Formatted amount as money", "Set customerName as title"],
          done: true,
        },
      };
    },
  };
}

test("polishComponents applies the rubric spec and stays build-safe", async () => {
  const res = await polishComponents(caps as never, domain as never, undefined, {}, stubDesigner());
  const v = res.views["lead"];
  assert.ok(v, "produced a view for the entity");
  assert.equal(v.titleField, "customerName");
  const cols = v.columns.map((c) => c.field);
  assert.ok(!cols.includes("leadId"), "raw id hidden");
  assert.ok(!cols.includes("bogusField"), "non-existent field dropped → build-safe");
  assert.equal(v.columns.find((c) => c.field === "status")?.format, "badge");
  assert.equal(v.columns.find((c) => c.field === "amount")?.format, "money");
  assert.ok((res.improvements["lead"] ?? []).length >= 3, "per-screen rationale collected");
});

test("polishComponents converges: done=true stops the bounded loop after one round", async () => {
  let calls = 0;
  const once: LlmProvider = {
    name: "once",
    async complete() {
      calls += 1;
      return { provider: "once", raw: "", json: { columns: [{ field: "customerName", format: "text" }], formFields: ["customerName"], improvements: ["tidy"], done: true } };
    },
  };
  await polishComponents(caps as never, domain as never, undefined, {}, once, { rounds: 3 });
  assert.equal(calls, 1, "done=true → no further rounds even with rounds:3");
});
