import { test } from "node:test";
import assert from "node:assert/strict";
import { MODEL_SCHEMA_VERSION } from "../src/index.ts";

test("MODEL_SCHEMA_VERSION is a semver string", () => {
  assert.equal(typeof MODEL_SCHEMA_VERSION, "string");
  // MAJOR.MINOR.PATCH — the compatibility contract for exported model.json / IR shape.
  assert.match(MODEL_SCHEMA_VERSION, /^\d+\.\d+\.\d+$/);
});
