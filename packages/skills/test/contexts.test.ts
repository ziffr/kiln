import { test } from "node:test";
import assert from "node:assert/strict";
import { mockGroupContexts, generateContexts, coerceContextsDoc, fingerprintId, type LlmProvider } from "../src/index.ts";
import { validateContexts } from "@vbd/validation";
import type { CapabilityDoc } from "@vbd/compiler";

// A solar-like value chain: a depends_on chain + shared entities. The mock must NOT collapse to one area.
const caps: CapabilityDoc = {
  version: "0.2",
  domain: "solar-installer",
  capabilities: [
    { id: "lead_management", name: "Lead", produces: ["Lead"] },
    { id: "customer_management", name: "Customer", depends_on: ["lead_management"], consumes: ["Lead"], produces: ["Customer"] },
    { id: "offer_management", name: "Offer", depends_on: ["customer_management"], consumes: ["Customer"], produces: ["Offer"] },
    { id: "planning", name: "Planning", depends_on: ["offer_management"], consumes: ["Offer"], produces: ["Design"] },
    { id: "procurement", name: "Procurement", depends_on: ["planning"], consumes: ["Design"], produces: ["PurchaseOrder"] },
    { id: "installation", name: "Installation", depends_on: ["procurement"], consumes: ["PurchaseOrder"] },
    { id: "billing", name: "Billing", depends_on: ["installation"], produces: ["Invoice"] },
    { id: "monitoring", name: "Monitoring", produces: ["Telemetry"] },
  ],
};

test("mock partitions solar into MULTIPLE areas (no single-blob collapse — REV-014)", () => {
  const d = mockGroupContexts(caps);
  assert.ok(d.contexts.length >= 2, `expected ≥2 areas, got ${d.contexts.length}`);
  // no area may swallow the whole chain
  assert.ok(d.contexts.every((c) => c.capabilities.length < caps.capabilities.length));
});

test("mock partition is complete and validates clean (every capability grouped exactly once)", () => {
  const d = mockGroupContexts(caps);
  const findings = validateContexts(d, caps);
  const partitionErrors = findings.filter((f) => f.code.startsWith("BC2.") || f.code === "BC4.dangling");
  assert.deepEqual(partitionErrors, [], JSON.stringify(partitionErrors));
  const all = d.contexts.flatMap((c) => c.capabilities).sort();
  assert.deepEqual(all, caps.capabilities.map((c) => c.id).sort());
});

test("mock areas carry grounded boundary evidence (no BC8)", () => {
  const d = mockGroupContexts(caps);
  assert.ok(!validateContexts(d, caps).some((f) => f.code === "BC8.provenance"));
});

test("fingerprint id is stable and order-independent", () => {
  assert.equal(fingerprintId(["b", "a"]), fingerprintId(["a", "b"]));
  assert.notEqual(fingerprintId(["a", "b"]), fingerprintId(["a", "c"]));
});

test("coerce canonicalizes hyphenated member ids to real capability ids (BC-F4)", () => {
  const doc = coerceContextsDoc(
    { version: "0.1", contexts: [{ name: "Sales", capabilities: ["lead-management", "customer-management"], derivedFrom: [{ anchor: "sales" }] }] },
    caps,
  );
  assert.ok(doc);
  assert.deepEqual(doc.contexts[0].capabilities, ["lead_management", "customer_management"]);
});

test("generateContexts validates a good partition without repair", async () => {
  const provider: LlmProvider = {
    name: "anthropic:test",
    complete: async () => ({
      provider: "anthropic:test",
      raw: "",
      json: {
        version: "0.1",
        contexts: [
          { name: "Sales & Onboarding", intent: "Win", capabilities: ["lead_management", "customer_management", "offer_management"], derivedFrom: [{ anchor: "sales" }] },
          { name: "Delivery", intent: "Build", capabilities: ["planning", "procurement", "installation"], derivedFrom: [{ anchor: "delivery" }] },
          { name: "Finance & Ops", intent: "Bill & watch", capabilities: ["billing", "monitoring"], derivedFrom: [{ anchor: "finance" }] },
        ],
      },
    }),
  };
  const res = await generateContexts(caps, provider);
  assert.equal(res.repaired, false);
  assert.ok(!res.findings.some((f) => f.code.startsWith("BC2.") || f.severity === "blocker"));
});

test("generateContexts repairs a broken partition (a capability left unassigned)", async () => {
  let call = 0;
  const provider: LlmProvider = {
    name: "anthropic:test",
    complete: async () => {
      call++;
      if (call === 1) {
        return { provider: "anthropic:test", raw: "", json: { version: "0.1", contexts: [
          { name: "A", capabilities: ["lead_management", "customer_management", "offer_management", "planning"], derivedFrom: [{ anchor: "a" }] },
          // billing, procurement, installation, monitoring unassigned → BC2.unassigned → repair
        ] } };
      }
      return { provider: "anthropic:test", raw: "", json: { version: "0.1", contexts: [
        { name: "A", capabilities: ["lead_management", "customer_management", "offer_management", "planning"], derivedFrom: [{ anchor: "a" }] },
        { name: "B", capabilities: ["procurement", "installation", "billing", "monitoring"], derivedFrom: [{ anchor: "b" }] },
      ] } };
    },
  };
  const res = await generateContexts(caps, provider);
  assert.equal(res.repaired, true);
  assert.ok(!res.findings.some((f) => f.code.startsWith("BC2.")));
});

test("critiqueContexts returns advisory findings and resolves area/capability ids for click-through", async () => {
  const { critiqueContexts } = await import("../src/index.ts");
  const provider = {
    name: "anthropic:test",
    complete: async () => ({ provider: "anthropic:test", raw: "", json: { findings: [
      { severity: "concern", message: "over-segmented", suggestion: "merge", area: "Sales", capability: "Lead Management" },
    ] } }),
  } as any;
  const contexts = { version: "0.1", contexts: [{ id: "c_sales", name: "Sales", capabilities: ["lead_management"] }] };
  const res = await critiqueContexts(caps, contexts as any, provider);
  assert.equal(res.findings.length, 1);
  assert.equal(res.findings[0].severity, "concern");
  assert.equal(res.findings[0].area, "c_sales"); // name → id resolved
  assert.equal(res.findings[0].capability, "lead_management"); // name → id resolved
  assert.ok(res.findings[0].id); // stable id for React
});
