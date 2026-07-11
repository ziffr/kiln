import { test } from "node:test";
import assert from "node:assert/strict";
import { generateApp, projectAppModel } from "../src/index.ts";
import type { CapabilityDoc, DomainDoc, ContextsDoc } from "@vbd/compiler";

const caps: CapabilityDoc = { version: "0.2", domain: "solar", capabilities: [
  { id: "lead_management", name: "Lead Management" }, { id: "installation", name: "Installation" },
] };
const domain: DomainDoc = {
  version: "0.1",
  aggregates: [
    { id: "lead", name: "Lead", owner: "lead_management", attributes: [{ name: "name", type: "text" }, { name: "value", type: "money" }], references: [] },
    { id: "job", name: "Job", owner: "installation", attributes: [{ name: "scheduledOn", type: "date" }], references: ["lead"] },
  ],
  commands: [{ id: "capture_lead", name: "Capture Lead", aggregate: "lead", capability: "lead_management", emits: ["lead_captured"] }],
  events: [{ id: "lead_captured", name: "Lead Captured", aggregate: "lead", trigger: "command" }],
  policies: [{ name: "schedule on lead", on: "lead_captured", then: "schedule_job" }],
} as any;
const contexts: ContextsDoc = { version: "0.1", contexts: [{ id: "c_sales", name: "Sales", capabilities: ["lead_management"] }] } as any;

test("generateApp produces a runnable file set incl. server, client and README", () => {
  const files = generateApp(caps, domain, contexts);
  for (const p of ["package.json", "server.mjs", "README.md", "web/package.json", "web/src/App.jsx", "web/src/components/EntityScreen.jsx", "web/src/schema.js"]) {
    assert.ok(files[p] && files[p].length > 0, `missing ${p}`);
  }
  assert.match(files["server.mjs"], /createServer/);
  assert.match(files["web/src/schema.js"], /lead_management|Lead/);
});

test("projectAppModel maps entities, fields, commands, events, policies and areas", () => {
  const m = projectAppModel(caps, domain, contexts);
  assert.equal(m.entities.length, 2);
  assert.deepEqual(m.entities[0].fields, [{ name: "name", type: "text" }, { name: "value", type: "money" }]);
  assert.equal(m.commands[0].id, "capture_lead");
  assert.equal(m.entities.find((e) => e.id === "lead")?.area, "Sales");
});

test("generateApp emits QA config + docs and a hardened server", () => {
  const roles = { version: "0.1", roles: [{ id: "installer", name: "Installer", capabilities: ["installation"] }] } as any;
  const files = generateApp(caps, domain, contexts, roles);
  for (const p of ["eslint.config.js", ".prettierrc", "jsconfig.json", ".editorconfig", ".gitignore", "ARCHITECTURE.md"]) {
    assert.ok(files[p] && files[p].length > 0, `missing ${p}`);
  }
  // hardening present
  assert.match(files["server.mjs"], /function validate\(/);
  assert.match(files["server.mjs"], /mayWrite\(/);
  assert.match(files["server.mjs"], /PERMISSIONS = /);
  // roles → permissions wired (Installer owns installation which owns 'job')
  assert.match(files["server.mjs"], /"job":\s*\[\s*"Installer"\s*\]/);
  // doc banner standard present
  assert.match(files["server.mjs"], /Why:/);
  assert.match(files["ARCHITECTURE.md"], /Key decisions/);
});
