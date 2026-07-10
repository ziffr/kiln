---
id: SPEC-003
title: Bounded Contexts — the capability-grouping layer
type: spec
status: Draft
version: 0.1.0
author: Claude (Opus 4.8)
created: 2026-07-10
updated: 2026-07-10
supersedes: null
related: [SPEC-001, SPEC-002, ADR-001, ADR-002, ADR-004, ADR-006]
reviewers: [product-strategy, domain-modeling, ai-llm-feasibility, technical-architecture, ux-hitl]
---

# SPEC-003 — Bounded Contexts

> **The missing rung.** The source methodology's artifact pipeline is
> `narrative → capabilities → bounded_contexts → domain_model → …`. SPEC-001 built capabilities;
> SPEC-002 built the domain model (entities) — but the **bounded_contexts** layer between them was
> never built. SPEC-001 Q2 had decided contexts should be a *derived, read-only* grouping; the
> product owner has since chosen the **full-methodology** path: bounded contexts are a **first-class
> authored layer** — their own generator, validators, provenance, and editable forms — that
> **partitions the capabilities** into cohesive business areas. This spec designs that layer.

## 0. Framing
A **bounded context** groups the capabilities that share one cohesive slice of the business and its
language — e.g. *Sales & Onboarding* (lead + customer + offer management), *Delivery* (planning +
procurement + installation), *Finance* (billing). It is the DDD notion of a boundary within which a
model and its terms are consistent. In VBD it sits **above** capabilities: a context *groups*
capabilities, and each entity (SPEC-002) inherits the context of its owning capability. Contexts are
the coarse map operators reason about ("which area does this belong to?") and the seams a future
codegen step would turn into deployable modules/services.

This reuses everything SPEC-001/002 built — the IR spine, the skill/validator/review machinery,
human-in-the-loop editing, grounded provenance, text-as-truth. It is the **same loop, one layer up**
(capabilities) rather than one layer down (entities).

**Risk posture vs SPEC-002.** SPEC-002 was build-gated because it deepened toward code before the
capability layer was validated. That gate has now **cleared** (the design partner validated the
capability layer). Bounded contexts sit *on top of* that validated layer and are the operator-facing
coarse map — strategically lower-risk than the entity/command depth. So this spec is proposed
**build-eligible once reviewed to closure**, not build-gated behind another external event.

## 1. Goals
- G1. From the capabilities (+ their `depends_on`, `produces`/`consumes`, and the entities they own)
  and the narrative, derive a validated **partition of capabilities into bounded contexts**: each
  context has a business-friendly name, an `intent`, and the set of capabilities it groups.
- G2. Extend the IR: author `bounded_context` nodes and `groups` edges (context → capability), with
  authored/derived tagging preserved. Entity→context is a **derived** projection (entity → owner
  capability → its context), not a new authored assignment.
- G3. Deterministic **validators** for the layer (partition completeness, single-membership,
  referential integrity, unique/slug ids, empty-context and cohesion warnings).
- G4. An LLM **`ContextGrouper`** skill (server-side, structured outputs, grounded provenance,
  one repair retry) + a deterministic **mock** for the offline path.
- G5. A **UI** that shows contexts as business-language groupings over the capability map, with
  structured-form editing (create/rename/retire a context, reassign capabilities) and findings.
- G6. A gold-free **eval** (seeded-defect corpus + coverage metrics) as the exit gate, mirroring the
  DM eval (SPEC-002 §13).
- G7. Keep it vertical-agnostic; prove on solar.

## 2. Non-goals (this spec)
- N0. **Context mapping relationships** — the DDD upstream/downstream, ACL, conformist,
  shared-kernel, published-language relationships *between* contexts. Deferred to a later spec; this
  spec models the contexts and their capability membership, not the typed relationships among them.
  (A plain `references`/adjacency hint MAY be derived read-only; see Q2.)
- N1. **Ubiquitous-language dictionaries** per context (glossary of terms/nouns) — optional stretch,
  see Q3; not required for the MVP.
- N2. **Commands & events** — SPEC-004 (renumbered from the old SPEC-002 "SPEC-003").
- N3. **Code / API / module generation** from context boundaries — later; this produces a *model*.
- N4. **Nested / hierarchical contexts** (subdomains within contexts). Flat partition only.

## 3. Artifact
A new authored artifact per project, stored in `project.json` alongside capabilities and the domain
(ADR-006 workspace reality — **not** a mythical `.yaml` on disk; the YAML below is the logical shape):
```yaml
version: "0.1"
contexts:
  - id: sales_onboarding
    name: Sales & Onboarding            # business-friendly label (UI shows this, not "bounded context")
    intent: Win and onboard customers   # one-line purpose (methodology: every artifact starts with Intent)
    capabilities: [lead_management, customer_management, offer_management]   # the partition members
    meta: { origin: llm, derivedFrom: [{ capability: lead_management }, ...] }  # provenance (V8-style)
  - id: delivery
    name: Delivery
    intent: Design, source and install the system
    capabilities: [planning, procurement, installation]
  - id: finance
    name: Finance
    intent: Bill and collect
    capabilities: [billing]
```
Required: context `id/name` + non-empty `capabilities`. `intent` recommended (BC5 warns if absent).
LLM-authored contexts carry grounded provenance (SPEC-001 mechanism; enforced by BC8 below). The
document is a **partition**: every capability belongs to exactly one context (BC2).

## 4. IR extension
`bounded_context` (NodeType) and `groups` (EdgeType) **already exist** in `@vbd/ir` (reserved by
SPEC-001 Q2). This spec makes them *load-bearing*:
- The compiler composes `contexts` into the IR: one authored `bounded_context` node per context
  (namespaced id `bctx:<slug>`, mirroring SPEC-002's `aggregate:` namespacing to avoid id
  collisions with capabilities), plus an authored `groups` edge `bctx:<ctx> → <capability>` for each
  member.
- **Entity→context is derived, not authored:** no new edge; the projection walks entity → `owns`⁻¹
  owner capability → its `groups`⁻¹ context. Views compute it; the IR does not store it.
- `computeBuildHash` mixes the contexts artifact (alongside capabilities + domain), so a context
  edit changes the hash and invalidates derived caches (ADR-002).
- Authored/derived tagging unchanged (SPEC-001 §3.3): authored contexts round-trip to text/forms;
  any purely-derived grouping hint (Q2) is `derived` and read-only.

## 5. LLM skill — `ContextGrouper`
- **In:** the narrative + capabilities (id, name, purpose, `depends_on`, `produces`/`consumes`) +
  the entities each capability owns (SPEC-002) + IR.
- **Out (structured):** the `contexts` shape (§3) — a **partition** of the given capability ids,
  each context citing the capabilities it derives from (grounded provenance).
- **Job:** cluster capabilities into 2–6 cohesive contexts by shared language, shared/related
  entities, and dependency locality; name each in business language and state its `intent`. The
  model proposes; validators + the human decide (ADR-004). Structured outputs + **one repair retry**
  (repair on any blocker, e.g. an unpartitioned or double-assigned capability), server-side (key off
  the client). Capability text wrapped as DATA (injection safety).
- **Mock (`mockGroupContexts`)** — deterministic, offline, no key: partition by **connected
  components over the `depends_on` graph** (capabilities that depend on each other land together),
  falling back to one context per isolated capability. Names/intents are templated. This exercises
  the whole layer without a key, exactly as MockProvider does for capabilities and DM1 for entities.

## 6. Deterministic validators (new — `validateContexts`)
Pure over the contexts doc + capability ids (isomorphic, `@vbd/validation`), mirroring V1–V8 / DM:
| Code | Sev | Rule |
|---|---|---|
| BC1.required | blocker/major | context has an id (blocker) and a name (major) |
| BC2.unassigned | major | every capability belongs to **≥1** context (no capability left ungrouped) |
| BC2.multiple | major | every capability belongs to **≤1** context (no capability double-assigned) |
| BC4.dangling | major | every listed capability id exists |
| BC5.intent | minor | context has a non-empty `intent` (recommended, not required) |
| BC6.empty | minor | a context groups **≥1** capability (no empty context) |
| BC7.slug / BC7.unique | major / blocker | context ids are stable slugs (major) and unique (blocker) |
| BC8.provenance | major | every LLM-origin context carries grounded `meta.derivedFrom` |
| BC9.cohesion | minor | *(stretch, Q4)* a context's capabilities are connected via `depends_on`/shared entities — a loosely-grouped context is a modeling smell, not an error |

BC2 (completeness + single-membership) is the heart of "it's a partition." BC2/BC6 are the
context analogs of SPEC-002's DM5 (uncovered capability) and V4 (orphan).

## 7. Review lens & UI
- A **context review** lens (independent, like the capability/domain reviews): flags a capability
  that sits awkwardly (depends heavily across a boundary), a context that is too big/too granular,
  and boundary questions ("should `offer_management` be in Sales or Delivery?").
- **UI — business language first (SPEC-001 Q2 / REV-004 concern):** the term "bounded context" is
  **not** shown to operators; the surface label is **"Areas"** (DE: *Bereiche*) or similar — final
  wording is a UX-review call. Rendering options (UX review to choose):
  1. **Grouping regions on the capability map** — capabilities drawn inside labeled context regions
     (React Flow parent/group nodes or backdrop bands), the coarse map at a glance; or
  2. **An Areas panel/column** — list of contexts, each expandable to its capabilities, with the map
     tinting/filtering by the selected area.
- **Editing** (structured forms, no raw YAML, reusing NodeDetail patterns): create/rename/retire a
  context, edit its intent, and **reassign a capability** to a context (a select on the capability's
  detail, or drag between areas). Edits materialize the live grouping into the project, recompile the
  IR, re-validate live, and flip the context's origin to `authored` (golden invariant #2) — exactly
  the pattern SPEC-002 used for editable entities.
- Provenance chips + the BC findings list (clickable → the offending capability/context), consistent
  with the capability and domain findings already in the panel.

## 8. Success criteria (go/no-go to SPEC-004)
- A1. From the solar capabilities, `ContextGrouper` produces a partition a domain reviewer calls
  "substantially right" (contexts cohesive, boundaries defensible) after ≤1 review cycle.
- A2. `validateContexts` is deterministic, unit-tested, and catches seeded defects (unassigned
  capability, double-assignment, dangling member, empty context, non-slug/duplicate id) in ≥90% of
  seeded cases. **Measured** by a gold-free seeded-defect corpus (`@vbd/eval`), like the DM eval.
- A3. Edit → recompile → IR/views update deterministically; no text↔graph drift; buildHash mixes the
  contexts artifact.
- A4. Coverage metrics on solar: **partitionCompleteness = 1** (every capability grouped),
  **contextProvenanceRate = 1** (every generated context grounded). Reported by the eval.
- A5. Second-domain smoke: switching domains needs no code change (data/prompt/config only).
- A6. The design partner (or a target user) rates the Areas view "clarifying" / "worth acting on".

## 9. Milestones
- BC-M0. IR compose (bounded_context nodes + groups edges, namespaced) + buildHash mix + tests.
- BC-M1. `mockGroupContexts` (deterministic depends_on-component partition) + compile + tests.
- BC-M2. `validateContexts` (BC1–BC8; BC9 stretch) + tests + seeded-defect eval corpus.
- BC-M3. `ContextGrouper` LLM skill (server-side, structured outputs, grounded provenance, repair)
  + `/api/contexts` endpoint (mirrors `/api/domain`).
- BC-M4. Areas UI (grouping render + editable forms + reassignment) + findings surfaced + i18n.
- BC-M5. Solar walkthrough + eval go/no-go + second-domain smoke + §-closure.

## 10. Risks
- R1. **Jargon / comprehension** (SPEC-001 Q2, REV-004). "Bounded context" is heavy DDD. Mitigate:
  business-language surface ("Areas"), progressive disclosure, in-product glossing; UX review owns
  the wording. **(Owner: UX review.)**
- R2. **Is a partition the right model?** Real businesses have capabilities that legitimately
  straddle boundaries (shared kernels). A strict single-membership partition (BC2) may be too rigid.
  Mitigate: start strict (clean map, clear validators); revisit shared-kernel/context-mapping in the
  deferred relationships spec (N0). **(Owner: domain review — challenge this.)**
- R3. **Layer fatigue / value.** Three layers (capabilities, areas, entities) risk overwhelming the
  operator. Mitigate: Areas is the *coarsest*, most intuitive layer — arguably it should be the
  *default* lens, with entities the drill-down. **(Owner: product review.)**
- R4. **Generation stability / determinism.** Clustering is less determinate than 1:1 derivation;
  the LLM may re-partition differently run-to-run. Mitigate: deterministic mock; pin snapshot;
  stable slug ids; grounded provenance; repair-once. **(Owner: AI review.)**
- R5. **IR id collisions / node explosion** — mitigated by `bctx:` namespacing and a flat partition
  (N4). **(Owner: architecture review.)**

## 11. Open questions (for reviewers)
- Q1. **Default lens** — should Areas become the *default* view (coarsest, most operator-friendly),
  with capabilities/entities as drill-downs? Or an overlay on the existing capability map?
- Q2. **Inter-context adjacency** — derive a **read-only** "these two areas interact" hint (from
  cross-boundary `depends_on`/shared entities) now, even though typed context-mapping (N0) is
  deferred? Cheap situational awareness vs. scope creep.
- Q3. **Ubiquitous language** — capture a few key terms/nouns per context now (a light glossary), or
  defer entirely (N1)?
- Q4. **BC9 cohesion** — ship the cohesion warning in this spec, or defer as LLM-judgment like V3?
- Q5. **Strictness** — enforce a strict partition (BC2 single-membership, R2), or allow a capability
  in multiple contexts from day one (shared kernel) with a warning instead of an error?
- Q6. **Surface label** — "Areas" / "Bereiche"? "Domains"? Something else? (UX review.)

## 12. Review & closure
*(Pending — five independent lenses: product-strategy, domain-modeling, ai-llm-feasibility,
technical-architecture, ux-hitl. Findings + disposition logged here to closure before `Approved`,
per CONVENTIONS §4.)*
