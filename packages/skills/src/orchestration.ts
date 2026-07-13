import { PROMPTS } from "./prompts.generated.ts";
/**
 * Orchestration router (SPEC-009). Mock + LLM. For each business PROCESS (a workflow candidate) decide
 * whether it should run as a fixed, deterministic **workflow** or be handled by an **agent** (judgment
 * over the same commands). The decision is recorded as `WorkflowInput.mode` (authored, source of truth)
 * and DRIVES codegen: workflow-mode → an n8n process workflow; agent-mode → folded into the covering
 * agent's behaviour playbook (its tools already include those commands). This is the human-reviewable
 * recommendation the app surfaces; the model, not a runtime coin-flip, decides what fires.
 */

import { slug } from "@kiln/ir";
import type { DomainDoc, ProcessMode, WorkflowsDoc } from "@kiln/compiler";
import type { LlmProvider, LlmRequest } from "./types.ts";

export interface OrchestrationDecision {
  id: string;
  name: string;
  mode: ProcessMode;
  rationale: string;
  confidence: number;
}
export interface OrchestrationDoc {
  version?: string;
  decisions: OrchestrationDecision[];
}

// Names that signal judgement/variability → an agent; a long fixed command sequence → a workflow.
const JUDGEMENT = /qualif|triage|assess|review|evaluat|negotiat|resolv|support|monitor|recommend|prioriti|handl|decid|research|draft|dispatch|approv|escalat|investigat|diagnos|advis/i;

/**
 * Deterministic default: a process reads as an AGENT when its name signals judgement, or when it is a
 * single action (a one-step "process" is a decision, not a sequence); otherwise a fixed multi-step
 * sequence is a WORKFLOW. Borderline → workflow (deterministic is cheaper). A human/LLM refines.
 */
export function mockOrchestration(workflows: WorkflowsDoc): OrchestrationDoc {
  const decisions = (workflows.workflows ?? []).map((w) => {
    const steps = w.steps ?? [];
    const judge = JUDGEMENT.test(w.name || w.id);
    const single = steps.length <= 1;
    const mode: ProcessMode = judge || single ? "agent" : "workflow";
    const rationale =
      mode === "agent"
        ? single
          ? "A single-action process is a judgement call, not a fixed sequence — an agent fits better."
          : `"${w.name || w.id}" signals judgement (assess / decide / resolve) — an agent reasoning over the commands beats a fixed pipeline.`
        : `"${w.name || w.id}" is a fixed, ordered ${steps.length}-step sequence — deterministic, so a workflow.`;
    return { id: w.id, name: w.name || w.id, mode, rationale, confidence: judge ? 0.75 : single ? 0.6 : 0.8 };
  });
  return { version: "0.1", decisions };
}

/**
 * Fold the routing decisions back onto the workflows as the authored `mode` (source of truth for codegen).
 * Unknown ids are ignored; a workflow with no decision keeps its existing mode or defaults to "workflow".
 */
export function applyOrchestration(workflows: WorkflowsDoc, doc: OrchestrationDoc): WorkflowsDoc {
  const byId = new Map(doc.decisions.map((d) => [d.id, d.mode]));
  // "external" is a human pick (delegate to a bought service) — the LLM router only distinguishes
  // workflow vs agent, so never let auto-classify overwrite an existing external routing.
  return { version: workflows.version, workflows: (workflows.workflows ?? []).map((w) => ({ ...w, mode: w.mode === "external" ? "external" : byId.get(w.id) ?? w.mode ?? "workflow" })) };
}

export const ORCHESTRATION_SYSTEM_PROMPT = PROMPTS["orchestration"];

export function renderOrchestrationUserPrompt(workflows: WorkflowsDoc, domain?: DomainDoc): string {
  const cmdName = new Map((domain?.commands ?? []).map((c) => [c.id, c.name || c.id]));
  const lines = ["# Processes (decide workflow vs agent for each)", ""];
  for (const w of workflows.workflows ?? []) {
    const steps = (w.steps ?? []).map((s) => cmdName.get(s) ?? s).join(" → ");
    lines.push(`- ${w.name || w.id}: ${steps || "(no steps)"}`);
  }
  lines.push("", "For each process, decide: fixed workflow, or agent (judgement)? Return the JSON.");
  return lines.join("\n");
}

export const ORCHESTRATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["version", "decisions"],
  properties: {
    version: { type: "string" },
    decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "mode"],
        properties: {
          name: { type: "string" },
          mode: { type: "string", enum: ["workflow", "agent"] },
          rationale: { type: "string" },
          confidence: { type: "number" },
        },
      },
    },
  },
} as const;

export function buildOrchestrationRequest(workflows: WorkflowsDoc, domain?: DomainDoc): LlmRequest {
  return { system: ORCHESTRATION_SYSTEM_PROMPT, user: renderOrchestrationUserPrompt(workflows, domain), schema: ORCHESTRATION_SCHEMA, context: workflows };
}

export function coerceOrchestration(json: unknown, workflows: WorkflowsDoc): OrchestrationDoc {
  const byKey = new Map<string, string>();
  for (const w of workflows.workflows ?? []) { byKey.set(slug(w.id), w.id); byKey.set(slug(w.name), w.id); }
  const obj = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const raw = Array.isArray(obj.decisions) ? obj.decisions : [];
  const seen = new Set<string>();
  const decisions: OrchestrationDecision[] = [];
  for (const r of raw) {
    const o = r as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name : "";
    const id = byKey.get(slug(name)) ?? slug(name);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const mode: ProcessMode = o.mode === "agent" ? "agent" : "workflow";
    const confidence = typeof o.confidence === "number" ? Math.max(0, Math.min(1, o.confidence)) : 0.7;
    decisions.push({ id, name: name || id, mode, rationale: typeof o.rationale === "string" ? o.rationale : "", confidence });
  }
  // any workflow the model didn't rule on defaults to workflow (deterministic) so codegen is total.
  for (const w of workflows.workflows ?? []) {
    if (!seen.has(w.id)) decisions.push({ id: w.id, name: w.name || w.id, mode: "workflow", rationale: "No decision returned — defaulted to workflow.", confidence: 0.5 });
  }
  return { version: typeof obj.version === "string" ? obj.version : "0.1", decisions };
}

export interface OrchestrationResult {
  doc: OrchestrationDoc;
  workflows: WorkflowsDoc;
  provider: string;
}

/** Classify each process (workflow vs agent) and fold the decision onto the workflows' `mode`. */
export async function generateOrchestration(workflows: WorkflowsDoc, provider: LlmProvider, domain?: DomainDoc): Promise<OrchestrationResult> {
  const res = await provider.complete(buildOrchestrationRequest(workflows, domain));
  const doc = coerceOrchestration(res.json, workflows);
  return { doc, workflows: applyOrchestration(workflows, doc), provider: res.provider };
}
