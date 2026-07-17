/**
 * @kiln/compiler — the whole-model COVERAGE MATRIX (single source of truth for coherence).
 *
 * Kiln generates the model layer by layer, each layer from the one above. That means an individual
 * layer can be sound while the WHOLE model doesn't hang together: a capability with a screen but no
 * behaviour behind it, an entity nothing operates, a capability no role or agent owns. The coverage
 * matrix is the deterministic reduction of that "does the chain reach every capability?" question.
 *
 * ONE function computes it, used by BOTH the LLM `holistic` critic (which renders it as prose for the
 * model to reason over) and the deterministic `scoreHolisticCoherence` eval (which turns it into a
 * number and gates export). Same numbers behind the gate the human sees and the prose the LLM reviews.
 *
 * Pure and isomorphic — no `node:*`, no LLM. A projection of the authored IR, never stored.
 */

import type { CapabilityDoc, DomainDoc, RolesDoc, AgentsDoc } from "./index.ts";

/** Which layers touch one capability — the chain from capability down to an owning role/agent. */
export interface CapCoverage {
  id: string;
  name: string;
  /** an aggregate is owned by this capability (the domain layer reached it). */
  entity: boolean;
  /** a command is issued by this capability (the behaviour layer reached it). */
  behaviour: boolean;
  /** a role or an agent operates this capability (someone is responsible for running it). */
  owner: boolean;
}

/** The model slice the coverage matrix reads — every field optional but `caps` (layers may be absent). */
export interface CoverageModel {
  caps: CapabilityDoc;
  domain?: DomainDoc;
  roles?: RolesDoc;
  agents?: AgentsDoc;
}

/**
 * Reduce a model to its per-capability coverage. Ported verbatim from the inline computation in the
 * `holistic` critic (packages/skills critic.ts) so the score and the prose agree by construction:
 *   entity    — the capability owns ≥1 aggregate (domain.aggregates[].owner).
 *   behaviour — the capability issues ≥1 command (domain.commands[].capability).
 *   owner     — a role OR an agent lists the capability (roles/agents[].capabilities).
 */
export function coverageMatrix(m: CoverageModel): CapCoverage[] {
  const owners = new Set((m.domain?.aggregates ?? []).map((a) => a.owner).filter(Boolean));
  const withCmd = new Set(
    (m.domain?.commands ?? []).map((c) => (c as { capability?: string }).capability ?? "").filter(Boolean),
  );
  const roleCaps = new Set((m.roles?.roles ?? []).flatMap((r) => r.capabilities ?? []));
  const agentCaps = new Set((m.agents?.agents ?? []).flatMap((a) => a.capabilities ?? []));
  return m.caps.capabilities.map((c) => ({
    id: c.id,
    name: c.name ?? c.id,
    entity: owners.has(c.id),
    behaviour: withCmd.has(c.id),
    owner: roleCaps.has(c.id) || agentCaps.has(c.id),
  }));
}
