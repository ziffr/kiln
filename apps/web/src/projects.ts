/**
 * Light project store (ADR-005) — several businesses side by side, persisted to localStorage.
 * Interim until git-backed workspaces (ADR-002). Each project holds its own narrative,
 * last-generated capabilities, and model/effort prefs.
 */

import type { CapabilityDoc, DomainDoc, ContextsDoc, RolesDoc } from "@vbd/compiler";
import type { CoachConfig } from "@vbd/skills";
import { narrativeMd } from "./data/solar";

export interface Project {
  id: string;
  name: string;
  narrative: string;
  model: string;
  effort: string;
  /** last LLM-generated capabilities (null → use the live mock). */
  capabilities: CapabilityDoc | null;
  provider: string | null;
  /** last LLM-generated domain model (null → live mock derivation). */
  domain?: DomainDoc | null;
  /** last business-areas partition (SPEC-003; null → live mock partition). */
  contexts?: ContextsDoc | null;
  /** last roles/permissions model (SPEC-006; null → live mock). */
  roles?: RolesDoc | null;
  /** per-project interview override (tone/depth/domain); empty → global default. */
  coachConfig?: CoachConfig;
  /** persisted interview transcript (excludes the localized greeting). */
  coachTranscript?: CoachMsg[];
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

const KEY = "vbd.projects";

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

function uid(): string {
  return `p_${Math.floor(performance.now() * 1000).toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function seed(): ProjectState {
  const p: Project = {
    id: uid(),
    name: "Sonnenkraft Solar (example)",
    narrative: narrativeMd,
    model: "claude-sonnet-5",
    effort: "medium",
    capabilities: null,
    provider: null,
    updatedAt: 0,
  };
  return { projects: [p], activeId: p.id };
}

export function loadProjects(): ProjectState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as ProjectState;
    if (!parsed.projects?.length) return seed();
    if (!parsed.projects.some((p) => p.id === parsed.activeId)) {
      parsed.activeId = parsed.projects[0].id;
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
