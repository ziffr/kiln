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
 * Business-friendly attribute types (RES-001 codegen gap: untyped attributes → `unknown` schemas).
 * A small closed set the operator can choose from; codegen maps each to a concrete TS/OpenAPI type.
 */
export type AttrType = "text" | "number" | "boolean" | "date" | "money" | "reference";

export interface AttributeSpec {
  name: string;
  type?: AttrType; // absent = untyped (back-compat / not yet decided)
}

/** SPEC-002 domain model (aggregates-first): entities each capability owns. */
export interface AggregateInput {
  id: string;
  name: string;
  owner: string; // capability id (exactly one — DM2)
  /** attribute names, or typed specs. Plain strings stay valid (back-compat, coerced on read). */
  attributes?: (string | AttributeSpec)[];
  references?: string[]; // other aggregate ids this one references (shared entities)
  meta?: Record<string, unknown>;
}

/** Normalize an aggregate's attributes to typed specs — accepts legacy `string[]` and mixed arrays. */
export function attributeSpecs(agg: Pick<AggregateInput, "attributes">): AttributeSpec[] {
  return (agg.attributes ?? []).map((a) => (typeof a === "string" ? { name: a } : a));
}

/** SPEC-004 behaviour layer. A command is a REQUEST that may be rejected → it emits 0..n events. */
export interface CommandInput {
  id: string;
  name: string;
  aggregate: string; // the aggregate it changes (exactly one)
  capability: string; // the capability that issues it
  emits?: string[]; // ids of events it may emit (0..n; reject paths emit none)
  meta?: Record<string, unknown>;
}

/** An event is a past-tense fact. `trigger` distinguishes command-caused vs time/external (CE-C5). */
export type EventTrigger = "command" | "time" | "external";
export interface EventInput {
  id: string;
  name: string;
  aggregate: string; // the aggregate it is a fact about (exactly one)
  trigger?: EventTrigger; // default "command"
  meta?: Record<string, unknown>;
}

/** SPEC-005 reaction rule: when an event occurs, issue a command (a stateless cross-entity hand-off). */
export interface PolicyInput {
  id: string;
  name: string;
  on: string; // trigger: an event id
  then: string; // reaction: a command id
  condition?: string; // plain-language guard (not evaluated — N1)
  meta?: Record<string, unknown>;
}

export interface DomainDoc {
  version: string;
  aggregates: AggregateInput[];
  /** SPEC-004 — behaviour on the aggregates (optional; absent on pre-behaviour snapshots). */
  commands?: CommandInput[];
  events?: EventInput[];
  /** SPEC-005 — reactions wiring events to downstream commands. */
  policies?: PolicyInput[];
}

/** SPEC-003 business-areas layer: a partition of capabilities into subdomains ("areas"). */
export interface ContextInput {
  id: string;
  name: string;
  intent?: string;
  capabilities: string[]; // member capability ids (the partition; exactly one area per cap — BC2)
  shared_kernel?: string[]; // capabilities intentionally also in another area (BC2 escape)
  meta?: Record<string, unknown>;
}

export interface ContextsDoc {
  version: string;
  contexts: ContextInput[];
}

/** SPEC-006 role: an authorized persona responsible for a set of capabilities. */
export interface RoleInput {
  id: string;
  name: string;
  capabilities: string[]; // capability ids this role may operate
  meta?: Record<string, unknown>;
}

export interface RolesDoc {
  version: string;
  roles: RoleInput[];
}

/** SPEC-007 workflow: a named multi-step process (an ordered sequence of commands). */
export interface WorkflowInput {
  id: string;
  name: string;
  steps: string[]; // ordered command ids
  meta?: Record<string, unknown>;
}
export interface WorkflowsDoc {
  version: string;
  workflows: WorkflowInput[];
}

/** SPEC-008 agent: an autonomous operator responsible for a set of capabilities. */
export interface AgentInput {
  id: string;
  name: string;
  capabilities: string[]; // capability ids it operates
  goal?: string; // one-line objective
  /** authored behaviour a human augments — the system prompt / operating instructions for the agent. */
  instructions?: string;
  /** per-agent model + thinking level (Anthropic). Fall back to the runtime's env defaults if unset. */
  model?: string;
  effort?: "low" | "medium" | "high" | "max";
  meta?: Record<string, unknown>;
}
export interface AgentsDoc {
  version: string;
  agents: AgentInput[];
}

/** Namespaced IR node id for an aggregate (REV-010 M1: avoid collision with capability ids). */
export function aggregateNodeId(id: string): string {
  return `aggregate:${slug(id)}`;
}

/** Namespaced IR node id for a business area (SPEC-003; REV-015: collision-free with cap/aggregate ids). */
export function contextNodeId(id: string): string {
  return `bctx:${slug(id)}`;
}

/** Namespaced IR node ids for SPEC-004 behaviour elements (collision-free across all id spaces). */
export function commandNodeId(id: string): string {
  return `command:${slug(id)}`;
}
export function eventNodeId(id: string): string {
  return `event:${slug(id)}`;
}
export function policyNodeId(id: string): string {
  return `policy:${slug(id)}`;
}
export function roleNodeId(id: string): string {
  return `role:${slug(id)}`;
}
export function workflowNodeId(id: string): string {
  return `workflow:${slug(id)}`;
}
export function agentNodeId(id: string): string {
  return `agent:${slug(id)}`;
}

/**
 * Deterministic buildHash binding authored input to compiler + schema versions
 * (SPEC-001 §3.4). Mixes every authored artifact present — capabilities, domain (REV-010 M5),
 * and the business-areas partition (SPEC-003 / REV-015 M2) — plus the compiler + schema versions.
 */
export function computeBuildHash(doc: CapabilityDoc, domain?: DomainDoc, contexts?: ContextsDoc, roles?: RolesDoc, workflows?: WorkflowsDoc, agents?: AgentsDoc): string {
  const parts = [domain, contexts, roles, workflows, agents].map((a) => (a ? canonical(a) : "")).join("|");
  return sha256(`${canonical(doc)}|${parts}|${COMPILER_VERSION}|${SCHEMA_VERSION}`);
}

export function compileCapabilities(doc: CapabilityDoc, domain?: DomainDoc, contexts?: ContextsDoc, roles?: RolesDoc, workflows?: WorkflowsDoc, agents?: AgentsDoc): IR {
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

  // SPEC-004 behaviour: authored command/event nodes + issues/changes/emits/on edges.
  for (const cmd of domain?.commands ?? []) {
    const cid = commandNodeId(cmd.id);
    addNode({ id: cid, type: "command", origin: "authored", label: cmd.name ?? cmd.id, meta: cmd.meta ?? {} });
    if (cmd.capability) addEdge({ id: edgeId(cmd.capability, cid, "issues"), from: cmd.capability, to: cid, type: "issues", origin: "authored" });
    if (cmd.aggregate) {
      const aid = aggregateNodeId(cmd.aggregate);
      addEdge({ id: edgeId(cid, aid, "changes"), from: cid, to: aid, type: "changes", origin: "authored" });
    }
    for (const ev of cmd.emits ?? []) {
      const eid = eventNodeId(ev);
      addEdge({ id: edgeId(cid, eid, "emits"), from: cid, to: eid, type: "emits", origin: "authored" });
    }
  }
  for (const evt of domain?.events ?? []) {
    const eid = eventNodeId(evt.id);
    addNode({ id: eid, type: "event", origin: "authored", label: evt.name ?? evt.id, meta: { ...(evt.meta ?? {}), trigger: evt.trigger ?? "command" } });
    if (evt.aggregate) {
      const aid = aggregateNodeId(evt.aggregate);
      addEdge({ id: edgeId(eid, aid, "on"), from: eid, to: aid, type: "on", origin: "authored" });
    }
  }

  // SPEC-005 policies: authored policy nodes + when (event → policy) + then (policy → command) edges.
  for (const pol of domain?.policies ?? []) {
    const pid = policyNodeId(pol.id);
    addNode({ id: pid, type: "policy", origin: "authored", label: pol.name ?? pol.id, meta: { ...(pol.meta ?? {}), condition: pol.condition ?? "" } });
    if (pol.on) addEdge({ id: edgeId(eventNodeId(pol.on), pid, "when"), from: eventNodeId(pol.on), to: pid, type: "when", origin: "authored" });
    if (pol.then) addEdge({ id: edgeId(pid, commandNodeId(pol.then), "then"), from: pid, to: commandNodeId(pol.then), type: "then", origin: "authored" });
  }

  // SPEC-003 business areas: authored bounded_context nodes + `groups` edges (area → capability).
  // A capability id is used verbatim as the edge target — the same id space as the capability nodes,
  // so groups edges connect to real capability nodes; area ids are namespaced `bctx:` to avoid clash.
  for (const ctx of contexts?.contexts ?? []) {
    const cid = contextNodeId(ctx.id);
    addNode({
      id: cid,
      type: "bounded_context",
      origin: "authored",
      label: ctx.name ?? ctx.id,
      meta: { ...(ctx.meta ?? {}), intent: ctx.intent ?? "" },
    });
    for (const member of [...(ctx.capabilities ?? []), ...(ctx.shared_kernel ?? [])]) {
      addEdge({ id: edgeId(cid, member, "groups"), from: cid, to: member, type: "groups", origin: "authored" });
    }
  }

  // SPEC-006 roles: authored role nodes + `authorizes` edges (role → capability).
  for (const role of roles?.roles ?? []) {
    const rid = roleNodeId(role.id);
    addNode({ id: rid, type: "role", origin: "authored", label: role.name ?? role.id, meta: role.meta ?? {} });
    for (const capId of role.capabilities ?? []) {
      addEdge({ id: edgeId(rid, capId, "authorizes"), from: rid, to: capId, type: "authorizes", origin: "authored" });
    }
  }

  // SPEC-007 workflows: authored workflow nodes (ordered steps in meta) + `step` edges → commands.
  for (const wf of workflows?.workflows ?? []) {
    const wid = workflowNodeId(wf.id);
    addNode({ id: wid, type: "workflow", origin: "authored", label: wf.name ?? wf.id, meta: { ...(wf.meta ?? {}), steps: wf.steps ?? [] } });
    for (const cmd of wf.steps ?? []) addEdge({ id: edgeId(wid, commandNodeId(cmd), "step"), from: wid, to: commandNodeId(cmd), type: "step", origin: "authored" });
  }

  // SPEC-008 agents: authored agent nodes + `operates` edges (agent → capability).
  for (const agent of agents?.agents ?? []) {
    const aid = agentNodeId(agent.id);
    addNode({ id: aid, type: "agent", origin: "authored", label: agent.name ?? agent.id, meta: { ...(agent.meta ?? {}), goal: agent.goal ?? "" } });
    for (const capId of agent.capabilities ?? []) addEdge({ id: edgeId(aid, capId, "operates"), from: aid, to: capId, type: "operates", origin: "authored" });
  }

  const sortedNodes = [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id));
  const sortedEdges = [...edges.values()].sort((a, b) => a.id.localeCompare(b.id));

  return {
    version: IR_VERSION,
    domain: doc.domain,
    nodes: sortedNodes,
    edges: sortedEdges,
    buildHash: computeBuildHash(doc, domain, contexts, roles, workflows, agents),
  };
}
