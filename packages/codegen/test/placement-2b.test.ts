import { test } from "node:test";
import assert from "node:assert/strict";
import { projectTargets, assembleFullStack, registerEngine, validatePlacement, DEFAULT_BINDING, type Binding } from "../src/index.ts";
import type { Engine } from "../src/targets.ts";
import type { CapabilityDoc, DomainDoc, ContextsDoc, RolesDoc, WorkflowsDoc } from "@kiln/compiler";

const caps = { domain: "Test", capabilities: [{ id: "leads", name: "Leads", purpose: "", outcomes: [] }] } as unknown as CapabilityDoc;
const domain: DomainDoc = {
  aggregates: [{ id: "lead", name: "Lead", owner: "leads", attributes: [{ name: "email", type: "text" }], references: [] }],
  commands: [{ id: "qualify_lead", name: "Qualify Lead", aggregate: "lead", capability: "leads", emits: ["lead_qualified"] }],
  events: [{ id: "lead_qualified", name: "Lead Qualified", aggregate: "lead", trigger: "command" }],
  policies: [{ id: "p1", name: "on qualify", on: "lead_qualified", then: "qualify_lead" }],
} as unknown as DomainDoc;
const contexts = { contexts: [{ id: "sales", name: "Sales", capabilities: ["leads"] }] } as unknown as ContextsDoc;
const roles = { roles: [{ id: "rep", name: "Rep", capabilities: ["leads"] }] } as unknown as RolesDoc;
const workflows = { workflows: [{ id: "onboard", name: "Onboard", steps: ["qualify_lead"] }] } as unknown as WorkflowsDoc;

// ── 2b#2 — seam-URL auto-wiring ─────────────────────────────────────────────
test("2b#2: n8n HTTP nodes target the local spine by default (byte-identical seam)", () => {
  const r = projectTargets(DEFAULT_BINDING, caps, domain, contexts, roles, workflows);
  const json = JSON.stringify(r.artifacts.n8n);
  assert.match(json, /spine\.local/, "default seam URL is the local placeholder");
  assert.doesNotMatch(json, /\$env\.SPINE_URL/);
});

test("2b#2: when the spine is placed remotely, n8n nodes call its reach var via an n8n env expression", () => {
  const binding: Binding = { ...DEFAULT_BINDING, hosting: { node: { mode: "managed", target: "fly" } } };
  const r = projectTargets(binding, caps, domain, contexts, roles, workflows);
  const json = JSON.stringify(r.artifacts.n8n);
  assert.match(json, /\{\{\$env\.SPINE_URL\}\}\/api/, "seam URL resolves to the remote reach var");
  assert.doesNotMatch(json, /spine\.local/, "no local placeholder remains when remote");
});

test("2b#2 residual: trigger workflows call the remote spine reach var when the spine is remote", () => {
  const triggersDoc = { triggers: [{ id: "t1", name: "Inbound Lead", source: "webhook", path: "lead", target: { kind: "command", ref: "qualify_lead" } }] } as unknown as Parameters<typeof projectTargets>[11];
  const local = projectTargets(DEFAULT_BINDING, caps, domain, contexts, roles, workflows, undefined, undefined, undefined, undefined, undefined, triggersDoc);
  assert.match(JSON.stringify(local.artifacts.triggers.n8n), /spine\.local/, "local spine → local placeholder");
  const remote = projectTargets({ ...DEFAULT_BINDING, hosting: { node: { mode: "managed", target: "fly" } } }, caps, domain, contexts, roles, workflows, undefined, undefined, undefined, undefined, undefined, triggersDoc);
  const j = JSON.stringify(remote.artifacts.triggers.n8n);
  assert.match(j, /\{\{\$env\.SPINE_URL\}\}\/api/, "remote spine → env reach var");
  assert.doesNotMatch(j, /spine\.local/, "no local placeholder remains");
});

// ── 2b#4 — local compose service for a third-party engine ────────────────────
test("2b#4: a third-party engine placed local emits its own docker-compose service + volume", () => {
  const FAUX: Engine = {
    id: "faux2b_store",
    name: "FauxStore",
    reach: "sql",
    provides: { store: "native", operate: "none", emit: "none", react: "none", sequence: "none", authorize: "none", "serve-ui": "none" },
    composeService: "fauxstore",
    dockerService: `  fauxstore:
    image: fauxstore:1
    ports: ["9999:9999"]
    volumes: ["fauxdata:/data"]`,
    dockerVolume: "fauxdata",
  };
  registerEngine({ engine: FAUX, generate: () => ({ files: {} }) });
  const binding: Binding = { defaults: { ...DEFAULT_BINDING.defaults, store: "faux2b_store" } };
  const { files } = assembleFullStack({ capabilities: caps, domain, roles, workflows, binding, dialect: "postgres", modelPath: "model.json", gitInitialized: true });
  const compose = files["docker-compose.yml"];
  assert.match(compose, /^ {2}fauxstore:/m, "the third-party service block is present");
  assert.match(compose, /image: fauxstore:1/);
  assert.match(compose, /fauxdata: \{\}/, "its named volume is added to the volumes map");
});

test("2b#4: a third-party engine placed MANAGED is pruned, not emitted as a local service", () => {
  const FAUX: Engine = {
    id: "faux2b_managed",
    name: "FauxManaged",
    reach: "sql",
    provides: { store: "native", operate: "none", emit: "none", react: "none", sequence: "none", authorize: "none", "serve-ui": "none" },
    composeService: "fauxm",
    dockerService: `  fauxm:\n    image: fauxm:1`,
    urlEnv: "FAUXM_URL",
  };
  registerEngine({ engine: FAUX, generate: () => ({ files: {} }) });
  const binding: Binding = { defaults: { ...DEFAULT_BINDING.defaults, store: "faux2b_managed" }, hosting: { faux2b_managed: { mode: "managed", target: "managed" } } };
  const { files } = assembleFullStack({ capabilities: caps, domain, roles, workflows, binding, dialect: "postgres", modelPath: "model.json", gitInitialized: true });
  const compose = files["docker-compose.yml"];
  assert.doesNotMatch(compose, /^ {2}fauxm:/m, "managed → no local service block");
  assert.match(files[".env.example"], /FAUXM_URL/, "its reach var is documented instead");
});

// ── 2b#5 — PB4 generalized over couplesStore engines ─────────────────────────
test("2b#5: PB4 generalizes — a couplesStore engine (odoo) managed while a coexisting store is local warns", () => {
  const b: Binding = { defaults: {}, hosting: { odoo: { mode: "managed", target: "managed" }, postgres: { mode: "local" } } };
  const findings = validatePlacement(b, ["odoo", "postgres"]);
  assert.ok(findings.find((f) => f.code === "PB4" && f.level === "warn"));
  // same mode → no split → no warning
  assert.equal(validatePlacement({ defaults: {}, hosting: { odoo: { mode: "managed", target: "managed" }, postgres: { mode: "managed", target: "managed" } } }, ["odoo", "postgres"]).find((f) => f.code === "PB4"), undefined);
});
