---
id: REV-017
title: Product & Strategy review of SPEC-004 (Commands & Events)
type: review
status: Approved
version: 1.0.0
author: "Claude (Opus 4.8) — product-strategy lens"
created: 2026-07-10
updated: 2026-07-10
reviews: SPEC-004
lens: product-strategy
verdict: Approve-with-changes
related: [SPEC-004]
reviewers: [product-strategy]
---

# REV-017 — Product & Strategy review of SPEC-004

## Summary

SPEC-004 is a clean, disciplined design. It reuses the SPEC-001/002/003 substrate (IR, validators,
`EventModeler` skill, mock, HITL editing, grounded provenance, gold-free eval) exactly as intended;
its marginal build cost is low and reversible; and — to its real credit — it has absorbed the
*tactical* lessons of REV-008/REV-012 better than SPEC-003 did. It names its risks honestly (R2
cognitive overload, R5 scope creep toward policies/payloads), keeps the UI in-context under the
entity rather than as a fifth surface, hard-defers the huge B-flavoured pieces (policies N0,
payloads N1, ordering N4, codegen N3), and openly states that commands/events are "the seam a future
codegen step turns into API operations + an event log." That candour is progress.

But the *strategic* core that REV-008 raised as a Blocker and REV-012 raised again as a Blocker has
**not** been resolved — it recurs a third time, and on the layer where it bites hardest. Three
compounding problems:

1. **The compiler thesis has never once been probed.** §0 says the entire reason commands/events
   exist is codegen. After this spec the project will be **four model layers deep** (capabilities →
   areas → entities → behaviour) with **zero codegen slices** ever attempted. The one thing that
   would validate the Product-B premise — and reveal what commands/events must actually *contain* —
   has been deferred at every step, while model depth keeps accruing. Building a fourth layer to feed
   an unbuilt compiler is paving the on-ramp to a road that does not exist yet.

2. **Justified as B, validated as A — for the third time.** The layer's rationale is the codegen
   seam (Product B); its only value gate, A6, is operator-facing (Product A). Commands/events are the
   **least operator-legible of all four kinds** — "the Lead aggregate handles Qualify Lead which
   emits Lead Qualified" is event-storming vocabulary a solar founder does not think in. So the same
   inversion REV-008 B1 / REV-012 F4 named, now on the layer least able to survive an operator value
   test.

3. **§8's success criteria are inverted again** — five correctness metrics (A1 reviewer "substantially
   right", A2 recall, A3 determinism, A4 coverage, A5 second-domain) plus one soft, unthresholded
   value criterion (A6). This is the exact structure flagged as a Blocker twice. SPEC-004 has not even
   applied the "value-primary" §8 reframe the SPEC-003 panel forced — a small regression from where
   SPEC-003 landed.

On top of this sits a product finding specific to *this* spec: **behaviour-without-policies delivers
thin standalone value.** With policies (N0), payloads (N1), and ordering (N4) all deferred, what
remains is a static per-entity list of verbs and the facts they emit. The operator-legible value of
behaviour modelling lives in the *flow* — "when Lead Qualified, then Schedule Site Survey" — which is
precisely the part (N0) that is deferred. The layer is a correct incremental *B-substrate* brick but
a weak *A-facing* feature, and A6 is the only gate it is asked to pass.

Verdict: **Approve-with-changes** — as with REV-008/REV-012, the substrate work is sound, cheap and
reversible, and a design partner exists to run a real test, so this is not a Reject. But one Blocker
and three Majors should be resolved-or-owner-accepted before this becomes a work order. The single
highest-leverage change: pull the **read-only consumer/reaction hint (Q2) forward** so the layer
shows flow rather than a verb list, and seriously weigh a **thin codegen probe** as the higher-
information next investment than a fourth model layer.

## Findings

### Blocker

**B1 — §0 / §8: four model layers deep, the codegen thesis is still unprobed; the go/no-go tests
correctness + a soft operator A6, not demand for behaviour or a codegen signal (REV-008 B1 /
REV-012 F1, third recurrence, sharpened).**
*Location:* §0 (Framing: "the seam a future codegen step turns into API operations + an event log";
"That gate has cleared"), §8 (A1–A6).
*Issue:* SPEC-002 §0.1 defined a **two-part** gate: (1) the lower layer validated by a design partner,
**and** (2) "a demand signal that the [next] layer is wanted." §0 asserts "that gate has cleared"
citing the partner's validation of capabilities/entities/areas — but that is only condition (1).
No demand signal for **behaviour modelling specifically** is offered; the driver is again methodology
completeness ("same loop, one facet deeper") plus the codegen seam. Worse than in the prior specs,
the premise the whole layer rests on — that a *compiler* will consume this model — has **never been
tested even once**. The project is about to hold four validated model layers and zero evidence that
any of them compiles into anything. §8 then repeats the inverted pattern: five internal-correctness
criteria and one soft value criterion (A6, "worth acting on", no threshold, no instrument), so the
go/no-go can pass entirely on "we modelled the verbs correctly" while the strategic question — *is a
fourth model layer the right next spend, and is the compiler premise real* — is never asked.
*Recommended change:* (a) Make a **demand/codegen signal the PRIMARY go/no-go**, not one of six —
e.g. the design partner reaches for behaviour to make a decision they could not make from
entities/areas alone, OR a codegen milestone consumes the entity model. (b) **Seriously weigh a thin
codegen probe** (validated entities → a schema/API/type stub for one aggregate) as the next
investment *instead of or alongside* a fourth model layer: it is the highest-information experiment
available, it directly tests the Product-B premise that justifies this entire arc, and — critically —
it would **reveal what commands/events must actually contain** (do you need payloads? policies?
ordering?), de-risking the N1/N4 guesses this spec currently makes blind. (c) At minimum, rename the
posture from "that gate has cleared" to "build-eligible once a demand signal for *behaviour* is
defined and observed" and log it, as SPEC-003 §0/§13 did, rather than asserting clearance.

### Major

**M1 — §0: justified as Product B (codegen seam), gated only as Product A; and this is the least
operator-legible layer of the four (REV-008 B1 / REV-012 F4 recurring).**
*Location:* §0 (Framing, Risk posture), §8 A6, §7 (UI).
*Issue:* §0 states the layer's downstream purpose plainly — codegen (Product B). Yet A6, the sole
value gate, asks an operator/partner to rate "the behaviour view worth acting on" (Product A). Of the
four element kinds, this is the one whose content is genuinely developer vocabulary: capabilities map
to how a founder thinks; entities ≈ "things you track"; areas ≈ "parts of the business"; but
"imperative commands emitting past-tense events, with `emits`/`handles`/`changes`/`on` edges" is
event storming — an analyst/developer technique. The spec's own R2 concedes the overload. The German
label "Verhalten generieren" softens the surface, but the modelled substance is B. Routing a B-driven
layer through an A-designed value test is the inversion both predecessors named.
*Recommended change:* State plainly in §0 (and §12 at closure, as SPEC-003 did) whether behaviour is
built primarily as a **B-substrate** (codegen seam / methodology completeness) or an **A-feature**. If
the honest driver is B, own it and gate on a codegen/technical-persona demand signal — do not smuggle
a codegen seam under an operator value test it was not designed to pass.

**M2 — §8: success criteria inverted again, and the "value-primary" reframe SPEC-003 was forced to
make has not been applied here.**
*Location:* §8 (A1–A6).
*Issue:* Structurally identical to the pattern flagged as a Blocker in REV-008 (B1) and REV-012 (F1c):
five correctness/internal metrics and exactly one value criterion (A6), soft and unthresholded,
carrying the entire value case. SPEC-003's panel forced §8 to make value **primary**; SPEC-004 lists
A6 as the last of six and has not inherited that fix — a small regression from where the arc last
landed.
*Recommended change:* Give A6 a concrete **instrument and threshold** matching A1/A2's rigor, framed
as a **demand** action, not a satisfaction rating — e.g. "in a moderated session the partner uses the
behaviour view to make or change a decision they could not make from entities alone." Elevate it to
the primary criterion and fold B1 into it.

**M3 — §2 N0 / §11 Q2: behaviour-without-policies delivers thin STANDALONE value; the flow that would
make it operator-legible is exactly what is deferred.**
*Location:* §2 (N0 policies/reactions, N1 payloads, N4 ordering all deferred), §11 Q2 (read-only
consumer hint), R5.
*Issue:* Deferring policies, payloads, and ordering is correct for build-size discipline (R5) — but it
guts the *standalone* value of this specific layer. What survives is a static, per-aggregate list of
commands and the events they emit: a vocabulary annotation. The value of behaviour modelling to a
non-developer lives in the **choreography** — *what reacts to what* ("Lead Qualified → Schedule Site
Survey") — which is precisely N0. So commands-without-policies risks the worst combination for its own
A6 gate: it pays the full jargon/overload cost of the most developer-flavoured layer (R2) while
withholding the one thing (flow) that would make behaviour legible and worth acting on to an operator.
For Product B it is a genuine incremental brick (you need the command/event vocabulary before you can
wire policies); for Product A it is thin.
*Recommended change:* **Pull Q2's read-only consumer/reaction hint FORWARD** as part of this spec, not
deferred. It is cheap — derivable from existing `consumes`/`produces` overlap, no policy authoring or
validation machinery — and it is the single change that turns a static verb list into a visible
glimpse of *flow*, giving A6 something real to bite on. This is the highest-leverage, lowest-cost
recommendation in this review. If Q2 is not pulled forward, be explicit that behaviour ships as a
B-substrate increment with acknowledged thin standalone A value, and gate accordingly (see M1/B1).

### Minor

**m1 — §0: the "that gate has cleared" claim conflates layer-validated with demand-for-this-layer
(REV-012 F1a, verbatim recurrence).**
*Location:* §0 (Framing, final sentence; Risk posture "the layers beneath are partner-validated").
*Issue:* The partner validating capabilities/entities/areas clears condition (1) of the two-part gate,
not condition (2) (demand for behaviour). The prose reads as if both cleared. Same partial-gate move
REV-012 flagged.
*Recommended change:* Correct the claim to state which condition is met and that a behaviour-specific
demand signal is still owed; fold into B1's posture rename.

**m2 — §8 A5 / height-vs-breadth: the compounding-height concern is materially weaker now — acknowledge
it (REV-012 F2, largely discharged).**
*Location:* §8 A5 (dental second-domain smoke), G7.
*Issue:* REV-012 F2 objected to adding layers on a solar-only base before any second-domain proof.
That proof has since **run and passed** — the dental smoke generalised capabilities and areas with no
code change (SPEC-003 §14 / SPEC-002 A4). So breadth has been demonstrated once, and this finding is
largely discharged; the residual concern is only that four layers now rest on a two-vertical evidence
base. This is a Minor, not the Major it was for SPEC-003.
*Recommended change:* Keep A5's dental smoke (now cheap and routine); note in §0 that breadth was
already proven once, so this layer's marginal breadth risk is low — an honest point *in the spec's
favour* it currently under-claims.

**m3 — R2: cognitive overload is a PRODUCT risk, not only a UX one.**
*Location:* §10 R2, §7.
*Issue:* R2 is scoped to the UX lens (in-context, collapsed, progressive disclosure) — the right
*mechanics*. But whether a fourth, developer-flavoured element kind adds or subtracts from VBD's core
wedge (a *legible, checkable* model) is a product question: marginal operator legibility per added
layer may be flat-to-negative by layer four, independent of how tidily it is disclosed. Progressive
disclosure hides it well; it does not make it operator content.
*Recommended change:* Add a product-owned facet to R2: at layer four, verify the operator still reads
the *whole* model as legible, not just that each layer is individually collapsible. Fold into the
M1 persona decision.

### Nit

**n1 — §11 Q3/Q6 answers (product lens).** Q3 (command payloads): keep **deferred** — pure codegen/DTO
concern, zero operator value, consistent with REV-008 m2 (attribute typing). Q6 (deterministic naming
enforcement): leave to the **review lens**, not a hard validator — brittle to enforce deterministically
and low product value; a naming *smell* in the lens is enough.

## Explicit takes requested

**Does behaviour-without-policies deliver standalone value?** *Weakly, and asymmetrically by product.*
As a **Product-B substrate increment** — yes: the command/event vocabulary is the correct next brick,
and you cannot wire policies (N0) or generate an event log without it. As a **standalone Product-A
feature** — largely no: with policies, payloads, and ordering all deferred, the operator sees a static
per-entity verb list, while the legible value of behaviour (the flow/reactions) is exactly what is
deferred. Because A6 (operator value) is the *only* value gate, this asymmetry is a live risk to the
spec's own go/no-go. The fix that most cheaply rescues standalone value is pulling the read-only
reaction hint (Q2) forward (M3).

**Is the driver honestly gated?** *No — more honestly *named* than SPEC-003 was, but not honestly
gated.* §0 candidly states the codegen purpose (real progress over SPEC-003's initial framing), yet
the gate is still A6 (operator value), and §0 asserts the two-part demand gate "has cleared" when only
the layer-validation half has. The driver is codegen (B) and methodology completeness; the gate is
operator satisfaction (A). Honest gating would either (a) gate on a codegen/technical-persona demand
signal and own the B driver, or (b) pull flow forward (Q2) so the layer can plausibly earn an operator
value test — not assert clearance of a gate whose second condition is unmet.

## Closing summary

SPEC-004 is the best-framed spec in this arc — it names its risks, keeps the UI in-context, and
defers the right heavy pieces — and its substrate reuse is cheap and reversible, which earns an
**Approve-with-changes**. But it has again absorbed the tactical lessons while missing the strategic
one, now for the third consecutive layer: it is driven by methodology completeness and a codegen seam,
gated on operator satisfaction rather than demand, and asserts a two-part gate has "cleared" when only
half has. What is new and sharper here is that (1) the compiler premise justifying the entire arc has
**never been probed** even as model depth reaches four layers, and (2) this is the layer *least* able
to pass the operator value test it is assigned, because the flow that would make behaviour legible
(policies, N0) is deferred. Resolve **B1** (make demand/codegen the primary gate; weigh a thin codegen
probe as the higher-information next investment), **M1** (own the B driver and gate on the honest
persona), **M2** (value-primary, thresholded A6), and **M3** (pull Q2's read-only reaction hint forward
to give the layer standalone flow-value) before this leaves the runway — or, consistent with how
REV-008/REV-012 were dispositioned, log them as explicit owner-accepted decisions with mitigations
rather than silent pass-throughs.
