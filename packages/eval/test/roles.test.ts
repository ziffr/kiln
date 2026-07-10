import { test } from "node:test";
import assert from "node:assert/strict";
import { mockGenerateRoles } from "@vbd/skills";
import { scoreRoleCoverage } from "../src/index.ts";
import type { CapabilityDoc } from "@vbd/compiler";

const caps: CapabilityDoc = { version: "0.2", domain: "solar", capabilities: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }] };

test("the mock roles authorize every capability, grounded", () => {
  const cov = scoreRoleCoverage(caps, mockGenerateRoles(caps));
  assert.equal(cov.authorizationCompleteness, 1);
  assert.equal(cov.provenanceRate, 1);
});
test("coverage catches an unauthorized capability", () => {
  const cov = scoreRoleCoverage(caps, { version: "0.1", roles: [{ id: "r", name: "R", capabilities: ["a", "b"] }] });
  assert.ok(cov.authorizationCompleteness < 1 && cov.unauthorized.includes("c"));
});
