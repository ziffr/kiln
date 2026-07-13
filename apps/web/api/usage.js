// functions/usage.ts
function handler(_req, res) {
  res.status(200).json({ sessionSpendUsd: 0, note: "per-call estimate on serverless; not a running total" });
}
export {
  handler as default
};
