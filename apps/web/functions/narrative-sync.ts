import { syncNarrative } from "@kiln/skills";
import { requireClient, readBody, newUsage, estCost, anthropicProvider, modelById, pickEffort, DEFAULT_MODEL, type Req, type Res } from "./_lib.ts";

export default async function handler(req: Req, res: Res): Promise<void> {
  const client = requireClient(req, res);
  if (!client) return;
  const body = readBody<{ narrative?: string; facts?: string[]; model?: string; effort?: string }>(req);
  const facts = Array.isArray(body.facts) ? body.facts.filter((x) => typeof x === "string") : [];
  if (!facts.length) return void res.status(400).json({ error: "facts are required" });
  const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
  const usage = newUsage();
  const provider = anthropicProvider(client, model.id, pickEffort(body.effort), model.supportsEffort, usage);
  const result = await syncNarrative(body.narrative ?? "", facts, provider);
  const estCostUsd = estCost(usage, model);
  res.status(200).json({ additions: result.additions, model: model.id, usage, estCostUsd, sessionSpendUsd: estCostUsd });
}
export const config = { maxDuration: 60 };
