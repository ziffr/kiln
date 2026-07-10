---
id: REV-010
title: Technical-architecture review of SPEC-002 (Domain Model Layer)
type: review
status: Approved
version: 1.0.0
author: "Reviewer (technical-architecture)"
created: 2026-07-10
updated: 2026-07-10
reviews: SPEC-002
lens: technical-architecture
verdict: Approve-with-changes
related: [SPEC-002]
---

# REV-010 — Technical-architecture review of SPEC-002

## Summary

SPEC-002 extends the SPEC-001 substrate the way it should: same loop, one layer deeper,
reusing the IR, validators, provenance, and human-in-the-loop editing. The core moves —
adding `aggregate|command|event` nodes + `owns|handles|emits` edges to `@vbd/ir`, composing
a second authored artifact into one IR, and adding pure validators DM1–DM8 — are the right
shape and preserve the "text is truth" invariant. The validator placement is sound and the
authored/derived tagging generalizes cleanly.

The spec is **architecturally directionally correct but under-specified at the seams that
actually matter for a two-artifact compile**: node identity in the IR's flat id namespace,
the relationship between the existing *derived* `domain_object` node and the new *authored*
`aggregate` node (Q5), the shape of cross-artifact provenance (an aggregate cites a
*capability*, not a narrative heading), reconciliation with the real storage model (ADR-006
keeps capabilities inside `project.json`, not a `capabilities.yaml` file), and schema
migration for the second artifact. None are fatal; all are fixable in spec text. Verdict:
**Approve-with-changes**.

I verified findings against the real code (`packages/ir/src/index.ts`,
`packages/compiler/src/index.ts`, `packages/validation/src/index.ts`,
`apps/service/src/workspaces.ts`) rather than the SPEC-001 idealization.

## Findings

### Major

**M1 — Flat IR node namespace: bare aggregate/command/event ids can collide (§3, §4, §6/DM7).**
The compiler keys every node in a single `Map<string, IRNode>` and `addNode` silently drops a
second node with an existing id (`if (!nodes.has(n.id)) nodes.set(n.id, n)`). Existing derived
nodes are namespaced (`outcome:`, `actor:`, `domain_object:`), but capabilities use bare ids
(`lead_management`). SPEC-002 §3 gives aggregates/commands/events **bare** ids (`lead`,
`qualify_lead`, `lead_qualified`). A bare aggregate id that matches a capability id (or a
command id that matches an aggregate id) collides in the flat map and one node is **silently
dropped** — no error, corrupt graph. DM7 as written ("aggregate/command/event ids unique")
only guarantees per-type uniqueness, not global-across-types uniqueness in the flat namespace.
*Fix:* namespace the new nodes in the IR (`aggregate:<slug>`, `command:<slug>`, `event:<slug>`)
exactly as `domain_object:`/`outcome:` are namespaced, keeping the bare id in `meta`/label; and
restate DM7 as "ids unique **within their namespace**, and the compiled IR node id is unique
globally." State that `addNode`'s dedupe-drop must become a hard compiler error on genuine id
clash (silent drop hides M1 itself).

**M2 — `domain_object` (derived) vs `aggregate` (authored) identity is unresolved (§3, §4; Q5).**
Today `produces: [Lead]` already emits a *derived* `domain_object:lead` node + a `produces`
edge. SPEC-002 now authors an `aggregate: lead` for the same real-world concept. The spec does
not say what happens to the derived `domain_object:lead` when its aggregate is authored — you
get two nodes for one thing (double render, ambiguous edge targets, split provenance). This is
Q5 stated as a data-model problem. *Fix:* define a canonicalization rule in the compiler — the
authored `aggregate:<slug>` **supersedes** the derived `domain_object:<slug>` of the same slug
(the derived node is not emitted when an authored aggregate exists), and the existing
`produces`/`consumes` edges **retarget** to the aggregate node. This resolves Q5 and M2
together and keeps `produces`/`consumes` as the aggregate seed (R1/§5) without duplicating.

**M3 — Cross-artifact provenance shape is undefined; DM8 can't validate what isn't specified
(§3 `meta.derivedFrom`, §5, §6/DM8).** SPEC-001 provenance (`SourceRef = {file, section,
anchor, contentHash}`) points at **narrative headings**. A domain element derives from a
**capability** (§5: "citing the capability/activity it derives from"), which is not a heading
and — per ADR-006 — does not even live in a file with a stable content hash (it lives inside
`project.json`). DM8 requires "valid `meta.derivedFrom`" but the *valid shape* for a
capability-targeting anchor is never defined, so DM8 is unimplementable as written. *Fix:*
specify the domain-element provenance anchor explicitly — e.g. `{ artifact: "capabilities",
capabilityId: "lead_management", contentHash: <hash of that capability's canonical entry> }` —
and define DM8 to check that `capabilityId` resolves in the composed IR and the `contentHash`
matches, so provenance drift (capability edited after the aggregate was derived) is detectable,
mirroring SPEC-001's `onModelHash` resurfacing.

**M4 — Storage of the second artifact contradicts the real workspace model (§3, §4 vs ADR-006).**
§3 introduces `model/domain_model.yaml` as a file and §4 says "the compiler composes
capabilities.yaml + domain_model.yaml." But the shipped store (ADR-006, `workspaces.ts`) has
**no `capabilities.yaml` file** — capabilities live as a JSON blob inside `project.json`
(`capabilities: unknown`); only `narrative.md` is a real authored file. So "composing two
authored `.yaml` artifacts" describes a world that doesn't exist yet. The spec must not assume
a filesystem layout the codebase contradicts. *Fix:* pick one and state it: (a) domain model is
a second key in `project.json` (`domainModel`), composed from two in-memory docs — cheapest,
consistent with today; or (b) SPEC-002 also lands the ADR-002 target (real
`model/capabilities.yaml` + `model/domain_model.yaml` files) and calls that out as in-scope
work with the migration from `project.json`. Either is fine; the ambiguity is not. Note that
DM2/DM3/DM6 cross-artifact checks are unaffected because they run over the composed IR — but
the buildHash inputs and the `dirty`-flag surface both change with this choice.

**M5 — Schema evolution of the second artifact is unaddressed; two schema-version streams now
feed one buildHash (§3 `version: "0.1"`, §4).** SPEC-001 §3.2 + ADR-002 established versioned
migration functions keyed on `capabilities.yaml`'s `version`, and the compiler bakes a single
`SCHEMA_VERSION = "0.2"` into `computeBuildHash`. `domain_model.yaml` introduces a **second,
independent** version (`"0.1"`) with no migration registry and no statement of how the compiler
folds two schema versions into one `buildHash`. Left implicit, a domain-schema bump won't
invalidate the cache (stale IR) and there's no migration path. *Fix:* add a migration registry
keyed on `domain_model.yaml` `version` (parallel to capabilities'), and specify that
`computeBuildHash` mixes **both** artifacts' canonical content **and both** schema versions
(and the compiler version), with a fixed field order for determinism.

### Minor

**m1 — "The enums already reserve room" is only half-true (§4).** In the real
`packages/ir/src/index.ts`, `EdgeType` includes `owns` (unused/reserved — good), but `NodeType`
does **not** include `aggregate|command|event`, and `EdgeType` does **not** include
`handles|emits`. So DM0 genuinely *adds* to both unions; it isn't a no-op reservation. Correct
the sentence, and state that union growth must stay **additive** and that every exhaustive
`switch` over `NodeType`/`EdgeType` in the UI/validation must carry a `default` so a
later-layer type (SPEC-003 policies/roles/agents) can't break older consumers.

**m2 — DM validators "pure over the IR," but V1–V8 are pure over the *doc* (§6 vs code).**
`packages/validation` validates `CapabilityDoc`, not the IR, despite SPEC-001 §5's "pure over
the IR" language. DM2/DM3/DM6 are inherently **cross-artifact**, so running them over the
**composed IR** is the right call (both artifacts already merged into one graph) — but that is a
*different input signature* from the existing validators. Call this out: DM validators take the
composed IR; note the intentional divergence from V1–V8's doc-based signature (or plan to move
V-series onto the IR too). Testability is otherwise fine — pure functions over a constructed IR
fixture.

**m3 — Recompile semantics on capability deletion should be stated as non-cascading (§4, R4).**
R4 + DM6 handle the *detection* of orphaned domain elements when a capability is renamed/deleted,
and "the map drops dangling edges gracefully" covers the *edge*. But the authored aggregate
**node** still exists (it's authored — text is truth). Make explicit that the compiler does
**not** cascade-delete authored aggregates when their owner disappears: the aggregate persists,
DM6 flags the dangling `owns`, and the human resolves it (re-point or delete in the domain form).
Silent cascade-delete would violate "authored elements only change via authored text."

**m4 — Compose determinism should be stated (§4).** The current compiler is deterministic
(merge into maps, then `id.localeCompare` sort). Say explicitly that composition is
**order-independent**: merge both docs' nodes/edges into the same maps, then canonical-sort, so
the IR (and buildHash) is invariant to artifact read order and to intra-file ordering.

### Nit

**n1 — `owns` edge direction (§4).** Fine as chosen (capability `--owns-->` aggregate), but
state the direction and endpoints for `owns|handles|emits` in the IR extension (e.g.
`command --handles--> aggregate`? or aggregate handles command? `command --emits--> event`)
so `edgeId(from,to,type)` is unambiguous and DM3/DM4 test the right endpoints.

## Answers to §11 open questions (architecture lens)

- **Q1 (all three now vs aggregates-only MVP):** Architecturally the IR extension and the
  two-artifact compose cost the same either way; commands/events add two node types +
  `handles/emits` + DM3/DM4. Doing all three is acceptable **provided M1 (namespacing) and the
  additive-union discipline (m1) are in place**. If you want the smallest safe first freeze,
  aggregates-only defers `handles/emits` and halves the id-collision surface — a legitimate
  de-risking, but not required.
- **Q3 (typed attributes now vs free-form):** Free-form names first. Typing is a pure
  schema-evolution concern; with the M5 migration registry in place, adding attribute types
  later is an additive `version` bump. Reserve the field shape (allow `attributes` to later be
  objects) so the migration is additive rather than breaking.
- **Q4 (DM5 error vs warning):** **Warning, not error.** Orchestration-only capabilities that
  own no aggregate are legitimate (the spec itself concedes this). A hard error yields false
  positives and blocks valid models; emit DM5 at `minor`/warning severity so the review lens can
  surface "under-modeled?" without failing the build.
- **Q5 (produces/consumes as aggregate seed — migrate or keep both):** Resolved by **M2**:
  keep `produces`/`consumes` as authored edges, but have the authored `aggregate` supersede the
  same-slug derived `domain_object` in the compiler and retarget those edges to the aggregate.
  Do **not** keep two separate nodes for one concept.
- **Q2 (tab vs expansion):** UX lens; deferred to REV-011.

## Verdict

**Approve-with-changes.** The substrate reuse and the "same loop, one layer deeper" framing are
right, and the invariant is preserved. Address M1–M5 (node namespacing, `domain_object`↔
`aggregate` identity, cross-artifact provenance shape, storage reconciliation with ADR-006, and
second-artifact schema migration/buildHash) in the spec text before implementation of DM0.
