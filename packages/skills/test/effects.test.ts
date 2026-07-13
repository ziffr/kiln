import { test } from "node:test";
import assert from "node:assert/strict";
import { coerceCommunications, coerceIntegrations } from "../src/index.ts";
import type { DomainDoc } from "@kiln/compiler";

const domain: DomainDoc = {
  aggregates: [
    { id: "invoice", name: "Invoice", owner: "billing", attributes: [], references: ["customer"] },
    { id: "customer", name: "Customer", owner: "billing", attributes: [], references: [] },
  ],
  commands: [{ id: "capture_customer", name: "Capture Customer", aggregate: "customer", emits: [] }],
  events: [{ id: "invoice_issued", name: "Invoice Issued", aggregate: "invoice", trigger: "command" }],
} as unknown as DomainDoc;

test("coerceCommunications keeps valid actions and drops ones with unknown event/entity/channel", () => {
  const json = {
    actions: [
      { id: "email_invoice_issued", name: "Email", channel: "email", on: "invoice_issued", entity: "invoice", recipient: "{{customer_email}}", subject: "s", template: "t" },
      { id: "bad_event", name: "X", channel: "email", on: "not_an_event", entity: "invoice", recipient: "x", subject: "s", template: "t" },
      { id: "bad_channel", name: "Y", channel: "carrier_pigeon", on: "invoice_issued", entity: "invoice", recipient: "x", subject: "s", template: "t" },
    ],
  };
  const out = coerceCommunications(json, domain);
  assert.equal(out.actions.length, 1);
  assert.equal(out.actions[0].on, "invoice_issued");
});

test("coerceIntegrations validates trigger by direction (command for inbound, event for outbound)", () => {
  const json = {
    actions: [
      { id: "in_customer_crm", name: "In", direction: "inbound", system: "CRM", entity: "customer", trigger: "capture_customer", mapping: { email: "Email" } },
      { id: "out_invoice", name: "Out", direction: "outbound", system: "Accounting", entity: "invoice", trigger: "invoice_issued", mapping: {} },
      { id: "in_bad", name: "Bad", direction: "inbound", system: "CRM", entity: "customer", trigger: "invoice_issued", mapping: {} }, // event as inbound trigger → drop
    ],
  };
  const out = coerceIntegrations(json, domain);
  assert.equal(out.actions.length, 2);
  assert.ok(out.actions.some((a) => a.direction === "inbound" && a.trigger === "capture_customer"));
  assert.ok(!out.actions.some((a) => a.id === "in_bad"));
});
