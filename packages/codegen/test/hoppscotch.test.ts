import { test } from "node:test";
import assert from "node:assert/strict";
import { hoppscotchCollection } from "../src/index.ts";
import type { CapabilityDoc, DomainDoc } from "@kiln/compiler";

const caps: CapabilityDoc = { domain: "Solar", capabilities: [{ id: "billing", name: "Billing", purpose: "", outcomes: [] }] } as unknown as CapabilityDoc;
const domain: DomainDoc = {
  aggregates: [{ id: "invoice", name: "Invoice", owner: "billing", attributes: [{ name: "amount", type: "money" }, { name: "paid", type: "boolean" }], references: [] }],
  commands: [
    { id: "issue_invoice", name: "Issue Invoice", aggregate: "invoice", emits: [] },
    { id: "send_invoice", name: "Send Invoice", aggregate: "invoice", emits: [] },
  ],
} as unknown as DomainDoc;

test("collection: v12 wrapper, per-entity folder, v17 requests with example bodies + a health request", () => {
  const { collection } = hoppscotchCollection(caps, domain);
  assert.equal(collection.v, 12);
  const folders = collection.folders as Array<Record<string, unknown>>;
  const inv = folders.find((f) => f.name === "Invoice")!;
  assert.ok(inv, "Invoice folder");
  const requests = inv.requests as Array<Record<string, unknown>>;
  assert.equal(requests.length, 2);
  const issue = requests.find((r) => r.name === "Issue Invoice")!;
  assert.equal(issue.v, "17");
  assert.equal(issue.method, "POST");
  assert.equal(issue.endpoint, "<<baseUrl>>/invoices"); // "issue" is a create verb → collection endpoint
  const body = JSON.parse((issue.body as { body: string }).body);
  assert.equal(body.amount, 0); // money example
  assert.equal(body.paid, false); // boolean example
  // non-create → action path with the id var
  const send = requests.find((r) => r.name === "Send Invoice")!;
  assert.equal(send.endpoint, "<<baseUrl>>/invoices/<<id>>/send_invoice");
  // a top-level health GET
  assert.ok((collection.requests as Array<Record<string, unknown>>).some((r) => r.name === "Health" && r.method === "GET"));
});

test("environment: baseUrl + id variables", () => {
  const { environment } = hoppscotchCollection(caps, domain);
  const vars = environment.variables as Array<{ key: string; value: string }>;
  assert.ok(vars.some((v) => v.key === "baseUrl" && v.value.includes("localhost")));
  assert.ok(vars.some((v) => v.key === "id"));
});
