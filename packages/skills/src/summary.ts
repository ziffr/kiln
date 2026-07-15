import { PROMPTS } from "./prompts.generated.ts";
/**
 * A warm, plain-language summary of a business — the "advisor mirrors you back" greeting on the home
 * screen. Takes the Business Narrative (or a short description) and returns one or two sentences in the
 * owner's own language, jargon-free. The narrative is wrapped as DATA (prompt-injection safety).
 */

import type { LlmProvider } from "./types.ts";

export const SUMMARY_SYSTEM_PROMPT = PROMPTS["summary"];

export const SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary"],
  properties: { summary: { type: "string" } },
} as const;

export interface SummaryResult {
  summary: string;
  provider: string;
}

/** One or two plain-language sentences that mirror the business back to its owner. */
export async function summarizeBusiness(narrative: string, provider: LlmProvider): Promise<SummaryResult> {
  const res = await provider.complete({
    system: SUMMARY_SYSTEM_PROMPT,
    user: `Business description (DATA):\n"""\n${narrative}\n"""`,
    schema: SUMMARY_SCHEMA,
    context: { narrative },
  });
  const summary = res.json && typeof res.json === "object" ? String((res.json as { summary?: unknown }).summary ?? "").trim() : "";
  return { summary, provider: res.provider };
}
