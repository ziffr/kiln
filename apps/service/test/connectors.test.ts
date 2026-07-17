/**
 * SPEC-013 Phase B1 — the server-mediated Nango broker (SEC1/SEC8). Proves the secret NEVER leaves the
 * server: it is sent to Nango, but the response the browser receives carries only a session token / a
 * non-secret status. Mocked Nango — no live creds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mintConnectSession, listConnections, connectorsReady, ConnectorConfigError, type NangoEnv } from "../src/connectors.ts";

const SECRET = "nango-secret-DO-NOT-LEAK";
const ENV: NangoEnv = { NANGO_SECRET_KEY: SECRET, NANGO_HOST: "http://localhost:3003", NANGO_PROVIDER_CONFIG_KEY: "google-sheets" };

test("mintConnectSession sends the SECRET to Nango but returns ONLY a session token to the browser", async () => {
  const seen: Array<{ url: string; auth?: string; body?: string }> = [];
  const mockFetch = (async (url: string, init?: { headers?: Record<string, string>; body?: string }) => {
    seen.push({ url: String(url), auth: init?.headers?.authorization, body: init?.body });
    return { ok: true, status: 200, json: async () => ({ data: { token: "connect_session_TOK", expires_at: "2026-07-17T12:00:00Z" } }) };
  }) as unknown as typeof fetch;

  const session = await mintConnectSession({ projectId: "proj_1", integrationId: "google-sheets" }, { env: ENV, fetch: mockFetch });

  // the browser gets a session token + expiry — and NOTHING resembling the secret.
  assert.deepEqual(session, { token: "connect_session_TOK", expiresAt: "2026-07-17T12:00:00Z", connectLink: undefined });
  assert.doesNotMatch(JSON.stringify(session), new RegExp(SECRET), "the secret must never appear in the response");
  // the SECRET was used server-side, to Nango's Connect endpoint, scoped to the project + integration.
  assert.equal(seen.length, 1);
  assert.match(seen[0].url, /\/connect\/sessions$/);
  assert.equal(seen[0].auth, `Bearer ${SECRET}`);
  assert.match(seen[0].body ?? "", /google-sheets/);
});

test("mintConnectSession RETURNS Nango's hosted connect_link (browser-safe) but still never the secret", async () => {
  const mockFetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: { token: "connect_session_TOK", expires_at: "2026-07-17T12:00:00Z", connect_link: "https://connect.nango.dev/sess_abc" } }),
  })) as unknown as typeof fetch;

  const session = await mintConnectSession({ projectId: "proj_1", integrationId: "google-sheets" }, { env: ENV, fetch: mockFetch });

  // the hosted Connect UI URL reaches the browser (the SPA opens it in a popup) — the secret does NOT.
  assert.equal(session.connectLink, "https://connect.nango.dev/sess_abc");
  assert.equal(session.token, "connect_session_TOK");
  assert.doesNotMatch(JSON.stringify(session), new RegExp(SECRET), "the secret must never appear in the response");
});

test("mintConnectSession fails loudly (ConnectorConfigError) when NANGO_SECRET_KEY is unset", async () => {
  await assert.rejects(
    () => mintConnectSession({ projectId: "p" }, { env: {}, fetch: (async () => ({})) as unknown as typeof fetch }),
    (e) => e instanceof ConnectorConfigError && /NANGO_SECRET_KEY is not set/.test(e.message),
  );
});

test("listConnections returns NON-SECRET status only — no token, no credentials block", async () => {
  const seen: string[] = [];
  const mockFetch = (async (url: string) => {
    seen.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        connections: [
          // Nango may include a credentials block — the broker must NOT pass it through.
          { connection_id: "conn_opaque_1", provider_config_key: "google-sheets", provider: "google-sheets", credentials: { access_token: "ya29.LEAK" } },
        ],
      }),
    };
  }) as unknown as typeof fetch;

  const out = await listConnections({ integrationId: "google-sheets" }, { env: ENV, fetch: mockFetch });
  // §3.4 — the PLURAL, non-deprecated list endpoint (not the deprecated singular /connection).
  assert.match(seen[0], /\/connections\?provider_config_key=google-sheets$/);
  assert.deepEqual(out, { connections: [{ connectionId: "conn_opaque_1", provider: "google-sheets", connected: true }] });
  const serialized = JSON.stringify(out);
  assert.doesNotMatch(serialized, /ya29\.LEAK/, "a provider token must never appear in the connection status");
  assert.doesNotMatch(serialized, new RegExp(SECRET), "the secret must never appear in the connection status");
});

test("connectorsReady reflects whether the secret is configured, without revealing it", () => {
  assert.equal(connectorsReady(ENV), true);
  assert.equal(connectorsReady({}), false);
});
