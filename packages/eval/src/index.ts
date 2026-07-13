/**
 * @kiln/eval — the gold-free evaluation harness (SPEC-001 §8; REV-006 F1/F2).
 *
 * A case is a business model seeded with KNOWN defects that a correct check must catch.
 * We score recall (did we catch the seeded defects?) and precision (were our findings
 * relevant?). This exists from M0 — before the LLM — so it can measure generation quality
 * in M2/M3 instead of eyeballing. M0 scores against the deterministic validators (V1/V2);
 * V3/V7-class defects live in `pendingCorpus` until those validators land in M3.
 */

import type { CapabilityDoc } from "@kiln/compiler";
import { validateAll, type Finding } from "@kiln/validation";

export { scoreGenerationCoverage, type GenerationCoverage } from "./generation.ts";
export {
  scoreDomainCase,
  scoreDomainFindings,
  aggregateDomainRecall,
  scoreDomainCoverage,
  type DomainEvalCase,
  type DomainCaseScore,
  type DomainCoverage,
} from "./domain.ts";
export {
  scoreContextsCase,
  scoreContextsFindings,
  aggregateContextsRecall,
  scoreContextCoverage,
  partitionAgreement,
  type ContextsEvalCase,
  type ContextsCaseScore,
  type ContextCoverage,
} from "./contexts.ts";
export {
  scoreEventsCase,
  scoreEventsFindings,
  aggregateEventsRecall,
  scoreBehaviourCoverage,
  commandRecall,
  type EventsEvalCase,
  type EventsCaseScore,
  type BehaviourCoverage,
  type BehaviourReference,
} from "./events.ts";
export {
  scorePoliciesCase,
  scorePoliciesFindings,
  aggregatePoliciesRecall,
  scorePolicyCoverage,
  reactionRecall,
  spuriousRate,
  type PoliciesEvalCase,
  type PoliciesCaseScore,
  type PolicyCoverage,
  type PolicyReference,
} from "./policies.ts";

export interface ExpectedDefect {
  /** validator code expected to fire, e.g. "V1.purpose", "V2.unique", (future) "V7.overlap". */
  code: string;
  /** optional subject the finding must reference. */
  subject?: string;
  note?: string;
}

export interface EvalCase {
  id: string;
  description: string;
  doc: CapabilityDoc;
  expected: ExpectedDefect[];
}

export interface CaseScore {
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

/** Score a case against a set of findings (LLM- or validator-produced). */
export function scoreFindings(c: EvalCase, findings: Finding[]): CaseScore {
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

/** Score a case using the deterministic validators available today. */
export function scoreCase(c: EvalCase): CaseScore {
  return scoreFindings(c, validateAll(c.doc));
}

/** Micro-averaged recall across cases (matched defects / total seeded defects). */
export function aggregateRecall(scores: CaseScore[]): number {
  const total = scores.reduce((a, s) => a + s.expectedCount, 0);
  const hit = scores.reduce((a, s) => a + s.matched, 0);
  return total ? hit / total : 1;
}
export {
  scoreRolesCase,
  aggregateRolesRecall,
  scoreRoleCoverage,
  type RolesEvalCase,
  type RolesCaseScore,
  type RoleCoverage,
} from "./roles.ts";
export { scoreWorkflowsCase, aggregateWorkflowsRecall, scoreWorkflowCoverage, type WorkflowsEvalCase, type WorkflowCoverage } from "./workflows.ts";
export { scoreAgentsCase, aggregateAgentsRecall, scoreAgentCoverage, type AgentsEvalCase, type AgentCoverage } from "./agents.ts";
