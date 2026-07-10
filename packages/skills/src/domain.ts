/**
 * Mock domain-model generator (SPEC-002 DM1, aggregates-first). Deterministic, offline, no key —
 * the surrogate for `DomainGenerator` (like MockProvider is for CapabilityGenerator).
 *
 * Heuristic: each object a capability `produces` becomes an aggregate it owns (first producer
 * wins). Within a capability, its produced aggregates `reference` the aggregates it `consumes`
 * (that are produced elsewhere) — sensible entity relationships without inventing facts.
 * Provenance targets the owning CAPABILITY (REV-009/REV-010: domain elements cite capabilities,
 * not narrative headings).
 */

import { slug } from "@vbd/ir";
import type { AggregateInput, CapabilityDoc, DomainDoc } from "@vbd/compiler";

export function mockGenerateDomain(caps: CapabilityDoc): DomainDoc {
  const aggregates = new Map<string, AggregateInput>();

  // 1. Every produced object → an aggregate owned by its (first) producing capability.
  for (const c of caps.capabilities) {
    for (const p of c.produces ?? []) {
      const id = slug(p);
      if (!id || aggregates.has(id)) continue;
      aggregates.set(id, {
        id,
        name: p,
        owner: c.id,
        attributes: [],
        references: [],
        meta: { origin: "llm", skillVersion: "domaingen-mock@0.1", derivedFrom: [{ capability: c.id }] },
      });
    }
  }

  // 2. Within a capability, produced aggregates reference the aggregates it consumes.
  for (const c of caps.capabilities) {
    const produced = (c.produces ?? []).map((p) => slug(p)).filter((s) => aggregates.has(s));
    const consumed = (c.consumes ?? []).map((p) => slug(p)).filter((s) => aggregates.has(s));
    for (const p of produced) {
      const agg = aggregates.get(p)!;
      const refs = new Set(agg.references ?? []);
      for (const cs of consumed) if (cs !== p) refs.add(cs);
      agg.references = [...refs];
    }
  }

  return { version: "0.1", aggregates: [...aggregates.values()] };
}
