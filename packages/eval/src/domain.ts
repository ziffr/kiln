/**
 * @vbd/eval — DOMAIN-layer evaluation (SPEC-002 DM eval; the aggregates-first exit gate).
 *
 * Mirrors the capability harness for the domain model, gold-free:
 *
 *  1. Defect detection (like index.ts) — a `DomainEvalCase` is a domain model seeded with a KNOWN
 *     defect that a correct DM validator must catch. `scoreDomainCase` runs `validateDomain` and
 *     scores recall (seeded defects caught) + precision (findings relevant).
 *
 *  2. Generation coverage (like generation.ts) — `scoreDomainCoverage` asks "did the generated
 *     domain faithfully cover the capabilities?" with three deterministic metrics:
 *       ownershipCoverage — capabilities that own ≥1 aggregate / all capabilities (complement of
 *                           the DM5 warning set).
 *       producesCoverage  — distinct objects the capabilities `produce` that became an aggregate /
 *                           all produced objects (did the domain capture what the business makes?).
 *       provenanceRate    — aggregates carrying grounded provenance (derivedFrom a capability, or
 *                           hand-authored) / all aggregates (the model must ground its output).
 *
 * Pure and deterministic — no LLM, key, or cost. Scores the MOCK generator or any DomainDoc.
 */

import { slug } from "@vbd/ir";
import type { AggregateInput, CapabilityDoc, DomainDoc } from "@vbd/compiler";
import { validateDomain, type Finding } from "@vbd/validation";
import type { ExpectedDefect } from "./index.ts";

export interface DomainEvalCase {
  id: string;
  description: string;
  domain: DomainDoc;
  /** the capability ids the domain is validated against (owners must be among these). */
  capabilityIds: string[];
  expected: ExpectedDefect[];
}

export interface DomainCaseScore {
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

/** Score a domain case against a set of findings (validator- or LLM-produced). */
export function scoreDomainFindings(c: DomainEvalCase, findings: Finding[]): DomainCaseScore {
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

/** Score a domain case using the deterministic DM validators. */
export function scoreDomainCase(c: DomainEvalCase): DomainCaseScore {
  return scoreDomainFindings(c, validateDomain(c.domain, c.capabilityIds));
}

/** Micro-averaged recall across domain cases (matched defects / total seeded defects). */
export function aggregateDomainRecall(scores: DomainCaseScore[]): number {
  const total = scores.reduce((a, s) => a + s.expectedCount, 0);
  const hit = scores.reduce((a, s) => a + s.matched, 0);
  return total ? hit / total : 1;
}

export interface DomainCoverage {
  /** capabilities owning ≥1 aggregate / total capabilities (1 when there are no capabilities). */
  ownershipCoverage: number;
  /** produced objects captured as an aggregate / distinct produced objects (1 when none produced). */
  producesCoverage: number;
  /** aggregates with grounded provenance / total aggregates (1 when there are no aggregates). */
  provenanceRate: number;
  /** capabilities that own no aggregate (the DM5 candidates). */
  uncoveredCapabilities: string[];
  /** produced objects with no matching aggregate. */
  uncapturedProduces: string[];
  /** aggregate ids lacking grounded provenance. */
  ungroundedAggregates: string[];
  ownedCapabilities: number;
  totalCapabilities: number;
  capturedProduces: number;
  totalProduces: number;
  groundedAggregates: number;
  totalAggregates: number;
}

/** An aggregate is grounded if it cites a capability in derivedFrom, or was hand-authored. */
function isGrounded(a: AggregateInput): boolean {
  const meta = (a.meta ?? {}) as Record<string, unknown>;
  if (meta.origin === "authored") return true;
  const derived = meta.derivedFrom;
  return Array.isArray(derived) && derived.some((d) => typeof (d as Record<string, unknown>)?.capability === "string");
}

/**
 * Score how faithfully a generated `DomainDoc` covers a `CapabilityDoc`. Matches a produced object
 * to an aggregate by slug (the mock uses `slug(produced)` as the aggregate id) against either the
 * aggregate's id or its name, so LLM naming variance still counts as captured.
 */
export function scoreDomainCoverage(caps: CapabilityDoc, domain: DomainDoc): DomainCoverage {
  const capIds = caps.capabilities.map((c) => c.id);
  const owners = new Set(domain.aggregates.map((a) => a.owner).filter(Boolean));
  const uncoveredCapabilities = capIds.filter((id) => !owners.has(id));

  const aggKeys = new Set<string>();
  for (const a of domain.aggregates) {
    if (a.id) aggKeys.add(slug(a.id));
    if (a.name) aggKeys.add(slug(a.name));
  }
  const produced = new Set<string>();
  for (const c of caps.capabilities) for (const p of c.produces ?? []) if (slug(p)) produced.add(slug(p));
  const uncapturedProduces = [...produced].filter((p) => !aggKeys.has(p));

  const ungroundedAggregates = domain.aggregates.filter((a) => !isGrounded(a)).map((a) => a.id || a.name || "?");

  const ownedCapabilities = capIds.length - uncoveredCapabilities.length;
  const capturedProduces = produced.size - uncapturedProduces.length;
  const groundedAggregates = domain.aggregates.length - ungroundedAggregates.length;

  return {
    ownershipCoverage: capIds.length ? ownedCapabilities / capIds.length : 1,
    producesCoverage: produced.size ? capturedProduces / produced.size : 1,
    provenanceRate: domain.aggregates.length ? groundedAggregates / domain.aggregates.length : 1,
    uncoveredCapabilities,
    uncapturedProduces,
    ungroundedAggregates,
    ownedCapabilities,
    totalCapabilities: capIds.length,
    capturedProduces,
    totalProduces: produced.size,
    groundedAggregates,
    totalAggregates: domain.aggregates.length,
  };
}
