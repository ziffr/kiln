/**
 * @vbd/validation — deterministic validators over authored capabilities (SPEC-001 §5).
 *
 * Pure functions, independent of the LLM. They OWN the objective checks so the fuzzy
 * remainder (boundary/naming) is all that's left to the model (SPEC-001 §5.1).
 * M0 implements V1 (required fields) and V2 (unique/stable ids). V3–V8 land in M3.
 *
 * Findings carry a stable, content-addressed id (SPEC-001 §4.4) so dismissals survive
 * recompiles and re-runs.
 */

import { sha256 } from "@vbd/ir";
import type { CapabilityDoc } from "@vbd/compiler";

export type Severity = "blocker" | "major" | "minor";

export interface Finding {
  /** content-addressed: hash(code + normalized subjects). Stable across runs. */
  id: string;
  code: string;
  severity: Severity;
  message: string;
  subjects: string[];
}

const ID_RE = /^[a-z][a-z0-9_]*$/;

/** Content-addressed finding id — stable across runs (SPEC-001 §4.4). */
export function findingId(code: string, subjects: string[]): string {
  return sha256(`${code}|${[...subjects].sort().join(",")}`).slice(0, 16);
}

/** Finding factory shared by all validators (including narrative validators in @vbd/narrative). */
export function finding(code: string, severity: Severity, message: string, subjects: string[]): Finding {
  return { id: findingId(code, subjects), code, severity, message, subjects };
}

const mk = finding;

/** V1 — required fields: id, name, purpose, ≥1 outcome. */
export function validateV1(doc: CapabilityDoc): Finding[] {
  const findings: Finding[] = [];
  for (const c of doc.capabilities) {
    const subject = c.id || c.name || "<unknown>";
    if (!c.id || !c.id.trim()) {
      findings.push(mk("V1.id", "blocker", "capability is missing an id", [subject]));
    }
    if (!c.name || !c.name.trim()) {
      findings.push(mk("V1.name", "major", `capability '${subject}' is missing a name`, [subject]));
    }
    if (!c.purpose || !c.purpose.trim()) {
      findings.push(mk("V1.purpose", "major", `capability '${subject}' is missing a purpose`, [subject]));
    }
    if (!c.outcomes || c.outcomes.length === 0) {
      findings.push(mk("V1.outcomes", "major", `capability '${subject}' has no outcomes`, [subject]));
    }
  }
  return findings;
}

/** V2 — ids are unique and stable slugs. */
export function validateV2(doc: CapabilityDoc): Finding[] {
  const findings: Finding[] = [];
  const counts = new Map<string, number>();
  for (const c of doc.capabilities) {
    if (!c.id) continue;
    counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
    if (!ID_RE.test(c.id)) {
      findings.push(mk("V2.slug", "major", `id '${c.id}' is not a stable slug (^[a-z][a-z0-9_]*$)`, [c.id]));
    }
  }
  for (const [id, n] of counts) {
    if (n > 1) {
      findings.push(mk("V2.unique", "blocker", `duplicate capability id '${id}' (${n}×)`, [id]));
    }
  }
  return findings;
}

/** Run all M0 validators. */
export function validateAll(doc: CapabilityDoc): Finding[] {
  return [...validateV1(doc), ...validateV2(doc)];
}
