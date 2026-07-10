---
id: PLAN-001
title: MVP Execution Plan (M0–M5)
type: plan
status: Approved
version: 0.4.0
author: Claude (Opus 4.8)
created: 2026-07-10
updated: 2026-07-10
supersedes: null
related: [SPEC-001, ADR-001, ADR-002, ADR-003, ADR-004, REV-006]
reviewers: [delivery-execution]
---

# PLAN-001 — MVP Execution Plan (M0–M5)

Realizes [SPEC-001](../specs/SPEC-001-mvp-narrative-capability-loop.md) (Approved, v0.2.0)
under the decisions in [ADR-001](../adr/ADR-001-typescript-end-to-end.md) (TS end-to-end) and
[ADR-002](../adr/ADR-002-storage-and-source-of-truth.md) (git truth + derived cache + SQLite
history).

## 1. Objective & definition of success
Ship the Narrative → Capability Map → Review loop on the solar reference domain, and reach a
defensible **go/no-go** on proceeding to the domain-model layer (SPEC-002). Success = SPEC-001
§8 criteria A1–A3 + A6 pass on solar (A4 smoke-tested, A5 green).

## 2. Repository layout (target)
Monorepo, npm workspaces (ADR-001):
```
/ (repo root)
├── docs/                      # governed by CONVENTIONS.md
├── package.json               # workspaces root
├── tsconfig.base.json
├── packages/
│   ├── ir/                    # @vbd/ir — IR types (SPEC-001 §3.4) + origin tagging
│   ├── schema/                # @vbd/schema — JSON Schemas (capability, narrative, ir)
│   ├── compiler/              # @vbd/compiler — authored text → IR
│   ├── validation/            # @vbd/validation — validators V1–V8 (pure fns over IR)
│   ├── skills/                # @vbd/skills — LLM skill contracts + prompts (later milestones)
│   ├── store/                 # @vbd/store — git + .vbd cache + buildHash (ADR-002)
│   └── eval/                  # @vbd/eval — seeded-defect corpus + harness (§8)
├── apps/
│   ├── service/               # API (compile, validate, review, store)
│   └── web/                   # SPA (narrative editor, capability map, review inbox)
└── workspaces/                # user data workspaces (runtime; gitignored sample under fixtures/)
```

## 3. Milestones (scope • deliverables • definition of done)

### M0 — Foundation *(no LLM, no UI)* — **DELIVERED**
- **Scope:** scaffold monorepo; `@vbd/ir` types + origin tagging; `@vbd/schema` capability
  schema; `@vbd/compiler` skeleton (capabilities → IR with authored/derived tagging +
  buildHash); `@vbd/validation` V1 (required fields) + V2 (unique/stable ids); tests.
- **Full-IR-type-at-M0 (REV-006 F4):** the `@vbd/ir` type MUST define **all** node/edge
  variants (capability, actor, outcome, domain_object, bounded_context; produces/consumes/
  depends_on/owns/serves/groups) **and** the deterministic `IREdge.id` rule now, even though
  M0 only exercises the capability path — so the "frozen" IR does not mutate in M2/M3.
- **Seed the eval corpus now (REV-006 F1):** create `@vbd/eval` with the first hand-authored
  solar narratives carrying *known* seeded defects (missing Procurement, Lead/Customer overlap,
  uncovered outcome). Pure data — no LLM — so it exists *before* it must measure M2/M3.
- **DoD:** `npm test` green; compiling the solar `capabilities` fixture yields a valid IR;
  V1/V2 catch seeded violations; buildHash stable across recompiles of unchanged input; IR type
  includes all variants; eval corpus has ≥3 named seeded-defect cases.
- **Exit:** IR contract frozen for downstream packages.
- **Status:** ✅ **COMPLETE.** scaffold + IR + compiler + V1/V2; `@vbd/eval` seed corpus (4
  M0-scoreable cases + 2 pending V3/V7 cases) with a recall/precision scorer; `@vbd/store`
  buildHash-on-load cache (miss/hit/invalidation/corruption). All green, Node-native TS, zero deps.

### M1 — Narrative authoring
- **Scope:** narrative template + sectioned parser (`narrative.md` → `narrative.json`,
  heading-path + content-hash anchors, SPEC-001 §3.1); web narrative editor (sectioned, not
  raw markdown-only).
- **DoD:** authoring the solar narrative produces a validated `narrative.json`; anchors are
  stable and referenceable.
- **Status:** ✅ **COMPLETE (engine + UI shell).** `@vbd/narrative` parses the solar narrative
  into an anchored `NarrativeDoc` (hyphenated section anchors + per-section content hashes),
  extracts outcomes/activities/customers, emits `narrative.json`, validates completeness
  (NV1–NV4); 9 tests green. **`apps/web`** (React + Vite + @xyflow/react + i18next, per
  [ADR-003](../adr/ADR-003-frontend-stack.md)) is live: a bilingual DE/EN editor that live-parses
  the narrative, shows sections/anchors/findings, and renders the Capability Map — all computing
  **client-side** over the pure `@vbd/*` packages (made isomorphic; SHA-256 no longer needs
  node:crypto). Build passes (203 modules); verified in-browser (clean model → no findings;
  broken narrative → NV1/NV2 surface live). **Remaining M1 polish (→ M4):** replace the raw
  textarea with the structured **form** editor (REV-004 F1) and the `apps/service` API.

### M2 — Capability generation + map  *(first LLM; design-partner gate applies — see §5)*
- **Scope:** `CapabilityGenerator` skill (schema-constrained, provenance `derivedFrom`);
  compile to IR; Capability Map render (React Flow + dagre/elk auto-layout, positions not
  persisted); node detail panel with source-section link.
- **Minimal eval harness in-milestone (REV-006 F2):** wire the M0 seed corpus to a recall/
  precision runner *within M2* so generation quality is measured, not eyeballed (folds D2 into
  scope, not just a risk note).
- **DoD:** solar narrative → capability map a domain reviewer calls "substantially correct"
  (pre-A1); every LLM capability carries valid provenance (V8 passes); the minimal harness runs
  against the seed corpus and reports a number.
- **Status:** 🟢 **pipeline delivered — mock AND real LLM.** [ADR-004](../adr/ADR-004-llm-provider-and-skill-runtime.md)
  + `@vbd/skills`: provider-agnostic `LlmProvider`, `CapabilityGenerator` (schema coercion + one
  repair retry), `MockProvider` (deterministic, offline). **`apps/service`** (new): server-side API
  using the **official `@anthropic-ai/sdk`**, key from `VBD_ANTHROPIC_API_KEY` (never in the
  browser, REV-005), **structured outputs** to lock the JSON shape; `GET /api/models`,
  `POST /api/generate`. **`apps/web`**: live mock by default + a **model/effort selector**
  (default **Sonnet 5 / medium**) and a **"Generate with LLM"** button. **Verified end-to-end with
  a live Sonnet 5 call**: clean output (`repaired:false`, 0 findings), and the model's own grouping
  (merged Sales+Offer) — real judgment, not the mock's keyword mechanics. **Remaining to CLOSE M2:**
  **G-DP design partner** to judge A1 correctness at scale; node detail panel + elkjs layout; wire
  `@vbd/eval` generation-coverage scoring; attach LLM-output provenance (V8, M3).

### M3 — Validation + review loop
- **Scope:** validators V3–V8; `CapabilityReviewer` (scoped to judgment; self-consistency k;
  evidence anchors); review inbox; content-addressed finding identity (SPEC-001 §4.4).
- **DoD:** validators own coverage/overlap (V3/V7); review surfaces seeded classic issues;
  findings have stable ids.

### M4 — Human-in-the-loop editing + persistence
- **Scope:** structured-form editing (no raw YAML for users) with write-back to authored text;
  Apply (mandatory diff) / Edit / Dismiss verbs; `annotations.yaml` + resurface-on-change;
  attributable git commits (human vs skill@version); workspace status rail.
- **DoD:** a user can accept/edit/dismiss findings; dismissals persist and resurface correctly;
  every model change is an attributable commit; no silent mutation.

### M5 — Solar walkthrough + evaluation + go/no-go
- **Scope:** grow `@vbd/eval` (seeded from M0) into the full harness — recall/precision, rubric
  judge, inter-run Jaccard, injection case; **build the minimal second-domain preset that A4
  requires (REV-006 F3)** (a second narrative + domain config, no new code); A6 moderated
  actionability session with a **real unaided target user** (not the proxy expert; REV-006 F5);
  go/no-go readout.
- **DoD:** A1–A3, A5, A6 measured and passing on solar; A4 demonstrated on the built
  second-domain preset (config/prompt/data only, no code change); decision recorded as an ADR
  (proceed to SPEC-002 or iterate).

## 4. Sequencing & dependencies
- M0 → everything (IR is the contract).
- M1 ∥ (start of M2 skill prompt design) — narrative shape must settle before generation.
- M2 → M3 (review needs capabilities) → M4 (editing needs findings) → M5 (eval needs the loop).
- Cross-cutting from M0: security posture (§6.2 of SPEC-001) — input delimiting, output
  escaping, `externalLLM` opt-out land with the first LLM call (M2), not retrofitted.

## 5. Gates (must pass to proceed)
- **G-DP (design partner) — before M2 starts.** A named solar design partner is secured to
  validate capability correctness (A1). A credible **proxy domain expert is an acceptable
  fallback for A1 only**; **A6 (actionability) additionally requires a real unaided target
  user** — the proxy does not satisfy A6 (REV-006 F5). Execution gate; M0/M1 may proceed
  without it, M2+ may not close without it. Owner: product.
- **G-EVAL (model-upgrade gate) — whenever the model snapshot changes.** The eval harness must
  pass before adopting a new LLM snapshot (SPEC-001 §4.4, REV-003 F6). Enforceable only once the
  harness exists — the M0 seed corpus + M2 minimal harness bring it forward so this gate is live
  from the first model call (REV-006 minor).
- **G-GO (go/no-go) — end of M5.** Proceed to SPEC-002 only if A1–A3 + A6 pass.

## 6. Workstreams (parallelizable)
- **Core/compiler** (M0, M3 validators): IR, compiler, validators — pure TS, high test coverage.
- **LLM/skills** (M2, M3, M5): skill contracts, prompts, self-consistency, eval harness.
- **Web/UX** (M1, M2, M4): editor, map, review inbox, forms, onboarding, glossary.
- **Store/infra** (M0, M4): git integration, `.vbd` cache, buildHash, SQLite history, commits.

## 7. Risks (delivery-specific; model risks in SPEC-001 §11)
- **D1. IR churn destabilizes downstream.** Mitigate: freeze IR at M0 exit; version it; changes
  go through a typed migration.
- **D2. LLM work (M2/M3) blocks on prompt quality.** Mitigate: build the eval harness (M5 scope)
  *early enough* to measure M2/M3 instead of eyeballing — pull a minimal harness into M2.
- **D3. Design partner slips → A1/A6 unverifiable.** Mitigate: G-DP gate; a proxy expert as
  fallback; M0/M1 de-risked to run in parallel while partner is sourced.
- **D4. Scope creep into domain-model/codegen.** Mitigate: SPEC-001 non-goals are the fence;
  anything beyond is a new spec.
- **D5. Env/dependency drift.** Mitigate: pin Node ≥ 20, lockfile committed, CI runs `npm test`.

## 8. Acceptance traceability (SPEC-001 §8 → milestones; REV-006 minor)

| Criterion | Built in | Measured in | Instrument |
|---|---|---|---|
| A1 map substantially correct | M2 | M5 | rubric judge + design-partner spot-check |
| A2 review catches seeded issues | M3 (validators) | M2 (min. harness) → M5 | seed corpus recall/precision |
| A3 no text↔graph drift | M4 | M4 (built) + M5 (regression) | buildHash/dirty unit tests |
| A4 second-domain smoke test | M5 (preset built) | M5 | switch preset, no code change |
| A5 validators unit-tested | M0/M3 | continuous CI | `npm test` |
| A6 actionability | M4 (loop) | M5 | moderated session, real unaided user |

**CI (REV-006 minor):** deterministic packages (`ir`, `compiler`, `validation`, `eval`
scoring) run in CI on every push; LLM-dependent tests run behind a flag / on a schedule with a
pinned model snapshot to keep CI hermetic. `NarrativeCoach` is an **optional** M1/M2 assist,
explicitly not on the critical path.

## 9. Tracking
Each milestone becomes a checklist in this file (or issues) with DoD as acceptance. Status here
moves per CONVENTIONS.md; a milestone is done only when its DoD is demonstrably met.

## 10. Review & closure

Reviewed by the delivery-execution lens ([REV-006](../reviews/REV-006-delivery-execution-plan-001.md),
**Approve-with-changes**, no Blockers). Disposition of the 5 Majors:

| Finding | Disposition | Where addressed |
|---|---|---|
| F1 seed corpus scoped too late (M5) to measure M2/M3 | **Fixed** | M0 scope (seed `@vbd/eval` now), §8 |
| F2 D2 mitigation not scheduled into M2 | **Fixed** | M2 minimal-harness DoD |
| F3 A4 needs a second-domain preset no milestone builds | **Fixed** | M5 scope builds the preset |
| F4 IR-freeze illusory unless full type defined at M0 | **Fixed** | M0 "Full-IR-type-at-M0" (all variants + edge-id rule; already in `@vbd/ir`) |
| F5 proxy fallback covers A1 not A6 | **Fixed** | G-DP split: proxy→A1 only, real user required for A6 |

Minors/Nits (F6–F13: CI strategy, traceability matrix, A3 measurement timing, `@vbd/store` in
M0, G-EVAL enforceability, M4 load, named golden fixture, NarrativeCoach) — **addressed** in §8
+ M0 status note, or **accepted** as milestone-ticket detail.

**Status:** all Majors Fixed, no Blockers, minors addressed/accepted → per CONV-001 §4,
**PLAN-001 is `Approved`**. M0 is delivered and green; M1 is next.
