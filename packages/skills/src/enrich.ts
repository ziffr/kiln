import { PROMPTS } from "./prompts.generated.ts";
/**
 * Domain ENRICHMENT skill — thicken a thin model toward "feels like a real app".
 *
 * The domain generator seeds each entity with a few fields. This pass proposes the REALISTIC field
 * set a business object of that kind actually carries (an Invoice has number/tax/subtotal/total/terms/
 * status…), plus the CHILD entities that one-to-many relationships imply (an Invoice has line items).
 * It PROPOSES (a delta); a human accepts/trims — golden invariant #5. Never removes what exists.
 *
 * Two paths, like every skill: `mockEnrichDomain` (deterministic, offline — a curated library keyed by
 * entity kind) and `enrichDomain` (real LLM, which knows far more entity shapes across verticals).
 */

import { slug } from "@vbd/ir";
import { attributeSpecs, type AttributeSpec, type AggregateInput, type CapabilityDoc, type DomainDoc } from "@vbd/compiler";
import type { LlmProvider, LlmRequest } from "./types.ts";

export type EnrichDepth = "conservative" | "standard" | "exhaustive";

/** New attributes proposed for an existing entity. */
export interface AttributeAddition {
  entity: string;
  attributes: AttributeSpec[];
}

/** The enrichment delta — the review payload. Additions to existing entities + proposed child entities. */
export interface EnrichmentResult {
  additions: AttributeAddition[];
  newEntities: AggregateInput[];
  provider: string;
}

// ── Mock library: standard fields + child entities per common business-object kind. ──

type Spec = [string, AttributeSpec["type"]];
const A = (specs: Spec[]): AttributeSpec[] => specs.map(([name, type]) => ({ name, type }));

/** keyword (matched in the entity id/name) → its realistic field set. First match wins. */
const KIND_FIELDS: Array<{ match: RegExp; fields: AttributeSpec[] }> = [
  { match: /invoice|bill/, fields: A([["invoice_number", "text"], ["issue_date", "date"], ["subtotal", "money"], ["tax_amount", "money"], ["total_amount", "money"], ["currency", "text"], ["payment_terms", "text"], ["status", "text"], ["notes", "text"]]) },
  { match: /customer|client|account/, fields: A([["email", "text"], ["phone", "text"], ["billing_address", "text"], ["shipping_address", "text"], ["tax_id", "text"], ["status", "text"]]) },
  { match: /lead|prospect/, fields: A([["email", "text"], ["phone", "text"], ["company", "text"], ["source", "text"], ["score", "number"], ["status", "text"]]) },
  { match: /offer|quote|proposal/, fields: A([["quote_number", "text"], ["valid_until", "date"], ["subtotal", "money"], ["total_amount", "money"], ["discount", "money"], ["status", "text"]]) },
  { match: /purchase_order|order|po\b/, fields: A([["order_number", "text"], ["order_date", "date"], ["expected_date", "date"], ["total_amount", "money"], ["status", "text"]]) },
  { match: /payment/, fields: A([["amount", "money"], ["method", "text"], ["paid_date", "date"], ["reference", "text"], ["status", "text"]]) },
  { match: /product|item|panel|equipment|material/, fields: A([["sku", "text"], ["description", "text"], ["unit_price", "money"], ["unit", "text"]]) },
  { match: /ticket|case|issue|complaint/, fields: A([["subject", "text"], ["description", "text"], ["priority", "text"], ["status", "text"], ["opened_date", "date"], ["resolved_date", "date"]]) },
  { match: /survey|inspection|assessment|audit/, fields: A([["scheduled_date", "date"], ["completed_date", "date"], ["result", "text"], ["notes", "text"]]) },
  { match: /install|work_order|project|job/, fields: A([["scheduled_date", "date"], ["completed_date", "date"], ["status", "text"], ["assigned_to", "text"], ["notes", "text"]]) },
  { match: /design|plan|drawing/, fields: A([["version", "text"], ["status", "text"], ["approved_date", "date"], ["notes", "text"]]) },
  { match: /supplier|vendor|partner/, fields: A([["contact_name", "text"], ["email", "text"], ["phone", "text"], ["address", "text"], ["tax_id", "text"]]) },
  { match: /monitor|reading|record|meter/, fields: A([["recorded_at", "date"], ["value", "number"], ["unit", "text"], ["status", "text"]]) },
];

const GENERIC = A([["status", "text"], ["notes", "text"], ["created_date", "date"]]);
const AUDIT = A([["created_by", "text"], ["created_date", "date"], ["updated_date", "date"]]);

/** parent keyword → a child line-item entity (one-to-many). */
const CHILD_LINES: Array<{ match: RegExp; suffix: string; fields: AttributeSpec[] }> = [
  { match: /invoice|bill/, suffix: "line", fields: A([["description", "text"], ["quantity", "number"], ["unit_price", "money"], ["line_total", "money"], ["tax_rate", "number"]]) },
  { match: /purchase_order|order/, suffix: "line", fields: A([["description", "text"], ["quantity", "number"], ["unit_price", "money"], ["line_total", "money"]]) },
  { match: /offer|quote|proposal/, suffix: "line", fields: A([["description", "text"], ["quantity", "number"], ["unit_price", "money"], ["line_total", "money"]]) },
];

const kindFor = (a: AggregateInput): AttributeSpec[] => {
  const key = `${a.id} ${a.name ?? ""}`.toLowerCase();
  return KIND_FIELDS.find((k) => k.match.test(key))?.fields ?? GENERIC;
};

/** Deterministic enrichment — the offline surrogate for the LLM. */
export function mockEnrichDomain(caps: CapabilityDoc, domain: DomainDoc, depth: EnrichDepth = "standard"): EnrichmentResult {
  void caps;
  const additions: AttributeAddition[] = [];
  const newEntities: AggregateInput[] = [];
  const existingIds = new Set(domain.aggregates.map((a) => a.id));

  for (const a of domain.aggregates) {
    const have = new Set(attributeSpecs(a).map((s) => slug(s.name)));
    let lib = kindFor(a);
    if (depth === "conservative") lib = lib.slice(0, 3);
    if (depth === "exhaustive") lib = [...lib, ...AUDIT];
    const add = lib.filter((s) => !have.has(slug(s.name)));
    // de-dup within the addition list itself
    const seen = new Set<string>();
    const deduped = add.filter((s) => (seen.has(slug(s.name)) ? false : (seen.add(slug(s.name)), true)));
    if (deduped.length) additions.push({ entity: a.id, attributes: deduped });

    if (depth !== "conservative") {
      const childDef = CHILD_LINES.find((c) => c.match.test(`${a.id} ${a.name ?? ""}`.toLowerCase()));
      const childId = childDef ? `${a.id}_${childDef.suffix}` : "";
      if (childDef && !existingIds.has(childId)) {
        existingIds.add(childId);
        newEntities.push({
          id: childId,
          name: `${a.name || a.id} Line`,
          owner: a.owner,
          attributes: childDef.fields,
          references: [a.id],
          meta: { origin: "llm", skillVersion: "enrich-mock@0.1", derivedFrom: [{ capability: a.owner }] },
        });
      }
    }
  }
  return { additions, newEntities, provider: "mock" };
}

/** Merge an enrichment delta into a domain doc (additions appended after existing attrs; children added). */
export function applyEnrichment(domain: DomainDoc, e: EnrichmentResult): DomainDoc {
  const addBy = new Map(e.additions.map((x) => [x.entity, x.attributes]));
  const aggregates = domain.aggregates.map((a) => {
    const extra = addBy.get(a.id);
    if (!extra?.length) return a;
    const have = new Set(attributeSpecs(a).map((s) => slug(s.name)));
    return { ...a, attributes: [...attributeSpecs(a), ...extra.filter((s) => !have.has(slug(s.name)))] };
  });
  const existing = new Set(domain.aggregates.map((a) => a.id));
  return { ...domain, aggregates: [...aggregates, ...e.newEntities.filter((n) => !existing.has(n.id))] };
}

// ── Real LLM path ──

export const ENRICH_SYSTEM_PROMPT = PROMPTS["enrich"];

export function renderEnrichUserPrompt(caps: CapabilityDoc, domain: DomainDoc, depth: EnrichDepth): string {
  const lines = [`# Business: ${caps.domain}`, `# Enrichment depth: ${depth}`, "", "## Current entities (id — existing attributes)", ""];
  for (const a of domain.aggregates) {
    const attrs = attributeSpecs(a).map((s) => `${s.name}:${s.type ?? "text"}`).join(", ") || "(none)";
    lines.push(`- ${a.id} (owner ${a.owner}) — ${attrs}`);
  }
  lines.push("", "Propose realistic ADDITIONAL attributes for each entity and any CHILD entities (one-to-many). Do not repeat existing attributes. Output ONLY the enrichment JSON.");
  return lines.join("\n");
}

export const ENRICH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["additions", "newEntities"],
  properties: {
    additions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["entity", "attributes"],
        properties: {
          entity: { type: "string" },
          attributes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "type"],
              properties: { name: { type: "string" }, type: { type: "string", enum: ["text", "number", "boolean", "date", "money", "reference"] } },
            },
          },
        },
      },
    },
    newEntities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "owner", "attributes", "references"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          owner: { type: "string" },
          references: { type: "array", items: { type: "string" } },
          attributes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "type"],
              properties: { name: { type: "string" }, type: { type: "string", enum: ["text", "number", "boolean", "date", "money", "reference"] } },
            },
          },
        },
      },
    },
  },
} as const;

export function buildEnrichRequest(caps: CapabilityDoc, domain: DomainDoc, depth: EnrichDepth): LlmRequest {
  return { system: ENRICH_SYSTEM_PROMPT, user: renderEnrichUserPrompt(caps, domain, depth), schema: ENRICH_SCHEMA, context: { caps, domain } };
}

// ── Web-research enrichment: same shape, sourced from the industry (the SDK/web_search call runs in the
//    service — this side is SDK-free: the prompt, the user-render, the JSON extraction, and the coerce). ──
export const ENRICH_WEB_SYSTEM_PROMPT = PROMPTS["enrich-web"];

export function renderEnrichWebUserPrompt(caps: CapabilityDoc, domain: DomainDoc): string {
  const lines = [`# Business: ${caps.domain}`, "", "## Current entities (id — existing attributes)", ""];
  for (const a of domain.aggregates) lines.push(`- ${a.id} (owner ${a.owner}) — ${attributeSpecs(a).map((s) => `${s.name}:${s.type ?? "text"}`).join(", ") || "(none)"}`);
  lines.push("", `Research how businesses in the "${caps.domain}" industry operate and propose the standard records/fields this model is MISSING. Output ONLY the JSON.`);
  return lines.join("\n");
}

/** Extract the first balanced JSON object from a (possibly prose-wrapped) web-search response. */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  if (start < 0) return {};
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)); } catch { return {}; }
    }
  }
  return {};
}

export function coerceEnrichment(json: unknown, domain: DomainDoc, provider: string): EnrichmentResult {
  const obj = (json ?? {}) as Record<string, unknown>;
  const validEntity = new Set(domain.aggregates.map((a) => a.id));
  const owners = new Map(domain.aggregates.map((a) => [a.id, a.owner]));
  const additions = (Array.isArray(obj.additions) ? obj.additions : [])
    .map((x) => x as AttributeAddition)
    .filter((x) => x && validEntity.has(slug(x.entity)))
    .map((x) => ({ entity: slug(x.entity), attributes: (x.attributes ?? []).filter((s) => s?.name) }));
  const newEntities = (Array.isArray(obj.newEntities) ? obj.newEntities : [])
    .map((x) => x as AggregateInput)
    .filter((x) => x && x.id && x.owner)
    .map((x) => ({ ...x, id: slug(x.id), references: (x.references ?? []).map((r) => slug(r)), owner: owners.has(slug(x.references?.[0] ?? "")) ? owners.get(slug(x.references![0]))! : x.owner, meta: { ...(x.meta ?? {}), origin: "llm", derivedFrom: [{ capability: x.owner }] } }));
  return { additions, newEntities, provider };
}

/** EnrichDomain skill: propose realistic attributes + child entities for the current model. */
export async function enrichDomain(caps: CapabilityDoc, domain: DomainDoc, provider: LlmProvider, depth: EnrichDepth = "standard"): Promise<EnrichmentResult> {
  const result = await provider.complete(buildEnrichRequest(caps, domain, depth));
  return coerceEnrichment(result.json, domain, result.provider);
}
