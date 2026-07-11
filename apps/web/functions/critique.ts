import { critiqueLayer, type LayerKind, type ReviewModel } from "@vbd/skills";
import type { CapabilityDoc } from "@vbd/compiler";
import { requireClient, readBody, newUsage, estCost, anthropicProvider, modelById, DEFAULT_MODEL, DEFAULT_EFFORT, type Req, type Res } from "./_lib.ts";

// Generic semantic critic: the LLM reviews ANY layer of its own output (advisory). Higher effort —
// critique is a hard reasoning task, and this is where "using the LLM better" pays off.
export default async function handler(req: Req, res: Res): Promise<void> {
  const client = requireClient(req, res);
  if (!client) return;
  const body = readBody<{
    layer?: LayerKind;
    capabilities?: CapabilityDoc;
    domain?: unknown;
    contexts?: unknown;
    roles?: unknown;
    workflows?: unknown;
    agents?: unknown;
    model?: string;
  }>(req);
  if (!body.layer || !body.capabilities?.capabilities?.length) return void res.status(400).json({ error: "layer and capabilities are required" });
  const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
  const effort = model.supportsEffort ? "high" : DEFAULT_EFFORT; // adaptive: critique gets more reasoning
  const usage = newUsage();
  const provider = anthropicProvider(client, model.id, effort, model.supportsEffort, usage);
  const review: ReviewModel = {
    caps: body.capabilities,
    domain: body.domain as never,
    contexts: body.contexts as never,
    roles: body.roles as never,
    workflows: body.workflows as never,
    agents: body.agents as never,
  };
  const result = await critiqueLayer(body.layer, review, provider);
  const estCostUsd = estCost(usage, model);
  res.status(200).json({ ...result, model: model.id, usage, estCostUsd, sessionSpendUsd: estCostUsd });
}
export const config = { maxDuration: 60 };
