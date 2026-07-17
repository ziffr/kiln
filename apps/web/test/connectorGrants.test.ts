/**
 * SPEC-013 Phase B2 — the pure grant/readiness/scope helpers behind the Agents-stage Tools UI.
 * Readiness is a three-state shape+text value; the rollup is pessimistic (nothing looks wired when it
 * isn't); scope-diff surfaces over-grant; suggestions are inert (read-only proposals, no bulk apply).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentGrant, AgentInput, ToolDef } from "@kiln/compiler";
import {
  connectorCatalog, isMutating, grantReadiness, readinessRollup, scopeReport, suggestGrants,
  authorityLedger, type ConnectionStatus,
} from "../src/connectorGrants.ts";

const SHEETS = connectorCatalog().find((t) => t.id === "spreadsheet") as ToolDef;

test("the catalog exposes the registered Spreadsheet connector's grant surface", () => {
  assert.ok(SHEETS, "spreadsheet connector should be registered via @kiln/codegen");
  assert.equal(SHEETS.providerLabel, "Google Sheets");
  assert.ok(SHEETS.operations.some((o) => o.name === "read_range" && o.kind === "read"));
  assert.ok(SHEETS.operations.some((o) => o.name === "append_row" && o.kind === "write"));
});

test("isMutating separates write/send/delete from read/list", () => {
  assert.equal(isMutating("read"), false);
  assert.equal(isMutating("list"), false);
  assert.equal(isMutating("write"), true);
  assert.equal(isMutating("send"), true);
  assert.equal(isMutating("delete"), true);
});

test("grantReadiness — no connectionRef → granted (no live connection)", () => {
  const g: AgentGrant = { toolId: "spreadsheet", operations: ["read_range"] };
  assert.equal(grantReadiness(g, []), "granted");
});

test("grantReadiness — ref resolving to a connected connection → connected", () => {
  const g: AgentGrant = { toolId: "spreadsheet", operations: ["read_range"], connectionRef: "conn_abc" };
  const conns: ConnectionStatus[] = [{ connectionId: "conn_abc", provider: "google-sheets", connected: true }];
  assert.equal(grantReadiness(g, conns), "connected");
});

test("grantReadiness — ref that no longer resolves → error (honest, not silently granted)", () => {
  const g: AgentGrant = { toolId: "spreadsheet", operations: ["read_range"], connectionRef: "conn_gone" };
  assert.equal(grantReadiness(g, []), "error");
});

test("readinessRollup is pessimistic — one unconnected grant keeps the agent off", () => {
  const grants: AgentGrant[] = [
    { toolId: "spreadsheet", operations: ["read_range"], connectionRef: "conn_ok" },
    { toolId: "spreadsheet", operations: ["append_row"] }, // no connection
  ];
  const conns: ConnectionStatus[] = [{ connectionId: "conn_ok", provider: "google-sheets", connected: true }];
  const r = readinessRollup(grants, conns);
  assert.equal(r.total, 2);
  assert.equal(r.connected, 1);
  assert.equal(r.granted, 1);
  assert.equal(r.overall, "granted", "not connected — one grant has no live account");
});

test("readinessRollup — all connected → connected; any error → error; none → none", () => {
  const conns: ConnectionStatus[] = [{ connectionId: "c1", provider: "google-sheets", connected: true }];
  assert.equal(readinessRollup([{ toolId: "spreadsheet", operations: ["read_range"], connectionRef: "c1" }], conns).overall, "connected");
  assert.equal(readinessRollup([{ toolId: "spreadsheet", operations: ["read_range"], connectionRef: "missing" }], conns).overall, "error");
  assert.equal(readinessRollup([], conns).overall, "none");
});

test("scopeReport — needed is the union of granted ops' scopes; excess surfaces over-grant", () => {
  // read_range needs the readonly scope; a connection carrying the full read/write scope over-grants.
  const conn: ConnectionStatus = {
    connectionId: "c1", provider: "google-sheets", connected: true,
    scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"],
  };
  const rep = scopeReport(SHEETS, ["read_range"], conn);
  assert.deepEqual(rep.needed, ["https://www.googleapis.com/auth/spreadsheets.readonly"]);
  assert.equal(rep.actualKnown, true);
  assert.ok(rep.excess.includes("https://www.googleapis.com/auth/drive"), "drive scope is beyond what a read needs");
  assert.ok(rep.excess.includes("https://www.googleapis.com/auth/spreadsheets"), "full write scope over-grants a read");
});

test("scopeReport — absent live scopes → actualKnown false, no fabricated clean bill", () => {
  const rep = scopeReport(SHEETS, ["append_row"], { connectionId: "c1", provider: "google-sheets", connected: true });
  assert.equal(rep.actualKnown, false);
  assert.deepEqual(rep.actual, []);
  assert.deepEqual(rep.excess, []);
  assert.deepEqual(rep.needed, ["https://www.googleapis.com/auth/spreadsheets"]);
});

test("suggestGrants — grounded in the agent, read-only ops only, never re-proposes a granted tool", () => {
  const dataAgent: AgentInput = { id: "a", name: "Lead Importer", capabilities: ["leads"], goal: "Import leads from a spreadsheet" };
  const sugg = suggestGrants(dataAgent);
  assert.equal(sugg.length, 1);
  assert.equal(sugg[0].toolId, "spreadsheet");
  assert.ok(!sugg[0].operations.includes("append_row"), "a suggestion must not pre-authorize a write");
  assert.ok(sugg[0].operations.includes("read_range"));

  // already granted → no suggestion
  const granted: AgentInput = { ...dataAgent, grants: [{ toolId: "spreadsheet", operations: ["read_range"] }] };
  assert.equal(suggestGrants(granted).length, 0);

  // unrelated agent → no suggestion (grounding matters)
  const unrelated: AgentInput = { id: "b", name: "Greeter", capabilities: ["welcome"], goal: "Greet visitors warmly" };
  assert.equal(suggestGrants(unrelated).length, 0);
});

test("authorityLedger flattens agent × connector × op × connection with readiness", () => {
  const agents: AgentInput[] = [
    { id: "a", name: "Importer", capabilities: [], grants: [{ toolId: "spreadsheet", operations: ["read_range", "append_row"], autonomous: true, connectionRef: "c1" }] },
  ];
  const conns: ConnectionStatus[] = [{ connectionId: "c1", provider: "google-sheets", connected: true }];
  const rows = authorityLedger(agents, conns);
  assert.equal(rows.length, 2);
  const write = rows.find((r) => r.op === "append_row")!;
  assert.equal(write.kind, "write");
  assert.equal(write.autonomous, true);
  assert.equal(write.readiness, "connected");
  assert.equal(write.toolName, "Spreadsheet");
});
