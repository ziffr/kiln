import { test } from "node:test";
import assert from "node:assert/strict";
import { mockGeneratePolicies } from "@vbd/skills";
import { scorePoliciesCase, aggregatePoliciesRecall, scorePolicyCoverage, reactionRecall, spuriousRate } from "../src/index.ts";
import { solarPoliciesCorpus, solarPolicyReference, solarBehaviourForPolicies } from "../src/policies.solar.ts";

test("the policies corpus has ≥5 seeded cases", () => {
  assert.ok(solarPoliciesCorpus.length >= 5);
});
test("validatePolicies achieves full recall on the corpus", () => {
  assert.equal(aggregatePoliciesRecall(solarPoliciesCorpus.map(scorePoliciesCase)), 1);
});
test("every seeded policy defect is caught", () => {
  for (const c of solarPoliciesCorpus) assert.equal(scorePoliciesCase(c).unmet.length, 0, `${c.id} unmet`);
});
test("the clean case has precision 1", () => {
  const clean = solarPoliciesCorpus.find((c) => c.expected.length === 0)!;
  assert.equal(scorePoliciesCase(clean).foundCount, 0);
});

test("mock policies are cross-entity, grounded, and recover the reference reaction with no over-wiring", () => {
  const d = mockGeneratePolicies(solarBehaviourForPolicies);
  const cov = scorePolicyCoverage(d);
  assert.equal(cov.provenanceRate, 1);
  assert.equal(cov.crossEntityRate, 1); // the one reaction crosses invoice → work_order
  assert.equal(reactionRecall(solarPolicyReference, d), 1); // found the paid → schedule hand-off
  assert.equal(spuriousRate(solarPolicyReference, d), 0); // and nothing spurious
});

test("spuriousRate rises for an over-wired partition (precision instrument works)", () => {
  const overWired = {
    ...solarBehaviourForPolicies,
    policies: [
      { id: "a", name: "ok", on: "invoice_paid", then: "schedule_installation" },
      { id: "b", name: "noise", on: "install_done", then: "close_invoice" }, // not in reference
    ],
  };
  assert.ok(spuriousRate(solarPolicyReference, overWired) >= 0.4);
});
