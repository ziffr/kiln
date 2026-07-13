import { translateMessages } from "@kiln/skills";
import { requireClient, readBody, newUsage, estCost, anthropicProvider, modelById, pickEffort, DEFAULT_MODEL, type Req, type Res } from "./_lib.ts";

export default async function handler(req: Req, res: Res): Promise<void> {
  const client = requireClient(req, res);
  if (!client) return;
  const body = readBody<{ bundle?: Record<string, string>; targetLang?: string; model?: string; effort?: string }>(req);
  if (!body.bundle || !Object.keys(body.bundle).length || !body.targetLang) return void res.status(400).json({ error: "bundle and targetLang are required" });
  const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
  const usage = newUsage();
  const provider = anthropicProvider(client, model.id, pickEffort(body.effort), model.supportsEffort, usage);
  const translations = await translateMessages(body.bundle, body.targetLang, provider);
  const estCostUsd = estCost(usage, model);
  res.status(200).json({ translations, model: model.id, usage, estCostUsd, sessionSpendUsd: estCostUsd });
}
export const config = { maxDuration: 60 };
