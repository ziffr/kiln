import { test } from "node:test";
import assert from "node:assert/strict";
import { mockGenerateEvents, generateEvents, coerceAggregateBehaviour, type LlmProvider } from "../src/index.ts";
import { validateEvents } from "@kiln/validation";
import type { CapabilityDoc, DomainDoc } from "@kiln/compiler";

const caps: CapabilityDoc = {
  version: "0.2",
  domain: "solar",
  capabilities: [
    { id: "lead_management", name: "Lead Management" },
    { id: "billing", name: "Billing" },
  ],
};
const domain: DomainDoc = {
  version: "0.2",
  aggregates: [
    { id: "lead", name: "Lead", owner: "lead_management" },
    { id: "invoice", name: "Invoice", owner: "billing" },
  ],
};

test("mock behaviour validates clean (a command + event per aggregate)", () => {
  const d = mockGenerateEvents(domain);
  const f = validateEvents(d, caps.capabilities.map((c) => c.id));
  assert.ok(!f.some((x) => x.severity === "blocker" || x.severity === "major"), JSON.stringify(f));
  assert.equal(d.commands?.length, 4);
  assert.equal(d.events?.length, 4);
});

test("coerce pins the aggregate, snaps capability, resolves emits within the entity", () => {
  const agg = domain.aggregates[0];
  const b = coerceAggregateBehaviour(
    { events: [{ name: "Lead Qualified" }], commands: [{ name: "Qualify Lead", capability: "lead-management", emits: ["Lead Qualified"] }] },
    agg,
    caps,
  );
  assert.equal(b.events[0].aggregate, "lead");
  assert.equal(b.commands[0].capability, "lead_management"); // hyphen snapped
  assert.deepEqual(b.commands[0].emits, ["lead_qualified"]); // emit resolved to the event id
});

test("generateEvents fans out per aggregate and validates clean", async () => {
  const provider: LlmProvider = {
    name: "anthropic:test",
    complete: async (req) => {
      const forLead = /id: lead\)/.test(req.user);
      const json = forLead
        ? { events: [{ name: "Lead Qualified", derivedFrom: [{ anchor: "sales" }] }], commands: [{ name: "Qualify Lead", capability: "lead_management", emits: ["Lead Qualified"], derivedFrom: [{ anchor: "sales" }] }] }
        : { events: [{ name: "Invoice Issued", derivedFrom: [{ anchor: "fin" }] }], commands: [{ name: "Issue Invoice", capability: "billing", emits: ["Invoice Issued"], derivedFrom: [{ anchor: "fin" }] }] };
      return { provider: "anthropic:test", raw: "", json };
    },
  };
  const res = await generateEvents(domain, caps, provider);
  assert.equal(res.doc.commands?.length, 2);
  assert.equal(res.doc.events?.length, 2);
  assert.ok(!res.findings.some((f) => f.severity === "blocker" || f.severity === "major"), JSON.stringify(res.findings));
});
