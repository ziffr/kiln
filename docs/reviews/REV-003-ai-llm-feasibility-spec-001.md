---
id: REV-003
title: "AI/LLM-Feasibility Review of SPEC-001 (Narrative → Capability Map → Review Loop)"
type: review
status: Approved
version: 1.0.0
author: "Reviewer (ai-llm-feasibility)"
created: 2026-07-10
updated: 2026-07-10
supersedes: null
reviews: SPEC-001
lens: ai-llm-feasibility
verdict: Approve-with-changes
related: [SPEC-001]
---

# REV-003 — AI/LLM-Feasibility Review of SPEC-001

## Summary

Through the LLM-feasibility lens, SPEC-001 is fundamentally sound and buildable with
today's models. The core architectural instinct — *LLM proposes, deterministic validators
and the human decide* — is exactly right and de-risks the biggest failure modes
(hallucinated structure, non-determinism, silent drift). Named, schema-constrained,
single-purpose skills (§4) plus JSON-Schema validation with a repair retry is a realistic,
well-worn pattern. The IR-as-spine design (§3.3) and pure-function validators (§5) give the
system a deterministic backbone that the LLM output must earn its way into.

However, the spec has three feasibility gaps that must close before implementation, and they
cluster around **measurement and provenance**, not the model calls themselves:

1. The provenance requirement (`meta.derivedFrom`, §4.2) has no home in the persisted
   schema (§3.2) and no validator enforcing it — so "no capability without provenance" is
   currently unenforceable and will silently degrade.
2. The percentage targets in A1/A2 (§8) have **no defined measurement instrument**, and
   §12 Q5 correctly flags there is no gold dataset. Without a concrete eval harness these
   are aspirations, not acceptance criteria.
3. §12 Q4 (persisting "dismissed" findings) is unanswered, and the `CapabilityReviewer`
   output (§4.3) has no stable finding identity — so re-review *will* re-raise dismissed
   items and erode trust in the review inbox.

All three are addressable with the mechanisms proposed below. None require capabilities
beyond current models. Verdict: **Approve-with-changes**.

---

## Findings

### F1 — Provenance requirement has no schema home and no validator [Major]
- **Location:** §4.2 (CapabilityGenerator), §3.2 (capabilities.yaml), §5 (validators)
- **Issue:** §4.2 mandates that "Each capability MUST cite which narrative outcome/activity
  justifies it (`meta.derivedFrom`). No capability without provenance." But the
  `capabilities.yaml` shape in §3.2 declares only `id, name, purpose, outcomes, actors,
  produces, consumes, depends_on` — there is no `meta` field, so the LLM's provenance has
  nowhere to be persisted or round-tripped, and no validator in §5 checks it. "MUST" that
  nothing enforces will decay: the model will sometimes emit it, sometimes not, and nobody
  will notice. This is the load-bearing claim that separates VBD from "AI vibes," yet it is
  the least enforced part of the contract.
- **Recommended change:**
  1. Add `meta.derivedFrom` to the §3.2 schema explicitly, typed as a non-empty array of
     structured anchors, not free text — e.g.
     `derivedFrom: [{ section: "Core Activities", ref: "acquire", line?: 14 }]`, resolvable
     against `narrative.json`. Require `narrative.json` (produced by the parser) to carry
     section ids + line offsets so these anchors are checkable.
  2. Add validator **V8 (provenance):** every capability has a non-empty `meta.derivedFrom`
     whose anchors resolve to existing narrative sections; unresolved or empty → `blocker`
     finding. This moves provenance from "LLM promise" to "compiler-enforced invariant" and
     lets you wire it into `IR.sourceRefs` (§3.3) for the detail-panel "source line" feature
     (§7.5) for free.

### F2 — A1/A2 have percentage targets but no measurement instrument; Q5 unanswered [Major]
- **Location:** §8 (A1 ≥80%, A2 ≥90%), §11 R1, §12 Q5
- **Issue:** A2 asserts the review pass catches seeded issues "in ≥90% of runs" and A1 asks
  for "≥80% capabilities right," but the spec defines neither the corpus, the scoring
  function, nor how "right" is adjudicated without a gold dataset (Q5). R1 hand-waves "an
  eval rubric rather than a gold answer" without specifying it. As written these are not
  testable, and M5's "acceptance eval harness (A1–A5)" has nothing to implement against. The
  phrase "in ≥90% of runs" is also ambiguous: 90% of runs catch *all* seeded defects, or 90%
  of *defects* are caught across runs? These are very different bars.
- **Recommended change:** adopt the concrete, gold-free eval methodology in the
  **Appendix — Proposed Eval Methodology (answers Q5)** below: seeded-defect recall/precision
  for A2, rubric-based LLM-judge (human-calibrated) for A1, and inter-run stability (Jaccard)
  as a determinism gate. Pin exact metric definitions in §8 (recommend: A2 = per-defect
  recall ≥0.9 with precision ≥0.7 on the seeded corpus, computed over k=5 seeded runs).

### F3 — Q4: dismissed findings have no persistence mechanism and no stable identity [Major]
- **Location:** §4.3 (CapabilityReviewer output), §7.4 (Apply/Edit/Dismiss), §12 Q4
- **Issue:** The reviewer output findings carry no id/fingerprint. Two runs over the same (or
  lightly edited) model will produce semantically identical findings with different free-text
  `explanation`/`suggestion` wording. With nothing to key on, a dismissed "Lead vs Customer
  overlap" re-appears on every re-review, training the user to ignore the inbox — which kills
  the differentiator (§4.3).
- **Recommended change:** implement the fingerprint-based dismissal store in the **Appendix —
  Dismissal Persistence (answers Q4)** below. Key each finding on a stable *content
  fingerprint* (type + sorted capability ids + normalized suggestion-class), NOT the prose;
  persist dismissals in a git-tracked `.vbd/reviews/dismissed.json`; filter re-review output
  against it as a deterministic post-processing step (never ask the LLM to remember
  dismissals). Add a "resurface-on-change" rule so dismissals expire when the referenced
  capabilities materially change.

### F4 — CapabilityReviewer's ≥90% target leans on the hardest LLM task; decompose and anchor [Major]
- **Location:** §4.3, §5 (V3, V7), §8 A2
- **Issue:** The two seeded classes are not equally LLM-hard, and the spec conflates them.
  *Overlap* (Lead vs Customer) and *outcome-coverage gaps* are already partially catchable
  **deterministically**: V7 flags high name/purpose similarity, V3 flags outcomes with no
  capability. But *"missing Procurement/Warranty"* is the genuinely hard case — there is no
  outcome in the narrative to map from, so V3 cannot see it; the model must *infer* an
  absent-but-expected capability from domain priors. Asking one unstructured reviewer pass to
  hit ≥90% recall on that inference class, reliably, run-over-run, is optimistic and will be
  the flakiest number in the acceptance set.
- **Recommended change:**
  1. Make division of labor explicit: **let deterministic validators own what they can**
     (V3 owns outcome-coverage gaps; V7 owns overlap *candidates*), and scope the LLM
     reviewer to the judgment-only classes: inferred-missing capabilities, boundary
     soundness, solution-language leakage (naming). This raises overall A2 by not betting the
     deterministic wins on the stochastic component.
  2. For the inference class, use **self-consistency at inference time**: run the reviewer
     k=5 at low temp, union the findings, keep those appearing in ≥⌈k/2⌉ runs. This
     measurably lifts recall while suppressing one-off false positives — at ~5× cost on one
     of two skill calls, acceptable for a single-user MVP (see F8).
  3. Feed the reviewer the deterministic findings as context ("V7 already flagged X as an
     overlap candidate") so the LLM adjudicates rather than re-discovers, reducing
     duplicate/conflicting findings (see F9).

### F5 — Determinism policy is under-specified for reproducibility across model versions [Minor]
- **Location:** §4 "Determinism policy," §11 R2
- **Issue:** "temperature low" plus schema validation reduces *format* variance but not
  *semantic* variance, and says nothing about the largest drift source: the underlying model
  snapshot changing under you. temperature=0 is not bit-reproducible across provider-side
  model updates, and §6.1 names "Claude (Opus/Sonnet)" without pinning a snapshot. Reruns
  months apart can silently diverge, invalidating stored reviews and eval baselines.
- **Recommended change:** (a) pin an explicit model snapshot id per skill, not a floating
  alias; (b) set an explicit numeric temperature (recommend 0–0.2) and pass a fixed `seed`
  where the provider supports it; (c) stamp every stored review (`.vbd/reviews/REV-*.json`)
  with `{ modelId, skillVersion, promptHash, schemaVersion, buildHash }` so any finding is
  reproducible and any drift is attributable. This also makes the `buildHash` staleness
  concept (§3.3) extend cleanly to "review is stale because the *model/prompt* changed," not
  only because the text changed.

### F6 — Skill versioning exists but has no model-upgrade eval gate [Minor]
- **Location:** §4 "Skills are versioned (`skillVersion`)… prompts stored in-repo"
- **Issue:** Storing prompts in-repo and versioning skills is good, but a skill's behavior is
  a function of `(prompt, model, schema)`, and only the prompt is version-controlled. A model
  upgrade is an unversioned behavior change with no gate — precisely how "it worked last
  quarter" regressions happen.
- **Recommended change:** define a skill identity as the triple `(promptHash, modelId,
  schemaVersion)` and make the F2/Q5 eval harness a **required CI gate**: bumping `modelId`
  or `promptHash` must re-run seeded-defect recall + inter-run stability and block the change
  if it drops below the F2 thresholds. This is the single highest-leverage guard against
  silent drift and costs little to wire once the harness exists.

### F7 — Repair-retry semantics and "empty but valid" outputs are unspecified [Minor]
- **Location:** §4 "on schema failure, one repair retry, then surface a soft error"
- **Issue:** Two under-specifications: (1) the repair strategy isn't defined — a naive
  regenerate wastes the retry; feeding the *validator error messages* back is far more
  effective. (2) Schema-valid but semantically-empty outputs (`findings: []`,
  `capabilities: []`) will pass validation yet may indicate a silent failure, and are
  indistinguishable from a legitimately clean result.
- **Recommended change:** specify the repair retry as *re-prompt with the concrete ajv
  validation errors appended*, not a blind regenerate. Add a lightweight sanity gate distinct
  from schema validation: e.g., CapabilityGenerator emitting zero capabilities from a
  non-empty narrative is a soft error, not a "clean" result; CapabilityReviewer's
  `verdict: clean` must be corroborated by the deterministic validators also being clean
  before the UI shows a green check.

### F8 — Loop cost/latency is fine for MVP but budget it explicitly [Minor]
- **Location:** §4 (all skills), §7 (flow), F4 self-consistency
- **Issue:** A single review cycle can fan out to NarrativeCoach + CapabilityGenerator +
  CapabilityReviewer, and the F4 recommendation multiplies the reviewer by k=5. That is
  entirely acceptable for a single-user, non-real-time MVP (§1.2 N3/N4), but the spec makes
  no cost/latency statement, so it's worth an explicit "we accept ~k× reviewer cost for the
  ≥90% target" note rather than discovering it later.
- **Recommended change:** add one line to §11 or §8 acknowledging the eval/inference cost of
  self-consistency, and cap it (k configurable, default 5; k=1 in interactive editing, k=5 on
  the acceptance/eval path). No architectural change needed.

### F9 — LLM reviewer and deterministic validators can emit duplicate/conflicting findings [Nit]
- **Location:** §4.3 `coverage.outcomesMissing` vs §5 V3; reviewer `overlap` vs V7
- **Issue:** `CapabilityReviewer.coverage.outcomesMissing` overlaps directly with V3, and
  reviewer `overlap` findings overlap with V7. Two sources can report the same issue with
  different wording/severity, cluttering the inbox and confusing the user about which to
  trust.
- **Recommended change:** make the validators authoritative for their classes and have the
  merge step (a) dedupe reviewer findings whose fingerprint (F3) matches a validator finding,
  and (b) prefer the deterministic finding's severity. Document the precedence in §5 or §7.4.

### F10 — NarrativeCoach "never invents facts" is not schema-enforceable [Nit]
- **Location:** §4.1
- **Issue:** "Never invents facts; flags assumptions" is a behavioral hope, not a
  constraint the schema can guarantee. Low actual risk here because output is advisory and
  human-gated, but the contract overstates enforceability.
- **Recommended change:** add an explicit `assumptions: string[]` field to the output schema
  and instruct the model to route any non-grounded claim there; reword the "Job" line from a
  guarantee to "surfaces assumptions explicitly in `assumptions[]`; grounded questions in
  `questions[]`." Keeps the human-in-the-loop framing honest.

---

## Answers to relevant §12 open questions

### Q4 — Persisting dismissed findings so re-review doesn't re-raise them
**Answer: content-fingerprint dismissal store, filtered deterministically post-review.** See
Appendix. In short: give every finding a stable fingerprint over structural fields (not
prose); persist dismissals in git-tracked `.vbd/reviews/dismissed.json`; subtract dismissed
fingerprints from each fresh review as a pure post-processing step; resurface a dismissal
only when the referenced capabilities materially change.

### Q5 — Minimum eval methodology for A1/A2 without a labeled gold dataset
**Answer: seeded-defect recall/precision (A2) + human-calibrated rubric LLM-judge (A1) +
inter-run Jaccard stability, all as a CI gate.** See Appendix. This needs one human-blessed
*reference* solar map (cheap to produce) rather than a large labeled dataset, and it turns
A1/A2 from aspirations into computable numbers.

*(Q1 TS-vs-Python, Q2 bounded-context derivation, and Q3 git-vs-DB are outside this lens and
deferred to the architecture review. One note relevant here: Q3 does bear on the eval harness
— storing eval runs and dismissal history as git-tracked JSON, as proposed in the Appendix,
is sufficient for the MVP and does not by itself justify a DB.)*

---

## Appendix — Dismissal Persistence (answers Q4)

**Store:** `.vbd/reviews/dismissed.json`, git-tracked (dismissals are a reviewable,
diffable decision — consistent with §3/§6 "every mutation is a commit").

```jsonc
{
  "version": "1",
  "dismissed": [
    {
      "fingerprint": "overlap:customer_management|lead_management:merge",
      "type": "overlap",
      "capabilities": ["customer_management", "lead_management"], // stored sorted
      "suggestionClass": "merge",        // normalized bucket, not the prose suggestion
      "reason": "Intentional: we track pre-sale and post-sale separately.",
      "dismissedBy": "stefan@sonntag-online.com",
      "dismissedAt": "2026-07-10T09:20:00Z",
      "capabilityHashes": {              // content hash of each referenced capability at dismissal
        "customer_management": "a1b2c3",
        "lead_management": "d4e5f6"
      }
    }
  ]
}
```

**Fingerprint function (stable, prose-free):**
`fingerprint = type + ":" + sort(capability_ids).join("|") + ":" + suggestionClass`
where `suggestionClass ∈ {merge, split, add, rename, rescope}` is a small closed enum the
`CapabilityReviewer` schema is extended to emit (add `suggestionClass` alongside the
free-text `suggestion`). The free-text `explanation`/`suggestion` is intentionally excluded
so that run-to-run rewordings collapse to the same fingerprint.

**Re-review flow (deterministic, no LLM memory):**
1. Run validators + CapabilityReviewer as normal → raw findings.
2. Compute each finding's fingerprint.
3. Drop any finding whose fingerprint is in `dismissed[]` **unless** the resurface rule fires.
4. **Resurface rule:** if any referenced capability's current content hash differs from the
   stored `capabilityHashes`, the context changed → re-raise as a *new* finding (and drop the
   stale dismissal), because a dismissal was a judgment about a specific model state.
5. Render surviving findings in the inbox; render dismissed ones in a collapsed, re-openable
   "Dismissed (N)" section for auditability.

This is entirely deterministic, git-diffable, requires no DB, and never trusts the model to
remember prior decisions.

---

## Appendix — Proposed Eval Methodology (answers Q5)

No labeled gold dataset required — only **one human-blessed reference solar capability map**
(the domain expert from A1 signs off once) and a small set of programmatic defect injectors.

**1. A2 — seeded-defect recall/precision (the primary, gold-free A2 instrument).**
   Starting from the reference map, programmatically inject known defects, each with an
   expected finding:
   - *overlap:* merge two distinct capabilities into one under a Lead/Customer-style name.
   - *gap (inference):* delete Procurement / Warranty entirely.
   - *naming:* rename a capability into solution-language ("PostgresLeadTable").
   - *boundary:* move an outcome to the wrong capability.

   Run `CapabilityReviewer` (k=5, low temp, self-consistency union per F4) over each seeded
   variant. Compute:
   - **Recall** = injected defects caught / injected defects. → operationalizes **A2**;
     target ≥0.90.
   - **Precision** = raised findings matching an injected defect / total raised findings.
     → guards against over-flagging; target ≥0.70.
   Report per-defect-class recall so the weak class (inferred gaps, per F4) is visible.

**2. A1 — rubric-based LLM-judge, human-calibrated.**
   Define a fixed rubric scored 0–3 per criterion:
   (a) coverage of narrative Core Activities, (b) no solution-language leakage,
   (c) sane granularity (no mega- or micro-capabilities), (d) provenance present and
   resolvable (ties to F1/V8). A separate `MapJudge` skill scores each generated map against
   the rubric. **Calibrate** by having the A1 domain expert hand-score ~10 maps once; accept
   the judge only if its agreement with the human is high (e.g., Spearman ≥0.7 / within ±1 on
   ≥80% of criteria). Thereafter the judge tracks regressions between runs; the human sign-off
   remains the actual A1 gate, the judge is the cheap continuous proxy.

**3. Determinism — inter-run stability (guards R2/F5).**
   Run `CapabilityGenerator` k=5 on the reference narrative; compute mean pairwise **Jaccard
   similarity of capability id sets** and outcome-coverage stability. Flag if mean Jaccard
   < 0.80 → the skill/prompt is too unstable to ship. Do the same for reviewer `verdict`
   agreement. This turns "LLM non-determinism" (R2) from a hand-wave into a measured, gated
   number.

**4. CI gate (ties to F6).**
   Bundle (1)–(3) as the M5 acceptance harness and run it on every `promptHash`/`modelId`
   change. Block the change if recall, precision, or Jaccard fall below threshold. This is
   what makes A1/A2 durable across the model upgrades that will happen over the project's
   life.

Cost note (F8): the harness is the main token consumer (k×variants×skills); it runs in CI /
on demand, not in the interactive edit loop, so per-edit latency is unaffected.
