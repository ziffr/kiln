---
id: REV-006
title: Delivery/Execution review of PLAN-001 (MVP Execution Plan)
type: review
status: Approved
version: 1.0.0
author: "Reviewer (delivery-execution)"
created: 2026-07-10
updated: 2026-07-10
reviews: PLAN-001
lens: delivery-execution
verdict: Approve-with-changes
related: [PLAN-001, SPEC-001]
---

# REV-006 — Delivery/Execution review of PLAN-001

## Summary

PLAN-001 is a competent, well-traced execution plan. The critical path (M0 IR → M2 generation →
M3 review → M4 editing → M5 eval/go-no-go) is sound, the gates (G-DP, G-EVAL, G-GO) are the right
three, and the workstream/risk sections show real delivery thinking (IR freeze, env pinning,
design-partner fallback). It correctly keeps LLM work behind a design-partner gate and lands
security cross-cuttingly with the first LLM call rather than retrofitting it.

The plan is **not ready to gate work as written**, however, because its **measurement
instrument — the seeded-defect corpus and eval harness — is scoped in M5, but M2 and M3 both
have DoDs that depend on it.** As sequenced, M2 and M3 cannot verify their own definitions of
done. Related gaps: A4 has no enabling work in any milestone, the M0 IR "freeze" is illusory as
scoped, and the design-partner fallback is credible for correctness (A1) but not for the A6
actionability signal it is meant to secure. All are fixable by resequencing/scoping — hence
**Approve-with-changes**, not Reject.

## Findings

### F1 — Eval measurement instrument is scoped after the milestones it must gate
- **Severity:** Major
- **Location:** §3 M2 DoD, M3 DoD, M5 Scope; §7 D2
- **Issue:** The seeded-defect corpus is the instrument for M2 DoD ("solar narrative → map a
  reviewer calls substantially correct"), M3 DoD ("review surfaces seeded classic issues"), and
  acceptance A2 (≥90% recall on the seeded set). It is scoped only in **M5**. As sequenced, M2
  and M3 have no way to *measure* their DoD when they are supposed to close — the DoD reduces to
  eyeballing, which is precisely the failure D2 warns against. The corpus is pure hand-authored
  data (narratives + known injected defects); it has no LLM/UI dependency and nothing forces it
  to wait for M5.
- **Recommendation:** Move seeded-defect **corpus creation into M0/M1** (it can be built the
  moment the narrative and capability shapes exist). Keep the *scoring harness* wherever it lands,
  but the corpus itself must precede M2/M3 so their DoDs are measurable. Rewrite M2/M3 DoD to cite
  measured recall/precision against the corpus, not subjective "surfaces issues."

### F2 — D2's "minimal harness into M2" mitigation is not actually scheduled
- **Severity:** Major
- **Location:** §7 D2; §3 M2 Scope/DoD
- **Issue:** D2 correctly identifies that the eval harness must arrive "early enough to measure
  M2/M3 instead of eyeballing" and says to "pull a minimal harness into M2." But that mitigation
  lives only in the risk note — **M2's Scope and DoD do not mention it.** A mitigation that is not
  reflected in a milestone's scope/DoD will not be built; it is aspirational.
- **Recommendation:** Add the minimal harness (seeded-defect recall against the F1 corpus) to
  **M2 Scope and DoD** explicitly, e.g. "DoD: CapabilityGenerator output scores ≥X recall on the
  minimal seeded corpus." Promote it from risk-mitigation prose to a milestone deliverable.

### F3 — A4 (second-domain smoke test) has a DoD home but no enabling work
- **Severity:** Major
- **Location:** §1 Objective; §3 M5 Scope/DoD; SPEC-001 A4
- **Issue:** A4 requires demonstrating that "switching domain preset needs no code change
  (data/prompt/config only)." M5 DoD says "A4 smoke-tested," but **no milestone scopes building a
  second-domain preset/fixture.** You cannot smoke-test a domain switch with only one domain in
  the repo. The enabling artifact (a second narrative + capability preset/config) is absent from
  M0–M5 scope.
- **Recommendation:** Add a small deliverable — a second-domain preset (narrative + config, no
  code) — to **M5 Scope** (or a late M4 spike), so A4 has something to switch *to*. Alternatively,
  if A4 is intended as a code-audit assertion ("no code path is domain-specific") rather than a
  live switch, say so explicitly and define how it is verified.

### F4 — IR-freeze-at-M0 is illusory as scoped
- **Severity:** Major
- **Location:** §3 M0 Scope/Exit; §7 D1; SPEC-001 §3.4, §13.1
- **Issue:** M0 exit claims "IR contract frozen enough for downstream packages to import," but M0
  scope only builds the **capability** schema and the capability path. The IR type (SPEC §3.4)
  also carries `domain_object` and `bounded_context` node types and `owns`/`serves`/`groups`
  edges that are not exercised until M2/M3, **and SPEC §13.1 explicitly left `IREdge.id`
  determinism and canonical edge ordering unspecified as "M-phase detail."** If those are resolved
  during M2/M3, they are changes to a type frozen at M0 — the freeze is nominal. D1's "typed
  migration" mitigates *authored-schema* churn, not churn in the IR type surface itself.
- **Recommendation:** In M0, **define the full IR type surface** — every `NodeType`/`EdgeType`
  variant plus the `IREdge.id` construction rule and canonical node/edge ordering — even though
  only the capability path is populated. Downstream milestones then *populate* the type rather than
  *alter* it. Make "full IR type + edge-id determinism rule defined" an explicit M0 DoD line.

### F5 — Design-partner fallback is credible for A1 but not for A6
- **Severity:** Major
- **Location:** §5 G-DP; §7 D3; SPEC-001 A6, R7
- **Issue:** G-DP's fallback is "a credible proxy domain expert." A proxy expert can validate
  capability **correctness** (A1). But A6 is an *actionability* value signal — "an **unaided target
  user** rates ≥N findings worth acting on in a moderated session." A domain expert who helped
  shape the model is neither unaided nor necessarily the target user persona (SPEC §0: solution/ops
  lead or founder). The fallback therefore does not credibly cover A6, which is one of the four
  go/no-go criteria G-GO enforces. The plan presents the fallback as de-risking both.
- **Recommendation:** Split the fallback: a proxy expert may substitute for A1 correctness
  validation, but **A6 requires a real, unaided target user** (even if not the named design
  partner). State that G-GO's A6 pass cannot be met by a proxy expert, and give A6 its own
  sourcing line in G-DP.

### F6 — No CI strategy for LLM-dependent tests (M2+)
- **Severity:** Minor
- **Location:** §7 D5; §3 M2–M5
- **Issue:** D5's CI story (`Node ≥ 20`, lockfile, `CI runs npm test`) is realistic and sufficient
  for the pure-TS M0/M1 packages. From M2 onward the suite includes skill tests that call an LLM —
  non-deterministic, rate-limited, and costly. "`npm test` green" is not a credible CI gate for
  those without a recorded-fixture / mocked-response (VCR-style) strategy and a pinned snapshot.
- **Recommendation:** Add to D5 (or M2 scope): LLM skill tests run against **recorded fixtures**
  in CI with the live-call path opt-in; deterministic validator/compiler tests remain the always-on
  gate. Note the pinned model snapshot as a CI input.

### F7 — No explicit A1–A6 → milestone traceability matrix
- **Severity:** Minor
- **Location:** §3, §8 (absent)
- **Issue:** Every acceptance criterion *can* be traced, but only by inference across prose. A5 is
  split M0(V1–V2)/M3(V3–V8); A3's mechanism spans M0(buildHash)/M4(write-back) but is verified only
  at M5; A2 depends on the F1 corpus. For an auditable go/no-go this mapping should be explicit.
- **Recommendation:** Add a short A1–A6 × milestone table (which milestone *builds* the capability,
  which *verifies* it) so gating is auditable rather than inferred.

### F8 — A3 verification deferred to M5 though its mechanism lands in M4
- **Severity:** Minor
- **Location:** §3 M4 DoD, M5 DoD; SPEC-001 A3
- **Issue:** A3 (no text↔graph drift: edit→recompile deterministic, buildHash/dirty enforced,
  unit-tested) is realized by M4's write-back + recompile, but the plan only "measures A3" at M5.
  Deferring the drift unit tests past the milestone that introduces the drift surface risks late
  discovery.
- **Recommendation:** Put A3's determinism unit tests in **M4 DoD** (edit→write-back→recompile is
  hash-stable; dirty flag toggles correctly). M5 then only confirms, not builds, A3.

### F9 — @vbd/store missing from M0 scope though buildHash is an M0 DoD
- **Severity:** Minor
- **Location:** §3 M0 Scope/DoD; §6 workstreams
- **Issue:** M0 DoD requires "buildHash stable across recompiles," and buildHash =
  hash(authored files ⊕ compilerVersion ⊕ schemaVersion) — reading authored files and managing the
  `.vbd/` cache is `@vbd/store` territory (ADR-002). §6 lists Store/infra in "(M0, M4)," but M0's
  scope bullet omits `@vbd/store` entirely. The scope and DoD disagree.
- **Recommendation:** Add a minimal `@vbd/store` (authored-file read + buildHash + `.vbd/` cache
  verify) to **M0 scope**, matching the DoD and the §6 workstream assignment.

### F10 — G-EVAL is unenforceable until the harness exists
- **Severity:** Minor
- **Location:** §5 G-EVAL; §7 D2
- **Issue:** G-EVAL ("eval harness must pass before adopting a new model snapshot") cannot fire
  during M2–M4 development if the harness only lands in M5. Any snapshot change before M5 has no
  gate.
- **Recommendation:** Tie G-EVAL's enforceability to the **minimal M2 harness** (F2). State that
  before that harness exists, snapshot pinning is frozen (no upgrades) rather than gated.

### F11 — M4 is overloaded
- **Severity:** Minor
- **Location:** §3 M4 Scope
- **Issue:** M4 bundles structured-form editing, text write-back/transpile, Apply/Edit/Dismiss
  verbs + mandatory diff, `annotations.yaml` + resurface-on-change, attributable git commits, and
  the status rail — spanning both Web/UX and Store/infra workstreams. This is the heaviest,
  highest-integration-risk milestone and a single DoD makes partial completion hard to gate.
- **Recommendation:** Consider splitting M4 into store-side (write-back, attributable commits,
  annotations/resurface) and UX-side (forms, Apply/Edit/Dismiss, status rail), or at minimum give
  each a separately checkable DoD line so progress is gateable.

### F12 — M0 solar capabilities.yaml fixture is a hand-authored golden, not named as such
- **Severity:** Nit
- **Location:** §3 M0 Scope/DoD
- **Issue:** M0 compiles "the solar `capabilities.yaml` fixture," but `capabilities.yaml` is
  normally LLM-seeded (M2). At M0 this must be a hand-authored golden fixture. Fine, but unnamed —
  and it is also the natural seed for the F1 seeded-defect corpus.
- **Recommendation:** Call it a hand-authored **golden fixture** and note it feeds the seeded-defect
  corpus, so the two efforts are not duplicated.

### F13 — NarrativeCoach silently absent from all milestones
- **Severity:** Nit
- **Location:** §3 (absent); SPEC-001 §4.1
- **Issue:** SPEC §4.1 NarrativeCoach (optional interactive skill) appears in no milestone. It is
  optional, so omission may be intentional — but it carries prompt-injection surface and the plan
  should not silently drop a spec'd skill.
- **Recommendation:** Add one line stating NarrativeCoach is **deferred/out of the M0–M5 plan** (or
  scope it to M1). Make the decision explicit.

## Disposition guidance

Blockers to progress as an execution plan: none absolute, but **F1 and F2 should be resolved
before M2 is allowed to start**, since M2/M3 are otherwise ungateable. F3 and F4 should be
resolved before their respective milestones (M5, M0). F5 should be reflected in G-DP/G-GO wording
before G-DP is declared passed.
