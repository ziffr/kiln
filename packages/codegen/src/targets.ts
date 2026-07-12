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
import { shadcnAdapter, DEFAULT_THEME, type Theme } from "./ui.ts";

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
  | "authorize" // enforce who may operate (role)
  | "serve-ui"; // present the app's screens (app-level, not per-element)

export const TECH_CAPABILITIES: TechCapability[] = ["store", "operate", "emit", "react", "sequence", "authorize", "serve-ui"];

/** How well an engine covers a capability. `none` is a hard "cannot" — binding to it is an error. */
export type Fidelity = "native" | "partial" | "none";

export interface Engine {
  id: string;
  name: string;
  /** the connector the seam layer uses to reach this engine from another. */
  reach: "http" | "sql" | "event" | "in-process";
  provides: Record<TechCapability, Fidelity>;
  /**
   * True when the engine's operate/react/authorize only work on ITS OWN store — a full platform like
   * Odoo owns a whole vertical slice; you cannot run its methods against a table living elsewhere.
   * Drives the TB5 coherence check and is why the natural binding unit is an Area, not one capability.
   */
  couplesStore?: boolean;
}

/** Postgres: a first-class store + row-level authz; can emit via LISTEN/NOTIFY; not an orchestrator. */
export const POSTGRES: Engine = {
  id: "postgres",
  name: "PostgreSQL",
  reach: "sql",
  provides: { store: "native", authorize: "native", emit: "partial", operate: "partial", react: "none", sequence: "none", "serve-ui": "none" },
};

/** n8n: a cross-system orchestrator — its whole point is reacting + sequencing across services. */
export const N8N: Engine = {
  id: "n8n",
  name: "n8n",
  reach: "http",
  provides: { react: "native", sequence: "native", emit: "partial", operate: "partial", store: "none", authorize: "none", "serve-ui": "none" },
};

/** The generated spine (Node): the fallback that fills whatever no external engine covers, and the
 *  hub the others call. Deliberately hand-owned business logic (ADR-002); codegen emits the skeleton. */
export const NODE_SPINE: Engine = {
  id: "node",
  name: "Generated spine (Node)",
  reach: "http",
  provides: { operate: "native", emit: "native", react: "native", sequence: "native", store: "partial", authorize: "partial", "serve-ui": "partial" },
};

/** shadcn/ui: a UI-only engine — a generated Vite/React/shadcn front-end. Serves the app's screens;
 *  provides nothing else. The first `serve-ui` adapter (structure derived; skin = a Theme). */
export const SHADCN: Engine = {
  id: "shadcn",
  name: "shadcn/ui (React)",
  reach: "http",
  provides: { "serve-ui": "native", store: "none", operate: "none", emit: "none", react: "none", sequence: "none", authorize: "none" },
};

/** Odoo: a full business platform — owns a whole vertical slice (store + operate + authz + react),
 *  so it couples to its own store. The engine that shrinks the spine the most. */
export const ODOO: Engine = {
  id: "odoo",
  name: "Odoo",
  reach: "http",
  couplesStore: true,
  provides: { store: "native", operate: "native", emit: "native", react: "native", sequence: "partial", authorize: "native", "serve-ui": "native" },
};

export const ENGINES: Record<string, Engine> = { postgres: POSTGRES, n8n: N8N, node: NODE_SPINE, odoo: ODOO, shadcn: SHADCN };

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
  defaults: { store: "postgres", authorize: "postgres", react: "n8n", sequence: "n8n", operate: "node", emit: "node", "serve-ui": "shadcn" },
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
function areaResolver(contexts?: ContextsDoc): (capId: string) => string {
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
  const areaOf = areaResolver(contexts);
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
  // TB5 coherence: an engine that couples to its own store (e.g. Odoo) cannot operate/react on a store
  // living elsewhere. A command's store, and a policy's triggering store, must be the SAME engine.
  const storeEngineOfAgg = new Map(resolved.filter((r) => r.kind === "aggregate").map((r) => [r.id, r.engineId]));
  const cmdAggById = new Map((domain?.commands ?? []).map((c) => [c.id, c.aggregate]));
  const evAggById = new Map((domain?.events ?? []).map((e) => [e.id, e.aggregate]));
  for (const el of resolved) {
    const engine = ENGINES[el.engineId];
    if (!engine?.couplesStore) continue;
    const aggId = el.kind === "command" ? cmdAggById.get(el.id) : el.kind === "policy" ? evAggById.get((domain?.policies ?? []).find((p, i) => (p.id || `policy_${i}`) === el.id)?.on ?? "") : undefined;
    if (!aggId) continue;
    const storeEngine = storeEngineOfAgg.get(aggId);
    if (storeEngine && storeEngine !== el.engineId) {
      findings.push({ level: "error", code: "TB5", message: `${el.kind} "${el.name}" is on ${engine.name}, but its data ("${aggId}") is stored on ${ENGINES[storeEngine]?.name ?? storeEngine}. ${engine.name} owns a whole slice — bind that entity's store to ${engine.name} too (bind the Area).` });
    }
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
  /** required by n8n's `import:workflow` (NOT NULL on workflow_entity.id) — a stable, deterministic id. */
  id: string;
  name: string;
  nodes: Array<Record<string, unknown>>;
  connections: Record<string, unknown>;
  active: boolean;
  settings: Record<string, unknown>;
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
      id: `vbd_reaction_${slug(pid)}`,
      name: `Reaction: ${p.name || `on ${evName.get(p.on) ?? p.on}`}`,
      nodes: [trigger, action],
      connections: { [trigger.name as string]: { main: [[{ node: action.name, type: "main", index: 0 }]] } },
      active: false,
      settings: { executionOrder: "v1" },
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
    out.push({ id: `vbd_process_${slug(w.id)}`, name: `Process: ${w.name || w.id}`, nodes, connections, active: false, settings: { executionOrder: "v1" } });
  }
  return out;
}

const ODOO_FIELD: Record<AttrType, string> = {
  text: "fields.Char()",
  number: "fields.Float()",
  boolean: "fields.Boolean()",
  date: "fields.Date()",
  money: 'fields.Monetary(currency_field="currency_id")',
  reference: "", // handled as Many2one below
};

const cls = (s: string): string => slug(s).split("_").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("");

/**
 * ODOO adapter: a full, installable Odoo module from the model. Aggregates → `models.Model` (typed
 * fields, Many2one relations); commands → model methods (business logic hand-owned per ADR-002);
 * roles → `res.groups` + `ir.model.access.csv`; policies → `base.automation` records. This is the
 * engine that swallows a whole vertical slice — store + operate + authorize + react all land here.
 *
 * Returns the module as a path→content map (an Odoo module IS a directory).
 */
export function odooAdapter(resolved: ResolvedElement[], caps: CapabilityDoc, domain: DomainDoc, roles?: RolesDoc): Record<string, string> {
  const mod = slug(caps.domain || "vbd") || "vbd";
  const storeAggs = new Set(resolved.filter((r) => r.kind === "aggregate" && r.engineId === "odoo").map((r) => r.id));
  if (storeAggs.size === 0) return {};
  const aggById = new Map(domain.aggregates.map((a) => [a.id, a]));
  const model = (aggId: string) => `${mod}.${slug(aggId).replace(/_/g, ".")}`;
  const modelXmlId = (aggId: string) => `model_${model(aggId).replace(/\./g, "_")}`;
  const opCmds = new Set(resolved.filter((r) => r.kind === "command" && r.engineId === "odoo").map((r) => r.id));
  const evName = new Map((domain.events ?? []).map((e) => [e.id, e.name || e.id]));

  // models.py — one class per bound aggregate.
  const M: string[] = ["# Generated by @vbd/codegen targets (RES-002) — Odoo models. Business logic is hand-owned (ADR-002).", "from odoo import models, fields", ""];
  for (const id of storeAggs) {
    const a = aggById.get(id);
    if (!a) continue;
    const specs = attributeSpecs(a);
    const hasMoney = specs.some((s) => s.type === "money");
    M.push(`class ${cls(a.id)}(models.Model):`);
    M.push(`    _name = ${JSON.stringify(model(a.id))}`);
    M.push(`    _description = ${JSON.stringify(a.name || a.id)}`, "");
    for (const s of specs) M.push(`    ${slug(s.name)} = ${s.type ? ODOO_FIELD[s.type] : "fields.Char()  # type not modelled"}`);
    if (hasMoney) M.push(`    currency_id = fields.Many2one("res.currency", default=lambda s: s.env.company.currency_id)`);
    for (const ref of a.references ?? []) if (storeAggs.has(ref)) M.push(`    ${slug(ref)}_id = fields.Many2one(${JSON.stringify(model(ref))})  # reference`);
    // commands operable on this model → methods.
    const cmds = (domain.commands ?? []).filter((c) => c.aggregate === a.id && opCmds.has(c.id));
    for (const c of cmds) {
      const emits = (c.emits ?? []).map((e) => evName.get(e) ?? e);
      M.push("", `    def ${slug(c.id)}(self):`);
      M.push(`        """${c.name}${emits.length ? ` — emits: ${emits.join(", ")}` : ""}. TODO: business logic."""`);
      M.push(`        self.ensure_one()`, `        return True`);
    }
    M.push("");
  }

  // security: res.groups per role + ir.model.access.csv.
  const rolesForCap = (capId: string) => (roles?.roles ?? []).filter((r) => (r.capabilities ?? []).includes(capId));
  const usedRoles = new Map<string, string>(); // roleId -> name
  const acl: string[] = ["id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink"];
  for (const id of storeAggs) {
    const a = aggById.get(id);
    if (!a) continue;
    for (const r of rolesForCap(a.owner)) {
      usedRoles.set(r.id, r.name || r.id);
      acl.push(`access_${slug(a.id)}_${slug(r.id)},${slug(a.id)} ${slug(r.id)},${modelXmlId(a.id)},group_${slug(r.id)},1,1,1,0`);
    }
  }
  const groups: string[] = ["<odoo>"];
  for (const [rid, rname] of usedRoles) groups.push(`  <record id="group_${slug(rid)}" model="res.groups"><field name="name">${rname}</field></record>`);
  groups.push("</odoo>");

  // data: base.automation per policy bound to odoo whose trigger event is an odoo-stored model.
  const autoRecords: string[] = [];
  (domain.policies ?? []).forEach((p, i) => {
    const pid = p.id || `policy_${i}`;
    const onOdoo = resolved.some((r) => r.kind === "policy" && r.id === pid && r.engineId === "odoo");
    const ev = (domain.events ?? []).find((e) => e.id === p.on);
    const cmd = (domain.commands ?? []).find((c) => c.id === p.then);
    if (!onOdoo || !ev || !cmd || !storeAggs.has(ev.aggregate)) return;
    const sameModel = cmd.aggregate === ev.aggregate;
    const code = sameModel
      ? `for record in records:\n    record.${slug(cmd.id)}()`
      : `# cross-model reaction → ${model(cmd.aggregate)}\nfor target in env[${JSON.stringify(model(cmd.aggregate))}].search([]):\n    target.${slug(cmd.id)}()  # TODO: correlate to the triggering record`;
    const nm = p.name || `on ${evName.get(p.on) ?? p.on}`;
    // Odoo 16+ split base.automation: the code lives on an ir.actions.server; the automation links it
    // via action_server_ids and holds the trigger. (Old single-record form errors: "Invalid field 'state'".)
    autoRecords.push(
      [
        `  <record id="server_${slug(pid)}" model="ir.actions.server">`,
        `    <field name="name">${nm}</field>`,
        `    <field name="model_id" ref="${modelXmlId(ev.aggregate)}"/>`,
        `    <field name="state">code</field>`,
        `    <field name="code">${code}</field>`,
        `  </record>`,
        `  <record id="automation_${slug(pid)}" model="base.automation">`,
        `    <field name="name">${nm}</field>`,
        `    <field name="model_id" ref="${modelXmlId(ev.aggregate)}"/>`,
        `    <field name="trigger">on_create_or_write</field>`,
        `    <field name="action_server_ids" eval="[(4, ref('server_${slug(pid)}'))]"/>`,
        `  </record>`,
      ].join("\n"),
    );
  });

  // only reference data files that actually have content — an installable module has no hollow files.
  const dataFiles = ["security/groups.xml", "security/ir.model.access.csv"];
  if (autoRecords.length) dataFiles.push("data/automations.xml");
  // base.automation records live in the `base_automation` module — depend on it only when we emit them.
  const depends = autoRecords.length ? ["base", "base_automation"] : ["base"];
  const manifest = [
    "{",
    `    'name': ${JSON.stringify(`${caps.domain || "VBD"} (generated)`)},`,
    "    'version': '0.1.0',",
    `    'depends': [${depends.map((d) => `'${d}'`).join(", ")}],`,
    `    'data': [${dataFiles.map((f) => JSON.stringify(f)).join(", ")}],`,
    "    'license': 'LGPL-3',",
    "}",
  ].join("\n");

  const files: Record<string, string> = {
    "__manifest__.py": manifest,
    "__init__.py": "from . import models",
    "models/__init__.py": "from . import models",
    "models/models.py": M.join("\n").trim(),
    "security/groups.xml": groups.join("\n"),
    "security/ir.model.access.csv": acl.join("\n"),
  };
  if (autoRecords.length) files["data/automations.xml"] = ["<odoo>", ...autoRecords, "</odoo>"].join("\n");
  return files;
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
  artifacts: { postgres: string; n8n: N8nWorkflow[]; odoo: Record<string, string>; ui: Record<string, string> };
  /** which engine serves the UI (serve-ui binding), and whether we generated it or it's engine-native. */
  ui: { engineId: string; generated: boolean; note: string };
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
  theme: Theme = DEFAULT_THEME,
): TargetsReport {
  const resolved = resolveBinding(binding, caps, domain, contexts, roles, workflows);
  const validation = validateBinding(resolved, workflows, domain);
  // serve-ui is app-level (not per-element): read it from the binding directly.
  const uiEngine = binding.defaults["serve-ui"] ?? "shadcn";
  const uiGenerated = uiEngine === "shadcn";
  const ui = {
    engineId: uiEngine,
    generated: uiGenerated,
    note: uiGenerated
      ? "generated a themeable shadcn/ui scaffold (structure derived; skin = Theme)"
      : uiEngine === "odoo"
        ? "Odoo serves its own UI (auto-rendered list/form views) — no custom UI generated"
        : `UI bound to ${ENGINES[uiEngine]?.name ?? uiEngine} — no generator for it yet`,
  };
  const artifacts = {
    postgres: postgresAdapter(resolved, domain, roles),
    n8n: n8nAdapter(resolved, domain, workflows),
    odoo: odooAdapter(resolved, caps, domain, roles),
    ui: uiGenerated ? shadcnAdapter(caps, domain, contexts, theme) : {},
  };
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

  return { binding, resolved, validation, artifacts, seams, coverage: coverageOut, gaps, ui };
}
