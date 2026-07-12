import { PROMPTS } from "./prompts.generated.ts";
/**
 * Structure a RAW business description (a transcript, notes, a brief) into the heading-anchored Business
 * Narrative the pipeline derives from. The raw text is an unstructured SEED; this projects it into the
 * one source-of-truth artifact (Purpose / Customers / Business Outcomes / Core Activities / Constraints),
 * which then flows into capabilities → the whole model. Raw text is wrapped as DATA (injection safety).
 */

import type { LlmProvider } from "./types.ts";

export const STRUCTURE_SYSTEM_PROMPT = PROMPTS["structure"];

export const STRUCTURE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "purpose", "customers", "outcomes", "activities"],
  properties: {
    title: { type: "string" },
    purpose: { type: "string" },
    customers: { type: "array", items: { type: "string" } },
    outcomes: { type: "array", items: { type: "string" } },
    activities: { type: "array", items: { type: "string" } },
    constraints: { type: "array", items: { type: "string" } },
  },
} as const;

export interface StructuredNarrative {
  title: string;
  purpose: string;
  customers: string[];
  outcomes: string[];
  activities: string[];
  constraints: string[];
}

/** Render the structured sections to the heading-anchored narrative markdown the parser expects. */
export function renderNarrativeMd(s: StructuredNarrative): string {
  const bullets = (arr: string[]) => (arr.length ? arr.map((x) => `- ${x}`).join("\n") : "-");
  return [
    `# ${s.title || "Business"}`,
    "",
    "## Purpose",
    s.purpose || "",
    "",
    "## Customers",
    bullets(s.customers),
    "",
    "## Business Outcomes",
    bullets(s.outcomes),
    "",
    "## Core Activities",
    bullets(s.activities),
    "",
    "## Constraints",
    bullets(s.constraints),
    "",
  ].join("\n");
}

function coerce(json: unknown): StructuredNarrative {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : []);
  return {
    title: typeof o.title === "string" ? o.title : "Business",
    purpose: typeof o.purpose === "string" ? o.purpose : "",
    customers: arr(o.customers),
    outcomes: arr(o.outcomes),
    activities: arr(o.activities),
    constraints: arr(o.constraints),
  };
}

export interface StructureResult {
  narrative: string;
  structured: StructuredNarrative;
  provider: string;
}

/** Turn raw text into the structured Business Narrative markdown (+ the structured sections). */
export async function structureNarrative(raw: string, provider: LlmProvider): Promise<StructureResult> {
  const res = await provider.complete({ system: STRUCTURE_SYSTEM_PROMPT, user: `Raw business description (DATA):\n"""\n${raw}\n"""`, schema: STRUCTURE_SCHEMA, context: { raw } });
  const structured = coerce(res.json);
  return { narrative: renderNarrativeMd(structured), structured, provider: res.provider };
}
