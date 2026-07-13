/**
 * @kiln/eval — BUSINESS-AREAS (subdomain) evaluation (SPEC-003 BC-M2/§8 exit gate).
 *
 * Mirrors the DM eval, gold-free, with one addition the AI review demanded (REV-014 BC-F2): a
 * partition-QUALITY metric, so a degenerate partition (one blob, or one-area-per-capability) FAILS
 * even though it satisfies partitionCompleteness = 1.
 *
 *  1. Defect detection — a `ContextsEvalCase` seeds a known partition defect; `scoreContextsCase`
 *     runs `validateContexts` and scores recall + precision.
 *  2. Coverage — `scoreContextCoverage`: partitionCompleteness (every capability grouped exactly
 *     once), provenanceRate (areas grounded to boundary evidence), + guardrails (area count in a
 *     sane band; no giant area).
 *  3. Quality — `partitionAgreement`: Adjusted Rand Index of the generated partition vs a one-time
 *     human-blessed reference partition. ARI = 1 for a perfect match, ~0 for random, and LOW for
 *     the degenerate partitions that coverage alone can't catch.
 */

import type { CapabilityDoc, ContextsDoc } from "@kiln/compiler";
import { validateContexts, type Finding } from "@kiln/validation";
import type { ExpectedDefect } from "./index.ts";

export interface ContextsEvalCase {
  id: string;
  description: string;
  contexts: ContextsDoc;
  caps: CapabilityDoc;
  expected: ExpectedDefect[];
}

export interface ContextsCaseScore {
  id: string;
  recall: number;
  precision: number;
  matched: number;
  expectedCount: number;
  foundCount: number;
  unmet: ExpectedDefect[];
}

function matches(e: ExpectedDefect, f: Finding): boolean {
  if (f.code !== e.code) return false;
  return e.subject ? f.subjects.includes(e.subject) : true;
}

export function scoreContextsFindings(c: ContextsEvalCase, findings: Finding[]): ContextsCaseScore {
  const unmet = c.expected.filter((e) => !findings.some((f) => matches(e, f)));
  const matched = c.expected.length - unmet.length;
  const relevant = findings.filter((f) => c.expected.some((e) => matches(e, f)));
  return {
    id: c.id,
    recall: c.expected.length ? matched / c.expected.length : 1,
    precision: findings.length ? relevant.length / findings.length : 1,
    matched,
    expectedCount: c.expected.length,
    foundCount: findings.length,
    unmet,
  };
}

export function scoreContextsCase(c: ContextsEvalCase): ContextsCaseScore {
  return scoreContextsFindings(c, validateContexts(c.contexts, c.caps));
}

export function aggregateContextsRecall(scores: ContextsCaseScore[]): number {
  const total = scores.reduce((a, s) => a + s.expectedCount, 0);
  const hit = scores.reduce((a, s) => a + s.matched, 0);
  return total ? hit / total : 1;
}

export interface ContextCoverage {
  /** capabilities grouped in exactly one area / total (1 = a complete partition). */
  partitionCompleteness: number;
  /** areas grounded to boundary evidence / total areas (1 when there are no areas). */
  provenanceRate: number;
  areaCount: number;
  /** largest area size / total capabilities (a giant-area guardrail; lower is healthier). */
  giantAreaRatio: number;
  ungroupedCapabilities: string[];
  ungroundedAreas: string[];
}

function isGrounded(meta: unknown): boolean {
  const m = (meta ?? {}) as Record<string, unknown>;
  if (m.origin === "authored") return true;
  const derived = m.derivedFrom;
  return Array.isArray(derived) && derived.some((d) => typeof (d as Record<string, unknown>)?.anchor === "string" && ((d as Record<string, unknown>).anchor as string).trim());
}

export function scoreContextCoverage(caps: CapabilityDoc, contexts: ContextsDoc): ContextCoverage {
  const capIds = caps.capabilities.map((c) => c.id);
  const primary = new Map<string, number>();
  for (const ctx of contexts.contexts) for (const m of ctx.capabilities ?? []) primary.set(m, (primary.get(m) ?? 0) + 1);
  const ungroupedCapabilities = capIds.filter((id) => (primary.get(id) ?? 0) !== 1);

  const ungroundedAreas = contexts.contexts.filter((c) => !isGrounded(c.meta)).map((c) => c.id || c.name || "?");
  const sizes = contexts.contexts.map((c) => (c.capabilities ?? []).length);
  const giant = sizes.length ? Math.max(...sizes) : 0;

  return {
    partitionCompleteness: capIds.length ? (capIds.length - ungroupedCapabilities.length) / capIds.length : 1,
    provenanceRate: contexts.contexts.length ? (contexts.contexts.length - ungroundedAreas.length) / contexts.contexts.length : 1,
    areaCount: contexts.contexts.length,
    giantAreaRatio: capIds.length ? giant / capIds.length : 0,
    ungroupedCapabilities,
    ungroundedAreas,
  };
}

const choose2 = (n: number): number => (n * (n - 1)) / 2;

/**
 * Adjusted Rand Index between a reference partition (clusters of capability ids) and a generated
 * ContextsDoc, over the capability ids present in the reference. ARI = 1 perfect, ~0 random, and
 * low for degenerate partitions (one blob → all-same; one-per-cap → all-singletons).
 */
export function partitionAgreement(reference: string[][], contexts: ContextsDoc): number {
  const items = reference.flat();
  const refOf = new Map<string, number>();
  reference.forEach((cluster, i) => cluster.forEach((m) => refOf.set(m, i)));
  // predicted cluster index per item (by first area listing it); ungrouped → its own singleton bucket.
  const predOf = new Map<string, number>();
  contexts.contexts.forEach((ctx, i) => (ctx.capabilities ?? []).forEach((m) => { if (!predOf.has(m)) predOf.set(m, i); }));
  let nextSingleton = contexts.contexts.length;
  const predIndex = (m: string): number => (predOf.has(m) ? predOf.get(m)! : nextSingleton++);

  // Contingency table over (reference cluster, predicted cluster) pairs.
  const table = new Map<string, number>();
  const rowSum = new Map<number, number>();
  const colSum = new Map<number, number>();
  for (const m of items) {
    const r = refOf.get(m)!;
    const c = predIndex(m);
    const key = `${r}|${c}`;
    table.set(key, (table.get(key) ?? 0) + 1);
    rowSum.set(r, (rowSum.get(r) ?? 0) + 1);
    colSum.set(c, (colSum.get(c) ?? 0) + 1);
  }
  const n = items.length;
  const sumTable = [...table.values()].reduce((a, v) => a + choose2(v), 0);
  const sumRows = [...rowSum.values()].reduce((a, v) => a + choose2(v), 0);
  const sumCols = [...colSum.values()].reduce((a, v) => a + choose2(v), 0);
  const expected = (sumRows * sumCols) / choose2(n);
  const max = 0.5 * (sumRows + sumCols);
  if (max - expected === 0) return 1; // both trivial partitions that coincide
  return (sumTable - expected) / (max - expected);
}
