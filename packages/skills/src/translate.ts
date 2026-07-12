import { PROMPTS } from "./prompts.generated.ts";
/**
 * Translate the generated app's UI string bundle into a target language. The base bundle (keys → source
 * text) comes from `@vbd/codegen`'s appMessages (the source language = the language the business was
 * described in). This is the "automated translation via LLM" pass — one call per target language.
 */

import type { LlmProvider } from "./types.ts";

export const TRANSLATE_SYSTEM_PROMPT = PROMPTS["translate"];

export const TRANSLATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["messages"],
  properties: { messages: { type: "object", additionalProperties: { type: "string" } } },
} as const;

/** Translate a { key → source text } bundle into targetLang. Missing/blank keys fall back to the source. */
export async function translateMessages(bundle: Record<string, string>, targetLang: string, provider: LlmProvider): Promise<Record<string, string>> {
  const user = `Target language: ${targetLang}\n\nTranslate the values of this JSON object:\n${JSON.stringify(bundle, null, 2)}`;
  const res = await provider.complete({ system: TRANSLATE_SYSTEM_PROMPT, user, schema: TRANSLATE_SCHEMA, context: bundle });
  const out = (res.json && typeof res.json === "object" ? (res.json as { messages?: Record<string, unknown> }).messages : undefined) ?? {};
  const result: Record<string, string> = {};
  for (const k of Object.keys(bundle)) {
    const v = (out as Record<string, unknown>)[k];
    result[k] = typeof v === "string" && v.trim() ? v : bundle[k];
  }
  return result;
}
