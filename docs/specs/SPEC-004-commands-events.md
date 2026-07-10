---
id: SPEC-004
title: Commands & Events — the behaviour layer on the domain model
type: spec
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-10
updated: 2026-07-10
supersedes: null
related: [SPEC-001, SPEC-002, SPEC-003, RES-001, ADR-001, ADR-002, ADR-004, ADR-006, REV-017, REV-018, REV-019, REV-020, REV-021]
reviewers: [product-strategy, domain-modeling, ai-llm-feasibility, technical-architecture, ux-hitl]
---

# SPEC-004 — Commands & Events

> **v0.2.0 — reviewed to closure (REV-017…021, all Approve-with-changes; 3 Blockers, ~22 Majors),
> then BUILD DEFERRED by owner decision.** The product Blocker (REV-017 B1) is the third recurrence of
> "the codegen thesis that justifies the whole arc has never been probed." Owner decision: run a
> **codegen probe first** ([[RES-001]] — entities/areas → schema + API stub) to test model→code and
> to learn what commands/events must actually contain, *then* build SPEC-004 informed by it. This spec
> is therefore a **reviewed, closed design on the shelf** — all findings dispositioned in §13, ready to
> build when the probe clears — not a work order yet. The design fixes below are baked into the spec so
> it is build-ready.
>
> **v0.3.0 update — BUILT.** [[RES-001]] cleared (CRUD-only was the last codegen gap → this layer is
> empirically justified). SPEC-004 was un-shelved and built (CE-M0…M4 + eval); exit gate in §14 is
> green on every structural/quality/breadth axis (commandRecall 1.0; dental second domain clean).
> Status stays `Revised` pending the A6 partner value check.

> **The verbs and the facts.** SPEC-002 modelled the nouns (aggregates/entities each capability
> owns). SPEC-004 adds the **behaviour**: the **commands** that change an aggregate and the **events**
> that result — the methodology's `event_model`. This was in SPEC-002 v0.1 and was deliberately cut
> to "aggregates-first" (SPEC-002 §2 N0) so the nouns could be validated with a real user before the
> more B-flavoured, higher-variance verbs/facts were built. That gate has cleared: the design partner
> validated capabilities, entities, and areas. Same loop, one facet deeper on the domain model.

## 0. Framing
On each aggregate (SPEC-002), two new element kinds:
- A **command** is an imperative action that changes an aggregate — *Qualify Lead*, *Issue Invoice*,
  *Schedule Installation*. It is invoked within a capability and targets exactly one aggregate; it
  may **emit** one or more events.
- An **event** is a past-tense fact that resulted — *Lead Qualified*, *Invoice Issued*. It belongs to
  exactly one aggregate and is what other capabilities react to.

Commands/events are the seam a future codegen step turns into API operations + a message/event log,
but this spec produces a **model**, not a system (N3). It reuses the IR spine, skill/validator/review
machinery, HITL editing, grounded provenance, and text-as-truth from SPEC-001/002/003.

**Risk posture.** Lower strategic risk than SPEC-002/003 were at their start — the layers beneath are
partner-validated and Approved. The real risks here are *modeling* (event storming is easy to
over-produce) and *UX* (a fourth element kind must not overwhelm the operator). Both are addressed
below and are the reviewers' focus.

## 1. Goals
- G1. From capabilities + their aggregates (+ `produces`/`consumes` + the narrative), derive validated
  **commands** (each targeting one aggregate, invoked by one capability) and **events** (each belonging
  to one aggregate), with commands optionally emitting events.
- G2. Extend the IR with `command` + `event` node types and `handles` (capability→command) +
  `changes` (command→aggregate) + `emits` (command→event) + `on` (event→aggregate) edges, authored/
  derived tagging preserved.
- G3. Deterministic **validators** (`validateEvents`): required fields, referential integrity (command/
  event targets exist), unique/slug ids, provenance, and coverage smells.
- G4. An LLM **`EventModeler`** skill (server-side, structured outputs, grounded provenance, repair)
  + a deterministic **mock**.
- G5. A **UI**: commands/events shown **in-context under each entity** in the existing detail panel
  (no separate view — the SPEC-002/003 discipline), with structured-form editing + findings.
- G6. A gold-free **eval** (seeded-defect corpus + coverage) as the exit gate.
- G7. Vertical-agnostic; prove on solar + smoke-test the dental second domain.

## 2. Non-goals (this spec)
- N0. **Policies / reactions** (event → triggers → command across aggregates; sagas/process managers)
  — deferred to a later spec. This spec models commands/events, not the rules that wire events to
  downstream commands. (A read-only "which capabilities consume this event" hint MAY be derived; Q2.)
- N1. **Command input/output payload schemas** (fields/DTOs) — deferred; a command/event has a name +
  target here, not a typed payload (Q3).
- N2. **Full event-sourcing semantics** (streams, snapshots, replay) — later.
- N3. **Code / API / message-bus generation** — later; this produces a *model*.
- N4. **Temporal ordering / state machines** on an aggregate (which command is legal in which state)
  — deferred (Q4).

## 3. Artifact
Extend the domain artifact (SPEC-002) rather than add a third file — commands/events live *on*
aggregates, so they belong with them in `project.json` (ADR-006). Logical shape:
```yaml
version: "0.2"                # domain artifact version bumps: adds commands/events
aggregates:
  - id: lead
    name: Lead
    owner: lead_management
    # ... (SPEC-002 fields unchanged)
commands:
  - id: qualify_lead
    name: Qualify Lead
    aggregate: lead             # the aggregate it changes (exactly one)
    capability: lead_management # the capability that invokes it
    emits: [lead_qualified]     # events it produces (0..n)
    meta: { origin: llm, derivedFrom: [{ capability: lead_management }] }
events:
  - id: lead_qualified
    name: Lead Qualified
    aggregate: lead             # the aggregate it is a fact about (exactly one)
    meta: { origin: llm, derivedFrom: [{ capability: lead_management }] }
```
Required: command `id/name/aggregate/capability`; event `id/name/aggregate`. Ids are stable slugs,
namespaced in the IR (`command:` / `event:`). LLM-authored elements carry grounded provenance (CE6).

## 4. IR extension
Add node types `command | event` and edge types `handles | changes | emits | on` to `@vbd/ir`
(**union growth** — unlike SPEC-003, these are NOT yet reserved; the arch review should confirm the
addition is clean). Compose:
- one authored `command:<id>` node per command; `handles` edge `capability → command`; `changes` edge
  `command → aggregate:<id>`; an `emits` edge `command → event:<id>` per emitted event.
- one authored `event:<id>` node per event; `on` edge `event → aggregate:<id>`.
- `computeBuildHash` already mixes the domain artifact (SPEC-002) — the new commands/events ride in
  it; bump the domain **schema-version** so the hash distinguishes v0.1 from v0.2 domain docs.
- Authored/derived tagging unchanged; the app already composes the domain IR (SPEC-003 BC-M0 wired
  `compileCapabilities(activeDoc, domainDoc, contextsDoc)`).

## 5. LLM skill — `EventModeler`
- **In:** narrative + capabilities + their aggregates (id, name, owner, attributes) + IR.
- **Out (structured):** commands + events for the given aggregates, each citing the capability/anchor
  it derives from (grounded provenance).
- **Job:** for each aggregate, propose the commands that change it (seeded from the owning
  capability's purpose/outcomes) and the events they emit; keep it lean — a few clear commands per
  aggregate, no invented facts. The model proposes; validators + the human decide (ADR-004).
  Structured outputs + **one repair retry** (repair on any blocker or dangling target), server-side.
- **Mock (`mockGenerateEvents`)** — deterministic, offline: per aggregate, a `create_<agg>` /
  `update_<agg>` command emitting a `<agg>_changed` event, targeting the aggregate + its owner
  capability. Exercises the layer without a key.

## 6. Deterministic validators (`validateEvents`, isomorphic)
Pure over the domain doc (+ capability ids), added to `@vbd/validation`:
| Code | Sev | Rule |
|---|---|---|
| CE1.required | blocker/major | command id/name/aggregate/capability; event id/name/aggregate present |
| CE2.command_target | major | every command targets an existing aggregate AND an existing capability |
| CE3.event_source | major | every event belongs to an existing aggregate |
| CE4.emit_target | major | every `emits` references an event that exists |
| CE5.slug / CE5.unique | major/blocker | command/event ids are stable slugs (major) and unique across both (blocker) |
| CE6.provenance | major | every llm-origin command/event carries grounded `meta.derivedFrom` |
| CE7.no_command | minor | an aggregate with no command that changes it (can it change? under-modeled) |
| CE8.orphan_event | minor | an event emitted by no command (a fact with no cause) |

CE2–CE4 are the referential-integrity core; CE7/CE8 are coverage smells (warnings), the command/event
analogs of SPEC-002 DM5.

## 7. Review lens & UI (in-context, one surface)
- An **event-model review** lens: aggregates with no commands, commands with no events, events no one
  emits, and naming (imperative commands, past-tense events).
- **UI (REV-011/REV-016 discipline — no separate view):** commands/events render **inside the entity's
  block in the existing detail panel** (SPEC-002 entities are already there): under each entity, a
  compact **Commands** list (name → emitted events) and **Events** list. Structured-form editing (add/
  rename/delete a command; set its emitted events via a chip select; add/rename/delete an event),
  provenance chips, findings in the shared panel (clickable → the owning capability). Progressive
  disclosure: collapsed by default, expand per entity.
- **Generation:** a "Generate behaviour" (DE: *Verhalten generieren*) button, mirroring
  "Generate entities" / "Generate areas". Hand-edits flip origin to `authored`.

## 8. Success criteria (go/no-go)
- A1. From the solar entities, `EventModeler` produces commands/events a domain reviewer calls
  "substantially right" (≤1 review cycle).
- A2. `validateEvents` deterministic, unit-tested, catches seeded defects (dangling command target,
  missing event source, orphan emit, non-slug/duplicate id) in ≥90% of seeded cases (eval).
- A3. Edit → recompile → IR/views update deterministically; buildHash distinguishes domain v0.1/v0.2.
- A4. Solar coverage: every aggregate has ≥1 command and ≥1 event; provenanceRate = 1 (eval).
- A5. Second-domain smoke: the dental domain produces sensible commands/events, no code change.
- A6. The design partner rates the behaviour view "worth acting on" (value gate).

## 9. Milestones
- CE-M0. IR extension (command/event nodes + handles/changes/emits/on edges) + compose + domain
  schema-version bump + tests.
- CE-M1. `mockGenerateEvents` + compile + tests.
- CE-M2. `validateEvents` (CE1–CE8) + tests + seeded-defect eval corpus + coverage metrics.
- CE-M3. `EventModeler` skill (structured outputs, grounded provenance, repair) + `/api/events`.
- CE-M4. In-context commands/events UI (under each entity) + editing + findings + i18n + persistence.
- CE-M5. Solar walkthrough + eval go/no-go + dental second-domain smoke + partner value check + closure.

## 10. Risks
- R1. **Event-storm over-production** — the LLM can invent a command/event per verb in the narrative.
  Mitigate: lean prompt (a few per aggregate), CE7/CE8 coverage smells, the review lens prunes.
  **(Owner: domain review.)**
- R2. **Fourth element kind = cognitive overload** — capabilities + areas + entities + commands/
  events. Mitigate: in-context under the entity, collapsed by default, progressive disclosure; never a
  separate view. **(Owner: UX review.)**
- R3. **Generation determinism** — verbs vary more than nouns. Mitigate: deterministic mock, stable
  slug ids, grounded provenance, repair-once, pinned snapshot. **(Owner: AI review.)**
- R4. **Artifact coupling / schema evolution** — commands/events extend the domain doc (v0.1→v0.2);
  old snapshots lack them. Mitigate: schema-version in buildHash; tolerant coerce (absent = empty).
  **(Owner: architecture review.)**
- R5. **Scope creep toward policies/payloads** — the interesting-but-huge N0/N1. Mitigate: hard
  non-goals; a read-only consumer hint at most (Q2). **(Owner: product review.)**

## 11. Open questions (for reviewers)
- Q1. **Artifact placement** — extend the domain doc (commands/events on aggregates, as specced) or a
  separate `event_model` artifact? (Cohesion vs. separation / methodology fidelity.)
- Q2. **Event consumers** — derive a read-only "which capabilities react to this event" hint now (from
  `consumes` overlap), or defer with policies (N0)?
- Q3. **Command payloads** — capture a light input field list per command now, or defer (N1)?
- Q4. **Aggregate lifecycle** — any state/ordering on an aggregate now, or fully defer (N4)?
- Q5. **UI density** — commands/events under each entity in the SAME panel, or a per-entity expandable
  drawer? Where is the line before it's too much on one surface?
- Q6. **Naming enforcement** — should a validator enforce imperative commands / past-tense events
  (deterministically hard), or leave it to the review lens?

## 12. Review & closure

Five independent lenses reviewed v0.1.0 (REV-017…021); all **Approve-with-changes** (3 Blockers,
~22 Majors). Disposition below. **Build is deferred pending [[RES-001]] (the codegen probe)** per the
owner decision on the product Blocker; every technical/design finding is nonetheless resolved into the
spec so it is build-ready.

### 13. Finding disposition

| Finding | Lens | Sev | Disposition | Where |
|---|---|---|---|---|
| Codegen thesis never probed; gate on correctness not demand (3rd recurrence) | product B1 | **Blocker** | **Owner-accepted → codegen probe first** ([[RES-001]]); build SPEC-004 after | v0.2 note, §0 |
| Panel density realizes R2 — commands/events crowd an already-dense NodeDetail | ux F1 | **Blocker** | **Fixed** — hierarchical one-path-open disclosure; entity blocks collapse (one open); nested "What happens" expander; reject drawer (Q5) | §7 |
| "command"/"event" raw jargon in a business-language product | ux F2 | **Blocker** | **Fixed** — surface **Actions / What happens** (Aktionen / Was passiert); avoid "Results"↔Outcomes and "Aktionen"↔Akteure collisions; jargon secondary | §7, Q6 |
| Justified as Product B but gated as A; least operator-legible layer | product M1 | Major | **Accepted** — driver named honestly; probe tests the B thesis | §0, [[RES-001]] |
| §8 inverted (5 correctness + 1 soft A6); no value-primary reframe | product M2 | Major | **Fixed** — §8 makes A6 primary + adds a demand/threshold instrument | §8 |
| Behaviour-without-policies is thin standalone value | product M3 | Major | **Fixed** — pull the read-only **reacts-to hint** forward (Q2=yes) | §2 N0, §4, §7 |
| Commands-first vs event-storming (events-first) | domain CE-C1 | Major | **Fixed** — generate **events first, then commands**; de-CRUD the mock | §5 |
| "Command changes an aggregate" too coarse; a command may be rejected | domain CE-C2 | Major | **Fixed** — command is a *request*; `emits` is 0..n (reject paths emit none); drop any "≥1 event" rule | §0, §3, §6 |
| Nothing constrains emitted events to the command's own aggregate (hidden saga) | domain CE-C3 | Major | **Fixed** — **CE-emit-boundary** validator: `emits` events must be `on` the command's aggregate | §6 |
| CE6 provenance circular (grounds to own capability) — regresses from BC8 | domain CE-C4 / ai CE-F6 | Major | **Fixed** — ground to narrative/outcome **anchor** (the BC8 pattern), not members | §3, §5, §6 |
| Time-/external-triggered events unmodeled; CE8 false-positives them | domain CE-C5 | Major | **Fixed** — event `trigger: command|time|external`; CE8 exempts non-command triggers | §3, §6 |
| Events are islands without a reaction hint | domain CE-C6 | Major | **Fixed** — derive read-only reacts-to hint now (= product M3) | §4, §7 |
| No behaviour-quality instrument; A2/A4 hollow + no event-storm upper bound | ai CE-F1 | Major | **Fixed** — command-recall vs a human-blessed reference set + over-generation guardrails (the contexts-ARI lesson) | §8 |
| Repair trigger won't fire (CE2/3/4 are major, not blocker) | ai CE-F2 | Major | **Fixed** — repair allowlists `CE2./CE3./CE4.` + targets the prompt | §5 |
| No coerce/canonicalize across 3–4 id spaces | ai CE-F3 | Major | **Fixed** — `coerceEventsDoc(json, aggIds, capIds)` snaps ids before validation | §5 |
| EVENT_SCHEMA nested objects need `additionalProperties:false`; don't bound counts | ai CE-F4 | Major | **Fixed** — schema spec'd with the contexts fix; `emits` strings, no maxItems | §5 |
| Single-call leaves event-storm (R1) with no structural brake | ai CE-F5 | Major | **Fixed** — **per-aggregate fan-out** (commands/events are aggregate-local) | §5 |
| Invalidation wrong both ways — blanket domain:null wipes authored; no reconcile on aggregate edit | arch M1 | Major | **Fixed** — reconcile-not-clear + named App wiring | §4 |
| "domain schema-version" lever doesn't exist (global SCHEMA_VERSION only) | arch M2 | Major | **Fixed** — add a per-artifact domain schema-version to the hash (also pays REV-010 M5/REV-015 M2) | §4 |
| "Generate behaviour" must MERGE into domain, not replace it | arch M3 | Major | **Fixed** — patch merges commands/events, preserves aggregates | §5, §7 |
| `@vbd/store` cache hash omits domain → commands/events can't invalidate it | arch M4 | Major | **Fixed** — store passes domain to computeBuildHash/compile | §4 |

Minors/Nits (per-namespace CE5 uniqueness to avoid silent addNode drop; optional `commands?/events?`
for back-compat coerce; creation-command coverage smell; exempt reference-only aggregates from CE7;
rename IR edge `handles`→`issues`; naming stays a review-lens hint not a validator (Q6); name the
fan-out cost) — **accepted** into §5/§6/§7 or the CE-phase tickets.

**Status:** all UX Blockers **Fixed**; all technical/domain/AI Majors **Fixed or Accepted** into the
design; the **product Blocker is owner-accepted as "codegen probe first" ([[RES-001]])**. So this spec
is **`Revised` — a reviewed, closed, build-ready design, held on the shelf** until the probe informs
what behaviour must contain. Re-open to build (then `Approved` on its own §8 gate) after RES-001.

### Open-question resolutions
- Q1 artifact placement → **extend the domain doc**, but only after the M1 reconcile fix (arch).
- Q2 event consumers → **derive a read-only reacts-to hint now** (product M3 + domain CE-C6).
- Q3 command payloads → **defer** (RES-001 may reveal these are the real codegen need — N1).
- Q4 aggregate lifecycle → **defer** (N4); creation-command smell only.
- Q5 UI density → **same panel, hierarchical one-path-open disclosure, no drawer** (ux F1).
- Q6 naming → **review-lens hint only, no deterministic validator, never auto-correct** (bilingual).

## 14. Exit gate — CE eval + go/no-go (built after RES-001)

The codegen probe ([[RES-001]]) cleared: model→scaffolding works and **CRUD-only was the last codegen
gap → SPEC-004 was empirically justified**, so it was un-shelved and built (CE-M0…M4). The gold-free
harness (`@vbd/eval/events`) adds the quality instrument REV-019 CE-F1 demanded. Results:

| Criterion | Metric | Result | Verdict |
|---|---|---|---|
| A2 defect recall | `validateEvents` over 6 seeded cases | **1.000** | ✅ |
| — clean precision | no false positives | **1.000** | ✅ |
| A3 determinism | command/event nodes + issues/changes/emits/on edges; buildHash mixes domain; store cache threads domain (REV-020 M4) | verified | ✅ |
| A4 coverage | mock command/event coverage + provenanceRate (solar) | **1.000 / 1.000 / 1.000** | ✅ |
| A4 guardrail | max commands per entity (LLM, solar) | **5** (no event-storm) | ✅ |
| **A5 quality** | **commandRecall** of the LLM vs a human reference | **1.000** | ✅ |
| A5 second-domain | dental clinic: caps → entities → behaviour, **no code change** | 8 entities, domain-accurate behaviour, 0 findings | ✅ |
| A6 partner value | partner rates the behaviour view "worth acting on" | pending | ⛔ open |

**On A5 — a decisive quality result.** Unlike the contexts ARI (0.294, a granularity gap), the behaviour
`commandRecall` is **1.000**: the LLM recovered every reference command (Qualify/Convert Lead, Issue
Invoice, Record Payment) — event-storming, not CRUD. The design held up live: "Record Payment" emits
both `invoice_paid` **and** `invoice_payment_failed` (a command is a request that may be rejected);
"Invoice Overdue" carries `trigger: time` (the trigger discriminator); every emit stays within its
entity (no boundary violation). Grounded provenance, 0 findings.

**A5 second-domain (breadth).** The dental clinic, through the unchanged stack, produced rich
domain-accurate behaviour across 8 entities — *Record No-Show*, *Appeal Insurance Claim*,
*Propose/Accept/Reject Treatment Plan*, *Invoice Overdue (time)* — 0 findings, no code change.
Verticality generalizes for the behaviour layer.

**Decision — GO (engineering) / HOLD (Approved) on the partner:**
- **GO** — every structural + quality + breadth gate is green (defect recall, precision, coverage,
  provenance, guardrails, commandRecall 1.0, second domain). The layer is sound and shipped, and the
  codegen probe's last gap is now filled (behaviour beyond CRUD is modellable).
- **HOLD** on `Approved` until **A6**: the design partner (who validated capabilities, entities, and
  areas) reviews the behaviour view. Status stays **`Revised`** (engineering-complete, A6 pending),
  consistent with SPEC-002/003's posture before their partner sign-off. 134 tests; web build passes.

**UPDATE 2026-07-10 — `Approved`.** The design partner reviewed and signed off on the behaviour view,
clearing **A6**. With every structural/quality/breadth gate green and A6 met, **SPEC-004 → `Approved`**.
The full methodology arc (narrative → capabilities → areas → entities → commands/events) is now built
and partner-validated.
