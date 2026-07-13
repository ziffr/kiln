/** @kiln/eval — WORKFLOW evaluation (SPEC-007). Defect detection + step-coverage. */
import type { DomainDoc, WorkflowsDoc } from "@kiln/compiler";
import { validateWorkflows, type Finding } from "@kiln/validation";
import type { ExpectedDefect } from "./index.ts";

export interface WorkflowsEvalCase { id: string; description: string; workflows: WorkflowsDoc; commandIds: string[]; expected: ExpectedDefect[] }
const matches = (e: ExpectedDefect, f: Finding): boolean => f.code === e.code && (e.subject ? f.subjects.includes(e.subject) : true);
export function scoreWorkflowsCase(c: WorkflowsEvalCase): { matched: number; expectedCount: number; unmet: ExpectedDefect[] } {
  const findings = validateWorkflows(c.workflows, c.commandIds);
  const unmet = c.expected.filter((e) => !findings.some((f) => matches(e, f)));
  return { matched: c.expected.length - unmet.length, expectedCount: c.expected.length, unmet };
}
export function aggregateWorkflowsRecall(scores: { matched: number; expectedCount: number }[]): number {
  const t = scores.reduce((a, s) => a + s.expectedCount, 0), h = scores.reduce((a, s) => a + s.matched, 0);
  return t ? h / t : 1;
}
export interface WorkflowCoverage { commandCoverage: number; workflowCount: number; uncovered: string[] }
export function scoreWorkflowCoverage(domain: DomainDoc, workflows: WorkflowsDoc): WorkflowCoverage {
  const cmds = (domain.commands ?? []).map((c) => c.id);
  const inFlow = new Set(workflows.workflows.flatMap((w) => w.steps ?? []));
  const uncovered = cmds.filter((c) => !inFlow.has(c));
  return { commandCoverage: cmds.length ? (cmds.length - uncovered.length) / cmds.length : 1, workflowCount: workflows.workflows.length, uncovered };
}
