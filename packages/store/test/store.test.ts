import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadIR, isCacheFresh, VBD_DIR } from "../src/index.ts";
import type { CapabilityDoc } from "@vbd/compiler";

const doc: CapabilityDoc = {
  version: "0.2",
  domain: "solar-installer",
  capabilities: [
    { id: "lead_management", name: "Lead Management", purpose: "Acquire prospects.", outcomes: ["qualified_lead"] },
  ],
};

function ws(): string {
  return mkdtempSync(join(tmpdir(), "vbd-store-"));
}

test("first load compiles and writes the cache (miss)", () => {
  const dir = ws();
  try {
    const r = loadIR(dir, doc);
    assert.equal(r.fromCache, false);
    assert.ok(existsSync(join(dir, VBD_DIR, "ir.json")));
    assert.ok(existsSync(join(dir, VBD_DIR, "build.meta.json")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("second load with unchanged input hits the cache", () => {
  const dir = ws();
  try {
    loadIR(dir, doc);
    assert.equal(loadIR(dir, doc).fromCache, true);
    assert.ok(isCacheFresh(dir, doc));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a changed model invalidates the cache (buildHash mismatch → recompile)", () => {
  const dir = ws();
  try {
    loadIR(dir, doc);
    const doc2 = structuredClone(doc);
    doc2.capabilities[0].purpose = "a different purpose";
    assert.equal(isCacheFresh(dir, doc2), false);
    const r = loadIR(dir, doc2);
    assert.equal(r.fromCache, false);
    assert.equal(loadIR(dir, doc2).fromCache, true); // now cached for the new model
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a corrupt cache falls back to recompile", () => {
  const dir = ws();
  try {
    loadIR(dir, doc);
    writeFileSync(join(dir, VBD_DIR, "ir.json"), "{ not valid json");
    assert.equal(loadIR(dir, doc).fromCache, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
