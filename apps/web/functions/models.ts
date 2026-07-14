import { MODELS, DEFAULT_MODEL, DEFAULT_EFFORT, DEFAULT_PROVIDER, EFFORTS, configuredProviders, providerById, providerConfigured, type Req, type Res } from "./_lib.ts";

export default function handler(_req: Req, res: Res): void {
  const available = configuredProviders();
  const defaultProvider = providerConfigured(DEFAULT_PROVIDER) ? DEFAULT_PROVIDER : (available[0]?.id ?? DEFAULT_PROVIDER);
  const dp = providerById(defaultProvider);
  res.status(200).json({
    // Provider-aware catalog: only engines whose key is set on the server (Anthropic first/preferred).
    providers: available.map((p) => ({ id: p.id, label: p.label, models: p.models, allowCustomModel: p.allowCustomModel, defaultModel: p.defaultModel, note: p.note })),
    defaultProvider,
    // Back-compat: `models` = the default provider's models (older clients read this field).
    models: dp?.models ?? MODELS,
    defaultModel: dp?.defaultModel ?? DEFAULT_MODEL,
    defaultEffort: DEFAULT_EFFORT,
    efforts: EFFORTS,
    ready: available.length > 0,
  });
}
