---
id: RES-002
title: Execution-engine binding — model → multi-backend deployment-target compiler
type: research
status: Draft
version: 0.5.0
author: Claude (Opus 4.8)
created: 2026-07-12
updated: 2026-07-12
supersedes: null
related: [RES-001, SPEC-004, SPEC-005, SPEC-007, ADR-002]
---

# RES-002 — Execution-engine binding

## 1. The question

RES-001 proved the model projects to **code** (TS types, OpenAPI, area modules). The owner's next
question: instead of generating a Node service for *everything*, can the same model be **placed onto
several real execution engines** — Postgres for data, **n8n for cross-system orchestration**, a thin
generated spine for the rest — and can we generate the **integration seams between them**?

Constraint from the owner: it **must** support several backend services, and **n8n is definitely one**
(precisely for its ability to work across systems).

## 2. Thesis

This is not "stop writing Node." It is **"the model becomes a deployment-target compiler,"** and the
generated Node shrinks to *glue*. The bigger claim under it: the formal model is complete enough to be
**placed** onto heterogeneous infrastructure and have the wiring between pieces fall out automatically.

The intuition "map app capabilities to backend capabilities" is right in spirit but mis-grained. The
**business** Capability Map (Lead Management, Billing…) is not what maps to backends. What maps is the
**technical capability** each *model element* requires. So the pivot is a small **fixed taxonomy** that
both model elements REQUIRE and engines PROVIDE — deliberately distinct from the business language.

| Model element | requires tech-capability |
|---|---|
| aggregate/entity | `store` (+ `authorize`) |
| command | `operate` |
| event | `emit` |
| policy/automation | `react` |
| workflow | `sequence` |
| role | `authorize` |

Engines are **partial** providers, scored by fidelity (`native`/`partial`/`none`):

| Engine | store | operate | emit | react | sequence | authorize |
|---|---|---|---|---|---|---|
| PostgreSQL | native | partial | partial | none | none | native |
| n8n | none | partial | partial | **native** | **native** | none |
| Node spine | partial | native | native | native | native | partial |
| Odoo (Probe 3) | native | native | native | native | partial | native |

"A full app uses several backends" then falls out for free: bind `store`+`authorize`→Postgres,
`react`+`sequence`→n8n, everything else→the spine.

## 3. Design

Five pieces, all deterministic + isomorphic (`packages/codegen/src/targets.ts`):

1. **Taxonomy** — `TechCapability` (6 values) + `Engine` descriptors with a `provides` fidelity map and
   a `reach` (`http`/`sql`/`event`/`in-process`) used by the seam layer.
2. **Binding** — the *authored* topology (invariant #2): a default engine per tech-capability, with
   optional **per-Area** overrides (Areas are the natural seam). Unspecified → the spine.
3. **Resolve** — walk the model, place every element on `(tech-capability, area, engine)`.
4. **Adapters** — per engine, project its bound elements: **Postgres** → `CREATE TABLE` (typed cols,
   PK, FK, RLS sketch from roles); **n8n** → a workflow per reaction (event webhook → HTTP call to the
   command endpoint) and per process (chained HTTP calls).
5. **Seams** — every model **edge** whose two ends land on different engines is a cross-engine hop,
   *derived from the model's own cross-layer edges* (policy: event→command; workflow step=command;
   command→store). The model already encodes the wiring; the binding just says which side lives where.

Plus **validators** (the honest part): `TB2` rejects binding an element to an engine that provides its
capability at `none`; `TB3` warns on `partial` (lossy); `TB4` catches dangling workflow steps. And a
**fidelity/gap report** — the probe's finding.

## 4. Probe results (on the baked solar model, default binding)

`projectTargets(DEFAULT_BINDING, …)` over the fully-generated solar model (12 entities, 57 commands,
62 events, 9 automations, 5 workflows, 7 roles):

- **Coverage** — Postgres **19** (12 entities + 7 role/authz), n8n **14** (9 automations + 5 workflows),
  spine **119** (57 commands + 62 events). Validation: **0 errors, 0 warnings** (the default binding is
  legal — no engine asked to do what it can't).
- **Seams — 100 cross-engine hops**, in exactly two shapes: `n8n→node (http): 43` and
  `node→postgres (sql): 57`. **There is no direct `n8n→postgres` hop.** n8n calls the spine's command
  API; the spine touches Postgres. The "thin spine coordinates several backends" architecture *emerged
  from the binding* — it was not hand-drawn. This is the single most important result.
- **Artifacts are real**: typed Postgres DDL with FKs + an RLS scaffold (`CREATE TABLE lead (id text
  PRIMARY KEY, …); ALTER TABLE lead ENABLE ROW LEVEL SECURITY;`), and 14 structurally-valid n8n
  workflows (`On Lead Qualified` webhook → `httpRequest` to `…/api/invoices`).

Covered by `node:test` cases in `packages/codegen/test/targets.test.ts` (incl. the "no direct
n8n→postgres" invariant and the `TB2` reject).

## 4a. Probe 3 — adding Odoo proved the connector architecture

The test of the design is whether a *semantically different* engine drops in without touching the
core. **It did.** Adding Odoo required exactly three things — an `Engine` descriptor (`provides` map +
`couplesStore: true`), an `odooAdapter`, and one new validator (`TB5`). The model, the binding
resolver, and the seam derivation were **not modified**.

Binding the **Billing Area wholly to Odoo** (store+operate+authorize+react), rest unchanged:

- **The adapter emits an installable Odoo module** — `__manifest__.py`, `models/models.py`
  (`class Invoice(models.Model)`, typed fields incl. `fields.Monetary`+`currency_id`, `Many2one`
  relations, one method per command), `security/groups.xml` + `ir.model.access.csv` from roles, and
  `data/automations.xml` (`base.automation`) from any policy triggered by an Odoo-stored event.
- **The topology recomputed itself.** A new seam class appeared — `n8n→odoo: 4` (cross-area automations
  now call Odoo's command API directly) — and the spine **shrank 119→108** because Odoo natively covers
  `operate`+`emit` for that area. No wiring was edited; changing one binding re-derived the seam graph.
- **`TB5` (coherence)**: Odoo `couplesStore` — its methods only run on its own store. Binding an
  Area's `operate` to Odoo while leaving its `store` on Postgres yields **5 clear `TB5` errors**. This
  is the formal reason the binding unit is an **Area**, not a single capability: a full platform wants a
  whole vertical slice.

Honest calibration (the "can I press a button and it runs?" question): what is generated is a
**structurally-complete, installable *configuration*** — schema, security, relations, automation
records, method stubs. It is NOT a running system with zero human effort: command **business logic
inside the methods is hand-owned** (ADR-002), and the module has **not yet been installed into a live
Odoo** (that is Probe 2). "Describe a business → Odoo is scaffolded" is real; "→ Odoo runs the business
untouched" is not, and shouldn't be claimed.

## 4b. Probe 2 — live round-trip (partial): the artifacts RUN

An **exporter** (`npm run targets:export`, `packages/codegen/bin/export-targets.mjs`) writes the
artifacts to `out/targets/` — `postgres/schema.sql`, `n8n/*.json`, `odoo/<module>/…`, `_run.json`.
All three engines are now proven against **live** software (Docker) — each surfaced a real adapter bug
that only a running install caught:

- **Postgres — RUNS.** `schema.sql` applied to a real Postgres 16 with `ON_ERROR_STOP=1` (aborts on any
  error): **12 tables, 15 foreign keys, 12 RLS policies** created — exactly the model's shape.
- **n8n — RUNS, after a fix the live test forced.** First import failed: `NOT NULL constraint failed:
  workflow_entity.id` — the adapter emitted `{name, nodes, connections}` but n8n's `import:workflow`
  requires `id` (+ `active`, `settings`). Added them; **all 14 workflows then imported successfully**
  and list clean in n8n. This is the exact value of a live round-trip: "structurally faithful" hid a
  real gap that only a running importer surfaced.
- **Odoo — RUNS, after a fix the live install forced.** Bound the Customer Acquisition Area to Odoo
  (Lead/Customer/Offer + relations, ACL, automations); `odoo -i solar_installation --stop-after-init`
  into a live Odoo 17. First run failed: `Invalid field 'state' on model 'base.automation'` — Odoo 16+
  split automations, so the code must live on an `ir.actions.server` linked via `action_server_ids`, not
  as `state`/`code` on `base.automation`. Fixed; the module then **installed clean** (`state=installed`,
  models `solar_installation.{lead,customer,offer}` created). Also required adding `base_automation` to
  the manifest `depends`. **All three engines now proven against live software.**

## 4c. The skin system — `serve-ui` as the 7th capability (shadcn first adapter)

UI splits into two halves, and conflating them is where "generate a UI" oversells:

- **Structure — derivable** from the model: navigation = **Business Areas**, screens = entities, form
  fields = **typed attributes** (money→number input, boolean→Switch, reference→Select), action buttons =
  **commands**. No design taste required.
- **Skin — a choice**: colour, typography, radius. NOT in the business model. Supplied as a `Theme`.

So **"who says how it looks"** = the model supplies the structure; a `Theme` supplies the skin. UI is
therefore just **another bindable capability** — `serve-ui`, the 7th in the taxonomy — with engine
choices like any other: **shadcn** (generated React SPA), **Odoo** (its web client, UI for free — no
custom UI generated), or Retool. `serve-ui` is app-level, so it's read from the binding directly rather
than placed per-element.

**shadcnAdapter (first `serve-ui` adapter)** — `packages/codegen/src/ui.ts` — emits a themeable
Vite+React+react-router+shadcn scaffold: `src/index.css` (the skin, as shadcn CSS-variable tokens),
`src/App.tsx` (routes), `src/components/AppSidebar.tsx` (nav grouped by Area), and a list+detail page
per entity, plus `components.json`/`THEME.md`. On solar: **29 files**, nav grouped into the real Areas,
`InvoiceDetail` carrying number/date/Switch inputs and all 5 Invoice commands as buttons. Tests prove
**swapping the `Theme` changes the skin, not the structure** (same file set, different tokens). Covered
by `packages/codegen/test/ui.test.ts`.

**RAN LIVE.** Scaffolded a Vite+React+Tailwind+shadcn harness, dropped the generated files in, and ran
it: the app renders — sidebar nav grouped into the real Business Areas, the Invoice detail form with a
number input (amount), date picker (due_date), a Switch (paid), and all 5 Invoice commands as buttons.
Then, swapping only the `Theme` (indigo primary, warm surface, larger radius) and letting HMR reload
`index.css`, the **entire app restyled with zero change to any page or route** — the structure/skin split
demonstrated live, not just asserted.

## 5. Findings / gaps (what a full multi-backend projection cannot yet do faithfully)

1. **The spine is still large** (119/152 elements): `operate` + `emit` have no native external home in
   this binding. That is *correct* — commands are business logic (ADR-002 hand-owned) — but it means the
   spine is load-bearing, not vestigial. Odoo (which provides `operate`+`store`+`sequence` natively)
   would shrink it materially; that is the argument for an Odoo adapter next.
2. **Authorization is under-modelled.** RLS emits `USING (true)` — we know *which roles* operate a table
   but not the *row predicate* (no subject/tenant model). Faithful authz needs a modelling addition.
3. **`partial` fidelity is unmodelled semantics.** "Postgres emit" = `LISTEN/NOTIFY`, not a durable bus;
   the model doesn't yet express delivery guarantees, so the binding can't choose correctly.
4. ~~n8n artifacts are unverified against a live n8n.~~ **RESOLVED (Probe 2, §4b)** — they import into a
   live n8n after adding the `id`/`active`/`settings` fields the importer requires. Postgres DDL also
   verified live. Odoo remains to be installed into a live instance.

## 6. What this justifies next (recommended sequencing)

- **Probe 2: round-trip through live engines — DONE for all three (§4b).** Postgres DDL applies, n8n
  workflows import, and the Odoo module installs — each into a live container. Remaining: **end-to-end** —
  fire a webhook and assert the command endpoint is hit across the seam (needs the generated spine
  running too), and run the shadcn UI against a live backend rather than empty state.
- **Probe 3: Odoo — DONE (§4a).** The interface survived a store, an orchestrator, and a full business
  platform. Adding an engine is now confirmed to be *descriptor + adapter (+ coherence rule)* only.
- **Then** promote to a SPEC: the authored **Binding** layer in the IR + UI (a per-Area engine picker),
  binding validators (TB1–TB5) surfaced in-app, and the model additions findings §5.2–3 demand
  (row-predicate authz, delivery guarantees). NocoDB (store) and Zapier (react/sequence) are then just
  more descriptors + adapters — Zapier with a fidelity caveat (no open import format like n8n's JSON).

## 7. Decisions recorded

- **Binding granularity** = per `(tech-capability × Area)` with element-level override headroom. Area is
  the seam; do not start at per-element.
- **The spine is a permanent participant**, not a temporary scaffold — it is the hub the other engines
  call and the fallback for uncovered capabilities.
- **Engines are declared, not inferred**: an `Engine` descriptor with an explicit `provides` fidelity map
  is the contract; adding an engine = adding a descriptor + an adapter (+ a coherence rule if it couples
  its store), nothing else. Confirmed by Probe 3.
- **`couplesStore` + `TB5`**: full-platform engines (Odoo) own a vertical slice; their operate/react
  only work on their own store. This is a first-class engine property, and it is why the binding unit is
  the **Area**.
- Kept in `@vbd/codegen` (the RES-001 yardstick) rather than a new package — this is codegen v2, same
  "text is truth; artifacts are a projection" stance.

## Review & closure

Draft. Not yet independently reviewed. Open items before promotion to a SPEC: run Probe 2 (live
round-trip) to validate the n8n artifacts, and decide whether Odoo (Probe 3) precedes or follows the
SPEC based on the demand signal.
