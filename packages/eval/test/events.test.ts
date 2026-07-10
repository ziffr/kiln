import { test } from "node:test";
import assert from "node:assert/strict";
import { mockGenerateEvents } from "@vbd/skills";
import { scoreEventsCase, aggregateEventsRecall, scoreBehaviourCoverage, commandRecall } from "../src/index.ts";
import { solarEventsCorpus, solarBehaviourReference } from "../src/events.solar.ts";
import type { DomainDoc } from "@vbd/compiler";

test("the behaviour corpus has ≥5 seeded cases", () => {
  assert.ok(solarEventsCorpus.length >= 5);
});

test("validateEvents achieves full recall on the corpus", () => {
  assert.equal(aggregateEventsRecall(solarEventsCorpus.map(scoreEventsCase)), 1);
});

test("every seeded behaviour defect is caught", () => {
  for (const c of solarEventsCorpus) assert.equal(scoreEventsCase(c).unmet.length, 0, `${c.id} unmet`);
});

test("the clean case has precision 1 and no findings", () => {
  const clean = solarEventsCorpus.find((c) => c.expected.length === 0)!;
  const s = scoreEventsCase(clean);
  assert.equal(s.foundCount, 0);
  assert.equal(s.precision, 1);
});

const domain: DomainDoc = {
  version: "0.2",
  aggregates: [
    { id: "lead", name: "Lead", owner: "lead_management" },
    { id: "invoice", name: "Invoice", owner: "billing" },
  ],
};

test("mock behaviour has full command/event coverage and grounded provenance", () => {
  const cov = scoreBehaviourCoverage(mockGenerateEvents(domain));
  assert.equal(cov.commandCoverage, 1);
  assert.equal(cov.eventCoverage, 1);
  assert.equal(cov.provenanceRate, 1);
});

test("commandRecall is LOW for the degenerate CRUD mock (coverage=1 can't catch it)", () => {
  // mock emits create_/update_ commands; the reference wants Qualify/Convert/Issue/Record → ~0 recall.
  const r = commandRecall(solarBehaviourReference, mockGenerateEvents(domain));
  assert.ok(r < 0.25, `CRUD mock recall should be low, got ${r}`);
});

test("commandRecall = 1 when the model matches the reference", () => {
  const good: DomainDoc = {
    ...domain,
    commands: [
      { id: "c1", name: "Qualify Lead", aggregate: "lead", capability: "lead_management" },
      { id: "c2", name: "Convert Lead", aggregate: "lead", capability: "lead_management" },
      { id: "c3", name: "Issue Invoice", aggregate: "invoice", capability: "billing" },
      { id: "c4", name: "Record Payment", aggregate: "invoice", capability: "billing" },
    ],
  };
  assert.equal(commandRecall(solarBehaviourReference, good), 1);
});
