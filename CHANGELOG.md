# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) at the repository level (see
[RELEASING.md](RELEASING.md)).

## [0.9.1](https://github.com/ziffr/kiln/compare/v0.9.0...v0.9.1) (2026-07-18)


### Documentation

* SPEC-014 durable agent lifecycle — approved spec, five-lens reviews, verified DBOS spike ([#75](https://github.com/ziffr/kiln/issues/75)) ([1e25562](https://github.com/ziffr/kiln/commit/1e25562c8985691a91a43ee0efbc8f172ffb0042))

## [0.9.0](https://github.com/ziffr/kiln/compare/v0.8.0...v0.9.0) (2026-07-17)


### Features

* **codegen:** SPEC-013 Phase A — connector model, validators & registry seam ([#70](https://github.com/ziffr/kiln/issues/70)) ([02bf68e](https://github.com/ziffr/kiln/commit/02bf68e9260475a3170c401b8348b0f060770bd9))
* SPEC-013 Phase B — Spreadsheet connector over Nango (backend + Studio UI + ergonomics) ([#71](https://github.com/ziffr/kiln/issues/71)) ([905db0a](https://github.com/ziffr/kiln/commit/905db0ac9c78735ac119a5467880c5905d2bd475))
* **web:** coherence score distinguishes real coverage from mock scaffolding ([#67](https://github.com/ziffr/kiln/issues/67)) ([6938736](https://github.com/ziffr/kiln/commit/69387369e5a65d8c5b1afddf69a6c990e18db15b))


### Documentation

* **spec:** SPEC-013 Agent Tool Connectors — reviewed to closure (Approved) ([#68](https://github.com/ziffr/kiln/issues/68)) ([0b53a26](https://github.com/ziffr/kiln/commit/0b53a26f885b590158de8f417a17ecbf2f9abef1))

## [0.8.0](https://github.com/ziffr/kiln/compare/v0.7.0...v0.8.0) (2026-07-17)


### Features

* **web:** gate export on whole-model coherence check ([#63](https://github.com/ziffr/kiln/issues/63)) ([928f2df](https://github.com/ziffr/kiln/commit/928f2dfdd4f88caa068f7e95210d21c388f57901))


### Bug Fixes

* **skills:** mock generators stamp origin:"mock" not "llm" (honest provenance signal) ([#62](https://github.com/ziffr/kiln/issues/62)) ([8ce5f4c](https://github.com/ziffr/kiln/commit/8ce5f4cb2adb3199f353853553829e8ffb61044c))


### Documentation

* add "How Kiln builds a model" concept page ([#64](https://github.com/ziffr/kiln/issues/64)) ([063355c](https://github.com/ziffr/kiln/commit/063355c8f8ae77a4f6397a3b627284161bc83695))

## [0.7.0](https://github.com/ziffr/kiln/compare/v0.6.0...v0.7.0) (2026-07-17)


### Features

* **agents:** apply a prompt finding as a reviewed, minimal edit ([#57](https://github.com/ziffr/kiln/issues/57)) ([03cffeb](https://github.com/ziffr/kiln/commit/03cffeb450ddb9ece3c4ef66e8f76926a14f1336))


### Bug Fixes

* **web:** give detail panels room + one drawer design ([#59](https://github.com/ziffr/kiln/issues/59)) ([7c1beb0](https://github.com/ziffr/kiln/commit/7c1beb0acb45e940a43193e9be0ac921cac81b24))

## [0.6.0](https://github.com/ziffr/kiln/compare/v0.5.1...v0.6.0) (2026-07-17)


### Features

* **agents:** critique an agent's prompt against its contract ([#47](https://github.com/ziffr/kiln/issues/47)) ([0bd0010](https://github.com/ziffr/kiln/commit/0bd00103523e0fedeaa566d9d9ef37d078b7e7a6))
* **agents:** derive the agent contract (input·tools·output·context) + ground the prompt ([#46](https://github.com/ziffr/kiln/issues/46)) ([4e1e30c](https://github.com/ziffr/kiln/commit/4e1e30c343b40d4a15a6ddcfad6b0987e0829340))
* **agents:** keep a bounded run history + compare two runs ([#49](https://github.com/ziffr/kiln/issues/49)) ([af662b7](https://github.com/ziffr/kiln/commit/af662b7c8c0e1104fa66108cc96a649f5c462ba0))
* **agents:** let external services carry a declared credential ([#53](https://github.com/ziffr/kiln/issues/53)) ([a00547b](https://github.com/ziffr/kiln/commit/a00547b77309553340a7cea20652292b50e85827))
* **agents:** look records up by field instead of scanning the table ([#52](https://github.com/ziffr/kiln/issues/52)) ([71ba61e](https://github.com/ziffr/kiln/commit/71ba61e282674385c13fc0a6ea3637978f8b05ea))
* **agents:** test-this-agent — behaviour editor + in-Studio mock run + trace ([#44](https://github.com/ziffr/kiln/issues/44)) ([1601726](https://github.com/ziffr/kiln/commit/1601726aff2592f014febe960125c3bb54de8661))
* **web:** prompt & output studio — view/session-tune prompts + last-output observability ([#43](https://github.com/ziffr/kiln/issues/43)) ([11a3803](https://github.com/ziffr/kiln/commit/11a3803fb60e7fc7fe0a0a9adb0b486c463753bb))
* **web:** select an agent to open its detail (contract · behaviour · runs) ([#55](https://github.com/ziffr/kiln/issues/55)) ([44012d1](https://github.com/ziffr/kiln/commit/44012d145aa9bfb6ee9fdf84f0d4f421a73c1d89))


### Bug Fixes

* **agents:** give agents read tools so they can look data up ([#50](https://github.com/ziffr/kiln/issues/50)) ([08c07fc](https://github.com/ziffr/kiln/commit/08c07fcde317f62aa3e296bb52266a49af3fb42c))
* **agents:** size the prompt critique to its own layer, not the agents stage ([#48](https://github.com/ziffr/kiln/issues/48)) ([0b03956](https://github.com/ziffr/kiln/commit/0b039564c500c592804156795981d960ce03637b))
* **agents:** stop faking a designed agent when no behaviour is authored ([#54](https://github.com/ziffr/kiln/issues/54)) ([4eb1ae8](https://github.com/ziffr/kiln/commit/4eb1ae8aa4c7e49a7c494a3ae2023ab5fb73e0b9))
* **web:** surface the AI-review step in the stage guide ([#42](https://github.com/ziffr/kiln/issues/42)) ([ae2c8fd](https://github.com/ziffr/kiln/commit/ae2c8fdad3c60f5291315f798bbbe943c4f272a1))

## [0.5.1](https://github.com/ziffr/kiln/compare/v0.5.0...v0.5.1) (2026-07-16)


### Bug Fixes

* **release:** make the docs snapshot non-releasing (chore(docs)) to avoid a patch loop ([#39](https://github.com/ziffr/kiln/issues/39)) ([fae053c](https://github.com/ziffr/kiln/commit/fae053c4289b542d26f9180c210e5ae52d988aff))


### Documentation

* snapshot v0.5.0 + make it the default ([#36](https://github.com/ziffr/kiln/issues/36)) ([8047c3d](https://github.com/ziffr/kiln/commit/8047c3d2cc5243c4d112c6fd9e5fb6f6898672ac))

## [0.5.0](https://github.com/ziffr/kiln/compare/v0.4.0...v0.5.0) (2026-07-16)


### Features

* **web:** redesign home as Mission Control; narrative summary-first; honest readiness ([#34](https://github.com/ziffr/kiln/issues/34)) ([00dd3ad](https://github.com/ziffr/kiln/commit/00dd3ad0e48b00bd0081cceed419a0dae395b1b8))
* **web:** rework "AI review" into "Second opinion" — gate, stage-scope, Home launcher, judge model ([#35](https://github.com/ziffr/kiln/issues/35)) ([39c8f1d](https://github.com/ziffr/kiln/commit/39c8f1d536777b852a7eab4e39f4359835e45cb1))


### Documentation

* snapshot v0.4.0 + make it the default ([#32](https://github.com/ziffr/kiln/issues/32)) ([30cd3e7](https://github.com/ziffr/kiln/commit/30cd3e7ba05008df72693b400a21c007aa746122))

## [0.4.0](https://github.com/ziffr/kiln/compare/v0.3.0...v0.4.0) (2026-07-16)


### Features

* **web:** decouple layer-status glyph — shape=provenance, colour=health ([#29](https://github.com/ziffr/kiln/issues/29)) ([15850f9](https://github.com/ziffr/kiln/commit/15850f9f9f128f14943942f6338c5e036840f12a))


### Documentation

* adopt trunk-based branching (protected main, PR-per-change) ([#26](https://github.com/ziffr/kiln/issues/26)) ([82b0d13](https://github.com/ziffr/kiln/commit/82b0d13223e09783fed49292fe8cf1e5facef66d))
* correct CLAUDE.md lastVersion pin (0.2.0 → 0.3.0) ([#30](https://github.com/ziffr/kiln/issues/30)) ([d8a4b25](https://github.com/ziffr/kiln/commit/d8a4b258554fee816132e6e449d3cd28bb23148e))
* snapshot v0.3.0 ([#24](https://github.com/ziffr/kiln/issues/24)) ([b26a237](https://github.com/ziffr/kiln/commit/b26a237126840184a9e0b04aafef8529c894a8d9))
* **vision:** fold in the CASE-tools lineage and named market comparators ([#23](https://github.com/ziffr/kiln/issues/23)) ([355eaf0](https://github.com/ziffr/kiln/commit/355eaf0dd4e11810798189e7d18038e53d53574f))

## [0.3.0](https://github.com/ziffr/kiln/compare/v0.2.0...v0.3.0) (2026-07-16)


### ⚠ BREAKING CHANGES

* **brand:** complete rename VBD → Kiln (packages, CLI, env, IDs, storage)

### Features

* ✨ Polish UI — an automated UX pass over the generated app ([989de96](https://github.com/ziffr/kiln/commit/989de967a5207cc6874eee16128585e33584ced8))
* **agents:** a behaviour playbook (markdown) per agent — the "HOW" ([d38b5a7](https://github.com/ziffr/kiln/commit/d38b5a76d02eec6a3346b921c39c1d66c3d9c463))
* **agents:** per-agent model + thinking (effort) + editable instructions ([4f75e31](https://github.com/ziffr/kiln/commit/4f75e314a3bcd02090ea370686e0e40bae3ec2d2))
* AI-designed per-entity screens — build-safe by construction (view specs, not JSX) ([c303c68](https://github.com/ziffr/kiln/commit/c303c68b2e2f116f64af99223ecd8bdda2ec54e9))
* **auth:** optional studio passphrase lock (KILN_STUDIO_TOKEN) ([cadc911](https://github.com/ziffr/kiln/commit/cadc9116002b5bd72d1897452e1b15709f4981d7))
* auto fix-and-re-verify loop — generate → build → run → fix, closed ([d4d750a](https://github.com/ziffr/kiln/commit/d4d750a09c519bdf3c4e7dbe02b4b65b2268039f))
* auto mode — drive the whole model to closure hands-free ([e18a439](https://github.com/ziffr/kiln/commit/e18a43944dcab8cd0530f3b4a384ee087bd16beb))
* behaviour layer core — commands & events (SPEC-004 CE-M0/M1/M2/M3 + eval) ([4b8b596](https://github.com/ziffr/kiln/commit/4b8b5962ad22ad2dabc125cdce8b8a86438e5e10))
* **ci:** security + compliance gates for contributions ([acd1945](https://github.com/ziffr/kiln/commit/acd1945132909b138be519854f2926566ea68456))
* **cli:** vbd.sh — documented one-entrypoint helper for every VBD task ([caf59a2](https://github.com/ziffr/kiln/commit/caf59a22cd590212afcbeffc18302af30477583b))
* **codegen:** accurate env/config + remote-ready connections + Vercel auto-deploy scaffold ([86f95cc](https://github.com/ziffr/kiln/commit/86f95cc441afbe4eaa35ad20bfe4df0cf3dd3a39))
* **codegen:** agent HTTP mode — POST /run wakes an agent (for triggers) ([01f3f3f](https://github.com/ziffr/kiln/commit/01f3f3fb72e1609d6e9255e99c998b7e394d786d))
* **codegen:** agent runtime — provider choice (Anthropic native + OpenRouter) ([985c78c](https://github.com/ziffr/kiln/commit/985c78cc2855c560661040bf8adc6b9ea5df5e27))
* **codegen:** agent runtime + export gain full engine parity ([7fc30ec](https://github.com/ziffr/kiln/commit/7fc30ec1656e7d502d8a12e9405f646b3ee36b52))
* **codegen:** agent-tools wiring — agents get commands + notify + comm actions ([70eea24](https://github.com/ziffr/kiln/commit/70eea24be93004a395fff705dd8875fa1a1b0a57))
* **codegen:** Anthropic Managed Agents engine — first-party agent runtime ([9985675](https://github.com/ziffr/kiln/commit/998567545ca2c04b7dcbd5cf243813c21b2d9cfb))
* **codegen:** codegen probe (RES-001) — model → scaffolding + gap report ([90d5cfe](https://github.com/ziffr/kiln/commit/90d5cfee581eb23aee4a5c9c40cbc9998f084520))
* **codegen:** communication layer — templates + n8n notify workflows from events ([217a11e](https://github.com/ziffr/kiln/commit/217a11e6921913a3dbcf3635e54b70fdef762d23))
* **codegen:** deployment placement (SPEC-012) + completion-brief projector ([2dbcc15](https://github.com/ziffr/kiln/commit/2dbcc15bfe7e72df047ba4b33f610d7836e78d57))
* **codegen:** emit a Hoppscotch API collection for the spine ([ab8590b](https://github.com/ziffr/kiln/commit/ab8590b2728a34fc6b22101dcfc4d9b1141bb6ea))
* **codegen:** engine plugin seam Phase 1 — EngineAdapter contract + registry (SPEC-010) ([2070654](https://github.com/ziffr/kiln/commit/20706540f9d086fc723764a9e4ab90ec83a2ab7f))
* **codegen:** Excel — spreadsheet transport for integrations + spreadsheet comms channel ([9dfbc36](https://github.com/ziffr/kiln/commit/9dfbc36d3d9c6cfbef8ee4b6906bf27745dc73a2))
* **codegen:** execution targets — MCP tools + React scaffold; SPEC-007/008 docs ([a1ecedf](https://github.com/ziffr/kiln/commit/a1ecedf6f45c441333de6a263b9ef65d2c277193))
* **codegen:** export-targets — write RES-002 artifacts to disk you can run ([3803aaf](https://github.com/ziffr/kiln/commit/3803aaff1ea1b2dbe66271671f5ff31c00a1cc4b))
* **codegen:** generated app — light/dark toggle + i18n with LLM auto-translation ([8dd60ee](https://github.com/ziffr/kiln/commit/8dd60eed89afa731092736cfe894ac2f19c1da86))
* **codegen:** generated app adopts the sidebar-16 shell (inset dashboard) ([0f2f1c8](https://github.com/ziffr/kiln/commit/0f2f1c8b7604c3a9baa5b00b649d45bba439b0e2))
* **codegen:** generated output is now type-safe (strict tsc) + linted (eslint) ([dca0f43](https://github.com/ziffr/kiln/commit/dca0f430e438a6fc6b4e9c1c1cfa981aa99563dd))
* **codegen:** generated repo gets CI/CD, deploy guide, and pnpm tooling ([b063fa2](https://github.com/ziffr/kiln/commit/b063fa2649345d39263bed8a0b837ee219539341))
* **codegen:** generated repo ships with git history + buildable Docker images ([3db6d0f](https://github.com/ziffr/kiln/commit/3db6d0f3c4cb26c3bc73a6c5b53c45c4876222fd))
* **codegen:** harden the generated repo to senior-dev standards ([698c3db](https://github.com/ziffr/kiln/commit/698c3db26e64548ffa10729fd00acfb8a256d6dc))
* **codegen:** in-app help & documentation system for the generated app ([2ebc038](https://github.com/ziffr/kiln/commit/2ebc0381b15fbb913aa79fc0c351ec151a2d3d9b))
* **codegen:** integration layer — inbound/outbound connectors + field mappings ([febc39f](https://github.com/ziffr/kiln/commit/febc39f8ac7fb9daaf60d20931cb84ad8115d2cf))
* **codegen:** Langdock agent-runtime engine — provision Kiln agents into a governed workspace ([eea5d56](https://github.com/ziffr/kiln/commit/eea5d56aa1e40583c65758d9211d324500920389))
* **codegen:** live agent runtime — runnable tool-use loop over the spine ([0b2f956](https://github.com/ziffr/kiln/commit/0b2f95651607d61f64ae9807b8536f331b048e5b))
* **codegen:** LLM-ready export — AGENTS.md, TODO manifest, source model ([3d3b44c](https://github.com/ziffr/kiln/commit/3d3b44cb0c4bcb48526d4f327868a9fe9232a7bf))
* **codegen:** make the full-stack export runnable — spine reads + UI fetch ([68772ca](https://github.com/ziffr/kiln/commit/68772ca8d32c77e9875ea951d66870fc736fb171))
* **codegen:** master-detail UI — child grids + reverse-reference lists ([4fc2c83](https://github.com/ziffr/kiln/commit/4fc2c83e7e2d6cc5d47095ab553c0364927ae40a))
* **codegen:** Postgres model-diff migration generator (grow a live db, don't drop it) ([0a05d52](https://github.com/ziffr/kiln/commit/0a05d527d6e086fd08921689f62feb7662be51b3))
* **codegen:** QA baseline for the exported app — lint, docs, security hardening ([385c4ef](https://github.com/ziffr/kiln/commit/385c4efc9348de93c8166ff8b1dd4907fee02886))
* **codegen:** real command operations + event catalog beyond CRUD (probe follow-up a) ([90c0f1c](https://github.com/ziffr/kiln/commit/90c0f1c879d164656830165928431f170ab7203a))
* **codegen:** RES-002 execution-engine binding probe — model → multi-backend compiler ([a6a4487](https://github.com/ziffr/kiln/commit/a6a4487056aef4f96b39504a8c0628ef19ce13db))
* **codegen:** RES-002 Probe 3 — Odoo engine + adapter proves the connector architecture ([6130f22](https://github.com/ziffr/kiln/commit/6130f22d156cf9e6632565f63f9e072d518f63f9))
* **codegen:** richer shadcn primitives in the full-stack export ([9e47d1d](https://github.com/ziffr/kiln/commit/9e47d1da588c1d18d3635a92f7b2f7d64c47cc47))
* **codegen:** skin system — serve-ui capability + shadcn adapter (structure vs skin) ([1c6d8db](https://github.com/ziffr/kiln/commit/1c6d8db965a8ee19ca7a8a43e4219980c6f13b38))
* **codegen:** spine API auth (opt-in bearer) + model-driven input validation ([7bd9a39](https://github.com/ziffr/kiln/commit/7bd9a399d2b215918eacabb96ca81af5777f036d))
* **codegen:** SQLite persistence for the exported app (built-in node:sqlite) ([4f01d26](https://github.com/ziffr/kiln/commit/4f01d2654333d396652a96fb639e8d3288901525))
* **codegen:** SQLite spine auto-creates its schema on boot (one-command export) ([0326f82](https://github.com/ziffr/kiln/commit/0326f827dbb88f5926b2ac44d4a21db96d8bbbed))
* **codegen:** SQLite store engine (single-container) + dialect-aware migrations ([b3e48b6](https://github.com/ziffr/kiln/commit/b3e48b6125e6c74b8eb59ab55e76b3b42ff5338f))
* **codegen:** the export is now a standalone repo — CLAUDE.md + runnable UI + plumbing ([27c9de2](https://github.com/ziffr/kiln/commit/27c9de2bdf6aeab5b1e03f23b64e80cbe0781f89))
* **codegen:** the spine — a runnable command API with LLM-drafted bodies ([51133c5](https://github.com/ziffr/kiln/commit/51133c522be5dc584f8e5c22aab61d7dd4a02d2c))
* **codegen:** Triggers layer — external signals in (webhook/schedule → command/workflow/agent/notify) ([f9dc76d](https://github.com/ziffr/kiln/commit/f9dc76dd99b4f8e3d46d7de0b412cfbfe05dfb3a))
* **codegen:** wire the full-stack shadcn export to the view-spec vocabulary ([14ab55d](https://github.com/ziffr/kiln/commit/14ab55dccf40f0ee58ac2a1628dd34d7049de2f4))
* **codegen:** Zapier connector in the integration layer ([634845b](https://github.com/ziffr/kiln/commit/634845b78728595cca4c44c2589807f160f17eab))
* **compiler,validation:** business-areas IR compose + validators (SPEC-003 BC-M0/BC-M2) ([0e28889](https://github.com/ziffr/kiln/commit/0e28889af4078d75d5cc4a06b5fe5bd6286a79a4))
* control over the critic — accept/amend per proposal, cost confirm, re-review choice ([c34b795](https://github.com/ziffr/kiln/commit/c34b795737b8fb76daea4c5892f1d72e75dfd114))
* **deploy:** make the app Vercel-ready — SPA + serverless API functions ([cfd3631](https://github.com/ziffr/kiln/commit/cfd3631640ce82537a0c39b573a6746f2f595dca))
* enrichment web-research source (cited) — Anthropic web_search ([c3e1307](https://github.com/ziffr/kiln/commit/c3e130744213844f30620b1a5b5b96a10e52156a))
* ER reference edges + error boundary + visual polish ([905b815](https://github.com/ziffr/kiln/commit/905b815332f93ff6c5c9ab426716fa10e4cded9a))
* **eval:** business-areas eval — defect corpus + coverage + ARI quality gate (SPEC-003 BC-M2) ([0bf9927](https://github.com/ziffr/kiln/commit/0bf9927520471ce9cdf815cfc71b78b921a92603))
* **eval:** DM domain-layer evaluation harness (SPEC-002 exit gate) ([afba258](https://github.com/ziffr/kiln/commit/afba2584f57c9cdc16e5d34ef53039140b769cce))
* **examples:** enrich solar + add legal/coffee/funeral verticals across ingestion modes ([7b75377](https://github.com/ziffr/kiln/commit/7b753770cc5d0de987269d38ecf4db70b1322e14))
* export a RUNNABLE app from the model (not just scaffolding) ([3a71fe8](https://github.com/ziffr/kiln/commit/3a71fe898ae468c23709239e241ad8fc2c401cfc))
* external services (delegation) layer — call existing workflows/agents (sync/async) ([822f909](https://github.com/ziffr/kiln/commit/822f909a801935fc39bfdfdf8c6227f64580fb7b))
* **functions:** wire the multi-engine seam into the hosted Vercel API ([3529bb4](https://github.com/ziffr/kiln/commit/3529bb43dc192a54c5368e63f3f6dae1adc790bb))
* guarantee ER connectivity (dependency-graph reference augmentation) + polish map/narrative ([8b1abcd](https://github.com/ziffr/kiln/commit/8b1abcdbdd68b1cf5fd458fe9553cbe04ea0f9af))
* ingest raw text/transcript → LLM structures it into the Business Narrative ([6674f50](https://github.com/ziffr/kiln/commit/6674f5042bc67c207ba7972731699dc124ba6bec))
* Kiln favicon for Studio + brand-aligned Run-app preview ([e1e1c0e](https://github.com/ziffr/kiln/commit/e1e1c0e0c80bdb21d09a2a8f93de251f81a1eff9))
* **kiln.sh:** optional omniroute sidecar helper + engine quickstart docs ([0f0f820](https://github.com/ziffr/kiln/commit/0f0f820193a9e00c881c0656c6ef167dd5e2b101))
* LLM writes the app's handler logic — AI-completed runnable app export ([2503c75](https://github.com/ziffr/kiln/commit/2503c759021d19c1e43b2ed423e0c0ed29e03137))
* multi-agent codegen — fan-out handlers + per-lens review + fix loop + auto ([1ac9d06](https://github.com/ziffr/kiln/commit/1ac9d06e979e4bd5a749fdb6f16111068641ba04))
* multi-lens AI code review of the exported app (4th QA layer) ([de62db2](https://github.com/ziffr/kiln/commit/de62db2b956122ac435a13d69451a0e71ba0c632))
* orchestration router — workflow vs agent per process, mode-driven codegen (SPEC-009) ([69d04db](https://github.com/ziffr/kiln/commit/69d04dbdf1cbdb3a9fb9737717a9d1aaae161e3a))
* per-stage model tiering — right model for each stage, not one-size-fits-all ([d14ce89](https://github.com/ziffr/kiln/commit/d14ce896eeb477990df480cc7e72c425245c0dcc))
* per-step delegation — bind an individual workflow step to an external service ([327807f](https://github.com/ziffr/kiln/commit/327807f1c4eeef3050e21ad41d4f7d2c1a87c670))
* Phase 2 — visual UX pass (screenshot → vision critique) + prompt tuning ([b1d10b6](https://github.com/ziffr/kiln/commit/b1d10b6a9e940f7935b73d80487d77dda0b9c7a2))
* policies/reactions layer core (SPEC-005 PL-M0..M3,M5 + eval) ([3fa35ca](https://github.com/ziffr/kiln/commit/3fa35ca921ed2cd1a1e118558d5c347bffdbd919))
* richer view-spec vocabulary — KPI tiles, card grid, kanban board ([0703920](https://github.com/ziffr/kiln/commit/0703920a8d0c03b07e5f6251e88eb1ef76f262f7))
* roles/permissions layer (SPEC-006) — full stack ([db0108e](https://github.com/ziffr/kiln/commit/db0108e106b2296c85265d27fb228198a0111687))
* roll enrichment out to capabilities, roles, agents (generic layer enrichment) ([9a60dab](https://github.com/ziffr/kiln/commit/9a60dab7b523e193da0604cb59611d730d984024))
* roll the semantic critic across ALL layers + the Review→Refine→closure loop ([355addc](https://github.com/ziffr/kiln/commit/355addcaae7ceaf392b7959836f941736305527d))
* selectable AI engines (OpenRouter/omniroute) + local "Run app" ([afed545](https://github.com/ziffr/kiln/commit/afed545eaff29d1d32d86a7764675f2404b9bba0))
* semantic critic for Business Areas — the LLM reviews its own output ([720bfcb](https://github.com/ziffr/kiln/commit/720bfcb6d35bfb978aaf2addc548047f3d292101))
* **service:** Langdock as an LLM provider option (EU-resident, governed gateway) ([167a696](https://github.com/ziffr/kiln/commit/167a6963dfeb5fb04962045d0d839d6fea08cf89))
* **service:** SPEC-011 M1 — git-backed workspace history substrate ([75f8480](https://github.com/ziffr/kiln/commit/75f848023c16208c82af291b6c8eea54efd1b3e6))
* **skills,codegen:** LLM command bodies are heavily commented + prompt improved ([b035dc9](https://github.com/ziffr/kiln/commit/b035dc94683887efa2d2ce53a1d324d5caa44e36))
* **skills,service:** ContextGrouper mock + LLM skill + /api/contexts (SPEC-003 BC-M1/BC-M3) ([79c19a4](https://github.com/ziffr/kiln/commit/79c19a4f26742708f7d7aa4ee3b21689bffd1e2f))
* **skills:** AI business summary skill + /api/summary endpoint ([81e155d](https://github.com/ziffr/kiln/commit/81e155de17c24c4b407d66d1d828338d843934d6))
* **skills:** domain enrichment — propose realistic attributes + child entities ([e9e7ecb](https://github.com/ziffr/kiln/commit/e9e7ecbda0b2438a07965eabed57432e96154344))
* **skills:** DomainGenerator LLM skill + /api/domain endpoint (SPEC-002 DM2) ([1cff366](https://github.com/ziffr/kiln/commit/1cff3663aa8b05315c270e5a81b56d06007b4ed9))
* **skills:** LLM-refine pass for communications + integrations ([9184b54](https://github.com/ziffr/kiln/commit/9184b549ea1d75e3d856aaae2bec41b633b7f6d5))
* **studio:** bake full models for the 3 gallery examples (legal/coffee/franchise) ([5921978](https://github.com/ziffr/kiln/commit/5921978b7bdd743cbdb6b5da2c6d3f9c5eb3034a))
* **studio:** breadcrumb trail + cross-screen navigation + hover-highlight linkage ([2bf8704](https://github.com/ziffr/kiln/commit/2bf8704ed395d96275f2666b31bacd91858452a1))
* **studio:** findings are now actionable — jump-to-fix + dismiss (persisted) + restore ([6aab4e0](https://github.com/ziffr/kiln/commit/6aab4e0292d1b900f2e73943eb4fbd0a3b43573b))
* **studio:** findings can be IGNORED — persists across regeneration (keyed on meaning, not id) ([6509bf9](https://github.com/ziffr/kiln/commit/6509bf9b966e0d52996878386ed6246c669f5296))
* **studio:** findings can now perform the fix — remove an automation inline ([fcd0221](https://github.com/ziffr/kiln/commit/fcd0221115338890ac457802d1eb6876636f3796))
* **studio:** findings now show severity + how to fix them ([13118d7](https://github.com/ziffr/kiln/commit/13118d7371b2d699ecd8b4c25aa551e5f62280b0))
* **studio:** hovering a finding scrolls to + highlights its artifact; findings panel is sticky ([7c31e8b](https://github.com/ziffr/kiln/commit/7c31e8b6ae86ab735d824870f999d00cacdd47ab))
* **studio:** in-app Examples gallery — load any of the 4 demo verticals on demand ([74a0a34](https://github.com/ziffr/kiln/commit/74a0a34a2cb625179ea72dc81d7e720e5b2d803a))
* **studio:** object-detail is a slide-in that reclaims the empty space ([725ee02](https://github.com/ziffr/kiln/commit/725ee02334e2699e2a56be2e41b0f4890e68f034))
* **studio:** passphrase prompt is now an in-app modal — no more native prompt() (item 2) ([53768bf](https://github.com/ziffr/kiln/commit/53768bfcaeaaa60f7d07dd06c43acb0abbeda4b9))
* **studio:** project description field + per-example engine-mix demos ([b9c8ed5](https://github.com/ziffr/kiln/commit/b9c8ed5d0125375ace15d78d041a49bde90a3adf))
* **studio:** redesign v1 — light-first, Langdock-elegant design system (light + dark) ([419c27b](https://github.com/ziffr/kiln/commit/419c27b7d2995ad69e764bf794c805d5d6759daa))
* **studio:** redesign v2 — real dialogs + consistent icons (no more prompt/alert/emoji) ([940e583](https://github.com/ziffr/kiln/commit/940e583cad03de346385bbd2a0bafb8af9fa911e))
* **studio:** show running version + redesign the example picker ([50eb252](https://github.com/ziffr/kiln/commit/50eb252fd2d0166e03772b3650bf385617fd8d88))
* **studio:** SPEC-011 M2 — restore + the version timeline UI ([ca7a10e](https://github.com/ziffr/kiln/commit/ca7a10e0e1649647dc006c03e77f2315b2c5cc69))
* **studio:** SPEC-011 M3+M4 — semantic model diff engine + Compare view ([4eb44be](https://github.com/ziffr/kiln/commit/4eb44bec094b5dc6aa0ce204e4712e719c118bee))
* **studio:** SPEC-011 M5 — meaningful version labels + explicit "Save version" ([f2af184](https://github.com/ziffr/kiln/commit/f2af184705f14c7d4cb489ec9d3d6498fe239005))
* **studio:** welcome/home screen + richer stage sub-headers ([170d9ec](https://github.com/ziffr/kiln/commit/170d9ec52b752ce32284c78094aa0f6f4b316385))
* **studio:** Workflows screen — declutter + clickable workflow/step detail ([474f40f](https://github.com/ziffr/kiln/commit/474f40fedbc7977cdb1ea2bd2965fcea99da1015))
* three-way orchestration — Workflow | Agent | External (same decision screen) ([e0c735e](https://github.com/ziffr/kiln/commit/e0c735e3fcef1580a7160203ee069d4947f243c0))
* tier-aware Auto cost estimate — prices each stage at the model it runs on ([e503f0c](https://github.com/ziffr/kiln/commit/e503f0cef616d75f480f2d6d24601bc693f5c0f6))
* transparency + control over per-step model & effort (Settings) ([3dbbd67](https://github.com/ziffr/kiln/commit/3dbbd67f9430dba945e6bc180666fb391080e1b0))
* typed entity attributes → real codegen schemas (RES-001 gap [#1](https://github.com/ziffr/kiln/issues/1)) ([827a225](https://github.com/ziffr/kiln/commit/827a225ffc585a75a3e0f281e08f6c8ce94ce2f5))
* **ui:** Areas containment diagram + Agents graph — a real diagram for every layer ([d150571](https://github.com/ziffr/kiln/commit/d15057142a3853ce3c059c273b39597e64184961))
* **ui:** bake in the fully-generated solar model + reliable diagram fit ([5e97d2e](https://github.com/ziffr/kiln/commit/5e97d2e0c700712b7b583ad20fdd6169b3c75794))
* **ui:** entity connections trace — the cross-layer view ([47159c9](https://github.com/ziffr/kiln/commit/47159c9de015c2a46ae075803827a10c12ae8d3b))
* **ui:** entity trace doubles as a cross-layer navigation pad ([46c7691](https://github.com/ziffr/kiln/commit/46c769151afc47e1fd18bbb00e28119744e725ee))
* **ui:** highlight the origin entity in the destination diagram on trace jumps ([b40143c](https://github.com/ziffr/kiln/commit/b40143c12e278b8cca0aa3470f58a92dd3f458e0))
* **ui:** richer per-layer diagrams — ER edges, workflow sequence, automation wiring ([aa6504c](https://github.com/ziffr/kiln/commit/aa6504c7eb43dccb12dc46132bd31b77c9e1c04c))
* **ui:** stage-based workspace — declutter, progressive disclosure, per-type viewers ([208e60c](https://github.com/ziffr/kiln/commit/208e60c522687491e140ab26143c32302f951476))
* use the LLM to the max — caching, adaptive effort, few-shot, holistic pass ([0a68c71](https://github.com/ziffr/kiln/commit/0a68c71eaa4c939f817972e9e1ae327f75f62bc5))
* **verifier:** sandboxed build-and-run PoC for generated apps (local Docker → VPS) ([929645f](https://github.com/ziffr/kiln/commit/929645f5485a36bf53efb61f8b4bb96fcfaf92af))
* **web,service:** Business Areas UI — backdrop over the single map (SPEC-003 BC-M4) ([19fa65b](https://github.com/ziffr/kiln/commit/19fa65b0c2c84a5fe3506ef6752c13eab2dc1248))
* **web,store:** behaviour UI + store cache fix (SPEC-004 CE-M4 / REV-020 M4) ([b649ee1](https://github.com/ziffr/kiln/commit/b649ee1f5e6b3d80b85c6c61fdb813afe52b7b71))
* **web:** "Export full stack" button — download the complete multi-backend repo ([15a2faf](https://github.com/ziffr/kiln/commit/15a2faf60bcd0ad4f8d58ba2a3f07fd97a9959df))
* **web:** "what do I do here" stage guide + wizard next-step cue ([426e1e8](https://github.com/ziffr/kiln/commit/426e1e897318107694fa2e74b43910777cce20eb))
* **web:** advisor-style home screen for non-technical owners ([534f5fe](https://github.com/ziffr/kiln/commit/534f5fe29744c5c2c6291a1cc8cc357b5296e483))
* **web:** Automations UI — reactions in-context + Workflows codegen tab (SPEC-005 PL-M4) ([811d80b](https://github.com/ziffr/kiln/commit/811d80b65c93e62a3f92d1397a5ba39f68e0ef4f))
* **web:** complete, versionable model.json — store every layer, recall + iterate ([391a78e](https://github.com/ziffr/kiln/commit/391a78e3fd9ef4495762dfbefa8d73b866b7c166))
* **web:** dependency-aware AI review worklist ([8f8d58b](https://github.com/ziffr/kiln/commit/8f8d58b1d76c66209f2b1365a4957166bd89c0fc))
* **web:** detect oscillating layers in AI Review (recurrence + warning) ([caac2fd](https://github.com/ziffr/kiln/commit/caac2fdca0e7759705bbba1d6b6971313a853868))
* **web:** durable ignore for AI Review — accept a concern for good ([8872c7d](https://github.com/ziffr/kiln/commit/8872c7de37a7e1c39ce1133096b29bec092fb6dc))
* **web:** editable entity (aggregate) forms in the capability panel (SPEC-002) ([a7e35a7](https://github.com/ziffr/kiln/commit/a7e35a7e4c9c825868ab62dd20a888721fa48402))
* **web:** enrichment as an accept/decline/adjust review (foundation) ([a727bc0](https://github.com/ziffr/kiln/commit/a727bc0b584d7747b776d924a6510d7feb1845bb))
* **web:** enrichment auto mode — one-click accept-all enrich ([7bca178](https://github.com/ziffr/kiln/commit/7bca17849844136beb5de04ebe0d672a4730160b))
* **web:** explain workflow / agent / external on the processes screen ([076ae5d](https://github.com/ziffr/kiln/commit/076ae5d7f74057de36ec791e8246c502e5b1ce4e))
* **web:** extend surgical fix to roles, areas, agents, workflows ([e74bbd7](https://github.com/ziffr/kiln/commit/e74bbd7a782d44601eac8e70b784f038b3edb06b))
* **web:** guard against regenerating away hand-made fixes ([5391d2b](https://github.com/ziffr/kiln/commit/5391d2b5a0f5023e977d6feaee8db00317f89b8b))
* **web:** hamburger on Home + responsive off-canvas sidebar on mobile ([8bb9ad7](https://github.com/ziffr/kiln/commit/8bb9ad755316cfa88d4011b590a2e6f32bdaca59))
* **web:** humanize the ids embedded in review hints ([8493165](https://github.com/ziffr/kiln/commit/8493165e54a6118287908aa8caaa4a2aac6bb24b))
* **web:** in-app Code preview — make the model→code payoff visible (consolidation) ([888d0ba](https://github.com/ziffr/kiln/commit/888d0ba03a52721526ac6940ceffc5470fc4120f))
* **web:** in-app user Guide — non-technical step-by-step walkthrough ([24d4b80](https://github.com/ziffr/kiln/commit/24d4b800b2dfa690ef570c659e97dc0c2c42b7b6))
* **web:** link the studio to the docs site; drop the in-app Guide pop-up ([74f0e5d](https://github.com/ziffr/kiln/commit/74f0e5dbff578d5dd5125efdd328658587a51ef1))
* **web:** make AI Review legible — round diff + honest explainer ([7a980a8](https://github.com/ziffr/kiln/commit/7a980a88a01e127fe9605fbe7d4bc77f58d2a634))
* **web:** manager import/export + example filtering, tabbed settings, session-usage footer ([1fe629d](https://github.com/ziffr/kiln/commit/1fe629db06612fbf44756cfbe5c2852509db713f))
* **web:** narrative screen as a business-owner dialogue ([18bf0cb](https://github.com/ziffr/kiln/commit/18bf0cb0659b4d4cf1dc4d72e95a1c9a9e723114))
* **web:** orchestration review screen — confirm/flip workflow-vs-agent per process ([a8cbcf1](https://github.com/ziffr/kiln/commit/a8cbcf1370dc8afc32488981b72917d4df0df104))
* **web:** per-stage provider + model + effort (+ Polish/Visual as stages) ([368adbf](https://github.com/ziffr/kiln/commit/368adbf4dde06fa16c26f6c559dc78dfb12dfe43))
* **web:** project manager — switch/duplicate/search + consolidated examples & versions ([7e530d2](https://github.com/ziffr/kiln/commit/7e530d2434d58915bc230193feb46f3364e1b88f))
* **web:** public-demo mode banner + safe-hosting guide ([ada852d](https://github.com/ziffr/kiln/commit/ada852d1f402797c943d4dd0da6904e161fde49c))
* **web:** resolving reference pickers for capability/entity fields ([60c2eba](https://github.com/ziffr/kiln/commit/60c2eba1bc85818e2cd0aece08cbc6fefa7ca82f))
* **web:** reviewed narrative sync — keep the prose honest with the model ([f7c1901](https://github.com/ziffr/kiln/commit/f7c190167ea676d5e2ff6571d36fe92e80f28535))
* **web:** show the coach's narrative draft before you apply it ([3e40574](https://github.com/ziffr/kiln/commit/3e40574974a1200d03d2411bdf1035857e1f5f6b))
* **web:** surface domain (DM) findings in the capabilities panel (SPEC-002) ([3bc945d](https://github.com/ziffr/kiln/commit/3bc945de79ec7e1b2fe84f4a23e6aa7c396757e1))
* **web:** surgical single-finding fix in AI Review (convergent auto-fix) ([bcee9e7](https://github.com/ziffr/kiln/commit/bcee9e7c881ab288dfa5cfc0a2791b5ebe1982ea))
* **web:** tidy sidebar IA + align Settings/Examples modals with the studio ([19596ab](https://github.com/ziffr/kiln/commit/19596ab99294527bafaeaa9e5f48f1bfb7336078))
* **web:** VBD full shell swap to the sidebar-16 layout ([e26e296](https://github.com/ziffr/kiln/commit/e26e296067fb8785359230a626ffeb51b562dd80))
* **web:** view-code action menus, adaptive model defaults, settings tooltips ([2db3d2a](https://github.com/ziffr/kiln/commit/2db3d2aa012c630f43540caed8f2ef2350a5a83f))
* wire VBD to the sandboxed verifier — env-driven, one-command, local↔VPS ([a919016](https://github.com/ziffr/kiln/commit/a91901656df802be8e79742eacc36db33b4c2327))
* workflows, agents + application/implementation blueprints — full stack complete ([11f34d2](https://github.com/ziffr/kiln/commit/11f34d26cf5da5c863fd9ed205ad7ed189453684))


### Bug Fixes

* **ci:** run CI on Node 24 so the .ts test suite actually executes ([834b215](https://github.com/ziffr/kiln/commit/834b215ef23086c9c2a959fc93f1056e8d545fc2))
* **codegen:** comment out unread VITE_API_URL in generated root .env.example ([2c4dd12](https://github.com/ziffr/kiln/commit/2c4dd1260dc7294cf277bb9df119b294055c7558))
* **codegen:** full-stack CORS + KPI metric field slug (live-verified) ([0145477](https://github.com/ziffr/kiln/commit/0145477587e5662a9d31203c45ae75f81a87e597))
* **codegen:** full-stack list rows are Record, not the entity type (tsc-clean) ([21857f8](https://github.com/ziffr/kiln/commit/21857f896042590bddc5fe871c91814d29947a4d))
* **codegen:** generated README states git status honestly (browser zip ≠ git repo) ([2d52582](https://github.com/ziffr/kiln/commit/2d525827adc4b36dd4fcfd6921aa63ef54f2b3d4))
* **codegen:** n8n workflows need id/active/settings to import (Probe 2 live finding) ([120fe4b](https://github.com/ziffr/kiln/commit/120fe4b0df21057c8e5197dbf0f95d27d4975743))
* **codegen:** Odoo automations use the 16+ two-record form (Probe 2 live finding) ([306a98b](https://github.com/ziffr/kiln/commit/306a98bdbe75d09e20b03aa5aacf925b35740904))
* **codegen:** Odoo manifest must depend on base_automation when it emits automations ([b31ba1d](https://github.com/ziffr/kiln/commit/b31ba1d3ae3fa3630563b62f90b670541e5844fd))
* **deploy:** commit bundled api functions; maxDuration via export const config ([c9b29c5](https://github.com/ziffr/kiln/commit/c9b29c5fb75d4a3429cf1aaa5fb662e4b0855bfd))
* **deploy:** consolidate 25 API functions into one catch-all router ([d0dabc5](https://github.com/ziffr/kiln/commit/d0dabc5fedcafc6929bcd3f0dfd21e2bb70a9aa8))
* **deploy:** drop invalid vercel.json function runtime (Node auto-detected for .ts) ([83856ab](https://github.com/ziffr/kiln/commit/83856abc70bcd2cc94a31490de17a58bf8bbbe65))
* **deploy:** pre-bundle serverless functions with esbuild (fix ERR_MODULE_NOT_FOUND) ([d0ad997](https://github.com/ziffr/kiln/commit/d0ad99799e2e08f6e1c341704105081196e96fd1))
* **deploy:** restore committed apps/web/api bundles (Vercel needs them) + launch nits ([28aaa16](https://github.com/ziffr/kiln/commit/28aaa165bc92237e15d7cf8547f7012868bbfd37))
* **docs:** serve the docs site from the custom domain root (docs.kilnstudio.app) ([66ffa0d](https://github.com/ziffr/kiln/commit/66ffa0d5c6f8e939366331e7b7827dfa89545241))
* **engine:** gateway timeout + clear invalid-model errors + honest Adaptive toggle ([809d919](https://github.com/ziffr/kiln/commit/809d919b31fb07a6419626565013247bca3bd8e3))
* **kiln.sh:** dev no longer orphans the node server; add stop + engine-aware doctor ([8792f94](https://github.com/ziffr/kiln/commit/8792f94951ef8621e87cf57cc347884b99297aab))
* **repo:** commit .env.example templates — .gitignore .env.* shadowed them ([6b40551](https://github.com/ziffr/kiln/commit/6b40551bdecc973281f16b7293ab65e0073726e5))
* **service:** Langdock provider degrades gracefully when output_config isn't forwarded ([45de9ce](https://github.com/ziffr/kiln/commit/45de9ce6ba42fc1842768997e1671c85a9520456))
* **studio:** Automations findings now hover-highlight — policies glow their wire + boxes ([3dd2a89](https://github.com/ziffr/kiln/commit/3dd2a895d6c39349ce90e8f7484be2bc5aad863e))
* **studio:** Business Areas — on-brand palette + wrap into rows (no horizontal scroll) ([fe34db8](https://github.com/ziffr/kiln/commit/fe34db8803d2c019b545af3d574028e42f2de745))
* **studio:** Code screen toolbar was off-screen — regroup into Check | Export clusters ([af6321e](https://github.com/ziffr/kiln/commit/af6321e3a0caa731c72e4e6067eef205d8045c51))
* **studio:** consistent primary accent + purge light-mode leaks (items 1 & 4) ([f6e3150](https://github.com/ziffr/kiln/commit/f6e3150db6486231fa42a72133b25e9187cb627b))
* **studio:** Entities ER auto-zoom — readable nodes, top-anchored, pan for tall graphs ([6be0ba4](https://github.com/ziffr/kiln/commit/6be0ba4e1a84b807a221bff8055124dd969b6b90))
* **studio:** findings badge reads as a warning + one Project cluster in the sidebar ([cf60b1d](https://github.com/ziffr/kiln/commit/cf60b1dbc0310bea2511f9b0a5b160ef0b6cad6d))
* **studio:** findings were off-screen — move them to a collapsible panel at the top of each stage ([e405d93](https://github.com/ziffr/kiln/commit/e405d933c99c47dc1f49f0f7bcbbd5f578573477))
* **studio:** sidebar footer shows real storage mode, not a placeholder ([6176cb4](https://github.com/ziffr/kiln/commit/6176cb4f72b5d4dcb482a7ff3fd637ee93fa7e88))
* **studio:** stage-screen debt sweep — on-brand diagram colors, icons, rotated role matrix ([125a794](https://github.com/ziffr/kiln/commit/125a794f571610143af29566e218a84584553cc4))
* **studio:** tall list stages no longer overflow into the findings list ([5c913b1](https://github.com/ziffr/kiln/commit/5c913b116382da457a6e2403aa99f5227eee6cbf))
* **web:** area tint via inset box-shadow (drop border shorthand/longhand mix) ([4746e03](https://github.com/ziffr/kiln/commit/4746e036f64bf6e286a6a2f0c46b948a382b76ff))
* **web:** capability nodes grow to fit long labels ([ccdecd6](https://github.com/ziffr/kiln/commit/ccdecd6712eead45f160ff148a62b33acfa9d31f))
* **web:** clear implementation debt — reconcile-not-clear + collapsible entities ([a96b3d9](https://github.com/ziffr/kiln/commit/a96b3d96fb987c61a50d6c2a0997f87c0e084d6d))
* **web:** coerce stale engine model + surface how to add engines ([d4a1065](https://github.com/ziffr/kiln/commit/d4a1065f78038bfc6b680ee408cfd048334e7ebf))
* **web:** hide the extracted-sections preview until there's a real narrative ([f0fdf40](https://github.com/ziffr/kiln/commit/f0fdf4047eedfb449fe45a944e591c9df9cf8e0b))
* **web:** stop public-demo banner from breaking the shell layout ([ac4ac8d](https://github.com/ziffr/kiln/commit/ac4ac8dea6c2c34103310f774efd497b26f69dc3))
* **web:** treat an untouched narrative template as empty on the home screen ([b5c122e](https://github.com/ziffr/kiln/commit/b5c122e7bf4b25e86cda0dce644e1e00eec6cbc5))
* **web:** use the package icon for Versions (refresh read as "reload") ([b88e80c](https://github.com/ziffr/kiln/commit/b88e80c06137bbaf23909413fe2ca1bae7790aa2))


### Refactors

* **brand:** complete rename VBD → Kiln (packages, CLI, env, IDs, storage) ([3de5fea](https://github.com/ziffr/kiln/commit/3de5fea76ae849c77ff41b1aef4b936f19df737d))
* **brand:** rename product to Kiln ("the business compiler") ([e4dbc4e](https://github.com/ziffr/kiln/commit/e4dbc4ecfd23e14f29e69fdbb4271cf402665f89))
* **codegen:** extract full-stack assembly into pure assembleFullStack() ([7f19cbe](https://github.com/ziffr/kiln/commit/7f19cbefe96ef9375f5f8e1caf4dd82a4109c689))
* **skills:** externalize system prompts to editable markdown ([68d7dc2](https://github.com/ziffr/kiln/commit/68d7dc2ff07333a61a97fbf5e47cd464938e6f84))
* **studio:** declutter the stage action bar — 5 buttons → 3, grouped by intent ([8df1e1a](https://github.com/ziffr/kiln/commit/8df1e1af79fb066a7c046f670134bfb7900ac35a))
* **studio:** left-sidebar cleanup — light selection, less redundancy (+ item 3 note) ([8e828c2](https://github.com/ziffr/kiln/commit/8e828c2dcf88cd22879e7c0a4d3299479379a3f5))


### Documentation

* add a versioned documentation site (Docusaurus → GitHub Pages) ([1404058](https://github.com/ziffr/kiln/commit/14040580b1fefab3d3c7e1f25975eb3997a17dad))
* add DEVELOPER.md — architecture orientation + where-to-attack guide ([f372443](https://github.com/ziffr/kiln/commit/f372443ebf9bd26273cedfde92f1fa35df8139e7))
* add ROADMAP.md — directional roadmap linked from README ([8b98b6b](https://github.com/ziffr/kiln/commit/8b98b6bfc4c766f0fcca18a18468b509f20111dc))
* add VISION.md (vision + positioning) and link from README ([067cd14](https://github.com/ziffr/kiln/commit/067cd1436b7976dc4f1e3ade0fc76fdac954f698))
* be openly "built & maintained by Claude" — README section + badge + social card ([6f18887](https://github.com/ziffr/kiln/commit/6f1888713899a316185278c9c1a62b7a9d76b830))
* **brand:** product name → "Kiln Studio" (engine stays Kiln / [@kiln](https://github.com/kiln)) ([c254fc2](https://github.com/ziffr/kiln/commit/c254fc2d4c6dba4ae4161743e1a11be686b4f3b3))
* **CLAUDE:** note the versioned docs-site rule (mirror into versioned_docs) ([8d74e95](https://github.com/ziffr/kiln/commit/8d74e95f8aff62ea4cce3d9a6ed307b10896a89f))
* **CLAUDE:** refresh status — SPEC-002 aggregates-first complete, 75 tests ([c4c8dd8](https://github.com/ziffr/kiln/commit/c4c8dd859ee66aef32ded71148dab594f85de216))
* **CLAUDE:** status — SPEC-002/003 Approved, SPEC-004 shelved, RES-001 codegen probe done ([bae2241](https://github.com/ziffr/kiln/commit/bae224195217f62a1f5c5a1bb5ba2232fa389630))
* **CLAUDE:** status — SPEC-005 shelved, consolidation done, ready to ship to partner ([cb9bdd1](https://github.com/ziffr/kiln/commit/cb9bdd1eb27ec2826ad9bb1f740d1306ec8e46b6))
* **env:** document KILN_STUDIO_TOKEN + VITE_PUBLIC_DEMO in root .env.example ([37bd3db](https://github.com/ziffr/kiln/commit/37bd3db2d1cb3374795368f6702b08b6fc923a4b))
* explain how contributors add to the docs site (via PR) ([e4fbb32](https://github.com/ziffr/kiln/commit/e4fbb32401dd78f864ee330106c32a66d8fa1857))
* land PR-template docs checkbox (missed earlier via macOS case-folding) ([e251948](https://github.com/ziffr/kiln/commit/e251948ee0119fc0efb13251e060cd648bca4ec8))
* mirror engine + Run-app pages into the served 0.1.0 version ([b1fbf2c](https://github.com/ziffr/kiln/commit/b1fbf2cea8e8d61aeb04f82cd43e5272c16b5ba8))
* note the wizard next-step cue + per-stage guidance in getting-started ([0445c64](https://github.com/ziffr/kiln/commit/0445c64f5c88a95246e5f4f1fec612acd793296f))
* **oss:** Apache-2.0 license + governance, CI, and contributor onboarding ([6c539a3](https://github.com/ziffr/kiln/commit/6c539a31cb8698357231a467c27f15b70bbff83b))
* README hero — demo GIF, live link, examples gallery + social card ([4fd8472](https://github.com/ziffr/kiln/commit/4fd84728011ca2ee0738e24dea9be6b5165cd750))
* **readme:** non-technical "what is Kiln", the name story, a get-started guide, and docs map ([c333d99](https://github.com/ziffr/kiln/commit/c333d995062c62e5545ca0bfc25ae75451c7c93e))
* refresh README status (full stack built; 268+ tests) ([d3f352d](https://github.com/ziffr/kiln/commit/d3f352d32448f78b24a406f2cb700e79554e49c6))
* **release:** cut docs-site 0.2.0 snapshot + refresh CLAUDE status ([8309722](https://github.com/ziffr/kiln/commit/83097226186f0b8ea191f3a0d1ae96cf92302179))
* **RES-002:** the generated shadcn UI ran live — structure/skin split proven ([c387cac](https://github.com/ziffr/kiln/commit/c387cacc6bbf5d9ac5f5c6a3ffd59f984e707bd6))
* **research:** RES-003 — agent/workflow-runtime provider landscape (web-researched) ([00f384f](https://github.com/ziffr/kiln/commit/00f384fb76ac94572fb6504342803dfb11314bc0))
* **roadmap:** link ROADMAP.md to the Discussions voting category ([bb6fada](https://github.com/ziffr/kiln/commit/bb6fadaa9d0f5f9b5a15fcef885d78fe2ac7022a))
* SPEC-002 + SPEC-003 → Approved (design partner cleared A1/A6) ([9e64d0c](https://github.com/ziffr/kiln/commit/9e64d0c8ff73ea39f4bcdb18cf5ffae9342a2f73))
* **SPEC-002:** record DM eval exit gate + go/no-go (§13, v0.3.0) ([774ab0f](https://github.com/ziffr/kiln/commit/774ab0fcd683b0cbd5b9b3bd79af4117e3598c2a))
* **SPEC-003:** BC-M5 exit gate + go/no-go (§14, v0.3.0); SPEC-002 A4 met ([9c759b3](https://github.com/ziffr/kiln/commit/9c759b37fea8bfbbe6a31d16ec892f6b3232d160))
* **SPEC-003:** draft Bounded Contexts authored-layer spec ([70779bb](https://github.com/ziffr/kiln/commit/70779bb333881fcb06752d47aec7690602500a61))
* **SPEC-003:** revise to closure after 5-lens review (v0.2.0, Revised) ([073044d](https://github.com/ziffr/kiln/commit/073044d777c0955a98fb5c338c52e3df15b2cc13))
* **SPEC-004:** Approved — design partner signed off behaviour (A6) ([25dd989](https://github.com/ziffr/kiln/commit/25dd989fe174d19cc08ace0a337ad9020ec9c4a9))
* **SPEC-004:** CE-M5 exit gate + go/no-go (§14, v0.3.0) — built & green ([6f89488](https://github.com/ziffr/kiln/commit/6f89488f06424827c72fbd05170d1cbb45971e05))
* **SPEC-004:** draft Commands & Events behaviour-layer spec ([e063ea1](https://github.com/ziffr/kiln/commit/e063ea132bd9d1f0b5a294ab296deac6280a39ff))
* **SPEC-004:** revise to closure (v0.2.0); build deferred → codegen probe first ([a783909](https://github.com/ziffr/kiln/commit/a783909946cf073664debc2960e1063022a901a5))
* **SPEC-005:** Approved — policies built & verified (§14); refresh Vercel functions ([a2b22d7](https://github.com/ziffr/kiln/commit/a2b22d78595d829b903fccd2b44326b81db5c02e))
* **SPEC-005:** draft Policies & Reactions — cross-entity workflow rules ([3d258bc](https://github.com/ziffr/kiln/commit/3d258bc7f89fa965e73449593ec8d39d7e1dd513))
* **SPEC-005:** revise to closure (v0.2.0); build deferred → consolidate & ship first ([50d7a97](https://github.com/ziffr/kiln/commit/50d7a97e6aaefa79ec0c193a346eca342c19d881))
* **SPEC-006:** roles/permissions layer — Approved (built & verified) ([c9ffc5b](https://github.com/ziffr/kiln/commit/c9ffc5b1ee7b776f13ff0947afb0dd297de67283))
* **spec:** SPEC-010 — engine plugin seam (adapter contract + registry) ([bee0119](https://github.com/ziffr/kiln/commit/bee011906d8adae12ff6ddcd5841610b63485ef5))
* **spec:** SPEC-011 — Versioned Workspaces (git-backed history + semantic diff) ([ced8b69](https://github.com/ziffr/kiln/commit/ced8b692965c2d50408455d4aac5b61632a11205))
* status — complete versionable model.json store (recall + iterate) ([8f77bc7](https://github.com/ziffr/kiln/commit/8f77bc7fa35e12e2c3b5cda0805dc8ed9727e3f0))
* status — enrichment rolled out to capabilities/roles/agents ([6b88836](https://github.com/ziffr/kiln/commit/6b8883608bbf7c160a67991a3b8dd12f1e15a447))
* status — enrichment system (accept/decline review + web research + auto) ([6cf2b04](https://github.com/ziffr/kiln/commit/6cf2b04a3eefe8eaadcd1ffffd2b7c93cfefd07f))
* status — env/config accuracy, remote-ready connections, Vercel auto-deploy scaffold ([eaa8c9c](https://github.com/ziffr/kiln/commit/eaa8c9ce4132661f74fda6403480c94cd43975b2))
* status — Excel, external-services delegation, 3-way orchestration ([0196eb9](https://github.com/ziffr/kiln/commit/0196eb970d9cc7791dca0bf4a57bc278ef71a225))
* status — generated-app in-app help system ([5ce6431](https://github.com/ziffr/kiln/commit/5ce6431647af37c041e7999da949e5cc52155931))
* status — generated-app light/dark toggle + i18n with LLM auto-translation ([63fd95d](https://github.com/ziffr/kiln/commit/63fd95d6c663b0799e2d6a00059b8def396d65c9))
* status — generated-repo hardening (git history + Docker) + VBD api/ hygiene ([5d47fcb](https://github.com/ziffr/kiln/commit/5d47fcb923a1689a5251925c93de900f0978bbb5))
* status — hosted /api works (functions consolidated to one router) ([b9fa03c](https://github.com/ziffr/kiln/commit/b9fa03c04a1bdbaf1e6f1a824ff40d74dd65b142))
* status — ingest raw text/transcript → structured narrative ([92ad072](https://github.com/ziffr/kiln/commit/92ad072434ed105f619466b9c048c04903e9ff61))
* status — Kiln launch-staged (private), deployed, review clean ([309dc6a](https://github.com/ziffr/kiln/commit/309dc6aa937aa19c2969ea0a408c4d0787c7db53))
* status — per-step delegation (composable process- and step-level routing) ([7a82d33](https://github.com/ziffr/kiln/commit/7a82d3357d96986353e0c904efa29ab5e647d373))
* status — Postgres model-diff migration generator (incremental live-db updates) ([c14f77a](https://github.com/ziffr/kiln/commit/c14f77a9b878b580e6459891bef0cb4d33e7be27))
* status — release automation + launch assets done ([860da10](https://github.com/ziffr/kiln/commit/860da10c970dec4b9bca6de3d40a0be149628d16))
* status — sidebar-16 skin (generated app shell + VBD full shell swap) ([e26b385](https://github.com/ziffr/kiln/commit/e26b3851d4c130399d58f7048e7f2ccfeb2d6733))
* status — SPEC-009 orchestration router + triggers + agent HTTP mode ([1c6f71f](https://github.com/ziffr/kiln/commit/1c6f71f1b4b8521b857454336dc5989e9220d7bd))
* status — spine API auth + input validation (deploy-hardening gaps closed) ([3439e33](https://github.com/ziffr/kiln/commit/3439e33039ba519d037b8e8b9e33724f409b25fa))
* status — SQLite store engine (single-container) + dialect-aware migrations ([0dfec7a](https://github.com/ziffr/kiln/commit/0dfec7af4d26d5c5bb8532f5f0281a1fb07500d3))
* **studio:** rewrite the in-app Guide to match the current UI + lead with methodology ([8a89fa6](https://github.com/ziffr/kiln/commit/8a89fa6a0ea18c554a96b2d793cf11cbde304082))
* Vercel deploy guide (import steps, env var, runtime map) ([ede0002](https://github.com/ziffr/kiln/commit/ede0002ca45c4595740bcbc5b98ef719015fe7cf))
* view-code.md Polish-UI section (+ versioned_docs mirror). ([989de96](https://github.com/ziffr/kiln/commit/989de967a5207cc6874eee16128585e33584ced8))


### Reverts

* **deploy:** re-gitignore apps/web/api — 25 functions exceed the Vercel cap ([230bc6f](https://github.com/ziffr/kiln/commit/230bc6f9eaf513994b739a9b16a9676aff56d487))

## [Unreleased]

## [0.2.0] - 2026-07-14

A large capability release: multiple selectable AI engines, a local "Run app" loop, AI passes that
improve the generated app, and — new in this release — a clearer View-code action bar, adaptive
per-stage model defaults, and full engine parity in the exported app.

### Added

- **Selectable AI engines (Anthropic-first, plus OpenAI-compatible gateways).** Anthropic stays the
  default and preferred engine; **OpenRouter** and self-hosted **omniroute** are selectable in
  Settings → Engine, wired through one dependency-free adapter and available on the hosted API too.
- **Per-stage provider / model / effort.** Any modeling stage can run on a different engine, model,
  and effort than the global default.
- **Adaptive Anthropic model defaults (on by default).** With no per-stage override, each stage picks
  a model and effort by tier — heavy reasoning (capabilities, business areas, automations) → Opus·high,
  standard → Sonnet, light (entities, roles, agents) → Haiku. Overrides always win; gateways use the
  flat default. A one-time migration re-enables it on projects that had it turned off in the old UI.
- **Engine parity in the exported app.** The generated agent runtime runs on the same engines —
  Anthropic, OpenRouter, omniroute, or any OpenAI-compatible endpoint (LiteLLM/vLLM/Ollama/Azure) — via
  one `PROVIDER` switch. The export is **pre-pointed at the engine you built on**: its `.env.example`
  leads with that provider and model, so an app built on a gateway doesn't ship Anthropic-first.
- **Local "Run app".** Boot the generated zero-dependency app on your machine from the View-code stage
  and use it in a new tab — closing the loop describe → adjust → run → export.
- **AI passes over the generated app.** Code review + auto-fix, sandbox verify + auto-fix, **Polish
  layout** (rules-based screen design) and **Visual review** (screenshot → vision critique) — each
  reviewed before it applies.
- **Runnable full-stack export.** The shadcn UI fetches real data from the spine and drives its
  actions, with sortable tables, detail sheets, tabs, and a KPI chart; SQLite spine auto-creates its
  schema on boot.
- **Versioned documentation site** (Docusaurus → GitHub Pages) and a responsive, off-canvas mobile
  sidebar.

### Changed

- **View-code action bar redesigned** into three self-explaining controls — an **Improve with AI**
  menu, **Run app**, and an **Export** menu — each item describing what it does, replacing a crowded
  flat toolbar. Per-stage Settings gained hover tooltips explaining each stage.

## [0.1.0] - 2026-07-13

First public release.

### Added

- **LLM-guided business modeling across the full methodology stack.** Describe a vertical business
  in structured text; an LLM derives a formal model — narrative, capabilities, business areas,
  entities with typed attributes, commands and events, policies, roles, workflows, and agents —
  which deterministic validators check and a human reviews and edits. Text is the source of truth;
  the Capability Map is a projection of it.
- **Deterministic multi-backend codegen.** The reviewed model is projected — with no LLM in the
  loop — into a complete, runnable system: a data store (Postgres or embedded SQLite), a command
  API (spine), workflow orchestration (n8n), an ERP option (Odoo), a shadcn-styled UI, and agent
  runtimes.
- **Full-stack export from both the CLI and the web app.** Generate a whole system from a single
  model, with model-diff migrations for growing a live database incrementally.
- **Docker-ready generated repositories.** Each export ships with docker-compose and a Makefile so a
  generated system builds and runs as a stack out of the box.

[Unreleased]: https://github.com/ziffr/kiln/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ziffr/kiln/releases/tag/v0.1.0
