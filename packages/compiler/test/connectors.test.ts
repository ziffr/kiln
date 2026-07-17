import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compileCapabilities,
  computeBuildHash,
  toolNodeId,
  grantEdgeId,
  agentNodeId,
  type CapabilityDoc,
  type AgentsDoc,
  type ToolsDoc,
} from "../src/index.ts";

const caps: CapabilityDoc = {
  version: "1",
  domain: "solar",
  capabilities: [{ id: "manage_leads", name: "Manage Leads", outcomes: ["a lead is captured"] }],
};

const tools: ToolsDoc = {
  version: "0.1",
  tools: [
    {
      id: "spreadsheet",
      name: "Spreadsheet",
      providerLabel: "Google Sheets",
      operations: [
        { name: "read_range", kind: "read", input: [{ name: "range", type: "text" }], output: [{ name: "rows", type: "array" }] },
        { name: "append_row", kind: "write", input: [{ name: "row", type: "array" }], output: [{ name: "ok", type: "boolean" }] },
      ],
      meta: { origin: "authored" },
    },
  ],
};

const agents: AgentsDoc = {
  version: "1",
  agents: [
    {
      id: "lead_bot",
      name: "Lead Bot",
      capabilities: ["manage_leads"],
      grants: [{ toolId: "spreadsheet", operations: ["read_range", "append_row"] }],
    },
  ],
};

test("a ToolDef compiles to an authored `tool` node carrying its operations (no destination)", () => {
  const ir = compileCapabilities(caps, undefined, undefined, undefined, undefined, agents, tools);
  const node = ir.nodes.find((n) => n.id === toolNodeId("spreadsheet"));
  assert.ok(node, "tool node present");
  assert.equal(node!.type, "tool");
  assert.equal(node!.origin, "authored");
  assert.equal(node!.meta.providerLabel, "Google Sheets");
  assert.equal((node!.meta.operations as unknown[]).length, 2);
  // grant-surface only: nothing url/host/endpoint-shaped anywhere on the node.
  assert.doesNotMatch(JSON.stringify(node), /https?:\/\//);
});

test("each granted op is a distinct authored `grants` edge (agent → tool), keyed by op", () => {
  const ir = compileCapabilities(caps, undefined, undefined, undefined, undefined, agents, tools);
  const grantEdges = ir.edges.filter((e) => e.type === "grants");
  assert.equal(grantEdges.length, 2);
  const readEdge = ir.edges.find((e) => e.id === grantEdgeId("lead_bot", "spreadsheet", "read_range"));
  assert.ok(readEdge, "read grant edge present");
  assert.equal(readEdge!.from, agentNodeId("lead_bot"));
  assert.equal(readEdge!.to, toolNodeId("spreadsheet"));
  assert.equal(readEdge!.origin, "authored");
  assert.ok(ir.edges.some((e) => e.id === grantEdgeId("lead_bot", "spreadsheet", "append_row")));
});

test("buildHash is byte-identical when there are no tools (SPEC-013 byte-identity)", () => {
  const withoutArg = computeBuildHash(caps, undefined, undefined, undefined, undefined, agents);
  const withUndefinedTools = computeBuildHash(caps, undefined, undefined, undefined, undefined, agents, undefined);
  const withEmptyTools = computeBuildHash(caps, undefined, undefined, undefined, undefined, agents, { version: "0.1", tools: [] });
  assert.equal(withUndefinedTools, withoutArg, "passing undefined tools does not change the hash");
  assert.equal(withEmptyTools, withoutArg, "an empty tools doc does not change the hash");
  // and a compile with no tools produces the same IR buildHash as the pre-SPEC-013 call shape.
  const ir = compileCapabilities(caps, undefined, undefined, undefined, undefined, agents);
  assert.equal(ir.buildHash, withoutArg);
});

test("a present tools layer DOES change the hash (it is mixed in)", () => {
  const base = computeBuildHash(caps, undefined, undefined, undefined, undefined, agents);
  const withTools = computeBuildHash(caps, undefined, undefined, undefined, undefined, agents, tools);
  assert.notEqual(withTools, base);
});

test("no grants + no tools → no tool nodes and no grants edges (byte-identity of the graph)", () => {
  const plain: AgentsDoc = { version: "1", agents: [{ id: "lead_bot", name: "Lead Bot", capabilities: ["manage_leads"] }] };
  const ir = compileCapabilities(caps, undefined, undefined, undefined, undefined, plain);
  assert.equal(ir.nodes.filter((n) => n.type === "tool").length, 0);
  assert.equal(ir.edges.filter((e) => e.type === "grants").length, 0);
});
