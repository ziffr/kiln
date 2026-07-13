import { test } from "node:test";
import assert from "node:assert/strict";
import { validateContexts } from "../src/index.ts";
import type { CapabilityDoc, ContextsDoc } from "@kiln/compiler";

const doc: CapabilityDoc = {
  version: "0.2",
  domain: "solar-installer",
  capabilities: [
    { id: "lead_management", name: "Lead", produces: ["Lead"] },
    { id: "customer_management", name: "Customer", depends_on: ["lead_management"], consumes: ["Lead"] },
    { id: "billing", name: "Billing", produces: ["Invoice"] },
  ],
};

const clean: ContextsDoc = {
  version: "0.1",
  contexts: [
    { id: "c_sales", name: "Sales", intent: "Win customers", capabilities: ["lead_management", "customer_management"], meta: { origin: "llm", derivedFrom: [{ anchor: "sales-onboarding" }] } },
    { id: "c_finance", name: "Finance", intent: "Bill", capabilities: ["billing"], meta: { origin: "llm", derivedFrom: [{ anchor: "finance" }] } },
  ],
};

test("a clean partition produces no findings", () => {
  assert.deepEqual(validateContexts(clean, doc), []);
});

test("BC2.unassigned flags a capability in no area", () => {
  const c: ContextsDoc = { version: "0.1", contexts: [{ id: "c_sales", name: "Sales", intent: "x", capabilities: ["lead_management", "customer_management"], meta: { origin: "llm", derivedFrom: [{ anchor: "a" }] } }] };
  const f = validateContexts(c, doc);
  assert.ok(f.some((x) => x.code === "BC2.unassigned" && x.subjects.includes("billing")));
});

test("BC2.multiple flags a capability primary-assigned to two areas", () => {
  const c: ContextsDoc = {
    version: "0.1",
    contexts: [
      { id: "c_sales", name: "Sales", intent: "x", capabilities: ["lead_management", "customer_management"], meta: { origin: "llm", derivedFrom: [{ anchor: "a" }] } },
      { id: "c_finance", name: "Finance", intent: "x", capabilities: ["billing", "customer_management"], meta: { origin: "llm", derivedFrom: [{ anchor: "b" }] } },
    ],
  };
  const f = validateContexts(c, doc);
  assert.ok(f.some((x) => x.code === "BC2.multiple" && x.subjects.includes("customer_management")));
});

test("shared_kernel is the escape — a cap in one area's capabilities + another's shared_kernel is clean on BC2", () => {
  const c: ContextsDoc = {
    version: "0.1",
    contexts: [
      { id: "c_sales", name: "Sales", intent: "x", capabilities: ["lead_management", "customer_management"], meta: { origin: "llm", derivedFrom: [{ anchor: "a" }] } },
      { id: "c_finance", name: "Finance", intent: "x", capabilities: ["billing"], shared_kernel: ["customer_management"], meta: { origin: "llm", derivedFrom: [{ anchor: "b" }] } },
    ],
  };
  const f = validateContexts(c, doc);
  assert.ok(!f.some((x) => x.code.startsWith("BC2.")));
});

test("BC4.dangling flags a member that isn't a capability", () => {
  const c: ContextsDoc = { version: "0.1", contexts: [{ id: "c_sales", name: "Sales", intent: "x", capabilities: ["lead_management", "customer_management", "billing", "ghost"], meta: { origin: "llm", derivedFrom: [{ anchor: "a" }] } }] };
  const f = validateContexts(c, doc);
  assert.ok(f.some((x) => x.code === "BC4.dangling" && x.subjects.includes("ghost")));
});

test("BC7.unique/slug flag duplicate and non-slug ids", () => {
  const dup: ContextsDoc = { version: "0.1", contexts: [
    { id: "c_x", name: "A", intent: "x", capabilities: ["lead_management", "customer_management"] },
    { id: "c_x", name: "B", intent: "x", capabilities: ["billing"] },
  ] };
  assert.ok(validateContexts(dup, doc).some((x) => x.code === "BC7.unique"));
  const bad: ContextsDoc = { version: "0.1", contexts: [
    { id: "Sales Area", name: "A", intent: "x", capabilities: ["lead_management", "customer_management"] },
    { id: "c_fin", name: "B", intent: "x", capabilities: ["billing"] },
  ] };
  assert.ok(validateContexts(bad, doc).some((x) => x.code === "BC7.slug"));
});

test("BC8.provenance flags an llm area whose derivedFrom cites no boundary evidence (anchor)", () => {
  const c: ContextsDoc = {
    version: "0.1",
    contexts: [
      { id: "c_sales", name: "Sales", intent: "x", capabilities: ["lead_management", "customer_management"], meta: { origin: "llm", derivedFrom: [{ capability: "lead_management" }] } },
      { id: "c_finance", name: "Finance", intent: "x", capabilities: ["billing"], meta: { origin: "llm", derivedFrom: [{ anchor: "finance" }] } },
    ],
  };
  const f = validateContexts(c, doc);
  assert.ok(f.some((x) => x.code === "BC8.provenance" && x.subjects.includes("c_sales")));
  assert.ok(!f.some((x) => x.code === "BC8.provenance" && x.subjects.includes("c_finance")));
});

test("authored areas are exempt from BC8 provenance", () => {
  const c: ContextsDoc = {
    version: "0.1",
    contexts: [
      { id: "c_sales", name: "Sales", intent: "x", capabilities: ["lead_management", "customer_management"], meta: { origin: "authored" } },
      { id: "c_finance", name: "Finance", intent: "x", capabilities: ["billing"], meta: { origin: "authored" } },
    ],
  };
  assert.ok(!validateContexts(c, doc).some((x) => x.code === "BC8.provenance"));
});

test("BC9.cohesion warns on an area whose members share no dependency or entity", () => {
  // lead_management (produces Lead) + billing (produces Invoice): no dep, no shared entity.
  const c: ContextsDoc = {
    version: "0.1",
    contexts: [
      { id: "c_odd", name: "Odd", intent: "x", capabilities: ["lead_management", "billing"], meta: { origin: "authored" } },
      { id: "c_cust", name: "Cust", intent: "x", capabilities: ["customer_management"], meta: { origin: "authored" } },
    ],
  };
  const f = validateContexts(c, doc);
  assert.ok(f.some((x) => x.code === "BC9.cohesion" && x.subjects.includes("c_odd")));
});
