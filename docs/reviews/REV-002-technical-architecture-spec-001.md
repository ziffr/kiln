---
id: REV-002
title: Technical Architecture Review of SPEC-001
type: review
status: Approved
version: 1.0.0
author: "Reviewer (technical-architecture)"
created: 2026-07-10
updated: 2026-07-10
supersedes: null
reviews: SPEC-001
lens: technical-architecture
verdict: Approve-with-changes
related: [SPEC-001]
---

# REV-002 — Technical Architecture Review of SPEC-001

## Summary

SPEC-001 is architecturally sound in its central bet: a typed **IR graph as the spine**,
with pure/deterministic compile and validation stages sitting between LLM proposal and
human decision. The "text is truth, graph is projection" invariant is the right one, the
module decomposition (model store / compiler / validation / LLM orchestration / client)
is clean and will carry the later domain-model and codegen layers with little rework, and
the decision to keep validators as pure functions over the IR is exactly the credibility
layer the product needs.

The spec is **strong on the read path** (text → IR → views/validators) and
**under-specified on the write path** (canvas edit → text). The load-bearing invariant of
the whole product — that the graph is never authoritative — is *asserted* (R3, §6) but the
mechanism to enforce it is not defined for the majority of node/edge types the IR admits,
and the "derived artifact" story (`.vbd/*.json`) is explicitly left undecided ("gitignored
-or-tracked"). Those two gaps are the difference between an enforceable invariant and an
aspirational one. Neither is a design dead-end; both need one more paragraph of decision
before M4. Hence: **Approve-with-changes**.

Findings below are ordered by severity. §12 open questions Q1 and Q3 are answered inline
(F2, F9) and Q2/Q4 are addressed in the Minor notes.

---

## Findings

### F1 — Write-back is unspecified for derived / non-authored nodes and edges
- **Severity:** Blocker
- **Location:** §3.3 (IR types), §6 (client "edits write back to text artifacts"), R3
- **Issue:** The IR admits `NodeType ∈ {capability, actor, outcome, domain_object}` and
  `EdgeType ∈ {produces, consumes, depends_on, owns, serves}`, and §6 states the canvas is
  editable and "edits write back to text artifacts, which trigger recompile." But only
  `capability` has an authored text home (`capabilities.yaml`). `actor`, `outcome`, and
  `domain_object` nodes exist only as *inline lists inside* a capability; `owns`/`serves`
  edges and `bounded contexts` are "derived, not authored" (§2). There is no defined
  answer to: what happens when a user edits/moves/deletes a derived node on the canvas?
  Which text file, and which capability's field, receives the write? If a node has no text
  source it *cannot* be written back — which means the canvas would silently become
  authoritative for it, directly violating the invariant the spec is built on (R3). As
  written, the central claim "graph is a projection, never the truth" is not enforceable
  because the round-trip is only defined for one of four node types.
- **Recommended change:** Make editability a typed property of the IR, not a blanket canvas
  affordance. Explicitly classify each node/edge type as **authored** (has a text home;
  editable on canvas; edit is transpiled to a specific YAML field) or **derived**
  (read-only on canvas; no write-back). In the MVP that means: `capability` nodes and
  `depends_on`/`produces`/`consumes` edges are authored and round-trippable; `actor`/
  `outcome`/`domain_object` nodes and `owns`/`serves` edges and bounded-context groupings
  are derived and rendered read-only. Add one subsection ("§3.4 Editability & write-back
  contract") stating, per type, the exact text target of an edit and that derived elements
  raise a UI affordance directing the edit to its authoring source instead.

### F2 — Node/edge **layout** has no home consistent with "text is truth" (React Flow)
- **Severity:** Major
- **Location:** §6.1 (React Flow), §3.3, R3
- **Issue:** React Flow needs an (x,y) per node. Positions are neither business truth (they
  must not pollute `capabilities.yaml` or the model would carry UI state) nor derivable
  from the current IR (nothing in the IR implies coordinates). This is the classic
  projection trap: a third category of state that is neither source nor pure derivation. The
  spec does not say where positions live, which forces implementers into exactly the
  drift-prone choice R3 warns against (persisting canvas state as a side truth) or into
  jumpy re-randomized layouts on every recompile.
- **Recommended change:** Adopt a **deterministic auto-layout** (elk or dagre) computed as
  a pure function of the IR, seeded by node id, run inside the compiler/projection step.
  Then layout is a projection like everything else — no positions are persisted, and the
  invariant holds by construction. If manual nudging is wanted later, store overrides in a
  clearly-marked derived UI file under `.vbd/` (cache, never committed as truth), keyed by
  node id, and treat missing/oversized overrides as "fall back to auto-layout." State this
  in §6.1 and add elk/dagre to the stack list.

### F3 — Derived artifacts are "gitignored-or-tracked" — undecided, and this is the truth model
- **Severity:** Major
- **Location:** §3 (`.vbd/narrative.json`, `ir.json`, `reviews/REV-*.json` "derived,
  gitignored-or-tracked"), §12 Q3
- **Issue:** Whether `.vbd/` is committed is not a formatting detail — it decides whether the
  system has one source of truth or two. If `ir.json`/`narrative.json` are committed and
  ever read as input (rather than rebuilt), they become a second, staleable truth and the
  whole "text is truth" model erodes. The spec leaves this open.
- **Recommended change:** State the rule explicitly: **`.vbd/` is a rebuildable cache and is
  git-ignored; it is never an input to the compiler.** `narrative.json` and `ir.json` are
  always recomputable from `narrative.md` + `capabilities.yaml`. This also gives you a free
  schema-evolution story (see F6): when IR types change, delete cache and recompile — there
  is nothing to migrate because derived artifacts are never authoritative. The one
  exception — stored review outputs and dismissals — is *not* pure-derived and must live in
  git-tracked text (see F7); pull those out of `.vbd/` conceptually.

### F4 — `buildHash` semantics under-specified; can produce false "fresh" and false "stale"
- **Severity:** Major
- **Location:** §3.3 (`buildHash`), §8 A3, R3
- **Issue:** `buildHash` is described only as "hash of source artifacts." Two failure modes
  follow: (1) If the hash covers only the text inputs but not the **compiler version** and
  **IR/capability schema version**, then a compiler or schema change yields a different IR
  from identical text while `buildHash` is unchanged → UI reports "fresh" over a stale
  graph. (2) The invariant R3 actually needs to guard is the *reverse* direction — the user
  edited the canvas but the transpile-to-text step hasn't run/committed yet. A hash over
  *source artifacts* does not detect pending, un-transpiled canvas state. So `buildHash` as
  described neither fully catches compiler drift nor the canvas-ahead-of-text case it is
  cited to mitigate.
- **Recommended change:** Define `buildHash = hash(narrative.md, capabilities.yaml,
  compilerVersion, irSchemaVersion)`. Store it in the (cached) `ir.json` and in every stored
  review (F7). Add a separate, cheap **"dirty" flag** for the canvas-ahead-of-text case:
  canvas edits set a pending state until transpile+recompile completes; the map shows
  "unsaved canvas edits" distinct from "graph stale vs text." Update §3.3 and A3 to
  distinguish the two conditions.

### F5 — Provenance by line number (`sourceRefs.line`) is brittle and hard to produce
- **Severity:** Major
- **Location:** §3.3 (`sourceRefs: node id → {file, line?}`), §4.2 (`meta.derivedFrom`), §7.5
- **Issue:** Two problems. (a) Line numbers shift on any edit to `narrative.md`, so provenance
  is stale between edit and recompile, and any UI that deep-links "source line in narrative"
  (§7.5) will point at the wrong line. (b) The generation path can't reliably *produce* line
  numbers: `CapabilityGenerator` consumes `narrative.json` and emits capabilities — an LLM
  does not emit trustworthy source line numbers, and nothing in the pipeline maps a derived
  capability back to a narrative line deterministically.
- **Recommended change:** Anchor provenance to **stable structural anchors**, not lines:
  narrative section id / heading slug plus (optionally) a normalized content hash of the
  cited sentence, produced by the deterministic narrative parser — not by the LLM. Have
  `CapabilityGenerator` cite the *section* (e.g. `core_activities[2]`) in `meta.derivedFrom`;
  the compiler resolves that to a current location at render time. Keep `line` only as a
  best-effort convenience recomputed on compile, never as the stored key.

### F6 — No schema-evolution / migration story for `capabilities.yaml` and IR
- **Severity:** Major
- **Location:** §3.2 (`version: "0.1"`), §3.3 (`IR.version`), §4 (`skillVersion`)
- **Issue:** Both the authored `capabilities.yaml` and the IR carry a `version`, but there is
  no statement of what happens when those schemas change under an existing workspace.
  `capabilities.yaml` is authored truth, so unlike the IR it *cannot* just be recompiled
  away — an added required field or renamed key needs an actual migration. The spec has no
  migration mechanism, no forward/back-compat policy, and no test hook for it.
- **Recommended change:** For the IR: rely on F3 (derived cache → recompile, no migration).
  For the authored `capabilities.yaml`: declare a compatibility policy — the compiler
  validates `capabilities.version` against a supported range and, on a known-older version,
  runs a named, ordered, unit-tested **migration function** (`0.1 → 0.2 → …`) that rewrites
  the YAML in place (a git commit, so it's diffable and reversible). Add a validator that
  refuses to compile an unknown/newer schema version rather than silently mis-parsing. One
  short "§3.5 Versioning & migration" subsection covers this.

### F7 — Finding identity & dismissed-finding persistence undefined (answers Q4)
- **Severity:** Major
- **Location:** §12 Q4, §4.3 (reviewer findings), §5 (validator findings), §7.4
- **Issue:** Findings from both the validators and `CapabilityReviewer` are recomputed on
  every recompile, but there is no stable identity for a finding. Without one, a dismissal
  cannot survive recompile and re-review will re-raise everything the user already triaged
  (Q4 is exactly this problem, and it is architectural, not UX). It also blocks a clean
  review-history store.
- **Recommended change:** Give every finding a **deterministic content-hash id** =
  `hash(type, sorted(capabilities), severity, normalized(explanation-or-rule-id))`. For
  validator findings this is fully stable; for LLM findings, hash the structured fields
  (type + capability set + rule), not the prose, so wording drift doesn't change identity.
  Persist finding lifecycle in **git-tracked text** (e.g. `model/annotations.yaml`:
  `{findingHash, state: dismissed|applied, at, note}`) so it is diffable truth, not cache.
  On re-review, suppress findings whose hash is marked dismissed unless the underlying
  capability set changed. This is a prerequisite for M3/M4, not a nice-to-have.

### F8 — Q1: TypeScript end-to-end is the correct call — record it and its boundary
- **Severity:** Minor (recommendation to confirm, not a defect)
- **Location:** §6.1, §12 Q1, ADR-001 (to follow)
- **Issue/answer:** **Endorse TS-everywhere.** The dominant architectural force here is that
  the IR is the shared contract between server (compiler/validators) and client (renderer),
  and a single TS type definition consumed by both eliminates an entire class of
  serialization/schema-drift bugs — this outweighs everything else at MVP scale. Python's
  only real pull is ML/data libraries, which this system does not need (LLM access is a
  provider HTTP API, and validators are graph/set logic, not numerics). The common
  counter-argument — "codegen later will want Python" — does not hold: codegen **emits
  target-language text** (FastAPI/React/Odoo *strings*); the compiler that produces those
  strings has no reason to *run* in Python, and TS has strong text/AST tooling (ts-morph,
  template engines) for emission. The compiler stays a pure TS text-in/text-out function
  regardless of target language.
- **Recommended change:** In ADR-001, record TS-everywhere with two explicit principles so
  the boundary is durable: (1) the IR type is authored once in TS and is the single
  cross-tier contract; (2) codegen is text emission — target language never dictates
  compiler language. Note the one accepted risk: if a later layer genuinely needs a
  Python-only library (e.g. a specific domain solver), it enters as an out-of-process
  service behind the schema-constrained skill interface, exactly like the LLM does today.

### F9 — Q3: git-as-store is right for the model, insufficient for review/eval history
- **Severity:** Major
- **Location:** §6 (model store = git), §3 (`reviews/REV-*.json`), §8 (A1/A2 eval), §12 Q3
- **Issue/answer:** Git is the correct store for the **model artifacts** — they *are* text,
  diffability is a core product value, and a DB would be a strictly worse fit for them.
  It is a poor store for the **operational/query data**: review runs over time, eval-harness
  results (A1/A2), and finding lifecycle (F7) are inherently *queried* ("show all runs where
  the Lead/Customer overlap regressed," "dismissed findings for this workspace"). Flat
  `REV-*.json` files force full-scan reads and give no indexing, which will bite the eval
  harness in M5 and the re-review suppression in M3.
- **Recommended change:** Adopt a **hybrid, one-way** model: git remains the single source of
  truth for `narrative.md` / `capabilities.yaml` / `annotations.yaml`; add a lightweight
  **embedded SQLite** database strictly as a *derived index/cache* for review runs, eval
  results, and finding history — rebuildable from the committed text, never authoritative.
  This keeps the "text is truth" invariant intact while giving the eval and re-review paths
  a queryable substrate. Each stored review row records the `buildHash`, `skillVersion`, and
  model id it was produced against (see F10). If you prefer zero new dependencies for the
  MVP, commit `REV-*.json` but still require those provenance fields; SQLite can be deferred
  to when eval volume justifies it. Answer to Q3: **git is enough for the model, not for the
  history — plan the cache boundary now even if you build it later.**

### F10 — Eval/reproducibility provenance not pinned on stored reviews
- **Severity:** Minor
- **Location:** §4 (determinism policy, `skillVersion`), §8 A1/A2, §11 R2, §12 Q5
- **Issue:** The determinism policy correctly notes generation is non-deterministic even at
  low temperature, and the eval criteria A1/A2 depend on reproducibility. But a stored review
  does not record enough to reproduce or bisect it: model id, `skillVersion`, prompt hash,
  temperature/seed, and the `buildHash` of the IR it reviewed are not required fields on
  `REV-*.json`.
- **Recommended change:** Require every stored skill output to carry
  `{skillVersion, promptHash, modelId, params, inputBuildHash, timestamp}`. This makes A1/A2
  runs bisectable (F9), lets the UI mark a stored review stale when `inputBuildHash` no longer
  matches current IR (F4), and is the backbone of any Q5 eval methodology (compare runs at
  fixed skillVersion against the seeded issue set).

### F11 — Parser vs Compiler boundary is blurred (two-stage derivation unclear)
- **Severity:** Minor
- **Location:** §3 (`narrative.json` "parsed narrative"), §6 (Compiler "parses narrative.md
  + capabilities.yaml → ir.json"), §4.1/§4.2 (skills consume `narrative.json`)
- **Issue:** `narrative.json` is a distinct derived artifact consumed by the LLM skills, yet
  §6 shows the Compiler taking raw `narrative.md` straight to IR. It's unclear whether the
  narrative parser is a separate stage or part of the compiler, which muddies where the
  clean, testable seam is.
- **Recommended change:** Name two deterministic stages explicitly: **Parser** (text →
  structured `narrative.json` / normalized capability model) and **Compiler** (structured →
  IR). Skills consume Parser output; validators consume Compiler output. This is a one-line
  clarification in §6 but it makes the module boundary and unit-test surface crisp and keeps
  provenance (F5) a Parser responsibility.

### F12 — Compiler output must be canonically ordered / stably keyed for hashing & diffs
- **Severity:** Minor
- **Location:** §3.3 (`IREdge.id`, `nodes[]`, `edges[]`), §5 (V-checks), A3
- **Issue:** `buildHash` (F4) and any tracked/inspectable IR require the compiler to emit
  arrays in a stable order with deterministic ids. `IREdge.id` generation is unspecified; if
  ids or ordering are incidental (insertion order, map iteration), hashes and diffs churn
  without semantic change and cycle/dangling reports (V5/V6) become non-reproducible.
- **Recommended change:** Specify that the compiler sorts nodes/edges by a canonical key and
  derives `IREdge.id = hash(from, to, type)`. Make "compiler output is a pure, canonically
  ordered function of input" an explicit property backed by a golden-file test in M0.

### F13 — Edges have no provenance; only nodes carry `sourceRefs`
- **Severity:** Minor
- **Location:** §3.3 (`sourceRefs` maps node id only), §5 (V5 dangling edges)
- **Issue:** `sourceRefs` traces nodes to text but not edges. When V5 flags a dangling
  `depends_on`/`produces` edge, there is no way to point the user at the YAML line that
  authored it, weakening the "traceable to text" guarantee for exactly the elements
  validators complain about most.
- **Recommended change:** Extend provenance to authored edges (`depends_on`, `produces`,
  `consumes`) via the same anchor scheme as F5. Derived edges (`owns`, `serves`) can carry a
  provenance marker of `derived` so the UI shows them as read-only (ties to F1).

### F14 — Q2: derive bounded-context grouping, but as a pure read-only projection
- **Severity:** Nit (answers Q2)
- **Location:** §2 (bounded contexts "read-only grouping hint, derived"), §12 Q2
- **Issue/answer:** The current stance (derive as a read-only hint, don't author) is the
  right architectural choice and should stay. The only requirement is that the grouping be a
  **pure function over the IR** (e.g. cluster by shared `domain_object` / connected
  components), computed in the projection step and never persisted as truth — so it inherits
  the same non-authoritative status as layout (F2).
- **Recommended change:** Keep it derived; add one sentence that the grouping function is
  pure-over-IR and its output is never written back to text. No MVP authoring surface.

### F15 — Workspace status (§9) is mutable JSON that can desync from artifact state
- **Severity:** Nit
- **Location:** §9 (`vbd.workspace.json` status), §3
- **Issue:** The workspace status (`empty → … → committed`) is stored as mutable metadata that
  can drift from reality (e.g. status says `capabilities_generated` after the YAML is
  deleted or hand-reverted), giving a second small source of truth.
- **Recommended change:** Derive status from artifact presence + last recorded action where
  possible, or at minimum validate/repair it on workspace load so the rail can't assert a
  state the files contradict.

---

## Disposition guidance for the author

Must-resolve before this spec moves to `Approved` (per CONV-001 closure rule): **F1**
(Blocker) and the Majors **F2, F3, F4, F5, F6, F7, F9**. F8 confirms Q1; F9 answers Q3; F7
answers Q4; F14 answers Q2. The Minor/Nit items (F10–F13, F15) can be folded into the
relevant spec sections or logged as Accepted/Deferred. None of these findings challenge the
core architecture — the IR-as-spine, pure compile/validate stages, and provider-agnostic
skill interface are all endorsed. The requested changes harden the *write path* so the
spec's headline invariant ("text is truth, graph is projection") is enforceable by
construction rather than by discipline.
