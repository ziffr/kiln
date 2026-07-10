import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compileCapabilities,
  computeBuildHash,
  contextNodeId,
  type CapabilityDoc,
  type ContextsDoc,
} from "../src/index.ts";

const doc: CapabilityDoc = {
  version: "0.2",
  domain: "solar-installer",
  capabilities: [
    { id: "lead_management", name: "Lead Management", produces: ["Lead"] },
    { id: "customer_management", name: "Customer Management", depends_on: ["lead_management"] },
    { id: "billing", name: "Billing", produces: ["Invoice"] },
  ],
};

const contexts: ContextsDoc = {
  version: "0.1",
  contexts: [
    { id: "c_sales", name: "Sales & Onboarding", intent: "Win and onboard", capabilities: ["lead_management", "customer_management"] },
    { id: "c_finance", name: "Finance", intent: "Bill and collect", capabilities: ["billing"] },
  ],
};

test("compiles business areas into authored bounded_context nodes", () => {
  const ir = compileCapabilities(doc, undefined, contexts);
  const sales = ir.nodes.find((n) => n.id === contextNodeId("c_sales"));
  assert.ok(sales);
  assert.equal(sales.type, "bounded_context");
  assert.equal(sales.origin, "authored");
  assert.equal(sales.label, "Sales & Onboarding");
  assert.equal((sales.meta as { intent?: string }).intent, "Win and onboard");
});

test("area ids are namespaced bctx: and never collide with capability ids", () => {
  const ir = compileCapabilities(doc, undefined, contexts);
  assert.equal(contextNodeId("c_sales"), "bctx:c_sales");
  // no capability node shares an area's namespaced id
  assert.ok(!ir.nodes.some((n) => n.type === "capability" && n.id.startsWith("bctx:")));
});

test("groups edges connect an area to each of its member capabilities", () => {
  const ir = compileCapabilities(doc, undefined, contexts);
  const groups = ir.edges.filter((e) => e.type === "groups");
  assert.equal(groups.length, 3); // 2 in sales + 1 in finance
  const salesId = contextNodeId("c_sales");
  const salesMembers = groups.filter((e) => e.from === salesId).map((e) => e.to).sort();
  assert.deepEqual(salesMembers, ["customer_management", "lead_management"]);
  assert.ok(groups.every((e) => e.origin === "authored"));
});

test("shared_kernel members also get a groups edge (BC2 escape)", () => {
  const withKernel: ContextsDoc = {
    version: "0.1",
    contexts: [
      { id: "c_sales", name: "Sales", capabilities: ["lead_management"], shared_kernel: ["customer_management"] },
      { id: "c_finance", name: "Finance", capabilities: ["billing", "customer_management"] },
    ],
  };
  const ir = compileCapabilities(doc, undefined, withKernel);
  const groups = ir.edges.filter((e) => e.type === "groups");
  const custGroupedBy = groups.filter((e) => e.to === "customer_management").map((e) => e.from).sort();
  assert.deepEqual(custGroupedBy, [contextNodeId("c_finance"), contextNodeId("c_sales")]);
});

test("buildHash changes when the contexts partition changes (REV-015 M2)", () => {
  const a = computeBuildHash(doc, undefined, contexts);
  const moved: ContextsDoc = {
    version: "0.1",
    contexts: [
      { id: "c_sales", name: "Sales & Onboarding", capabilities: ["lead_management"] },
      { id: "c_finance", name: "Finance", capabilities: ["billing", "customer_management"] },
    ],
  };
  assert.notEqual(a, computeBuildHash(doc, undefined, moved));
  // and differs from the no-contexts hash
  assert.notEqual(a, computeBuildHash(doc));
});

test("compiling without contexts yields no bounded_context nodes (back-compat)", () => {
  const ir = compileCapabilities(doc);
  assert.ok(!ir.nodes.some((n) => n.type === "bounded_context"));
  assert.ok(!ir.edges.some((e) => e.type === "groups"));
});
