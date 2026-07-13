import { PROMPTS } from "./prompts.generated.ts";
/**
 * CapabilityGenerator prompt (SPEC-001 §4.2). Narrative is wrapped as DATA, not instructions
 * (REV-005 F3). Every capability must cite provenance anchors back into the narrative.
 */

import { businessOutcomes, coreActivities, customers, type NarrativeDoc } from "@kiln/narrative";
import type { LlmRequest } from "./types.ts";

export const CAPABILITY_SYSTEM_PROMPT = PROMPTS["capability"];

export function renderUserPrompt(narrative: NarrativeDoc): string {
  const acts = coreActivities(narrative);
  const outcomes = businessOutcomes(narrative);
  const cust = customers(narrative);
  return [
    `# Business: ${narrative.title}`,
    ``,
    `## Customers`,
    ...cust.map((c) => `- ${c}`),
    ``,
    `## Business Outcomes`,
    ...outcomes.map((o) => `- ${o}`),
    ``,
    `## Core Activities (each is a provenance anchor)`,
    ...acts.map((a) => `- ${a}`),
    ``,
    `Return a capabilities JSON document.`,
  ].join("\n");
}

/** Structured-output schema for capability generation (used by the provider's output_config). */
export const CAPABILITY_SCHEMA = {
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
          derivedFrom: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

export function buildCapabilityRequest(narrative: NarrativeDoc): LlmRequest {
  return {
    system: CAPABILITY_SYSTEM_PROMPT,
    user: renderUserPrompt(narrative),
    schema: CAPABILITY_SCHEMA,
    context: narrative,
  };
}
