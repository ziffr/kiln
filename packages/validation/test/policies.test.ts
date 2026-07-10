import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePolicies } from "../src/index.ts";
import type { DomainDoc } from "@vbd/compiler";

const grounded = { origin: "llm", derivedFrom: [{ anchor: "flow" }] };
const base: DomainDoc = {
  version: "0.3",
  aggregates: [{ id: "invoice", name: "Invoice", owner: "billing" }, { id: "work_order", name: "Work Order", owner: "install" }],
  events: [
    { id: "invoice_paid", name: "Invoice Paid", aggregate: "invoice", trigger: "command" },
    { id: "install_done", name: "Installation Done", aggregate: "work_order", trigger: "command" },
  ],
  commands: [
    { id: "schedule_installation", name: "Schedule Installation", aggregate: "work_order", capability: "install", emits: ["install_done"] },
    { id: "close_invoice", name: "Close Invoice", aggregate: "invoice", capability: "billing", emits: ["invoice_paid"] },
  ],
  policies: [{ id: "p_cross", name: "Paid → Schedule", on: "invoice_paid", then: "schedule_installation", meta: grounded }],
};

test("a clean cross-entity policy has no blocking/major findings", () => {
  assert.ok(!validatePolicies(base, []).some((f) => f.severity === "blocker" || f.severity === "major"));
});

test("PL2 flags a policy triggering on an unknown event", () => {
  const d: DomainDoc = { ...base, policies: [{ id: "p", name: "X", on: "ghost", then: "schedule_installation", meta: grounded }] };
  assert.ok(validatePolicies(d, []).some((f) => f.code === "PL2.trigger" && f.subjects.includes("ghost")));
});

test("PL3 flags a policy reacting with an unknown command", () => {
  const d: DomainDoc = { ...base, policies: [{ id: "p", name: "X", on: "invoice_paid", then: "ghost", meta: grounded }] };
  assert.ok(validatePolicies(d, []).some((f) => f.code === "PL3.reaction" && f.subjects.includes("ghost")));
});

test("PL4 flags duplicate policy ids", () => {
  const d: DomainDoc = { ...base, policies: [base.policies![0], { ...base.policies![0], name: "dup" }] };
  assert.ok(validatePolicies(d, []).some((f) => f.code === "PL4.unique"));
});

test("PL5 flags an llm policy with no grounded anchor", () => {
  const d: DomainDoc = { ...base, policies: [{ id: "p", name: "X", on: "invoice_paid", then: "schedule_installation", meta: { origin: "llm", derivedFrom: [{ event: "invoice_paid" }] } }] };
  assert.ok(validatePolicies(d, []).some((f) => f.code === "PL5.provenance"));
});

test("PL6 warns on a reaction within the same entity (redundant self-loop)", () => {
  const d: DomainDoc = { ...base, policies: [{ id: "p", name: "X", on: "invoice_paid", then: "close_invoice", meta: grounded }] };
  assert.ok(validatePolicies(d, []).some((f) => f.code === "PL6.self_loop"));
});

test("PL7 detects a reaction cycle over the joined graph", () => {
  // close_invoice emits invoice_paid → p_a schedules installation → install_done → p_b closes invoice → cycle
  const d: DomainDoc = {
    ...base,
    policies: [
      { id: "p_a", name: "Paid → Schedule", on: "invoice_paid", then: "schedule_installation", meta: grounded },
      { id: "p_b", name: "Done → Close", on: "install_done", then: "close_invoice", meta: grounded },
    ],
  };
  const f = validatePolicies(d, []);
  assert.ok(f.some((x) => x.code === "PL7.cycle"));
});
