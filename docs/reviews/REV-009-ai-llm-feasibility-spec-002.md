---
id: REV-009
title: "AI/LLM-Feasibility Review of SPEC-002 (Domain Model Layer — aggregates, commands, events)"
type: review
status: Approved
version: 1.0.0
author: "Reviewer (ai-llm-feasibility)"
created: 2026-07-10
updated: 2026-07-10
supersedes: null
reviews: SPEC-002
lens: ai-llm-feasibility
verdict: Approve-with-changes
related: [SPEC-002]
---

# REV-009 — AI/LLM-Feasibility Review of SPEC-002

## Summary

Through the LLM-feasibility lens, SPEC-002 is buildable with today's models and rightly
inherits SPEC-001's winning shape: *LLM proposes, deterministic validators + the human
decide*, structured outputs, one repair retry, a MockProvider for the offline path. Deriving
aggregates/commands/events with structured outputs is well within current capability — the
`domain_model.yaml` shape (§3) is a moderately nested schema that structured outputs handle
comfortably, and the DM1–DM8 validators (§6) correctly own the objective, referential checks
the schema cannot enforce (a JSON Schema guarantees shape, not that `command.emits` resolves
to a real event).

But this layer is **materially harder than capability generation**, and the spec inherits
SPEC-001's contract language without adjusting for two facts that break the reuse:

1. **The anchor moves.** Capabilities derive from *narrative lines* (SPEC-001's `SourceRef`
   = section/anchor/contentHash). Aggregates derive from *capabilities* — specifically their
   `produces` names — not narrative headings. So DM8's "reuse SPEC-001's mechanism" (§3, §6)
   does not transfer: the provenance anchor type must change, and one sub-part of the output
   (attributes) is genuinely ungroundable. This is the sharpest finding (F1).

2. **The output gets more generative and less extractive.** Capability generation is mostly
   *extractive* (map Core Activities → capabilities). Domain modeling is partly *inventive*:
   attributes are not in the text, command/event **granularity** is unconstrained and
   subjective, and **ownership** is a judgment call. That raises hallucination, run-to-run
   variance (id churn), and over-generation (R2) above what capability generation faced — and
   the spec's stated mitigations for those don't yet bite (F2, F3, F4).

None of these require capability beyond current models; all are addressable with the changes
below. The DM1–DM8 validators are the strong part of the spec and their A2 target is
realistic (indeed conservative). Verdict: **Approve-with-changes**.

---

## Where domain generation is harder than capability generation (lens framing)

| Dimension | CapabilityGenerator (SPEC-001) | DomainGenerator (SPEC-002) | Feasibility delta |
|---|---|---|---|
| Task nature | Extractive (narrative → capabilities) | Mixed: extractive (aggregates from `produces`) + **inventive** (attributes, commands, events) | ↑ hallucination on the inventive parts |
| Grounding | Every capability anchors to a narrative heading | Aggregates anchor to a **capability/`produces`**; attributes anchor to **nothing** | Provenance model must change (F1) |
| Granularity | Capability count is fairly stable | Command/event count is **unconstrained + subjective** | ↑ over-generation (R2/F3), ↓ determinism (F4) |
| Identity stability | Capability slugs stable run-over-run | `qualify_lead` vs `mark_lead_qualified` — id churn | Breaks DM7 slugs + provenance/dismissal identity (F4) |
| Input trust | Consumes human-authored narrative | Consumes **LLM-seeded capabilities** | Second-order derivation → error propagation (F8) |
| Ownership | n/a | Which capability owns a shared aggregate is a judgment call | R3; DM2 checks *existence* not *correctness* (F2) |

The net: aggregates are almost as reliable as capabilities (they are seeded from `produces`);
commands, events, and attributes are where the new risk concentrates. This asymmetry drives
the answer to Q1 (aggregates-first is the safer slice) and Q3 (don't type attributes yet).

---

## Findings

### F1 — Provenance anchor model does not transfer from SPEC-001; DM8 as written is unimplementable and attributes are ungroundable [Major]
- **Location:** §3 (`meta: { origin, derivedFrom }`), §5 (DomainGenerator "grounded
  provenance, reusing SPEC-001's mechanism"), §6 DM8, §8 A5.
- **Issue:** SPEC-001's provenance is a `SourceRef` = `{ file, section, anchor, contentHash }`
  that points into `narrative.md`, and V8 validates that those anchors resolve to existing
  narrative sections. SPEC-002 says DomainGenerator elements cite "the capability/activity
  they derive from" and that DM8 "reuses SPEC-001's mechanism" — but an aggregate `lead`
  derives from the capability `lead_management` (its `produces: [Lead]`), **not** from a
  narrative heading. Feeding that a `SourceRef` is a category error: there is no narrative
  section to anchor to, and V8's resolver would reject it. Worse, the *attributes* of an
  aggregate (`[name, contact, source, status]`) are pure domain-prior inference — they exist
  in neither the narrative nor the capability — so no anchor of any kind is honest for them.
  As written, DM8 either fails every domain element (if it demands narrative anchors) or is
  vacuously satisfiable (if it accepts free text), and A5 ("every element carries grounded
  `derivedFrom`") cannot go green.
- **Recommended change:**
  1. Define a **domain-layer anchor type** as a discriminated union, resolved against the
     **IR**, not only the narrative:
     ```ts
     type DomainAnchor =
       | { kind: "capability"; capabilityId: string;
           via: "produces" | "consumes" | "outcome" | "purpose"; name?: string }  // e.g. via:"produces", name:"Lead"
       | SourceRef;  // fall through to a narrative heading when an element traces to a narrative line
     ```
     An aggregate seeded from `produces: [Lead]` anchors as
     `{ kind:"capability", capabilityId:"lead_management", via:"produces", name:"Lead" }`.
     A command/event anchors to the owning capability (`via:"purpose"` or `via:"outcome"`),
     optionally to a narrative activity line via the `SourceRef` arm.
  2. **DM8 resolves anchors against IR nodes:** `kind:"capability"` anchors must reference an
     existing capability id (and, when `via:"produces"/"consumes"`, an existing
     produces/consumes name on that capability); `SourceRef` anchors resolve as in V8. This is
     the honest, checkable version of "grounded."
  3. **Attributes are inferred, not grounded — say so.** Mark attribute-level content
     `origin: llm` with **no** anchor, and scope DM8/A5 to element *existence*
     (aggregate/command/event), not attribute lists. Do not pretend attributes are grounded;
     that overstates the guarantee exactly where the model is guessing. (This also answers
     part of Q5: `produces` names *are* the natural aggregate anchor — see Q5 answer.)

### F2 — A1 "≥80% aggregates right" has no measurement instrument or matching function [Major]
- **Location:** §8 A1, §8 A2 (generator side), §11 Q1.
- **Issue:** This is REV-003 F2 recurring one layer deeper, and it is worse here. A1 asks for
  "≥80% aggregates right, no critical omission," but the spec defines no scorer, no reference
  model, and — critically — **no matching function**. To compute "% aggregates right" you must
  first align a generated aggregate to a reference aggregate, but the model may name it
  `prospect` where the reference says `lead`, may merge `Lead`+`Customer`, or may split one
  into two. Command/event **granularity** makes exact-set matching meaningless (`qualify_lead`
  vs `set_lead_status`+`assign_rep` are both defensible). Without a defined alignment + scoring
  rule, A1 is an aspiration, not an acceptance criterion, and DM5's go/no-go has nothing to
  compute. Note A1 also conflates two different bars ("80% aggregates right" is precision/recall
  over a *set*; "no critical omission" is a recall floor on a *specific* subset).
- **Recommended change:** adopt the two-corpus methodology in the Appendix. In short: produce
  **one human-blessed reference solar domain model** (aggregates + commands + events; the A1
  reviewer signs it once), then score generated output against it with an **explicit matching
  function** — align aggregates on `(owner capability, normalized-name similarity ≥ τ)`; report
  **per-capability aggregate recall/precision**; score commands/events at **coarse
  granularity** ("does each aggregate carry ≥1 sensible command and ≥1 event of the right
  shape") rather than exact-set Jaccard, because granularity is inherently subjective. Pin the
  exact definitions in §8 (recommend aggregate recall ≥0.80, precision ≥0.70; "no critical
  omission" = recall = 1.0 over a small hand-marked *core* aggregate set).

### F3 — R2 (over-generation) has no catching mechanism; "validators" in the mitigation do no work [Major]
- **Location:** §10 R2, §6 (DM1–DM8), §7 (review lens), §8.
- **Issue:** R2's mitigation is "structured outputs + validators + human edit." But **no
  validator catches over-generation** — DM1–DM8 verify *structure and referential integrity*,
  not *excess*. A model that emits eight redundant commands per aggregate produces a fully
  DM1–DM8-green model. So the "validators" clause is inert against the very risk it is cited
  for, and over-generation is the single most likely quality failure of a deeper generation.
  The review lens (§7) flags "aggregates with no commands" and "commands with no events" — the
  *under*-generation direction — but not the over-generation direction.
- **Recommended change:** three concrete controls, none requiring new model capability:
  1. **Bound the fan-out structurally:** generate **per capability**, one call producing that
     capability's aggregate cluster (aggregates + their commands + events) together, with the
     prompt scoped to "one aggregate cluster for *this* capability." This is the strongest
     lever and it also keeps `emits` cross-refs internally consistent (see F8).
  2. **Measure precision, don't just assert it:** add an over-generation metric to the eval
     (commands-per-aggregate / events-per-aggregate distribution vs the reference model, plus a
     judge-rated "spurious element rate"). Without this, R2 is unmeasured.
  3. **Let the review lens flag it:** add "aggregate with an implausibly high command/event
     count" and "duplicate-intent commands" to the §7 domain-review lens (this is a
     judgment-class check the LLM reviewer is suited to, mirroring SPEC-001 §4.3).

### F4 — Determinism/identity: command/event id churn breaks DM7 slugs, provenance, and dismissals [Major]
- **Location:** §6 DM7 (stable slugs), §3/§5 (ids), §8 A3, §10 (no determinism risk listed).
- **Issue:** SPEC-002 has no analog of SPEC-001 R2 (LLM non-determinism), yet it is *more*
  exposed to it. Capability names are fairly stable run-over-run; command/event names are not
  — `qualify_lead` one run, `mark_lead_qualified` the next, because granularity and phrasing
  are unconstrained. That id churn (a) makes DM7's "stable slugs" fail across regenerations,
  (b) orphans the provenance and any finding-dismissal identity keyed on those ids (the
  SPEC-001 §4.4 dismissal store depends on stable subjects), and (c) will make the inter-run
  Jaccard stability signal (SPEC-001 §8) structurally lower for this layer than for
  capabilities — a fixed capability-layer threshold would wrongly fail it.
- **Recommended change:**
  1. Reuse SPEC-001's determinism policy explicitly: pinned model snapshot + seed, low temp,
     schema validation, one repair retry (currently only implied via "key off the client").
  2. **Derive ids deterministically from names** via a canonical slug function
     (`Qualify Lead` → `qualify_lead`) so that stable *names* yield stable *ids*, and treat the
     name→id map as the identity spine DM7 checks.
  3. Set a **layer-specific, lower Jaccard threshold** for the domain model (measure it first;
     do not inherit the capability threshold), and generate per-capability (F3) to cut global
     variance.
  4. For dismissals/provenance, key on a **content fingerprint** (aggregate id + command
     intent-class), not raw prose, exactly as REV-003 F3 established for SPEC-001.

### F5 — MockProvider cannot make DM8 green offline as specified, and only exercises the happy path [Major]
- **Location:** §5 (MockProvider: "produces → aggregate, capability → a default
  command/event"), §6 DM8, §8 A5, §9 DM1.
- **Issue:** ADR-004's MockProvider proves *plumbing, not judgment* — correct and fine. But two
  gaps block the offline claim: (1) **DM8 provenance.** For the offline pipeline to be
  DM1–DM8-green (the spec's promise that "the layer is exercisable without a key"), the mock
  must emit `meta.derivedFrom` in the **new** anchor shape from F1 (anchoring to the capability
  / `produces` name). The spec doesn't say it does; if it emits nothing, DM8/A5 are red offline
  — the mock is the forcing function that proves the new anchor type actually resolves. (2)
  **Coverage confusion.** The mock, by construction, emits a *consistent, single-owner,
  fully-covered* model — so it exercises only the **green path** of DM2/DM3/DM4/DM5/DM6. It
  cannot exercise the validators' *failure detection*, which is what A2 (≥90% seeded-defect
  catch) actually measures. That's correct design, but the spec should state it: **DM1–DM8
  failure paths are exercised by seeded-defect fixtures, not by the MockProvider.**
- **Recommended change:** (a) specify that MockProvider emits valid domain-layer provenance
  anchors (F1 shape) so DM8/A5 pass offline; (b) require the mock to emit each capability's
  aggregate + commands + events **in one unit** so `emits`/aggregate cross-refs are internally
  consistent (green DM3/DM4/DM6); (c) note in §6/§8 that A2 is validated against seeded-defect
  fixtures independent of the mock, and that the mock provides only the DM1–DM8-green baseline.

### F6 — Attributes are the least-grounded output; typing them now (Q3) amplifies hallucination [Minor]
- **Location:** §3 (attributes), §11 Q3.
- **Issue:** Attributes are inferred from domain priors with zero textual anchor (F1).
  Requiring types (`string/number/date`) now (Q3) stacks a *second* layer of low-confidence
  guessing (is `source` an enum? is `status` a date?) on top of the already-ungrounded
  attribute names, for no downstream consumer in this spec (N2: no codegen).
- **Recommended change:** **free-form attribute names first; defer typing** (answers Q3).
  Mark attributes `origin: llm`, no anchor, and treat them as review-lens fodder ("does Lead
  need a `status`?") rather than as a validated part of the model. Revisit typing when codegen
  (a real consumer) lands.

### F7 — DM5 as a hard error incentivizes hallucinated aggregates (Q4) [Minor]
- **Location:** §6 DM5, §8 A2, §10 R1, §11 Q4.
- **Issue:** DM5 ("every capability owns ≥1 aggregate") as an **error** creates a perverse
  incentive: pure-orchestration capabilities legitimately own nothing (Q4 flags this), so a
  hard DM5 either (a) throws false errors on valid models, or (b) — if the generator is aware
  of the rule — pressures the model to **invent** a spurious aggregate to satisfy the
  validator, directly worsening R1/R2. A deterministic validator that pushes the stochastic
  component toward hallucination is a feasibility anti-pattern.
- **Recommended change:** make **DM5 a warning, not an error** (answers Q4), surfaced as an
  "under-modeled?" review-lens finding the human confirms. Keep it out of the A2 error-recall
  set; measure it as a soft signal.

### F8 — Second-order derivation: run on *reviewed* capabilities and don't split generation finer than per-capability [Minor]
- **Location:** §5 (In: capabilities + narrative), §9 (milestone ordering), SPEC-001 §9 status.
- **Issue:** DomainGenerator consumes **LLM-seeded capabilities**, so any capability error
  propagates and compounds into the domain layer. Separately, if generation is split below
  per-capability granularity to control cost, `command.emits → event` cross-references made in
  one call may reference elements created in another, producing dangling refs (DM4/DM6 red) for
  reasons unrelated to model quality.
- **Recommended change:** (a) gate DomainGenerator on the **reviewed** capability state
  (SPEC-001 §9 `reviewed`), not raw generated output, to limit compounding — state this in §5
  or §9; (b) never split a capability's cluster across calls — per-capability is the finest
  safe unit (ties to F3.1).

### F9 — Deeper/per-capability generation cost & latency is unbudgeted [Minor]
- **Location:** §5, §8, §10.
- **Issue:** If generation fans out per capability (F3.1) plus a repair retry plus an optional
  self-consistency reviewer (F10), a solar model (~6–8 capabilities) is ~6–8× the calls of a
  single CapabilityGenerator pass. Entirely acceptable for a single-user MVP, but — as with
  REV-003 F8 — the spec should name it rather than discover it.
- **Recommended change:** one line in §8/§10: per-capability generation trades ~N× cost for
  over-generation control and referential consistency; self-consistency (if adopted) applies to
  the eval/review path, not the interactive edit loop; k configurable.

### F10 — Domain-model review lens should use self-consistency for its judgment-only checks [Nit]
- **Location:** §7 (domain-model review lens).
- **Issue:** The §7 lens does exactly the judgment-class work (thin aggregates, boundary
  questions, "Lead vs Customer" attribute placement) that SPEC-001 §4.3 runs with k
  self-consistency samples to lift recall and suppress one-off false positives. SPEC-002
  doesn't say the domain review reuses that.
- **Recommended change:** state that the domain-model review reuses SPEC-001 §4.3's k-sample
  self-consistency (default k=3–5, keep findings recurring ≥⌈k/2⌉) and evidence-anchored
  findings, for the same reasons.

---

## Answers to relevant §11 open questions

### Q1 — aggregates+commands+events now, or aggregates-only first?
**From a reliability standpoint, aggregates-first is the safer slice.** Aggregates are the
most groundable element (seeded directly from `produces`, F1), so they carry the lowest
hallucination and the cleanest provenance. Commands and events are precisely where
over-generation (F3), granularity-driven id churn (F4), and the A1 matching problem (F2)
concentrate. Shipping aggregates first lets you validate the new provenance-anchor type
(F1) and the DM1/DM2/DM7 validators on the simplest element before taking on the stochastic
parts. Caveat: aggregates-only does **not** escape the attribute-grounding problem (F6) — that
rides along with aggregates. Recommendation: **aggregates first (or a thin slice of aggregates
+ exactly one canonical command + one event per aggregate) as the DM1 milestone**, with full
command/event generation gated behind the F2 eval instrument and F3 over-generation controls.
(Product value of events/commands for later codegen is a real counter-argument, but it is
outside this lens.)

### Q3 — typed attributes now, or free-form names first?
**Free-form names first (see F6).** Typing is a second layer of ungrounded inference with no
consumer in this spec. Defer to codegen.

### Q4 — DM5 "every capability owns ≥1 aggregate": error or warning?
**Warning (see F7).** Pure-orchestration capabilities legitimately own nothing; a hard error
either misfires or pressures the model to hallucinate an aggregate.

### Q5 — reuse `produces`/`consumes` as the aggregate seed — migrate or keep both?
**Reuse them as the seed *and* as the provenance anchor — link, don't fork.** `produces` names
are the honest anchor for aggregate existence (F1). Concretely: keep `produces`/`consumes` as
authored on the capability, and have each aggregate's `derivedFrom` carry
`{ kind:"capability", capabilityId, via:"produces", name:"<the produces name>" }`. That makes
the capability→aggregate lineage checkable (DM8) and gives the UI a free "this aggregate came
from Lead-the-produces-name" trace. Avoid a full migration that deletes `produces` from
capabilities — it is the anchor, and capabilities must stay usable standalone (SPEC-001).

*(Q2 — domain view as tab vs. capability-expansion — is a UX question, deferred to the ux-hitl
lens.)*

---

## Appendix — Proposed seeded-defect corpus & eval shape for the domain layer

Two corpora, mirroring SPEC-001's split (validators own structure; a reference model + judge
own quality). Needs **one human-blessed reference solar domain model**, not a large gold set.

### Corpus A — structural seeded defects (the A2 instrument; deterministic, target ≥90%, expect ~100%)
Start from the reference `domain_model.yaml`; programmatically inject one defect per variant,
each with an expected validator finding. These are exactly the classes DM1–DM8 own, so recall
should approach 100% — A2's ≥90% is a conservative floor:

| Injector | Mutation | Expected catch |
|---|---|---|
| missing owner | drop `aggregate.owner` | DM1, DM2 |
| dangling owner | `owner` = nonexistent capability id | DM2, DM6 |
| dangling command target | `command.aggregate` = nonexistent aggregate | DM3, DM6 |
| dangling emits | `command.emits` = nonexistent event id | DM4 |
| orphaned event | `event.aggregate` = nonexistent aggregate | DM4, DM6 |
| uncovered capability | remove all aggregates of one capability | DM5 (as *warning* per F7) |
| duplicate id | clone an aggregate/command/event id | DM7 |
| unstable slug | id not a canonical slug of name | DM7 |
| stripped provenance | remove `meta.derivedFrom` from an LLM element | DM8 |
| broken anchor | `derivedFrom.capabilityId` unresolvable / `via:"produces"` name absent | DM8 |

Report per-injector recall; any class < 1.0 is a validator bug, not model variance.

### Corpus B — generator quality (the A1 instrument; needs the reference model)
Runs the real DomainGenerator (k low-temp samples) over the solar capabilities and scores
against the reference with the **explicit matching function** from F2:

- **Aggregate recall/precision** — align on `(owner capability, normalized-name sim ≥ τ)`;
  target recall ≥0.80, precision ≥0.70; "no critical omission" = recall 1.0 on a hand-marked
  core-aggregate subset.
- **Command/event coarse-shape score** — per aggregate: does it carry ≥1 plausible command and
  ≥1 event of sane shape? (Do **not** exact-match the command set — granularity is subjective.)
- **Over-generation precision (F3)** — commands-per-aggregate / events-per-aggregate vs the
  reference distribution, plus a judge-rated spurious-element rate. This is the only signal that
  makes R2 measurable.
- **Ownership correctness (R3)** — for shared-candidate aggregates, does the assigned owner
  match the reference's adjudicated owner? (DM2 checks *existence* of a single owner, not that
  it's the *right* one — this metric covers the gap.)
- **Inter-run stability (F4)** — mean pairwise Jaccard of aggregate id sets across k runs;
  set a **domain-layer-specific** threshold (measure first; it will be lower than the capability
  layer). Command/event id churn is expected — score their stability separately and loosely.

### CI gate
Bundle A + B behind every `promptHash`/`modelId` change, as REV-003 F6 established for
SPEC-001. Corpus A blocks on structural recall; Corpus B blocks on aggregate recall/precision,
over-generation precision, and Jaccard. The reference model is the only human artifact required,
and A1's domain reviewer produces it as a byproduct of the A1 sign-off.
