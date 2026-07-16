---
id: SPEC-012
title: Deployment Placement — where each engine runs, as a first-class binding dimension
type: spec
status: Approved
version: 1.1.0
author: Claude (Opus 4.8)
created: 2026-07-15
updated: 2026-07-15
supersedes: null
related: [SPEC-010, RES-002, ADR-002]
reviewers: [technical-architecture, product-strategy, delivery-execution, security-data, extensibility-dx]
---

# SPEC-012 — Deployment Placement

## 1. Problem

Kiln's binding answers **which engine** hosts each of a model's technical capabilities
(`store` → Postgres, `sequence` → n8n, `serve-ui` → shadcn, …). It does **not** answer **where that
engine runs**. A `store` bound to `postgres` could be a local Docker container, a self-hosted remote
box, or a managed service (Neon/Supabase/RDS) — and today that distinction lives *only* in generated
env (`DATABASE_URL`, `N8N_BASE_URL`) and prose (`DEPLOY.md`). It is **documentation, not a modeled,
validated, projectable choice.**

This is the single largest gap between what Kiln is *about* — "each constituent (agents, code,
workflows, db) can run internally/locally or externally/remote, in any combination" — and what the
model can actually express. Of the four constituents, **"where it deploys" is the least-realized**:
there is no bound choice, no validator, no per-target artifact, and no way for a contributor to add a
deploy target the way [SPEC-010](SPEC-010-engine-plugin-seam.md) lets them add an *engine*.

The pattern to generalize already exists in miniature: `Binding.agentRuntime` (`node` = the generated
local runtime vs `langdock` = a remote managed workspace) is a **placement** choice for exactly one
constituent. This spec lifts that idea to a general axis over every engine.

**Scope honesty (who Phase 2a is for).** Phase 2a delivers a *model + exporter* capability, not an
end-user one. Placement is authored under `binding.hosting` in `model.json` — there is **no in-app
editor** (that is Phase 2b). So the beneficiary of Phase 2a is the **consumer of the exported repo**
(a developer or self-hoster wiring the generated system to real infrastructure), not Kiln's
non-technical business-owner user. The value claim below should be read on that basis: it makes "where
each part runs" an expressible, validated, projectable property of the model — the necessary substrate
the eventual UI edits — not a button the business owner clicks today.

## 2. Goals / Non-goals

**Goals**
- **Placement as a first-class, authored binding dimension**, *orthogonal* to the tech-capability
  taxonomy. "Where" is a property of an *engine instance*, never a 7th `TechCapability`.
- A **deploy-target seam** — a `DeployTarget` contract + registry mirroring SPEC-010's engine
  registry, so a new target (Vercel, Fly, a managed-Postgres provider, …) is added by *registering*
  it, not by editing core projection.
- **Placement parameterizes the seams and the plumbing**: a `managed` engine drops out of the
  generated `docker-compose.yml` and its cross-engine seam URLs point at an env-referenced remote host
  instead of `localhost`.
- **Placement round-trips** like every authored layer (invariant #2) — it lives in `model.json` under
  `binding.hosting`, is human-editable, and re-projects deterministically.
- **Byte-identical safety net**: when no `hosting` is authored, every engine defaults to `local` and
  the generated output is **byte-identical to today's** (the same regression guarantee SPEC-010 used).

**Non-goals**
- **Not** live provisioning. This spec generates *deployment descriptors and wiring* (compose pruning,
  `vercel.json`, `fly.toml`, env manifests, `PLACEMENT.md`), NOT API calls that create infrastructure.
  No secrets, no credentials, no network calls — consistent with the pure/isomorphic rule (invariant
  #4) so the browser export keeps working.
- **Not** a secrets manager. Managed engines get an **env variable name** to point at (e.g.
  `DATABASE_URL`); the value is the operator's to set. `HostingSpec.url` is a **non-secret reachability
  hint (scheme + host only)** — a URL carrying embedded credentials (`//user:pass@…`) is an **error**
  (validator **PB5**) and is **redacted** out of every generated/persisted artifact (`.env.example`,
  `PLACEMENT.md`, `deployment.json`, and the `model.json`/`_run.json` binding echo). The reach var is
  emitted only as a **commented placeholder** — a value is never baked into a committed file.
- **Not** replica/scaling/region topology. One placement per engine instance; horizontal scale,
  regions, and blue-green are out of scope.
- **Not** a change to the tech-capability taxonomy, the fidelity matrix, or the TB1–TB5 binding
  validators — placement is additive and sits beside them.

## 3. Current shape (for reference)

```ts
// packages/codegen/src/targets.ts
export interface Binding {
  defaults: Partial<Record<TechCapability, string>>;   // which engine per capability
  byArea?: Record<string, Partial<Record<TechCapability, string>>>;
  agentRuntime?: string;   // node | langdock — the ONLY placement-shaped axis today, agents-only
  agent?: { provider?: string; model?: string; baseUrl?: string };
}
```

Deployment is emitted as `DEPLOY.md` prose + a `docker-compose.yml` that always assumes every backend
runs locally in a container. `.env.example` carries commented hints ("point `DATABASE_URL` at a
managed Postgres") but nothing in the model *drives* that — it is hand-editing after the fact.

## 4. Design

### 4.1 The placement axis

```ts
/** WHERE an engine instance runs. Orthogonal to WHICH capability it provides. */
export type HostingMode = "local" | "selfhost" | "managed";

export interface HostingSpec {
  /** local = a container we generate + run via docker-compose; selfhost = a remote box the operator
   *  runs the same image on; managed = a third-party/SaaS instance we only point at. Default: "local". */
  mode: HostingMode;
  /** the DeployTarget that hosts it (e.g. "vercel", "fly", "neon"). Optional for local/selfhost. */
  target?: string;
  /** the env var the rest of the system reads to reach this engine when it is remote
   *  (e.g. "DATABASE_URL", "N8N_BASE_URL"). Required for managed; defaulted per engine otherwise. */
  urlEnv?: string;
  /** a literal reachable URL, when known at authoring time (documented in PLACEMENT.md, never a secret). */
  url?: string;
}

export interface Binding {
  // …existing fields unchanged…
  /** WHERE each engine runs, keyed by engine id. Unspecified engine → { mode: "local" }.
   *  Generalizes `agentRuntime` (which stays, as the agents-runtime shorthand). */
  hosting?: Record<string, HostingSpec>;
}
```

`resolvePlacement(binding, engineId) → HostingSpec` returns the authored spec or the default
`{ mode: "local" }`, filling `urlEnv` from the engine's own declaration (see §4.2) then a per-engine
default table (`postgres → DATABASE_URL`, `n8n → N8N_BASE_URL`, `node → SPINE_URL`, …). It also
**reconciles the legacy `agentRuntime` shorthand**: a non-`node` agent runtime (e.g. `langdock`) with no
explicit `hosting` entry resolves as a **managed** placement of that runtime engine — so `agentRuntime`
and `hosting` give **one** answer, and agents (a named constituent) are not a parallel, un-unified
channel. This is the single lookup every projector and validator uses.

### 4.2 The deploy-target seam (registry, mirroring SPEC-010)

```ts
// packages/codegen/src/deploy/registry.ts
export interface DeployContext {
  engineId: string;
  engineName: string;
  hosting: HostingSpec;
  dialect: "postgres" | "sqlite";
  domainSlug: string;          // for naming (app slug)
}
export interface DeployOutput {
  /** files this target contributes (target owns its path prefix), e.g. { "ui/vercel.json": "…" }. */
  files?: Record<string, string>;
  /** env vars to add to the generated .env.example (name → commented default line). */
  env?: Record<string, string>;
  /** compose services this engine no longer needs locally (managed engines prune themselves out). */
  prunesComposeService?: string[];
  /** a one-line PLACEMENT.md row describing where this engine runs + how to reach it. */
  note?: string;
}
export interface DeployTarget {
  id: string;
  name: string;
  /** the engine kinds this target can host (by tech-capability family or engine id). */
  hosts: (ctx: DeployContext) => boolean;
  /** the hosting modes this target supports. */
  modes: HostingMode[];
  generate(ctx: DeployContext): DeployOutput;
}
export function registerDeployTarget(t: DeployTarget): void;
export function getDeployTarget(id: string): DeployTarget | undefined;
export function registeredDeployTargets(): DeployTarget[];   // sorted by id → deterministic
```

Built-in targets (Phase 2a): `docker` (the local/selfhost container path — wraps today's compose
service), `managed` (a **generic** "point an env var at a remote instance" target that hosts **any**
engine in `managed` mode), `vercel` (the UI static host), `fly` (the spine — emits `fly.toml`).

**Granularity rule (why four, why this shape).** A target is **provider-specific** only where the
platform needs a *committed config file* (`fly` emits `spine/fly.toml`); otherwise a remote engine needs
nothing but an env var to be reached, which the **generic `managed`** target covers for everything. So
the set is principled, not sampled: `managed` is the default remote path for any engine; `fly`/`vercel`
exist because the spine/UI want a richer, platform-specific descriptor. `docker` + `managed` alone cover
~90% of the value (env-var reachability); the provider targets are additive.

**Cross-seam composition with SPEC-010 (the key property).** A **third-party engine** (added via the
engine registry) is placeable with **no core edit**: the `Engine` descriptor carries optional `urlEnv`
and `composeService` fields, and `resolvePlacement`/`projectPlacement` consult the engine registry first
(then the built-in default tables). Because `managed.hosts` is `mode === "managed"` (not an allowlist), a
novel `mysql`/`clickhouse` store bound `managed` gets its reach var emitted, its compose service pruned,
and a `PLACEMENT.md` row — end to end, no dispatch edit. (What is **not** in Phase 2a: generating a novel
engine's *local* compose service — the six built-ins own their compose blocks; a third-party engine's
`local` service generation is Phase 2b. Its `managed`/`selfhost` remote placement works today.)

Adding a target = one file + one `registerDeployTarget(...)` line. No edits to core projection. A target
returns **structured** data (`files`, `env`, `prunesComposeService`, and a plain-text `reach` cell) — it
never formats markdown; the projector renders the `PLACEMENT.md` table. Same isomorphism CI check as
`engines/` (`deploy/` is in the invariant test's scanned pure dirs — no `node:*`).

### 4.3 What placement repoints in Phase 2a (and what waits for 2b)

Placement repoints the addresses it **owns in the generated plumbing**: the docker-compose
`environment` block (a managed store's `DATABASE_URL`, a managed n8n's `N8N_BASE_URL` become the remote
`${VAR}` reference instead of the in-cluster host) and the `.env.example` reach vars. That is the §4.4
compose+env projection, and it is what Phase 2a delivers.

**Seam-URL auto-wiring — Phase 2a descoped it; Phase 2b now wires the main seam.** The primary
cross-engine seam is n8n → the spine's command API. As of Phase 2b the n8n engine adapter reads the
spine's placement (`resolvePlacement(binding, "node")`) and, when the spine is remote, points its HTTP
nodes at the spine's reach var via an n8n env expression (`={{$env.SPINE_URL}}/api`) instead of the
`http://spine.local/api` placeholder. The other seam — the spine → its store — was already env-driven
(the spine reads `DATABASE_URL` from env, which the compose/`.env` repointing already sets), so it needs
no adapter change. When the spine is local, the base URL is unchanged → byte-identical. The **layer
workflows that also call the spine/agents** — triggers, integrations, and external-services — get the
same treatment (their `spineUrl`/`agentUrl` params are threaded from placement in `projectTargets`); a
remote agent runtime points those nodes at `={{$env.AGENT_URL}}`. (Comms is exempt — its notify
workflows are *triggered by* spine events, they don't call the spine.) All seam URLs are now
placement-aware.

### 4.4 What projection emits (placement-driven)

- **`.env.example`** — a managed engine's base reach var (e.g. `DATABASE_URL`) switches from the
  uncommented local value to a **commented placeholder** the operator fills at deploy time (never a baked
  value/credential); a var name is emitted **once** (no duplicate/conflicting line). Third-party reach
  vars the base doesn't own are appended.
- **`docker-compose.yml`** — engines whose `mode === "managed"` are **pruned** from the compose file
  (you don't run RDS in a container); the depending services get their `environment` URL pointed at the
  managed `urlEnv`. `selfhost`/`local` keep their service.
- **`PLACEMENT.md`** — a generated table: engine → mode → target → how to reach it. The honest
  companion to `DEPLOY.md`. When a **store** is managed/remote, it carries a standing **security
  warning** that generated Postgres RLS is `USING (true)` (no tenant scoping — a known gap), so pruning
  the local DB in favour of a real managed database does not silently widen exposure without a caution.
- **`deployment.json`** — a machine-readable placement manifest (engine → resolved `HostingSpec`), for
  a downstream coding agent / IaC step to consume. Also folded into `_run.json`.
- **Per-target config** — `ui/vercel.json`, `fly.toml`, etc., emitted only for engines placed on that
  target.

### 4.5 Validators (additive: PB-series, beside TB1–TB5)

- **PB1** — a `managed` engine with neither `url` nor a resolvable `urlEnv` is an error (nothing can
  reach it).
- **PB2** — an engine placed on a `target` whose `hosts(ctx)` is false, or whose `modes` excludes the
  chosen mode, is an error (e.g. UI on `fly`-as-declared-store-only, or a `managed`-only target asked
  to run `local`).
- **PB2** — also fires when a **bare** (no explicit `target`) non-local engine resolves to the generic
  fallback target that cannot host it or its mode — so a mis-placed engine is a hard error, never a
  silent local export.
- **PB3** — an unknown `target` id → error (mirrors TB1 for engines).
- **PB4** — a `couplesStore` engine (Odoo) whose store is `managed` while its `operate` sibling is
  `local` (or vice-versa) → warn: a platform that owns its slice should be placed as a unit. (Kept
  specific to the odoo/postgres pair in Phase 2a; generalizing over all `couplesStore` engines is 2b.)
- **PB5** — a `hosting.url` carrying embedded credentials (`//user:pass@…`) → error: the reach is meant
  to be a scheme+host hint; the secret belongs in `.env` at deploy time. Credentials are also redacted
  from every artifact defensively, so a mis-author never leaks even if PB5 is ignored.

### 4.6 Contributor workflow (the payoff)

To add, say, a **Railway** target for the spine, a contributor writes one file
`packages/codegen/src/deploy/railway.ts` with a `DeployTarget` (`hosts` = spine/store, `modes` =
`["managed"]`, `generate` emits a `railway.json` + the reach env + a `reach` cell), adds one
`registerDeployTarget(...)` line to `deploy/index.ts`, and a test. Placement resolution, validation, the
compose/env projection, the CLI export, and the web full-stack export all pick it up. **No edits to
`projectTargets`, `assembleFullStack`, or the app.** (Demand note: the registry is justified by the
concrete need to place the spine/UI on real platforms *now*; if only `docker`+`managed` were ever needed
the registry would be over-engineering — the two provider targets are the evidence it earns its keep.)

## 5. Migration plan (staged, byte-identical when unset)

- **Phase 2a (this spec's implementation):** the `hosting` axis + `resolvePlacement` (incl. the
  `agentRuntime` reconciliation); the `DeployTarget` contract + registry with the four built-ins
  (`docker`, `managed`, `vercel`, `fly`); placement-driven `.env.example` (deduped, credential-free),
  compose pruning + `environment` repointing, `PLACEMENT.md` (+ RLS warning), `deployment.json`; the
  PB1–PB5 validators; cross-seam support for third-party engines (registry-declared `urlEnv`/
  `composeService`); round-trip through `model.json`. **Explicitly NOT in 2a:** seam-URL auto-wiring
  (§4.3) and local compose-service generation for novel engines. **Acceptance: with no `hosting`
  authored, the export is byte-identical to the pre-change baseline for BOTH dialects (guarded by a
  committed compose snapshot test); a `managed` Postgres prunes the `postgres` service and comments
  `DATABASE_URL`; an e2e test drives a managed-pg + fly-spine + vercel-ui binding through
  `assembleFullStack`; `deploy/` is in the isomorphism scan; tests + web build green.**
- **Phase 2b (mostly shipped 2026-07-15):** ✅ an **in-app placement editor** (a "Deployment placement"
  section in Settings — per-engine mode/target/reach var, live PB1–PB5 findings, round-trips via the
  project's `binding`); ✅ **seam-URL auto-wiring** for the n8n → spine seam; ✅ **local compose-service
  generation for third-party engines** (an `Engine` may declare `dockerService`/`dockerVolume`); ✅ **PB4
  generalized** over any `couplesStore` engine; ✅ seam-URL auto-wiring extended to **all** spine/agent-
  calling layer workflows (triggers, integrations, external-services). **Still deferred:** live
  provisioning behind an opt-in server action (the one intentionally-parked item); more targets (Neon,
  Render, Cloudflare, n8n Cloud); region/replica topology.

## 6. Testing (committed)

- **Byte-identity (automated):** `fullstack-placement.test.ts` asserts the all-local `docker-compose.yml`
  equals a captured pre-SPEC-012 snapshot, and that an empty `hosting` object changes no
  placement-sensitive file — for both dialects. This is the load-bearing regression guard (previously a
  one-time manual check).
- **Isomorphism (automated):** `packages/codegen/src/deploy` is added to `invariants.test.ts`'s scanned
  pure dirs, so a future `node:*` import in a deploy target fails CI.
- **Unit:** `resolvePlacement` defaults + `urlEnv` fill + `agentRuntime` reconciliation; each
  `DeployTarget.generate`; the registry (fake target, sorted iteration); a **third-party engine** placed
  `managed` (cross-seam, no core edit).
- **Validators:** PB1 (managed w/o reach), PB2 (target can't host / mode unsupported / bare-managed
  fallback), PB3 (unknown target), PB4 (platform/store split), **PB5 (credentialed url)**.
- **Projection e2e (through `assembleFullStack`):** managed-pg + fly-spine + vercel-ui prunes the three
  services, keeps n8n, comments `DATABASE_URL`, emits `PLACEMENT.md`/`deployment.json`/`spine/fly.toml`
  with the RLS warning; a credentialed `hosting.url` leaks into **no** file.

## 7. Risks & mitigations

- **Scope creep into real provisioning.** Hard non-goal (§2). Phase 2a emits *descriptors only*; live
  deploy is opt-in server-side later.
- **Blast radius on the exporter.** Mitigated by the byte-identical-when-unset guarantee, now enforced by
  a committed snapshot test; placement only *diverges* output when authored.
- **Managed stores + the `USING (true)` RLS gap.** Placement makes remote/managed stores *easy to author*
  while generated RLS still authorizes every row for everyone (a known, pre-existing hardening gap). This
  raises the blast radius of that gap. Mitigation: `PLACEMENT.md` emits a loud warning whenever a store is
  managed/remote, and this risk is called out here. Production remote-store deploys still **block** on a
  tenant/row-scoping model — placement is not a substitute for it.
- **Credentials in `hosting.url`.** PB5 errors on a credentialed url; userinfo is redacted from every
  generated + persisted artifact regardless — defence in depth so a mis-author never leaks.
- **Isomorphism.** `deploy/` is in the invariant test's scanned pure dirs (not just asserted — enforced).
- **Determinism.** The deploy-target registry iterates sorted by id (same rule as the engine registry).

## 8. Decision

Adopt **placement as an orthogonal, authored binding dimension** (`Binding.hosting`) plus a
**`DeployTarget` registry** mirroring the engine seam. Phase 2a makes "where each part runs" an
expressible, validated, projectable property of the model — for **stores, orchestrators, the spine, the
UI, and third-party engines**, in `local`/`selfhost`/`managed` combinations — while preserving the
model→binding→validation→codegen spine, the byte-identical guarantee, and the pure/isomorphic rule. It is
the deploy-half twin of SPEC-010. The end-user *editor* for it, seam-URL auto-wiring, and live
provisioning are Phase 2b; "any constituent, any location, any combination" is delivered at the model/
exporter layer here, not yet as a business-owner-facing UI.

## 9. Review & closure

**Phase 2a implemented & verified (2026-07-15).** Landed as designed: the `hosting` axis + `HostingSpec`
+ `resolvePlacement` (targets.ts); the `DeployTarget` contract + registry (`deploy/registry.ts`,
`registerDeployTarget`/`getDeployTarget`/`registeredDeployTargets`, sorted → deterministic) with the four
built-ins (`docker`, `managed`, `vercel`, `fly`); `validatePlacement` (PB1–PB4) merged into the existing
validation channel; `projectPlacement` exposed on `TargetsReport.placement`; and the exporter wiring —
placement-driven compose pruning + reach-var repointing, `.env.example` reach vars, `PLACEMENT.md`,
`deployment.json`, and per-target config (`spine/fly.toml`). Round-trip is automatic: `model.json` already
serializes the whole `binding`, so `binding.hosting` recalls with no `model.ts` change.

**Acceptance met:** with no `hosting` authored, the export is **byte-identical** to the pre-change
baseline for BOTH dialects; a `managed` Postgres + `fly` spine + `vercel` UI binding prunes those three
compose services (keeping `n8n`), comments `DATABASE_URL`, and emits `PLACEMENT.md` / `deployment.json` /
`spine/fly.toml`; **361 tests** pass; `deploy/` is in the isomorphism scan; web build green.

### Multi-lens review to closure (5 lenses, 2026-07-15)

Five independent reviewers — [REV-027](../reviews/REV-027-technical-architecture-spec-012.md)
(technical-architecture), [REV-028](../reviews/REV-028-product-strategy-spec-012.md) (product-strategy),
[REV-029](../reviews/REV-029-delivery-execution-spec-012.md) (delivery-execution),
[REV-030](../reviews/REV-030-security-data-spec-012.md) (security-data),
[REV-031](../reviews/REV-031-extensibility-dx-spec-012.md) (extensibility/DX) — each returned
**Approve-with-changes** against the first-cut implementation. Disposition of the Blocker + Majors
(Minors/Nits in the REV files):

| # | Lens(es) | Severity | Finding | Disposition |
|---|---|---|---|---|
| 1 | ext-DX | **Blocker** | Third-party engine silently unplaceable; required core edits | **Fixed** — `managed.hosts` is now `mode==="managed"` (generic); `Engine` gained optional `urlEnv`/`composeService`; `resolvePlacement`/`projectPlacement` consult the engine registry first. Test: a `clickhouse` engine placed managed, no core edit. Local compose-*service generation* for novel engines explicitly deferred to 2b (§4.2). |
| 2 | ext-DX, tech-arch | Major | §4.3 seam-URL parameterization claimed, unimplemented | **Fixed (descope)** — §4.3/§5/§6/§8 reworded: Phase 2a is compose+env repointing; seam-URL auto-wiring is Phase 2b. No false claim remains. |
| 3 | tech-arch | Major | Duplicate/conflicting `DATABASE_URL` in `.env.example` | **Fixed** — base reach vars are placement-aware; a managed engine's var becomes a single commented placeholder; append is deduped (`ENV_OWNED`). Test asserts exactly one/zero uncommented `DATABASE_URL`. |
| 4 | tech-arch, delivery | Major | Bare-`managed` engine (no target) silently exported local | **Fixed** — generic `managed` now hosts it (placed, not dropped); `validatePlacement` also resolves the fallback target and emits PB2 when it can't host. Tests cover both. |
| 5 | security | Major | `hosting.url` credential leaks into 3 committed files | **Fixed** — PB5 error + userinfo redaction in `.env`, `PLACEMENT.md`, `deployment.json`, and the `model.json`/`_run.json` binding echo; managed `env` is a commented placeholder. Test: a credentialed url appears in no file. |
| 6 | ext-DX | Major | `DeployOutput.note` = raw markdown row (leaky) | **Fixed** — replaced by structured `reach`; the projector renders the table. |
| 7 | product, ext-DX, tech-arch | Major | `agentRuntime`↔`hosting` reconciliation claimed, unimplemented | **Fixed** — `resolvePlacement` maps a non-`node` `agentRuntime` to a managed placement; test covers it; §4.1 now accurate. |
| 8 | delivery, tech-arch, ext-DX | Major | No committed byte-identity / e2e / isomorphism-scan tests | **Fixed** — `fullstack-placement.test.ts` (snapshot + e2e); `deploy/` added to `invariants.test.ts` pure dirs. |
| 9 | product, security | Major | Managed store + `USING(true)` RLS blast radius | **Fixed (warn) + Accepted (gap)** — `PLACEMENT.md` emits a loud RLS warning for a managed store; §7 records the risk; the RLS/tenant model itself is a pre-existing gap tracked outside this spec. |
| 10 | product | Major | Phase 2a is JSON-only / developer-only, framed as user value | **Fixed (framing)** — §1 "Scope honesty" + §8 state the Phase 2a beneficiary is the export consumer, the end-user editor is 2b. |
| — | tech-arch, product, ext-DX | Minor/Nit | gaps-line mislabel; PB4 non-generalization; PB1 mostly-dead; granularity/registry-demand rationale; dialect threaded to validators; `ENGINE_COMPOSE_SERVICE` wired; empty-`services:` guard; target-id/shape docs | **Fixed** (gaps reworded; PB4/PB1 noted; §4.2 rationale added; dialect param added; compose-service map now consulted; empty-services guard + test; docs enumerate targets) except PB4 generalization **Deferred** to 2b. |

All Blocker + Major items are resolved in code (361 tests green) or honestly descoped in the spec; a
focused re-review confirmed no Blocker/Major remains. Per CONV-001 closure, status → **Approved**.

**Phase 2b progress (2026-07-15, v1.1.0).** Four of the five deferred items shipped: (1) an **in-app
placement editor** in Settings (`components/PlacementEditor.tsx`) — per-engine mode/target/reach var with
live PB1–PB5 findings, persisted via the project's `binding`; verified in-browser end-to-end (edit →
persist → a PB2 error rendering live). (2) **Seam-URL auto-wiring** for the n8n → spine seam
(`engines/n8n.ts` reads the spine placement). (4) **Local compose-service generation for third-party
engines** — `Engine.dockerService`/`dockerVolume`, emitted for a novel engine placed local (byte-identical
for built-ins). (5) **PB4 generalized** over any `couplesStore` engine. Seam-URL auto-wiring extends to **all** spine/agent-calling
layer workflows (triggers, integrations, external-services; comms is exempt). Placement helpers now read
the **live** engine registry (`engineDescriptor`) so a third-party engine's declared fields are honoured.
+6 tests (`placement-2b.test.ts`), **367 total green**; web build green. Docs (`view-code.md` + versioned
mirror) updated: the editor is no longer "coming later". **Only live provisioning (item 3) remains
intentionally parked**, plus more targets (Neon/Render/etc.) and region/replica topology.
