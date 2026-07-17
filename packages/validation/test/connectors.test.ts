import { test } from "node:test";
import assert from "node:assert/strict";
import { validateConnectors, type Finding } from "../src/index.ts";
import type { AgentsDoc, ToolsDoc } from "@kiln/compiler";

const cleanTools: ToolsDoc = {
  version: "0.1",
  tools: [
    {
      id: "spreadsheet",
      name: "Spreadsheet",
      providerLabel: "Google Sheets",
      operations: [
        { name: "read_range", kind: "read", input: [{ name: "range", type: "text" }], output: [{ name: "rows", type: "array" }], scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] },
        { name: "append_row", kind: "write", input: [{ name: "row", type: "array" }], output: [{ name: "ok", type: "boolean" }], scopes: ["https://www.googleapis.com/auth/spreadsheets"] },
      ],
      meta: { origin: "authored" },
    },
  ],
};
const cleanAgents: AgentsDoc = {
  version: "1",
  agents: [{ id: "lead_bot", name: "Lead Bot", capabilities: ["x"], grants: [{ toolId: "spreadsheet", operations: ["read_range", "append_row"] }] }],
};

const has = (fs: Finding[], code: string, subject?: string): boolean => fs.some((f) => f.code === code && (subject ? f.subjects.includes(subject) : true));

test("a clean connector + grant produces no findings (incl. scope URLs are NOT TC6)", () => {
  const fs = validateConnectors(cleanTools, cleanAgents);
  assert.deepEqual(fs, [], `expected no findings, got: ${fs.map((f) => f.code).join(", ")}`);
});

test("TC1 — a grant to an unknown connector", () => {
  const agents: AgentsDoc = { version: "1", agents: [{ id: "a", name: "A", capabilities: [], grants: [{ toolId: "nope", operations: ["x"] }] }] };
  assert.ok(has(validateConnectors(cleanTools, agents), "TC1.tool", "nope"));
});

test("TC2 — a granted op the connector does not declare", () => {
  const agents: AgentsDoc = { version: "1", agents: [{ id: "a", name: "A", capabilities: [], grants: [{ toolId: "spreadsheet", operations: ["delete_sheet"] }] }] };
  assert.ok(has(validateConnectors(cleanTools, agents), "TC2.op", "delete_sheet"));
});

test("TC3 — empty provider label, and an op with no kind", () => {
  const tools = { version: "0.1", tools: [{ id: "t", name: "T", providerLabel: "  ", operations: [{ name: "op", kind: "" as never, input: [], output: [] }], meta: { origin: "authored" as const } }] };
  const fs = validateConnectors(tools as unknown as ToolsDoc, { version: "1", agents: [] });
  assert.ok(has(fs, "TC3.label", "t"));
  assert.ok(has(fs, "TC3.kind"));
});

test("TC4 — an agent behaviour naming an ungranted op is a fabrication", () => {
  const agents: AgentsDoc = {
    version: "1",
    agents: [{ id: "lead_bot", name: "Lead Bot", capabilities: [], grants: [{ toolId: "spreadsheet", operations: ["read_range"] }], instructions: "First call spreadsheet_read_range, then spreadsheet_append_row to save it." }],
  };
  const fs = validateConnectors(cleanTools, agents);
  assert.ok(has(fs, "TC4.fabrication", "spreadsheet_append_row"), "ungranted op named in prompt flagged");
  assert.ok(!has(fs, "TC4.fabrication", "spreadsheet_read_range"), "granted op named in prompt is NOT flagged");
});

test("TC5 — a secret literal embedded in a connector, and in a grant connectionRef", () => {
  const tools: ToolsDoc = { version: "0.1", tools: [{ id: "t", name: "sk-ant-abc123456789 token", providerLabel: "P", operations: [{ name: "op", kind: "read", input: [], output: [] }], meta: { origin: "authored" } }] };
  assert.ok(has(validateConnectors(tools, { version: "1", agents: [] }), "TC5.secret", "t"));
  const agents: AgentsDoc = { version: "1", agents: [{ id: "a", name: "A", capabilities: [], grants: [{ toolId: "spreadsheet", operations: ["read_range"], connectionRef: "Bearer sk-ant-9f8e7d6c5b4a3210" }] }] };
  const fs = validateConnectors(cleanTools, agents);
  assert.ok(fs.some((f) => f.code === "TC5.secret" && f.subjects.includes("a")));
  // the finding message must never echo the matched secret.
  assert.ok(!fs.some((f) => f.message.includes("sk-ant")));
});

test("TC6 — a raw URL/host on a ToolDef (but NOT its OAuth scope URLs)", () => {
  const tools: ToolsDoc = { version: "0.1", tools: [{ id: "t", name: "T", providerLabel: "https://sheets.googleapis.com", operations: [{ name: "op", kind: "read", input: [], output: [], scopes: ["https://www.googleapis.com/auth/spreadsheets"] }], meta: { origin: "authored" } }] };
  const fs = validateConnectors(tools, { version: "1", agents: [] });
  assert.ok(has(fs, "TC6.destination", "t"), "URL in providerLabel flagged");
});

test("TC7 — a PII-shaped connectionRef", () => {
  const agents: AgentsDoc = { version: "1", agents: [{ id: "a", name: "A", capabilities: [], grants: [{ toolId: "spreadsheet", operations: ["read_range"], connectionRef: "jane@acme.com" }] }] };
  assert.ok(has(validateConnectors(cleanTools, agents), "TC7.connection_ref", "a"));
});

test("TC-series recall: a case seeded with TC1..TC7 defects fires all seven codes", () => {
  const tools: ToolsDoc = {
    version: "0.1",
    tools: [
      { id: "good", name: "Good", providerLabel: "Google Sheets", operations: [{ name: "read_range", kind: "read", input: [], output: [] }, { name: "append_row", kind: "write", input: [], output: [] }], meta: { origin: "authored" } },
      { id: "bad", name: "sk-ant-deadbeef12345678", providerLabel: "", operations: [{ name: "op", kind: "nope" as never, input: [], output: [] }], meta: { origin: "authored" } }, // TC3(label), TC3(kind), TC5
      { id: "urly", name: "T", providerLabel: "api.example.com/v1", operations: [{ name: "op", kind: "read", input: [], output: [] }], meta: { origin: "authored" } }, // TC6
    ],
  };
  const agents: AgentsDoc = {
    version: "1",
    agents: [{
      id: "bot",
      name: "Bot",
      capabilities: [],
      instructions: "use good_append_row now", // TC4: names an ungranted op
      grants: [
        { toolId: "ghost", operations: ["x"] }, // TC1
        { toolId: "good", operations: ["read_range", "delete_all"], connectionRef: "user@x.com" }, // TC2 + TC7
      ],
    }],
  };
  const codes = new Set(validateConnectors(tools, agents).map((f) => f.code.split(".")[0]));
  for (const c of ["TC1", "TC2", "TC3", "TC4", "TC5", "TC6", "TC7"]) assert.ok(codes.has(c), `expected ${c} to fire; got ${[...codes].join(", ")}`);
});
