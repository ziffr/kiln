---
id: REV-001
title: Product & Strategy Review of SPEC-001 (MVP Narrative → Capability → Review Loop)
type: review
status: Approved
version: 1.0.0
author: "Reviewer (product-strategy)"
created: 2026-07-10
updated: 2026-07-10
reviews: SPEC-001
lens: product-strategy
verdict: Approve-with-changes
related: [SPEC-001]
---

# REV-001 — Product & Strategy Review of SPEC-001

## Summary

SPEC-001 is a well-structured engineering plan. The pipeline (text-as-truth →
compiler → IR → deterministic validators + LLM review → projection) is coherent, the
non-goals are disciplined, and the "no codegen" cut is defensible *as a build-sequencing
decision*: it front-loads the human-in-the-loop modeling and review machinery that every
later layer reuses, and it de-risks the hard UX problem before the hard research problem.

The gap is **strategic, not technical**. The spec never says who the user is, what job
they are hiring the product to do, or why a Capability Map + AI review is worth paying
for on its own. As written, the success criteria (§8) prove that *the tool works*, not
that *anyone wants it* — and the MVP quietly commits to one side of an unresolved
product fork (operator SaaS vs. developer framework) without saying so. Those omissions
mean a "successful" MVP could still tell us almost nothing about whether there is a
business here. All are additive fixes, not a teardown — hence **Approve-with-changes**,
with the Blocker required to resolve before the spec advances to `Approved` per the
CONV-001 closure rule.

## Findings

| # | Severity | Location | Issue | Recommended change |
|---|----------|----------|-------|--------------------|
| F1 | **Blocker** | §1, §8 | No user/buyer, no job-to-be-done, no willingness-to-pay. The MVP's deliverable — a Capability Map + review findings — is an *intermediate artifact* with no defined downstream use inside the MVP (codegen is cut, N1). A founder does not wake up wanting a capability map. Risk: we build a beautifully engineered loop that no user actually pulls, and §8 can't detect that. | Add a "Users, buyer & value" section: name the target user, the recurring painful job the map resolves (e.g. onboarding an ops hire, scoping a build/RFP, org design, diligence), and how they get that value today. Secure ≥1 named design partner/pilot before M2. Add acceptance criterion **A6**: an unaided target user completes the loop and rates the output "actionable / would use again." |
| F2 | Major | §1, §1.2 (N1/N5), §8-A4 | **Product A vs Product B fork is unresolved.** The north-star framing ("Business *Compiler*" that ultimately emits code) is a developer/framework play (Product B). But the MVP — "a founder describes their business," no codegen, single-user workspace — is an operator-facing SaaS play (Product A). By cutting codegen, the MVP implicitly validates Product A while the thesis is Product B. We may validate the wrong product. | State explicitly, in §1: "This MVP validates **Product \_\_\_**; the codegen north star is Product \_\_\_; here is why validating A first de-risks B (or vice versa)." Make the fork a conscious sequencing choice, not an accident of scope. |
| F3 | Major | §8 | Success criteria are not tied to a **go/no-go decision**, and A1/A4 are not measurable as written. A1: "≥80% capabilities right" has no rubric, no gold set, no denominator (Q5 admits this). A4: "no code change" proven only with a *throwaway* narrative — a binary engineering check, not evidence of value. Nothing measures adoption, retention, or willingness to pay. | Reframe §8 as decision gates: "If A1 < X or users won't complete A6, we pivot/stop." Define the eval rubric and a seeded scenario corpus up front (see Q5 answer). Distinguish "the loop functions" criteria (A3, A5 — good as-is) from "the loop is wanted" criteria (add A6). |
| F4 | Major | §1, §11 | **No competitive / defensibility framing.** A founder can paste the same narrative into a generic LLM today and get a capability map for free. EA tooling (LeanIX, Ardoq) and DDD workshops occupy adjacent space. The claimed moat — deterministic validators as a "credibility layer" (§5) — is real but thin on its own. | Add a short "Alternatives & differentiation" subsection. Articulate the durable wedge: provenance/traceability (`sourceRefs`), versioned diffable models, the review workflow as a *product surface*, and an accumulating domain/eval library — not the one-shot generation, which is commoditized. |
| F5 | Major | §1.1-G6, §8-A4, §11-R5 | The product is named for **verticality/generalization**, yet that is precisely what the MVP defers (A4 is a smoke test, R5 concedes "solar working ≠ framework"). Honest — but it means a green MVP is nearly uninformative about the core commercial bet. Also, no rationale is given for choosing solar as the reference domain. | Justify solar (why this vertical, is there a design partner/market there). State what the *deferred* generalization proof (next spec) must show and what would falsify it, so M0–M5 are consciously building toward that test rather than away from it. |
| F6 | Minor | §9 | The workspace status model (`… → reviewed → committed`) reads as linear/terminal; a real modeling tool is iterative (review → edit → re-review). No explicit loop-back state. | Show the cycle explicitly (`reviewed ⇄ narrative_drafted`), and pair with Q4's "dismissed findings" persistence so re-review doesn't re-raise resolved items. |
| F7 | Minor | §1.1-G6 | G6 conflates an **engineering property** ("adding a domain is config, not code") with a **market claim** ("verticality is validated"). This wording invites internal over-confidence. | Split the two: keep the engineering property as a goal; move the market claim entirely into the next spec, and say so. |
| F8 | Minor | §8-A1 | "≥80% capabilities right" — denominator and adjudication undefined (right vs. what reference? judged by whom?). | Tie A1 to the rubric from Q5; specify the adjudicator (named domain expert) and the reference (seeded expected-capabilities list per scenario). |
| F9 | Nit | product name | "VerticalBusinessDesi**g**er" (repo/product name) appears to be a misspelling of "Designer." For a product, a misspelled brand name is a real cost the day it ships. | Decide the canonical brand name now; if intentional, note it; if not, fix before it propagates into URLs, packages, and marketing. |

## Answers to §12 open questions (product/strategy lens)

**Q2 — Should bounded-context grouping be derived in MVP or fully deferred?**
Derive it read-only, as the spec already proposes (§2, ⚠️). From a product standpoint,
context grouping is one of the highest-signal *insights* the tool can surface cheaply
("your model has 3 natural subsystems") and it materially strengthens the review
narrative that justifies F1's value story. Keep it a non-authored, non-editable
projection so it adds perceived value without expanding scope or the meta-model surface.
Do not let it become an authored layer in the MVP.

**Q5 — Minimum eval methodology for A1/A2 without a labeled gold dataset?**
This is the linchpin for F3. Recommended minimum:
1. Build a small **seeded scenario set** (5–8 narratives, solar + 1–2 near-neighbors),
   each with (a) an expert-authored *expected-capabilities* list and (b) 2–3 *planted
   defects* (the Lead/Customer overlap, missing Procurement/Warranty). This is a
   rubric-backed reference, not a single gold answer — which respects R1's fuzziness.
2. **A1** = set-overlap (precision/recall) of generated vs. expected capabilities against
   the list, plus a binary "no critical omission" expert check. Report the distribution,
   not a single number.
3. **A2** = planted-defect recall across N seeded runs (the ≥90% target is meaningful
   *only* once the defect corpus is fixed).
4. Run each scenario ≥5× at low temperature to quantify non-determinism (R2) and report
   variance as a first-class result.
5. Add the missing **A6** (user-value) signal: a short task-based session with the design
   partner — did they complete the loop unaided, and would they use it again. Tool
   accuracy without this is necessary but not sufficient to continue.

## Disposition note

The build plan (M0–M5) can proceed largely unchanged. The required additions are a
value/positioning layer (F1, F2), a decision-linked and measurable §8 (F3, F5), and a
differentiation paragraph (F4). None of these should delay M0–M1 scaffolding, but F1
must be resolved before this spec is marked `Approved`.
