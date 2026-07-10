/**
 * @vbd/eval — POLICY (reactions) evaluation (SPEC-005 PL-M2/§8 gate).
 *
 * Defect detection + coverage + the quality instrument the review demanded (REV-022 M4 / REV-024
 * PF-F1): reactions have no conservation law, so coverage is satisfiable by an over-wired blob.
 * `reactionRecall` (did we find the reference hand-offs?) is paired with `spuriousRate` (how much
 * did we over-wire?) so precision, not just recall, gates the layer.
 */

import type { DomainDoc } from "@vbd/compiler";
import { validatePolicies, type Finding } from "@vbd/validation";
import type { ExpectedDefect } from "./index.ts";

export interface PoliciesEvalCase {
  id: string;
  description: string;
  domain: DomainDoc;
  capabilityIds: string[];
  expected: ExpectedDefect[];
}
export interface PoliciesCaseScore {
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
export function scorePoliciesFindings(c: PoliciesEvalCase, findings: Finding[]): PoliciesCaseScore {
  const unmet = c.expected.filter((e) => !findings.some((f) => matches(e, f)));
  const matched = c.expected.length - unmet.length;
  const relevant = findings.filter((f) => c.expected.some((e) => matches(e, f)));
  return { id: c.id, recall: c.expected.length ? matched / c.expected.length : 1, precision: findings.length ? relevant.length / findings.length : 1, matched, expectedCount: c.expected.length, foundCount: findings.length, unmet };
}
export function scorePoliciesCase(c: PoliciesEvalCase): PoliciesCaseScore {
  return scorePoliciesFindings(c, validatePolicies(c.domain, c.capabilityIds));
}
export function aggregatePoliciesRecall(scores: PoliciesCaseScore[]): number {
  const total = scores.reduce((a, s) => a + s.expectedCount, 0);
  const hit = scores.reduce((a, s) => a + s.matched, 0);
  return total ? hit / total : 1;
}

export interface PolicyCoverage {
  provenanceRate: number; // grounded policies / total
  crossEntityRate: number; // cross-entity policies / total (the valuable ones)
  policyCount: number;
  ungrounded: string[];
}
const isGrounded = (meta: unknown): boolean => {
  const m = (meta ?? {}) as Record<string, unknown>;
  if (m.origin === "authored") return true;
  const d = m.derivedFrom;
  return Array.isArray(d) && d.some((x) => typeof (x as Record<string, unknown>)?.anchor === "string" && ((x as Record<string, unknown>).anchor as string).trim());
};
export function scorePolicyCoverage(domain: DomainDoc): PolicyCoverage {
  const policies = domain.policies ?? [];
  const aggOfEvent = new Map((domain.events ?? []).map((e) => [e.id, e.aggregate]));
  const aggOfCommand = new Map((domain.commands ?? []).map((c) => [c.id, c.aggregate]));
  const cross = policies.filter((p) => aggOfEvent.get(p.on) && aggOfEvent.get(p.on) !== aggOfCommand.get(p.then)).length;
  const grounded = policies.filter((p) => isGrounded(p.meta));
  return {
    provenanceRate: policies.length ? grounded.length / policies.length : 1,
    crossEntityRate: policies.length ? cross / policies.length : 1,
    policyCount: policies.length,
    ungrounded: policies.filter((p) => !isGrounded(p.meta)).map((p) => p.id),
  };
}

/** Reference hand-offs a faithful model should recover: (trigger event → reaction command) pairs. */
export type PolicyReference = { on: string; then: string }[];

/** Fraction of reference hand-offs present in the generated policies (matched on the (on,then) edge). */
export function reactionRecall(reference: PolicyReference, domain: DomainDoc): number {
  const have = new Set((domain.policies ?? []).map((p) => `${p.on}|${p.then}`));
  if (reference.length === 0) return 1;
  return reference.filter((r) => have.has(`${r.on}|${r.then}`)).length / reference.length;
}

/** Fraction of GENERATED policies that are NOT in the reference — the over-wiring / spurious signal. */
export function spuriousRate(reference: PolicyReference, domain: DomainDoc): number {
  const ref = new Set(reference.map((r) => `${r.on}|${r.then}`));
  const gen = domain.policies ?? [];
  if (gen.length === 0) return 0;
  return gen.filter((p) => !ref.has(`${p.on}|${p.then}`)).length / gen.length;
}
