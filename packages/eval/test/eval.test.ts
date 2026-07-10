import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreCase, aggregateRecall } from "../src/index.ts";
import { solarCorpus, pendingCorpus } from "../src/corpus.solar.ts";

test("the corpus has ≥3 named seeded cases (REV-006 F1)", () => {
  assert.ok(solarCorpus.length + pendingCorpus.length >= 3);
  assert.ok(solarCorpus.every((c) => c.id && c.description));
});

test("M0 validators achieve full recall on the M0-scoreable corpus", () => {
  const scores = solarCorpus.map(scoreCase);
  assert.equal(aggregateRecall(scores), 1);
});

test("every seeded defect is actually caught (no unmet in solarCorpus)", () => {
  for (const c of solarCorpus) {
    const s = scoreCase(c);
    assert.equal(s.unmet.length, 0, `${c.id} unmet: ${JSON.stringify(s.unmet)}`);
  }
});

test("the clean case produces no false positives (precision 1, no findings)", () => {
  const clean = solarCorpus.find((c) => c.expected.length === 0);
  assert.ok(clean);
  const s = scoreCase(clean);
  assert.equal(s.foundCount, 0);
  assert.equal(s.precision, 1);
});

test("pending corpus documents future V3/V7 defects (not yet detectable)", () => {
  assert.ok(pendingCorpus.length >= 2);
  assert.ok(pendingCorpus.every((c) => c.expected.length > 0));
  // With only V1/V2 today, these higher-order defects remain unmet — by design.
  for (const c of pendingCorpus) {
    assert.ok(scoreCase(c).unmet.length > 0, `${c.id} should still be unmet at M0`);
  }
});
