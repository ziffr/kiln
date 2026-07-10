/**
 * Server sync for projects (ADR-006). The service is the source of truth when reachable; the
 * app keeps localStorage (projects.ts) as an offline cache + one-time import source. All calls
 * fail soft (return null / swallow) so the app degrades to local-only when the service is down.
 */

import type { Project } from "./projects";

const SERVICE_URL = "http://localhost:8787";

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

export async function serverSaveProject(p: Project): Promise<void> {
  try {
    await fetch(`${SERVICE_URL}/api/projects/${encodeURIComponent(p.id)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(p),
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
