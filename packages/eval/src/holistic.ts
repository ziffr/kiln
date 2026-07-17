/**
 * @kiln/eval — WHOLE-MODEL coherence score (the cross-layer exit gate).
 *
 * Every other scorer here judges ONE layer. This one judges whether the layers, generated top-down and
 * each from the layer above, actually tell one coherent story end to end — the gap Kiln's per-layer
 * generation can't see. It reduces the shared coverage matrix (@kiln/compiler `coverageMatrix`, the same
 * one the LLM `holistic` critic renders) to a headline number, and folds in the deterministic validators'
 * dangling/orphan findings so a structural break can't be scored away.
 *
 *   coherence        — 0..1 headline: the fraction of capabilities whose chain is complete
 *                      (entity && behaviour && owner), capped at 0.5 when any dangling ref exists.
 *   entity/behaviour/ownerCoverage — the three per-column fractions behind it.
 *   chainBreaks      — capabilities missing an entity OR behaviour: HARD breaks (nothing operates them).
 *   softGaps         — capabilities with entity+behaviour but no role/agent owner: a soft gap.
 *   danglingRefs     — count of cross-layer dangling/orphan findings from the deterministic validators.
 *   generatedCoverage— 0..1: the fraction of capabilities whose whole chain is REALLY generated (every
 *                      cell provenance 'real'), NOT blanket mock scaffolding. Structural `coherence`
 *                      can't tell a 100%-mock model from a built one; this can.
 *   scaffoldOnly     — capabilities structurally covered but partly/only mock scaffolding (or owned only
 *                      by an undesigned agent): "looks coherent, isn't really generated yet."
 *
 * Pure and deterministic — no LLM, key, or cost. Gold-free (like every scorer in this package).
 */

import { coverageMatrix, type CapCoverage, type CapabilityDoc, type DomainDoc, type ContextsDoc, type RolesDoc, type AgentsDoc } from "@kiln/compiler";
import { validateV5, validateDomain, validateContexts, validateEvents, type Finding } from "@kiln/validation";

/** The model slice the coherence score reads. Only `caps` is required; every other layer is optional. */
export interface CoherenceModel {
  caps: CapabilityDoc;
  domain?: DomainDoc;
  contexts?: ContextsDoc;
  roles?: RolesDoc;
  agents?: AgentsDoc;
}

export interface HolisticCoherence {
  /** 0..1 headline — chained capabilities, capped at 0.5 when a structural dangling ref exists. */
  coherence: number;
  entityCoverage: number;
  behaviourCoverage: number;
  ownerCoverage: number;
  /** capabilities with no entity OR no behaviour — a broken chain (nothing operates them). */
  chainBreaks: CapCoverage[];
  /** capabilities that ARE operated (entity + behaviour) but have no role/agent owner — a soft gap. */
  softGaps: CapCoverage[];
  /** count of structural dangling/orphan findings across the layers (a hard structural break). */
  danglingRefs: number;
  /** 0..1 — fraction of capabilities whose FULL chain is REAL (entity, behaviour AND owner all
   *  provenance 'real'). Structural `coherence` can't tell blanket mock scaffolding from generated
   *  content; this can. A 100%-mock model scores high on `coherence` but 0 here. */
  generatedCoverage: number;
  /** capabilities that are structurally covered (NOT a chainBreak) but whose coverage is partly/only
   *  mock scaffolding or an undesigned-agent owner — "still scaffolding, not really generated". */
  scaffoldOnly: CapCoverage[];
  /** the full coverage matrix (for display). */
  matrix: CapCoverage[];
}

/** Validator codes that signal a cross-layer dangling reference or an orphaned node. */
const DANGLING_CODES = new Set(["V5.dangling", "DM6.dangling", "BC4.dangling", "CE8.orphan_event", "CE.emit_boundary"]);

/**
 * Score the whole-model coherence of a model. `coverageMatrix` gives the per-capability chain; the
 * deterministic validators (run only for the layers actually present) give the dangling/orphan count.
 * Empty capability list → coherence 1 (nothing to break), matching the "1 when empty" convention of the
 * other scorers.
 */
export function scoreHolisticCoherence(model: CoherenceModel): HolisticCoherence {
  const matrix = coverageMatrix(model);
  const capIds = model.caps.capabilities.map((c) => c.id);

  const chainBreaks = matrix.filter((c) => !c.entity || !c.behaviour);
  const softGaps = matrix.filter((c) => c.entity && c.behaviour && !c.owner);

  const frac = (n: number): number => (matrix.length ? n / matrix.length : 1);
  const entityCoverage = frac(matrix.filter((c) => c.entity).length);
  const behaviourCoverage = frac(matrix.filter((c) => c.behaviour).length);
  const ownerCoverage = frac(matrix.filter((c) => c.owner).length);

  // A capability's chain is REALLY generated only when every cell is provenance 'real' (not blanket mock
  // scaffolding, and its owner is a designed agent or a real role). `scaffoldOnly` = structurally covered
  // (entity + behaviour, so NOT a hard chain break) but at least one PRESENT cell is still mock scaffolding
  // or an undesigned-agent owner — it looks coherent but isn't really built. A missing owner is NOT mock —
  // that's a soft gap (surfaced separately), so absence ('none') doesn't count here, only 'mock' does.
  const fullyReal = (c: CapCoverage): boolean =>
    c.entityProv === "real" && c.behaviourProv === "real" && c.ownerProv === "real";
  const generatedCoverage = frac(matrix.filter(fullyReal).length);
  const scaffoldOnly = matrix.filter(
    (c) => c.entity && c.behaviour && (c.entityProv === "mock" || c.behaviourProv === "mock" || c.ownerProv === "mock"),
  );

  // Dangling/orphan findings from the deterministic validators — only for layers that are present, so an
  // absent layer never manufactures a break. Each validator needs the capability/command id universe.
  const findings: Finding[] = [...validateV5(model.caps)];
  if (model.domain) {
    findings.push(...validateDomain(model.domain, capIds));
    findings.push(...validateEvents(model.domain, capIds));
  }
  if (model.contexts) findings.push(...validateContexts(model.contexts, model.caps));
  const danglingRefs = findings.filter((f) => DANGLING_CODES.has(f.code)).length;

  const chained = frac(matrix.filter((c) => c.entity && c.behaviour && c.owner).length);
  // A structural break caps the score: however well the chains read, a dangling ref means the model does
  // not actually wire together, so it cannot score above 0.5.
  const coherence = danglingRefs > 0 ? Math.min(chained, 0.5) : chained;

  return { coherence, entityCoverage, behaviourCoverage, ownerCoverage, chainBreaks, softGaps, danglingRefs, generatedCoverage, scaffoldOnly, matrix };
}
