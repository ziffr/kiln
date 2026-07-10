---
id: REV-007
title: Domain-Modeling (DDD) Review of SPEC-002
type: review
status: Approved
version: 1.0.0
author: "Reviewer (domain-modeling)"
created: 2026-07-10
updated: 2026-07-10
reviews: SPEC-002
lens: domain-modeling
verdict: Approve-with-changes
related: [SPEC-002]
---

# REV-007 — Domain-Modeling (DDD) Review of SPEC-002

## Summary

SPEC-002 makes the right structural bet: model the domain layer as **aggregates + commands +
events**, tag origin, ground provenance, and gate everything on deterministic validators plus a
human. As a *mechanism* it reuses SPEC-001 cleanly and I have no quarrel with the loop. Judged as
a *domain model*, though, the spec is under-built in exactly the places DDD lives, and one of its
headline invariants ("every capability owns ≥1 aggregate", DM5) is wrong as written and will
actively *induce* bad models.

The single biggest gap is that the model has **exactly one relationship — ownership — and no way
to express a reference**. DDD models are mostly references: `Billing` needs `Customer`,
`Scheduling` needs `Installation`, but each is *owned* elsewhere. With single-owner ownership as
the only edge, the first real solar model hits a wall: a concept two capabilities both need must
either be duplicated (two owners → DM2 fails → a forced, possibly-wrong merge) or cannot be
expressed at all. That is not a dead-end — it is one missing edge type — but it must land before
DM1/DM2, not after.

Second, the node the spec calls an **"aggregate" is really a flat entity**: attributes are bare
names, there is no aggregate-root vs. member-entity vs. value-object distinction, and N4 defers
*all* relationships including aggregate-internal composition. So an "aggregate" cannot be
expressed as anything more than an attribute bag — the one piece of structure that makes an
aggregate an aggregate (a root that bounds a consistency cluster) is absent.

Third, two invariants are miscalibrated: **DM5 should be a warning, not an error** (pure
orchestration / query / saga capabilities own nothing and forcing them to will make the LLM
invent junk aggregates), and there is **no overlap/duplicate-aggregate check** (the DM analog of
V7) — so the "contested ownership" risk R3 claims DM2 handles actually slips straight through.

None of this invalidates the approach; all of it is fixable inside the spec. **Approve-with-changes.**

Findings are ordered by severity. §11 open questions in my lens (Q1, Q3, Q4, Q5) are answered
inline and collected in §"Open questions".

---

## Findings

### D1 — Only ownership is modeled; no cross-capability reference edge (shared entities have no home)
- **Severity:** Major (top of stack; borderline Blocker)
- **Location:** §1 G1, §3 (artifact), §4 (IR extension), §6 DM2, N4
- **Issue:** The model admits exactly three edges — `owns | handles | emits` — and DM2 forces
  every aggregate to be owned by *exactly one* capability. Real domains are dominated by
  *references*: within the solar model, `Customer` is owned by (say) Customer Management but
  needed by Quoting, Installation Scheduling, Financing, and Support; `Installation` is owned by
  Operations but referenced by Billing and Support. DDD handles this with references-by-id across
  aggregate/context boundaries (and, separately, with the same real-world concept modeled
  *differently* per context). SPEC-002 has no way to say "capability X *references* aggregate Y
  owned by Z." The only tools available are (a) duplicate the aggregate under a second owner —
  which DM2 rejects and R3 calls "contested" — or (b) don't express it. This will bite on the
  *first* real solar walkthrough (A1), because `consumes` (SPEC-001) is precisely the list of
  concepts a capability needs but does not own.
- **Recommended change:** Add a fourth edge type `references` (aggregate → aggregate, or
  capability → aggregate, by id) to the IR and a `references:` field on aggregates/capabilities in
  `domain_model.yaml`. Seed it from each capability's `consumes` (see D6). Keep DM2's single-*owner*
  rule — that is the sound part — but make "needed elsewhere" expressible as a reference, not a
  second ownership. Add a validator: every `references` target must resolve to an owned aggregate
  (a dangling-reference check, DM6 already half-covers this). Re-scope N4 accordingly (see D3).

### D2 — DM5 ("every capability owns ≥1 aggregate") is wrong as an error and will induce hallucinated aggregates
- **Severity:** Major
- **Location:** §6 DM5, §11 Q4, R1
- **Issue:** Q4 already suspects this, and it is correct to. Many legitimate capabilities own no
  aggregate: **orchestration / process-manager** capabilities (e.g. "Installation Coordination")
  coordinate *other* aggregates via policies; **query / reporting / read-model** capabilities own
  no write model; **saga**-like capabilities own only transient process state (a SPEC-003 concept,
  N1). Making DM5 a hard error means the LLM, which is graded against green validators, will
  fabricate an aggregate for every such capability just to pass — that is *worse* than the
  under-modeling DM5 is meant to catch, and it directly amplifies R1 (scope explosion) and R2
  (over-generation). The validator would be manufacturing the defect it claims to detect.
- **Recommended change:** Demote DM5 to a **warning** surfaced by the review lens ("this
  capability owns no aggregate — is it pure orchestration, or under-modeled?"). Better: add a
  capability `kind` (`operational | orchestration | query`) so DM5 fires as an error *only* for
  `operational` capabilities and is silent (or informational) for the rest. Ownership should be a
  property the human confirms, not one the generator is forced to satisfy.

### D3 — The "aggregate" node is a flat entity: no root / member / value-object distinction, no composition
- **Severity:** Major
- **Location:** §3 (artifact), §4 (IR), N4, §7 (review lens)
- **Issue:** An aggregate in DDD is defined by its *internal structure*: one root entity that is
  the sole external reference point and transactional boundary, zero-or-more member entities, and
  value objects, held together by composition. SPEC-002 models an aggregate as `{id, name, owner,
  attributes:[names]}` and N4 defers *all* relationships. The result is that an "aggregate" cannot
  express the one thing that makes it an aggregate — you cannot say "`OrderLine` is a member entity
  of the `Order` aggregate" or "`Money`/`Address` are value objects." Calling this node an
  "aggregate" is therefore aspirational; it is an entity-with-attributes. That is a fine MVP
  primitive, but the naming over-claims and the deferral (N4) is too broad: aggregate-internal
  composition is not "rich ER cardinality," it is the aggregate's spine.
- **Recommended change:** Pick one and state it: **(a)** honestly call the MVP node `entity` and
  reserve true `aggregate` (root + members + VOs) for when composition lands; or **(b)** keep
  `aggregate` but add a minimal composition edge (`root`/`member` marking on attributes-or-nested
  entities) and reserve a `value_object` node type now (additive schema). Split N4: defer *rich ER
  cardinality between aggregates*, but do **not** defer aggregate-internal composition and
  cross-aggregate references (D1). Even without types (Q3), mark which attribute(s) constitute the
  **identity**, since identity is what makes an entity an entity and enables reference-by-id.

### D4 — No overlap / duplicate-aggregate validator; "contested ownership" (R3) is unenforced
- **Severity:** Major
- **Location:** §6 (validators), R3, §7 (review lens)
- **Issue:** R3 claims "DM2 (single owner) forces a decision" on aggregates two capabilities both
  claim. It does not. DM2 only fires when two capabilities are asserted as owners of the *same
  aggregate id*. The common failure mode is the opposite: DomainGenerator emits `customer` (owner
  Customer Management) *and* `client` or `customer_account` (owner Billing) — two *different*
  aggregates that are the same real concept. Those pass DM1–DM8 clean. This is exactly the V7
  overlap check from SPEC-001, which the domain layer now lacks. Without it, the scope-explosion
  (R1) and contested-ownership (R3) risks have no deterministic backstop and rest entirely on the
  LLM review lens.
- **Recommended change:** Add **DM9 — duplicate/overlap aggregate**: flag aggregates whose
  name/attribute-set similarity across *different* owners exceeds a threshold (mirror V7's ≥0.85
  name/purpose heuristic) as `overlap` candidates for the review lens to adjudicate (merge, or make
  one a reference to the other — see D1). This is the deterministic half of R3.

### D5 — A command may emit events on a different aggregate, silently crossing the consistency boundary
- **Severity:** Major
- **Location:** §3 (artifact: `command.emits`), §6 DM3/DM4
- **Issue:** DM3 ties a command to one aggregate (correct — a command mutates a single aggregate
  root). DM4 ties an event to an aggregate and checks `emits` targets exist. But nothing constrains
  a command's emitted events to the command's *own* aggregate. `qualify_lead` (aggregate `lead`)
  emitting `customer_created` (aggregate `customer`) passes both DM3 and DM4 — yet that is a
  cross-aggregate effect, which in DDD is a **policy / process manager / saga**, explicitly
  deferred to SPEC-003 (N1). Allowing it here lets the model encode sagas as if they were direct
  emissions, quietly violating the aggregate as the transactional boundary and pre-empting the
  policy layer with an unmodeled shortcut.
- **Recommended change:** Add a validator: **every event in `command.emits` must share
  `command.aggregate`.** A command's events belong to the command's aggregate; anything
  cross-aggregate is a reaction that must wait for the policy layer (SPEC-003). This keeps the
  aggregate boundary honest and keeps SPEC-002 within its stated non-goals.

### D6 — produces/consumes → aggregate seeding (Q5) bakes in "every produced noun is an aggregate" and creates dual truth
- **Severity:** Major
- **Location:** §5 (skill seeding), §11 Q5, R1
- **Issue:** Seeding aggregates 1:1 from `produces` assumes every produced noun is an owned
  aggregate. In practice `produces` mixes aggregates, value objects, documents, events, and read
  models (`Quote`, `Report`, `Confirmation`). A 1:1 mapping is precisely the scope explosion R1
  warns about. Meanwhile `consumes` is the single strongest signal you already have for a
  cross-capability *reference* (D1) — it names things owned elsewhere — yet the spec is silent on
  using it. And Q5's "keep both?" option is a trap: retaining free-form `produces/consumes` *and*
  authored aggregates as parallel truths violates SPEC-001's single-source-of-truth invariant and
  invites text↔graph drift.
- **Recommended change (answers Q5):** **Migrate, don't keep both.** Treat `produces` as
  *candidate owned aggregates* (derived, human-promoted to authored — not auto-authored 1:1), and
  `consumes` as *candidate references* (D1), never as new owned aggregates. Once a `produces`
  entry is promoted to an authored aggregate, the free-form name is superseded by the aggregate id
  (one source of truth). Promotion — not auto-generation — is what keeps R1 in check and puts the
  human on the boundary decision.

### D7 — Relationship to SPEC-001's existing derived `domain_object` node is undefined (duplication risk)
- **Severity:** Minor
- **Location:** §4 (IR extension), SPEC-001 §3.3/§3.4
- **Issue:** SPEC-001 already emits a **derived, read-only `domain_object`** node from a
  capability's `produces` (e.g. `produces:[Lead]` → derived `domain_object` "Lead"). SPEC-002 now
  authors an `aggregate` "lead" for the same concept. The spec does not say whether the authored
  aggregate *promotes* (replaces) the derived `domain_object` or coexists with it. Coexistence
  yields two IR nodes for one concept — drift and confusing views.
- **Recommended change:** State that authoring an aggregate **promotes** the corresponding derived
  `domain_object` (same id, origin flips `derived → authored`); the derived node is not retained in
  parallel. This dovetails with D6's promotion model.

### D8 — Untyped attributes (Q3) are fine, but identity is unexpressible; reserve the slots now
- **Severity:** Minor
- **Location:** §3 (attributes), §11 Q3
- **Issue:** Free-form attribute names first is the right call (Q3) — typing before boundaries are
  stable is premature precision. But with bare names you also cannot mark the aggregate's
  **identity** attribute(s), and identity is what distinguishes an entity from a value object and
  what a reference-by-id (D1) points at.
- **Recommended change (answers Q3):** Keep attributes as free-form *names* for the MVP, but make
  the schema additive-ready: reserve an optional `type` and an optional `identity: bool` (or a
  designated key attribute) per attribute. Typing stays deferred; identity becomes expressible when
  D1's references need a target key.

### D9 — Minor clarity / silent non-goals
- **Severity:** Nit
- **Location:** §4 (`handles`), §3, §7
- **Issues & changes:**
  - `handles` edge semantics are ambiguous — does a *capability* handle a command, or an
    *aggregate*? The artifact carries both `command.capability` and `command.aggregate`. State
    which endpoint `handles` connects.
  - **Value objects** are absent with no acknowledgement. Make it an explicit non-goal (like N1–N4)
    rather than a silent omission, so it is a decision, not a gap.
  - Event past-tense / command-imperative naming is a real DDD convention; leaving it to the LLM
    review lens (not a deterministic validator) is acceptable — but say so explicitly in §7 so it
    is not assumed covered by DM1–DM8.

---

## Open questions (domain-modeling lens)

- **Q1 — triad vs. aggregates-only:** Keep the **triad**, with a sequencing tweak. Aggregates-only
  would under-build the `event_model` artifact the methodology wants and starve later codegen.
  But commands and events are near-duals (an event is the past-tense fact of a command), so
  generating both freely doubles the over-generation surface (R2). Recommendation: **anchor on
  events** (event-storming's primary, least-ambiguous unit — "what happened"), derive commands
  from events, and make **commands optional** in the DM MVP. Net: aggregates + events required,
  commands derived/optional — richer than aggregates-only, cheaper than a free triad.
- **Q3 — typed vs. untyped attributes:** **Untyped (free-form names) first.** Reserve `type` and an
  `identity` marker in the schema now so later typing is additive (see D8).
- **Q4 — DM5 as warning?:** **Yes — warning, not error** (see D2). Ideally gated on a capability
  `kind` so it is an error only for `operational` capabilities and informational for
  orchestration/query.
- **Q5 — migrate produces/consumes or keep both?:** **Migrate, don't keep both** (see D6).
  `produces` → candidate owned aggregates (human-promoted, not 1:1 auto-authored); `consumes` →
  candidate *references* (D1), never new owned aggregates. Free-form names are superseded by
  aggregate ids to preserve single-source-of-truth.
- **Q2 (tab vs. expansion)** is a UX-lens question; deferred to that reviewer. One domain note: the
  Domain view must be able to render a **reference** (D1) from one capability to an aggregate owned
  by another, so a strict per-capability expansion that only shows *owned* aggregates will hide the
  most important structure. Favor a view that shows owned-plus-referenced.

## Verdict

**Approve-with-changes.** The loop and the triad are the right first cut; the ownership/reference
model, the aggregate primitive, and two validators (DM5, the missing overlap check) need the
changes above — most of them before the DM1/DM2 milestones, since they are structural, not cosmetic.
