/**
 * @vbd/codegen/targets — the EXECUTION-ENGINE BINDING probe (RES-002).
 *
 * RES-001 proved the model projects to code. This probe asks the next question: can the SAME model
 * project onto HETEROGENEOUS execution engines (Postgres for data, n8n for orchestration, a thin
 * generated spine for the rest) instead of one Node service — and can we generate the SEAMS between
 * them? "A full app uses several backends," so the unit of binding is not the whole app; it is each
 * model element's *technical capability*, bound to an engine that provides it.
 *
 * The pivot is a small FIXED taxonomy of technical capabilities that both model elements REQUIRE and
 * engines PROVIDE. It is deliberately NOT the business Capability Map — that stays as the domain
 * language. This is the infrastructure vocabulary underneath it.
 *
 * Pure and isomorphic (no node:*), like the rest of @vbd. Deterministic: binding in → artifacts out.
 */

import { slug } from "@vbd/ir";
import { attributeSpecs, type AttrType, type CapabilityDoc, type DomainDoc, type ContextsDoc, type RolesDoc, type WorkflowsDoc } from "@vbd/compiler";

// ─────────────────────────────────────────────────────────────────────────────
// 1. The technical-capability taxonomy — the pivot table between model and engines.
// ─────────────────────────────────────────────────────────────────────────────

/** What a model element needs an engine to DO. A small, fixed set — the whole design turns on it. */
export type TechCapability =
  | "store" // persist an entity's records (aggregate)
  | "operate" // run a state-changing operation (command)
  | "emit" // publish a fact (event)
  | "react" // run a reaction when a fact occurs (policy)
  | "sequence" // orchestrate an ordered multi-step process (workflow)
  | "authorize"; // enforce who may operate (role)

export const TECH_CAPABILITIES: TechCapability[] = ["store", "operate", "emit", "react", "sequence", "authorize"];

/** How well an engine covers a capability. `none` is a hard "cannot" — binding to it is an error. */
export type Fidelity = "native" | "partial" | "none";

export interface Engine {
  id: string;
  name: string;
  /** the connector the seam layer uses to reach this engine from another. */
  reach: "http" | "sql" | "event" | "in-process";
  provides: Record<TechCapability, Fidelity>;
}

/** Postgres: a first-class store + row-level authz; can emit via LISTEN/NOTIFY; not an orchestrator. */
export const POSTGRES: Engine = {
  id: "postgres",
  name: "PostgreSQL",
  reach: "sql",
  provides: { store: "native", authorize: "native", emit: "partial", operate: "partial", react: "none", sequence: "none" },
};

/** n8n: a cross-system orchestrator — its whole point is reacting + sequencing across services. */
export const N8N: Engine = {
  id: "n8n",
  name: "n8n",
  reach: "http",
  provides: { react: "native", sequence: "native", emit: "partial", operate: "partial", store: "none", authorize: "none" },
};

/** The generated spine (Node): the fallback that fills whatever no external engine covers, and the
 *  hub the others call. Deliberately hand-owned business logic (ADR-002); codegen emits the skeleton. */
export const NODE_SPINE: Engine = {
  id: "node",
  name: "Generated spine (Node)",
  reach: "http",
  provides: { operate: "native", emit: "native", react: "native", sequence: "native", store: "partial", authorize: "partial" },
};

export const ENGINES: Record<string, Engine> = { postgres: POSTGRES, n8n: N8N, node: NODE_SPINE };

// ─────────────────────────────────────────────────────────────────────────────
// 2. The Binding — the AUTHORED topology (which engine serves which capability, per area).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A binding is human-chosen and round-trips like any authored layer (invariant #2). Granularity:
 * a default engine per technical capability, with optional per-AREA overrides — Areas are the natural
 * seam ("the Billing area lives in Odoo; Monitoring lives in Postgres+n8n"). Unspecified → NODE_SPINE.
 */
export interface Binding {
  defaults: Partial<Record<TechCapability, string>>;
  byArea?: Record<string, Partial<Record<TechCapability, string>>>;
}

/** A sensible multi-backend default for the probe: data in Postgres, orchestration in n8n, rest = spine. */
export const DEFAULT_BINDING: Binding = {
  defaults: { store: "postgres", authorize: "postgres", react: "n8n", sequence: "n8n", operate: "node", emit: "node" },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Resolve: every model element → (technical capability, area, bound engine).
// ─────────────────────────────────────────────────────────────────────────────

export type ElementKind = "aggregate" | "command" | "event" | "policy" | "workflow" | "role";

const WORKFLOW_AREA = "app"; // workflows span areas — placed in the implicit app-wide area.

export interface ResolvedElement {
  kind: ElementKind;
  id: string;
  name: string;
  cap: TechCapability;
  areaId: string;
  engineId: string;
}

/** capability id → area id (via the contexts partition). Falls back to a single implicit area. */
function areaResolver(caps: CapabilityDoc, contexts?: ContextsDoc): (capId: string) => string {
  const areaOfCap = new Map<string, string>();
  for (const c of contexts?.contexts ?? []) for (const m of [...(c.capabilities ?? []), ...(c.shared_kernel ?? [])]) areaOfCap.set(m, c.id);
  return (capId: string) => areaOfCap.get(capId) ?? "app";
}

function engineFor(binding: Binding, cap: TechCapability, areaId: string): string {
  return binding.byArea?.[areaId]?.[cap] ?? binding.defaults[cap] ?? NODE_SPINE.id;
}

/** Walk the model and place every element on an engine. The output is the whole topology, flattened. */
export function resolveBinding(
  binding: Binding,
  caps: CapabilityDoc,
  domain: DomainDoc,
  contexts?: ContextsDoc,
  roles?: RolesDoc,
  workflows?: WorkflowsDoc,
): ResolvedElement[] {
  const areaOf = areaResolver(caps, contexts);
  const aggAreaOf = new Map(domain.aggregates.map((a) => [a.id, areaOf(a.owner)]));
  const out: ResolvedElement[] = [];
  const place = (kind: ElementKind, id: string, name: string, cap: TechCapability, areaId: string) =>
    out.push({ kind, id, name, cap, areaId, engineId: engineFor(binding, cap, areaId) });

  for (const a of domain.aggregates) place("aggregate", a.id, a.name || a.id, "store", areaOf(a.owner));
  for (const c of domain.commands ?? []) place("command", c.id, c.name || c.id, "operate", aggAreaOf.get(c.aggregate) ?? WORKFLOW_AREA);
  for (const e of domain.events ?? []) place("event", e.id, e.name || e.id, "emit", aggAreaOf.get(e.aggregate) ?? WORKFLOW_AREA);
  for (const [i, p] of (domain.policies ?? []).entries()) {
    // a policy lives in the area of the entity whose event triggers it.
    const ev = (domain.events ?? []).find((e) => e.id === p.on);
    place("policy", p.id || `policy_${i}`, p.name || `on ${p.on}`, "react", ev ? (aggAreaOf.get(ev.aggregate) ?? WORKFLOW_AREA) : WORKFLOW_AREA);
  }
  for (const w of workflows?.workflows ?? []) place("workflow", w.id, w.name || w.id, "sequence", WORKFLOW_AREA);
  for (const r of roles?.roles ?? []) place("role", r.id, r.name || r.id, "authorize", WORKFLOW_AREA);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Validators — the HONEST part. Reject bindings an engine cannot fulfil; warn on lossy ones.
// ─────────────────────────────────────────────────────────────────────────────

export interface BindingFinding {
  level: "error" | "warn";
  code: string;
  message: string;
}

export function validateBinding(resolved: ResolvedElement[], workflows?: WorkflowsDoc, domain?: DomainDoc): BindingFinding[] {
  const findings: BindingFinding[] = [];
  for (const el of resolved) {
    const engine = ENGINES[el.engineId];
    if (!engine) {
      findings.push({ level: "error", code: "TB1", message: `${el.kind} "${el.name}" bound to unknown engine "${el.engineId}".` });
      continue;
    }
    const fidelity = engine.provides[el.cap];
    if (fidelity === "none") {
      findings.push({ level: "error", code: "TB2", message: `${el.kind} "${el.name}" needs "${el.cap}" but ${engine.name} cannot provide it — rebind or fall back to the spine.` });
    } else if (fidelity === "partial") {
      findings.push({ level: "warn", code: "TB3", message: `${el.kind} "${el.name}" uses ${engine.name}'s PARTIAL "${el.cap}" — lossy; the spine may need to supplement it.` });
    }
  }
  // Referential: workflow steps must reference commands that exist and are operable somewhere.
  const cmdIds = new Set((domain?.commands ?? []).map((c) => c.id));
  for (const w of workflows?.workflows ?? []) {
    for (const s of w.steps ?? []) if (!cmdIds.has(s)) findings.push({ level: "error", code: "TB4", message: `Workflow "${w.name || w.id}" step "${s}" references a command that does not exist.` });
  }
  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Adapters — per engine, project its bound elements into that engine's artifacts.
// ─────────────────────────────────────────────────────────────────────────────

const PG_TYPE: Record<AttrType, string> = {
  text: "text",
  number: "numeric",
  boolean: "boolean",
  date: "date",
  money: "numeric(14,2)",
  reference: "text",
};

/** POSTGRES adapter: bound aggregates → CREATE TABLE (typed cols, PK, FK), plus an RLS sketch from roles. */
export function postgresAdapter(resolved: ResolvedElement[], domain: DomainDoc, roles?: RolesDoc): string {
  const bound = new Set(resolved.filter((r) => r.kind === "aggregate" && r.engineId === "postgres").map((r) => r.id));
  if (bound.size === 0) return "";
  const aggById = new Map(domain.aggregates.map((a) => [a.id, a]));
  const rolesForCap = (capId: string) => (roles?.roles ?? []).filter((r) => (r.capabilities ?? []).includes(capId)).map((r) => slug(r.id));
  const L: string[] = ["-- Generated by @vbd/codegen targets (RES-002) — PostgreSQL DDL. Source of truth is the model.", ""];
  for (const id of bound) {
    const a = aggById.get(id);
    if (!a) continue;
    const table = slug(a.id);
    L.push(`CREATE TABLE ${table} (`);
    const cols: string[] = ["  id text PRIMARY KEY"];
    for (const attr of attributeSpecs(a)) cols.push(`  ${slug(attr.name)} ${attr.type ? PG_TYPE[attr.type] : "text /* type not modelled */"}`);
    for (const ref of a.references ?? []) if (bound.has(ref)) cols.push(`  ${slug(ref)}_id text REFERENCES ${slug(ref)}(id)`);
    L.push(cols.join(",\n"), ");", "");
    // RLS sketch — honest: we know WHICH roles operate this table, but not the row predicate (a gap).
    const rolesForOwner = rolesForCap(a.owner);
    if (rolesForOwner.length) {
      L.push(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      L.push(`-- roles that operate ${a.owner}: ${rolesForOwner.join(", ")}`);
      L.push(`CREATE POLICY ${table}_rw ON ${table} USING (true);  -- TODO: row predicate not modelled (RES-002 gap)`, "");
    }
  }
  return L.join("\n").trim();
}

/** The REST path a command maps to (mirrors generateOpenApi so the seam points at real endpoints). */
const CREATE_VERB = /^(create|add|register|open|new|capture|issue|request|submit|plan|record)_/;
function commandEndpoint(cmd: { id: string; name?: string; aggregate: string }): { method: string; path: string } {
  const res = `${slug(cmd.aggregate)}s`;
  const action = slug(cmd.name || cmd.id);
  if (CREATE_VERB.test(`${action}_`)) return { method: "POST", path: `/${res}` };
  return { method: "POST", path: `/${res}/{id}/${action}` };
}

export interface N8nWorkflow {
  name: string;
  nodes: Array<Record<string, unknown>>;
  connections: Record<string, unknown>;
}

/**
 * n8n adapter: bound policies → a workflow per reaction (event webhook → HTTP call to the command),
 * bound workflows → a workflow per process (manual trigger → chained HTTP calls, one per step).
 * The HTTP nodes target the spine's command endpoints — that IS the cross-engine seam, materialized.
 */
export function n8nAdapter(resolved: ResolvedElement[], domain: DomainDoc, workflows?: WorkflowsDoc, baseUrl = "http://spine.local/api"): N8nWorkflow[] {
  const evName = new Map((domain.events ?? []).map((e) => [e.id, e.name || e.id]));
  const cmdById = new Map((domain.commands ?? []).map((c) => [c.id, c]));
  const httpNode = (name: string, cmdId: string, x: number, y: number): Record<string, unknown> => {
    const cmd = cmdById.get(cmdId);
    const ep = cmd ? commandEndpoint(cmd) : { method: "POST", path: `/unknown/${slug(cmdId)}` };
    return { parameters: { method: ep.method, url: `${baseUrl}${ep.path}`, sendBody: true }, name, type: "n8n-nodes-base.httpRequest", typeVersion: 4, position: [x, y] };
  };
  const out: N8nWorkflow[] = [];

  const boundPolicies = new Set(resolved.filter((r) => r.kind === "policy" && r.engineId === "n8n").map((r) => r.id));
  for (const [i, p] of (domain.policies ?? []).entries()) {
    const pid = p.id || `policy_${i}`;
    if (!boundPolicies.has(pid)) continue;
    const trigger = { parameters: { httpMethod: "POST", path: `on/${slug(p.on)}` }, name: `On ${evName.get(p.on) ?? p.on}`, type: "n8n-nodes-base.webhook", typeVersion: 2, position: [240, 300] };
    const action = httpNode(cmdById.get(p.then)?.name || p.then, p.then, 520, 300);
    out.push({
      name: `Reaction: ${p.name || `on ${evName.get(p.on) ?? p.on}`}`,
      nodes: [trigger, action],
      connections: { [trigger.name as string]: { main: [[{ node: action.name, type: "main", index: 0 }]] } },
    });
  }

  const boundWf = new Set(resolved.filter((r) => r.kind === "workflow" && r.engineId === "n8n").map((r) => r.id));
  for (const w of (workflows?.workflows ?? []).filter((w) => boundWf.has(w.id))) {
    const steps = w.steps ?? [];
    const trigger = { parameters: {}, name: "Start", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [240, 300] };
    const nodes: Array<Record<string, unknown>> = [trigger];
    const connections: Record<string, unknown> = {};
    let prev = trigger.name as string;
    steps.forEach((s, idx) => {
      const node = httpNode(cmdById.get(s)?.name || s, s, 480 + idx * 240, 300);
      nodes.push(node);
      connections[prev] = { main: [[{ node: node.name, type: "main", index: 0 }]] };
      prev = node.name as string;
    });
    out.push({ name: `Process: ${w.name || w.id}`, nodes, connections });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Seams — the cross-engine hops. The crux: which calls cross an engine boundary, and how.
// ─────────────────────────────────────────────────────────────────────────────

export interface Seam {
  from: string; // engine id making the call
  to: string; // engine id being called
  via: Engine["reach"];
  ref: string; // the model element the hop realizes
  note: string;
}

/**
 * Every model EDGE whose two ends land on different engines is a seam. Derived from the model's own
 * cross-layer edges (policy: event→command; workflow: step=command; command→aggregate store) — the
 * wiring already exists in the model; the binding just says which side lives where.
 */
export function deriveSeams(resolved: ResolvedElement[], domain: DomainDoc, workflows?: WorkflowsDoc): Seam[] {
  const engineOf = new Map(resolved.map((r) => [`${r.kind}:${r.id}`, r.engineId]));
  const cmdById = new Map((domain.commands ?? []).map((c) => [c.id, c]));
  const aggEngine = (aggId: string) => resolved.find((r) => r.kind === "aggregate" && r.id === aggId)?.engineId;
  const seams: Seam[] = [];

  // policy (react engine) → command (operate engine)
  for (const [i, p] of (domain.policies ?? []).entries()) {
    const from = engineOf.get(`policy:${p.id || `policy_${i}`}`);
    const to = engineOf.get(`command:${p.then}`);
    if (from && to && from !== to) seams.push({ from, to, via: ENGINES[to]?.reach ?? "http", ref: `policy ${p.name || p.on} → ${cmdById.get(p.then)?.name ?? p.then}`, note: "reaction invokes a command hosted on another engine" });
  }
  // workflow (sequence engine) → each step command (operate engine)
  for (const w of workflows?.workflows ?? []) {
    const from = engineOf.get(`workflow:${w.id}`);
    if (!from) continue;
    for (const s of w.steps ?? []) {
      const to = engineOf.get(`command:${s}`);
      if (to && from !== to) seams.push({ from, to, via: ENGINES[to]?.reach ?? "http", ref: `workflow ${w.name || w.id} → ${cmdById.get(s)?.name ?? s}`, note: "process step invokes a command on another engine" });
    }
  }
  // command (operate engine) → its aggregate store (store engine)
  for (const c of domain.commands ?? []) {
    const from = engineOf.get(`command:${c.id}`);
    const to = aggEngine(c.aggregate);
    if (from && to && from !== to) seams.push({ from, to, via: ENGINES[to]?.reach ?? "sql", ref: `command ${c.name || c.id} → store ${c.aggregate}`, note: "operation reads/writes a store on another engine" });
  }
  return dedupeSeams(seams);
}

function dedupeSeams(seams: Seam[]): Seam[] {
  const seen = new Set<string>();
  return seams.filter((s) => {
    const k = `${s.from}→${s.to}:${s.ref}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. The projection + fidelity report — RES-002's finding.
// ─────────────────────────────────────────────────────────────────────────────

export interface TargetsReport {
  binding: Binding;
  resolved: ResolvedElement[];
  validation: BindingFinding[];
  artifacts: { postgres: string; n8n: N8nWorkflow[] };
  seams: Seam[];
  /** per-engine tally of what it hosts, and what falls back to the spine — the honest coverage picture. */
  coverage: Array<{ engineId: string; elements: number; byKind: Record<string, number> }>;
  /** what the multi-backend projection cannot yet do faithfully — the probe's central finding. */
  gaps: string[];
}

export function projectTargets(
  binding: Binding,
  caps: CapabilityDoc,
  domain: DomainDoc,
  contexts?: ContextsDoc,
  roles?: RolesDoc,
  workflows?: WorkflowsDoc,
): TargetsReport {
  const resolved = resolveBinding(binding, caps, domain, contexts, roles, workflows);
  const validation = validateBinding(resolved, workflows, domain);
  const artifacts = { postgres: postgresAdapter(resolved, domain, roles), n8n: n8nAdapter(resolved, domain, workflows) };
  const seams = deriveSeams(resolved, domain, workflows);

  const byEngine = new Map<string, { elements: number; byKind: Record<string, number> }>();
  for (const el of resolved) {
    const c = byEngine.get(el.engineId) ?? { elements: 0, byKind: {} };
    c.elements++;
    c.byKind[el.kind] = (c.byKind[el.kind] ?? 0) + 1;
    byEngine.set(el.engineId, c);
  }
  const coverageOut = [...byEngine].map(([engineId, c]) => ({ engineId, ...c }));

  const gaps: string[] = [];
  const spineElems = resolved.filter((r) => r.engineId === "node");
  if (spineElems.length) gaps.push(`${spineElems.length} elements fall back to the generated spine (${[...new Set(spineElems.map((s) => s.kind))].join(", ")}) — no external engine natively covered them.`);
  const partials = validation.filter((f) => f.code === "TB3").length;
  if (partials) gaps.push(`${partials} elements sit on a PARTIAL-fidelity engine (lossy) — e.g. events on Postgres are LISTEN/NOTIFY, not a durable bus. Model the delivery guarantee if it matters.`);
  const errs = validation.filter((f) => f.level === "error").length;
  if (errs) gaps.push(`${errs} bindings are INVALID (an engine asked to do what it cannot) — must rebind before generation.`);
  gaps.push("RLS row predicates are not modelled — Postgres policies emit `USING (true)`. Authorization needs a subject/tenant model to be faithful.");
  gaps.push("n8n artifacts are structurally faithful but not verified against a live n8n import — the next probe should round-trip one through a real n8n instance (reuse the Docker verifier).");

  return { binding, resolved, validation, artifacts, seams, coverage: coverageOut, gaps };
}
