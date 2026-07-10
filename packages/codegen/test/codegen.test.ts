import { test } from "node:test";
import assert from "node:assert/strict";
import { generateTypes, generateOpenApi, generateModuleMap, detectGaps, generateAll } from "../src/index.ts";
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
    { id: "lead", name: "Lead", owner: "lead_management", attributes: ["contact", "status"], references: [] },
    { id: "invoice", name: "Invoice", owner: "billing", attributes: ["amount"], references: ["lead"] },
  ],
};
const contexts: ContextsDoc = {
  version: "0.1",
  contexts: [
    { id: "c_sales", name: "Sales", capabilities: ["lead_management"] },
    { id: "c_finance", name: "Finance", capabilities: ["billing", "orchestration"] },
  ],
};

test("generateTypes emits a TS interface per aggregate with an id and its attributes", () => {
  const ts = generateTypes(caps, domain);
  assert.match(ts, /export interface Lead \{/);
  assert.match(ts, /id: string;/);
  assert.match(ts, /contact: unknown;/);
  assert.match(ts, /leadId: string; \/\/ reference → lead/); // Invoice references Lead
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

test("generateAll returns all four artifacts", () => {
  const r = generateAll(caps, domain, contexts);
  assert.ok(r.types && r.openapi && r.moduleMap && r.gaps.length >= 2);
});
