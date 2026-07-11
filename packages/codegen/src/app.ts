/**
 * generateApp — project the model into a COMPLETE, RUNNABLE full-stack starter (not just scaffolding).
 * Returns a file map (path → contents): a zero-dependency Node API (entities CRUD + command endpoints
 * + in-memory store + event log + reactions) and a Vite/React admin client, both driven by the model.
 * The API runs with `node server.mjs` (no install); the client with `cd web && npm i && npm run dev`.
 *
 * This is the deterministic base — correct and runnable by construction. The LLM enhancement pass
 * (generateAppLogic) rewrites the command handler + component bodies with real domain logic on top.
 */

import { slug } from "@vbd/ir";
import { attributeSpecs, type CapabilityDoc, type DomainDoc, type ContextsDoc, type RolesDoc } from "@vbd/compiler";

export interface AppModel {
  domain: string;
  entities: { id: string; name: string; owner: string; area: string; fields: { name: string; type: string }[]; references: string[] }[];
  commands: { id: string; name: string; entity: string; emits: string[] }[];
  events: { id: string; name: string; entity: string; trigger: string }[];
  policies: { name: string; on: string; then: string }[];
  areas: { name: string; capabilities: string[] }[];
}

/** Distil the IR into the flat, slugged shape the generated app is driven by. */
export function projectAppModel(caps: CapabilityDoc, domain: DomainDoc, contexts?: ContextsDoc): AppModel {
  const areaOfCap = new Map<string, string>();
  for (const c of contexts?.contexts ?? []) for (const m of [...(c.capabilities ?? []), ...(c.shared_kernel ?? [])]) areaOfCap.set(m, c.name || c.id);
  return {
    domain: caps.domain || "business",
    entities: domain.aggregates.map((a) => ({
      id: slug(a.id),
      name: a.name || a.id,
      owner: a.owner,
      area: areaOfCap.get(a.owner) ?? "General",
      fields: attributeSpecs(a).map((s) => ({ name: s.name, type: s.type || "text" })),
      references: (a.references ?? []).map((r) => slug(r)),
    })),
    commands: (domain.commands ?? []).map((c) => ({ id: slug(c.id), name: c.name, entity: slug(c.aggregate), emits: (c.emits ?? []).map((e) => slug(e)) })),
    events: (domain.events ?? []).map((e) => ({ id: slug(e.id), name: e.name, entity: slug(e.aggregate), trigger: e.trigger || "command" })),
    policies: (domain.policies ?? []).map((p) => ({ name: p.name, on: slug(p.on), then: slug(p.then) })),
    areas: (contexts?.contexts ?? []).map((c) => ({ name: c.name || c.id, capabilities: (c.capabilities ?? []).map((m) => slug(m)) })),
  };
}

const J = (v: unknown): string => JSON.stringify(v, null, 2);

/** The command-handler module (business logic per command). Generic by default; the LLM pass swaps
 *  in richer bodies. Kept in its own file so enhancement is an isolated, low-risk file replacement. */
function handlersFile(m: AppModel, overrides: Record<string, string> = {}): string {
  const lines = [
    "// Command handlers: (input, ctx) => a record to store. ctx = { genId, all(entity), find(entity,id) }.",
    "// Refine the business logic here (defaults, computed fields, validation).",
    "export const HANDLERS = {",
  ];
  for (const c of m.commands) {
    const body = overrides[c.id]?.trim() || "(input, ctx) => ({ ...input })";
    lines.push(`  ${JSON.stringify(c.id)}: ${body}, // ${c.name} → ${c.entity}`);
  }
  lines.push("};");
  return lines.join("\n");
}

/** The zero-dependency Node API server (runs with `node server.mjs`). */
function serverFile(m: AppModel): string {
  return `// ${m.domain} — generated API (zero-dependency Node). Run: node server.mjs
import { createServer } from 'node:http';
import { HANDLERS } from './handlers.mjs';

export const MODEL = ${J({ entities: m.entities, commands: m.commands, events: m.events, policies: m.policies })};

const PORT = process.env.PORT || 8787;
const db = Object.fromEntries(MODEL.entities.map(e => [e.id, []]));
const eventLog = [];
let seq = 1;
const genId = () => 'id_' + (seq++);

// Execute a modelled command: run its handler to build the record, append emitted events, and fire
// any reactions (policies) whose trigger event matches — a real cross-entity hand-off, depth-guarded.
export function runCommand(cmdId, input = {}, depth = 0) {
  const cmd = MODEL.commands.find(c => c.id === cmdId);
  if (!cmd) throw new Error('unknown command ' + cmdId);
  const ctx = { genId, all: (e) => db[e] || [], find: (e, id) => (db[e] || []).find(r => r.id === id) };
  let built = {};
  try { built = HANDLERS[cmdId] ? HANDLERS[cmdId](input, ctx) : { ...input }; } catch (e) { built = { ...input, _handlerError: String(e && e.message || e) }; }
  const rec = { id: genId(), ...built, _command: cmdId, _at: Date.now() };
  (db[cmd.entity] ||= []).push(rec);
  const emitted = [];
  for (const evId of cmd.emits) {
    const ev = { id: genId(), type: evId, entity: cmd.entity, command: cmdId, at: Date.now() };
    eventLog.push(ev); emitted.push(evId);
    if (depth < 5) for (const p of MODEL.policies) if (p.on === evId) {
      try { runCommand(p.then, { _reactedTo: evId }, depth + 1); } catch { /* reaction target not runnable yet */ }
    }
  }
  return { record: rec, emitted };
}

const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-allow-headers': 'content-type' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((resolve) => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } }); });

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, 'http://x');
  const parts = url.pathname.replace(/^\\/api\\//, '').split('/').filter(Boolean);
  try {
    if (parts[0] === 'meta') return send(res, 200, MODEL);
    if (parts[0] === 'events') return send(res, 200, eventLog);
    if (parts[0] === 'commands' && req.method === 'POST') return send(res, 200, runCommand(parts[1], await readBody(req)));
    const entity = parts[0];
    if (!db[entity]) return send(res, 404, { error: 'no such entity: ' + entity });
    const id = parts[1];
    if (req.method === 'GET' && !id) return send(res, 200, db[entity]);
    if (req.method === 'GET' && id) return send(res, 200, db[entity].find(r => r.id === id) || null);
    if (req.method === 'POST') { const rec = { id: genId(), ...(await readBody(req)) }; db[entity].push(rec); return send(res, 201, rec); }
    if (req.method === 'PUT' && id) { const i = db[entity].findIndex(r => r.id === id); if (i < 0) return send(res, 404, {}); db[entity][i] = { ...db[entity][i], ...(await readBody(req)) }; return send(res, 200, db[entity][i]); }
    if (req.method === 'DELETE' && id) { db[entity] = db[entity].filter(r => r.id !== id); return send(res, 200, { ok: true }); }
    send(res, 405, { error: 'method not allowed' });
  } catch (e) { send(res, 500, { error: String(e && e.message || e) }); }
}).listen(PORT, () => console.log('API on http://localhost:' + PORT));
`;
}

/** The React client (Vite). State-based nav (no router dep): a screen per entity + an events view. */
function clientFiles(m: AppModel): Record<string, string> {
  return {
    "web/package.json": J({
      name: `${slug(m.domain)}-web`,
      private: true,
      type: "module",
      scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
      dependencies: { react: "^18.2.0", "react-dom": "^18.2.0" },
      devDependencies: { "@vitejs/plugin-react": "^4.2.0", vite: "^5.0.0" },
    }),
    "web/vite.config.js": `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n// Proxy /api to the Node server so the client can fetch it in dev.\nexport default defineConfig({ plugins: [react()], server: { proxy: { '/api': 'http://localhost:8787' } } });\n`,
    "web/index.html": `<!doctype html>\n<html><head><meta charset="utf-8"><title>${m.domain} admin</title></head>\n<body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>\n`,
    "web/src/main.jsx": `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport { App } from './App.jsx';\nimport './styles.css';\ncreateRoot(document.getElementById('root')).render(<App />);\n`,
    "web/src/schema.js": `// The model, shared with the API. Drives every generated screen.\nexport const MODEL = ${J({ domain: m.domain, entities: m.entities, commands: m.commands, events: m.events, areas: m.areas })};\n`,
    "web/src/api.js": `const j = (r) => r.json();\nexport const api = {\n  list: (e) => fetch('/api/' + e).then(j),\n  create: (e, body) => fetch('/api/' + e, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(j),\n  remove: (e, id) => fetch('/api/' + e + '/' + id, { method: 'DELETE' }).then(j),\n  command: (id, body) => fetch('/api/commands/' + id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }).then(j),\n  events: () => fetch('/api/events').then(j),\n};\n`,
    "web/src/App.jsx": `import React, { useState } from 'react';\nimport { MODEL } from './schema.js';\nimport { EntityScreen } from './components/EntityScreen.jsx';\nimport { EventsScreen } from './components/EventsScreen.jsx';\n\nexport function App() {\n  const [screen, setScreen] = useState(MODEL.entities[0]?.id || 'events');\n  const byArea = {};\n  for (const e of MODEL.entities) (byArea[e.area] ||= []).push(e);\n  return (\n    <div className="app">\n      <aside>\n        <h1>${m.domain}</h1>\n        {Object.entries(byArea).map(([area, ents]) => (\n          <div key={area} className="area"><div className="area-name">{area}</div>\n            {ents.map(e => <button key={e.id} className={screen === e.id ? 'sel' : ''} onClick={() => setScreen(e.id)}>{e.name}</button>)}\n          </div>\n        ))}\n        <div className="area"><div className="area-name">System</div>\n          <button className={screen === 'events' ? 'sel' : ''} onClick={() => setScreen('events')}>Event log</button>\n        </div>\n      </aside>\n      <main>{screen === 'events' ? <EventsScreen /> : <EntityScreen key={screen} entity={MODEL.entities.find(e => e.id === screen)} />}</main>\n    </div>\n  );\n}\n`,
    "web/src/components/EntityScreen.jsx": `import React, { useEffect, useState } from 'react';\nimport { MODEL } from '../schema.js';\nimport { api } from '../api.js';\n\n// Generic screen for one entity: a table of records, a create form built from the typed fields, and\n// buttons for the commands that act on this entity. Refine per entity, or let the LLM pass rewrite it.\nexport function EntityScreen({ entity }) {\n  const [rows, setRows] = useState([]);\n  const [form, setForm] = useState({});\n  const commands = MODEL.commands.filter(c => c.entity === entity.id);\n  const load = () => api.list(entity.id).then(setRows);\n  useEffect(() => { load(); }, [entity.id]);\n  const set = (name, val) => setForm(f => ({ ...f, [name]: val }));\n  const create = async () => { await api.create(entity.id, form); setForm({}); load(); };\n  return (\n    <div>\n      <h2>{entity.name}</h2>\n      <table><thead><tr><th>id</th>{entity.fields.map(f => <th key={f.name}>{f.name}</th>)}<th></th></tr></thead>\n        <tbody>{rows.map(r => (<tr key={r.id}><td>{r.id}</td>{entity.fields.map(f => <td key={f.name}>{String(r[f.name] ?? '')}</td>)}<td><button onClick={async () => { await api.remove(entity.id, r.id); load(); }}>✕</button></td></tr>))}</tbody>\n      </table>\n      <div className="form"><h3>New {entity.name}</h3>\n        {entity.fields.map(f => (<label key={f.name}>{f.name} <span className="muted">{f.type}</span>\n          <input type={ {number:'number',money:'number',date:'date',boolean:'checkbox'}[f.type] || 'text' } checked={f.type==='boolean'?!!form[f.name]:undefined} value={f.type==='boolean'?undefined:(form[f.name] ?? '')} onChange={e => set(f.name, f.type==='boolean'?e.target.checked:e.target.value)} />\n        </label>))}\n        <button className="primary" onClick={create}>Create</button>\n      </div>\n      {commands.length > 0 && (<div className="commands"><h3>Actions</h3>\n        {commands.map(c => <button key={c.id} onClick={async () => { await api.command(c.id, form); setForm({}); load(); }}>{c.name}</button>)}\n      </div>)}\n    </div>\n  );\n}\n`,
    "web/src/components/EventsScreen.jsx": `import React, { useEffect, useState } from 'react';\nimport { api } from '../api.js';\nexport function EventsScreen() {\n  const [events, setEvents] = useState([]);\n  useEffect(() => { const t = setInterval(() => api.events().then(setEvents), 1000); api.events().then(setEvents); return () => clearInterval(t); }, []);\n  return (<div><h2>Event log</h2><table><thead><tr><th>type</th><th>entity</th><th>from command</th></tr></thead>\n    <tbody>{events.map(e => <tr key={e.id}><td>{e.type}</td><td>{e.entity}</td><td>{e.command}</td></tr>)}</tbody></table></div>);\n}\n`,
    "web/src/styles.css": `* { box-sizing: border-box; } body { margin: 0; font: 14px system-ui, sans-serif; color: #1f2937; }\n.app { display: flex; min-height: 100vh; }\naside { width: 220px; background: #0f172a; color: #cbd5e1; padding: 16px; }\naside h1 { font-size: 16px; color: #fff; text-transform: capitalize; }\n.area-name { margin: 14px 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; }\naside button { display: block; width: 100%; text-align: left; background: none; border: none; color: #cbd5e1; padding: 5px 8px; border-radius: 5px; cursor: pointer; }\naside button:hover, aside button.sel { background: #1e293b; color: #fff; }\nmain { flex: 1; padding: 24px; }\ntable { border-collapse: collapse; width: 100%; margin-bottom: 20px; }\nth, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; }\nth { background: #f9fafb; }\n.form, .commands { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px; max-width: 480px; }\nlabel { display: block; margin-bottom: 8px; } label input { display: block; width: 100%; padding: 5px; margin-top: 2px; }\nlabel input[type=checkbox] { width: auto; }\n.muted { color: #9ca3af; font-size: 12px; }\nbutton.primary { background: #4f46e5; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; }\n.commands button { margin: 0 8px 8px 0; padding: 6px 12px; border: 1px solid #4f46e5; color: #4f46e5; background: #fff; border-radius: 6px; cursor: pointer; }\n`,
  };
}

export function generateApp(
  caps: CapabilityDoc,
  domain: DomainDoc,
  contexts?: ContextsDoc,
  _roles?: RolesDoc,
  handlerCode?: Record<string, string>, // optional LLM-written handler bodies, keyed by command id
): Record<string, string> {
  const m = projectAppModel(caps, domain, contexts);
  const files: Record<string, string> = {
    "package.json": J({
      name: `${slug(m.domain)}-app`,
      private: true,
      type: "module",
      scripts: { start: "node server.mjs" },
      description: `Generated ${m.domain} app — API + admin client, derived from the business model.`,
    }),
    "server.mjs": serverFile(m),
    "handlers.mjs": handlersFile(m, handlerCode ?? {}),
    "model.json": J(m),
    "README.md": readme(m),
    ...clientFiles(m),
  };
  return files;
}

function readme(m: AppModel): string {
  return `# ${m.domain} — generated application

A runnable full-stack starter derived from the business model (${m.entities.length} entities, ${m.commands.length} commands, ${m.events.length} events, ${m.policies.length} automations).

## Run it

**API** (no install needed — zero dependencies):
\`\`\`
node server.mjs        # http://localhost:8787
\`\`\`

**Admin client:**
\`\`\`
cd web && npm install && npm run dev    # http://localhost:5173 (proxies /api to the server)
\`\`\`

## What's here
- \`server.mjs\` — REST CRUD per entity, a POST endpoint per command (creates a record, emits events, fires reactions/automations), and an event log. In-memory store.
- \`web/\` — a React admin: a screen per entity (table + typed create form + command buttons), grouped by business area, plus a live event log.
- \`model.json\` — the model this was generated from.

This is a starting point to refine — the entities, commands, events and automations are wired from your model; the handler and screen bodies are yours to flesh out.
`;
}
