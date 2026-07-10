import { test } from "node:test";
import assert from "node:assert/strict";
import { validateV1, validateV2, validateAll } from "../src/index.ts";
import type { CapabilityDoc } from "@vbd/compiler";

const clean: CapabilityDoc = {
  version: "0.2",
  domain: "solar-installer",
  capabilities: [
    {
      id: "lead_management",
      name: "Lead Management",
      purpose: "Acquire and qualify prospective customers.",
      outcomes: ["qualified_lead"],
    },
  ],
};

test("a clean doc yields no findings", () => {
  assert.equal(validateAll(clean).length, 0);
});

test("V1 flags a missing purpose", () => {
  const d = structuredClone(clean);
  delete (d.capabilities[0] as { purpose?: string }).purpose;
  assert.ok(validateV1(d).some((f) => f.code === "V1.purpose"));
});

test("V1 flags missing outcomes", () => {
  const d = structuredClone(clean);
  d.capabilities[0].outcomes = [];
  assert.ok(validateV1(d).some((f) => f.code === "V1.outcomes"));
});

test("V2 flags a duplicate id as a blocker", () => {
  const d = structuredClone(clean);
  d.capabilities.push(structuredClone(clean.capabilities[0]));
  const f = validateV2(d).find((x) => x.code === "V2.unique");
  assert.ok(f);
  assert.equal(f.severity, "blocker");
});

test("V2 flags a non-slug id", () => {
  const d = structuredClone(clean);
  d.capabilities[0].id = "Lead Management";
  assert.ok(validateV2(d).some((f) => f.code === "V2.slug"));
});

test("finding ids are stable / content-addressed across runs", () => {
  const d = structuredClone(clean);
  d.capabilities[0].outcomes = [];
  const a = validateV1(d).find((f) => f.code === "V1.outcomes");
  const b = validateV1(structuredClone(d)).find((f) => f.code === "V1.outcomes");
  assert.ok(a && b);
  assert.equal(a.id, b.id);
});
