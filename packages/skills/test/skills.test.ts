import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNarrative } from "@kiln/narrative";
import { compileCapabilities } from "@kiln/compiler";
import { validateAll } from "@kiln/validation";
import {
  mockGenerateCapabilities,
  MockProvider,
  generateCapabilities,
  coerceCapabilityDoc,
  type LlmProvider,
  type LlmRequest,
  type LlmResult,
} from "../src/index.ts";

const solar = `# Sonnenkraft Solar GmbH
## Purpose
Design, install and maintain PV systems.
## Customers
- Homeowners
## Business Outcomes
- Sell projects
## Core Activities
- Acquire leads
- Qualify customers
- Create technical design
- Create commercial offer
- Purchase equipment
- Schedule installation
- Invoice
- Monitor
`;

const doc = parseNarrative(solar);

test("mock generation derives capabilities from core activities", () => {
  const caps = mockGenerateCapabilities(doc);
  const ids = caps.capabilities.map((c) => c.id);
  // key business capabilities should emerge, grouped (not one-per-activity)
  assert.ok(ids.includes("lead_management"));
  assert.ok(ids.includes("planning"));
  assert.ok(ids.includes("offer_management"));
  assert.ok(ids.includes("procurement"));
  assert.ok(ids.includes("installation"));
  assert.ok(ids.includes("billing"));
  assert.ok(ids.includes("monitoring"));
});

test("generated capabilities carry provenance and are valid", () => {
  const caps = mockGenerateCapabilities(doc);
  for (const c of caps.capabilities) {
    const meta = c.meta as { derivedFrom?: unknown[]; origin?: string };
    assert.equal(meta.origin, "mock");
    assert.ok(Array.isArray(meta.derivedFrom) && meta.derivedFrom.length > 0, `${c.id} lacks provenance`);
  }
  assert.deepEqual(validateAll(caps), []); // no V1/V2 issues
});

test("generation is deterministic", () => {
  const a = JSON.stringify(mockGenerateCapabilities(doc));
  const b = JSON.stringify(mockGenerateCapabilities(parseNarrative(solar)));
  assert.equal(a, b);
});

test("generated doc compiles into an IR with a dependency chain", () => {
  const caps = mockGenerateCapabilities(doc);
  const ir = compileCapabilities(caps);
  assert.ok(ir.nodes.some((n) => n.type === "capability"));
  assert.ok(ir.edges.some((e) => e.type === "depends_on"));
});

test("generateCapabilities via MockProvider returns a validated doc", async () => {
  const res = await generateCapabilities(doc, new MockProvider());
  assert.equal(res.provider, "mock");
  assert.equal(res.repaired, false);
  assert.deepEqual(res.findings, []);
  assert.ok(res.doc.capabilities.length > 0);
});

test("repair retry fires on a blocking first response, then recovers", async () => {
  // First call returns a doc with a duplicate id (V2.unique blocker); second call is clean.
  const scripted: LlmResult[] = [
    { provider: "scripted", raw: "", json: { version: "0.2", domain: "x", capabilities: [
      { id: "dup", name: "A", purpose: "p", outcomes: ["o"] },
      { id: "dup", name: "B", purpose: "p", outcomes: ["o"] },
    ] } },
    { provider: "scripted", raw: "", json: { version: "0.2", domain: "x", capabilities: [
      { id: "a", name: "A", purpose: "p", outcomes: ["o"] },
    ] } },
  ];
  let i = 0;
  const provider: LlmProvider = {
    name: "scripted",
    complete: async (_req: LlmRequest) => scripted[Math.min(i++, scripted.length - 1)],
  };
  const res = await generateCapabilities(doc, provider);
  assert.equal(res.repaired, true);
  assert.deepEqual(res.findings, []);
  assert.equal(res.doc.capabilities.length, 1);
});

test("coerceCapabilityDoc rejects unusable payloads", () => {
  assert.equal(coerceCapabilityDoc(null), null);
  assert.equal(coerceCapabilityDoc({ nope: true }), null);
  assert.ok(coerceCapabilityDoc({ capabilities: [] }));
});

test("LLM-cited provenance is grounded to real narrative anchors (V8 passes)", async () => {
  // A scripted 'LLM' that cites a real activity ("Acquire leads") and a bogus one.
  const provider: LlmProvider = {
    name: "anthropic:test-model",
    complete: async () => ({
      provider: "anthropic:test-model",
      raw: "",
      json: {
        version: "0.2",
        domain: "solar",
        capabilities: [
          { id: "lead_management", name: "Lead Management", purpose: "Acquire leads.", outcomes: ["qualified_lead"], derivedFrom: ["Acquire leads", "Fly to the moon"] },
        ],
      },
    }),
  };
  const res = await generateCapabilities(doc, provider);
  assert.deepEqual(res.findings, []); // grounded provenance → V8 passes
  const meta = res.doc.capabilities[0].meta as { origin?: string; derivedFrom?: Array<{ anchor?: string }> };
  assert.equal(meta.origin, "llm");
  // the real activity was grounded to an anchor; the bogus citation was dropped.
  assert.deepEqual(meta.derivedFrom?.map((d) => d.anchor), ["acquire-leads"]);
  // the raw top-level derivedFrom string[] must not leak through
  assert.equal((res.doc.capabilities[0] as { derivedFrom?: unknown }).derivedFrom, undefined);
});
