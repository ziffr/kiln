---
id: REV-016
title: "UX / Human-in-the-Loop Review of SPEC-003"
type: review
status: Approved
version: 1.0.0
author: "Claude (Opus 4.8) — ux-hitl lens"
created: 2026-07-10
updated: 2026-07-10
supersedes: null
reviews: SPEC-003
lens: ux-hitl
verdict: Approve-with-changes
related: [SPEC-003]
reviewers: [ux-hitl]
---

# REV-016 — UX / Human-in-the-Loop Review of SPEC-003

## Summary

SPEC-003 has the right instincts and inherits the right backbone: authored-vs-derived typing,
grounded provenance (BC8), deterministic validators, "the model proposes, validators + the human
decide," and — crucially — it has already **learned the two lessons my predecessors fought for**.
It refuses to print "bounded context" to the operator (R1, §7), and it explicitly frames Areas as
the *coarsest, arguably default* lens rather than yet another deep layer (R3). That is a materially
better starting posture than SPEC-002 had at the same stage.

But the spec repeats SPEC-002's structural mistake in a milder form: **the single most consequential
UX decision is deferred to "UX review to choose"** (§7 rendering options 1 vs 2; Q1). It even leaves
the door open to "an Areas panel/column" as a co-equal surface — which is the same second-mental-model
trap REV-011 F2 blocked for the domain view. And it hands the operator a **new editing gesture
(drag between areas)** that, taken literally, collides head-on with golden invariant #1 (the canvas
never holds truth; node positions are computed by elk and never persisted). A drag that *looks* like
moving a node but *means* an authored reassignment is exactly the kind of ambiguous, un-undoable,
inaccessible interaction a non-technical operator will misfire.

The good news, and why this is genuinely lower-risk than SPEC-002: Areas is a **small, coarse,
glanceable** artifact (2–6 groups over ~10 capabilities), not a firehose. Done right it *reduces*
cognitive load — it is the "here are the three-or-four parts of your business" overview the operator
already carries in their head. The layer nests cleanly with what exists: **regions (backdrop) →
capabilities (nodes) → entities (NodeDetail expansion)** is one surface at three depths, which is the
correct answer to R3 and is fully compatible with REV-011's "one map, one mental model."

So this is **Approve-with-changes** with **two Blockers**: (F1) resolve Q1 as an overlay on the
single existing map — never a separate Areas view/tab/graph; and (F2) decide the editing model in
favor of a form-based reassignment on NodeDetail and define the missing **Area-detail surface** that
area-level edits and area-level findings both require today. The Majors carry forward the
diff-before-overwrite, plain-language-findings, and provenance-rationale guarantees my predecessors
already won and this spec must not silently drop.

---

## Findings

### F1 — [Blocker] The rendering / default-lens decision (Q1) is deferred, and one of the offered options is the SPEC-002 second-surface trap
- **Location:** §7 (rendering options 1 & 2), R3, Q1
- **Issue:** §7 offers two renderings and punts the choice to "UX review." Option 2 — "**An Areas
  panel/column** … with the map tinting/filtering by the selected area" — is, if it becomes the home
  of the layer, precisely the failure REV-011 F2 blocked: a second surface listing the same
  business, divorced from the Capability Map the user just learned, forcing them to hold two mental
  models and mentally join them. The app today is a single composed IR rendered as **one** map
  (`App.tsx` → `CapabilityMap`), with entities already drilling **in-context** inside `NodeDetail`.
  A parallel Areas canvas/list-as-authoring-home would fracture that. This is build-blocking: the
  review lens, finding click-through, reassignment gesture, and empty states all depend on which
  rendering wins.
- **Recommendation:** Decide it in the spec, as REV-011 forced for the domain view: **Areas is an
  always-on, labeled backdrop *over the single existing capability map*, not a separate view.** The
  coarse lens (regions), the mid lens (capability nodes), and the fine lens (entities in NodeDetail)
  are **the same surface at three depths**, progressively disclosed — this is the clean resolution to
  R3's layer-fatigue risk. Prefer **backdrop bands / tinted regions** (option 1) over React Flow
  parent/group nodes (group nodes make child positions relative and entangle the elk layout and the
  drag semantics F2 warns about). An Areas **list MAY live in the existing left rail as
  navigation/filter/jump-to**, but explicitly *not* as the place where areas are authored or where
  the model "really" lives. Rewrite §7 to state this as the decision; delete option 2-as-home.

### F2 — [Blocker] The editing model is undecided, drag-between-areas conflicts with invariant #1, and there is no Area-detail surface for area-level edits or findings
- **Location:** §7 ("reassign a capability … a select on the capability's detail, **or drag between
  areas**"; "create/rename/retire a context, edit its intent"), §7 findings ("clickable → the
  offending capability/**context**"), golden invariant #1
- **Issue:** Two coupled gaps.
  1. **Reassignment gesture.** "Drag between areas" is offered co-equally with a form select. But the
     canvas positions are computed by elk and **never persisted** (invariant #1; `CapabilityMap.tsx`
     recomputes layout from the IR every time). A drag therefore has no truth to write *as a
     position* — it would have to be reinterpreted as an authored context reassignment, while looking
     identical to panning/moving a node. That is ambiguous, hard to undo, inaccessible (no keyboard
     path), and fiddly against small backdrop bands. It is a trap as a *primary* path.
  2. **No Area-detail surface exists.** `NodeDetail` renders **capabilities only** (and their owned
     entities). But §7 requires create/rename/retire an area and edit its intent, and §7's findings
     must be "clickable → the offending … context." There is nowhere for an *area-scoped* edit or an
     *area-scoped* finding ("this area is too big," "empty area") to land. The spec assumes a surface
     it never defines.
- **Recommendation:**
  - Make the **primary reassignment a form control on the capability's NodeDetail**: an "Area:
    [Sales & Onboarding ▾]" single-select, consistent with the existing TagList/select patterns,
    keyboard-accessible, unambiguous, undoable. Reassigning the last member out of an area must
    surface the consequence inline ("This leaves *Finance* with no capabilities — retire it?") rather
    than silently tripping BC6.
  - Treat **drag as an optional accelerator only, deferred**: if ever added, a drop onto another
    region must resolve to the *same* authored reassignment edit and show the same confirmation — it
    must never be the only or default path, and must never be mistakable for a layout move.
  - **Define an Area-detail panel** (reachable by clicking a region label): name, purpose (see F7),
    member list, provenance rationale (F6), and a **retire** action with a mandatory reassignment
    step for orphaned members. This is where area-level findings click through to. Without it, §7's
    "clickable → context" is unimplementable.

### F3 — [Major] Accepting / re-generating a partition can silently overwrite the operator's authored areas — the diff-before-apply guarantee is not restated
- **Location:** §5 (`ContextGrouper` proposes a partition), §7 (edits "flip the context's origin to
  authored"), R4 (LLM may re-partition run-to-run), SPEC-001 §7.4 mandatory diff, REV-011 F4
- **Issue:** Today `generate()`/`generateDomainModel()` in `App.tsx` drop LLM output straight into
  the live model with no accept/diff step. For capabilities that is tolerable; for **areas it is
  destructive**. Once the operator has hand-tuned the partition (moved `offer_management` into Sales,
  renamed an area — flipping it to `authored` per §7), re-running `ContextGrouper` — which R4 admits
  may cluster *differently each run* — would silently discard that human judgment. This is the exact
  trust break REV-004 F2 / REV-011 F4 closed for capabilities and entities, and it is *more* acute
  here because grouping is the least deterministic generation in the system (R4).
- **Recommendation:** Restate the guarantee for this layer in §7: a proposed/re-generated partition
  **must be shown as a reviewable change and confirmed before it overwrites authored areas**, and
  authored (`origin: authored`) area assignments must be **preserved, not clobbered**, on
  regeneration (offer "keep my areas / take the AI's / merge"). Because the partition is small (2–6
  areas) it can be reviewed **holistically** — this is the one place accept-all is defensible, in
  contrast to the 30–50-item domain firehose REV-011 F3 warned about — *provided* it never
  overwrites human edits without a diff.

### F4 — [Major] The backdrop-region rendering only reads cleanly if the layout keeps each area's capabilities contiguous — an unstated hard dependency
- **Location:** §7 (rendering option 1: "capabilities drawn inside labeled context regions"),
  `CapabilityMap.tsx` (elk `layered`, `DOWN`)
- **Issue:** The current elk layout orders capabilities by `depends_on`, with **no awareness of
  context membership**. If the members of *Sales* and *Delivery* interleave vertically, no backdrop
  band or hull can enclose either area without overlapping the other — the "coarse map at a glance"
  becomes visual spaghetti and fails the one job that justifies the layer (R3's "most intuitive
  lens"). The spec asserts the rendering as an option but never requires the layout to make it
  achievable.
- **Recommendation:** Require **partition-aware layout** — feed the context partition to elk as a
  grouping/partition constraint so each area's capabilities are laid out contiguously and regions are
  non-overlapping — and specify the **fallback** if clean enclosure isn't attainable for a given
  graph: **color-code capabilities by area + a labeled legend** (still a single map, still one mental
  model) rather than broken bands. State that regions/tints are **read-only projections** (they must
  not become a draggable authoring surface — ties to F1/F2).

### F5 — [Major] BC findings need to join the existing unified panel as plain-language, consequence-labeled, clickable items — not a raw blocker/major dump
- **Location:** §6 (BC1–BC9 with `blocker/major/minor` severities), §7 (findings list), REV-004 F6,
  REV-011 F8
- **Issue:** The BC table imports the same engineering severity vocabulary my predecessors twice
  flagged: "blocker"/"major" mean nothing to a solar installer (nothing is being *blocked* — there is
  no codegen). The app already renders `capFindings` and `domainFindings` as separate lists with
  `code`+`severity` (`App.tsx`). BC findings will become a **third** list; without care the operator
  sees `BC2.unassigned`, `BC7.unique`, `BC6.empty` in red and reads "the AI thinks my business is
  broken." Also: several BC checks are structural-integrity that **structured forms should make
  unreachable** (a form-driven single-select can't produce a double-assignment BC2.multiple or a
  non-slug id BC7) — surfacing them as user "blockers" is alarming noise.
- **Recommendation:** (a) Reuse the consequence-based display mapping (REV-004 F6): **"Needs
  attention / Worth reviewing / Optional."** (b) Class the *shape* checks — empty area (BC6),
  awkward-fit / too-big / boundary questions (the §7 review lens, BC9 cohesion) — as **"suggestions
  to improve," not errors**; reserve hard framing for genuine integrity breaks. (c) Group them under
  an "Areas / Bereiche" header (as `domain-findings` already does for entities) and make every item
  **click through to a real target** — capability-scoped → that capability's NodeDetail (with its
  Area selector); area-scoped → the Area-detail panel from F2. State the click-through targets in §7.

### F6 — [Major] Provenance must be shown as a plain-language *rationale*, and the derived entity→area relationship must be visibly read-only
- **Location:** §3/§6 BC8 (`meta.derivedFrom`), §7 ("provenance chips"), §4 (entity→context is
  derived), REV-004 F8, REV-011 F6
- **Issue:** BC8 stores the anchors and §7 promises "provenance chips," but for an LLM-proposed area
  the operator's first question is "**why did the AI decide these belong together?**" A chip proving
  an anchor exists doesn't answer that. Separately, §4 makes **entity→context derived** (an entity
  inherits its owning capability's area). That is the right data model, but it is a subtle
  mental-model trap: if the UI ever shows an entity's area, the operator will try to change it
  *there* and be unable to — because the real lever is moving the owning capability.
- **Recommendation:** Require the Area-detail panel to render the derivation **in plain language** —
  "We grouped *Lead*, *Customer* and *Offer* management together because they share the **Lead** and
  **Customer** records and depend on each other." This is the explainability payoff of the whole HITL
  contract and BC8 already captures the anchors. And **mark the entity→area relationship read-only
  with a one-line explanation** ("This record is in *Finance* because its capability *Billing* is —
  move the capability to change it"), so the derived projection never masquerades as editable
  (golden invariant #2).

### F7 — [Minor] Don't surface the methodology word "intent" — reuse the existing "Purpose / Zweck"
- **Location:** §3 (`intent`), §7 ("edit its intent"), i18n `capPurpose`
- **Issue:** The artifact field `intent` is fine internally, but the app already teaches the operator
  one word for "what this thing is for": **Purpose / Zweck** (`capPurpose`, used on every
  capability). Introducing a second synonym ("intent") for the identical idea one layer up is
  needless vocabulary and a bilingual translation liability.
- **Recommendation:** Label the area's one-line purpose in the UI as **"Purpose" / "Zweck"** (reuse
  the existing key); keep `intent` as the internal field name only. BC5 stays as-is.

### F8 — [Minor] Area names/intents are user-facing *content* — ContextGrouper must generate them in the project's language, and new chrome needs i18n keys
- **Location:** §5 (`ContextGrouper`), §7 (i18n), i18n.ts (DE default, `coach*` already takes `lang`)
- **Issue:** Unlike capability ids, an area's **name and purpose are prose the operator reads**
  ("Sales & Onboarding" / "Vertrieb & Onboarding"). The narrative interview already passes `lang` to
  the coach; but generation of area names must likewise honor the authoring language, or a German
  operator gets English area labels on their map. Also all new chrome ("Areas/Bereiche," "Area:"
  selector, "Add area," "Retire area," "Purpose") needs keyed strings in both `de` and `en`.
- **Recommendation:** Require `ContextGrouper` to name areas and write intents **in the project's
  narrative language** (thread `lang` as the coach does). Add the new i18n keys in DE + EN;
  area-name/purpose **content** stays in the authored language (consistent with the existing i18n
  note), only chrome is keyed.

### F9 — [Minor] The one unavoidable concept still needs a first-use gloss
- **Location:** §7 (business-language surface), R1, SPEC-001 §7 (glossary/tooltips mandate)
- **Issue:** SPEC-003 correctly hides "bounded context," but "Area/Bereich" is itself a mild term of
  art in this context (an operator may read it as "region/territory"). SPEC-001 §7 mandates a
  one-line plain-language gloss for surfaced terms; the spec should honor that here too.
- **Recommendation:** Ship a first-use tooltip/gloss, in the user's own words — e.g. "**Areas** group
  the parts of your business that belong together — like *Sales*, *Installation*, *Money*." One line,
  business language, reusing the SPEC-001 glossary mechanism.

### F10 — [Minor] From the UX lens, endorse the strict single-membership partition (BC2) — it is the *more* legible model
- **Location:** §3/§6 BC2, R2, Q5
- **Issue:** Q5/R2 (domain review's call) weighs strict partition vs. shared-kernel multi-membership.
  Purely on comprehensibility: **one home per capability** is far easier for a non-technical operator
  to reason about ("Billing lives in Finance") than "Billing is in two areas" (which reads as a
  mistake or a duplicate). Multi-membership would also break the clean backdrop-region rendering (F4)
  — a capability can't sit inside two non-overlapping bands.
- **Recommendation:** As a UX input to Q5: **keep the strict partition (BC2) for the MVP.** If
  shared-kernel membership is ever added, it needs a distinct visual treatment and a plain-language
  explanation, or it will read as a bug — do not introduce it as an unmarked default.

### F11 — [Nit] "Areas" is thin standing alone — consider "Business Areas / Geschäftsbereiche"; reject "Domains" and "Departments"
- **Location:** §7, Q6 (see full answer below)
- **Issue/Recommendation:** See the Q6 answer. The container noun is secondary to the area *names*,
  but "Areas/Bereiche" alone is vague ("areas of what?").

### F12 — [Nit] Give the operator a "hide banding" escape hatch (anti-fatigue)
- **Location:** §7, R3
- **Issue:** Even done well, some operators will want the plain capability map without regions while
  they focus.
- **Recommendation:** A simple **toggle to flatten the Areas backdrop** on the single map (regions on
  by default, off on demand). Cheap, and it fully neutralizes R3's fatigue risk without adding a
  view.

---

## Explicit answers to the open questions

### Q1 — Default lens & rendering
**Neither a separate tab nor a co-equal second graph/panel-as-home. Render Areas as an always-on,
labeled backdrop *over the single existing capability map*, and make it the default backdrop — not a
default separate view.** (F1, F4, and consistent with REV-011's "one map, one mental model" and
REV-004's endorsement of derived read-only groupings on the map.)

Concretely:
- **One surface, three depths, progressively disclosed:** Area regions (coarsest, backdrop) →
  capability nodes (mid) → entities inside NodeDetail (finest). This *is* the answer to R3's
  layer-fatigue risk: it's not three layers to switch between, it's three zoom depths on the map the
  operator already knows.
- Prefer **backdrop bands / color-tinted clusters** over React Flow parent/group nodes (simpler
  layout + drag story). Regions are **read-only projections**, never a draggable authoring surface.
- Require **partition-aware elk layout** so each area's capabilities stay contiguous (F4); fall back
  to **color + legend** if clean enclosure isn't achievable.
- An Areas **list may live in the left rail as navigation/filter/jump-to**, but never as the
  authoring home. Provide a **banding on/off toggle** (F12).
- "Default lens" = the map *opens with regions shown* (coarse read available immediately), not a
  distinct Areas screen the user lands on instead of the map.

### Q6 — Surface label
**"Areas" is an acceptable, correct choice — it does the essential job of never printing "bounded
context."** But it is thin standing alone. My ranked guidance:
1. **Preferred:** "**Business Areas**" / DE "**Geschäftsbereiche**" — slightly more grounded, still
   plain language, no jargon.
2. **Acceptable:** "**Areas**" / "**Bereiche**" if space is tight (add the F9 gloss to compensate for
   the vagueness).
3. **Reject "Domains"** — it collides with the domain-model layer (SPEC-002) and the existing
   `domain` field in the code and workspace metadata; next to the "Entities/Entitäten" surface it
   would actively confuse.
4. **Reject "Departments"** — imposes an **org-chart** mental model (who reports to whom) that need
   not match a capability clustering; a one-person solar installer has no "departments" but does have
   "areas of the business."

The decisive point: the **individual area names** ("Sales & Onboarding," "Delivery," "Finance") are
where the business language lives and where comprehension is won or lost (F8). The container noun is
secondary — get the names right and generate them in the user's language, and "Areas" vs "Business
Areas" is a low-stakes polish call the design partner (A6) can settle.

---

## Disposition

Verdict: **Approve-with-changes.** SPEC-003 is the strongest-starting of the three specs from a UX
lens — it already refuses the jargon and already frames Areas as the coarse, low-fatigue lens, and
the layer genuinely *reduces* load when rendered as an overlay rather than a new view. Resolve the two
Blockers before build: **(F1)** commit in the spec to Areas-as-backdrop-over-the-single-map (kill the
panel-as-home option), and **(F2)** make reassignment a form select on NodeDetail and define the
missing Area-detail surface that both area edits and area-scoped findings require. Fold the Majors
into §7 and the milestones — **(F3)** diff/preserve authored areas before any regeneration overwrite,
**(F4)** partition-aware layout with a color+legend fallback, **(F5)** BC findings in the unified
panel with consequence-based labels and real click-through targets, **(F6)** plain-language provenance
rationale plus a read-only marking for the derived entity→area relationship. The Minors/Nits mostly
carry forward decisions SPEC-001/002 already made (reuse "Purpose," bilingual generation, glossary,
severity display) and should be written in explicitly rather than left to "reusing the patterns."
