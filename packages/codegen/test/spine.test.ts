import { test } from "node:test";
import assert from "node:assert/strict";
import { spineAdapter, entityFieldTypes } from "../src/index.ts";
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

test("spineAdapter emits a runnable, typed Express+pg service (TS: server/db/handlers/schema/types)", () => {
  const f = spineAdapter(caps, domain);
  for (const p of ["package.json", "tsconfig.json", "eslint.config.js", "src/server.ts", "src/db.ts", "src/events.ts", "src/handlers.ts", "src/schema.ts", "src/runtime.ts", "src/types.ts", ".env.example"]) assert.ok(f[p], `${p} missing`);
  const pkg = JSON.parse(f["package.json"]);
  assert.ok(pkg.dependencies.express && pkg.dependencies.pg, "express + pg deps");
  assert.equal(pkg.scripts.start, "tsx src/server.ts");
  assert.ok(pkg.scripts.typecheck && pkg.scripts.lint, "typecheck + lint scripts");
  assert.match(f["src/types.ts"], /export interface Invoice \{/); // entity types from the model
});

test("routes: create verbs POST /table, others POST /table/{id}/action; columns include refs", () => {
  const f = spineAdapter(caps, domain);
  const routes = JSON.parse(f["src/schema.ts"].match(/routes: Route\[\] = (\[[\s\S]*?\]);/)![1]);
  const cap = routes.find((r: { command: string }) => r.command === "capture_lead");
  assert.equal(cap.path, "/leads"); // "capture" is a create verb
  assert.equal(cap.create, true);
  const send = routes.find((r: { command: string }) => r.command === "send_invoice");
  assert.equal(send.path, "/invoices/{id}/send_invoice"); // non-create → action path
  assert.deepEqual(send.emits, ["invoice_sent"]);
  const cols = JSON.parse(f["src/schema.ts"].match(/columns: Record<string, string\[\]> = (\{[\s\S]*?\});/)![1]);
  assert.ok(cols.invoice.includes("id") && cols.invoice.includes("amount") && cols.invoice.includes("lead_id"));
});

test("LLM-drafted handlers spliced with a typed h<Entity>() wrapper; missing → pass-through default", () => {
  const drafted = { send_invoice: "(input, ctx) => ({ ...input, status: 'sent' })" };
  const f = spineAdapter(caps, domain, drafted);
  assert.match(f["src/handlers.js"] ?? f["src/handlers.ts"], /\/\/ Send Invoice — LLM-drafted/);
  assert.match(f["src/handlers.ts"], /"send_invoice": h<T\.Invoice>\(\(input, ctx\) => \(\{ \.\.\.input, status: 'sent' \}\)\),/);
  assert.match(f["src/handlers.ts"], /\/\/ Capture Lead — pass-through default/);
  assert.match(f["src/handlers.ts"], /"capture_lead": h<T\.Lead>\(\(input\) => \(\{ \.\.\.input \}\)\),/);
});

test("a multi-line, heavily-commented block body embeds with its comments + an intact trailing comma", () => {
  const body = ["(input, ctx) => {", "  // Send the invoice — flips status to 'sent'.", "  // ASSUMPTION: no send-side effects modelled yet; a human wires email here.", "  return { ...input, status: 'sent' };", "}"].join("\n");
  const js = spineAdapter(caps, domain, { send_invoice: body })["src/handlers.ts"];
  assert.match(js, /ASSUMPTION: no send-side effects/); // the comment survives
  // the block body's close-brace, the h() close-paren, and the comma must be together on the last line,
  // never swallowed by a preceding // comment.
  assert.match(js, /return \{ \.\.\.input, status: 'sent' \};\n\}\),/);
});

test("no commands → no spine", () => {
  assert.equal(Object.keys(spineAdapter(caps, { aggregates: domain.aggregates } as unknown as DomainDoc)).length, 0);
});

test("entityFieldTypes maps typed attributes (+ id, references) per aggregate slug", () => {
  const ft = entityFieldTypes(domain);
  assert.equal(ft.lead.id, "text");
  assert.equal(ft.lead.email, "text");
  assert.equal(ft.invoice.amount, "money");
  assert.equal(ft.invoice.lead_id, "reference"); // a reference → an id string
});

test("untyped attribute → 'any' (no constraint at validation)", () => {
  const d = { aggregates: [{ id: "note", name: "Note", owner: "sales", attributes: ["body"] }], commands: [{ id: "add_note", name: "Add Note", aggregate: "note" }] } as unknown as DomainDoc;
  assert.equal(entityFieldTypes(d).note.body, "any");
});

test("spine emits validate.ts + wires opt-in bearer auth + validation into app.ts", () => {
  const f = spineAdapter(caps, domain);
  assert.ok(f["src/validate.ts"], "validate.ts missing");
  assert.match(f["src/validate.ts"], /export function validate\(entity: string, body: unknown\): string\[\]/);
  assert.match(f["src/validate.ts"], /"money": Number\.isFinite|case "money"/); // money type-check present
  // app.ts: auth middleware, applied to command routes (not /health), and a validation gate before handlers.
  assert.match(f["src/app.ts"], /const API_TOKEN = process\.env\.API_TOKEN/);
  assert.match(f["src/app.ts"], /timingSafeEqual/); // constant-time compare
  assert.match(f["src/app.ts"], /app\.post\(path, requireAuth,/);
  assert.match(f["src/app.ts"], /const errors = validate\(r\.entity, req\.body\)/);
  assert.match(f["src/app.ts"], /status\(400\)\.json\(\{ error: "validation failed"/);
  assert.match(f[".env.example"], /API_TOKEN/);
});
