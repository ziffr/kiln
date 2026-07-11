import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewGeneratedCode } from "../src/index.ts";
import type { CapabilityDoc, DomainDoc } from "@vbd/compiler";

const caps: CapabilityDoc = { version: "0.2", domain: "solar", capabilities: [{ id: "sales", name: "Sales" }] };
const domain: DomainDoc = { version: "0.1", aggregates: [{ id: "offer", name: "Offer", owner: "sales", attributes: [{ name: "amount", type: "money" }] }], commands: [{ id: "make_offer", name: "Make Offer", aggregate: "offer", capability: "sales", emits: [] }], events: [], policies: [] } as any;

test("reviewGeneratedCode coerces findings, ranks by severity, stamps ids", async () => {
  const provider = { name: "t", complete: async (req: any) => {
    // the reviewer must be shown the real generated code
    assert.match(req.user, /server\.mjs/);
    assert.match(req.user, /HANDLERS/);
    return { provider: "t", raw: "", json: { findings: [
      { lens: "maintainability", severity: "low", file: "handlers.mjs", message: "thin", suggestion: "add docs" },
      { lens: "security", severity: "high", file: "server.mjs", message: "no rate limit" },
      { lens: "bogus", severity: "weird", file: "x", message: "coerced" },
    ] } };
  } } as any;
  const res = await reviewGeneratedCode(caps, domain, undefined, undefined, undefined, provider);
  assert.equal(res.findings.length, 3);
  assert.equal(res.findings[0].severity, "high"); // ranked first
  assert.equal(res.findings[0].lens, "security");
  assert.equal(res.findings[1].lens, "correctness"); // bad lens coerced; medium sorts to the middle
  assert.equal(res.findings[1].severity, "medium");  // bad severity coerced
  assert.equal(res.findings[2].severity, "low"); // low ranks last
  assert.ok(res.findings.every((f) => f.id));
});
