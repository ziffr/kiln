import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { spineAdapter } from "../src/index.ts";
import type { CapabilityDoc, DomainDoc } from "@vbd/compiler";

const caps: CapabilityDoc = { domain: "Test", capabilities: [{ id: "sales", name: "Sales", purpose: "", outcomes: [] }] } as unknown as CapabilityDoc;

const domain: DomainDoc = {
  aggregates: [
    { id: "lead", name: "Lead", owner: "sales", attributes: [{ name: "email", type: "text" }], references: [] },
    { id: "invoice", name: "Invoice", owner: "sales", attributes: [{ name: "amount", type: "money" }], references: ["lead"] },
  ],
  commands: [
    { id: "capture_lead", name: "Capture Lead", aggregate: "lead", emits: ["lead_captured"] },
    { id: "send_invoice", name: "Send Invoice", aggregate: "invoice", emits: ["invoice_sent"] },
  ],
  events: [
    { id: "lead_captured", name: "Lead Captured", aggregate: "lead", trigger: "command" },
    { id: "invoice_sent", name: "Invoice Sent", aggregate: "invoice", trigger: "command" },
  ],
} as unknown as DomainDoc;

test("spineAdapter emits a runnable Express+pg service (package.json, server, db, handlers, schema)", () => {
  const f = spineAdapter(caps, domain);
  for (const p of ["package.json", "src/server.js", "src/db.js", "src/events.js", "src/handlers.js", "src/schema.js", ".env.example"]) assert.ok(f[p], `${p} missing`);
  const pkg = JSON.parse(f["package.json"]);
  assert.ok(pkg.dependencies.express && pkg.dependencies.pg, "express + pg deps");
  assert.equal(pkg.scripts.start, "node src/server.js");
});

test("routes: create verbs POST /table, others POST /table/{id}/action; columns include refs", () => {
  const f = spineAdapter(caps, domain);
  const routes = JSON.parse(f["src/schema.js"].match(/routes = (\[[\s\S]*?\]);/)[1]);
  const cap = routes.find((r) => r.command === "capture_lead");
  assert.equal(cap.path, "/leads"); // "capture" is a create verb
  assert.equal(cap.create, true);
  const send = routes.find((r) => r.command === "send_invoice");
  assert.equal(send.path, "/invoices/{id}/send_invoice"); // non-create → action path
  assert.equal(send.create, false);
  assert.deepEqual(send.emits, ["invoice_sent"]);
  const cols = JSON.parse(f["src/schema.js"].match(/columns = (\{[\s\S]*?\});/)[1]);
  assert.ok(cols.invoice.includes("id") && cols.invoice.includes("amount") && cols.invoice.includes("lead_id"));
});

test("LLM-drafted handlers are spliced in (note above); missing commands get a pass-through default", () => {
  const drafted = { send_invoice: "(input, ctx) => ({ ...input, status: 'sent' })" };
  const f = spineAdapter(caps, domain, drafted);
  assert.match(f["src/handlers.js"], /\/\/ Send Invoice — LLM-drafted/);
  assert.match(f["src/handlers.js"], /"send_invoice": \(input, ctx\) => \(\{ \.\.\.input, status: 'sent' \}\),/);
  assert.match(f["src/handlers.js"], /\/\/ Capture Lead — pass-through default/);
  assert.match(f["src/handlers.js"], /"capture_lead": \(input\) => \(\{ \.\.\.input \}\),/);
});

test("a multi-line, heavily-commented block body embeds into valid JS (comma not swallowed)", () => {
  const body = ["(input, ctx) => {", "  // Send the invoice — flips status to 'sent'.", "  // ASSUMPTION: no send-side effects modelled yet; a human wires email here.", "  return { ...input, status: 'sent' };", "}"].join("\n");
  const f = spineAdapter(caps, domain, { send_invoice: body });
  const js = f["src/handlers.js"];
  assert.match(js, /ASSUMPTION: no send-side effects/); // the comment survives
  // the generated module must be syntactically valid (the trailing comma after `}` is intact).
  // vm.Script COMPILES the source (throwing on a syntax error) without EXECUTING it — a safe parse check.
  const asScript = js.replace(/^export /m, "");
  assert.doesNotThrow(() => new vm.Script(asScript));
});

test("no commands → no spine", () => {
  assert.equal(Object.keys(spineAdapter(caps, { aggregates: domain.aggregates } as unknown as DomainDoc)).length, 0);
});
