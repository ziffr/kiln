/**
 * @kiln/service/connectors — the server-mediated Nango broker (SPEC-013 Phase B1, §4.7 SEC1/SEC8).
 *
 * The browser must NEVER see `NANGO_SECRET_KEY` (golden invariant #3). So the SPA calls these routes; the
 * service holds the secret and talks to Nango on its behalf:
 *   · `mintConnectSession` → a SHORT-LIVED Nango Connect **session token** (the only thing the browser gets;
 *     it runs the OAuth popup with it) — never the secret.
 *   · `listConnections` → a NON-SECRET status list (connection ids + provider + connected), for readiness.
 *
 * `fetch` + `env` are injectable so the routes are unit-testable with a mock Nango (no live creds), and so
 * the invariant test can prove the secret never appears in a client-reachable response. Nothing here returns
 * or logs the secret or any provider token.
 */

export interface NangoEnv {
  NANGO_SECRET_KEY?: string;
  NANGO_HOST?: string;
  NANGO_PROVIDER_CONFIG_KEY?: string;
}

export interface BrokerDeps {
  env?: NangoEnv;
  fetch?: typeof fetch;
}

export class ConnectorConfigError extends Error {}

function nangoBase(env: NangoEnv): { host: string; secret: string } {
  const secret = env.NANGO_SECRET_KEY;
  if (!secret) throw new ConnectorConfigError("NANGO_SECRET_KEY is not set on the server — connectors are unavailable. Set it in the service .env (it must never reach the browser).");
  const host = (env.NANGO_HOST || "https://api.nango.dev").replace(/\/+$/, "");
  return { host, secret };
}

/** What the browser is allowed to receive from `mintConnectSession` — a session token, NEVER the secret. */
export interface ConnectSession {
  token: string;
  expiresAt?: string;
}

/**
 * SEC1/SEC8 — mint a Nango Connect session token, scoped to the requesting project + the granted integration.
 * The SECRET goes ONLY to Nango over this server-side call. The browser receives only `{ token, expiresAt }`.
 */
export async function mintConnectSession(
  input: { projectId?: string; integrationId?: string; endUserId?: string },
  deps: BrokerDeps = {},
): Promise<ConnectSession> {
  const env = deps.env ?? (process.env as NangoEnv);
  const fetchImpl = deps.fetch ?? fetch;
  const { host, secret } = nangoBase(env);
  const providerConfigKey = input.integrationId || env.NANGO_PROVIDER_CONFIG_KEY || "google-sheets";
  // The Connect session is scoped: an end-user id (the project) + the allowed integration → the popup can
  // only connect that one integration for that project. Nango returns { data: { token, expires_at } }.
  const res = await fetchImpl(`${host}/connect/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
    body: JSON.stringify({
      end_user: { id: input.endUserId || input.projectId || "kiln-studio" },
      allowed_integrations: [providerConfigKey],
    }),
  });
  if (!res.ok) throw new ConnectorConfigError(`Nango Connect session request failed (${res.status}). Check NANGO_HOST / NANGO_SECRET_KEY and that integration '${providerConfigKey}' exists.`);
  const data = (await res.json().catch(() => ({}))) as { data?: { token?: string; expires_at?: string } };
  const token = data?.data?.token;
  if (!token) throw new ConnectorConfigError("Nango returned no Connect session token.");
  // ONLY the session token leaves the server — never the secret.
  return { token, expiresAt: data?.data?.expires_at };
}

/** A non-secret connection status (SEC6: the ref is opaque; NO token, NO PII beyond what the caller stored). */
export interface ConnectionStatus {
  connectionId: string;
  provider: string;
  connected: boolean;
}

/**
 * List/validate the project's live connections for READINESS. Returns non-secret status only — never a
 * token or credential. The SECRET is used server-side to query Nango and dropped.
 */
export async function listConnections(input: { integrationId?: string }, deps: BrokerDeps = {}): Promise<{ connections: ConnectionStatus[] }> {
  const env = deps.env ?? (process.env as NangoEnv);
  const fetchImpl = deps.fetch ?? fetch;
  const { host, secret } = nangoBase(env);
  const providerConfigKey = input.integrationId || env.NANGO_PROVIDER_CONFIG_KEY;
  // The PLURAL, non-deprecated list endpoint (`GET /connections`); the singular `/connection` is deprecated
  // (PLAN-013 §5). Filter by integration when one is given.
  const qs = providerConfigKey ? `?provider_config_key=${encodeURIComponent(providerConfigKey)}` : "";
  const res = await fetchImpl(`${host}/connections${qs}`, { headers: { authorization: `Bearer ${secret}` } });
  if (!res.ok) throw new ConnectorConfigError(`Nango connection list failed (${res.status}).`);
  const data = (await res.json().catch(() => ({}))) as { connections?: Array<{ connection_id?: string; provider_config_key?: string; provider?: string }> };
  // Project ONLY the non-secret fields — never the credentials block Nango may include.
  const connections: ConnectionStatus[] = (data.connections ?? []).map((c) => ({
    connectionId: String(c.connection_id ?? ""),
    provider: String(c.provider_config_key ?? c.provider ?? ""),
    connected: true,
  }));
  return { connections };
}

/** True when the server has a Nango secret configured (drives the readiness flag; reveals no value). */
export function connectorsReady(env: NangoEnv = process.env as NangoEnv): boolean {
  return !!env.NANGO_SECRET_KEY;
}
