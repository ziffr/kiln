/**
 * Seeded-defect corpus + human-blessed reference partition for the solar business areas
 * (SPEC-003 §8). One defect per case so `validateContexts` is proven end-to-end; the reference
 * partition is the one-time human judgment `partitionAgreement` scores generated partitions against.
 */

import type { CapabilityDoc } from "@vbd/compiler";
import type { ContextsEvalCase } from "./contexts.ts";

const caps: CapabilityDoc = {
  version: "0.2",
  domain: "solar-installer",
  capabilities: [
    { id: "lead_management", name: "Lead", produces: ["Lead"] },
    { id: "customer_management", name: "Customer", depends_on: ["lead_management"], consumes: ["Lead"] },
    { id: "billing", name: "Billing", produces: ["Invoice"] },
  ],
};

const grounded = { origin: "llm", derivedFrom: [{ anchor: "boundary" }] };

export const solarContextsCorpus: ContextsEvalCase[] = [
  {
    id: "clean-partition",
    description: "A complete, grounded partition — no findings.",
    contexts: { version: "0.1", contexts: [
      { id: "c_sales", name: "Sales", intent: "Win", capabilities: ["lead_management", "customer_management"], meta: grounded },
      { id: "c_finance", name: "Finance", intent: "Bill", capabilities: ["billing"], meta: grounded },
    ] },
    caps,
    expected: [],
  },
  {
    id: "unassigned-capability",
    description: "A capability grouped by no area — BC2.unassigned.",
    contexts: { version: "0.1", contexts: [
      { id: "c_sales", name: "Sales", intent: "Win", capabilities: ["lead_management", "customer_management"], meta: grounded },
    ] },
    caps,
    expected: [{ code: "BC2.unassigned", subject: "billing" }],
  },
  {
    id: "double-assigned",
    description: "A capability in two areas' capabilities — BC2.multiple.",
    contexts: { version: "0.1", contexts: [
      { id: "c_sales", name: "Sales", intent: "Win", capabilities: ["lead_management", "customer_management"], meta: grounded },
      { id: "c_finance", name: "Finance", intent: "Bill", capabilities: ["billing", "customer_management"], meta: grounded },
    ] },
    caps,
    expected: [{ code: "BC2.multiple", subject: "customer_management" }],
  },
  {
    id: "dangling-member",
    description: "An area lists a non-existent capability — BC4.dangling.",
    contexts: { version: "0.1", contexts: [
      { id: "c_sales", name: "Sales", intent: "Win", capabilities: ["lead_management", "customer_management", "billing", "ghost"], meta: grounded },
    ] },
    caps,
    expected: [{ code: "BC4.dangling", subject: "ghost" }],
  },
  {
    id: "non-slug-id",
    description: "An area id with spaces — BC7.slug.",
    contexts: { version: "0.1", contexts: [
      { id: "Sales Area", name: "Sales", intent: "Win", capabilities: ["lead_management", "customer_management"], meta: grounded },
      { id: "c_finance", name: "Finance", intent: "Bill", capabilities: ["billing"], meta: grounded },
    ] },
    caps,
    expected: [{ code: "BC7.slug", subject: "Sales Area" }],
  },
  {
    id: "ungrounded-provenance",
    description: "An llm area citing no boundary evidence — BC8.provenance.",
    contexts: { version: "0.1", contexts: [
      { id: "c_sales", name: "Sales", intent: "Win", capabilities: ["lead_management", "customer_management"], meta: { origin: "llm", derivedFrom: [{ capability: "lead_management" }] } },
      { id: "c_finance", name: "Finance", intent: "Bill", capabilities: ["billing"], meta: grounded },
    ] },
    caps,
    expected: [{ code: "BC8.provenance", subject: "c_sales" }],
  },
];

/** The one-time human-blessed reference partition for the full solar value chain (§8 A5). */
export const solarReferencePartition: string[][] = [
  ["lead_management", "customer_management", "offer_management"], // Sales & Onboarding
  ["planning", "procurement", "installation"], // Delivery
  ["billing", "monitoring"], // Finance & Ops
];
