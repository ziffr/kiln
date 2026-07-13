import { PROMPTS } from "./prompts.generated.ts";
/**
 * generateIntegrations — the LLM refines the integration layer. Given the entities, create-commands, and
 * events, it proposes the RIGHT inbound (acquire → a create command) and outbound (event → external
 * system) integrations for THIS business, with a field mapping. Better than the heuristic default
 * (`mockIntegrations` in @kiln/codegen). Coerced + validated here.
 */

import { slug } from "@kiln/ir";
import type { CapabilityDoc, DomainDoc } from "@kiln/compiler";
import { attributeSpecs } from "@kiln/compiler";
import type { IntegrationsDoc, IntegrationAction } from "@kiln/codegen";
import type { LlmProvider } from "./types.ts";

export const INTEGRATIONS_SYSTEM_PROMPT = PROMPTS["integrations"];

export function renderIntegrationsUserPrompt(caps: CapabilityDoc, domain: DomainDoc): string {
  const lines = [`# Business: ${caps.domain}`, "", "## Entities · fields", ""];
  for (const a of domain.aggregates) lines.push(`- ${a.id}: ${attributeSpecs(a).map((f) => slug(f.name)).join(", ")}`);
  lines.push("", "## Create-commands (inbound targets)", "");
  for (const c of domain.commands ?? []) lines.push(`- ${c.id} → ${c.aggregate}`);
  lines.push("", "## Events (outbound triggers)", "");
  for (const e of domain.events ?? []) lines.push(`- ${e.id} → ${e.aggregate}`);
  lines.push("", "Propose integrations with existing systems (CRM, Accounting/ERP, etc.). inbound.trigger = a create-command id; outbound.trigger = an event id. Give a field mapping (model field → external field). Output ONLY the JSON.");
  return lines.join("\n");
}

export const INTEGRATIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["actions"],
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "direction", "system", "entity", "trigger", "mapping"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          direction: { type: "string", enum: ["inbound", "outbound"] },
          system: { type: "string" },
          entity: { type: "string" },
          trigger: { type: "string", description: "inbound: a create-command id; outbound: an event id" },
          transport: { type: "string", enum: ["api", "xlsx", "gsheet"], description: "how records move: a JSON API (default), an Excel workbook, or a Google Sheet" },
          mapping: { type: "object", additionalProperties: { type: "string" } },
        },
      },
    },
  },
} as const;

/** Keep only actions whose entity exists and whose trigger resolves (command for inbound, event for outbound). */
export function coerceIntegrations(json: unknown, domain: DomainDoc): IntegrationsDoc {
  const aggIds = new Set(domain.aggregates.map((a) => a.id));
  const cmdIds = new Set((domain.commands ?? []).map((c) => c.id));
  const evIds = new Set((domain.events ?? []).map((e) => e.id));
  const raw = (json && typeof json === "object" ? (json as { actions?: unknown }).actions : undefined) ?? [];
  const actions = (Array.isArray(raw) ? raw : [])
    .map((a) => a as IntegrationAction)
    .filter((a) => a && aggIds.has(a.entity) && (a.direction === "inbound" ? cmdIds.has(a.trigger) : evIds.has(a.trigger)))
    .map((a) => ({ ...a, id: slug(a.id || `${a.direction}_${a.entity}_${slug(a.system)}`), mapping: a.mapping ?? {} }));
  return { actions };
}

export async function generateIntegrations(caps: CapabilityDoc, domain: DomainDoc, provider: LlmProvider): Promise<IntegrationsDoc> {
  const res = await provider.complete({ system: INTEGRATIONS_SYSTEM_PROMPT, user: renderIntegrationsUserPrompt(caps, domain), schema: INTEGRATIONS_SCHEMA, context: { caps, domain } });
  return coerceIntegrations(res.json, domain);
}
