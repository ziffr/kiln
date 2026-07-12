import { PROMPTS } from "./prompts.generated.ts";
/**
 * generateCommunications — the LLM refines the communication layer. Given the model's entities + events,
 * it proposes the RIGHT notify/render actions for THIS business: channel (email/Slack/pdf), a recipient
 * binding, a subject, and a template with {{field}} placeholders. Better than the heuristic default
 * (`mockCommunications` in @vbd/codegen), which a human can also start from. Coerced + validated here.
 */

import { slug } from "@vbd/ir";
import type { CapabilityDoc, DomainDoc } from "@vbd/compiler";
import { attributeSpecs } from "@vbd/compiler";
import type { CommunicationsDoc, CommAction } from "@vbd/codegen";
import type { LlmProvider } from "./types.ts";

export const COMMS_SYSTEM_PROMPT = PROMPTS["communications"];

export function renderCommsUserPrompt(caps: CapabilityDoc, domain: DomainDoc): string {
  const capName = new Map(caps.capabilities.map((c) => [c.id, c.name || c.id]));
  const lines = [`# Business: ${caps.domain}`, "", "## Events (candidate triggers) — id · entity · owning capability", ""];
  for (const e of domain.events ?? []) {
    const a = domain.aggregates.find((x) => x.id === e.aggregate);
    const fields = a ? attributeSpecs(a).map((f) => slug(f.name)).join(", ") : "";
    lines.push(`- ${e.id} · ${e.aggregate} (${capName.get(a?.owner ?? "") ?? ""}) · fields: ${fields}${(a?.references ?? []).length ? ` · refs: ${(a?.references ?? []).join(", ")}` : ""}`);
  }
  lines.push("", "Propose the communications this business sends. Only trigger on real lifecycle events. Bind recipients to fields (e.g. {{customer_email}}) or channels (#sales). Output ONLY the JSON.");
  return lines.join("\n");
}

export const COMMS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["actions"],
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "channel", "on", "entity", "recipient", "subject", "template"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          channel: { type: "string", enum: ["email", "slack", "pdf", "spreadsheet"] },
          on: { type: "string", description: "an event id" },
          entity: { type: "string", description: "the event's aggregate id" },
          recipient: { type: "string" },
          subject: { type: "string" },
          template: { type: "string", description: "body with {{field}} placeholders" },
        },
      },
    },
  },
} as const;

/** Keep only actions whose trigger + entity exist and whose channel is known. */
export function coerceCommunications(json: unknown, domain: DomainDoc): CommunicationsDoc {
  const eventIds = new Set((domain.events ?? []).map((e) => e.id));
  const aggIds = new Set(domain.aggregates.map((a) => a.id));
  const raw = (json && typeof json === "object" ? (json as { actions?: unknown }).actions : undefined) ?? [];
  const actions = (Array.isArray(raw) ? raw : [])
    .map((a) => a as CommAction)
    .filter((a) => a && eventIds.has(a.on) && aggIds.has(a.entity) && ["email", "slack", "pdf", "spreadsheet"].includes(a.channel))
    .map((a) => ({ ...a, id: slug(a.id || `${a.channel}_${a.on}`) }));
  return { actions };
}

export async function generateCommunications(caps: CapabilityDoc, domain: DomainDoc, provider: LlmProvider): Promise<CommunicationsDoc> {
  const res = await provider.complete({ system: COMMS_SYSTEM_PROMPT, user: renderCommsUserPrompt(caps, domain), schema: COMMS_SCHEMA, context: { caps, domain } });
  return coerceCommunications(res.json, domain);
}
