import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRoles } from "../src/index.ts";
import type { RolesDoc } from "@vbd/compiler";

const caps = ["lead_management", "billing"];
const grounded = { origin: "llm", derivedFrom: [{ anchor: "sales team" }] };

test("a role authorizing existing capabilities is clean", () => {
  const r: RolesDoc = { version: "0.1", roles: [{ id: "sales", name: "Sales", capabilities: ["lead_management"], meta: grounded }, { id: "finance", name: "Finance", capabilities: ["billing"], meta: grounded }] };
  assert.ok(!validateRoles(r, caps).some((f) => f.severity === "blocker" || f.severity === "major"));
});
test("RO2 flags a role authorizing an unknown capability", () => {
  const r: RolesDoc = { version: "0.1", roles: [{ id: "x", name: "X", capabilities: ["ghost"], meta: grounded }] };
  assert.ok(validateRoles(r, caps).some((f) => f.code === "RO2.capability" && f.subjects.includes("ghost")));
});
test("RO3 flags duplicate role ids", () => {
  const r: RolesDoc = { version: "0.1", roles: [{ id: "a", name: "A", capabilities: ["lead_management"], meta: grounded }, { id: "a", name: "B", capabilities: ["billing"], meta: grounded }] };
  assert.ok(validateRoles(r, caps).some((f) => f.code === "RO3.unique"));
});
test("RO5 warns on a capability authorized by no role", () => {
  const r: RolesDoc = { version: "0.1", roles: [{ id: "sales", name: "Sales", capabilities: ["lead_management"], meta: grounded }] };
  assert.ok(validateRoles(r, caps).some((f) => f.code === "RO5.unauthorized" && f.subjects.includes("billing")));
});
test("RO4 flags an llm role with no grounded anchor", () => {
  const r: RolesDoc = { version: "0.1", roles: [{ id: "sales", name: "Sales", capabilities: caps, meta: { origin: "llm", derivedFrom: [] } }] };
  assert.ok(validateRoles(r, caps).some((f) => f.code === "RO4.provenance"));
});
