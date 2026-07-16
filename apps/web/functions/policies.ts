import { generatePolicies } from "@kiln/skills";
import type { CapabilityDoc } from "@kiln/compiler";
import { requireClient, readBody, newUsage, estCost, anthropicProvider, modelById, pickEffort, DEFAULT_MODEL, type Req, type Res } from "./_lib.ts";

export default async function handler(req: Req, res: Res): Promise<void> {
  const client = requireClient(req, res);
  if (!client) return;
  const body = readBody<{ feedback?: string; domain?: { events?: unknown[]; commands?: unknown[] }; capabilities?: CapabilityDoc; model?: string; effort?: string; promptOverride?: string }>(req);
  if (!body.domain?.events?.length || !body.domain?.commands?.length) return void res.status(400).json({ error: "domain with events and commands is required" });

  const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
  const capIds = (body.capabilities?.capabilities ?? []).map((c) => c.id);
  const usage = newUsage();
  const provider = anthropicProvider(client, model.id, pickEffort(body.effort), model.supportsEffort, usage, body.promptOverride);
  const result = await generatePolicies(body.domain as never, capIds, provider, body.feedback);
  const estCostUsd = estCost(usage, model);
  res.status(200).json({ ...result, model: model.id, usage, estCostUsd, sessionSpendUsd: estCostUsd });
}

// Vercel: allow up to 60s for the model call.
export const config = { maxDuration: 60 };
