import { test } from "node:test";
import assert from "node:assert/strict";
import { mockIntegrations, integrationsAdapter } from "../src/index.ts";
import type { CapabilityDoc, DomainDoc } from "@vbd/compiler";

const caps: CapabilityDoc = { domain: "Solar", capabilities: [{ id: "sales", name: "Sales", purpose: "", outcomes: [] }] } as unknown as CapabilityDoc;

const domain: DomainDoc = {
  aggregates: [
    { id: "lead", name: "Lead", owner: "sales", attributes: [{ name: "email", type: "text" }], references: [] },
    { id: "customer", name: "Customer", owner: "sales", attributes: [{ name: "name", type: "text" }], references: [] },
    { id: "invoice", name: "Invoice", owner: "sales", attributes: [{ name: "amount", type: "money" }], references: ["customer"] },
  ],
  commands: [{ id: "capture_lead", name: "Capture Lead", aggregate: "lead", emits: ["lead_captured"] }],
  events: [
    { id: "customer_created", name: "Customer Created", aggregate: "customer", trigger: "command" },
    { id: "invoice_paid", name: "Invoice Paid", aggregate: "invoice", trigger: "command" },
  ],
} as unknown as DomainDoc;

test("mockIntegrations derives inbound (create-command → CRM) and outbound (event → system) actions", () => {
  const i = mockIntegrations(caps, domain);
  const inbound = i.actions.filter((a) => a.direction === "inbound");
  const outbound = i.actions.filter((a) => a.direction === "outbound");
  assert.ok(inbound.some((a) => a.entity === "lead" && a.system === "CRM" && a.trigger === "capture_lead"));
  assert.ok(outbound.some((a) => a.entity === "customer" && a.system === "CRM" && a.trigger === "customer_created"));
  assert.ok(outbound.some((a) => a.entity === "invoice" && a.system === "Accounting" && a.trigger === "invoice_paid"));
  // mapping seeds a 1:1 the human refines
  const inv = outbound.find((a) => a.entity === "invoice")!;
  assert.equal(inv.mapping.amount, "amount");
});

test("integrationsAdapter emits mapping files + n8n connectors (inbound → spine command; outbound → API)", () => {
  const i = mockIntegrations(caps, domain);
  const out = integrationsAdapter(i, domain);
  assert.ok(Object.keys(out.mappings).some((p) => p.startsWith("integrations/") && p.endsWith(".mapping.json")));
  const inWf = out.n8n.find((w) => w.name.startsWith("Integration (in)"));
  assert.ok(inWf, "inbound workflow");
  assert.equal(inWf!.nodes[0].type, "n8n-nodes-base.webhook");
  assert.equal((inWf!.nodes[0].parameters as { path: string }).path, "ingest/lead");
  assert.match((inWf!.nodes[1].parameters as { url: string }).url, /\/leads$/); // → the spine create endpoint
  const outWf = out.n8n.find((w) => w.name.startsWith("Integration (out)"));
  assert.ok(outWf, "outbound workflow");
  assert.equal((outWf!.nodes[0].parameters as { path: string }).path.startsWith("on/"), true); // triggered by the event
});

test("Excel is first-class: an xlsx import routes rows through a spreadsheet node → the create command", () => {
  const i = mockIntegrations(caps, domain);
  const excel = i.actions.find((a) => a.transport === "xlsx");
  assert.ok(excel && excel.system === "Excel" && excel.direction === "inbound", "an Excel import is seeded");
  const wf = integrationsAdapter(i, domain).n8n.find((w) => w.id === `vbd_${excel!.id}`)!;
  const types = wf.nodes.map((n) => n.type);
  // poll on a schedule → read the Excel workbook → POST the create command
  assert.deepEqual(types, ["n8n-nodes-base.scheduleTrigger", "n8n-nodes-base.microsoftExcel", "n8n-nodes-base.httpRequest"]);
  assert.match(String((wf.nodes[2].parameters as { url: string }).url), /\/leads$/);
  // the mapping file records the transport
  const map = JSON.parse(integrationsAdapter(i, domain).mappings[`integrations/${excel!.id}.mapping.json`]);
  assert.equal(map.transport, "xlsx");
});
