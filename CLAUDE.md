# CLAUDE.md — operating manual for Kiln Studio

This file is loaded into context every session. It is the rules of the road. Read it, follow it,
and update it when a rule changes. **Product name: Kiln Studio** (tagline "the business compiler");
**Kiln** is the engine under it — the `@kiln/*` packages and `kiln.sh` CLI keep that name. Hosted as
two envs: **kilnstudio.app** (studio — keyed, passphrase-locked via `KILN_STUDIO_TOKEN`) and
**demo.kilnstudio.app** (demo — keyless, public). Remnants kept on purpose: the local git-directory
name `VerticalBusinessDesiger` (historical), and a legacy `VBD_ANTHROPIC_API_KEY` env alias accepted
alongside `KILN_ANTHROPIC_API_KEY` for back-compat.

## What this is
An LLM-guided **"Business Compiler"**: describe a vertical business in structured text → an LLM
derives a formal model → deterministic validators check it → it renders as an interactive,
reviewable **Capability Map**. Text is the source of truth; the graphic is a projection.

## Golden invariants (do not violate)
1. **Text is the source of truth; the UI/graph is a projection of the IR.** Never store truth in
   the canvas. Node positions are computed (elk), never persisted.
2. **Every IR node/edge is `authored` or `derived`.** Only `authored` elements round-trip to text
   and are editable; `derived` elements are read-only projections.
3. **Secrets never reach the browser.** The Anthropic key (`KILN_ANTHROPIC_API_KEY`, in the
   gitignored root `.env`) lives only in `apps/service`. The web app POSTs to the service; it
   never calls the model or holds the key.
4. **Pure packages are isomorphic + dependency-free.** `@kiln/ir|compiler|validation|narrative|skills|eval`
   run in Node tests AND the browser. No `node:*` builtins in them (use the isomorphic `sha256`
   from `@kiln/ir`, not `node:crypto`). `@kiln/store` and `apps/service` are the server-only exception.
5. **The model proposes; validators + the human decide.** LLM output is coerced, validated, and
   human-editable. Generated capabilities must carry grounded provenance (`meta.derivedFrom`,
   enforced by validator V8).

## Architecture (where things live)
```
packages/
  ir/          IR types (the spine) + isomorphic sha256/canonical/slug/edgeId
  schema/      JSON Schemas (capability.schema.json)
  compiler/    authored artifacts → IR (+ computeBuildHash)
  validation/  deterministic validators over the CapabilityDoc/IR (V1–V2, V8; V3–V7 WIP)
  narrative/   Business Narrative parser (heading-anchored) + completeness validators (NV1–NV4)
  store/       .kiln/ derived cache with buildHash-on-load (server-only; ADR-002)
  eval/        seeded-defect + generation-coverage scoring (gold-free)
  skills/      LLM skill runtime: CapabilityGenerator, MockProvider, NarrativeCoach prompt
apps/
  web/         React + Vite SPA (narrative interview/markdown, capability map, forms, projects)
  service/     Node API holding the key: /api/generate, /api/coach, /api/models, /api/usage
workspaces/    user data (solar-example fixture)
docs/          governed plans/specs/reviews/ADRs — see docs/CONVENTIONS.md
```
The **IR is the contract**: every view and validator reads it. Validators are pure functions.

## Tech & conventions
- **TypeScript end-to-end** (ADR-001). Node ≥ 20 runs `.ts` natively (type-stripping) — packages
  have **no build step**. `@types/node`/`typescript` are intentionally not installed, so the editor
  shows "cannot find module 'node:*'" squiggles — harmless; runtime is fine.
- **Tests:** `node:test` + `node:assert/strict`. Run `npm test` (currently **279** passing). Every
  new pure function gets a test in `packages/*/test/*.test.ts`.
- **Web:** Vite. `npm run build --workspace @kiln/web` must pass. Verify UI changes **in the browser**
  (the preview tools), not just tests — the invariants are visual.
- **Storage:** git for authored docs (ADR-002); the web app persists projects to **localStorage**
  (`kiln.projects`, ADR-005 — interim until a git-backed workspace API).

## Running it
```
npm install                          # links workspaces only (offline; no registry fetch for pkgs)
npm run dev --workspace @kiln/web      # http://localhost:5188
npm run dev --workspace @kiln/service  # http://localhost:8787 (loads root .env)
npm test                              # all package tests
```
Real LLM generation/interview needs `KILN_ANTHROPIC_API_KEY=sk-ant-...` in the gitignored root `.env`.

## LLM rules
- The project is TypeScript → use the **official `@anthropic-ai/sdk`**, never raw HTTP. SDK usage
  lives only in `apps/service`.
- **Do not guess the Anthropic API.** Consult the `claude-api` skill for model ids, effort/thinking,
  and structured outputs before writing LLM code.
- Default model **`claude-sonnet-5`**, effort **`medium`** ("sonnet medium"). `output_config.effort`
  is GA on Sonnet 5 / Opus 4.x but **errors on Haiku 4.5** → effort is coupled per-model.
- Use **structured outputs** (`output_config.format`) to lock JSON shapes; keep a one-shot repair
  retry; wrap user/business text as DATA (prompt-injection safety).
- **Provider seam (Langdock option):** set `KILN_LANGDOCK_API_KEY` to route the SAME SDK through
  Langdock's Anthropic-native endpoint (EU-resident, governed, multi-provider gateway) — Bearer
  `authToken` + `KILN_LANGDOCK_BASE_URL` (default `.../anthropic/eu/v1`), no request-code change. It
  takes precedence over `KILN_ANTHROPIC_API_KEY`. Both the service and hosted functions honor it.
  Langdock gates the API behind a paid plan (no test-tier key), so `output_config` passthrough (effort +
  structured `format`) is UNVERIFIED live → the provider **degrades gracefully**: only on the Langdock
  path, only on a 400, only when an `output_config` was sent, it retries once without it (JSON falls back
  to the repair-parse). `tools` are confirmed. Anthropic-path errors are untouched.

## Docs & process discipline
- All plans/specs/reviews/ADRs go under `docs/` per **`docs/CONVENTIONS.md`** (ID prefixes, frontmatter,
  **status lifecycle**). Update `docs/INDEX.md` when adding/changing a doc.
- Specs and plans get **independent, multi-lens review to closure** before `Approved`; log finding
  disposition in the doc. ADRs record decisions.

## Git
- Commit when a coherent unit is green. **Before committing: `npm test` + web build.** Commit
  often; small, clear messages.
- End every commit message with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- `.env`, `node_modules/`, `.kiln/`, `dist/` are gitignored — never commit them.

## Status (keep current)
- **LAUNCH-STAGED (private): renamed to Kiln, reviewed, deployed.** Repo is `github.com/ziffr/kiln` (PRIVATE, owner chose to hold the public flip). Full VBD→Kiln rename done (packages/CLI/env/IDs/prose; legacy `VBD_ANTHROPIC_API_KEY` + storage-key aliases kept for back-compat). Launch-readiness review: no blockers, no committed secrets. Live on Vercel (auto-deploy via git integration) serving Kiln; hosted demo is client-side (baked examples + all stages + code preview + full-stack export) � real-LLM `/api` now WORKS on the hosted demo — the 25 functions were consolidated into one catch-all (`functions/router.ts` � `api/[...path].js`), under the plan cap; verified `/api/models` ready:true. To go public (owner's word): flip visibility, enable Discussions, add `ANTHROPIC_API_KEY` secret, enable "Actions may create PRs", branch-protect main, set description/topics/social image; optionally rename the Vercel project off the old URL.
- **Building the FULL methodology stack** (user: "the whole enchilada"): policies ✅ → roles ✅ →
  workflows ✅ → agents ✅ → application/implementation blueprints ✅ → execution codegen MCP/React ✅ (adapters hand-owned per ADR-002). FULL STACK BUILT.
- **SPEC-009 orchestration (workflow-vs-agent router) BUILT** — each process carries an authored
  `WorkflowInput.mode` (`workflow`|`agent`). `@kiln/skills` orchestration skill (mock heuristic +
  `generateOrchestration` LLM + `/api/orchestration`, prompt `orchestration.md`) proposes; the app's
  **Workflows stage is the review/override screen** (per-process "Run as" toggle + Auto-classify).
  Mode-DRIVES codegen: workflow-mode → n8n `process_*`; agent-mode → folded into the covering agent's
  `behaviours/<id>.md` ("Processes you own"). Exporter emits `ORCHESTRATION.md`. Solar: 4 workflow, 1 agent.
- **Excel + External-services (delegation) + 3-way orchestration BUILT** — Excel = an integration
  `transport` (xlsx|gsheet → n8n Sheets/Excel nodes) + a comms `spreadsheet` channel (rendered .xlsx,
  like pdf). External services (`@kiln/codegen` services.ts): delegate to EXISTING workflows/agents —
  `sync` (call & record via a command) or `async` (fire + a CALLBACK webhook = a trigger → command / wake
  agent); agents get them as `external` tools; `--external-services`/`/api/external-services`;
  EXTERNAL-SERVICES.md. `ProcessMode` is now `workflow|agent|external` — the Workflows review screen's
  "Run as" toggle is 3-way (External → pick a bound service); external-mode → a thin delegate connector,
  not the internal pipeline. **Per-step delegation** (`WorkflowInput.stepBindings`: step cmd id → service
  id): a workflow-mode process runs internally but any single step can be delegated to a service (the
  n8n pipeline emits a delegate node for that step; UI "Delegate individual steps" panel + 🌐 step marker).
  Routing is composable — process-level AND step-level. Solar: Excel lead import + offer-register export;
  sync Lead Qualifier + async Offer Reviewer. 252 tests.
- **sidebar-16 skin BUILT (both apps)** — generated app: `shadcnAdapter` shell upgraded to shadcn's
  "sidebar-16" inset dashboard (team header + model-derived grouped nav + AppHeader breadcrumb/search +
  inset content card), reproduced dependency-light (React+Tailwind, no shadcn `sidebar` component). VBD
  designer: **full shell swap** — topbar+stage-rail → sidebar (team header + project switcher + labeled
  StageRail nav + footer) + inset content card with breadcrumb topbar + collapse toggle (kept in VBD's own
  CSS, dark palette). Verified in-browser; 255 tests.
- **Enrichment system BUILT (review + web research + auto)** — enrichment surfaced in-app as a human-gated
  accept/decline/adjust diff (`EnrichPanel` + `enrichReview.ts` flatten/rebuild) on the Entities stage:
  "✨ Enrich" proposes missing attributes/child-entities (each individually kept/dropped, ◇ grounded / 🔎
  web + source link), Apply merges only accepted → domain (persisted). **Grounded source** = offline
  `mockEnrichDomain`; **web-research source** = Anthropic `web_search_20260209` (`/api/enrich-web`, prompt
  `enrich-web.md`, SDK-only-in-service; `extractJsonObject`+`coerceEnrichment` SDK-free) returns cited
  additions. **⚡ Auto** = accept-all one-click. Verified in-browser (decline honored; auto 12→16 entities).
  **Rolled out to Capabilities, Roles, Agents** (generic `layerEnrich.ts` flatten/apply + light offline
  grounded + `/api/enrich-layer` web research + `enrich-layer.md`; `EnrichPanel` buckets by `group`). Verified
  in-browser (entities 12→16; roles 7→10, one declined excluded). Remaining stages (behaviour/automations/
  workflows/areas) are cross-ref-heavy → still generate+AI-review. 257 tests.
- **Ingest raw text/transcript BUILT** — the Narrative stage has a "From text/transcript" tab: paste a
  transcript/notes/brief or upload a .txt/.md; `@kiln/skills structureNarrative` (prompt `structure.md` +
  `/api/structure`) projects it into the heading-anchored Business Narrative → the existing derive pipeline.
  (Fixed NarrativeInput to use the config `SERVICE_URL` — was hardcoded localhost.) 256 tests.
- **Generated-app config/env + Vercel auto-deploy scaffold BUILT** — root `.env.example` rewritten to the
  vars the code ACTUALLY reads (mode-aware `DATABASE_URL`/`DB_FILE`, `N8N_BASE_URL`, `N8N_WEBHOOK_TOKEN`,
  `PORT`, `VITE_API_URL`, agent `ANTHROPIC_API_KEY`; was stale PG*). Remote-ready: spine pg driver honors TLS
  (`PGSSL=require` verified; `no-verify` = documented dev-only), events.ts sends `N8N_WEBHOOK_TOKEN` bearer for
  secured remote n8n. `ui/.env.example` (`VITE_API_URL`) + `ui/vercel.json` (Vite+SPA fallback) +
  `.github/workflows/deploy-vercel.yml` (deploys ui/ on push, self-skips until `VERCEL_TOKEN`/`ORG`/`PROJECT`
  secrets set). DEPLOY.md: Git-integration (no token) vs CI (token=GH secret); n8n/Odoo/Postgres hosted apart.
  Open (rock-solid gaps): RLS is `USING(true)` (needs a subject/tenant model); observability. 262 tests.
- **Spine API auth + input validation BUILT** — closed two of the deploy-hardening gaps at the command API's
  request boundary. **Auth**: opt-in shared bearer — set `API_TOKEN` → `Authorization: Bearer <token>` required
  on every command route (unset = OPEN, boot warns; `/health` stays open; constant-time compare via
  `node:crypto`). Internal callers wired to send it: the agents runtime (`tools.ts` command POST) + documented
  for the UI/n8n HTTP nodes. **Validation**: generated `src/validate.ts` (from `entityFieldTypes(domain)` —
  pure, unit-tested) type-checks each request body against the model's typed attributes; only fields PRESENT
  are checked (partial updates stay valid), unknown/untyped pass, non-object body rejected → `400 {error,
  details}` before any handler/DB work. Env-driven (no new exporter flag; matches the `N8N_WEBHOOK_TOKEN`/`PGSSL`
  idiom). Verified: generated `validate()` executed against good/bad/partial/null/unknown inputs; app.ts +
  validate.ts esbuild-parse. RLS + observability remain the open deploy gaps. 265 tests.
- **Engine plugin seam BUILT (SPEC-010 Phase 1) + OSS prep.** Contributors can now add an execution
  engine (store/orchestrator/UI/platform) by registering ONE `EngineAdapter` — no edits to core dispatch.
  `packages/codegen/src/engines/` = a registry (`registerEngine`/`getEngineAdapter`/`registeredEngines`,
  sorted→deterministic) + the six built-ins wrapping the existing adapters; `ENGINES` is now a derived view;
  `projectTargets` dispatches through it + exposes an additive `artifacts.engines` channel; `assembleFullStack`
  flattens it for third-party engines. Dispatch-only: byte-identical export both dialects; 273 tests; engines/
  has no `node:*`; end-to-end probe (a fake mysql engine → `mysql/schema.sql` with zero core edits) passes.
  **OSS prep shipped:** Apache-2.0 LICENSE + governance (GOVERNANCE = non-technical owner + AI maintainer
  does all review/merge/release; CONTRIBUTING/SECURITY/CODE_OF_CONDUCT/RELEASING/CHANGELOG), CI (test+build)
  + release/dependabot workflows + PR/issue templates, `docs/good-first-issues/` (3 engines), and
  `docs/specs/SPEC-010`.
- **Rebranded to Kiln + security CI + example gallery (v0.1.0).** Product name is now **Kiln** ("the
  business compiler"); internal codename VBD (`@kiln/*` packages + repo dir keep it). Renamed user-facing
  surface + generated-app attribution + repo URL (`github.com/ziffr/kiln`). **Security CI shipped:** an
  invariant-check test (pure-package isomorphism + secret-never-client-side), a prompt-safety test (enforces
  the DATA-wrapping anti-injection convention on all 20 shipped prompts), a schema-version test; CodeQL +
  dependency-review + gitleaks workflows; `.github/CODEOWNERS` (gates prompts/service/engine-contract/
  schema/governance → @ziffr); `MODEL_SCHEMA_VERSION` constant in `@kiln/ir`. **Example gallery:** enriched
  the (thin) solar narrative + added 3 rich verticals seeded as example projects, each a different ingestion
  path — Legal office (Zoom transcript), Coffee franchise (agent interview → `coachTranscript`), Funeral
  franchise (owner file); new ones ship description-first (generate in-app). Version 0.0.0→**0.1.0**. 279
  tests; web build green; Kiln branding verified live in-browser.
- **Pre-launch: release automation + launch assets DONE.** release-please (auto version + categorized
  CHANGELOG + GitHub Release from Conventional Commits; `bump-minor-pre-major`) replaces the tag-triggered
  release.yml; `claude.yml` (claude-code-action@v1) = @claude issue→PR, least-privilege, no auto-merge, gated
  on the ANTHROPIC_API_KEY env. **README hero** rewritten: badges, an animated **demo GIF** (`docs/assets/
  kiln-demo.gif`, 760×427 looping describe→model→run, built via an HTML sprite-strip → Playwright → ffmpeg),
  live-demo link, how-it-works, examples gallery; **social card** `docs/assets/kiln-social.png` (1280×640).
  Remaining are HUMAN-ONLY GitHub steps (create/push repo as `ziffr/kiln`, make public, branch protection,
  add ANTHROPIC_API_KEY secret, enable "Actions may create PRs", set description/topics/social-image) + the
  optional rolling-alpha workflow + baking full models for the 3 new examples (needs an LLM run).
- **Full-stack export from the app + `kiln.sh` CLI helper BUILT.** (1) The complete multi-backend file-map
  assembly was extracted out of the CLI bin into a pure, isomorphic `assembleFullStack(input) → {files,
  report}` in `@kiln/codegen` (byte-identical to the CLI, both dialects; the bin is now a thin wrapper). The
  web app's **View code** stage gained a **📦 Full-stack** button that assembles the whole repo in the browser
  and downloads it as a `.zip` (dialect auto-detected from the store binding; AI-drafted handlers included) —
  previously only the self-contained single-process app (`generateApp`) could be exported in-app. Verified
  in-browser: 660 KB zip, 199 files, no errors. (2) **`kiln.sh`** (repo root, documented, `./kiln.sh help`):
  one entrypoint for every CLI task — `install`/`doctor`/`dev`/`web`/`service`/`test`/`build`/`check`,
  `export [flags]` (the codegen exporter), and `app:up|down|ui|spine|logs` (run a GENERATED system via its
  Makefile) + `verify:up`. 268 tests.
- **Repo hygiene: env templates were never committed (FIXED).** The `.gitignore` `.env.*` rule silently
  shadowed every `.env.example`, so a fresh clone shipped with NO env docs — despite the required
  `KILN_ANTHROPIC_API_KEY`. (The earlier "root `.env.example` rewritten" note was doubly wrong: the file was
  never in git, and it listed generated-app vars incl. `VITE_API_URL`, which VBD's web app doesn't read — it
  reads `VITE_SERVICE_URL`.) Fix: `!.env.example` / `!*/.env.example` negation + a correct root `.env.example`
  (KILN_ANTHROPIC_API_KEY, PORT, VITE_SERVICE_URL, optional KILN_VERIFY_*) + tracked `verifier/.env.example`;
  real `.env` stays ignored (verified). Generated-app env templates still live with the artifacts (spine/
  agents/ui adapters → `/out`, correctly ignored).
- **VBD-repo hygiene: gitignore `apps/web/api/` + drop the committed bundles (FIXED).** `api/*.js` are
  esbuild output of `functions/*.ts`, regenerated by `build-functions.mjs` during Vercel's build — committing
  them was redundant and churned 25 files per codegen change. Untracked + ignored; verified a fresh `npm run
  build` regenerates the identical 25 + `dist/`.
- **Generated-repo hardening: git history + real Docker images (FIXED).** Two gaps a senior dev would flag in
  the EXPORTED app: (1) no git history — exporter now `git init` + one clean initial commit on `main` (author
  falls back to the generator only if no git identity is set; `--no-git` to skip; `.gitignore` keeps `.env`/
  `node_modules` out — verified 191 files tracked, none leaked). (2) the generated `spine/Dockerfile` +
  `ui/Dockerfile` were ORPHANED — `docker-compose.yml` ran spine as raw `node` + bind-mount + runtime `pnpm
  install` and omitted the UI entirely. Now compose `build:`s both Dockerfiles (spine :3000, ui nginx :8080),
  both store variants. Verified: `docker compose config` valid + **`docker compose build spine ui` actually
  builds both images** (UI multi-stage vite→nginx). README quickstart updated. 265 tests.
- **SQLite store engine + dialect-aware migrations BUILT** — SQLite = an embedded, file-based store → a
  single-container generated app (no db service). `SQLITE` engine + `sqliteAdapter` (SQLite affinities,
  `PRAGMA foreign_keys`, `CREATE TABLE IF NOT EXISTS`, no RLS); `spineAdapter(dialect)` emits a
  `better-sqlite3` db.ts (same async interface as pg; booleans→0/1, objects→JSON; `DB_FILE`); `migrate(old,
  new, dialect)` is now postgres|sqlite (SQLite type-change note = "rebuild the table"). Exporter `--sqlite`
  (or `binding.defaults.store=sqlite`) → `sqlite/schema.sql` + `sqlite/migrations/` + a single-container
  docker-compose (node:20-slim spine + a data volume, NO postgres service) + dialect-aware Makefile. Verified
  both modes export; sqlite spine db.ts esbuild-parses; --sqlite --since = SQLite migration. 262 tests.
- **Postgres model-diff migration generator BUILT** — incremental update story (grow a LIVE db, don't drop
  it). `@kiln/codegen/migrate.ts` `migratePostgres(oldDomain,newDomain)`: additive-by-default (new attr → ADD
  COLUMN, new entity → CREATE TABLE, new ref → ADD COLUMN…REFERENCES = live SQL); drops/type-changes = BREAKING
  → emitted COMMENTED with the reason (human decides on data). Mirrors postgresAdapter naming/types. Exporter
  `--since <deployed model.json>` → `postgres/migrations/<version>.sql` + logs additive/breaking counts;
  generated CLAUDE.md says "update a live app via the migration, not schema.sql." n8n already upserts by stable
  id; still no migration for Odoo/other stateful engines. Verified end-to-end. 260 tests.
- **Complete model.json store BUILT** — the whole business is ONE versionable document (all layers). The
  web `Project` now holds every execution-layer decision (services/triggers/comms/integrations/binding/theme/
  i18n), previously mock-only/export-flag splices. `apps/web/src/model.ts` `assembleModel` materializes the
  COMPLETE model (absent layers filled from mock defaults → explicit + self-contained); `parseModel` loads it.
  App: **⬇ Export model / ⬆ Import model** (sidebar footer) round-trip the whole model.json (recall + iterate
  before generating; commit it to git = the chosen git-backed substrate). Exporter now treats model.json as
  the single source of truth (reads authored services/triggers/comms/integrations/binding/theme/i18n from it,
  emits the complete model.json — same shape as the app). Verified in-browser (16 layers; edited service
  survives round-trip). Open: in-app EDIT UI for comms/integrations/binding/theme (edit via model.json for
  now); a server-authoritative auto-git workspace API (still localStorage + manual export/import). 256 tests.
- **Generated-app light/dark + i18n (LLM auto-translation) BUILT** — `ThemeToggle` (.dark class + persisted,
  no-flash init in index.html). i18n: every visible string keyed, rendered via a dependency-free runtime
  (`src/i18n.tsx` `t(key,fallback)`, locale persisted); **base locale = the model's source language** (the
  description's language), base bundle = `appMessages` source strings; LLM `translateMessages` (+ prompt
  `translate.md` + `/api/translate`) translates into target locales; header language switcher when >1 locale;
  exporter `--lang`/`--translations` bake them; `projectTargets` threads `i18n`. Verified via esbuild + a
  German bake. 256 tests.
- **Generated-app in-app HELP system BUILT** — `helpModel` projects the model into end-user docs (screen
  "what" = capability purpose/area intent; action "does" = command→emitted events; processes = workflows;
  roles; automations = policies; field hints from types). `shadcnAdapter` emits `src/help.ts` + a `/help`
  page + a dependency-light "ⓘ Help" drawer per screen (route+nav wired). Regenerated with the app → never
  stale. Solar: 12 entities/5 processes/7 roles/9 automations. 254 tests.
- **Triggers layer + agent HTTP mode BUILT** — `@kiln/codegen` triggers.ts: external signals in
  (webhook|schedule → command|workflow|agent|notify), grounded in the model's external/time events, →
  importable n8n `trigger_*` workflows + `TRIGGERS.md`. The generated agents runtime gained an HTTP mode
  (`pnpm serve` → `POST /run {agent,task}`) so a webhook can WAKE an agent; a webhook→agent trigger POSTs it.
- **SPEC-005 (policies/reactions) BUILT + Approved** — `policy` node + when/then edges,
  `validatePolicies` (PL1–PL7 incl. joined-graph cycle), `PolicyModeler` (precision-biased, single
  call) + `/api/policies`, eval with reactionRecall + **spuriousRate** (anti over-wiring), codegen
  **Workflows** stubs, in-context "Automations" UI. Verified: 7 cross-entity hand-offs on solar.
- **Deployed on Vercel** (SPA + serverless functions, key server-side): https://vertical-business-designer-web.vercel.app
- **Full modeling arc built + partner-validated (SPEC-001…004 Approved).** narrative → capabilities →
  business areas → entities (typed attributes) → commands/events. `@kiln/codegen` projects it to TS
  types + OpenAPI (real command operations, not just CRUD) + event catalog + area-module map; visible
  in-app via the **"View code"** panel.
- **SPEC-005 (policies/reactions) reviewed to closure (REV-022…026) but BUILD DEFERRED.** No strategic
  Blocker; owner chose **consolidate & ship to the design partner first** (product meta-note: 5 layers,
  one partner → get a real demand signal before layer six). Reviewed design is on the shelf (§13).
- **Consolidation done:** cleared the implementation debt the review exposed — reconcile-not-clear for
  the domain (capability edits no longer wipe authored entities/behaviour; delete reconciles) and the
  half-built collapsible-entity disclosure; added the in-app Code preview; fixed a React border warning.
  **Next: ship to partner for a demand signal; then un-shelf SPEC-005 or iterate on their feedback.**

- **M0, M1 complete.** **M2 engineering-complete** — only the human gate is open (a design partner
  to confirm A1 capability correctness). Provenance + V8 done.
- **SPEC-002 (domain layer, aggregates-first) engineering-complete** — DM1 mock, DM2
  `DomainGenerator` (+ `/api/domain`), DM validators in the UI, editable entity forms, DM eval. Exit
  gate GREEN on solar. **A4 (second-domain) now MET** via SPEC-003 §14. Open: A1/A6 design-partner.
- **SPEC-003 (business areas / subdomains) engineering-complete** — the capabilities→areas layer
  (the methodology's `bounded_contexts` rung, surfaced as "Business Areas", honestly a subdomain
  partition). 5-lens reviewed to closure (REV-012..016). Shipped: BC-M0 IR compose (`bctx:` nodes +
  `groups` edges), BC-M1 mock partitioner (affinity+size-cap, no single-blob), BC-M2 `validateContexts`
  (BC1–BC9; BC2 partition guarantee), BC-M3 `ContextGrouper` + `/api/contexts`, BC-M4 backdrop UI
  (colour+legend over the SINGLE map, form-select reassignment, Area-detail, reconcile-not-clear),
  BC eval with an ARI partition-agreement gate. Exit gate (§14): structural GREEN + **A7 second-domain
  PASSED** (dental, no code change); A5 ARI a qualified pass (LLM over-segments vs a coarse single
  reference); **HOLD** on `Approved` pending A6 partner value check.
- **Design partner validated capabilities + entities + areas** → **SPEC-002 & SPEC-003 `Approved`** (v1.0.0).
- **RES-001 codegen probe done** — `@kiln/codegen` (deterministic model→code projection: TS types +
  OpenAPI + area-module map + gap report). **Thesis holds for scaffolding** (solar → 8 TS interfaces,
  16 OpenAPI paths, 3 area modules, no LLM). Two gaps named the next work, both now CLOSED: typed
  attributes + commands/events. `@kiln/codegen` is the yardstick for future layers.
- **Typed entity attributes** — `AttributeSpec {name, type}` (text/number/boolean/date/money/reference);
  codegen emits real TS/OpenAPI types; LLM + human editor both set types. The codegen "untyped" gap is
  closed.
- **SPEC-004 (commands & events) reviewed to closure (REV-017..021), then BUILT** after RES-001
  justified it. IR: command/event nodes + issues/changes/emits/on edges. `validateEvents` (CE1–CE8 +
  emit-boundary). `EventModeler` = events-first, command-is-a-request (emits 0..n), **per-aggregate
  fan-out**, trigger discriminator (command/time/external), `/api/events`. In-context "What happens"
  UI. CE eval with a **commandRecall** quality metric. Exit gate GREEN (§14): commandRecall **1.0**,
  dental second-domain clean, 0 findings. Status `Revised`, **A6 (partner review of behaviour) the
  one open item.**
- Full arc works end-to-end: narrative interview (or markdown) → capabilities (mock / real Sonnet 5)
  → elk map with **Business-Areas backdrop** → editable capability/entity/area forms → validators
  (V1–V8, DM, BC) → multi-project (server + localStorage) → spend estimate.
