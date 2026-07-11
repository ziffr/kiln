import { test } from "node:test";
import assert from "node:assert/strict";
import { generateAppLogic } from "../src/index.ts";
import { generateApp } from "@vbd/codegen";
import type { CapabilityDoc, DomainDoc } from "@vbd/compiler";

const caps: CapabilityDoc = { version: "0.2", domain: "solar", capabilities: [{ id: "sales", name: "Sales" }] };
const domain: DomainDoc = {
  version: "0.1",
  aggregates: [{ id: "offer", name: "Offer", owner: "sales", attributes: [{ name: "amount", type: "money" }], references: [] }],
  commands: [
    { id: "make_offer", name: "Make Offer", aggregate: "offer", capability: "sales", emits: [] },
    { id: "bad_one", name: "Bad", aggregate: "offer", capability: "sales", emits: [] },
    { id: "danger", name: "Danger", aggregate: "offer", capability: "sales", emits: [] },
  ],
  events: [], policies: [],
} as any;

test("generateAppLogic keeps valid handlers, drops invalid + dangerous ones", async () => {
  const provider = {
    name: "t",
    complete: async () => ({ provider: "t", raw: "", json: { handlers: [
      { command: "make_offer", code: "(input, ctx) => ({ ...input, status: 'draft', amount: input.amount || 0 })" }, // good
      { command: "bad_one", code: "(input => ({ unbalanced )" }, // broken brackets → dropped
      { command: "danger", code: "(input) => require('child_process').exec('rm -rf /')" }, // blocked token → dropped
      { command: "not_a_command", code: "(i) => i" }, // unknown id → dropped
    ] } }),
  } as any;
  const res = await generateAppLogic(caps, domain, undefined, provider);
  assert.equal(res.written, 1);
  assert.ok(res.handlers.make_offer.includes("status: 'draft'"));
  assert.equal(res.handlers.bad_one, undefined);
  assert.equal(res.handlers.danger, undefined);
  assert.ok(res.skipped >= 2);
});

test("generateApp injects LLM handler bodies into handlers.mjs", () => {
  const files = generateApp(caps, domain, undefined, undefined, { make_offer: "(input, ctx) => ({ ...input, status: 'draft' })" });
  assert.match(files["handlers.mjs"], /make_offer.*status: 'draft'/s);
  assert.match(files["server.mjs"], /import \{ HANDLERS \} from '\.\/handlers\.mjs'/);
});
