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

// ── SPEC-013 Phase B3 — export chooses its Nango (env binding) + optional co-located compose profile ──

const B3_CAPS = { domain: "Solar", capabilities: [{ id: "leads", name: "Lead Management", purpose: "", outcomes: [] }] } as unknown as CapabilityDoc;
const B3_DOMAIN = {
  aggregates: [{ id: "lead", name: "Lead", owner: "leads", attributes: [{ name: "email", type: "text" }], references: [] }],
  commands: [{ id: "capture_lead", name: "Capture Lead", aggregate: "lead", emits: ["lead_captured"] }],
  events: [{ id: "lead_captured", name: "Lead Captured", aggregate: "lead", trigger: "command" }],
} as unknown as DomainDoc;
const B3_TOOLS = { version: "0.1", tools: [{ id: "spreadsheet", name: "Spreadsheet", providerLabel: "Google Sheets", operations: [{ name: "read_range", kind: "read", input: [], output: [] }], meta: { origin: "authored" } }] };
const B3_GRANTED = { agents: [{ id: "lead_agent", name: "Lead Agent", capabilities: ["leads"], goal: "Qualify leads", grants: [{ toolId: "spreadsheet", operations: ["read_range"], connectionRef: "conn_x" }] }] } as unknown as AgentsDoc;
const B3_UNGRANTED = { agents: [{ id: "lead_agent", name: "Lead Agent", capabilities: ["leads"], goal: "Qualify leads" }] } as unknown as AgentsDoc;

test("granted connector → .env.example threads external NANGO_* + compose has an OPT-IN co-located Nango profile", () => {
  const { files } = assembleFullStack({ capabilities: B3_CAPS, domain: B3_DOMAIN, agents: B3_GRANTED, tools: B3_TOOLS as never, binding: DEFAULT_BINDING, dialect: "postgres", modelPath: "model.json" });
  // (a) the root .env.example threads the (external) Nango binding — names only, no baked secret.
  assert.match(files[".env.example"], /NANGO_SECRET_KEY=/);
  assert.match(files[".env.example"], /NANGO_HOST=https:\/\/api\.nango\.dev/);
  assert.match(files[".env.example"], /localhost:3100\/connect/); // points the deployer at the self-sufficient panel
  // (b) the co-located Nango is an OPT-IN compose profile — present, but gated so it does NOT start by default.
  assert.match(files["docker-compose.yml"], /nango-server:/);
  assert.match(files["docker-compose.yml"], /profiles: \["nango"\]/);
  assert.match(files["docker-compose.yml"], /nangodb: \{\}/); // its volume is declared
});

test("no connector granted → compose/.env are byte-identical to the connectorless export (no Nango threading)", () => {
  const withUnreferenced = assembleFullStack({ capabilities: B3_CAPS, domain: B3_DOMAIN, agents: B3_UNGRANTED, tools: B3_TOOLS as never, binding: DEFAULT_BINDING, dialect: "postgres", modelPath: "model.json" }).files;
  const withNoTools = assembleFullStack({ capabilities: B3_CAPS, domain: B3_DOMAIN, agents: B3_UNGRANTED, binding: DEFAULT_BINDING, dialect: "postgres", modelPath: "model.json" }).files;
  assert.equal(withUnreferenced["docker-compose.yml"], withNoTools["docker-compose.yml"]);
  assert.equal(withUnreferenced[".env.example"], withNoTools[".env.example"]);
  assert.doesNotMatch(withUnreferenced["docker-compose.yml"], /nango-server/, "no Nango profile when nothing is granted");
  assert.doesNotMatch(withUnreferenced[".env.example"], /NANGO_SECRET_KEY/, "no Nango vars when nothing is granted");
});
