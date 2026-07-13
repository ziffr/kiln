/**
 * Filesystem project store (ADR-006). Each project is a directory under gitignored
 * `data/workspaces/<id>/`:
 *   business/narrative.md  — the authored narrative (ADR-002: text is the source of truth)
 *   project.json           — full project state for round-trip
 * The server is the source of truth when reachable; the web app keeps localStorage as an
 * offline cache + import source.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data", "workspaces");

export interface StoredProject {
  id: string;
  name: string;
  narrative: string;
  model: string;
  effort: string;
  capabilities: unknown;
  provider: string | null;
  /** SPEC-002 domain model + SPEC-003 business-areas partition (round-trip; REV-015 M3). */
  domain?: unknown;
  contexts?: unknown;
  coachConfig?: unknown;
  coachTranscript?: unknown;
  updatedAt: number;
}

/** Sanitize an id before using it as a path segment (traversal safety). */
function safeId(id: string): string {
  const s = String(id).replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!s || s === "." || s === "..") throw new Error("invalid project id");
  return s;
}

function dir(id: string): string {
  return join(ROOT, safeId(id));
}

/** The on-disk workspace directory for a project (SPEC-011: the git repo lives here). */
export function projectDir(id: string): string {
  return dir(id);
}

export function listProjects(): StoredProject[] {
  if (!existsSync(ROOT)) return [];
  const out: StoredProject[] = [];
  for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const p = join(ROOT, entry.name, "project.json");
    if (!existsSync(p)) continue;
    try {
      out.push(JSON.parse(readFileSync(p, "utf8")) as StoredProject);
    } catch {
      /* skip corrupt project.json */
    }
  }
  return out.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

export function saveProject(p: StoredProject): void {
  const d = dir(p.id);
  mkdirSync(join(d, "business"), { recursive: true });
  writeFileSync(join(d, "business", "narrative.md"), p.narrative ?? "");
  writeFileSync(join(d, "project.json"), `${JSON.stringify(p, null, 2)}\n`);
}

export function deleteProject(id: string): void {
  const d = dir(id);
  if (existsSync(d)) rmSync(d, { recursive: true, force: true });
}
