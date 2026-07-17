/**
 * apps/web/functions/connectors — the HOSTED mirror of the Nango broker (SPEC-013 Phase B1, SEC1/SEC8).
 *
 * Mirrors apps/service/src/connectors.ts for the Vercel deployment: the SPA calls `/api/connectors/*`, the
 * function holds `NANGO_SECRET_KEY` server-side and talks to Nango. The browser receives ONLY a short-lived
 * Connect **session token** (to run the OAuth popup) or a NON-SECRET status list — never the secret, never a
 * provider token. Every route inherits the studio auth gate (`studioLocked`).
 *
 * The router dispatches on the `connectors` path segment and passes the request through; this handler reads
 * the sub-path (`session` | `connections` | readiness) off `req.url`.
 */
import { studioLocked, type Req, type Res } from "./_lib.ts";

type ConnReq = Req & { url?: string; query?: Record<string, string | string[] | undefined> };

const HOST = () => (process.env.NANGO_HOST || "https://api.nango.dev").replace(/\/+$/, "");
const SECRET = () => process.env.NANGO_SECRET_KEY;

function subAction(req: ConnReq): string {
  const p = (req.url || "").split("?")[0].replace(/\/+$/, "");
  const seg = p.split("/").filter(Boolean);
  const i = seg.lastIndexOf("connectors");
  return i >= 0 && seg[i + 1] ? seg[i + 1] : "";
}

export default async function handler(req: ConnReq, res: Res): Promise<void> {
  if (studioLocked(req, res)) return;
  const action = subAction(req);

  // GET /api/connectors → readiness (no secret; safe when unset).
  if (!action) {
    res.status(200).json({ ready: !!SECRET(), host: HOST() });
    return;
  }

  const secret = SECRET();
  if (!secret) {
    res.status(503).json({ error: "NANGO_SECRET_KEY is not set on the server — connectors are unavailable. It must never reach the browser." });
    return;
  }

  try {
    if (action === "session" && (req.method ?? "GET") === "POST") {
      const body = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {}) as { projectId?: string; integrationId?: string; endUserId?: string };
      const providerConfigKey = body.integrationId || process.env.NANGO_PROVIDER_CONFIG_KEY || "google-sheets";
      // The SECRET goes ONLY to Nango. The browser receives only { token, expiresAt }.
      const r = await fetch(`${HOST()}/connect/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
        body: JSON.stringify({ end_user: { id: body.endUserId || body.projectId || "kiln-studio" }, allowed_integrations: [providerConfigKey] }),
      });
      if (!r.ok) { res.status(502).json({ error: `Nango Connect session request failed (${r.status}).` }); return; }
      const data = (await r.json().catch(() => ({}))) as { data?: { token?: string; expires_at?: string; connect_link?: string } };
      if (!data?.data?.token) { res.status(502).json({ error: "Nango returned no Connect session token." }); return; }
      // ONLY the session token + the hosted connect link (browser opens it to run OAuth) — never the secret.
      res.status(200).json({ token: data.data.token, expiresAt: data.data.expires_at, connectLink: data.data.connect_link });
      return;
    }

    if (action === "connections") {
      const q = req.query?.integrationId;
      const integrationId = (Array.isArray(q) ? q[0] : q) || process.env.NANGO_PROVIDER_CONFIG_KEY;
      const qs = integrationId ? `?connectionId=&provider_config_key=${encodeURIComponent(integrationId)}` : "";
      const r = await fetch(`${HOST()}/connection${qs}`, { headers: { authorization: `Bearer ${secret}` } });
      if (!r.ok) { res.status(502).json({ error: `Nango connection list failed (${r.status}).` }); return; }
      const data = (await r.json().catch(() => ({}))) as { connections?: Array<{ connection_id?: string; provider_config_key?: string; provider?: string }> };
      // Project ONLY non-secret fields — never a credentials block.
      res.status(200).json({ connections: (data.connections ?? []).map((c) => ({ connectionId: String(c.connection_id ?? ""), provider: String(c.provider_config_key ?? c.provider ?? ""), connected: true })) });
      return;
    }

    res.status(404).json({ error: `no connectors sub-route: ${action}` });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
  }
}
