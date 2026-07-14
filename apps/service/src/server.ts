/**
 * @kiln/service — the server-side API (ADR-003 §4, ADR-004). Holds the Anthropic key
 * (KILN_ANTHROPIC_API_KEY, loaded via `node --env-file`), NEVER exposes it to the browser.
 * Uses the official @anthropic-ai/sdk (the project is TypeScript → SDK, not raw HTTP).
 *
 * Endpoints:
 *   GET  /api/models    → model catalog + defaults for the in-app selector
 *   POST /api/generate  → { narrative, model?, effort? } → generated capabilities + findings
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { parseNarrative } from "@kiln/narrative";
import {
  generateCapabilities,
  generateDomain,
  enrichDomain,
  type EnrichDepth,
  generateCommunications,
  generateIntegrations,
  generateContexts,
  critiqueContexts,
  critiqueLayer,
  generateAppLogic,
  generateComponents,
  polishComponents,
  reviewGeneratedCode,
  CRITIQUE_EFFORT,
  type LayerKind,
  type ReviewModel,
  generateEvents,
  generatePolicies,
  generateRoles,
  generateWorkflows,
  generateAgents,
  generateOrchestration,
  generateExternalServices,
  translateMessages,
  structureNarrative,
  syncNarrative,
  ENRICH_WEB_SYSTEM_PROMPT,
  ENRICH_LAYER_SYSTEM_PROMPT,
  renderEnrichWebUserPrompt,
  renderEnrichLayerUserPrompt,
  coerceEnrichment,
  extractJsonObject,
  safeParseJson,
  buildCoachSystemPrompt,
  COACH_SCHEMA,
  type CoachConfig,
  type LlmProvider,
  type LlmRequest,
} from "@kiln/skills";
import type { CapabilityDoc, DomainDoc } from "@kiln/compiler";
import {
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  EFFORTS,
  MODELS,
  PROVIDERS,
  modelById,
  providerById,
  resolveModelOption,
  type ModelOption,
  type ProviderCatalog,
} from "./models.ts";
import { openAiCompatibleProvider, type OpenAiCompatConfig } from "./providers/openaiCompatible.ts";
import { startRun, getRun, stopRun, runClientHtml } from "./run.ts";
import { deleteProject, listProjects, projectDir, saveProject, type StoredProject } from "./workspaces.ts";
import { commitWorkspace, listVersions, showFileAt } from "./workspaceGit.ts";

const PORT = Number(process.env.PORT ?? 8787);
const API_KEY = process.env.KILN_ANTHROPIC_API_KEY ?? process.env.VBD_ANTHROPIC_API_KEY; // VBD_ = legacy alias (pre-Kiln); accepted so existing .env / hosting envs keep working
// Optional LLM provider: Langdock (an EU-resident, governed, multi-provider gateway) exposes an
// Anthropic-NATIVE Messages endpoint, so the same @anthropic-ai/sdk works by swapping the base URL +
// Bearer auth — no request-code change (same messages.create, tools, output_config). Set the key to
// route generation through it instead of the Anthropic API directly (takes precedence over the Anthropic
// key). output_config passthrough is unverified against a live key → the provider degrades gracefully.
const LANGDOCK_KEY = process.env.KILN_LANGDOCK_API_KEY;
const LANGDOCK_BASE_URL = process.env.KILN_LANGDOCK_BASE_URL ?? "https://api.langdock.com/anthropic/eu/v1";
// Open-source alternative engines: OpenAI-compatible gateways (OpenRouter hosted / omniroute self-hosted).
// A provider is *available* iff its key is set. Anthropic stays the default/preferred engine either way.
// The key lives only here (server-side); the browser only ever names the provider/model, never the key.
const OPENROUTER_KEY = process.env.KILN_OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = process.env.KILN_OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const OMNIROUTE_KEY = process.env.KILN_OMNIROUTE_API_KEY;
const OMNIROUTE_BASE_URL = process.env.KILN_OMNIROUTE_BASE_URL ?? "http://localhost:20128/v1";

// Structured-output schemas now live in @kiln/skills (CAPABILITY_SCHEMA / DOMAIN_SCHEMA) and travel
// on each LlmRequest's `schema` field; the provider reads req.schema.

interface UsageAcc {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
}

// Process-lifetime running total of estimated spend (reset when the service restarts).
let sessionSpendUsd = 0;

const round = (n: number, dp = 6): number => Math.round(n * 10 ** dp) / 10 ** dp;

/** Build an LlmProvider backed by the Anthropic SDK; accumulates token usage into `usage`. */
function anthropicProvider(
  client: Anthropic,
  model: string,
  effort: string,
  supportsEffort: boolean,
  usage: UsageAcc,
): LlmProvider {
  return {
    name: `${PROVIDER_LABEL}:${model}`,
    async complete(req: LlmRequest) {
      const outputConfig: Record<string, unknown> = {};
      // The request carries its own structured-output schema (capability vs domain vs …).
      if (req.schema) outputConfig.format = { type: "json_schema", schema: req.schema };
      // effort is GA on Sonnet 5 / Opus 4.x; omit on Haiku 4.5 (it errors there).
      if (supportsEffort && effort) outputConfig.effort = effort;

      const params = {
        model,
        max_tokens: 16000, // leave room for adaptive thinking (Sonnet 5 default) + JSON output
        // Cache the (stable) system prompt: re-review + refine reuse the same system per layer, so
        // repeat calls read it from cache (~0.1× input) instead of re-billing it (prompt-caching).
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user" as const, content: req.user }],
        output_config: outputConfig,
      };

      const create = (p: unknown) => client.messages.create(p as Anthropic.MessageCreateParamsNonStreaming);
      let resp;
      try {
        resp = await create(params);
      } catch (err) {
        // We can't verify (no test-tier key) whether the Langdock gateway forwards the newest
        // `output_config` (effort + structured `format`). So degrade gracefully: ONLY on the Langdock
        // path, ONLY on a 400, ONLY when we actually sent an output_config → retry once without it
        // (structured output then falls back to the caller's repair-parse of `json`). The SDK already
        // retries 429/5xx; a real Anthropic-path 400 still surfaces.
        const status = (err as { status?: number } | null)?.status;
        if (PROVIDER_LABEL === "langdock" && status === 400 && Object.keys(outputConfig).length > 0) {
          const { output_config: _drop, ...rest } = params;
          console.warn("[kiln] Langdock rejected output_config; retrying without it (JSON → repair-parse).");
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
      return { json: safeParseJson(text), raw: text, provider: `${PROVIDER_LABEL}:${model}` };
    },
  };
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// Anthropic seam: Langdock (Bearer + its Anthropic-native base URL) if configured, else Anthropic direct
// (x-api-key). Same SDK, same call surface either way; PROVIDER_LABEL tags usage/spend for visibility.
// `client` is the Anthropic-capable client; web-search + coach endpoints use it directly (Anthropic-only).
const PROVIDER_LABEL = LANGDOCK_KEY ? "langdock" : "anthropic";
const client = LANGDOCK_KEY
  ? new Anthropic({ authToken: LANGDOCK_KEY, baseURL: LANGDOCK_BASE_URL })
  : API_KEY
    ? new Anthropic({ apiKey: API_KEY })
    : null;
if (LANGDOCK_KEY) console.log(`[kiln] LLM provider: Langdock (${LANGDOCK_BASE_URL})`);

// OpenAI-compatible gateway configs (open-source alternative engines). null = not configured.
const openrouterCfg: OpenAiCompatConfig | null = OPENROUTER_KEY
  ? { label: "openrouter", apiKey: OPENROUTER_KEY, baseUrl: OPENROUTER_BASE_URL, headers: { "HTTP-Referer": "https://kilnstudio.app", "X-Title": "Kiln Studio" } }
  : null;
const omnirouteCfg: OpenAiCompatConfig | null = OMNIROUTE_KEY
  ? { label: "omniroute", apiKey: OMNIROUTE_KEY, baseUrl: OMNIROUTE_BASE_URL }
  : null;
if (openrouterCfg) console.log(`[kiln] LLM provider available: OpenRouter (${OPENROUTER_BASE_URL})`);
if (omnirouteCfg) console.log(`[kiln] LLM provider available: omniroute (${OMNIROUTE_BASE_URL})`);

/** Is a given provider id backed by a configured key right now? */
function providerReady(id: string): boolean {
  if (id === "anthropic") return Boolean(client);
  if (id === "openrouter") return Boolean(openrouterCfg);
  if (id === "omniroute") return Boolean(omnirouteCfg);
  return false;
}

// At least one engine configured? Generic (provider-agnostic) endpoints guard on this; the three
// Anthropic-only endpoints (coach, enrich-web, enrich-layer) still guard on `client` specifically.
const llmReady = Boolean(client) || Boolean(openrouterCfg) || Boolean(omnirouteCfg);
const NO_LLM = "No LLM engine configured on the server (set KILN_ANTHROPIC_API_KEY, or KILN_OPENROUTER_API_KEY / KILN_OMNIROUTE_API_KEY for the open-source engines).";

// Providers the UI may offer = catalog entries whose key is set. Anthropic stays first (preferred).
const availableProviders: ProviderCatalog[] = PROVIDERS.filter((p) => providerReady(p.id));
const defaultProvider = providerReady(DEFAULT_PROVIDER) ? DEFAULT_PROVIDER : (availableProviders[0]?.id ?? DEFAULT_PROVIDER);

/**
 * Resolve a request's { provider, model } → a concrete ModelOption, falling back to a *configured*
 * provider if the requested one isn't available (so the app never dead-ends). Anthropic preferred.
 */
function resolveModel(body: { provider?: string; model?: string }): ModelOption {
  // 1. An explicit, configured provider wins (this path also honours free-text/custom model ids).
  if (body.provider && providerReady(body.provider)) {
    const opt = resolveModelOption({ provider: body.provider, model: body.model });
    if (providerReady(opt.provider)) return opt;
  }
  // 2. Model id alone → find its provider across the configured catalogs (ids are globally unique),
  //    so the browser can route just by picking a model without also naming the engine.
  if (body.model) {
    const found = modelById(body.model);
    if (found && providerReady(found.provider)) return found;
  }
  // 3. Fall back to the default configured provider's default model.
  return resolveModelOption({ provider: defaultProvider });
}

/** Force an Anthropic model (for the Anthropic-only endpoints: coach + web-search enrichment). */
function anthropicModel(id: string | undefined): ModelOption {
  const opt = id ? modelById(id) : undefined;
  return opt && opt.provider === "anthropic" ? opt : modelById(DEFAULT_MODEL)!;
}

/** Dispatch a ModelOption to its provider adapter (Anthropic SDK vs OpenAI-compatible gateway). */
function makeProvider(model: ModelOption, effort: string, usage: UsageAcc): LlmProvider {
  if (model.provider === "openrouter" && openrouterCfg) return openAiCompatibleProvider(openrouterCfg, model.id, effort, model.supportsEffort, usage);
  if (model.provider === "omniroute" && omnirouteCfg) return openAiCompatibleProvider(omnirouteCfg, model.id, effort, model.supportsEffort, usage);
  if (model.provider === "anthropic" && client) return anthropicProvider(client, model.id, effort, model.supportsEffort, usage);
  throw new Error(`${NO_LLM} (requested engine "${model.provider}" is not configured)`);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return send(res, 204, {});

    // ---- Local "Run app" sandbox: boot the generated zero-dep app + serve a live preview page. ----
    // POST /api/run { files } → spawn node server.mjs on a free port; returns a UI url to open in a tab.
    if (req.method === "POST" && req.url === "/api/run") {
      const body = JSON.parse((await readBody(req)) || "{}") as { files?: Record<string, string>; views?: Record<string, unknown> };
      if (!body.files || typeof body.files !== "object") return send(res, 400, { error: "files (the generated app) are required" });
      const origin = `http://${req.headers.host ?? `localhost:${PORT}`}`;
      const started = await startRun(body.files, origin, body.views ?? {});
      return send(res, 200, started);
    }
    // POST /api/run/<id>/stop → kill the sandbox + clean its temp dir.
    if (req.method === "POST" && req.url?.startsWith("/api/run/") && req.url.endsWith("/stop")) {
      const id = req.url.slice("/api/run/".length, -"/stop".length);
      return send(res, 200, { stopped: stopRun(id) });
    }
    // GET /run/<id>/ → the dependency-free admin preview for that sandbox (talks to its API port).
    if (req.method === "GET" && req.url?.startsWith("/run/")) {
      const id = req.url.slice("/run/".length).replace(/\/.*$/, "");
      const run = getRun(id);
      if (!run) {
        res.writeHead(404, { "content-type": "text/html" });
        return res.end("<h1>Run not found</h1><p>The preview may have been stopped. Re-run from Studio.</p>");
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(runClientHtml(run.model, `http://localhost:${run.port}`, run.views));
    }

    if (req.method === "GET" && req.url === "/api/models") {
      const dp = providerById(defaultProvider);
      return send(res, 200, {
        // Provider-aware catalog: only engines whose key is set on the server (Anthropic first/preferred).
        providers: availableProviders.map((p) => ({
          id: p.id,
          label: p.label,
          models: p.models,
          allowCustomModel: p.allowCustomModel,
          defaultModel: p.defaultModel,
          note: p.note,
        })),
        defaultProvider,
        // Back-compat: `models` = the default provider's models (older clients read this field).
        models: dp?.models ?? MODELS,
        defaultModel: dp?.defaultModel ?? DEFAULT_MODEL,
        defaultEffort: DEFAULT_EFFORT,
        efforts: EFFORTS,
        ready: llmReady,
      });
    }

    if (req.method === "POST" && req.url === "/api/generate") {
      if (!llmReady) {
        return send(res, 500, { error: NO_LLM });
      }
      const body = JSON.parse((await readBody(req)) || "{}") as {
        narrative?: string;
        model?: string;
        effort?: string;
      };
      if (!body.narrative || !body.narrative.trim()) {
        return send(res, 400, { error: "narrative is required" });
      }
      const model = resolveModel(body);
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "")
        ? (body.effort as string)
        : DEFAULT_EFFORT;

      const narrative = parseNarrative(body.narrative);
      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = makeProvider(model, effort, usage);
      const result = await generateCapabilities(narrative, provider);

      // Estimated cost (cache reads ~0.1×, cache writes ~1.25× input rate). Estimate, not billing.
      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);

      return send(res, 200, {
        ...result,
        model: model.id,
        effort: model.supportsEffort ? effort : null,
        usage,
        estCostUsd,
        sessionSpendUsd,
        pricing: { inPerM: model.inPerM, outPerM: model.outPerM },
      });
    }

    if (req.method === "POST" && req.url === "/api/domain") {
      if (!llmReady) return send(res, 500, { error: NO_LLM });
      const body = JSON.parse((await readBody(req)) || "{}") as {
        capabilities?: CapabilityDoc;
        model?: string;
        effort?: string;
      };
      if (!body.capabilities?.capabilities?.length) {
        return send(res, 400, { error: "capabilities are required" });
      }
      const model = resolveModel(body);
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;

      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = makeProvider(model, effort, usage);
      const result = await generateDomain(body.capabilities, provider, (body as { feedback?: string }).feedback);

      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);

      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // Domain enrichment: propose realistic attributes + child entities for the current model (review-first).
    if (req.method === "POST" && req.url === "/api/enrich") {
      if (!llmReady) return send(res, 500, { error: NO_LLM });
      const body = JSON.parse((await readBody(req)) || "{}") as {
        capabilities?: CapabilityDoc;
        domain?: DomainDoc;
        depth?: EnrichDepth;
        model?: string;
        effort?: string;
      };
      if (!body.capabilities?.capabilities?.length || !body.domain?.aggregates?.length) {
        return send(res, 400, { error: "capabilities and a domain model are required" });
      }
      const model = resolveModel(body);
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;
      const depth: EnrichDepth = (["conservative", "standard", "exhaustive"] as const).includes(body.depth as EnrichDepth) ? (body.depth as EnrichDepth) : "standard";

      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = makeProvider(model, effort, usage);
      const result = await enrichDomain(body.capabilities, body.domain, provider, depth);

      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);

      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // Communications / integrations — the LLM refines the "external effects" layer for this business.
    if (req.method === "POST" && (req.url === "/api/communications" || req.url === "/api/integrations")) {
      if (!llmReady) return send(res, 500, { error: NO_LLM });
      const body = JSON.parse((await readBody(req)) || "{}") as { capabilities?: CapabilityDoc; domain?: DomainDoc; model?: string; effort?: string };
      if (!body.capabilities?.capabilities?.length || !body.domain?.aggregates?.length) {
        return send(res, 400, { error: "capabilities and a domain model are required" });
      }
      const model = resolveModel(body);
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;
      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = makeProvider(model, effort, usage);
      const result =
        req.url === "/api/communications"
          ? await generateCommunications(body.capabilities, body.domain, provider)
          : await generateIntegrations(body.capabilities, body.domain, provider);

      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);
      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // SPEC-003 BC-M3: partition capabilities into business areas with the real LLM (server-side).
    if (req.method === "POST" && req.url === "/api/contexts") {
      if (!llmReady) return send(res, 500, { error: NO_LLM });
      const body = JSON.parse((await readBody(req)) || "{}") as {
        capabilities?: CapabilityDoc;
        model?: string;
        effort?: string;
      };
      if (!body.capabilities?.capabilities?.length) {
        return send(res, 400, { error: "capabilities are required" });
      }
      const model = resolveModel(body);
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;

      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = makeProvider(model, effort, usage);
      const result = await generateContexts(body.capabilities, provider, (body as { feedback?: string }).feedback);

      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);

      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // Semantic critic: the LLM reviews a generated business-area partition (advisory). Higher effort
    // by default — this is a hard reasoning task, and it's where "using the LLM better" pays off.
    if (req.method === "POST" && req.url === "/api/context-critique") {
      if (!llmReady) return send(res, 500, { error: NO_LLM });
      const body = JSON.parse((await readBody(req)) || "{}") as { capabilities?: CapabilityDoc; contexts?: unknown; model?: string; effort?: string };
      if (!body.capabilities?.capabilities?.length || !body.contexts) return send(res, 400, { error: "capabilities and contexts are required" });
      const model = resolveModel(body);
      const effort = model.supportsEffort ? "high" : DEFAULT_EFFORT; // critique benefits from more reasoning
      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = makeProvider(model, effort, usage);
      const result = await critiqueContexts(body.capabilities, body.contexts as never, provider);
      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);
      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // Generic semantic critic: the LLM reviews ANY layer of its own output (advisory). Run at higher
    // effort — critique is a hard reasoning task, and this is where "using the LLM better" pays off.
    if (req.method === "POST" && req.url === "/api/critique") {
      if (!llmReady) return send(res, 500, { error: NO_LLM });
      const body = JSON.parse((await readBody(req)) || "{}") as {
        layer?: LayerKind;
        capabilities?: CapabilityDoc;
        domain?: unknown;
        contexts?: unknown;
        roles?: unknown;
        workflows?: unknown;
        agents?: unknown;
        model?: string;
        effort?: string;
        accepted?: string[];
      };
      if (!body.layer || !body.capabilities?.capabilities?.length) return send(res, 400, { error: "layer and capabilities are required" });
      const model = resolveModel(body);
      // Effort: honour the client's per-layer choice; fall back to the built-in preset. Haiku ignores it.
      const wantEffort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : CRITIQUE_EFFORT[body.layer] ?? "high";
      const effort = model.supportsEffort ? wantEffort : DEFAULT_EFFORT;
      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = makeProvider(model, effort, usage);
      const review: ReviewModel = {
        caps: body.capabilities,
        domain: body.domain as never,
        contexts: body.contexts as never,
        roles: body.roles as never,
        workflows: body.workflows as never,
        agents: body.agents as never,
      };
      const accepted = Array.isArray(body.accepted) ? (body.accepted as string[]).filter((x) => typeof x === "string") : [];
      const result = await critiqueLayer(body.layer, review, provider, accepted);
      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);
      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // Executable-code target: the LLM writes the business-logic handler bodies for the generated app.
    if (req.method === "POST" && req.url === "/api/app-logic") {
      if (!llmReady) return send(res, 500, { error: NO_LLM });
      const body = JSON.parse((await readBody(req)) || "{}") as { capabilities?: CapabilityDoc; domain?: unknown; contexts?: unknown; model?: string; effort?: string };
      if (!body.capabilities?.capabilities?.length || !body.domain) return send(res, 400, { error: "capabilities and domain are required" });
      const model = resolveModel(body);
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;
      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = makeProvider(model, effort, usage);
      const result = await generateAppLogic(body.capabilities, body.domain as never, body.contexts as never, provider, (body as { feedback?: string }).feedback);
      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);
      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // Proxy to the sandboxed app verifier (env-based → local Docker or a VPS, unchanged). No model /
    // API key involved; forwards the generated file map and returns the build-and-run verdict.
    if (req.method === "POST" && req.url === "/api/verify") {
      const verifyUrl = process.env.KILN_VERIFY_URL;
      if (!verifyUrl) return send(res, 200, { configured: false, error: "verifier not configured (set KILN_VERIFY_URL)" });
      const body = (await readBody(req)) || "{}";
      try {
        const r = await fetch(verifyUrl.replace(/\/$/, "") + "/verify", {
          method: "POST",
          headers: { "content-type": "application/json", "x-verify-secret": process.env.KILN_VERIFY_SECRET ?? "" },
          body,
        });
        return send(res, r.status, await r.json());
      } catch (e) {
        return send(res, 502, { ok: false, error: `verifier unreachable at ${verifyUrl}: ${e instanceof Error ? e.message : String(e)}` });
      }
    }

    // The LLM designs a per-entity screen (a validated view spec — data, never JSX, so it's build-safe).
    if (req.method === "POST" && req.url === "/api/app-components") {
      if (!llmReady) return send(res, 500, { error: NO_LLM });
      const body = JSON.parse((await readBody(req)) || "{}") as { capabilities?: CapabilityDoc; domain?: unknown; contexts?: unknown; model?: string; effort?: string };
      if (!body.capabilities?.capabilities?.length || !body.domain) return send(res, 400, { error: "capabilities and domain are required" });
      const model = resolveModel(body);
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;
      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = makeProvider(model, effort, usage);
      const result = await generateComponents(body.capabilities, body.domain as never, body.contexts as never, provider);
      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);
      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // Automated UX pass: a "senior designer" critiques + improves each screen's view spec (build-safe
    // data), iterating toward the design-language best practices. Returns improved views + per-screen why.
    if (req.method === "POST" && req.url === "/api/polish-ui") {
      if (!llmReady) return send(res, 500, { error: NO_LLM });
      const body = JSON.parse((await readBody(req)) || "{}") as { capabilities?: CapabilityDoc; domain?: unknown; contexts?: unknown; views?: Record<string, never>; rounds?: number; model?: string; effort?: string };
      if (!body.capabilities?.capabilities?.length || !body.domain) return send(res, 400, { error: "capabilities and domain are required" });
      const model = resolveModel(body);
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;
      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = makeProvider(model, effort, usage);
      const result = await polishComponents(body.capabilities, body.domain as never, body.contexts as never, body.views as never, provider, { rounds: body.rounds });
      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);
      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // Multi-lens AI review of the GENERATED code (security/correctness/maintainability). Higher effort.
    if (req.method === "POST" && req.url === "/api/code-review") {
      if (!llmReady) return send(res, 500, { error: NO_LLM });
      const body = JSON.parse((await readBody(req)) || "{}") as { capabilities?: CapabilityDoc; domain?: unknown; contexts?: unknown; roles?: unknown; handlerCode?: Record<string, string>; model?: string };
      if (!body.capabilities?.capabilities?.length || !body.domain) return send(res, 400, { error: "capabilities and domain are required" });
      const model = resolveModel(body);
      const effort = model.supportsEffort ? "high" : DEFAULT_EFFORT;
      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = makeProvider(model, effort, usage);
      const result = await reviewGeneratedCode(body.capabilities, body.domain as never, body.contexts as never, body.roles as never, body.handlerCode, provider);
      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);
      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // SPEC-004 CE-M3: model behaviour (commands/events) on the entities, per-aggregate, server-side.
    if (req.method === "POST" && req.url === "/api/events") {
      if (!llmReady) return send(res, 500, { error: NO_LLM });
      const body = JSON.parse((await readBody(req)) || "{}") as {
        domain?: { aggregates?: unknown[] };
        capabilities?: CapabilityDoc;
        model?: string;
        effort?: string;
      };
      if (!body.domain?.aggregates?.length) return send(res, 400, { error: "domain with aggregates is required" });
      if (!body.capabilities?.capabilities?.length) return send(res, 400, { error: "capabilities are required" });
      const model = resolveModel(body);
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;

      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = makeProvider(model, effort, usage);
      const result = await generateEvents(body.domain as never, body.capabilities, provider, (body as { feedback?: string }).feedback);

      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);

      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // SPEC-005 PL-M3: model reactions (policies) wiring events → downstream commands, server-side.
    if (req.method === "POST" && req.url === "/api/policies") {
      if (!llmReady) return send(res, 500, { error: NO_LLM });
      const body = JSON.parse((await readBody(req)) || "{}") as {
        domain?: { events?: unknown[]; commands?: unknown[] };
        capabilities?: CapabilityDoc;
        model?: string;
        effort?: string;
      };
      if (!body.domain?.events?.length || !body.domain?.commands?.length) {
        return send(res, 400, { error: "domain with events and commands is required" });
      }
      const model = resolveModel(body);
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;
      const capIds = (body.capabilities?.capabilities ?? []).map((c) => c.id);

      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = makeProvider(model, effort, usage);
      const result = await generatePolicies(body.domain as never, capIds, provider, (body as { feedback?: string }).feedback);

      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);

      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // SPEC-006: model the roles/personas that operate the capabilities, server-side.
    if (req.method === "POST" && req.url === "/api/roles") {
      if (!llmReady) return send(res, 500, { error: NO_LLM });
      const body = JSON.parse((await readBody(req)) || "{}") as { capabilities?: CapabilityDoc; model?: string; effort?: string };
      if (!body.capabilities?.capabilities?.length) return send(res, 400, { error: "capabilities are required" });
      const model = resolveModel(body);
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;
      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = makeProvider(model, effort, usage);
      const result = await generateRoles(body.capabilities, provider, (body as { feedback?: string }).feedback);
      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);
      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // SPEC-007: model the end-to-end workflows (ordered command sequences), server-side.
    if (req.method === "POST" && req.url === "/api/workflows") {
      if (!llmReady) return send(res, 500, { error: NO_LLM });
      const body = JSON.parse((await readBody(req)) || "{}") as { domain?: { commands?: unknown[] }; model?: string; effort?: string };
      if (!body.domain?.commands?.length) return send(res, 400, { error: "domain with commands is required" });
      const model = resolveModel(body);
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;
      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = makeProvider(model, effort, usage);
      const result = await generateWorkflows(body.domain as never, provider, (body as { feedback?: string }).feedback);
      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);
      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // SPEC-009: route each process → workflow (fixed) or agent (judgement). Drives conditional codegen.
    if (req.method === "POST" && req.url === "/api/orchestration") {
      if (!llmReady) return send(res, 500, { error: NO_LLM });
      const body = JSON.parse((await readBody(req)) || "{}") as { workflows?: { workflows?: unknown[] }; domain?: unknown; model?: string; effort?: string };
      if (!body.workflows?.workflows?.length) return send(res, 400, { error: "workflows are required" });
      const model = resolveModel(body);
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;
      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = makeProvider(model, effort, usage);
      const result = await generateOrchestration(body.workflows as never, provider, body.domain as never);
      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);
      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // Enrich from industry web research: the model searches the web for standard records/fields this
    // vertical has that the model lacks, and returns cited additions (reviewed accept/decline in-app).
    if (req.method === "POST" && req.url === "/api/enrich-web") {
      // Web research uses the Anthropic-native web_search tool → Anthropic engine only (not the gateways).
      if (!client) return send(res, 500, { error: "Web research needs an Anthropic key (KILN_ANTHROPIC_API_KEY / KILN_LANGDOCK_API_KEY)." });
      const body = JSON.parse((await readBody(req)) || "{}") as { capabilities?: CapabilityDoc; domain?: { aggregates?: unknown[] }; model?: string; effort?: string };
      if (!body.domain?.aggregates?.length) return send(res, 400, { error: "domain with aggregates is required" });
      const model = anthropicModel(body.model);
      const resp = await client.messages.create({
        model: model.id,
        max_tokens: 4096,
        system: ENRICH_WEB_SYSTEM_PROMPT,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
        messages: [{ role: "user", content: renderEnrichWebUserPrompt(body.capabilities ?? ({ domain: "", capabilities: [] } as never), body.domain as never) }],
      } as unknown as Anthropic.MessageCreateParamsNonStreaming);
      const text = resp.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
      const parsed = extractJsonObject(text) as { sources?: unknown };
      const enrichment = coerceEnrichment(parsed, body.domain as never, model.id);
      const sources = Array.isArray(parsed.sources) ? (parsed.sources as unknown[]).filter((s): s is string => typeof s === "string") : [];
      const inputUnits = (resp.usage.input_tokens ?? 0) + (resp.usage.cache_read_input_tokens ?? 0) * 0.1;
      const estCostUsd = round((inputUnits * model.inPerM + (resp.usage.output_tokens ?? 0) * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);
      return send(res, 200, { enrichment, sources, model: model.id, usage: { input: resp.usage.input_tokens ?? 0, output: resp.usage.output_tokens ?? 0 }, estCostUsd, sessionSpendUsd });
    }

    // Enrich a named-item layer (capabilities|roles|agents) from industry web research → cited items.
    if (req.method === "POST" && req.url === "/api/enrich-layer") {
      // Web research uses the Anthropic-native web_search tool → Anthropic engine only (not the gateways).
      if (!client) return send(res, 500, { error: "Web research needs an Anthropic key (KILN_ANTHROPIC_API_KEY / KILN_LANGDOCK_API_KEY)." });
      const body = JSON.parse((await readBody(req)) || "{}") as { layer?: string; capabilities?: CapabilityDoc; roles?: unknown; agents?: unknown; model?: string };
      const layer = body.layer === "roles" || body.layer === "agents" ? body.layer : "capabilities";
      if (!body.capabilities?.capabilities?.length) return send(res, 400, { error: "capabilities are required" });
      const model = anthropicModel(body.model);
      const resp = await client.messages.create({
        model: model.id,
        max_tokens: 4096,
        system: ENRICH_LAYER_SYSTEM_PROMPT,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
        messages: [{ role: "user", content: renderEnrichLayerUserPrompt(layer, body.capabilities, body.roles as never, body.agents as never) }],
      } as unknown as Anthropic.MessageCreateParamsNonStreaming);
      const text = resp.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
      const parsed = extractJsonObject(text) as { items?: unknown; sources?: unknown };
      const items = Array.isArray(parsed.items) ? parsed.items : [];
      const sources = Array.isArray(parsed.sources) ? (parsed.sources as unknown[]).filter((s): s is string => typeof s === "string") : [];
      const estCostUsd = round(((resp.usage.input_tokens ?? 0) * model.inPerM + (resp.usage.output_tokens ?? 0) * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);
      return send(res, 200, { items, sources, model: model.id, usage: { input: resp.usage.input_tokens ?? 0, output: resp.usage.output_tokens ?? 0 }, estCostUsd, sessionSpendUsd });
    }

    // Ingest: turn a RAW business description (transcript, notes) into the structured Business Narrative.
    if (req.method === "POST" && req.url === "/api/structure") {
      if (!llmReady) return send(res, 500, { error: NO_LLM });
      const body = JSON.parse((await readBody(req)) || "{}") as { raw?: string; model?: string; effort?: string };
      if (!body.raw || !body.raw.trim()) return send(res, 400, { error: "raw text is required" });
      const model = resolveModel(body);
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;
      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = makeProvider(model, effort, usage);
      const result = await structureNarrative(body.raw, provider);
      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);
      return send(res, 200, { narrative: result.narrative, structured: result.structured, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // Narrative sync: propose narrative sentences for model facts the narrative doesn't yet state (a
    // one-way, human-reviewed reconcile so hand-made model fixes don't silently fall out of the prose).
    if (req.method === "POST" && req.url === "/api/narrative-sync") {
      if (!llmReady) return send(res, 500, { error: NO_LLM });
      const body = JSON.parse((await readBody(req)) || "{}") as { narrative?: string; facts?: string[]; model?: string; effort?: string };
      const facts = Array.isArray(body.facts) ? body.facts.filter((x) => typeof x === "string") : [];
      if (!facts.length) return send(res, 400, { error: "facts are required" });
      const model = resolveModel(body);
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;
      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = makeProvider(model, effort, usage);
      const result = await syncNarrative(body.narrative ?? "", facts, provider);
      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);
      return send(res, 200, { additions: result.additions, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // i18n: translate the generated app's UI string bundle into a target language (automated LLM).
    if (req.method === "POST" && req.url === "/api/translate") {
      if (!llmReady) return send(res, 500, { error: NO_LLM });
      const body = JSON.parse((await readBody(req)) || "{}") as { bundle?: Record<string, string>; targetLang?: string; model?: string; effort?: string };
      if (!body.bundle || !Object.keys(body.bundle).length || !body.targetLang) return send(res, 400, { error: "bundle and targetLang are required" });
      const model = resolveModel(body);
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;
      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = makeProvider(model, effort, usage);
      const translations = await translateMessages(body.bundle, body.targetLang, provider);
      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);
      return send(res, 200, { translations, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // External services (delegation): which existing external workflows/agents to delegate to.
    if (req.method === "POST" && req.url === "/api/external-services") {
      if (!llmReady) return send(res, 500, { error: NO_LLM });
      const body = JSON.parse((await readBody(req)) || "{}") as { capabilities?: CapabilityDoc; domain?: { aggregates?: unknown[] }; agentIds?: string[]; model?: string; effort?: string };
      if (!body.domain?.aggregates?.length) return send(res, 400, { error: "domain with aggregates is required" });
      const model = resolveModel(body);
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;
      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = makeProvider(model, effort, usage);
      const doc = await generateExternalServices((body.capabilities ?? { capabilities: [] }) as never, body.domain as never, provider, body.agentIds ?? []);
      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);
      return send(res, 200, { doc, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // SPEC-008: model the autonomous agents that operate the capabilities, server-side.
    if (req.method === "POST" && req.url === "/api/agents") {
      if (!llmReady) return send(res, 500, { error: NO_LLM });
      const body = JSON.parse((await readBody(req)) || "{}") as { capabilities?: CapabilityDoc; model?: string; effort?: string };
      if (!body.capabilities?.capabilities?.length) return send(res, 400, { error: "capabilities are required" });
      const model = resolveModel(body);
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;
      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = makeProvider(model, effort, usage);
      const result = await generateAgents(body.capabilities, provider, (body as { feedback?: string }).feedback);
      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);
      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    if (req.method === "POST" && req.url === "/api/coach") {
      // The interview is multi-turn + Anthropic structured output → Anthropic engine only for now.
      if (!client) return send(res, 500, { error: "The AI interview needs an Anthropic key (KILN_ANTHROPIC_API_KEY / KILN_LANGDOCK_API_KEY). Paste/markdown narrative works with any engine." });
      const body = JSON.parse((await readBody(req)) || "{}") as {
        messages?: Array<{ role: "user" | "assistant"; content: string }>;
        model?: string;
        effort?: string;
        config?: CoachConfig;
      };
      // The Messages API requires the first turn to be a user turn — drop any leading greeting.
      const all = Array.isArray(body.messages) ? body.messages : [];
      const firstUser = all.findIndex((m) => m.role === "user");
      const messages = firstUser >= 0 ? all.slice(firstUser) : [];
      if (messages.length === 0) return send(res, 400, { error: "at least one user message is required" });

      const model = anthropicModel(body.model);
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;

      const outputConfig: Record<string, unknown> = { format: { type: "json_schema", schema: COACH_SCHEMA } };
      if (model.supportsEffort && effort) outputConfig.effort = effort;

      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const resp = await client.messages.create({
        model: model.id,
        max_tokens: 16000,
        system: buildCoachSystemPrompt(body.config ?? {}),
        messages,
        output_config: outputConfig,
      } as unknown as Anthropic.MessageCreateParamsNonStreaming);
      const u = resp.usage;
      usage.input += u.input_tokens ?? 0;
      usage.output += u.output_tokens ?? 0;
      const text = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      const parsed = (safeParseJson(text) as Record<string, unknown> | null) ?? {};
      const estCostUsd = round((usage.input * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);

      return send(res, 200, {
        reply: typeof parsed.reply === "string" ? parsed.reply : "",
        sectionsFilled: Array.isArray(parsed.sectionsFilled) ? parsed.sectionsFilled : [],
        readyToGenerate: Boolean(parsed.readyToGenerate),
        narrative: typeof parsed.narrative === "string" ? parsed.narrative : null,
        model: model.id,
        estCostUsd,
        sessionSpendUsd,
      });
    }

    if (req.method === "GET" && req.url === "/api/usage") {
      // Estimated spend since this service process started. Not remaining credit (Console-only).
      return send(res, 200, { sessionSpendUsd, note: "estimate since service start; not remaining credit" });
    }

    // Project persistence (ADR-006) + versioned workspaces (SPEC-011 M1: git-backed history).
    if (req.url?.startsWith("/api/projects")) {
      const parts = (req.url.split("?")[0] || "").split("/").filter(Boolean); // [api, projects, id?, sub?, sha?]
      const id = parts[2];
      const sub = parts[3];
      const sha = parts[4];
      if (req.method === "GET" && !id) return send(res, 200, { projects: listProjects() });
      // SPEC-011: a project's version history (newest first).
      if (req.method === "GET" && id && sub === "versions" && !sha) {
        return send(res, 200, { versions: await listVersions(projectDir(id)) });
      }
      // SPEC-011: the project exactly as it was at a past version.
      if (req.method === "GET" && id && sub === "versions" && sha) {
        const raw = await showFileAt(projectDir(id), sha, "project.json");
        if (raw == null) return send(res, 404, { error: "version not found" });
        return send(res, 200, { project: JSON.parse(raw) });
      }
      // SPEC-011 M2: restore a past version → write it back as the working copy + a "restore" commit
      // (non-destructive: the state restored-over stays in history).
      if (req.method === "POST" && id && sub === "restore") {
        const body = JSON.parse((await readBody(req)) || "{}") as { sha?: string };
        if (!body.sha) return send(res, 400, { error: "sha is required" });
        const raw = await showFileAt(projectDir(id), body.sha, "project.json");
        if (raw == null) return send(res, 404, { error: "version not found" });
        const restored = JSON.parse(raw) as StoredProject;
        restored.updatedAt = Date.now(); // the restored content becomes the current working copy
        saveProject(restored);
        const newSha = await commitWorkspace(projectDir(id), `restore: ${body.sha.slice(0, 7)}`);
        return send(res, 200, { ok: true, project: restored, version: newSha });
      }
      if (req.method === "PUT" && id && !sub) {
        const body = JSON.parse((await readBody(req)) || "{}") as StoredProject & { versionLabel?: string; forceCommit?: boolean };
        if (body.id !== id) return send(res, 400, { error: "project id mismatch" });
        saveProject(body);
        // Commit the save → this project's git history (SPEC-011). Optional client label; else a default.
        // forceCommit (an explicit "Save version") records a labelled checkpoint even with no changes.
        const newSha = await commitWorkspace(projectDir(id), body.versionLabel?.trim() || `save: ${body.name || id}`, body.forceCommit === true);
        return send(res, 200, { ok: true, version: newSha });
      }
      if (req.method === "DELETE" && id && !sub) {
        deleteProject(id);
        return send(res, 200, { ok: true });
      }
      return send(res, 405, { error: "method not allowed" });
    }

    if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
      return send(res, 200, { ok: true, ready: llmReady });
    }

    return send(res, 404, { error: "not found" });
  } catch (err) {
    return send(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`[kiln/service] listening on http://localhost:${PORT}  (${PROVIDER_LABEL} key ${client ? "loaded" : "MISSING"})`);
});
