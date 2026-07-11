import { critiqueContexts } from "@vbd/skills";
import type { CapabilityDoc } from "@vbd/compiler";
import { requireClient, readBody, newUsage, estCost, anthropicProvider, modelById, DEFAULT_MODEL, DEFAULT_EFFORT, type Req, type Res } from "./_lib.ts";

export default async function handler(req: Req, res: Res): Promise<void> {
  const client = requireClient(req, res);
  if (!client) return;
  const body = readBody<{ capabilities?: CapabilityDoc; contexts?: unknown; model?: string; effort?: string }>(req);
  if (!body.capabilities?.capabilities?.length || !body.contexts) return void res.status(400).json({ error: "capabilities and contexts are required" });
  const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
  const effort = model.supportsEffort ? "high" : DEFAULT_EFFORT; // critique benefits from more reasoning
  const usage = newUsage();
  const provider = anthropicProvider(client, model.id, effort, model.supportsEffort, usage);
  const result = await critiqueContexts(body.capabilities, body.contexts as never, provider);
  const estCostUsd = estCost(usage, model);
  res.status(200).json({ ...result, model: model.id, usage, estCostUsd, sessionSpendUsd: estCostUsd });
}
export const config = { maxDuration: 60 };
