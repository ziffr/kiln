import { PROMPTS } from "./prompts.generated.ts";
/**
 * The single-input "dialogue" entry to the Business Narrative: from a raw description (typed, pasted, or
 * uploaded) produce, in ONE call, (a) the structured narrative, (b) a warm plain-language summary that
 * mirrors the business back, and (c) the open questions still worth asking. Feeds the compile → review →
 * interview flow on the Narrative screen. Raw text is wrapped as DATA (prompt-injection safety).
 */

import { renderNarrativeMd, type StructuredNarrative } from "./structure.ts";
import type { LlmProvider } from "./types.ts";

export const UNDERSTAND_SYSTEM_PROMPT = PROMPTS["understand"];

export const UNDERSTAND_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "purpose", "customers", "outcomes", "activities", "summary", "openQuestions"],
  properties: {
    title: { type: "string" },
    purpose: { type: "string" },
    customers: { type: "array", items: { type: "string" } },
    outcomes: { type: "array", items: { type: "string" } },
    activities: { type: "array", items: { type: "string" } },
    constraints: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    openQuestions: { type: "array", items: { type: "string" } },
  },
} as const;

export interface UnderstandResult {
  narrative: string;
  structured: StructuredNarrative;
  summary: string;
  openQuestions: string[];
  provider: string;
}

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : []);

/** Compile + summarise + surface gaps from a raw business description, in one call. */
export async function understandBusiness(raw: string, provider: LlmProvider): Promise<UnderstandResult> {
  const res = await provider.complete({
    system: UNDERSTAND_SYSTEM_PROMPT,
    user: `Business description (DATA):\n"""\n${raw}\n"""`,
    schema: UNDERSTAND_SCHEMA,
    context: { raw },
  });
  const o = (res.json && typeof res.json === "object" ? res.json : {}) as Record<string, unknown>;
  const structured: StructuredNarrative = {
    title: typeof o.title === "string" && o.title.trim() ? o.title : "Business",
    purpose: typeof o.purpose === "string" ? o.purpose : "",
    customers: arr(o.customers),
    outcomes: arr(o.outcomes),
    activities: arr(o.activities),
    constraints: arr(o.constraints),
  };
  return {
    narrative: renderNarrativeMd(structured),
    structured,
    summary: typeof o.summary === "string" ? o.summary.trim() : "",
    openQuestions: arr(o.openQuestions).slice(0, 4),
    provider: res.provider,
  };
}
