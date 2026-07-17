/**
 * @kiln/codegen/connectors/spreadsheet — the Google Sheets connector (SPEC-013 Phase B1, the proof).
 *
 * This is the ONE bounded piece of "muscle" the spec permits (§4.3, invariant #8): ALL provider glue —
 * the base URL, the HTTP method, the path, and how each op's typed input maps onto the Sheets REST API —
 * lives HERE, in the adapter, in code (ADR-002). NONE of it is ever in `model.json` (SEC3/TC6): the
 * authored `ToolDef` is grant-surface metadata only. `emitNango(op)` returns the TS the exported runtime
 * runs for that op — an `async (auth, input) => …` expression that presents the Nango-brokered token
 * (`auth`, the `Authorization` header from `resolveConnectorAuth`) and calls Google's Sheets v4 API.
 *
 * The spreadsheet id is provider CONFIG, not a model destination: it comes from the op input
 * (`spreadsheetId`) or the runtime env (`GOOGLE_SHEETS_SPREADSHEET_ID`) — never baked into the committed
 * model. That keeps this from degenerating into a `fetch(url)` while still being a real, working call.
 *
 * PURE + ISOMORPHIC (golden invariant #4): this module only BUILDS strings — no `node:*`, no `fetch`, no
 * `process` executed here. `process.env` / `fetch` appear only INSIDE the emitted string (which runs in
 * the generated Node app), where they are legitimate.
 */

import type { ToolDef } from "@kiln/compiler";
import type { ConnectorAdapter } from "./registry.ts";
import { registerConnector } from "./registry.ts";

/** OAuth scope tiers — one read-only, one read/write (SEC2/UX5: recommend one providerConfigKey per tier). */
const SCOPE_READ = "https://www.googleapis.com/auth/spreadsheets.readonly";
const SCOPE_WRITE = "https://www.googleapis.com/auth/spreadsheets";

/**
 * The grant surface (§4.1). Four typed operations spanning the connector kinds: `read_range` (read),
 * `list_rows` (list), `append_row` (write), `update_cell` (write). NO url/host/method — those are in
 * `emitNango`. `scopes` carry the OAuth scopes each op needs (TC6 exempts scope URLs).
 */
export const SPREADSHEET_TOOL: ToolDef = {
  id: "spreadsheet",
  name: "Spreadsheet",
  providerLabel: "Google Sheets",
  operations: [
    {
      name: "read_range",
      kind: "read",
      input: [
        { name: "spreadsheetId", type: "text" },
        { name: "range", type: "text" },
      ],
      output: [{ name: "values", type: "array" }],
      scopes: [SCOPE_READ],
    },
    {
      name: "list_rows",
      kind: "list",
      input: [
        { name: "spreadsheetId", type: "text" },
        { name: "sheet", type: "text" },
      ],
      output: [{ name: "rows", type: "array" }],
      scopes: [SCOPE_READ],
    },
    {
      name: "append_row",
      kind: "write",
      input: [
        { name: "spreadsheetId", type: "text" },
        { name: "range", type: "text" },
        { name: "row", type: "array" },
      ],
      output: [{ name: "updates", type: "object" }],
      scopes: [SCOPE_WRITE],
    },
    {
      name: "update_cell",
      kind: "write",
      input: [
        { name: "spreadsheetId", type: "text" },
        { name: "range", type: "text" },
        { name: "value", type: "text" },
      ],
      output: [{ name: "updates", type: "object" }],
      scopes: [SCOPE_WRITE],
    },
  ],
  meta: { origin: "authored" },
};

/**
 * The Sheets v4 base — the destination that MUST NOT live in the model. Embedded in the emitted runtime as
 * a string constant; `resolveId` reads the spreadsheet id from input or env (config, not a destination).
 */
const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

// Shared preamble the emitted expressions rely on — id resolution (input → env) + a JSON body reader.
const RESOLVE_ID = `const spreadsheetId = String((input.spreadsheetId ?? process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? "")).trim();
    if (!spreadsheetId) return { error: "no spreadsheetId — pass it, or set GOOGLE_SHEETS_SPREADSHEET_ID in .env" };`;

/** The per-op emitted runtime (an `async (auth, input) => …` expression). Google Sheets REST, glue-only. */
function emit(op: string): string {
  if (op === "read_range")
    return `async (auth, input) => {
    ${RESOLVE_ID}
    const range = encodeURIComponent(String(input.range ?? "A1:Z1000"));
    const res = await fetch("${SHEETS_BASE}/" + encodeURIComponent(spreadsheetId) + "/values/" + range, { headers: { ...auth } });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, values: (body && body.values) || [] };
  }`;
  if (op === "list_rows")
    return `async (auth, input) => {
    ${RESOLVE_ID}
    const range = encodeURIComponent(String(input.sheet ?? "Sheet1"));
    const res = await fetch("${SHEETS_BASE}/" + encodeURIComponent(spreadsheetId) + "/values/" + range, { headers: { ...auth } });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, rows: (body && body.values) || [] };
  }`;
  if (op === "append_row")
    return `async (auth, input) => {
    ${RESOLVE_ID}
    const range = encodeURIComponent(String(input.range ?? "Sheet1"));
    const row = Array.isArray(input.row) ? input.row : [input.row];
    const res = await fetch("${SHEETS_BASE}/" + encodeURIComponent(spreadsheetId) + "/values/" + range + ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS", { method: "POST", headers: { "content-type": "application/json", ...auth }, body: JSON.stringify({ values: [row] }) });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, updates: (body && body.updates) || body };
  }`;
  if (op === "update_cell")
    return `async (auth, input) => {
    ${RESOLVE_ID}
    const range = encodeURIComponent(String(input.range ?? "Sheet1!A1"));
    const res = await fetch("${SHEETS_BASE}/" + encodeURIComponent(spreadsheetId) + "/values/" + range + "?valueInputOption=RAW", { method: "PUT", headers: { "content-type": "application/json", ...auth }, body: JSON.stringify({ values: [[input.value ?? ""]] }) });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, updates: body };
  }`;
  // An op the adapter doesn't implement — a safe stub (the runtime records outcome:"no-adapter" upstream).
  return `async () => ({ error: "unimplemented op ${op}" })`;
}

/**
 * The registered Spreadsheet adapter. `emitNango` is the only method B1 needs; `emitN8n` (the optional
 * n8n-node execution target) is deferred (Phase C). One registered file, zero edits to core dispatch (DX2).
 */
export const spreadsheetConnector: ConnectorAdapter = {
  toolDef: SPREADSHEET_TOOL,
  emitNango(op) {
    return { runtime: emit(op) };
  },
};

registerConnector(spreadsheetConnector);
