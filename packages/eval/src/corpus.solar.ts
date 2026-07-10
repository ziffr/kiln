/**
 * Seeded-defect corpus for the solar reference domain (SPEC-001 §8; REV-006 F1).
 *
 * `solarCorpus` — cases whose seeded defects are detectable by the M0 validators (V1/V2);
 *                 used to prove the harness works end-to-end today.
 * `pendingCorpus` — the classic higher-order defects (coverage gap, overlap) that the LLM +
 *                 validators V3/V7 must catch; activated when those land in M3.
 */

import type { EvalCase } from "./index.ts";

const baseCap = {
  id: "lead_management",
  name: "Lead Management",
  purpose: "Acquire and qualify prospective customers.",
  outcomes: ["qualified_lead"],
};

export const solarCorpus: EvalCase[] = [
  {
    id: "clean-minimal",
    description: "A minimal, valid single-capability model — must produce no findings.",
    doc: { version: "0.2", domain: "solar-installer", capabilities: [{ ...baseCap }] },
    expected: [],
  },
  {
    id: "missing-purpose",
    description: "A capability with no purpose — V1 must flag it.",
    doc: {
      version: "0.2",
      domain: "solar-installer",
      capabilities: [{ id: "planning", name: "Planning", outcomes: ["approved_design"] }],
    },
    expected: [{ code: "V1.purpose", subject: "planning", note: "purpose omitted" }],
  },
  {
    id: "duplicate-id",
    description: "Two capabilities share an id — V2 must flag a blocker.",
    doc: {
      version: "0.2",
      domain: "solar-installer",
      capabilities: [{ ...baseCap }, { ...baseCap }],
    },
    expected: [{ code: "V2.unique", subject: "lead_management", note: "id reused" }],
  },
  {
    id: "non-slug-id",
    description: "A capability id that isn't a stable slug — V2 must flag it.",
    doc: {
      version: "0.2",
      domain: "solar-installer",
      capabilities: [{ ...baseCap, id: "Lead Management" }],
    },
    expected: [{ code: "V2.slug", subject: "Lead Management", note: "spaces in id" }],
  },
];

export const pendingCorpus: EvalCase[] = [
  {
    id: "overlap-lead-vs-customer",
    description: "Lead Management and Customer Management overlap — future V7 / LLM review.",
    doc: {
      version: "0.2",
      domain: "solar-installer",
      capabilities: [
        { ...baseCap },
        {
          id: "customer_management",
          name: "Customer Management",
          purpose: "Acquire and qualify prospective customers and manage the relationship.",
          outcomes: ["qualified_lead"],
        },
      ],
    },
    expected: [{ code: "V7.overlap", note: "activated when V7 lands in M3" }],
  },
  {
    id: "missing-procurement",
    description: "Outcome materials_available has no owning capability — future V3 coverage.",
    doc: {
      version: "0.2",
      domain: "solar-installer",
      capabilities: [
        { ...baseCap },
        {
          id: "installation",
          name: "Installation",
          purpose: "Execute and commission the ordered system.",
          outcomes: ["system_commissioned"],
          consumes: ["PurchaseOrder"],
        },
      ],
    },
    expected: [{ code: "V3.coverage", note: "no capability produces the purchase order / materials" }],
  },
];
