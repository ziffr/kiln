import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNarrative } from "@vbd/narrative";
import { mockGenerateCapabilities, mockGroupContexts } from "@vbd/skills";
import { scoreContextsCase, aggregateContextsRecall, scoreContextCoverage, partitionAgreement } from "../src/index.ts";
import { solarContextsCorpus, solarReferencePartition } from "../src/contexts.solar.ts";
import { solarNarrativeMd } from "../src/generation.solar.ts";

// ---- Defect detection ----

test("the contexts corpus has ≥5 named seeded cases", () => {
  assert.ok(solarContextsCorpus.length >= 5);
  assert.ok(solarContextsCorpus.every((c) => c.id && c.description));
});

test("validateContexts achieves full recall on the corpus", () => {
  assert.equal(aggregateContextsRecall(solarContextsCorpus.map(scoreContextsCase)), 1);
});

test("every seeded partition defect is caught (no unmet)", () => {
  for (const c of solarContextsCorpus) {
    const s = scoreContextsCase(c);
    assert.equal(s.unmet.length, 0, `${c.id} unmet: ${JSON.stringify(s.unmet)}`);
  }
});

test("the clean partition produces no findings (precision 1)", () => {
  const clean = solarContextsCorpus.find((c) => c.expected.length === 0)!;
  const s = scoreContextsCase(clean);
  assert.equal(s.foundCount, 0);
  assert.equal(s.precision, 1);
});

// ---- Partition-agreement (ARI) — the quality instrument that degenerate partitions fail ----

test("ARI = 1 for a partition identical to the reference", () => {
  const identical = { version: "0.1", contexts: solarReferencePartition.map((m, i) => ({ id: `c${i}`, name: `A${i}`, capabilities: m })) };
  assert.equal(partitionAgreement(solarReferencePartition, identical), 1);
});

test("ARI is LOW for the degenerate one-blob partition (coverage=1 can't catch this)", () => {
  const blob = { version: "0.1", contexts: [{ id: "c_all", name: "Everything", capabilities: solarReferencePartition.flat() }] };
  const ari = partitionAgreement(solarReferencePartition, blob);
  assert.ok(ari < 0.2, `one-blob ARI should be low, got ${ari}`);
});

test("ARI is LOW for the degenerate one-area-per-capability partition", () => {
  const singletons = { version: "0.1", contexts: solarReferencePartition.flat().map((m, i) => ({ id: `c${i}`, name: m, capabilities: [m] })) };
  const ari = partitionAgreement(solarReferencePartition, singletons);
  assert.ok(ari < 0.2, `singleton ARI should be low, got ${ari}`);
});

// ---- Coverage on the mock, against the real solar narrative ----

const solarCaps = mockGenerateCapabilities(parseNarrative(solarNarrativeMd));
const solarAreas = mockGroupContexts(solarCaps);

test("the mock partition is complete and grounded on solar", () => {
  const cov = scoreContextCoverage(solarCaps, solarAreas);
  assert.equal(cov.partitionCompleteness, 1, `ungrouped: ${JSON.stringify(cov.ungroupedCapabilities)}`);
  assert.equal(cov.provenanceRate, 1, `ungrounded: ${JSON.stringify(cov.ungroundedAreas)}`);
});

test("the mock partition respects the guardrails (sane area count, no giant area)", () => {
  const cov = scoreContextCoverage(solarCaps, solarAreas);
  assert.ok(cov.areaCount >= 2 && cov.areaCount <= 6, `areaCount=${cov.areaCount}`);
  assert.ok(cov.giantAreaRatio <= 0.6, `giantAreaRatio=${cov.giantAreaRatio}`);
});
