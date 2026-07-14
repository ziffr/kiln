/**
 * Dependency-free screenshots via the system Chrome/Chromium in headless mode — the eyes for the visual
 * UX pass. No npm dependency (Playwright/Puppeteer would break the offline-install constraint): we spawn
 * the browser binary with `--headless --screenshot`, which writes a PNG and exits. Gated + graceful, like
 * the verify sandbox: if no browser is found the visual pass reports itself unavailable.
 *
 * Server-only (child_process + fs).
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Candidate browser locations by platform + PATH names. First that exists wins.
const CANDIDATES = [
  process.env.KILN_CHROME, // explicit override
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean) as string[];

let cached: string | null | undefined;
let shotSeq = 0;

/** Locate a usable Chrome/Chromium binary (absolute path or a PATH name), or null. Result is cached. */
export function findChrome(): string | null {
  if (cached !== undefined) return cached;
  for (const c of CANDIDATES) {
    if (c.includes("/")) {
      if (existsSync(c)) return (cached = c);
    } else {
      // A bare command name: check it resolves on PATH via `command -v`.
      const r = spawnSync(process.platform === "win32" ? "where" : "which", [c], { encoding: "utf8" });
      if (r.status === 0 && r.stdout.trim()) return (cached = r.stdout.trim().split("\n")[0]);
    }
  }
  return (cached = null);
}

export function screenshotAvailable(): boolean {
  return findChrome() !== null;
}

/**
 * Screenshot a URL to a PNG buffer using headless Chrome. Returns null if no browser is available or the
 * capture failed. `width`/`height` set the viewport; the capture is a full-page shot of that viewport.
 *
 * ASYNC (spawn, not spawnSync) ON PURPOSE: the same service process serves the preview page that Chrome
 * loads, so we must NOT block the event loop while Chrome fetches it — a sync spawn would deadlock.
 */
export function screenshotUrl(url: string, opts: { width?: number; height?: number; timeoutMs?: number } = {}): Promise<Buffer | null> {
  const chrome = findChrome();
  if (!chrome) return Promise.resolve(null);
  const width = opts.width ?? 1280;
  const height = opts.height ?? 900;
  const out = join(tmpdir(), `kiln-shot-${Date.now()}-${shotSeq++}.png`);
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-sandbox",
    "--force-color-profile=srgb",
    `--window-size=${width},${height}`,
    // Give the SPA a moment to fetch rows + render before the shot.
    "--virtual-time-budget=2500",
    `--screenshot=${out}`,
    url,
  ];
  return new Promise((resolve) => {
    const finish = (buf: Buffer | null) => { try { rmSync(out, { force: true }); } catch {/* ignore */} resolve(buf); };
    let done = false;
    const child = spawn(chrome, args, { stdio: "ignore" });
    const timer = setTimeout(() => { if (!done) { done = true; try { child.kill("SIGKILL"); } catch {/* gone */} finish(existsSync(out) ? safeRead(out) : null); } }, opts.timeoutMs ?? 20000);
    child.on("error", () => { if (!done) { done = true; clearTimeout(timer); finish(null); } });
    child.on("exit", () => {
      if (done) return;
      done = true; clearTimeout(timer);
      finish(existsSync(out) ? safeRead(out) : null);
    });
  });
}

function safeRead(p: string): Buffer | null {
  try { const b = readFileSync(p); return b.length > 0 ? b : null; } catch { return null; }
}
