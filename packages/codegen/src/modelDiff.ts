/**
 * SPEC-011 M3 — the semantic model diff. Compares two model snapshots (two saved versions of a
 * project) layer by layer and reports, per layer, what was added / removed / changed — by stable id,
 * not by text. Pure and isomorphic (no `node:*`): the same function powers the in-app Compare view and
 * any server-side use. Input is duck-typed on the project/model shape so it needs no doc-type imports.
 */

type Item = Record<string, unknown>;

export interface DiffChange {
  name: string;
  /** a short, human-readable summary of WHAT changed (e.g. attribute or step changes); optional. */
  detail?: string;
}

export interface LayerDiff {
  /** stable layer id: capabilities | areas | entities | behaviour | automations | roles | workflows | agents */
  key: string;
  added: string[];
  removed: string[];
  changed: DiffChange[];
}

export interface ModelDiff {
  layers: LayerDiff[]; // only layers with at least one change
  narrativeChanged: boolean;
  totalChanges: number;
}

/** A model snapshot — the project.json shape. All layers optional (a version may not have them yet). */
export interface DiffModel {
  narrative?: string;
  capabilities?: { capabilities?: Item[] } | null;
  contexts?: { contexts?: Item[] } | null;
  domain?: { aggregates?: Item[]; commands?: Item[]; events?: Item[]; policies?: Item[] } | null;
  roles?: { roles?: Item[] } | null;
  workflows?: { workflows?: Item[] } | null;
  agents?: { agents?: Item[] } | null;
}

const asArray = (x: Item[] | undefined | null): Item[] => (Array.isArray(x) ? x : []);
const nameOf = (x: Item): string => String((x.name as string) ?? (x.id as string) ?? "");

function diffLayer(
  key: string,
  prev: Item[] | undefined,
  next: Item[] | undefined,
  label: (x: Item) => string,
  detail?: (a: Item, b: Item) => string | undefined,
): LayerDiff | null {
  const a = new Map(asArray(prev).map((x) => [String(x.id ?? label(x)), x]));
  const b = new Map(asArray(next).map((x) => [String(x.id ?? label(x)), x]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: DiffChange[] = [];
  for (const [id, x] of b) if (!a.has(id)) added.push(label(x));
  for (const [id, x] of a) if (!b.has(id)) removed.push(label(x));
  for (const [id, x] of b) {
    const y = a.get(id);
    if (!y) continue;
    if (JSON.stringify(y) === JSON.stringify(x)) continue; // unchanged
    changed.push({ name: label(x), detail: detail?.(y, x) });
  }
  if (!added.length && !removed.length && !changed.length) return null;
  return { key, added: added.sort(), removed: removed.sort(), changed: changed.sort((m, n) => m.name.localeCompare(n.name)) };
}

// Per-layer "what changed" detail for the layers where it's most useful.
function entityDetail(a: Item, b: Item): string | undefined {
  const pa = new Map(asArray(a.attributes as Item[]).map((x) => [String(x.name), String(x.type ?? "")]));
  const na = new Map(asArray(b.attributes as Item[]).map((x) => [String(x.name), String(x.type ?? "")]));
  const parts: string[] = [];
  for (const n of na.keys()) if (!pa.has(n)) parts.push(`+${n}`);
  for (const n of pa.keys()) if (!na.has(n)) parts.push(`−${n}`);
  for (const [n, t] of na) if (pa.has(n) && pa.get(n) !== t) parts.push(`~${n}`);
  return parts.length ? parts.join(", ") : undefined;
}
function workflowDetail(a: Item, b: Item): string | undefined {
  const parts: string[] = [];
  const am = String(a.mode ?? "workflow");
  const bm = String(b.mode ?? "workflow");
  if (am !== bm) parts.push(`${am} → ${bm}`);
  const as = asArray(a.steps as Item[]).length;
  const bs = asArray(b.steps as Item[]).length;
  if (as !== bs) parts.push(`${as} → ${bs} steps`);
  return parts.length ? parts.join(", ") : undefined;
}
const policyName = (x: Item): string =>
  String((x.name as string) ?? (x.on && x.then ? `${x.on} → ${x.then}` : undefined) ?? (x.id as string) ?? "");

/** Diff two model snapshots. `a` = older/from, `b` = newer/to. */
export function diffModels(a: DiffModel, b: DiffModel): ModelDiff {
  const layers: LayerDiff[] = [];
  const add = (l: LayerDiff | null): void => { if (l) layers.push(l); };
  const behaviour = (m: DiffModel): Item[] => [...asArray(m.domain?.commands), ...asArray(m.domain?.events)];

  add(diffLayer("capabilities", a.capabilities?.capabilities, b.capabilities?.capabilities, nameOf));
  add(diffLayer("areas", a.contexts?.contexts, b.contexts?.contexts, nameOf));
  add(diffLayer("entities", a.domain?.aggregates, b.domain?.aggregates, nameOf, entityDetail));
  add(diffLayer("behaviour", behaviour(a), behaviour(b), nameOf));
  add(diffLayer("automations", a.domain?.policies, b.domain?.policies, policyName));
  add(diffLayer("roles", a.roles?.roles, b.roles?.roles, nameOf));
  add(diffLayer("workflows", a.workflows?.workflows, b.workflows?.workflows, nameOf, workflowDetail));
  add(diffLayer("agents", a.agents?.agents, b.agents?.agents, nameOf));

  const totalChanges = layers.reduce((n, l) => n + l.added.length + l.removed.length + l.changed.length, 0);
  return { layers, narrativeChanged: (a.narrative ?? "") !== (b.narrative ?? ""), totalChanges };
}
