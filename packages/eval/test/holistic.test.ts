import { test } from "node:test";
import assert from "node:assert/strict";
import type { CapabilityDoc, DomainDoc, RolesDoc, AgentsDoc } from "@kiln/compiler";
import { scoreHolisticCoherence } from "../src/index.ts";

// A hand-built two-capability model whose chain is complete: each capability owns an aggregate, issues a
// command, and is operated by a role. The whole model hangs together — coherence should be high (1).
const caps: CapabilityDoc = {
  version: "1",
  domain: "shop",
  capabilities: [
    { id: "sales", name: "Sales" },
    { id: "fulfilment", name: "Fulfilment" },
  ],
};
const domain: DomainDoc = {
  version: "1",
  aggregates: [
    { id: "order", name: "Order", owner: "sales" },
    { id: "shipment", name: "Shipment", owner: "fulfilment" },
  ],
  commands: [
    { id: "place_order", name: "Place Order", aggregate: "order", capability: "sales" },
    { id: "ship_order", name: "Ship Order", aggregate: "shipment", capability: "fulfilment" },
  ],
  events: [],
};
const roles: RolesDoc = {
  version: "1",
  roles: [{ id: "clerk", name: "Clerk", capabilities: ["sales", "fulfilment"] }],
};

test("a coherent model scores high with no chain breaks", () => {
  const s = scoreHolisticCoherence({ caps, domain, roles });
  assert.equal(s.coherence, 1);
  assert.equal(s.chainBreaks.length, 0);
  assert.equal(s.softGaps.length, 0);
  assert.equal(s.danglingRefs, 0);
  assert.equal(s.entityCoverage, 1);
  assert.equal(s.behaviourCoverage, 1);
  assert.equal(s.ownerCoverage, 1);
});

test("stripping a capability's entity produces a chain break and drops the score", () => {
  // Fulfilment loses its aggregate → no entity → a hard chain break.
  const stripped: DomainDoc = { ...domain, aggregates: domain.aggregates.filter((a) => a.owner !== "fulfilment") };
  const s = scoreHolisticCoherence({ caps, domain: stripped, roles });
  assert.ok(s.coherence < 1, `expected < 1, got ${s.coherence}`);
  assert.equal(s.coherence, 0.5); // 1 of 2 capabilities fully chained
  assert.ok(s.chainBreaks.some((c) => c.id === "fulfilment"), "fulfilment should be a chain break");
  assert.equal(s.chainBreaks.length, 1);
});

test("a fully-operated capability with no role/agent owner is a SOFT gap, not a hard break", () => {
  const s = scoreHolisticCoherence({ caps, domain }); // no roles/agents at all
  assert.equal(s.chainBreaks.length, 0, "both capabilities have entity + behaviour");
  assert.equal(s.softGaps.length, 2, "neither is owned by a role or agent");
  assert.equal(s.ownerCoverage, 0);
  assert.ok(s.coherence < 1); // soft gaps still lower the fully-chained fraction
});

test("an agent owner counts the same as a role owner", () => {
  const agents: AgentsDoc = { version: "1", agents: [{ id: "bot", name: "Bot", capabilities: ["sales", "fulfilment"] }] };
  const s = scoreHolisticCoherence({ caps, domain, agents });
  assert.equal(s.ownerCoverage, 1);
  assert.equal(s.softGaps.length, 0);
  assert.equal(s.coherence, 1);
});

test("a dangling reference caps the coherence at 0.5", () => {
  // Order references a non-existent aggregate → DM6.dangling. Even with a complete chain, the model does
  // not actually wire together, so the score is capped.
  const dangly: DomainDoc = {
    ...domain,
    aggregates: [{ id: "order", name: "Order", owner: "sales", references: ["ghost"] }, ...domain.aggregates.slice(1)],
  };
  const s = scoreHolisticCoherence({ caps, domain: dangly, roles });
  assert.ok(s.danglingRefs > 0, "should count the dangling reference");
  assert.equal(s.coherence, 0.5);
});

test("an empty capability list is coherent by convention (1)", () => {
  const empty: CapabilityDoc = { version: "1", domain: "shop", capabilities: [] };
  const s = scoreHolisticCoherence({ caps: empty });
  assert.equal(s.coherence, 1);
  assert.equal(s.chainBreaks.length, 0);
  assert.equal(s.matrix.length, 0);
});
