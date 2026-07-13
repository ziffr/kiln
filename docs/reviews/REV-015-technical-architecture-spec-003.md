---
id: REV-015
title: Technical-architecture review of SPEC-003 (Bounded Contexts)
type: review
status: Approved
version: 1.0.0
author: "Claude (Opus 4.8) — technical-architecture lens"
created: 2026-07-10
updated: 2026-07-10
reviews: SPEC-003
lens: technical-architecture
verdict: Approve-with-changes
related: [SPEC-003]
reviewers: [technical-architecture]
---

# REV-015 — Technical-architecture review of SPEC-003

## Summary

SPEC-003 adds the bounded-context layer the way SPEC-002 added the domain layer: **same loop, one
layer up**, reusing the IR spine, the pure validators, grounded provenance, and human-in-the-loop
editing. The core moves are architecturally right and — unlike SPEC-002 — mostly *lower*-risk here:
`bounded_context` (NodeType) and `groups` (EdgeType) **already exist** in `@kiln/ir`
(`packages/ir/src/index.ts:16,25`), so there is **no union growth** and none of the additive-union /
exhaustive-`switch` risk REV-010 m1 raised. The `bctx:<slug>` namespacing directly reuses the
`aggregate:` fix from REV-010 M1 and cleanly avoids collision with bare capability ids and the
`aggregate:`/`domain_object:`/`outcome:`/`actor:` namespaces. The `groups` edge direction
(context → capability) is consistent with the existing container→member convention (`owns` is
capability → aggregate), and because the doc is a strict partition (BC2), each `groups` edge is
unique under `edgeId(from,to,type)`. The entity→context **derived projection** (walk
entity → `owns`⁻¹ → owner capability → `groups`⁻¹ → context) is the right call: it stores no new
truth, so it cannot drift from the authored partition.

The spec is directionally correct but **under-specified at the seams that actually bite for a
*third* composed artifact and a *partition* invariant**: (1) the live-editing invalidation cascade
when capabilities change out from under a stored partition — sharper here than for the domain because
adding/deleting one capability *breaks the partition invariant* (BC2) immediately; (2) the
`computeBuildHash` signature/field-order change and the still-missing per-artifact schema-version /
migration story (a straight recurrence of REV-010 M5); (3) storage reconciliation — the **server**
`StoredProject` type carries neither `domain` nor `contexts`, so "stored in `project.json` alongside
… the domain" describes a persistence path that is currently untyped; and (4) a prerequisite the spec
assumes but the code does not yet meet — `App.tsx:103` compiles `compileCapabilities(activeDoc)`
**without `domain`**, so the map IR contains no `owns` edges today, and the derived entity→context
walk has nothing to traverse until both `domain` and `contexts` are actually composed into one IR.

None are fatal; all are fixable in spec text. Verdict: **Approve-with-changes**. Findings verified
against the real code (`packages/ir/src/index.ts`, `packages/compiler/src/index.ts`,
`packages/validation/src/index.ts`, `apps/service/src/server.ts`,
`apps/service/src/workspaces.ts`, `apps/web/src/projects.ts`, `apps/web/src/App.tsx`,
`packages/skills/src/domain.ts`), not the SPEC idealization.

## Findings

### Major

**M1 — Invalidation cascade on capability mutation is unspecified, and a partition makes it sharper
than the domain case (§4, §6/BC2, §7).**
For the domain, every capability mutation clears the snapshot to `null` and falls back to the live
mock: `setNarrative` (`App.tsx:129`), `generate` (`:145`), `editCapability` (`:180`),
`deleteCapability` (`:187`), `addCapability` (`:197`) all pass `domain: null`. SPEC-003 says nothing
about what happens to a **stored `contexts` snapshot** when a member capability is renamed, deleted,
or added. This is worse than the domain case because `contexts` is a **partition**: deleting a member
capability instantly violates BC2 completeness for the *remaining* map (dangling member → BC4; the
partition is now short one capability), and adding a capability leaves it **unassigned** (BC2). The
spec leans on validators to *detect* this but never states the *live-flow policy*. The two obvious
options have very different cost:
  - **Blanket clear** (`contexts: null` on any capability edit, mirroring `domain: null`) — cheap to
    implement but destroys an authored, expensively-generated partition every time the operator
    tweaks a single capability. For an authored top layer this is poor and arguably violates the
    spirit of "authored elements only change via authored intent."
  - **Reconcile** — on capability delete, drop the member from its context (and warn); on capability
    add, surface it as unassigned (BC2) for the human to place; on rename, re-point the membership.
*Fix:* specify the reconciliation policy explicitly in §7 (recommended: **reconcile, don't blanket
clear** — remove dangling members on delete, mark new capabilities unassigned, re-point on rename),
and state that the compiler/edit layer does **not** cascade-*delete* an authored context when it goes
empty (BC6 flags it; the human retires it) — the exact non-cascade rule REV-010 m3 established for
aggregates. Add an eval/test for "delete a member capability → BC2/BC4 fire, partition reconciles,
no silent data loss."

**M2 — `computeBuildHash` must change signature *and* fix field order, and the third artifact still
has no schema-version / migration story (§4, §8/A3; recurrence of REV-010 M5).**
`computeBuildHash(doc, domain?)` today mixes `${canonical(doc)}|${domainPart}|${COMPILER_VERSION}|${SCHEMA_VERSION}`
(`compiler/src/index.ts:66-69`). SPEC-003 §4 correctly requires it to mix `contexts`, but does not
specify (a) the new signature `computeBuildHash(doc, domain?, contexts?)`, (b) a **fixed field
position** (append after `domain`, before `COMPILER_VERSION`, so a context edit changes the hash and
context-less projects stay hashable via an empty segment), or (c) how the **contexts artifact's own
`version: "0.1"`** folds into the single `SCHEMA_VERSION`. The compiler bakes one
`SCHEMA_VERSION = "0.2"`; there is no per-artifact migration registry for domain today and SPEC-003
adds a *third* independent version stream with the same gap. Left implicit, a contexts-schema bump
won't invalidate caches (stale IR). *Fix:* state the exact signature and canonical field order in §4;
require `computeBuildHash` to mix **all three** artifacts' canonical content plus each artifact's
schema version (or a single monotonic `SCHEMA_VERSION` bump that the compiler owns); and note that
this is the same migration-registry debt REV-010 M5 flagged — either pay it once for all three
artifacts or explicitly defer with a tracking note.

**M3 — Storage reconciliation: the server `StoredProject` type carries neither `domain` nor
`contexts` (§3 "stored in `project.json` alongside … the domain").**
§3 asserts contexts live in `project.json` next to capabilities and the domain (ADR-006). But the
**web** `Project` type has `domain?` (`projects.ts:21`) while the **server** `StoredProject`
(`workspaces.ts:16-27`) declares only `capabilities: unknown` — **no `domain` field, and no
`contexts`**. `saveProject` serializes the whole posted object (`JSON.stringify(p, null, 2)`,
`:60`), so at *runtime* extra keys round-trip, but the *type contract* under-declares both artifacts,
and the persistence claim in the spec is aspirational rather than true today. *Fix:* §3 must state
that `contexts?: ContextsDoc | null` is added to **both** `Project` (web, `projects.ts`) and
`StoredProject` (server, `workspaces.ts`), and should note in passing that `domain` is likewise
missing from `StoredProject` and should be typed at the same time (latent gap, not introduced here).
Confirm the `contexts` invalidation on capability edits (M1) reaches persistence the same way
`domain: null` does.

**M4 — The derived entity→context walk presupposes an IR that composes `owns` *and* `groups` edges;
the app composes neither today (§4).**
The derived projection "walk entity → `owns`⁻¹ → owner capability → `groups`⁻¹ → context" requires a
**single IR** containing both `owns` edges (domain) and `groups` edges (contexts). But
`App.tsx:103` calls `compileCapabilities(activeDoc)` **without the domain argument**, so the map IR
today contains **no `owns` edges at all** — the domain is rendered from `domainDoc` separately, not
from the IR. The walk therefore has nothing to traverse until the app composes domain *and* contexts
into one IR. This is invisible in a compiler unit test (which can pass `domain` + `contexts`
directly) but breaks in the running app. *Fix:* make BC-M0 explicitly include wiring the composed
IR in the web app — `compileCapabilities(activeDoc, domainDoc, contextsDoc)` — and add an
integration-level test/eval that the entity→context projection resolves end-to-end from the
*app-composed* IR, not just a hand-built fixture. Also specify the projection's index (build
`Map<capabilityId, contextId>` from `groups`⁻¹ and `Map<entityId, capabilityId>` from `owns`⁻¹ once
per compile) so it is O(1) per entity rather than an O(E) scan; and define behavior when a capability
is unassigned (entity resolves to *no* context) or owns is absent.

### Minor

**m1 — `addNode` still silently drops a genuine id clash; a duplicate `bctx:` slug corrupts the graph
before BC7 runs (§4, §6/BC7).**
REV-010 M1 recommended `addNode`'s dedupe-drop become a hard error on genuine clash; the code still
silently drops (`compiler/src/index.ts:76`, `if (!nodes.has(n.id)) nodes.set(n.id, n)`). Two contexts
whose names slug to the same `bctx:<slug>` produce one dropped node + an orphaned `groups` edge. BC7
(`unique`, blocker) catches this at the **doc** level, which mitigates it, but the compiler still
constructs a corrupt IR silently in the interim (and the eval's seeded-defect corpus should exercise
it). *Fix:* restate (from REV-010 M1) that genuine id collisions must be a hard compiler error, and
ensure the duplicate-slug case is a seeded defect in the BC eval corpus (A2).

**m2 — `mockGroupContexts` connected-components partition must be made order-deterministic (§5, R4).**
The mock partitions by connected components over the `depends_on` graph. Component labeling is only
deterministic if node visitation order is fixed — otherwise the *same* graph can yield different
context ids / groupings run-to-run, defeating "deterministic mock / pin snapshot" (R4) and the
`buildHash` stability goal (A3). The existing pure code establishes the pattern (canonical
`id.localeCompare` sort, `compiler/src/index.ts:162-163`). *Fix:* require the mock to sort capability
ids before component discovery and to derive each context's slug from a stable representative (e.g.
the lexicographically-smallest member id), so partition and ids are reproducible.

**m3 — BC8 as written checks provenance *presence* only; no `capabilityId`-resolves / no contentHash
drift (§3, §6/BC8).**
BC8 mirrors DM8/V8 (presence of `meta.derivedFrom`). Note this inherits the *weaker* provenance the
domain shipped: `domain.ts:31,136` emit `derivedFrom: [{ capability: id }]` with **no contentHash**,
so REV-010 M3's drift-detection recommendation was never actually implemented. That is a *consistent*
choice (contexts should match domain, not diverge), but the spec should say so explicitly: BC8
verifies each cited `capability` **resolves** against the current capability ids (not merely that the
array is non-empty), and note that contentHash-based drift detection is deferred uniformly across
DM8/BC8 rather than added only here.

**m4 — Consider emitting entity→context as a *derived IR edge* rather than a view-only computation
(§4).**
The spec makes entity→context "views compute it; the IR does not store it." That honors invariant #1,
but it diverges from how the compiler already handles other derived relationships — `outcome`/`actor`
nodes and their edges are emitted into the IR with `origin: "derived"` (`compiler/src/index.ts:104-116`).
Emitting a derived `bctx --contains--> aggregate` edge (`origin: "derived"`) would keep the
projection in one place, make it visible to validators and the eval (A2/A4), and still round-trip to
nothing (derived, not persisted). *Fix (optional):* consider a derived IR edge over a view-only walk;
if you keep it view-only, state why (e.g. to avoid an IR edge with no `EdgeType`, since `contains`
would be a *new* union member — which reintroduces the union-growth concern m1 of REV-010). Either is
acceptable; make the tradeoff explicit.

### Nit

**n1 — Reaffirm the `groups` edge endpoints and the partition's edge-uniqueness guarantee in §4.**
State explicitly (as REV-010 n1 asked for `owns`): `groups` is `bctx:<ctx> --groups--> <capability>`
(container → member), and note that under the strict partition (BC2 single-membership) each capability
is the `to` of exactly one `groups` edge, so `edgeId(from,to,"groups")` is globally unique with no
extra guard. If Q5 relaxes to multi-membership, the edge stays unique per `(from,to)` pair but the
entity→context projection becomes 1→many and the "clean function" property (and the derived-index in
M4) must be restated as 1→set.

## Answers to §11 open questions (architecture lens)

- **Q2 (inter-context adjacency, read-only):** Cheap and clean architecturally — derive a `derived`
  adjacency hint from cross-boundary `depends_on`/shared-entity edges at compile time; it stores no
  new truth and needs no new artifact. Low risk; fine to include now if UX wants it, but it is pure
  additive projection so it can also land later without rework.
- **Q4 (BC9 cohesion now vs defer):** BC9 is a pure heuristic over the composed IR (like V7 overlap),
  so it is *architecturally* cheap and isomorphic-safe. Ship it at `minor` severity or defer — no
  structural consequence either way. Prefer shipping since it needs no LLM and exercises the composed
  IR the projection depends on.
- **Q5 (strict partition vs multi-membership):** From the architecture lens, **start strict (BC2).**
  Strict single-membership keeps the entity→context projection a clean total function
  (`capability → one context`) and the derived index (M4) a plain `Map`. Multi-membership does *not*
  break `edgeId` uniqueness (still unique per from/to), but it turns the projection into 1→many, makes
  BC2 a warning rather than an invariant, and complicates the eval's `partitionCompleteness` metric.
  Relax later in the deferred context-mapping/shared-kernel spec (N0), not day one.
- **Q1/Q3/Q6:** UX/product lenses; no architectural blocker. Q3 (light glossary) is additive schema
  and folds into the M2 migration story if added.

## Verdict

**Approve-with-changes.** The layer composes cleanly onto the SPEC-001/002 substrate, reuses the
existing `bounded_context`/`groups` unions (no union growth — a real advantage over SPEC-002), and
the `bctx:` namespacing + derived-projection choices are sound and invariant-preserving. Address
**M1** (live-flow invalidation/reconciliation of a *partition* when capabilities change), **M2**
(`computeBuildHash` signature/field-order + third-artifact schema-version/migration, recurring from
REV-010 M5), **M3** (type `contexts` — and `domain` — on the server `StoredProject`, reconciling the
`project.json` storage claim), and **M4** (compose `domain`+`contexts` into one app-level IR so the
entity→context walk has edges to traverse) in the spec text before BC-M0 implementation. The Minor
items (compiler hard-error on clash, mock determinism, BC8 resolution semantics, derived-edge option)
strengthen determinism and the eval but are not gating.
