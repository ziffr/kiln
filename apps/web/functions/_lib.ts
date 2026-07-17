/**
 * Shared server-only helpers for the Vercel serverless functions (deployment path). Mirrors
 * apps/service (the local dev server) but as stateless functions. The Anthropic key lives ONLY here,
 * read from the KILN_ANTHROPIC_API_KEY env var — it never reaches the browser (golden invariant #3).
 * Files prefixed `_` are NOT routed by Vercel.
 */

import Anthropic from "@anthropic-ai/sdk";
import { safeParseJson, type LlmProvider, type LlmRequest } from "@kiln/skills";

export type ProviderId = "anthropic" | "openrouter" | "omniroute";

export interface ModelOption {
  id: string;
  label: string;
  provider: ProviderId;
  supportsEffort: boolean;
  inPerM: number;
  outPerM: number;
}

export interface ProviderCatalog {
  id: ProviderId;
  label: string;
  kind: "anthropic" | "openai";
  models: ModelOption[];
  allowCustomModel: boolean;
  defaultModel: string;
  note?: string;
}

// Provider catalog — MIRRORS apps/service/src/models.ts (the functions are a self-contained deploy mirror
// of the local service). Anthropic stays default/preferred; OpenRouter + omniroute are OpenAI-compatible
// gateways, selectable when their key is set on the server. Pricing is Anthropic-only estimates (0 = n/a).
const ANTHROPIC_MODELS: ModelOption[] = [
  { id: "claude-sonnet-5", label: "Sonnet 5", provider: "anthropic", supportsEffort: true, inPerM: 2, outPerM: 10 },
  { id: "claude-opus-4-8", label: "Opus 4.8", provider: "anthropic", supportsEffort: true, inPerM: 5, outPerM: 25 },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", provider: "anthropic", supportsEffort: false, inPerM: 1, outPerM: 5 },
];
const OPENROUTER_MODELS: ModelOption[] = [
  { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5 (OpenRouter)", provider: "openrouter", supportsEffort: true, inPerM: 0, outPerM: 0 },
  { id: "openai/gpt-5", label: "GPT-5 (OpenRouter)", provider: "openrouter", supportsEffort: true, inPerM: 0, outPerM: 0 },
  { id: "openai/gpt-4o", label: "GPT-4o (OpenRouter)", provider: "openrouter", supportsEffort: false, inPerM: 0, outPerM: 0 },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (OpenRouter)", provider: "openrouter", supportsEffort: false, inPerM: 0, outPerM: 0 },
  { id: "deepseek/deepseek-chat", label: "DeepSeek V3 (OpenRouter)", provider: "openrouter", supportsEffort: false, inPerM: 0, outPerM: 0 },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B (OpenRouter)", provider: "openrouter", supportsEffort: false, inPerM: 0, outPerM: 0 },
];
const OMNIROUTE_MODELS: ModelOption[] = [
  { id: "auto", label: "Auto (best available)", provider: "omniroute", supportsEffort: false, inPerM: 0, outPerM: 0 },
  { id: "auto/coding", label: "Auto · coding", provider: "omniroute", supportsEffort: false, inPerM: 0, outPerM: 0 },
  { id: "auto/fast", label: "Auto · fast", provider: "omniroute", supportsEffort: false, inPerM: 0, outPerM: 0 },
  { id: "auto/cheap", label: "Auto · cheap", provider: "omniroute", supportsEffort: false, inPerM: 0, outPerM: 0 },
];

export const PROVIDERS: ProviderCatalog[] = [
  { id: "anthropic", label: "Anthropic (recommended)", kind: "anthropic", models: ANTHROPIC_MODELS, allowCustomModel: false, defaultModel: "claude-sonnet-5", note: "Kiln's default engine — best structured-output + effort support." },
  { id: "openrouter", label: "OpenRouter", kind: "openai", models: OPENROUTER_MODELS, allowCustomModel: true, defaultModel: "anthropic/claude-sonnet-4.5", note: "Hosted gateway to 250+ models. Any slug from openrouter.ai/models works." },
  { id: "omniroute", label: "omniroute (self-hosted)", kind: "openai", models: OMNIROUTE_MODELS, allowCustomModel: true, defaultModel: "auto", note: "Local proxy (default localhost:20128). Connect providers in its dashboard first." },
];

export const MODELS: ModelOption[] = PROVIDERS.flatMap((p) => p.models);
export const EFFORTS = ["low", "medium", "high", "max"] as const;
export const DEFAULT_PROVIDER: ProviderId = "anthropic";
export const DEFAULT_MODEL = "claude-sonnet-5";
export const DEFAULT_EFFORT = "medium";
export const providerById = (id: string | undefined): ProviderCatalog | undefined => PROVIDERS.find((p) => p.id === id);
/** Look a model up across every provider's catalog (ids are globally unique). */
export const modelById = (id: string): ModelOption | undefined => MODELS.find((m) => m.id === id);
export const pickEffort = (e?: string): string => ((EFFORTS as readonly string[]).includes(e ?? "") ? (e as string) : DEFAULT_EFFORT);
/** Force an Anthropic model — for the Anthropic-only endpoints (coach + web-search enrichment). */
export const anthropicModel = (id?: string): ModelOption => {
  const opt = id ? modelById(id) : undefined;
  return opt && opt.provider === "anthropic" ? opt : modelById(DEFAULT_MODEL)!;
};

/** Which gateway engines have a key set on the server (Anthropic handled separately via anthropicClient). */
export function openrouterCfg(): { apiKey: string; baseUrl: string } | null {
  const apiKey = process.env.KILN_OPENROUTER_API_KEY;
  return apiKey ? { apiKey, baseUrl: process.env.KILN_OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1" } : null;
}
export function omnirouteCfg(): { apiKey: string; baseUrl: string } | null {
  const apiKey = process.env.KILN_OMNIROUTE_API_KEY;
  return apiKey ? { apiKey, baseUrl: process.env.KILN_OMNIROUTE_BASE_URL ?? "http://localhost:20128/v1" } : null;
}
export function providerConfigured(id: ProviderId): boolean {
  if (id === "anthropic") return Boolean(anthropicClient());
  if (id === "openrouter") return Boolean(openrouterCfg());
  if (id === "omniroute") return Boolean(omnirouteCfg());
  return false;
}
/** The provider catalog narrowed to engines whose key is set (Anthropic first/preferred). */
export function configuredProviders(): ProviderCatalog[] {
  return PROVIDERS.filter((p) => providerConfigured(p.id));
}

/** Resolve a { provider, model } request → a concrete ModelOption (mirrors apps/service resolveModelOption). */
export function resolveModelOption(req: { provider?: string; model?: string }): ModelOption {
  const provider = providerById(req.provider) ?? providerById(DEFAULT_PROVIDER)!;
  const wanted = req.model?.trim();
  if (wanted) {
    const inProvider = provider.models.find((m) => m.id === wanted);
    if (inProvider) return inProvider;
    const anywhere = req.provider ? undefined : modelById(wanted);
    if (anywhere) return anywhere;
    if (provider.allowCustomModel) return { id: wanted, label: wanted, provider: provider.id, supportsEffort: true, inPerM: 0, outPerM: 0 };
  }
  return provider.models.find((m) => m.id === provider.defaultModel) ?? provider.models[0];
}

/** Resolve a request's { provider, model } → a ModelOption, falling back to a *configured* provider so a
 *  request never dead-ends (mirrors apps/service resolveModel). Used by the engine-aware endpoints. */
export function resolveModel(body: { provider?: string; model?: string }): ModelOption {
  if (body.provider && providerConfigured(body.provider as ProviderId)) {
    const opt = resolveModelOption({ provider: body.provider, model: body.model });
    if (providerConfigured(opt.provider)) return opt;
  }
  if (body.model) {
    const found = modelById(body.model);
    if (found && providerConfigured(found.provider)) return found;
  }
  const dp = configuredProviders()[0]?.id ?? DEFAULT_PROVIDER;
  return resolveModelOption({ provider: dp });
}

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

/** The LLM client, or null when no key is configured. Langdock (Bearer + its Anthropic-native base URL)
 *  takes precedence when set — same SDK, EU-resident governed gateway; else Anthropic direct (x-api-key). */
export function anthropicClient(): Anthropic | null {
  const langdock = process.env.KILN_LANGDOCK_API_KEY;
  if (langdock) {
    const baseURL = process.env.KILN_LANGDOCK_BASE_URL ?? "https://api.langdock.com/anthropic/eu/v1";
    return new Anthropic({ authToken: langdock, baseURL });
  }
  const key = process.env.KILN_ANTHROPIC_API_KEY ?? process.env.VBD_ANTHROPIC_API_KEY; // VBD_ = legacy alias; keeps existing hosting env working
  return key ? new Anthropic({ apiKey: key }) : null;
}
/** Which provider the client is pointed at — tags usage/spend for visibility. */
export function providerLabel(): string {
  return process.env.KILN_LANGDOCK_API_KEY ? "langdock" : "anthropic";
}

/** OpenAI-compatible adapter (OpenRouter / omniroute) — dependency-free fetch; mirrors
 *  apps/service/src/providers/openaiCompatible.ts. schema→response_format, effort→reasoning_effort,
 *  degrade once on a 400 (drop both) → repair-parse. */
export function openAiCompatibleProvider(
  cfg: { apiKey: string; baseUrl: string; label: string },
  model: string,
  effort: string,
  supportsEffort: boolean,
  usage: UsageAcc,
): LlmProvider {
  const url = `${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const name = `${cfg.label}:${model}`;
  const buildBody = (withStructured: boolean, req: LlmRequest): Record<string, unknown> => {
    const system = req.schema ? `${req.system}\n\nRespond with a single valid JSON object only — no prose, no markdown fences.` : req.system;
    const body: Record<string, unknown> = { model, max_tokens: 16000, messages: [{ role: "system", content: system }, { role: "user", content: req.user }] };
    if (withStructured && req.schema) body.response_format = { type: "json_schema", json_schema: { name: "kiln_output", strict: true, schema: req.schema } };
    if (withStructured && supportsEffort && effort) body.reasoning_effort = effort === "max" ? "high" : effort;
    return body;
  };
  const post = (body: Record<string, unknown>): Promise<Response> =>
    fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}`, "HTTP-Referer": "https://kilnstudio.app", "X-Title": "Kiln Studio" }, body: JSON.stringify(body) });
  return {
    name,
    async complete(req: LlmRequest) {
      let resp = await post(buildBody(true, req));
      if (resp.status === 400) resp = await post(buildBody(false, req));
      if (!resp.ok) throw new Error(`${cfg.label} request failed (${resp.status}): ${(await resp.text().catch(() => "")).slice(0, 500)}`);
      const json = (await resp.json()) as { usage?: { prompt_tokens?: number; completion_tokens?: number }; choices?: Array<{ message?: { content?: unknown } }> };
      usage.input += json.usage?.prompt_tokens ?? 0;
      usage.output += json.usage?.completion_tokens ?? 0;
      const content = json.choices?.[0]?.message?.content;
      const text = (typeof content === "string" ? content : Array.isArray(content) ? content.map((p) => (typeof p === "string" ? p : String((p as { text?: unknown }).text ?? ""))).join("") : "").trim();
      return { json: safeParseJson(text), raw: text, provider: name };
    },
  };
}

/**
 * Build the right LlmProvider for a model, dispatching by the model's provider. Exported (and aliased as
 * `anthropicProvider`) so the handler call sites — `anthropicProvider(client, model.id, …)` — are unchanged:
 * catalog model ids are globally unique, so we look the provider up by id. `client` is the Anthropic client
 * (from requireClient) used only for Anthropic models; gateway models ignore it and use their own key.
 */
export function makeProvider(client: Anthropic | null, modelId: string, effort: string, supportsEffort: boolean, usage: UsageAcc, promptOverride?: string): LlmProvider {
  const provider = modelById(modelId)?.provider ?? "anthropic";
  const or = openrouterCfg();
  const om = omnirouteCfg();
  let base: LlmProvider;
  if (provider === "openrouter" && or) base = openAiCompatibleProvider({ ...or, label: "openrouter" }, modelId, effort, supportsEffort, usage);
  else if (provider === "omniroute" && om) base = openAiCompatibleProvider({ ...om, label: "omniroute" }, modelId, effort, supportsEffort, usage);
  else if (client) base = anthropicOnlyProvider(client, modelId, effort, supportsEffort, usage);
  else throw new Error(`engine "${provider}" is not configured on the server`);
  return withPromptOverride(base, promptOverride);
}

/** Swap a provider's system prompt for a session-only override (Prompt & Output studio). Correctness is
 *  unaffected; the override only defeats the ephemeral prompt-cache read for that one call. Empty → no-op. */
export function withPromptOverride(provider: LlmProvider, override?: string): LlmProvider {
  const system = typeof override === "string" ? override.trim() : "";
  if (!system) return provider;
  return { name: provider.name, complete: (req: LlmRequest) => provider.complete({ ...req, system }) };
}
/** Back-compat alias: handlers import `anthropicProvider`; it now dispatches by the model's provider. */
export const anthropicProvider = makeProvider;

/** Build an LlmProvider backed by the Anthropic SDK; accumulates token usage into `usage`. */
export function anthropicOnlyProvider(client: Anthropic, model: string, effort: string, supportsEffort: boolean, usage: UsageAcc): LlmProvider {
  const label = providerLabel();
  return {
    name: `${label}:${model}`,
    async complete(req: LlmRequest) {
      const outputConfig: Record<string, unknown> = {};
      if (req.schema) outputConfig.format = { type: "json_schema", schema: req.schema };
      if (supportsEffort && effort) outputConfig.effort = effort;
      const params = {
        model,
        max_tokens: 16000,
        // Cache the stable system prompt so re-review/refine reuse it from cache (prompt-caching).
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user" as const, content: req.user }],
        output_config: outputConfig,
      };
      const create = (p: unknown) => client.messages.create(p as Anthropic.MessageCreateParamsNonStreaming);
      let resp;
      try {
        resp = await create(params);
      } catch (err) {
        // Langdock output_config passthrough is unverified (no test-tier key) → degrade gracefully:
        // only on the Langdock path, only a 400, only when output_config was sent → retry without it.
        const status = (err as { status?: number } | null)?.status;
        if (label === "langdock" && status === 400 && Object.keys(outputConfig).length > 0) {
          const { output_config: _drop, ...rest } = params;
          resp = await create(rest);
        } else {
          throw err;
        }
      }
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
      return { json: safeParseJson(text), raw: text, provider: `${label}:${model}` };
    },
  };
}

// Minimal Vercel req/res shapes (avoid a hard dep on @vercel/node types).
export interface Req {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
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

/**
 * Optional "studio" lock. If KILN_STUDIO_TOKEN is set on the server (a hosted, keyed instance you don't
 * want the public spending), every LLM call must carry a matching `x-kiln-token` header — otherwise 401.
 * Unset (local dev, or the public keyless demo) → no lock. Keeps a keyed hosted Kiln safe on any plan.
 */
export function studioLocked(req: Req, res: Res): boolean {
  const gate = process.env.KILN_STUDIO_TOKEN;
  if (!gate) return false;
  const sent = req.headers?.["x-kiln-token"];
  const token = Array.isArray(sent) ? sent[0] : sent;
  if (token === gate) return false;
  res.status(401).json({ error: "This Kiln studio is locked — enter the passphrase.", locked: true });
  return true;
}

/** Guard used by every LLM function: require POST + (optional) the studio token + a configured key. */
export function requireClient(req: Req, res: Res): Anthropic | null {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return null;
  }
  if (studioLocked(req, res)) return null;
  const client = anthropicClient();
  if (!client) {
    res.status(500).json({ error: "KILN_ANTHROPIC_API_KEY is not set on the server" });
    return null;
  }
  return client;
}
