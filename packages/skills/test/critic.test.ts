import { test } from "node:test";
import assert from "node:assert/strict";
import { critiqueLayer, critiqueToFeedback, resolveTarget, generateContexts, type LlmProvider, type ReviewModel } from "../src/index.ts";
import type { CapabilityDoc } from "@kiln/compiler";

const caps: CapabilityDoc = {
  version: "0.2", domain: "solar",
  capabilities: [
    { id: "lead_management", name: "Lead Management" },
    { id: "billing", name: "Billing" },
  ],
};
const model: ReviewModel = { caps, contexts: { version: "0.1", contexts: [{ id: "c_sales", name: "Sales", capabilities: ["lead_management"] }] } as any };

test("critiqueLayer coerces findings and stamps stable ids", async () => {
  const provider: LlmProvider = {
    name: "anthropic:test",
    complete: async () => ({ provider: "anthropic:test", raw: "", json: { findings: [
      { severity: "concern", message: "over-segmented", suggestion: "merge", target: "Sales" },
      { severity: "bogus", message: "x" }, // severity coerced to suggestion
    ] } }),
  };
  const res = await critiqueLayer("areas", model, provider);
  assert.equal(res.findings.length, 2);
  assert.equal(res.findings[0].severity, "concern");
  assert.equal(res.findings[1].severity, "suggestion");
  assert.ok(res.findings[0].id && res.findings[0].id === res.findings[0].id);
});

test("resolveTarget maps a name/id to a selectable node across the model", () => {
  assert.deepEqual(resolveTarget("Lead Management", model), { kind: "capability", id: "lead_management" });
  assert.deepEqual(resolveTarget("Sales", model), { kind: "area", id: "c_sales" });
  assert.equal(resolveTarget("nonexistent", model), undefined);
});

test("critiqueToFeedback yields empty for a clean review and a directive block otherwise", () => {
  assert.equal(critiqueToFeedback([]), "");
  const fb = critiqueToFeedback([{ id: "a", severity: "concern", message: "too many areas", suggestion: "merge X and Y" }]);
  assert.ok(fb.includes("too many areas") && fb.includes("merge X and Y") && /ADDRESS/i.test(fb));
});

test("generateContexts threads reviewer feedback into the prompt (Refine loop)", async () => {
  let seen = "";
  const provider: LlmProvider = {
    name: "anthropic:test",
    complete: async (req) => { seen = req.user; return { provider: "anthropic:test", raw: "", json: { version: "0.1", contexts: [
      { name: "All", capabilities: ["lead_management", "billing"], derivedFrom: [{ anchor: "a" }] },
    ] } }; },
  };
  await generateContexts(caps, provider, "REVIEWER SAYS: merge the areas");
  assert.ok(seen.includes("REVIEWER SAYS: merge the areas"));
});

test("CRITIQUE_EFFORT covers every layer incl. holistic, with valid effort values", async () => {
  const { CRITIQUE_EFFORT } = await import("../src/index.ts");
  const valid = new Set(["low", "medium", "high", "max"]);
  for (const k of ["capabilities", "areas", "entities", "behaviour", "automations", "roles", "workflows", "agents", "holistic"]) {
    assert.ok(valid.has(CRITIQUE_EFFORT[k]), `${k} → ${CRITIQUE_EFFORT[k]}`);
  }
  assert.equal(CRITIQUE_EFFORT.holistic, "high"); // hardest pass gets the top tier
  assert.equal(CRITIQUE_EFFORT.roles, "medium"); // mechanical layer gets less
});

test("holistic critic reviews the whole model and its prompt spans all layers", async () => {
  const { buildCritiqueRequest, critiqueLayer } = await import("../src/index.ts");
  const full = {
    caps,
    domain: { aggregates: [{ id: "invoice", owner: "billing", attributes: [] }], commands: [], events: [], policies: [] },
    contexts: { version: "0.1", contexts: [] },
    roles: { version: "0.1", roles: [] },
    workflows: { version: "0.1", workflows: [] },
    agents: { version: "0.1", agents: [] },
  } as any;
  const req = buildCritiqueRequest("holistic", full);
  assert.match(req.user, /coverage/i);
  assert.match(req.system, /WHOLE model/i);
  const provider = { name: "t", complete: async () => ({ provider: "t", raw: "", json: { findings: [{ severity: "concern", message: "billing has an entity but no behaviour", target: "billing" }] } }) } as any;
  const res = await critiqueLayer("holistic", full, provider);
  assert.equal(res.findings.length, 1);
  assert.equal(res.findings[0].target, "billing");
});

test("few-shot exemplar is embedded in each layer's system prompt", async () => {
  const { buildCritiqueRequest } = await import("../src/index.ts");
  const req = buildCritiqueRequest("entities", { caps } as any);
  assert.match(req.system, /Example of the KIND of finding/i);
  assert.match(req.system, /Invoice/); // the entities exemplar
});

test("LAYER_TIER classifies every layer and the hard-reasoning ones are 'heavy'", async () => {
  const { LAYER_TIER } = await import("../src/index.ts");
  const valid = new Set(["light", "standard", "heavy"]);
  for (const k of ["capabilities", "areas", "entities", "behaviour", "automations", "roles", "workflows", "agents", "holistic"]) {
    assert.ok(valid.has(LAYER_TIER[k]), `${k} → ${LAYER_TIER[k]}`);
  }
  // the judgment-laden stages get the strongest tier
  for (const k of ["areas", "automations", "holistic", "capabilities"]) assert.equal(LAYER_TIER[k], "heavy", k);
  // pure extraction/scaffolding stays light
  for (const k of ["entities", "roles", "agents"]) assert.equal(LAYER_TIER[k], "light", k);
});
