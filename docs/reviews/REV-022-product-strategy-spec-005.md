---
id: REV-022
title: Product & Strategy review of SPEC-005 (Policies & Reactions)
type: review
status: Approved
version: 1.0.0
author: "Claude (Opus 4.8) — product-strategy lens"
created: 2026-07-10
updated: 2026-07-10
reviews: SPEC-005
lens: product-strategy
verdict: Approve-with-changes
related: [SPEC-005]
reviewers: [product-strategy]
---

# REV-022 — Product & Strategy review of SPEC-005

## Summary

Something changed, and it changed in this spec's favour. For three consecutive layers
(REV-008 → REV-012 → REV-017) the product-strategy lens raised the *same* Blocker: the layer was
**justified as Product B (codegen) but validated as Product A (operator satisfaction)**, with a
demand case that was *asserted* (methodology completeness, owner preference) rather than
*demonstrated*. REV-017's highest-leverage recommendation was to stop adding model depth and run a
**thin codegen probe** — because it was the only experiment that could test the compiler premise and
reveal what the behaviour layer must actually contain. That probe ran (RES-001), the model→scaffold
projection held, and the codegen yardstick now exists as a real, if userless, Product-B consumer.

That materially improves this spec's posture in two concrete ways. First, the demand for this layer
is no longer pure methodology completeness: there is now a downstream consumer that measurably does
*more* when reactions exist, and A6 ("codegen advances") is the first success criterion in the arc
that gates on that real consumer rather than on operator vibes. Second — and this is the strongest
point in the spec's favour — **policies are the layer that redeems SPEC-004.** REV-017 M3 argued that
behaviour-without-policies delivers thin standalone value because the *flow* ("when Invoice Paid, then
Schedule Installation") is exactly what was deferred. SPEC-005 is that flow. "When this happens, do
that" is arguably the **most operator-legible artifact in the entire stack** — more legible than the
commands/events it wires. So the fifth concept, counter-intuitively, is the one that makes the fourth
pay off, not the one that finally overloads the operator. On standalone Product-A value this is the
best-positioned layer since capabilities themselves.

That is why this is a clean **Approve-with-changes** and — for the first time in this arc — **with no
Blocker.** The recurring Blocker has genuinely eased, and it would be dishonest to re-issue it by
reflex.

But it has eased, not vanished, and the spec overstates how much. Three things need correcting before
this leaves the runway. (1) The "empirically the next codegen gap" claim is **overstated and partly
post-hoc**: the gap that names SPEC-005 is a *hand-authored constant* (`const anyReaction = false`) in
`detectGaps`, and RES-001 — the approved research doc — named **typed-attributes and SPEC-004** as its
two gaps, *not* reactions. It is a genuine structural signal about model expressiveness, but it is a
*codegen-completeness* signal (the tool would emit more), not *user demand* (no operator has asked),
and it should be framed as such. (2) SPEC-005 **leapfrogs the still-open typed-attributes gap** that
RES-001 named as the *other*, smaller, more foundational codegen investment — codegen still emits
`unknown` for every field, so reaction handler stubs will wire together entities whose data schemas
are not yet real. For the "runnable service" story, faithful schemas are more load-bearing than event
wiring; reactions-before-schemas is a sequencing choice that needs an honest justification, not a
default. (3) The success criteria are **improved but still correctness-heavy**, and the two value
criteria are soft: A6 tests stub *emission*, not stub *usefulness*, and A7 is an unthresholded
satisfaction rating rather than a demand action.

Verdict: **Approve-with-changes.** No Blocker; four Majors and three Minors. Resolve or owner-accept
the Majors before this becomes a work order.

## Findings

### Major

**M1 — §0 / §Framing: "empirically the next codegen gap" is overstated and partly post-hoc; it is a
codegen-*completeness* signal, not demonstrated user demand.**
*Location:* §0 lead-in ("empirically the next codegen gap"), §Framing (line 22–24: "`@vbd/codegen`
already reports that command operations generate but 'events trigger no downstream commands'"), G7, A6.
*Issue:* This is the pivotal claim of the whole spec, and it does real work in retiring the recurring
Blocker — so it must be exactly right, and it is not. Two problems. (a) **The "report" is a
hand-authored constant.** In `packages/codegen/src/index.ts` `detectGaps`, the reaction gap is emitted
after `const anyReaction = false; // policies/reactions are not modelled in the domain doc (N0)` — a
literal, unconditional `false` whose branch emits a string that *names SPEC-005 by name*. The tool did
not discover the gap; a human wrote a constant that points at the already-planned next spec. That is
post-hoc justification wearing an empirical costume. (b) **RES-001 itself did not name this gap.** The
approved probe report named exactly two gaps — *untyped attributes* and *CRUD-only / no behaviour
(SPEC-004)* — and recommended un-shelving SPEC-004 plus a typed-attributes increment. "Reactions" is
nowhere in RES-001; the reaction-gap line was added to the code *after* commands landed, pointing at a
pre-decided spec. So the honest status is: there is a **genuine structural signal** — once commands
generate operations, the next thing the model cannot express is wiring *between* them — but it is a
signal that *codegen output would be more complete*, produced by a probe with **zero users**. It is not
evidence that any operator, partner, or paying customer wants cross-entity automations. The demand has
moved from "methodology completeness" to "codegen completeness," which is real progress (there is now a
downstream consumer at all), but it is demand *at one remove*, and the spec presents it as if the tool
empirically demanded the feature.
*Recommended change:* Reframe §0/§Framing honestly: "a structural codegen-completeness gap (the model
cannot yet express wiring between operations) — not a demonstrated user demand." Keep A7 (the partner
rating "Automations" worth acting on) as the *actual* market-demand test and make it primary (see M3).
Do not let a self-authored `detectGaps` string stand in as empirical demand; that is the same
correctness-for-demand substitution the prior three reviews flagged, in a new costume.

**M2 — §1 G7 / §2 N-scope: reactions leapfrog the still-open typed-attributes gap that RES-001 named
as the smaller, more foundational codegen investment; handler stubs will wire untyped data.**
*Location:* §1 G7 ("close the codegen gap"), §9 PL-M5, RES-001 Findings gap #1 / Conclusion.
*Issue:* RES-001 named **two** codegen gaps. SPEC-004 closed one (CRUD-only). The *other* — untyped
attributes → every field projects to `unknown` — is **still open**, and RES-001 explicitly called it
"smaller than SPEC-004" and "a candidate to pair with, or precede" the behaviour layer, because it is
what makes generated *data schemas faithful*. SPEC-005 skips it and adds event-handler wiring on top of
a model whose entity schemas are still `unknown`. The consequence for the codegen story is concrete:
the generated reaction stub ("on InvoicePaid → call scheduleInstallation") passes around payloads whose
types the model does not know (compounded by N1, which defers payloads entirely). For the "runnable
service" north star, **faithful schemas are more load-bearing than event wiring** — you can run a
service with real types and no automations far more plausibly than one with automations and `unknown`
everywhere. This is the same height-before-cheaper-depth inversion REV-012 F2 flagged (adding a layer
before running the owed cheaper experiment), now *inside* the codegen roadmap: SPEC-005 advances the
yardstick in the more glamorous direction (workflow) while the smaller, more foundational gap the
yardstick itself surfaced stays open.
*Recommended change:* Either (a) fold the typed-attributes increment in first or alongside (it is small
per RES-001 and unblocks faithful schemas that the reaction stubs then carry), or (b) explicitly justify
in §0 why reactions-before-schemas is the right order and **own that generated handlers wire untyped
payloads** until typed attributes lands — so the "codegen advances" claim (A6) is not read as "codegen
is now faithful." Do not let SPEC-005's workflow advance obscure that the probe's own first-named gap is
still unaddressed.

**M3 — §8 A1–A7: success criteria still correctness-heavy; A6 tests emission not usefulness, A7 is a
satisfaction rating not a demand action.**
*Location:* §8 (A1–A7).
*Issue:* This is the best value-instrumented §8 in the arc — A5 (reactionRecall + over-wiring
guardrail), A6 (codegen advances), and A7 (partner value) are three value-adjacent criteria, versus the
"five-correctness-plus-one-soft" pattern flagged as a Blocker in REV-008/012/017. Credit that. But two
gaps remain. (a) **A6 gates emission, not usefulness.** "`@vbd/codegen` emits event-handler stubs and
the 'no reactions' gap is closed" passes the moment the code compiles and the `detectGaps` string stops
firing — i.e. when the *build* is done, not when the *scaffold is useful*. Given N0/N1/N4, the emitted
handler is a near-empty one-liner stub with no data flow; "the gap string no longer prints" is a
tautology (it was a hardcoded `false`), not a value signal. Contrast RES-001's genuinely useful output
(8 interfaces, 16 paths, 3 modules). (b) **A7 is soft.** "the design partner rates 'Automations' worth
acting on" is the same unthresholded satisfaction wording REV-008 M2 / REV-012 F6 / REV-017 M2 flagged —
a rating, not a demand action.
*Recommended change:* (a) Make A6 test *usefulness*: a reviewer can trace a non-trivial reaction chain
(`command → event → policy → command`) across entities and judge the generated stub a real seam, not an
empty shell — and note the untyped-payload caveat (M2). (b) Elevate A7 to the **primary** go/no-go and
frame it as a **demand action** with a bar: "in a moderated session the partner reaches for an
Automation to make or change a hand-off decision they could not see from commands/events alone, and asks
to keep it." Fold M1's honest framing in here — A7 is the real demand test, so it should carry the
decision.

**M4 — §10 R1 / §5: over-wiring is a product-*trust* risk, not only a modeling one; single-call
generation biased to "prefer cross-entity" can manufacture a confidently-wrong automation map.**
*Location:* §10 R1, §5 (single global call, "preferring cross-entity reactions"), §6 PL6/PL7.
*Issue:* VBD's entire wedge is *trust in a checkable model* (SPEC-001 §0). Automations are the layer
where a wrong projection is most visible and most damaging: an operator who sees "when Lead Qualified →
Issue Invoice" that their business does *not* do will distrust the whole map — more so than a mislabeled
attribute. §5 generates policies in a *single global call* explicitly biased to *prefer cross-entity
hand-offs*, which is precisely the bias that over-produces plausible-but-wrong wiring. The spec owns
over-wiring as R1 and mitigates with PL6/PL7 smells + a count guardrail + the review lens — good — but
frames it as a domain/AI modeling risk. It is also a *product* risk: a clean-but-wrong automation graph
erodes the trust wedge, same shape as REV-012 F5 (confidently-wrong partition). The mitigations are
warnings (minor severity) and a guardrail whose bar is unspecified.
*Recommended change:* Add a product-owned facet to R1: bias generation toward **precision over recall**
for automations specifically (a missed hand-off the operator adds is cheap; a wrong hand-off shown as
fact is expensive), give the over-wiring guardrail a concrete bar, and default generated automations to
**conservative + collapsed** (R2 already collapses them — extend the instinct to *quantity*). A7 should
check the partner does not see automations they judge *wrong*, not only that they find real ones
worthwhile.

### Minor

**m1 — §11 Q3 / §7: show the reaction on both the triggering event *and* the reacting command
(read-only), not only under the event.**
*Location:* §7 (UI under the triggering event), §11 Q3.
*Issue:* Under-the-event is the right primary home (it reads as flow). But an operator inspecting a
*command* ("Schedule Installation") will reasonably want to know *what triggers it* — the reverse edge
is part of the same legibility. Showing it read-only on both sides (authored on the event side, derived
projection on the command side) matches the flow reading without a second authoring surface.
*Recommended change:* Answer Q3 as **under the event to author; mirrored read-only under the reacting
command**. Cheap (the edge already exists in the IR), and it completes the "why does this happen?"
question the operator will ask.

**m2 — §11 Q5 / §7: "Automations" is the right surface term — endorse and lock it.**
*Location:* §7 ("Automations" / "Wenn… dann…"), §11 Q5.
*Issue:* Of the arc's euphemism history ("Areas" for bounded contexts, "Verhalten" for behaviour),
"Automations" is the first surface term that is *not* a euphemism — it is genuinely how an operator
thinks about "when X, do Y," and it is a category the market already understands (Zapier/workflow
mental model). This is a strength, not a tell.
*Recommended change:* Lock "Automations" (Q5 resolved); drop "Rules"/"policy" from user-facing copy
entirely. Keep "policy" as the internal/IR term only.

**m3 — §2 N1 / §11 Q2: keep `condition` plain-text only — do not add a predicate DSL now.**
*Location:* §2 N1, §11 Q2.
*Issue:* A structured predicate engine (entity/attribute compare) is a codegen/runtime concern with
low operator value and high build cost, and it is doubly premature while attributes are still untyped
(M2) — you cannot compare typed fields you have not typed. Consistent with REV-008 m2 / REV-017 n1
(defer developer-facing typing until a consumer needs it).
*Recommended change:* Answer Q2 as **plain text only for now**; revisit a light predicate only after
typed attributes exist *and* a codegen consumer needs evaluable conditions.

## Explicit takes requested

**Is the codegen-named demand genuine, or post-hoc justification?** *Both, and the spec should say so.*
It is **genuine as a structural codegen-completeness signal**: once commands/events generate operations,
the next thing the model provably cannot express is the wiring *between* operations — that is a real
limit on the projection, not an invention. It is **post-hoc and overstated as "empirical demand"**: the
gap is emitted by a hardcoded `const anyReaction = false` that names SPEC-005 by name, RES-001 itself
named typed-attributes and SPEC-004 (not reactions) as its gaps, and the codegen consumer that "asks"
for the feature has zero users. So the demand is real but sits *one remove* from any human — the tool
would emit more, not that anyone has asked to act on more. That is a meaningful step up from the pure
methodology-completeness driver of SPEC-002/003 (there is now a downstream consumer at all), but it is
not the market signal the framing implies. The real demand test remains A7 (a design partner reaching
for automations), and it should carry the decision (M3), with the codegen signal named honestly as
structural, not empirical (M1).

**Does the stateless-rule scope (N0 defers sagas) deliver standalone value, or is it too thin?**
*It delivers the strongest standalone Product-A value of any layer since capabilities — and stateless
is the right MVP.* "When Invoice Paid, then Schedule Installation" is a complete, legible unit of
business meaning on its own; it does not need saga state, compensations, or timeouts to be worth acting
on. Crucially, this layer **discharges REV-017 M3** — the finding that behaviour-without-policies is a
static verb list with the legible *flow* deferred. SPEC-005 *is* that flow, so it converts SPEC-004's
thin standalone value into a real one rather than compounding overload. Sagas (N0) are correctly
deferred: they are a large, developer-flavoured complexity you do not yet know you need, and a stateless
rule is enough both to deliver "when X then Y" legibility *and* to generate a handler stub. The one
caveat is that the stub's usefulness is capped until typed attributes/payloads exist (M2) — but that
limits the *codegen* value, not the *operator* value, and the operator value is where this layer is
strong. This is not too thin; it is the right thin.

## Closing summary

For three layers the product-strategy lens issued the same Blocker, and each time the honest
disposition was "owner-accepted with mitigations." This is the first spec in the arc where that Blocker
genuinely *eases* — not because SPEC-005 argues it away, but because the world changed: REV-017's
recommended codegen probe ran, created a real Product-B consumer, and this layer delivers the *flow*
that makes the behaviour model legible. "When this happens, do that" is the most operator-legible thing
the product has produced since the capability map, and it redeems SPEC-004 rather than overloading the
operator. That earns a no-Blocker **Approve-with-changes**, and the good news should not be hedged.

But the spec reaches slightly past its evidence. The "empirical codegen demand" is a hand-authored
constant naming a pre-decided spec, and RES-001 named a *different* gap (typed attributes) that is still
open and arguably more foundational for the runnable-service story the codegen arc is chasing. Resolve
**M1** (frame the signal as structural codegen-completeness, not empirical user demand), **M2** (justify
or fix reactions-before-schemas; own that stubs wire untyped payloads), **M3** (make A7 the primary
demand gate; make A6 test usefulness not emission), and **M4** (treat over-wiring as a trust risk, bias
to precision) before this becomes a work order.

One meta-observation for the owner, offered once: five element kinds and a codegen yardstick in, the
product's only market test remains a single design partner rating things "worth acting on." The
compiler's *internal* completeness is a satisfying loop to optimize — each layer makes the next gap
legible and the yardstick advances — but it is not the same loop as *someone depending on the output*.
SPEC-005 is a good and legible layer; the highest-information experiment available may no longer be
layer six, but putting the whole assembled stack in front of the partner and watching what they *do*
with it.

## Review & closure

*(Pending author disposition. Findings above are the product-strategy lens; four Majors and three
Minors to resolve or owner-accept, no Blocker. Log disposition here per CONVENTIONS §5 before
`Approved`.)*
