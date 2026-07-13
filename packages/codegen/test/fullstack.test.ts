import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleFullStack, DEFAULT_BINDING } from "../src/index.ts";
import type { CapabilityDoc, DomainDoc, ContextsDoc, RolesDoc, WorkflowsDoc, AgentsDoc } from "@kiln/compiler";
import solar from "../../../apps/web/src/data/solar-model.json" with { type: "json" };

// The full-stack assembly is PURE + isomorphic (no node:* / fs / process) — this is what lets the browser
// produce the same file map the CLI writes to disk. We run it on the baked solar model (the exporter's
// default) and assert the map carries the key files. (The CLI byte-identity oracle lives outside the suite.)

function run(dialect: "postgres" | "sqlite" = "postgres") {
  const m = solar as unknown as {
    version?: string;
    capabilities: CapabilityDoc;
    contexts?: ContextsDoc;
    domain: DomainDoc;
    roles?: RolesDoc;
    workflows?: WorkflowsDoc;
    agents?: AgentsDoc;
  };
  const binding = dialect === "sqlite" ? { ...DEFAULT_BINDING, defaults: { ...DEFAULT_BINDING.defaults, store: "sqlite" } } : DEFAULT_BINDING;
  return assembleFullStack({
    version: m.version,
    capabilities: m.capabilities,
    contexts: m.contexts,
    domain: m.domain,
    roles: m.roles,
    workflows: m.workflows,
    agents: m.agents,
    binding,
    dialect,
    modelPath: "/abs/path/to/model.json",
  });
}

test("assembleFullStack returns the key files of the generated system (postgres)", () => {
  const { files, report } = run("postgres");
  const keys = [
    "docker-compose.yml",
    "Makefile",
    "CLAUDE.md",
    "README.md",
    "model.json",
    ".env.example",
    "spine/src/app.ts",
    "postgres/schema.sql",
    "openapi.json",
    ".github/workflows/ci.yml",
  ];
  for (const k of keys) {
    assert.ok(k in files, `expected file map to contain ${k}`);
    assert.ok(files[k].length > 0, `expected ${k} to be non-empty`);
  }
  // the projection report round-trips out for the caller's logging (coverage/validation/gaps).
  assert.ok(Array.isArray(report.validation), "report.validation should exist");
  // _run.json manifest carries the model path we passed (unchanged from the bin's behaviour).
  assert.ok(files["_run.json"].includes("/abs/path/to/model.json"), "_run.json should carry modelPath");
});

test("assembleFullStack is pure: same input → identical bytes", () => {
  const a = run("postgres").files;
  const b = run("postgres").files;
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
  for (const k of Object.keys(a)) assert.equal(a[k], b[k], `file ${k} should be deterministic`);
});

test("assembleFullStack --sqlite → single-container store (sqlite schema, no app postgres service)", () => {
  const { files } = run("sqlite");
  assert.ok("sqlite/schema.sql" in files, "sqlite schema should be emitted");
  assert.ok(!("postgres/schema.sql" in files), "no postgres schema in sqlite mode");
  assert.ok(files["docker-compose.yml"].includes("sqlitedata"), "single-container compose uses a sqlite data volume");
});
