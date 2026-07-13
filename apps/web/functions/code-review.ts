import { reviewGeneratedCode } from "@kiln/skills";
import type { CapabilityDoc } from "@kiln/compiler";
import { requireClient, readBody, newUsage, estCost, anthropicProvider, modelById, DEFAULT_MODEL, DEFAULT_EFFORT, type Req, type Res } from "./_lib.ts";

// Multi-lens AI review of the generated app code (security / correctness / maintainability).
export default async function handler(req: Req, res: Res): Promise<void> {
  const client = requireClient(req, res);
  if (!client) return;
  const body = readBody<{ capabilities?: CapabilityDoc; domain?: unknown; contexts?: unknown; roles?: unknown; handlerCode?: Record<string, string>; model?: string }>(req);
  if (!body.capabilities?.capabilities?.length || !body.domain) return void res.status(400).json({ error: "capabilities and domain are required" });
  const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
  const effort = model.supportsEffort ? "high" : DEFAULT_EFFORT;
  const usage = newUsage();
  const provider = anthropicProvider(client, model.id, effort, model.supportsEffort, usage);
  const result = await reviewGeneratedCode(body.capabilities, body.domain as never, body.contexts as never, body.roles as never, body.handlerCode, provider);
  const estCostUsd = estCost(usage, model);
  res.status(200).json({ ...result, model: model.id, usage, estCostUsd, sessionSpendUsd: estCostUsd });
}
export const config = { maxDuration: 60 };
