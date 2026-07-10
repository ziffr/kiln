---
id: REV-013
title: Domain-Modeling (DDD) Review of SPEC-003
type: review
status: Approved
version: 1.0.0
author: "Claude (Opus 4.8) — domain-modeling lens"
created: 2026-07-10
updated: 2026-07-10
reviews: SPEC-003
lens: domain-modeling
verdict: Approve-with-changes
related: [SPEC-003]
reviewers: [domain-modeling]
---

# REV-013 — Domain-Modeling (DDD) Review of SPEC-003

## Summary

SPEC-003 adds the missing rung — a capability-grouping layer — and as a *mechanism* it is the
cleanest reuse in the series: partition + deterministic validators + grounded provenance +
authored/derived tagging + a mock, all one layer up from SPEC-002. The IR already reserves the
`bounded_context` node and `groups` edge (verified in `@vbd/ir`), the `bctx:` namespacing mirrors
SPEC-002's `aggregate:` correctly, and the derived entity→context projection walk (§4) is sound as
written. I have no quarrel with the loop.

Judged as a *DDD artifact*, though, the spec has two substance problems that sit exactly where the
domain modeling lives, plus a provenance rule that checks nothing.

**First, this is not a bounded context — it is a subdomain.** In DDD a *subdomain* is a
problem-space partition of the business (the areas a business *has*); a *bounded context* is a
**solution-space** boundary — the scope within which one model and one **ubiquitous language** are
internally consistent, and usually a team/deployment seam. SPEC-003 clusters *capabilities*
(problem-space business functions) into cohesive business areas and explicitly **defers the
ubiquitous language** (N1) — i.e. it removes the one property that makes a bounded context a
bounded context. What is left is a subdomain map wearing a bounded-context label. This is the exact
shape of the finding REV-007 raised against SPEC-002 ("the node you call `aggregate` is really a
flat `entity`"): the name over-claims the delivered structure.

**Second, deriving entity→exactly-one-context from the single owner contradicts the shared kernel.**
DDD's foundational teaching is that the *same* term lives in *multiple* contexts with *different*
models — `Customer` in Sales is a lead-turned-account; `Customer` in Finance is a billing party.
SPEC-002 already conceded this reality by adding the `references` edge (REV-007 D1) so a shared
entity owned in one place can be *needed* elsewhere. SPEC-003 then flattens that back: because
entity→context walks the single `owns` owner, a referenced `Customer` is **invisible** in Finance —
the context that references it has, by the model, no Customer at all. The strict partition of
*capabilities* is fine (that is normal for subdomains). The strict, single-valued partition of
*entities* is the DDD-unsound part.

**Third, BC8 provenance is circular.** A context's `derivedFrom` is proposed to be the capabilities
it groups — but a context *is* its member capabilities, so that grounding is tautological and BC8
verifies nothing. Provenance must point at the *evidence for the boundary* (the narrative language
that says these belong together), not re-list the members.

None of this invalidates the approach; all of it is fixable inside the spec, most of it cheaply.
**Approve-with-changes.** Findings are ordered by severity; Q2–Q5 and the terminology question are
answered inline and collected in "Open questions."

---

## Findings

### C1 — This models a **subdomain** (problem space), not a **bounded context** (solution space); N1 removes the defining property
- **Severity:** Major
- **Location:** §0 (Framing), §2 N1 (ubiquitous-language deferred), R1, Q6
- **Issue:** The spec groups capabilities — problem-space business functions — into "cohesive slices
  of the business and its language." That is the textbook definition of a **subdomain**. A *bounded
  context* is the solution-space boundary within which a model + ubiquitous language are consistent
  (and typically a module/service/team seam). Two tells confirm the mismatch: (a) N1 defers the
  ubiquitous language, which is *the* thing a bounded context is defined by — a BC with no language
  boundary is not a BC; (b) §0 already hedges toward solution space ("the seams a future codegen
  step would turn into deployable modules/services"), conflating the two spaces in one sentence.
  This matters beyond pedantry: subdomains and contexts have *different* relationships to entities.
  Subdomains partition *functions* (a clean partition is normal); contexts partition *models* (where
  the same entity legitimately recurs — see C2). Naming the problem-space layer a "bounded context"
  bakes the C2 error in by making a single-context-per-entity projection sound principled.
- **Recommended change:** Decide deliberately and say so. Cleanest: internally name the concept
  **subdomain** (the operator-facing "Areas" label is unaffected — that was always going to be
  business language per R1/Q6). If the product owner wants to keep `bounded_context` in the IR
  because it is the intended future codegen seam, then §0 must state explicitly: "we cluster
  *subdomains* now; a subdomain may later map 1:1 to a bounded context, but until the ubiquitous
  language (N1) and context relationships (N0) land, this is a subdomain map, not a context map."
  Either way, drop the implicit claim of DDD bounded-context precision the artifact does not yet
  deliver. This is the SPEC-002 `aggregate`→`entity` lesson applied one layer up.

### C2 — entity→single-context (derived from the sole owner) contradicts the shared kernel; referenced entities vanish from the contexts that use them
- **Severity:** Major
- **Location:** §0 ("each entity inherits the context of its owning capability"), §4 (derived
  projection: entity → `owns`⁻¹ owner → `groups`⁻¹ context), R2, Q5
- **Issue:** The derived projection is single-valued by construction: an entity has exactly one
  `owns` owner, so it resolves to exactly one context. But SPEC-002 shipped `references` precisely
  because a shared entity (`Customer`, `Installation`) is *owned* in one capability and *needed* in
  others that live in **different** contexts. Under this projection, `Customer` (owned by
  `customer_management` in Sales) is absent from Finance even though `billing` references it — the
  Finance context, per the model, contains no customer. That is the opposite of the DDD reality it
  should capture: the same real-world concept appears in multiple contexts, each with its own model
  (a shared kernel, or two models related by a context mapping). A strict single-context-per-entity
  map will read as *wrong* to any domain reviewer on the first solar walkthrough (A1), because the
  cross-context references are the most important structure and they are exactly what is hidden.
- **Recommended change:** Keep ownership single-valued (that is sound), but make the projection
  **multi-valued for presence**: an entity is *owned in* one context and *referenced in* zero-or-more
  others, derived read-only from the existing `references` edges (entity → referencing capability →
  its context). Render the referenced-in contexts distinctly (ghosted / "shared"). This costs one
  more inverse-walk over edges already in the IR, needs no new authored data, preserves the
  partition invariant on *capabilities*, and turns the shared-kernel problem from "silently erased"
  into "visibly shared" — which is also the raw material for Q2 adjacency and Q3 language.

### C3 — BC8 provenance is circular; grounding a context to its own members verifies nothing
- **Severity:** Major
- **Location:** §3 (artifact `meta.derivedFrom: [{capability: lead_management}, ...]`), §6 BC8,
  §8 A4 (contextProvenanceRate = 1)
- **Issue:** For capabilities (V8) and entities (DM8) `derivedFrom` points at *upstream* evidence —
  a narrative heading, an owning capability — that exists independently of the element. For a
  context, the proposed `derivedFrom` is the list of capabilities it groups. But a context is
  *defined* as that group, so "provenance = my members" is a tautology: it is always trivially
  present and internally consistent, so BC8 (and the A4 `contextProvenanceRate` metric) can never
  fail and measures nothing. The genuine provenance question for a boundary is *why these belong
  together* — the shared language / shared entities / dependency locality the grouper reasoned from.
- **Recommended change:** Ground a context to the **evidence for the boundary**, not its membership:
  the narrative section(s) / language cues and/or the shared-entity set that justified the cluster
  (e.g. `derivedFrom: [{ narrative: "§Sales" }, { sharedEntity: customer }]`). Reuse SPEC-002's
  capability-targeting anchor mechanism (REV-009/§3 `DomainAnchor`) rather than inventing a third
  provenance shape. Scope BC8 to "the boundary cites at least one non-membership justification."
  If grounding-to-members is deliberately kept for MVP, then say BC8 checks *shape only* and drop
  A4's `contextProvenanceRate = 1` from the success criteria, because as written it is free.

### C4 — Deferring **all** context relationships (N0) leaves contexts as islands; a minimal derived adjacency is what makes them a *map* (answers Q2)
- **Severity:** Major (borderline; the layer is usable without it, but under-delivers as DDD)
- **Location:** §2 N0, §7 (review lens: "depends heavily across a boundary"), Q2
- **Issue:** In DDD the **context map** — the relationships *between* contexts — is arguably more
  valuable than the boundaries themselves; boundaries without relationships are a set of disconnected
  islands, not a map. Deferring the *typed* relationships (upstream/downstream, ACL, conformist,
  shared kernel, published language) for a first cut is reasonable — they need human judgment. But
  deferring *every* relationship, including a plain derived adjacency, is a real loss: the spec's own
  review lens (§7) promises to flag "a capability that depends heavily across a boundary," which is
  literally cross-boundary edge counting — so the data is already computed and then thrown away.
  Cheap situational awareness, not scope creep.
- **Recommended change (Q2 = yes, derive it):** Compute a **read-only** context adjacency from
  edges already in the IR: a cross-boundary `depends_on` or a cross-context `references` (C2) yields
  an undirected "these two areas interact" hint, weighted by edge count. Origin `derived`, no typed
  semantics (those stay in the N0 relationships spec). This feeds the §7 review lens directly, gives
  the coarse map its most useful signal, and is the numerator for the coupling smell in C5. Keep the
  *typed* mapping deferred; ship the untyped adjacency now.

### C5 — BC9 cohesion measures **connectivity**, not **coupling**; reframe to a boundary-crossing ratio (answers Q4)
- **Severity:** Minor (it is a stretch validator, but the metric as written is the wrong one)
- **Location:** §6 BC9, Q4, §8 A1
- **Issue:** BC9 as stated flags a context whose capabilities are *not* internally connected via
  `depends_on`/shared entities. Internal connectivity is necessary but not sufficient for a good
  boundary: a context can be internally connected yet be *more strongly coupled outward* than inward
  — which is the actual "wrong boundary" smell (a capability that belongs in the neighbouring area).
  Mere-connectivity also throws false positives on legitimately small contexts (Finance = `billing`
  alone has no internal edges to be "connected" by) and false negatives on a context that is a
  weakly-internally-connected but externally-dependent blob. The DDD signal you want is
  **cohesion-vs-coupling**: a boundary is good when intra-context dependency density exceeds
  cross-boundary density.
- **Recommended change (Q4 = ship, but reframe):** Make BC9 a **coupling-ratio** warning: for each
  context, compare internal edges to boundary-crossing edges (reusing C4's adjacency); flag a
  context (or a specific capability) whose cross-boundary coupling exceeds its internal coupling as
  a "possible mis-placement." It is deterministic and cheap (unlike V3's LLM judgment, so it need
  *not* be deferred to the LLM lens), and it is the same number the §7 lens and Q2 adjacency already
  need. Exempt singleton contexts from the warning (a 1-capability area is not "loosely grouped").

### C6 — Q5 strictness: keep single-membership for capabilities, but give the shared kernel an explicit escape marker (answers Q5)
- **Severity:** Minor
- **Location:** §6 BC2.multiple, R2, Q5
- **Issue:** R2/Q5 ask whether a strict partition is too rigid. For *capabilities → subdomains* a
  strict partition is the right default (a business function belongs to one area; a capability that
  genuinely straddles is usually a signal it is too coarse and should be split). The real
  shared-kernel pressure is at the *entity* level (C2), not the capability level — so relaxing
  capability membership to fix a shared-entity problem would be solving it in the wrong place. But
  "split the capability" is not always right, and a hard failure with no escape will force bad
  merges (the same trap REV-007 D1 flagged for DM2). Note BC2.multiple is already `major`, not
  `blocker` — good; keep it that way.
- **Recommended change (Q5 = strict by default, with a conscious override):** Keep BC2 single
  authored membership as the default and correct invariant. Add one explicit escape: a capability
  may carry a `shared_kernel: [ctxA, ctxB]` marker that the human sets deliberately, which downgrades
  BC2.multiple from a finding to an informational note for exactly those capabilities. Straddling
  becomes a conscious, visible modeling decision (a declared shared kernel), never a silent
  double-assignment and never a forced merge. Do **not** open multi-membership globally from day one
  — that would erase the clean-partition value the layer exists to provide.

### C7 — Q3 ubiquitous language: don't author a glossary, but **derive** a per-context term list from owned+referenced entities (answers Q3)
- **Severity:** Minor
- **Location:** §2 N1, Q3, and links to C1/C2
- **Issue:** Omitting the ubiquitous language is what most undermines the "bounded context" claim
  (C1) — the language boundary *is* the context. Authoring a full glossary now is premature, but the
  spec already has the raw material for a lightweight one for free: the **entities owned by (and,
  per C2, referenced in) a context are the beginnings of its language.** Deriving that list costs
  nothing new and buys two things: the "language" dimension a context needs to earn its name, and a
  *second, independent* cohesion signal — a term (entity) that appears in two contexts is exactly a
  shared-kernel / boundary smell (it corroborates C2 and C5).
- **Recommended change (Q3 = derive, don't author):** Add a read-only, derived per-context **term
  list** = names of entities owned-in + referenced-in the context (C2). No authored glossary in the
  MVP (keep N1 for the *authored* glossary), but surface the derived vocabulary in the Areas view.
  A term appearing in >1 context is flagged as a shared-kernel candidate, feeding the review lens.

### C8 — The entity→context projection is undefined for capabilities not yet in a context (mid-edit partial partition)
- **Severity:** Minor
- **Location:** §4 (derived projection), §6 BC2.unassigned, §7 (live edit → recompile)
- **Issue:** BC2.unassigned tolerates (flags, does not block) a capability with no context — a normal
  transient state while the human is assigning. But §4's entity→context walk assumes the owner
  capability resolves to a context. During that transient, an entity owned by an unassigned
  capability projects to *no* context. The spec does not say what the view shows, and an undefined
  projection is a live-recompile drift hazard (A3).
- **Recommended change:** Specify graceful degradation: an entity whose owner capability is
  unassigned projects to a synthetic **"Unassigned"** area (read-only), mirroring how the map already
  drops dangling edges gracefully (SPEC-002 R4). State this in §4 so the projection is total.

### C9 — IR compose / provenance consistency nits (verified against `@vbd/compiler`)
- **Severity:** Nit
- **Location:** §3 (`derivedFrom` shape), §4 (compose + buildHash)
- **Issues & changes:**
  - **Provenance shape drift:** §3's `derivedFrom: [{ capability: ... }]` is a *third* provenance
    shape (V8 uses a narrative anchor; DM8 uses a capability-targeting `DomainAnchor`). Reuse the
    `DomainAnchor` mechanism rather than inventing a new inline object — this also fixes C3.
  - **buildHash:** `computeBuildHash(doc, domain?)` currently mixes `${canonical(doc)}|${domainPart}|
    version…`. Adding contexts is a third positional segment — fine, but (a) fix the position and
    document it, and (b) bump `SCHEMA_VERSION` and register the contexts artifact in the parallel
    migration registry REV-010 asked for, so a schema change invalidates caches. State this in §4.
  - **Directions/namespacing are correct** — confirming, not faulting: `groups` = `bctx:<ctx>` →
    `<capability>` matches the container→member direction of `owns` (`capability`→`aggregate:<id>`);
    `bctx:` namespacing prevents id collision with bare capability ids and `aggregate:` ids; the
    derived walk (entity → `owns`⁻¹ → `groups`⁻¹) is well-formed. R5 (id collision / node explosion)
    is genuinely mitigated by namespacing + flat partition (N4). Good.

### C10 — Granularity (2–6 contexts) is asserted in the prompt but never validated; singleton contexts must not trip BC6/BC9
- **Severity:** Nit
- **Location:** §5 (grouper: "2–6 cohesive contexts"), §6 BC6/BC9
- **Issue:** §5 tells the LLM to produce 2–6 contexts, but no deterministic check enforces or warns
  on granularity — so a 15-singleton-context degenerate partition (which the mock's
  connected-components fallback can produce on a sparse `depends_on` graph) passes all of BC1–BC9.
  Conversely, BC6 (empty context) and a naive BC9 must not punish a legitimate singleton like
  Finance = `billing`.
- **Recommended change:** Optional soft **BC10 granularity** warning (contexts far outside ~2–6, or
  a partition that is nearly all singletons, is a smell). Explicitly exempt singleton contexts from
  BC9 (per C5). Minor, but it closes the gap between the prompt's intent and the validators.

---

## Open questions (domain-modeling lens)

- **Terminology (bounded context vs subdomain):** What SPEC-003 builds is a **subdomain** map
  (problem-space clustering of capabilities), not a **bounded context** map (solution-space model +
  language boundary) — and N1 removes the ubiquitous language that would make it a real BC. Rename
  internally to `subdomain`, or keep `bounded_context` only with an explicit §0 statement that this
  is a subdomain map that *may later* become the context/codegen seam. Don't claim BC precision the
  artifact doesn't deliver (C1).

- **Q2 — derive inter-context adjacency now?** **Yes.** A read-only, untyped adjacency from
  cross-boundary `depends_on` + cross-context `references` turns islands into a map, feeds the §7
  review lens (which already needs it), and is the numerator for the C5 coupling smell. Keep the
  *typed* context mapping (ACL/conformist/etc.) deferred (N0); ship the untyped adjacency (C4).

- **Q3 — ubiquitous language now or defer?** **Derive, don't author.** No authored glossary in MVP
  (keep N1 for the authored dictionary), but derive a per-context term list from owned + referenced
  entity names — nearly free, gives the layer the "language" dimension its name implies, and doubles
  as a shared-kernel detector (a term in two contexts) (C7).

- **Q4 — ship BC9 cohesion?** **Ship it, but reframe.** As written it measures internal
  connectivity, which is the wrong signal and false-positives on singletons. Make it a deterministic
  **coupling-ratio** warning (cross-boundary vs internal edges); that is the real wrong-boundary
  smell and needs no LLM judgment, so it need not be deferred like V3 (C5).

- **Q5 — strict partition or multi-membership from day one?** **Strict by default, with a conscious
  escape.** Single authored membership for *capabilities* is the right invariant (that is normal for
  subdomains). Do not open multi-membership globally. Add an explicit `shared_kernel` marker the
  human sets deliberately, which downgrades BC2.multiple to informational for those capabilities —
  the shared kernel becomes a declared decision, not a silent double-assignment. The real
  shared-entity pressure belongs at the entity level (C2), not by relaxing capability membership
  (C6).

## Verdict

**Approve-with-changes.** The loop, the partition, and the reuse of the IR/validator/provenance
machinery are the right first cut and the compose design is correct. Before build, three Majors need
to land because they are structural, not cosmetic: name the layer honestly (subdomain vs bounded
context, C1), make the entity projection multi-valued for referenced entities so the shared kernel
is visible rather than erased (C2), and fix the circular provenance so BC8/A4 measure something
(C3). C4 (derive the context adjacency) is a borderline-Major that turns a set of islands into a
map for near-zero cost. The remaining items (BC9 as a coupling ratio, the `shared_kernel` escape,
the derived term list, projection degradation, and the compose/granularity nits) are cheap and
sharpen the layer into something a domain reviewer would call "substantially right" on the first
solar pass (A1).
