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
  safeParseJson,
  buildCoachSystemPrompt,
  COACH_SCHEMA,
  type CoachConfig,
  type LlmProvider,
  type LlmRequest,
} from "@vbd/skills";
import { DEFAULT_EFFORT, DEFAULT_MODEL, EFFORTS, MODELS, modelById } from "./models.ts";

const PORT = Number(process.env.PORT ?? 8787);
const API_KEY = process.env.VBD_ANTHROPIC_API_KEY;

// LLM-facing JSON schema for structured outputs (SPEC-001 §3.2 shape, simplified to what the
// structured-outputs feature supports — no pattern/minItems). Forces the exact field names so
// the model can't drift to name/description (claude-api skill → Structured Outputs).
const CAPABILITY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["version", "domain", "capabilities"],
  properties: {
    version: { type: "string" },
    domain: { type: "string" },
    capabilities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "purpose", "outcomes", "derivedFrom"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          purpose: { type: "string" },
          outcomes: { type: "array", items: { type: "string" } },
          actors: { type: "array", items: { type: "string" } },
          produces: { type: "array", items: { type: "string" } },
          consumes: { type: "array", items: { type: "string" } },
          depends_on: { type: "array", items: { type: "string" } },
          // provenance: the exact Core Activity lines this capability derives from.
          derivedFrom: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

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
      const outputConfig: Record<string, unknown> = {
        format: { type: "json_schema", schema: CAPABILITY_SCHEMA },
      };
      // effort is GA on Sonnet 5 / Opus 4.x; omit on Haiku 4.5 (it errors there).
      if (supportsEffort && effort) outputConfig.effort = effort;

      const params = {
        model,
        max_tokens: 16000, // leave room for adaptive thinking (Sonnet 5 default) + JSON output
        system: req.system,
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
    "access-control-allow-methods": "GET,POST,OPTIONS",
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
