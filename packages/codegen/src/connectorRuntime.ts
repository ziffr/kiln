/**
 * @kiln/codegen/connectorRuntime — the REAL (non-template) connector runtime (SPEC-013 Phase B1, §4.7).
 *
 * The exported agent app carries a STRING copy of this logic (emitted into `agents/src/nango.ts` +
 * `agents/src/tools.ts` by `agentsAdapter`). This module is the executable mirror — kept byte-equivalent
 * in behaviour — so the runtime seams are UNIT-TESTABLE without exporting an app first, and so the
 * in-Studio "Test agent" loop could reuse the same resolution. Same discipline as `agentToolParams`
 * mirroring the emitted `toolParams`.
 *
 * NOT part of the isomorphic surface: it does a raw `fetch` to Nango and reads `process.env`. It lives at
 * the `@kiln/codegen` ROOT (not under `engines/`|`deploy/`|`connectors/`, the scanned pure dirs), so the
 * isomorphism gate does not apply. `env` and `fetch` are injectable so tests never touch the network or a
 * real secret. Nothing here logs or persists the secret or the provider token (SEC5).
 *
 * TA1: `resolveConnectorAuth` is a NEW ASYNC seam, deliberately separate from the sync `externalAuthHeaders`
 * (the static-token path) — Nango is not shoehorned into the sync `ExternalAuth` enum.
 */

/** The resolved auth header for a single provider call (never stored — held for the one call). */
export type ConnectorAuth = Record<string, string>;

/** A connector op's emitted runtime: given the Nango-brokered auth header + typed input, call the provider. */
export type ConnectorOp = (auth: ConnectorAuth, input: Record<string, unknown>) => Promise<unknown>;

/** The `invoke` shape a folded `connector` tool carries (grant-surface + the opaque connectionRef). */
export interface ConnectorInvoke {
  connector: string; // the tool id (which ConnectorAdapter backs it)
  op: string; // the granted operation name
  kind: "read" | "list" | "write" | "send" | "delete";
  autonomous?: boolean; // grant-level: skip the per-invocation gate for write/send/delete
  connectionRef?: string; // opaque Nango connection reference (never a token / PII)
}

/** A secret-free audit record (SEC5): identity + what ran + outcome — NEVER the token or the response body. */
export interface ConnectorAuditEntry {
  agentId: string;
  toolId: string;
  op: string;
  connectionRef: string;
  ts: number;
  outcome: "ok" | "error" | "confirmation-required" | "no-adapter";
}

/** The op kinds gated by the per-invocation human confirmation (SEC4): a write with reach into a real system. */
export const GATED_KINDS = new Set<ConnectorInvoke["kind"]>(["write", "send", "delete"]);

/** True when the op must NOT run autonomously — a write/send/delete without an explicit `autonomous` grant. */
export function requiresConfirmation(kind: ConnectorInvoke["kind"], autonomous?: boolean): boolean {
  return GATED_KINDS.has(kind) && !autonomous;
}

/** Build the secret-free audit entry. By construction it can only carry the allow-listed fields. */
export function connectorAuditEntry(base: Omit<ConnectorAuditEntry, "ts">, ts = Date.now()): ConnectorAuditEntry {
  return { agentId: base.agentId, toolId: base.toolId, op: base.op, connectionRef: base.connectionRef, ts, outcome: base.outcome };
}

export interface ResolveOpts {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
}

/**
 * SEC1/SEC7/TA1 — resolve a FRESH provider access token for a Nango connection and return it as an
 * `Authorization` header. A RAW `fetch` to Nango's REST connection API (no Nango SDK — keeps the exported
 * app dependency-light). `NANGO_SECRET_KEY` is server-only; the token is EPHEMERAL — returned for the one
 * call, never persisted, never logged. Self-host `NANGO_HOST` is the recommended posture.
 */
export async function resolveConnectorAuth(connectionRef: string, opts: ResolveOpts = {}): Promise<ConnectorAuth> {
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetch ?? fetch;
  const secret = env.NANGO_SECRET_KEY;
  if (!secret) throw new Error("NANGO_SECRET_KEY is not set — the agent cannot resolve a connector token. Set it in .env (server-side only; it must never reach the browser or the model).");
  if (!connectionRef) throw new Error("this connector grant has no connectionRef — connect a live account first (a grant with no connection is not runnable).");
  const host = (env.NANGO_HOST || "https://api.nango.dev").replace(/\/+$/, "");
  const providerConfigKey = env.NANGO_PROVIDER_CONFIG_KEY || "google-sheets";
  const url = `${host}/connection/${encodeURIComponent(connectionRef)}?provider_config_key=${encodeURIComponent(providerConfigKey)}&refresh_token=true`;
  // The SECRET goes ONLY to Nango, over this server-side call. It is never returned to the caller.
  const res = await fetchImpl(url, { headers: { authorization: `Bearer ${secret}` } });
  if (!res.ok) throw new Error(`Nango connection lookup failed (${res.status}) — check NANGO_HOST / NANGO_SECRET_KEY / NANGO_PROVIDER_CONFIG_KEY and that the connection is live.`);
  const data = (await res.json().catch(() => ({}))) as { credentials?: { access_token?: string; raw?: { access_token?: string } } };
  const token = data?.credentials?.access_token ?? data?.credentials?.raw?.access_token;
  if (!token) throw new Error("Nango returned no access token for this connection (is the live account still connected and authorized?).");
  return { authorization: `Bearer ${token}` };
}

export interface RunConnectorDeps {
  agentId: string;
  /** the per-connector op dispatch table (from the emitted `connectors.ts` / the adapters' `emitNango`). */
  connectors: Record<string, Record<string, ConnectorOp>>;
  /** resolve the Nango token for a connection (defaults to `resolveConnectorAuth`). */
  resolveAuth?: (connectionRef: string) => Promise<ConnectorAuth>;
  /**
   * The human confirmation seam (SEC4). Returns true iff a person approved this write/send/delete. DEFAULT
   * is DENY — a headless run must not silently perform a write; a real deployment wires this to its
   * approval channel (the same human-escalation path `notify` uses). Autonomous grants bypass it entirely.
   */
  approve?: (entry: Omit<ConnectorAuditEntry, "ts" | "outcome"> & { kind: ConnectorInvoke["kind"] }) => Promise<boolean>;
  /** record the secret-free audit entry (defaults to a stdout line). */
  audit?: (entry: ConnectorAuditEntry) => void;
}

/**
 * Execute one granted connector op with the write-op invocation gate + audit (SEC4/SEC5). The gate is at
 * INVOCATION: a write/send/delete op WITHOUT `autonomous:true` is routed to `approve` and, if not approved,
 * NOT executed — the model gets a `pending_confirmation` result and continues. Reads/lists run directly.
 * Every path writes exactly one secret-free audit entry.
 */
export async function runConnector(invoke: ConnectorInvoke, input: Record<string, unknown>, deps: RunConnectorDeps): Promise<unknown> {
  const resolveAuth = deps.resolveAuth ?? ((ref: string) => resolveConnectorAuth(ref));
  const audit = deps.audit ?? ((e: ConnectorAuditEntry) => console.log("[connector-audit] " + JSON.stringify(e)));
  const connectionRef = invoke.connectionRef ?? "";
  const base = { agentId: deps.agentId, toolId: invoke.connector, op: invoke.op, connectionRef };

  if (requiresConfirmation(invoke.kind, invoke.autonomous)) {
    const approved = deps.approve ? await deps.approve({ ...base, kind: invoke.kind }) : false;
    if (!approved) {
      audit(connectorAuditEntry({ ...base, outcome: "confirmation-required" }));
      return {
        status: "pending_confirmation",
        message: `The '${invoke.op}' operation writes to ${invoke.connector} and needs human approval before it runs. It was NOT executed. Ask a person to approve it, or grant this connector 'autonomous' access.`,
      };
    }
  }

  const opFn = deps.connectors?.[invoke.connector]?.[invoke.op];
  if (!opFn) {
    audit(connectorAuditEntry({ ...base, outcome: "no-adapter" }));
    return { error: `no connector runtime is registered for ${invoke.connector}.${invoke.op}` };
  }

  try {
    const auth = await resolveAuth(connectionRef); // ephemeral token — used here, never stored
    const out = await opFn(auth, input);
    audit(connectorAuditEntry({ ...base, outcome: "ok" }));
    return out;
  } catch (e: unknown) {
    audit(connectorAuditEntry({ ...base, outcome: "error" }));
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
