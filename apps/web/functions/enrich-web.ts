import Anthropic from "@anthropic-ai/sdk";
import { ENRICH_WEB_SYSTEM_PROMPT, renderEnrichWebUserPrompt, coerceEnrichment, extractJsonObject } from "@vbd/skills";
import { requireClient, readBody, estCost, modelById, DEFAULT_MODEL, type Req, type Res } from "./_lib.ts";

export default async function handler(req: Req, res: Res): Promise<void> {
  const client = requireClient(req, res);
  if (!client) return;
  const body = readBody<{ capabilities?: unknown; domain?: { aggregates?: unknown[] }; model?: string; effort?: string }>(req);
  if (!body.domain?.aggregates?.length) return void res.status(400).json({ error: "domain with aggregates is required" });
  const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
  const resp = await client.messages.create({
    model: model.id,
    max_tokens: 4096,
    system: ENRICH_WEB_SYSTEM_PROMPT,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
    messages: [{ role: "user", content: renderEnrichWebUserPrompt((body.capabilities ?? { domain: "", capabilities: [] }) as never, body.domain as never) }],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming);
  const text = resp.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
  const parsed = extractJsonObject(text) as { sources?: unknown };
  const enrichment = coerceEnrichment(parsed, body.domain as never, model.id);
  const sources = Array.isArray(parsed.sources) ? (parsed.sources as unknown[]).filter((s): s is string => typeof s === "string") : [];
  const estCostUsd = estCost({ input: resp.usage.input_tokens ?? 0, output: resp.usage.output_tokens ?? 0, cacheRead: 0, cacheCreate: 0 }, model);
  res.status(200).json({ enrichment, sources, model: model.id, usage: { input: resp.usage.input_tokens ?? 0, output: resp.usage.output_tokens ?? 0 }, estCostUsd, sessionSpendUsd: estCostUsd });
}
export const config = { maxDuration: 120 };
