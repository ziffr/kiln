/**
 * @kiln/eval — BEHAVIOUR (commands & events) evaluation (SPEC-004 CE-M2/§8 gate).
 *
 * Mirrors the DM/contexts evals, gold-free, with the quality instrument REV-019 CE-F1 demanded:
 *  1. Defect detection — `scoreEventsCase` runs `validateEvents` over seeded-defect cases.
 *  2. Coverage + over-generation guardrail — `scoreBehaviourCoverage`: every entity has a command/
 *     event, provenance grounded, and NOT an event-storm (commands-per-entity within a band).
 *  3. Quality — `commandRecall`: fraction of a human-blessed reference command set actually present
 *     (matched by name within an entity). Coverage alone is satisfiable by a degenerate create/
 *     update/changed triple; recall against a real reference is not.
 */

import { slug } from "@kiln/ir";
import type { DomainDoc } from "@kiln/compiler";
import { validateEvents, type Finding } from "@kiln/validation";
import type { ExpectedDefect } from "./index.ts";

export interface EventsEvalCase {
  id: string;
  description: string;
  domain: DomainDoc;
  capabilityIds: string[];
  expected: ExpectedDefect[];
}
export interface EventsCaseScore {
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

export function scoreEventsFindings(c: EventsEvalCase, findings: Finding[]): EventsCaseScore {
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
export function scoreEventsCase(c: EventsEvalCase): EventsCaseScore {
  return scoreEventsFindings(c, validateEvents(c.domain, c.capabilityIds));
}
export function aggregateEventsRecall(scores: EventsCaseScore[]): number {
  const total = scores.reduce((a, s) => a + s.expectedCount, 0);
  const hit = scores.reduce((a, s) => a + s.matched, 0);
  return total ? hit / total : 1;
}

export interface BehaviourCoverage {
  commandCoverage: number; // entities with ≥1 command / total
  eventCoverage: number; // entities with ≥1 event / total
  provenanceRate: number; // grounded commands+events / total
  maxCommandsPerEntity: number; // over-generation guardrail
  entitiesWithoutCommand: string[];
}

const isGrounded = (meta: unknown): boolean => {
  const m = (meta ?? {}) as Record<string, unknown>;
  if (m.origin === "authored") return true;
  const d = m.derivedFrom;
  return Array.isArray(d) && d.some((x) => typeof (x as Record<string, unknown>)?.anchor === "string" && ((x as Record<string, unknown>).anchor as string).trim());
};

export function scoreBehaviourCoverage(domain: DomainDoc): BehaviourCoverage {
  const aggs = domain.aggregates.map((a) => a.id);
  const cmds = domain.commands ?? [];
  const evts = domain.events ?? [];
  const cmdAgg = new Set(cmds.map((c) => c.aggregate));
  const evtAgg = new Set(evts.map((e) => e.aggregate));
  const perEntity = new Map<string, number>();
  for (const c of cmds) perEntity.set(c.aggregate, (perEntity.get(c.aggregate) ?? 0) + 1);
  const behaviour = [...cmds, ...evts];
  const grounded = behaviour.filter((b) => isGrounded(b.meta)).length;
  return {
    commandCoverage: aggs.length ? aggs.filter((a) => cmdAgg.has(a)).length / aggs.length : 1,
    eventCoverage: aggs.length ? aggs.filter((a) => evtAgg.has(a)).length / aggs.length : 1,
    provenanceRate: behaviour.length ? grounded / behaviour.length : 1,
    maxCommandsPerEntity: perEntity.size ? Math.max(...perEntity.values()) : 0,
    entitiesWithoutCommand: aggs.filter((a) => !cmdAgg.has(a)),
  };
}

/** Reference behaviour: per entity, the command NAMES a faithful model should recover. */
export type BehaviourReference = { aggregate: string; commands: string[] }[];

/** Fraction of reference commands present in the generated domain (matched by name within entity). */
export function commandRecall(reference: BehaviourReference, domain: DomainDoc): number {
  const byAgg = new Map<string, Set<string>>();
  for (const c of domain.commands ?? []) {
    const s = byAgg.get(c.aggregate) ?? new Set<string>();
    s.add(slug(c.name));
    byAgg.set(c.aggregate, s);
  }
  let total = 0;
  let hit = 0;
  for (const r of reference) {
    for (const name of r.commands) {
      total++;
      if (byAgg.get(r.aggregate)?.has(slug(name))) hit++;
    }
  }
  return total ? hit / total : 1;
}
