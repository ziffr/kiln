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

/**
 * The provenance of a coverage cell:
 *   'none' — nothing reaches the capability on this layer (a structural gap).
 *   'mock' — reached ONLY by blanket mock scaffolding (`meta.origin === "mock"`), or, for the owner
 *            cell, by an agent whose behaviour is still undesigned. Structurally covered, but nothing
 *            has actually been generated for it yet.
 *   'real' — reached by hand-authored or LLM-generated content (`meta.origin !== "mock"`), and, for an
 *            agent owner, one that also has authored `instructions` (a designed agent).
 *
 * `entity`/`behaviour`/`owner` stay boolean STRUCTURAL coverage (`prov !== 'none'`) so the existing chain
 * break / soft gap / dangling-ref reduction is unchanged; the `*Prov` fields add the honesty layer on top:
 * a 100%-mock model is structurally coherent but not actually generated.
 */
export type CellProvenance = "none" | "mock" | "real";

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
  /** provenance of the entity cell — is the owning aggregate real, or mock scaffolding? */
  entityProv: CellProvenance;
  /** provenance of the behaviour cell — is any command real, or mock scaffolding? */
  behaviourProv: CellProvenance;
  /** provenance of the owner cell — a REAL owner is a non-mock role, or a non-mock DESIGNED agent
   *  (one with authored `instructions`). A mock role or an undesigned/mock agent is only 'mock'. */
  ownerProv: CellProvenance;
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
  // Read `meta.origin` defensively (meta is loosely typed). "real" is anything NOT stamped mock — i.e.
  // hand-authored (no origin / "authored") OR llm-generated. Only the blanket mock scaffolding is "mock".
  const originOf = (x: { meta?: unknown } | undefined): string | undefined => {
    const o = (x?.meta as { origin?: unknown } | undefined)?.origin;
    return typeof o === "string" ? o : undefined;
  };
  const isReal = (x: { meta?: unknown } | undefined): boolean => originOf(x) !== "mock";
  // Fold a set of contributors into a cell provenance: none if empty, real if ANY is real, else mock.
  const fold = <T,>(items: T[], real: (t: T) => boolean): CellProvenance =>
    items.length === 0 ? "none" : items.some(real) ? "real" : "mock";

  const aggregates = m.domain?.aggregates ?? [];
  const commands = m.domain?.commands ?? [];
  const roles = m.roles?.roles ?? [];
  const agents = m.agents?.agents ?? [];

  return m.caps.capabilities.map((c) => {
    const owningAggs = aggregates.filter((a) => a.owner === c.id);
    const capCmds = commands.filter((cmd) => (cmd as { capability?: string }).capability === c.id);
    const owningRoles = roles.filter((r) => (r.capabilities ?? []).includes(c.id));
    const owningAgents = agents.filter((a) => (a.capabilities ?? []).includes(c.id));
    // An agent is a REAL owner only if it is non-mock AND actually designed (authored `instructions`).
    // A mock agent, or an llm agent whose behaviour is still the undesigned placeholder, is only 'mock'.
    const designedAgents = owningAgents.filter((a) => isReal(a) && !!a.instructions?.trim());
    const anyRealOwner = owningRoles.some(isReal) || designedAgents.length > 0;
    const ownerProv: CellProvenance =
      owningRoles.length === 0 && owningAgents.length === 0 ? "none" : anyRealOwner ? "real" : "mock";
    return {
      id: c.id,
      name: c.name ?? c.id,
      entity: owningAggs.length > 0,
      behaviour: capCmds.length > 0,
      owner: owningRoles.length > 0 || owningAgents.length > 0,
      entityProv: fold(owningAggs, isReal),
      behaviourProv: fold(capCmds, isReal),
      ownerProv,
    };
  });
}
