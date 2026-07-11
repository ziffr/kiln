/**
 * @vbd/service — the server-side API (ADR-003 §4, ADR-004). Holds the Anthropic key
 * (VBD_ANTHROPIC_API_KEY, loaded via `node --env-file`), NEVER exposes it to the browser.
 * Uses the official @anthropic-ai/sdk (the project is TypeScript → SDK, not raw HTTP).
 *
 * Endpoints:
 *   GET  /api/models    → model catalog + defaults for the in-app selector
 *   POST /api/generate  → { narrative, model?, effort? } → generated capabilities + findings
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { parseNarrative } from "@vbd/narrative";
import {
  generateCapabilities,
  generateDomain,
  generateContexts,
  critiqueContexts,
  critiqueLayer,
  CRITIQUE_EFFORT,
  type LayerKind,
  type ReviewModel,
  generateEvents,
  generatePolicies,
  generateRoles,
  generateWorkflows,
  generateAgents,
  safeParseJson,
  buildCoachSystemPrompt,
  COACH_SCHEMA,
  type CoachConfig,
  type LlmProvider,
  type LlmRequest,
} from "@vbd/skills";
import type { CapabilityDoc } from "@vbd/compiler";
import { DEFAULT_EFFORT, DEFAULT_MODEL, EFFORTS, MODELS, modelById } from "./models.ts";
import { deleteProject, listProjects, saveProject, type StoredProject } from "./workspaces.ts";

const PORT = Number(process.env.PORT ?? 8787);
const API_KEY = process.env.VBD_ANTHROPIC_API_KEY;

// Structured-output schemas now live in @vbd/skills (CAPABILITY_SCHEMA / DOMAIN_SCHEMA) and travel
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
    name: `anthropic:${model}`,
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

      const resp = await client.messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming);
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

const client = API_KEY ? new Anthropic({ apiKey: API_KEY }) : null;

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return send(res, 204, {});

    if (req.method === "GET" && req.url === "/api/models") {
      return send(res, 200, {
        models: MODELS,
        defaultModel: DEFAULT_MODEL,
        defaultEffort: DEFAULT_EFFORT,
        efforts: EFFORTS,
        ready: Boolean(client),
      });
    }

    if (req.method === "POST" && req.url === "/api/generate") {
      if (!client) {
        return send(res, 500, { error: "VBD_ANTHROPIC_API_KEY is not set on the server" });
      }
      const body = JSON.parse((await readBody(req)) || "{}") as {
        narrative?: string;
        model?: string;
        effort?: string;
      };
      if (!body.narrative || !body.narrative.trim()) {
        return send(res, 400, { error: "narrative is required" });
      }
      const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "")
        ? (body.effort as string)
        : DEFAULT_EFFORT;

      const narrative = parseNarrative(body.narrative);
      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = anthropicProvider(client, model.id, effort, model.supportsEffort, usage);
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
      if (!client) return send(res, 500, { error: "VBD_ANTHROPIC_API_KEY is not set on the server" });
      const body = JSON.parse((await readBody(req)) || "{}") as {
        capabilities?: CapabilityDoc;
        model?: string;
        effort?: string;
      };
      if (!body.capabilities?.capabilities?.length) {
        return send(res, 400, { error: "capabilities are required" });
      }
      const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;

      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = anthropicProvider(client, model.id, effort, model.supportsEffort, usage);
      const result = await generateDomain(body.capabilities, provider, (body as { feedback?: string }).feedback);

      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);

      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // SPEC-003 BC-M3: partition capabilities into business areas with the real LLM (server-side).
    if (req.method === "POST" && req.url === "/api/contexts") {
      if (!client) return send(res, 500, { error: "VBD_ANTHROPIC_API_KEY is not set on the server" });
      const body = JSON.parse((await readBody(req)) || "{}") as {
        capabilities?: CapabilityDoc;
        model?: string;
        effort?: string;
      };
      if (!body.capabilities?.capabilities?.length) {
        return send(res, 400, { error: "capabilities are required" });
      }
      const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;

      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = anthropicProvider(client, model.id, effort, model.supportsEffort, usage);
      const result = await generateContexts(body.capabilities, provider, (body as { feedback?: string }).feedback);

      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);

      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // Semantic critic: the LLM reviews a generated business-area partition (advisory). Higher effort
    // by default — this is a hard reasoning task, and it's where "using the LLM better" pays off.
    if (req.method === "POST" && req.url === "/api/context-critique") {
      if (!client) return send(res, 500, { error: "VBD_ANTHROPIC_API_KEY is not set on the server" });
      const body = JSON.parse((await readBody(req)) || "{}") as { capabilities?: CapabilityDoc; contexts?: unknown; model?: string; effort?: string };
      if (!body.capabilities?.capabilities?.length || !body.contexts) return send(res, 400, { error: "capabilities and contexts are required" });
      const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
      const effort = model.supportsEffort ? "high" : DEFAULT_EFFORT; // critique benefits from more reasoning
      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = anthropicProvider(client, model.id, effort, model.supportsEffort, usage);
      const result = await critiqueContexts(body.capabilities, body.contexts as never, provider);
      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);
      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // Generic semantic critic: the LLM reviews ANY layer of its own output (advisory). Run at higher
    // effort — critique is a hard reasoning task, and this is where "using the LLM better" pays off.
    if (req.method === "POST" && req.url === "/api/critique") {
      if (!client) return send(res, 500, { error: "VBD_ANTHROPIC_API_KEY is not set on the server" });
      const body = JSON.parse((await readBody(req)) || "{}") as {
        layer?: LayerKind;
        capabilities?: CapabilityDoc;
        domain?: unknown;
        contexts?: unknown;
        roles?: unknown;
        workflows?: unknown;
        agents?: unknown;
        model?: string;
      };
      if (!body.layer || !body.capabilities?.capabilities?.length) return send(res, 400, { error: "layer and capabilities are required" });
      const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
      // Adaptive effort per layer (clamped to what the catalog allows); Haiku ignores effort.
      const wantEffort = CRITIQUE_EFFORT[body.layer] ?? "high";
      const effort = model.supportsEffort ? ((EFFORTS as readonly string[]).includes(wantEffort) ? wantEffort : "high") : DEFAULT_EFFORT;
      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
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
      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);
      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // SPEC-004 CE-M3: model behaviour (commands/events) on the entities, per-aggregate, server-side.
    if (req.method === "POST" && req.url === "/api/events") {
      if (!client) return send(res, 500, { error: "VBD_ANTHROPIC_API_KEY is not set on the server" });
      const body = JSON.parse((await readBody(req)) || "{}") as {
        domain?: { aggregates?: unknown[] };
        capabilities?: CapabilityDoc;
        model?: string;
        effort?: string;
      };
      if (!body.domain?.aggregates?.length) return send(res, 400, { error: "domain with aggregates is required" });
      if (!body.capabilities?.capabilities?.length) return send(res, 400, { error: "capabilities are required" });
      const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;

      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = anthropicProvider(client, model.id, effort, model.supportsEffort, usage);
      const result = await generateEvents(body.domain as never, body.capabilities, provider, (body as { feedback?: string }).feedback);

      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);

      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // SPEC-005 PL-M3: model reactions (policies) wiring events → downstream commands, server-side.
    if (req.method === "POST" && req.url === "/api/policies") {
      if (!client) return send(res, 500, { error: "VBD_ANTHROPIC_API_KEY is not set on the server" });
      const body = JSON.parse((await readBody(req)) || "{}") as {
        domain?: { events?: unknown[]; commands?: unknown[] };
        capabilities?: CapabilityDoc;
        model?: string;
        effort?: string;
      };
      if (!body.domain?.events?.length || !body.domain?.commands?.length) {
        return send(res, 400, { error: "domain with events and commands is required" });
      }
      const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;
      const capIds = (body.capabilities?.capabilities ?? []).map((c) => c.id);

      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = anthropicProvider(client, model.id, effort, model.supportsEffort, usage);
      const result = await generatePolicies(body.domain as never, capIds, provider, (body as { feedback?: string }).feedback);

      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);

      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // SPEC-006: model the roles/personas that operate the capabilities, server-side.
    if (req.method === "POST" && req.url === "/api/roles") {
      if (!client) return send(res, 500, { error: "VBD_ANTHROPIC_API_KEY is not set on the server" });
      const body = JSON.parse((await readBody(req)) || "{}") as { capabilities?: CapabilityDoc; model?: string; effort?: string };
      if (!body.capabilities?.capabilities?.length) return send(res, 400, { error: "capabilities are required" });
      const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;
      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = anthropicProvider(client, model.id, effort, model.supportsEffort, usage);
      const result = await generateRoles(body.capabilities, provider, (body as { feedback?: string }).feedback);
      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);
      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // SPEC-007: model the end-to-end workflows (ordered command sequences), server-side.
    if (req.method === "POST" && req.url === "/api/workflows") {
      if (!client) return send(res, 500, { error: "VBD_ANTHROPIC_API_KEY is not set on the server" });
      const body = JSON.parse((await readBody(req)) || "{}") as { domain?: { commands?: unknown[] }; model?: string; effort?: string };
      if (!body.domain?.commands?.length) return send(res, 400, { error: "domain with commands is required" });
      const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;
      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = anthropicProvider(client, model.id, effort, model.supportsEffort, usage);
      const result = await generateWorkflows(body.domain as never, provider, (body as { feedback?: string }).feedback);
      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);
      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    // SPEC-008: model the autonomous agents that operate the capabilities, server-side.
    if (req.method === "POST" && req.url === "/api/agents") {
      if (!client) return send(res, 500, { error: "VBD_ANTHROPIC_API_KEY is not set on the server" });
      const body = JSON.parse((await readBody(req)) || "{}") as { capabilities?: CapabilityDoc; model?: string; effort?: string };
      if (!body.capabilities?.capabilities?.length) return send(res, 400, { error: "capabilities are required" });
      const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
      const effort = (EFFORTS as readonly string[]).includes(body.effort ?? "") ? (body.effort as string) : DEFAULT_EFFORT;
      const usage: UsageAcc = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const provider = anthropicProvider(client, model.id, effort, model.supportsEffort, usage);
      const result = await generateAgents(body.capabilities, provider, (body as { feedback?: string }).feedback);
      const inputUnits = usage.input + usage.cacheRead * 0.1 + usage.cacheCreate * 1.25;
      const estCostUsd = round((inputUnits * model.inPerM + usage.output * model.outPerM) / 1_000_000);
      sessionSpendUsd = round(sessionSpendUsd + estCostUsd);
      return send(res, 200, { ...result, model: model.id, usage, estCostUsd, sessionSpendUsd });
    }

    if (req.method === "POST" && req.url === "/api/coach") {
      if (!client) return send(res, 500, { error: "VBD_ANTHROPIC_API_KEY is not set on the server" });
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

      const model = modelById(body.model ?? DEFAULT_MODEL) ?? modelById(DEFAULT_MODEL)!;
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

    // Project persistence (ADR-006): filesystem workspace store.
    if (req.url?.startsWith("/api/projects")) {
      const m = /^\/api\/projects(?:\/([^/?]+))?$/.exec(req.url);
      const id = m?.[1];
      if (req.method === "GET" && !id) return send(res, 200, { projects: listProjects() });
      if (req.method === "PUT" && id) {
        const p = JSON.parse((await readBody(req)) || "{}") as StoredProject;
        if (p.id !== id) return send(res, 400, { error: "project id mismatch" });
        saveProject(p);
        return send(res, 200, { ok: true });
      }
      if (req.method === "DELETE" && id) {
        deleteProject(id);
        return send(res, 200, { ok: true });
      }
      return send(res, 405, { error: "method not allowed" });
    }

    if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
      return send(res, 200, { ok: true, ready: Boolean(client) });
    }

    return send(res, 404, { error: "not found" });
  } catch (err) {
    return send(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`[vbd/service] listening on http://localhost:${PORT}  (anthropic key ${client ? "loaded" : "MISSING"})`);
});
