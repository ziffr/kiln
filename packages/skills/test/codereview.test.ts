import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewGeneratedCode } from "../src/index.ts";
import type { CapabilityDoc, DomainDoc } from "@vbd/compiler";

const caps: CapabilityDoc = { version: "0.2", domain: "solar", capabilities: [{ id: "sales", name: "Sales" }] };
const domain: DomainDoc = { version: "0.1", aggregates: [{ id: "offer", name: "Offer", owner: "sales", attributes: [{ name: "amount", type: "money" }] }], commands: [{ id: "make_offer", name: "Make Offer", aggregate: "offer", capability: "sales", emits: [] }], events: [], policies: [] } as any;

test("reviewGeneratedCode fans out per lens; tags each finding with its lens; ranks by severity", async () => {
  const seenLenses: string[] = [];
  const provider = { name: "t", complete: async (req: any) => {
    assert.match(req.user, /server\.mjs/); // the reviewer is shown the real code
    const lens = /SECURITY/.test(req.system) ? "security" : /CORRECTNESS/.test(req.system) ? "correctness" : "maintainability";
    seenLenses.push(lens);
    const sev = lens === "security" ? "high" : lens === "maintainability" ? "low" : "medium";
    return { provider: "t", raw: "", json: { findings: [{ severity: sev, file: "server.mjs", message: lens + " issue" }] } };
  } } as any;
  const res = await reviewGeneratedCode(caps, domain, undefined, undefined, undefined, provider);
  assert.deepEqual(seenLenses.sort(), ["correctness", "maintainability", "security"]); // one call per lens
  assert.equal(res.findings.length, 3);
  assert.equal(res.findings[0].severity, "high");       // ranked first
  assert.equal(res.findings[0].lens, "security");
  assert.equal(res.findings[2].severity, "low");
  assert.ok(res.findings.every((f) => f.id));
});
