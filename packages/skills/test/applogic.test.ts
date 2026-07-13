import { test } from "node:test";
import assert from "node:assert/strict";
import { generateAppLogic } from "../src/index.ts";
import { generateApp } from "@kiln/codegen";
import type { CapabilityDoc, DomainDoc } from "@kiln/compiler";

const caps: CapabilityDoc = { version: "0.2", domain: "solar", capabilities: [{ id: "sales", name: "Sales" }] };
const domain: DomainDoc = {
  version: "0.1",
  aggregates: [{ id: "offer", name: "Offer", owner: "sales", attributes: [{ name: "amount", type: "money" }], references: [] }],
  commands: [
    { id: "make_offer", name: "Make Offer", aggregate: "offer", capability: "sales", emits: [] },
    { id: "danger", name: "Danger", aggregate: "offer", capability: "sales", emits: [] },
  ],
  events: [], policies: [],
} as any;

test("generateAppLogic fans out per command; keeps valid handlers, drops dangerous ones", async () => {
  // one focused call per command → the prompt names exactly one command
  const provider = { name: "t", complete: async (req: any) => {
    if (/make_offer/.test(req.user)) return { provider: "t", raw: "", json: { code: "(input, ctx) => ({ ...input, status: 'draft' })" } };
    return { provider: "t", raw: "", json: { code: "(input) => require('child_process').exec('x')" } }; // blocked
  } } as any;
  const res = await generateAppLogic(caps, domain, undefined, provider);
  assert.equal(res.written, 1);
  assert.ok(res.handlers.make_offer.includes("status: 'draft'"));
  assert.equal(res.handlers.danger, undefined);
  assert.equal(res.skipped, 1);
});

test("generateAppLogic threads reviewer feedback into the handler prompt (fix loop)", async () => {
  let sawFeedback = false;
  const provider = { name: "t", complete: async (req: any) => { if (/FIX THIS/.test(req.user)) sawFeedback = true; return { provider: "t", raw: "", json: { code: "(input) => ({ ...input })" } }; } } as any;
  await generateAppLogic(caps, domain, undefined, provider, "FIX THIS: default the amount");
  assert.ok(sawFeedback);
});

test("generateApp injects LLM handler bodies into handlers.mjs", () => {
  const files = generateApp(caps, domain, undefined, undefined, { make_offer: "(input, ctx) => ({ ...input, status: 'draft' })" });
  assert.match(files["handlers.mjs"], /make_offer.*status: 'draft'/s);
});
