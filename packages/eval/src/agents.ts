/** @vbd/eval — AGENT evaluation (SPEC-008). Defect detection + capability-coverage. */
import type { CapabilityDoc, AgentsDoc } from "@vbd/compiler";
import { validateAgents, type Finding } from "@vbd/validation";
import type { ExpectedDefect } from "./index.ts";

export interface AgentsEvalCase { id: string; description: string; agents: AgentsDoc; capabilityIds: string[]; expected: ExpectedDefect[] }
const matches = (e: ExpectedDefect, f: Finding): boolean => f.code === e.code && (e.subject ? f.subjects.includes(e.subject) : true);
export function scoreAgentsCase(c: AgentsEvalCase): { matched: number; expectedCount: number; unmet: ExpectedDefect[] } {
  const findings = validateAgents(c.agents, c.capabilityIds);
  const unmet = c.expected.filter((e) => !findings.some((f) => matches(e, f)));
  return { matched: c.expected.length - unmet.length, expectedCount: c.expected.length, unmet };
}
export function aggregateAgentsRecall(scores: { matched: number; expectedCount: number }[]): number {
  const t = scores.reduce((a, s) => a + s.expectedCount, 0), h = scores.reduce((a, s) => a + s.matched, 0);
  return t ? h / t : 1;
}
export interface AgentCoverage { capabilityCoverage: number; agentCount: number; uncovered: string[] }
export function scoreAgentCoverage(caps: CapabilityDoc, agents: AgentsDoc): AgentCoverage {
  const ids = caps.capabilities.map((c) => c.id);
  const run = new Set(agents.agents.flatMap((a) => a.capabilities ?? []));
  const uncovered = ids.filter((i) => !run.has(i));
  return { capabilityCoverage: ids.length ? (ids.length - uncovered.length) / ids.length : 1, agentCount: agents.agents.length, uncovered };
}
