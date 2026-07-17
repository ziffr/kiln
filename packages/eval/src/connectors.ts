/**
 * @kiln/eval — CONNECTOR (grant) evaluation (SPEC-013 Phase A, PS5).
 *
 * Connector grants have no conservation law: a model can over-suggest tools an agent doesn't need. So,
 * exactly like policies (`spuriousRate`), recall alone is not enough — `connectorRecall` (did we recover
 * the grants a faithful model should suggest?) is paired with **`spuriousSuggestionRate`** (how many
 * suggestions are NOT grounded in the agent's goal/capabilities → over-authorization). Precision, not just
 * recall, gates the layer. Pure + isomorphic; scores over a grants/suggestions fixture.
 */

import type { AgentsDoc, ToolsDoc } from "@kiln/compiler";
import { validateConnectors, type Finding } from "@kiln/validation";
import type { ExpectedDefect } from "./index.ts";

/** A suggested (agent → connector) grant. `grounded` marks a suggestion tied to the agent's goal/caps. */
export interface ConnectorSuggestion {
  agentId: string;
  toolId: string;
  operations?: string[];
  grounded?: boolean;
}

/** The (agent → connector) grants a faithful model should recover — the recall reference. */
export type ConnectorReference = Array<{ agentId: string; toolId: string }>;

const key = (agentId: string, toolId: string): string => `${agentId}|${toolId}`;

/** Fraction of reference grants present among the suggestions (matched on the agent→tool pair). */
export function connectorRecall(reference: ConnectorReference, suggestions: ConnectorSuggestion[]): number {
  if (reference.length === 0) return 1;
  const have = new Set(suggestions.map((s) => key(s.agentId, s.toolId)));
  return reference.filter((r) => have.has(key(r.agentId, r.toolId))).length / reference.length;
}

/**
 * Fraction of SUGGESTIONS that are spurious — NOT in the reference (over-wiring / authority creep). Mirror
 * of policies' `spuriousRate`. When an explicit `grounded` flag is present it also counts an ungrounded
 * suggestion as spurious, so an off-reference but goal-grounded suggestion isn't unfairly penalized only if
 * it is BOTH grounded AND in the reference — i.e. spurious = (not in reference) OR (explicitly ungrounded).
 */
export function spuriousSuggestionRate(reference: ConnectorReference, suggestions: ConnectorSuggestion[]): number {
  if (suggestions.length === 0) return 0;
  const ref = new Set(reference.map((r) => key(r.agentId, r.toolId)));
  const spurious = suggestions.filter((s) => !ref.has(key(s.agentId, s.toolId)) || s.grounded === false).length;
  return spurious / suggestions.length;
}

export interface ConnectorCoverage {
  grantCount: number;
  /** grants whose toolId + ops all resolve against the tools catalog (structurally valid). */
  resolvedRate: number;
  /** grants carrying an autonomous write/send/delete op — the ones the Phase-B invocation gate governs. */
  autonomousWriteCount: number;
}

/** Structural coverage of the authored grants against the connector catalog. Pure. */
export function scoreConnectorCoverage(tools: ToolsDoc, agents: AgentsDoc): ConnectorCoverage {
  const byId = new Map((tools.tools ?? []).map((t) => [t.id, t]));
  let grantCount = 0;
  let resolved = 0;
  let autonomousWrite = 0;
  for (const a of agents.agents ?? []) {
    for (const g of a.grants ?? []) {
      grantCount++;
      const tool = byId.get(g.toolId);
      const ops = new Map((tool?.operations ?? []).map((o) => [o.name, o.kind]));
      const allResolve = !!tool && (g.operations ?? []).every((o) => ops.has(o));
      if (allResolve) resolved++;
      if (g.autonomous && (g.operations ?? []).some((o) => ["write", "send", "delete"].includes(ops.get(o) ?? ""))) autonomousWrite++;
    }
  }
  return { grantCount, resolvedRate: grantCount ? resolved / grantCount : 1, autonomousWriteCount: autonomousWrite };
}

export interface ConnectorsEvalCase {
  id: string;
  description: string;
  tools: ToolsDoc;
  agents: AgentsDoc;
  expected: ExpectedDefect[];
}
export interface ConnectorsCaseScore {
  id: string;
  recall: number;
  precision: number;
  matched: number;
  expectedCount: number;
  foundCount: number;
  unmet: ExpectedDefect[];
}
function matches(e: ExpectedDefect, f: Finding): boolean {
  if (f.code !== e.code) return false;
  return e.subject ? f.subjects.includes(e.subject) : true;
}
/** Seeded-defect recall/precision for the TC-series over a connectors case. */
export function scoreConnectorsFindings(c: ConnectorsEvalCase, findings: Finding[]): ConnectorsCaseScore {
  const unmet = c.expected.filter((e) => !findings.some((f) => matches(e, f)));
  const matched = c.expected.length - unmet.length;
  const relevant = findings.filter((f) => c.expected.some((e) => matches(e, f)));
  return { id: c.id, recall: c.expected.length ? matched / c.expected.length : 1, precision: findings.length ? relevant.length / findings.length : 1, matched, expectedCount: c.expected.length, foundCount: findings.length, unmet };
}
export function scoreConnectorsCase(c: ConnectorsEvalCase): ConnectorsCaseScore {
  return scoreConnectorsFindings(c, validateConnectors(c.tools, c.agents));
}
