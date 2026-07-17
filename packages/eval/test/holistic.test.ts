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

// ── Provenance-awareness: structural coverage vs. really-generated coverage ──────────────────────
const mock = { origin: "mock" };
const real = { origin: "llm" };

test("a 100%-MOCK model is structurally coherent but 0% really generated — every cap is scaffoldOnly", () => {
  // A blanket-scaffolding model: mock aggregates + mock commands + one mock Operator role over ALL caps.
  const mockDomain: DomainDoc = {
    version: "1",
    aggregates: [
      { id: "order", name: "Order", owner: "sales", meta: mock },
      { id: "shipment", name: "Shipment", owner: "fulfilment", meta: mock },
    ],
    commands: [
      { id: "place_order", name: "Place Order", aggregate: "order", capability: "sales", meta: mock },
      { id: "ship_order", name: "Ship Order", aggregate: "shipment", capability: "fulfilment", meta: mock },
    ],
    events: [],
  };
  const mockRoles: RolesDoc = { version: "1", roles: [{ id: "operator", name: "Operator", capabilities: ["sales", "fulfilment"], meta: mock }] };
  const s = scoreHolisticCoherence({ caps, domain: mockDomain, roles: mockRoles });
  // Structural coherence is still high — the chain reaches every capability.
  assert.equal(s.coherence, 1, "structurally the chain is complete");
  assert.equal(s.chainBreaks.length, 0);
  // But nothing has actually been generated: every cell is mock scaffolding.
  assert.equal(s.generatedCoverage, 0, "no capability is really generated");
  assert.equal(s.scaffoldOnly.length, 2, "both capabilities are still scaffolding");
  assert.deepEqual(s.scaffoldOnly.map((c) => c.id).sort(), ["fulfilment", "sales"]);
});

test("a fully-REAL model is 100% really generated with no scaffolding", () => {
  const realDomain: DomainDoc = {
    version: "1",
    aggregates: [
      { id: "order", name: "Order", owner: "sales", meta: real },
      { id: "shipment", name: "Shipment", owner: "fulfilment", meta: real },
    ],
    commands: [
      { id: "place_order", name: "Place Order", aggregate: "order", capability: "sales", meta: real },
      { id: "ship_order", name: "Ship Order", aggregate: "shipment", capability: "fulfilment", meta: real },
    ],
    events: [],
  };
  const realRoles: RolesDoc = { version: "1", roles: [{ id: "clerk", name: "Clerk", capabilities: ["sales", "fulfilment"], meta: real }] };
  const s = scoreHolisticCoherence({ caps, domain: realDomain, roles: realRoles });
  assert.equal(s.coherence, 1);
  assert.equal(s.generatedCoverage, 1, "every capability is really generated");
  assert.equal(s.scaffoldOnly.length, 0, "no scaffolding remains");
});

test("hand-authored content (no origin) counts as REAL, not scaffolding", () => {
  // Elements a human authored carry no `origin` (or 'authored') — real === origin !== 'mock'.
  const authored: DomainDoc = {
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
  const s = scoreHolisticCoherence({ caps, domain: authored, roles });
  assert.equal(s.generatedCoverage, 1, "authored (origin-less) content is real");
  assert.equal(s.scaffoldOnly.length, 0);
});

test("an agent owner with NO instructions is not a REAL owner — the cap is scaffoldOnly, not really generated", () => {
  const realDomain: DomainDoc = {
    version: "1",
    aggregates: [
      { id: "order", name: "Order", owner: "sales", meta: real },
      { id: "shipment", name: "Shipment", owner: "fulfilment", meta: real },
    ],
    commands: [
      { id: "place_order", name: "Place Order", aggregate: "order", capability: "sales", meta: real },
      { id: "ship_order", name: "Ship Order", aggregate: "shipment", capability: "fulfilment", meta: real },
    ],
    events: [],
  };
  // An llm-origin agent owns both caps but its behaviour is undesigned (no `instructions`) → NOT a real owner.
  const undesigned: AgentsDoc = { version: "1", agents: [{ id: "bot", name: "Bot", capabilities: ["sales", "fulfilment"], meta: real }] };
  const s = scoreHolisticCoherence({ caps, domain: realDomain, agents: undesigned });
  assert.equal(s.chainBreaks.length, 0, "entity + behaviour are present");
  assert.equal(s.ownerCoverage, 1, "structurally an owner exists");
  assert.equal(s.generatedCoverage, 0, "an undesigned agent is not a real owner");
  assert.equal(s.scaffoldOnly.length, 2, "both caps hang on an undesigned agent");
  // Design the agent (give it instructions) → it becomes a real owner and the caps are really generated.
  const designed: AgentsDoc = { version: "1", agents: [{ id: "bot", name: "Bot", capabilities: ["sales", "fulfilment"], instructions: "You run sales and fulfilment. Escalate refunds.", meta: real }] };
  const s2 = scoreHolisticCoherence({ caps, domain: realDomain, agents: designed });
  assert.equal(s2.generatedCoverage, 1, "a designed agent IS a real owner");
  assert.equal(s2.scaffoldOnly.length, 0);
});

test("a REAL entity/behaviour with no owner is a soft gap, NOT scaffolding (absence isn't mock)", () => {
  const realDomain: DomainDoc = {
    version: "1",
    aggregates: [
      { id: "order", name: "Order", owner: "sales", meta: real },
      { id: "shipment", name: "Shipment", owner: "fulfilment", meta: real },
    ],
    commands: [
      { id: "place_order", name: "Place Order", aggregate: "order", capability: "sales", meta: real },
      { id: "ship_order", name: "Ship Order", aggregate: "shipment", capability: "fulfilment", meta: real },
    ],
    events: [],
  };
  const s = scoreHolisticCoherence({ caps, domain: realDomain }); // no roles/agents
  assert.equal(s.softGaps.length, 2, "no owner → soft gap");
  assert.equal(s.scaffoldOnly.length, 0, "a missing owner is a soft gap, not mock scaffolding");
  assert.equal(s.generatedCoverage, 0, "still not a fully-real chain (no owner)");
});
