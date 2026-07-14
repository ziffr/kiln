/**
 * Provider + model catalog for the in-app selector (ADR-004).
 *
 * Kiln is Anthropic-first (the default, preferred engine), but as an open-source tool it also lets
 * you route generation through OpenAI-compatible gateways — **OpenRouter** (hosted aggregator) and
 * **omniroute** (self-hosted local proxy). Both speak the OpenAI `/v1/chat/completions` shape, so a
 * SINGLE adapter serves them (see providers/openaiCompatible.ts); only the base URL + key differ.
 *
 * Effort support is per-model: Anthropic's `output_config.effort` is GA on Sonnet 5 / Opus 4.x but
 * ERRORS on Haiku 4.5; on the OpenAI-compatible path effort maps to `reasoning_effort`, which only
 * some models accept — so `supportsEffort` is coupled to the model (claude-api skill, Thinking & Effort).
 *
 * WHICH providers are *available* is decided at runtime by which env keys are set (server.ts). This
 * file is the static catalog; the server filters it to the configured providers for /api/models.
 */

export type ProviderId = "anthropic" | "openrouter" | "omniroute";

export interface ModelOption {
  id: string;
  label: string;
  /** Which provider serves this model — selects the adapter (Anthropic SDK vs OpenAI-compatible). */
  provider: ProviderId;
  supportsEffort: boolean;
  /** USD per 1M tokens (input / output) — for in-app spend estimates, NOT billing truth. 0 = unknown
   *  (non-Anthropic gateways price per underlying model; we don't track that → estimate shows n/a). */
  inPerM: number;
  outPerM: number;
}

export interface ProviderCatalog {
  id: ProviderId;
  label: string;
  /** Wire dialect: "anthropic" → @anthropic-ai/sdk; "openai" → OpenAI-compatible /v1/chat/completions. */
  kind: "anthropic" | "openai";
  models: ModelOption[];
  /** Whether the UI offers a free-text model id (gateways expose far more models than we curate). */
  allowCustomModel: boolean;
  defaultModel: string;
  /** Shown under the provider in the selector. */
  note?: string;
}

// Pricing per the claude-api skill (2026-07). Sonnet 5 shows the intro rate active through 2026-08-31
// ($2/$10; standard $3/$15). These drive an ESTIMATE — the authoritative number (and remaining credit)
// lives only in the Anthropic Console.
const ANTHROPIC_MODELS: ModelOption[] = [
  { id: "claude-sonnet-5", label: "Sonnet 5", provider: "anthropic", supportsEffort: true, inPerM: 2, outPerM: 10 },
  { id: "claude-opus-4-8", label: "Opus 4.8", provider: "anthropic", supportsEffort: true, inPerM: 5, outPerM: 25 },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", provider: "anthropic", supportsEffort: false, inPerM: 1, outPerM: 5 },
];

// A small curated shortlist of well-known OpenRouter slugs — sensible defaults, NOT an exhaustive set.
// Slugs drift over time, so the UI also offers a free-text box (allowCustomModel) for any current slug
// from https://openrouter.ai/models. Only reasoning models carry supportsEffort; the OpenAI-compatible
// adapter degrades gracefully if a provider rejects `reasoning_effort` anyway.
const OPENROUTER_MODELS: ModelOption[] = [
  { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5 (OpenRouter)", provider: "openrouter", supportsEffort: true, inPerM: 0, outPerM: 0 },
  { id: "openai/gpt-5", label: "GPT-5 (OpenRouter)", provider: "openrouter", supportsEffort: true, inPerM: 0, outPerM: 0 },
  { id: "openai/gpt-4o", label: "GPT-4o (OpenRouter)", provider: "openrouter", supportsEffort: false, inPerM: 0, outPerM: 0 },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (OpenRouter)", provider: "openrouter", supportsEffort: false, inPerM: 0, outPerM: 0 },
  { id: "deepseek/deepseek-chat", label: "DeepSeek V3 (OpenRouter)", provider: "openrouter", supportsEffort: false, inPerM: 0, outPerM: 0 },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B (OpenRouter)", provider: "openrouter", supportsEffort: false, inPerM: 0, outPerM: 0 },
];

// omniroute routes dynamically against whatever providers YOU connected in its dashboard, so the useful
// "models" are its routing aliases (auto*) plus provider-prefixed ids. Free-text covers the rest.
const OMNIROUTE_MODELS: ModelOption[] = [
  { id: "auto", label: "Auto (best available)", provider: "omniroute", supportsEffort: false, inPerM: 0, outPerM: 0 },
  { id: "auto/coding", label: "Auto · coding", provider: "omniroute", supportsEffort: false, inPerM: 0, outPerM: 0 },
  { id: "auto/fast", label: "Auto · fast", provider: "omniroute", supportsEffort: false, inPerM: 0, outPerM: 0 },
  { id: "auto/cheap", label: "Auto · cheap", provider: "omniroute", supportsEffort: false, inPerM: 0, outPerM: 0 },
];

export const PROVIDERS: ProviderCatalog[] = [
  {
    id: "anthropic",
    label: "Anthropic (recommended)",
    kind: "anthropic",
    models: ANTHROPIC_MODELS,
    allowCustomModel: false,
    defaultModel: "claude-sonnet-5",
    note: "Kiln's default engine — best structured-output + effort support.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai",
    models: OPENROUTER_MODELS,
    allowCustomModel: true,
    defaultModel: "anthropic/claude-sonnet-4.5",
    note: "Hosted gateway to 250+ models. Any slug from openrouter.ai/models works.",
  },
  {
    id: "omniroute",
    label: "omniroute (self-hosted)",
    kind: "openai",
    models: OMNIROUTE_MODELS,
    allowCustomModel: true,
    defaultModel: "auto",
    note: "Local proxy (default localhost:20128). Connect providers in its dashboard first.",
  },
];

// The full flat list (all providers) — kept for cross-provider lookup + back-compat with older callers.
export const MODELS: ModelOption[] = PROVIDERS.flatMap((p) => p.models);

export const EFFORTS = ["low", "medium", "high", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

export const DEFAULT_PROVIDER: ProviderId = "anthropic";
// "sonnet medium" — the requested default.
export const DEFAULT_MODEL = "claude-sonnet-5";
export const DEFAULT_EFFORT: Effort = "medium";

export function providerById(id: string | undefined): ProviderCatalog | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** Look a model up across every provider's catalog (ids are globally unique). */
export function modelById(id: string): ModelOption | undefined {
  return MODELS.find((m) => m.id === id);
}

/**
 * Resolve a { provider, model } request into a concrete ModelOption, tolerating free-text model ids
 * on gateways that allow them. Falls back to the provider's (or global) default when unknown. Pure.
 */
export function resolveModelOption(req: { provider?: string; model?: string }): ModelOption {
  const provider = providerById(req.provider) ?? providerById(DEFAULT_PROVIDER)!;
  const wanted = req.model?.trim();
  if (wanted) {
    const inProvider = provider.models.find((m) => m.id === wanted);
    if (inProvider) return inProvider;
    // A model id that belongs to a *different* provider (e.g. no explicit provider sent) — honour it.
    const anywhere = req.provider ? undefined : modelById(wanted);
    if (anywhere) return anywhere;
    // Free-text slug on a gateway that allows it: synthesize an option (unknown pricing/effort).
    if (provider.allowCustomModel) {
      return { id: wanted, label: wanted, provider: provider.id, supportsEffort: true, inPerM: 0, outPerM: 0 };
    }
  }
  return provider.models.find((m) => m.id === provider.defaultModel) ?? provider.models[0];
}
