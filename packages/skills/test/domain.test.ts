import { test } from "node:test";
import assert from "node:assert/strict";
import { mockGenerateDomain, generateDomain, type LlmProvider } from "../src/index.ts";
import { validateDomain } from "@vbd/validation";
import type { CapabilityDoc } from "@vbd/compiler";

const caps: CapabilityDoc = {
  version: "0.2",
  domain: "solar-installer",
  capabilities: [
    { id: "planning", name: "Planning", purpose: "Design.", outcomes: ["approved_design"], produces: ["EnergySystemDesign", "BillOfMaterials"] },
    { id: "procurement", name: "Procurement", purpose: "Source.", outcomes: ["materials_available"], produces: ["PurchaseOrder"], consumes: ["BillOfMaterials"], depends_on: ["planning"] },
    { id: "orchestration", name: "Orchestration", purpose: "Coordinate.", outcomes: ["coordinated"] }, // owns nothing
  ],
};

test("mock domain derives an aggregate per produced object, owned by its producer", () => {
  const d = mockGenerateDomain(caps);
  const byId = new Map(d.aggregates.map((a) => [a.id, a]));
  assert.ok(byId.has("energysystemdesign") && byId.get("energysystemdesign")!.owner === "planning");
  assert.ok(byId.has("billofmaterials") && byId.get("billofmaterials")!.owner === "planning");
  assert.ok(byId.has("purchaseorder") && byId.get("purchaseorder")!.owner === "procurement");
});

test("produced aggregates reference consumed aggregates within a capability", () => {
  const d = mockGenerateDomain(caps);
  const po = d.aggregates.find((a) => a.id === "purchaseorder")!;
  assert.deepEqual(po.references, ["billofmaterials"]); // Procurement produces PurchaseOrder, consumes BillOfMaterials
});

test("generated aggregates carry capability-targeting provenance", () => {
  const d = mockGenerateDomain(caps);
  for (const a of d.aggregates) {
    const meta = a.meta as { origin?: string; derivedFrom?: Array<{ capability?: string }> };
    assert.equal(meta.origin, "llm");
    assert.ok(meta.derivedFrom?.[0]?.capability);
  }
});

test("generateDomain grounds provenance to the owning capability and validates", async () => {
  const provider: LlmProvider = {
    name: "anthropic:test",
    complete: async () => ({
      provider: "anthropic:test",
      raw: "",
      json: { version: "0.1", aggregates: [{ id: "design", name: "Design", owner: "planning" }] },
    }),
  };
  const res = await generateDomain(caps, provider);
  assert.equal(res.repaired, false);
  assert.ok(!res.findings.some((f) => f.severity === "blocker" || f.severity === "major"));
  const meta = res.doc.aggregates[0].meta as { origin?: string; derivedFrom?: Array<{ capability?: string }> };
  assert.equal(meta.origin, "llm");
  assert.equal(meta.derivedFrom?.[0]?.capability, "planning");
});

test("generateDomain flags an aggregate whose owner isn't a capability (DM2)", async () => {
  const provider: LlmProvider = {
    name: "anthropic:test",
    complete: async () => ({ provider: "anthropic:test", raw: "", json: { version: "0.1", aggregates: [{ id: "x", name: "X", owner: "ghost" }] } }),
  };
  const res = await generateDomain(caps, provider);
  assert.ok(res.findings.some((f) => f.code === "DM2.owner"));
});

test("the mock domain validates cleanly except a DM5 warning for the aggregate-less capability", () => {
  const d = mockGenerateDomain(caps);
  const findings = validateDomain(d, caps.capabilities.map((c) => c.id));
  assert.ok(!findings.some((f) => f.severity === "blocker" || f.severity === "major"));
  const dm5 = findings.filter((f) => f.code === "DM5.uncovered");
  assert.ok(dm5.length === 1 && dm5[0].subjects.includes("orchestration") && dm5[0].severity === "minor");
});
