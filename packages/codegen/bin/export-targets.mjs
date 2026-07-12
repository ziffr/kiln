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

const agentsMd = `# Generated system — orientation for a coding agent

This directory was produced by **@vbd/codegen** from a business model (see \`model.json\`). It is a
**structurally-complete scaffold**, not a finished app: schema, APIs, UI, automations, and security are
generated; **business logic and genuine domain rules are stubbed for you to fill** (see \`TODO.md\`).

## Golden rule
\`model.json\` is the **source of truth**. To change *structure* (entities, fields, commands, relations),
change the model and regenerate — do NOT hand-edit generated structure, it will be overwritten. To add
*logic*, edit the code at the marked \`TODO\` points. Generated files carry a "Generated by @vbd/codegen"
header; treat those as derived.

## What's here (the binding/topology)
${coverageLines}

UI: ${rep.ui.note}.
Cross-engine seams (${rep.seams.length}): ${seamKinds.join(", ") || "none"} — n8n/Odoo call the spine's
command API; the spine touches the stores. Nothing reaches the database directly across an engine.

## Run each piece
- **Postgres:** \`psql <db> -f postgres/schema.sql\`
- **n8n:** import \`n8n/*.json\` (Workflows → Import from File)
- **Odoo:** copy \`odoo/${mod}\` into your addons path, then Apps → Update List → Install
- **UI:** \`cd ui && npm i && npx shadcn@latest add table button card input label switch select && npm run dev\`

## Where the human/agent steps in
1. **Command bodies** — every command has a stub; implement the state change + emit its events.
2. **Business rules not in the model** — pricing, tax, approvals, validation.
3. **Data wiring** — the UI list/detail/child-grid views have \`TODO\` fetch points; wire them to the APIs.
4. **Integrations** — payment, email, etc., beyond the generated seams.

Start with \`TODO.md\`.
`;
written.push(write("AGENTS.md", agentsMd));

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
