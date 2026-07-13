import { generateEvents } from "@kiln/skills";
import type { CapabilityDoc } from "@kiln/compiler";
import { requireClient, readBody, newUsage, estCost, anthropicProvider, modelById, pickEffort, DEFAULT_MODEL, type Req, type Res } from "./_lib.ts";

export default async function handler(req: Req, res: Res): Promise<void> {
  const client = requireClient(req, res);
  if (!client) return;
  const body = readBody<{ feedback?: string; domain?: { aggregates?: unknown[] }; capabilities?: CapabilityDoc; model?: string; effort?: string }>(req);
  if (!body.domain?.aggregates?.length) return void res.status(400).json({ error: "domain with aggregates is required" });
  if (!body.capabilities?.capabilities?.length) return void res.status(400).json({ error: "capabilities are required" });

  const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
  const usage = newUsage();
  const provider = anthropicProvider(client, model.id, pickEffort(body.effort), model.supportsEffort, usage);
  const result = await generateEvents(body.domain as never, body.capabilities, provider, body.feedback);
  const estCostUsd = estCost(usage, model);
  res.status(200).json({ ...result, model: model.id, usage, estCostUsd, sessionSpendUsd: estCostUsd });
}

// Vercel: allow up to 60s for the model call(s).
export const config = { maxDuration: 60 };
