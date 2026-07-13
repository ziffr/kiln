---
id: REV-020
title: Technical-architecture review of SPEC-004 (Commands & Events)
type: review
status: Approved
version: 1.0.0
author: "Claude (Opus 4.8) — technical-architecture lens"
created: 2026-07-10
updated: 2026-07-10
reviews: SPEC-004
lens: technical-architecture
verdict: Approve-with-changes
related: [SPEC-004]
reviewers: [technical-architecture]
---

# REV-020 — Technical-architecture review of SPEC-004

## Summary

SPEC-004 adds the behaviour facet (commands/events) the way SPEC-002/003 added the domain and
area facets: **same loop, one facet deeper**, reusing the IR spine, pure validators, grounded
provenance, and HITL editing. The core moves are architecturally sound. Extending the domain
artifact (§3) rather than adding a fourth file is the cheaper, more cohesive choice — commands/events
are intrinsically *on* aggregates, and the app already composes the domain IR
(`compileCapabilities(activeDoc, domainDoc, contextsDoc)`, `apps/web/src/App.tsx:122`), so the
REV-015 M4 "compose isn't wired" defect does **not** recur here: the compose path is real. The
`command:`/`event:` namespacing is collision-free against the existing id spaces (bare capability ids;
`aggregate:`/`bctx:`/`domain_object:`/`outcome:`/`actor:`, `packages/compiler/src/index.ts:73-80`,
`packages/ir/src/index.ts:10-16`), and the four new edges each resolve to a unique `edgeId(from,to,type)`.

But the spec is **under-specified — and in two places materially wrong — at the seams that bite when
commands/events ride *inside* a shared, blanket-cleared, cached artifact**:

1. **Invalidation is the REV-015 M1 recurrence, sharper.** Because commands/events live in the domain
   doc, they inherit its lifecycle — and the app **blanket-clears the entire domain to `null` on every
   capability edit** (`App.tsx:169,185,220,239,250`). That already discards regenerable aggregates;
   under SPEC-004 it would silently destroy *authored* commands/events on any capability tweak. And
   *aggregate* delete/rename does **no** reconciliation of the commands/events that target it — they
   dangle. The spec leans on validators to *detect* dangling (CE2/CE3) but never states the live-flow
   *policy*. This needs explicit reconcile-not-clear semantics **and App wiring**.

2. **The buildHash / schema-version mechanism (§4, A3) is described incorrectly.** There is no
   "domain schema-version" input to `computeBuildHash`; the function mixes a *single global*
   `SCHEMA_VERSION` plus `canonical(domain)` (`compiler/src/index.ts:20,87-91`). What actually
   distinguishes a v0.2 domain doc is the doc's own `version` field and the new `commands`/`events`
   keys *riding inside* `canonical(domain)` — not the lever the spec names. This is the third recurrence
   of the missing per-artifact schema-version / migration registry (REV-010 M5, REV-015 M2).

3. **The `.vbd/` store — whose entire job is buildHash-on-load — never sees the domain.** `loadIR`
   and `isCacheFresh` call `computeBuildHash(doc)` / `compileCapabilities(doc)` with **capabilities
   only** (`packages/store/src/index.ts:38,52,63`). Domain (and therefore commands/events) can change
   without invalidating the cache. A3's "buildHash distinguishes domain v0.1/v0.2" is true for the
   app's in-memory compile but **false for the one component named after the guarantee.**

None are fatal; all are fixable in spec text (plus small App/store wiring the milestones must name).
Verdict: **Approve-with-changes.** Findings verified against the real code
(`packages/ir/src/index.ts`, `packages/compiler/src/index.ts`, `packages/validation/src/index.ts`,
`packages/store/src/index.ts`, `packages/skills/src/domain.ts`, `apps/service/src/workspaces.ts`,
`apps/web/src/projects.ts`, `apps/web/src/App.tsx`), not the SPEC idealization.

## Findings

### Major

**M1 — Invalidation/reconciliation of commands/events is unspecified; the live flow both over-clears
and under-reconciles (§4 last bullet, §6 CE2/CE3, §7; recurrence of REV-015 M1).**
Commands/events live in the domain doc (§3), so they share its snapshot lifecycle — and that lifecycle
is a **blanket clear**. Every capability mutation passes `domain: null`: `setNarrative`
(`App.tsx:169`), `generate` (`:185`), `editCapability` (`:220`), `deleteCapability` (`:239`),
`addCapability` (`:250`). For SPEC-002 that only discards regenerable aggregates; under SPEC-004 the
same clear **destroys authored, LLM-generated commands/events** on any capability edit — the exact
"authored elements only change via authored intent" violation REV-015 M1 called out, now with more
expensive payload. Conversely, *aggregate* edits do **not** reconcile commands/events at all:
`deleteAggregate` (`:263-273`) filters the aggregate and cleans `references`, but leaves any command
with `aggregate: <deleted>` (→ CE2) and any event with `aggregate: <deleted>` (→ CE3) **dangling**; a
rename via `editAggregate` (`:258-262`) dangles `changes`/`on` edges the same way.
*Fix:* specify the reconciliation policy in §7 and name the App wiring in a milestone
(**reconcile, don't blanket-clear**, mirroring the areas fix at `App.tsx:224-241`): on aggregate delete,
drop (or flag) the commands/events targeting it; on aggregate rename, re-point `changes`/`on`; on
capability delete, drop commands whose `capability` is gone. State that the compiler does **not**
cascade-delete authored commands/events when their aggregate/capability disappears (CE2/CE3 flag it;
the human resolves) — the non-cascade rule of REV-010 m3 / REV-015 M1. Add an eval/test: "delete an
aggregate → CE2/CE3 fire, commands/events reconcile, no silent loss of authored elements." Note this
is the strongest architectural argument for Q1 (see below): a *separate* event_model artifact would let
commands/events survive capability edits independently; extending the domain doc is acceptable **only
if** the blanket clear is replaced by reconciliation.

**M2 — The buildHash "domain schema-version" lever named in §4/A3 does not exist; the real mechanism
is content in `canonical(domain)` (recurrence of REV-010 M5 / REV-015 M2).**
§4 says "bump the domain **schema-version** so the hash distinguishes v0.1 from v0.2 domain docs," and
A3 makes it a go/no-go. But `computeBuildHash(doc, domain?, contexts?)` mixes
`${canonical(doc)}|${domainPart}|${contextsPart}|${COMPILER_VERSION}|${SCHEMA_VERSION}`
(`compiler/src/index.ts:87-91`) — there is **no per-artifact domain schema-version parameter.** Two
distinct levers exist and the spec conflates them: (a) the domain doc's own `version` field
(`DomainDoc.version`, `compiler/src/index.ts:53`; stamped `"0.1"` by the mock,
`skills/src/domain.ts:48,111,168`) rides inside `canonical(domain)` at `:89`, so bumping it — *and* the
mere presence of the new `commands`/`events` keys — already changes the hash; (b) the single global
`SCHEMA_VERSION = "0.2"` (`compiler/src/index.ts:20`), a compiler-owned, **all-projects** cache-buster.
So A3 is *satisfiable* (a v0.2 doc differs in content), but the mechanism the spec describes is wrong
and could lead an implementer to add a nonexistent parameter or to skip the global bump when the
*shape* (not content) changes. *Fix:* in §4 state precisely which lever CE-M0 uses — recommended: bump
the global `SCHEMA_VERSION` when the domain *schema shape* moves to v0.2 (invalidates all cached IR,
which is correct for a schema migration), and note that per-doc content changes already invalidate via
`canonical(domain)`. Acknowledge this is the same per-artifact schema-version / migration-registry debt
flagged in REV-010 M5 and REV-015 M2 — pay it once for all three artifacts or explicitly defer with a
tracking note; do not describe a third phantom version stream.

**M3 — "Generate behaviour" must MERGE into the existing domain, not replace it; patch semantics are
unspecified (§5, §7, CE-M3/M4).**
The `EventModeler` output is "commands + events for the given aggregates" (§5) — it does **not** return
aggregates. But the only precedent, `generateDomainModel`, does `patchActive({ domain: data.doc })`
(`App.tsx:206`) — a **full replace** of the domain doc. If "Generate behaviour" copies that pattern with
an events-only payload, it will **overwrite `domain.aggregates` with nothing** and destroy the entire
entity layer. *Fix:* §7 must specify that the behaviour generation patch is a **merge** —
`patchActive({ domain: { ...domain, commands: data.commands, events: data.events } })` — preserving
`aggregates`, and that `/api/events` returns commands/events (not a whole DomainDoc). State whether a
re-generate replaces or appends existing authored commands/events (recommend: replace only the
`origin: llm` ones, keep `authored` — the supersede discipline of REV-010 M2). Add a test that
generating behaviour twice, with a hand-edit in between, does not clobber the authored edit or the
aggregates.

**M4 — The `@kiln/store` cache never mixes the domain, so commands/events cannot invalidate it
(§4, A3).**
`loadIR` computes `expected = computeBuildHash(doc)` and recompiles via `compileCapabilities(doc)` with
**capabilities only** — no `domain`, no `contexts` (`store/src/index.ts:38,52`); `isCacheFresh` does the
same (`:63`). The compiler signature was extended for domain/contexts (REV-015 M2) but these call sites
were **never updated**, so a change to aggregates/commands/events does **not** change the store's
buildHash and a stale `ir.json` is served. A3's "buildHash distinguishes domain v0.1/v0.2" is therefore
false precisely at the buildHash-on-load boundary (ADR-002). The store may be dormant on today's
localStorage path (ADR-005), but it is governed and is where A3 is meant to hold. *Fix:* either extend
`loadIR`/`isCacheFresh` to take `domain?`/`contexts?` and pass them to `computeBuildHash`/
`compileCapabilities`, or state explicitly in §4 that `@kiln/store` is out of the M2 live path and this
is tracked debt (with a pointer to REV-015 M2). Do not let A3 assert a guarantee the store code
contradicts.

### Minor

**m1 — CE5.unique must guarantee per-namespace uniqueness to prevent silent IR node drop; the
`addNode` hard-error debt (REV-010 m1) is still unimplemented (§4, §6/CE5).**
Two commands whose ids slug to the same `command:<slug>` collide in the flat node map, and `addNode`
still **silently drops** the second (`compiler/src/index.ts:97-99`, `if (!nodes.has(n.id)) …`) — the
exact silent-corruption REV-010 m1 asked to make a hard error, never done. CE5.unique as written ("unique
across **both** commands and events") is *stricter* than the IR needs (a `command:qualify_lead` and an
`event:qualify_lead` do not collide across namespaces) yet does not clearly state the load-bearing part:
ids must be **unique within each namespace** (command among commands, event among events) or a node is
lost before CE5 runs. *Fix:* restate CE5.unique as "unique within namespace (blocker, prevents IR node
drop); cross-namespace uniqueness is an additional modeling-clarity rule." Restate (from REV-010 m1) that
`addNode` must hard-error on a genuine id clash, and seed the duplicate-command-slug defect into the
CE eval corpus (A2).

**m2 — Extend `DomainDoc` with OPTIONAL `commands?`/`events?` for back-compat coerce; confirm the type
contract across the stack (§3, R4).**
R4's "tolerant coerce (absent = empty)" works only if the type keeps the fields optional and every reader
defaults them: the compiler must read `domain?.commands ?? []` / `domain?.events ?? []` exactly as it does
`domain?.aggregates ?? []` (`compiler/src/index.ts:166`), and `validateEvents` must tolerate
`domain.commands === undefined`. Storage already round-trips them (`StoredProject.domain?: unknown`,
`workspaces.ts:24-26`; web `Project.domain?: DomainDoc | null`, `projects.ts:21`), so extending
`DomainDoc` with optional fields keeps both typed with no new persistence field needed — a genuine
advantage of the extend-the-domain-doc choice over a fourth artifact (which would have re-run the
REV-015 M3 typing exercise). *Fix:* §3 should state the `DomainDoc` extension is additive/optional and
that a v0.1 snapshot (no commands/events) must compile and validate to zero command/event findings; add
that as a CE-M0/CE-M2 test.

**m3 — CE6 provenance should check resolution, not mere presence; contentHash drift is deferred
uniformly (§3, §6/CE6).**
CE6 mirrors V8/DM8/BC8 (presence of `meta.derivedFrom`) and the §3 example uses the same weak shape as
domain — `derivedFrom: [{ capability: lead_management }]` with **no contentHash** (matching
`skills/src/domain.ts:31` and the DM8/BC8 lineage, REV-015 m3). That is a *consistent* choice, but the
spec should say so: CE6 verifies the cited `capability` **resolves** against the current capability ids
(not merely that the array is non-empty), and contentHash-based drift detection is deferred **uniformly**
across V8/DM8/BC8/CE6 rather than invented only here.

**m4 — Reaffirm additive-union discipline + exhaustive-switch `default` guards for the new
node/edge types (§4; recurrence of REV-010 m1).**
Adding `command|event` to `NodeType` and `handles|changes|emits|on` to `EdgeType` is genuine union
growth (the spec correctly notes these are *not* pre-reserved, unlike SPEC-003's `bounded_context`/
`groups`). *Fix:* state that growth stays strictly additive and that any `switch`/dispatch over
`NodeType`/`EdgeType` in web rendering, layout, or validation must carry a `default` so a later facet
cannot break older consumers; confirm the map renderer and any type-styled node component degrade
gracefully for the two new node types (unstyled fallback rather than throw).

### Nit

**n1 — State the endpoints, direction, and edge-uniqueness of `handles|changes|emits|on` in §4 (as
REV-010 n1 / REV-015 n1 asked for `owns`/`groups`).**
Make explicit: `capability --handles--> command:<id>`, `command:<id> --changes--> aggregate:<id>`,
`command:<id> --emits--> event:<id>` (0..n, one edge per emitted event), `event:<id> --on-->
aggregate:<id>`. Note that a command has exactly one capability and one aggregate, and an event exactly
one aggregate, so `handles`/`changes`/`on` are each unique under `edgeId(from,to,type)` with no extra
guard, and `emits` is unique per `(command,event)` pair — consistent with the container→member
direction of `owns`/`groups`. This removes any ambiguity for CE2–CE4's endpoint tests.

## Answers to §11 open questions (architecture lens)

- **Q1 (extend domain doc vs separate `event_model` artifact):** From the architecture lens, **extend the
  domain doc — but only after M1 is fixed.** Extending is cheaper on every axis: no fourth artifact, no
  new `computeBuildHash` parameter, no new `Project`/`StoredProject` field, no new invalidation stream,
  and cohesion is real (commands/events *are* on aggregates). The one genuine cost is the blanket-clear
  coupling (M1): sharing the domain snapshot means a capability edit currently nukes authored
  commands/events. A separate artifact buys independent lifecycle at the price of a fourth compose input
  and a fourth cache stream. Net: extend, and pay for it with reconcile-not-clear (M1); do **not** add a
  fourth artifact.
- **Q2 (event-consumers hint):** Cheap, clean, additive — a `derived` projection over `consumes`/`emits`
  overlap that stores no new truth (like the REV-015 Q2 adjacency hint). Fine to include read-only now or
  defer with policies (N0); no rework either way. If emitted as an IR edge it would need a *new* EdgeType
  (`reacts_to`?), reintroducing union growth — so prefer a view-only computation or defer.
- **Q3 (command payloads):** Defer (N1). It is pure additive schema evolution; with the M2 migration
  story in place it folds into a later `version` bump. Reserve the field shape (allow a future
  `inputs?`) so the migration stays additive.
- **Q4 (aggregate lifecycle/state machines):** Defer (N4). State machines add a *derived* legality check
  over the composed IR, not new authored truth; no structural consequence to deferring.
- **Q6 (deterministic imperative/past-tense naming validator):** **Leave it to the review lens.** A
  deterministic tense/mood check is English-centric and brittle, and this product's labels are localized
  (the UI ships German — "Verhalten generieren", §7); a validator would false-positive on non-English
  command/event names. Keep CE7/CE8 (structural coverage smells) deterministic; keep naming in the
  human/LLM review lens.
- **Q5 (UI density):** UX lens; no architectural blocker.

## Verdict

**Approve-with-changes.** The behaviour facet composes cleanly onto the SPEC-001/002/003 substrate; the
`command:`/`event:` namespacing and the four new edges are collision-free and uniquely identified, and
extending the domain doc is the right, cheaper call. Address **M1** (reconcile-not-clear for
commands/events on aggregate/capability mutation, with named App wiring — the REV-015 M1 recurrence),
**M2** (state the *real* buildHash lever — `canonical(domain)` content and/or the global `SCHEMA_VERSION`
bump — not a phantom per-artifact "domain schema-version"; the REV-010 M5 / REV-015 M2 debt), **M3**
(merge behaviour generation into the existing domain rather than replacing it), and **M4** (the `@kiln/store`
buildHash-on-load never sees the domain, so A3 fails at the cache boundary) in the spec text and
milestones before CE-M0. The Minor items (per-namespace CE5 + `addNode` hard-error, optional-field
coerce/typing, CE6 resolution semantics, additive-union `default` guards) strengthen determinism and the
eval but are not gating.
