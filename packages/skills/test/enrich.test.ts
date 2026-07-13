import { test } from "node:test";
import assert from "node:assert/strict";
import { mockEnrichDomain, applyEnrichment } from "../src/index.ts";
import { attributeSpecs, type CapabilityDoc, type DomainDoc } from "@kiln/compiler";

const caps: CapabilityDoc = { domain: "Solar", capabilities: [{ id: "billing", name: "Billing", purpose: "", outcomes: [] }] } as unknown as CapabilityDoc;

const domain: DomainDoc = {
  version: "0.1",
  aggregates: [
    { id: "invoice", name: "Invoice", owner: "billing", attributes: [{ name: "amount", type: "money" }], references: ["customer"] },
    { id: "customer", name: "Customer", owner: "billing", attributes: [{ name: "name", type: "text" }], references: [] },
    { id: "widget", name: "Widget", owner: "billing", attributes: [], references: [] },
  ],
} as unknown as DomainDoc;

test("mock enrichment proposes realistic fields per entity kind, never duplicating existing", () => {
  const e = mockEnrichDomain(caps, domain, "standard");
  const inv = e.additions.find((a) => a.entity === "invoice")!;
  const names = inv.attributes.map((a) => a.name);
  assert.ok(names.includes("invoice_number") && names.includes("tax_amount") && names.includes("total_amount"));
  assert.ok(!names.includes("amount"), "must not re-add an existing attribute");
  const cust = e.additions.find((a) => a.entity === "customer")!;
  assert.ok(cust.attributes.some((a) => a.name === "billing_address"));
});

test("mock enrichment proposes a child line-item entity for invoices (one-to-many)", () => {
  const e = mockEnrichDomain(caps, domain, "standard");
  const line = e.newEntities.find((n) => n.id === "invoice_line");
  assert.ok(line, "expected an invoice_line child");
  assert.deepEqual(line!.references, ["invoice"]);
  assert.ok(attributeSpecs(line!).some((a) => a.name === "quantity" && a.type === "number"));
  assert.equal(line!.owner, "billing");
});

test("conservative depth adds fewer fields and no children; exhaustive adds audit + children", () => {
  const con = mockEnrichDomain(caps, domain, "conservative");
  const ex = mockEnrichDomain(caps, domain, "exhaustive");
  const invCon = con.additions.find((a) => a.entity === "invoice")!.attributes.length;
  const invEx = ex.additions.find((a) => a.entity === "invoice")!.attributes.length;
  assert.ok(invCon < invEx, "conservative < exhaustive");
  assert.equal(con.newEntities.length, 0, "conservative proposes no children");
  assert.ok(ex.newEntities.length > 0, "exhaustive proposes children");
  assert.ok(ex.additions.find((a) => a.entity === "invoice")!.attributes.some((a) => a.name === "created_by"), "exhaustive adds audit fields");
});

test("unknown entity kind gets a sensible generic field set", () => {
  const e = mockEnrichDomain(caps, domain, "standard");
  const w = e.additions.find((a) => a.entity === "widget")!;
  assert.ok(w.attributes.some((a) => a.name === "status"));
});

test("applyEnrichment merges additions + children into a valid DomainDoc without dupes", () => {
  const e = mockEnrichDomain(caps, domain, "standard");
  const merged = applyEnrichment(domain, e);
  const inv = merged.aggregates.find((a) => a.id === "invoice")!;
  const attrNames = attributeSpecs(inv).map((a) => a.name);
  assert.ok(attrNames.includes("amount") && attrNames.includes("total_amount")); // kept + added
  assert.equal(new Set(attrNames).size, attrNames.length, "no duplicate attributes");
  assert.ok(merged.aggregates.some((a) => a.id === "invoice_line"), "child entity added");
  assert.ok(merged.aggregates.length > domain.aggregates.length);
});

test("extractJsonObject: pulls the JSON out of a prose-wrapped web-search response", async () => {
  const { extractJsonObject, coerceEnrichment } = await import("../src/index.ts");
  const raw = 'I researched solar installers. Here is what I found:\n\n{ "additions": [{ "entity": "invoice", "attributes": [{ "name": "tax_rate", "type": "number" }] }], "newEntities": [], "sources": ["https://example.com/solar"] }\n\nThose are the standard fields.';
  const parsed = extractJsonObject(raw) as { sources?: string[] };
  assert.deepEqual(parsed.sources, ["https://example.com/solar"]);
  // and it coerces into a valid enrichment (dropping additions to unknown entities)
  const domain = { aggregates: [{ id: "invoice", name: "Invoice", owner: "billing", attributes: [], references: [] }] } as unknown as DomainDoc;
  const e = coerceEnrichment(parsed, domain, "web");
  assert.ok(e.additions.some((a) => a.entity === "invoice" && a.attributes.some((x) => x.name === "tax_rate")));
  assert.equal(extractJsonObject("no json here").constructor, Object); // graceful empty
});
