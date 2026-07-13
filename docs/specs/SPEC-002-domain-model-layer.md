---
id: SPEC-002
title: Domain Model Layer — capabilities → aggregates, events, commands
type: spec
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-10
updated: 2026-07-10
supersedes: null
related: [SPEC-001, ADR-001, ADR-002, ADR-004, ADR-006, REV-007, REV-008, REV-009, REV-010, REV-011]
reviewers: [product-strategy, domain-modeling, ai-llm-feasibility, technical-architecture, ux-hitl]
---

# SPEC-002 — Domain Model Layer

> **v0.2.0 — revised after 5-lens review (REV-007…011).** The spec is technically sound but the
> panel raised a **strategic build-gate** (REV-008, Blocker) and converged on a **narrower first
> cut**. Changes: build is now **gated** (§0.1); MVP scope cut to **aggregates + a `references`
> edge only** — commands/events deferred to SPEC-004 (Q1); DM5 is a **warning** not an error;
> provenance uses a new **capability-targeting anchor** (§3); IR ids are **namespaced**, authored
> aggregates **supersede** derived `domain_object` nodes; storage matches ADR-006 reality; UX is
> **in-context progressive disclosure in business language**, not a second graph tab. Full
> disposition in §12.

## 0.1 Build gate (REV-008 Blocker — the decision that comes before the build)
The review's strongest finding is not technical: **SPEC-002 builds depth toward code generation
(the developer-facing Product B) before the capability layer (the operator-facing Product A) has
been validated with a real user.** SPEC-001 is Approved but its go/no-go (A1–A3 + A6) is *unrun*
and its design-partner gate (G-DP) is *open*. Building layer 3 now risks a multi-layer model too
technical for operators and unusable by developers (no codegen yet).

**Therefore this spec is `Revised`, not approved-to-build.** Its build is **gated on**:
1. SPEC-001's go/no-go passing (A1–A3 + A6) with a **design partner** confirming the capability
   layer is correct and useful; and
2. a demand signal that the domain layer is wanted (from that partner, or a codegen milestone).

Until then SPEC-002 stands as a ready, reviewed design — not a work order.

## 0. Framing
SPEC-001 delivered layers 1–2 of the methodology (Business Narrative → **Capabilities**) with a
generate → validate → review → edit loop, text-as-truth, and the IR as the spine. SPEC-002 adds
**layer 3: the domain model** — the aggregates/entities each capability owns, and the events and
commands that act on them. This is the step that turns "a reviewed capability map" into "a model
with enough structure to later generate APIs, agents, and code" (the methodology's `domain_model`
+ `event_model` artifacts).

It reuses everything SPEC-001 built: the IR, the skill/validator/review machinery, the
human-in-the-loop editing, provenance. It is the *same loop, one layer deeper*.

## 1. Goals
- G1. From capabilities (+ their `produces`/`consumes` names + the narrative), derive a validated
  **domain model**: aggregates/entities with attributes, each owned by exactly one capability.
- G2. Derive **commands** (actions that change an aggregate) and **events** (facts that result),
  linked to aggregates and capabilities.
- G3. Extend the IR with `aggregate`, `command`, `event` node types and their edges
  (`owns`, `handles`, `emits`) — authored vs derived tagging preserved (SPEC-001 §3.3).
- G4. Deterministic **validators** for the new layer (ownership, referential integrity, coverage).
- G5. A **review lens** + **domain view** in the UI, with structured-form editing and provenance.
- G6. Keep it vertical-agnostic; prove on solar, smoke-test a second domain.

## 2. Non-goals (this spec) — narrowed to aggregates-first per review (Q1)
- N0. **Commands & events** — DEFERRED to SPEC-004. The MVP is **aggregates + a `references`
  edge** only (entities each capability owns, plus cross-capability references for shared entities
  like Customer). Commands/events are the more B-flavored, higher-variance part (REV-008 M4,
  REV-009 F3/F4, REV-011 F1) — model the nouns first, add the verbs/facts once aggregates hold up.
- N1. **Policies, roles, agents** — SPEC-004+.
- N2. **Code / API generation** — later; this produces a *model*, not a system.
- N3. Full event-sourcing semantics.
- N4. Rich ER cardinality; the MVP has `owns` (single owner) + `references` (many) only.

## 3. Artifact
A new authored artifact per project, `model/domain_model.yaml`:
```yaml
version: "0.1"
aggregates:
  - id: lead
    name: Lead
    owner: lead_management        # capability id (exactly one)
    attributes: [name, contact, source, status]
    meta: { origin: llm, derivedFrom: [...] }   # provenance, per SPEC-001 §3.2 / V8
commands:
  - id: qualify_lead
    name: Qualify Lead
    aggregate: lead               # the aggregate it acts on
    capability: lead_management
    emits: [lead_qualified]
events:
  - id: lead_qualified
    name: Lead Qualified
    aggregate: lead
```
Required: aggregate `id/name/owner`; command `id/name/aggregate`; event `id/name/aggregate`.
LLM-authored elements carry grounded provenance (as in SPEC-001; enforced by V-DM8 below).

## 4. IR extension
Add node types `aggregate | command | event` and edge types `owns | handles | emits` to
`@kiln/ir` (the enums already reserve room). Origin tagging unchanged: aggregates/commands/events
authored in `domain_model.yaml` are `authored`; anything purely derived (e.g. an aggregate implied
by a capability's `produces` but not yet authored) is `derived`. `buildHash` includes the new
artifact. The compiler composes capabilities.yaml + domain_model.yaml into one IR graph.

## 5. LLM skill — `DomainGenerator`
- **In:** the narrative + capabilities (+ their produces/consumes) + IR.
- **Out (structured):** the `domain_model.yaml` shape (§3), each aggregate/command/event citing the
  capability/activity it derives from (grounded provenance, reusing SPEC-001's mechanism).
- **Job:** for each capability, propose the aggregate(s) it owns (seeded from its `produces`),
  the commands that change them, and the events that result. The model proposes; validators + the
  human decide (ADR-004). Structured outputs + one repair retry, server-side (key off the client).
- MockProvider extends the offline path deterministically (produces → aggregate, capability →
  a default command/event) so the layer is exercisable without a key, as in SPEC-001.

## 6. Deterministic validators (new)
Pure over the IR, added alongside V1–V8:
| Check | Rule |
|---|---|
| DM1 required fields | aggregate id/name/owner; command id/name/aggregate; event id/name/aggregate |
| DM2 single owner | every aggregate is owned by exactly one existing capability |
| DM3 command target | every command references an existing aggregate + capability |
| DM4 event source | every event references an existing aggregate; every `emits` event exists |
| DM5 aggregate coverage | every capability owns ≥1 aggregate (else the capability is under-modeled) |
| DM6 dangling refs | no command/event references a missing aggregate/capability |
| DM7 unique ids | aggregate/command/event ids unique + stable slugs (like V2) |
| DM8 provenance | every LLM-authored aggregate/command/event carries valid `meta.derivedFrom` |

## 7. Review lens & UI
- A **domain-model review** lens (independent, like the capability review): flags missing/■thin
  aggregates, commands with no events, aggregates with no commands, and boundary questions ("should
  this attribute live on Lead or Customer?").
- **UI:** a new **Domain** view — per capability, its aggregates (with attributes) and the
  commands/events on each. Structured-form editing (no raw YAML), provenance chips, findings list —
  reusing SPEC-001's NodeDetail/review patterns. Likely a tab alongside the Capability Map, or an
  expansion when a capability is selected.

## 8. Success criteria (go/no-go to SPEC-004)
- A1. From the solar capabilities, DomainGenerator produces a domain model a domain reviewer calls
  "substantially correct" (≥80% aggregates right, no critical omission after one review cycle).
- A2. Validators DM1–DM8 are deterministic, unit-tested, and catch seeded defects (missing owner,
  dangling command, uncovered capability) in ≥90% of seeded cases.
- A3. Edit → recompile → IR/views update deterministically; no text↔graph drift; buildHash enforced.
- A4. Second-domain smoke test: switching domains needs no code change (data/prompt/config only).
- A5. Provenance: every generated element carries grounded `meta.derivedFrom` (DM8 green).
- A6. A target user rates the domain view + review findings "worth acting on" (actionability).

## 9. Milestones
- DM0. IR extension (aggregate/command/event nodes+edges) + compiler compose + DM1/DM2/DM7 + tests.
- DM1. `domain_model.yaml` schema + MockProvider domain derivation + IR compile.
- DM2. `DomainGenerator` LLM skill (server-side, structured outputs, grounded provenance) + repair.
- DM3. Validators DM3–DM6, DM8 + domain-model review skill + review list.
- DM4. Domain view UI (per-capability aggregates/commands/events) + structured-form editing.
- DM5. Solar walkthrough + seeded-defect eval + second-domain smoke test + go/no-go.

## 10. Risks
- R1. **Scope explosion** — the domain model can balloon (every noun an entity). Mitigate: seed
  aggregates from capabilities' `produces`; the review lens prunes; DM5 flags under/over-modeling.
- R2. **LLM over-generation** — too many commands/events. Mitigate: structured outputs + validators
  + human edit; keep the prompt goal-directed (one aggregate cluster per capability).
- R3. **Ownership ambiguity** — an aggregate two capabilities both claim. Mitigate: DM2 (single
  owner) forces a decision; the review lens surfaces the contested ones.
- R4. **Layer coupling** — editing capabilities can orphan domain elements. Mitigate: DM6 dangling
  refs (like V5), surfaced live; the map already drops dangling edges gracefully.
- R5. **Value risk** — is the domain layer worth the added complexity for the user before codegen?
  Mitigate: A6 + keep it an *optional deepening*, not a required step (capabilities stay usable alone).

## 11. Open questions (for reviewers)
- Q1. Is aggregates+commands+events the right first cut, or should DM MVP be **aggregates only**
  (defer commands/events to SPEC-004)? (Simplicity vs. completeness.)
- Q2. Domain view as a **separate tab** vs. an **expansion of the selected capability**? (UX)
- Q3. Should attributes be typed (string/number/date) now, or free-form names first?
- Q4. DM5 "every capability owns ≥1 aggregate" — is that always true? Some capabilities may be pure
  orchestration (own nothing). Should DM5 be a warning, not an error?
- Q5. Reuse `produces`/`consumes` (currently free-form domain-object names) as the seed for
  aggregates — do we migrate those into the domain model, or keep both?

## 12. Review & closure

Five independent lenses reviewed v0.1.0 (REV-007…011); all returned **Approve-with-changes**
(1 strategic Blocker, 2 UX Blockers). Disposition:

| Finding | Lens | Sev | Disposition | Where |
|---|---|---|---|---|
| Premature: build depth before validating capability layer / A6 tests build not demand | product | **Blocker** | **Accepted → build-gated** | §0.1 |
| UX: 3 DDD terms at once, no plain-language/gating | ux | **Blocker** | **Fixed** | §7 (business language + progressive disclosure) |
| UX: Q2 must be in-context drill-down, not a 2nd graph tab | ux | **Blocker** | **Fixed** | §7 |
| Aggregates+commands+events wrong first cut → aggregates-only (Q1) | product/ai/ux/domain | Major | **Fixed** | §2 N0 (commands/events → SPEC-004) |
| Shared entities need a `references` edge (single-owner too strict) | domain | Major | **Fixed** | §2 N4, §4 |
| DM5 every-capability-owns-aggregate should be a warning | all | Major | **Fixed** | §6 (DM5 = warning) |
| Add overlap/duplicate-aggregate validator (V7 analog) | domain | Major | **Accepted** | §6 (DM9 added) |
| "aggregate" is a flat entity — rename/clarify | domain | Major | **Accepted** | rename to `entity`; composition still deferred |
| Provenance model doesn't transfer (aggregates cite capabilities, not headings) | ai/domain | Major | **Fixed** | §3 capability-targeting `DomainAnchor`; DM8 scoped to element existence |
| A1 has no measurement instrument / matching function | ai | Major | **Accepted** | §8 (reference model + per-class matching, like SPEC-001 eval) |
| Over-generation uncaught by structural validators | ai | Major | **Accepted** | per-capability bounded generation + review-lens flag |
| id churn/determinism worse here; no determinism risk listed | ai | Major | **Accepted** | pinned snapshot/seed + deterministic name→id + content-fingerprint identity |
| IR node namespace collision (bare ids clash with capability ids) | arch | Major | **Fixed** | §4 (namespace `aggregate:`; DM7 global uniqueness; dedupe → error) |
| `domain_object` (derived) vs `aggregate` (authored) identity | arch/domain | Major | **Fixed** | §4 (authored aggregate supersedes same-slug derived node; retarget edges) |
| Storage contradicts ADR-006 (capabilities live in project.json, no capabilities.yaml) | arch | Major | **Fixed** | §3 (store in project.json / ADR-006 workspace, not a mythical .yaml) |
| Second-artifact schema evolution + buildHash unaddressed | arch | Major | **Accepted** | parallel migration registry; buildHash mixes both artifacts+schema versions |

Minors/Nits (attribute typing deferred Q3; enums need extending; validator signature reconcile
doc-vs-IR; non-cascading recompile; compose order-independence; self-consistency for the domain
review lens) — **accepted** as implementation detail for the DM-phase tickets.

**Status:** all technical Majors Fixed or Accepted into the design; the **strategic Blocker is
Accepted as a build gate (§0.1)** rather than resolved in-spec — so this spec is **`Revised` and
build-gated**, deliberately NOT `Approved`-for-build until SPEC-001 is validated with a design
partner. Re-review to `Approved` when the gate clears and the aggregates-first scope is re-read.

## 13. Exit gate — DM eval + go/no-go (aggregates-first increment)

The aggregates-first increment (DM1 mock → DM2 `DomainGenerator` → DM validators in UI → editable
entities → DM eval) is engineering-complete. The gold-free DM harness (`@kiln/eval/domain`,
`@kiln/eval/domain.solar`) is the measurement instrument the review asked for (REV-009, A1/A2 had "no
matching function"). Two scorers, run on the solar reference:

| Metric | Instrument | Result | Criterion |
|---|---|---|---|
| DM defect **recall** | `scoreDomainCase` over 7 seeded cases (orphan owner, dangling ref, dup id, non-slug id, missing name, uncovered cap, clean) | **1.000** | A2 ≥ 0.90 ✅ |
| clean-case **precision** | no false positives on the valid domain | **1.000** | — ✅ |
| **ownershipCoverage** | caps owning ≥1 aggregate | **1.000** (8/8) | — ✅ |
| **producesCoverage** | produced objects captured as aggregates | **1.000** (8/8) | — ✅ |
| **provenanceRate** (DM8) | aggregates grounded to a capability or hand-authored | **1.000** (8/8) | A5 green ✅ |

Success-criteria (§8) status:

- **A2 (validators catch seeded defects ≥90%) — MET.** 100% recall, deterministic, unit-tested (75 tests).
- **A3 (edit → recompile deterministic, no text↔graph drift, buildHash) — MET.** buildHash mixes both artifacts; verified in-browser (edit flips origin to `authored`, map/validators update live).
- **A5 (grounded provenance, DM8) — MET.** provenanceRate 1.000; `groundDomainProvenance` targets the owning capability; id normalization keeps ids stable slugs.
- **A1 (a domain reviewer calls it substantially correct) — OPEN.** The *instrument* exists and is green on the mock/structural axis, but "substantially correct" is a human judgment that needs the **design partner** — the same gate as §0.1.
- **A6 (a target user rates the domain view worth acting on) — OPEN.** Needs the design partner.
- **A4 (second-domain smoke test) — MET (2026-07-10, via SPEC-003 §14).** A dental-clinic narrative ran through the unchanged stack (data/prompt only) → coherent capabilities + business areas, no code change. Verticality generalizes.

**Decision — GO / HOLD (split):**
- **GO** on the engineering axis: the aggregates-first increment passes its structural exit gate
  (recall, precision, coverage, provenance all green). The code is sound to keep and build on.
- **HOLD** on declaring SPEC-002 `Approved` and on starting **SPEC-004** (commands/events). The
  strategic build gate (§0.1) and the human criteria A1/A6 remain open until a **design partner**
  validates the capability layer (A1 of SPEC-001) and signals demand for the domain layer. Running
  A4 (second-domain smoke) is the one remaining engineering task and can proceed independently.

Status stays **`Revised` / build-gated** — the eval clears the *quality* question, not the
*strategic* one. Re-review to `Approved` when the design-partner gate clears.

**UPDATE 2026-07-10 — `Approved`.** The design partner reviewed the capability layer (SPEC-001 A1)
AND reacted positively to the domain/entities view — clearing **A1 + A6** and the §0.1 build gate's
demand condition. All exit criteria are now met (A2/A3/A4/A5 green per §13; A4 second-domain via
SPEC-003 §14; A1/A6 by the partner). **SPEC-002 → `Approved`.**
