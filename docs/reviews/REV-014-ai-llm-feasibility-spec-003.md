---
id: REV-014
title: "AI/LLM-Feasibility Review of SPEC-003 (Bounded Contexts — the capability-grouping layer)"
type: review
status: Approved
version: 1.0.0
author: "Claude (Opus 4.8) — ai-llm-feasibility lens"
created: 2026-07-10
updated: 2026-07-10
supersedes: null
reviews: SPEC-003
lens: ai-llm-feasibility
verdict: Approve-with-changes
related: [SPEC-003]
reviewers: [ai-llm-feasibility]
---

# REV-014 — AI/LLM-Feasibility Review of SPEC-003

## Verdict: **Approve-with-changes**

Through the LLM-feasibility lens, SPEC-003 is buildable with today's models and correctly
inherits the house shape — *LLM proposes, deterministic validators + the human decide*, structured
outputs, one repair retry, a deterministic mock for the offline path, grounded provenance. The
`ContextGrouper` job (cluster capabilities into cohesive contexts, name them, ground them) is well
within current capability, and the BC1–BC8 validators correctly own the objective, referential
checks a JSON Schema cannot enforce.

But partitioning is a **materially different generation task** from the 1:1 derivation the two
existing skills do, and the spec reuses SPEC-002's contract language without adjusting for it in
three places that bite:

1. **Clustering is a *global*, joint decision, not a local extraction.** `generateDomain` seeds each
   aggregate from a single `produces` name — each element is decided locally and is largely
   *extractive*. A partition is decided *jointly*: one boundary shift relocates several capabilities
   at once. Run-to-run variance and id churn are therefore structurally higher, and the R4
   mitigations do not yet bite (F1, F3, F4).
2. **The repair trigger the spec cites does not fire on the failure it names.** The spec says repair
   on "an unpartitioned or double-assigned capability" — but those fire BC2.* at severity **major**,
   while the `domain.ts` repair loop the spec mirrors triggers only on **blocker**. As written, a
   broken partition ships un-repaired and A4 (`partitionCompleteness = 1`) cannot be relied on (F1).
3. **Nothing measures whether the partition is *right*.** A2 (validator recall) and A4
   (completeness + provenance) are plumbing metrics — both are fully satisfiable by a degenerate
   partition (one giant context, or one context per capability). This is REV-009 F2 recurring one
   layer up, and it is the sharpest gap (F2).

None of these need capability beyond current models; all are addressable below. The BC1–BC8
validators are the strong part of the spec and A2's ≥90% target is realistic (indeed conservative).
Verdict: **Approve-with-changes**.

---

## Why grouping is harder to make deterministic than 1:1 derivation (lens framing)

| Dimension | DomainGenerator (SPEC-002) | ContextGrouper (SPEC-003) | Feasibility delta |
|---|---|---|---|
| Decision locality | **Local** — each aggregate from one `produces` name | **Global** — the whole partition is one joint decision | ↑ run-to-run variance; a boundary shift moves N members at once |
| Identity seed | Aggregate name seeded from a stable `produces` string | Context name is a **synthesized label** with no stable seed (`Sales & Onboarding` vs `Customer Acquisition`) | id churn worse than SPEC-002 (F3) |
| Groundability | Aggregate → its owning capability (1) | Context → its **member** capabilities (N) | provenance shape is N-ary but *tautological* (F6) |
| Schema enforceability | "owner is a real cap id" → DM2 | "every cap appears exactly once" → BC2 | same pattern; both un-encodable in JSON Schema (F8) |
| Failure mode uncaught by validators | over-generation of commands/events (REV-009 F3) | **over/under-partitioning** (1 giant vs many singletons) | A4's green metrics don't see it (F2) |
| Generation shape | per-capability fan-out is *safe* (REV-009 F3) | per-capability fan-out is **impossible** — partition is global | single call is correct here; opposite advice for a good reason (F9) |

The net: contexts are almost as *extractive* as aggregates in their inputs (the member ids exist),
but the *partition* is a global judgment whose identity is anchored to a volatile synthesized name.
That asymmetry drives F2, F3, and the Q4 answer.

---

## Findings

### BC-F1 — Repair trigger does not fire on a broken partition; A4 (`partitionCompleteness = 1`) is not guaranteed [Major]
- **Location:** §5 ("one repair retry (repair on any blocker, e.g. an unpartitioned or
  double-assigned capability)"), §6 (BC2.unassigned / BC2.multiple = **major**), §8 A4.
- **Issue:** The spec mirrors `generateDomain`, whose repair loop is
  `if (!doc || findings.some((f) => f.severity === "blocker"))`. But the spec's own cited repair
  triggers — an *unpartitioned* or *double-assigned* capability — fire `BC2.unassigned` /
  `BC2.multiple`, which the §6 table classifies as **major**, not blocker. So if `validateContexts`
  and `generateContexts` copy the domain pattern verbatim, the exact failure the repair exists for
  will **not** trigger a repair, and a doc with an ungrouped or double-assigned capability ships as
  the final result. BC2 is precisely the constraint the JSON Schema *cannot* enforce (F8), so repair
  is the only safety net — and it is disarmed. A4's `partitionCompleteness = 1` therefore has no
  mechanism guaranteeing it.
- **Recommendation:** two coupled changes.
  1. **Fix the trigger.** Repair on a code allowlist, not on severity alone:
     `repair if (!doc || findings.some(f => f.severity === "blocker" || f.code.startsWith("BC2.")))`.
     (Alternatively elevate BC2 to `blocker` — a doc that is not a partition arguably *is* a blocker
     — but an allowlist is less disruptive to the severity taxonomy other lenses may rely on.)
  2. **Make the repair prompt targeted, not generic.** `domain.ts` appends a generic "previous
     output was invalid… return corrected JSON." A model cannot fix what it cannot see. For a
     partition, inject the *specific* offending ids from the findings' `subjects`, e.g.
     *"These capabilities were left ungrouped: [x, y]. These were assigned to more than one context:
     [z]. Return a corrected partition that assigns every capability to exactly one context."* This
     materially raises single-shot repair success on the one failure the schema can't prevent.

### BC-F2 — No partition-*quality* instrument; A1/A4 are satisfiable by a degenerate partition [Major]
- **Location:** §8 A1 ("substantially right… after ≤1 review cycle"), A4
  (`partitionCompleteness = 1`, `contextProvenanceRate = 1`), §6 (BC1–BC8), R4.
- **Issue:** This is REV-009 F2 one layer up. A2 measures that the *validators* catch structural
  defects; A4 measures completeness + provenance — both are **plumbing**. A model that returns
  **one** context holding all capabilities scores `partitionCompleteness = 1`,
  `contextProvenanceRate = 1`, and passes every BC1–BC8 check. So does a model that emits **one
  context per capability**. Both are structurally perfect and semantically useless. A1 ("a domain
  reviewer calls it substantially right") is the only quality bar and it has **no scorer, no
  reference partition, and no matching function** — an aspiration, not an acceptance criterion. The
  DM eval had the same hole; here it is more acute because over/under-partitioning is invisible to
  *all* the structural checks (R2's analog, uncaught).
- **Recommendation:**
  1. **Adopt a partition-agreement metric.** The standard way to score two partitions of the *same*
     set is **Adjusted Rand Index** (or normalized mutual information). Produce **one human-blessed
     reference partition** of the solar capabilities (the A1 reviewer signs it once as a byproduct of
     A1), and report ARI(generated, reference) in `@vbd/eval` alongside the existing coverage
     metrics. This is the missing analog of REV-009's Corpus B "aggregate recall/precision."
  2. **Add deterministic count/size guardrails** (cheaper than ARI, no reference needed): flag
     `contextCount ∉ [2..6]` and a context that groups `> K%` of all capabilities (the "giant"
     smell). These give A4 a real over/under-partitioning signal without a human artifact and belong
     in the eval and/or as BC warnings.

### BC-F3 — Context identity is anchored to a volatile synthesized name; "stable slug" (R4) is a hollow mitigation [Major]
- **Location:** R4 (mitigations: "stable slug ids"), §4 (`bctx:<slug>` from the name), §5, §8 A3.
- **Issue:** R4 lists "stable slug ids" as a determinism mitigation. But a context's slug is derived
  from its **name**, and the name is a *synthesized label* for a cluster (`Sales & Onboarding`),
  with **no stable textual seed** — unlike an aggregate name, which is seeded from a fixed `produces`
  string. So the same partition, re-run, can yield `sales_onboarding` one run and
  `customer_acquisition` the next → a different `bctx:` id → churn that breaks (a) BC7's stable-slug
  premise across regenerations, (b) any finding-dismissal identity keyed on the context id (the
  content-addressed `findingId` in `@vbd/validation` hashes `subjects`, which will be the context
  id), and (c) provenance chip stability. Slugifying an unstable name yields an unstable id; the
  mitigation does nothing.
- **Recommendation:** key context *identity* on a **content fingerprint = the sorted set of member
  capability ids**, not the name (REV-009 F4.4 / REV-003 F3, applied here). Two runs that produce the
  same partition of `{lead_management, customer_management, offer_management}` are the *same* context
  even if labeled differently; the name is a mutable attribute, not the identity. Note also that once
  a human edits a context its `origin` flips to `authored` and it is pinned (golden invariant #2), so
  cross-run id stability only needs to hold *within* the generated, pre-edit state — set a
  **layer-specific, lower** inter-run stability threshold (measure it first; do not inherit the
  capability-layer number), exactly as REV-009 F4 prescribed for the domain layer.

### BC-F4 — No member-id canonicalization step; cosmetic id drift fires spurious BC4.dangling + BC2.unassigned [Major]
- **Location:** §5 (ContextGrouper Out: "a partition of the given capability ids"), §6 (BC4.dangling,
  BC2.unassigned), by analogy to `normalizeDomainIds` in `domain.ts`.
- **Issue:** `ContextGrouper` returns, per context, a list of capability-**id references** the model
  *typed*. Models routinely drift on ids — `lead-management` for `lead_management`, `leads` for
  `lead_management`, title-case, pluralization. `domain.ts` has `normalizeDomainIds` that
  slug-canonicalizes aggregate ids and remaps `references`, but it does **not** reconcile a typed
  reference against the *real* id set (DM2 just flags a miss). Here the members **are** the
  partition, so an un-reconciled drift is far more damaging: the mistyped member trips `BC4.dangling`
  *and* leaves the real capability unmatched → `BC2.unassigned` → a false "broken partition" that
  then burns the (F1-fixed) repair retry on a cosmetic error rather than a real one.
- **Recommendation:** add a `coerceContextsDoc` / normalize step that **snaps each member to a real
  capability id** before validation: exact match → `slug()` match → normalized-name match → only
  then reject as genuinely dangling. This is the "derive ids deterministically" discipline from
  REV-009 F4.2, and it is *more* load-bearing here than in the domain layer because the reconciled
  ids are the partition itself. Pass the authoritative capability-id list into the skill (as
  `generateDomain` passes `capIds`) so the coercion has a target set.

### BC-F5 — The deterministic mock collapses to a single context on the default offline path [Minor]
- **Location:** §5 (`mockGroupContexts` = "connected components over the `depends_on` graph"),
  §3 (the 3-context solar example the layer should demonstrate), §8 A4.
- **Issue:** The default offline pipeline is `mockGenerateCapabilities → mockGroupContexts`. But
  `mockGenerateCapabilities` sets `depends_on: i > 0 ? [order[i - 1]] : []` — a strict **linear
  chain**. Connected components over a chain = **one** component, so `mockGroupContexts` returns a
  single context grouping *every* capability. That is a valid partition (BC2 green, A4
  `partitionCompleteness = 1` trivially met), but it is degenerate: the offline demo shows one
  undivided "Areas" blob, never the 3-context Sales/Delivery/Finance split §3 promises, and it fails
  to exercise the multi-context UI, BC2.multiple, BC6, or BC9 in any meaningful way. The mock proves
  *plumbing* (correct, per ADR-004) but here the plumbing it proves is the trivial case.
- **Recommendation:** give `mockGroupContexts` a heuristic that yields a *realistic* multi-context
  split. The `RULES` table in `mock.ts` already assigns each capability a semantic identity — bucket
  those into a small static area map (lead/customer/offer → Sales; planning/procurement/installation
  → Delivery; billing → Finance), or cap component size, so the offline path and the seeded fixtures
  actually render 2–6 areas. State (as REV-009 F5 did for the DM mock) that BC2.multiple/BC6/BC9
  **failure** paths are exercised by seeded-defect fixtures, not by the mock, which provides only the
  green baseline.

### BC-F6 — BC8 provenance is tautological; `contextProvenanceRate = 1` (A4) measures plumbing, not correctness [Minor]
- **Location:** §3 (`derivedFrom: [{capability: lead_management}, …]`), §6 BC8, §8 A4.
- **Issue:** `groundDomainProvenance` sets `derivedFrom: [{capability: a.owner}]` (one owner). The
  clean transfer for a context is `derivedFrom: ctx.capabilities.map(c => ({capability: c}))` — an
  N-ary array over its members. The spec's §3 example has this shape right. **But** because a
  context's grounding *is* its member list, a machine-grounded `derivedFrom` is a **copy** of
  `capabilities` — it can never be wrong, so BC8 (and A4's `contextProvenanceRate`) is a tautology
  that only catches a grounding function that failed to run. Don't oversell A4's provenance metric as
  a quality signal; it is a plumbing check (same caveat as the DM eval's `provenanceRate`).
- **Recommendation:** make BC8 *earn its keep*: resolve each cited `derivedFrom.capability` against
  the real capability id set (like DM2), and require the cited set to **equal** the context's member
  set — so a context that cites capabilities it doesn't actually group (or omits ones it does) is a
  finding, not a silent pass. That turns BC8 from a copy-check into a consistency check. Keep the
  N-ary derivedFrom shape from §3.

### BC-F7 — Q4/BC9 cohesion is *deterministic*, not LLM-judgment; ship it as a pure warning [Minor]
- **Location:** §6 BC9, §11 Q4 ("ship… or defer as LLM-judgment like V3?"), §7 (review lens).
- **Issue:** Q4 frames BC9 as possibly deferrable "as LLM-judgment like V3." That framing is wrong:
  intra-context cohesion over `depends_on` (and shared entities) is **mechanically computable** from
  the IR — it is a connected-component / adjacency check *within* a context's member set, a pure
  function like V4/V6, not a semantic judgment like V3 (which needs narrative meaning). So BC9 does
  **not** need the model at all. (See the explicit Q4 answer below.)
- **Recommendation:** ship BC9 as a **deterministic minor warning** in `validateContexts`. Keep it a
  *warning* — legitimate contexts cohere by domain language, not always by `depends_on` (Finance /
  billing is a valid singleton). Note the dependency: BC9's *shared-entity* arm requires the SPEC-002
  domain model to exist; the `depends_on` arm always works, so degrade gracefully when entities are
  absent. Put the genuinely LLM-judgment version (semantic boundary questions — "should
  `offer_management` be Sales or Delivery?") in the §7 review lens with self-consistency, exactly as
  SPEC-001 §4.3 / REV-009 F10 do for the capability and domain reviews.

### BC-F8 — Confirm the partition constraint is un-encodable in JSON Schema; don't hard-code 2–6 as `min/maxItems` [Minor]
- **Location:** §5 (structured output; CONTEXT_SCHEMA not given), §6 BC2, §0/§5 ("2–6 contexts").
- **Issue (confirming the concern):** A CONTEXT_SCHEMA is expressible and *simpler* than
  `DOMAIN_SCHEMA` — `contexts: [{ id, name, intent?, capabilities: string[], meta? }]`, with members
  as **id strings** (mirror `owner: string`, not nested objects). But `output_config.format` /
  `json_schema` **cannot** enforce the partition invariant — "every capability id appears in exactly
  one context's `capabilities` across sibling array items" is a cross-item global constraint no JSON
  Schema expresses. That is correct and by design: BC2.unassigned + BC2.multiple + the (F1-fixed)
  repair own it, exactly as DM2 owns "owner resolves" for the domain schema. **One trap to avoid:**
  do **not** encode "2–6" as `minItems: 2 / maxItems: 6` on the `contexts` array — a business that
  genuinely has 7 areas would then be *unable* to produce a schema-valid response and be forced into
  a worse partition. Keep "2–6" as *prompt guidance*, not a schema hard-constraint.
- **Recommendation:** (1) members are id strings; (2) partition-uniqueness lives in BC2 + repair,
  never the schema; (3) "2–6" stays in the prompt; (4) optionally set `minItems: 1` on each
  `context.capabilities` — a cheap structural win that removes empty contexts (BC6) from the *LLM*
  path (BC6 still needed for hand-authored edits).

### BC-F9 — Cost/model is right; affirm the *single-call* design and note it is deliberately opposite to the domain-layer advice [Nit]
- **Location:** §5 (In: narrative + all capabilities + their entities + IR), §8, §10.
- **Issue / affirmation:** `sonnet-5` medium is correct and consistent with the other two skills.
  ContextGrouper's input is the largest of the three (narrative + *all* capabilities with deps and
  produces/consumes + owned entities), but at solar scale (~6–8 capabilities, ~15–20 entities) that
  is a few KB — no token concern; `max_tokens: 16000` in the shared provider is ample for a handful
  of contexts. Critically, ContextGrouper must be a **single call** producing the whole partition —
  it **cannot** fan out per-capability the way REV-009 F3 recommended for the domain layer, because a
  partition is a *global* decision (per-capability calls would each lack the joint constraint and
  produce overlaps/gaps). One call + at most one repair is the right and cheapest shape.
- **Recommendation:** state in §8/§10 that ContextGrouper is one global call by necessity (contrast
  with the domain layer's per-capability fan-out), and that input growth is a concern only at large N
  (many dozens of capabilities) — out of MVP scope, but name it rather than discover it.

---

## Explicit answers to the assigned questions

### Q4 — ship BC9 cohesion in this spec, or defer as LLM-judgment like V3?
**Ship it now, as a deterministic warning — the Q4 framing that it is "LLM-judgment like V3" is
incorrect (BC-F7).** Cohesion measured over the intra-context `depends_on` graph (and, when the
domain model is present, shared entities) is a *pure, testable* adjacency computation on the IR — no
model call, unlike V3 which needs narrative semantics. Keep it a **minor warning** (a loosely-grouped
context is a smell, not an error; some contexts legitimately cohere by language, e.g. Finance).
Degrade gracefully: `depends_on` arm always available, shared-entity arm requires SPEC-002. The
*semantic* boundary judgment ("is `offer_management` really Sales?") is the LLM's job and belongs in
the §7 **review lens** with k-sample self-consistency (SPEC-001 §4.3), not in `validateContexts`.

### Determinism (R4)
The R4 mitigation set is **necessary but not sufficient as written.** The deterministic mock, pinned
snapshot, grounded provenance, and repair-once are all correct and carry over — but "stable slug ids"
is hollow (BC-F3: a slug of a volatile synthesized name is volatile), and the repair-once is disarmed
against the very failure it targets (BC-F1). Sufficiency requires: (a) fix the repair trigger to fire
on BC2.* and make it targeted (BC-F1); (b) key context identity on the **member-set fingerprint**, not
the name (BC-F3); (c) canonicalize member ids to real capability ids before validating (BC-F4); (d)
measure a **layer-specific** inter-run stability threshold rather than inheriting the capability
layer's (BC-F3). With those, the partition's *identity* is stable even when its *labels* drift.

### Structured-output schema
A partition **is** expressible via `output_config.format` (members as id strings, mirroring
`owner`), and it is *simpler* than `DOMAIN_SCHEMA` — but the partition invariant "every capability
exactly once" is **not** schema-enforceable (a cross-item global constraint), by the same design that
leaves "owner resolves" to DM2 rather than the domain schema. BC2 + the repair own it; the repair
must actually fire (BC-F1). Do **not** hard-code "2–6" as `min/maxItems` (BC-F8).

### Provenance (BC8)
`groundDomainProvenance`'s pattern transfers *structurally* (single `[{capability: owner}]` → N-ary
`capabilities.map(c => ({capability: c}))`, and the §3 example has this shape correct) — but the
transfer makes BC8 **tautological**, because a context's grounding is a copy of its own member list
(BC-F6). Strengthen BC8 to resolve the cited ids against real capabilities *and* require the cited
set to equal the member set, so it becomes a consistency check rather than a copy check; and do not
present A4's `contextProvenanceRate = 1` as a quality signal — it is plumbing.

### Measurement (A2/A4) vs the DM eval
A2 (seeded-defect recall) transfers cleanly and its ≥90% floor is conservative — the injectors
(unassigned, double-assigned, dangling member, empty, non-slug/duplicate id) are all structural, so
`validateContexts` recall should approach 100%, and the `scoreDomainCase` (code, subject) matching
function ports directly. A4's `partitionCompleteness` mirrors `ownershipCoverage` and
`contextProvenanceRate` mirrors `provenanceRate` — both computable and deterministic. **The gap
(BC-F2) is the same one REV-009 F2 raised: there is no partition-*quality* instrument.** Add an ARI
(or NMI) partition-agreement metric against a one-time human-blessed reference partition, plus
deterministic count/size guardrails, so a degenerate one-giant-context or all-singletons partition
cannot pass A4 green.

### Over/under-partitioning
Covered by BC-F2 and BC-F8: it is invisible to BC1–BC8, and A4's completeness/provenance metrics are
*maximized* by the two degenerate extremes. The deterministic count-in-[2..6] and giant-context
guardrails (BC-F2 rec 2) are the cheapest real signal; BC9 (BC-F7) catches the *under*-cohesion of an
over-merged context but not the count problem, so both are needed.

---

## Closing summary

SPEC-003 is feasible and the reuse of the capability/domain machinery is the right instinct — but
"same loop, one layer up" hides a real difference: **partitioning is a global, joint decision whose
identity rides on a volatile synthesized name, and whose one un-schematizable invariant (BC2) is
guarded by a repair loop that, as specified, will not fire.** The four Majors are the load-bearing
fixes: arm and target the repair (BC-F1), give the layer a partition-*quality* instrument so degenerate
partitions can't pass green (BC-F2), anchor identity on the member set rather than the name (BC-F3),
and canonicalize member ids before validating (BC-F4). The Minors harden the mock, BC8, BC9, and the
schema. None require capability beyond current models. With these addressed, **Approve-with-changes**.

*(Findings to be logged with disposition in SPEC-003 §12 "Review & closure" before `Approved`, per
CONVENTIONS §4.)*
