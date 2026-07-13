import { PROMPTS } from "./prompts.generated.ts";
/**
 * Policy/reaction generator (SPEC-005). A deterministic offline MOCK plus the real LLM
 * `PolicyModeler`. A policy is a stateless `on event → then command` rule — the sanctioned way to
 * cross an aggregate boundary (Invoice Paid → Schedule Installation).
 *
 * Bias: PRECISION over recall (REV-022 M4 / REV-024 PF-F1) — a policy per event is the degenerate
 * over-wired case, so both the mock and the skill stay conservative and prefer CROSS-entity
 * hand-offs. Ids are fingerprints of the (on, then) pair (REV-024) so identity is stable.
 */

import { slug, sha256 } from "@kiln/ir";
import type { DomainDoc, PolicyInput } from "@kiln/compiler";
import { validatePolicies, type Finding } from "@kiln/validation";
import type { LlmProvider, LlmRequest } from "./types.ts";

const grounded = (anchor: string) => ({ origin: "llm", derivedFrom: [{ anchor }] });
export const policyId = (on: string, then: string): string => `pol_${sha256(`${on}|${then}`).slice(0, 8)}`;

const HANDOFF = /(paid|approved|completed|qualified|issued|confirmed|converted|accepted|shipped|delivered|closed|won)$/i;
const START = /^(create|start|open|schedule|register|issue|request|plan|initiate|prepare|generate)/i;

/** Deterministic offline reactions: wire a "hand-off" event to a "start" command on ANOTHER entity. */
export function mockGeneratePolicies(domain: DomainDoc): DomainDoc {
  const commands = domain.commands ?? [];
  const events = domain.events ?? [];
  const policies: PolicyInput[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    if (!HANDOFF.test(e.id) && !HANDOFF.test(e.name)) continue;
    const target = commands.find((c) => (START.test(c.id) || START.test(c.name)) && c.aggregate !== e.aggregate);
    if (!target) continue;
    const id = policyId(e.id, target.id);
    if (seen.has(id)) continue;
    seen.add(id);
    policies.push({
      id,
      name: `When ${e.name}, ${target.name}`,
      on: e.id,
      then: target.id,
      meta: grounded(e.aggregate),
    });
    if (policies.length >= 4) break; // stay lean (anti over-wiring)
  }
  return { ...domain, policies };
}

// ---------------------------------------------------------------------------------------------
// PolicyModeler (SPEC-005 PL-M3) — real LLM reaction derivation, single call, server-side.
// ---------------------------------------------------------------------------------------------

export const POLICY_SYSTEM_PROMPT = PROMPTS["policies"];

export function renderPolicyUserPrompt(domain: DomainDoc): string {
  const lines = ["# Events (ids you may use for \"on\")", ""];
  for (const e of domain.events ?? []) lines.push(`- ${e.id} — ${e.name} [entity: ${e.aggregate}]`);
  lines.push("", "# Commands (ids you may use for \"then\")", "");
  for (const c of domain.commands ?? []) lines.push(`- ${c.id} — ${c.name} [entity: ${c.aggregate}]`);
  lines.push("", "Return the cross-entity reactions the business flow needs — conservatively.");
  return lines.join("\n");
}

export const POLICY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["version", "policies"],
  properties: {
    version: { type: "string" },
    policies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "on", "then"],
        properties: {
          name: { type: "string" },
          on: { type: "string" },
          then: { type: "string" },
          condition: { type: "string" },
          derivedFrom: { type: "array", items: { type: "object", additionalProperties: false, properties: { anchor: { type: "string" } } } },
        },
      },
    },
  },
} as const;

export function buildPolicyRequest(domain: DomainDoc): LlmRequest {
  return { system: POLICY_SYSTEM_PROMPT, user: renderPolicyUserPrompt(domain), schema: POLICY_SCHEMA, context: domain };
}

/** Coerce + canonicalize on/then to real event/command ids (id-first, then by name — REV-024 PF-F2). */
export function coercePolicies(json: unknown, domain: DomainDoc): DomainDoc {
  const eventBySlug = new Map<string, string>();
  for (const e of domain.events ?? []) { eventBySlug.set(slug(e.id), e.id); eventBySlug.set(slug(e.name), e.id); }
  const commandBySlug = new Map<string, string>();
  for (const c of domain.commands ?? []) { commandBySlug.set(slug(c.id), c.id); commandBySlug.set(slug(c.name), c.id); }

  const obj = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const raw = Array.isArray(obj.policies) ? obj.policies : [];
  const withAnchor = (df: unknown, fallback: string): Array<Record<string, unknown>> => {
    const arr = Array.isArray(df) ? (df as Array<Record<string, unknown>>) : [];
    return arr.some((d) => typeof d?.anchor === "string" && (d.anchor as string).trim()) ? arr : [{ anchor: fallback }];
  };
  const seen = new Set<string>();
  const policies: PolicyInput[] = [];
  for (const r of raw) {
    const p = r as Record<string, unknown>;
    const on = eventBySlug.get(slug(String(p.on ?? ""))) ?? String(p.on ?? "");
    const then = commandBySlug.get(slug(String(p.then ?? ""))) ?? String(p.then ?? "");
    const id = policyId(on, then);
    if (seen.has(id)) continue; // dedupe by (on,then)
    seen.add(id);
    policies.push({
      id,
      name: typeof p.name === "string" ? p.name : "",
      on,
      then,
      condition: typeof p.condition === "string" ? p.condition : undefined,
      meta: { origin: "llm", derivedFrom: withAnchor(p.derivedFrom, on) },
    });
  }
  return { ...domain, policies };
}

export interface PolicyGenerationResult {
  doc: DomainDoc;
  findings: Finding[];
  provider: string;
  repaired: boolean;
}

/** PolicyModeler skill: events + commands → cross-entity reactions, canonicalized + validated. */
export async function generatePolicies(domain: DomainDoc, capabilityIds: string[], provider: LlmProvider, feedback?: string): Promise<PolicyGenerationResult> {
  const isRepairable = (f: Finding): boolean =>
    f.severity === "blocker" || f.code.startsWith("PL1.") || f.code.startsWith("PL2.") || f.code.startsWith("PL3.");
  const req = buildPolicyRequest(domain);
  if (feedback) req.user += `\n\n${feedback}`;

  let res = await provider.complete(req);
  let doc = coercePolicies(res.json, domain);
  let findings = validatePolicies(doc, capabilityIds);
  let repaired = false;
  if (findings.some(isRepairable)) {
    repaired = true;
    const bad = findings.filter(isRepairable).map((f) => f.subjects.join("/")).join(", ");
    res = await provider.complete({ ...req, user: `${req.user}\n\nThe previous output had invalid references (${bad}). Every "on" must be a listed event id and every "then" a listed command id. Return corrected JSON only.` });
    doc = coercePolicies(res.json, domain);
    findings = validatePolicies(doc, capabilityIds);
  }
  return { doc, findings, provider: res.provider, repaired };
}
