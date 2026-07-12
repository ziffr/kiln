import Anthropic from "@anthropic-ai/sdk";
import { ENRICH_LAYER_SYSTEM_PROMPT, renderEnrichLayerUserPrompt, extractJsonObject } from "@vbd/skills";
import { requireClient, readBody, estCost, modelById, DEFAULT_MODEL, type Req, type Res } from "./_lib.ts";

export default async function handler(req: Req, res: Res): Promise<void> {
  const client = requireClient(req, res);
  if (!client) return;
  const body = readBody<{ layer?: string; capabilities?: { capabilities?: unknown[] }; roles?: unknown; agents?: unknown; model?: string }>(req);
  const layer = body.layer === "roles" || body.layer === "agents" ? body.layer : "capabilities";
  if (!body.capabilities?.capabilities?.length) return void res.status(400).json({ error: "capabilities are required" });
  const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
  const resp = await client.messages.create({
    model: model.id,
    max_tokens: 4096,
    system: ENRICH_LAYER_SYSTEM_PROMPT,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
    messages: [{ role: "user", content: renderEnrichLayerUserPrompt(layer, body.capabilities as never, body.roles as never, body.agents as never) }],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming);
  const text = resp.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
  const parsed = extractJsonObject(text) as { items?: unknown; sources?: unknown };
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const sources = Array.isArray(parsed.sources) ? (parsed.sources as unknown[]).filter((s): s is string => typeof s === "string") : [];
  const estCostUsd = estCost({ input: resp.usage.input_tokens ?? 0, output: resp.usage.output_tokens ?? 0, cacheRead: 0, cacheCreate: 0 }, model);
  res.status(200).json({ items, sources, model: model.id, usage: { input: resp.usage.input_tokens ?? 0, output: resp.usage.output_tokens ?? 0 }, estCostUsd, sessionSpendUsd: estCostUsd });
}
export const config = { maxDuration: 120 };
