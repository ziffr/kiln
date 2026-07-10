import { test } from "node:test";
import assert from "node:assert/strict";
import { compileCapabilities, roleNodeId, type CapabilityDoc, type RolesDoc } from "../src/index.ts";

const doc: CapabilityDoc = { version: "0.2", domain: "solar", capabilities: [{ id: "lead_management", name: "Lead" }] };
const roles: RolesDoc = { version: "0.1", roles: [{ id: "sales", name: "Sales", capabilities: ["lead_management"] }] };

test("composes a role node + authorizes edge", () => {
  const ir = compileCapabilities(doc, undefined, undefined, roles);
  const role = ir.nodes.find((n) => n.id === roleNodeId("sales"));
  assert.equal(role?.type, "role");
  assert.ok(ir.edges.some((e) => e.from === roleNodeId("sales") && e.to === "lead_management" && e.type === "authorizes"));
});
test("no roles → no role nodes (back-compat)", () => {
  assert.ok(!compileCapabilities(doc).nodes.some((n) => n.type === "role"));
});
