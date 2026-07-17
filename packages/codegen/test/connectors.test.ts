import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveAgentDefs,
  agentsAdapter,
  buildToolSchemas,
  ioSpecSchema,
  agentContract,
  registerConnector,
  getConnectorAdapter,
  registeredConnectors,
  type ConnectorAdapter,
  type AgentTool,
} from "../src/index.ts";
import type { CapabilityDoc, DomainDoc, AgentsDoc, ToolsDoc } from "@kiln/compiler";

const caps: CapabilityDoc = { domain: "Solar", capabilities: [{ id: "leads", name: "Lead Management", purpose: "", outcomes: [] }] } as unknown as CapabilityDoc;
const domain: DomainDoc = {
  aggregates: [{ id: "lead", name: "Lead", owner: "leads", attributes: [{ name: "email", type: "text" }], references: [] }],
  commands: [{ id: "capture_lead", name: "Capture Lead", aggregate: "lead", emits: ["lead_captured"] }],
  events: [{ id: "lead_captured", name: "Lead Captured", aggregate: "lead", trigger: "command" }],
} as unknown as DomainDoc;

const tools: ToolsDoc = {
  version: "0.1",
  tools: [
    {
      id: "spreadsheet",
      name: "Spreadsheet",
      providerLabel: "Google Sheets",
      operations: [
        { name: "read_range", kind: "read", input: [{ name: "range", type: "text" }], output: [{ name: "rows", type: "array" }] },
        { name: "append_row", kind: "write", input: [{ name: "row", type: "array" }, { name: "sheet", type: "text" }], output: [{ name: "ok", type: "boolean" }] },
      ],
      meta: { origin: "authored" },
    },
  ],
};
const granted: AgentsDoc = { agents: [{ id: "lead_agent", name: "Lead Agent", capabilities: ["leads"], goal: "Qualify leads", grants: [{ toolId: "spreadsheet", operations: ["read_range", "append_row"] }] }] } as unknown as AgentsDoc;
const ungranted: AgentsDoc = { agents: [{ id: "lead_agent", name: "Lead Agent", capabilities: ["leads"], goal: "Qualify leads" }] } as unknown as AgentsDoc;

test("a granted op becomes a `connector` tool named <toolId>_<op> with typed I/O", () => {
  const [def] = resolveAgentDefs(caps, domain, granted, undefined, undefined, undefined, undefined, tools);
  const names = def.tools.map((t) => t.name);
  assert.ok(names.includes("spreadsheet_read_range"), `read tool present: ${names.join(", ")}`);
  assert.ok(names.includes("spreadsheet_append_row"));
  const append = def.tools.find((t) => t.name === "spreadsheet_append_row")!;
  assert.equal(append.kind, "connector");
  assert.equal(append.io!.kind, "write");
  assert.deepEqual(append.io!.input.map((i) => i.name), ["row", "sheet"]);
  // the destination is NOT modelled — nothing url/host-shaped on the tool.
  assert.doesNotMatch(JSON.stringify(append.invoke), /https?:\/\//);
});

test("buildToolSchemas turns the op's typed I/O into a JSON-Schema input + output_schema", () => {
  const [def] = resolveAgentDefs(caps, domain, granted, undefined, undefined, undefined, undefined, tools);
  const schema = buildToolSchemas(def).find((s) => s.name === "spreadsheet_append_row")!;
  assert.deepEqual(schema.input_schema, { type: "object", properties: { row: { type: "array" }, sheet: { type: "string" } } });
  // output is consumed (not dead) — a response shape derived from io.output.
  assert.deepEqual(schema.output_schema, { type: "object", properties: { ok: { type: "boolean" } } });
});

test("ioSpecSchema maps the extended IOSpec kinds (array/object/json)", () => {
  assert.deepEqual(ioSpecSchema([{ name: "a", type: "array" }, { name: "o", type: "object" }, { name: "j", type: "json" }, { name: "u" }]), {
    type: "object",
    properties: { a: { type: "array" }, o: { type: "object" }, j: {}, u: {} },
  });
});

test("connector tool name never clobbers an authored command (deterministic namespacing)", () => {
  const clash: ToolsDoc = { version: "0.1", tools: [{ id: "capture", name: "C", providerLabel: "P", operations: [{ name: "lead", kind: "write", input: [], output: [] }], meta: { origin: "authored" } }] } as unknown as ToolsDoc;
  const withGrant: AgentsDoc = { agents: [{ id: "a", name: "A", capabilities: ["leads"], grants: [{ toolId: "capture", operations: ["lead"] }] }] } as unknown as AgentsDoc;
  const [def] = resolveAgentDefs(caps, domain, withGrant, undefined, undefined, undefined, undefined, clash);
  const names = def.tools.map((t) => t.name);
  assert.equal(new Set(names).size, names.length, "all tool names unique");
  assert.ok(names.includes("capture_lead")); // the command wins the base name; connector takes a suffix or vice-versa, but no dup
});

test("the agent CONTRACT folds granted connector ops alongside the derived tools", () => {
  const [def] = resolveAgentDefs(caps, domain, granted, undefined, undefined, undefined, undefined, tools);
  const names = agentContract(def, domain).tools.map((t) => t.name);
  assert.ok(names.includes("spreadsheet_read_range") && names.includes("spreadsheet_append_row"));
});

// ── §4.3 acceptance probe: the registry seam + byte-identity when ungranted ──────────────────────

const FAKE: ConnectorAdapter = {
  toolDef: { id: "fake_calendar", name: "Fake Calendar", providerLabel: "Fake Cal", operations: [{ name: "list_events", kind: "list", input: [], output: [] }], meta: { origin: "authored" } },
  emitNango: (op) => ({ runtime: `// fake nango runtime for ${op}` }),
};

test("acceptance probe: a fake connector resolves via the registry with no dispatch edits", () => {
  registerConnector(FAKE);
  assert.equal(getConnectorAdapter("fake_calendar"), FAKE);
  assert.ok(registeredConnectors().some((c) => c.toolDef.id === "fake_calendar"));
  // deterministic ordering (sorted by tool id).
  const ids = registeredConnectors().map((c) => c.toolDef.id);
  assert.deepEqual(ids, [...ids].sort());
  assert.equal(FAKE.emitNango("list_events", {} as never).runtime, "// fake nango runtime for list_events");
});

test("acceptance probe: export is byte-identical when no grant references the registered connector", () => {
  // the fake connector is registered (previous test) but nothing grants it → the agent export must be
  // byte-identical to the export with no tools doc at all.
  const withNoTools = agentsAdapter(caps, domain, ungranted);
  const withUnreferencedTools = agentsAdapter(caps, domain, ungranted, undefined, undefined, undefined, undefined, undefined, tools);
  assert.deepEqual(withUnreferencedTools, withNoTools, "an ungranted connector catalog changes nothing in the export");
});

test("getConnectorAdapter returns undefined for an unknown connector id", () => {
  assert.equal(getConnectorAdapter("no_such_connector"), undefined);
});

test("a connector tool carries no destination in the exported definition (grant-surface only)", () => {
  const files = agentsAdapter(caps, domain, granted, undefined, undefined, undefined, undefined, undefined, tools);
  const def = files["agents/definitions/lead_agent.json"];
  assert.match(def, /spreadsheet_append_row/);
  assert.doesNotMatch(def, /https?:\/\//); // no url/host baked into the model
});

// keep AgentTool import used (type-only assertion helper)
const _typecheck = (t: AgentTool): string => t.name;
void _typecheck;
