/**
 * @kiln/codegen/ui — the SKIN system (RES-002, serve-ui capability).
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
 * Pure and isomorphic (no node:*), like the rest of @kiln/codegen.
 */

import { slug } from "@kiln/ir";
import { attributeSpecs, type AttrType, type CapabilityDoc, type DomainDoc, type ContextsDoc, type WorkflowsDoc, type RolesDoc } from "@kiln/compiler";
import { UI_SCAFFOLD } from "./ui-scaffold.ts";
import { entityTypesTs } from "./model-types.ts";
import type { ViewSpecInput } from "./app.ts";

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
  // Enrich every translatable string with its i18n KEY so the components can t() it (the i18n message
  // bundle carries the translations; the value here stays as the source-language fallback).
  const keyed = {
    ...h,
    areas: h.areas.map((a) => ({ ...a, nameKey: `area.${slug(a.name)}`, intentKey: `help.area.${slug(a.name)}.intent` })),
    entities: h.entities.map((e) => ({
      ...e,
      titleKey: `nav.${e.route}`,
      whatKey: `help.entity.${e.entity}.what`,
      fields: e.fields.map((f) => ({ ...f, key: `field.${e.entity}.${slug(f.name)}` })),
      actions: e.actions.map((a) => ({ ...a, nameKey: `action.${slug(a.name)}`, doesKey: `help.action.${slug(a.name)}.does` })),
    })),
  };
  return [
    `// Generated by @kiln/codegen ui — the in-app HELP content, projected from the business model.`,
    `// Regenerated with the app, so it never goes stale. Do not hand-edit; change the model instead.`,
    `export interface HelpEntity { entity: string; title: string; titleKey: string; route: string; area: string; what: string; whatKey: string; fields: { name: string; key: string; type: string; hint: string }[]; actions: { name: string; nameKey: string; does: string; doesKey: string }[]; }`,
    `export interface HelpModel { domain: string; overview: string; areas: { name: string; nameKey: string; intent: string; intentKey: string; entities: string[] }[]; entities: HelpEntity[]; processes: { name: string; steps: string[]; mode: string }[]; roles: { name: string; does: string[] }[]; automations: { when: string; then: string }[]; }`,
    `export const HELP: HelpModel = ${JSON.stringify(keyed, null, 2)};`,
    "",
  ].join("\n");
}

/** A dependency-light contextual help drawer (React + Tailwind only) placed on each list screen. */
function helpButtonTsx(): string {
  return [
    `// Generated by @kiln/codegen ui — a contextual "What is this?" drawer, from the model's help content.`,
    `import { useState } from "react";`,
    `import { HELP } from "@/help";`,
    `import { useI18n } from "@/i18n";`,
    "",
    `export function HelpButton({ entity }: { entity: string }) {`,
    `  const [open, setOpen] = useState(false);`,
    `  const { t } = useI18n();`,
    `  const e = HELP.entities.find((x) => x.entity === entity);`,
    `  if (!e) return null;`,
    `  return (`,
    `    <>`,
    `      <button onClick={() => setOpen(true)} className="rounded-md border px-2 py-1 text-sm text-muted-foreground hover:bg-accent" title="What is this?">ⓘ {t("ui.helpDocs", "Help")}</button>`,
    `      {open && (`,
    `        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setOpen(false)}>`,
    `          <div className="h-full w-96 overflow-y-auto bg-card p-6 shadow-xl" onClick={(ev) => ev.stopPropagation()}>`,
    `            <div className="mb-3 flex items-center justify-between">`,
    `              <h2 className="text-lg font-semibold">{t(e.titleKey, e.title)}</h2>`,
    `              <button onClick={() => setOpen(false)} className="text-muted-foreground" aria-label="Close">✕</button>`,
    `            </div>`,
    `            <p className="mb-4 text-sm text-muted-foreground">{t(e.whatKey, e.what)}</p>`,
    `            {e.fields.length > 0 && (`,
    `              <div className="mb-4">`,
    `                <h3 className="mb-1 text-sm font-medium">{t("ui.fields", "Fields")}</h3>`,
    `                <ul className="space-y-1 text-sm">`,
    `                  {e.fields.map((f) => (<li key={f.name}><span className="font-medium">{t(f.key, f.name)}</span> — <span className="text-muted-foreground">{f.hint}</span></li>))}`,
    `                </ul>`,
    `              </div>`,
    `            )}`,
    `            {e.actions.length > 0 && (`,
    `              <div className="mb-4">`,
    `                <h3 className="mb-1 text-sm font-medium">{t("ui.actions", "Actions")}</h3>`,
    `                <ul className="space-y-1 text-sm">`,
    `                  {e.actions.map((a) => (<li key={a.name}><span className="font-medium">{t(a.nameKey, a.name)}</span> — <span className="text-muted-foreground">{t(a.doesKey, a.does)}</span></li>))}`,
    `                </ul>`,
    `              </div>`,
    `            )}`,
    `            <a href="/help" className="text-sm underline">{t("ui.fullDocs", "Full documentation →")}</a>`,
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
    `// Generated by @kiln/codegen ui — the Help & documentation page (projected from the model).`,
    `import { Link } from "react-router-dom";`,
    `import { HELP } from "@/help";`,
    `import { useI18n } from "@/i18n";`,
    "",
    `export default function Help() {`,
    `  const { t } = useI18n();`,
    `  return (`,
    `    <div className="max-w-3xl space-y-8 p-6">`,
    `      <div>`,
    `        <h1 className="text-2xl font-semibold">{t("help.title", "Help & documentation")}</h1>`,
    `        <p className="mt-1 text-muted-foreground">{t("help.overview", HELP.overview)}</p>`,
    `      </div>`,
    `      {HELP.areas.length > 0 && (`,
    `        <section className="space-y-2">`,
    `          <h2 className="text-lg font-semibold">{t("help.h.areas", "Business areas")}</h2>`,
    `          {HELP.areas.map((a) => (`,
    `            <div key={a.name} className="rounded-md border p-3">`,
    `              <div className="font-medium">{t(a.nameKey, a.name)}</div>`,
    `              {a.intent && <p className="text-sm text-muted-foreground">{t(a.intentKey, a.intent)}</p>}`,
    `              <p className="mt-1 text-xs text-muted-foreground">{a.entities.join(", ")}</p>`,
    `            </div>`,
    `          ))}`,
    `        </section>`,
    `      )}`,
    `      <section className="space-y-2">`,
    `        <h2 className="text-lg font-semibold">{t("help.h.glossary", "What each screen manages")}</h2>`,
    `        {HELP.entities.map((e) => (`,
    `          <div key={e.entity} className="space-y-2 rounded-md border p-3">`,
    `            <div className="flex items-center justify-between">`,
    `              <Link to={e.route} className="font-medium underline">{t(e.titleKey, e.title)}</Link>`,
    `              <span className="text-xs text-muted-foreground">{e.area}</span>`,
    `            </div>`,
    `            <p className="text-sm text-muted-foreground">{t(e.whatKey, e.what)}</p>`,
    `            {e.fields.length > 0 && (<div className="text-sm"><span className="font-medium">{t("ui.fields", "Fields")}:</span> {e.fields.map((f) => t(f.key, f.name)).join(", ")}</div>)}`,
    `            {e.actions.length > 0 && (`,
    `              <ul className="list-disc pl-5 text-sm text-muted-foreground">`,
    `                {e.actions.map((a) => (<li key={a.name}><span className="font-medium text-foreground">{t(a.nameKey, a.name)}</span> — {t(a.doesKey, a.does)}</li>))}`,
    `              </ul>`,
    `            )}`,
    `          </div>`,
    `        ))}`,
    `      </section>`,
    `      {HELP.processes.length > 0 && (`,
    `        <section className="space-y-2">`,
    `          <h2 className="text-lg font-semibold">{t("help.h.processes", "How-to — the processes")}</h2>`,
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
    `          <h2 className="text-lg font-semibold">{t("help.h.roles", "Who does what")}</h2>`,
    `          {HELP.roles.map((r) => (<div key={r.name} className="text-sm"><span className="font-medium">{r.name}</span> — {r.does.join(", ")}</div>))}`,
    `        </section>`,
    `      )}`,
    `      {HELP.automations.length > 0 && (`,
    `        <section className="space-y-2">`,
    `          <h2 className="text-lg font-semibold">{t("help.h.automations", "What happens automatically")}</h2>`,
    `          {HELP.automations.map((a, i) => (<div key={i} className="text-sm text-muted-foreground">When <span className="text-foreground">{a.when}</span> → <span className="text-foreground">{a.then}</span></div>))}`,
    `        </section>`,
    `      )}`,
    `    </div>`,
    `  );`,
    `}`,
    "",
  ].join("\n");
}

// ── i18n: every user-visible string is keyed; the base locale is the model's SOURCE language (the
//    language the business was described in). An LLM pass translates the bundle into other locales. ──

/** Collect every display string the generated app shows, keyed. The values are the source strings. */
export function appMessages(caps: CapabilityDoc, domain: DomainDoc, contexts: ContextsDoc | undefined, h: HelpModel): Record<string, string> {
  const struct = uiStructure(caps, domain, contexts);
  const m: Record<string, string> = {
    "ui.generatedApp": "Generated app",
    "ui.resources": "Resources",
    "ui.helpDocs": "Help & docs",
    "ui.search": "Search…",
    "ui.new": "New",
    "ui.add": "Add",
    "ui.save": "Save",
    "ui.fields": "Fields",
    "ui.actions": "Actions",
    "ui.fullDocs": "Full documentation →",
    "help.title": "Help & documentation",
    "help.overview": h.overview,
    "help.h.areas": "Business areas",
    "help.h.glossary": "What each screen manages",
    "help.h.processes": "How-to — the processes",
    "help.h.roles": "Who does what",
    "help.h.automations": "What happens automatically",
  };
  for (const s of struct.screens) {
    m[`nav.${s.route}`] = s.title;
    for (const f of s.fields) m[`field.${s.entity}.${slug(f.name)}`] = f.name;
    for (const a of s.actions) m[`action.${slug(a)}`] = a;
  }
  m["nav./help"] = "Help & docs";
  for (const g of struct.nav) m[`area.${slug(g.area)}`] = g.area;
  for (const e of h.entities) {
    m[`help.entity.${e.entity}.what`] = e.what;
    for (const a of e.actions) m[`help.action.${slug(a.name)}.does`] = a.does;
  }
  for (const a of h.areas) if (a.intent) m[`help.area.${slug(a.name)}.intent`] = a.intent;
  return m;
}

/** Emit src/messages.ts — the base bundle + any LLM-translated locales (regenerated with the app). */
function messagesTs(base: Record<string, string>, sourceLang: string, translations: Record<string, Record<string, string>>): string {
  const locales = [sourceLang, ...Object.keys(translations).filter((l) => l !== sourceLang)];
  const dicts: Record<string, Record<string, string>> = { [sourceLang]: base, ...translations };
  return [
    `// Generated by @kiln/codegen ui — i18n message bundle. The base locale (${JSON.stringify(sourceLang)}) is`,
    `// the model's source language; other locales are LLM translations. Regenerated with the app.`,
    `export const baseLocale = ${JSON.stringify(sourceLang)};`,
    `export const locales = ${JSON.stringify(locales)};`,
    `export const messages: Record<string, Record<string, string>> = ${JSON.stringify(dicts, null, 2)};`,
    "",
  ].join("\n");
}

function i18nRuntimeTsx(): string {
  return [
    `// Generated by @kiln/codegen ui — a tiny i18n runtime (no dependency). t(key, fallback) resolves the`,
    `// active locale, falls back to the base locale, then to the source string. Locale persists.`,
    `import { createContext, useContext, useState, type ReactNode } from "react";`,
    `import { messages, baseLocale, locales } from "./messages";`,
    "",
    `interface I18n { locale: string; setLocale: (l: string) => void; t: (key: string, fallback?: string) => string; }`,
    `const Ctx = createContext<I18n>({ locale: baseLocale, setLocale: () => {}, t: (k, f) => f ?? k });`,
    "",
    `export function I18nProvider({ children }: { children: ReactNode }) {`,
    `  const [locale, setLocaleState] = useState<string>(() => { try { return localStorage.getItem("locale") || baseLocale; } catch { return baseLocale; } });`,
    `  const setLocale = (l: string) => { setLocaleState(l); try { localStorage.setItem("locale", l); } catch { /* ignore */ } };`,
    `  const t = (key: string, fallback?: string) => messages[locale]?.[key] ?? messages[baseLocale]?.[key] ?? fallback ?? key;`,
    `  return <Ctx.Provider value={{ locale, setLocale, t }}>{children}</Ctx.Provider>;`,
    `}`,
    `export function useI18n() { return useContext(Ctx); }`,
    `export { locales, baseLocale };`,
    "",
  ].join("\n");
}

function themeToggleTsx(): string {
  return [
    `// Generated by @kiln/codegen ui — light/dark toggle (toggles the .dark class + persists the choice).`,
    `import { useState } from "react";`,
    "",
    `export function ThemeToggle() {`,
    `  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));`,
    `  const toggle = () => {`,
    `    const next = !dark;`,
    `    setDark(next);`,
    `    document.documentElement.classList.toggle("dark", next);`,
    `    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch { /* ignore */ }`,
    `  };`,
    `  return (`,
    `    <button onClick={toggle} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent" title="Toggle theme" aria-label="Toggle theme">{dark ? "☀" : "🌙"}</button>`,
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
    "/* Skin: generated by @kiln/codegen ui — swap these tokens for your brand. */",
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

/**
 * The entity list page — now honours the polished VIEW SPEC (columns/formats/layout/metrics/card), so the
 * board/cards/KPI vocabulary reaches the real full-stack export too. Every field reference is allow-listed
 * to the entity's real fields (build-safe); with no spec it falls back to a typed table of the first fields.
 */
function listPage(s: UiScreen, view?: ViewSpecInput): string {
  const T = pascal(s.title);
  const typeOf = new Map(s.fields.map((f) => [f.name, String(f.type || "text")]));
  const has = (n?: string): n is string => !!n && typeOf.has(n);
  const fmtOf = (name: string): string => { const t = typeOf.get(name) ?? "text"; return t === "money" || t === "date" || t === "boolean" ? t : "text"; };
  const cell = (field: string, format: string) => `formatCell(r[${JSON.stringify(slug(field))}], ${JSON.stringify(format)})`;

  const columns = (view?.columns?.length ? view.columns.filter((c) => has(c.field)) : s.fields.slice(0, 5).map((f) => ({ field: f.name, format: fmtOf(f.name) })));
  const metrics = (view?.metrics ?? []).filter((m) => typeof m.label === "string" && (m.agg === "count" || has(m.field))).slice(0, 4);
  const layout = view?.layout === "cards" || view?.layout === "board" ? view.layout : "table";
  const groupBy = has(view?.groupBy) ? (view!.groupBy as string) : undefined;
  const card = view?.card ?? {};
  const titleField = (has(card.title) && card.title) || view?.titleField || columns[0]?.field || s.fields[0]?.name || "id";
  const cardSub = has(card.subtitle) ? card.subtitle : undefined;
  const cardBadge = has(card.badge) ? card.badge : undefined;
  const cardMeta = (card.meta?.length ? card.meta : columns.map((c) => c.field).filter((f) => f !== titleField).slice(0, 3)).filter(has);
  const isTable = layout === "table";
  // A distribution bar chart makes sense when there's a status-like field to break down by (not for a board,
  // which already shows the split as columns).
  const chartField = layout !== "board" ? (columns.find((c) => c.format === "badge")?.field ?? (has(view?.groupBy) ? view!.groupBy : undefined)) : undefined;

  const cardJsx = [
    `            <Card key={i}>`,
    `              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between gap-2"><span>{String(r[${JSON.stringify(slug(titleField))}] ?? "")}</span>${cardBadge ? `<span>{${cell(cardBadge, "badge")}}</span>` : ""}</CardTitle>${cardSub ? `<p className="text-sm font-normal text-muted-foreground">{${cell(cardSub, fmtOf(cardSub))}}</p>` : ""}</CardHeader>`,
    cardMeta.length ? `              <CardContent className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">${cardMeta.map((f) => `<span>{${cell(f, fmtOf(f))}}</span>`).join("")}</CardContent>` : "",
    `            </Card>`,
  ].filter(Boolean).join("\n");

  let body: string;
  if (layout === "board" && groupBy) {
    const key = JSON.stringify(slug(groupBy));
    body = [
      `      <div className="flex gap-4 overflow-x-auto pb-2">`,
      `        {Array.from(new Set(rows.map((r) => String(r[${key}] ?? "—")))).map((g) => (`,
      `          <div key={g} className="flex-none w-72 space-y-3">`,
      `            <div className="text-sm font-semibold capitalize flex items-center justify-between"><span>{g}</span><span className="text-muted-foreground">{rows.filter((r) => String(r[${key}] ?? "—") === g).length}</span></div>`,
      `            {rows.filter((r) => String(r[${key}] ?? "—") === g).map((r, i) => (`,
      cardJsx,
      `            ))}`,
      `          </div>`,
      `        ))}`,
      `      </div>`,
    ].join("\n");
  } else if (layout === "cards") {
    body = [
      `      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">`,
      `        {rows.map((r, i) => (`,
      cardJsx,
      `        ))}`,
      `      </div>`,
    ].join("\n");
  } else {
    // Table layout → the sortable/filterable DataTable with a per-row action menu (view / edit / commands).
    const colsLiteral = JSON.stringify(columns.map((c) => ({ field: slug(c.field), label: c.field, format: c.format })));
    body = [
      `      <DataTable columns={${colsLiteral}} rows={rows} actions={(r) => (`,
      `        <DropdownMenu>`,
      `          <DropdownMenuTrigger asChild><Button variant="ghost" size="sm">⋯</Button></DropdownMenuTrigger>`,
      `          <DropdownMenuContent>`,
      `            <DropdownMenuItem onClick={() => setPreview(r)}>{t("ui.view", "View")}</DropdownMenuItem>`,
      `            <DropdownMenuItem asChild><Link to={${JSON.stringify(s.route + "/")} + String(r.id ?? "")}>{t("ui.edit", "Edit")}</Link></DropdownMenuItem>`,
      `            {actionCommands(${JSON.stringify(s.entity)}).map((c) => (`,
      `              <DropdownMenuItem key={c.command} onClick={() => api.command(c.path.replace("{id}", String(r.id ?? "")), r).then(load)}>{c.name}</DropdownMenuItem>`,
      `            ))}`,
      `          </DropdownMenuContent>`,
      `        </DropdownMenu>`,
      `      )} />`,
    ].join("\n");
  }

  const metricsJsx = metrics.length
    ? [
        `      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">`,
        ...metrics.map((m) => `        <Card><CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">{${JSON.stringify(m.label)}}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{formatCell(metricValue(rows, ${JSON.stringify({ agg: m.agg, field: m.field })}), ${JSON.stringify(m.format ?? "text")})}</CardContent></Card>`),
        `      </div>`,
      ].join("\n")
    : "";

  const chartJsx = chartField
    ? `      <DistributionChart title=${JSON.stringify(`By ${chartField}`)} rows={rows} field={${JSON.stringify(slug(chartField))}} />`
    : "";
  const sheetJsx = isTable
    ? [
        `      <Sheet open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>`,
        `        <SheetContent>`,
        `          <SheetTitle>{title}</SheetTitle>`,
        `          {preview && (<div className="space-y-2 text-sm">${columns.map((c) => `<div className="flex justify-between gap-4"><span className="text-muted-foreground">{${JSON.stringify(c.field)}}</span><span>{formatCell(preview[${JSON.stringify(slug(c.field))}], ${JSON.stringify(c.format)})}</span></div>`).join("")}</div>)}`,
        `        </SheetContent>`,
        `      </Sheet>`,
      ].join("\n")
    : "";

  const imports = [
    `import { useEffect, useState } from "react";`,
    `import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";`,
    `import { Button } from "@/components/ui/button";`,
    `import { Link } from "react-router-dom";`,
    `import { HelpButton } from "@/components/HelpButton";`,
    `import { useI18n } from "@/i18n";`,
    `import { formatCell, metricValue } from "@/lib/format";`,
    `import { api } from "@/lib/api";`,
    isTable ? `import { DataTable } from "@/components/ui/data-table";` : "",
    isTable ? `import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";` : "",
    isTable ? `import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";` : "",
    isTable ? `import { actionCommands } from "@/lib/model";` : "",
    chartField ? `import { DistributionChart } from "@/components/charts/DistributionChart";` : "",
  ].filter(Boolean);

  return [
    `// Generated by @kiln/codegen ui (shadcn) — ${layout} view for ${s.title}. Structure + layout derived; skin = theme.`,
    ...imports,
    "",
    `export default function ${T}List() {`,
    `  const { t } = useI18n();`,
    `  const [rows, setRows] = useState<Record<string, unknown>[]>([]);`,
    isTable ? `  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);` : "",
    `  const load = () => api.list(${JSON.stringify(s.entity)}).then(setRows);`,
    `  useEffect(() => { load(); }, []);`,
    `  const title = t(${JSON.stringify(`nav.${s.route}`)}, ${JSON.stringify(s.title)});`,
    `  return (`,
    `    <div className="p-6 space-y-4">`,
    `      <div className="flex items-center justify-between">`,
    `        <h1 className="text-2xl font-semibold">{title}</h1>`,
    `        <div className="flex items-center gap-2">`,
    `          <HelpButton entity=${JSON.stringify(s.entity)} />`,
    `          <Button asChild><Link to="${s.route}/new">{t("ui.new", "New")} {title}</Link></Button>`,
    `        </div>`,
    `      </div>`,
    metricsJsx,
    chartJsx,
    body,
    sheetJsx,
    `    </div>`,
    `  );`,
    `}`,
    "",
  ].filter((l) => l !== "").join("\n");
}

function detailPage(s: UiScreen, view?: ViewSpecInput): string {
  const T = pascal(s.title);
  // Use the polished form-field ordering/subset when present (else every field, model order).
  const formFields = view?.formFields?.length
    ? view.formFields.map((n) => s.fields.find((f) => f.name === n)).filter((f): f is UiScreen["fields"][number] => !!f)
    : s.fields;
  const controls = formFields.map((f) => (f.type ? CONTROL[f.type as AttrType] : CONTROL.text));
  const imports = uniqueImports(controls);
  const importLines = imports.map(([imp, comp]) => `import { ${comp} } from "@/components/ui/${imp}";`).join("\n");
  const lbl = (entity: string, name: string) => `{t(${JSON.stringify(`field.${entity}.${slug(name)}`)}, ${JSON.stringify(name)})}`;
  const field = (f: UiScreen["fields"][number]) => {
    const ctl = f.type ? CONTROL[f.type as AttrType] : CONTROL.text;
    const id = slug(f.name);
    const K = JSON.stringify(id);
    const L = lbl(s.entity, f.name);
    if (ctl.comp === "Switch") return `        <div className="flex items-center gap-2"><Switch id="${id}" checked={!!form[${K}]} onCheckedChange={(v) => set(${K}, v)} /><Label htmlFor="${id}">${L}</Label></div>`;
    if (ctl.comp === "Select") return `        <div className="space-y-1"><Label htmlFor="${id}">${L}</Label><Select><SelectTrigger id="${id}"><SelectValue placeholder=${JSON.stringify(f.name)} /></SelectTrigger><SelectContent /></Select></div>`;
    return `        <div className="space-y-1"><Label htmlFor="${id}">${L}</Label><Input id="${id}" ${ctl.extra ?? ""} value={String(form[${K}] ?? "")} onChange={(e) => set(${K}, e.target.value)} /></div>`;
  };
  const needsTable = s.related.length > 0;
  const parentRef = slug(s.entity) + "_id"; // how a child row points back at this record
  // Each related entity becomes a Tab, showing that entity's rows filtered to this record.
  const relatedContent = (r: UiScreen["related"][number]) => [
    `        <TabsContent value=${JSON.stringify(r.entity)} className="space-y-2">`,
    `          <div className="flex justify-end"><Button size="sm" asChild><Link to="${r.route}/new">{t("ui.add", "Add")}</Link></Button></div>`,
    `          <Table>`,
    `            <TableHeader><TableRow>${r.cols.map((c) => `<TableHead>${lbl(r.entity, c)}</TableHead>`).join("")}</TableRow></TableHeader>`,
    `            <TableBody>{(related[${JSON.stringify(r.entity)}] || []).map((row, i) => (<TableRow key={i}>${r.cols.map((c) => `<TableCell>{String(row[${JSON.stringify(slug(c))}] ?? "")}</TableCell>`).join("")}</TableRow>))}</TableBody>`,
    `          </Table>`,
    `        </TabsContent>`,
  ].join("\n");
  const relatedBlock = needsTable
    ? [
        `      <Tabs defaultValue=${JSON.stringify(s.related[0].entity)}>`,
        `        <TabsList>${s.related.map((r) => `<TabsTrigger value=${JSON.stringify(r.entity)}>{t(${JSON.stringify(`nav.${r.route}`)}, ${JSON.stringify(r.title)})}</TabsTrigger>`).join("")}</TabsList>`,
        ...s.related.map(relatedContent),
        `      </Tabs>`,
      ].join("\n")
    : "";
  const relatedFetch = s.related.map((r) => `      api.list(${JSON.stringify(r.entity)}).then((rows) => setRelated((prev) => ({ ...prev, [${JSON.stringify(r.entity)}]: rows.filter((x) => String(x[${JSON.stringify(parentRef)}] ?? "") === id) })));`).join("\n");
  return [
    `// Generated by @kiln/codegen ui (shadcn) — detail/edit view for ${s.title}${needsTable ? " (master-detail)" : ""}.`,
    `import { useEffect, useState } from "react";`,
    `import { useParams, useNavigate, Link } from "react-router-dom";`,
    `import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";`,
    `import { Button } from "@/components/ui/button";`,
    `import { Label } from "@/components/ui/label";`,
    `import { useI18n } from "@/i18n";`,
    `import { api } from "@/lib/api";`,
    `import { createCommand, actionCommands } from "@/lib/model";`,
    needsTable ? `import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";` : "",
    needsTable ? `import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";` : "",
    importLines,
    "",
    `export default function ${T}Detail() {`,
    `  const { t } = useI18n();`,
    `  const { id } = useParams();`,
    `  const nav = useNavigate();`,
    `  const isNew = !id || id === "new";`,
    `  const [form, setForm] = useState<Record<string, unknown>>({});`,
    `  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));`,
    needsTable ? `  const [related, setRelated] = useState<Record<string, Record<string, unknown>[]>>({});` : "",
    `  useEffect(() => { if (!isNew && id) api.get(${JSON.stringify(s.entity)}, id).then((r) => setForm(r || {})); }, [id]);`,
    needsTable ? `  useEffect(() => { if (isNew || !id) return;\n${relatedFetch}\n  }, [id]);` : "",
    `  const save = async () => { const c = createCommand(${JSON.stringify(s.entity)}); if (c) await api.command(c.path, form); nav(${JSON.stringify(s.route)}); };`,
    `  const runAction = async (path: string) => { if (id) { await api.command(path.replace("{id}", id), form); nav(${JSON.stringify(s.route)}); } };`,
    `  return (`,
    `    <div className="p-6 max-w-3xl space-y-6">`,
    `      <Card>`,
    `        <CardHeader><CardTitle>{t(${JSON.stringify(`nav.${s.route}`)}, ${JSON.stringify(s.title)})}</CardTitle></CardHeader>`,
    `        <CardContent className="space-y-4">`,
    formFields.length ? formFields.map(field).join("\n") : `          <p className="text-muted-foreground">No fields modelled.</p>`,
    `          <div className="flex flex-wrap gap-2 pt-2">`,
    `            <Button onClick={save}>{t("ui.save", "Save")}</Button>`,
    `            {!isNew && actionCommands(${JSON.stringify(s.entity)}).map((c) => (`,
    `              <Button key={c.command} variant="secondary" onClick={() => runAction(c.path)}>{t("action." + c.action, c.name)}</Button>`,
    `            ))}`,
    `          </div>`,
    `        </CardContent>`,
    `      </Card>`,
    relatedBlock,
    `    </div>`,
    `  );`,
    `}`,
    "",
  ].filter((l) => l !== "").join("\n");
}

// The sidebar-16 shell (shadcn's collapsible inset dashboard) reproduced dependency-light (React +
// Tailwind, no shadcn `sidebar` component): a grouped sidebar with a team header + user footer, a
// breadcrumb/search top bar, and an inset content card. Nav is model-derived (areas → groups, entities
// → items); the shell is the SKIN, the content the model's STRUCTURE.
function sidebar(struct: UiStructure, appName: string): string {
  const groups = struct.nav
    .map((g) => `  {\n    area: ${JSON.stringify(g.area)}, areaKey: ${JSON.stringify(`area.${slug(g.area)}`)},\n    items: [${g.items.map((i) => `{ title: ${JSON.stringify(i.title)}, route: ${JSON.stringify(i.route)} }`).join(", ")}],\n  },`)
    .join("\n");
  const routeTitles = struct.screens.map((s) => `  ${JSON.stringify(s.route)}: ${JSON.stringify(s.title)},`).join("\n");
  return [
    `// Generated by @kiln/codegen ui — sidebar (sidebar-16 style); nav grouped by Business Area.`,
    `import { Link, useLocation } from "react-router-dom";`,
    `import { useI18n } from "../i18n";`,
    "",
    `export const appName = ${JSON.stringify(appName)};`,
    `export const navigation = [`,
    groups,
    `];`,
    `export const routeTitles: Record<string, string> = {`,
    routeTitles,
    `  "/help": "Help & docs",`,
    `};`,
    "",
    `export function AppSidebar() {`,
    `  const { pathname } = useLocation();`,
    `  const { t } = useI18n();`,
    `  const active = "/" + (pathname.split("/")[1] ?? "");`,
    `  const link = (route: string) =>`,
    "    `flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${active === route ? \"bg-accent text-accent-foreground font-medium\" : \"hover:bg-accent hover:text-accent-foreground\"}`;",
    `  return (`,
    `    <aside className="flex h-full w-64 shrink-0 flex-col gap-2 p-2">`,
    `      <div className="flex items-center gap-2 rounded-lg p-2">`,
    `        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">{appName.slice(0, 1).toUpperCase()}</div>`,
    `        <div className="leading-tight">`,
    `          <div className="text-sm font-semibold">{appName}</div>`,
    `          <div className="text-xs text-muted-foreground">{t("ui.generatedApp", "Generated app")}</div>`,
    `        </div>`,
    `      </div>`,
    `      <nav className="flex-1 overflow-y-auto">`,
    `        {navigation.map((g) => (`,
    `          <div key={g.area} className="mb-3">`,
    `            <div className="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(g.areaKey, g.area)}</div>`,
    `            <div className="space-y-0.5">`,
    `              {g.items.map((i) => (`,
    `                <Link key={i.route} to={i.route} className={link(i.route)}>`,
    `                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />{t("nav." + i.route, i.title)}`,
    `                </Link>`,
    `              ))}`,
    `            </div>`,
    `          </div>`,
    `        ))}`,
    `        <div className="mb-3">`,
    `          <div className="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("ui.resources", "Resources")}</div>`,
    `          <Link to="/help" className={link("/help")}><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />{t("ui.helpDocs", "Help & docs")}</Link>`,
    `        </div>`,
    `      </nav>`,
    `      <div className="flex items-center gap-2 rounded-lg p-2">`,
    `        <div className="h-8 w-8 rounded-full bg-muted" />`,
    `        <div className="leading-tight text-sm"><div className="font-medium">User</div><div className="text-xs text-muted-foreground">user@example.com</div></div>`,
    `      </div>`,
    `    </aside>`,
    `  );`,
    `}`,
    "",
  ].join("\n");
}

function appHeaderTsx(): string {
  return [
    `// Generated by @kiln/codegen ui — top bar: toggle + breadcrumb + search + language + theme (sidebar-16).`,
    `import { useLocation } from "react-router-dom";`,
    `import { routeTitles, appName } from "./AppSidebar";`,
    `import { useI18n, locales } from "../i18n";`,
    `import { ThemeToggle } from "./ThemeToggle";`,
    "",
    `export function AppHeader({ onToggle }: { onToggle: () => void }) {`,
    `  const { pathname } = useLocation();`,
    `  const { t, locale, setLocale } = useI18n();`,
    `  const base = "/" + (pathname.split("/")[1] ?? "");`,
    `  const title = routeTitles[base] ? t("nav." + base, routeTitles[base]) : "";`,
    `  return (`,
    `    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">`,
    `      <button onClick={onToggle} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent" aria-label="Toggle sidebar">☰</button>`,
    `      <nav className="flex items-center gap-2 text-sm">`,
    `        <span className="text-muted-foreground">{appName}</span>`,
    `        {title && <span className="text-muted-foreground">/</span>}`,
    `        {title && <span className="font-medium">{title}</span>}`,
    `      </nav>`,
    `      <div className="ml-auto flex items-center gap-2">`,
    `        <input placeholder={t("ui.search", "Search…")} className="h-8 w-40 rounded-md border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring sm:w-56" />`,
    `        {locales.length > 1 && (`,
    `          <select value={locale} onChange={(e) => setLocale(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-sm" aria-label="Language">`,
    `            {locales.map((l) => (<option key={l} value={l}>{l.toUpperCase()}</option>))}`,
    `          </select>`,
    `        )}`,
    `        <ThemeToggle />`,
    `      </div>`,
    `    </header>`,
    `  );`,
    `}`,
    "",
  ].join("\n");
}

function appShellTsx(): string {
  return [
    `// Generated by @kiln/codegen ui — the sidebar-16 app shell (inset content). Skin; content = the model.`,
    `import { useState, type ReactNode } from "react";`,
    `import { AppSidebar } from "./AppSidebar";`,
    `import { AppHeader } from "./AppHeader";`,
    "",
    `export function AppShell({ children }: { children: ReactNode }) {`,
    `  const [open, setOpen] = useState(true);`,
    `  return (`,
    `    <div className="flex h-screen bg-muted/40 text-foreground">`,
    `      {open && <AppSidebar />}`,
    `      <div className="flex flex-1 flex-col p-2 pl-0">`,
    `        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border bg-background shadow-sm">`,
    `          <AppHeader onToggle={() => setOpen((v) => !v)} />`,
    `          <main className="flex-1 overflow-y-auto">{children}</main>`,
    `        </div>`,
    `      </div>`,
    `    </div>`,
    `  );`,
    `}`,
    "",
  ].join("\n");
}

function appTsx(struct: UiStructure): string {
  const imports = struct.screens.map((s) => `import ${pascal(s.title)}List from "./pages/${pascal(s.title)}List";\nimport ${pascal(s.title)}Detail from "./pages/${pascal(s.title)}Detail";`).join("\n");
  const routes = struct.screens
    .map((s) => `          <Route path="${s.route}" element={<${pascal(s.title)}List />} />\n          <Route path="${s.route}/:id" element={<${pascal(s.title)}Detail />} />`)
    .join("\n");
  const home = struct.screens[0]?.route ?? "/";
  return [
    `// Generated by @kiln/codegen ui (shadcn) — app shell (sidebar-16) + routes (one list + detail per entity).`,
    `import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";`,
    `import { AppShell } from "./components/AppShell";`,
    `import Help from "./pages/Help";`,
    imports,
    `import "./index.css";`,
    "",
    `export default function App() {`,
    `  return (`,
    `    <BrowserRouter>`,
    `      <AppShell>`,
    `        <Routes>`,
    `          <Route path="/" element={<Navigate to="${home}" replace />} />`,
    `          <Route path="/help" element={<Help />} />`,
    routes,
    `        </Routes>`,
    `      </AppShell>`,
    `    </BrowserRouter>`,
    `  );`,
    `}`,
    "",
  ].join("\n");
}

// Command routes for the UI (mirror of the spine): create-verbs → POST /<entity>s; others → /<entity>s/{id}/<action>.
const UI_CREATE_VERB = /^(create|add|register|open|new|capture|issue|request|submit|plan|record)_/;
function uiCommandsTs(domain: DomainDoc): string {
  const cmds = (domain.commands ?? []).map((c) => {
    const entity = slug(c.aggregate);
    const action = slug(c.name || c.id);
    const create = UI_CREATE_VERB.test(`${action}_`);
    return { command: slug(c.id), name: c.name || c.id, entity, action, create, path: create ? `/${entity}s` : `/${entity}s/{id}/${action}` };
  });
  return [
    `// Generated by @kiln/codegen ui — command routes (mirror of the spine). "{id}" is replaced with the record id at call time.`,
    `export interface CommandRoute { command: string; name: string; entity: string; action: string; create: boolean; path: string; }`,
    `export const commands: CommandRoute[] = ${JSON.stringify(cmds, null, 2)};`,
    `export const createCommand = (entity: string): CommandRoute | undefined => commands.find((c) => c.entity === entity && c.create);`,
    `export const actionCommands = (entity: string): CommandRoute[] => commands.filter((c) => c.entity === entity && !c.create);`,
    "",
  ].join("\n");
}

/** shadcn adapter: emit a themeable Vite/React/shadcn scaffold as a path→content map. */
export function shadcnAdapter(caps: CapabilityDoc, domain: DomainDoc, contexts?: ContextsDoc, theme: Theme = DEFAULT_THEME, workflows?: WorkflowsDoc, roles?: RolesDoc, i18n?: { sourceLang?: string; translations?: Record<string, Record<string, string>> }, views?: Record<string, ViewSpecInput>): Record<string, string> {
  if (!domain.aggregates.length) return {};
  const struct = uiStructure(caps, domain, contexts);
  const help = helpModel(caps, domain, contexts, workflows, roles);
  const sourceLang = i18n?.sourceLang ?? "en";
  const files: Record<string, string> = {
    ...UI_SCAFFOLD, // package.json, vite/tailwind/tsconfig, shadcn components — a runnable project
    "src/types.ts": entityTypesTs(domain), // entity interfaces from the model (shared shape with the spine)
    "src/lib/model.ts": uiCommandsTs(domain), // command routes (mirror of the spine) for wiring buttons/forms

    "src/index.css": themeCss(theme),
    "src/App.tsx": appTsx(struct),
    "src/components/AppSidebar.tsx": sidebar(struct, caps.domain ?? "App"),
    "src/components/AppHeader.tsx": appHeaderTsx(),
    "src/components/AppShell.tsx": appShellTsx(),
    "src/components/ThemeToggle.tsx": themeToggleTsx(), // light/dark toggle
    // i18n: every visible string keyed; base locale = the model's source language; LLM translations added.
    "src/i18n.tsx": i18nRuntimeTsx(),
    "src/messages.ts": messagesTs(appMessages(caps, domain, contexts, help), sourceLang, i18n?.translations ?? {}),
    // In-app help & documentation — projected from the model, regenerated with the app (never stale).
    "src/help.ts": helpDataTs(help),
    "src/pages/Help.tsx": helpPageTsx(),
    "src/components/HelpButton.tsx": helpButtonTsx(),
    "components.json": JSON.stringify(
      { $schema: "https://ui.shadcn.com/schema.json", style: "default", tailwind: { config: "tailwind.config.js", css: "src/index.css", baseColor: theme.name, cssVariables: true }, aliases: { components: "@/components", ui: "@/components/ui", utils: "@/lib/utils" } },
      null,
      2,
    ),
    "THEME.md": `# Skin: "${theme.name}"\n\nThe structure (nav, screens, fields, actions) is derived from the business model.\nThe **skin** is this theme — edit the tokens in \`src/index.css\` (or swap this whole Theme) to rebrand.\nComponents are shadcn/ui (table, button, card, input, label, switch, select, badge, data-table, dropdown-menu, sheet, tabs) + a recharts chart.\nData comes from the generated spine — set \`VITE_API_URL\` (and \`VITE_API_TOKEN\` if the spine's \`API_TOKEN\` is set).\n`,
  };
  for (const s of struct.screens) {
    files[`src/pages/${pascal(s.title)}List.tsx`] = listPage(s, views?.[s.entity]);
    files[`src/pages/${pascal(s.title)}Detail.tsx`] = detailPage(s, views?.[s.entity]);
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
