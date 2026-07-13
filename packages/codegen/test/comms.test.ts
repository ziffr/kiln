import { test } from "node:test";
import assert from "node:assert/strict";
import { mockCommunications, communicationsAdapter } from "../src/index.ts";
import type { CapabilityDoc, DomainDoc } from "@kiln/compiler";

const caps: CapabilityDoc = { domain: "Solar", capabilities: [{ id: "billing", name: "Billing", purpose: "", outcomes: [] }, { id: "leads", name: "Leads", purpose: "", outcomes: [] }] } as unknown as CapabilityDoc;

const domain: DomainDoc = {
  aggregates: [
    { id: "invoice", name: "Invoice", owner: "billing", attributes: [{ name: "amount", type: "money" }, { name: "due_date", type: "date" }], references: ["customer"] },
    { id: "customer", name: "Customer", owner: "billing", attributes: [{ name: "email", type: "text" }], references: [] },
    { id: "lead", name: "Lead", owner: "leads", attributes: [{ name: "email", type: "text" }], references: [] },
  ],
  events: [
    { id: "invoice_issued", name: "Invoice Issued", aggregate: "invoice", trigger: "command" },
    { id: "lead_captured", name: "Lead Captured", aggregate: "lead", trigger: "command" },
    { id: "invoice_amended", name: "Invoice Amended", aggregate: "invoice", trigger: "command" }, // not notify-worthy
  ],
} as unknown as DomainDoc;

test("mockCommunications derives notify-worthy actions from events (doc→email+pdf, other→slack)", () => {
  const c = mockCommunications(caps, domain);
  const byOn = (id: string) => c.actions.filter((a) => a.on === id);
  // invoice_issued (a document) → an email + a pdf render
  assert.ok(byOn("invoice_issued").some((a) => a.channel === "email"));
  assert.ok(byOn("invoice_issued").some((a) => a.channel === "pdf"));
  // the email recipient binds to the customer (invoice references customer)
  assert.match(byOn("invoice_issued").find((a) => a.channel === "email").recipient, /customer_email/);
  // lead_captured → a slack alert
  assert.ok(byOn("lead_captured").some((a) => a.channel === "slack"));
  // "amended" is not a lifecycle fact we announce
  assert.equal(byOn("invoice_amended").length, 0);
});

test("communicationsAdapter emits templates + n8n notify workflows wired to the event webhook", () => {
  const c = mockCommunications(caps, domain);
  const out = communicationsAdapter(c);
  // a template per action (editable, with placeholders)
  assert.ok(Object.keys(out.templates).some((p) => p.startsWith("templates/")));
  const emailTpl = Object.entries(out.templates).find(([p]) => p.includes("email_invoice_issued"));
  assert.ok(emailTpl, "email template present");
  assert.match(emailTpl![1], /\{\{id\}\}/); // placeholder binding
  // an n8n workflow per notify action, triggered by the event webhook, calling an email/slack node
  const wf = out.n8n.find((w) => w.name.includes("Email Invoice"));
  assert.ok(wf, "email workflow present");
  assert.equal(wf!.nodes[0].type, "n8n-nodes-base.webhook");
  assert.equal((wf!.nodes[0].parameters as { path: string }).path, "on/invoice_issued");
  assert.ok(wf!.nodes.some((n) => n.type === "n8n-nodes-base.emailSend"));
  // pdf actions produce a template but no n8n flow (rendering runs elsewhere)
  assert.ok(!out.n8n.some((w) => w.name.toLowerCase().includes("pdf")));
});

test("spreadsheet output (Excel) is a rendered document: template emitted, no n8n messaging flow", () => {
  const c = mockCommunications(caps, domain);
  const xlsx = c.actions.find((a) => a.channel === "spreadsheet");
  assert.ok(xlsx, "an Excel register export is seeded off the document entity");
  const out = communicationsAdapter(c);
  assert.ok(Object.keys(out.templates).some((p) => p.includes(xlsx!.id)), "template emitted");
  assert.ok(!out.n8n.some((w) => w.id === `kiln_comm_${xlsx!.id}`), "no n8n flow — rendered like a pdf");
});
