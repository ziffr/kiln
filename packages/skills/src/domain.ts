import { PROMPTS } from "./prompts.generated.ts";
/**
 * Mock domain-model generator (SPEC-002 DM1, aggregates-first). Deterministic, offline, no key —
 * the surrogate for `DomainGenerator` (like MockProvider is for CapabilityGenerator).
 *
 * Heuristic: each object a capability `produces` becomes an aggregate it owns (first producer
 * wins). Within a capability, its produced aggregates `reference` the aggregates it `consumes`
 * (that are produced elsewhere) — sensible entity relationships without inventing facts.
 * Provenance targets the owning CAPABILITY (REV-009/REV-010: domain elements cite capabilities,
 * not narrative headings).
 */

import { slug } from "@kiln/ir";
import type { AggregateInput, CapabilityDoc, DomainDoc } from "@kiln/compiler";
import { validateDomain, type Finding } from "@kiln/validation";
import type { LlmProvider, LlmRequest } from "./types.ts";

export function mockGenerateDomain(caps: CapabilityDoc): DomainDoc {
  const aggregates = new Map<string, AggregateInput>();

  // 1. Every produced object → an aggregate owned by its (first) producing capability.
  for (const c of caps.capabilities) {
    for (const p of c.produces ?? []) {
      const id = slug(p);
      if (!id || aggregates.has(id)) continue;
      aggregates.set(id, {
        id,
        name: p,
        owner: c.id,
        attributes: [],
        references: [],
        meta: { origin: "llm", skillVersion: "domaingen-mock@0.1", derivedFrom: [{ capability: c.id }] },
      });
    }
  }

  // 2. Within a capability, produced aggregates reference the aggregates it consumes.
  for (const c of caps.capabilities) {
    const produced = (c.produces ?? []).map((p) => slug(p)).filter((s) => aggregates.has(s));
    const consumed = (c.consumes ?? []).map((p) => slug(p)).filter((s) => aggregates.has(s));
    for (const p of produced) {
      const agg = aggregates.get(p)!;
      const refs = new Set(agg.references ?? []);
      for (const cs of consumed) if (cs !== p) refs.add(cs);
      agg.references = [...refs];
    }
  }

  return { version: "0.1", aggregates: [...aggregates.values()] };
}

// ---------------------------------------------------------------------------------------------
// DomainGenerator (SPEC-002 DM2) — real LLM domain derivation, provider-agnostic, server-side.
// ---------------------------------------------------------------------------------------------

export const DOMAIN_SYSTEM_PROMPT = PROMPTS["domain"];

export function renderDomainUserPrompt(caps: CapabilityDoc): string {
  const lines = ["# Capabilities (owner ids to choose from)", ""];
  for (const c of caps.capabilities) {
    lines.push(`- ${c.id} — ${c.name}: ${c.purpose ?? ""}`);
    if (c.produces?.length) lines.push(`    produces: ${c.produces.join(", ")}`);
    if (c.consumes?.length) lines.push(`    consumes: ${c.consumes.join(", ")}`);
  }
  lines.push("", "Return a domain-model JSON document (aggregates = entities).");
  return lines.join("\n");
}

/** Structured-output schema for domain generation. */
export const DOMAIN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["version", "aggregates"],
  properties: {
    version: { type: "string" },
    aggregates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "owner"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          owner: { type: "string" },
          attributes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name"],
              properties: {
                name: { type: "string" },
                type: { type: "string", enum: ["text", "number", "boolean", "date", "money", "reference"] },
              },
            },
          },
          references: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

export function buildDomainRequest(caps: CapabilityDoc): LlmRequest {
  return { system: DOMAIN_SYSTEM_PROMPT, user: renderDomainUserPrompt(caps), schema: DOMAIN_SCHEMA, context: caps };
}

export function coerceDomainDoc(json: unknown): DomainDoc | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  if (!Array.isArray(obj.aggregates)) return null;
  return { version: typeof obj.version === "string" ? obj.version : "0.1", aggregates: obj.aggregates as AggregateInput[] };
}

/**
 * Canonicalize aggregate ids to stable underscore slugs and remap references (REV-009 F4:
 * deterministic name→id). Models often emit hyphenated ids ("energy-system-design").
 */
function normalizeDomainIds(doc: DomainDoc): DomainDoc {
  const idMap = new Map(doc.aggregates.map((a) => [a.id, slug(a.id)]));
  return {
    ...doc,
    aggregates: doc.aggregates.map((a) => ({
      ...a,
      id: slug(a.id),
      references: (a.references ?? []).map((r) => idMap.get(r) ?? slug(r)),
    })),
  };
}

/**
 * Deterministically connect the model along the capability dependency graph: if an entity's owning
 * capability depends on another capability, and the entity doesn't already reference one of that
 * upstream capability's entities, link it to the upstream capability's primary entity. Guarantees a
 * connected ER even when the LLM under-emits references — never removes references it did emit.
 */
function augmentReferences(doc: DomainDoc, caps: CapabilityDoc): DomainDoc {
  const capById = new Map(caps.capabilities.map((c) => [c.id, c]));
  const byOwner = new Map<string, DomainDoc["aggregates"]>();
  for (const a of doc.aggregates) (byOwner.get(a.owner) ?? byOwner.set(a.owner, []).get(a.owner)!).push(a);
  const aggIds = new Set(doc.aggregates.map((a) => a.id));
  return {
    ...doc,
    aggregates: doc.aggregates.map((a) => {
      const refs = new Set((a.references ?? []).filter((r) => aggIds.has(r) && r !== a.id));
      for (const upCapId of capById.get(a.owner)?.depends_on ?? []) {
        const upAggs = byOwner.get(upCapId) ?? [];
        if (upAggs.length && !upAggs.some((u) => refs.has(u.id))) refs.add(upAggs[0].id);
      }
      return { ...a, references: [...refs] };
    }),
  };
}

/** Provenance for a domain element targets its OWNING capability (REV-009/REV-010). */
function groundDomainProvenance(doc: DomainDoc): DomainDoc {
  return {
    ...doc,
    aggregates: doc.aggregates.map((a) => ({
      ...a,
      meta: { ...(a.meta ?? {}), origin: "llm", derivedFrom: a.owner ? [{ capability: a.owner }] : [] },
    })),
  };
}

export interface DomainGenerationResult {
  doc: DomainDoc;
  findings: Finding[];
  provider: string;
  repaired: boolean;
}

/** DomainGenerator skill: capabilities → domain model, coerced, provenance-grounded, validated. */
export async function generateDomain(caps: CapabilityDoc, provider: LlmProvider, feedback?: string): Promise<DomainGenerationResult> {
  const capIds = caps.capabilities.map((c) => c.id);
  const req = buildDomainRequest(caps);
  if (feedback) req.user += `\n\n${feedback}`;

  let result = await provider.complete(req);
  let doc = coerceDomainDoc(result.json);
  if (doc) doc = groundDomainProvenance(augmentReferences(normalizeDomainIds(doc), caps));
  let findings = doc ? validateDomain(doc, capIds) : [];
  let repaired = false;

  if (!doc || findings.some((f) => f.severity === "blocker")) {
    repaired = true;
    const retry = { ...req, user: `${req.user}\n\nThe previous output was invalid or had blocking issues. Return corrected JSON only.` };
    result = await provider.complete(retry);
    doc = coerceDomainDoc(result.json);
    if (doc) doc = groundDomainProvenance(augmentReferences(normalizeDomainIds(doc), caps));
    findings = doc ? validateDomain(doc, capIds) : [];
  }

  return { doc: doc ?? { version: "0.1", aggregates: [] }, findings, provider: result.provider, repaired };
}
