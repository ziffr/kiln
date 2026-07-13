import { parseNarrative } from "@kiln/narrative";
import { generateCapabilities } from "@kiln/skills";
import { requireClient, readBody, newUsage, estCost, anthropicProvider, modelById, pickEffort, DEFAULT_MODEL, type Req, type Res } from "./_lib.ts";

export default async function handler(req: Req, res: Res): Promise<void> {
  const client = requireClient(req, res);
  if (!client) return;
  const body = readBody<{ narrative?: string; model?: string; effort?: string }>(req);
  if (!body.narrative || !body.narrative.trim()) return void res.status(400).json({ error: "narrative is required" });

  const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
  const effort = pickEffort(body.effort);
  const usage = newUsage();
  const provider = anthropicProvider(client, model.id, effort, model.supportsEffort, usage);
  const result = await generateCapabilities(parseNarrative(body.narrative), provider);
  const estCostUsd = estCost(usage, model);
  res.status(200).json({ ...result, model: model.id, usage, estCostUsd, sessionSpendUsd: estCostUsd });
}

// Vercel: allow up to 60s for the model call(s).
export const config = { maxDuration: 60 };
