import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spineAdapter, entityFieldTypes } from "../src/index.ts";
import type { CapabilityDoc, DomainDoc } from "@kiln/compiler";

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

// ── query-by-field: GET /<res>?<column>=<value> (the agent's find_<entity> route) ──
//
// These exercise the ACTUAL GENERATED `src/query.ts` — written to a temp dir and imported — not a mirror of
// it. The safety claim ("a hostile param can't reach the SQL") is only worth anything if it's checked against
// the code the exported app really runs.

async function loadQuery(dialect: "postgres" | "sqlite" = "postgres") {
  const src = spineAdapter(caps, domain, {}, dialect)["src/query.ts"];
  const file = join(mkdtempSync(join(tmpdir(), "kiln-spine-query-")), "query.ts");
  writeFileSync(file, src);
  return (await import(pathToFileURL(file).href)) as {
    READ_LIMIT_CAP: number;
    plan: (q: Record<string, unknown>, cols: string[]) => { where: Record<string, string>; limit: number; errors: string[]; filtered: boolean };
    filterSql: (t: string, cols: string[], w: Record<string, string>, l: number, ph: (i: number) => string) => { sql: string; params: unknown[] };
  };
}
const pg = (i: number) => "$" + i;
const leadCols = ["id", "email"];

test("spine emits query.ts and wires filtering into the read route (both dialects)", () => {
  for (const dialect of ["postgres", "sqlite"] as const) {
    const f = spineAdapter(caps, domain, {}, dialect);
    assert.ok(f["src/query.ts"], `query.ts missing (${dialect})`);
    // app.ts: plan the query against the entity's columns, 400 on a bad one, else filter — or list everything.
    assert.match(f["src/app.ts"], /import \{ plan \} from ".\/query"/);
    assert.match(f["src/app.ts"], /const p = plan\(req\.query as Record<string, unknown>, cols\)/);
    assert.match(f["src/app.ts"], /status\(400\)\.json\(\{ error: "bad query", details: p\.errors, filterable: cols \}\)/);
    assert.match(f["src/app.ts"], /p\.filtered \? await filter\(entity, cols, p\.where, p\.limit\) : await all\(entity\)/);
    assert.match(f["src/app.ts"], /app\.get\("\/" \+ res, requireAuth,/); // reads keep the opt-in bearer
    // db.ts: the dialect's filter, built through the shared parameterised builder.
    assert.match(f["src/db.ts"], /import \{ filterSql \} from ".\/query"/);
    assert.match(f["src/db.ts"], /export const filter/);
  }
  // the placeholder style is the ONLY difference: pg binds $1.. ; sqlite binds ?
  assert.match(spineAdapter(caps, domain, {}, "postgres")["src/db.ts"], /filterSql\(table, cols, where, limit, \(i\) => "\$" \+ i\)/);
  assert.match(spineAdapter(caps, domain, {}, "sqlite")["src/db.ts"], /filterSql\(table, cols, where, limit, \(\) => "\?"\)/);
});

test("plan() keeps only the entity's real columns — an unknown param is a 400, never silently ignored", async () => {
  const q = await loadQuery();
  const p = q.plan({ email: "a@b.com" }, leadCols);
  assert.deepEqual(p.where, { email: "a@b.com" });
  assert.deepEqual(p.errors, []);
  assert.equal(p.filtered, true);
  // a typo'd / unknown filter must NOT read as "no matches" — that's a silent wrong answer
  const bad = q.plan({ emial: "a@b.com" }, leadCols);
  assert.deepEqual(bad.where, {});
  assert.deepEqual(bad.errors, ['unknown filter field "emial"']);
});

test("plan() ANDs several fields; no query at all keeps the route's list-everything behaviour", async () => {
  const q = await loadQuery();
  const both = q.plan({ id: "r_1", email: "a@b.com" }, leadCols);
  assert.deepEqual(both.where, { id: "r_1", email: "a@b.com" });
  // no params → filtered:false → the route still returns every row (the UI's list is unchanged)
  const none = q.plan({}, leadCols);
  assert.equal(none.filtered, false);
  assert.deepEqual(none.where, {});
});

test("plan() clamps the limit: default 50, an explicit one may only ask for FEWER", async () => {
  const q = await loadQuery();
  assert.equal(q.READ_LIMIT_CAP, 50);
  assert.equal(q.plan({ email: "a@b.com" }, leadCols).limit, 50, "default = the cap");
  assert.equal(q.plan({ limit: "5" }, leadCols).limit, 5);
  assert.equal(q.plan({ limit: "5000" }, leadCols).limit, 50, "a filter matching everything can't dump the table");
  assert.equal(q.plan({ limit: "7.9" }, leadCols).limit, 7, "floored");
  assert.equal(q.plan({ limit: "5" }, leadCols).filtered, true, "an explicit limit alone still bounds the read");
  for (const l of ["0", "-1", "abc", ""]) assert.deepEqual(q.plan({ limit: l }, leadCols).errors, ["limit must be a positive integer"], `limit=${l}`);
});

test("SECURITY: a hostile param NAME cannot reach the SQL — the column allow-list rejects it", async () => {
  const q = await loadQuery();
  const hostile = ["email; DROP TABLE lead; --", "1=1", "email OR 1=1", "*", "email)", "__proto__", "constructor"];
  for (const name of hostile) {
    const p = q.plan({ [name]: "x" }, leadCols);
    assert.deepEqual(p.where, {}, `${name} must not become a filter`);
    assert.equal(p.errors.length, 1, `${name} must be reported`);
    // even if it somehow got past plan(), filterSql re-applies the allow-list at the SQL seam
    const { sql, params } = q.filterSql("lead", leadCols, { [name]: "x" }, 50, pg);
    assert.equal(sql, "SELECT * FROM lead LIMIT $1", `${name} reached the SQL string`);
    assert.deepEqual(params, [50]);
  }
});

test("SECURITY: a hostile param VALUE is BOUND, never concatenated into the SQL", async () => {
  const q = await loadQuery();
  for (const value of ["a@b.com' OR 1=1 --", "'; DROP TABLE lead; --", "\\'; DELETE FROM lead; --", "1 UNION SELECT * FROM lead"]) {
    const { sql, params } = q.filterSql("lead", leadCols, { email: value }, 50, pg);
    assert.equal(sql, "SELECT * FROM lead WHERE email = $1 LIMIT $2", "the SQL shape is fixed by the model, not the input");
    assert.deepEqual(params, [value, 50], "the value only ever travels as a bind param");
    assert.ok(!sql.includes(value), "the value never appears in the SQL string");
    assert.ok(!/DROP|DELETE|UNION|OR 1=1/i.test(sql));
  }
});

test("filterSql: allow-listed columns AND together; the limit is a bind param too (both dialects)", async () => {
  const q = await loadQuery();
  const two = q.filterSql("lead", leadCols, { email: "a@b.com", id: "r_1" }, 10, pg);
  assert.equal(two.sql, "SELECT * FROM lead WHERE email = $1 AND id = $2 LIMIT $3");
  assert.deepEqual(two.params, ["a@b.com", "r_1", 10]);
  // sqlite: same builder, `?` placeholders — the params line up positionally
  const lite = q.filterSql("lead", leadCols, { email: "a@b.com" }, 10, () => "?");
  assert.equal(lite.sql, "SELECT * FROM lead WHERE email = ? LIMIT ?");
  assert.deepEqual(lite.params, ["a@b.com", 10]);
  // the limit is clamped at the SQL seam as well, not only in plan()
  assert.deepEqual(q.filterSql("lead", leadCols, {}, 9999, pg).params, [50]);
  assert.deepEqual(q.filterSql("lead", leadCols, {}, 0, pg).params, [50]);
  assert.deepEqual(q.filterSql("lead", leadCols, {}, -3, pg).params, [1]);
});
