import { test } from "node:test";
import assert from "node:assert/strict";
import {
  projectTargets,
  resolveBinding,
  validateBinding,
  deriveSeams,
  postgresAdapter,
  n8nAdapter,
  odooAdapter,
  DEFAULT_BINDING,
  ENGINES,
  TECH_CAPABILITIES,
  type Binding,
} from "../src/index.ts";
import type { CapabilityDoc, DomainDoc, ContextsDoc, RolesDoc, WorkflowsDoc } from "@vbd/compiler";

// A tiny two-entity model with behaviour, one reaction, one workflow, one role.
const caps: CapabilityDoc = {
  domain: "Test",
  capabilities: [
    { id: "leads", name: "Leads", purpose: "", outcomes: [] },
    { id: "billing", name: "Billing", purpose: "", outcomes: [] },
  ],
} as unknown as CapabilityDoc;

const domain: DomainDoc = {
  aggregates: [
    { id: "lead", name: "Lead", owner: "leads", attributes: [{ name: "email", type: "text" }], references: [] },
    { id: "invoice", name: "Invoice", owner: "billing", attributes: [{ name: "amount", type: "money" }], references: ["lead"] },
  ],
  commands: [
    { id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", emits: ["lead_qualified"] },
    { id: "issue_invoice", name: "Issue Invoice", aggregate: "invoice", emits: [] },
  ],
  events: [{ id: "lead_qualified", name: "Lead Qualified", aggregate: "lead", trigger: "command" }],
  policies: [{ id: "p1", name: "Invoice on qualify", on: "lead_qualified", then: "issue_invoice" }],
} as DomainDoc;

const contexts: ContextsDoc = { contexts: [{ id: "sales", name: "Sales", capabilities: ["leads", "billing"] }] } as ContextsDoc;
const roles: RolesDoc = { roles: [{ id: "rep", name: "Rep", capabilities: ["leads"] }] } as RolesDoc;
const workflows: WorkflowsDoc = { workflows: [{ id: "onboard", name: "Onboard", steps: ["qualify_lead", "issue_invoice"] }] } as WorkflowsDoc;

test("taxonomy: every engine declares a fidelity for every technical capability", () => {
  for (const eng of Object.values(ENGINES)) {
    for (const cap of TECH_CAPABILITIES) assert.ok(eng.provides[cap], `${eng.id} missing ${cap}`);
  }
});

test("resolveBinding places every element on an engine by its technical capability", () => {
  const r = resolveBinding(DEFAULT_BINDING, caps, domain, contexts, roles, workflows);
  const byKind = (k: string) => r.filter((e) => e.kind === k);
  assert.equal(byKind("aggregate").length, 2);
  assert.equal(byKind("command").length, 2);
  assert.equal(byKind("policy").length, 1);
  assert.equal(byKind("workflow").length, 1);
  assert.equal(byKind("role").length, 1);
  // default binding: store→postgres, react→n8n, operate→node
  assert.equal(r.find((e) => e.id === "lead" && e.kind === "aggregate")!.engineId, "postgres");
  assert.equal(r.find((e) => e.kind === "policy")!.engineId, "n8n");
  assert.equal(r.find((e) => e.id === "qualify_lead")!.engineId, "node");
});

test("validateBinding errors when an engine is asked to do what it cannot (fidelity=none)", () => {
  // Bind stores to n8n — which has store:"none".
  const bad: Binding = { defaults: { ...DEFAULT_BINDING.defaults, store: "n8n" } };
  const r = resolveBinding(bad, caps, domain, contexts, roles, workflows);
  const findings = validateBinding(r, workflows, domain);
  const err = findings.find((f) => f.code === "TB2");
  assert.ok(err, "expected a TB2 error for store→n8n");
  assert.equal(err!.level, "error");
});

test("validateBinding accepts the default multi-backend binding with no errors", () => {
  const r = resolveBinding(DEFAULT_BINDING, caps, domain, contexts, roles, workflows);
  const errs = validateBinding(r, workflows, domain).filter((f) => f.level === "error");
  assert.equal(errs.length, 0);
});

test("validateBinding flags a workflow step that references a missing command (TB4)", () => {
  const wf: WorkflowsDoc = { workflows: [{ id: "w", name: "W", steps: ["does_not_exist"] }] } as WorkflowsDoc;
  const r = resolveBinding(DEFAULT_BINDING, caps, domain, contexts, roles, wf);
  assert.ok(validateBinding(r, wf, domain).some((f) => f.code === "TB4"));
});

test("postgresAdapter emits typed DDL with PK, FK and an RLS sketch", () => {
  const r = resolveBinding(DEFAULT_BINDING, caps, domain, contexts, roles, workflows);
  const sql = postgresAdapter(r, domain, roles);
  assert.match(sql, /CREATE TABLE lead \(/);
  assert.match(sql, /id text PRIMARY KEY/);
  assert.match(sql, /amount numeric\(14,2\)/); // money → numeric(14,2)
  assert.match(sql, /lead_id text REFERENCES lead\(id\)/); // reference → FK
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/); // RLS from roles
});

test("postgresAdapter only emits tables for aggregates bound to postgres", () => {
  const bind: Binding = { defaults: { ...DEFAULT_BINDING.defaults }, byArea: { sales: { store: "node" } } };
  const r = resolveBinding(bind, caps, domain, contexts, roles, workflows);
  assert.equal(postgresAdapter(r, domain, roles), ""); // everything moved off postgres
});

test("n8nAdapter emits a reaction workflow (event webhook → HTTP call to the command endpoint)", () => {
  const r = resolveBinding(DEFAULT_BINDING, caps, domain, contexts, roles, workflows);
  const wfs = n8nAdapter(r, domain, workflows);
  const react = wfs.find((w) => w.name.startsWith("Reaction"));
  assert.ok(react, "expected a reaction workflow");
  // fields n8n's `import:workflow` requires (verified against a live n8n — id is NOT NULL).
  assert.ok(react!.id && react!.id.length > 0, "workflow needs an id");
  assert.equal(react!.active, false);
  assert.ok(react!.settings && typeof react!.settings === "object");
  assert.equal(react!.nodes[0].type, "n8n-nodes-base.webhook");
  const http = react!.nodes.find((n) => n.type === "n8n-nodes-base.httpRequest")!;
  // "issue_invoice" is a CREATE verb → the create endpoint (mirrors generateOpenApi).
  assert.match((http.parameters as { url: string }).url, /\/api\/invoices$/);
  // the process workflow's non-create step "qualify_lead" → the action endpoint form.
  const proc = wfs.find((w) => w.name.startsWith("Process"))!;
  assert.ok(proc, "expected a process workflow");
  const qualifyNode = proc.nodes.find((n) => (n.parameters as { url?: string }).url?.includes("qualify_lead"))!;
  assert.match((qualifyNode.parameters as { url: string }).url, /\/leads\/\{id\}\/qualify_lead$/);
});

test("deriveSeams finds cross-engine hops and NO direct n8n→postgres (spine mediates)", () => {
  const r = resolveBinding(DEFAULT_BINDING, caps, domain, contexts, roles, workflows);
  const seams = deriveSeams(r, domain, workflows);
  assert.ok(seams.length > 0);
  assert.ok(seams.some((s) => s.from === "n8n" && s.to === "node"), "n8n→node reaction hop");
  assert.ok(seams.some((s) => s.from === "node" && s.to === "postgres"), "node→postgres store hop");
  assert.equal(seams.filter((s) => s.from === "n8n" && s.to === "postgres").length, 0, "n8n must not reach postgres directly");
});

const ALL_ODOO: Binding = { defaults: { store: "odoo", operate: "odoo", authorize: "odoo", emit: "odoo", react: "odoo", sequence: "odoo" } };

test("odooAdapter emits an installable module: models, typed fields, Many2one, command method, ACL", () => {
  const r = resolveBinding(ALL_ODOO, caps, domain, contexts, roles, workflows);
  const files = odooAdapter(r, caps, domain, roles);
  assert.ok(files["__manifest__.py"], "manifest present");
  assert.ok(files["__init__.py"] && files["models/models.py"], "python present");
  const models = files["models/models.py"];
  assert.match(models, /class Lead\(models\.Model\)/);
  assert.match(models, /_name = "test\.lead"/);
  assert.match(models, /fields\.Monetary/); // invoice.amount (money)
  assert.match(models, /fields\.Many2one\("test\.lead"\)/); // invoice → lead reference
  assert.match(models, /def qualify_lead\(self\)/); // command → model method
  assert.match(files["security/ir.model.access.csv"], /group_rep/); // role → group ACL
});

test("odooAdapter returns nothing when no aggregate is bound to odoo", () => {
  const r = resolveBinding(DEFAULT_BINDING, caps, domain, contexts, roles, workflows);
  assert.equal(Object.keys(odooAdapter(r, caps, domain, roles)).length, 0);
});

test("TB5: a store-coupling engine (Odoo) rejects operate bound away from its store", () => {
  const bad: Binding = { defaults: { ...DEFAULT_BINDING.defaults, operate: "odoo" } }; // store stays postgres
  const r = resolveBinding(bad, caps, domain, contexts, roles, workflows);
  assert.ok(validateBinding(r, workflows, domain).some((f) => f.code === "TB5"), "expected TB5 coherence error");
});

test("a whole Area bound to Odoo is coherent (no TB5) and produces the module", () => {
  const rep = projectTargets(ALL_ODOO, caps, domain, contexts, roles, workflows);
  assert.equal(rep.validation.filter((f) => f.code === "TB5").length, 0);
  assert.ok(rep.coverage.some((c) => c.engineId === "odoo"));
  assert.ok(Object.keys(rep.artifacts.odoo).length > 0);
});

test("adding Odoo did not require touching the model/binding/seam core (registry has 4 engines)", () => {
  assert.equal(Object.keys(ENGINES).length, 4);
  assert.equal(ENGINES.odoo.couplesStore, true);
});

test("projectTargets returns a coherent report with coverage and gaps", () => {
  const rep = projectTargets(DEFAULT_BINDING, caps, domain, contexts, roles, workflows);
  assert.ok(rep.coverage.some((c) => c.engineId === "postgres"));
  assert.ok(rep.coverage.some((c) => c.engineId === "n8n"));
  assert.ok(rep.gaps.length > 0);
  assert.equal(rep.validation.filter((f) => f.level === "error").length, 0);
});
