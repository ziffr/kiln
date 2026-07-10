---
id: REV-011
title: "UX / Human-in-the-Loop Review of SPEC-002"
type: review
status: Approved
version: 1.0.0
author: "Reviewer (ux-hitl)"
created: 2026-07-10
updated: 2026-07-10
supersedes: null
reviews: SPEC-002
lens: ux-hitl
verdict: Approve-with-changes
related: [SPEC-002]
---

# REV-011 — UX / Human-in-the-Loop Review of SPEC-002

## Summary

SPEC-002 is architecturally disciplined and inherits the right trust backbone from SPEC-001:
authored-vs-derived typing, provenance (`meta.derivedFrom`, DM8), deterministic validators,
"the model proposes, validators + the human decide" (ADR-004). As an engineering extension of
the loop it is coherent — it is genuinely "the same loop, one layer deeper" (§0).

The problem is that "one layer deeper" is, for the target user, **three layers of new
vocabulary at once**. SPEC-001's UX review (REV-004) spent four of its Major findings closing
the gap between the system's model and a non-technical founder's mental model — one term of art
("capability"), the edit surface, the review presentation, empty states. SPEC-002 reopens
every one of those gaps and multiplies them: it introduces **aggregates, commands, and events**
(three DDD/event-modeling terms of art, heavier than "capability"), a **second review lens** on
top of the capability review, and a **second view** whose relationship to the existing
Capability Map is explicitly left undecided ("Likely a tab alongside the Capability Map, or an
expansion when a capability is selected," §7). The spec is careful to keep the *artifact* and
*validators* rigorous, but it is written almost entirely from the system's point of view; the
non-technical solar installer barely appears in it except as R5's "value risk" and A6's
actionability rating.

The good news: the spec already contains the seeds of the right answers. R5 says the domain
layer should be "an *optional deepening*, not a required step." §7 mentions provenance chips and
reuse of SPEC-001's NodeDetail/review patterns. Q1/Q2/Q4/Q5 ask exactly the questions a UX
reviewer would ask. This review pushes those instincts to firm decisions: **reframe the
vocabulary into business language and/or gate the layer behind progressive disclosure; resolve
Q2 in favor of in-context drill-down (not a co-equal second graph) to avoid two mental models;
scope and gate the domain review so it doesn't drown the user; and explicitly carry forward the
diff-before-apply / safe-edit guarantee** — extended for the richer, cascade-prone edits this
layer introduces.

None of these are architectural blockers — the substrate supports the right UX. But two of them
(the vocabulary/gating decision and the undecided interaction model) determine whether the
target user can use this view at all, and they are currently unmade. So this is
**Approve-with-changes** with two Blockers.

---

## Findings

### F1 — [Blocker] Three developer terms of art surfaced at once, with no plain-language mandate and no gating decision
- **Location:** §3, §5, §7 ("per capability, its aggregates (with attributes) and the
  commands/events on each"), G2, A6, R5
- **Issue:** REV-004 F3 treated the *single* word "capability" as a Major that needed
  in-product glossing and a friendlier surface label, and noted "bounded context" was "an even
  heavier term of art." SPEC-002 now puts **aggregate**, **command**, and **event** — three
  concepts from domain-driven design and event modeling — directly in front of the same
  explicitly non-technical founder (SPEC-001 §0), and organizes an entire view around them. A
  solar installer thinks "I keep a record of each job, the customer, and the panels I ordered;
  when a quote is accepted the install gets scheduled." They do not think "the Job aggregate
  emits a QuoteAccepted event handled by a ScheduleInstall command." Worse than SPEC-001's
  single label: the *relationships between the three terms* (a command acts on an aggregate and
  emits an event) are themselves a mini-mental-model the user must acquire before the view means
  anything. The spec never decides whether these words appear in the UI at all, whether they are
  reframed, or whether the whole view is gated to an expert mode. A6 asks the user to rate the
  view "worth acting on" — but if the labels are opaque, A6 measures vocabulary literacy, not
  value.
- **Recommendation:** Make an explicit, spec-level presentation decision, and it should be
  **both** of the following, not one:
  1. **Business-language surface, jargon secondary.** Aggregate → "Records / things this part
     of your business keeps track of"; attributes → "details / fields"; command → "actions /
     what people do here"; event → "what happens / milestones." Keep the technical terms as
     secondary labels and in tooltips/glossary (reuse REV-004 F3's mechanism), so the model
     stays B-substrate-compatible while the *surface* speaks the user's language. Add a UX
     requirement mirroring SPEC-001 §7's "Plain language" clause, explicitly covering the three
     new terms.
  2. **Gate the layer behind progressive disclosure (ties to R5).** The domain view is an
     *optional deepening*, reached by an explicit "Go deeper / model the details" affordance
     from a reviewed capability — never a default surface the user lands on. A user who wants
     only a capability map must be able to finish and commit without ever meeting an aggregate.
  Without this decision the view is unusable for the stated persona; with it, R5's value risk is
  genuinely mitigated rather than merely acknowledged.

### F2 — [Blocker] The core interaction model (Q2) is undecided, risking two parallel mental models over the same capabilities
- **Location:** §7 ("Likely a tab alongside the Capability Map, or an expansion when a
  capability is selected"), §11 Q2, §4 (compiler composes into one IR graph)
- **Issue:** This is the single most consequential UX decision in the spec, and it is left as
  "likely… or…". It is build-blocking: the review lens, empty states, provenance surfacing, and
  finding presentation all depend on it. The failure mode is concrete. A **separate "Domain"
  tab that renders its own graph** creates a *second map* of the same business, divorced from
  the Capability Map the user just learned. The user now holds two mental models — "my
  capabilities" over here, "my aggregates/commands/events" over there — and must mentally join
  them, even though the IR composes them into one graph (§4). That is exactly the
  "two-mental-models" trap. Compounding it, `produces`/`consumes` on the Capability Map already
  show domain-object names like "Lead" (SPEC-001 §3.2), and §3's example aggregate is *also*
  "Lead" — so the same word appears on two surfaces with an unexplained relationship (see Q5,
  F9).
- **Recommendation:** Resolve Q2 as **in-context drill-down, not a co-equal second graph.** The
  Capability Map stays the single home. Selecting a capability opens/expands its NodeDetail into
  a "what this part of the business keeps track of and does" panel showing its aggregates (with
  details) and the actions/events on each — the deepening *lives inside the capability the user
  already understands*. If an at-a-glance domain overview is wanted, provide it as a **read-only
  secondary projection** (e.g., a filtered/annotated layer over the *same* map, or a list),
  explicitly not an independently-authored second canvas. Unify with `produces`/`consumes`
  (Q5/F9): the aggregate *is* the thing produced; drilling from a `produces: Lead` chip lands on
  the Lead record's detail. One map, one mental model, progressively revealed. Update §7 to
  state this as the decision, not a "likely."

### F3 — [Major] Finding-overload compounds; the domain review needs scoping, gating, and a unified inbox — none specified
- **Location:** §7 (domain-model-review lens: "missing/thin aggregates, commands with no
  events, aggregates with no commands, boundary questions"), §6 DM1–DM8, A1, R1
- **Issue:** REV-004 F7 already warned that V1–V7 plus the LLM reviewer could dump a dozen-plus
  findings on a non-technical user and read as "the AI thinks my business is broken." SPEC-002
  now adds **eight more deterministic checks (DM1–DM8)** and a **whole second LLM review lens**
  that fires *per aggregate, per command, per event* — a strictly larger surface. On a first
  domain generation over ~10 capabilities, "every capability owns ≥1 aggregate" (DM5), "commands
  with no events," "aggregates with no commands," plus boundary questions could easily produce
  30–50 findings simultaneously. The spec does not say where these findings appear (same inbox
  as capability findings? a separate one?), how they're ordered/grouped, or whether the domain
  review even runs before the capability layer is stable. R1 leans on "the review lens prunes"
  as a mitigation for scope explosion — which *increases* finding volume, the opposite of what
  the user needs.
- **Recommendation:** Specify a presentation-and-sequencing strategy: (a) **scope the domain
  review to the selected capability** by default — the user reviews one capability's aggregates
  at a time, not a global firehose (this falls out naturally if F2 is resolved as drill-down);
  (b) **gate** the domain review so it doesn't run/surface until the capability layer is
  reviewed and reasonably stable — don't critique the details of a structure the user hasn't
  accepted yet; (c) reuse SPEC-001 §4.4 finding identity + one **unified review inbox** with a
  layer facet ("Capabilities / Details"), positive-first framing, and progressive disclosure
  (top N, "show more"), so domain findings extend the existing loop instead of opening a second,
  parallel firehose. State this as an explicit UX requirement in §7, not an implementation
  afterthought.

### F4 — [Major] The diff-before-apply / safe-edit guarantee is not restated, and domain edits are structurally more dangerous (cascades)
- **Location:** §7 ("reusing SPEC-001's NodeDetail/review patterns"), R4 (editing capabilities
  can orphan domain elements), DM6 (dangling refs)
- **Issue:** SPEC-001's REV-004 F2 made **"Apply must show a diff of the exact text change and
  require confirmation — never silent mutation"** the single most important HITL trust
  affordance, and SPEC-001 §7.4 enshrined the mandatory diff. SPEC-002 gestures at "reusing…
  review patterns" but never restates this guarantee — and the edits here are riskier than
  capability edits. Adding/removing an aggregate cascades: deleting the Lead aggregate orphans
  its commands and events (R4/DM6); renaming an aggregate breaks every `command.aggregate` and
  `event.aggregate` reference; editing a capability can orphan the whole domain cluster it owned.
  A non-technical user clicking "Apply" on an LLM suggestion, or deleting one record, must not
  discover afterward that three actions and two events silently vanished.
- **Recommendation:** Restate explicitly in §7 that **every Apply/edit in the domain view shows
  a mandatory diff and requires confirmation before writing** `domain_model.yaml`, and that the
  diff/confirmation must **surface cascades** — "Deleting the Lead record will also remove:
  Qualify Lead (action), Lead Qualified (event). Continue?" Same for LLM-suggested Applies whose
  `suggestion` is prose (REV-004 F2): disable Apply or downgrade to "open in the form
  pre-filled" when the change isn't mechanically executable. Since every mutation is a git
  commit, also require an **Undo/revert** affordance for these multi-element changes.

### F5 — [Major] No empty states or onboarding for the new view; DM5-as-error would flood day-one with red
- **Location:** §7 (UI), §6 DM5, §8 A1/A6, SPEC-001 §7.1 (worked example), §11 Q4
- **Issue:** REV-004 F4 required designed empty states and a worked example; SPEC-002 introduces
  a whole new view and specifies none. The riskiest moments here: a capability that has no
  aggregates yet (what does the drill-down show?), an aggregate with no actions/events, the very
  first time the user is asked to "go deeper." Worse, **DM5 as written is an error** ("every
  capability owns ≥1 aggregate (else the capability is under-modeled)"). On first entry to the
  domain view, *every* capability is under-modeled — so the user is greeted by a wall of DM5
  errors before they've done anything. That is the SPEC-001 "AI thinks my business is broken"
  failure, at the exact onboarding moment.
- **Recommendation:** Add an "Onboarding & empty states" note to §7: (a) each empty state has an
  explanatory message + one clear primary action ("This capability doesn't track anything yet —
  generate its details" / "Add a record"); (b) **extend the solar worked example (SPEC-001 §7.1)
  to include a fully-modeled domain layer**, so the user sees a good aggregate/command/event
  cluster before authoring their own; (c) resolve **Q4 in favor of DM5 being a warning, not an
  error** (see also F8) — an unmodeled capability is a *prompt to deepen*, not a defect, and
  pure-orchestration capabilities may legitimately own nothing. Guided-generation ("model the
  details for this capability") should be the primary action out of every empty state.

### F6 — [Minor] Provenance is stored (DM8) but the spec doesn't require the *derivation rationale* be shown in plain language
- **Location:** §5 (each element "citing the capability/activity it derives from"), §6 DM8, §7
  ("provenance chips")
- **Issue:** DM8 and the "provenance chips" in §7 are the right backbone, but REV-004 F8's point
  stands and is more acute here: for an LLM-proposed aggregate/command/event the user's first
  question is "why does the AI think my business has this?" A chip that only proves an anchor
  exists doesn't answer that. The derivation is stored but not required to be *displayed as an
  explanation*.
- **Recommendation:** Require the domain NodeDetail to render the derivation in plain language —
  "We suggested the **Lead** record because your Lead Management capability *produces Lead*" /
  "…because you wrote 'we qualify every lead before quoting.'" This is the explainability payoff
  of the whole HITL contract and it's cheap given DM8 already captures the anchors.

### F7 — [Minor] Commands and events triple the on-screen vocabulary; they should default to collapsed (ties to Q1)
- **Location:** §7, §11 Q1 ("aggregates only" vs full)
- **Issue:** From the UX lens, Q1 is not just a scoping question — it's a cognitive-load
  question. Aggregates ("things you keep track of") are the most intuitive of the three;
  commands and events are the abstract pair that require understanding the act-on/emit
  relationship. Showing all three by default triples what the user must parse at first contact.
- **Recommendation:** If commands/events stay in the MVP (see Q1 answer below), the drill-down
  should **default to showing aggregates and their details, with actions/events collapsed behind
  a "show what happens here" expander.** Let the user meet the easy concept first and opt into
  the harder pair. This gives most of the "aggregates-only" simplicity benefit without dropping
  the layer.

### F8 — [Minor] Finding severity labels and the DM5 error/warning split need user-facing mapping
- **Location:** §6 (DM checks), §7 (findings list), §11 Q4
- **Issue:** REV-004 F6 already flagged that "blocker/major/minor" imports engineering
  connotations meaningless to a business owner (nothing is "blocked" — N2, no codegen). Domain
  findings inherit this, and DM5's error/warning classification (Q4) directly drives how alarming
  the first-run experience feels (F5).
- **Recommendation:** Reuse REV-004 F6's consequence-based display labels ("Needs attention /
  Worth reviewing / Optional") for domain findings, and classify the "structure is incomplete"
  checks (DM5, aggregates-with-no-commands, commands-with-no-events) as **low-severity
  suggestions to deepen**, not errors — reserving hard errors for genuine integrity breaks (DM2
  double-owner, DM6 dangling ref).

### F9 — [Minor] `produces`/`consumes` vs aggregates (Q5) is a comprehension problem, not just a data-modeling one
- **Location:** §3 (aggregate "Lead"), SPEC-001 §3.2 (`produces: [Lead]`), §11 Q5
- **Issue:** If the Capability Map keeps showing `produces: Lead` while the domain view
  introduces a separate `Lead` aggregate, the user sees the same noun on two surfaces with no
  stated relationship — a comprehension tax and a subtle "which one is real?" doubt.
- **Recommendation:** Resolve Q5 so the two are **the same object to the user**: the aggregate
  *is* the thing produced, and the `produces`/`consumes` chip is the entry point that drills into
  the aggregate's detail (reinforces F2). Whatever the internal migration decision, the *surface*
  must present one "Lead," not two.

### F10 — [Nit] Attribute typing (Q3) — free-form names are the lower-friction first cut
- **Location:** §3 (attributes as bare names), §11 Q3
- **Issue:** Asking a non-technical user to pick types (string/number/date) per attribute adds a
  form-filling burden and a small vocabulary ("what's a string?") for little MVP payoff, since
  there's no codegen (N2) to consume the types yet.
- **Recommendation:** Keep attributes as **free-form names** in the MVP (Q3); defer typing to
  when a downstream consumer needs it. If types are added later, infer a default and let the user
  correct it, rather than requiring a choice up front.

---

## Answers to §11 open questions (UX lens)

- **Q2 (primary UX question) — separate tab vs. expansion of the selected capability?**
  **In-context drill-down / expansion, not a co-equal second graph.** See F2. A separate Domain
  tab that renders its own canvas creates two parallel mental models over the same composed IR
  and duplicates the `Lead`-appears-twice confusion (F9). Keep the Capability Map as the single
  home; the domain layer is revealed *inside* a selected capability's detail as an optional
  deepening (F1's gating). Any whole-model domain overview should be a read-only secondary
  projection over the same map, never an independently authored second graph. This is the answer
  that best satisfies R5 (optional deepening) and avoids the two-mental-models trap.

- **Q1 — aggregates only vs. aggregates+commands+events for the MVP?**
  From the UX lens, favor **aggregates-first**: either ship aggregates-only for the domain-view
  MVP (commands/events to a later increment), or — if the model still generates all three —
  **default the UI to aggregates with commands/events collapsed** (F7). Aggregates are the one
  term of the three a non-technical user grasps intuitively; the command→emits→event triad is the
  cognitive cliff. Leading with aggregates lets the user get value and confidence before meeting
  the harder concepts.

- **Q3 — typed attributes now or free-form names first?** **Free-form names first** (F10). No MVP
  consumer needs types; typing is added form friction and vocabulary for a non-technical user.

- **Q4 — DM5 (every capability owns ≥1 aggregate): warning or error?** **Warning, not error**
  (F5, F8). On first entry every capability is unmodeled, so error-classing DM5 greets the user
  with a wall of red at the worst moment; and pure-orchestration capabilities may legitimately
  own nothing. Treat it as a low-severity "deepen this?" nudge.

- **Q5 — reuse `produces`/`consumes` as the aggregate seed / migrate or keep both?** However the
  data question is settled, the **UX requirement is one object, not two**: the aggregate is the
  thing produced, and the `produces` chip drills into it (F9, F2). Do not show the user a
  `produces: Lead` and a separate `Lead` aggregate as if unrelated.

---

## Disposition

Verdict: **Approve-with-changes.** The layer is architecturally sound and reuses the right
trust machinery; the loop is coherent as engineering. But as specified it hands a non-technical
founder three new terms of art, a second review firehose, and an undecided second view. Resolve
the two Blockers before build — **(F1)** decide the vocabulary/gating (business-language surface
*and* progressive disclosure, so the layer is a genuine optional deepening per R5), and **(F2)**
resolve Q2 as in-context drill-down unifying with `produces`/`consumes`, so there is one map and
one mental model — and fold the Majors (finding scoping/gating F3, diff-and-cascade safety F4,
empty states + worked example F5) into §7 and the milestones. The Minors/Nits mostly reuse
decisions SPEC-001 already made (F6 derivation display, F8 severity labels) and should be
carried forward explicitly rather than left to "reusing SPEC-001's patterns."
