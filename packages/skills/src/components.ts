import { PROMPTS } from "./prompts.generated.ts";
/**
 * generateComponents — the LLM designs a per-entity SCREEN for the generated app. Crucially it does
 * NOT emit JSX (injecting generated JSX into a Vite build has no safe transform-gate at our endpoints,
 * so a syntax error would break the user's build). Instead each agent returns a validated *view spec*
 * — data, allow-listed against the entity's real fields — that one robust generic component renders.
 * That makes the output build-safe BY CONSTRUCTION: an invalid spec degrades to the default screen.
 *
 * Fans out one focused agent per entity (concurrent), same shape as the handler fan-out.
 */

import type { CapabilityDoc, DomainDoc, ContextsDoc } from "@vbd/compiler";
import type { LlmProvider } from "./types.ts";
import { projectAppModel, type AppModel } from "@vbd/codegen";

const FORMATS = ["text", "money", "date", "boolean", "badge", "longtext"] as const;
type Format = (typeof FORMATS)[number];

export interface ViewSpec {
  description?: string;
  titleField?: string;
  columns: { field: string; format: Format }[];
  formFields: string[];
}

export const COMPONENTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["columns", "formFields"],
  properties: {
    description: { type: "string" },
    titleField: { type: "string" },
    columns: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["field", "format"], properties: { field: { type: "string" }, format: { type: "string", enum: [...FORMATS] } } },
    },
    formFields: { type: "array", items: { type: "string" } },
  },
} as const;

export const COMPONENTS_SYSTEM_PROMPT = PROMPTS["components"];

function renderOne(e: AppModel["entities"][number]): string {
  return `# Design the screen for entity "${e.name}" (id: ${e.id})\nFields: ${e.fields.map((f) => `${f.name}:${f.type}`).join(", ") || "(none)"}`;
}

/** Keep only real fields / allowed formats — the spec can never reference something that doesn't exist. */
function validateSpec(raw: unknown, e: AppModel["entities"][number]): ViewSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const real = new Set(e.fields.map((f) => f.name));
  const columns = (Array.isArray(o.columns) ? o.columns : [])
    .map((c) => c as Record<string, unknown>)
    .filter((c) => typeof c.field === "string" && real.has(c.field))
    .map((c) => ({ field: c.field as string, format: (FORMATS as readonly string[]).includes(String(c.format)) ? (c.format as Format) : "text" }));
  const formFields = (Array.isArray(o.formFields) ? o.formFields : []).filter((f): f is string => typeof f === "string" && real.has(f));
  if (columns.length === 0 && formFields.length === 0) return null; // nothing usable → fall back to the default screen
  const titleField = typeof o.titleField === "string" && real.has(o.titleField) ? o.titleField : undefined;
  return {
    description: typeof o.description === "string" ? o.description.slice(0, 200) : undefined,
    titleField,
    columns: columns.length ? columns : e.fields.map((f) => ({ field: f.name, format: (f.type === "money" || f.type === "date" || f.type === "boolean" ? f.type : "text") as Format })),
    formFields: formFields.length ? formFields : e.fields.map((f) => f.name),
  };
}

export interface ComponentsResult {
  views: Record<string, ViewSpec>;
  provider: string;
  written: number;
  skipped: number;
}

export async function generateComponents(
  caps: CapabilityDoc,
  domain: DomainDoc,
  contexts: ContextsDoc | undefined,
  provider: LlmProvider,
): Promise<ComponentsResult> {
  const m = projectAppModel(caps, domain, contexts);
  const results = await Promise.all(
    m.entities.map(async (e) => {
      try {
        const res = await provider.complete({ system: COMPONENTS_SYSTEM_PROMPT, user: renderOne(e), schema: COMPONENTS_SCHEMA, context: m });
        return { id: e.id, spec: validateSpec(res.json, e), provider: res.provider };
      } catch {
        return { id: e.id, spec: null, provider: provider.name };
      }
    }),
  );
  const views: Record<string, ViewSpec> = {};
  let skipped = 0;
  for (const r of results) {
    if (r.spec) views[r.id] = r.spec;
    else skipped += 1;
  }
  return { views, provider: results[0]?.provider ?? provider.name, written: Object.keys(views).length, skipped };
}
