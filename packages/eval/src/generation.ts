/**
 * @kiln/eval — GENERATION-coverage scoring (SPEC-001 §8; REV-006 F2).
 *
 * The defect-detection scorer (index.ts) asks "did we catch the seeded defects?". This scorer
 * asks the complementary question for the M2 generator: "did the generated capabilities actually
 * cover the narrative?". Two deterministic, gold-free metrics:
 *
 *   activityCoverage — fraction of the narrative's Core Activities cited by at least one
 *                      capability's `meta.derivedFrom` anchors (provenance-based recall over the
 *                      input). Uses the SAME hyphenated anchor scheme as @kiln/narrative `anchorize`
 *                      so a cited anchor matches the section/item it was derived from.
 *   expectedCoverage — fraction of a reference capability-id set present in the generated doc
 *                      (recall over an expected shape). Only meaningful when a reference set exists.
 *
 * Pure and deterministic — this scores the MOCK generator with no LLM call, key, or cost.
 */

import type { CapabilityDoc } from "@kiln/compiler";
import { anchorize } from "@kiln/narrative";

export interface GenerationCoverage {
  /** cited Core Activities / total Core Activities (1 when there are no activities). */
  activityCoverage: number;
  /** present expected ids / total expected ids (1 when no reference set is supplied). */
  expectedCoverage: number;
  /** activities whose anchor no capability cited via `meta.derivedFrom`. */
  missedActivities: string[];
  /** expected capability ids absent from the generated doc. */
  missedExpected: string[];
  citedActivities: number;
  totalActivities: number;
  presentExpected: number;
  totalExpected: number;
}

/**
 * Collect every provenance anchor cited across the doc's capabilities.
 * `meta` is loosely typed (Record<string, unknown>), so we read `meta.derivedFrom[].anchor`
 * defensively — a capability without provenance simply contributes nothing.
 */
function citedAnchors(doc: CapabilityDoc): Set<string> {
  const anchors = new Set<string>();
  for (const cap of doc.capabilities) {
    const derived = (cap.meta as Record<string, unknown> | undefined)?.derivedFrom;
    if (!Array.isArray(derived)) continue;
    for (const ref of derived) {
      const anchor = (ref as Record<string, unknown> | null)?.anchor;
      if (typeof anchor === "string") anchors.add(anchor);
    }
  }
  return anchors;
}

/**
 * Score how well a generated `CapabilityDoc` covers a narrative.
 *
 * @param activities the narrative's Core Activities (e.g. `coreActivities(narrative)`).
 * @param doc        the generated capability document.
 * @param expectedIds optional reference capability-id set for recall over an expected shape.
 */
export function scoreGenerationCoverage(
  activities: string[],
  doc: CapabilityDoc,
  expectedIds: string[] = [],
): GenerationCoverage {
  const anchors = citedAnchors(doc);
  const missedActivities = activities.filter((a) => !anchors.has(anchorize(a)));
  const citedActivities = activities.length - missedActivities.length;

  const presentIds = new Set(doc.capabilities.map((c) => c.id));
  const missedExpected = expectedIds.filter((id) => !presentIds.has(id));
  const presentExpected = expectedIds.length - missedExpected.length;

  return {
    activityCoverage: activities.length ? citedActivities / activities.length : 1,
    expectedCoverage: expectedIds.length ? presentExpected / expectedIds.length : 1,
    missedActivities,
    missedExpected,
    citedActivities,
    totalActivities: activities.length,
    presentExpected,
    totalExpected: expectedIds.length,
  };
}
