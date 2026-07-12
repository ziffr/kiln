/**
 * Enrichment as a human-gated diff. An enrichment pass PROPOSES additions (new attributes on an entity,
 * new child entities); this flattens them into individually accept/decline/adjustable proposals, and
 * rebuilds an EnrichmentResult from the ones the human kept. The model proposes; the human decides.
 */

import { slug } from "@vbd/ir";
import { attributeSpecs, type AttributeSpec, type AggregateInput, type DomainDoc } from "@vbd/compiler";
import type { EnrichmentResult } from "@vbd/skills";

export type EnrichSource = "grounded" | "web";

export interface EnrichProposal {
  id: string;
  kind: "attr" | "entity";
  entity: string; // attr: the target entity id; entity: the new entity id
  label: string;
  detail: string;
  source: EnrichSource;
  citation?: string; // a source URL (web research)
  accepted: boolean;
  attr?: AttributeSpec;
  newEntity?: AggregateInput;
}

const entityName = (domain: DomainDoc, id: string): string => domain.aggregates.find((a) => a.id === id)?.name || id;

/** Flatten an enrichment result into individually-acceptable proposals (dedup against what already exists). */
export function flattenEnrichment(e: EnrichmentResult, domain: DomainDoc, source: EnrichSource, citations: Record<string, string> = {}, defaultCitation?: string): EnrichProposal[] {
  const props: EnrichProposal[] = [];
  const existingAttr = new Map(domain.aggregates.map((a) => [a.id, new Set(attributeSpecs(a).map((s) => slug(s.name)))]));
  const existingEntity = new Set(domain.aggregates.map((a) => a.id));
  for (const add of e.additions) {
    const have = existingAttr.get(add.entity);
    for (const a of add.attributes) {
      if (have?.has(slug(a.name))) continue; // already there
      props.push({ id: `attr:${add.entity}:${slug(a.name)}`, kind: "attr", entity: add.entity, label: `${entityName(domain, add.entity)} · ${a.name}`, detail: a.type ?? "text", source, citation: citations[`attr:${add.entity}:${slug(a.name)}`] ?? defaultCitation, accepted: true, attr: a });
    }
  }
  for (const ne of e.newEntities) {
    if (existingEntity.has(ne.id)) continue;
    const refs = (ne.references ?? []).length ? ` · refs ${(ne.references ?? []).join(", ")}` : "";
    props.push({ id: `entity:${ne.id}`, kind: "entity", entity: ne.id, label: ne.name || ne.id, detail: `owner ${ne.owner}${refs} · ${attributeSpecs(ne).length} attrs`, source, citation: citations[`entity:${ne.id}`] ?? defaultCitation, accepted: true, newEntity: ne });
  }
  return props;
}

/** Rebuild an EnrichmentResult from the accepted proposals (ready for applyEnrichment). */
export function rebuildEnrichment(accepted: EnrichProposal[]): EnrichmentResult {
  const byEntity = new Map<string, AttributeSpec[]>();
  const newEntities: AggregateInput[] = [];
  for (const p of accepted) {
    if (p.kind === "attr" && p.attr) (byEntity.get(p.entity) ?? byEntity.set(p.entity, []).get(p.entity)!).push(p.attr);
    else if (p.kind === "entity" && p.newEntity) newEntities.push(p.newEntity);
  }
  return { additions: [...byEntity].map(([entity, attributes]) => ({ entity, attributes })), newEntities, provider: "review" };
}
