/**
 * Local "Run app" sandbox — boots the GENERATED self-contained app so you can click through it live,
 * then export. The generated `server.mjs` is a zero-dependency Node API (node:http + node:sqlite), so a
 * run needs no `npm install` and works offline with real SQLite persistence. We spawn it on an ephemeral
 * port and serve a dependency-free vanilla admin page (built from model.json) that talks to it — one URL,
 * opened in a new browser tab. The fancy Vite/React client in the export is skipped here (it would need a
 * build); this preview mirrors it in plain JS so the loop stays instant.
 *
 * Server-only (fs + child_process): apps/service is the server-only exception to the pure-package rule.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

interface RunEntry {
  id: string;
  port: number;
  proc: ChildProcess;
  dir: string;
  model: unknown;
  startedAt: number;
}

const runs = new Map<string, RunEntry>();
let counter = 0;

/** Ask the OS for a free TCP port (bind :0, read it back, release it). */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/** Poll the spawned API's /api/meta until it answers (it's up) or we give up. */
async function waitReady(port: number, timeoutMs = 8000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://localhost:${port}/api/meta`);
      if (r.ok) return true;
    } catch {/* not up yet */}
    await new Promise((res) => setTimeout(res, 150));
  }
  return false;
}

/**
 * Write the generated API files to a temp dir and boot `node server.mjs` on a free port.
 * Returns the run id, its API port, and the browseable UI url (served by THIS service).
 */
export async function startRun(
  files: Record<string, string>,
  origin: string,
): Promise<{ id: string; port: number; uiUrl: string }> {
  if (!files["server.mjs"] || !files["handlers.mjs"] || !files["model.json"]) {
    throw new Error("generated app is missing server.mjs / handlers.mjs / model.json");
  }
  const id = `run_${(counter++).toString(36)}_${Date.now().toString(36)}`;
  const dir = mkdtempSync(join(tmpdir(), "kiln-run-"));
  mkdirSync(dir, { recursive: true });
  // Only the zero-dep API files are needed to run (the Vite client is not built for the preview).
  for (const name of ["server.mjs", "handlers.mjs", "model.json"]) writeFileSync(join(dir, name), files[name]);

  const port = await freePort();
  const proc = spawn(process.execPath, ["server.mjs"], {
    cwd: dir,
    // AUTH=off so writes aren't role-gated in the preview (the model's roles still show); DB persists in the temp dir.
    env: { ...process.env, PORT: String(port), DB: join(dir, "data.db"), AUTH: "off", CORS_ORIGIN: "*" },
    stdio: "ignore",
  });
  proc.on("exit", () => runs.delete(id));

  const ready = await waitReady(port);
  if (!ready) {
    try { proc.kill(); } catch {/* already gone */}
    rmSync(dir, { recursive: true, force: true });
    throw new Error("the generated app did not start (needs Node ≥ 22 for built-in SQLite)");
  }
  let model: unknown = {};
  try { model = JSON.parse(files["model.json"]); } catch {/* keep {} */}
  runs.set(id, { id, port, proc, dir, model, startedAt: Date.now() });
  return { id, port, uiUrl: `${origin}/run/${id}/` };
}

export function getRun(id: string): RunEntry | undefined {
  return runs.get(id);
}

export function stopRun(id: string): boolean {
  const r = runs.get(id);
  if (!r) return false;
  try { r.proc.kill(); } catch {/* already gone */}
  try { rmSync(r.dir, { recursive: true, force: true }); } catch {/* best-effort */}
  runs.delete(id);
  return true;
}

/** Kill every running sandbox (called on service shutdown). */
export function stopAllRuns(): void {
  for (const id of [...runs.keys()]) stopRun(id);
}

// Best-effort cleanup so we don't leak node subprocesses when the service stops.
for (const sig of ["exit", "SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => { stopAllRuns(); if (sig !== "exit") process.exit(0); });
}

/**
 * A dependency-free vanilla admin page for a running sandbox: entity tables + typed create forms +
 * command buttons + a live event log, talking to the spawned API at `apiBase`. Pure string builder
 * (exported for a unit test); the model is inlined as JSON so the page needs no extra fetch to boot.
 */
export function runClientHtml(model: unknown, apiBase: string): string {
  const m = (model && typeof model === "object" ? model : {}) as Record<string, unknown>;
  const domain = typeof m.domain === "string" ? m.domain : "app";
  const data = JSON.stringify({ model: m, api: apiBase });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(domain)} — live preview</title>
<style>
  * { box-sizing: border-box; } body { margin: 0; font: 14px system-ui, sans-serif; color: #1f2937; }
  .app { display: flex; min-height: 100vh; }
  aside { width: 230px; background: #0f172a; color: #cbd5e1; padding: 16px; }
  aside h1 { font-size: 15px; color: #fff; text-transform: capitalize; margin: 0 0 4px; }
  .badge { display:inline-block; font-size:10px; letter-spacing:.05em; text-transform:uppercase; color:#93c5fd; margin-bottom:12px; }
  select.role { width: 100%; margin: 8px 0 12px; padding: 5px; background: #1e293b; color: #cbd5e1; border: 1px solid #334155; border-radius: 5px; }
  .area-name { margin: 14px 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; }
  aside button { display: block; width: 100%; text-align: left; background: none; border: none; color: #cbd5e1; padding: 5px 8px; border-radius: 5px; cursor: pointer; }
  aside button:hover, aside button.sel { background: #1e293b; color: #fff; }
  main { flex: 1; padding: 24px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
  th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; }
  th { background: #f9fafb; }
  .panel { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px; max-width: 520px; }
  label { display: block; margin-bottom: 8px; } label input { display: block; width: 100%; padding: 5px; margin-top: 2px; }
  label input[type=checkbox] { width: auto; }
  .muted { color: #9ca3af; font-size: 12px; }
  button.primary { background: #4f46e5; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
  .cmds button { margin: 0 8px 8px 0; padding: 6px 12px; border: 1px solid #4f46e5; color: #4f46e5; background: #fff; border-radius: 6px; cursor: pointer; }
</style></head>
<body><div class="app">
  <aside>
    <h1>${escapeHtml(domain)}</h1><div class="badge">Kiln live preview</div>
    <select class="role" id="role"></select>
    <nav id="nav"></nav>
  </aside>
  <main id="main"></main>
</div>
<script>
const { model: MODEL, api: API } = ${data};
let role = "";
const H = () => ({ "content-type": "application/json", "x-role": role });
const api = {
  list: (e) => fetch(API + "/api/" + e, { headers: H() }).then(r => r.json()),
  create: (e, b) => fetch(API + "/api/" + e, { method: "POST", headers: H(), body: JSON.stringify(b) }).then(r => r.json()),
  remove: (e, id) => fetch(API + "/api/" + e + "/" + id, { method: "DELETE", headers: H() }).then(r => r.json()),
  command: (id, b) => fetch(API + "/api/commands/" + id, { method: "POST", headers: H(), body: JSON.stringify(b || {}) }).then(r => r.json()),
  events: () => fetch(API + "/api/events").then(r => r.json()),
};
const el = (t, props, kids) => { const n = document.createElement(t); Object.assign(n, props || {}); (kids||[]).forEach(k => n.append(k)); return n; };
const entities = MODEL.entities || [];
const roles = (MODEL.roles || []).map(r => typeof r === "string" ? r : r.name);
let screen = entities[0] ? entities[0].id : "__events__";

function renderRole() {
  const s = document.getElementById("role");
  s.innerHTML = "";
  s.append(el("option", { value: "", textContent: "(no role)" }));
  roles.forEach(r => s.append(el("option", { value: r, textContent: r })));
  s.onchange = e => { role = e.target.value; render(); };
  if (!roles.length) s.style.display = "none";
}
function renderNav() {
  const nav = document.getElementById("nav"); nav.innerHTML = "";
  const byArea = {};
  entities.forEach(e => { (byArea[e.area || "Model"] = byArea[e.area || "Model"] || []).push(e); });
  Object.keys(byArea).forEach(area => {
    nav.append(el("div", { className: "area-name", textContent: area }));
    byArea[area].forEach(e => {
      const b = el("button", { textContent: e.name, className: screen === e.id ? "sel" : "" });
      b.onclick = () => { screen = e.id; render(); }; nav.append(b);
    });
  });
  nav.append(el("div", { className: "area-name", textContent: "System" }));
  const eb = el("button", { textContent: "Event log", className: screen === "__events__" ? "sel" : "" });
  eb.onclick = () => { screen = "__events__"; render(); }; nav.append(eb);
}
const inputType = t => ({ number: "number", money: "number", date: "date", boolean: "checkbox" })[t] || "text";

async function renderMain() {
  const main = document.getElementById("main"); main.innerHTML = "";
  if (screen === "__events__") {
    main.append(el("h2", { textContent: "Event log" }));
    const rows = await api.events();
    const tbl = el("table");
    const thead = el("thead"); const htr = el("tr"); ["type", "entity", "from command"].forEach(h => htr.append(el("th", { textContent: h }))); thead.append(htr); tbl.append(thead);
    const tb = el("tbody");
    (rows || []).forEach(ev => { const tr = el("tr"); [ev.type, ev.entity, ev.command].forEach(v => tr.append(el("td", { textContent: String(v ?? "") }))); tb.append(tr); });
    tbl.append(tb); main.append(tbl);
    return;
  }
  const entity = entities.find(e => e.id === screen); if (!entity) return;
  main.append(el("h2", { textContent: entity.name }));
  const rows = await api.list(entity.id);
  const fields = entity.fields || [];
  const tbl = el("table");
  const thead = el("thead"); const htr = el("tr"); fields.forEach(f => htr.append(el("th", { textContent: f.name }))); htr.append(el("th")); thead.append(htr); tbl.append(thead);
  const tb = el("tbody");
  (rows || []).forEach(r => {
    const tr = el("tr");
    fields.forEach(f => tr.append(el("td", { textContent: fmt(r[f.name]) }))); // textContent → no XSS from user-entered data
    const del = el("button", { textContent: "✕" }); del.onclick = async () => { await api.remove(entity.id, r.id); render(); };
    const td = el("td"); td.append(del); tr.append(td); tb.append(tr);
  });
  tbl.append(tb); main.append(tbl);

  const form = {};
  const panel = el("div", { className: "panel" }); panel.append(el("h3", { textContent: "New " + entity.name }));
  fields.forEach(f => {
    const lab = el("label"); lab.append(document.createTextNode(f.name + " "));
    lab.append(el("span", { className: "muted", textContent: f.type }));
    const inp = el("input", { type: inputType(f.type) });
    inp.oninput = e => { form[f.name] = f.type === "boolean" ? e.target.checked : e.target.value; };
    lab.append(inp); panel.append(lab);
  });
  const create = el("button", { className: "primary", textContent: "Create" });
  create.onclick = async () => { await api.create(entity.id, form); render(); };
  panel.append(create); main.append(panel);

  const cmds = (MODEL.commands || []).filter(c => c.entity === entity.id);
  if (cmds.length) {
    const cp = el("div", { className: "panel cmds" }); cp.append(el("h3", { textContent: "Actions" }));
    cmds.forEach(c => { const b = el("button", { textContent: c.name }); b.onclick = async () => { await api.command(c.id, form); render(); }; cp.append(b); });
    main.append(cp);
  }
}
function fmt(v) { if (v === null || v === undefined) return ""; if (typeof v === "boolean") return v ? "✓" : "✗"; return String(v); }
function render() { renderRole(); renderNav(); renderMain(); }
render();
</script>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
