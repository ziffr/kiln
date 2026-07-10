---
id: REV-004
title: "UX / Human-in-the-Loop Review of SPEC-001"
type: review
status: Approved
version: 1.0.0
author: "Reviewer (ux-hitl)"
created: 2026-07-10
updated: 2026-07-10
supersedes: null
reviews: SPEC-001
lens: ux-hitl
verdict: Approve-with-changes
related: [SPEC-001]
---

# REV-004 — UX / Human-in-the-Loop Review of SPEC-001

## Summary

SPEC-001 gets the most important UX decision right: **text is the source of truth and the
graph is a projection**, with the human holding final say via an Apply/Edit/Dismiss review
loop and explicit workspace checkpoints (§9). The provenance backbone (`sourceRefs`,
click-node-to-source-line in §7.5) and the "graph is stale, recompile" drift guard (§3.3)
are exactly the trust affordances this class of tool needs. The core loop is sound.

However, the spec is written from the **system's** point of view, not the **non-technical
founder's**. The target user "describes their business and the AI helps" — but the MVP as
specified asks that user to (a) understand the word "capability" as a term of art, (b) read
and sometimes hand-edit **YAML** (§3.2, §7.5), (c) interpret typed graph edges and severity
labels, and (d) reason about a "recompile" / `buildHash` mental model borrowed from
compilers. None of these are defined *for the user*. The loop is intuitive for the spec's
authors; it is not yet demonstrably intuitive for a solar installer.

The findings below are almost all about **closing the gap between the internal model and the
user's mental model** — vocabulary, edit surface, review presentation, empty/error states,
and onboarding. None are architectural blockers; the architecture already supports the right
UX. But two Major items (YAML as the primary edit surface, and the undefined review-inbox
interaction) will sink the MVP's usability if left unresolved, so this is
**Approve-with-changes**.

---

## Findings

### F1 — [Major] YAML is exposed as a primary editing surface for a non-technical user
- **Location:** §3.2, §6.1 (Monaco/CodeMirror), §7.5 ("Edit node → writes YAML → recompile")
- **Issue:** The persona is an explicitly non-technical founder (§1). Yet the edit path in
  §7.5 and the tech choice in §6.1 assume the user reads/edits `capabilities.yaml` directly
  (indentation-sensitive, list syntax, typed edge keys like `depends_on`, `produces`). A
  founder who mis-indents one line, or deletes a colon, will silently break the compile and
  have no idea why. This directly contradicts the product promise that they only "describe
  their business." The spec never states whether the user is *expected* to see YAML at all,
  or whether YAML is an internal representation edited exclusively through UI forms.
- **Recommendation:** Make a first-class product decision and write it into the spec: for the
  MVP, the **default and only** editing surface for capabilities is a **structured form / node
  detail panel** (name, purpose, outcomes as chips, dependencies as a picker). YAML is an
  internal artifact the user never has to touch. Optionally expose a "view/edit raw" escape
  hatch behind an "advanced" toggle for power users, with schema validation and inline error
  messages in plain language. Update §7.5 to read "Edit node in the detail panel → the system
  writes YAML → recompile," so YAML is downstream of the UI, never the interaction.

### F2 — [Major] The Apply / Edit / Dismiss review interaction is named but not defined
- **Location:** §4.3, §7.4 ("findings in review inbox, each with Apply / Edit / Dismiss")
- **Issue:** This is the product's stated differentiator, yet the behavior of each verb is
  undefined:
  - **Apply** — does it auto-mutate `capabilities.yaml` from the finding's `suggestion`
    string? The suggestion is free text ("merge into customer_lifecycle | add procurement"),
    which is not a machine-executable action. It is unclear how a prose suggestion becomes a
    deterministic edit, or whether the user reviews a diff before it lands.
  - **Edit** — edit the *finding*, or edit the *model* in response to the finding? Into what
    surface (see F1)?
  - **Dismiss** — persistence of dismissals is flagged as an open question (Q4) but is
    load-bearing for whether the loop feels respectful or nagging.
  There is no mention of a **preview/diff-before-apply** step, which is the single most
  important trust affordance in an "AI proposes, human decides" loop.
- **Recommendation:** Specify each verb explicitly. Minimum bar: **Apply must show a diff of
  the exact text change and require confirmation** before writing (never silent mutation).
  For findings whose `suggestion` is not mechanically applicable, **Apply should be disabled
  or downgraded to "Open in editor with the suggestion pre-filled"** rather than pretending to
  auto-fix. Define **Edit** as "adjust the model myself in the detail panel," and **Dismiss**
  as "hide this finding and don't re-raise it" (resolve Q4 — see F9). Add an explicit
  "**Undo**" / revert affordance since every mutation is a git commit anyway.

### F3 — [Major] "Capability" is a term of art presented to a user who doesn't share the vocabulary
- **Location:** §1, §3.2, §7, throughout
- **Issue:** The entire UI is organized around "capabilities," "bounded contexts," "outcomes,"
  "actors," "domain objects," and typed edges ("produces/consumes/depends_on"). These are
  domain-driven-design and enterprise-architecture terms. A solar installer thinks in
  "getting leads, quoting jobs, ordering panels, installing, warranty calls" — not
  "Lead Management is a capability that produces a Lead domain object." The spec asserts
  "capabilities fall out of Core Activities + Outcomes almost mechanically" (§3.1) — true for
  the *system*, but the *label* the user sees still says "Capability Map." Without
  in-product definition, the user won't know if the map is right, which undermines A1's
  "domain expert judges substantially correct."
- **Recommendation:** Add a UX requirement: every domain term surfaced in the UI carries a
  one-line plain-language gloss (tooltip / inline helper), ideally phrased in the user's own
  words. Consider a friendlier surface label for the map (e.g. "What your business does" /
  "Your business capabilities") with "capability" as the secondary/technical term. At minimum,
  the spec should mandate a glossary and first-use tooltips, and the NarrativeCoach (§4.1)
  should speak in business language, never solution language (already implied — make it a
  requirement).

### F4 — [Major] No specified empty states or first-run onboarding for the core loop
- **Location:** §7.1 (create workspace), §9 (`empty` status), general
- **Issue:** The riskiest moments for a non-technical user are the blank canvas and the first
  transition into an unfamiliar concept. The spec lists an `empty` workspace status and
  "empty narrative from template" but never specifies what the user *sees* or *is guided to do*
  at: empty workspace, empty capability map (before generation), empty review inbox (verdict
  `clean`), or the first time the graph appears. Without designed empty states and a guided
  first run, the user faces a blank Monaco editor and a template of section headers with no
  idea how much to write or what "good" looks like.
- **Recommendation:** Add an "Onboarding & empty states" subsection specifying: (a) a guided
  first-run that walks Create → Author → Generate → Review with progressive disclosure; (b)
  each empty state has an explanatory message + a single clear primary action ("Describe your
  business to begin," "Generate your capability map," etc.); (c) the solar reference (§10 M5)
  doubles as a **worked example the user can view** so they see a good narrative and map before
  writing their own. This also de-risks A1 (the narrative quality gates map quality).

### F5 — [Minor] "Recompile" / `buildHash` staleness is a compiler mental model leaking to the user
- **Location:** §3.3 ("graph is stale, recompile"), §7.5
- **Issue:** `buildHash` drift detection is excellent engineering and the right trust
  mechanism. But "recompile" and "stale build" are developer concepts. A founder editing their
  business description should not be asked to "recompile." Worse, if recompile is a manual step,
  the user can sit looking at a graph that silently no longer matches their text — the exact
  drift the mechanism exists to prevent.
- **Recommendation:** Keep `buildHash` internally; reframe the *surface*. Prefer **automatic
  re-derivation** on text change (debounced), with a non-blocking banner in the user's language:
  "Your description changed — updating the map…" → "Map updated." If a manual trigger is
  retained, label it "Update map," never "Recompile." Specify the stale-state banner copy and
  whether re-derivation is automatic or manual in §7.

### F6 — [Minor] Finding severity vocabulary is undefined for the user and collides with doc-review severities
- **Location:** §4.3 (`severity: blocker|major|minor`), §5 (validators emit findings too)
- **Issue:** The review inbox will show findings tagged blocker/major/minor. For a business
  owner, "blocker" of *what*? Nothing is being blocked — the model isn't compiled into
  software in the MVP (N1). The label imports engineering connotations that don't map to the
  user's situation and may induce false alarm. It also visually collides with CONV-001's
  document-review severities, risking reviewer/author confusion.
- **Recommendation:** Use user-facing labels that describe **consequence**, e.g.
  "Needs attention / Worth reviewing / Optional polish," or "High / Medium / Low confidence-to-
  impact." Keep the internal enum if useful, but the spec should define the **display mapping**.
  Also specify inbox **grouping and ordering** (by severity, by type, coverage gaps first) so a
  first-time user isn't handed a flat list of 15 findings (see F7).

### F7 — [Minor] Risk of overwhelming the user; no limit/prioritization on findings presentation
- **Location:** §4.3, §5 (V1–V7 all feed "the same review panel")
- **Issue:** Deterministic validators (V1–V7) *and* the LLM reviewer both dump into one panel.
  On a first generation, a rough narrative could produce a dozen-plus findings at once —
  overlaps, gaps, orphans, cycles, naming. For a non-technical user this reads as "the AI
  thinks my business is broken," which is discouraging at exactly the wrong moment.
- **Recommendation:** Specify a **presentation strategy**: prioritize/group findings, lead with
  coverage (what's *covered* before what's *missing*), show a positive framing ("Here's your
  map. A few things to review:"), and consider progressive disclosure (top N, "show more").
  The `coverage` object (§4.3) is a good hook for an encouraging summary. Add this as an
  explicit UX requirement, not an implementation afterthought.

### F8 — [Minor] Provenance is one-directional (node → source); the reverse and the "why this capability" are unspecified
- **Location:** §3.3 (`sourceRefs`), §4.2 (`meta.derivedFrom`), §7.5
- **Issue:** Click node → source line is specified and great. Two gaps for trust/explainability:
  (1) there's no specified way to go **text → which capabilities this sentence produced**, which
  is how a user validates coverage from their own writing; (2) the CapabilityGenerator records
  `meta.derivedFrom`, but the spec never says this justification is **shown to the user** ("This
  capability came from: *'we qualify leads before quoting'*"). Surfacing the derivation is the
  core explainability payoff and it's currently only stored, not displayed.
- **Recommendation:** Require the node detail panel to show the **derivation rationale**
  (`meta.derivedFrom`) in plain language, and add reverse-highlight (selecting narrative text
  highlights the capabilities it produced). This makes the "AI proposed this, here's why"
  contract visible, which is the whole point of human-in-the-loop.

### F9 — [Minor] Dismissed-finding persistence (Q4) is a UX trust issue, not just a data question
- **Location:** §12 Q4, §4.3
- **Issue:** If re-review re-raises findings the user already dismissed, the tool feels like it
  isn't listening — the fastest way to lose a non-technical user's trust. Q4 frames this as
  storage; it's really about respecting the user's decisions across runs.
- **Recommendation:** Answer Q4 in favor of **stable, content-addressed finding identity**
  (hash of type + involved capability ids + normalized explanation) persisted per workspace, so
  a dismissed finding stays dismissed unless the underlying model changes materially. Surface a
  "Dismissed (N)" collapsed section so decisions are reversible and visible, never silently lost.

### F10 — [Minor] Text-vs-graph editing coherence: graph edits are specified, but which properties are graph-editable is not
- **Location:** §6 ("edits write back to text artifacts"), §7.5, R3
- **Issue:** The round-trip principle (canvas edit → transpile to text → recompile) is correct
  and R3 defends it well. But the user's mental model needs to know **what** they can change on
  the canvas vs. only in text. Can they drag to create a `depends_on` edge? Rename a node?
  Delete a capability? If some edits are graph-only and others text-only, the boundary must be
  explicit or the user won't form a stable model of "where do I change things."
- **Recommendation:** Specify the graph's editable surface for the MVP (recommend: rename,
  edit purpose/outcomes, add/remove `depends_on` edges via the detail panel; structural/business
  *facts* flow from the narrative). State clearly that **narrative content is edited as text**
  and **model relationships are edited on the map**, so the two surfaces have non-overlapping,
  learnable jobs.

### F11 — [Nit] `narrative.md` template gives no sense of expected length/quality
- **Location:** §3.1
- **Issue:** Section headers alone ("## Purpose (1 paragraph)") under-specify what a *good*
  answer looks like for someone who's never modeled their business. Too-thin narratives will
  produce weak maps and more findings (compounding F4/F7).
- **Recommendation:** Ship the template with **inline placeholder examples** (greyed, from a
  non-solar domain to avoid copying) and length hints, and let NarrativeCoach proactively offer
  the first clarifying questions rather than waiting to be asked.

### F12 — [Nit] No specified handling of the LLM "soft error" state in the UI
- **Location:** §4 ("one repair retry, then surface a soft error")
- **Issue:** The determinism policy surfaces a "soft error" on schema failure, but the UX of
  that moment is undefined. A non-technical user seeing a raw error or a spinner-that-never-ends
  will be stuck with no path forward.
- **Recommendation:** Specify the failure-state UX: plain-language message, a **Retry** action,
  and preservation of everything the user already wrote (never lose narrative on a generation
  failure). Same for slow generations: show progress and keep the app responsive.

---

## Answers to §12 open questions (UX lens)

- **Q2 — Should bounded-context grouping be derived in the MVP or fully deferred?**
  **Derive it, but keep it strictly read-only and secondary — do not surface it as a primary,
  authored concept in the MVP.** UX rationale: (1) On the solar reference, an ungrouped map of
  ~8–12 capabilities is already near the edge of what a non-technical user can scan; light
  visual grouping ("Sales & Leads," "Operations," "Service") makes the map *more* legible and is
  a low-cost comprehension win. (2) But "bounded context" is an even heavier term of art than
  "capability" (F3) — asking the user to *author* or *validate* boundaries in the MVP would
  overload them and blur the loop's focus. So: use the derived grouping **only** as an
  auto-computed visual clustering / colored regions on the map, labeled in plain language, with
  **no edit affordance and no findings raised about it** in the MVP. The spec's current stance
  (§2: "⚠️ read-only grouping hint, derived, not authored") is the right call — this review
  endorses it and asks only that the spec state the grouping is **presentational, unlabeled as
  "bounded context" in the UI, and generates no user-facing findings** in the MVP.

- **Q4 — How to represent & persist "dismissed" findings so re-review doesn't re-raise them?**
  See F9: use stable content-addressed finding identity persisted per workspace; keep dismissed
  findings visible-but-collapsed and reversible. This is a HITL-trust requirement, not just
  storage.

- **Q1 / Q3 / Q5** — Out of scope for the UX lens (defer to technical-architecture and
  ai-llm-feasibility reviewers), with one UX note on **Q5**: any eval rubric for A1/A2 should
  include a **task-success / comprehension** measure with a real non-technical user (can they
  reach a committed, reviewed map unaided?), not only capability-correctness scored by a domain
  expert.

---

## Disposition

Verdict: **Approve-with-changes.** The loop and its trust architecture are sound. Resolve the
Major findings (F1–F4) before build — especially replacing YAML-as-edit-surface with a
structured panel and fully specifying Apply/Edit/Dismiss with a mandatory diff-before-apply —
and fold the Minor findings into the §7 flows and a new "Onboarding & empty states" subsection.
