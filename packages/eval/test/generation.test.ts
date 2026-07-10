import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNarrative, coreActivities } from "@vbd/narrative";
import { mockGenerateCapabilities } from "@vbd/skills";
import { scoreGenerationCoverage } from "../src/index.ts";
import { solarNarrativeMd, solarExpectedCapabilityIds } from "../src/generation.solar.ts";

const solar = parseNarrative(solarNarrativeMd);
const solarDoc = mockGenerateCapabilities(solar);

test("the mock achieves full activity coverage on solar (REV-006 F2)", () => {
  const s = scoreGenerationCoverage(coreActivities(solar), solarDoc);
  assert.equal(s.totalActivities, 12);
  assert.equal(s.activityCoverage, 1, `missed: ${JSON.stringify(s.missedActivities)}`);
  assert.deepEqual(s.missedActivities, []);
});

test("the mock recovers the full expected capability set on solar (recall 1)", () => {
  const s = scoreGenerationCoverage(coreActivities(solar), solarDoc, solarExpectedCapabilityIds);
  assert.equal(s.totalExpected, solarExpectedCapabilityIds.length);
  assert.equal(s.expectedCoverage, 1, `missed: ${JSON.stringify(s.missedExpected)}`);
  assert.deepEqual(s.missedExpected, []);
});

test("a thin narrative yields lower activity coverage than solar", () => {
  // A narrative missing most of the value chain: only one activity the mock can cite.
  const thinMd = [
    "# Thin Co",
    "## Purpose",
    "Do one thing.",
    "## Customers",
    "- Someone",
    "## Business Outcomes",
    "- Get paid",
    "## Core Activities",
    "- Acquire leads",
    "- Fold laundry",
    "- Water the plants",
    "",
  ].join("\n");
  const thin = parseNarrative(thinMd);
  const thinDoc = mockGenerateCapabilities(thin);
  const full = scoreGenerationCoverage(coreActivities(solar), solarDoc, solarExpectedCapabilityIds);
  const s = scoreGenerationCoverage(coreActivities(thin), thinDoc, solarExpectedCapabilityIds);

  // Every activity still maps to *some* capability (unmatched activities become fallback caps),
  // so activity coverage stays high — the recall gap shows up against the expected solar shape.
  assert.ok(s.expectedCoverage < full.expectedCoverage, `thin=${s.expectedCoverage} full=${full.expectedCoverage}`);
  assert.ok(s.missedExpected.length > 0);
  assert.ok(s.missedExpected.includes("installation"));
});

test("coverage is deterministic and pure (same input → same result)", () => {
  const a = scoreGenerationCoverage(coreActivities(solar), solarDoc, solarExpectedCapabilityIds);
  const b = scoreGenerationCoverage(coreActivities(solar), solarDoc, solarExpectedCapabilityIds);
  assert.deepEqual(a, b);
});

test("no reference set means expectedCoverage defaults to 1", () => {
  const s = scoreGenerationCoverage(coreActivities(solar), solarDoc);
  assert.equal(s.totalExpected, 0);
  assert.equal(s.expectedCoverage, 1);
});
