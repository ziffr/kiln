import { test } from "node:test";
import assert from "node:assert/strict";
import { critiqueLayer, critiqueToFeedback, resolveTarget, generateContexts, type LlmProvider, type ReviewModel } from "../src/index.ts";
import type { CapabilityDoc } from "@vbd/compiler";

const caps: CapabilityDoc = {
  version: "0.2", domain: "solar",
  capabilities: [
    { id: "lead_management", name: "Lead Management" },
    { id: "billing", name: "Billing" },
  ],
};
const model: ReviewModel = { caps, contexts: { version: "0.1", contexts: [{ id: "c_sales", name: "Sales", capabilities: ["lead_management"] }] } as any };

test("critiqueLayer coerces findings and stamps stable ids", async () => {
  const provider: LlmProvider = {
    name: "anthropic:test",
    complete: async () => ({ provider: "anthropic:test", raw: "", json: { findings: [
      { severity: "concern", message: "over-segmented", suggestion: "merge", target: "Sales" },
      { severity: "bogus", message: "x" }, // severity coerced to suggestion
    ] } }),
  };
  const res = await critiqueLayer("areas", model, provider);
  assert.equal(res.findings.length, 2);
  assert.equal(res.findings[0].severity, "concern");
  assert.equal(res.findings[1].severity, "suggestion");
  assert.ok(res.findings[0].id && res.findings[0].id === res.findings[0].id);
});

test("resolveTarget maps a name/id to a selectable node across the model", () => {
  assert.deepEqual(resolveTarget("Lead Management", model), { kind: "capability", id: "lead_management" });
  assert.deepEqual(resolveTarget("Sales", model), { kind: "area", id: "c_sales" });
  assert.equal(resolveTarget("nonexistent", model), undefined);
});

test("critiqueToFeedback yields empty for a clean review and a directive block otherwise", () => {
  assert.equal(critiqueToFeedback([]), "");
  const fb = critiqueToFeedback([{ id: "a", severity: "concern", message: "too many areas", suggestion: "merge X and Y" }]);
  assert.ok(fb.includes("too many areas") && fb.includes("merge X and Y") && /ADDRESS/i.test(fb));
});

test("generateContexts threads reviewer feedback into the prompt (Refine loop)", async () => {
  let seen = "";
  const provider: LlmProvider = {
    name: "anthropic:test",
    complete: async (req) => { seen = req.user; return { provider: "anthropic:test", raw: "", json: { version: "0.1", contexts: [
      { name: "All", capabilities: ["lead_management", "billing"], derivedFrom: [{ anchor: "a" }] },
    ] } }; },
  };
  await generateContexts(caps, provider, "REVIEWER SAYS: merge the areas");
  assert.ok(seen.includes("REVIEWER SAYS: merge the areas"));
});
