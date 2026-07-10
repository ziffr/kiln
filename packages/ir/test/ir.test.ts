import { test } from "node:test";
import assert from "node:assert/strict";
import { canonical, sha256, slug, edgeId } from "../src/index.ts";

test("canonical is key-order independent", () => {
  assert.equal(canonical({ a: 1, b: 2 }), canonical({ b: 2, a: 1 }));
});

test("canonical distinguishes different values", () => {
  assert.notEqual(canonical({ a: 1 }), canonical({ a: 2 }));
});

test("canonical recurses into arrays and nested objects", () => {
  assert.equal(
    canonical({ x: [{ b: 1, a: 2 }] }),
    canonical({ x: [{ a: 2, b: 1 }] }),
  );
});

test("sha256 is deterministic", () => {
  assert.equal(sha256("x"), sha256("x"));
  assert.notEqual(sha256("x"), sha256("y"));
});

test("slug normalizes labels to stable ids", () => {
  assert.equal(slug("Lead Management"), "lead_management");
  assert.equal(slug("  Roof / Module  "), "roof_module");
});

test("edgeId has a deterministic format", () => {
  assert.equal(edgeId("a", "b", "produces"), "a--produces-->b");
});
