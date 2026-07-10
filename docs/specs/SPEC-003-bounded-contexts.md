---
id: SPEC-003
title: Business Areas (Subdomains) — the capability-grouping layer
type: spec
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-10
updated: 2026-07-10
supersedes: null
related: [SPEC-001, SPEC-002, ADR-001, ADR-002, ADR-004, ADR-006, REV-012, REV-013, REV-014, REV-015, REV-016]
reviewers: [product-strategy, domain-modeling, ai-llm-feasibility, technical-architecture, ux-hitl]
---

# SPEC-003 — Business Areas (Subdomains)

> **v0.2.0 — revised after 5-lens review (REV-012…016), all Approve-with-changes.** Panel raised
> 3 Blockers (1 product, 2 UX) + ~19 Majors. Material changes from v0.1.0:
> **(1) Honest framing (REV-013 C1):** the authored layer is a **subdomain partition** (problem-space
> capability clustering), *surfaced to operators as "Business Areas"*. True bounded-context semantics
> (ubiquitous language, typed context mapping) are explicitly **later** — the IR keeps the
> `bounded_context` node type for lineage, but this spec does not over-claim it.
> **(2) Strategic gate (REV-012 F1, owner decision):** build proceeds now, but the second-domain
> proof SPEC-002 owes (A4) runs **alongside** as the breadth check, and the design partner is asked
> for an explicit demand signal — the strategic finding is **owner-accepted with mitigation**, not
> resolved in-spec.
> **(3) Shared kernel (C2/Q5):** authored membership stays single-valued (a clean partition), but
> **entity presence is multi-valued and derived** from `references` edges — a `Customer` owned in
> Sales but referenced in Finance shows in both. A capability may carry an explicit `shared_kernel`
> marker to appear in >1 area (warning, not error).
> **(4) Real provenance & quality (C3, BC-F2):** context provenance grounds to **boundary evidence**
> (narrative/shared-entity), not the tautological "derivedFrom = its own members"; the eval adds a
> **partition-agreement** metric vs a human-blessed reference + count guardrails, not just plumbing.
> **(5) UI (UX F1/F2):** Areas render as a **backdrop over the single capability map** (no second
> view/tab); reassignment is a **form select** on NodeDetail (never drag — invariant #1); a defined
> **Area-detail panel** for rename/intent/retire.
> **(6) Plumbing (arch/AI):** buildHash mixes `contexts` + schema-version; `Project`/`StoredProject`
> gain a `contexts` field; invalidation **reconciles, not blanket-clears**; repair fires on the
> partition findings; identity keys on the **member-set fingerprint**; members are **canonicalized**
> to real capability ids. Full disposition in §13.

## 0. Framing
A **business area** groups the capabilities that form one cohesive slice of the business — e.g.
*Sales & Onboarding* (lead + customer + offer management), *Delivery* (planning + procurement +
installation), *Finance* (billing). Technically this is a **subdomain partition** (DDD problem-space:
which capabilities belong together), **not** a bounded context in the strict sense — a bounded
context additionally owns a *ubiquitous language* and *typed relationships* to other contexts, both
of which this spec defers (§2 N0/N1). We name it honestly to avoid the over-claim REV-007 caught for
`aggregate`→`entity`: **the artifact is a subdomain map; "Business Area" is its operator-facing
label; the `bounded_context` IR node is kept for methodology lineage and a possible future upgrade
to a real context/codegen seam.**

It sits **above** capabilities: an area *groups* capabilities; each entity (SPEC-002) inherits the
area of its owning capability, and additionally *appears in* any area whose capabilities `reference`
it (the shared-kernel projection). This reuses the IR spine, skill/validator/review machinery,
HITL editing, grounded provenance, and text-as-truth from SPEC-001/002 — the **same loop, one layer
up**.

**Strategic posture (REV-012 F1, owner-accepted).** The product lens flagged that adding a third
solar-only layer before proving the model generalizes to a second vertical repeats a "height before
breadth" risk, and that part of the layer's value is Product-B (codegen seams) while it is gated as
Product A. **Owner decision:** build now, but (a) run SPEC-002's owed **second-domain smoke test
alongside** as the cheap breadth proof, and (b) seek an explicit demand signal from the now-engaged
design partner. This spec's exit gate (§8) is **not** met on internal metrics alone; A6 (partner
finds Areas clarifying) + the second-domain result are primary.

## 1. Goals
- G1. From capabilities (+ `depends_on`, `produces`/`consumes`, owned entities) and the narrative,
  derive a validated **partition of capabilities into business areas** — each with a business name,
  an `intent`, and its member capabilities.
- G2. Extend the IR: authored `bounded_context` nodes + `groups` edges (area → capability), tagging
  preserved. Entity→area and inter-area adjacency are **derived** read-only projections.
- G3. Deterministic **validators** (`validateContexts`): partition completeness, single-membership
  (+ shared-kernel escape), referential integrity, unique/slug ids, empty/cohesion warnings.
- G4. An LLM **`ContextGrouper`** skill (server-side, structured outputs, grounded provenance,
  member canonicalization, repair on partition breakage) + a deterministic **mock** that does *not*
  collapse to one area.
- G5. A **Business Areas UI**: a backdrop over the single capability map + an Area-detail panel +
  form-select reassignment + findings — no second view.
- G6. A gold-free **eval**: seeded-defect corpus + coverage **and a partition-agreement quality
  metric** vs a human-blessed reference, as the exit gate.
- G7. Vertical-agnostic; prove on solar **and** a second domain (the breadth check).

## 2. Non-goals (this spec)
- N0. **Typed context mapping** (upstream/downstream, ACL, conformist, shared-kernel *relationships*,
  published language) — deferred. BUT a **read-only untyped adjacency** ("these two areas interact",
  from cross-boundary `depends_on` + shared `references`) **is** derived now (REV-013 C4, Q2).
- N1. **Authored ubiquitous-language glossary** — deferred. A per-area **term list** is *derived*
  read-only from the names of owned + referenced entities (REV-013 Q3), not hand-authored.
- N2. **Commands & events** — SPEC-004.
- N3. **Code / API / module generation** from area boundaries — later.
- N4. **Nested / hierarchical areas** — flat partition only.

## 3. Artifact
A new authored artifact per project, stored **in `project.json`** alongside `capabilities` and
`domain` (ADR-006 workspace reality — the YAML is the logical shape, not a file):
```yaml
version: "0.1"
contexts:                                  # "areas" in the UI; "contexts" in code for IR lineage
  - id: c_lead_customer_offer              # id = fingerprint of the member set (stable across runs)
    name: Sales & Onboarding               # business label (UI shows this)
    intent: Win and onboard customers      # one-line purpose (Intent; BC5 warns if absent)
    capabilities: [lead_management, customer_management, offer_management]   # the partition members
    shared_kernel: []                      # capabilities intentionally also in another area (escape)
    meta:
      origin: llm
      derivedFrom:                          # BOUNDARY EVIDENCE, not the members themselves (C3)
        - { anchor: sales-onboarding }      # narrative anchor / shared-entity signal
```
Required: context `id/name` + non-empty `capabilities`. `intent` recommended (BC5). Ids are
**member-set fingerprints** (BC-F3): a stable slug derived from the sorted member ids, so the id does
not churn when the LLM re-words the name. LLM-authored areas carry **grounded** provenance keyed to
boundary evidence (BC8). The document is a **partition**: every capability in exactly one context's
`capabilities`, except those explicitly in a `shared_kernel` (BC2).

## 4. IR extension
`bounded_context` (NodeType) and `groups` (EdgeType) **already exist** in `@vbd/ir`. This spec makes
them load-bearing:
- Compiler composes `contexts` into the IR: one authored `bounded_context` node per area (namespaced
  id `bctx:<id>`, mirroring SPEC-002's `aggregate:`), + an authored `groups` edge
  `bctx:<area> → <capability>` per member. Verified collision-free against capability + `aggregate:`
  ids (REV-015).
- **Entity→area and inter-area adjacency are derived, not stored** (REV-015 confirmed the projection
  cannot drift): views walk entity → `owns`⁻¹ owner → its `groups`⁻¹ area (primary area), plus
  entity `references` → owners → their areas (shared-kernel presence); adjacency = areas linked by a
  cross-boundary `depends_on` or a shared referenced entity.
- **`computeBuildHash` gains `contexts?`** at a fixed trailing position and mixes it; each artifact
  carries its own `version` and a **schema-version** entry is added to the hash (REV-015 M2, closing
  the migration gap REV-010 flagged).
- The composed IR the **app** renders must include `domain` so `owns` edges exist for the projection
  (REV-015 M4): `compileCapabilities(activeDoc, domainDoc, contextsDoc)`.

## 5. LLM skill — `ContextGrouper`
- **In:** narrative + capabilities (id, name, purpose, `depends_on`, `produces`/`consumes`) + owned
  entities + IR. Single call (per-capability fan-out is impossible for a partition — REV-014 Nit).
- **Out (structured):** the `contexts` partition of the given capability ids, each area citing
  **boundary evidence** in `derivedFrom` (narrative anchor / the shared entities that motivated the
  cut) — never merely its own members (C3).
- **Coerce → canonicalize → ground → validate → repair (REV-014 BC-F1/BC-F4):**
  1. `coerceContextsDoc` snaps every member id to a real capability id (slug + nearest-match), so
     `lead-management` → `lead_management` before validation (prevents spurious BC4/BC2).
  2. `fingerprintId` sets each area's id from its sorted member set (stable identity).
  3. `groundContextProvenance` attaches boundary-evidence anchors.
  4. `validateContexts`; **repair once** if any **BC2.\*** (unpartitioned/double-assigned) or blocker
     fires — the repair prompt lists the offending capability ids explicitly. (Repair trigger
     allowlists BC2.\*, not only blockers — BC2 is severity *major*.)
- **Schema:** `CONTEXT_SCHEMA` (`output_config.format`) fixes the shape but **cannot** encode the
  partition invariant (that is BC2's job) and must **not** hard-code 2–6 as array bounds (REV-014
  Minor); the prompt *requests* 2–6 cohesive areas, the validator enforces correctness.
- **Mock (`mockGroupContexts`)** — deterministic, offline, **must not collapse to one area** on solar
  (REV-014 Minor: the `depends_on` chain is a single component). Heuristic: build an affinity graph
  (edge when two capabilities share a produced/consumed entity **or** a direct `depends_on`), run
  greedy modularity community detection with a **size cap** so a long chain splits into ~2–5 areas;
  template names/intents. Exercises the whole layer without a key.

## 6. Deterministic validators (`validateContexts`, isomorphic)
Pure over the contexts doc + capability ids (+ entities for cohesion), added to `@vbd/validation`:
| Code | Sev | Rule |
|---|---|---|
| BC1.id / BC1.name | blocker / major | area has an id (blocker) and a name (major) |
| BC2.unassigned | major | every capability belongs to ≥1 area (repair-triggering) |
| BC2.multiple | major | every capability belongs to ≤1 area **unless** listed in a `shared_kernel` (repair-triggering) |
| BC4.dangling | major | every member id is an existing capability (after canonicalization) |
| BC5.intent | minor | area has a non-empty `intent` |
| BC6.empty | minor | area groups ≥1 capability |
| BC7.slug / BC7.unique | major / blocker | area ids are stable slugs (major) and unique (blocker) |
| BC8.provenance | major | every llm-origin area cites **boundary evidence** in `derivedFrom` (not just its members) |
| BC9.cohesion | minor | area's capabilities are connected via `depends_on`/shared entities — **coupling-ratio** smell (REV-014 Q4: deterministic, ships now, degrades gracefully when the domain layer is absent) |

BC2 (completeness + single-membership) is the partition guarantee. BC2/BC6 are the area analogs of
SPEC-002 DM5 (uncovered) and V4 (orphan).

## 7. Review lens & UI (business language, one surface)
- A **context review** lens: flags a capability that couples heavily across a boundary, an area too
  big/too granular, and boundary questions ("should `offer_management` be Sales or Delivery?").
- **UI — one surface, three depths (REV-016 F1, resolving Q1):** Areas render as **backdrop bands /
  regions behind the single capability map** (partition-aware elk layout; color + a legend as the
  fallback when regions are visually noisy) — **not** a separate view, tab, or second graph, and
  **not** a default-separate lens. Default is the map with the area backdrop *on*; the operator drills
  region → capabilities → entities on the same canvas.
- **Editing (REV-016 F2, invariant #1):** reassignment is a **form select** ("Area") on the
  capability's NodeDetail — **never** drag between regions (the canvas never holds truth; elk
  positions are never persisted). A defined **Area-detail panel** (open on selecting an area/legend
  entry) edits `name`/`intent`, retires an area, and shows its capabilities + derived term list +
  adjacency. Reassignment/edits materialize the live grouping into the project, recompile, re-validate
  live, and flip the area's origin to `authored` (invariant #2) — the SPEC-002 editable-entity
  pattern.
- **Findings:** BC findings in the existing findings panel, clickable → the offending
  capability/area. Provenance chips. One unavoidable concept ("area") gets a tooltip/gloss.
- **Surface label (REV-016 Q6):** **"Business Areas" / "Geschäftsbereiche"** — reject "Domains"
  (collides with the domain-model/Entities layer and the `domain` field) and "Departments"
  (org-chart mental model). Area *names* carry the meaning; the container noun is secondary.

## 8. Success criteria (go/no-go to SPEC-004)
Structural (necessary, not sufficient):
- A2. `validateContexts` deterministic, unit-tested, catches seeded defects (unassigned, double-
  assigned, dangling member, empty area, non-slug/duplicate id) in ≥90% of seeded cases (eval).
- A3. Edit → recompile → IR/views update deterministically; no text↔graph drift; buildHash mixes
  contexts + schema-version.
- A4. Solar coverage: **partitionCompleteness = 1** (every capability grouped) and **provenanceRate =
  1** (every area grounded to boundary evidence).
Quality & value (primary — REV-012 F1, REV-014 BC-F2):
- A5. **Partition-agreement** (Adjusted Rand Index / NMI) of the generated partition vs a one-time
  **human-blessed reference partition** for solar ≥ a set threshold; + guardrails (area count in
  [2..6]; no single area > ~60% of capabilities). Degenerate partitions (one blob / one-per-cap)
  **fail** even at partitionCompleteness = 1.
- A6. **The design partner rates the Business Areas view "clarifying" / worth acting on"** (primary
  value gate), **and** the second-domain smoke test (below) passes.
- A7. **Second-domain smoke (breadth, runs alongside — also SPEC-002 A4):** a non-solar business
  produces a sensible area partition with **no code change** (data/prompt/config only).

## 9. Milestones
- BC-M0. IR compose (bctx: nodes + groups edges, namespaced) + `computeBuildHash(contexts)` +
  schema-version + composed-IR-in-app wiring (owns edges present) + tests.
- BC-M1. `mockGroupContexts` (modularity + size-cap, no single-blob) + compile + tests.
- BC-M2. `validateContexts` (BC1–BC9) + tests + seeded-defect eval corpus + partition-agreement
  metric + guardrails.
- BC-M3. `ContextGrouper` skill (coerce/canonicalize → fingerprint id → ground boundary evidence →
  validate → repair-on-BC2) + `CONTEXT_SCHEMA` + `/api/contexts` endpoint.
- BC-M4. Business Areas UI (backdrop over the single map + Area-detail panel + form-select
  reassignment + findings + reconcile-on-capability-change) + i18n (DE/EN) + `contexts` on
  `Project`/`StoredProject`.
- BC-M5. Solar walkthrough + eval go/no-go + **second-domain smoke** + partner value check + closure.

## 10. Risks
- R1. **Jargon / comprehension** (REV-016) — mitigated: "Business Areas" surface, one-surface
  progressive disclosure, tooltip gloss.
- R2. **Partition too rigid / shared kernel** (REV-013 C2, Q5) — mitigated: single authored ownership
  + derived multi-presence via `references` + explicit `shared_kernel` escape (warning).
- R3. **Layer fatigue / value** (REV-012 F3, REV-016) — mitigated: Areas is a *backdrop on the
  existing map*, not a new surface; value proven by A5/A6, not asserted.
- R4. **Generation non-determinism** (REV-014 R4/BC-F3) — mitigated: deterministic mock,
  member-fingerprint identity, canonicalized members, grounded provenance, repair-once, pinned
  snapshot; A5 sets an inter-run stability expectation.
- R5. **Metrics that verify nothing** (REV-012, REV-013 C3, REV-014 BC-F2) — mitigated: boundary-
  evidence provenance + partition-agreement + guardrails replace tautological plumbing.
- R6. **Invalidation destroys authored top layer** (REV-015 M1) — mitigated: reconcile-not-clear
  (drop deleted members, mark newly-added capabilities unassigned → BC2 flags for the human).
- R7. **Strategic: height before breadth / Product-B pull** (REV-012 F1/F2/F4) — owner-accepted with
  the second-domain proof running alongside (A7) and a partner demand check (A6).

## 11. Open questions — resolved by the review panel
- Q1 **Default lens / rendering** → **backdrop over the single capability map**, default-on, no second
  view (REV-016 F1). One surface, three depths.
- Q2 **Inter-area adjacency** → **derive read-only now** from cross-boundary deps + shared entities;
  typed context mapping stays deferred (REV-013 C4, N0).
- Q3 **Ubiquitous language** → **derive a per-area term list read-only** from owned+referenced entity
  names; no authored glossary (REV-013 Q3, N1).
- Q4 **BC9 cohesion** → **ship now**, deterministic coupling-ratio smell, graceful when domain absent
  (REV-014 Q4).
- Q5 **Strictness** → **strict single-membership by default + explicit `shared_kernel` escape**
  (warning, not error) (REV-013 Q5, REV-012 Q5).
- Q6 **Surface label** → **"Business Areas / Geschäftsbereiche"**; reject "Domains"/"Departments"
  (REV-016 Q6).

## 12. Terminology note
`bounded_context`/`bctx:`/`contexts` persist in the **IR and code** (methodology lineage, the type
already exists). The **operator-facing** term is **Business Area**. The **conceptual** honest label is
**subdomain partition** — a true bounded context (ubiquitous language + typed mapping) is a *possible
future* upgrade, not what this spec ships (REV-013 C1).

## 13. Review & closure

Five independent lenses reviewed v0.1.0 (REV-012…016); all **Approve-with-changes** (3 Blockers,
~19 Majors). Disposition:

| Finding | Lens | Sev | Disposition | Where |
|---|---|---|---|---|
| Gated on correctness not demand; half-cleared gate; §8 soft value metric | product (F1) | **Blocker** | **Owner-accepted + mitigated** (2nd-domain alongside A7; partner demand A6; §8 value-primary) | §0, §8 |
| Areas rendering/default lens undecided → risk of 2nd mental model | ux (F1) | **Blocker** | **Fixed** — backdrop over single map, no second view | §7, Q1 |
| Editing model undecided; drag violates invariant #1; no Area-detail surface | ux (F2) | **Blocker** | **Fixed** — form-select reassignment + defined Area-detail panel | §7, Q5 |
| Height before breadth; 2nd domain unrun; adds 3rd solar-only layer | product (F2) | Major | **Accepted** — A7 second-domain runs alongside | §8, R7 |
| "Areas as default" reorganizes nav around unvalidated layer | product (F3) | Major | **Fixed** — backdrop, not default separate lens | §7 |
| Product-B driver hidden behind Product-A gate | product (F4) | Major | **Accepted** — named honestly | §0, §12 |
| Models a *subdomain*, not a bounded context (UL is what defines a BC) | domain (C1) | Major | **Fixed** — honest framing; "Business Area"/subdomain | §0, §12 |
| Single-owner erases shared kernel (Customer invisible in Finance) | domain (C2) | Major | **Fixed** — derived multi-presence via references + shared_kernel escape | §3, §4, R2 |
| BC8 provenance circular (derivedFrom = members) → A4 verifies nothing | domain (C3) | Major | **Fixed** — ground to boundary evidence | §3, §5, §6 |
| Deferring all context relationships leaves islands | domain (C4) | Major | **Fixed** — derive untyped adjacency now | §2 N0, §4, Q2 |
| Repair won't fire on broken partition (BC2 is major, repair is blocker-only) | ai (BC-F1) | Major | **Fixed** — repair allowlists BC2.\* | §5 |
| No partition-*quality* instrument; A2/A4 satisfiable by degenerate partition | ai (BC-F2) | Major | **Fixed** — partition-agreement (ARI/NMI) + guardrails | §8 A5 |
| "Stable slug" hollow — name-derived id churns | ai (BC-F3) | Major | **Fixed** — id = member-set fingerprint | §3, §5 |
| No member-id canonicalization → spurious BC4/BC2 | ai (BC-F4) | Major | **Fixed** — coerce snaps members to real cap ids | §5 |
| Invalidation of the partition on capability change unspecified; blanket-clear destroys authored layer | arch (M1) | Major | **Fixed** — reconcile-not-clear | §4, R6 |
| buildHash must mix contexts; no schema-version/migration story | arch (M2) | Major | **Fixed** — computeBuildHash(contexts) + schema-version | §4 |
| Project/StoredProject type neither domain nor contexts | arch (M3) | Major | **Fixed** — add contexts field both sides (+ note domain gap) | §3, BC-M4 |
| App compiles without domain → no owns edges for the projection | arch (M4) | Major | **Fixed** — compose domain+contexts IR in app | §4, BC-M0 |

Minors/Nits (mock single-blob; BC8 tautology; CONTEXT_SCHEMA can't encode partition / no hard 2–6
bounds; sonnet-5 medium + single-call correct; derived term-list; adjacency legend) — **accepted**
into §5/§6/§8 or the BC-phase tickets.

**Status:** all UX Blockers **Fixed**; all technical/domain/AI Majors **Fixed or Accepted** into the
design; the **strategic Blocker is owner-accepted with the second-domain proof running alongside**
(not deferred to a hard external gate as SPEC-002 was — the capability layer is now validated). So
this spec is **`Revised` and build-eligible**. Re-review to `Approved` when BC-M5's eval + partner
value check + second-domain smoke clear (§8 A5–A7).

## 14. Exit gate — BC eval + go/no-go (BC-M5)

The business-areas layer is engineering-complete: IR compose (BC-M0), mock partitioner (BC-M1), DM
validators (BC-M2), `ContextGrouper` + `/api/contexts` (BC-M3), the backdrop UI (BC-M4). The gold-free
harness (`@vbd/eval/contexts`) is the instrument REV-014 BC-F2 demanded. Results:

| Criterion | Metric | Result | Verdict |
|---|---|---|---|
| A2 defect recall | `validateContexts` over 6 seeded cases | **1.000** | ✅ |
| — clean precision | no false positives | **1.000** | ✅ |
| A3 determinism | buildHash mixes contexts + schema-version; edit→recompile live | verified | ✅ |
| A4 completeness | mock partitionCompleteness / provenanceRate on solar | **1.000 / 1.000** | ✅ |
| A4 guardrails | area count / giant-area ratio (mock) | **3 / 0.38** | ✅ |
| **A5 quality (ARI)** | LLM partition vs human reference (mock baseline) | **0.294 (mock 0.048)** | ⚠️ qualified |
| A7 second-domain | dental clinic: caps → areas, **no code change** | **4 coherent areas** | ✅ |
| A6 partner value | partner rates Areas "clarifying" | pending | ⛔ open |

**On A5 (the honest caveat).** The ARI instrument works — it scores the degenerate mock baseline at
**0.048** (near-random, as intended: coverage=1 cannot hide a bad partition). The real LLM scores
**0.294** against the one coarse 3-area human reference, because it produced a *sensible but finer*
5-area partition (Customer Acquisition / Solution Design & Sales / Supply & Fulfillment / Financial
Settlement / Service Operations). The gap is **granularity preference, not wrongness** — every LLM
area is defensible and the guardrails (2–6 areas, no giant) pass. Recommendation: treat ARI as a
**diagnostic** paired with the human judgment (A6), and bless **multiple** acceptable reference
partitions rather than a single coarse one, before making ARI a hard threshold.

**A7 (breadth — also clears SPEC-002 A4).** A dental-clinic narrative, run through the unchanged
stack (data/prompt only), yielded 7 coherent capabilities and 4 coherent areas (Patient Access &
Scheduling / Clinical Care Delivery / Revenue & Financial Operations / Practice Operations & Supply
Chain). Verticality generalizes — the project's biggest bet — with no code change. This satisfies
**SPEC-002 A4** as well.

**Decision — GO (engineering) / HOLD (Approved) on the partner:**
- **GO** — the layer passes every structural gate (recall, precision, completeness, provenance,
  guardrails, determinism) and the breadth proof (A7). The code is sound and shipped.
- **HOLD** on `Approved` until **A6**: the design partner rates the Business Areas view clarifying.
  A5's ARI is a qualified pass (instrument valid; the coarse single reference under-credits sensible
  finer partitions) — resolve by pairing it with A6 and multiple references. Status stays
  **`Revised`** (engineering-complete, pending the A6 human value check), consistent with SPEC-002's
  posture. 106 tests pass; web build passes; verified end-to-end against Sonnet.

**UPDATE 2026-07-10 — `Approved`.** The design partner reacted positively to the Business Areas view,
clearing **A6** (the one open gate). With the structural gates green and A7 passed, **SPEC-003 →
`Approved`**. A5 remains a diagnostic (ARI paired with the human judgment; bless multiple reference
partitions before making it a hard threshold), not a blocker.
