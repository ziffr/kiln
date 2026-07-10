---
id: REV-025
title: Technical-architecture review of SPEC-005 (Policies & Reactions)
type: review
status: Approved
version: 1.0.0
author: "Claude (Opus 4.8) — technical-architecture lens"
created: 2026-07-10
updated: 2026-07-10
reviews: SPEC-005
lens: technical-architecture
verdict: Approve-with-changes
related: [SPEC-005]
reviewers: [technical-architecture]
---

# REV-025 — Technical-architecture review of SPEC-005

## Summary

SPEC-005 adds the **policy / reaction** facet the way SPEC-002/003/004 added the domain, area, and
behaviour facets: **same loop, one facet deeper**, reusing the IR spine, pure validators, grounded
provenance, HITL editing, and text-as-truth. The core composition moves are architecturally sound and,
notably, **two of the seams REV-020 flagged on SPEC-004 are now genuinely closed in code** — which
directly de-risks SPEC-005:

- **The `.vbd/` store now threads the domain.** `loadIR`/`isCacheFresh` take `domain?`/`contexts?` and
  pass them into `computeBuildHash`/`compileCapabilities` (`packages/store/src/index.ts:40,44,58,64,69`).
  Because policies ride inside the domain doc, they enter `canonical(domain)` and therefore invalidate
  the cache automatically. REV-020 M4 does **not** recur.
- **The buildHash claim is correct this time.** `computeBuildHash(doc, domain?, contexts?)` mixes
  `canonical(domain)` (`packages/compiler/src/index.ts:135-138`), so a `policies` array riding inside
  the domain doc changes the hash — A3 is genuinely satisfiable. (SPEC-004's §4 named a phantom
  parameter; SPEC-005's §4 does not repeat that error — see m1 for the one residual imprecision.)

The **union growth is clean and low-risk.** `policy` is additive to `NodeType`
(`packages/ir/src/index.ts:10-18`) and `when`/`then` to `EdgeType` (`:20-31`); `policy:` is collision-free
against every existing id namespace (bare capability ids; `aggregate:`/`bctx:`/`domain_object:`/`outcome:`/
`actor:`/`command:`/`event:`, `packages/compiler/src/index.ts:113-128`). The map renderer is a **type
allowlist**, not a switch — it filters to `capability` nodes and `depends_on` edges
(`apps/web/src/components/CapabilityMap.tsx:65,68`) — so a new node/edge type degrades gracefully by
construction (the REV-020 m4 "default-guard" worry is moot for the map). The `when`/`then` edges each
resolve to a unique `edgeId(from,to,type)` with no extra guard (one `on`, one `then` per policy). The
reaction chain (`command → emits → event → when → policy → then → command`) is a **cheap derived
projection** — array joins over composed edges, no new stored truth.

But the spec is **under-specified at the same two live-flow seams REV-020 raised for SPEC-004 — and
those App fixes were never actually implemented**, so policies inherit the unfixed defects with a more
expensive, cross-entity payload:

1. **Invalidation is the REV-020 M1 recurrence — still open in code.** The App still **blanket-clears
   the entire domain to `null` on every capability edit** (`apps/web/src/App.tsx:179,195,230,249,260`).
   Under SPEC-005 that silently destroys authored, LLM-grounded, cross-entity **policies** on any
   capability tweak. And a behaviour re-generation swaps commands/events while preserving policies
   (`App.tsx:326`), leaving those policies dangling against renamed/removed event/command ids
   (PL2/PL3 detect; nothing reconciles). The spec leans on validators to *detect* dangling but never
   states the live-flow *policy*.

2. **"Generate automations" merge semantics are unspecified (REV-020 M3 recurrence).** The precedent
   `generateEvents` returns a **fully merged** DomainDoc — `{ ...domain, commands, events }`
   (`packages/skills/src/events.ts:201-202`) — so `patchActive({ domain: data.doc })` preserves
   aggregates (`App.tsx:326`). PolicyModeler must mirror this exactly: return `{ ...domain, policies }`
   and be POSTed the **behaviour** doc (with commands/events), not a bare domain. If an implementer
   instead returns *policies only* and full-replaces, it wipes `aggregates`/`commands`/`events`.

Neither is fatal; both are fixable in spec text plus the small App wiring the milestones must name.
Verdict: **Approve-with-changes.** Findings verified against the real code
(`packages/ir/src/index.ts`, `packages/compiler/src/index.ts`, `packages/validation/src/index.ts`,
`packages/store/src/index.ts`, `packages/skills/src/events.ts`, `apps/service/src/server.ts`,
`apps/web/src/App.tsx`, `apps/web/src/components/{CapabilityMap,NodeDetail}.tsx`), not the SPEC
idealization.

## Findings

### Major

**M1 — Invalidation/reconciliation of policies is unspecified; the live flow blanket-clears the domain
on capability edits and dangles policies on behaviour re-gen (§4, §6 PL2/PL3, §7; recurrence of
REV-020 M1, still unimplemented in App code).**
Policies live in the domain doc (§3), so they share its snapshot lifecycle — and that lifecycle is a
**blanket clear**. Every capability mutation still passes `domain: null`: `setNarrative`
(`App.tsx:179`), `generate` (`:195`), `editCapability` (`:230`), `deleteCapability` (`:249`),
`addCapability` (`:260`). REV-020 M1 asked for reconcile-not-clear here and it was **only applied to
`contexts`** (`deleteCapability` reconciles areas at `:236-245` but still nulls `domain`); the domain
blanket-clear survived. Under SPEC-005 that clear now destroys **authored, grounded, cross-entity
policies** (plus the aggregates/commands/events) on any capability edit — the exact "authored elements
change only via authored intent" violation (golden invariant #2), with the most expensive payload yet.
Separately, `generateBehaviour` (`App.tsx:326`) swaps commands/events via `{ ...domain, commands,
events }` (`events.ts:201`) while spreading existing policies through `...domain` — so a re-gen keeps
policies but re-mints the event/command ids they reference, dangling them (PL2/PL3). And
`deleteAggregate` (`App.tsx:273-283`) reconciles only `references`, leaving any policy whose `on`/`then`
targeted a command/event on the deleted aggregate dangling.
*Fix:* specify the reconciliation policy in §7 and name the App wiring in a milestone (**reconcile,
don't blanket-clear**, mirroring the areas reconcile at `App.tsx:236-245`): on capability/aggregate
delete or rename, drop-or-flag the policies whose `on`/`then` no longer resolve; on behaviour re-gen,
re-point or flag policies against renamed event/command ids. State that the compiler does **not**
cascade-delete authored policies when their event/command disappears (PL2/PL3 flag it; the human
resolves — the non-cascade rule of REV-010 m3 / REV-020 M1). Add a test: "delete an aggregate →
PL2/PL3 fire, policies reconcile, no silent loss of authored policies." This is the strongest argument
the blanket clear must finally be replaced, not merely re-flagged a fourth time.

**M2 — "Generate automations" must MERGE policies into the existing behaviour; the patch shape is
unspecified (§5, §7, PL-M3/M4; recurrence of REV-020 M3, now resolvable by faithful mirroring).**
PolicyModeler output is "policies" (§5) — it does **not** return aggregates/commands/events. The
working precedent is server-side merge: `generateEvents` returns `doc: { ...domain, commands, events }`
(`packages/skills/src/events.ts:201-202`), the service echoes it (`apps/service/src/server.ts:228,234`),
and the App does `patchActive({ domain: data.doc })` (`App.tsx:326`) — aggregates survive because the
server merged them. SPEC-005 must state that `/api/policies` + `generatePolicies` return
`{ ...domain, policies }` (preserving `aggregates`/`commands`/`events`) and that the App POSTs the
**behaviour** doc (i.e. `behaviourDoc`, which carries commands/events — `App.tsx:122-125`), not the bare
`domainDoc`, since policies reference events/commands. If an implementer "mirrors the others" naively —
returns policies only and full-replaces `domain` — it destroys the entire entity+behaviour layer.
*Fix:* §7 must specify the merge (`{ ...domain, policies: data.policies }`) and that a re-generate
replaces only `origin: llm` policies while preserving hand-authored ones (the supersede discipline of
REV-010 M2). Add a test: generating automations twice, with a hand-edited policy in between, clobbers
neither the authored policy nor the aggregates/commands/events.

### Minor

**m1 — The buildHash "domain schema-version bump" lever (§4, §9 PL-M0) is imprecise; state which lever
and settle the migration-registry debt (recurrence of REV-020 M2 / REV-015 M2 / REV-010 M5).**
§4 says the domain "version bump distinguishes v0.2 → v0.3" and PL-M0 lists a "domain schema-version
bump." What actually invalidates the hash is the **content** riding inside `canonical(domain)` — the new
`policies` array — not the `version` field per se (`compiler/src/index.ts:135-138`); a doc that gains
policies but forgets to bump `version` still re-hashes. Separately, the compiler-owned global
`SCHEMA_VERSION = "0.2"` (`compiler/src/index.ts:20`) is **not** touched by a domain-doc `version` of
"0.3", and adding an optional `policies` key is an additive shape change that old (policy-less) docs
still compile against. *Fix:* in §4/PL-M0 state precisely: (a) content invalidation via
`canonical(domain)` already covers per-doc policy changes; (b) decide whether the *shape* change bumps
the global `SCHEMA_VERSION` (invalidating all cached IR — correct for a schema migration) or is
explicitly deferred as the same per-artifact schema-version / migration-registry debt flagged three
times before. Do not describe the `version` field as *the* invalidation mechanism. Name who stamps
`version: "0.3"` (the mock currently stamps `"0.1"`, `skills/src/domain.ts`), and add a back-compat test:
a v0.2 domain doc (no `policies`) compiles and validates to **zero** policy findings.

**m2 — Extend `DomainDoc` with an OPTIONAL `policies?` field; confirm the tolerant-coerce contract
(§3, §4).**
The extend-the-domain-doc choice is right (policies reference the doc's events/commands and need no new
compose input, no new `computeBuildHash` parameter, no new `Project`/`StoredProject` field — the domain
already round-trips as `unknown`/`DomainDoc | null`). This holds **only** if `policies?` stays optional
and every reader defaults it: the compiler must iterate `domain?.policies ?? []` exactly as it does
`domain?.commands ?? []` (`compiler/src/index.ts:233,246`), and `validatePolicies` must tolerate
`domain.policies === undefined`. *Fix:* §3 should state the `DomainDoc` extension is additive/optional
(add `PolicyInput { id; name; on; then; condition?; meta? }`) and that a policy-less snapshot compiles
and validates cleanly — the same coerce discipline REV-020 m2 asked for `commands?`/`events?`.

**m3 — `addNode` silently drops a duplicate `policy:<id>`; PL4.unique detects it too late (§4, §6/PL4;
recurrence of REV-010 m1).**
Two policies whose ids slug to the same `policy:<slug>` collide in the flat node map and `addNode`
**silently drops the second** (`compiler/src/index.ts:146`, `if (!nodes.has(n.id)) …`). PL4.unique
(blocker) reports the duplicate, but the node is already lost before validation runs — so the IR is
already corrupt when the finding fires. *Fix:* restate (from REV-010 m1) that `addNode` must hard-error
on a genuine id clash rather than silently drop, and seed a duplicate-policy-id defect into the eval
corpus (A2). Add a `policyNodeId(id) = policy:${slug(id)}` helper mirroring `commandNodeId`/`eventNodeId`
(`compiler/src/index.ts:123-128`).

**m4 — The reaction chain is a cheap projection but spans aggregates; the "under each event" UI needs
the whole behaviour, and additive-union discipline should be reaffirmed (§4, §7).**
The chain `command → emits → event → when → policy → then → command` is cheap (array joins over
composed edges), but a policy's `then` command routinely sits on a **different** aggregate — that is the
whole point (cross-entity). Today `EntityBehaviour` is passed only the **per-aggregate slice**
(`NodeDetail.tsx:255-256`, `commands.filter(c => c.aggregate === a.id)` / `events.filter(...)`), so it
cannot resolve a cross-entity `then` command's name/area. *Fix (arch note for the UX lens):* to render
"→ then: Schedule Installation (Delivery)" under an event, the panel must receive the full `policies`
list plus a command→aggregate→area lookup, not just this aggregate's commands/events. Separately, keep
union growth strictly additive and confirm any future `switch` over `NodeType`/`EdgeType` in web
rendering/layout/validation carries a `default`; the map is safe today because it is an allowlist filter
(`CapabilityMap.tsx:65,68`), not a switch.

**m5 — PL7 cycle detection is feasible but is a multi-relation graph, not a policy-only one (§6/PL7,
R5).**
PL7 ("A triggers B triggers A") is not a cycle over policy nodes alone: the causal edge is
`command_X --emits--> event_E`, then `policy_P{on: E, then: command_Y}` — so the runaway-loop graph is
`command → event → policy → command`. Build the command→command adjacency by joining `commands.emits`
with `policies{on,then}`, then reuse the exact DFS three-colour cycle detection already proven in
`validateV6` (`packages/validation/src/index.ts:120-149`). *Fix:* state in §6 that PL7 walks the joined
behaviour graph (not a policy-only graph) and reuses V6's coloring; note it can only see cycles whose
causal links are explicit in `emits` (a command that emits nothing closes no loop) — acceptable for a
minor smell, worth a codegen note per R5.

### Nit

**n1 — State the endpoints, direction, and edge-uniqueness of `when`/`then` in §4 (as REV-010 n1 /
REV-020 n1 asked for the prior edges).**
Make explicit: `event:<on> --when--> policy:<id>` and `policy:<id> --then--> command:<then>`. A policy
has exactly one `on` and one `then`, so each edge is unique under `edgeId(from,to,type)` with no extra
guard; multiple policies may share a trigger event or a target command (distinct policy ids → distinct
edges) with no collision. This removes any ambiguity for PL2/PL3's endpoint tests and confirms the
`when`/`then` direction matches the container/producer→member convention of the existing edges.

## Answers to §11 open questions (architecture lens)

- **Q1 (stateless rule vs process manager):** Confirm stateless single `event→command` now (N0). A
  stateless routing rule needs **no new stored truth beyond the policy node + two edges** and composes
  as a pure derived chain; a stateful saga would add per-instance state, a lifecycle, and an
  invalidation stream — a different substrate. Defer cleanly.
- **Q2 (condition as text vs structured predicate):** Keep plain text (N1) from the architecture lens.
  A structured predicate reintroduces an entity/attribute reference graph (its own referential-integrity
  validators + invalidation when attributes change) for no compile-time benefit until codegen evaluates
  it. Reserve the field shape (`condition?: string` now) so a later `condition?: Predicate` is an
  additive migration.
- **Q3 (where reactions live in UI):** Under the triggering event is fine, but see m4 — it is a
  cross-entity lookup, so pass the whole behaviour to the panel. Bidirectional (also under the reacting
  command) is pure additional read-only projection; defer without rework risk.
- **Q4 (codegen shape):** Out of the arch-lens critical path; per-area event-handler modules keep the
  generated code aligned with the area partition already in the IR (`groups` edges), which is the
  lower-coupling choice. Non-blocking.
- **Q6 (cross-area policy annotation):** Cheap derived flag — a policy whose `on` event's aggregate and
  `then` command's aggregate fall in different `bctx:` areas. It stores no new truth (computed from
  `groups` + `when`/`then`), so include read-only or defer; no rework either way.

## Verdict

**Approve-with-changes.** The policy facet composes cleanly onto the SPEC-001–004 substrate: the
`policy:` namespacing and the `when`/`then` edges are collision-free and uniquely identified, the
reaction chain is a cheap derived projection, the union growth is safe against the allowlist-based map,
and — unlike SPEC-004 — the buildHash claim is accurate and the `.vbd/` store already threads the domain
(REV-020 M2/M4 do **not** recur). Address **M1** (reconcile-not-clear for policies on
capability/aggregate mutation and behaviour re-gen, with named App wiring — the REV-020 M1 recurrence
that was never implemented) and **M2** (specify the server-side merge `{ ...domain, policies }` + POST
the behaviour doc, so "Generate automations" cannot wipe the entity/behaviour layer — the REV-020 M3
recurrence) in the spec text and milestones before PL-M0. The Minor items (precise buildHash lever +
migration debt, optional-field coerce, `addNode` hard-error, cross-entity panel data + additive-union
discipline, multi-relation PL7 graph) strengthen determinism and the eval but are not gating.
