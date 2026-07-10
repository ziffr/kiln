/** Seeded-defect corpus + human-blessed reference reactions for solar (SPEC-005 §8). */

import type { DomainDoc } from "@vbd/compiler";
import type { PoliciesEvalCase, PolicyReference } from "./policies.ts";

const grounded = { origin: "llm", derivedFrom: [{ anchor: "flow" }] };
const base: DomainDoc = {
  version: "0.3",
  aggregates: [{ id: "invoice", name: "Invoice", owner: "billing" }, { id: "work_order", name: "Work Order", owner: "install" }],
  events: [
    { id: "invoice_paid", name: "Invoice Paid", aggregate: "invoice", trigger: "command" },
    { id: "install_done", name: "Installation Completed", aggregate: "work_order", trigger: "command" },
  ],
  commands: [
    { id: "schedule_installation", name: "Schedule Installation", aggregate: "work_order", capability: "install", emits: ["install_done"] },
    { id: "close_invoice", name: "Close Invoice", aggregate: "invoice", capability: "billing", emits: [] },
  ],
};

export const solarPoliciesCorpus: PoliciesEvalCase[] = [
  { id: "clean", description: "A clean cross-entity reaction — no findings.", domain: { ...base, policies: [{ id: "p", name: "Paid → Schedule", on: "invoice_paid", then: "schedule_installation", meta: grounded }] }, capabilityIds: [], expected: [] },
  { id: "dangling-trigger", description: "Trigger on an unknown event — PL2.", domain: { ...base, policies: [{ id: "p", name: "X", on: "ghost", then: "schedule_installation", meta: grounded }] }, capabilityIds: [], expected: [{ code: "PL2.trigger", subject: "ghost" }] },
  { id: "dangling-reaction", description: "React with an unknown command — PL3.", domain: { ...base, policies: [{ id: "p", name: "X", on: "invoice_paid", then: "ghost", meta: grounded }] }, capabilityIds: [], expected: [{ code: "PL3.reaction", subject: "ghost" }] },
  { id: "duplicate", description: "Duplicate policy id — PL4.", domain: { ...base, policies: [{ id: "p", name: "A", on: "invoice_paid", then: "schedule_installation", meta: grounded }, { id: "p", name: "B", on: "install_done", then: "close_invoice", meta: grounded }] }, capabilityIds: [], expected: [{ code: "PL4.unique", subject: "p" }] },
  { id: "ungrounded", description: "llm policy with no anchor — PL5.", domain: { ...base, policies: [{ id: "p", name: "X", on: "invoice_paid", then: "schedule_installation", meta: { origin: "llm", derivedFrom: [] } }] }, capabilityIds: [], expected: [{ code: "PL5.provenance", subject: "p" }] },
];

/** The reaction a faithful solar model should recover: paying an invoice schedules the installation. */
export const solarPolicyReference: PolicyReference = [{ on: "invoice_paid", then: "schedule_installation" }];
export const solarBehaviourForPolicies: DomainDoc = base;
