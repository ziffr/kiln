/**
 * Generic enrichment for the "named-item" layers (capabilities, roles, agents) — the same accept/decline/
 * adjust flow as the domain layer, but proposing whole items. A light grounded source (common additions)
 * works offline; the web-research source makes them industry-specific. Items merge into the layer doc.
 */

import { slug } from "@vbd/ir";
import type { CapabilityDoc, RolesDoc, AgentsDoc } from "@vbd/compiler";
import type { EnrichProposal, EnrichSource } from "./enrichReview";

export type EnrichLayer = "capabilities" | "roles" | "agents";

// Generic, industry-agnostic additions a business often has — a starting point the human accepts/declines
// (web research replaces these with vertical-specific ones).
const COMMON: Record<EnrichLayer, Array<Record<string, unknown>>> = {
  capabilities: [
    { name: "Customer Support", purpose: "Handle customer questions and issues after the sale." },
    { name: "Reporting & Analytics", purpose: "Track performance and produce management reports." },
    { name: "Compliance", purpose: "Meet regulatory, legal and contractual requirements." },
    { name: "Marketing", purpose: "Acquire and nurture demand." },
  ],
  roles: [{ name: "Manager" }, { name: "Support Agent" }, { name: "Finance Clerk" }, { name: "Administrator" }],
  agents: [
    { name: "Support Assistant", goal: "Resolve customer issues end to end." },
    { name: "Reporting Agent", goal: "Compile and send periodic reports." },
  ],
};

export function groundedLayerItems(layer: EnrichLayer, existing: Set<string>): Array<Record<string, unknown>> {
  return COMMON[layer].filter((c) => !existing.has(slug(String(c.name))));
}

/** Flatten proposed items into review proposals, deduped against existing ids (and within the batch). */
export function flattenLayerItems(
  layer: EnrichLayer,
  items: unknown[],
  existing: Set<string>,
  validCaps: Set<string>,
  capName: (id: string) => string,
  source: EnrichSource,
  cite?: string,
): EnrichProposal[] {
  const props: EnrichProposal[] = [];
  const seen = new Set(existing);
  for (const raw of items) {
    const o = (raw ?? {}) as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name) continue;
    const id = slug(typeof o.id === "string" && o.id ? o.id : name);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const caps = (Array.isArray(o.capabilities) ? o.capabilities : []).map((c) => slug(String(c))).filter((c) => validCaps.has(c));
    let detail = "";
    let item: unknown;
    if (layer === "capabilities") {
      const purpose = typeof o.purpose === "string" ? o.purpose : "";
      detail = purpose;
      item = { id, name, purpose, outcomes: [], meta: { origin: source } };
    } else if (layer === "roles") {
      detail = caps.map(capName).join(", ");
      item = { id, name, capabilities: caps, meta: { origin: source } };
    } else {
      const goal = typeof o.goal === "string" ? o.goal : "";
      detail = goal || caps.map(capName).join(", ");
      item = { id, name, goal, capabilities: caps, meta: { origin: source } };
    }
    props.push({ id: `${layer}:${id}`, kind: layer, group: layer, entity: id, label: name, detail, source, citation: cite, accepted: true, item });
  }
  return props;
}

/** Append the accepted items to the layer doc (dedup by id). */
export function applyLayerItems(layer: EnrichLayer, caps: CapabilityDoc, roles: RolesDoc, agents: AgentsDoc, accepted: EnrichProposal[]): { capabilities?: CapabilityDoc; roles?: RolesDoc; agents?: AgentsDoc } {
  const items = accepted.filter((p) => p.item).map((p) => p.item as { id: string });
  if (layer === "capabilities") {
    const have = new Set(caps.capabilities.map((c) => c.id));
    return { capabilities: { ...caps, capabilities: [...caps.capabilities, ...items.filter((i) => !have.has(i.id))] } as CapabilityDoc };
  }
  if (layer === "roles") {
    const have = new Set(roles.roles.map((r) => r.id));
    return { roles: { ...roles, roles: [...roles.roles, ...items.filter((i) => !have.has(i.id))] } as RolesDoc };
  }
  const have = new Set(agents.agents.map((a) => a.id));
  return { agents: { ...agents, agents: [...agents.agents, ...items.filter((i) => !have.has(i.id))] } as AgentsDoc };
}
