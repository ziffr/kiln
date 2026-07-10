/**
 * Shared server-only helpers for the Vercel serverless functions (deployment path). Mirrors
 * apps/service (the local dev server) but as stateless functions. The Anthropic key lives ONLY here,
 * read from the VBD_ANTHROPIC_API_KEY env var — it never reaches the browser (golden invariant #3).
 * Files prefixed `_` are NOT routed by Vercel.
 */

import Anthropic from "@anthropic-ai/sdk";
import { safeParseJson, type LlmProvider, type LlmRequest } from "@vbd/skills";

export interface ModelOption {
  id: string;
  label: string;
  supportsEffort: boolean;
  inPerM: number;
  outPerM: number;
}

// Pricing per the claude-api skill (2026-07); estimates only (authoritative billing is the Console).
export const MODELS: ModelOption[] = [
  { id: "claude-sonnet-5", label: "Sonnet 5", supportsEffort: true, inPerM: 2, outPerM: 10 },
  { id: "claude-opus-4-8", label: "Opus 4.8", supportsEffort: true, inPerM: 5, outPerM: 25 },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", supportsEffort: false, inPerM: 1, outPerM: 5 },
];
export const EFFORTS = ["low", "medium", "high", "max"] as const;
export const DEFAULT_MODEL = "claude-sonnet-5";
export const DEFAULT_EFFORT = "medium";
export const modelById = (id: string): ModelOption | undefined => MODELS.find((m) => m.id === id);
export const pickEffort = (e?: string): string => ((EFFORTS as readonly string[]).includes(e ?? "") ? (e as string) : DEFAULT_EFFORT);

export interface UsageAcc {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
}
export const newUsage = (): UsageAcc => ({ input: 0, output: 0, cacheRead: 0, cacheCreate: 0 });
export const round = (n: number, dp = 6): number => Math.round(n * 10 ** dp) / 10 ** dp;

/** Estimated USD for one call (cache-read at 0.1×, cache-create at 1.25× input). */
export function estCost(usage: UsageAcc, model: ModelOption): number {
  const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
  return round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
}

/** The Anthropic client, or null when the key is not configured on the server. */
export function anthropicClient(): Anthropic | null {
  const key = process.env.VBD_ANTHROPIC_API_KEY;
  return key ? new Anthropic({ apiKey: key }) : null;
}

/** Build an LlmProvider backed by the Anthropic SDK; accumulates token usage into `usage`. */
export function anthropicProvider(client: Anthropic, model: string, effort: string, supportsEffort: boolean, usage: UsageAcc): LlmProvider {
  return {
    name: `anthropic:${model}`,
    async complete(req: LlmRequest) {
      const outputConfig: Record<string, unknown> = {};
      if (req.schema) outputConfig.format = { type: "json_schema", schema: req.schema };
      if (supportsEffort && effort) outputConfig.effort = effort;
      const resp = await client.messages.create({
        model,
        max_tokens: 16000,
        system: req.system,
        messages: [{ role: "user" as const, content: req.user }],
        output_config: outputConfig,
      } as unknown as Anthropic.MessageCreateParamsNonStreaming);
      const u = resp.usage;
      usage.input += u.input_tokens ?? 0;
      usage.output += u.output_tokens ?? 0;
      usage.cacheRead += u.cache_read_input_tokens ?? 0;
      usage.cacheCreate += u.cache_creation_input_tokens ?? 0;
      const text = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      return { json: safeParseJson(text), raw: text, provider: `anthropic:${model}` };
    },
  };
}

// Minimal Vercel req/res shapes (avoid a hard dep on @vercel/node types).
export interface Req {
  method?: string;
  body?: unknown;
}
export interface Res {
  status: (code: number) => Res;
  json: (body: unknown) => void;
}

/** Vercel parses JSON bodies by default; tolerate a string body just in case. */
export function readBody<T>(req: Req): T {
  if (!req.body) return {} as T;
  return (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body) as T;
}

/** Guard used by every LLM function: require POST + a configured key. Returns the client or null. */
export function requireClient(req: Req, res: Res): Anthropic | null {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return null;
  }
  const client = anthropicClient();
  if (!client) {
    res.status(500).json({ error: "VBD_ANTHROPIC_API_KEY is not set on the server" });
    return null;
  }
  return client;
}
