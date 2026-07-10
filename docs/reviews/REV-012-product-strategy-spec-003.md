---
id: REV-012
title: Product & Strategy review of SPEC-003 (Bounded Contexts)
type: review
status: Approved
version: 1.0.0
author: "Claude (Opus 4.8) — product-strategy lens"
created: 2026-07-10
updated: 2026-07-10
reviews: SPEC-003
lens: product-strategy
verdict: Approve-with-changes
related: [SPEC-003]
reviewers: [product-strategy]
---

# REV-012 — Product & Strategy review of SPEC-003

## Summary

SPEC-003 is a clean, well-scoped design that reuses the SPEC-001/002 substrate (IR, validators,
skills, HITL, provenance, eval) exactly as intended, and its marginal build cost is genuinely low
and reversible. Two things have materially improved the risk posture since REV-008: (a) a design
partner is now **engaged**, so the value gate can actually be *run* this time rather than assumed;
and (b) of the remaining methodology layers, the coarse operator-facing grouping is a more
defensible next step than the developer-flavoured commands/events. Those facts are why this is
**Approve-with-changes**, not a harder verdict.

But the strategic core of REV-008 has **not** been internalised — it has reappeared one layer
*sideways*. SPEC-003's stated reasons to exist are **methodology completeness** ("the missing
rung," §0) and **owner preference** ("the product owner has chosen the full-methodology path," §0)
— the exact "completeness for its own sake" failure mode REV-008 named. Its "build-eligible, not
build-gated" claim rests on **half** of SPEC-002's two-part gate (the capability layer was
validated; a *demand signal for this specific layer* was not), plus a **new, unreviewed** premise —
"coarser = lower risk." And §8's success criteria are, once again, five correctness/internal metrics
plus one soft, unthresholded value criterion (A6) — structurally identical to the pattern REV-008
flagged as a **Blocker**. Meanwhile the layer is partly justified as **Product B** ("the seams a
future codegen step would turn into deployable modules/services," §0) while gated only as **Product
A** — REV-008's central inversion, recurring.

Recommendation: keep the spec and the substrate work, but (1) add a **primary demand/value gate**
before build and stop letting correctness metrics stand in for a value decision (Blocker);
(2) **run the second-domain proof already owed by SPEC-002** before adding a third solar-only layer
(Major); (3) do **not** pre-commit Areas as the default lens (Major); (4) **own the Product-B
rationale** honestly rather than smuggling codegen seams under an operator value test (Major).
One Blocker and three Majors to resolve before this leaves the runway.

## Findings

### Blocker

**F1 — §0 "Risk posture" + §8: the "build-eligible" claim leans on a partial gate and the
success criteria test correctness, not demand — REV-008 B1 recurring.**
*Location:* §0 (the "Risk posture vs SPEC-002" paragraph), §8 (A1–A6).
*Issue:* Three compounding problems.
(a) **Partial gate.** SPEC-002 §0.1 gated build on *two* conditions: (1) the capability layer
validated by a design partner, **and** (2) "a demand signal that the [next] layer is wanted." The
task context confirms only condition (1) cleared (the partner validated SPEC-001 A1). SPEC-003
supplies **no demand signal for the areas/bounded-context layer itself** — its justification is
methodology completeness (§0 "the missing rung") and owner choice (§0 "full-methodology path").
REV-008 explicitly named methodology/owner completeness as the failure mode and said the *primary*
gate must be demand. So the second gate condition is unmet, not cleared.
(b) **New unreviewed premise.** "Bounded contexts sit *on top of* the validated layer … so this
spec is build-eligible once reviewed, not build-gated" introduces "coarser ⇒ lower-risk ⇒
exempt-from-a-demand-gate" as if it were established. It is not. Lower *technical* risk (true) does
not imply lower *value* risk — a coarse layer nobody asked for is still budget spent on unproven
value.
(c) **Inverted criteria, again.** §8 has five correctness/internal metrics (A1 reviewer says
"substantially right"; A2 validator recall; A3 determinism; A4 coverage=1; A5 second-domain
smoke) and exactly one value criterion, A6 — soft, unthresholded, and carrying the entire value
case. This is the same structure REV-008 flagged as a **Blocker** on SPEC-002.
*Recommended change:* Make a **demand/value gate the primary go/no-go**, not one of six. Concretely:
the now-engaged design partner should, *unaided*, reach for the Areas layer to do something they
could not with the capability map alone — or ask to keep it — before DM-style build proceeds. Rename
the posture from "build-eligible once reviewed" to "build-eligible once a demand signal for *this
layer* is defined and observed with the partner." Do not let A1–A5 (engineering correctness) or the
"coarser is safer" argument substitute for a value decision.

### Major

**F2 — §0 / §8 A5: leapfrogging the second-domain proof that SPEC-002 already owes.**
*Location:* §0 (reuse framing), §8 A5 ("second-domain smoke: … data/prompt/config only"),
G7 ("prove on solar").
*Issue:* The single largest strategic bet in the whole project is verticality generalisation —
"can ONE meta-model express a full vertical without collapsing into a general-purpose language"
(the feasibility assessment's ~20% risk). SPEC-002 §13 records A4 (second-domain smoke) as **PARTIAL
/ unrun** — "a second-domain walkthrough has not been run." SPEC-003 proposes to add a **third
solar-only layer** and again defers the second-domain proof to A5 as one-of-six. This deepens sunk
investment in an as-yet-unproven-general stack while the cheaper, higher-information experiment
(does any of this survive contact with a second vertical) keeps slipping. Sequencing is inverted:
proving **breadth** (a 2nd domain) is more decision-relevant than adding **height** (a 3rd layer).
*Recommended change:* Make running SPEC-002's owed second-domain smoke (ideally a second-domain
*capability* pass) a **hard precondition or concurrent track**, not a deferred success criterion.
De-risk the generalisation bet before compounding on top of solar-only again.

**F3 — §0 Q1 / R3: "Areas as the default lens" is an unvalidated bet made too early, and risks
three-layer fatigue for the operator.**
*Location:* §0, Q1 ("should Areas become the *default* view"), R3 (layer fatigue).
*Issue:* Making Areas the default reorganises the product's *primary* navigation around a brand-new,
unvalidated layer — pre-judging the very value question A6 is meant to answer. And the value of a
grouping layer scales with the number of things grouped: for a solar business with ~8 capabilities,
a 3-area partition may add a navigation tier without adding legibility (8 items are already
navigable). Bounded contexts earn their keep at *enterprise scale* and as *codegen module seams* —
which skews Product B, not the SMB operator (Product A). R3's own mitigation ("Areas is the coarsest,
so make it the default") is a plausible hypothesis, not a validated one.
*Recommended change:* Answer Q1 as **optional overlay/lens first — NOT the default.** Keep the
capability map as the default view; promote Areas to default only if A6 shows operators actually
reach for it. Do not restructure primary navigation ahead of the value evidence.

**F4 — §0: the layer is justified partly as Product B (codegen module/service seams) but gated
only as Product A — REV-008's central inversion, recurring.**
*Location:* §0 ("the seams a future codegen step would turn into deployable modules/services"),
§7/R1 (the term "bounded context" hidden behind "Areas").
*Issue:* "Bounded context" is DDD/architecture vocabulary, and §0 states its downstream purpose is
codegen boundaries — a **developer/Product-B** rationale. Yet the only value gate (A6) is
operator-facing. This is exactly REV-008 B1: *justified as B, validated as A.* The fact that R1 must
**hide the concept's real name** from the user is itself a tell — if the operator can only be shown
a euphemism, interrogate whether the operator needs the concept at all, or whether it exists for the
compiler/developer.
*Recommended change:* State plainly in §0 whether bounded contexts are being built primarily as a
**B-substrate** (codegen seams / methodology completeness) or an **A-feature** (the operator's coarse
map). If the honest driver is B or methodology completeness, own it and gate on a codegen/technical-
persona demand signal — don't route it through an operator value test it was not designed to pass.

### Minor

**F5 — §Q5 / R2: a strict single-membership partition is a product-*trust* risk, not just a
modeling choice.**
*Location:* Q5, R2, BC2 (single-membership).
*Issue:* VBD's entire wedge is *trust in a checkable model* (SPEC-001 §0). A confidently-wrong
partition — forcing single membership where the business genuinely matrixes (e.g. Customer / Offer
management spanning Sales **and** Delivery) — produces a clean-but-wrong map, which erodes exactly
that trust. The domain lens owns the modeling verdict; from a product view the concern is that a
rigid partition can *manufacture* wrong boundaries the operator will notice.
*Recommended change (product framing):* From day one, treat single-membership as a **soft default
with a warning**, allowing multi-membership (shared kernel) rather than a hard BC2 error. A clean
partition is a good *default*, not a truth to force. This keeps the map representable when reality
straddles, protecting trust.

**F6 — §8 A6: the value criterion repeats SPEC-002's under-specified wording.**
*Location:* A6 ("rates the Areas view 'clarifying' / 'worth acting on'").
*Issue:* No threshold, no instrument, no demand action — the same softness REV-008 M2 flagged on
SPEC-002's A6. "Clarifying" is a satisfaction rating, not a demand signal.
*Recommended change:* Give A6 a concrete instrument and a **demand** framing to match A1/A2's rigor:
e.g., "the partner uses Areas to make a grouping/prioritisation decision they could not make from the
capability map alone, in a moderated session," with a defined pass bar. Fold into the F1 primary gate.

## Answers to §11 open questions (product-strategy lens)

- **Strategic build-eligibility claim (§0):** **Not established.** The two-part SPEC-002 gate is only
  half-cleared; "coarser = lower risk" conflates technical risk with value risk; and the success
  criteria repeat the inverted correctness-not-demand pattern. Build-eligibility should hinge on a
  defined, observed demand signal for *this* layer (F1) and on the owed second-domain proof (F2).
- **Q1 (Areas as default lens):** **No — optional overlay/lens first, not the default** (F3). Keep the
  capability map as the default; promote Areas only if A6 shows operators reach for it. Defaulting to
  Areas pre-judges the value question and risks three-tier fatigue at SMB scale.
- **Q5 (strict partition vs. multi-membership):** **Allow multi-membership with a warning; soft
  strictness** (F5). A strict single-membership partition is legible but can produce a confidently-
  wrong map where the business matrixes — a direct hit to VBD's trust wedge. Clean partition as a
  default, not a hard error. (Defer the modeling mechanics to the domain lens.)

## Closing summary

The engineering is sound, the substrate reuse is cheap and reversible, and — importantly — a design
partner is now available to run a real value test, which materially de-risks this versus SPEC-002.
That earns an **Approve-with-changes**. But SPEC-003 has absorbed REV-008's *tactical* lessons
(reuse the substrate, hide the jargon, keep it a partition) while missing its *strategic* one: it is
still driven by methodology completeness and owner preference, still gated on correctness rather than
demand, still leans toward Product B while measuring Product A, and still wants to add a third
solar-only layer before the second domain has ever been tried. Resolve F1 (primary demand gate),
F2 (run the owed second-domain proof), F3 (don't default to Areas), and F4 (own the B rationale)
before this becomes a work order.
