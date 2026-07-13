import Anthropic from "@anthropic-ai/sdk";
import { buildCoachSystemPrompt, COACH_SCHEMA, safeParseJson, type CoachConfig } from "@kiln/skills";
import { requireClient, readBody, newUsage, round, modelById, pickEffort, DEFAULT_MODEL, type Req, type Res } from "./_lib.ts";

export default async function handler(req: Req, res: Res): Promise<void> {
  const client = requireClient(req, res);
  if (!client) return;
  const body = readBody<{ messages?: Array<{ role: "user" | "assistant"; content: string }>; model?: string; effort?: string; config?: CoachConfig }>(req);

  // The Messages API requires the first turn to be a user turn — drop any leading greeting.
  const all = Array.isArray(body.messages) ? body.messages : [];
  const firstUser = all.findIndex((m) => m.role === "user");
  const messages = firstUser >= 0 ? all.slice(firstUser) : [];
  if (messages.length === 0) return void res.status(400).json({ error: "at least one user message is required" });

  const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
  const effort = pickEffort(body.effort);
  const outputConfig: Record<string, unknown> = { format: { type: "json_schema", schema: COACH_SCHEMA } };
  if (model.supportsEffort && effort) outputConfig.effort = effort;

  const usage = newUsage();
  const resp = await client.messages.create({
    model: model.id,
    max_tokens: 16000,
    system: buildCoachSystemPrompt(body.config ?? {}),
    messages,
    output_config: outputConfig,
  } as unknown as Anthropic.MessageCreateParamsNonStreaming);
  usage.input += resp.usage.input_tokens ?? 0;
  usage.output += resp.usage.output_tokens ?? 0;
  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const parsed = (safeParseJson(text) as Record<string, unknown> | null) ?? {};
  const estCostUsd = round((usage.input * model.inPerM + usage.output * model.outPerM) / 1_000_000);

  res.status(200).json({
    reply: typeof parsed.reply === "string" ? parsed.reply : "",
    sectionsFilled: Array.isArray(parsed.sectionsFilled) ? parsed.sectionsFilled : [],
    readyToGenerate: Boolean(parsed.readyToGenerate),
    narrative: typeof parsed.narrative === "string" ? parsed.narrative : null,
    model: model.id,
    estCostUsd,
    sessionSpendUsd: estCostUsd,
  });
}

// Vercel: allow up to 60s for the model call(s).
export const config = { maxDuration: 60 };
