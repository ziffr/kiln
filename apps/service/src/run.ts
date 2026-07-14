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
  views: unknown; // polished per-entity view specs (drives the preview's columns/formats), or {}
  startedAt: number;
}

const runs = new Map<string, RunEntry>();
let counter = 0;

// The Kiln mark (same glyph as Kiln Studio + the docs site) — inlined as a URL-encoded SVG data URI so
// the preview's browser tab + sidebar carry the brand, dependency-free and offline.
const KILN_LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><rect width="32" height="32" rx="8" fill="#d9772e"/><path d="M16 6c2.2 3 1 5.2-.6 6.8-1.6 1.6-3.4 3.4-3.4 6.2A4 4 0 0 0 16 23a4 4 0 0 0 4-4c0-1.2-.5-2.2-1.2-3 .2 1.6-.6 2.6-1.4 2.6-.9 0-1.4-.7-1.4-1.7 0-1.7 1.7-2.7 1.7-5 0-2.4-1.5-4.6-1.7-4.9z" fill="#fff"/></svg>';
const KILN_FAVICON = encodeURIComponent(KILN_LOGO_SVG);

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
  views: unknown = {},
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
  runs.set(id, { id, port, proc, dir, model, views: views && typeof views === "object" ? views : {}, startedAt: Date.now() });
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
export function runClientHtml(model: unknown, apiBase: string, views: unknown = {}): string {
  const m = (model && typeof model === "object" ? model : {}) as Record<string, unknown>;
  const domain = typeof m.domain === "string" ? m.domain : "app";
  const data = JSON.stringify({ model: m, api: apiBase, views: views && typeof views === "object" ? views : {} });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(domain)} — live preview</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${KILN_FAVICON}">
<style>
  /* Aligned with Kiln Studio's design language — warm paper, fired-clay ember accent, Inter. */
  :root {
    --bg:#faf9f6; --panel:#ffffff; --panel-2:#f4f2ee; --fg:#23201c; --muted:#7a756d;
    --edge:#dad5cc; --border:#eae6df; --accent:#c2410c; --accent-soft:#fbede4;
    --sidebar:#201c16; --sidebar-fg:#cfc8bd; --sidebar-muted:#8f887d; --radius:10px;
    --shadow:0 1px 2px rgba(35,32,28,.05), 0 6px 20px rgba(35,32,28,.05);
    font-family:"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  * { box-sizing: border-box; } body { margin: 0; font-size: 14px; color: var(--fg); background: var(--bg); }
  .app { display: flex; min-height: 100vh; }
  aside { width: 244px; background: var(--sidebar); color: var(--sidebar-fg); padding: 18px 14px; }
  .brand { display:flex; align-items:center; gap:9px; margin-bottom:2px; }
  .brand .mark { width:22px; height:22px; border-radius:6px; flex:0 0 auto; }
  aside h1 { font-size: 15px; color: #fff; text-transform: capitalize; margin: 0; font-weight: 650; letter-spacing:-.01em; }
  .badge { display:inline-block; font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:var(--accent); background:var(--accent-soft); padding:2px 7px; border-radius:999px; margin:8px 0 14px; }
  select.role { width: 100%; margin: 0 0 14px; padding: 7px 8px; background: #2a251d; color: var(--sidebar-fg); border: 1px solid #3a342c; border-radius: 8px; font: inherit; }
  .area-name { margin: 16px 0 4px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--sidebar-muted); }
  aside nav button { display: block; width: 100%; text-align: left; background: none; border: none; color: var(--sidebar-fg); padding: 6px 9px; border-radius: 7px; cursor: pointer; font: inherit; }
  aside nav button:hover { background: #2a251d; color: #fff; }
  aside nav button.sel { background: var(--accent); color: #fff; }
  main { flex: 1; padding: 28px 32px; max-width: 1000px; }
  h2 { font-size: 20px; font-weight: 650; letter-spacing:-.01em; margin: 0 0 16px; }
  h3 { font-size: 13px; font-weight: 620; margin: 0 0 12px; }
  table { border-collapse: separate; border-spacing: 0; width: 100%; margin-bottom: 22px; background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow); }
  th, td { padding: 9px 12px; text-align: left; border-bottom: 1px solid var(--border); }
  tr:last-child td { border-bottom: none; }
  th { background: var(--panel-2); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); font-weight: 600; }
  tbody tr:hover { background: #fcfbf9; }
  .panel { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; margin-bottom: 16px; max-width: 540px; box-shadow: var(--shadow); }
  .badge-cell { display:inline-block; padding:2px 10px; border-radius:999px; background:var(--accent-soft); color:var(--accent); font-size:12px; font-weight:550; text-transform:capitalize; }
  .stats { display:flex; gap:14px; flex-wrap:wrap; margin-bottom:22px; }
  .stat { background:var(--panel); border:1px solid var(--border); border-radius:var(--radius); padding:14px 18px; min-width:150px; box-shadow:var(--shadow); }
  .stat-label { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); font-weight:600; }
  .stat-value { font-size:24px; font-weight:650; letter-spacing:-.01em; margin-top:4px; }
  .card-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:14px; margin-bottom:22px; }
  .card { background:var(--panel); border:1px solid var(--border); border-radius:var(--radius); padding:16px; box-shadow:var(--shadow); position:relative; }
  .card-title { font-weight:620; }
  .card-sub { color:var(--muted); font-size:13px; margin-top:2px; }
  .card-meta { color:var(--muted); font-size:12px; margin-top:10px; display:flex; gap:10px; flex-wrap:wrap; }
  .card .del { position:absolute; top:10px; right:10px; }
  .board { display:flex; gap:14px; overflow-x:auto; padding-bottom:8px; margin-bottom:22px; }
  .board-col { flex:0 0 250px; background:var(--panel-2); border:1px solid var(--border); border-radius:var(--radius); padding:12px; }
  .board-col-head { font-size:12px; font-weight:650; text-transform:capitalize; margin-bottom:10px; display:flex; justify-content:space-between; color:var(--fg); }
  .board-col-head .count { color:var(--muted); font-weight:500; }
  .board .card { margin-bottom:10px; }
  label { display: block; margin-bottom: 10px; font-size: 12px; color: var(--muted); }
  label input { display: block; width: 100%; padding: 7px 9px; margin-top: 3px; font: inherit; color: var(--fg); background: var(--bg); border: 1px solid var(--edge); border-radius: 8px; }
  label input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  label input[type=checkbox] { width: auto; }
  .muted { color: var(--muted); font-size: 12px; }
  button.primary { background: var(--accent); color: #fff; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font: inherit; font-weight: 550; }
  button.primary:hover { filter: brightness(1.05); }
  td button { background: none; border: 1px solid var(--edge); color: var(--muted); border-radius: 7px; padding: 2px 8px; cursor: pointer; }
  td button:hover { border-color: var(--accent); color: var(--accent); }
  .cmds button { margin: 0 8px 8px 0; padding: 7px 13px; border: 1px solid var(--edge); color: var(--accent); background: var(--panel); border-radius: 8px; cursor: pointer; font: inherit; }
  .cmds button:hover { border-color: var(--accent); background: var(--accent-soft); }
</style></head>
<body><div class="app">
  <aside>
    <div class="brand"><img class="mark" src="data:image/svg+xml,${KILN_FAVICON}" alt=""><h1>${escapeHtml(domain)}</h1></div>
    <div class="badge">Kiln live preview</div>
    <select class="role" id="role"></select>
    <nav id="nav"></nav>
  </aside>
  <main id="main"></main>
</div>
<script>
const { model: MODEL, api: API, views: VIEWS } = ${data};
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
  // Render per the polished view spec (columns/formats/formFields) when present — else a sensible default.
  const view = VIEWS[entity.id] || defaultView(entity);
  if (view.description) main.append(el("p", { className: "muted", textContent: view.description }));
  const rows = (await api.list(entity.id)) || [];
  const typeOf = Object.fromEntries((entity.fields || []).map(f => [f.name, f.type]));

  // KPI tiles computed from the loaded rows (count / sum / avg).
  if (view.metrics && view.metrics.length) {
    const stats = el("div", { className: "stats" });
    view.metrics.forEach(m => {
      const s = el("div", { className: "stat" });
      s.append(el("div", { className: "stat-label", textContent: m.label }));
      s.append(el("div", { className: "stat-value", textContent: fmt(metricValue(rows, m), m.format) }));
      stats.append(s);
    });
    main.append(stats);
  }

  // The list, in the spec's layout: kanban board (grouped), a card grid, or the default table.
  const remove = async (r) => { await api.remove(entity.id, r.id); render(); };
  if (view.layout === "board" && view.groupBy) main.append(renderBoard(entity, view, rows, remove));
  else if (view.layout === "cards") main.append(renderCards(entity, view, rows, remove));
  else main.append(renderTable(entity, view, rows, remove));

  const form = {};
  const panel = el("div", { className: "panel" }); panel.append(el("h3", { textContent: "New " + entity.name }));
  view.formFields.forEach(name => {
    const type = typeOf[name] || "text";
    const lab = el("label"); lab.append(document.createTextNode(name + " "));
    lab.append(el("span", { className: "muted", textContent: type }));
    const inp = el("input", { type: inputType(type) });
    inp.oninput = e => { form[name] = type === "boolean" ? e.target.checked : e.target.value; };
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
function fmt(v, format) {
  if (v === null || v === undefined || v === "") return "";
  if (format === "money") return "$" + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 });
  if (format === "boolean" || typeof v === "boolean") return v ? "✓" : "✗";
  if (format === "longtext") { const s = String(v); return s.length > 64 ? s.slice(0, 64) + "…" : s; }
  return String(v);
}
// The default screen when a screen has no polished view spec: all fields, typed formats, no title.
function defaultView(entity) {
  const fields = entity.fields || [];
  return { columns: fields.map(f => ({ field: f.name, format: ["money","date","boolean"].includes(f.type) ? f.type : "text" })), formFields: fields.map(f => f.name) };
}
function metricValue(rows, m) {
  if (m.agg === "count") return rows.length;
  const nums = rows.map(r => Number(r[m.field])).filter(n => !Number.isNaN(n));
  const sum = nums.reduce((a, b) => a + b, 0);
  return m.agg === "avg" ? (nums.length ? sum / nums.length : 0) : sum;
}
function cardTitleField(entity, view) {
  return (view.card && view.card.title) || view.titleField || (view.columns[0] && view.columns[0].field) || ((entity.fields[0] || {}).name);
}
function makeCard(entity, view, r, remove) {
  const card = el("div", { className: "card" });
  const del = el("button", { className: "del", textContent: "✕" }); del.onclick = () => remove(r); card.append(del);
  card.append(el("div", { className: "card-title", textContent: String(r[cardTitleField(entity, view)] ?? "") }));
  const c = view.card || {};
  if (c.subtitle) card.append(el("div", { className: "card-sub", textContent: fmt(r[c.subtitle]) }));
  if (c.badge && r[c.badge] != null && r[c.badge] !== "") { const b = el("div"); b.append(el("span", { className: "badge-cell", textContent: String(r[c.badge]) })); card.append(b); }
  const tf = cardTitleField(entity, view);
  const meta = (c.meta && c.meta.length) ? c.meta : view.columns.map(x => x.field).filter(f => f !== tf).slice(0, 3);
  if (meta.length) {
    const md = el("div", { className: "card-meta" });
    meta.forEach(f => { const col = view.columns.find(x => x.field === f) || {}; md.append(el("span", { textContent: f + ": " + fmt(r[f], col.format) })); });
    card.append(md);
  }
  return card;
}
function renderCards(entity, view, rows, remove) {
  const grid = el("div", { className: "card-grid" });
  rows.forEach(r => grid.append(makeCard(entity, view, r, remove)));
  if (!rows.length) grid.append(el("p", { className: "muted", textContent: "No " + entity.name + " yet." }));
  return grid;
}
function renderBoard(entity, view, rows, remove) {
  const groups = {};
  rows.forEach(r => { const k = String(r[view.groupBy] == null || r[view.groupBy] === "" ? "—" : r[view.groupBy]); (groups[k] = groups[k] || []).push(r); });
  const board = el("div", { className: "board" });
  Object.keys(groups).forEach(k => {
    const col = el("div", { className: "board-col" });
    const head = el("div", { className: "board-col-head" });
    head.append(el("span", { textContent: k })); head.append(el("span", { className: "count", textContent: String(groups[k].length) }));
    col.append(head);
    groups[k].forEach(r => col.append(makeCard(entity, view, r, remove)));
    board.append(col);
  });
  return board;
}
function renderTable(entity, view, rows, remove) {
  const tbl = el("table");
  const thead = el("thead"); const htr = el("tr"); view.columns.forEach(c => htr.append(el("th", { textContent: c.field }))); htr.append(el("th")); thead.append(htr); tbl.append(thead);
  const tb = el("tbody");
  rows.forEach(r => {
    const tr = el("tr");
    view.columns.forEach(c => { const td = el("td"); if (c.format === "badge" && r[c.field] != null && r[c.field] !== "") td.append(el("span", { className: "badge-cell", textContent: String(r[c.field]) })); else td.textContent = fmt(r[c.field], c.format); tr.append(td); });
    const del = el("button", { textContent: "✕" }); del.onclick = () => remove(r);
    const td = el("td"); td.append(del); tr.append(td); tb.append(tr);
  });
  tbl.append(tb); return tbl;
}
function render() { renderRole(); renderNav(); renderMain(); }
render();
</script>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
