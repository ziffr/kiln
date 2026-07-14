import { PROMPTS } from "./prompts.generated.ts";
/**
 * Narrative sync (one-way, human-reviewed). Hand-made model fixes (surgical fixes, edits) land in the
 * model but not in the Business Narrative — so the prose silently falls behind the model. This proposes
 * narrative sentences for the model FACTS the narrative doesn't yet state, which a human reviews before
 * appending. It is a RECONCILING pass (narrative ← model), NOT a regeneration seed: it keeps the prose
 * honest; it does not promise that regenerating from the narrative would reproduce these exact facts.
 * Narrative + facts are wrapped as DATA (injection safety).
 */

import type { LlmProvider } from "./types.ts";

export const NARRATIVE_SYNC_SYSTEM_PROMPT = PROMPTS["narrative-sync"];

export const NARRATIVE_SYNC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["additions"],
  properties: {
    additions: { type: "array", items: { type: "string" } },
  },
} as const;

export interface NarrativeSyncResult {
  additions: string[];
  provider: string;
}

/** Propose narrative sentences for the model facts the narrative doesn't yet state (human reviews). */
export async function syncNarrative(narrative: string, facts: string[], provider: LlmProvider): Promise<NarrativeSyncResult> {
  if (facts.length === 0) return { additions: [], provider: "none" };
  const res = await provider.complete({
    system: NARRATIVE_SYNC_SYSTEM_PROMPT,
    user: `NARRATIVE (DATA):\n"""\n${narrative}\n"""\n\nFACTS now true in the model (DATA):\n${facts.map((f) => `- ${f}`).join("\n")}`,
    schema: NARRATIVE_SYNC_SCHEMA,
    context: { narrative },
  });
  const o = (res.json && typeof res.json === "object" ? res.json : {}) as Record<string, unknown>;
  const additions = Array.isArray(o.additions) ? o.additions.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
  return { additions, provider: res.provider };
}
