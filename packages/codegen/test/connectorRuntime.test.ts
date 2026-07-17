/**
 * SPEC-013 Phase B1 — the connector RUNTIME seams (§4.7): the Spreadsheet adapter's emitted glue, the async
 * Nango auth resolver (mocked — no live creds), the write-op invocation gate (SEC4), and the secret-free
 * audit log (SEC5). These exercise the real mirror (`connectorRuntime.ts`) that the exported `agents/`
 * runtime carries as a string.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveConnectorAuth,
  runConnector,
  requiresConfirmation,
  connectorAuditEntry,
  spreadsheetConnector,
  type ConnectorAuditEntry,
  type ConnectorOp,
} from "../src/index.ts";

// ── the Spreadsheet adapter's emitted glue (all provider destinations live HERE, never in the model) ──

test("emitNango emits Google Sheets REST glue per op — destination + method in the adapter, not the model", () => {
  const append = spreadsheetConnector.emitNango("append_row", {} as never).runtime;
  assert.match(append, /sheets\.googleapis\.com\/v4\/spreadsheets/);
  assert.match(append, /:append\?valueInputOption=RAW/);
  assert.match(append, /method: "POST"/);
  // it presents the Nango-brokered auth header (spread into the request headers).
  assert.match(append, /\.\.\.auth/);

  const read = spreadsheetConnector.emitNango("read_range", {} as never).runtime;
  assert.match(read, /\/values\//);
  assert.doesNotMatch(read, /method:/); // a GET — no method key

  const update = spreadsheetConnector.emitNango("update_cell", {} as never).runtime;
  assert.match(update, /method: "PUT"/);
});

// ── the async Nango resolver (TA1) — builds a request with a FETCHED token; mock Nango, no live creds ──

test("resolveConnectorAuth fetches a fresh token from Nango and returns it as an Authorization header", async () => {
  const calls: Array<{ url: string; secret?: string }> = [];
  const mockFetch = (async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url: String(url), secret: init?.headers?.authorization });
    return { ok: true, status: 200, json: async () => ({ credentials: { access_token: "ya29.PROVIDER_TOKEN" } }) };
  }) as unknown as typeof fetch;

  const auth = await resolveConnectorAuth("conn_opaque_42", {
    env: { NANGO_SECRET_KEY: "nango-secret-XYZ", NANGO_HOST: "http://localhost:3003", NANGO_PROVIDER_CONFIG_KEY: "google-sheets" },
    fetch: mockFetch,
  });

  // the resolved header carries the PROVIDER token (from Nango), not the secret.
  assert.deepEqual(auth, { authorization: "Bearer ya29.PROVIDER_TOKEN" });
  // the request went to the self-hosted Nango connection API, carrying the SECRET (server-side only).
  assert.equal(calls.length, 1);
  // §3.4 — the PLURAL, non-deprecated endpoint with force_refresh (NOT the deprecated singular /connection/{id}).
  assert.match(calls[0].url, /^http:\/\/localhost:3003\/connections\/conn_opaque_42\?/);
  assert.doesNotMatch(calls[0].url, /\/connection\/conn_opaque_42/);
  assert.match(calls[0].url, /provider_config_key=google-sheets/);
  assert.match(calls[0].url, /force_refresh=true/);
  assert.equal(calls[0].secret, "Bearer nango-secret-XYZ");
});

test("resolveConnectorAuth refuses when NANGO_SECRET_KEY is absent (fails loudly, names the var)", async () => {
  await assert.rejects(() => resolveConnectorAuth("conn_x", { env: {}, fetch: (async () => ({})) as unknown as typeof fetch }), /NANGO_SECRET_KEY is not set/);
});

// ── the write-op invocation gate (SEC4) — a write does NOT auto-run without autonomous:true ──

test("requiresConfirmation: write/send/delete gate unless autonomous; read/list never gate", () => {
  assert.equal(requiresConfirmation("write", undefined), true);
  assert.equal(requiresConfirmation("send", false), true);
  assert.equal(requiresConfirmation("delete", false), true);
  assert.equal(requiresConfirmation("write", true), false); // autonomous grant bypasses the gate
  assert.equal(requiresConfirmation("read", undefined), false);
  assert.equal(requiresConfirmation("list", undefined), false);
});

test("write-op gate FIRES: a write without autonomous is NOT executed (no provider call, pending_confirmation)", async () => {
  let opRan = false;
  const opFn: ConnectorOp = async () => { opRan = true; return { ok: true }; };
  const audits: ConnectorAuditEntry[] = [];
  const out = (await runConnector(
    { connector: "spreadsheet", op: "append_row", kind: "write", connectionRef: "conn_1" },
    { row: ["a", "b"] },
    {
      agentId: "lead_agent",
      connectors: { spreadsheet: { append_row: opFn } },
      resolveAuth: async () => ({ authorization: "Bearer SHOULD_NEVER_BE_USED" }),
      audit: (e) => audits.push(e),
      // no `approve` → default DENY
    },
  )) as { status?: string };

  assert.equal(opRan, false, "the provider write must NOT run without approval");
  assert.equal(out.status, "pending_confirmation");
  assert.equal(audits.at(-1)?.outcome, "confirmation-required");
});

test("write-op gate PASSES: autonomous:true runs the provider call", async () => {
  let opRan = false;
  const opFn: ConnectorOp = async (auth) => { opRan = true; return { updates: { updatedRows: 1 }, sawAuth: auth.authorization }; };
  const audits: ConnectorAuditEntry[] = [];
  const out = (await runConnector(
    { connector: "spreadsheet", op: "append_row", kind: "write", autonomous: true, connectionRef: "conn_1" },
    { row: ["a"] },
    { agentId: "lead_agent", connectors: { spreadsheet: { append_row: opFn } }, resolveAuth: async () => ({ authorization: "Bearer TOK" }), audit: (e) => audits.push(e) },
  )) as { updates?: unknown };

  assert.equal(opRan, true);
  assert.deepEqual(out.updates, { updatedRows: 1 });
  assert.equal(audits.at(-1)?.outcome, "ok");
});

test("read op runs directly (no gate) and the audit records the outcome", async () => {
  const opFn: ConnectorOp = async () => ({ values: [["email"], ["a@b.com"]] });
  const audits: ConnectorAuditEntry[] = [];
  const out = (await runConnector(
    { connector: "spreadsheet", op: "read_range", kind: "read", connectionRef: "conn_1" },
    { range: "A1:A2" },
    { agentId: "lead_agent", connectors: { spreadsheet: { read_range: opFn } }, resolveAuth: async () => ({ authorization: "Bearer TOK" }), audit: (e) => audits.push(e) },
  )) as { values?: unknown };
  assert.deepEqual(out.values, [["email"], ["a@b.com"]]);
  assert.equal(audits.at(-1)?.outcome, "ok");
});

// ── the secret-free audit log (SEC5) — NO token / secret anywhere in the audit entries ──

test("the audit log NEVER contains the provider token or the Nango secret", async () => {
  const SECRET = "nango-secret-DO-NOT-LOG";
  const TOKEN = "ya29.PROVIDER-TOKEN-DO-NOT-LOG";
  const opFn: ConnectorOp = async (auth) => ({ body: "sheet-contents", tokenSeen: auth.authorization });
  const audits: ConnectorAuditEntry[] = [];
  await runConnector(
    { connector: "spreadsheet", op: "read_range", kind: "read", connectionRef: "conn_ref_opaque" },
    {},
    {
      agentId: "lead_agent",
      connectors: { spreadsheet: { read_range: opFn } },
      resolveAuth: async () => ({ authorization: `Bearer ${TOKEN}` }),
      audit: (e) => audits.push(e),
    },
  );
  const serialized = JSON.stringify(audits);
  assert.doesNotMatch(serialized, new RegExp(TOKEN), "the provider token must never appear in the audit");
  assert.doesNotMatch(serialized, new RegExp(SECRET), "the Nango secret must never appear in the audit");
  assert.doesNotMatch(serialized, /Bearer/, "no Authorization header value in the audit");
  // it DOES carry the opaque, non-secret identity fields (SEC5's positive shape).
  assert.deepEqual(Object.keys(audits[0]).sort(), ["agentId", "connectionRef", "op", "outcome", "toolId", "ts"]);
});

test("connectorAuditEntry builds a fixed, secret-free shape (only the allow-listed fields)", () => {
  const e = connectorAuditEntry({ agentId: "a", toolId: "spreadsheet", op: "append_row", connectionRef: "c", outcome: "ok" }, 123);
  assert.deepEqual(e, { agentId: "a", toolId: "spreadsheet", op: "append_row", connectionRef: "c", ts: 123, outcome: "ok" });
});

test("an unregistered connector runtime yields a no-adapter outcome, not a crash", async () => {
  const audits: ConnectorAuditEntry[] = [];
  const out = (await runConnector(
    { connector: "unknown", op: "x", kind: "read", connectionRef: "c" },
    {},
    { agentId: "a", connectors: {}, resolveAuth: async () => ({}), audit: (e) => audits.push(e) },
  )) as { error?: string };
  assert.match(out.error ?? "", /no connector runtime/);
  assert.equal(audits.at(-1)?.outcome, "no-adapter");
});
