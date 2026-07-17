/**
 * SPEC-013 Phase A — the connector layer round-trips through model.json, and a model with NO connectors
 * carries an empty-but-explicit default (byte-stable). The whole-model export is materialised by
 * assembleModel; parseModel loads it back as authored project fields.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleModel, parseModel, type ResolvedCore } from "../src/model.ts";
import type { Project } from "../src/projects.ts";
import type { ToolsDoc } from "@kiln/compiler";

const core: ResolvedCore = {
  name: "Solar",
  narrative: "n",
  capabilities: { version: "1", domain: "solar", capabilities: [{ id: "leads", name: "Leads", outcomes: ["x"] }] },
  contexts: { version: "1", contexts: [] },
  domain: { version: "1", aggregates: [{ id: "lead", name: "Lead", owner: "leads" }] },
  roles: { version: "1", roles: [] },
  workflows: { version: "1", workflows: [] },
  agents: { version: "1", agents: [{ id: "bot", name: "Bot", capabilities: ["leads"], grants: [{ toolId: "spreadsheet", operations: ["read_range"] }] }] },
};

const tools: ToolsDoc = {
  version: "0.1",
  tools: [{ id: "spreadsheet", name: "Spreadsheet", providerLabel: "Google Sheets", operations: [{ name: "read_range", kind: "read", input: [{ name: "range", type: "text" }], output: [{ name: "rows", type: "array" }] }], meta: { origin: "authored" } }],
};

const baseProject = (extra: Partial<Project> = {}): Project => ({ id: "p1", name: "Solar", narrative: "n", model: "claude-sonnet-5", effort: "medium", capabilities: null, provider: null, ...extra });

test("assembleModel carries the tools layer + agents' grants; parseModel loads them back", () => {
  const model = assembleModel(core, baseProject({ tools }));
  assert.deepEqual(model.tools, tools);
  assert.deepEqual(model.agents.agents[0].grants, [{ toolId: "spreadsheet", operations: ["read_range"] }]);
  const parsed = parseModel(model);
  assert.deepEqual(parsed.tools, tools);
  assert.deepEqual(parsed.agents!.agents[0].grants, [{ toolId: "spreadsheet", operations: ["read_range"] }]);
});

test("round-trip is stable — assemble → parse → assemble reproduces the tools layer", () => {
  const model1 = assembleModel(core, baseProject({ tools }));
  const parsed = parseModel(model1);
  const model2 = assembleModel(core, baseProject({ tools: parsed.tools ?? undefined }));
  assert.equal(JSON.stringify(model2.tools), JSON.stringify(model1.tools));
});

test("no connectors → an empty-but-explicit tools default (byte-stable)", () => {
  const model = assembleModel(core, baseProject());
  assert.deepEqual(model.tools, { version: "0.1", tools: [] });
  // and it round-trips to null (no authored connectors) without inventing any.
  assert.deepEqual(parseModel({ ...model, tools: undefined }).tools, null);
});
