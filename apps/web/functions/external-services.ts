import { generateExternalServices } from "@vbd/skills";
import { requireClient, readBody, newUsage, estCost, anthropicProvider, modelById, pickEffort, DEFAULT_MODEL, type Req, type Res } from "./_lib.ts";

export default async function handler(req: Req, res: Res): Promise<void> {
  const client = requireClient(req, res);
  if (!client) return;
  const body = readBody<{ capabilities?: unknown; domain?: { aggregates?: unknown[] }; agentIds?: string[]; model?: string; effort?: string }>(req);
  if (!body.domain?.aggregates?.length) return void res.status(400).json({ error: "domain with aggregates is required" });
  const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
  const usage = newUsage();
  const provider = anthropicProvider(client, model.id, pickEffort(body.effort), model.supportsEffort, usage);
  const doc = await generateExternalServices((body.capabilities ?? { capabilities: [] }) as never, body.domain as never, provider, body.agentIds ?? []);
  const estCostUsd = estCost(usage, model);
  res.status(200).json({ doc, model: model.id, usage, estCostUsd, sessionSpendUsd: estCostUsd });
}
export const config = { maxDuration: 60 };
