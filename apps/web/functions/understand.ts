import { understandBusiness } from "@kiln/skills";
import { requireClient, readBody, newUsage, estCost, anthropicProvider, modelById, pickEffort, DEFAULT_MODEL, type Req, type Res } from "./_lib.ts";

export default async function handler(req: Req, res: Res): Promise<void> {
  const client = requireClient(req, res);
  if (!client) return;
  const body = readBody<{ raw?: string; model?: string; effort?: string }>(req);
  if (!body.raw || !body.raw.trim()) return void res.status(400).json({ error: "raw text is required" });
  const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
  const usage = newUsage();
  const provider = anthropicProvider(client, model.id, pickEffort(body.effort), model.supportsEffort, usage);
  const result = await understandBusiness(body.raw, provider);
  const estCostUsd = estCost(usage, model);
  res.status(200).json({ narrative: result.narrative, structured: result.structured, summary: result.summary, openQuestions: result.openQuestions, model: model.id, usage, estCostUsd, sessionSpendUsd: estCostUsd });
}
export const config = { maxDuration: 45 };
