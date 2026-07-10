/**
 * @vbd/validation — deterministic validators over authored capabilities (SPEC-001 §5).
 *
 * Pure functions, independent of the LLM. They OWN the objective checks so the fuzzy
 * remainder (boundary/naming) is all that's left to the model (SPEC-001 §5.1).
 * M0 implements V1 (required fields) and V2 (unique/stable ids). V3–V8 land in M3.
 *
 * Findings carry a stable, content-addressed id (SPEC-001 §4.4) so dismissals survive
 * recompiles and re-runs.
 */

import { sha256 } from "@vbd/ir";
import type { CapabilityDoc, DomainDoc, ContextsDoc } from "@vbd/compiler";

const isGroundedAnchor = (meta: unknown): boolean => {
  const derived = (meta as { derivedFrom?: Array<Record<string, unknown>> } | undefined)?.derivedFrom ?? [];
  return derived.some((d) => typeof d?.anchor === "string" && (d.anchor as string).trim());
};

export type Severity = "blocker" | "major" | "minor";

export interface Finding {
  /** content-addressed: hash(code + normalized subjects). Stable across runs. */
  id: string;
  code: string;
  severity: Severity;
  message: string;
  subjects: string[];
}

const ID_RE = /^[a-z][a-z0-9_]*$/;

/** Content-addressed finding id — stable across runs (SPEC-001 §4.4). */
export function findingId(code: string, subjects: string[]): string {
  return sha256(`${code}|${[...subjects].sort().join(",")}`).slice(0, 16);
}

/** Finding factory shared by all validators (including narrative validators in @vbd/narrative). */
export function finding(code: string, severity: Severity, message: string, subjects: string[]): Finding {
  return { id: findingId(code, subjects), code, severity, message, subjects };
}

const mk = finding;

/** V1 — required fields: id, name, purpose, ≥1 outcome. */
export function validateV1(doc: CapabilityDoc): Finding[] {
  const findings: Finding[] = [];
  for (const c of doc.capabilities) {
    const subject = c.id || c.name || "<unknown>";
    if (!c.id || !c.id.trim()) {
      findings.push(mk("V1.id", "blocker", "capability is missing an id", [subject]));
    }
    if (!c.name || !c.name.trim()) {
      findings.push(mk("V1.name", "major", `capability '${subject}' is missing a name`, [subject]));
    }
    if (!c.purpose || !c.purpose.trim()) {
      findings.push(mk("V1.purpose", "major", `capability '${subject}' is missing a purpose`, [subject]));
    }
    if (!c.outcomes || c.outcomes.length === 0) {
      findings.push(mk("V1.outcomes", "major", `capability '${subject}' has no outcomes`, [subject]));
    }
  }
  return findings;
}

/** V2 — ids are unique and stable slugs. */
export function validateV2(doc: CapabilityDoc): Finding[] {
  const findings: Finding[] = [];
  const counts = new Map<string, number>();
  for (const c of doc.capabilities) {
    if (!c.id) continue;
    counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
    if (!ID_RE.test(c.id)) {
      findings.push(mk("V2.slug", "major", `id '${c.id}' is not a stable slug (^[a-z][a-z0-9_]*$)`, [c.id]));
    }
  }
  for (const [id, n] of counts) {
    if (n > 1) {
      findings.push(mk("V2.unique", "blocker", `duplicate capability id '${id}' (${n}×)`, [id]));
    }
  }
  return findings;
}

/** V4 — orphan: a capability with no relationships at all (no deps in/out, no produces/consumes). */
export function validateV4(doc: CapabilityDoc): Finding[] {
  const findings: Finding[] = [];
  if (doc.capabilities.length <= 1) return findings; // a lone capability isn't an orphan
  const dependedOn = new Set<string>();
  for (const c of doc.capabilities) for (const d of c.depends_on ?? []) dependedOn.add(d);
  for (const c of doc.capabilities) {
    if (!c.id) continue;
    const connected =
      (c.depends_on?.length ?? 0) > 0 ||
      (c.produces?.length ?? 0) > 0 ||
      (c.consumes?.length ?? 0) > 0 ||
      dependedOn.has(c.id);
    if (!connected) {
      findings.push(mk("V4.orphan", "minor", `capability '${c.id}' is isolated (no relationships)`, [c.id]));
    }
  }
  return findings;
}

/** V5 — dangling edge: a `depends_on` that references a non-existent capability id. */
export function validateV5(doc: CapabilityDoc): Finding[] {
  const findings: Finding[] = [];
  const ids = new Set(doc.capabilities.map((c) => c.id).filter(Boolean));
  for (const c of doc.capabilities) {
    for (const dep of c.depends_on ?? []) {
      if (!ids.has(dep)) {
        findings.push(mk("V5.dangling", "major", `capability '${c.id}' depends on unknown '${dep}'`, [c.id || "?", dep]));
      }
    }
  }
  return findings;
}

/** V6 — the depends_on graph must be acyclic; report each cycle's path. */
export function validateV6(doc: CapabilityDoc): Finding[] {
  const findings: Finding[] = [];
  const deps = new Map(doc.capabilities.map((c) => [c.id, (c.depends_on ?? []).filter((d) => d)]));
  const state = new Map<string, 0 | 1 | 2>(); // 0=unseen,1=on-stack,2=done
  const reported = new Set<string>();

  const visit = (id: string, stack: string[]): void => {
    state.set(id, 1);
    stack.push(id);
    for (const next of deps.get(id) ?? []) {
      if (!deps.has(next)) continue; // dangling → V5's job
      const s = state.get(next) ?? 0;
      if (s === 1) {
        const cycle = stack.slice(stack.indexOf(next)).concat(next);
        const key = [...cycle].sort().join(",");
        if (!reported.has(key)) {
          reported.add(key);
          findings.push(mk("V6.cycle", "major", `dependency cycle: ${cycle.join(" → ")}`, cycle.slice(0, -1)));
        }
      } else if (s === 0) {
        visit(next, stack);
      }
    }
    stack.pop();
    state.set(id, 2);
  };

  for (const c of doc.capabilities) if (c.id && (state.get(c.id) ?? 0) === 0) visit(c.id, []);
  return findings;
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "with", "their", "its", "this",
  "management", "service", "services",
]);

function sigTokens(s: string): Set<string> {
  return new Set(
    (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/**
 * Overlap coefficient (Szymkiewicz–Simpson): intersection / min(|a|,|b|). Better than Jaccard
 * for "one capability's meaning is largely contained in another's" — the actual overlap smell.
 * Guarded by a minimum token count so tiny descriptions don't trivially subsume.
 */
function overlapCoef(a: Set<string>, b: Set<string>): number {
  if (a.size < 3 || b.size < 3) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / Math.min(a.size, b.size);
}

/** V7 — overlap candidate: two capabilities whose name+purpose are highly similar (heuristic). */
export function validateV7(doc: CapabilityDoc, threshold = 0.7): Finding[] {
  const findings: Finding[] = [];
  const caps = doc.capabilities.filter((c) => c.id);
  const toks = caps.map((c) => sigTokens(`${c.name ?? ""} ${c.purpose ?? ""}`));
  for (let i = 0; i < caps.length; i++) {
    for (let j = i + 1; j < caps.length; j++) {
      if (overlapCoef(toks[i], toks[j]) >= threshold) {
        const pair = [caps[i].id, caps[j].id].sort();
        findings.push(mk("V7.overlap", "minor", `capabilities '${pair[0]}' and '${pair[1]}' look like they overlap`, pair));
      }
    }
  }
  return findings;
}

/** V8 — every LLM-authored capability must carry valid provenance (SPEC-001 §3.2). */
export function validateV8(doc: CapabilityDoc): Finding[] {
  const findings: Finding[] = [];
  for (const c of doc.capabilities) {
    const meta = c.meta as { origin?: string; derivedFrom?: unknown[] } | undefined;
    if (meta?.origin !== "llm") continue; // only LLM-authored caps are held to provenance
    if (!Array.isArray(meta.derivedFrom) || meta.derivedFrom.length === 0) {
      findings.push(finding("V8.provenance", "major", `capability '${c.id}' (llm) has no provenance`, [c.id || "<unknown>"]));
    }
  }
  return findings;
}

/**
 * Domain-model validators (SPEC-002, aggregates-first): DM1 required fields, DM2 owner exists,
 * DM5 (warning) capability owns ≥1 aggregate, DM6 dangling references, DM7 unique/stable ids.
 * Needs the capability ids so it can check ownership. Pure and deterministic.
 */
export function validateDomain(domain: DomainDoc, capabilityIds: string[]): Finding[] {
  const findings: Finding[] = [];
  const capIds = new Set(capabilityIds);
  const aggIds = new Set(domain.aggregates.map((a) => a.id).filter(Boolean));
  const counts = new Map<string, number>();
  const owned = new Set<string>();

  for (const a of domain.aggregates) {
    const subj = a.id || a.name || "<unknown>";
    if (!a.id || !a.id.trim()) {
      findings.push(mk("DM1.id", "blocker", "aggregate is missing an id", [subj]));
    } else {
      counts.set(a.id, (counts.get(a.id) ?? 0) + 1);
      if (!ID_RE.test(a.id)) findings.push(mk("DM7.slug", "major", `aggregate id '${a.id}' is not a stable slug`, [a.id]));
    }
    if (!a.name || !a.name.trim()) findings.push(mk("DM1.name", "major", `aggregate '${subj}' is missing a name`, [subj]));
    if (!a.owner || !a.owner.trim()) {
      findings.push(mk("DM1.owner", "major", `aggregate '${subj}' has no owning capability`, [subj]));
    } else {
      owned.add(a.owner);
      if (!capIds.has(a.owner)) {
        findings.push(mk("DM2.owner", "major", `aggregate '${subj}' owner '${a.owner}' is not a capability`, [subj, a.owner]));
      }
    }
    for (const r of a.references ?? []) {
      if (!aggIds.has(r)) findings.push(mk("DM6.dangling", "major", `aggregate '${a.id}' references unknown '${r}'`, [a.id || "?", r]));
    }
  }
  for (const [id, n] of counts) {
    if (n > 1) findings.push(mk("DM7.unique", "blocker", `duplicate aggregate id '${id}' (${n}×)`, [id]));
  }
  // DM5 — warning (not error): a capability that owns no aggregate may be under-modeled (or pure orchestration).
  for (const cid of capIds) {
    if (!owned.has(cid)) findings.push(mk("DM5.uncovered", "minor", `capability '${cid}' owns no aggregate yet`, [cid]));
  }
  return findings;
}

/**
 * SPEC-003 — business-areas (subdomain partition) validators. Pure/isomorphic. Assumes member ids
 * are already canonicalized to real capability ids (the ContextGrouper skill does that first).
 * The heart is BC2: it must be a partition (every capability in exactly one area's `capabilities`),
 * with `shared_kernel` the explicit escape for a capability that legitimately appears in another area.
 */
export function validateContexts(contexts: ContextsDoc, doc: CapabilityDoc): Finding[] {
  const findings: Finding[] = [];
  const caps = doc.capabilities;
  const capIds = new Set(caps.map((c) => c.id));
  const counts = new Map<string, number>(); // duplicate area-id detection
  const primary = new Map<string, number>(); // how many areas list a capability in `capabilities`

  // Shared-entity index for BC9 cohesion: capability id → set of produced/consumed object slugs.
  const entitiesOf = (id: string): Set<string> => {
    const c = caps.find((x) => x.id === id);
    const s = new Set<string>();
    for (const e of [...(c?.produces ?? []), ...(c?.consumes ?? [])]) s.add(e.toLowerCase().replace(/\s+/g, "_"));
    return s;
  };
  const dependsPair = (a: string, b: string): boolean => {
    const ca = caps.find((x) => x.id === a);
    const cb = caps.find((x) => x.id === b);
    return !!(ca?.depends_on?.includes(b) || cb?.depends_on?.includes(a));
  };

  for (const ctx of contexts.contexts) {
    const subj = ctx.id || ctx.name || "<unknown>";
    if (!ctx.id || !ctx.id.trim()) {
      findings.push(mk("BC1.id", "blocker", "business area is missing an id", [subj]));
    } else {
      counts.set(ctx.id, (counts.get(ctx.id) ?? 0) + 1);
      if (!ID_RE.test(ctx.id)) findings.push(mk("BC7.slug", "major", `area id '${ctx.id}' is not a stable slug`, [ctx.id]));
    }
    if (!ctx.name || !ctx.name.trim()) findings.push(mk("BC1.name", "major", `area '${subj}' is missing a name`, [subj]));
    if (!ctx.intent || !ctx.intent.trim()) findings.push(mk("BC5.intent", "minor", `area '${subj}' has no intent`, [subj]));
    if ((ctx.capabilities ?? []).length === 0) findings.push(mk("BC6.empty", "minor", `area '${subj}' groups no capabilities`, [subj]));

    for (const m of ctx.capabilities ?? []) {
      primary.set(m, (primary.get(m) ?? 0) + 1);
      if (!capIds.has(m)) findings.push(mk("BC4.dangling", "major", `area '${subj}' lists unknown capability '${m}'`, [subj, m]));
    }
    for (const m of ctx.shared_kernel ?? []) {
      if (!capIds.has(m)) findings.push(mk("BC4.dangling", "major", `area '${subj}' shared_kernel lists unknown capability '${m}'`, [subj, m]));
    }

    // BC8 — provenance must cite BOUNDARY EVIDENCE, not merely the area's own members (REV-013 C3).
    const origin = (ctx.meta as { origin?: string } | undefined)?.origin;
    if (origin === "llm") {
      const derived = (ctx.meta as { derivedFrom?: Array<Record<string, unknown>> } | undefined)?.derivedFrom ?? [];
      const grounded = derived.some((d) => typeof d?.anchor === "string" && (d.anchor as string).trim());
      if (!grounded) findings.push(mk("BC8.provenance", "major", `area '${subj}' lacks grounded boundary evidence`, [subj]));
    }

    // BC9 — cohesion smell (minor, deterministic): ≥2 members with zero internal coupling.
    const members = ctx.capabilities ?? [];
    if (members.length >= 2) {
      let coupled = false;
      for (let i = 0; i < members.length && !coupled; i++) {
        for (let j = i + 1; j < members.length && !coupled; j++) {
          const shareEntity = [...entitiesOf(members[i])].some((e) => entitiesOf(members[j]).has(e));
          if (dependsPair(members[i], members[j]) || shareEntity) coupled = true;
        }
      }
      if (!coupled) findings.push(mk("BC9.cohesion", "minor", `area '${subj}' groups capabilities with no shared dependency or entity`, [subj]));
    }
  }

  for (const [id, n] of counts) {
    if (n > 1) findings.push(mk("BC7.unique", "blocker", `duplicate area id '${id}' (${n}×)`, [id]));
  }
  // BC2 — the partition guarantee (repair-triggering): every capability in exactly one area.
  for (const c of caps) {
    const n = primary.get(c.id) ?? 0;
    if (n === 0) findings.push(mk("BC2.unassigned", "major", `capability '${c.id}' belongs to no business area`, [c.id]));
    else if (n > 1) findings.push(mk("BC2.multiple", "major", `capability '${c.id}' is assigned to ${n} areas`, [c.id]));
  }
  return findings;
}

/**
 * SPEC-004 — behaviour-layer validators (commands & events). Pure/isomorphic. Assumes ids are
 * canonicalized (the EventModeler skill does that). A command is a REQUEST (emits 0..n events);
 * emitted events must belong to the command's own aggregate (no hidden cross-aggregate saga).
 */
export function validateEvents(domain: DomainDoc, capabilityIds: string[]): Finding[] {
  const findings: Finding[] = [];
  const capIds = new Set(capabilityIds);
  const aggIds = new Set(domain.aggregates.map((a) => a.id).filter(Boolean));
  const aggOfEvent = new Map((domain.events ?? []).map((e) => [e.id, e.aggregate]));
  const eventIds = new Set((domain.events ?? []).map((e) => e.id).filter(Boolean));
  const counts = new Map<string, number>(); // id uniqueness across BOTH command + event namespaces
  const emittedBy = new Map<string, number>(); // event id → how many commands emit it

  for (const c of domain.commands ?? []) {
    const subj = c.id || c.name || "<command>";
    if (!c.id || !c.id.trim()) findings.push(mk("CE1.required", "blocker", "command is missing an id", [subj]));
    else {
      counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
      if (!ID_RE.test(c.id)) findings.push(mk("CE5.slug", "major", `command id '${c.id}' is not a stable slug`, [c.id]));
    }
    if (!c.name || !c.name.trim()) findings.push(mk("CE1.required", "major", `command '${subj}' is missing a name`, [subj]));
    if (!c.aggregate || !aggIds.has(c.aggregate)) findings.push(mk("CE2.command_target", "major", `command '${subj}' targets no existing entity`, [subj, c.aggregate ?? "?"]));
    if (!c.capability || !capIds.has(c.capability)) findings.push(mk("CE2.command_target", "major", `command '${subj}' has no existing capability`, [subj, c.capability ?? "?"]));
    for (const ev of c.emits ?? []) {
      emittedBy.set(ev, (emittedBy.get(ev) ?? 0) + 1);
      if (!eventIds.has(ev)) findings.push(mk("CE4.emit_target", "major", `command '${subj}' emits unknown event '${ev}'`, [subj, ev]));
      else if (c.aggregate && aggOfEvent.get(ev) && aggOfEvent.get(ev) !== c.aggregate) {
        findings.push(mk("CE.emit_boundary", "major", `command '${subj}' emits '${ev}' of another entity ('${aggOfEvent.get(ev)}') — a hidden cross-entity reaction`, [subj, ev]));
      }
    }
    if ((c.meta as { origin?: string } | undefined)?.origin === "llm" && !isGroundedAnchor(c.meta)) {
      findings.push(mk("CE6.provenance", "major", `command '${subj}' lacks grounded evidence`, [subj]));
    }
  }

  for (const e of domain.events ?? []) {
    const subj = e.id || e.name || "<event>";
    if (!e.id || !e.id.trim()) findings.push(mk("CE1.required", "blocker", "event is missing an id", [subj]));
    else {
      counts.set(e.id, (counts.get(e.id) ?? 0) + 1);
      if (!ID_RE.test(e.id)) findings.push(mk("CE5.slug", "major", `event id '${e.id}' is not a stable slug`, [e.id]));
    }
    if (!e.name || !e.name.trim()) findings.push(mk("CE1.required", "major", `event '${subj}' is missing a name`, [subj]));
    if (!e.aggregate || !aggIds.has(e.aggregate)) findings.push(mk("CE3.event_source", "major", `event '${subj}' belongs to no existing entity`, [subj, e.aggregate ?? "?"]));
    if ((e.meta as { origin?: string } | undefined)?.origin === "llm" && !isGroundedAnchor(e.meta)) {
      findings.push(mk("CE6.provenance", "major", `event '${subj}' lacks grounded evidence`, [subj]));
    }
    // CE8 — a command-triggered event nobody emits is a fact with no cause (time/external exempt).
    if ((e.trigger ?? "command") === "command" && !(emittedBy.get(e.id) ?? 0)) {
      findings.push(mk("CE8.orphan_event", "minor", `event '${subj}' is emitted by no command`, [subj]));
    }
  }

  for (const [id, n] of counts) {
    if (n > 1) findings.push(mk("CE5.unique", "blocker", `duplicate behaviour id '${id}' (${n}×)`, [id]));
  }
  // CE7 — an aggregate no command changes is under-modelled (can it change?). Minor.
  const changed = new Set((domain.commands ?? []).map((c) => c.aggregate).filter(Boolean));
  for (const a of domain.aggregates) {
    if (!changed.has(a.id)) findings.push(mk("CE7.no_command", "minor", `entity '${a.id}' has no command that changes it`, [a.id]));
  }
  return findings;
}

/** Run all implemented validators (V1–V2, V4–V8; V3 outcome-coverage needs the narrative). */
export function validateAll(doc: CapabilityDoc): Finding[] {
  return [
    ...validateV1(doc),
    ...validateV2(doc),
    ...validateV4(doc),
    ...validateV5(doc),
    ...validateV6(doc),
    ...validateV7(doc),
    ...validateV8(doc),
  ];
}
