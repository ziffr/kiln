import { test } from "node:test";
import assert from "node:assert/strict";
import {
  registerEngine,
  getEngineAdapter,
  registeredEngines,
  ENGINES,
  type EngineAdapter,
  type Engine,
} from "../src/index.ts";

// A fake third-party engine — the whole point of SPEC-010 is that this needs NO edit to core dispatch.
const FAKE: Engine = {
  id: "fake_store",
  name: "Fake Store",
  reach: "sql",
  provides: { store: "native", authorize: "none", emit: "none", operate: "none", react: "none", sequence: "none", "serve-ui": "none" },
};
const fakeAdapter: EngineAdapter = {
  engine: FAKE,
  applies: (ctx) => ctx.dialect === "postgres",
  generate: () => ({ files: { "fake_store/schema.sql": "-- fake" } }),
};

test("the built-ins register themselves on import (side effect of engines/index.ts)", () => {
  const ids = registeredEngines().map((e) => e.id);
  for (const id of ["postgres", "sqlite", "n8n", "node", "odoo", "shadcn", "langdock"]) assert.ok(ids.includes(id), `built-in "${id}" registered`);
  // ENGINES is a DERIVED VIEW of the registry — same descriptors, keyed by id.
  assert.equal(Object.keys(ENGINES).length, 7);
  assert.equal(ENGINES.odoo.couplesStore, true);
  assert.equal(ENGINES.shadcn.provides["serve-ui"], "native");
  // langdock = an agent-runtime engine: operate native, http reach.
  assert.equal(ENGINES.langdock.provides.operate, "native");
  assert.equal(ENGINES.langdock.reach, "http");
});

test("registeredEngines() is deterministic — sorted by engine id regardless of registration order", () => {
  const ids = registeredEngines().map((e) => e.id);
  const sorted = [...ids].sort();
  assert.deepEqual(ids, sorted);
});

test("registerEngine makes a new engine visible to getEngineAdapter, registeredEngines and the derived ENGINES", () => {
  registerEngine(fakeAdapter);
  assert.equal(getEngineAdapter("fake_store"), fakeAdapter);
  assert.ok(registeredEngines().some((e) => e.id === "fake_store"));
  // the derived view is re-computed from the registry, so the new descriptor is visible for binding/validation.
  const engines = Object.fromEntries(registeredEngines().map((e) => [e.id, e]));
  assert.equal(engines.fake_store.name, "Fake Store");
  assert.equal(engines.fake_store.provides.store, "native");
});

test("getEngineAdapter returns undefined for an unknown engine id", () => {
  assert.equal(getEngineAdapter("nope_not_here"), undefined);
});

test("applies() gates emission — same adapter, different context, different decision", () => {
  const a = getEngineAdapter("fake_store")!;
  const base = {
    binding: { defaults: {} },
    resolved: [],
    caps: { domain: "T", capabilities: [] },
    domain: { aggregates: [] },
    theme: {},
    handlers: {},
    services: { services: [] },
  } as unknown as Parameters<NonNullable<EngineAdapter["applies"]>>[0];
  assert.equal(a.applies!({ ...base, dialect: "postgres" }), true);
  assert.equal(a.applies!({ ...base, dialect: "sqlite" }), false);
  // generate honours the contract shape: { files, workflows? }.
  const out = a.generate({ ...base, dialect: "postgres" });
  assert.deepEqual(out.files, { "fake_store/schema.sql": "-- fake" });
});
