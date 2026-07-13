import { PROMPTS } from "./prompts.generated.ts";
/**
 * Business-areas generator (SPEC-003). Mirrors domain.ts: a deterministic offline MOCK plus the
 * real LLM `ContextGrouper` skill (BC-M3, below).
 *
 * The mock partitions capabilities into subdomains ("areas") by AFFINITY — two capabilities are
 * akin when they share a produced/consumed entity or a direct `depends_on`. It agglomerates the
 * highest-affinity clusters under a size cap so a long dependency chain does NOT collapse into one
 * giant area (REV-014 Minor). Ids are member-set fingerprints (REV-014 BC-F3), so a partition's
 * identity is stable across runs regardless of the name.
 */

import { slug, sha256 } from "@kiln/ir";
import type { CapabilityDoc, ContextInput, ContextsDoc } from "@kiln/compiler";
import { validateContexts, type Finding } from "@kiln/validation";
import type { LlmProvider, LlmRequest } from "./types.ts";

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, "_");

/** Stable id from the sorted member set (never from the synthesized name). */
export function fingerprintId(members: string[]): string {
  return `c_${sha256([...members].sort().join(",")).slice(0, 8)}`;
}

function entitySet(cap: CapabilityDoc["capabilities"][number]): Set<string> {
  const s = new Set<string>();
  for (const e of [...(cap.produces ?? []), ...(cap.consumes ?? [])]) s.add(norm(e));
  return s;
}

export function mockGroupContexts(doc: CapabilityDoc): ContextsDoc {
  const caps = [...doc.capabilities].sort((a, b) => a.id.localeCompare(b.id));
  const n = caps.length;
  if (n === 0) return { version: "0.1", contexts: [] };

  const ent = new Map(caps.map((c) => [c.id, entitySet(c)]));
  const dependsPair = (a: string, b: string): boolean => {
    const ca = caps.find((x) => x.id === a);
    const cb = caps.find((x) => x.id === b);
    return !!(ca?.depends_on?.includes(b) || cb?.depends_on?.includes(a));
  };
  const affinity = (a: string, b: string): number => {
    const shared = [...(ent.get(a) ?? [])].filter((e) => ent.get(b)?.has(e)).length;
    return (shared > 0 ? 1 : 0) + (dependsPair(a, b) ? 1 : 0);
  };

  // Agglomerative merge of highest-affinity clusters under a size cap → several cohesive areas.
  let clusters: string[][] = caps.map((c) => [c.id]);
  const sizeCap = Math.max(2, Math.ceil(n / 3));
  for (;;) {
    let best = { i: -1, j: -1, score: 0 };
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        if (clusters[i].length + clusters[j].length > sizeCap) continue;
        let score = 0;
        for (const a of clusters[i]) for (const b of clusters[j]) score += affinity(a, b);
        if (score > best.score) best = { i, j, score };
      }
    }
    if (best.score === 0) break; // no positive-affinity mergeable pair remains
    clusters[best.i] = [...clusters[best.i], ...clusters[best.j]];
    clusters = clusters.filter((_, k) => k !== best.j);
  }

  const nameOf = (c: CapabilityDoc["capabilities"][number] | undefined): string => c?.name ?? c?.id ?? "?";
  const contexts: ContextInput[] = clusters.map((members) => {
    const sorted = [...members].sort();
    const memberCaps = sorted.map((id) => caps.find((c) => c.id === id));
    // Boundary evidence for BC8: a shared entity across members, else the first member's entity.
    const sharedEntity = [...(ent.get(sorted[0]) ?? [])].find((e) => sorted.every((m) => ent.get(m)?.has(e)));
    const anchor = sharedEntity ?? [...(ent.get(sorted[0]) ?? [])][0] ?? `seed_${slug(sorted[0])}`;
    const label = memberCaps.map(nameOf).slice(0, 3).join(" & ");
    return {
      id: fingerprintId(sorted),
      name: label,
      intent: `Groups ${memberCaps.map(nameOf).join(", ")}`,
      capabilities: sorted,
      shared_kernel: [],
      meta: { origin: "llm", skillVersion: "contextgen-mock@0.1", derivedFrom: [{ anchor }] },
    };
  });

  return { version: "0.1", contexts };
}

// ---------------------------------------------------------------------------------------------
// ContextGrouper (SPEC-003 BC-M3) — real LLM subdomain partitioning, provider-agnostic, server-side.
// ---------------------------------------------------------------------------------------------

export const CONTEXT_SYSTEM_PROMPT = PROMPTS["contexts"];

export function renderContextUserPrompt(caps: CapabilityDoc): string {
  const lines = ["# Capabilities to partition (use these exact ids)", ""];
  for (const c of caps.capabilities) {
    lines.push(`- ${c.id} — ${c.name}: ${c.purpose ?? ""}`);
    if (c.depends_on?.length) lines.push(`    depends_on: ${c.depends_on.join(", ")}`);
    if (c.produces?.length) lines.push(`    produces: ${c.produces.join(", ")}`);
    if (c.consumes?.length) lines.push(`    consumes: ${c.consumes.join(", ")}`);
  }
  lines.push("", "Return a business-areas JSON document that partitions ALL of the capability ids above.");
  return lines.join("\n");
}

/** Structured-output schema. Cannot encode the partition invariant (BC2 owns it); no hard 2–6 bounds. */
export const CONTEXT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["version", "contexts"],
  properties: {
    version: { type: "string" },
    contexts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "capabilities"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          intent: { type: "string" },
          capabilities: { type: "array", items: { type: "string" } },
          shared_kernel: { type: "array", items: { type: "string" } },
          derivedFrom: {
            type: "array",
            items: { type: "object", additionalProperties: false, properties: { anchor: { type: "string" } } },
          },
        },
      },
    },
  },
} as const;

export function buildContextRequest(caps: CapabilityDoc): LlmRequest {
  return { system: CONTEXT_SYSTEM_PROMPT, user: renderContextUserPrompt(caps), schema: CONTEXT_SCHEMA, context: caps };
}

/**
 * Coerce raw model JSON to a ContextsDoc AND canonicalize member ids to real capability ids
 * (REV-014 BC-F4): the model may emit `lead-management` for `lead_management`. Matched by slug.
 */
export function coerceContextsDoc(json: unknown, caps: CapabilityDoc): ContextsDoc | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  if (!Array.isArray(obj.contexts)) return null;
  const bySlug = new Map(caps.capabilities.map((c) => [slug(c.id), c.id]));
  const canon = (m: string): string => bySlug.get(slug(m)) ?? m; // snap to real id, else keep (BC4 flags)
  const contexts: ContextInput[] = obj.contexts.map((raw) => {
    const c = raw as Record<string, unknown>;
    const members = (Array.isArray(c.capabilities) ? (c.capabilities as string[]) : []).map(canon);
    const kernel = (Array.isArray(c.shared_kernel) ? (c.shared_kernel as string[]) : []).map(canon);
    const derivedFrom = Array.isArray(c.derivedFrom) ? c.derivedFrom : [];
    return {
      id: fingerprintId(members), // REV-014 BC-F3: identity from the member set, not the name
      name: typeof c.name === "string" ? c.name : "",
      intent: typeof c.intent === "string" ? c.intent : "",
      capabilities: members,
      shared_kernel: kernel,
      meta: { origin: "llm", derivedFrom },
    };
  });
  return { version: typeof obj.version === "string" ? obj.version : "0.1", contexts };
}

export interface ContextGenerationResult {
  doc: ContextsDoc;
  findings: Finding[];
  provider: string;
  repaired: boolean;
}

// ---------------------------------------------------------------------------------------------
// Semantic critic (the LLM reviews its OWN output). Deterministic validators catch mechanical
// errors; this catches the semantic ones — over/under-segmentation, incoherent groupings, a
// capability that would sit better elsewhere. Advisory: the critic proposes, the human decides.
// ---------------------------------------------------------------------------------------------

/** An advisory critique finding (NOT a hard validator finding — it carries a human-readable fix). */
export interface CritiqueFinding {
  id: string;
  severity: "concern" | "suggestion";
  message: string;
  suggestion?: string;
  /** the area or capability the finding is about (for click-through); ids where resolvable. */
  area?: string;
  capability?: string;
}

export const CONTEXT_CRITIQUE_SYSTEM_PROMPT = PROMPTS["contexts-critique"];

export function renderContextCritiquePrompt(caps: CapabilityDoc, contexts: ContextsDoc): string {
  const lines = ["# Capabilities", ""];
  for (const c of caps.capabilities) lines.push(`- ${c.id} — ${c.name}: ${c.purpose ?? ""}${c.depends_on?.length ? ` (depends on: ${c.depends_on.join(", ")})` : ""}`);
  lines.push("", "# Proposed business areas", "");
  for (const a of contexts.contexts) lines.push(`- ${a.name} — ${a.intent ?? ""} → [${(a.capabilities ?? []).join(", ")}]`);
  lines.push("", "Review this grouping. What is wrong or could be better?");
  return lines.join("\n");
}

export const CONTEXT_CRITIQUE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["findings"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "message"],
        properties: {
          severity: { type: "string", enum: ["concern", "suggestion"] },
          message: { type: "string" },
          suggestion: { type: "string" },
          area: { type: "string" },
          capability: { type: "string" },
        },
      },
    },
  },
} as const;

export interface ContextCritiqueResult {
  findings: CritiqueFinding[];
  provider: string;
}

/** Run the semantic critic over a business-area partition. Advisory only — never blocks. */
export async function critiqueContexts(caps: CapabilityDoc, contexts: ContextsDoc, provider: LlmProvider): Promise<ContextCritiqueResult> {
  const req: LlmRequest = { system: CONTEXT_CRITIQUE_SYSTEM_PROMPT, user: renderContextCritiquePrompt(caps, contexts), schema: CONTEXT_CRITIQUE_SCHEMA, context: caps };
  const res = await provider.complete(req);
  const obj = (res.json && typeof res.json === "object" ? res.json : {}) as Record<string, unknown>;
  const raw = Array.isArray(obj.findings) ? obj.findings : [];
  // Best-effort resolve area names→ids and capability names→ids for click-through.
  const areaByKey = new Map<string, string>();
  for (const a of contexts.contexts) { areaByKey.set(slug(a.id), a.id); areaByKey.set(slug(a.name), a.id); }
  const capByKey = new Map<string, string>();
  for (const c of caps.capabilities) { capByKey.set(slug(c.id), c.id); capByKey.set(slug(c.name), c.id); }
  const findings: CritiqueFinding[] = raw.map((r) => {
    const f = r as Record<string, unknown>;
    const message = typeof f.message === "string" ? f.message : "";
    return {
      id: sha256(`${f.severity}|${message}`).slice(0, 10),
      severity: f.severity === "concern" ? "concern" : "suggestion",
      message,
      suggestion: typeof f.suggestion === "string" ? f.suggestion : undefined,
      area: typeof f.area === "string" ? areaByKey.get(slug(f.area)) ?? f.area : undefined,
      capability: typeof f.capability === "string" ? capByKey.get(slug(f.capability)) ?? f.capability : undefined,
    };
  });
  return { findings, provider: res.provider };
}

/** ContextGrouper skill: capabilities → business-areas partition, canonicalized + validated. */
export async function generateContexts(caps: CapabilityDoc, provider: LlmProvider, feedback?: string): Promise<ContextGenerationResult> {
  const req = buildContextRequest(caps);
  if (feedback) req.user += `\n\n${feedback}`;
  // Repair fires on a broken PARTITION (BC2.*), not only blockers (REV-014 BC-F1).
  const isRepairable = (f: Finding): boolean => f.severity === "blocker" || f.code.startsWith("BC2.");

  let result = await provider.complete(req);
  let doc = coerceContextsDoc(result.json, caps);
  let findings = doc ? validateContexts(doc, caps) : [];
  let repaired = false;

  if (!doc || findings.some(isRepairable)) {
    repaired = true;
    const broken = findings.filter(isRepairable).map((f) => f.subjects.join("/")).join(", ");
    const retry = {
      ...req,
      user: `${req.user}\n\nThe previous partition was invalid (${broken || "unparseable"}). Every capability id must appear in exactly one area's "capabilities". Return corrected JSON only.`,
    };
    result = await provider.complete(retry);
    doc = coerceContextsDoc(result.json, caps);
    findings = doc ? validateContexts(doc, caps) : [];
  }

  return { doc: doc ?? { version: "0.1", contexts: [] }, findings, provider: result.provider, repaired };
}
