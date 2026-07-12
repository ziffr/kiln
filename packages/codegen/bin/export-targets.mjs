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

console.log(`\nExported ${written.length} files → ${outDir}\n`);
for (const f of written) console.log("  " + f);
const errs = rep.validation.filter((v) => v.level === "error");
console.log(`\nvalidation: ${errs.length} errors, ${rep.validation.length - errs.length} warnings`);
if (errs.length) for (const e of errs.slice(0, 5)) console.log(`  [error] ${e.code} ${e.message}`);
console.log("\nRun them:");
if (rep.artifacts.postgres.trim()) console.log("  psql <db> -f out/targets/postgres/schema.sql");
if (rep.artifacts.n8n.length) console.log("  n8n: Workflows → Import from File → out/targets/n8n/*.json");
if (Object.keys(rep.artifacts.odoo).length) console.log(`  odoo: copy out/targets/odoo/${mod} into addons/, then Apps → Update Apps List → Install`);
