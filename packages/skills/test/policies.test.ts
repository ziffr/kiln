import { test } from "node:test";
import assert from "node:assert/strict";
import { mockGeneratePolicies, generatePolicies, coercePolicies, type LlmProvider } from "../src/index.ts";
import { validatePolicies } from "@kiln/validation";
import type { DomainDoc } from "@kiln/compiler";

const domain: DomainDoc = {
  version: "0.3",
  aggregates: [{ id: "invoice", name: "Invoice", owner: "billing" }, { id: "work_order", name: "Work Order", owner: "install" }],
  events: [{ id: "invoice_paid", name: "Invoice Paid", aggregate: "invoice", trigger: "command" }],
  commands: [{ id: "schedule_installation", name: "Schedule Installation", aggregate: "work_order", capability: "install", emits: [] }],
};

test("mock wires a hand-off event to a start-command on another entity, cleanly", () => {
  const d = mockGeneratePolicies(domain);
  assert.ok((d.policies ?? []).length >= 1);
  const p = d.policies![0];
  assert.equal(p.on, "invoice_paid");
  assert.equal(p.then, "schedule_installation");
  assert.ok(!validatePolicies(d, []).some((f) => f.severity === "blocker" || f.severity === "major"));
});

test("coerce canonicalizes on/then by name and dedupes by (on,then)", () => {
  const d = coercePolicies(
    { version: "0.3", policies: [
      { name: "A", on: "Invoice Paid", then: "Schedule Installation", derivedFrom: [{ anchor: "x" }] },
      { name: "dup", on: "invoice_paid", then: "schedule_installation" }, // same (on,then) → deduped
    ] },
    domain,
  );
  assert.equal((d.policies ?? []).length, 1);
  assert.equal(d.policies![0].on, "invoice_paid");
  assert.equal(d.policies![0].then, "schedule_installation");
});

test("generatePolicies validates clean and repairs a dangling reference", async () => {
  let call = 0;
  const provider: LlmProvider = {
    name: "anthropic:test",
    complete: async () => {
      call++;
      const policies = call === 1
        ? [{ name: "Bad", on: "ghost", then: "schedule_installation", derivedFrom: [{ anchor: "x" }] }]
        : [{ name: "Paid → Schedule", on: "invoice_paid", then: "schedule_installation", derivedFrom: [{ anchor: "delivery" }] }];
      return { provider: "anthropic:test", raw: "", json: { version: "0.3", policies } };
    },
  };
  const res = await generatePolicies(domain, ["billing", "install"], provider);
  assert.equal(res.repaired, true);
  assert.ok(!res.findings.some((f) => f.code.startsWith("PL2.") || f.code.startsWith("PL3.")));
  assert.equal(res.doc.policies![0].on, "invoice_paid");
});
