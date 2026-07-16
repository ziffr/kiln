/**
 * fullstack — the PURE, isomorphic full-stack file-map assembly (extracted from bin/export-targets.mjs).
 *
 * This is the heart of the exporter: given a fully-prepared model + the resolved execution-layer options,
 * it returns the COMPLETE map of files the generated system consists of — schema, spine, UI, agents, n8n
 * workflows, comms/integration/trigger/service artifacts, plus ALL the doc/plumbing templates (CLAUDE.md,
 * README.md, docker-compose.yml, Makefile, DEPLOY.md, TODO.md, CI, model.json, openapi.json, …).
 *
 * It is deliberately PURE + isomorphic (golden invariant #4): NO `node:*`, NO `process`, NO fs — just string
 * assembly over the model/report. That is what lets the BROWSER call it (the web app imports @kiln/codegen)
 * to produce the same file map the CLI writes to disk, byte-for-byte. The only thing NOT here is the
 * `--since` migration file, which depends on a CLI-provided old-model path and so stays in the bin.
 *
 * The bin (bin/export-targets.mjs) is now a thin wrapper: parse args, load + splice the model, build the
 * options object, call assembleFullStack, write `files` to disk, do the (bin-only) `--since` migration, and
 * `git init`. The console logging there reads the returned `report`.
 */
import type { CapabilityDoc, DomainDoc, ContextsDoc, RolesDoc, WorkflowsDoc, AgentsDoc, ProcessMode } from "@kiln/compiler";
import { projectTargets, engineDescriptor, type Binding, type TargetsReport } from "./targets.ts";
import { commandBriefs, briefsIndex } from "./briefs.ts";
import { generateOpenApi } from "./index.ts";
import { hoppscotchCollection } from "./hoppscotch.ts";
import type { Theme } from "./ui.ts";
import type { ViewSpecInput } from "./app.ts";
import type { CommunicationsDoc } from "./comms.ts";
import type { IntegrationsDoc } from "./integrations.ts";
import type { TriggersDoc } from "./triggers.ts";
import type { ExternalServicesDoc } from "./services.ts";

/**
 * Everything the templates + projection need. The bin (or the web app) prepares this: the model pieces
 * (already enriched/spliced as chosen) plus the resolved execution-layer options.
 */
export interface FullStackInput {
  /** model pieces (the single source of truth) */
  version?: string;
  capabilities: CapabilityDoc;
  contexts?: ContextsDoc;
  domain: DomainDoc;
  roles?: RolesDoc;
  workflows?: WorkflowsDoc;
  agents?: AgentsDoc;
  theme?: Theme;
  /** execution-layer options (resolved by the caller: authored-from-model, spliced from a flag, or a default) */
  binding: Binding;
  dialect: "postgres" | "sqlite";
  handlers?: Record<string, string>;
  /** per-entity screen specs (columns/formats/layout/metrics/card) — the polished UI vocabulary. */
  views?: Record<string, ViewSpecInput>;
  comms?: CommunicationsDoc;
  integrations?: IntegrationsDoc;
  triggers?: TriggersDoc;
  services?: ExternalServicesDoc;
  /** i18n: source language + already-merged LLM translations (the assembled i18nOpt the caller resolved). */
  i18n?: { sourceLang?: string; translations?: Record<string, Record<string, string>> };
  /** the model's absolute path — used ONLY as the `_run.json` manifest's `model` field (kept identical to the bin). */
  modelPath: string;
  /** whether the caller will `git init` the output (CLI default: true; a browser zip can't, so it passes false).
   * Only affects the README's version-control note so it never claims a git repo that doesn't exist. */
  gitInitialized?: boolean;
}

/**
 * Assemble the complete generated-system file map. Pure: same input → same bytes, in Node OR the browser.
 * Returns both the `files` map (relative path → content, ready to write to disk or a zip) and the projection
 * `report` (the caller uses it for logging: coverage, validation, gaps, artifact counts).
 */
export function assembleFullStack(input: FullStackInput): { files: Record<string, string>; report: TargetsReport } {
  // Rehydrate a local model view so the ported templates read exactly as they did in the bin (m.capabilities, …).
  const m: {
    version?: string;
    capabilities: CapabilityDoc;
    contexts?: ContextsDoc;
    domain: DomainDoc;
    roles?: RolesDoc;
    workflows?: WorkflowsDoc;
    agents?: AgentsDoc;
    theme?: Theme;
  } = {
    version: input.version,
    capabilities: input.capabilities,
    contexts: input.contexts,
    domain: input.domain,
    roles: input.roles,
    workflows: input.workflows,
    agents: input.agents,
    theme: input.theme,
  };
  const binding = input.binding;
  const useSqlite = input.dialect === "sqlite";
  const handlers = input.handlers ?? {};
  const comms = input.comms;
  const integrations = input.integrations;
  const triggers = input.triggers;
  const modelPath = input.modelPath;
  const gitInitialized = input.gitInitialized ?? true;

  // SPEC-009 orchestration: route each process → a fixed WORKFLOW (n8n pipeline) or an AGENT (judgement
  // over the same commands). Deterministic default here; the authoritative router + an LLM pass live in
  // @kiln/skills (mockOrchestration / generateOrchestration). An authored `mode` on a workflow always wins.
  // This DRIVES codegen below: agent-mode processes don't emit an n8n workflow — they fold into the
  // covering agent's behaviour playbook (agents/behaviours/<id>.md).
  const JUDGEMENT = /qualif|triage|assess|review|evaluat|negotiat|resolv|support|monitor|recommend|prioriti|handl|decid|research|draft|dispatch|approv|escalat|investigat|diagnos|advis/i;
  if (m.workflows?.workflows?.length) {
    m.workflows = {
      ...m.workflows,
      workflows: m.workflows.workflows.map((w) => (w.mode ? w : { ...w, mode: (JUDGEMENT.test(w.name || w.id) || (w.steps ?? []).length <= 1 ? "agent" : "workflow") as ProcessMode })),
    };
  }

  // i18n: the caller resolved the source language + any LLM translations (from the model's i18n or CLI flags).
  const i18nOpt = input.i18n ?? { sourceLang: "en" };
  const rep = projectTargets(binding, m.capabilities, m.domain, m.contexts, m.roles, m.workflows, m.theme, handlers, comms, integrations, m.agents, triggers, input.services, i18nOpt, input.views);

  // The file map (relative path → content). `write` mirrors the bin's helper but targets the object, so the
  // template blocks below are copied VERBATIM from the bin (write/written.push preserved) → byte-identical.
  const files: Record<string, string> = {};
  const written: string[] = [];
  const write = (rel: string, content: string): string => {
    files[rel] = content;
    return rel;
  };

const storeDir = useSqlite ? "sqlite" : "postgres";
if (rep.artifacts.postgres.trim()) written.push(write("postgres/schema.sql", rep.artifacts.postgres + "\n"));
if (rep.artifacts.sqlite.trim()) written.push(write("sqlite/schema.sql", rep.artifacts.sqlite + "\n"));

for (const wf of rep.artifacts.n8n) {
  const safe = wf.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  written.push(write(`n8n/${safe}.json`, JSON.stringify(wf, null, 2)));
}

// Odoo → a module directory (drop into your Odoo addons path, then Apps → Update List → Install)
const mod = (m.capabilities?.domain || "app").toLowerCase().replace(/[^a-z0-9]+/g, "_");
for (const [rel, content] of Object.entries(rep.artifacts.odoo)) written.push(write(`odoo/${mod}/${rel}`, content));

// UI → a themeable shadcn/ui scaffold (npm i, add shadcn components, npm run dev)
for (const [rel, content] of Object.entries(rep.artifacts.ui)) written.push(write(`ui/${rel}`, content));

// Spine → the runnable command API (Express + pg); LLM-drafted handlers, pass-through defaults.
for (const [rel, content] of Object.entries(rep.artifacts.spine)) written.push(write(`spine/${rel}`, content));

// SPEC-010 generic engine channel: a THIRD-PARTY engine (registered via registerEngine, not one of the
// six built-ins above) rides `artifacts.engines`. Write its files verbatim (it owns its path prefix) and
// its workflows as n8n/<slug>.json (the same slug convention as every other n8n writer here). The six
// built-ins already emitted via their NAMED slots, so we SKIP them to avoid double-emitting — that is
// what keeps today's output byte-identical while a hypothetical seventh engine flows through here.
const BUILTIN_ENGINE_IDS = new Set(["postgres", "sqlite", "n8n", "odoo", "shadcn", "node", "spine"]);
for (const [id, out] of Object.entries(rep.artifacts.engines)) {
  if (BUILTIN_ENGINE_IDS.has(id)) continue;
  for (const [rel, content] of Object.entries(out.files)) written.push(write(rel, content));
  for (const wf of out.workflows ?? []) {
    const safe = wf.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
    written.push(write(`n8n/${safe}.json`, JSON.stringify(wf, null, 2)));
  }
}

// Agents → goal + concrete tools (commands + notify + comm actions) an agent runtime loads.
for (const [rel, content] of Object.entries(rep.artifacts.agents)) written.push(write(rel, content));

// Communication layer → editable templates + n8n notify workflows (email/Slack), wired to the event
// webhooks the spine POSTs to. Render (pdf) actions emit a template for a render service to consume.
for (const [rel, content] of Object.entries(rep.artifacts.comms.templates)) written.push(write(rel, content));
for (const wf of rep.artifacts.comms.n8n) {
  const safe = wf.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  written.push(write(`n8n/${safe}.json`, JSON.stringify(wf, null, 2)));
}

// Integration layer → field-mapping files + n8n connectors (inbound: → spine command; outbound: event → API).
for (const [rel, content] of Object.entries(rep.artifacts.integrations.mappings)) written.push(write(rel, content));
for (const wf of rep.artifacts.integrations.n8n) {
  const safe = wf.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  written.push(write(`n8n/${safe}.json`, JSON.stringify(wf, null, 2)));
}

// Triggers layer → external signals in: webhook | schedule → command | workflow | agent | notify.
// One n8n workflow per trigger; a webhook→agent trigger POSTs the agents runtime's /run (HTTP mode).
for (const wf of rep.artifacts.triggers.n8n) {
  const safe = wf.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  written.push(write(`n8n/${safe}.json`, JSON.stringify(wf, null, 2)));
}
if (rep.artifacts.triggers.doc.triggers.length) {
  const rows = rep.artifacts.triggers.doc.triggers
    .map((t) => `| ${t.name} | ${t.source}${t.source === "schedule" ? ` (\`${t.cron}\`)` : ` (\`${t.path}\`)`} | ${t.target.kind} → \`${t.target.ref}\` | ${t.rationale ?? ""} |`)
    .join("\n");
  written.push(write("TRIGGERS.md", `# Triggers — external signals into the system

The system reacts to inbound signals, not only user clicks. Each trigger routes a **source** (an inbound
**webhook** or a **schedule**) to a **target** — run a command, start a workflow, wake an agent, or notify
a human. Each is an importable n8n workflow under \`n8n/trigger_*.json\`.

| Trigger | Source | Target | Why |
|---|---|---|---|
${rows}

**Wiring.** Webhook triggers expose \`POST /webhook/<path>\` on n8n. Agent targets POST \`/run { agent, task }\`
to the agents runtime (start it with \`pnpm serve\` — see \`agents/README.md\`); set n8n's \`AGENT_URL\` to reach
it. Command targets call the spine; workflow targets run the matching \`Process:\` workflow. These defaults
are grounded in the model's external/time events — **edit them** (or re-run with \`--triggers\`) to change
what fires and what it does.
`));
}

// External services (delegation): call an EXISTING external workflow/agent (a bought qualifier/reviewer).
// Descriptors + n8n connectors — sync (call & record) and async (fire + a callback webhook = a trigger).
for (const [rel, content] of Object.entries(rep.artifacts.services.descriptors)) written.push(write(rel, content));
for (const wf of rep.artifacts.services.n8n) {
  const safe = wf.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  written.push(write(`n8n/${safe}.json`, JSON.stringify(wf, null, 2)));
}
if (rep.artifacts.services.doc.services.length) {
  const rows = rep.artifacts.services.doc.services
    .map((s) => {
      const lands = s.resultTarget ? `${s.resultTarget.kind} → \`${s.resultTarget.ref}\`` : "logged";
      return `| ${s.name} | ${s.kind} | **${s.invocation}** | ${s.entity ?? ""} | ${lands} | ${s.rationale ?? ""} |`;
    })
    .join("\n");
  written.push(write("EXTERNAL-SERVICES.md", `# External services — delegating to what already exists

Not every workflow or agent is one we generate. Some already exist — a commercial lead qualifier, a legal
contract reviewer, a workflow in another system. You **delegate** to them: send data, get a result.

- **sync** — call and wait; the result returns inline. Wired as an agent tool (\`kind: "external"\`) and as
  a \`service_*\` connector; the response can be recorded via a command.
- **async** — fire and don't block; the vendor works, then **calls back**. The callback is a webhook (a
  trigger) that lands the result: record it via a command, or wake an agent. See \`n8n/service_*_callback.json\`.

| Service | Kind | Call | Entity | Result lands | Why |
|---|---|---|---|---|---|
${rows}

Each service has a contract in \`services/<id>.json\` (endpoint + request/response mapping). **Endpoint +
auth are yours to fill in** — we generate the connector skeleton, the field mapping, and (for async) the
callback wiring, not the vendor's credentials. Agents that own the entity get the service as a delegable
tool; a whole process can also be routed to an external service (see \`ORCHESTRATION.md\`, mode \`external\`).
`));
}

// Orchestration decision table (SPEC-009): which processes are fixed workflows vs. agent-run.
if (m.workflows?.workflows?.length) {
  const cmdName = new Map((m.domain?.commands ?? []).map((c) => [c.id, c.name || c.id]));
  const rows = m.workflows.workflows
    .map((w) => {
      const steps = (w.steps ?? []).map((s) => cmdName.get(s) ?? s).join(" → ");
      const where = w.mode === "agent" ? "→ folded into the covering agent's `behaviours/*.md`" : "→ `n8n/process_*.json` (fixed pipeline)";
      return `| ${w.name || w.id} | **${w.mode}** | ${steps} | ${where} |`;
    })
    .join("\n");
  const agentN = m.workflows.workflows.filter((w) => w.mode === "agent").length;
  written.push(write("ORCHESTRATION.md", `# Orchestration — workflow vs. agent, per process

Each business process is routed to the way it should run: a fixed, deterministic **workflow** (an n8n
pipeline) when the steps are always the same, or an **agent** (judgement over the same commands) when the
path is open-ended. This decision is the model's — recorded as \`mode\` on each workflow — and it **drives
what gets generated**: ${m.workflows.workflows.length - agentN} workflow-mode process(es) became n8n
workflows; ${agentN} agent-mode process(es) folded into the owning agent's behaviour playbook (same
commands, run by judgement). It is NOT a runtime coin-flip.

| Process | Mode | Steps | Generated as |
|---|---|---|---|
${rows}

To change a routing, set \`mode: "workflow" | "agent"\` on the process in \`model.json\` (or re-run the
router) and regenerate. The deterministic default here keys off the process's nature (a fixed multi-step
sequence → workflow; judgement/single-action → agent); an LLM pass (@kiln/skills) refines it with rationale.
`));
}

// A credential-bearing hosting.url is INVALID input (validator PB5 errors on it) and must never be
// persisted to a committed file — redact userinfo before writing the binding to model.json / _run.json.
// A valid scheme+host url is untouched, so the round-trip of legitimate authored state is preserved.
const safeBinding: Binding = binding.hosting
  ? { ...binding, hosting: Object.fromEntries(Object.entries(binding.hosting).map(([k, v]) => [k, v.url ? { ...v, url: v.url.replace(/\/\/[^/@:]*:[^/@]*@/, "//") } : v])) }
  : binding;

// a manifest of the run: binding, coverage, seams, validation, gaps
const runInfo = {
  model: modelPath,
  binding: safeBinding,
  coverage: rep.coverage,
  seams: rep.seams,
  validation: rep.validation,
  gaps: rep.gaps,
};
written.push(write("_run.json", JSON.stringify(runInfo, null, 2)));

// --- Make the output LLM-ready: the source model + an orientation doc + an actionable TODO manifest,
// so a coding agent can take out/targets/ and drive it to production without this session's context. ---
// The COMPLETE model.json (every layer) — the single source of truth, round-trips with the app's export.
written.push(
  write(
    "model.json",
    JSON.stringify(
      {
        version: m.version ?? "1.0",
        capabilities: m.capabilities,
        contexts: m.contexts,
        domain: m.domain,
        roles: m.roles,
        workflows: m.workflows,
        agents: m.agents,
        services: rep.artifacts.services.doc,
        triggers: rep.artifacts.triggers.doc,
        comms: comms ?? undefined,
        integrations: integrations ?? undefined,
        binding: safeBinding,
        theme: m.theme ?? undefined,
        i18n: i18nOpt,
      },
      null,
      2,
    ),
  ),
);
const eng = (id: string): string => (({ postgres: "PostgreSQL", n8n: "n8n", node: "the generated spine", odoo: "Odoo", shadcn: "shadcn/ui" } as Record<string, string>)[id] || id);
const coverageLines = rep.coverage.map((c) => `- **${eng(c.engineId)}** — ${c.elements} elements ${JSON.stringify(c.byKind)}`).join("\n");
const cmds = m.domain.commands || [];
const seamKinds = [...new Set(rep.seams.map((s) => `${s.from}→${s.to} (${s.via})`))];

const domainName = m.capabilities?.domain || "Business";
const claudeMd = `# CLAUDE.md — operating manual for the generated "${domainName}" system

You are a coding agent extending a system that **@kiln/codegen** generated from a business model. This
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

Generated files carry a \`Generated by @kiln/codegen\` header — treat those as **derived**, not authored.

## Repo layout
- \`model.json\` — the source of truth (the layered business model).
- \`${storeDir}/schema.sql\` — tables, FKs${useSqlite ? " (SQLite, embedded — one file, no db service). The spine AUTO-CREATES these tables on boot, so you don't need to apply this by hand; it's kept for reference." : ", RLS policies (data store; apply to a FRESH db)"}.
- \`${storeDir}/migrations/*.sql\` — incremental migrations for a LIVE db (present when regenerated with
  \`--since <deployed model.json>\`). **Updating a deployed app: apply the migration, not schema.sql.**
  Additive changes (ADD COLUMN / CREATE TABLE) are live; breaking ones (drops, type changes) are commented
  out — review and decide on data before uncommenting. Commit the model.json you deployed, diff against it.
- \`odoo/${mod}/\` — an installable Odoo module (models, security, automations).
- \`n8n/*.json\` — importable orchestration workflows (reactions, processes, and \`trigger_*\` = external
  signals in). See \`TRIGGERS.md\` for the trigger table.
- \`agents/\` — a runnable, provider-flexible agent runtime (CLI \`pnpm start\`, or HTTP \`pnpm serve\` so a
  webhook can wake an agent). Behaviour = \`agents/behaviours/<id>.md\` (the editable "HOW").
- \`ui/\` — a runnable Vite + React + shadcn app (\`cd ui && npm i && npm run dev\`). Includes a built-in
  **help system** projected from the model: a \`/help\` page (glossary, how-tos, roles, automations) + an
  "ⓘ Help" drawer on each screen (\`src/help.ts\` — regenerated with the app, so it never goes stale).
- \`ORCHESTRATION.md\` — which processes run as fixed workflows vs. by an agent (drives what's generated).
- \`services/\` + \`EXTERNAL-SERVICES.md\` — external services we DELEGATE to (a bought qualifier/reviewer):
  sync (call & record) or async (fire + a callback webhook). \`n8n/service_*.json\` are the connectors.
- \`TODO.md\` — the actionable checklist. **Start here.**
- \`briefs/<command>.md\` + \`BRIEFS.md\` — a grounded **completion brief** per command: what the model
  LOCKS (inputs, triggers, emitted events, roles, delegation — derived) vs what you must DECIDE (the
  guard + the actual logic). Open the brief when you implement that command's handler.
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
- \`make spine\` — run the command API (Express + pg); the UI/n8n/Odoo call it.
- \`make ui\` — run the front-end (**pnpm** — the UI is a pnpm project).
- \`make down\` — tear it all down.

The command bodies in \`spine/src/handlers.js\` are \`(input, ctx) => record\` — LLM-drafted where
available, pass-through otherwise. **This is your primary logic surface** — implement/refine the rules
there (see TODO.md), and let the runtime handle persistence + event emission.

## Tooling, CI & deploy
- Package manager for the UI is **pnpm** (\`pnpm install\`, \`pnpm build\`); backends run via Docker.
- **Type-safe + linted:** the UI and spine are strict TypeScript — \`pnpm typecheck\` (tsc) and
  \`pnpm lint\` (eslint) must pass. Entity types live in \`src/types.ts\` (generated from the model).
- **CI** (\`.github/workflows/ci.yml\`) typechecks + lints + builds the UI, typechecks + lints the spine,
  applies the schema to a throwaway Postgres, and parses every n8n workflow — a broken regeneration or a
  type error fails fast. Keep it green.
- **Deployment** is per-component — see \`DEPLOY.md\` (UI → static host; Postgres → managed; n8n/Odoo →
  cloud or self-host; the spine → implement + deploy).

## Where to start
Open \`TODO.md\` and burn the list down: command bodies first (they're the logic everything else calls),
then UI data-wiring, then the model/engine gaps.
`;
written.push(write("CLAUDE.md", claudeMd));
written.push(write("AGENTS.md", `# AGENTS.md\n\nThis repo's agent operating manual is **[CLAUDE.md](./CLAUDE.md)** — read it first, then **[TODO.md](./TODO.md)**.\n`));

// README (human-facing) + repo plumbing so this is a repo in itself (git-initialized, one-command run).
written.push(write("README.md", `# ${domainName} — generated system

Generated by [Kiln](https://github.com/ziffr/kiln) from a
business model. A multi-backend scaffold: PostgreSQL schema, an Odoo module, n8n workflows, and a
themeable shadcn/ui front-end — plus a \`TODO.md\` for the business logic a human/agent still fills.

${gitInitialized
  ? `This directory is its own **git repository** (an initial commit was made at generation) — start
committing your changes on top. To evolve the structure, edit \`model.json\` and regenerate.`
  : `To put this under version control, run \`git init && git add -A && git commit -m "initial commit"\`.
To evolve the structure, edit \`model.json\` and regenerate.`}

## Quickstart (local)
\`\`\`bash
make up            # build + run everything in Docker: Postgres, n8n, Odoo, the spine API, and the UI
make db            # apply the schema to Postgres
# → UI at http://localhost:8080 · spine API at http://localhost:3000 · n8n at http://localhost:5678
\`\`\`
For host-side UI dev with live reload: \`make ui\` (Vite on the host). \`docker compose\` builds the
spine + UI from their Dockerfiles (\`spine/Dockerfile\`, \`ui/Dockerfile\`).

- **Agents:** \`agents/\` is a runnable agent runtime (@anthropic-ai/sdk) — \`cd agents && pnpm install &&
  pnpm start <agent-id> "<task>"\`. Each agent's tools are the spine commands + a notify router (see agents/README).
- **API testing:** import \`hoppscotch/collection.json\` + \`hoppscotch/environment.json\` into
  [Hoppscotch](https://hoppscotch.io) — a request per command with example bodies. Or import \`openapi.json\`.
- **Deploy:** [DEPLOY.md](./DEPLOY.md) — per-component (UI static host, managed Postgres, n8n, Odoo).
- **CI:** \`.github/workflows/ci.yml\` builds the UI, applies the schema, and validates the workflows.
- **Coding agents:** see [CLAUDE.md](./CLAUDE.md). To change structure, edit \`model.json\` and regenerate.

Package manager: **pnpm** (the UI). Backends run via Docker (\`docker compose\`).
`));
written.push(write(".gitignore", "node_modules/\ndist/\n.env\n*.log\n"));
// SPEC-012 placement flags — shared by the .env + docker-compose builders below. `pruned` = the compose
// services a managed engine drops; `pgManaged`/`n8nManaged` repoint the store/n8n reach vars at a remote
// host. With no `hosting` authored the set is empty and every branch below reduces to today's bytes.
const pruned = new Set(rep.placement.prunedComposeServices);
const pgManaged = !useSqlite && pruned.has("postgres");
const n8nManaged = pruned.has("n8n");
// .env reach vars: base owns DATABASE_URL/N8N_BASE_URL/etc.; a managed engine repoints ITS var to a
// commented remote pointer (never a baked value/credential — REV-030). The placement section appends only
// THIRD-PARTY reach vars the base doesn't already own, so a built-in never yields a duplicate line (REV-020).
const ENV_OWNED = new Set(["DATABASE_URL", "N8N_BASE_URL", "DB_FILE", "PORT", "VITE_API_URL", "SPINE_URL", "API_TOKEN", "PGSSL", "N8N_WEBHOOK_TOKEN", "ANTHROPIC_API_KEY"]);
const extraReach = Object.entries(rep.placement.env).filter(([k]) => !ENV_OWNED.has(k)).map(([, line]) => line);
// Root .env.example — the single, accurate list of every var the generated components read. Copy to .env
// (gitignored). Point DATABASE_URL / N8N_BASE_URL at REMOTE hosts to run against managed services.
written.push(write(".env.example", `# Copy to .env (gitignored). These are the vars the generated components actually read.

# ── Store (the spine → ${useSqlite ? "SQLite" : "Postgres"}) ──
${useSqlite
  ? "DB_FILE=data/app.db"
  : pgManaged
    ? `# Postgres is MANAGED (see PLACEMENT.md) — set DATABASE_URL to your managed instance (do not commit the value).
# DATABASE_URL=
# PGSSL=require`
    : `DATABASE_URL=postgres://app:app@localhost:5432/app
# managed Postgres (Supabase/Neon/RDS) needs TLS: append ?sslmode=require, or set PGSSL=require (verified).
# PGSSL=require`}

# ── n8n (the spine POSTs events here; import trigger_*/process_* workflows into it) ──
${n8nManaged
  ? `# n8n is MANAGED (see PLACEMENT.md) — set N8N_BASE_URL to your hosted n8n webhook URL.
# N8N_BASE_URL=`
  : "N8N_BASE_URL=http://localhost:5678/webhook"}
# if a REMOTE n8n secures its webhooks with Header Auth, set the bearer token the spine sends:
# N8N_WEBHOOK_TOKEN=

# ── Spine API ──
PORT=3000
# Opt-in bearer auth: set a shared token to require Authorization: Bearer <token> on all command routes
# (unset = OPEN). The UI, n8n HTTP nodes, and the agents runtime must send the SAME token when set.
# API_TOKEN=change-me

# ── UI → the spine base URL (Vite build-time; set in ui/.env or your host's env) ──
# Not read yet — the generated UI's data-fetch points are TODO stubs. Uncomment + wire it (and the fetch
# calls in ui/src/pages/*) once the UI talks to the spine.
# VITE_API_URL=http://localhost:3000

# ── Agents runtime (only if you run agents/) ──
# ANTHROPIC_API_KEY=sk-ant-...
# SPINE_URL=http://localhost:3000
${extraReach.length ? `\n# ── Deployment placement (SPEC-012) — reach vars for remote/managed third-party engines (see PLACEMENT.md) ──\n${extraReach.join("\n")}\n` : ""}`));
// docker-compose from placement-aware SERVICE BLOCKS (SPEC-012). A managed engine drops its local
// service (`pruned`, computed above) and dependants read its reach var instead of the in-cluster host. With
// no `hosting` authored nothing is pruned and every value equals the old literal → the compose is byte-for-byte today's.
const dbUrlVal = pgManaged ? "${DATABASE_URL}" : "postgres://app:app@postgres:5432/app";
const n8nUrlVal = n8nManaged ? "${N8N_BASE_URL}" : "http://n8n:5678/webhook";
const composeBlocks: string[] = [];
if (!useSqlite && !pruned.has("postgres")) composeBlocks.push(`  postgres:
    image: postgres:16-alpine
    environment: { POSTGRES_USER: app, POSTGRES_PASSWORD: app, POSTGRES_DB: app }
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]`);
if (!pruned.has("n8n")) composeBlocks.push(`  n8n:
    image: n8nio/n8n
    environment: { N8N_DIAGNOSTICS_ENABLED: "false" }
    ports: ["5678:5678"]
    volumes: ["n8ndata:/home/node/.n8n"]`);
if (!pruned.has("odoo")) composeBlocks.push(`  odoo-db:
    image: postgres:16-alpine
    environment: { POSTGRES_USER: odoo, POSTGRES_PASSWORD: odoo, POSTGRES_DB: postgres }
  odoo:
    image: odoo:17
    depends_on: [odoo-db]
    environment: { HOST: odoo-db, USER: odoo, PASSWORD: odoo }
    ports: ["8069:8069"]
    volumes: ["./odoo:/mnt/extra-addons:ro"]`);
if (!pruned.has("spine"))
  composeBlocks.push(
    useSqlite
      ? `  spine:
    build: ./spine
    environment: { DB_FILE: "/data/app.db", N8N_BASE_URL: "${n8nUrlVal}", PORT: "3000" }
    ports: ["3000:3000"]
    volumes: ["sqlitedata:/data"]`
      : `  spine:
    build: ./spine${pgManaged ? "" : "\n    depends_on: [postgres]"}
    environment: { DATABASE_URL: "${dbUrlVal}", N8N_BASE_URL: "${n8nUrlVal}", PORT: "3000" }
    ports: ["3000:3000"]`,
  );
if (!pruned.has("ui")) composeBlocks.push(`  ui:
    build: ./ui${pruned.has("spine") ? "" : "\n    depends_on: [spine]"}
    ports: ["8080:80"]`);
// SPEC-012 2b#4: a THIRD-PARTY engine (registered via SPEC-010) placed `local` emits its OWN declared
// compose service block + volume, so a novel engine runs in the generated compose just like a built-in.
// Built-ins leave `dockerService` unset → nothing appended → byte-identical for the shipped engines.
const extraVolumes: string[] = [];
for (const [id, place] of Object.entries(rep.placement.engines)) {
  if (BUILTIN_ENGINE_IDS.has(id) || place.mode !== "local") continue;
  const eng = engineDescriptor(id);
  if (!eng?.dockerService) continue;
  composeBlocks.push(eng.dockerService);
  if (eng.dockerVolume) extraVolumes.push(eng.dockerVolume);
}
const baseVolumes = useSqlite ? ["n8ndata", "odoodata", "sqlitedata"] : ["pgdata", "n8ndata", "odoodata"];
const volumesLine = `volumes: { ${[...baseVolumes, ...extraVolumes].map((v) => `${v}: {}`).join(", ")} }`;
// Guard the (theoretical) all-pruned case: an empty `services:` mapping is invalid YAML. If every service
// is managed/remote there is nothing to run locally — say so as a comment instead (REV: delivery/arch).
const composeBody = composeBlocks.length ? composeBlocks.join("\n") : "  # all engines are managed/remote — nothing runs locally (see PLACEMENT.md)";
written.push(write("docker-compose.yml", `# Generated by @kiln/codegen — the backends this system binds to.
services:
${composeBody}
${volumesLine}
`));

// SPEC-012 placement descriptors — emitted ONLY when some engine is remote (so the all-local export stays
// byte-identical): per-target config (e.g. spine/fly.toml), a PLACEMENT.md table, and a machine-readable
// deployment.json manifest a downstream IaC step / coding agent can consume. Targets returned STRUCTURED
// rows; the table is rendered HERE (targets never touch markdown — REV-031).
if (rep.placement.anyRemote) {
  for (const [rel, content] of Object.entries(rep.placement.files)) written.push(write(rel, content));
  const placementRows = rep.placement.placements.map((p) => `| ${p.engineName} | ${p.mode} | ${p.target} | ${p.reach} |`).join("\n");
  const rlsWarning = rep.placement.managedStore
    ? `\n> ⚠️ **A store is on a managed/remote database, but generated Postgres RLS is \`USING (true)\`** (every
> row is visible to every caller — a known gap, see \`TODO.md\`). Do **not** expose this managed database
> until you add a tenant/row-scoping predicate. Placement makes remote stores easy to author; it does not
> make them safe by itself.\n`
    : "";
  written.push(write("PLACEMENT.md", `# Placement — where each engine runs

Generated from \`binding.hosting\` (SPEC-012). Each engine runs **local** (a docker-compose container),
**selfhost** (the same image on your own remote box), or **managed** (a hosted service we only point at).
Managed engines are pruned from \`docker-compose.yml\`; set their reach var in \`.env\` (never commit the value).
${rlsWarning}
| Engine | Mode | Target | How to reach / deploy |
|---|---|---|---|
${placementRows}

The full resolved placement (machine-readable, credentials redacted) is in \`deployment.json\`. To change
where something runs, edit \`binding.hosting\` in \`model.json\` and regenerate.
`));
  written.push(write("deployment.json", JSON.stringify({ engines: rep.placement.engines }, null, 2)));
}
written.push(write("Makefile", `# Generated by @kiln/codegen.
.PHONY: up down db n8n-import odoo-install ui
up: ; docker compose up -d
down: ; docker compose down
${useSqlite
  ? `db: ; cd spine && pnpm install && DB_FILE=data/app.db node -e "const D=require('better-sqlite3'),fs=require('fs');fs.mkdirSync('data',{recursive:true});const db=new D('data/app.db');db.exec(fs.readFileSync('../sqlite/schema.sql','utf8'));console.log('applied sqlite/schema.sql')"`
  : `db: ; @for i in 1 2 3 4 5 6 7 8; do docker compose exec -T postgres pg_isready -U app >/dev/null 2>&1 && break || sleep 1; done; docker compose exec -T postgres psql -U app -d app < postgres/schema.sql`}
n8n-import: ; @for f in n8n/*.json; do docker compose cp "$$f" n8n:/tmp/wf.json && docker compose exec -T n8n n8n import:workflow --input=/tmp/wf.json; done
odoo-install: ; docker compose exec -T odoo odoo -d app -i ${mod} --addons-path=/mnt/extra-addons,/usr/lib/python3/dist-packages/odoo/addons --stop-after-init
ui: ; cd ui && pnpm install && pnpm dev
ui-build: ; cd ui && pnpm install && pnpm build
spine: ; cd spine && pnpm install && ${useSqlite ? "DB_FILE=data/app.db" : "DATABASE_URL=postgres://app:app@localhost:5432/app"} pnpm start
`));

// CI — validate the generated artifacts on every push: build the UI, apply the schema to a real
// Postgres, and parse every n8n workflow. This is what makes it a repo that stays green.
written.push(write(".github/workflows/ci.yml", `name: CI
on: [push, pull_request]
jobs:
  ui:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: pnpm install --no-frozen-lockfile
        working-directory: ui
      - run: pnpm typecheck
        working-directory: ui
      - run: pnpm lint
        working-directory: ui
      - run: pnpm test
        working-directory: ui
      - run: pnpm build
        working-directory: ui
  spine:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: pnpm install --no-frozen-lockfile
        working-directory: spine
      - run: pnpm typecheck
        working-directory: spine
      - run: pnpm lint
        working-directory: spine
      - run: pnpm test
        working-directory: spine
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: pnpm install --no-frozen-lockfile && pnpm audit --audit-level=high
        working-directory: ui
        continue-on-error: true
      - run: pnpm install --no-frozen-lockfile && pnpm audit --audit-level=high
        working-directory: spine
        continue-on-error: true
  schema:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_USER: app, POSTGRES_PASSWORD: app, POSTGRES_DB: app }
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - run: PGPASSWORD=app psql -h localhost -U app -d app -v ON_ERROR_STOP=1 -f postgres/schema.sql
  workflows:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: for f in n8n/*.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" && echo "ok $f"; done
`));

// Deployment guide — per component, honest about what's managed vs still-a-stub.
written.push(write("DEPLOY.md", `# Deployment

This system is several bound backends. Deploy each; point them at each other via env (never in code).

## UI (static)
\`\`\`bash
cd ui && pnpm install && pnpm build   # → ui/dist
\`\`\`
Deploy \`ui/dist\` to any static host (Vercel, Netlify, Cloudflare Pages, S3+CDN). Set \`VITE_API_URL\` (the
spine's URL) as a build-time env var (see \`ui/.env.example\`); the pages read it once you wire the \`TODO\`
fetches. \`ui/vercel.json\` is included (Vite + SPA fallback so deep links resolve).

## Automatic deployment to Vercel (the UI)
The UI is the clean Vercel target (static SPA). Two ways to make deploys automatic:

**A) Git integration (simplest — no token in the repo).** In the Vercel dashboard: New Project → import this
repo → set **Root Directory = \`ui\`** (framework auto-detects Vite) → add env var \`VITE_API_URL\` = your
deployed spine URL. Every push to the branch now auto-deploys. Vercel pulls from GitHub; you store nothing.

**B) CI-driven (GitHub Actions — needs a Vercel token).** Add three **GitHub Actions secrets** (Settings →
Secrets → Actions): \`VERCEL_TOKEN\` (Vercel → Account → Tokens), \`VERCEL_ORG_ID\`, \`VERCEL_PROJECT_ID\` (from
\`.vercel/project.json\` after \`vercel link\`, or the project settings). The included
\`.github/workflows/deploy-vercel.yml\` then deploys \`ui/\` on every push to \`main\`. The token lives ONLY in
GitHub secrets — never commit it.

**Backend note:** n8n, Odoo and Postgres are stateful services — NOT Vercel. Host them separately (n8n Cloud,
Odoo.sh, managed Postgres) and point \`VITE_API_URL\` at wherever the spine runs. The spine (Express) *can* run
on Vercel via a serverless wrapper, but Fly/Render/a container is the straightforward host.

## Data — PostgreSQL
Provision a managed Postgres (Neon, Supabase, RDS, Cloud SQL). Apply the schema once:
\`\`\`bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f postgres/schema.sql
\`\`\`
Then implement RLS row predicates (they ship as \`USING (true)\` — see TODO.md) before exposing data.

## Orchestration — n8n
Use n8n Cloud or self-host (\`docker compose up n8n\`). Import \`n8n/*.json\` (or \`make n8n-import\`). Set
each workflow's HTTP target to your deployed spine URL, and add credentials in n8n (not in the JSON).

## Platform — Odoo
Use Odoo.sh or self-host. Install the module in \`odoo/${mod}\` (\`make odoo-install\`, or Apps → Install).

## The spine (command API)
A runnable Express + pg service (\`spine/\`). Deploy it anywhere Node runs (Fly, Render, a container, a
serverless wrapper); set \`DATABASE_URL\` (the Postgres above) and \`N8N_BASE_URL\` (to POST events to n8n).
Point the UI, n8n, and Odoo at its URL.
\`\`\`bash
cd spine && pnpm install && pnpm start   # or: docker compose up spine
\`\`\`
Command logic lives in \`spine/src/handlers.js\` as \`(input, ctx) => record\` — LLM-drafted where
available, safe pass-through otherwise. Fill/adjust the business rules there (see TODO.md); the routes
and DB columns in \`schema.js\` are generated — regenerate from the model, don't hand-edit.

## CI
\`.github/workflows/ci.yml\` builds the UI, applies the schema to a throwaway Postgres, and parses the
workflows on every push — so a broken regeneration fails fast.
`));

// Completion briefs (Phase 1): a grounded per-command brief (LOCKED/FRAME/DECIDE) so a downstream
// human/agent can complete each handler stub without this session's context. Emitted as briefs/<cmd>.md
// + a BRIEFS.md index, and linked from TODO §1. Purely derived from the model — no invented logic.
const briefs = commandBriefs(m.domain, { resolved: rep.resolved, roles: m.roles, workflows: m.workflows, services: rep.artifacts.services.doc });
for (const b of briefs) written.push(write(b.path, b.markdown));
if (briefs.length) written.push(write("BRIEFS.md", briefsIndex(briefs)));
const briefPathOf = new Map(briefs.map((b) => [b.id, b.path]));

const todo: string[] = [];
todo.push(`# TODO — from generated scaffold to working system\n`);
todo.push(`Generated from \`model.json\`. Check items off as you implement them.\n`);
todo.push(`## 1. Command business logic (${cmds.length}) — fill each stub's body (state change + emit events)`);
todo.push(`Each command has a grounded **completion brief** (\`briefs/<id>.md\`, index in \`BRIEFS.md\`) separating what the model LOCKS from what you DECIDE.\n`);
for (const c of cmds) {
  const emits = (c.emits || []).map((e) => (m.domain.events || []).find((x) => x.id === e)?.name || e);
  const brief = briefPathOf.get(c.id);
  todo.push(`- [ ] **${c.name}** (entity \`${c.aggregate}\`)${emits.length ? ` → emits ${emits.join(", ")}` : ""}${brief ? ` — [brief](${brief})` : ""}`);
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
if (rep.artifacts.comms.n8n.length || Object.keys(rep.artifacts.comms.templates).length) {
  todo.push(`\n## ${rep.validation.some((v) => v.level === "error") ? 5 : 4}. Communications`);
  todo.push(`- [ ] Refine the templates in \`templates/\` (subject/body/recipient bindings).`);
  todo.push(`- [ ] Add email/Slack credentials in n8n for the \`comm_*\` workflows and activate them.`);
  todo.push(`- [ ] Wire pdf/render actions to a document service (the \`pdf_*.md\` templates are the source).`);
}
if (rep.artifacts.integrations.n8n.length) {
  todo.push(`\n## Integrations`);
  todo.push(`- [ ] Refine the field mappings in \`integrations/*.mapping.json\` (model field ↔ external field).`);
  todo.push(`- [ ] Set real endpoints + auth on the \`integration_*\` n8n connectors (inbound webhooks; outbound APIs).`);
}
written.push(write("TODO.md", todo.join("\n") + "\n"));

// --- Professional-repo hardening: OpenAPI, tooling config, security, pre-commit, license. ---
written.push(write("openapi.json", JSON.stringify(generateOpenApi(m.capabilities, m.domain, m.contexts), null, 2)));
// Hoppscotch: a ready-to-poke API collection for the spine (import both files in Hoppscotch).
const hopp = hoppscotchCollection(m.capabilities, m.domain, m.contexts);
written.push(write("hoppscotch/collection.json", JSON.stringify(hopp.collection, null, 2)));
written.push(write("hoppscotch/environment.json", JSON.stringify(hopp.environment, null, 2)));
written.push(write(".nvmrc", "20\n"));
written.push(write(".editorconfig", "root = true\n\n[*]\nindent_style = space\nindent_size = 2\nend_of_line = lf\ncharset = utf-8\ntrim_trailing_whitespace = true\ninsert_final_newline = true\n"));
written.push(write(".prettierrc", JSON.stringify({ printWidth: 120, semi: true, singleQuote: false, trailingComma: "all" }, null, 2)));
written.push(write(".prettierignore", "dist\nnode_modules\n*.sql\n"));
written.push(write("LICENSE", `MIT License\n\nCopyright (c) ${domainName}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and\nassociated documentation files (the "Software"), to deal in the Software without restriction, including\nwithout limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the\nfollowing conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial\nportions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.\n`));
written.push(write("CONTRIBUTING.md", `# Contributing\n\nThis system is generated from \`model.json\` by Kiln. **Change structure in the model\nand regenerate**; add logic only at the marked \`TODO\` points (see [CLAUDE.md](./CLAUDE.md)).\n\nBefore committing: pre-commit runs Prettier on staged files. CI runs typecheck + lint + tests + a\nsecurity audit for both \`ui/\` and \`spine/\` — keep it green. Run locally: \`pnpm -C ui test\`,\n\`pnpm -C spine test\`, \`pnpm -C ui typecheck\`, \`pnpm -C ui lint\`.\n`));

// Root package.json — a place for repo-wide tooling (pre-commit) that spans ui/ + spine/.
written.push(write("package.json", JSON.stringify(
  {
    name: `${mod}-system`,
    private: true,
    scripts: {
      prepare: "husky",
      format: "prettier --write .",
      "format:check": "prettier --check .",
      test: "pnpm -C ui test && pnpm -C spine test",
      check: "pnpm -C ui typecheck && pnpm -C ui lint && pnpm -C spine typecheck && pnpm -C spine lint",
    },
    devDependencies: { husky: "^9.1.6", "lint-staged": "^15.2.10", prettier: "^3.3.3" },
    "lint-staged": { "*.{ts,tsx,js,jsx,json,css,md}": "prettier --write" },
  },
  null,
  2,
)));
written.push(write(".husky/pre-commit", "pnpm exec lint-staged\n"));

// Security: dependency updates + CodeQL SAST.
// Auto-deploy the UI to Vercel on push (opt-in — the job self-skips unless the Vercel secrets are set).
// Add secrets VERCEL_TOKEN / VERCEL_ORG_ID / VERCEL_PROJECT_ID in GitHub → Settings → Secrets → Actions.
written.push(write(".github/workflows/deploy-vercel.yml", `name: Deploy UI to Vercel
on:
  push:
    branches: [main]
    paths: ["ui/**"]
concurrency: deploy-ui
jobs:
  deploy:
    runs-on: ubuntu-latest
    if: \${{ secrets.VERCEL_TOKEN != '' }}   # skipped until you add the Vercel secrets
    defaults: { run: { working-directory: ui } }
    env:
      VERCEL_ORG_ID: \${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: \${{ secrets.VERCEL_PROJECT_ID }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm i -g vercel@latest
      - run: vercel pull --yes --environment=production --token=\${{ secrets.VERCEL_TOKEN }}
      - run: vercel build --prod --token=\${{ secrets.VERCEL_TOKEN }}
      - run: vercel deploy --prebuilt --prod --token=\${{ secrets.VERCEL_TOKEN }}
`));

written.push(write(".github/dependabot.yml", `version: 2
updates:
  - package-ecosystem: npm
    directory: /ui
    schedule: { interval: weekly }
  - package-ecosystem: npm
    directory: /spine
    schedule: { interval: weekly }
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: weekly }
`));
written.push(write(".github/workflows/codeql.yml", `name: CodeQL
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
  schedule: [{ cron: "0 6 * * 1" }]
jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions: { security-events: write, actions: read, contents: read }
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with: { languages: javascript-typescript }
      - uses: github/codeql-action/analyze@v3
`));

  return { files, report: rep };
}
