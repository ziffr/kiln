import { polishComponents } from "@kiln/skills";
import type { CapabilityDoc } from "@kiln/compiler";
import { requireClient, readBody, newUsage, estCost, anthropicProvider, modelById, pickEffort, DEFAULT_MODEL, type Req, type Res } from "./_lib.ts";

// Automated UX pass: a "senior designer" critiques + improves each screen's view spec (build-safe data),
// iterating toward the design-language best practices. Returns improved views + per-screen rationale.
export default async function handler(req: Req, res: Res): Promise<void> {
  const client = requireClient(req, res);
  if (!client) return;
  const body = readBody<{ capabilities?: CapabilityDoc; domain?: unknown; contexts?: unknown; views?: Record<string, never>; rounds?: number; model?: string; effort?: string }>(req);
  if (!body.capabilities?.capabilities?.length || !body.domain) return void res.status(400).json({ error: "capabilities and domain are required" });
  const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
  const usage = newUsage();
  const provider = anthropicProvider(client, model.id, pickEffort(body.effort), model.supportsEffort, usage);
  const result = await polishComponents(body.capabilities, body.domain as never, body.contexts as never, body.views as never, provider, { rounds: body.rounds });
  const estCostUsd = estCost(usage, model);
  res.status(200).json({ ...result, model: model.id, usage, estCostUsd, sessionSpendUsd: estCostUsd });
}
export const config = { maxDuration: 60 };
