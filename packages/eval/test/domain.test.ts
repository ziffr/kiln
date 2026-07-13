import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNarrative } from "@kiln/narrative";
import { mockGenerateCapabilities, mockGenerateDomain } from "@kiln/skills";
import { scoreDomainCase, aggregateDomainRecall, scoreDomainCoverage } from "../src/index.ts";
import { solarDomainCorpus } from "../src/domain.solar.ts";
import { solarNarrativeMd } from "../src/generation.solar.ts";

// ---- Defect detection: the DM validators must catch every seeded domain defect ----

test("the domain corpus has ≥5 named seeded cases", () => {
  assert.ok(solarDomainCorpus.length >= 5);
  assert.ok(solarDomainCorpus.every((c) => c.id && c.description));
});

test("DM validators achieve full recall on the domain corpus", () => {
  const scores = solarDomainCorpus.map(scoreDomainCase);
  assert.equal(aggregateDomainRecall(scores), 1);
});

test("every seeded domain defect is actually caught (no unmet)", () => {
  for (const c of solarDomainCorpus) {
    const s = scoreDomainCase(c);
    assert.equal(s.unmet.length, 0, `${c.id} unmet: ${JSON.stringify(s.unmet)}`);
  }
});

test("the clean domain case produces no findings (precision 1)", () => {
  const clean = solarDomainCorpus.find((c) => c.expected.length === 0);
  assert.ok(clean);
  const s = scoreDomainCase(clean);
  assert.equal(s.foundCount, 0);
  assert.equal(s.precision, 1);
});

// ---- Generation coverage: the mock domain must faithfully cover the solar capabilities ----

const solar = parseNarrative(solarNarrativeMd);
const solarCaps = mockGenerateCapabilities(solar);
const solarDomain = mockGenerateDomain(solarCaps);

test("the mock domain grounds every aggregate's provenance (provenanceRate 1)", () => {
  const cov = scoreDomainCoverage(solarCaps, solarDomain);
  assert.equal(cov.provenanceRate, 1, `ungrounded: ${JSON.stringify(cov.ungroundedAggregates)}`);
});

test("the mock domain captures every produced object as an aggregate (producesCoverage 1)", () => {
  const cov = scoreDomainCoverage(solarCaps, solarDomain);
  assert.ok(cov.totalProduces > 0);
  assert.equal(cov.producesCoverage, 1, `uncaptured: ${JSON.stringify(cov.uncapturedProduces)}`);
});

test("the mock domain covers most capabilities with an owned aggregate (ownershipCoverage high)", () => {
  const cov = scoreDomainCoverage(solarCaps, solarDomain);
  // Every capability that produces something owns an aggregate; a pure-orchestration capability may
  // legitimately own none (DM5, a minor warning). So we require strong — not necessarily full — cover.
  assert.ok(cov.ownershipCoverage >= 0.75, `only ${cov.ownedCapabilities}/${cov.totalCapabilities} covered`);
});

test("coverage of an empty domain is honest (0 ownership, produces uncaptured)", () => {
  const cov = scoreDomainCoverage(solarCaps, { version: "0.1", aggregates: [] });
  assert.equal(cov.ownershipCoverage, 0);
  assert.equal(cov.provenanceRate, 1); // vacuously — no aggregates to ground
  assert.ok(cov.uncapturedProduces.length === cov.totalProduces && cov.totalProduces > 0);
});
