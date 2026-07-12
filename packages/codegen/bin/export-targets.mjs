#!/usr/bin/env node
/**
 * export-targets — write the RES-002 execution-engine artifacts to disk so you can actually run them
 * against real backends (psql < schema.sql, import the Odoo module, import the n8n workflows).
 *
 * Usage:
 *   node packages/codegen/bin/export-targets.mjs [--model <path>] [--binding <path>] [--out <dir>]
 *
 * Defaults: the baked solar model, DEFAULT_BINDING (store→Postgres, react/sequence→n8n, rest→spine),
 * output to ./out/targets. Pass a --binding JSON ({defaults, byArea}) to place areas on other engines.
 *
 * This is a server-side tool (uses node:fs) — NOT part of the pure @vbd/codegen package.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { projectTargets, DEFAULT_BINDING } from "../src/index.ts";
import { mockEnrichDomain, applyEnrichment } from "@vbd/skills";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const modelPath = resolve(arg("model", join(repo, "apps/web/src/data/solar-model.json")));
const outDir = resolve(arg("out", join(repo, "out/targets")));
const bindingPath = arg("binding", null);

const m = JSON.parse(readFileSync(modelPath, "utf8"));
const binding = bindingPath ? JSON.parse(readFileSync(resolve(bindingPath), "utf8")) : DEFAULT_BINDING;

// --enrich [depth]: thicken the model (mock, offline) before projecting, so artifacts get the realistic
// attribute set + child entities. The real (LLM) enrichment runs in-app via /api/enrich with review.
const enrichIdx = process.argv.indexOf("--enrich");
if (enrichIdx >= 0) {
  const depth = ["conservative", "standard", "exhaustive"].includes(process.argv[enrichIdx + 1]) ? process.argv[enrichIdx + 1] : "standard";
  const before = m.domain.aggregates.length;
  m.domain = applyEnrichment(m.domain, mockEnrichDomain(m.capabilities, m.domain, depth));
  console.log(`enriched (${depth}): entities ${before} -> ${m.domain.aggregates.length}`);
}

const rep = projectTargets(binding, m.capabilities, m.domain, m.contexts, m.roles, m.workflows);

// fresh output dir
rmSync(outDir, { recursive: true, force: true });
const write = (rel, content) => {
  const full = join(outDir, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  return rel;
};

const written = [];

// Postgres → one SQL file
if (rep.artifacts.postgres.trim()) written.push(write("postgres/schema.sql", rep.artifacts.postgres + "\n"));

// n8n → one JSON per workflow (import each in n8n: Workflows → Import from File)
for (const wf of rep.artifacts.n8n) {
  const safe = wf.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  written.push(write(`n8n/${safe}.json`, JSON.stringify(wf, null, 2)));
}

// Odoo → a module directory (drop into your Odoo addons path, then Apps → Update List → Install)
const mod = (m.capabilities?.domain || "vbd").toLowerCase().replace(/[^a-z0-9]+/g, "_");
for (const [rel, content] of Object.entries(rep.artifacts.odoo)) written.push(write(`odoo/${mod}/${rel}`, content));

// UI → a themeable shadcn/ui scaffold (npm i, add shadcn components, npm run dev)
for (const [rel, content] of Object.entries(rep.artifacts.ui)) written.push(write(`ui/${rel}`, content));

// a manifest of the run: binding, coverage, seams, validation, gaps
const runInfo = {
  model: modelPath,
  binding,
  coverage: rep.coverage,
  seams: rep.seams,
  validation: rep.validation,
  gaps: rep.gaps,
};
written.push(write("_run.json", JSON.stringify(runInfo, null, 2)));

// --- Make the output LLM-ready: the source model + an orientation doc + an actionable TODO manifest,
// so a coding agent can take out/targets/ and drive it to production without this session's context. ---
written.push(write("model.json", JSON.stringify({ capabilities: m.capabilities, contexts: m.contexts, domain: m.domain, roles: m.roles, workflows: m.workflows, agents: m.agents }, null, 2)));

const eng = (id) => ({ postgres: "PostgreSQL", n8n: "n8n", node: "the generated spine", odoo: "Odoo", shadcn: "shadcn/ui" }[id] || id);
const coverageLines = rep.coverage.map((c) => `- **${eng(c.engineId)}** — ${c.elements} elements ${JSON.stringify(c.byKind)}`).join("\n");
const cmds = m.domain.commands || [];
const seamKinds = [...new Set(rep.seams.map((s) => `${s.from}→${s.to} (${s.via})`))];

const domainName = m.capabilities?.domain || "Business";
const claudeMd = `# CLAUDE.md — operating manual for the generated "${domainName}" system

You are a coding agent extending a system that **@vbd/codegen** generated from a business model. This
file is the rules of the road. Read it before editing anything.

## What this is
A **structurally-complete, multi-backend scaffold** — schema, APIs, UI, automations, and security are
generated; **business logic and genuine domain rules are stubbed for you to implement** (see \`TODO.md\`).
It is NOT a finished app. Your job is to fill the logic and the genuinely-unmodelled rules.

## Golden rule (do not violate)
\`model.json\` is the **source of truth**. Two kinds of change:
- **Structure** (entities, fields, commands, events, relations, screens): change it in the *model*, not
  the code. Regenerating overwrites generated structure. If you hand-edit a generated file's structure,
  the next regeneration silently drops your change.
- **Logic** (what a command actually does, data fetching, integrations): add it in the code, only at the
  marked \`TODO\` points.

Generated files carry a \`Generated by @vbd/codegen\` header — treat those as **derived**, not authored.

## Repo layout
- \`model.json\` — the source of truth (the layered business model).
- \`postgres/schema.sql\` — tables, FKs, RLS policies (data store).
- \`odoo/${mod}/\` — an installable Odoo module (models, security, automations).
- \`n8n/*.json\` — importable orchestration workflows (reactions + processes).
- \`ui/\` — a runnable Vite + React + shadcn app (\`cd ui && npm i && npm run dev\`).
- \`TODO.md\` — the actionable checklist. **Start here.**
- \`_run.json\` — the binding, coverage, seams, validation, gaps (machine-readable).

## The topology (which engine does what)
${coverageLines}

UI: ${rep.ui.note}.
Cross-engine seams (${rep.seams.length}): ${seamKinds.join(", ") || "none"}. **n8n and Odoo call the
spine's command API; the spine is the only thing that touches the stores.** Never let a workflow or the
UI hit the database directly across an engine boundary — go through a command endpoint.

## Conventions
- **Naming:** entity ids are \`snake_case\`; commands are \`verb_noun\` (e.g. \`issue_invoice\`); events are
  past-tense facts (\`invoice_issued\`). Match these when you add code.
- **Every command is the universal action surface** — the UI calls it on click, workflows call it in
  order, agents call it by judgment. Put the state change + event emission in the command body; callers
  just invoke it.
- **Secrets** live in \`.env\` (see \`docker-compose.yml\`), never in code. Don't commit \`.env\`.
- **Child grids / master-detail:** a detail screen lists everything that references it; the child-row
  fetch is a \`TODO\`.

## Run it
- \`make up\` — bring up Postgres + n8n + Odoo (docker compose).
- \`make db\` — apply \`postgres/schema.sql\`.
- \`make n8n-import\` / \`make odoo-install\` — load the workflows / install the module.
- \`make ui\` — run the front-end.
- \`make down\` — tear it all down.

## Where to start
Open \`TODO.md\` and burn the list down: command bodies first (they're the logic everything else calls),
then UI data-wiring, then the model/engine gaps.
`;
written.push(write("CLAUDE.md", claudeMd));
written.push(write("AGENTS.md", `# AGENTS.md\n\nThis repo's agent operating manual is **[CLAUDE.md](./CLAUDE.md)** — read it first, then **[TODO.md](./TODO.md)**.\n`));

// README (human-facing) + repo plumbing so this is a repo in itself (git init-able, one-command run).
written.push(write("README.md", `# ${domainName} — generated system

Generated by [VerticalBusinessDesigner](https://github.com/ziffr/vertical-business-designer) from a
business model. A multi-backend scaffold: PostgreSQL schema, an Odoo module, n8n workflows, and a
themeable shadcn/ui front-end — plus a \`TODO.md\` for the business logic a human/agent still fills.

## Quickstart
\`\`\`bash
make up            # Postgres + n8n + Odoo (docker)
make db            # apply the schema
make ui            # run the front-end
\`\`\`

Coding agents: see [CLAUDE.md](./CLAUDE.md). To change structure, edit \`model.json\` and regenerate.
`));
written.push(write(".gitignore", "node_modules/\ndist/\n.env\n*.log\n"));
written.push(write(".env.example", "# Copy to .env. Secrets never go in code.\nPGHOST=localhost\nPGPORT=5432\nPGUSER=app\nPGPASSWORD=app\nPGDATABASE=app\n"));
written.push(write("docker-compose.yml", `# Generated by @vbd/codegen — the backends this system binds to.
services:
  postgres:
    image: postgres:16-alpine
    environment: { POSTGRES_USER: app, POSTGRES_PASSWORD: app, POSTGRES_DB: app }
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
  n8n:
    image: n8nio/n8n
    environment: { N8N_DIAGNOSTICS_ENABLED: "false" }
    ports: ["5678:5678"]
    volumes: ["n8ndata:/home/node/.n8n"]
  odoo-db:
    image: postgres:16-alpine
    environment: { POSTGRES_USER: odoo, POSTGRES_PASSWORD: odoo, POSTGRES_DB: postgres }
  odoo:
    image: odoo:17
    depends_on: [odoo-db]
    environment: { HOST: odoo-db, USER: odoo, PASSWORD: odoo }
    ports: ["8069:8069"]
    volumes: ["./odoo:/mnt/extra-addons:ro"]
volumes: { pgdata: {}, n8ndata: {}, odoodata: {} }
`));
written.push(write("Makefile", `# Generated by @vbd/codegen.
.PHONY: up down db n8n-import odoo-install ui
up: ; docker compose up -d
down: ; docker compose down
db: ; @for i in 1 2 3 4 5 6 7 8; do docker compose exec -T postgres pg_isready -U app >/dev/null 2>&1 && break || sleep 1; done; docker compose exec -T postgres psql -U app -d app < postgres/schema.sql
n8n-import: ; @for f in n8n/*.json; do docker compose cp "$$f" n8n:/tmp/wf.json && docker compose exec -T n8n n8n import:workflow --input=/tmp/wf.json; done
odoo-install: ; docker compose exec -T odoo odoo -d app -i ${mod} --addons-path=/mnt/extra-addons,/usr/lib/python3/dist-packages/odoo/addons --stop-after-init
ui: ; cd ui && npm install && npm run dev
`));

const todo = [];
todo.push(`# TODO — from generated scaffold to working system\n`);
todo.push(`Generated from \`model.json\`. Check items off as you implement them.\n`);
todo.push(`## 1. Command business logic (${cmds.length}) — fill each stub's body (state change + emit events)`);
for (const c of cmds) {
  const emits = (c.emits || []).map((e) => (m.domain.events || []).find((x) => x.id === e)?.name || e);
  todo.push(`- [ ] **${c.name}** (entity \`${c.aggregate}\`)${emits.length ? ` → emits ${emits.join(", ")}` : ""}`);
}
todo.push(`\n## 2. Model/engine gaps (from the projection)`);
for (const g of rep.gaps) todo.push(`- [ ] ${g}`);
if (rep.validation.filter((v) => v.level === "error").length) {
  todo.push(`\n## 3. Binding errors (must fix before this configuration deploys)`);
  for (const v of rep.validation.filter((x) => x.level === "error")) todo.push(`- [ ] ${v.code}: ${v.message}`);
}
todo.push(`\n## ${rep.validation.some((v) => v.level === "error") ? 4 : 3}. UI data wiring`);
todo.push(`- [ ] Wire list views to the APIs (each \`*List.tsx\` has \`rows: [] // TODO: fetch\`).`);
todo.push(`- [ ] Wire master-detail child grids (each \`*Detail.tsx\` grid has \`// TODO: rows where child.parent == this record\`).`);
todo.push(`- [ ] Populate reference dropdowns (a reference field's options = the target entity's records).`);
written.push(write("TODO.md", todo.join("\n") + "\n"));

console.log(`\nExported ${written.length} files → ${outDir}\n`);
for (const f of written) console.log("  " + f);
const errs = rep.validation.filter((v) => v.level === "error");
console.log(`\nvalidation: ${errs.length} errors, ${rep.validation.length - errs.length} warnings`);
if (errs.length) for (const e of errs.slice(0, 5)) console.log(`  [error] ${e.code} ${e.message}`);
console.log("\nRun them:");
if (rep.artifacts.postgres.trim()) console.log("  psql <db> -f out/targets/postgres/schema.sql");
if (rep.artifacts.n8n.length) console.log("  n8n: Workflows → Import from File → out/targets/n8n/*.json");
if (Object.keys(rep.artifacts.odoo).length) console.log(`  odoo: copy out/targets/odoo/${mod} into addons/, then Apps → Update Apps List → Install`);
