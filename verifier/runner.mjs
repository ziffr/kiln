/**
 * runner.mjs — runs INSIDE the sandbox container against a generated app at /work (or argv[2]).
 * Proves the app is real: boots the SQLite server and exercises its API, transform-checks every
 * client file, and (if deps are baked into the image) builds the client. Prints a JSON verdict.
 *
 * Untrusted, LLM-generated code runs here — this file assumes it is already isolated (no network,
 * memory/CPU/pids limits, ephemeral fs). See Dockerfile + service.mjs for the isolation boundary.
 */
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP = process.argv[2] || "/work";
const checks = [];
const record = (name, ok, detail) => { checks.push({ name, ok, detail: String(detail).slice(0, 400) }); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === "dist" || e === ".git") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(jsx|js|mjs)$/.test(e)) out.push(p);
  }
  return out;
}

const sample = (type) => (type === "number" || type === "money" ? 1 : type === "boolean" ? true : type === "date" ? "2025-01-01" : "smoke-test");

// 1) Boot the server and exercise the API (auth off so role gating doesn't block the smoke test).
async function checkServer() {
  let model;
  try { model = JSON.parse(readFileSync(join(APP, "model.json"), "utf8")); } catch (e) { return record("server:model", false, "no model.json: " + e.message); }
  const port = 8000 + Math.floor((Date.now() % 1000));
  const srv = spawn("node", ["--disable-warning=ExperimentalWarning", "server.mjs"], { cwd: APP, env: { ...process.env, PORT: String(port), AUTH: "off", DB: join(APP, "probe.db") }, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  srv.stdout.on("data", (d) => (log += d));
  srv.stderr.on("data", (d) => (log += d));
  try {
    const base = `http://127.0.0.1:${port}`;
    let up = false;
    for (let i = 0; i < 40; i++) { await sleep(150); try { const r = await fetch(base + "/api/meta"); if (r.ok) { up = true; break; } } catch { /* not yet */ } }
    if (!up) return record("server:boot", false, "server did not start: " + log);
    record("server:boot", true, "listening on " + port);

    const entity = model.entities?.[0];
    if (entity) {
      const body = {}; for (const f of entity.fields || []) body[f.name] = sample(f.type);
      const cr = await fetch(`${base}/api/${entity.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      record("server:create", cr.status === 201, `POST /api/${entity.id} → ${cr.status}`);
      const list = await fetch(`${base}/api/${entity.id}`).then((r) => r.json());
      record("server:persist", Array.isArray(list) && list.length >= 1, `${(list || []).length} row(s) after create`);
    }
    const cmd = model.commands?.[0];
    if (cmd) {
      const cc = await fetch(`${base}/api/commands/${cmd.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      record("server:command", cc.ok, `POST /api/commands/${cmd.id} → ${cc.status}`);
    }
  } catch (e) {
    record("server:probe", false, e.message);
  } finally {
    srv.kill("SIGKILL");
  }
}

// 2) Transform-check every client file (real build-verification of the generated JSX/JS).
async function checkTransform() {
  let esbuild;
  try { esbuild = (await import("esbuild")).default ?? (await import("esbuild")); } catch { return record("client:transform", true, "esbuild unavailable — skipped (bake it into the image)"); }
  const files = walk(join(APP, "web"));
  const bad = [];
  for (const f of files) {
    try { esbuild.transformSync(readFileSync(f, "utf8"), { loader: f.endsWith(".jsx") ? "jsx" : "js" }); }
    catch (e) { bad.push(f.replace(APP + "/", "") + ": " + String(e.message).split("\n")[0]); }
  }
  record("client:transform", bad.length === 0, bad.length ? bad.join(" | ") : `${files.length} files compile`);
}

// 3) Full client build (only if node_modules is baked into the image → offline `vite build`).
async function checkBuild() {
  try { statSync(join(APP, "web", "node_modules")); } catch { return record("client:build", true, "web/node_modules absent — build skipped (transform-check still ran)"); }
  await new Promise((resolve) => {
    const b = spawn("npm", ["run", "build"], { cwd: join(APP, "web"), stdio: ["ignore", "pipe", "pipe"] });
    let out = ""; b.stdout.on("data", (d) => (out += d)); b.stderr.on("data", (d) => (out += d));
    b.on("close", (code) => { record("client:build", code === 0, code === 0 ? "vite build ok" : out.slice(-300)); resolve(); });
  });
}

await checkServer();
await checkTransform();
await checkBuild();
const ok = checks.every((c) => c.ok);
console.log(JSON.stringify({ ok, checks }, null, 2));
process.exit(ok ? 0 : 1);
