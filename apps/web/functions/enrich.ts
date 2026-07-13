import { enrichDomain, type EnrichDepth } from "@kiln/skills";
import type { CapabilityDoc, DomainDoc } from "@kiln/compiler";
import { requireClient, readBody, newUsage, estCost, anthropicProvider, modelById, pickEffort, DEFAULT_MODEL, type Req, type Res } from "./_lib.ts";

export default async function handler(req: Req, res: Res): Promise<void> {
  const client = requireClient(req, res);
  if (!client) return;
  const body = readBody<{ capabilities?: CapabilityDoc; domain?: DomainDoc; depth?: EnrichDepth; model?: string; effort?: string }>(req);
  if (!body.capabilities?.capabilities?.length || !body.domain?.aggregates?.length) return void res.status(400).json({ error: "capabilities and a domain model are required" });

  const depth: EnrichDepth = (["conservative", "standard", "exhaustive"] as const).includes(body.depth as EnrichDepth) ? (body.depth as EnrichDepth) : "standard";
  const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
  const usage = newUsage();
  const provider = anthropicProvider(client, model.id, pickEffort(body.effort), model.supportsEffort, usage);
  const result = await enrichDomain(body.capabilities, body.domain, provider, depth);
  const estCostUsd = estCost(usage, model);
  res.status(200).json({ ...result, model: model.id, usage, estCostUsd, sessionSpendUsd: estCostUsd });
}

// Vercel: allow up to 60s for the model call(s).
export const config = { maxDuration: 60 };
