---
id: REV-026
title: "UX / Human-in-the-Loop Review of SPEC-005"
type: review
status: Approved
version: 1.0.0
author: "Claude (Opus 4.8) — ux-hitl lens"
created: 2026-07-10
updated: 2026-07-10
supersedes: null
reviews: SPEC-005
lens: ux-hitl
verdict: Approve-with-changes
related: [SPEC-005]
reviewers: [ux-hitl]
---

# REV-026 — UX / Human-in-the-Loop Review of SPEC-005

## Summary

SPEC-005 has inherited the discipline its four predecessors fought for and it shows: §7 opens by
naming the "REV-011/016/021 discipline — no separate view," it renders reactions **in-context** in
the existing "What happens" panel, it has **already picked a business-language surface**
("Automations / Wenn… dann…", explicitly *not* "policy") and **already answered Q5 in the spec**
rather than punting it to this review, and it reuses the trust backbone (authored/derived, grounded
provenance PL5, deterministic validators, the model proposes / the human decides). On the two axes
where REV-011 and REV-016 had to *force* a decision — no second surface, no jargon — SPEC-005
starts already-correct. Credit where due.

But this is the **fifth concept** (capabilities → areas → entities → commands/events → **reactions**),
and it lands in the one panel that is already the densest surface in the product, at a nesting depth
none of its predecessors reached. Worse, a reaction is not like the four kinds before it: every kind
so far was **local** — an entity, its attributes, its actions, the events those actions emit all live
*inside the capability you are looking at*. A reaction is **inherently non-local**: *Invoice Paid
(Billing) → Schedule Installation (Delivery)* is the whole point of the layer (§0). §7 shows it under
the triggering event only — which means the **target of the automation is off-screen, in a different
entity, in a different capability, often in a different area**, and there is no diagram of the jump.
The operator is asked to author, trust, and edit a cross-business connection while able to see only
one of its two ends. That "fifth concept + depth-five nesting + hidden cross-entity target" is the
headline risk, and it drives the two Blockers.

The first Blocker (**F1**) is the density/nesting one, and it is *worse* than REV-021 F1 feared,
because REV-021's own fix was only half-built: `EntityBehaviour` did get its collapsed "What happens"
toggle, but the **entity blocks above it are still rendered always-open** (`NodeDetail.tsx` L230–272
maps every owned entity expanded). SPEC-005 now proposes to put an **editable** reaction form —
with a command-picker — *inside* that collapsed panel, *inside* the always-open entity, turning the
read-only "What happens" panel into an authoring surface at depth five. The second Blocker (**F2**)
is the non-locality one: shown under the trigger only, the reaction hides its target, gives the
operator no way to see it on the reacting side ("why does *Schedule Installation* run itself?"), and
no visible connection on the map — the exact thing a saga/process-manager most needs and the thing a
non-technical operator cannot infer.

Neither Blocker is a substrate problem — the in-context decision and the surface term are right, and
§4's derived chain `command → emits → event → when → policy → then → command` already gives the data
needed to *draw* the jump. The Majors carry forward the accept-before-commit, plain-language
provenance, consequence-labeled findings, and empty-state/sequencing guarantees my predecessors won
and this spec again leaves to "reuse the patterns." So: **Approve-with-changes**, two Blockers.

---

## Findings

### F1 — [Blocker] A fifth concept, editable, at depth five, in a panel whose REV-021 density fix is only half-implemented
- **Location:** §7 ("under each event … a policy is edited as a small form"), G5, R2; `NodeDetail.tsx` L230–272 (entities always-open), L110–140 (`EntityBehaviour` read-only, collapsed)
- **Issue:** The prompt's core tension is real and now measurable in code. To reach a reaction the
  operator traverses: capability NodeDetail → **Entities** section (rendered **always-open**, every
  owned entity expanded with name, id, references, attributes) → the collapsed **"What happens"**
  panel → a specific event → the reaction. That is five levels in a height-constrained overlay
  `aside` that, *before* the entities, already shows ~10 field groups (name, id, Purpose, Area
  select, Outcomes, Actors, Depends on, Produces, Consumes, Provenance). REV-021 F1 asked for
  *collapsible, one-open-at-a-time entity blocks*; the code shows only the inner "What happens"
  toggle got built — the entity blocks themselves never became collapsible. So SPEC-005 stacks a
  fifth kind onto a mitigation that is half-done. And it makes it **worse than the four before it**:
  commands/events render *read-only* in `EntityBehaviour` today (L110–140); §7 wants the reaction
  to be **edited in place** (a form, a command-picker), i.e. it converts the deepest, most-collapsed,
  read-only panel into an authoring surface. For a Billing capability owning an Invoice entity, the
  operator scrolls past nine field groups and the full entity block to open "What happens," then
  edits a form five levels deep. This is the R2 overload the spec names as its own headline risk,
  not designed away.
- **Recommendation:** Before adding the fifth kind, **finish REV-021 F1's restructure** and specify
  it in §7: (a) make **each entity block itself collapsible**, collapsed to a one-line summary
  (name + counts, e.g. "Invoice — 4 details, 2 actions, 1 automation"), **one entity expanded at a
  time**; (b) keep reactions behind the already-collapsed "What happens" expander so they are never
  on screen until the operator opens both the entity and its behaviour; (c) state a **height/scroll
  budget** for the overlay. Then decide *where reactions are authored vs. merely shown* — do **not**
  make the deepest read-only panel the primary editing surface for a cross-entity object. Pair this
  with F2: the reaction's **authoring home** should be one clear place (under the trigger event is
  acceptable), with the other end a read-only projection — not two editable copies. Same panel, same
  no-second-view discipline, but disclosure and an edit-home that actually hold a fifth concept.

### F2 — [Blocker] Shown under the trigger only, the reaction hides its target — the cross-entity/cross-area jump has no visible connection and no reacting-side view
- **Location:** §0 (cross-entity is the *point*), §7 ("under each event … *→ then: Schedule
  Installation (Delivery)*"), §4 (derived chain), Q3, Q6, R1; `CapabilityMap` (single map today draws
  `depends_on` edges), REV-011 F9 (drill-through unification), REV-021 F7 (same-fact tie)
- **Issue:** Every prior kind was local to the capability on screen; a reaction is not. *Invoice
  Paid → Schedule Installation* fires across entities, capabilities, and usually **areas** (Billing →
  Delivery). §7 renders it **only under the triggering event**, as a text label "*→ then: Schedule
  Installation (Delivery)*." Three failures follow, all fatal to trust for a non-technical operator:
  1. **The target is off-screen.** The reacting command lives in another capability's NodeDetail that
     is not open. The operator sees a name and an area badge but cannot see, verify, or navigate to
     the thing that will run. A label is not a connection.
  2. **The reacting side is blind.** An operator who opens the Delivery/Installation entity sees
     *Schedule Installation* as an action with **no indication it runs itself** on Invoice Paid. They
     will read it as a manual step and mismodel their own business. The automation is invisible from
     exactly the place its consequences land.
  3. **No diagram of the jump.** There is no arc on the map, so the single most valuable thing this
     layer produces — "paying the invoice automatically schedules the install, across the business" —
     is never *shown*, only buried as text five levels deep under the other end. §4 already defines
     the derived path `command → emits → event → when → policy → then → command`; the data to draw
     the jump exists and is unused by the UI.
- **Recommendation:** Make the connection **visible and bidirectional, without a second view**:
  - **Author in one place, project in both** (Q3): keep the editable reaction under the trigger event
    ("when *Invoice Paid* → do *Schedule Installation*"), and render a **read-only inbound line under
    the reacting command** ("*Automatically triggered by: Invoice Paid (Billing)*"), visually tied to
    the same authored policy (same identity/colour, REV-021 F7). Neither end alone is sufficient.
  - **Draw the reaction on the single existing map** as a derived connector (the §4 chain is exactly
    a map edge, like `depends_on` already is) — a distinct style from dependency edges — so the
    cross-entity/cross-area jump is legible *at a glance* and the operator never needs a mental
    diagram. This is a read-only projection (invariant #2), fully inside the one-map/one-model
    discipline.
  - **Make the target navigable**: clicking the target name (either the label under the trigger or
    the map edge) selects the reacting capability and deep-links to that command — so the jump is
    traversable, not just described. Without navigation the cross-entity label is a dead end.

### F3 — [Major] No accept/review step, and "Generate automations" can dump a policy-per-event into the model — acute because R1 is over-wiring
- **Location:** §5 (`PolicyModeler`, single call, coerce→validate→repair), §7 ("Generate automations"
  button), R1 (over-wiring), A5 (guardrail against a policy per event); `App.tsx` L315
  `generateBehaviour` (LLM output written straight into the model), REV-016 F3, REV-021 F3
- **Issue:** The existing generate handlers drop LLM output directly into the live model with no
  accept/diff gate. R1 flags over-wiring — "a policy for every event balloons into spaghetti" — as
  the top risk, and §5 runs policy generation as a **single global call** over the whole behaviour.
  So "Generate automations" is precisely the control most likely to inject a large, unreviewed set of
  cross-business connections at once — the firehose, now at the layer that spans the *entire* map.
  And once the operator has hand-authored or pruned automations, re-running the generator would
  silently clobber that judgment — the trust break REV-016 F3 / REV-021 F3 already closed for areas
  and behaviour, unrestated here.
- **Recommendation:** Restate in §7: generated/regenerated automations **must be reviewable before
  they are committed** (land in a visibly-pending state the operator accepts or prunes, never
  silently into the authored model), and **`authored` policies must be preserved on regenerate**
  (keep-mine / take-AI's / merge). Because automations are cross-cutting and few-but-consequential,
  a **holistic accept step with the count and the cross-area ones highlighted** is the right shape
  (unlike the per-entity behaviour firehose) — the operator wants to see "the AI proposes these 6
  automations, 3 of them cross an area boundary" and approve deliberately.

### F4 — [Major] The reaction's edit form is a cross-namespace command picker — needs grouping, search, business language, and a cross-entity default
- **Location:** §7 ("a policy is edited as a small form (pick the reaction command, optional
  condition)"), §5 (prefer cross-entity), §6 PL3; `NodeDetail.tsx` (existing selects are single-area,
  e.g. the Area reassignment `<select>`)
- **Issue:** Every picker in the app today chooses from a *small, local* set (attribute types, the
  handful of areas, an entity's own events). The reaction's "pick the reaction command" is
  categorically bigger: it must select from **every command across every entity in every
  capability** — potentially dozens — because a reaction's target is by definition elsewhere (§5
  prefers cross-entity). A flat `<select>` of every command in the business, presented five levels
  deep (F1), is unusable and will push the operator toward the nearest same-entity command — exactly
  the redundant self-loop PL6 warns against. The spec says "small form" but the form's hardest job
  (finding the right distant command) is unspecified.
- **Recommendation:** Specify the picker: **group candidate commands by capability/area**, make it
  **searchable/type-ahead**, label each option with its area for orientation (as §7 already does for
  display), and **surface cross-entity candidates first** (matching §5's preference and PL6's smell).
  Use the business-language noun for the target — an "action" (*Aktion*, per REV-021's established
  command→Aktion surface), not "command." Guard the empty/degenerate case (no commands on other
  entities yet → guide to generate behaviour first, not an empty dropdown).

### F5 — [Major] A fifth findings list needs consequence-based labels, must not flood pre-generation, and its click-through has *two* ends
- **Location:** §6 (PL1–PL7, blocker/major/minor), §7 (review lens: dangling hand-off, skipped step,
  cycles; "findings … clickable → the triggering event's entity"); `App.tsx` L601–604 (behaviour
  findings already the 4th stacked list), REV-011 F8, REV-016 F5, REV-021 F4
- **Issue:** Three compounding problems, all previously flagged. (a) **Vocabulary:** §6 tags PL1–PL7
  `blocker/major/minor` and the UI renders `<code className={f.severity}>{f.code}</code>` — the
  operator sees `PL3.reaction` and `PL7.cycle` in red though nothing is *blocked* (N4: no execution).
  (b) **First-run flood:** the review lens fires "events that should trigger a reaction but don't" (a
  dangling hand-off) on essentially *every* event before the operator has generated any automations —
  a wall of red at onboarding, the DM5/CE7 mistake corrected twice already. PL6 (self-loop) and PL7
  (cycle) are explicitly *smells*, not errors. (c) **Click-through ambiguity:** §7 says a finding
  clicks "→ the triggering event's entity," but a reaction has **two ends**, and several findings are
  *about* the target end (a reaction that skips a step, a cross-area jump). A cycle finding (PL7)
  spans several. Landing only on the trigger entity is often the wrong end, and this becomes the
  **fifth findings list** stacked above the map.
- **Recommendation:** (a) Reuse the consequence-based display ("Needs attention / Worth reviewing /
  Optional") for PL findings; (b) class the **review-lens smells** (dangling hand-off, PL6 self-loop,
  PL7 cycle) as *suggestions*, not errors, and **do not surface the "should have a reaction" nudge
  until automations exist** — reserve hard framing for genuine integrity breaks (PL2/PL3 dangling
  on/then, PL4 duplicate id, which structured forms should make largely unreachable anyway); (c)
  deep-link **to the relevant end** — trigger-side findings to the event, target-side/skip findings
  to the reacting command, cycle findings to the map edge/chain — reusing F2's navigation. Group them
  under an **"Automations / Automatisierungen"** header, consistent with the existing entities/areas
  grouping.

### F6 — [Major] Provenance must read as a plain-language "why", and every reaction needs a visible authored/derived marker
- **Location:** §3/§6 PL5 (`meta.derivedFrom`), §5 (grounded, cite boundary evidence), §7
  ("provenance chips"); `NodeDetail.tsx` L212–221 (chips render `#anchor`; entities show ✎),
  REV-016 F6, REV-021 F5
- **Issue:** §7 promises "provenance chips," which today render as `#anchor`. For an LLM-proposed
  automation the operator's first and sharpest question is **"why does the AI think paying an invoice
  should schedule an installation?"** — a cross-business causal claim about *their* operation. A chip
  proving an anchor exists does not answer it, and the stakes are higher here than at any layer below,
  because a reaction asserts a *behavioural consequence*, not just a structural fact. Separately, the
  operator must be able to tell at a glance which automations are the AI's and which are their own —
  the core HITL distinction — but §7 does not carry the ✎/derived marker onto reactions.
- **Recommendation:** Require each reaction to render its derivation **in plain language** — "We
  suggested this automation because your narrative says *installation is scheduled once the deposit
  is paid* (§delivery-after-payment)." Carry the ✎ authored / derived marker onto every policy
  (reuse the `meta.origin === "authored"` pattern), and preserve `derivedFrom` on hand-edit as entity
  editing already does.

### F7 — [Major] No empty states, and "Generate automations" is a sixth generate button with an unstated prerequisite chain
- **Location:** §7 ("Generate automations" button), §9 PL-M4, R1; `App.tsx` L509–521 genbar (already
  five: Generate / + Capability / Generate entities / Generate areas / Generate behaviour),
  SPEC-001 §7.1, REV-021 F6
- **Issue:** SPEC-005 adds a whole sub-surface and specifies no empty states: what does an event that
  triggers nothing show? What is the first "add an automation" moment? And "Generate automations"
  becomes the **sixth** generate-style control in one genbar, with no stated ordering — yet
  automations are meaningless until events exist, which need entities, which need capabilities. A
  non-technical operator faces six buttons and no path.
- **Recommendation:** Add an "empty states & sequencing" note to §7: (a) each empty automation state
  gets a plain line + one action ("Nothing runs automatically from this yet — generate automations");
  (b) **gate "Generate automations"** (disable with a tooltip) until events exist, mirroring the
  behaviour-gating precedent; (c) extend the solar worked example (SPEC-001 §7.1) with a real
  cross-entity automation so the operator sees a good *when… then…* before authoring one; (d) guided
  generation is the primary action out of every empty state.

### F8 — [Minor] The same fact now renders in three places in one panel — event under its command, event standalone, and reaction under the event
- **Location:** §7 (reaction under the event, in "What happens"); `NodeDetail.tsx` L123–135
  (command→emits line *and* standalone events already both render), REV-021 F7
- **Issue:** REV-021 F7 already flagged that an event shows twice in "What happens" (as a command's
  emitted-event chip and as a standalone entry). SPEC-005 adds a **third** appearance of the same
  event — as the trigger clause of its reaction — inside the same collapsed panel. "Invoice Paid"
  then appears as *Issue Invoice → Invoice Paid*, as a standalone event, and as *when Invoice Paid →
  then …* with no stated relationship among the three renderings — a real comprehension tax in one
  block.
- **Recommendation:** Present the event **once as the anchor** and hang the reaction off that single
  rendering ("*Invoice Paid* → **then** *Schedule Installation (Delivery)*"), rather than introducing
  a third independent line. Tie all appearances by identity/colour so the operator reads one fact,
  not three.

### F9 — [Minor] "Automations / Wenn… dann…" is the right call — but it grows the A-word cluster and wires an "Aktion"; confirm no blur
- **Location:** §7 (surface term "Automations / Wenn… dann…"), Q5; `i18n.ts` (Akteure, Aktivitäten,
  and REV-021's Aktionen), REV-021 surface-terms caveat
- **Issue:** The spec has correctly refused "policy" and picked business language — endorsed (see Q5
  below). The caveat is the same lexical-crowding one REV-021 raised: the German surface would then
  carry **Akteure** (actors), **Kernaktivitäten** (activities), **Aktionen** (commands, per REV-021),
  and now **Automatisierungen** (automations) — four A-words in one product — and the automation's
  *target* is itself an "Aktion." "Automation that runs an Action" can blur if the labels sit close.
- **Recommendation:** Keep **"Automations / Automatisierungen"** as the noun and phrase the pattern
  with the already-established terms — **"Wenn *[was passiert]*, dann *[Aktion]*"** — so the reaction
  reuses the "What happens" (event) and "Aktion" (command) surfaces rather than minting new words.
  Flag the A-cluster for the design partner (A7) to sanity-check for blur; a safe fallback noun if it
  reads crowded is **"Abläufe"** (flows). Do **not** revert to "Regeln/Rules" (too generic) or
  "Richtlinie/Policy" (reads as HR/compliance policy in German).

### F10 — [Nit] New chrome needs DE+EN keys; the condition text is user content and stays in the authored language
- **Location:** §7 (i18n implied), §3 (`condition` plain text); `i18n.ts`
- **Issue:** All new chrome — "Automations/Automatisierungen," "Wenn… dann…," "triggered by," the
  target picker, the optional-condition field label, the generate button — needs keyed strings in
  both `de` and `en`, consistent with the existing i18n discipline. The reaction's `condition`
  ("the order includes installation") and any names are user **content** and must stay in the
  authored language, not be keyed.
- **Recommendation:** Add the keys in DE + EN; align the generate button with the surface noun
  ("Generate automations" / *Automatisierungen generieren*). Condition/target content follows the
  existing i18n content rule.

---

## Answer to Q3 — where reactions live (under trigger, under reaction, or both)

**Both — but authored in one place and projected read-only in the other, plus drawn on the map.**
Under-the-trigger-only (as specced) is insufficient: it hides the target and leaves the reacting
command looking manual (F2). Under-the-reaction-only would hide what an event sets off. Because the
jump is cross-entity/cross-area and there is *no diagram*, the operator needs to see the connection
from **both ends and on the map**:

1. **Authoring home:** the editable reaction lives **under the triggering event** in "What happens"
   ("when *Invoice Paid* → do *Schedule Installation (Delivery)*") — one edit surface, one source of
   truth.
2. **Reacting-side projection:** a **read-only** line under the target command ("*Automatically
   triggered by: Invoice Paid (Billing)*"), tied to the same policy by identity/colour, so the
   automation is visible from where its consequences land.
3. **On the single map:** the §4 derived chain rendered as a **derived connector edge** (distinct
   from `depends_on`), so the cross-business jump is legible at a glance — the one-map/one-model
   answer to "no diagram," never a separate automations board.

All three are one authored policy seen three ways (invariant #2), navigable in both directions (F2).

## Answer to Q5 — surface term

**Endorse the spec's own choice: noun "Automations / Automatisierungen," pattern "Wenn… dann… /
when… then…".** This is the correct, jargon-free surface and — unlike its predecessors — SPEC-005
made the call itself; no change of substance needed. Two constraints belong in §7:
- **Reuse the established terms in the pattern:** "Wenn *[was passiert]* (event), dann *[Aktion]*
  (command)" — reusing the "What happens" and "Aktion" surfaces from SPEC-004/REV-021 rather than new
  words for the two ends.
- **Reject** "Policy/Richtlinie" (term of art; *Richtlinie* reads as compliance/HR policy in German)
  and "Rules/Regeln/Geschäftsregeln" (too generic; overloaded). Watch the **A-word cluster** (F9);
  "Abläufe" is the safe fallback noun. The exact noun is a low-stakes polish the design partner (A7)
  settles — the *business-language mandate* and the *reuse-the-existing-terms* constraint are not
  optional.

## Answer to Q6 — cross-area policies (flag/annotate, or treat uniformly?)

**Flag and annotate them distinctly — do not treat all reactions uniformly.** A cross-area reaction
(Billing → Delivery) is simultaneously the **highest-value** automation (it wires two parts of the
business the operator manages separately) and the **least visible/least expected** (they have no
reason to know a payment event in one area silently drives scheduling in another). Uniform treatment
buries exactly the connections that most need review and are most likely wrong. Concretely:
- Keep §7's area badge on the target, and **additionally mark the crossing** — on the reacting-side
  projection, on the map edge (F2, a cross-area connector styled to stand out), and in the
  accept-before-commit step (F3), where cross-area proposals are called out for deliberate approval.
- In the review lens (F5), a cross-area automation is a "**worth reviewing**" item by default (not an
  error) — a prompt to confirm the intended hand-off, consistent with R1's over-wiring guard.

Same-area and intra-entity reactions stay quiet; the cross-area ones are the headline the operator is
steered to look at.

---

## Disposition

Verdict: **Approve-with-changes.** SPEC-005 starts further ahead than any predecessor on the two axes
that mattered most — it commits to the no-separate-view discipline and it picks (and defends) a
business-language surface itself. The layer is sound and §4 already carries the data to draw the jump.
Resolve the two Blockers before build: **(F1)** finish REV-021 F1's disclosure restructure
(collapsible, one-open entity blocks; a stated height budget) *before* adding a fifth, now-editable
kind at depth five, and decide a single authoring home rather than editing in the deepest read-only
panel; and **(F2)** make the cross-entity/cross-area connection visible and bidirectional — author
under the trigger, project read-only under the reacting command, draw it as a derived edge on the
single map, and make the target navigable — so the operator can see and trust the jump without a
diagram (this is the answer to Q3 and Q6). Fold the Majors into §7 and the milestones — **(F3)**
accept-before-commit + preserve authored on regenerate (acute under R1 over-wiring), **(F4)** a
grouped/searchable cross-entity target picker in business language, **(F5)** consequence-labeled
findings that don't flood pre-generation and click through to the right end, **(F6)** plain-language
provenance rationale + per-reaction authored markers, **(F7)** empty states + gating/sequencing for
the sixth generate button. The Minors/Nits (F8 same-fact-thrice, F9 A-word cluster, F10 bilingual
chrome) mostly carry forward decisions SPEC-001–004 already made and should be written in explicitly
rather than left to "reusing the patterns."
