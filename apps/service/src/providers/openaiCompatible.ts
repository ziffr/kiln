/**
 * OpenAI-compatible provider adapter — the seam that lets Kiln run on **OpenRouter** and **omniroute**
 * (and any other `/v1/chat/completions` gateway) while Anthropic stays the default/preferred engine.
 *
 * Why fetch, not an SDK: the "use the official SDK, never raw HTTP" rule (CLAUDE.md) is specifically
 * about the *Anthropic* API. Pulling in the `openai` npm package would break the offline-install
 * constraint (npm install links workspaces only). The chat-completions contract is tiny and stable,
 * so a dependency-free `fetch` adapter is the right call here (server-only; no key ever reaches the browser).
 *
 * Translation from Kiln's provider-agnostic LlmRequest:
 *   · req.system / req.user → system + user messages
 *   · req.schema           → response_format {type:"json_schema", json_schema:{…, strict}}
 *   · effort               → reasoning_effort (OpenAI canonical; "max" clamps to "high")
 * Graceful degrade: on a 400 we retry once WITHOUT response_format + reasoning_effort (some gateway
 * models reject one or the other) — structured output then falls back to the caller's repair-parse of
 * the raw text, exactly like the Langdock path. Mirrors the anthropicProvider degrade behaviour.
 */

import type { LlmProvider, LlmRequest, LlmResult } from "@kiln/skills";
import { safeParseJson } from "@kiln/skills";

export interface OpenAiCompatConfig {
  /** Base URL including the version segment, e.g. https://openrouter.ai/api/v1 or http://localhost:20128/v1 */
  baseUrl: string;
  apiKey: string;
  /** Optional extra headers (OpenRouter likes HTTP-Referer / X-Title for attribution). */
  headers?: Record<string, string>;
  /** Tag for LlmResult.provider / usage visibility, e.g. "openrouter" | "omniroute". */
  label: string;
}

/** Token accounting accumulator (same shape server.ts threads through the Anthropic path). */
export interface UsageAcc {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
}

/** OpenAI supports low|medium|high; Kiln's "max" has no equivalent → clamp to the strongest, "high". */
function toReasoningEffort(effort: string): string {
  return effort === "max" ? "high" : effort;
}

/**
 * Build the chat-completions request body. Pure + exported so it can be unit-tested without a network
 * call. When `withStructured` is false the schema is dropped (the degrade retry) but the JSON nudge in
 * the system prompt stays, so the repair-parse still has well-formed text to work with.
 */
export function buildChatRequest(
  req: LlmRequest,
  model: string,
  effort: string,
  supportsEffort: boolean,
  withStructured = true,
): Record<string, unknown> {
  const system = req.schema
    ? `${req.system}\n\nRespond with a single valid JSON object only — no prose, no markdown fences.`
    : req.system;
  const body: Record<string, unknown> = {
    model,
    max_tokens: 16000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: req.user },
    ],
  };
  if (withStructured && req.schema) {
    body.response_format = { type: "json_schema", json_schema: { name: "kiln_output", strict: true, schema: req.schema } };
  }
  if (withStructured && supportsEffort && effort) {
    body.reasoning_effort = toReasoningEffort(effort);
  }
  return body;
}

/** Extract the assistant text from an OpenAI-shaped chat-completions response. */
function extractText(resp: unknown): string {
  const choices = (resp as { choices?: Array<{ message?: { content?: unknown } }> }).choices ?? [];
  const content = choices[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  // Some gateways return content as an array of parts.
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === "string" ? p : typeof (p as { text?: unknown }).text === "string" ? (p as { text: string }).text : ""))
      .join("")
      .trim();
  }
  return "";
}

/** Build an LlmProvider backed by an OpenAI-compatible gateway; accumulates token usage into `usage`. */
export function openAiCompatibleProvider(
  cfg: OpenAiCompatConfig,
  model: string,
  effort: string,
  supportsEffort: boolean,
  usage: UsageAcc,
): LlmProvider {
  const url = `${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const name = `${cfg.label}:${model}`;
  // A gateway call that never returns would otherwise hang the request forever (no default fetch timeout).
  // Cap it so a stalled/slow model fails LOUDLY with a clear error instead. Generous by default (a
  // high-reasoning model legitimately takes ~1 min); override with KILN_LLM_TIMEOUT_MS.
  const timeoutMs = Number(process.env.KILN_LLM_TIMEOUT_MS ?? 180000);
  const post = async (body: Record<string, unknown>): Promise<Response> =>
    fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.apiKey}`,
        ...cfg.headers,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

  return {
    name,
    async complete(req: LlmRequest): Promise<LlmResult> {
      let resp: Response;
      try {
        resp = await post(buildChatRequest(req, model, effort, supportsEffort, true));
        // Degrade once on a 400 (a model that rejects response_format and/or reasoning_effort): retry
        // plain. The system prompt already asks for bare JSON, so the repair-parse below still applies.
        if (resp.status === 400) {
          resp = await post(buildChatRequest(req, model, effort, supportsEffort, false));
        }
      } catch (e) {
        // Turn an abort/timeout into a clear, actionable message rather than a raw "fetch failed" hang.
        if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
          throw Object.assign(new Error(`${cfg.label} timed out after ${Math.round(timeoutMs / 1000)}s (model "${model}") — the model was too slow or unreachable. Try a faster model or lower the effort.`), { status: 504 });
        }
        throw Object.assign(new Error(`${cfg.label} could not be reached (model "${model}"): ${e instanceof Error ? e.message : String(e)}`), { status: 502 });
      }
      if (!resp.ok) {
        const detail = await resp.text().catch(() => "");
        throw Object.assign(new Error(`${cfg.label} request failed (${resp.status}) for model "${model}": ${detail.slice(0, 500)}`), { status: resp.status });
      }
      const json = (await resp.json()) as { usage?: { prompt_tokens?: number; completion_tokens?: number } };
      usage.input += json.usage?.prompt_tokens ?? 0;
      usage.output += json.usage?.completion_tokens ?? 0;
      const text = extractText(json);
      return { json: safeParseJson(text), raw: text, provider: name };
    },
  };
}
