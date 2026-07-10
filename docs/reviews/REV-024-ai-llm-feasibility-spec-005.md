---
id: REV-024
title: "AI/LLM-Feasibility Review of SPEC-005 (Policies & Reactions — cross-entity workflow rules)"
type: review
status: Approved
version: 1.0.0
author: "Claude (Opus 4.8) — ai-llm-feasibility lens"
created: 2026-07-10
updated: 2026-07-10
supersedes: null
reviews: SPEC-005
lens: ai-llm-feasibility
verdict: Approve-with-changes
related: [SPEC-005]
reviewers: [ai-llm-feasibility]
---

# REV-024 — AI/LLM-Feasibility Review of SPEC-005

## Verdict: **Approve-with-changes**

Through the LLM-feasibility lens, SPEC-005 is buildable with today's models and keeps the house shape
— *LLM proposes, deterministic validators + the human decide*, structured outputs, a deterministic
offline mock, grounded provenance, text-as-truth. Deriving cross-entity reactions is a genuinely
*harder* generation task than any predecessor layer for two structural reasons, and the spec has
**visibly learned** from REV-019: it already names the two traps that bit SPEC-004 hardest — it pins
the repair trigger to a **code allowlist** (PL2/PL3), not blocker-only (§5 — the exact CE-F2 fix), and
it ships a **reactionRecall quality metric + an over-wiring guardrail** (A5 — the CE-F1 fix). Those two
absorptions are the difference between this spec and the un-hardened SPEC-004 draft, and they are
right.

But the spec is *harder* than SPEC-004 in the two places SPEC-004 was already hardest, and its answers
there are thinner than the fixes it correctly imported elsewhere:

1. **The id space `on`/`then` resolve against is now GLOBAL, not per-aggregate.** SPEC-004's
   `coerceAggregateBehaviour` resolves `emits` against **one aggregate's** events (`eventBySlug`,
   `events.ts:144`) — a small, locally-unique set. SPEC-005's single call must snap `on` against
   **every event across every entity** and `then` against **every command across every entity**. Event
   names collide globally (an `Approved` on Invoice and an `Approved` on Permit), so a name-based snap
   can bind to the **wrong entity's** target — and because both `on` and `then` still resolve to a
   *real* id, **PL2/PL3 pass and no validator catches the mis-wiring**. This is CE-F3 with a new,
   silent failure mode (PF-F2).

2. **Single-call is the right shape, but it removes the only structural over-production brake and the
   spec's remaining backstop (A5) is under-specified.** SPEC-004 controlled the event-storm (R1)
   *structurally* by fanning out per aggregate (REV-019 CE-F5). Policies are global — there is no
   per-entity locality to fan out on, and per-event fan-out would *bias toward* a policy-per-event — so
   single-call is correct (§5 rightly says so). But unlike the SPEC-003 partition (whose single call is
   bounded by a **conservation law** — every capability exactly once), the policy set has **no
   conservation invariant**: zero to N² referentially-valid policies all pass. So R1 has **no**
   structural brake, PL6/PL7 are non-gating minors, and A5's guardrail is now the **sole** backstop —
   yet it is specified as one clause ("a guardrail against a policy per event"). The degenerate
   over-wired case is exactly what the §5 **mock** produces (a policy per hand-off-named event), and
   reactionRecall + coverage are **both green on it** (PF-F1).

None of these need capability beyond current models; all are addressable by mirroring the *now-correct*
`events.ts` / `eval/events.ts` patterns and by specifying the guardrail as a hard gate. Verdict:
**Approve-with-changes**.

---

## Why cross-entity reactions are *harder* than the behaviour layer (lens framing)

| Dimension | EventModeler (SPEC-004) | PolicyModeler (SPEC-005) | Feasibility delta |
|---|---|---|---|
| Decision locality | **Local** — commands/events scoped to one aggregate | **Global** — a policy wires entity A's event to entity B's command | ↑ variance; per-entity fan-out is *not* available |
| Generation shape | per-aggregate fan-out = structural R1 brake (CE-F5) | single call (correct — global) but **no** fan-out brake | R1 loses its structural control; A5 is the only backstop |
| Output-count bound | soft (a few per aggregate) | **none** — no conservation law like the partition's "each capability once" | over-wiring is unbounded; guardrail must be a hard gate |
| Id resolution surface | `emits` vs **one aggregate's** events (locally unique) | `on`/`then` vs **all** events/**all** commands (globally colliding) | ↑ collision → **silent mis-wiring** past PL2/PL3 |
| Provenance anchor | falls back to `agg.id` (a *different* thing — honest) | naïve fallback = `on`/`then` = the policy's **own fields** (circular) | ↑ tautology risk; needs a deliberate non-circular anchor |
| Degenerate baseline | CRUD triple (under-modeling) | **policy-per-event** (over-wiring) = the mock itself | recall+coverage green on the degenerate; needs precision |

The net: PolicyModeler's *inputs* are fully extractive (the events and commands already exist as stable
ids), so single-shot **wiring** quality should be decent — but the **global cross-reference
reconciliation** and the **absence of any structural output bound** are worse than SPEC-004, precisely
where SPEC-004 was already the sharpest.

---

## Findings

### PF-F1 — Single-call removes the structural R1 brake; A5's over-wiring guardrail is now the sole backstop but is under-specified, and recall+coverage are both green on the over-wired degenerate (the mock) [Major]
- **Location:** §5 ("single call … over-production is checked by a guardrail + the review lens, not by
  fan-out"; mock = "a policy per event whose name suggests a handoff"), §8 A4/A5, §6 PL6/PL7 (minor),
  §10 R1.
- **Issue:** This is REV-019 CE-F1 recurring, and here it is **structurally sharper** than in SPEC-004.
  SPEC-004 had a *structural* over-production lever (per-aggregate fan-out, CE-F5); SPEC-005 correctly
  gives it up (policies are global — §5 is right that fan-out doesn't apply). But the SPEC-003 partition
  it now resembles has a **conservation law** bounding its single call ("every capability exactly
  once"); the **policy set has none** — zero to N² referentially-valid policies all pass PL1–PL5. So:
  - **R1 has no structural brake.** PL6 (self-loop) / PL7 (cycle) are **minor, non-gating** smells; the
    "prefer cross-entity" prompt line is a soft nudge; the review lens is a human backstop. A5's
    guardrail is the **only** thing standing between the model and spaghetti.
  - **The degenerate case is the mock.** §5's mock emits *a policy per hand-off-named event* — that is
    the over-wired case at small scale. A4 (`provenanceRate = 1`, ≥1 cross-entity reaction) is green on
    it, and **reactionRecall is *also* green** on it: an over-wirer that fires a policy for every event
    trivially contains every reference hand-off, so recall = 1. Recall + coverage **cannot** distinguish
    "found the load-bearing hand-offs" from "wired everything" — exactly the CE-F1 point, but now the
    over-wired direction is the *primary* risk (R1) rather than a secondary one.
- **Recommendation:** specify A5 as **two** instruments, mirroring `eval/events.ts`
  (`scoreBehaviourCoverage` + `commandRecall`), and make the guardrail a **hard gate**, not a clause:
  1. **`reactionRecall`** vs a one-time human-blessed reference **hand-off set** for solar (the A1
     reviewer signs it once) — matched on the **(on, then) edge**, not policy name (see PF-F6).
  2. **A precision / spurious-policy rate** = reference hand-offs / total generated policies — the
     over-wiring signal recall is blind to — **plus** a deterministic storm gate: `policies / events`
     ratio and the count of events carrying ≥1 outgoing policy, flagged past a band (mirror
     `maxCommandsPerEntity`). Gate A4/A5 on it so the **policy-per-event** degenerate (and the mock)
     cannot pass green. State that this guardrail — not fan-out — is the sole R1 control, and that the
     tradeoff of the (correct) single call is that this metric becomes load-bearing.

### PF-F2 — `on`/`then` now resolve against the GLOBAL event/command id space; name-collision produces **silent mis-wiring** that PL2/PL3 pass [Major]
- **Location:** §5 ("snap `on`/`then` to real event/command ids (by slug/name)"), §6 PL2/PL3, by
  analogy to `coerceAggregateBehaviour` (`events.ts:110–162`, esp. the per-aggregate `eventBySlug` at
  :144).
- **Issue:** SPEC-004's coerce resolves `emits` against **one aggregate's** events — names are unique
  *within* an aggregate, so slug-by-name is safe there. SPEC-005 is single-call over the whole
  behaviour: `on` must snap against **all events across all entities**, `then` against **all commands
  across all entities**. Event/command **names collide globally** (`Approved`, `Completed`, `Cancelled`
  recur across entities). "Snap by slug/**name**" over the global set can therefore bind `on`/`then` to
  the **wrong entity's** target — and the failure is **invisible**: both still resolve to a *real* id,
  so PL2 and PL3 (referential integrity) **pass**, PL5 passes, and a wrongly-wired reaction ships as the
  final result. This is worse than a dangling reference (which at least a validator catches). It is the
  CE-F3 reconciliation surface, widened from one local set to two global sets, with a new silent mode.
- **Recommendation:**
  1. **Snap against the real ID sets with id-first precedence**, not names: exact-id → `slug(id)` →
     (only as a last resort) name. The `events.ts` skill already mints **entity-prefixed** ids
     (`mkId` → `lead_qualified`, `invoice_paid`; :119–122), which are globally near-unique — so an
     id-first snap avoids the collision that a name-first snap invites.
  2. **Enumerate the exact ids in the prompt.** Mirror `renderContextUserPrompt`/`renderEventUserPrompt`
     ("use these exact ids"): the user prompt must list events and commands **grouped by entity**
     (`id — name`, with the entity/area), so the model picks real ids and the cross-entity structure is
     visible. Without this the model paraphrases and canonicalization does all the work.
  3. **Pass the id sets into the skill** (`generatePolicies(domain, caps, provider)` deriving
     `eventIds`/`commandIds`), exactly as `generateEvents` derives `capIds` (`events.ts:174`).
  4. Consider a **PL2/PL3-adjacent smell** for an `on`/`then` whose name did not match its snapped id's
     name (a possible mis-snap) — cheap insurance against the silent mode.

### PF-F3 — POLICY_SCHEMA is not given; state `additionalProperties: false` on every nested object (incl. `derivedFrom`), `on`/`then` as strings, and that the schema cannot encode existence [Major]
- **Location:** §5 (structured outputs; no schema given), §3 (policy shape), §6.
- **Issue:** §5 promises structured outputs but gives **no** `POLICY_SCHEMA`, and the spec never restates
  the invariant that bit SPEC-003 and is now baked into `events.ts`/`contexts.ts`: **every nested object
  in an `output_config.format` schema needs `additionalProperties: false`** or the API 400s. The policy
  schema has the same nested-`derivedFrom` spot that `CONTEXT_SCHEMA`/`EVENT_SCHEMA` had to fix
  (`{ anchor: string }`, `additionalProperties: false` — `events.ts:80,94`).
- **Recommendation:** state the concrete shape in §5 (or a schema appendix), mirroring `EVENT_SCHEMA`:
  - top-level object `additionalProperties: false`, `required: ["policies"]` (version optional);
  - each `policies[]` item: `additionalProperties: false`, `required: ["on", "then"]` (`name`/`id`
    optional — mint the slug id deterministically from `name`/`on`+`then` in coerce, as `events.ts`
    mints ids from names; do **not** trust a model-supplied id); `on`/`then` as **strings** (event id /
    command id — keep them strings, no nested-object surface); `condition` as an optional string;
    `derivedFrom` as `{ type:"array", items:{ type:"object", additionalProperties:false,
    properties:{ anchor:{type:"string"} } } }`.
  - State explicitly that the schema **cannot** enforce "`on`/`then` must exist" — that is PL2/PL3's
    job — and do **not** try to bound the policy count with `maxItems` (a genuinely reaction-rich
    domain would be forced into a worse model; count control is the PF-F1 guardrail, never the schema).

### PF-F4 — PL5 provenance: no non-circular anchor fallback is specified, and both obvious fallbacks (`on`, `then`) are the policy's **own fields** — tautological grounding [Major]
- **Location:** §3 (`derivedFrom: [{ anchor: "delivery-after-payment" }]`), §5 ("ground provenance"),
  §6 PL5, §8 A4 (`provenanceRate = 1`), by analogy to `withAnchor` (`events.ts:128–131`).
- **Issue:** REV-019 CE-F6 (and REV-013 C3) recurring, and **sharper** here. In `events.ts`, `withAnchor`
  falls back to `agg.id` — the *entity whose lifecycle this is*, a **different** thing than the
  command/event being grounded, so the fallback is honest and non-circular (the code comment says so).
  A policy's natural fallbacks are its `on` event or its `then` command — but those are the policy's
  **own required fields** (§3). Grounding `derivedFrom = [{ anchor: <on event id> }]` is therefore a
  **copy of a field the policy already carries** — PL5 "can never be wrong," and A4's `provenanceRate =
  1` is plumbing, not a quality signal. §5 says only "ground provenance" and specifies **no** fallback,
  so the naïve implementation is the circular one.
- **Recommendation:**
  1. Specify a **non-circular `withAnchor` analog** for policies: the fallback anchor is the **crossed
     boundary / narrative theme** that motivates the hand-off — e.g. the source-area→target-area pair
     (`<on-event's area>→<then-command's area>`) or the target capability's outcome — **never** the
     `on`/`then` ids themselves. A policy's whole reason for existing is crossing a boundary, so
     grounding it in *that boundary* is honest evidence; the model's own narrative-theme anchor
     (preferred) supersedes the fallback.
  2. **Do not sell A4's `provenanceRate = 1` as quality** — label it plumbing, exactly the caveat
     REV-019 attached to `contextProvenanceRate`/`provenanceRate`. Optionally make PL5 a **consistency**
     check (the cited anchor must not equal either the `on` or `then` id) so a circular anchor is a
     finding, not a silent pass.

### PF-F5 — Repair trigger is correctly specified (allowlist, PL2/PL3 named) — AFFIRM — but make the repair prompt targeted, and note repair does not fix over-production [Minor]
- **Location:** §5 ("repair once on any blocker or dangling `on`/`then` (PL2/PL3 — a code allowlist,
  not blocker-only)"), §6 (PL2/PL3 = **major**), `generateEvents` (`events.ts:175–196`),
  `generateContexts` (`contexts.ts:184`).
- **Issue / affirmation:** This is the **CE-F2 trap avoided.** §6 rates PL2/PL3 **major**, so a
  blocker-only predicate (as `domain.ts` had, and `contexts.ts` originally had) would **miss** the exact
  dangling-reference failures repair exists for. §5 correctly pins a **code allowlist** and names
  PL2/PL3 — the predicate should read `f.severity === "blocker" || f.code.startsWith("PL2.") ||
  f.code.startsWith("PL3.")`, mirroring `generateEvents`'s `isRepairable` (`events.ts:175`). Two
  refinements: (a) §5 does not say the repair prompt is **targeted** — mirror `events.ts:193` and inject
  the dangling `on`/`then` subjects ("These policies reference an event/command that does not exist:
  [x]. Return corrected JSON only."); a model cannot fix what it cannot see. (b) State that the single
  repair fixes **dangling references, not over-production** — an over-wired-but-referentially-valid
  policy set is *not* repairable and is the PF-F1 guardrail's job, not repair's.
- **Recommendation:** keep the allowlist as specified; add "targeted repair prompt (inject offending
  `on`/`then` ids)" to §5; note the repair/guardrail division of labour.

### PF-F6 — `reactionRecall` match function is unspecified; it must match on the (on, then) **edge**, not policy name [Minor]
- **Location:** §8 A5 ("reactionRecall … vs a human-blessed reference set of hand-offs"), by analogy to
  `commandRecall` (`eval/events.ts:101–117`).
- **Issue:** `commandRecall` matches `slug(name)` within an aggregate because a command's identity *is*
  its name-within-entity. A policy's identity is the **hand-off edge** (`on` event → `then` command),
  not its (often auto-minted, often absent) name. Matching reactionRecall by policy name would be
  meaningless; matching by `on` alone or `then` alone would over-count. The reference is correctly
  described as "a set of hand-offs" (edges) — the metric just needs to say so.
- **Recommendation:** specify `reactionRecall` = fraction of reference hand-offs present, matched on the
  **normalized `(slug(on), slug(then))` pair** (id-canonicalized), mirroring `commandRecall`'s structure
  but over edges. Do not exact-match the full policy set (granularity/condition wording is subjective).

### PF-F7 — The mock is the over-wired degenerate baseline; state that PL failure paths come from seeded fixtures and that mock-green ≠ quality [Minor]
- **Location:** §5 (`mockGeneratePolicies` = "a policy per event whose name suggests a handoff"), §8
  A4/A5, §9 PL-M1, by analogy to REV-019 CE-F7.
- **Issue:** The mock is correct as *plumbing* (ADR-004) but, per PF-F1, its output **is** the over-wired
  case (a policy for every hand-off-named event) — the symmetric analog of SPEC-004's degenerate CRUD
  triple. It exercises only the green path (every `on`/`then` resolves; it never emits a **dangling**
  `on`/`then`, a **duplicate** id, or a **cycle**), so it does not meaningfully exercise PL2/PL3/PL4/PL7.
  It also isn't stated that the mock emits **PL5-valid, non-circular** provenance so A4's
  `provenanceRate = 1` holds offline.
- **Recommendation:** (a) require the mock to emit PL5-valid (per PF-F4, non-circular) provenance so the
  offline pipeline is PL1–PL7-green; (b) state in §8 that **PL failure paths are exercised by
  seeded-defect fixtures, not the mock**, and that the mock provides only the trivial green baseline —
  and, because the mock is the *over-wired* degenerate, mock-green A4/A5 must **not** be read as reaction
  quality (it is the very case the PF-F1 guardrail must flag).

### PF-F8 — sonnet-5 / medium is right; the single call is a cost *win* over SPEC-004 fan-out — affirm [Nit]
- **Location:** §5, §8, §10 R3.
- **Issue / affirmation:** `sonnet-5` medium (the house default) is correct and consistent with the four
  existing skills. The single call over the whole behaviour (+ one repair) is **2 calls max** — *cheaper*
  than SPEC-004's per-aggregate fan-out (~N calls), so cost is a non-issue and in fact improves. The one
  caveat: the input (narrative + capabilities + full behaviour + IR) is the **largest single input** of
  any skill (all events + all commands), but at solar scale (a few KB) `max_tokens: 16000` is ample. If a
  much larger domain ever strains a single call, the fallback is *not* per-event fan-out (which biases to
  over-wiring, PF-F1) but per-**source-entity** batching of triggers — note this as the scale lever, not
  a v1 concern.
- **Recommendation:** state the cost affirmation and the "single input is largest but fine at scale" note
  in §10 R3; keep any self-consistency reviewer on the eval/review path, not the interactive edit loop.

---

## Explicit answers to the assigned questions

### Single-call vs fan-out (does it reopen R1?)
**Single-call is the correct shape — keep it — but it *does* remove the structural R1 brake, and the
spec must own that.** Policies are global (a hand-off wires entity A → entity B); there is no per-entity
locality to fan out on, and per-*event* fan-out would **bias toward** a policy-per-event (the degenerate
case). So §5 is right to choose a single call. The catch REV-019 CE-F5 implies: SPEC-004 fan-out *was*
the event-storm brake, and the SPEC-003 single call is bounded by a **conservation law** — the policy
single call has **neither**. R1 therefore has no structural control, PL6/PL7 are non-gating, and A5's
guardrail is the **sole** backstop and must be a **hard gate** (PF-F1). Correct choice, load-bearing
consequence.

### Canonicalize (`on`/`then` — is "snap by slug/name" enough?)
**Not as worded — because the id space is now global.** SPEC-004 snaps `emits` within *one aggregate*
(locally-unique names); SPEC-005 snaps `on`/`then` across **all** events/commands, where names collide,
and a name-based mis-snap binds to the **wrong entity's** target while **PL2/PL3 still pass** — silent
mis-wiring. Snap **id-first** (exact → `slug(id)` → name-last-resort) against the real, entity-prefixed
id sets; **enumerate those ids in the prompt** (grouped by entity); pass the id sets into the skill
(PF-F2).

### Schema (POLICY_SCHEMA)
**Not given — specify it.** `additionalProperties: false` on the top object, each `policies[]` item,
**and** the nested `derivedFrom` `{ anchor }` object (the exact SPEC-003 400 spot); `on`/`then`/
`condition` as **strings**; `required: ["on","then"]`; no `maxItems` count-capping. The schema **cannot**
encode "`on`/`then` must exist" — that is PL2/PL3's job (PF-F3).

### Repair trigger (are PL2/PL3 major, so blocker-only would miss them?)
**Yes, PL2/PL3 are major (§6) — and the spec correctly avoids the trap.** §5 pins a **code allowlist**
naming PL2/PL3, not blocker-only — the CE-F2 fix, applied. Mirror `generateEvents`'s `isRepairable`
predicate exactly, and make the repair prompt **targeted** (inject the dangling `on`/`then` ids). Note
repair fixes dangling refs, **not** over-production (PF-F5).

### Provenance-fallback (circular?)
**No non-circular fallback is specified, and the two obvious ones are circular.** A policy's `on`/`then`
are its **own required fields**, so a `withAnchor`-style fallback to either tautologically grounds the
policy in itself — sharper than CE-F6 (where `agg.id` was honestly a *different* thing). Specify the
non-circular anchor = the **crossed boundary / narrative theme** (source-area→target-area, or the target
capability's outcome), never `on`/`then`; label A4's `provenanceRate` plumbing (PF-F4).

### Hollow-metric (is A5 well-specified; is there an over-wiring guardrail?)
**A5 is directionally right — it *has* a recall-vs-reference metric and names an over-wiring guardrail
(the CE-F1 lesson, learned) — but it is under-specified in the two places that matter.** (1) Recall must
match on the **(on, then) edge**, not policy name (PF-F6). (2) The over-wiring guardrail must be a
**separate precision / spurious-rate metric + a hard policies-per-event storm gate**, because
reactionRecall and coverage are **both green on the over-wired degenerate** (which is the §5 mock
itself) — recall cannot see over-production. Make it a hard gate, mirroring `scoreBehaviourCoverage`'s
`maxCommandsPerEntity` (PF-F1).

---

## Closing summary

SPEC-005 is feasible and — unlike the SPEC-004 draft REV-019 reviewed — it arrives having **already
absorbed** the two hardest predecessor fixes: the repair trigger is pinned to a PL2/PL3 **code
allowlist** (CE-F2 avoided), and A5 ships a **reactionRecall quality metric plus an over-wiring
guardrail** (CE-F1's instinct, present). That is real progress and the right instinct to reuse the
`events.ts` / `eval/events.ts` machinery. The risk has simply concentrated in the two dimensions where
cross-entity reactions are genuinely *harder* than the behaviour layer: **global id resolution** (`on`/
`then` now snap across all entities, so name-collision silently mis-wires past PL2/PL3 — PF-F2) and the
**absence of any structural output bound** (single-call is correct, but with neither fan-out nor a
conservation law, A5's guardrail is the sole R1 brake and must be a hard gate — PF-F1). Two more Majors
harden the un-given schema (PF-F3) and the tautological provenance fallback (PF-F4); the Minors target
the repair prompt (PF-F5), the recall match function (PF-F6), and the mock-as-degenerate baseline
(PF-F7). None require capability beyond current models; every fix is "mirror the now-correct `events.ts`
patterns and specify the guardrail." With the four Majors addressed, **Approve-with-changes**.

*(Findings to be logged with disposition in SPEC-005 §12 "Review & closure" before `Approved`, per
CONVENTIONS §4.)*
