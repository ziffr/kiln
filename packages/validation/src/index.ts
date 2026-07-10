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

/** V4 — orphan: a capability with no relationships at all (no deps in/out, no produces/consumes). */
export function validateV4(doc: CapabilityDoc): Finding[] {
  const findings: Finding[] = [];
  if (doc.capabilities.length <= 1) return findings; // a lone capability isn't an orphan
  const dependedOn = new Set<string>();
  for (const c of doc.capabilities) for (const d of c.depends_on ?? []) dependedOn.add(d);
  for (const c of doc.capabilities) {
    if (!c.id) continue;
    const connected =
      (c.depends_on?.length ?? 0) > 0 ||
      (c.produces?.length ?? 0) > 0 ||
      (c.consumes?.length ?? 0) > 0 ||
      dependedOn.has(c.id);
    if (!connected) {
      findings.push(mk("V4.orphan", "minor", `capability '${c.id}' is isolated (no relationships)`, [c.id]));
    }
  }
  return findings;
}

/** V5 — dangling edge: a `depends_on` that references a non-existent capability id. */
export function validateV5(doc: CapabilityDoc): Finding[] {
  const findings: Finding[] = [];
  const ids = new Set(doc.capabilities.map((c) => c.id).filter(Boolean));
  for (const c of doc.capabilities) {
    for (const dep of c.depends_on ?? []) {
      if (!ids.has(dep)) {
        findings.push(mk("V5.dangling", "major", `capability '${c.id}' depends on unknown '${dep}'`, [c.id || "?", dep]));
      }
    }
  }
  return findings;
}

/** V6 — the depends_on graph must be acyclic; report each cycle's path. */
export function validateV6(doc: CapabilityDoc): Finding[] {
  const findings: Finding[] = [];
  const deps = new Map(doc.capabilities.map((c) => [c.id, (c.depends_on ?? []).filter((d) => d)]));
  const state = new Map<string, 0 | 1 | 2>(); // 0=unseen,1=on-stack,2=done
  const reported = new Set<string>();

  const visit = (id: string, stack: string[]): void => {
    state.set(id, 1);
    stack.push(id);
    for (const next of deps.get(id) ?? []) {
      if (!deps.has(next)) continue; // dangling → V5's job
      const s = state.get(next) ?? 0;
      if (s === 1) {
        const cycle = stack.slice(stack.indexOf(next)).concat(next);
        const key = [...cycle].sort().join(",");
        if (!reported.has(key)) {
          reported.add(key);
          findings.push(mk("V6.cycle", "major", `dependency cycle: ${cycle.join(" → ")}`, cycle.slice(0, -1)));
        }
      } else if (s === 0) {
        visit(next, stack);
      }
    }
    stack.pop();
    state.set(id, 2);
  };

  for (const c of doc.capabilities) if (c.id && (state.get(c.id) ?? 0) === 0) visit(c.id, []);
  return findings;
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "with", "their", "its", "this",
  "management", "service", "services",
]);

function sigTokens(s: string): Set<string> {
  return new Set(
    (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/**
 * Overlap coefficient (Szymkiewicz–Simpson): intersection / min(|a|,|b|). Better than Jaccard
 * for "one capability's meaning is largely contained in another's" — the actual overlap smell.
 * Guarded by a minimum token count so tiny descriptions don't trivially subsume.
 */
function overlapCoef(a: Set<string>, b: Set<string>): number {
  if (a.size < 3 || b.size < 3) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / Math.min(a.size, b.size);
}

/** V7 — overlap candidate: two capabilities whose name+purpose are highly similar (heuristic). */
export function validateV7(doc: CapabilityDoc, threshold = 0.7): Finding[] {
  const findings: Finding[] = [];
  const caps = doc.capabilities.filter((c) => c.id);
  const toks = caps.map((c) => sigTokens(`${c.name ?? ""} ${c.purpose ?? ""}`));
  for (let i = 0; i < caps.length; i++) {
    for (let j = i + 1; j < caps.length; j++) {
      if (overlapCoef(toks[i], toks[j]) >= threshold) {
        const pair = [caps[i].id, caps[j].id].sort();
        findings.push(mk("V7.overlap", "minor", `capabilities '${pair[0]}' and '${pair[1]}' look like they overlap`, pair));
      }
    }
  }
  return findings;
}

/** V8 — every LLM-authored capability must carry valid provenance (SPEC-001 §3.2). */
export function validateV8(doc: CapabilityDoc): Finding[] {
  const findings: Finding[] = [];
  for (const c of doc.capabilities) {
    const meta = c.meta as { origin?: string; derivedFrom?: unknown[] } | undefined;
    if (meta?.origin !== "llm") continue; // only LLM-authored caps are held to provenance
    if (!Array.isArray(meta.derivedFrom) || meta.derivedFrom.length === 0) {
      findings.push(finding("V8.provenance", "major", `capability '${c.id}' (llm) has no provenance`, [c.id || "<unknown>"]));
    }
  }
  return findings;
}

/** Run all implemented validators (V1–V2, V4–V8; V3 outcome-coverage needs the narrative). */
export function validateAll(doc: CapabilityDoc): Finding[] {
  return [
    ...validateV1(doc),
    ...validateV2(doc),
    ...validateV4(doc),
    ...validateV5(doc),
    ...validateV6(doc),
    ...validateV7(doc),
    ...validateV8(doc),
  ];
}
