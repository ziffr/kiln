import type { Req, Res } from "./_lib.ts";

// Serverless functions are stateless, so there is no cross-call running total to report; spend is
// returned per-call by each generate endpoint. Kept for API compatibility with the local dev server.
export default function handler(_req: Req, res: Res): void {
  res.status(200).json({ sessionSpendUsd: 0, note: "per-call estimate on serverless; not a running total" });
}
