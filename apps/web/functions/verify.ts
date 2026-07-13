import { readBody, type Req, type Res } from "./_lib.ts";

// Proxy to the sandboxed app verifier (env-based → local Docker or a VPS). No model/API key involved.
export default async function handler(req: Req, res: Res): Promise<void> {
  const verifyUrl = process.env.KILN_VERIFY_URL;
  if (!verifyUrl) return void res.status(200).json({ configured: false, error: "verifier not configured (set KILN_VERIFY_URL)" });
  const body = readBody<Record<string, unknown>>(req);
  try {
    const r = await fetch(verifyUrl.replace(/\/$/, "") + "/verify", {
      method: "POST",
      headers: { "content-type": "application/json", "x-verify-secret": process.env.KILN_VERIFY_SECRET ?? "" },
      body: JSON.stringify(body),
    });
    res.status(r.status).json(await r.json());
  } catch (e) {
    res.status(502).json({ ok: false, error: `verifier unreachable: ${e instanceof Error ? e.message : String(e)}` });
  }
}
export const config = { maxDuration: 60 };
