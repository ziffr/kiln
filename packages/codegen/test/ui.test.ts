import { test } from "node:test";
import assert from "node:assert/strict";
import { shadcnAdapter, uiStructure, helpModel, DEFAULT_THEME, type Theme } from "../src/index.ts";
import type { CapabilityDoc, DomainDoc, ContextsDoc, WorkflowsDoc, RolesDoc } from "@vbd/compiler";

const caps: CapabilityDoc = {
  domain: "Test",
  capabilities: [
    { id: "leads", name: "Leads", purpose: "", outcomes: [] },
    { id: "billing", name: "Billing", purpose: "", outcomes: [] },
  ],
} as unknown as CapabilityDoc;

const domain: DomainDoc = {
  aggregates: [
    { id: "lead", name: "Lead", owner: "leads", attributes: [{ name: "email", type: "text" }, { name: "qualified", type: "boolean" }], references: [] },
    { id: "invoice", name: "Invoice", owner: "billing", attributes: [{ name: "amount", type: "money" }], references: ["lead"] },
  ],
  commands: [
    { id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", emits: [] },
    { id: "void_invoice", name: "Void Invoice", aggregate: "invoice", emits: [] },
  ],
} as unknown as DomainDoc;

const contexts: ContextsDoc = {
  contexts: [
    { id: "sales", name: "Sales", capabilities: ["leads"] },
    { id: "finance", name: "Finance", capabilities: ["billing"] },
  ],
} as unknown as ContextsDoc;

test("uiStructure derives nav from Areas and a screen per entity (structure, not skin)", () => {
  const s = uiStructure(caps, domain, contexts);
  assert.equal(s.screens.length, 2);
  // nav grouped by business area
  const areas = s.nav.map((n) => n.area).sort();
  assert.deepEqual(areas, ["Finance", "Sales"]);
  // fields carry the modelled controls; actions come from commands
  const lead = s.screens.find((x) => x.entity === "lead")!;
  assert.ok(lead.fields.some((f) => f.name === "qualified" && f.control === "Switch"));
  assert.ok(lead.actions.includes("Qualify Lead"));
  const invoice = s.screens.find((x) => x.entity === "invoice")!;
  assert.ok(invoice.references.includes("lead"));
});

test("shadcnAdapter emits a themeable scaffold: theme css, router, sidebar, page per entity", () => {
  const files = shadcnAdapter(caps, domain, contexts);
  assert.ok(files["src/index.css"], "theme css");
  assert.ok(files["src/App.tsx"], "router");
  assert.ok(files["src/components/AppSidebar.tsx"], "sidebar");
  assert.ok(files["components.json"], "shadcn config");
  // a complete, runnable project — not just app files (verified: npm i && npm run build works)
  assert.ok(files["package.json"] && files["vite.config.ts"] && files["tailwind.config.js"], "runnable project config");
  assert.ok(files["src/components/ui/button.tsx"] && files["src/components/ui/table.tsx"], "shadcn components emitted");
  assert.ok(files["src/main.tsx"] && files["index.html"], "entry point");
  // list + detail per entity
  for (const t of ["Lead", "Invoice"]) {
    assert.ok(files[`src/pages/${t}List.tsx`], `${t} list`);
    assert.ok(files[`src/pages/${t}Detail.tsx`], `${t} detail`);
  }
  // the skin lives in the tokens
  assert.match(files["src/index.css"], /--background:/);
  assert.match(files["src/index.css"], /--radius: 0\.5rem/);
  // boolean field → Switch, money field → number input (structure derived from typed attributes)
  assert.match(files["src/pages/LeadDetail.tsx"], /Switch/);
  assert.match(files["src/pages/InvoiceDetail.tsx"], /type="number"/);
  // actions become buttons
  assert.match(files["src/pages/LeadDetail.tsx"], /Qualify Lead/);
  // sidebar groups by area
  assert.match(files["src/components/AppSidebar.tsx"], /area: "Sales"/);
});

test("master-detail: an entity's detail shows a grid for entities that reference it (reverse refs)", () => {
  // invoice references lead → Lead's detail should show an Invoice child grid.
  const s = uiStructure(caps, domain, contexts);
  const lead = s.screens.find((x) => x.entity === "lead")!;
  assert.ok(lead.related.some((r) => r.entity === "invoice"), "Lead should list its Invoices");
  const files = shadcnAdapter(caps, domain, contexts);
  assert.match(files["src/pages/LeadDetail.tsx"], /master-detail/);
  assert.match(files["src/pages/LeadDetail.tsx"], /<CardTitle className="text-base">Invoice<\/CardTitle>/);
  assert.match(files["src/pages/LeadDetail.tsx"], /Add Invoice/);
  // an entity with nothing referencing it stays a plain form (no table import)
  assert.doesNotMatch(files["src/pages/InvoiceDetail.tsx"], /master-detail/);
});

test("swapping the Theme changes the skin, not the structure", () => {
  const brand: Theme = { ...DEFAULT_THEME, name: "brand", radius: "1rem", light: { ...DEFAULT_THEME.light, primary: "220 90% 56%" } };
  const a = shadcnAdapter(caps, domain, contexts, DEFAULT_THEME);
  const b = shadcnAdapter(caps, domain, contexts, brand);
  // structure (pages, routes) identical
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
  assert.equal(a["src/App.tsx"], b["src/App.tsx"]);
  // skin differs
  assert.notEqual(a["src/index.css"], b["src/index.css"]);
  assert.match(b["src/index.css"], /--primary: 220 90% 56%/);
  assert.match(b["src/index.css"], /--radius: 1rem/);
});

test("no aggregates → no UI", () => {
  assert.equal(Object.keys(shadcnAdapter(caps, { aggregates: [] } as unknown as DomainDoc, contexts)).length, 0);
});

test("shadcnAdapter emits the sidebar-16 shell: sidebar + header + inset, model-derived nav", () => {
  const files = shadcnAdapter(caps, domain, contexts);
  assert.ok(files["src/components/AppShell.tsx"], "app shell");
  assert.ok(files["src/components/AppHeader.tsx"], "header (breadcrumb + search)");
  // App wraps routes in the shell (not the old plain flex layout)
  assert.match(files["src/App.tsx"], /<AppShell>/);
  // the shell is the inset dashboard: a rounded bordered content card + a team header + a search box
  assert.match(files["src/components/AppShell.tsx"], /rounded-xl border/);
  assert.match(files["src/components/AppSidebar.tsx"], /Generated app/);
  assert.match(files["src/components/AppHeader.tsx"], /Search/);
  // nav still model-derived: areas are groups, and a breadcrumb title map is emitted
  assert.match(files["src/components/AppSidebar.tsx"], /area: "Sales"/);
  assert.match(files["src/components/AppSidebar.tsx"], /routeTitles/);
});

test("helpModel projects end-user help from the model (what/fields/actions, processes, roles)", () => {
  const capsWithPurpose = { ...caps, capabilities: [{ id: "leads", name: "Leads", purpose: "Turn enquiries into qualified prospects.", outcomes: [] }, { id: "billing", name: "Billing", purpose: "", outcomes: [] }] } as unknown as CapabilityDoc;
  const domainWithEmits = { ...domain, events: [{ id: "lead_qualified", name: "Lead Qualified", aggregate: "lead", trigger: "command" }], commands: [{ id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", emits: ["lead_qualified"] }, { id: "void_invoice", name: "Void Invoice", aggregate: "invoice", emits: [] }], policies: [{ id: "p1", name: "", on: "lead_qualified", then: "void_invoice" }] } as unknown as DomainDoc;
  const workflows: WorkflowsDoc = { version: "0.1", workflows: [{ id: "o2c", name: "Order to Cash", steps: ["qualify_lead", "void_invoice"] }] } as unknown as WorkflowsDoc;
  const roles: RolesDoc = { version: "0.1", roles: [{ id: "rep", name: "Sales Rep", capabilities: ["leads"] }] } as unknown as RolesDoc;
  const h = helpModel(capsWithPurpose, domainWithEmits, contexts, workflows, roles);
  const lead = h.entities.find((e) => e.entity === "lead")!;
  assert.equal(lead.what, "Turn enquiries into qualified prospects."); // "what" = owning capability purpose
  assert.ok(lead.fields.some((f) => f.name === "qualified" && f.hint === "yes / no")); // field hint from type
  const qualify = lead.actions.find((a) => a.name === "Qualify Lead")!;
  assert.match(qualify.does, /Lead Qualified/); // "what happens" = the command's emitted events
  assert.ok(h.processes.some((p) => p.name === "Order to Cash" && p.steps.includes("Qualify Lead")));
  assert.ok(h.roles.some((r) => r.name === "Sales Rep" && r.does.includes("Leads")));
  assert.ok(h.automations.some((a) => a.when === "Lead Qualified"));
});

test("shadcnAdapter emits an in-app help system (data + page + drawer + route + nav)", () => {
  const files = shadcnAdapter(caps, domain, contexts);
  assert.ok(files["src/help.ts"], "help data module");
  assert.match(files["src/help.ts"], /export const HELP/);
  assert.ok(files["src/pages/Help.tsx"], "help page");
  assert.ok(files["src/components/HelpButton.tsx"], "contextual help drawer");
  // route + nav wired
  assert.match(files["src/App.tsx"], /path="\/help"/);
  assert.match(files["src/components/AppSidebar.tsx"], /to="\/help"/);
  // each list screen carries a contextual help button bound to its entity
  assert.match(files["src/pages/LeadList.tsx"], /<HelpButton entity="lead" \/>/);
  // the drawer + page are dependency-light (no new shadcn component needed)
  assert.doesNotMatch(files["src/components/HelpButton.tsx"], /@\/components\/ui\/dialog/);
});
