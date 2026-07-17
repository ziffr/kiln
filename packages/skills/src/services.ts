import { PROMPTS } from "./prompts.generated.ts";
/**
 * External services (delegation) generator. Mock lives in @kiln/codegen; this is the LLM propose pass —
 * which EXISTING external workflows/agents (a bought qualifier, a contract reviewer) the business would
 * delegate to, sync or async, and where the result lands (record via a command / wake an agent).
 */

import { slug } from "@kiln/ir";
import type { CapabilityDoc, DomainDoc } from "@kiln/compiler";
import type { ExternalServicesDoc, ExternalServiceInput } from "@kiln/codegen";
import type { LlmProvider } from "./types.ts";

export const EXTERNAL_SERVICES_SYSTEM_PROMPT = PROMPTS["external-services"];

export function renderServicesUserPrompt(caps: CapabilityDoc, domain: DomainDoc): string {
  void caps;
  const lines = ["# Entities", ""];
  for (const a of domain.aggregates) lines.push(`- ${a.id} — ${a.name}`);
  lines.push("", "# Commands (result can record via one of these)", "");
  for (const c of domain.commands ?? []) lines.push(`- ${c.id} — ${c.name}`);
  lines.push("", "Propose the external services this business would delegate to. Output ONLY the JSON.");
  return lines.join("\n");
}

export const EXTERNAL_SERVICES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["services"],
  properties: {
    services: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "kind", "invocation", "entity", "endpoint", "requestMapping", "responseMapping"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          kind: { type: "string", enum: ["workflow", "agent"] },
          invocation: { type: "string", enum: ["sync", "async"] },
          entity: { type: "string" },
          endpoint: { type: "string" },
          requestMapping: { type: "object", additionalProperties: { type: "string" } },
          responseMapping: { type: "object", additionalProperties: { type: "string" } },
          resultTarget: { type: "object", additionalProperties: false, properties: { kind: { type: "string", enum: ["command", "agent"] }, ref: { type: "string" } } },
          rationale: { type: "string" },
        },
      },
    },
  },
} as const;

/**
 * Keep only services whose entity exists and whose resultTarget (if any) resolves to a real command/agent.
 *
 * The auth declaration (credentialEnv/auth/headerName) is deliberately NOT carried over: the model may
 * PROPOSE a service, but attaching a credential to it is a human grant. The schema already forbids those
 * keys; stripping them here makes that a property of the code rather than of the prompt.
 */
export function coerceExternalServices(json: unknown, domain: DomainDoc, agentIds: string[] = []): ExternalServicesDoc {
  const aggIds = new Set(domain.aggregates.map((a) => a.id));
  const cmdIds = new Set((domain.commands ?? []).map((c) => c.id));
  const agents = new Set(agentIds);
  const raw = (json && typeof json === "object" ? (json as { services?: unknown }).services : undefined) ?? [];
  const services = (Array.isArray(raw) ? raw : [])
    .map((s) => s as ExternalServiceInput)
    .filter((s) => s && aggIds.has(s.entity ?? ""))
    .map((s) => {
      const rt = s.resultTarget;
      const okTarget = rt && ((rt.kind === "command" && cmdIds.has(rt.ref)) || (rt.kind === "agent" && agents.has(slug(rt.ref))));
      const { credentialEnv: _c, auth: _a, headerName: _h, ...proposed } = s; // a credential is granted, not proposed
      return {
        ...proposed,
        id: slug(s.id || `svc_${slug(s.name || s.entity || "service")}`),
        invocation: s.invocation === "async" ? "async" : "sync",
        kind: s.kind === "workflow" ? "workflow" : "agent",
        requestMapping: s.requestMapping ?? {},
        responseMapping: s.responseMapping ?? {},
        resultTarget: okTarget ? { kind: rt!.kind, ref: rt!.kind === "agent" ? slug(rt!.ref) : rt!.ref } : undefined,
      } as ExternalServiceInput;
    });
  return { version: "0.1", services };
}

export async function generateExternalServices(caps: CapabilityDoc, domain: DomainDoc, provider: LlmProvider, agentIds: string[] = []): Promise<ExternalServicesDoc> {
  const res = await provider.complete({ system: EXTERNAL_SERVICES_SYSTEM_PROMPT, user: renderServicesUserPrompt(caps, domain), schema: EXTERNAL_SERVICES_SCHEMA, context: { caps, domain } });
  return coerceExternalServices(res.json, domain, agentIds);
}
