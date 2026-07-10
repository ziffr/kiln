---
id: REV-008
title: Product & Strategy review of SPEC-002 (Domain Model Layer)
type: review
status: Approved
version: 1.0.0
author: "Reviewer (product-strategy)"
created: 2026-07-10
updated: 2026-07-10
reviews: SPEC-002
lens: product-strategy
verdict: Approve-with-changes
related: [SPEC-002]
---

# REV-008 — Product & Strategy review of SPEC-002

## Summary

SPEC-002 is technically coherent and reuses the SPEC-001 substrate (IR, validators, HITL,
provenance) exactly as SPEC-001's "build A on a B-compatible substrate" strategy intended.
Keeping that substrate B-ready is a legitimate strategic asset, and writing the spec ahead of
time is cheap and fine.

The strategic problem is not the design — it is **who this layer is for, when it should be
built, and whether §8 actually gates the decision it claims to gate.** SPEC-002's stated reason
to exist is codegen ("enough structure to later generate APIs, agents, and code," §0) — i.e.
**Product B**, the developer-facing compiler. But its only value gate, A6, tests the **Product A**
operator/founder from SPEC-001 §0. Aggregates / commands / events are DDD + event-modeling
constructs a non-technical solar founder does not think in. So the layer is *justified as B* but
*validated as A*, and none of A1–A6 tests demand for depth. That inverts SPEC-001's explicit
"validate A first because it stands alone; B is gated on later specs" decision. Add to this that
SPEC-001 is Approved but **unbuilt and unvalidated** (its own go/no-go A1–A3+A6 has not run, and
the §13.1 design-partner gate "must be named/secured before M2" is still open), and building
SPEC-002 now would be spending budget going *down the stack toward developers* before proving
the map delivers standalone value *out in the market*.

Recommendation: keep the spec, but (1) make it explicitly **gated** on SPEC-001's go/no-go + a
design-partner value signal, (2) **name the persona** the domain layer serves and stop assuming
the operator carries over, (3) **cut to aggregates-only** (Q1) as the cheap probe, and (4) turn
A6 into a real **demand** gate. Verdict: **Approve-with-changes** — no Reject (the substrate work
is sound and reversible), but one Blocker and four Majors must be resolved before this leaves the
runway.

## Findings

### Blocker

**B1 — §8 / §0: the go/no-go tests correctness, not the strategic question; layer is justified
as B but validated as A.**
*Location:* §0 ("to later generate APIs, agents, and code"), §8 (A1–A6).
*Issue:* SPEC-001 §0 deliberately builds A (operator-facing modeling/review) and gates B (codegen
compiler) on later specs, "because A stands alone." SPEC-002's justification (§0) is squarely the
B substrate — aggregates/commands/events exist to feed codegen. Yet A1–A5 are all internal
build-quality metrics (correctness %, validator recall, determinism, second-domain, provenance),
and the single value criterion A6 is inherited verbatim from SPEC-001 where it was applied to the
capability map. The go/no-go to SPEC-003 can therefore pass entirely on "we built the model
correctly" while the actual strategic question — *is going one layer deeper toward codegen worth
it, and for whom* — is never tested. There is no criterion measuring **demand** for depth (a
design partner asking for it, willingness to pay, an operator outcome that improves because the
domain layer exists). This is the same defect product-strategy raised on SPEC-001 ("success
criteria not tied to a decision"), reappearing one layer down.
*Recommended change:* Add a **demand/value gate** as the *primary* go/no-go, not one of six —
e.g. "a design partner (or a technical user, if that is the real persona) uses the domain layer
to do something they couldn't with capabilities alone, and asks to keep it." Explicitly state in
§0 whether SPEC-002 is a Product-A feature or a deliberate Product-B step; if the latter, own that
it front-runs SPEC-001's validate-A-first sequencing and justify why. Do not let A1–A5
(engineering correctness) stand in for a value decision.

### Major

**M1 — §0: no explicit precondition on SPEC-001's go/no-go or the design partner; building now
is premature.**
*Location:* §0 ("It reuses everything SPEC-001 built"), §9 milestones.
*Issue:* SPEC-001 §8 states "proceed to SPEC-002 only if A1–A3 + A6 pass on solar," and §13.1
makes securing a design partner an execution gate before M2. Neither has happened — SPEC-001 is
Approved on paper, not validated in use. SPEC-002 speaks as if SPEC-001 is done ("reuses
everything SPEC-001 built") and carries no precondition of its own. Writing the spec now is fine;
**starting DM0–DM5 build now is not.**
*Recommended change:* Add an explicit "Preconditions / entry gate" section: SPEC-002 build does
not start until SPEC-001 A1–A3+A6 pass on solar **and** a design partner has confirmed the
capability layer delivers value. State it in the frontmatter status or a §0 gate box, not just
implied.

**M2 — §8 A6: not credible as written for this artifact and this user; weaker than SPEC-001's A6.**
*Location:* A6 ("A target user rates the domain view + review findings 'worth acting on'").
*Issue:* Two problems. (a) *Credibility*: capabilities ("Lead Management," "Installation") map to
how a founder thinks about their business; aggregates emitting events map to how a developer
thinks about building software. It is not credible that an unaided solar operator finds "the Lead
aggregate emits LeadQualified" view "worth acting on" the way they found the capability map worth
acting on. If A6 is instead run with a technical PM/developer, the primary user has silently
shifted to Product B — which must be named, not smuggled in. (b) *Rigor*: A6 dropped SPEC-001's
already-soft "≥N findings in a moderated session" down to an unquantified "worth acting on," with
no threshold, no measure, and no defined user — even though A1 keeps a hard ≥80%. The softest,
least-defined criterion is carrying the entire value case.
*Recommended change:* Define the target user for the domain layer explicitly. Give A6 a threshold
and instrument (as A1 has). Frame it as a demand test (see B1). If the honest answer is that only
a technical user values this, say so and re-scope the persona.

**M3 — R5 / §8: "optional deepening, not required" is inconsistent with the build and with the
codegen roadmap.**
*Location:* R5 ("keep it an optional deepening, not a required step"), §3–§7, §9.
*Issue:* The framing is the right instinct (don't force the operator through a technical layer),
but it is inconsistent two ways. (a) *Build size*: for something "optional," the spec commits to
an IR extension, a new LLM skill, eight validators (DM1–8), a review lens, and a full Domain view
with structured-form editing and a second-domain smoke test. That is a large, non-optional-sized
investment. If it is truly optional, the first move should be a **cheap probe** (aggregates-only,
possibly read-only) to see if anyone wants depth *before* building DM3–DM6 + editing + review
lens. (b) *Roadmap*: §0 says this is the step that enables codegen — for Product B the domain
model is **required**, not optional. So "optional" is true only inside the A framing and papers
over the fact that the layer is load-bearing for B. If A6 is the whole point (as R5 implies), it
should be the primary gate (see B1), not risk #5.
*Recommended change:* Either commit to it as a required B-substrate step (and gate on demand), or
treat it as genuinely optional and shrink the first build to the smallest probe that can test A6.
Don't build a required-sized artifact under an optional label.

**M4 — §3 / §11 Q1: aggregates + commands + events is the wrong first cut; ship aggregates-only.**
*Location:* §3 artifact, §11 Q1.
*Issue:* Aggregates ≈ "the important things your business keeps track of" (Lead, Customer, Site,
Proposal, Install Job) — that is translatable to an operator and is the part of this layer most
plausibly valuable to the actual SPEC-001 user. Commands and events are the event-storming /
developer layer; a founder will not engage with "which command emits which event," and those are
squarely Product B substrate. Shipping all three now maximizes build cost and jargon exposure
exactly on the artifact whose value is least proven, and it front-loads the most B-flavored part.
*Recommended change:* Answer Q1 as **aggregates-only** for this spec. Defer commands/events to
SPEC-003 (or gate them on a technical persona / codegen demand). This is cheaper, is the part that
can actually pass A6 with an operator, and de-risks B1/M2/M3 in one move.

### Minor

**m1 — §11 Q4: DM5 should be a warning, not an error.**
Some capabilities are pure orchestration and legitimately own no aggregate. Forcing ≥1 aggregate
per capability (DM5 as a hard validator) will manufacture false "under-modeled" findings and noise
that erodes trust in the review — the opposite of the SPEC-001 value prop. Make DM5 a warning.

**m2 — §11 Q3: attributes free-form now, not typed.**
Typed attributes (string/number/date) are a developer-facing concern that serves codegen (B), not
the operator. Keep attributes as free-form names for the A-facing MVP; introduce typing only when a
codegen consumer needs it.

**m3 — §11 Q2: prefer expansion of the selected capability over a separate tab.**
Progressive disclosure keeps the operator in the capability frame they already understand and
reinforces "optional deepening." A separate "Domain" tab reads as a distinct, more technical
product surface — which nudges toward the B persona before that shift has been decided.

## Answers to §11 open questions (product/strategy lens)

- **Q1 (aggregates-only vs full):** Aggregates-only. See M4 — cheapest probe, most operator-legible,
  defers the B-flavored commands/events. Strong recommendation.
- **Q2 (tab vs expansion):** Expansion of the selected capability (m3).
- **Q3 (typed attributes now):** No — free-form first; typing is a codegen/B concern (m2).
- **Q4 (DM5 hard rule):** Warning, not error (m1).
- **Q5 (produces/consumes as aggregate seed):** Migrate rather than duplicate — two overlapping
  representations of the same nouns will drift and confuse the operator. (Defer the mechanism to the
  domain-modeling / architecture lenses; from a product view, one canonical list is the requirement.)

## Biggest strategic risk (asked)

Building **depth toward codegen (B) before validating breadth-of-value (A)** — inverting SPEC-001's
own strategy. You spend the next build cycle going *down* the stack (toward developers and codegen)
before going *out* (design partner, does anyone pay for the reviewed map). The failure mode is an
elegant multi-layer model that no operator wants (too technical) and no developer can yet use (no
codegen) — an uncanny valley serving neither user — made worse by solar-only and no secured design
partner. **Cut:** commands/events (defer to SPEC-003). **Gate:** the whole spec on SPEC-001's
go/no-go + a design-partner demand signal, with a demand-based A6 as the primary criterion.
