/**
 * Light project store (ADR-005) — several businesses side by side, persisted to localStorage.
 * Interim until git-backed workspaces (ADR-002). Each project holds its own narrative,
 * last-generated capabilities, and model/effort prefs.
 */

import type { CapabilityDoc, DomainDoc, ContextsDoc, RolesDoc, WorkflowsDoc, AgentsDoc } from "@kiln/compiler";
import type { CommunicationsDoc, IntegrationsDoc, ExternalServicesDoc, TriggersDoc, Binding, Theme } from "@kiln/codegen";
import type { CoachConfig } from "@kiln/skills";
import { narrativeMd } from "./data/solar";
// A fully-generated solar model (all layers) baked in, so the example opens populated — every
// diagram is rich and the entity connections trace works out of the box. Regenerate with the
// generation script; it's a curated snapshot, editable like any project.
import solarModel from "./data/solar-model.json";
import legalModel from "./data/legal-model.json";
import coffeeModel from "./data/coffee-model.json";
import funeralModel from "./data/funeral-model.json";
// Three more rich verticals, each demonstrating a DIFFERENT ingestion path (a legal office from a
// Zoom transcript, a coffee franchise from an agent interview, a funeral franchise from owner-entered
// files). They ship description-first — open one and "Generate with LLM" to derive the full model.
import { legalNarrative, baristaNarrative, baristaInterview, funeralNarrative } from "./data/examples";

export interface Project {
  id: string;
  name: string;
  /** short one-line summary of the business (distinct from the full narrative) — shown on the project card. */
  description?: string;
  /** LLM-written plain-language home greeting (cached; regenerated when the narrative changes). */
  homeSummary?: string;
  /** Open questions from the last "understand" pass on the narrative screen (cached; cleared on edit). */
  openQuestions?: string[];
  narrative: string;
  model: string;
  effort: string;
  /** Which LLM engine runs the AI stages: "anthropic" (default/preferred) | "openrouter" | "omniroute".
   *  Availability is server-decided (which key is set); undefined → the server's default engine. This is
   *  the *engine*, distinct from `provider` below (which records how the capabilities were authored). */
  engine?: string;
  /** last LLM-generated capabilities (null → use the live mock). */
  capabilities: CapabilityDoc | null;
  provider: string | null;
  /** last LLM-generated domain model (null → live mock derivation). */
  domain?: DomainDoc | null;
  /** last business-areas partition (SPEC-003; null → live mock partition). */
  contexts?: ContextsDoc | null;
  /** last roles/permissions model (SPEC-006; null → live mock). */
  roles?: RolesDoc | null;
  /** last workflows (SPEC-007) + agents (SPEC-008); null → live mock. */
  workflows?: WorkflowsDoc | null;
  agents?: AgentsDoc | null;
  /** Execution-layer decisions — folded into the model so the whole thing round-trips + is versionable.
   *  Absent → codegen fills the deterministic mock default. Authoring these makes them the source of truth. */
  services?: ExternalServicesDoc | null;
  triggers?: TriggersDoc | null;
  comms?: CommunicationsDoc | null;
  integrations?: IntegrationsDoc | null;
  binding?: Binding | null;
  theme?: Theme | null;
  i18n?: { sourceLang: string; translations?: Record<string, Record<string, string>> } | null;
  /** AI-review effort tuning. adaptiveEffort (default true) = the app picks effort per layer;
   *  false = use the global `effort` for every review. effortByLayer overrides the built-in preset. */
  adaptiveEffort?: boolean;
  effortByLayer?: Record<string, string>;
  /** Per-STAGE engine/model/effort overrides over the global `engine`/`model`/`effort` default. Keyed by
   *  stage (the modeling layers + "polish" + "visual"); each field absent → use the global default. A stage
   *  can run on a different provider entirely (e.g. capabilities on Opus, entities on a cheap gateway model). */
  stages?: Record<string, { provider?: string; model?: string; effort?: string }>;
  /** Adaptive Anthropic defaults (default true): when on, an Anthropic stage with no per-stage override
   *  picks its model + effort from the layer's tier (heavy→Opus/high, standard→Sonnet, light→Haiku)
   *  instead of the flat global default. Per-stage `stages` overrides always win; gateways are unaffected. */
  adaptiveModel?: boolean;
  /** @deprecated superseded by adaptive tiers + per-stage `stages`. Left for back-compat; no longer read. */
  tierModels?: { light: string; standard: string; heavy: string };
  /** per-project interview override (tone/depth/domain); empty → global default. */
  coachConfig?: CoachConfig;
  /** persisted interview transcript (excludes the localized greeting). */
  coachTranscript?: CoachMsg[];
  /** MEANING-keys of findings the human has reviewed and chosen to ignore (acknowledged as acceptable /
   *  can't-fix-yet). Keyed on the hint's meaning — code + the NAMES of the artifacts it's about — not the
   *  generated id, so ignoring survives a regenerate that reissues ids. Filtered from badge counts + lists;
   *  restorable. (Renamed from the id-keyed `dismissedFindings`.) */
  ignoredFindings?: string[];
  updatedAt: number;
}

export interface CoachMsg {
  role: "user" | "assistant";
  content: string;
}

export interface ProjectState {
  projects: Project[];
  activeId: string;
}

const KEY = "kiln.projects";
const LEGACY_KEY = "vbd.projects"; // pre-Kiln storage key — migrated on load so existing users keep their projects
const ADAPTIVE_RESET_KEY = "kiln.adaptiveReset"; // guards the one-time clear of stale adaptiveModel:false

/** Empty narrative scaffold for a brand-new project (sections the parser expects). */
export const NARRATIVE_TEMPLATE = `# New Business

## Purpose
Describe what the business does.

## Customers
-

## Business Outcomes
-

## Core Activities
-

## Constraints
-
`;

export function uid(): string {
  return `p_${Math.floor(performance.now() * 1000).toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// Each example demonstrates a DIFFERENT execution-engine binding, so the gallery shows the full range of
// backends Kiln can target (Postgres, SQLite, Odoo, n8n, the generated spine, shadcn UI, Excel/Sheets).
const B_MULTISERVICE: Binding = { defaults: { store: "postgres", authorize: "postgres", react: "n8n", sequence: "n8n", operate: "node", emit: "node", "serve-ui": "shadcn" } };
const B_SINGLE_CONTAINER: Binding = { defaults: { store: "sqlite", authorize: "node", react: "node", sequence: "node", operate: "node", emit: "node", "serve-ui": "shadcn" } };
const B_ODOO_PLATFORM: Binding = { defaults: { store: "odoo", authorize: "odoo", react: "odoo", sequence: "odoo", operate: "odoo", emit: "odoo", "serve-ui": "odoo" } };

// The example gallery, as fresh Project objects (new ids on every call). Used both to seed a first-run
// store AND on demand from the in-app Examples picker — so the demos stay reachable even once a user has
// their own projects (the seed only runs on empty storage).
export function exampleProjects(): Project[] {
  const m = solarModel as unknown as Pick<Project, "capabilities" | "contexts" | "domain" | "roles" | "workflows" | "agents">;
  // The showcase: solar ships with a fully-baked model so every diagram is rich out of the box.
  const solar: Project = {
    id: uid(),
    name: "Sonnenkraft Solar (example)",
    description: "Regional solar installer — leads → design → install → service. Stack: PostgreSQL · n8n · a command API.",
    narrative: narrativeMd,
    model: "claude-sonnet-5",
    effort: "medium",
    capabilities: m.capabilities,
    contexts: m.contexts,
    domain: m.domain,
    roles: m.roles,
    workflows: m.workflows,
    agents: m.agents,
    binding: B_MULTISERVICE,
    provider: "example (generated)",
    updatedAt: 0,
  };
  // Pull the six model layers off a baked example model.json (same shape as solar's).
  const baked = (m: unknown): Partial<Project> => {
    const p = m as Pick<Project, "capabilities" | "contexts" | "domain" | "roles" | "workflows" | "agents">;
    return { capabilities: p.capabilities, contexts: p.contexts, domain: p.domain, roles: p.roles, workflows: p.workflows, agents: p.agents };
  };
  // A gallery entry: a rich narrative + a fully-baked model (so every diagram is rich out of the box).
  // `provider` notes the ingestion path the narrative came from.
  const example = (name: string, description: string, narrative: string, provider: string, binding: Binding, extra?: Partial<Project>): Project => ({
    id: uid(),
    name,
    description,
    narrative,
    model: "claude-sonnet-5",
    effort: "medium",
    capabilities: null, // description-first — derive the model in-app
    binding,
    provider,
    updatedAt: 0,
    ...extra,
  });
  return [
    solar,
    example(
      "Kanzlei Berger (law firm, example)",
      "Commercial law firm — matters, deadlines, trust accounting. Stack: SQLite (single container) · workflows as JS.",
      legalNarrative, "example (from a Zoom transcript)", B_SINGLE_CONTAINER, baked(legalModel)),
    example(
      "Röstwerk Coffee (franchise, example)",
      "Specialty-coffee franchise — franchisor ops, cafés, loyalty. Stack: PostgreSQL · n8n · Excel/Sheets.",
      baristaNarrative, "example (from an agent interview)", B_MULTISERVICE, { ...baked(coffeeModel), coachTranscript: baristaInterview }),
    example(
      "Abschied & Würde (funeral franchise, example)",
      "Funeral-service franchise — at-need & pre-need, tightly regulated. Stack: Odoo (full business platform).",
      funeralNarrative, "example (owner-entered)", B_ODOO_PLATFORM, baked(funeralModel)),
  ];
}

function seed(): ProjectState {
  const projects = exampleProjects();
  return { projects, activeId: projects[0].id };
}

export function loadProjects(): ProjectState {
  try {
    let raw = localStorage.getItem(KEY);
    if (!raw) {
      const legacy = localStorage.getItem(LEGACY_KEY); // one-time migration from the pre-Kiln key
      if (legacy) { raw = legacy; localStorage.setItem(KEY, legacy); }
    }
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as ProjectState;
    if (!parsed.projects?.length) return seed();
    if (!parsed.projects.some((p) => p.id === parsed.activeId)) {
      parsed.activeId = parsed.projects[0].id;
    }
    // One-time migration: `adaptiveModel` was deprecated/unread for a while, so any persisted `false`
    // from that era is stale — clear it once (guarded) so adaptive per-stage defaults come back on.
    // After this runs, a deliberate toggle-off in Settings persists normally.
    if (!localStorage.getItem(ADAPTIVE_RESET_KEY)) {
      for (const p of parsed.projects) if (p.adaptiveModel === false) delete p.adaptiveModel;
      localStorage.setItem(ADAPTIVE_RESET_KEY, "1");
    }
    return parsed;
  } catch {
    return seed();
  }
}

export function saveProjects(state: ProjectState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked — non-fatal for the MVP */
  }
}

export function newProject(name: string): Project {
  return {
    id: uid(),
    name: name.trim() || "Untitled",
    narrative: NARRATIVE_TEMPLATE,
    model: "claude-sonnet-5",
    effort: "medium",
    capabilities: null,
    provider: null,
    updatedAt: 0,
  };
}
