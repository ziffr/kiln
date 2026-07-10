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

/**
 * Deterministic buildHash binding authored input to compiler + schema versions
 * (SPEC-001 §3.4). Exposed so the store can verify a `.vbd/` cache without recompiling.
 */
export function computeBuildHash(doc: CapabilityDoc): string {
  return sha256(`${canonical(doc)}|${COMPILER_VERSION}|${SCHEMA_VERSION}`);
}

export function compileCapabilities(doc: CapabilityDoc): IR {
  const nodes = new Map<string, IRNode>();
  const edges = new Map<string, IREdge>();

  const addNode = (n: IRNode): void => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
  };
  const addEdge = (e: IREdge): void => {
    if (!edges.has(e.id)) edges.set(e.id, e);
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

    // Produced/consumed domain objects: derived placeholder nodes; edges authored.
    for (const d of cap.produces ?? []) {
      const did = `domain_object:${slug(d)}`;
      addNode({ id: did, type: "domain_object", origin: "derived", label: d, meta: {} });
      addEdge({
        id: edgeId(cap.id, did, "produces"),
        from: cap.id,
        to: did,
        type: "produces",
        origin: "authored",
      });
    }
    for (const d of cap.consumes ?? []) {
      const did = `domain_object:${slug(d)}`;
      addNode({ id: did, type: "domain_object", origin: "derived", label: d, meta: {} });
      addEdge({
        id: edgeId(cap.id, did, "consumes"),
        from: cap.id,
        to: did,
        type: "consumes",
        origin: "authored",
      });
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

  const sortedNodes = [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id));
  const sortedEdges = [...edges.values()].sort((a, b) => a.id.localeCompare(b.id));

  return {
    version: IR_VERSION,
    domain: doc.domain,
    nodes: sortedNodes,
    edges: sortedEdges,
    buildHash: computeBuildHash(doc),
  };
}
