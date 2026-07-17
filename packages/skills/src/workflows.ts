import { PROMPTS } from "./prompts.generated.ts";
/**
 * Workflow generator (SPEC-007). Mock + LLM `WorkflowModeler`. A workflow is a named multi-step
 * business process — an ordered sequence of existing commands (Order-to-Cash, Onboarding, …).
 */

import { slug } from "@kiln/ir";
import type { DomainDoc, WorkflowInput, WorkflowsDoc } from "@kiln/compiler";
import { validateWorkflows, type Finding } from "@kiln/validation";
import type { LlmProvider, LlmRequest } from "./types.ts";

const grounded = (anchor: string) => ({ origin: "mock", derivedFrom: [{ anchor }] });

/** Offline default: one "Main Process" chaining every command in a stable order. */
export function mockGenerateWorkflows(domain: DomainDoc): WorkflowsDoc {
  const steps = (domain.commands ?? []).map((c) => c.id);
  if (steps.length < 2) return { version: "0.1", workflows: [] };
  return { version: "0.1", workflows: [{ id: "main_process", name: "Main Process", steps, meta: grounded("all-commands") }] };
}

export const WORKFLOW_SYSTEM_PROMPT = PROMPTS["workflows"];

export function renderWorkflowUserPrompt(domain: DomainDoc): string {
  const lines = ["# Commands (ordered steps must be these ids)", ""];
  for (const c of domain.commands ?? []) lines.push(`- ${c.id} — ${c.name} [entity: ${c.aggregate}]`);
  lines.push("", "Return the end-to-end workflows the business runs, as ordered command sequences.");
  return lines.join("\n");
}

export const WORKFLOW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["version", "workflows"],
  properties: {
    version: { type: "string" },
    workflows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "steps"],
        properties: {
          name: { type: "string" },
          steps: { type: "array", items: { type: "string" } },
          derivedFrom: { type: "array", items: { type: "object", additionalProperties: false, properties: { anchor: { type: "string" } } } },
        },
      },
    },
  },
} as const;

export function buildWorkflowRequest(domain: DomainDoc): LlmRequest {
  return { system: WORKFLOW_SYSTEM_PROMPT, user: renderWorkflowUserPrompt(domain), schema: WORKFLOW_SCHEMA, context: domain };
}

export function coerceWorkflows(json: unknown, domain: DomainDoc): WorkflowsDoc {
  const bySlug = new Map<string, string>();
  for (const c of domain.commands ?? []) { bySlug.set(slug(c.id), c.id); bySlug.set(slug(c.name), c.id); }
  const obj = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const raw = Array.isArray(obj.workflows) ? obj.workflows : [];
  const withAnchor = (df: unknown, f: string): Array<Record<string, unknown>> => {
    const arr = Array.isArray(df) ? (df as Array<Record<string, unknown>>) : [];
    return arr.some((d) => typeof d?.anchor === "string" && (d.anchor as string).trim()) ? arr : [{ anchor: f }];
  };
  const seen = new Set<string>();
  const workflows: WorkflowInput[] = [];
  for (const r of raw) {
    const o = r as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name : "";
    let id = slug(name) || `workflow_${workflows.length + 1}`;
    while (seen.has(id)) id = `${id}_${workflows.length + 1}`;
    seen.add(id);
    const steps = (Array.isArray(o.steps) ? (o.steps as string[]) : []).map((s) => bySlug.get(slug(s)) ?? s);
    workflows.push({ id, name, steps, meta: { origin: "llm", derivedFrom: withAnchor(o.derivedFrom, name || id) } });
  }
  return { version: typeof obj.version === "string" ? obj.version : "0.1", workflows };
}

export interface WorkflowGenerationResult {
  doc: WorkflowsDoc;
  findings: Finding[];
  provider: string;
  repaired: boolean;
}

export async function generateWorkflows(domain: DomainDoc, provider: LlmProvider, feedback?: string): Promise<WorkflowGenerationResult> {
  const cmdIds = (domain.commands ?? []).map((c) => c.id);
  const isRepairable = (f: Finding): boolean => f.severity === "blocker" || f.code.startsWith("WF2.");
  const req = buildWorkflowRequest(domain);
  if (feedback) req.user += `\n\n${feedback}`;
  let res = await provider.complete(req);
  let doc = coerceWorkflows(res.json, domain);
  let findings = validateWorkflows(doc, cmdIds);
  let repaired = false;
  if (findings.some(isRepairable)) {
    repaired = true;
    const bad = findings.filter(isRepairable).map((f) => f.subjects.join("/")).join(", ");
    res = await provider.complete({ ...req, user: `${req.user}\n\nThe previous output had unknown steps (${bad}). Every step must be a listed command id. Return corrected JSON only.` });
    doc = coerceWorkflows(res.json, domain);
    findings = validateWorkflows(doc, cmdIds);
  }
  return { doc, findings, provider: res.provider, repaired };
}
