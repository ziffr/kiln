import { test } from "node:test";
import assert from "node:assert/strict";
import { compileCapabilities, type CapabilityDoc } from "../src/index.ts";

const doc: CapabilityDoc = {
  version: "0.2",
  domain: "solar-installer",
  capabilities: [
    {
      id: "lead_management",
      name: "Lead Management",
      purpose: "Acquire and qualify prospective customers.",
      outcomes: ["qualified_lead"],
      actors: ["Sales"],
      produces: ["Lead"],
      depends_on: [],
    },
    {
      id: "billing",
      name: "Billing",
      purpose: "Financial settlement of delivered systems.",
      outcomes: ["invoice_paid"],
      produces: ["Invoice"],
      depends_on: ["lead_management"],
    },
  ],
};

test("compiles capabilities into authored capability nodes", () => {
  const ir = compileCapabilities(doc);
  const caps = ir.nodes.filter((n) => n.type === "capability");
  assert.equal(caps.length, 2);
  assert.ok(caps.every((n) => n.origin === "authored"));
});

test("outcome and domain_object nodes are derived (read-only projections)", () => {
  const ir = compileCapabilities(doc);
  assert.ok(ir.nodes.filter((n) => n.type === "outcome").every((n) => n.origin === "derived"));
  assert.ok(ir.nodes.filter((n) => n.type === "domain_object").every((n) => n.origin === "derived"));
});

test("depends_on yields an authored capability→capability edge", () => {
  const ir = compileCapabilities(doc);
  const e = ir.edges.find((edge) => edge.type === "depends_on");
  assert.ok(e, "expected a depends_on edge");
  assert.equal(e.from, "billing");
  assert.equal(e.to, "lead_management");
  assert.equal(e.origin, "authored");
});

test("buildHash is deterministic for identical input", () => {
  const a = compileCapabilities(doc).buildHash;
  const b = compileCapabilities(structuredClone(doc)).buildHash;
  assert.equal(a, b);
});

test("buildHash changes when the authored model changes", () => {
  const before = compileCapabilities(doc).buildHash;
  const mutated = structuredClone(doc);
  mutated.capabilities[0].purpose = "a different purpose";
  assert.notEqual(before, compileCapabilities(mutated).buildHash);
});

test("nodes and edges are emitted in a stable order", () => {
  const ir = compileCapabilities(doc);
  const ids = ir.nodes.map((n) => n.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a.localeCompare(b)));
});
