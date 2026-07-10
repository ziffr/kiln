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
        required: ["id", "name", "purpose", "outcomes"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          purpose: { type: "string" },
          outcomes: { type: "array", items: { type: "string" } },
          actors: { type: "array", items: { type: "string" } },
          produces: { type: "array", items: { type: "string" } },
          consumes: { type: "array", items: { type: "string" } },
          depends_on: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

/** Build an LlmProvider backed by the Anthropic SDK for a specific model + effort. */
function anthropicProvider(client: Anthropic, model: string, effort: string, supportsEffort: boolean): LlmProvider {
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
      const provider = anthropicProvider(client, model.id, effort, model.supportsEffort);
      const result = await generateCapabilities(narrative, provider);

      return send(res, 200, {
        ...result,
        model: model.id,
        effort: model.supportsEffort ? effort : null,
      });
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
