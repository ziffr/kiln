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

import type { CapabilityDoc, DomainDoc, ContextsDoc } from "@kiln/compiler";
import type { LlmProvider } from "./types.ts";
import { projectAppModel, type AppModel } from "@kiln/codegen";

const FORMATS = ["text", "money", "date", "boolean", "badge", "longtext"] as const;
type Format = (typeof FORMATS)[number];
const LAYOUTS = ["table", "cards", "board"] as const;
type Layout = (typeof LAYOUTS)[number];
const AGGS = ["count", "sum", "avg"] as const;
type Agg = (typeof AGGS)[number];

/** A KPI tile computed from the loaded rows — count of rows, or sum/avg over a numeric field. */
export interface ViewMetric { label: string; agg: Agg; field?: string; format?: Format }
/** Card/board presentation: which fields become the card's title / subtitle / badge / meta line. */
export interface ViewCard { title?: string; subtitle?: string; badge?: string; meta?: string[] }

export interface ViewSpec {
  description?: string;
  titleField?: string;
  /** How the list renders: a table (default), a grid of cards, or a kanban board grouped by `groupBy`. */
  layout?: Layout;
  /** 0–4 KPI tiles shown above the list. */
  metrics?: ViewMetric[];
  /** A short status/stage/type field to group by (board columns / grouped cards). */
  groupBy?: string;
  /** Presentation for cards/board mode (falls back to titleField + first columns when absent). */
  card?: ViewCard;
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
    layout: { type: "string", enum: [...LAYOUTS] },
    metrics: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["label", "agg"], properties: { label: { type: "string" }, agg: { type: "string", enum: [...AGGS] }, field: { type: "string" }, format: { type: "string", enum: [...FORMATS] } } },
    },
    groupBy: { type: "string" },
    card: { type: "object", additionalProperties: false, properties: { title: { type: "string" }, subtitle: { type: "string" }, badge: { type: "string" }, meta: { type: "array", items: { type: "string" } } } },
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
export function validateSpec(raw: unknown, e: AppModel["entities"][number]): ViewSpec | null {
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
  const realField = (v: unknown): string | undefined => (typeof v === "string" && real.has(v) ? v : undefined);

  // KPI tiles — count needs no field; sum/avg require a real numeric-ish field. Cap at 4.
  const metrics = (Array.isArray(o.metrics) ? o.metrics : [])
    .map((m) => m as Record<string, unknown>)
    .filter((m) => typeof m.label === "string" && (AGGS as readonly string[]).includes(String(m.agg)))
    .map((m) => ({ label: String(m.label).slice(0, 40), agg: m.agg as Agg, field: realField(m.field), format: (FORMATS as readonly string[]).includes(String(m.format)) ? (m.format as Format) : undefined }))
    .filter((m) => m.agg === "count" || m.field) // sum/avg without a field is meaningless → drop
    .slice(0, 4);

  const groupBy = realField(o.groupBy);
  const cardRaw = o.card && typeof o.card === "object" ? (o.card as Record<string, unknown>) : undefined;
  const card = cardRaw
    ? { title: realField(cardRaw.title), subtitle: realField(cardRaw.subtitle), badge: realField(cardRaw.badge), meta: Array.isArray(cardRaw.meta) ? cardRaw.meta.filter((x): x is string => typeof x === "string" && real.has(x)).slice(0, 4) : undefined }
    : undefined;

  // A board needs something to group by; without it, degrade to cards (never a broken board).
  let layout = (LAYOUTS as readonly string[]).includes(String(o.layout)) ? (o.layout as Layout) : undefined;
  if (layout === "board" && !groupBy) layout = "cards";

  return {
    description: typeof o.description === "string" ? o.description.slice(0, 200) : undefined,
    titleField,
    ...(layout ? { layout } : {}),
    ...(metrics.length ? { metrics } : {}),
    ...(groupBy ? { groupBy } : {}),
    ...(card && (card.title || card.subtitle || card.badge || card.meta?.length) ? { card } : {}),
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
