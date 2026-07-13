/**
 * SPEC-011 M1 — the git substrate for versioned workspaces. Each project's workspace directory
 * (ADR-006, `data/workspaces/<id>/`) is a git repo; saving commits, and history/read fall out of git.
 *
 * Server-only (uses `node:child_process`) — never imported by a pure package. All git calls go through
 * `execFile` with an argument array (NO shell), so ids/shas can't inject. Degrades gracefully: if git
 * isn't installed, commit is a no-op and history is empty, so persistence still works (ADR-006).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { join } from "node:path";

const exec = promisify(execFile);

async function git(dir: string, args: string[]): Promise<string> {
  const { stdout } = await exec("git", ["-C", dir, ...args], { maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

let gitOk: boolean | null = null;
export async function gitAvailable(): Promise<boolean> {
  if (gitOk !== null) return gitOk;
  try { await exec("git", ["--version"]); gitOk = true; } catch { gitOk = false; }
  return gitOk;
}

async function ensureRepo(dir: string): Promise<void> {
  if (existsSync(join(dir, ".git"))) return;
  await git(dir, ["init", "-q"]);
  // Local identity fallback so commits succeed without a global git config.
  await git(dir, ["config", "user.name", "Kiln Studio"]);
  await git(dir, ["config", "user.email", "studio@kiln.local"]);
  await git(dir, ["config", "commit.gpgsign", "false"]);
}

/**
 * Commit the whole workspace. Returns the new commit sha, or null if git is unavailable or nothing
 * changed (no empty commits on no-op saves). Never throws for the "no changes" case.
 */
export async function commitWorkspace(dir: string, message: string, allowEmpty = false): Promise<string | null> {
  if (!(await gitAvailable()) || !existsSync(dir)) return null;
  await ensureRepo(dir);
  await git(dir, ["add", "-A"]);
  if (!allowEmpty) {
    // `diff --cached --quiet` exits 0 when nothing is staged → resolves → nothing to commit.
    try { await git(dir, ["diff", "--cached", "--quiet"]); return null; } catch { /* has staged changes */ }
  }
  // allowEmpty (an explicit "Save version") records a labelled checkpoint even if nothing changed.
  await git(dir, ["commit", "-q", ...(allowEmpty ? ["--allow-empty"] : []), "-m", message]);
  return (await git(dir, ["rev-parse", "HEAD"])).trim();
}

export interface WorkspaceVersion {
  sha: string;
  label: string;
  at: number; // epoch ms
}

/** The project's version history, newest first. Empty if git is unavailable or the repo has no commits. */
export async function listVersions(dir: string): Promise<WorkspaceVersion[]> {
  if (!(await gitAvailable()) || !existsSync(join(dir, ".git"))) return [];
  // sha \x1f subject \x1f committer-epoch, records separated by \x1e (safe against newlines in messages).
  const out = await git(dir, ["log", "--pretty=format:%H%x1f%s%x1f%ct%x1e"]);
  return out.split("\x1e").map((r) => r.trim()).filter(Boolean).map((rec) => {
    const [sha, label, at] = rec.split("\x1f");
    return { sha, label: label ?? "", at: Number(at) * 1000 };
  });
}

/** The contents of a file at a given commit, or null if absent. `sha` is validated (hex) before use. */
export async function showFileAt(dir: string, sha: string, file: string): Promise<string | null> {
  if (!/^[0-9a-fA-F]{4,64}$/.test(sha)) throw new Error("invalid commit sha");
  if (!(await gitAvailable()) || !existsSync(join(dir, ".git"))) return null;
  try { return await git(dir, ["show", `${sha}:${file}`]); } catch { return null; }
}
