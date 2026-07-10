/**
 * @vbd/compiler — authored artifacts → IR (SPEC-001 §3.4, M0 skeleton).
 *
 * M0 scope: compile `capabilities.yaml` (as a parsed object) into an IR graph with
 * correct authored/derived origin tagging + a deterministic buildHash. Narrative parsing
 * and later layers are added in M1+. The compiler reads ONLY authored input (ADR-002).
 */

import {
  type IR,
  type IRNode,
  type IREdge,
  sha256,
  canonical,
  slug,
  edgeId,
} from "@vbd/ir";

export const COMPILER_VERSION = "0.1.0";
export const SCHEMA_VERSION = "0.2";
export const IR_VERSION = "ir/0.1";

/** Mirror of the authored `capabilities.yaml` shape (SPEC-001 §3.2). */
export interface CapabilityInput {
  id: string;
  name: string;
  purpose?: string;
  outcomes?: string[];
  actors?: string[];
  produces?: string[];
  consumes?: string[];
  depends_on?: string[];
  meta?: Record<string, unknown>;
}

export interface CapabilityDoc {
  version: string;
  domain: string;
  capabilities: CapabilityInput[];
}

/** SPEC-002 domain model (aggregates-first): entities each capability owns. */
export interface AggregateInput {
  id: string;
  name: string;
  owner: string; // capability id (exactly one — DM2)
  attributes?: string[];
  references?: string[]; // other aggregate ids this one references (shared entities)
  meta?: Record<string, unknown>;
}

export interface DomainDoc {
  version: string;
  aggregates: AggregateInput[];
}

/** Namespaced IR node id for an aggregate (REV-010 M1: avoid collision with capability ids). */
export function aggregateNodeId(id: string): string {
  return `aggregate:${slug(id)}`;
}

/**
 * Deterministic buildHash binding authored input to compiler + schema versions
 * (SPEC-001 §3.4). Mixes both authored artifacts when a domain model is present (REV-010 M5).
 */
export function computeBuildHash(doc: CapabilityDoc, domain?: DomainDoc): string {
  const domainPart = domain ? canonical(domain) : "";
  return sha256(`${canonical(doc)}|${domainPart}|${COMPILER_VERSION}|${SCHEMA_VERSION}`);
}

export function compileCapabilities(doc: CapabilityDoc, domain?: DomainDoc): IR {
  const nodes = new Map<string, IRNode>();
  const edges = new Map<string, IREdge>();

  const addNode = (n: IRNode): void => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
  };
  const addEdge = (e: IREdge): void => {
    if (!edges.has(e.id)) edges.set(e.id, e);
  };

  // Authored aggregate slugs (SPEC-002): an authored aggregate SUPERSEDES the same-slug derived
  // `domain_object` implied by produces/consumes (REV-010 M2) — the edge retargets to it.
  const aggSlugs = new Set((domain?.aggregates ?? []).map((a) => slug(a.id)));
  /** Node id for a produced/consumed object: the authored aggregate if it exists, else derived. */
  const objectTarget = (name: string): { id: string; authored: boolean } => {
    const s = slug(name);
    return aggSlugs.has(s) ? { id: aggregateNodeId(s), authored: true } : { id: `domain_object:${s}`, authored: false };
  };

  for (const cap of doc.capabilities) {
    // Capabilities are first-class, authored, editable.
    addNode({
      id: cap.id,
      type: "capability",
      origin: "authored",
      label: cap.name ?? cap.id,
      meta: cap.meta ?? {},
    });

    // Outcomes: derived projection of the authored `outcomes` list; edge is authored.
    for (const o of cap.outcomes ?? []) {
      const oid = `outcome:${slug(o)}`;
      addNode({ id: oid, type: "outcome", origin: "derived", label: o, meta: {} });
      addEdge({
        id: edgeId(cap.id, oid, "serves"),
        from: cap.id,
        to: oid,
        type: "serves",
        origin: "authored",
      });
    }

    // Actors: derived nodes (no first-class actor authoring until a later layer).
    for (const a of cap.actors ?? []) {
      addNode({ id: `actor:${slug(a)}`, type: "actor", origin: "derived", label: a, meta: {} });
    }

    // Produced/consumed objects: derived placeholder nodes UNLESS an authored aggregate supersedes.
    for (const d of cap.produces ?? []) {
      const tgt = objectTarget(d);
      if (!tgt.authored) addNode({ id: tgt.id, type: "domain_object", origin: "derived", label: d, meta: {} });
      addEdge({ id: edgeId(cap.id, tgt.id, "produces"), from: cap.id, to: tgt.id, type: "produces", origin: "authored" });
    }
    for (const d of cap.consumes ?? []) {
      const tgt = objectTarget(d);
      if (!tgt.authored) addNode({ id: tgt.id, type: "domain_object", origin: "derived", label: d, meta: {} });
      addEdge({ id: edgeId(cap.id, tgt.id, "consumes"), from: cap.id, to: tgt.id, type: "consumes", origin: "authored" });
    }

    // Capability→capability dependencies: authored edges (target validated later by V5).
    for (const dep of cap.depends_on ?? []) {
      addEdge({
        id: edgeId(cap.id, dep, "depends_on"),
        from: cap.id,
        to: dep,
        type: "depends_on",
        origin: "authored",
      });
    }
  }

  // SPEC-002 domain model: authored aggregate nodes + owns/references edges.
  for (const agg of domain?.aggregates ?? []) {
    const aid = aggregateNodeId(agg.id);
    addNode({
      id: aid,
      type: "aggregate",
      origin: "authored",
      label: agg.name ?? agg.id,
      meta: { ...(agg.meta ?? {}), attributes: agg.attributes ?? [] },
    });
    if (agg.owner) {
      addEdge({ id: edgeId(agg.owner, aid, "owns"), from: agg.owner, to: aid, type: "owns", origin: "authored" });
    }
    for (const ref of agg.references ?? []) {
      const rid = aggregateNodeId(ref);
      addEdge({ id: edgeId(aid, rid, "references"), from: aid, to: rid, type: "references", origin: "authored" });
    }
  }

  const sortedNodes = [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id));
  const sortedEdges = [...edges.values()].sort((a, b) => a.id.localeCompare(b.id));

  return {
    version: IR_VERSION,
    domain: doc.domain,
    nodes: sortedNodes,
    edges: sortedEdges,
    buildHash: computeBuildHash(doc, domain),
  };
}
