/**
 * Seeded-defect corpus for the solar domain model (SPEC-002 DM eval).
 *
 * Each case seeds ONE known domain defect that a correct DM validator must catch, so the harness
 * proves the DM validators end-to-end (the aggregates-first exit gate). The capability id set is
 * the same solar value chain the generation corpus uses.
 */

import type { DomainEvalCase } from "./domain.ts";

const CAP_IDS = ["planning", "procurement", "billing"];

const goodAgg = {
  id: "energy_system_design",
  name: "Energy System Design",
  owner: "planning",
  attributes: ["kwp", "roof_area"],
  references: [],
  meta: { origin: "llm", derivedFrom: [{ capability: "planning" }] },
};

export const solarDomainCorpus: DomainEvalCase[] = [
  {
    id: "clean-domain",
    description: "A valid single-aggregate domain (every capability that should own one does) — no findings.",
    domain: {
      version: "0.1",
      aggregates: [
        { ...goodAgg },
        { id: "purchase_order", name: "Purchase Order", owner: "procurement", references: ["energy_system_design"], meta: { origin: "llm", derivedFrom: [{ capability: "procurement" }] } },
        { id: "invoice", name: "Invoice", owner: "billing", references: [], meta: { origin: "llm", derivedFrom: [{ capability: "billing" }] } },
      ],
    },
    capabilityIds: CAP_IDS,
    expected: [],
  },
  {
    id: "orphan-owner",
    description: "An aggregate owned by a non-existent capability — DM2 must flag it.",
    domain: { version: "0.1", aggregates: [{ ...goodAgg, owner: "ghost" }] },
    capabilityIds: CAP_IDS,
    expected: [{ code: "DM2.owner", subject: "ghost", note: "owner not a capability" }],
  },
  {
    id: "dangling-reference",
    description: "An aggregate references an unknown aggregate — DM6 must flag it.",
    domain: { version: "0.1", aggregates: [{ ...goodAgg, references: ["nonexistent"] }] },
    capabilityIds: CAP_IDS,
    expected: [{ code: "DM6.dangling", subject: "nonexistent", note: "reference target missing" }],
  },
  {
    id: "duplicate-id",
    description: "Two aggregates share an id — DM7 must flag a blocker.",
    domain: { version: "0.1", aggregates: [{ ...goodAgg }, { ...goodAgg, name: "Design (dup)" }] },
    capabilityIds: CAP_IDS,
    expected: [{ code: "DM7.unique", subject: "energy_system_design", note: "id reused" }],
  },
  {
    id: "non-slug-id",
    description: "An aggregate id that isn't a stable slug (hyphens) — DM7 must flag it.",
    domain: { version: "0.1", aggregates: [{ ...goodAgg, id: "energy-system-design" }] },
    capabilityIds: CAP_IDS,
    expected: [{ code: "DM7.slug", subject: "energy-system-design", note: "hyphenated id" }],
  },
  {
    id: "missing-name",
    description: "An aggregate with no name — DM1 must flag it.",
    domain: { version: "0.1", aggregates: [{ ...goodAgg, name: "" }] },
    capabilityIds: CAP_IDS,
    expected: [{ code: "DM1.name", subject: "energy_system_design", note: "name omitted" }],
  },
  {
    id: "uncovered-capability",
    description: "A capability owns no aggregate — DM5 warns (minor), not an error.",
    domain: { version: "0.1", aggregates: [{ ...goodAgg }] },
    capabilityIds: ["planning", "orchestration"], // orchestration owns nothing
    expected: [{ code: "DM5.uncovered", subject: "orchestration", note: "under-modeled or pure orchestration" }],
  },
];
