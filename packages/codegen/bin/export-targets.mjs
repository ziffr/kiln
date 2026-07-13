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
 * This is a THIN wrapper (server-side, uses node:fs). The actual full-stack file-map assembly is the PURE,
 * isomorphic `assembleFullStack` (@vbd/codegen/src/fullstack.ts) — so the browser can produce the same map.
 * The bin's job: parse args → load + splice the model → call assembleFullStack → write the files to disk →
 * the (bin-only) `--since` migration → `git init`. Console logging reads the returned projection `report`.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assembleFullStack, DEFAULT_BINDING, migrate } from "../src/index.ts";
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
// The complete model.json is the source of truth: prefer authored execution-layer decisions from the
// model itself (services/triggers/comms/integrations/binding/theme/i18n), falling back to flags/defaults.
let binding = bindingPath ? JSON.parse(readFileSync(resolve(bindingPath), "utf8")) : (m.binding ?? DEFAULT_BINDING);
// --sqlite: bind the store to the embedded SQLite engine (single-container, file-based) instead of Postgres.
const useSqlite = process.argv.includes("--sqlite") || binding.defaults?.store === "sqlite";
const dialect = useSqlite ? "sqlite" : "postgres";
const storeDir = useSqlite ? "sqlite" : "postgres";
if (useSqlite) binding = { ...binding, defaults: { ...binding.defaults, store: "sqlite" } };

// --enrich [depth]: thicken the model (mock, offline) before projecting, so artifacts get the realistic
// attribute set + child entities. The real (LLM) enrichment runs in-app via /api/enrich with review.
const enrichIdx = process.argv.indexOf("--enrich");
if (enrichIdx >= 0) {
  const depth = ["conservative", "standard", "exhaustive"].includes(process.argv[enrichIdx + 1]) ? process.argv[enrichIdx + 1] : "standard";
  const before = m.domain.aggregates.length;
  m.domain = applyEnrichment(m.domain, mockEnrichDomain(m.capabilities, m.domain, depth));
  console.log(`enriched (${depth}): entities ${before} -> ${m.domain.aggregates.length}`);
}

// --handlers <file>: splice LLM-drafted command bodies (from /api/app-logic → { handlers: {id: code} })
// into the spine. Without it, the spine ships safe pass-through handlers (still boots + persists + emits).
const handlersIdx = process.argv.indexOf("--handlers");
let handlers = {};
if (handlersIdx >= 0 && process.argv[handlersIdx + 1]) {
  const raw = JSON.parse(readFileSync(resolve(process.argv[handlersIdx + 1]), "utf8"));
  handlers = raw.handlers ?? raw;
  console.log(`spine: spliced ${Object.keys(handlers).length} LLM-drafted command bodies`);
}

// --comms/--integrations <file>: splice LLM-refined docs (from /api/communications, /api/integrations).
// Without them, the deterministic heuristic defaults are used (still sensible, human-refinable).
const readArg = (flag) => {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) {
    const d = JSON.parse(readFileSync(resolve(process.argv[i + 1]), "utf8"));
    console.log(`${flag}: spliced ${(d.actions ?? []).length} refined actions`);
    return { actions: d.actions ?? [] };
  }
  return undefined;
};
const comms = readArg("--comms") ?? m.comms;
const integrations = readArg("--integrations") ?? m.integrations;

// --triggers <file>: splice an LLM-refined/authored Triggers doc ({ triggers: [...] }, from /api/triggers).
// Without it, deterministic defaults (grounded in external/time events + one agent-wake webhook) are used.
let triggers;
{
  const i = process.argv.indexOf("--triggers");
  if (i >= 0 && process.argv[i + 1]) {
    const d = JSON.parse(readFileSync(resolve(process.argv[i + 1]), "utf8"));
    triggers = { version: d.version ?? "0.1", triggers: d.triggers ?? [] };
    console.log(`--triggers: spliced ${triggers.triggers.length} triggers`);
  }
}
triggers = triggers ?? m.triggers; // else the authored triggers from the model (or codegen's default)

// --lang <code>: the source language of the model (the language the business was described in). --translations
// <file>: an LLM-produced { "<locale>": { "<key>": "<text>" } } (from /api/translate) to bake into the app.
const sourceLang = (() => { const i = process.argv.indexOf("--lang"); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "en"; })();
let translations;
{
  const i = process.argv.indexOf("--translations");
  if (i >= 0 && process.argv[i + 1]) {
    translations = JSON.parse(readFileSync(resolve(process.argv[i + 1]), "utf8"));
    console.log(`--translations: ${Object.keys(translations).join(", ")} (${sourceLang} base)`);
  }
}
const i18nOpt = m.i18n ? { sourceLang: m.i18n.sourceLang ?? sourceLang, translations: m.i18n.translations ?? translations } : { sourceLang, translations };

const domainName = m.capabilities?.domain || "Business";
const mod = (m.capabilities?.domain || "vbd").toLowerCase().replace(/[^a-z0-9]+/g, "_");

// The PURE assembly: model + resolved options → the COMPLETE file map + the projection report. The SPEC-009
// orchestration mode-defaulting, projectTargets call, artifact flattening, and every doc/plumbing template
// live inside assembleFullStack now (so the web app can call it too). `--since` (below) is the only bin-only file.
const { files, report } = assembleFullStack({
  version: m.version,
  capabilities: m.capabilities,
  contexts: m.contexts,
  domain: m.domain,
  roles: m.roles,
  workflows: m.workflows,
  agents: m.agents,
  theme: m.theme,
  binding,
  dialect,
  handlers,
  comms,
  integrations,
  triggers,
  services: m.services,
  i18n: i18nOpt,
  modelPath,
  gitInitialized: !process.argv.includes("--no-git"), // the bin git-inits below unless --no-git
});

// fresh output dir
rmSync(outDir, { recursive: true, force: true });
const write = (rel, content) => {
  const full = join(outDir, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  return rel;
};

const written = [];
for (const [rel, content] of Object.entries(files)) written.push(write(rel, content));

// --since <old-model.json>: incremental migration (diff the DEPLOYED model's domain vs this one). Additive
// changes are live SQL; breaking ones (drops/type-changes) are commented out for human approval. This is
// how you grow a LIVE database without dropping it — apply the migration instead of re-running schema.sql.
// Bin-only: it depends on a CLI-provided old-model path, so it isn't part of the pure file map.
{
  const i = process.argv.indexOf("--since");
  if (i >= 0 && process.argv[i + 1]) {
    const oldModel = JSON.parse(readFileSync(resolve(process.argv[i + 1]), "utf8"));
    const mig = migrate(oldModel.domain ?? { aggregates: [] }, m.domain, dialect);
    const name = `${storeDir}/migrations/${(m.version ?? "next").replace(/[^a-z0-9.]+/gi, "_")}.sql`;
    written.push(write(name, mig.sql));
    console.log(`migration: ${mig.up.length} additive statement(s), ${mig.breaking.length} BREAKING (commented for review) → ${name}`);
    if (mig.breaking.length) for (const b of mig.breaking) console.log(`  ⚠ ${b.kind}: ${b.detail}`);
  }
}

// Initialize a git repo with one clean initial commit, so the generated system has history from day one
// — a senior dev or coding agent continues from a real baseline. Skip with --no-git, or when git is absent.
// `.gitignore` (in the file map) keeps node_modules/.env/dist out of the commit. Author falls back to the
// generator only when the environment has no git identity configured (respects the user's own if set).
if (!process.argv.includes("--no-git")) {
  const git = (...a) => spawnSync("git", a, { cwd: outDir, encoding: "utf8" });
  if (git("--version").status !== 0) {
    console.log("\ngit: not available — skipping repo init (run `git init` in the output dir yourself).");
  } else {
    const version = m.version ?? "0.1.0";
    const msg = `Initial commit — generated by VerticalBusinessDesigner from model.json (${domainName} v${version})`;
    const init = git("init", "-q");
    git("add", "-A");
    const hasIdentity = git("config", "user.email").stdout.trim();
    const idArgs = hasIdentity ? [] : ["-c", "user.name=VerticalBusinessDesigner", "-c", "user.email=codegen@vbd.local"];
    const commit = git(...idArgs, "commit", "-q", "-m", msg);
    if (init.status === 0 && commit.status === 0) {
      git("branch", "-M", "main"); // normalize the default branch name across git versions
      console.log(`\ngit: initialized repo + initial commit on 'main' (${written.length} files tracked).`);
    } else {
      console.log(`\ngit: init/commit failed (${(commit.stderr || init.stderr || "").trim().split("\n")[0] || "unknown"}) — run \`git init\` yourself.`);
    }
  }
}

console.log(`\nExported ${written.length} files → ${outDir}\n`);
for (const f of written) console.log("  " + f);
const errs = report.validation.filter((v) => v.level === "error");
console.log(`\nvalidation: ${errs.length} errors, ${report.validation.length - errs.length} warnings`);
if (errs.length) for (const e of errs.slice(0, 5)) console.log(`  [error] ${e.code} ${e.message}`);
console.log("\nRun them:");
if (report.artifacts.postgres.trim()) console.log("  psql <db> -f out/targets/postgres/schema.sql");
if (report.artifacts.n8n.length) console.log("  n8n: Workflows → Import from File → out/targets/n8n/*.json");
if (Object.keys(report.artifacts.odoo).length) console.log(`  odoo: copy out/targets/odoo/${mod} into addons/, then Apps → Update Apps List → Install`);
