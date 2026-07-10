/**
 * AnthropicProvider — the real LLM provider (ADR-004). SERVER-SIDE ONLY: the API key comes
 * from server env and must never reach the browser (REV-005). Not exercised by unit tests;
 * covered later by `apps/service` integration once a key is wired.
 *
 * Kept dependency-free (uses global fetch) so @vbd/skills stays isomorphic and SDK-agnostic.
 */

import type { LlmProvider, LlmRequest, LlmResult } from "./types.ts";

export interface AnthropicOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  baseUrl?: string;
}

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  private readonly opts: Required<AnthropicOptions>;

  constructor(opts: AnthropicOptions) {
    if (!opts.apiKey) throw new Error("AnthropicProvider requires an apiKey (server-side env)");
    this.opts = {
      apiKey: opts.apiKey,
      model: opts.model ?? "claude-sonnet-5",
      maxTokens: opts.maxTokens ?? 4096,
      baseUrl: opts.baseUrl ?? "https://api.anthropic.com",
    };
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    const res = await fetch(`${this.opts.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.opts.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.opts.model,
        max_tokens: this.opts.maxTokens,
        system: req.system,
        messages: [
          {
            role: "user",
            content: `${req.user}\n\nReturn ONLY a JSON object. No markdown fences, no prose.`,
          },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const raw = (data.content ?? [])
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text)
      .join("")
      .trim();
    return { json: safeParseJson(raw), raw, provider: this.name };
  }
}

/** Extract a JSON object from a model response, tolerating stray fences/prose. */
export function safeParseJson(raw: string): unknown {
  const fenced = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? fenced.slice(start, end + 1) : fenced;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}
