/**
 * Server sync for projects (ADR-006). The service is the source of truth when reachable; the
 * app keeps localStorage (projects.ts) as an offline cache + one-time import source. All calls
 * fail soft (return null / swallow) so the app degrades to local-only when the service is down.
 */

import type { Project } from "./projects";

import { SERVICE_URL } from "./config";

/** Returns the server's projects, or null if the service is unreachable. */
export async function serverListProjects(): Promise<Project[] | null> {
  try {
    const r = await fetch(`${SERVICE_URL}/api/projects`);
    if (!r.ok) return null;
    const d = await r.json();
    return Array.isArray(d.projects) ? (d.projects as Project[]) : [];
  } catch {
    return null;
  }
}

// SPEC-011 M5: an optional label names the version this save creates; `force` records a labelled
// checkpoint even when nothing changed (the explicit "Save version").
export async function serverSaveProject(p: Project, versionLabel?: string, force?: boolean): Promise<void> {
  try {
    await fetch(`${SERVICE_URL}/api/projects/${encodeURIComponent(p.id)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...p, versionLabel, forceCommit: force === true }),
    });
  } catch {
    /* offline — localStorage still holds it */
  }
}

export async function serverDeleteProject(id: string): Promise<void> {
  try {
    await fetch(`${SERVICE_URL}/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    /* offline */
  }
}

// SPEC-011: version history lives in the workspace's git repo (server-only). These fail soft → null,
// so the UI feature-detects (no history when the service is down / hosted serverless).
export interface WorkspaceVersion { sha: string; label: string; at: number }

/** A project's version history (newest first), or null if the service/history is unavailable. */
export async function serverListVersions(id: string): Promise<WorkspaceVersion[] | null> {
  try {
    const r = await fetch(`${SERVICE_URL}/api/projects/${encodeURIComponent(id)}/versions`);
    if (!r.ok) return null;
    const d = await r.json();
    return Array.isArray(d.versions) ? (d.versions as WorkspaceVersion[]) : [];
  } catch {
    return null;
  }
}

/** The full project as it was at a given version (for diffing two versions), or null. */
export async function serverGetVersion(id: string, sha: string): Promise<Project | null> {
  try {
    const r = await fetch(`${SERVICE_URL}/api/projects/${encodeURIComponent(id)}/versions/${encodeURIComponent(sha)}`);
    if (!r.ok) return null;
    const d = await r.json();
    return (d.project as Project) ?? null;
  } catch {
    return null;
  }
}

/** Restore a project to a past version; returns the restored project (now the working copy) or null. */
export async function serverRestoreVersion(id: string, sha: string): Promise<Project | null> {
  try {
    const r = await fetch(`${SERVICE_URL}/api/projects/${encodeURIComponent(id)}/restore`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sha }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.project as Project) ?? null;
  } catch {
    return null;
  }
}
