/**
 * @vbd/codegen/ui — the SKIN system (RES-002, serve-ui capability).
 *
 * A UI has two halves, and conflating them is where "generate a UI" oversells:
 *   • STRUCTURE — derivable from the model: navigation = Business Areas, screens = entities, form
 *     fields = typed attributes, action buttons = commands. No design taste required.
 *   • SKIN — NOT in the business model: colour, typography, radius, spacing. Someone CHOOSES it.
 * So "who says how it looks" = the model supplies the structure; a `Theme` supplies the skin.
 *
 * This module derives the structure and, with a Theme, emits a themeable shadcn/ui scaffold
 * (Vite + React + react-router + Tailwind + shadcn components). The first `serve-ui` adapter.
 *
 * Pure and isomorphic (no node:*), like the rest of @vbd/codegen.
 */

import { slug } from "@vbd/ir";
import { attributeSpecs, type AttrType, type CapabilityDoc, type DomainDoc, type ContextsDoc, type WorkflowsDoc, type RolesDoc } from "@vbd/compiler";
import { UI_SCAFFOLD } from "./ui-scaffold.ts";
import { entityTypesTs } from "./model-types.ts";

// ── The SKIN: a Theme is the shadcn design-token set (light + dark) + radius. Authored/chosen. ──

export interface Theme {
  name: string;
  radius: string;
  /** shadcn CSS custom properties (HSL triples, shadcn convention) for each mode. */
  light: Record<string, string>;
  dark: Record<string, string>;
}

/** The stock shadcn "neutral" theme — a sensible default skin until the user supplies their brand. */
export const DEFAULT_THEME: Theme = {
  name: "neutral",
  radius: "0.5rem",
  light: {
    background: "0 0% 100%", foreground: "0 0% 3.9%",
    card: "0 0% 100%", "card-foreground": "0 0% 3.9%",
    popover: "0 0% 100%", "popover-foreground": "0 0% 3.9%",
    primary: "0 0% 9%", "primary-foreground": "0 0% 98%",
    secondary: "0 0% 96.1%", "secondary-foreground": "0 0% 9%",
    muted: "0 0% 96.1%", "muted-foreground": "0 0% 45.1%",
    accent: "0 0% 96.1%", "accent-foreground": "0 0% 9%",
    destructive: "0 84.2% 60.2%", "destructive-foreground": "0 0% 98%",
    border: "0 0% 89.8%", input: "0 0% 89.8%", ring: "0 0% 3.9%",
  },
  dark: {
    background: "0 0% 3.9%", foreground: "0 0% 98%",
    card: "0 0% 3.9%", "card-foreground": "0 0% 98%",
    popover: "0 0% 3.9%", "popover-foreground": "0 0% 98%",
    primary: "0 0% 98%", "primary-foreground": "0 0% 9%",
    secondary: "0 0% 14.9%", "secondary-foreground": "0 0% 98%",
    muted: "0 0% 14.9%", "muted-foreground": "0 0% 63.9%",
    accent: "0 0% 14.9%", "accent-foreground": "0 0% 98%",
    destructive: "0 62.8% 30.6%", "destructive-foreground": "0 0% 98%",
    border: "0 0% 14.9%", input: "0 0% 14.9%", ring: "0 0% 83.1%",
  },
};

// ── The STRUCTURE: derived from the model. Nav = areas→entities; screens = entity fields + actions. ──

const pascal = (s: string): string => slug(s).split("_").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("");

/** shadcn form control per business attribute type. */
const CONTROL: Record<AttrType, { comp: string; import: string; extra?: string }> = {
  text: { comp: "Input", import: "input" },
  number: { comp: "Input", import: "input", extra: 'type="number"' },
  boolean: { comp: "Switch", import: "switch" },
  date: { comp: "Input", import: "input", extra: 'type="date"' },
  money: { comp: "Input", import: "input", extra: 'type="number" step="0.01"' },
  reference: { comp: "Select", import: "select" },
};

export interface UiScreen {
  entity: string;
  title: string;
  typeName: string; // the entity's TS interface name (src/types.ts)
  route: string;
  area: string;
  fields: Array<{ name: string; type: AttrType | ""; control: string }>;
  actions: string[]; // command names (buttons on the detail screen)
  references: string[];
  /** entities that reference THIS one (reverse refs) — rendered as master-detail child grids. */
  related: Array<{ entity: string; title: string; route: string; cols: string[] }>;
}

export interface UiStructure {
  nav: Array<{ area: string; items: Array<{ title: string; route: string }> }>;
  screens: UiScreen[];
}

/** Derive the whole UI structure from the model — no design decisions here, only the model's shape. */
export function uiStructure(caps: CapabilityDoc, domain: DomainDoc, contexts?: ContextsDoc): UiStructure {
  const areaOfCap = new Map<string, string>();
  const areaName = new Map<string, string>();
  for (const c of contexts?.contexts ?? []) {
    areaName.set(c.id, c.name || c.id);
    for (const m of [...(c.capabilities ?? []), ...(c.shared_kernel ?? [])]) areaOfCap.set(m, c.id);
  }
  const cmdsOf = (aggId: string) => (domain.commands ?? []).filter((c) => c.aggregate === aggId).map((c) => c.name || c.id);

  const screens: UiScreen[] = domain.aggregates.map((a) => {
    const areaId = areaOfCap.get(a.owner) ?? "app";
    return {
      entity: a.id,
      title: a.name || a.id,
      typeName: pascal(a.name || a.id),
      route: `/${slug(a.id)}`,
      area: areaName.get(areaId) ?? caps.domain ?? "App",
      fields: attributeSpecs(a).map((f) => ({ name: f.name, type: (f.type ?? "") as AttrType | "", control: (f.type ? CONTROL[f.type] : CONTROL.text).comp })),
      actions: cmdsOf(a.id),
      references: a.references ?? [],
      related: [],
    };
  });

  // Master-detail: an entity's detail shows a grid of everything that REFERENCES it (reverse refs) —
  // Invoice → its Invoice Lines, Customer → its Invoices. Derived purely from the references graph.
  const byId = new Map(screens.map((s) => [s.entity, s]));
  for (const s of screens) {
    s.related = domain.aggregates
      .filter((a) => a.id !== s.entity && (a.references ?? []).includes(s.entity))
      .map((a) => {
        const cs = byId.get(a.id);
        return { entity: a.id, title: cs?.title ?? a.id, route: cs?.route ?? `/${slug(a.id)}`, cols: (cs?.fields ?? []).slice(0, 4).map((f) => f.name) };
      });
  }

  const byArea = new Map<string, Array<{ title: string; route: string }>>();
  for (const s of screens) (byArea.get(s.area) ?? byArea.set(s.area, []).get(s.area)!).push({ title: s.title, route: s.route });
  const nav = [...byArea].map(([area, items]) => ({ area, items }));
  return { nav, screens };
}

// ── The in-app HELP system: a projection of the model into end-user docs (never authored, never stale). ──

const TYPE_HINT: Record<string, string> = {
  text: "text", number: "a number", boolean: "yes / no", date: "a date", money: "an amount of money", reference: "a link to another record",
};

export interface HelpEntity {
  entity: string;
  title: string;
  route: string;
  area: string;
  what: string;
  fields: Array<{ name: string; type: string; hint: string }>;
  actions: Array<{ name: string; does: string }>;
}
export interface HelpModel {
  domain: string;
  overview: string;
  areas: Array<{ name: string; intent: string; entities: string[] }>;
  entities: HelpEntity[];
  processes: Array<{ name: string; steps: string[]; mode: string }>;
  roles: Array<{ name: string; does: string[] }>;
  automations: Array<{ when: string; then: string }>;
}

/**
 * Project the model into end-user help content. Every field is grounded in the model: a screen's "what"
 * is its owning capability's purpose (or its area's intent); an action's "does" is the command's emitted
 * events ("what happens"); processes are workflows; roles are who-owns-what; automations are policies.
 */
export function helpModel(caps: CapabilityDoc, domain: DomainDoc, contexts?: ContextsDoc, workflows?: WorkflowsDoc, roles?: RolesDoc): HelpModel {
  const struct = uiStructure(caps, domain, contexts);
  const capById = new Map(caps.capabilities.map((c) => [c.id, c]));
  const aggById = new Map(domain.aggregates.map((a) => [a.id, a]));
  const evName = new Map((domain.events ?? []).map((e) => [e.id, e.name || e.id]));
  const cmdName = new Map((domain.commands ?? []).map((c) => [c.id, c.name || c.id]));
  const capName = (id: string) => capById.get(id)?.name || id;

  const areas = (contexts?.contexts ?? []).map((c) => ({
    name: c.name || c.id,
    intent: c.intent || "",
    entities: domain.aggregates.filter((a) => [...(c.capabilities ?? []), ...(c.shared_kernel ?? [])].includes(a.owner)).map((a) => a.name || a.id),
  }));

  const entities: HelpEntity[] = struct.screens.map((s) => {
    const agg = aggById.get(s.entity)!;
    const cap = capById.get(agg.owner);
    const area = areas.find((ar) => ar.entities.includes(s.title));
    const what = cap?.purpose || area?.intent || `Records about ${s.title}.`;
    const fields = attributeSpecs(agg).map((f) => ({ name: f.name, type: f.type ?? "text", hint: TYPE_HINT[f.type ?? "text"] ?? "text" }));
    const actions = (domain.commands ?? [])
      .filter((c) => c.aggregate === agg.id)
      .map((c) => {
        const emits = (c.emits ?? []).map((e) => evName.get(e) ?? e);
        return { name: c.name || c.id, does: emits.length ? `Results in: ${emits.join(", ")}.` : `Performs "${c.name || c.id}".` };
      });
    return { entity: s.entity, title: s.title, route: s.route, area: s.area, what, fields, actions };
  });

  const processes = (workflows?.workflows ?? []).map((w) => ({ name: w.name || w.id, steps: (w.steps ?? []).map((st) => cmdName.get(st) ?? st), mode: w.mode || "workflow" }));
  const roleList = (roles?.roles ?? []).map((r) => ({ name: r.name || r.id, does: (r.capabilities ?? []).map(capName) }));
  const automations = (domain.policies ?? []).map((p) => ({ when: evName.get(p.on) ?? p.on, then: cmdName.get(p.then) ?? p.then }));

  return {
    domain: caps.domain || "App",
    overview: `In-app guide for the ${caps.domain || "business"} system — what each screen manages, its fields, the actions you can take, and how the processes run.`,
    areas,
    entities,
    processes,
    roles: roleList,
    automations,
  };
}

/** Emit the help DATA module (regenerated with the app → the help never drifts from the model). */
function helpDataTs(h: HelpModel): string {
  return [
    `// Generated by @vbd/codegen ui — the in-app HELP content, projected from the business model.`,
    `// Regenerated with the app, so it never goes stale. Do not hand-edit; change the model instead.`,
    `export interface HelpEntity { entity: string; title: string; route: string; area: string; what: string; fields: { name: string; type: string; hint: string }[]; actions: { name: string; does: string }[]; }`,
    `export interface HelpModel { domain: string; overview: string; areas: { name: string; intent: string; entities: string[] }[]; entities: HelpEntity[]; processes: { name: string; steps: string[]; mode: string }[]; roles: { name: string; does: string[] }[]; automations: { when: string; then: string }[]; }`,
    `export const HELP: HelpModel = ${JSON.stringify(h, null, 2)};`,
    "",
  ].join("\n");
}

/** A dependency-light contextual help drawer (React + Tailwind only) placed on each list screen. */
function helpButtonTsx(): string {
  return [
    `// Generated by @vbd/codegen ui — a contextual "What is this?" drawer, from the model's help content.`,
    `import { useState } from "react";`,
    `import { HELP } from "@/help";`,
    "",
    `export function HelpButton({ entity }: { entity: string }) {`,
    `  const [open, setOpen] = useState(false);`,
    `  const e = HELP.entities.find((x) => x.entity === entity);`,
    `  if (!e) return null;`,
    `  return (`,
    `    <>`,
    `      <button onClick={() => setOpen(true)} className="rounded-md border px-2 py-1 text-sm text-muted-foreground hover:bg-accent" title="What is this?">ⓘ Help</button>`,
    `      {open && (`,
    `        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setOpen(false)}>`,
    `          <div className="h-full w-96 overflow-y-auto bg-card p-6 shadow-xl" onClick={(ev) => ev.stopPropagation()}>`,
    `            <div className="mb-3 flex items-center justify-between">`,
    `              <h2 className="text-lg font-semibold">{e.title}</h2>`,
    `              <button onClick={() => setOpen(false)} className="text-muted-foreground" aria-label="Close">✕</button>`,
    `            </div>`,
    `            <p className="mb-4 text-sm text-muted-foreground">{e.what}</p>`,
    `            {e.fields.length > 0 && (`,
    `              <div className="mb-4">`,
    `                <h3 className="mb-1 text-sm font-medium">Fields</h3>`,
    `                <ul className="space-y-1 text-sm">`,
    `                  {e.fields.map((f) => (<li key={f.name}><span className="font-medium">{f.name}</span> — <span className="text-muted-foreground">{f.hint}</span></li>))}`,
    `                </ul>`,
    `              </div>`,
    `            )}`,
    `            {e.actions.length > 0 && (`,
    `              <div className="mb-4">`,
    `                <h3 className="mb-1 text-sm font-medium">Actions</h3>`,
    `                <ul className="space-y-1 text-sm">`,
    `                  {e.actions.map((a) => (<li key={a.name}><span className="font-medium">{a.name}</span> — <span className="text-muted-foreground">{a.does}</span></li>))}`,
    `                </ul>`,
    `              </div>`,
    `            )}`,
    `            <a href="/help" className="text-sm underline">Full documentation →</a>`,
    `          </div>`,
    `        </div>`,
    `      )}`,
    `    </>`,
    `  );`,
    `}`,
    "",
  ].join("\n");
}

/** Emit the full Help & documentation page (route /help) — overview, glossary, how-tos, roles, automations. */
function helpPageTsx(): string {
  return [
    `// Generated by @vbd/codegen ui — the Help & documentation page (projected from the model).`,
    `import { Link } from "react-router-dom";`,
    `import { HELP } from "@/help";`,
    "",
    `export default function Help() {`,
    `  return (`,
    `    <div className="max-w-3xl space-y-8 p-6">`,
    `      <div>`,
    `        <h1 className="text-2xl font-semibold">Help &amp; documentation</h1>`,
    `        <p className="mt-1 text-muted-foreground">{HELP.overview}</p>`,
    `      </div>`,
    `      {HELP.areas.length > 0 && (`,
    `        <section className="space-y-2">`,
    `          <h2 className="text-lg font-semibold">Business areas</h2>`,
    `          {HELP.areas.map((a) => (`,
    `            <div key={a.name} className="rounded-md border p-3">`,
    `              <div className="font-medium">{a.name}</div>`,
    `              {a.intent && <p className="text-sm text-muted-foreground">{a.intent}</p>}`,
    `              <p className="mt-1 text-xs text-muted-foreground">{a.entities.join(", ")}</p>`,
    `            </div>`,
    `          ))}`,
    `        </section>`,
    `      )}`,
    `      <section className="space-y-2">`,
    `        <h2 className="text-lg font-semibold">What each screen manages</h2>`,
    `        {HELP.entities.map((e) => (`,
    `          <div key={e.entity} className="space-y-2 rounded-md border p-3">`,
    `            <div className="flex items-center justify-between">`,
    `              <Link to={e.route} className="font-medium underline">{e.title}</Link>`,
    `              <span className="text-xs text-muted-foreground">{e.area}</span>`,
    `            </div>`,
    `            <p className="text-sm text-muted-foreground">{e.what}</p>`,
    `            {e.fields.length > 0 && (<div className="text-sm"><span className="font-medium">Fields:</span> {e.fields.map((f) => f.name).join(", ")}</div>)}`,
    `            {e.actions.length > 0 && (`,
    `              <ul className="list-disc pl-5 text-sm text-muted-foreground">`,
    `                {e.actions.map((a) => (<li key={a.name}><span className="font-medium text-foreground">{a.name}</span> — {a.does}</li>))}`,
    `              </ul>`,
    `            )}`,
    `          </div>`,
    `        ))}`,
    `      </section>`,
    `      {HELP.processes.length > 0 && (`,
    `        <section className="space-y-2">`,
    `          <h2 className="text-lg font-semibold">How-to — the processes</h2>`,
    `          {HELP.processes.map((p) => (`,
    `            <div key={p.name} className="rounded-md border p-3">`,
    `              <div className="font-medium">{p.name} <span className="text-xs text-muted-foreground">({p.mode})</span></div>`,
    `              <ol className="mt-1 list-decimal pl-5 text-sm text-muted-foreground">`,
    `                {p.steps.map((st, i) => (<li key={i}>{st}</li>))}`,
    `              </ol>`,
    `            </div>`,
    `          ))}`,
    `        </section>`,
    `      )}`,
    `      {HELP.roles.length > 0 && (`,
    `        <section className="space-y-2">`,
    `          <h2 className="text-lg font-semibold">Who does what</h2>`,
    `          {HELP.roles.map((r) => (<div key={r.name} className="text-sm"><span className="font-medium">{r.name}</span> — {r.does.join(", ")}</div>))}`,
    `        </section>`,
    `      )}`,
    `      {HELP.automations.length > 0 && (`,
    `        <section className="space-y-2">`,
    `          <h2 className="text-lg font-semibold">What happens automatically</h2>`,
    `          {HELP.automations.map((a, i) => (<div key={i} className="text-sm text-muted-foreground">When <span className="text-foreground">{a.when}</span> → <span className="text-foreground">{a.then}</span></div>))}`,
    `        </section>`,
    `      )}`,
    `    </div>`,
    `  );`,
    `}`,
    "",
  ].join("\n");
}

// ── The shadcn adapter: STRUCTURE + THEME → a themeable Vite/React/shadcn scaffold (path→content). ──

function themeCss(theme: Theme): string {
  const block = (mode: Record<string, string>) => Object.entries(mode).map(([k, v]) => `    --${k}: ${v};`).join("\n");
  return [
    "@tailwind base;",
    "@tailwind components;",
    "@tailwind utilities;",
    "",
    "/* Skin: generated by @vbd/codegen ui — swap these tokens for your brand. */",
    "@layer base {",
    "  :root {",
    block(theme.light),
    `    --radius: ${theme.radius};`,
    "  }",
    "  .dark {",
    block(theme.dark),
    "  }",
    "  * { @apply border-border; }",
    "  body { @apply bg-background text-foreground; }",
    "}",
    "",
  ].join("\n");
}

const uniqueImports = (comps: Array<{ comp: string; import: string }>) => {
  const seen = new Map<string, string>();
  for (const c of comps) seen.set(c.import, c.comp);
  return [...seen];
};

function listPage(s: UiScreen): string {
  const T = pascal(s.title);
  const cols = s.fields.slice(0, 5);
  return [
    `// Generated by @vbd/codegen ui (shadcn) — list view for ${s.title}. Structure derived; skin = theme.`,
    `import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";`,
    `import { Button } from "@/components/ui/button";`,
    `import { Link } from "react-router-dom";`,
    `import { HelpButton } from "@/components/HelpButton";`,
    `import type { ${s.typeName} } from "@/types";`,
    "",
    `export default function ${T}List() {`,
    `  const rows: ${s.typeName}[] = []; // TODO: fetch from the bound backend`,
    `  return (`,
    `    <div className="p-6 space-y-4">`,
    `      <div className="flex items-center justify-between">`,
    `        <h1 className="text-2xl font-semibold">${s.title}</h1>`,
    `        <div className="flex items-center gap-2">`,
    `          <HelpButton entity=${JSON.stringify(s.entity)} />`,
    `          <Button asChild><Link to="${s.route}/new">New ${s.title}</Link></Button>`,
    `        </div>`,
    `      </div>`,
    `      <Table>`,
    `        <TableHeader><TableRow>${cols.map((f) => `<TableHead>${f.name}</TableHead>`).join("")}</TableRow></TableHeader>`,
    `        <TableBody>`,
    `          {rows.map((r, i) => (`,
    `            <TableRow key={i}>${cols.map((f) => `<TableCell>{String(r[${JSON.stringify(slug(f.name))}] ?? "")}</TableCell>`).join("")}</TableRow>`,
    `          ))}`,
    `        </TableBody>`,
    `      </Table>`,
    `    </div>`,
    `  );`,
    `}`,
    "",
  ].join("\n");
}

function detailPage(s: UiScreen): string {
  const T = pascal(s.title);
  const controls = s.fields.map((f) => (f.type ? CONTROL[f.type as AttrType] : CONTROL.text));
  const imports = uniqueImports(controls);
  const importLines = imports.map(([imp, comp]) => `import { ${comp} } from "@/components/ui/${imp}";`).join("\n");
  const field = (f: UiScreen["fields"][number]) => {
    const ctl = f.type ? CONTROL[f.type as AttrType] : CONTROL.text;
    const id = slug(f.name);
    if (ctl.comp === "Switch") return `        <div className="flex items-center gap-2"><Switch id="${id}" /><Label htmlFor="${id}">${f.name}</Label></div>`;
    if (ctl.comp === "Select") return `        <div className="space-y-1"><Label htmlFor="${id}">${f.name}</Label><Select><SelectTrigger id="${id}"><SelectValue placeholder="Select ${f.name}" /></SelectTrigger><SelectContent /></Select></div>`;
    return `        <div className="space-y-1"><Label htmlFor="${id}">${f.name}</Label><Input id="${id}" ${ctl.extra ?? ""} /></div>`;
  };
  const needsTable = s.related.length > 0;
  const needsLink = s.related.length > 0;
  const relatedSection = (r: UiScreen["related"][number]) =>
    [
      `      <Card>`,
      `        <CardHeader className="flex flex-row items-center justify-between">`,
      `          <CardTitle className="text-base">${r.title}</CardTitle>`,
      `          <Button size="sm" asChild><Link to="${r.route}/new">Add ${r.title}</Link></Button>`,
      `        </CardHeader>`,
      `        <CardContent>`,
      `          <Table>`,
      `            <TableHeader><TableRow>${r.cols.map((c) => `<TableHead>${c}</TableHead>`).join("")}</TableRow></TableHeader>`,
      `            <TableBody>{/* TODO: rows where ${r.entity}.${slug(s.entity)} == this record */}</TableBody>`,
      `          </Table>`,
      `        </CardContent>`,
      `      </Card>`,
    ].join("\n");
  return [
    `// Generated by @vbd/codegen ui (shadcn) — detail/edit view for ${s.title}${needsTable ? " (master-detail)" : ""}.`,
    `import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";`,
    `import { Button } from "@/components/ui/button";`,
    `import { Label } from "@/components/ui/label";`,
    needsTable ? `import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";` : "",
    needsLink ? `import { Link } from "react-router-dom";` : "",
    importLines,
    "",
    `export default function ${T}Detail() {`,
    `  return (`,
    `    <div className="p-6 max-w-3xl space-y-6">`,
    `      <Card>`,
    `        <CardHeader><CardTitle>${s.title}</CardTitle></CardHeader>`,
    `        <CardContent className="space-y-4">`,
    s.fields.length ? s.fields.map(field).join("\n") : `          <p className="text-muted-foreground">No fields modelled.</p>`,
    `          <div className="flex flex-wrap gap-2 pt-2">`,
    `            <Button>Save</Button>`,
    s.actions.map((a) => `            <Button variant="secondary">${a}</Button>`).join("\n") || "",
    `          </div>`,
    `        </CardContent>`,
    `      </Card>`,
    s.related.map(relatedSection).join("\n"),
    `    </div>`,
    `  );`,
    `}`,
    "",
  ].filter((l) => l !== "").join("\n");
}

function sidebar(struct: UiStructure): string {
  const groups = struct.nav
    .map((g) => `  {\n    area: ${JSON.stringify(g.area)},\n    items: [${g.items.map((i) => `{ title: ${JSON.stringify(i.title)}, route: ${JSON.stringify(i.route)} }`).join(", ")}],\n  },`)
    .join("\n");
  return [
    `// Generated by @vbd/codegen ui — navigation grouped by Business Area (derived from the model).`,
    `import { Link } from "react-router-dom";`,
    "",
    `export const navigation = [`,
    groups,
    `];`,
    "",
    `export function AppSidebar() {`,
    `  return (`,
    `    <aside className="w-64 shrink-0 border-r bg-card p-4 space-y-6">`,
    `      {navigation.map((g) => (`,
    `        <div key={g.area}>`,
    `          <div className="px-2 mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.area}</div>`,
    `          <nav className="space-y-1">`,
    `            {g.items.map((i) => (`,
    `              <Link key={i.route} to={i.route} className="block rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground">{i.title}</Link>`,
    `            ))}`,
    `          </nav>`,
    `        </div>`,
    `      ))}`,
    `      <div className="pt-2 border-t">`,
    `        <Link to="/help" className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground">ⓘ Help &amp; docs</Link>`,
    `      </div>`,
    `    </aside>`,
    `  );`,
    `}`,
    "",
  ].join("\n");
}

function appTsx(struct: UiStructure): string {
  const imports = struct.screens.map((s) => `import ${pascal(s.title)}List from "./pages/${pascal(s.title)}List";\nimport ${pascal(s.title)}Detail from "./pages/${pascal(s.title)}Detail";`).join("\n");
  const routes = struct.screens
    .map((s) => `        <Route path="${s.route}" element={<${pascal(s.title)}List />} />\n        <Route path="${s.route}/:id" element={<${pascal(s.title)}Detail />} />`)
    .join("\n");
  const home = struct.screens[0]?.route ?? "/";
  return [
    `// Generated by @vbd/codegen ui (shadcn) — app shell + routes (one list + detail per entity).`,
    `import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";`,
    `import { AppSidebar } from "./components/AppSidebar";`,
    `import Help from "./pages/Help";`,
    imports,
    `import "./index.css";`,
    "",
    `export default function App() {`,
    `  return (`,
    `    <BrowserRouter>`,
    `      <div className="flex min-h-screen">`,
    `        <AppSidebar />`,
    `        <main className="flex-1">`,
    `          <Routes>`,
    `            <Route path="/" element={<Navigate to="${home}" replace />} />`,
    `            <Route path="/help" element={<Help />} />`,
    routes,
    `          </Routes>`,
    `        </main>`,
    `      </div>`,
    `    </BrowserRouter>`,
    `  );`,
    `}`,
    "",
  ].join("\n");
}

/** shadcn adapter: emit a themeable Vite/React/shadcn scaffold as a path→content map. */
export function shadcnAdapter(caps: CapabilityDoc, domain: DomainDoc, contexts?: ContextsDoc, theme: Theme = DEFAULT_THEME, workflows?: WorkflowsDoc, roles?: RolesDoc): Record<string, string> {
  if (!domain.aggregates.length) return {};
  const struct = uiStructure(caps, domain, contexts);
  const files: Record<string, string> = {
    ...UI_SCAFFOLD, // package.json, vite/tailwind/tsconfig, shadcn components — a runnable project
    "src/types.ts": entityTypesTs(domain), // entity interfaces from the model (shared shape with the spine)
    "src/index.css": themeCss(theme),
    "src/App.tsx": appTsx(struct),
    "src/components/AppSidebar.tsx": sidebar(struct),
    // In-app help & documentation — projected from the model, regenerated with the app (never stale).
    "src/help.ts": helpDataTs(helpModel(caps, domain, contexts, workflows, roles)),
    "src/pages/Help.tsx": helpPageTsx(),
    "src/components/HelpButton.tsx": helpButtonTsx(),
    "components.json": JSON.stringify(
      { $schema: "https://ui.shadcn.com/schema.json", style: "default", tailwind: { config: "tailwind.config.js", css: "src/index.css", baseColor: theme.name, cssVariables: true }, aliases: { components: "@/components", ui: "@/components/ui", utils: "@/lib/utils" } },
      null,
      2,
    ),
    "THEME.md": `# Skin: "${theme.name}"\n\nThe structure (nav, screens, fields, actions) is derived from the business model.\nThe **skin** is this theme — edit the tokens in \`src/index.css\` (or swap this whole Theme) to rebrand.\nComponents are shadcn/ui: run \`npx shadcn@latest add table button card input label switch select\`.\n`,
  };
  for (const s of struct.screens) {
    files[`src/pages/${pascal(s.title)}List.tsx`] = listPage(s);
    files[`src/pages/${pascal(s.title)}Detail.tsx`] = detailPage(s);
  }
  // A render smoke test (vitest + jsdom) — proves a generated page mounts and shows its heading.
  const first = struct.screens[0];
  if (first) {
    files["test/smoke.test.tsx"] = [
      `import { test, expect } from "vitest";`,
      `import { render } from "@testing-library/react";`,
      `import { MemoryRouter } from "react-router-dom";`,
      `import ${pascal(first.title)}List from "../src/pages/${pascal(first.title)}List";`,
      "",
      `test(${JSON.stringify(`${first.title} list renders its heading`)}, () => {`,
      `  const { getByText } = render(<MemoryRouter><${pascal(first.title)}List /></MemoryRouter>);`,
      `  expect(getByText(${JSON.stringify(first.title)})).toBeTruthy();`,
      `});`,
      "",
    ].join("\n");
  }
  return files;
}
