import { test } from "node:test";
import assert from "node:assert/strict";
import { compileCapabilities, aggregateNodeId, type CapabilityDoc, type DomainDoc } from "../src/index.ts";

const caps: CapabilityDoc = {
  version: "0.2",
  domain: "solar-installer",
  capabilities: [
    { id: "lead_management", name: "Lead Management", purpose: "Acquire leads.", outcomes: ["qualified_lead"], produces: ["Lead"] },
    { id: "installation", name: "Installation", purpose: "Install.", outcomes: ["done"], consumes: ["Lead"], depends_on: ["lead_management"] },
  ],
};

const domain: DomainDoc = {
  version: "0.1",
  aggregates: [
    { id: "lead", name: "Lead", owner: "lead_management", attributes: ["name", "status"], references: [] },
    { id: "install_job", name: "Install Job", owner: "installation", references: ["lead"] },
  ],
};

test("compiling without a domain model leaves the IR domain-free (back-compat)", () => {
  const ir = compileCapabilities(caps);
  assert.ok(!ir.nodes.some((n) => n.type === "aggregate"));
  // Lead is a derived domain_object when no aggregate supersedes it
  assert.ok(ir.nodes.some((n) => n.type === "domain_object" && n.id === "domain_object:lead"));
});

test("aggregates compile into authored nodes with owns edges", () => {
  const ir = compileCapabilities(caps, domain);
  const aggs = ir.nodes.filter((n) => n.type === "aggregate");
  assert.equal(aggs.length, 2);
  assert.ok(aggs.every((n) => n.origin === "authored"));
  assert.ok(ir.edges.some((e) => e.type === "owns" && e.from === "lead_management" && e.to === aggregateNodeId("lead")));
  assert.ok(ir.edges.some((e) => e.type === "references" && e.from === aggregateNodeId("install_job") && e.to === aggregateNodeId("lead")));
});

test("an authored aggregate supersedes the same-slug derived domain_object (REV-010 M2)", () => {
  const ir = compileCapabilities(caps, domain);
  // No `domain_object:lead` — produces/consumes retargeted to the authored aggregate:lead
  assert.ok(!ir.nodes.some((n) => n.id === "domain_object:lead"));
  assert.ok(ir.edges.some((e) => e.type === "produces" && e.to === aggregateNodeId("lead")));
  assert.ok(ir.edges.some((e) => e.type === "consumes" && e.to === aggregateNodeId("lead")));
});

test("aggregate node ids are namespaced (no collision with capability ids)", () => {
  const ir = compileCapabilities(caps, domain);
  assert.ok(ir.nodes.some((n) => n.id === "aggregate:lead"));
  assert.ok(ir.nodes.some((n) => n.id === "lead_management" && n.type === "capability"));
});

test("buildHash mixes both artifacts", () => {
  const a = compileCapabilities(caps).buildHash;
  const b = compileCapabilities(caps, domain).buildHash;
  assert.notEqual(a, b);
  assert.equal(compileCapabilities(caps, domain).buildHash, compileCapabilities(caps, structuredClone(domain)).buildHash);
});
