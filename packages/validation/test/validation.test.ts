import { test } from "node:test";
import assert from "node:assert/strict";
import { validateV1, validateV2, validateAll, validateDomain } from "../src/index.ts";
import type { CapabilityDoc, DomainDoc } from "@kiln/compiler";

const clean: CapabilityDoc = {
  version: "0.2",
  domain: "solar-installer",
  capabilities: [
    {
      id: "lead_management",
      name: "Lead Management",
      purpose: "Acquire and qualify prospective customers.",
      outcomes: ["qualified_lead"],
    },
  ],
};

test("a clean doc yields no findings", () => {
  assert.equal(validateAll(clean).length, 0);
});

test("V1 flags a missing purpose", () => {
  const d = structuredClone(clean);
  delete (d.capabilities[0] as { purpose?: string }).purpose;
  assert.ok(validateV1(d).some((f) => f.code === "V1.purpose"));
});

test("V1 flags missing outcomes", () => {
  const d = structuredClone(clean);
  d.capabilities[0].outcomes = [];
  assert.ok(validateV1(d).some((f) => f.code === "V1.outcomes"));
});

test("V2 flags a duplicate id as a blocker", () => {
  const d = structuredClone(clean);
  d.capabilities.push(structuredClone(clean.capabilities[0]));
  const f = validateV2(d).find((x) => x.code === "V2.unique");
  assert.ok(f);
  assert.equal(f.severity, "blocker");
});

test("V2 flags a non-slug id", () => {
  const d = structuredClone(clean);
  d.capabilities[0].id = "Lead Management";
  assert.ok(validateV2(d).some((f) => f.code === "V2.slug"));
});

test("V4 flags an isolated capability (but not a lone one)", () => {
  // lone capability → not an orphan
  assert.ok(!validateAll(clean).some((f) => f.code === "V4.orphan"));
  // add a connected pair + one disconnected extra
  const d: CapabilityDoc = {
    version: "0.2",
    domain: "solar-installer",
    capabilities: [
      { id: "a", name: "A", purpose: "p", outcomes: ["o"] },
      { id: "b", name: "B", purpose: "p2", outcomes: ["o2"], depends_on: ["a"] },
      { id: "island", name: "Island", purpose: "alone", outcomes: ["o3"] },
    ],
  };
  const f = validateAll(d);
  assert.ok(f.some((x) => x.code === "V4.orphan" && x.subjects.includes("island")));
  assert.ok(!f.some((x) => x.code === "V4.orphan" && x.subjects.includes("a")));
});

test("V5 flags a depends_on to an unknown capability", () => {
  const d: CapabilityDoc = {
    version: "0.2",
    domain: "solar-installer",
    capabilities: [{ id: "a", name: "A", purpose: "p", outcomes: ["o"], depends_on: ["ghost"] }],
  };
  assert.ok(validateAll(d).some((x) => x.code === "V5.dangling" && x.subjects.includes("ghost")));
});

test("V6 flags a dependency cycle", () => {
  const d: CapabilityDoc = {
    version: "0.2",
    domain: "solar-installer",
    capabilities: [
      { id: "a", name: "A", purpose: "p", outcomes: ["o"], depends_on: ["b"] },
      { id: "b", name: "B", purpose: "p", outcomes: ["o"], depends_on: ["a"] },
    ],
  };
  assert.ok(validateAll(d).some((x) => x.code === "V6.cycle"));
});

test("V7 flags an overlapping pair (one purpose subsumes the other)", () => {
  const d: CapabilityDoc = {
    version: "0.2",
    domain: "solar-installer",
    capabilities: [
      { id: "lead_management", name: "Lead Management", purpose: "Acquire and qualify prospective customers.", outcomes: ["o"] },
      { id: "customer_management", name: "Customer Management", purpose: "Acquire and qualify prospective customers and manage the relationship.", outcomes: ["o2"], depends_on: ["lead_management"] },
    ],
  };
  assert.ok(validateAll(d).some((x) => x.code === "V7.overlap"));
  // the pristine solar mock model must NOT trip V7 (no false positives)
  assert.ok(!validateAll(clean).some((x) => x.code === "V7.overlap"));
});

const domainClean: DomainDoc = {
  version: "0.1",
  aggregates: [{ id: "lead", name: "Lead", owner: "lead_management", references: [] }],
};

test("DM: a valid domain model (owner exists, own covered) yields no blocking findings", () => {
  const f = validateDomain(domainClean, ["lead_management"]);
  assert.ok(!f.some((x) => x.severity === "blocker" || x.severity === "major"));
});

test("DM2 flags an aggregate whose owner is not a capability", () => {
  const d: DomainDoc = { version: "0.1", aggregates: [{ id: "x", name: "X", owner: "ghost" }] };
  assert.ok(validateDomain(d, ["lead_management"]).some((x) => x.code === "DM2.owner"));
});

test("DM6 flags a dangling aggregate reference; DM7 flags a duplicate id", () => {
  const d: DomainDoc = {
    version: "0.1",
    aggregates: [
      { id: "a", name: "A", owner: "lead_management", references: ["nope"] },
      { id: "a", name: "A2", owner: "lead_management" },
    ],
  };
  const f = validateDomain(d, ["lead_management"]);
  assert.ok(f.some((x) => x.code === "DM6.dangling"));
  assert.ok(f.some((x) => x.code === "DM7.unique" && x.severity === "blocker"));
});

test("DM5 is a warning (minor), not an error, for a capability owning no aggregate", () => {
  const f = validateDomain(domainClean, ["lead_management", "billing"]);
  const dm5 = f.find((x) => x.code === "DM5.uncovered");
  assert.ok(dm5 && dm5.severity === "minor" && dm5.subjects.includes("billing"));
});

test("finding ids are stable / content-addressed across runs", () => {
  const d = structuredClone(clean);
  d.capabilities[0].outcomes = [];
  const a = validateV1(d).find((f) => f.code === "V1.outcomes");
  const b = validateV1(structuredClone(d)).find((f) => f.code === "V1.outcomes");
  assert.ok(a && b);
  assert.equal(a.id, b.id);
});
