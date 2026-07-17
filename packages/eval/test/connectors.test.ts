import { test } from "node:test";
import assert from "node:assert/strict";
import {
  connectorRecall,
  spuriousSuggestionRate,
  scoreConnectorCoverage,
  scoreConnectorsCase,
  type ConnectorReference,
  type ConnectorSuggestion,
} from "../src/index.ts";
import type { AgentsDoc, ToolsDoc } from "@kiln/compiler";

const reference: ConnectorReference = [
  { agentId: "lead_bot", toolId: "spreadsheet" },
  { agentId: "ops_bot", toolId: "calendar" },
];

test("connectorRecall — all reference grants recovered → 1", () => {
  const suggestions: ConnectorSuggestion[] = [
    { agentId: "lead_bot", toolId: "spreadsheet" },
    { agentId: "ops_bot", toolId: "calendar" },
  ];
  assert.equal(connectorRecall(reference, suggestions), 1);
});

test("connectorRecall — half recovered → 0.5; empty reference → 1", () => {
  assert.equal(connectorRecall(reference, [{ agentId: "lead_bot", toolId: "spreadsheet" }]), 0.5);
  assert.equal(connectorRecall([], []), 1);
});

test("spuriousSuggestionRate — an off-reference suggestion is spurious (over-wiring)", () => {
  const suggestions: ConnectorSuggestion[] = [
    { agentId: "lead_bot", toolId: "spreadsheet" }, // in reference
    { agentId: "lead_bot", toolId: "crm" }, // NOT in reference → spurious
  ];
  assert.equal(spuriousSuggestionRate(reference, suggestions), 0.5);
  assert.equal(spuriousSuggestionRate(reference, []), 0);
});

test("spuriousSuggestionRate — an explicitly ungrounded suggestion counts even if in-reference", () => {
  const suggestions: ConnectorSuggestion[] = [{ agentId: "lead_bot", toolId: "spreadsheet", grounded: false }];
  assert.equal(spuriousSuggestionRate(reference, suggestions), 1);
});

test("scoreConnectorCoverage — resolved rate + autonomous write count", () => {
  const tools: ToolsDoc = {
    version: "0.1",
    tools: [{ id: "spreadsheet", name: "S", providerLabel: "Google Sheets", operations: [{ name: "read_range", kind: "read", input: [], output: [] }, { name: "append_row", kind: "write", input: [], output: [] }], meta: { origin: "authored" } }],
  };
  const agents: AgentsDoc = {
    version: "1",
    agents: [{
      id: "a",
      name: "A",
      capabilities: [],
      grants: [
        { toolId: "spreadsheet", operations: ["read_range", "append_row"], autonomous: true }, // resolves + autonomous write
        { toolId: "ghost", operations: ["x"] }, // unresolved
      ],
    }],
  };
  const cov = scoreConnectorCoverage(tools, agents);
  assert.equal(cov.grantCount, 2);
  assert.equal(cov.resolvedRate, 0.5);
  assert.equal(cov.autonomousWriteCount, 1);
});

test("scoreConnectorsCase — recall over seeded TC defects", () => {
  const tools: ToolsDoc = { version: "0.1", tools: [{ id: "spreadsheet", name: "S", providerLabel: "Google Sheets", operations: [{ name: "read_range", kind: "read", input: [], output: [] }], meta: { origin: "authored" } }] };
  const agents: AgentsDoc = { version: "1", agents: [{ id: "a", name: "A", capabilities: [], grants: [{ toolId: "ghost", operations: ["x"] }] }] };
  const score = scoreConnectorsCase({ id: "c1", description: "unknown tool", tools, agents, expected: [{ code: "TC1.tool", subject: "ghost" }] });
  assert.equal(score.recall, 1);
});
