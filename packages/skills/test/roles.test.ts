import { test } from "node:test";
import assert from "node:assert/strict";
import { mockGenerateRoles, generateRoles, coerceRoles, type LlmProvider } from "../src/index.ts";
import { validateRoles } from "@kiln/validation";
import type { CapabilityDoc } from "@kiln/compiler";

const caps: CapabilityDoc = { version: "0.2", domain: "solar", capabilities: [{ id: "lead_management", name: "Lead" }, { id: "billing", name: "Billing" }] };

test("mock authorizes every capability (clean, no unauthorized)", () => {
  const d = mockGenerateRoles(caps);
  assert.ok(!validateRoles(d, ["lead_management", "billing"]).some((f) => f.code === "RO5.unauthorized"));
});
test("coerce canonicalizes capability ids by name and mints slug ids", () => {
  const d = coerceRoles({ version: "0.1", roles: [{ name: "Sales Rep", capabilities: ["Lead"], derivedFrom: [{ anchor: "x" }] }] }, caps);
  assert.equal(d.roles[0].id, "sales_rep");
  assert.deepEqual(d.roles[0].capabilities, ["lead_management"]);
});
test("generateRoles repairs an unknown-capability reference", async () => {
  let call = 0;
  const provider: LlmProvider = {
    name: "anthropic:test",
    complete: async () => {
      call++;
      const roles = call === 1
        ? [{ name: "Bad", capabilities: ["ghost"], derivedFrom: [{ anchor: "x" }] }]
        : [{ name: "Sales", capabilities: ["lead_management"], derivedFrom: [{ anchor: "sales" }] }, { name: "Finance", capabilities: ["billing"], derivedFrom: [{ anchor: "fin" }] }];
      return { provider: "anthropic:test", raw: "", json: { version: "0.1", roles } };
    },
  };
  const res = await generateRoles(caps, provider);
  assert.equal(res.repaired, true);
  assert.ok(!res.findings.some((f) => f.code.startsWith("RO2.")));
});
