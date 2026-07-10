---
id: REV-019
title: "AI/LLM-Feasibility Review of SPEC-004 (Commands & Events — the behaviour layer)"
type: review
status: Approved
version: 1.0.0
author: "Claude (Opus 4.8) — ai-llm-feasibility lens"
created: 2026-07-10
updated: 2026-07-10
supersedes: null
reviews: SPEC-004
lens: ai-llm-feasibility
verdict: Approve-with-changes
related: [SPEC-004]
reviewers: [ai-llm-feasibility]
---

# REV-019 — AI/LLM-Feasibility Review of SPEC-004

## Verdict: **Approve-with-changes**

Through the LLM-feasibility lens, SPEC-004 is buildable with today's models and correctly keeps the
house shape — *LLM proposes, deterministic validators + the human decide*, structured outputs, a
deterministic offline mock, grounded provenance, text-as-truth. Deriving a few commands/events per
aggregate is a **more extractive, more local** task than the SPEC-003 partition (each command changes
exactly one aggregate; each event belongs to exactly one aggregate — §0), so it is *lower* variance
than clustering. The CE1–CE8 validators correctly own the referential checks a JSON Schema cannot
enforce, and A2's ≥90% seeded-defect floor is realistic (indeed conservative).

But "same loop, one facet deeper" imports SPEC-002/003 contract language without re-deriving three
things that bit the two predecessor skills, and the spec (§5 is only three bullets) leaves the exact
mechanisms unspecified precisely where they went wrong before:

1. **No coerce/canonicalize step is specified (§5), and this layer has *more* id spaces than any
   prior one.** A command references an **aggregate id**, a **capability id**, and one-or-more
   **event ids** (`emits`); an event references an **aggregate id**; and the command/event ids
   themselves must be stable slugs. That is 3–4 reconciliations vs. the contexts layer's one. This is
   REV-014 BC-F4 recurring with a wider blast radius (CE-F3).

2. **The repair trigger, as worded, will not fire on the failures it names.** §5 says "repair on any
   blocker or dangling target," but §6 rates CE2/CE3/CE4 (the dangling-reference core) **major**, not
   blocker. If the implementer mirrors `domain.ts` (`severity === "blocker"`) — as `contexts.ts` did
   before it was fixed — the exact failure repair exists for ships un-repaired. This is REV-014 BC-F1,
   verbatim, one layer over (CE-F2).

3. **Nothing measures whether the behaviour model is *right*.** A2 is validator plumbing; A4 is
   coverage. Both are **maximally satisfied by the mock's own degenerate `create_/update_/…_changed`
   triple** — and *also* by an event-storm (A4 has no upper bound). This is REV-009 F2 / REV-014 BC-F2
   recurring, and it is the sharpest gap: the contexts eval already grew an ARI quality metric because
   "coverage alone was hollow," and SPEC-004 ships the hollow version again with **no analog** (CE-F1).

None of these need capability beyond current models; all are addressable below, mostly by copying the
now-correct `contexts.ts` patterns rather than the older `domain.ts` ones. Verdict:
**Approve-with-changes**.

---

## Why commands/events are *easier* than the partition but *not* free (lens framing)

| Dimension | ContextGrouper (SPEC-003) | EventModeler (SPEC-004) | Feasibility delta |
|---|---|---|---|
| Decision locality | **Global** — the whole partition is one joint decision | **Local** — commands/events are scoped to a single aggregate (§0) | ↓ variance; per-aggregate fan-out is *safe here* (opposite of contexts) |
| Id spaces to reconcile | one (member → capability id) | **three–four** (command→aggregate, command→capability, command→event, event→aggregate) + slug-canon of command/event ids | ↑ canonicalization surface (CE-F3) |
| Generation shape | single call by necessity (global constraint) | single call **or** per-aggregate fan-out — fan-out is the R1 over-production lever (REV-009 F3.1) | opposite advice for a principled reason (CE-F5) |
| Un-schematizable invariant | "every capability exactly once" (BC2) | "command target / emit target resolves" (CE2/CE4) + intra-doc `emits`→`events` ref | same pattern; validators + repair own it (CE-F4) |
| Failure invisible to validators | over/under-partitioning | **degenerate CRUD triple** *and* **event-storm** (both extremes) | A4 green means nothing (CE-F1) |
| Provenance shape | N-ary over members (tautological, BC-F6) | 1× the command's own `capability` field (tautological) | CE6 is a copy-check, not correctness (CE-F6) |

The net: EventModeler's *inputs* are more extractive than the partition (the aggregates and
capabilities already exist as stable ids), so single-shot quality should be *higher* than SPEC-003 —
but the **cross-reference reconciliation** and the **quality-measurement** gaps are worse, not better,
because there are more id spaces and two symmetric degenerate failure modes instead of one.

---

## Findings

### CE-F1 — No behaviour-*quality* instrument; A2/A4 are satisfied by the degenerate CRUD triple *and* by an event-storm [Major]
- **Location:** §8 A2 (validator recall), A4 ("every aggregate has ≥1 command and ≥1 event;
  `provenanceRate = 1`"), §5 (mock = `create_<agg>`/`update_<agg>` → `<agg>_changed`), §6 (CE7/CE8),
  §10 R1.
- **Issue:** This is REV-009 F2 and REV-014 BC-F2 for the third time, and here it is unusually acute
  because **both** degenerate extremes score green:
  - **Under-modeling (trivial CRUD).** The §5 mock emits, per aggregate, a `create_<agg>` /
    `update_<agg>` command emitting a `<agg>_changed` event. That satisfies A4 **perfectly** — every
    aggregate has ≥1 command and ≥1 event, `provenanceRate = 1`, CE1–CE8 all green — while containing
    **zero** business behaviour (no *Qualify Lead*, no *Issue Invoice*). A real `EventModeler` that
    emitted exactly this CRUD boilerplate for every aggregate would pass the go/no-go gate.
  - **Over-modeling (event-storm, R1).** A4 has **no upper bound** — more commands only *raises*
    coverage. An LLM that invents a command/event per verb in the narrative also scores A4 green.
  - **CE7/CE8 catch neither.** CE7 fires only when an aggregate has *no* command; CE8 only on an event
    *no one* emits. The CRUD triple trips neither; the storm trips neither. A1 ("substantially right")
    is the only quality bar and — exactly as in REV-009/REV-014 — it has **no scorer, no reference set,
    no matching function**.
- **Recommendation:** give the layer a quality instrument, mirroring what `eval/contexts.ts` did with
  `partitionAgreement`:
  1. **Coarse precision/recall vs a one-time human-blessed reference behaviour set** for solar (the A1
     reviewer signs it once, as a byproduct of A1). Do **not** exact-match command sets — granularity
     is subjective (REV-009 F2: `qualify_lead` vs `set_status`+`assign_rep` are both defensible).
     Score at coarse granularity: per aggregate, does the output carry the **key** expected commands
     (normalized-name similarity ≥ τ), i.e. **command recall** = "did it find the load-bearing verbs
     like *Qualify Lead*, *Issue Invoice*"; and **precision / spurious-element rate** = the
     event-storm signal.
  2. **Deterministic guardrails (cheaper, no reference):** a commands-per-aggregate /
     events-per-aggregate distribution with a storm flag (aggregate with `> K` commands — REV-009 F3's
     over-generation metric), **and** a "trivial-triple" smell (every command matches `create_*`/
     `update_*` and every event `*_changed` → degenerate CRUD). Both belong in `@vbd/eval` and gate
     A4 so neither degenerate extreme can pass green.

### CE-F2 — Repair trigger as worded will not fire; CE2/CE3/CE4 are *major*, and "dangling target" omits CE3 [Major]
- **Location:** §5 ("one repair retry (repair on any blocker or dangling target)"), §6 (CE2/CE3/CE4 =
  **major**; CE1.required = blocker/major; CE5.unique = blocker).
- **Issue:** REV-014 BC-F1, one layer over. `domain.ts` repairs on `findings.some(f => f.severity ===
  "blocker")`. The dangling-reference findings this repair is *for* — CE2.command_target,
  CE3.event_source, CE4.emit_target — are all **major** in §6. If the implementer copies the
  `domain.ts` predicate (as `contexts.ts` originally did), **none of them trigger a repair** and a doc
  with a dangling command/event ships as the final result. Two further gaps: (a) the phrase "dangling
  **target**" naturally reads as CE2/CE4 (command→aggregate, command→event) but **omits CE3**
  (event→aggregate), which is an equally-dangling reference; (b) `domain.ts`'s repair prompt is generic
  ("previous output was invalid… return corrected JSON") — a model cannot fix what it cannot see.
- **Recommendation:** copy the *fixed* `contexts.ts` shape, not the `domain.ts` one:
  1. **Pin the predicate as a code allowlist:**
     `repair if (!doc || findings.some(f => f.severity === "blocker" || f.code.startsWith("CE2.") ||
     f.code.startsWith("CE3.") || f.code.startsWith("CE4.")))` — mirroring `generateContexts`'s
     `code.startsWith("BC2.")`. State it in §5 so it isn't left to the implementer.
  2. **Target the repair prompt** by injecting the offending ids from the findings' `subjects` (as
     `generateContexts` does): *"These commands target an aggregate that does not exist: [x]. These
     `emits` reference an undefined event: [y]. Return corrected JSON only."*

### CE-F3 — No coerce/canonicalize step specified; this layer reconciles 3–4 id spaces, so drift trips CE2/CE3/CE4 and burns the single repair [Major]
- **Location:** §5 (EventModeler "Out: commands + events … each citing the capability/anchor"; no
  coerce step), §6 (CE2/CE3/CE4/CE5.slug), by analogy to `coerceContextsDoc` + `normalizeDomainIds`.
- **Issue:** §5 specifies **no** coerce/canonicalize step — the same omission REV-014 BC-F4 caught for
  contexts, but with a **wider** surface. Models routinely drift on ids (`lead-management` for
  `lead_management`, `Lead` for `lead`, pluralization, title-case). Here every generated command/event
  carries **several** typed id references that must each snap to a real id:
  - `command.aggregate` → a real **aggregate id** (else CE2 + CE3-adjacent false dangling)
  - `command.capability` → a real **capability id** (else CE2)
  - `command.emits[]` → **event ids** defined in the *same* response's `events` array (else CE4 — an
    **intra-document** reference the model can drift on between where it declares the event and where
    it types the emit)
  - `event.aggregate` → a real **aggregate id** (else CE3)
  - `command.id` / `event.id` → stable **slugs** (else CE5.slug; `Qualify Lead` → `qualify_lead`)

  An un-reconciled drift on any of these fires a *major* referential finding on a **cosmetic** error,
  which — once CE-F2 is fixed and repair actually fires — then **burns the single repair retry on a
  typo rather than a real defect** (the exact BC-F4 failure chain). The good news: §5 already feeds the
  skill the aggregates *and* capabilities, so the authoritative id sets are in hand.
- **Recommendation:** specify a `coerceEventsDoc(json, aggIds, capIds)` step (mirror `coerceContextsDoc`)
  that, before validation:
  1. **slug-canonicalizes** every `command.id` / `event.id` (mirror `normalizeDomainIds`);
  2. **snaps** `command.aggregate` and `event.aggregate` to a real aggregate id (exact → `slug()` →
     normalized-name match, else leave for CE2/CE3 to flag);
  3. **snaps** `command.capability` to a real capability id;
  4. **remaps** `command.emits[]` to the canonicalized `event.id` set produced in the same doc (so an
     internally-consistent emit isn't broken by cosmetic drift).
  Pass `aggIds`/`capIds` into the skill exactly as `generateDomain` passes `capIds`.

### CE-F4 — EVENT_SCHEMA must set `additionalProperties: false` on every nested object — the exact 400 that hit SPEC-003 [Major]
- **Location:** §5 (structured outputs; no schema given), §4/§6.
- **Issue:** §5 promises structured outputs but gives **no** `EVENT_SCHEMA`, and the spec never states
  the invariant that bit SPEC-003 and is now baked into `contexts.ts`: **every nested object in an
  `output_config.format` schema needs `additionalProperties: false`** or the API 400s. This schema has
  *more* nested objects than any prior one: the `command` item object, the `event` item object, and —
  critically — the **`derivedFrom` item object** (`{ capability: string }`), which is exactly the
  nested spot `CONTEXT_SCHEMA` had to fix (its `derivedFrom` items carry `additionalProperties: false`).
  A schema that omits it on any of these is a hard runtime failure, not a quality issue.
- **Recommendation:** state in §5 (or a schema appendix) the concrete shape and the rule:
  - top-level object `additionalProperties: false`, `required: [version, commands, events]`;
  - each `commands[]` item: `additionalProperties: false`, `required: [id, name, aggregate,
    capability]`, `emits` as `array of string` (event ids — keep them **strings**, not nested objects,
    so no extra `additionalProperties` surface), `derivedFrom` as an array of
    `{ type:"object", additionalProperties:false, properties:{ capability:{type:"string"} } }`;
  - each `events[]` item: `additionalProperties: false`, `required: [id, name, aggregate]`, same
    `derivedFrom` nested shape.
  Also (confirming CE-F5/BC-F8): do **not** try to encode "a few commands per aggregate" as
  `maxItems` — a genuinely command-rich aggregate would be forced into a worse model; count control is
  prompt guidance + the eval guardrail (CE-F1), never the schema. And the schema **cannot** enforce
  CE2/CE4 (cross-reference / intra-doc resolution) — that is correctly the validators' + repair's job.

### CE-F5 — Generation shape: commands/events are aggregate-*local*, so per-aggregate fan-out is the safe R1 (event-storm) lever — deliberately opposite to the contexts single-call [Major]
- **Location:** §5 ("for each aggregate, propose the commands that change it"), §10 R1 (mitigation:
  "lean prompt … CE7/CE8 … review lens"), §8.
- **Issue:** R1 (event-storm) is named but its mitigations are weak: CE7/CE8 catch *under*-modeling
  (CE-F1), the "lean prompt" is a soft nudge, and the review lens is a human backstop. The one
  **structural** lever REV-009 F3.1 established for controlling over-generation — *scope each call to a
  single unit and bound its fan-out* — is available here and is **safe**, because commands/events are
  **local to one aggregate** (§0: a command changes exactly one aggregate; the events it emits belong
  to that same aggregate). Unlike the SPEC-003 partition (a *global* joint decision that REV-014 BC-F9
  said **must** be one call), EventModeler has **no** cross-aggregate constraint, so it can fan out
  **per aggregate** (one call producing that aggregate's commands + the events they emit) without
  losing any joint invariant — and doing so keeps `emits`→`events` cross-refs **internally consistent
  within the call** (the REV-009 F8 point), shrinking the CE-F3 reconciliation surface.
- **Recommendation:** make per-aggregate (or per-capability-cluster) fan-out the primary R1 control and
  **state explicitly that this is the opposite of ContextGrouper's mandatory single call, for a
  principled reason** (local vs. global decision). If a single call is kept for cost, the prompt must
  hard-scope "a few commands for *each* aggregate, no invented facts" and the CE-F1 over-generation
  guardrail becomes the only real backstop — name that tradeoff rather than discover it.

### CE-F6 — CE6 provenance is tautological (a copy of the command's own `capability` field); it measures plumbing, not correctness [Minor]
- **Location:** §3 (`derivedFrom: [{ capability: lead_management }]` on a command already declaring
  `capability: lead_management`), §5, §6 CE6, §8 A4 (`provenanceRate`).
- **Issue:** This is REV-013 C3 / REV-014 BC-F6 for commands/events. A command **already** carries a
  required authored `capability` field (§3); setting `derivedFrom = [{ capability: <that same id> }]`
  is a **copy** of a field the element already has, so CE6 "can never be wrong" and catches only a
  grounding function that failed to run. It is consistent with the accepted `groundDomainProvenance`
  pattern (aggregate → its owner), so this is not a blocker — but A4's `provenanceRate = 1` must **not**
  be presented as a quality signal; it is plumbing, exactly the caveat REV-014 attached to
  `contextProvenanceRate`.
- **Recommendation:** two low-cost upgrades, per REV-009 F1's domain-anchor union:
  1. **Make CE6 a consistency check, not a copy-check:** require the cited `derivedFrom.capability` to
     **resolve to a real capability** *and* to **equal the command's own `capability` field** — so a
     command that cites a capability it isn't invoked by is a finding, not a silent pass.
  2. Optionally carry a `via` (`purpose | outcome | produces`) on the anchor so the provenance points
     at *what motivated this verb* (the capability's outcome/activity), not merely re-states the
     invoking capability — the honest, non-tautological anchor. Keep A4's provenance metric labelled
     "plumbing."

### CE-F7 — The mock is the hollow-A4 case; state that CE failure paths come from seeded fixtures and that mock-green ≠ quality [Minor]
- **Location:** §5 (`mockGenerateEvents` = per-aggregate `create_/update_/…_changed`), §8 A4, §9 CE-M1.
- **Issue:** The mock is correct as *plumbing* (ADR-004) but, per CE-F1, its output **is** the
  degenerate triple that makes A4 hollow, and it exercises only the green path: it never emits a
  command with **multiple** events, **multiple** commands per aggregate, or an orphan event, so it does
  not exercise CE4's multi-emit, CE7, or CE8 in any meaningful way (REV-009 F5 / REV-014 BC-F5). It also
  isn't stated that the mock emits CE6-valid `meta.derivedFrom` so A4's `provenanceRate = 1` holds
  offline.
- **Recommendation:** (a) require the mock to emit CE6-valid provenance (so the offline pipeline is
  CE1–CE8-green, the forcing function that proves the provenance shape resolves); (b) state in §8 that
  **CE1–CE8 failure paths are exercised by seeded-defect fixtures, not the mock**, and that the mock
  provides only the trivial green baseline — mock-green A4 must not be read as behaviour quality.

### CE-F8 — Q6 naming: do *not* build a deterministic imperative/past-tense validator; keep it in the review lens [Minor]
- **Location:** §11 Q6, §7 (review lens: "imperative commands, past-tense events"), §6.
- **Issue:** Q6 asks whether a validator should enforce imperative-mood commands / past-tense events.
  Deterministic English mood/tense detection is **unreliable** — imperative vs. infinitive is
  ambiguous (*Qualify Lead* vs *Invoice Issued*; *Schedule Installation* is imperative *and* a noun
  phrase), and a brittle regex validator would throw false CE findings on valid names, the same
  anti-pattern REV-009 F7 flagged for DM5. This is an LLM-judgment check, like V3.
- **Recommendation (answers Q6):** leave naming to the **review lens** with k-sample self-consistency
  (SPEC-001 §4.3), **not** a deterministic validator. If any deterministic signal is wanted, cap it at
  a *nit-level* heuristic warning (e.g. event id not ending in a past-participle-ish token) that never
  gates A2.

### CE-F9 — sonnet-5 / medium is right and consistent; confirm, and note per-aggregate fan-out cost [Nit]
- **Location:** §5, §8, §10 R3.
- **Issue / affirmation:** `sonnet-5` medium (the house default) is correct and consistent with the
  three existing skills; EventModeler's input (narrative + capabilities + aggregates + IR) is small at
  solar scale (a few KB), so `max_tokens: 16000` is ample and there is no token concern. If CE-F5's
  per-aggregate fan-out is adopted, a solar run is ~N aggregates (~6–10) × one call (+ repair) — a few×
  the calls of a single pass, entirely acceptable for a single-user MVP but worth one line (REV-009 F9).
- **Recommendation:** state the fan-out cost tradeoff explicitly (~N× calls buys over-production control
  + intra-call `emits` consistency); keep any self-consistency reviewer on the eval/review path, not the
  interactive edit loop.

---

## Explicit answers to the assigned risks

### Repair trigger
**As worded it will not fire.** §5's "repair on any blocker or dangling target" leaves CE2/CE3/CE4
(**major**) uncovered if the implementer copies `domain.ts`'s `severity === "blocker"` predicate — the
exact BC-F1 defect `contexts.ts` had to fix. Pin a **code allowlist**
(`blocker || code.startsWith("CE2."|"CE3."|"CE4.")`) and make the repair prompt **targeted** with the
offending ids (CE-F2).

### Schema `additionalProperties`
**Not called out, and this schema has more nested objects than any prior one** — the `command` item,
the `event` item, and the `derivedFrom` `{ capability }` item all need `additionalProperties: false`
(the `derivedFrom` object is exactly the spot `CONTEXT_SCHEMA` had to fix after the SPEC-003 400). Keep
`emits` as an array of **strings**. Do **not** bound command counts with `maxItems`; the schema cannot
and should not encode CE2/CE4 (CE-F4).

### Canonicalization
**Missing from §5, and load-bearing here more than anywhere.** Commands/events reference aggregate ids,
capability ids, intra-doc event ids, and carry slug ids — 3–4 reconciliations vs. contexts' one. Add a
`coerceEventsDoc(json, aggIds, capIds)` that slug-canonicalizes command/event ids and snaps every
cross-reference to a real id **before** validation, or cosmetic drift trips CE2/CE3/CE4 and burns the
single repair (CE-F3).

### Circular provenance
**CE6 is tautological** — `derivedFrom` copies the command's own required `capability` field (REV-013
C3 / REV-014 BC-F6). It matches the accepted domain pattern, so it is a Minor, but do **not** sell
A4's `provenanceRate` as quality; upgrade CE6 to require the cited capability to **equal** the
command's `capability` field (a consistency check), optionally with a `via` anchor to what motivated
the verb (CE-F6).

### Hollow metric
**The sharpest gap, for the third time.** A2 is validator plumbing; A4's coverage + provenance are
**maximally satisfied by the mock's degenerate `create/update/changed` triple *and* by an event-storm**
(A4 has no upper bound), and CE7/CE8 catch neither extreme. The contexts eval already grew ARI +
guardrails because "coverage alone was hollow"; SPEC-004 needs the analog — coarse command **recall**
vs. a one-time human-blessed reference behaviour set (did it find the load-bearing verbs), plus a
spurious-rate / commands-per-aggregate **over-generation** guardrail and a "trivial-triple" smell, so
neither degenerate direction passes A4 green (CE-F1).

---

## Closing summary

SPEC-004 is feasible and the instinct to reuse the capability/domain/contexts machinery is right — the
behaviour layer is *more* extractive and *more* local than the SPEC-003 partition, so single-shot
quality should be **higher**, not lower. The risk has simply moved: it is now concentrated in
**cross-reference reconciliation** (more id spaces than any prior layer) and in **measuring whether the
verbs are the right verbs**. The five Majors are the load-bearing fixes, and four of them are *"copy
the fixed `contexts.ts`, not the older `domain.ts`"*: give the layer a behaviour-quality instrument so
the degenerate CRUD triple and the event-storm can't both pass A4 green (CE-F1); pin the repair
predicate to a CE2/CE3/CE4 allowlist and target it (CE-F2); specify a coerce/canonicalize step that
snaps every id reference before validation (CE-F3); bake `additionalProperties: false` into every
nested schema object (CE-F4); and make per-aggregate fan-out the structural event-storm lever,
explicitly opposite to the contexts single call (CE-F5). The Minors harden CE6, the mock, and the
naming question (Q6). None require capability beyond current models. With these addressed,
**Approve-with-changes**.

*(Findings to be logged with disposition in SPEC-004 §12 "Review & closure" before `Approved`, per
CONVENTIONS §4.)*
