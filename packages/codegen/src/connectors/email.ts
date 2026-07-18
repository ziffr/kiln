/**
 * @kiln/codegen/connectors/email — the Email (Gmail) connector (SPEC-013, the second worked example).
 *
 * This is the proof of the §4.3 seam: adding a connector is ONE new file + one import line, with ZERO
 * edits to core dispatch. Structurally identical to `spreadsheet.ts` — the exact same discipline: ALL
 * provider glue (the base URL, the HTTP method, the path, how each op's typed input maps onto the Gmail
 * REST API) lives HERE, in the adapter, in code (ADR-002). NONE of it is ever in `model.json` (SEC3/TC6):
 * the authored `ToolDef` is grant-surface metadata only. `emitNango(op)` returns the TS the exported
 * runtime runs for that op — an `async (auth, input) => …` expression that presents the Nango-brokered
 * token (`auth`, the `Authorization` header from `resolveConnectorAuth`) and calls Gmail's v1 API.
 *
 * PROMPT-INJECTION POSTURE (SEC4, invariant #6): email is a HIGHER-risk surface than a spreadsheet — an
 * agent reads attacker-controlled inbox content and could be steered into acting on it. So `send` is a
 * non-read (`send`) kind: the generated runtime's write-gate holds it for human approval and will not run
 * it autonomously unless the owner explicitly marks the grant autonomous. `search` / `read_message` are
 * reads and run directly.
 *
 * PURE + ISOMORPHIC (golden invariant #4): this module only BUILDS strings — no `node:*`, no `fetch`, no
 * `process`, no `Buffer` executed here. `fetch` / `process.env` / `Buffer` appear only INSIDE the emitted
 * string (which runs in the generated Node app), where they are legitimate.
 */

import type { ToolDef } from "@kiln/compiler";
import type { ConnectorAdapter } from "./registry.ts";
import { registerConnector } from "./registry.ts";

/** OAuth scope tiers — one read-only (search + read a message), one send (SEC2/UX5: one config key per tier). */
const SCOPE_READ = "https://www.googleapis.com/auth/gmail.readonly";
const SCOPE_SEND = "https://www.googleapis.com/auth/gmail.send";

/**
 * The grant surface (§4.1). Three typed operations spanning the connector kinds: `search` (read),
 * `read_message` (read), `send` (send — a gated, non-read kind). NO url/host/method — those are in
 * `emitNango`. `scopes` carry the OAuth scopes each op needs (TC6 exempts scope URLs).
 */
export const EMAIL_TOOL: ToolDef = {
  id: "email",
  name: "Email",
  providerLabel: "Gmail",
  operations: [
    {
      name: "search",
      kind: "read",
      input: [{ name: "query", type: "text" }],
      output: [{ name: "messages", type: "array" }],
      scopes: [SCOPE_READ],
    },
    {
      name: "read_message",
      kind: "read",
      input: [{ name: "messageId", type: "text" }],
      output: [{ name: "message", type: "object" }],
      scopes: [SCOPE_READ],
    },
    {
      name: "send",
      kind: "send",
      input: [
        { name: "to", type: "text" },
        { name: "subject", type: "text" },
        { name: "body", type: "text" },
      ],
      output: [{ name: "id", type: "object" }],
      scopes: [SCOPE_SEND],
    },
  ],
  meta: { origin: "authored" },
};

/**
 * The Gmail v1 base — the destination that MUST NOT live in the model. Embedded in the emitted runtime as
 * a string constant. `users/me` scopes every call to the connected account (config, not a destination).
 */
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/** The per-op emitted runtime (an `async (auth, input) => …` expression). Gmail REST, glue-only. */
function emit(op: string): string {
  if (op === "search")
    return `async (auth, input) => {
    const q = encodeURIComponent(String(input.query ?? ""));
    const res = await fetch("${GMAIL_BASE}/messages?q=" + q, { headers: { ...auth } });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, messages: (body && body.messages) || [] };
  }`;
  if (op === "read_message")
    return `async (auth, input) => {
    const id = encodeURIComponent(String(input.messageId ?? ""));
    const res = await fetch("${GMAIL_BASE}/messages/" + id + "?format=full", { headers: { ...auth } });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, message: body };
  }`;
  if (op === "send")
    return `async (auth, input) => {
    const mime = "To: " + String(input.to ?? "") + "\\r\\n" +
      "Subject: " + String(input.subject ?? "") + "\\r\\n" +
      "\\r\\n" + String(input.body ?? "");
    const raw = Buffer.from(mime).toString("base64url");
    const res = await fetch("${GMAIL_BASE}/messages/send", { method: "POST", headers: { "content-type": "application/json", ...auth }, body: JSON.stringify({ raw }) });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, id: (body && body.id) || body };
  }`;
  // An op the adapter doesn't implement — a safe stub (the runtime records outcome:"no-adapter" upstream).
  return `async () => ({ error: "unimplemented op ${op}" })`;
}

/**
 * The registered Email adapter. `emitNango` is the only method B needs; `emitN8n` (the optional n8n-node
 * execution target) is deferred (Phase C). One registered file, zero edits to core dispatch (DX2).
 */
export const emailConnector: ConnectorAdapter = {
  toolDef: EMAIL_TOOL,
  emitNango(op) {
    return { runtime: emit(op) };
  },
};

registerConnector(emailConnector);
