/**
 * Solar reference for GENERATION-coverage scoring (SPEC-001 §8; REV-006 F2).
 *
 * `solarNarrativeMd` — the authored solar narrative, read from the workspace so the scorer runs
 *                      against the real source of truth (same fs/fileURLToPath approach as the
 *                      @kiln/narrative test).
 * `solarExpectedCapabilityIds` — the capability shape a correct generation must recover for solar:
 *                      the end-to-end value chain from lead through service. This mirrors what the
 *                      mock's keyword rules actually derive from the 12 Core Activities, and is the
 *                      reference set for expected-coverage (recall) scoring.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const solarPath = join(here, "..", "..", "..", "workspaces", "solar-example", "business", "narrative.md");

export const solarNarrativeMd: string = readFileSync(solarPath, "utf8");

/** The seven+ capabilities a faithful solar generation should recover (lead → service). */
export const solarExpectedCapabilityIds: string[] = [
  "lead_management",
  "customer_management",
  "planning",
  "offer_management",
  "procurement",
  "installation",
  "billing",
  "monitoring",
];
