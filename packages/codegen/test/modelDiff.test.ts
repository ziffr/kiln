import { test } from "node:test";
import assert from "node:assert/strict";
import { diffModels } from "../src/modelDiff.ts";

const base = () => ({
  narrative: "v1",
  capabilities: { capabilities: [{ id: "c1", name: "Lead Management" }, { id: "c2", name: "Billing" }] },
  contexts: { contexts: [{ id: "a1", name: "Sales" }] },
  domain: {
    aggregates: [{ id: "e1", name: "Lead", attributes: [{ name: "status", type: "text" }] }],
    commands: [{ id: "cmd1", name: "Qualify Lead" }],
    events: [{ id: "ev1", name: "Lead Qualified" }],
    policies: [{ id: "p1", on: "ev1", then: "cmd1" }],
  },
  roles: { roles: [{ id: "r1", name: "Sales Rep" }] },
  workflows: { workflows: [{ id: "w1", name: "Order to Cash", mode: "workflow", steps: ["cmd1"] }] },
  agents: { agents: [{ id: "ag1", name: "Sales Agent" }] },
});

test("identical models → no changes", () => {
  const d = diffModels(base(), base());
  assert.equal(d.totalChanges, 0);
  assert.equal(d.layers.length, 0);
  assert.equal(d.narrativeChanged, false);
});

test("added / removed capabilities are detected by id", () => {
  const b = base();
  b.capabilities.capabilities = [{ id: "c1", name: "Lead Management" }, { id: "c3", name: "Support" }]; // c2 removed, c3 added
  const d = diffModels(base(), b);
  const caps = d.layers.find((l) => l.key === "capabilities")!;
  assert.deepEqual(caps.added, ["Support"]);
  assert.deepEqual(caps.removed, ["Billing"]);
  assert.equal(d.totalChanges, 2);
});

test("entity attribute changes surface as detail", () => {
  const b = base();
  b.domain.aggregates = [{ id: "e1", name: "Lead", attributes: [{ name: "status", type: "text" }, { name: "score", type: "number" }] }];
  const d = diffModels(base(), b);
  const ent = d.layers.find((l) => l.key === "entities")!;
  assert.equal(ent.changed.length, 1);
  assert.equal(ent.changed[0].name, "Lead");
  assert.match(ent.changed[0].detail!, /\+score/);
});

test("attribute type change is flagged with ~", () => {
  const b = base();
  b.domain.aggregates = [{ id: "e1", name: "Lead", attributes: [{ name: "status", type: "number" }] }];
  const d = diffModels(base(), b);
  const ent = d.layers.find((l) => l.key === "entities")!;
  assert.match(ent.changed[0].detail!, /~status/);
});

test("workflow mode + step changes surface as detail", () => {
  const b = base();
  b.workflows.workflows = [{ id: "w1", name: "Order to Cash", mode: "agent", steps: ["cmd1", "cmd2"] }];
  const d = diffModels(base(), b);
  const wf = d.layers.find((l) => l.key === "workflows")!;
  assert.equal(wf.changed[0].name, "Order to Cash");
  assert.match(wf.changed[0].detail!, /workflow → agent/);
  assert.match(wf.changed[0].detail!, /1 → 2 steps/);
});

test("behaviour combines commands and events", () => {
  const b = base();
  b.domain.events = [{ id: "ev1", name: "Lead Qualified" }, { id: "ev2", name: "Lead Disqualified" }];
  const d = diffModels(base(), b);
  const beh = d.layers.find((l) => l.key === "behaviour")!;
  assert.deepEqual(beh.added, ["Lead Disqualified"]);
});

test("policies without a name fall back to on→then", () => {
  const b = base();
  b.domain.policies = []; // removed
  const d = diffModels(base(), b);
  const autom = d.layers.find((l) => l.key === "automations")!;
  assert.deepEqual(autom.removed, ["ev1 → cmd1"]);
});

test("narrative change is reported", () => {
  const b = base();
  b.narrative = "v2 rewritten";
  const d = diffModels(base(), b);
  assert.equal(d.narrativeChanged, true);
});

test("missing layers (null) don't throw", () => {
  const a = { capabilities: null, domain: null } as never;
  const b = { capabilities: { capabilities: [{ id: "c1", name: "New" }] } } as never;
  const d = diffModels(a, b);
  assert.deepEqual(d.layers.find((l) => l.key === "capabilities")!.added, ["New"]);
});
