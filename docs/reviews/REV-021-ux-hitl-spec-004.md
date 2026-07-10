---
id: REV-021
title: "UX / Human-in-the-Loop Review of SPEC-004"
type: review
status: Approved
version: 1.0.0
author: "Claude (Opus 4.8) — ux-hitl lens"
created: 2026-07-10
updated: 2026-07-10
supersedes: null
reviews: SPEC-004
lens: ux-hitl
verdict: Approve-with-changes
related: [SPEC-004]
reviewers: [ux-hitl]
---

# REV-021 — UX / Human-in-the-Loop Review of SPEC-004

## Summary

SPEC-004 has internalized the hardest lesson my two predecessors fought for: it opens §7 by
naming the "REV-011/REV-016 discipline — no separate view" and commits, up front, to rendering
commands/events **in-context under each entity in the existing detail panel**, form-edited, with
findings in the shared panel. That is the correct architectural answer to the second-mental-model
trap, and it means the single most consequential decision my predecessors had to *force* is
already made here. Credit where due — this spec starts a lens ahead of where SPEC-002 and SPEC-003
started.

But the discipline it inherited was written when the detail panel was lighter. It no longer is.
`NodeDetail` today already renders, in one overlaid `aside`: an editable name, id, **Purpose**,
an **Area** select, and five tag-lists (**Outcomes, Actors, Depends on, Produces, Consumes**), a
**Provenance** row, and then a **fully-expanded, always-open Entities section** where each owned
entity carries its own name, id, **References** tag-list and **Attributes** tag-list, plus
add/delete. That is roughly nine field groups before the entities, and an unbounded, nested block
after. SPEC-004 now proposes to add, **under each entity**, a **Commands** list (each command with
a chip-select of emitted events, plus add/rename/delete) *and* an **Events** list. For a capability
that owns three entities, that is three more two-list, chip-bearing sub-blocks nested two levels
deep inside a panel that already scrolls. The spec's mitigation — "collapsed by default, expand per
entity" (§7, R2) — is necessary but, as written, **not sufficient**: the *entities themselves are
not collapsed today*, and the panel is a height-constrained overlay, not a full column. Cramming a
fourth element kind under an always-open third is exactly the R2 overload the spec names as its own
headline risk, and it is not yet designed away. That is Blocker **F1**.

The second gap is the one REV-011 F1 raised for SPEC-002 and which SPEC-004 has *not* carried
forward: **"command" and "event" are surfaced raw, with no business-language mandate.** Worse, §7's
review lens and §12 propose to *enforce* their grammar — "imperative commands, past-tense events."
A solar installer does not think "the Lead aggregate emits a Lead Qualified event"; they think "when
I qualify a lead, it becomes qualified." Every other surface in this app already speaks business
language (Entities/Entitäten, Business Areas/Geschäftsbereiche, Purpose/Zweck, Actors/Akteure). This
layer must too. That is Blocker **F2**.

The remaining findings carry forward guarantees my predecessors already won and this spec silently
drops: an **accept/review step and preserve-authored-on-regenerate** for LLM-proposed behaviour
(more acute here because R1 says behaviour over-produces), **consequence-based finding labels with
deep click-through**, **plain-language provenance rationale**, and **empty states + generate-button
sequencing**. None are architectural blockers — the substrate and the in-context decision are right.
But F1 and F2 decide whether the target user can read this panel at all, and they are unmade. So:
**Approve-with-changes**, two Blockers.

---

## Findings

### F1 — [Blocker] The detail panel is already dense; a fourth element kind under an always-open entity block realizes R2 unless disclosure is genuinely restructured
- **Location:** §7 (in-context UI; "collapsed by default, expand per entity"), R2, G5; `NodeDetail.tsx`, `App.tsx` (`.map-wrap` → `aside.node-detail`)
- **Issue:** The prompt's core tension is real and measurable. `NodeDetail` is an `aside`
  rendered *inside* `.map-wrap` (a side/overlay panel over the map, not a full-height column).
  It already presents ~9 field groups (name, id, Purpose, Area select, Outcomes, Actors, Depends
  on, Produces, Consumes, Provenance) **before** the Entities section — and that Entities section
  is rendered **always-expanded**: every owned entity shows its name, id, References tag-list and
  Attributes tag-list inline (`NodeDetail.tsx` L132–179). SPEC-004 adds, *under each entity*, a
  Commands list (each with a chip-select for emitted events + add/rename/delete) and an Events
  list. With 2–3 entities per capability — the solar norm — the panel becomes a deeply nested,
  four-level scroll (capability → entities → per-entity commands → per-command emitted-event
  chips). "Collapsed by default, expand per entity" is the right instinct but under-specified:
  it collapses the *new* commands/events while the *entities* above them stay open, so the user
  still scrolls past every entity's references/attributes to reach the one they want to give
  behaviour to. This is the R2 overload the spec itself owns, not yet designed away.
- **Recommendation:** Specify real, hierarchical, one-path-open disclosure in §7 — do **not**
  answer Q5 with a separate drawer (that reintroduces the second surface REV-011 F2 / REV-016 F1
  blocked). Concretely: (a) make **each entity block itself collapsible**, collapsed to a
  one-line summary (name + counts, e.g. "Lead — 3 details, 2 actions"), with **one entity
  expanded at a time**; (b) *within* an expanded entity, put commands/events behind a further
  **collapsed "What happens here" expander** (extends REV-011 F7's pattern to the fourth kind),
  so behaviour — the deepest, least-intuitive layer — is never on screen until the user opens
  both the entity and its behaviour; (c) state a height/scroll budget for the overlay so the
  panel is usable at laptop height. Same panel, but disclosure that actually holds the density.
  This is the resolution to Q5 (see below) and the mitigation R2 currently only gestures at.

### F2 — [Blocker] "Command" and "event" are surfaced raw with no business-language mandate, and §7 proposes to enforce their grammar — the REV-011 F1 fight, unresolved
- **Location:** §0, §7 (Commands/Events lists; review lens "imperative commands, past-tense events"), §12, Q6; i18n.ts (every existing surface term is business language)
- **Issue:** REV-011 F1 was a Blocker precisely because "aggregate/command/event" are DDD terms
  of art heavier than "capability," and it prescribed a business-language surface with the jargon
  secondary. SPEC-002's UI answered the noun ("Entities/Entitäten," not "aggregate"). SPEC-004
  reopens it for the two hardest terms and does **not** answer it: §7 puts "Commands" and "Events"
  on the surface verbatim, and the only translation offered is the *button* ("Generate behaviour"
  / *Verhalten generieren*). Every other label in `i18n.ts` is already business language —
  Entities, Business Areas, Purpose, Actors, Produces. "Command" and "Event" would be the two
  most technical words in the entire product, printed at the deepest, most-abstract layer, to the
  same explicitly non-technical operator (SPEC-001 §0). Worse, §7's review lens and §12 want to
  *enforce* grammar the user won't parse ("imperative commands, past-tense events"). Telling a
  business owner "this action isn't in the imperative" is meaningless correction (and, bilingually,
  ill-defined — see F8/Q6).
- **Recommendation:** Add a UX requirement mirroring SPEC-001 §7's plain-language clause, covering
  the two new terms. Surface **command → "Actions"** and **event → "What happens"** (past-tense
  facts), with "command/event" kept only as secondary/tooltip labels and internal field names.
  The relationship then reads in plain language: *"Qualify Lead" (an action) → "Lead Qualified"
  (what happens)* — no arrow jargon required. See the surface-terms answer below for the
  bilingual wording and the **collision check** against the existing lexicon (this is not a free
  word choice — "Actions/Aktionen" sits next to the app's existing Actors/Akteure and Core
  Activities/Kernaktivitäten, and any "Result/Ergebnis" choice for events collides with the
  existing Outcomes/Geschäftsergebnisse).

### F3 — [Major] No accept/review step, and regeneration silently clobbers authored behaviour — acute because R1 says behaviour over-produces
- **Location:** §5 (`EventModeler` proposes), §7 ("Generate behaviour"; hand-edits flip to authored), R1, R3; `App.tsx` `generateDomainModel`/`generateAreas` (LLM output written straight into the model, no diff), REV-016 F3
- **Issue:** Today the generate handlers in `App.tsx` drop LLM output directly into the live model
  with no accept/diff gate. That was tolerable for a handful of capabilities; it is dangerous for
  behaviour, which R1 explicitly flags as the layer most prone to **over-production** (a
  command/event per verb in the narrative). "Generate behaviour" could dump 20–40 new
  commands/events across the entity blocks at once, unreviewed — the firehose REV-011 F3 warned
  about, now at the deepest layer. And once the operator has hand-tuned commands/events (flipping
  them to `authored` per §7), re-running "Generate behaviour" would silently discard that human
  judgment — the exact trust break REV-016 F3 closed for areas, unrestated here.
- **Recommendation:** Restate the guarantee in §7: proposed/regenerated behaviour **must be
  reviewable before it is committed**, and `authored` commands/events **must be preserved on
  regenerate** (offer keep-mine / take-AI's / merge). Given the count, per-aggregate review beats
  a global accept-all: the user accepts one entity's proposed actions at a time (this falls out
  naturally from F1's one-entity-open disclosure). At minimum, generation must land in a
  visibly-new/pending state the user prunes, never silently into the authored model.

### F4 — [Major] A fourth findings list needs consequence-based labels, gentle first-run treatment, and deep click-through — not raw CE-codes into a stacked firehose
- **Location:** §6 (CE1–CE8, blocker/major/minor), §7 (findings in shared panel, "clickable → the owning capability"); `App.tsx` (capFindings + domainFindings + contextFindings already stacked above the map), REV-004 F6, REV-011 F8, REV-016 F5
- **Issue:** Three problems compound. (a) **Vocabulary:** §6 tags CE1–CE8 with
  `blocker/major/minor` and the UI renders `<code className={f.severity}>{f.code}</code>` — so the
  operator sees `CE7.no_command` and `CE8.orphan_event` in red. My predecessors flagged twice that
  "blocker/major" means nothing when nothing is being blocked (N3: no codegen). (b) **First-run
  flood:** CE7 (aggregate with no command) and CE8 (event with no command) fire on *every* entity
  before the user has generated behaviour — a wall of red at the exact onboarding moment, the
  DM5/BC6 mistake REV-011 F5 / REV-016 F5 already corrected. (c) **Click-through depth:** §7 says
  findings click "→ the owning capability," but the offending command/event lives *nested inside
  an entity inside* that capability. Opening the capability panel is not enough — the user still
  has to find the right entity, expand it, and open its behaviour. This will become the *fourth*
  findings list stacked above the map (`App.tsx` L523–565).
- **Recommendation:** (a) Reuse the consequence-based display mapping ("Needs attention / Worth
  reviewing / Optional") for CE findings; (b) class CE7/CE8 (and any "imperative/past-tense" nudge)
  as **"suggestions to deepen," not errors**, and do not surface them until behaviour has been
  generated for that entity — reserve hard framing for genuine integrity breaks (CE2–CE5); (c)
  make click-through **deep-link**: select the capability **and** auto-expand the owning entity
  **and** its "What happens" section, so the user lands on the actual command/event, not just the
  panel that contains it (this depends on F1's collapsible structure). Group CE findings under a
  "What happens / Behaviour" header in the shared panel, consistent with the existing entities/
  areas grouping.

### F5 — [Major] Provenance must be a plain-language rationale, and every command/event needs a visible authored/derived marker
- **Location:** §3/§6 CE6 (`meta.derivedFrom`), §7 ("provenance chips"), §5 (grounded provenance); `NodeDetail.tsx` (prov chips render `#anchor`; entities show a ✎ authored marker), REV-011 F6, REV-016 F6
- **Issue:** §7 promises "provenance chips," which today render as `#anchor` (`NodeDetail.tsx`
  L121–130). For an LLM-proposed command/event the operator's first question is "**why does the AI
  think my business does this?**" — and a chip that only proves an anchor exists does not answer it.
  This is more acute at the behaviour layer than anywhere below it, because commands/events are the
  most inferred, least-obviously-grounded elements (R1/R3). Separately, entities already carry a ✎
  "authored" marker; commands/events must carry the same, or the user can't tell which behaviour is
  their own vs the AI's — the core HITL distinction.
- **Recommendation:** Require the behaviour section to render the derivation **in plain language** —
  "We suggested the action *Qualify Lead* because your *Lead Management* capability says it
  qualifies every lead before quoting." Carry the ✎/derived marker onto every command and event
  (reuse the existing `meta.origin === "authored"` pattern), and keep the `derivedFrom` trail on
  hand-edit (as entity editing already does in `App.tsx`).

### F6 — [Major] No empty states, and the genbar is becoming five generate buttons with no sequence — behaviour depends on entities depends on capabilities
- **Location:** §7 ("Generate behaviour" button), §9 CE-M4, R1; `App.tsx` genbar (Generate / + Capability / Generate entities / Generate areas), SPEC-001 §7.1, REV-011 F5
- **Issue:** SPEC-004 introduces a whole new sub-surface and specifies no empty states: what does
  an entity with no actions show? What does the very first "add behaviour" moment look like? And
  "Generate behaviour" becomes the **fifth** generate-style control in one `genbar` (Generate, +
  Capability, Generate entities, Generate areas, Generate behaviour) with no stated ordering — yet
  behaviour is meaningless until entities exist, which are meaningless until capabilities exist. A
  non-technical operator faces five buttons and no path.
- **Recommendation:** Add an "empty states & sequencing" note to §7: (a) each empty behaviour state
  gets an explanatory line + one primary action ("This record has no actions yet — generate what
  happens here"); (b) **gate "Generate behaviour"** (disable with a tooltip) until the domain
  layer has entities, mirroring REV-011 F3's "don't critique a structure the user hasn't built";
  (c) extend the solar worked example (SPEC-001 §7.1) to include a fully-modeled behaviour cluster
  so the user sees a good action→event example before authoring their own; (d) guided generation is
  the primary action out of every empty state.

### F7 — [Minor] The same event shown both as a standalone Events list and inside a command's emitted-events chips risks "the same fact appears twice"
- **Location:** §7 ("a compact Commands list (name → emitted events) and Events list"), CE8; REV-011 F9
- **Issue:** §7 renders events in two places at once — as chips inside each command's emitted-events
  select, and again as a standalone Events list under the entity. "Lead Qualified" then appears
  twice in the same panel with no stated relationship — the "same noun on two surfaces" comprehension
  tax REV-011 F9 flagged, now within a single block. And CE8 says an event emitted by no command is a
  smell, which implies events are *normally* seen through their emitting command anyway.
- **Recommendation:** Present the fact **once**, primarily *through* its emitting action ("*Qualify
  Lead* → *Lead Qualified*"), and treat the standalone Events list as the narrow "facts not yet
  caused by any action" bucket (the CE8 case), clearly labeled as such — not a co-equal second list
  of the same events. If both must render, visually tie them (same chip identity/colour) so the user
  reads them as one thing.

### F8 — [Minor] Q6 naming enforcement: do not auto-correct the operator's phrasing; any nudge is a soft, language-aware review-lens hint only
- **Location:** §7 (review lens: imperative/past-tense), §12, Q6
- **Issue:** From the UX lens, a validator that flags "your action isn't imperative" or "this isn't
  past tense" is paternalistic noise to a business owner and is **not reliably mechanical
  bilingually** — German imperative vs. past-participle detection is far from a clean slug check, and
  the app is DE-default (`i18n.lng: "de"`). Enforcing English grammar rules on German-authored
  content will misfire. If the app ever *rewrote* the user's wording to fit the grammar, that would
  violate text-as-truth and the human-decides contract.
- **Recommendation:** Answer Q6 **against a hard validator**: keep naming to a **soft review-lens
  suggestion**, phrased as help ("actions read best as a 'do X' phrase; results as 'X happened'"),
  never as a finding that corrects or rewrites authored text, and never severity-coded red. See the
  Q6 answer below.

### F9 — [Nit] New chrome needs DE+EN keys, and the "behaviour/Verhalten" button label is itself mild jargon
- **Location:** §7 (i18n implied), CE-M4; i18n.ts
- **Issue:** All new chrome ("Actions/What happens," add/rename/delete action, emitted-events
  select, the generate button) needs keyed strings in both `de` and `en`, consistent with the
  existing i18n discipline. "Behaviour / Verhalten" as the button label is a mild abstraction that
  doesn't match the surface terms F2 recommends.
- **Recommendation:** Add the keys in DE + EN; align the button with the surface term (e.g. "Add
  what happens" / *Was passiert ergänzen*, or keep "Generate behaviour" only if F2's surface terms
  make "behaviour" legible in context). Command/event content the user types stays in the authored
  language, per the existing i18n note.

---

## Answer to Q5 — UI density: same panel vs. per-entity drawer; where is the line?

**Same panel — never a per-entity drawer — but only if disclosure is genuinely restructured (F1).**
A per-entity drawer is a second surface: the user leaves the entity they were reading to meet its
behaviour somewhere else, then must mentally rejoin the two. That is the same second-mental-model
trap REV-011 F2 and REV-016 F1 both blocked, one layer deeper; reject it for the same reason.

But "same panel, collapsed by default" **as written is not enough**, because the line has already
been crossed: the panel is a height-constrained overlay `aside` that today renders ~9 field groups
plus an **always-open** Entities section. Adding a fourth kind under an always-open third puts you
past the density ceiling regardless of whether the new lists start collapsed. The line is held only
by making the disclosure **hierarchical and one-path-open**:

1. **Entities collapse to summary lines**, one expanded at a time (name + counts).
2. Inside an expanded entity, behaviour lives behind a **further collapsed "What happens here"**
   expander — the deepest, least-intuitive content is never on screen unless the user opens both.
3. A stated **scroll/height budget** for the overlay so it stays usable at laptop height.

That keeps one surface, one mental model, and a single open path from capability → one entity →
its behaviour — which is exactly the "one map, three depths, progressively disclosed" principle my
predecessors converged on, extended to a fourth depth. Do the restructure and the same panel wins;
skip it and R2 is realized.

## Answer to Q6 + the surface-terms question

**Q6 (naming enforcement): leave it to the review lens, as a soft suggestion — do not build a hard
validator, and never auto-correct the user's words** (F8). Grammar-of-verb enforcement is
low-value to a non-technical operator, brittle bilingually (DE is the default authoring language),
and any rewrite of authored phrasing would breach text-as-truth. A gentle, non-red "reads best
as…" hint in the review lens is the ceiling.

**Surface terms (the F2 decision), collision-checked against the existing lexicon:**
- **command → EN "Actions" / DE "Aktionen"** (primary), *command* secondary/tooltip only.
- **event → EN "What happens" / DE "Was passiert"** (primary), *event* secondary/tooltip only.

Relationship, in plain language, no arrow jargon: *"Qualify Lead" (an action) → "Lead Qualified"
(what happens).*

**Critical collision caveat — this is not a free word choice.** The existing UI already uses, in
close proximity, **Actors/Akteure**, **Core Activities/Kernaktivitäten**, and
**Outcomes/Geschäftsergebnisse** (`i18n.ts`). Therefore:
- "Actions/Aktionen" sits inside an A-word cluster (Akteure, Aktivitäten, Aktionen). It is still
  the best fit, but the design partner (A6) should confirm it doesn't blur with Actors/Activities;
  a safe fallback is **"Steps / Schritte"** or "what people do."
- **Do not** use "Results/Ergebnisse" or "Outcomes" for events — it directly collides with the
  capability **Outcomes/Geschäftsergebnisse** surface. "What happens / Was passiert" avoids this;
  "Ereignisse" is acceptable plainer German if a single noun is needed. This collision alone is a
  concrete reason the spec cannot leave the surface terms unspecified.

Per REV-016's precedent, the exact noun is a low-stakes polish the design partner settles — but the
*mandate* to use business language and the *collision constraint* are not optional, and belong in
§7.

---

## Disposition

Verdict: **Approve-with-changes.** SPEC-004 starts a lens ahead of its predecessors: it commits to
the in-context, no-separate-view discipline that REV-011 and REV-016 had to force, and it reuses the
right trust machinery (authored/derived, grounded provenance, deterministic validators, the model
proposes / the human decides). The layer is sound. Resolve the two Blockers before build:
**(F1)** design real hierarchical disclosure — collapsible entity blocks with a nested, collapsed
"What happens here" expander, one path open, a stated height budget — so the fourth element kind
does not realize R2 in an already-dense overlay (this is the answer to Q5, and rejects the
per-entity drawer); and **(F2)** mandate business-language surface terms (Actions / What happens,
Aktionen / Was passiert) with the jargon secondary, honoring the collision constraints against the
existing lexicon, and drop hard grammar enforcement (Q6). Fold the Majors into §7 and the
milestones — **(F3)** accept/review + preserve-authored on regenerate, **(F4)** consequence-based
finding labels with CE7/CE8 as gentle post-generation suggestions and deep click-through, **(F5)**
plain-language provenance rationale + per-command/event authored markers, **(F6)** empty states +
generate-button gating/sequencing. The Minors/Nits (F7 same-fact-twice, F8 no auto-correct, F9
bilingual chrome) mostly carry forward decisions SPEC-001/002/003 already made and should be written
in explicitly rather than left to "reusing the patterns."
