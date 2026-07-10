import { test } from "node:test";
import assert from "node:assert/strict";
import { generateTypes, generateOpenApi, generateModuleMap, generateEventCatalog, detectGaps, generateAll } from "../src/index.ts";
import type { CapabilityDoc, DomainDoc, ContextsDoc } from "@vbd/compiler";

const caps: CapabilityDoc = {
  version: "0.2",
  domain: "solar-installer",
  capabilities: [
    { id: "lead_management", name: "Lead Management", produces: ["Lead"] },
    { id: "billing", name: "Billing", produces: ["Invoice"] },
    { id: "orchestration", name: "Orchestration" }, // owns no aggregate
  ],
};
const domain: DomainDoc = {
  version: "0.1",
  aggregates: [
    // mixed: an untyped string attr (back-compat) + a typed spec
    { id: "lead", name: "Lead", owner: "lead_management", attributes: ["contact", { name: "score", type: "number" }], references: [] },
    { id: "invoice", name: "Invoice", owner: "billing", attributes: [{ name: "amount", type: "money" }, { name: "due_date", type: "date" }], references: ["lead"] },
  ],
};
const contexts: ContextsDoc = {
  version: "0.1",
  contexts: [
    { id: "c_sales", name: "Sales", capabilities: ["lead_management"] },
    { id: "c_finance", name: "Finance", capabilities: ["billing", "orchestration"] },
  ],
};

test("generateTypes emits a TS interface per aggregate, mapping business types (untyped → unknown)", () => {
  const ts = generateTypes(caps, domain);
  assert.match(ts, /export interface Lead \{/);
  assert.match(ts, /id: string;/);
  assert.match(ts, /contact: unknown;/); // untyped string attr → unknown
  assert.match(ts, /score: number;/); // typed number
  assert.match(ts, /amount: number;/); // money → number
  assert.match(ts, /due_date: string;/); // date → string
  assert.match(ts, /leadId: string; \/\/ reference → lead/); // Invoice references Lead
});

test("detectGaps counts only UNTYPED attributes (typed ones don't count)", () => {
  const gaps = detectGaps(caps, domain);
  const untypedGap = gaps.find((g) => /UNTYPED/.test(g));
  assert.match(untypedGap ?? "", /^1 attributes/); // only Lead.contact is untyped
});

test("generateOpenApi emits CRUD paths per aggregate, tagged by business area", () => {
  const api = generateOpenApi(caps, domain, contexts) as any;
  assert.ok(api.paths["/leads"] && api.paths["/leads/{id}"]);
  assert.equal(api.paths["/leads"].get.tags[0], "Sales"); // lead_management is in the Sales area
  assert.equal(api.paths["/invoices"].get.tags[0], "Finance");
  assert.ok(api.components.schemas.Lead && api.components.schemas.Invoice);
});

test("generateModuleMap nests area → capability → aggregate files", () => {
  const map = generateModuleMap(caps, domain, contexts);
  assert.match(map, /module c_sales\/\s+# Sales/);
  assert.match(map, /lead_management\//);
  assert.match(map, /lead\.ts/);
});

test("detectGaps flags untyped attributes, aggregate-less capabilities, and the CRUD-only limit", () => {
  const gaps = detectGaps(caps, domain);
  assert.ok(gaps.some((g) => /UNTYPED/.test(g)));
  assert.ok(gaps.some((g) => /own no entity/.test(g) && /orchestration/.test(g)));
  assert.ok(gaps.some((g) => /CRUD-only/.test(g) && /SPEC-004/.test(g)));
});

test("generateAll returns all artifacts incl. an event catalog", () => {
  const r = generateAll(caps, domain, contexts);
  assert.ok(r.types && r.openapi && r.moduleMap && Array.isArray(r.events) && r.gaps.length >= 2);
});

// --- SPEC-004 behaviour → real command operations beyond CRUD ---

const behaviour: DomainDoc = {
  version: "0.2",
  aggregates: [
    { id: "lead", name: "Lead", owner: "lead_management", attributes: [{ name: "score", type: "number" }] },
    { id: "invoice", name: "Invoice", owner: "billing", attributes: [{ name: "amount", type: "money" }] },
  ],
  events: [
    { id: "lead_qualified", name: "Lead Qualified", aggregate: "lead", trigger: "command" },
    { id: "invoice_overdue", name: "Invoice Overdue", aggregate: "invoice", trigger: "time" },
  ],
  commands: [
    { id: "capture_lead", name: "Capture Lead", aggregate: "lead", capability: "lead_management", emits: [] },
    { id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", capability: "lead_management", emits: ["lead_qualified"] },
  ],
};

test("commands become instance operations with x-emits; create-verbs go on the collection", () => {
  const api = generateOpenApi(caps, behaviour, contexts) as any;
  // Qualify Lead → POST /leads/{id}/qualify_lead, carrying its emitted event
  const qualify = api.paths["/leads/{id}/qualify_lead"]?.post;
  assert.ok(qualify);
  assert.deepEqual(qualify["x-emits"], ["Lead Qualified"]);
  assert.ok(qualify.responses["409"]); // command may be rejected
  // Capture Lead is a create-verb → on the collection, not an instance action
  assert.ok(Object.keys(api.paths["/leads"]).some((k) => k.startsWith("post")));
  assert.ok(!api.paths["/leads/{id}/capture_lead"]);
});

test("event catalog lists facts with trigger and emitting commands", () => {
  const cat = generateEventCatalog(behaviour);
  const qualified = cat.find((e) => e.name === "Lead Qualified");
  assert.deepEqual(qualified?.emittedBy, ["Qualify Lead"]);
  const overdue = cat.find((e) => e.name === "Invoice Overdue");
  assert.equal(overdue?.trigger, "time");
});

test("detectGaps is behaviour-aware: with commands the gap becomes reactions (SPEC-005)", () => {
  const gaps = detectGaps(caps, behaviour);
  assert.ok(!gaps.some((g) => /CRUD-only/.test(g)));
  assert.ok(gaps.some((g) => /SPEC-005/.test(g) && /reaction/.test(g)));
});
