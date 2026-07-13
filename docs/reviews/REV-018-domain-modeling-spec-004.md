---
id: REV-018
title: Domain-Modeling (DDD / Event-Modeling) Review of SPEC-004
type: review
status: Approved
version: 1.0.0
author: "Claude (Opus 4.8) — domain-modeling lens"
created: 2026-07-10
updated: 2026-07-10
reviews: SPEC-004
lens: domain-modeling
verdict: Approve-with-changes
related: [SPEC-004]
reviewers: [domain-modeling]
---

# REV-018 — Domain-Modeling (DDD / Event-Modeling) Review of SPEC-004

## Summary

SPEC-004 adds the verbs and the facts — commands and events on the aggregates SPEC-002 shipped —
and as a *mechanism* it is again the cleanest reuse in the series: two node kinds, four edges,
`validateEvents`, a grounded-provenance skill, a deterministic mock, in-context UI, a gold-free eval.
The loop is right, the compose plan is right, and one central DDD invariant is *correct*: **a command
targets exactly one aggregate** is the transactional-consistency-boundary rule stated properly — a
command handled by an aggregate root mutates exactly that root. I have no quarrel with the machinery.

Judged as an *event model*, though, the spec makes three choices that sit exactly where the modeling
lives, and repeats two failure modes its predecessors were caught on.

**First, it is commands-first; event storming is events-first.** §5's job — "for each aggregate,
propose the commands that change it… and the events they emit" — anchors on the aggregate and reaches
for commands, then derives events. Brandolini's method (and REV-007 Q1's explicit recommendation for
this very layer) is the reverse: discover the past-tense **events** first (the least-ambiguous unit —
a fact is a fact; the command that caused it is often several), then the commands, then the policies.
The tell is the mock: `create_<agg>` / `update_<agg>` emitting `<agg>_changed` is CRUD-as-events —
precisely the non-domain-event anti-pattern event storming exists to prevent — and it will anchor the
eval (A2) and the operator's expectations on facts that carry no business meaning.

**Second, "a command is an action that changes an aggregate" (§0) is too coarse.** In DDD/CQRS a
command is a *request* expressed in the imperative that the aggregate may **accept** (emitting events)
or **reject** (an invariant/validation failure — emitting nothing, or a failure fact). Baking success
into the definition makes "every command emits ≥1 event" look mandatory when a reject path legitimately
emits none, and it erases the command-as-intent / event-as-outcome distinction that the whole layer
turns on.

**Third, and most consequential: nothing constrains a command's emitted events to the command's own
aggregate** — the exact REV-007 D5 finding, recurring. CE4 checks only that the emitted event
*exists*. So `qualify_lead` (aggregate `lead`) may `emit` `customer_created` (aggregate `customer`)
and pass every validator — a cross-aggregate effect, which in DDD is a **policy / saga**, the thing
§N0 explicitly defers. The model can therefore encode sagas as if they were direct emissions, quietly
breaking the aggregate boundary and pre-empting the deferred policy layer through an unmodeled
shortcut. This must be validated before build.

Two predecessor failure modes recur and are named in the task: **provenance is circular again**
(CE6 grounds a command/event to its *own* capability — the REV-013 C3 tautology, and it even regresses
from the anchor-based shape the codebase already evolved BC8 into), and **the layer is a set of
islands** because policies (N0) are fully deferred with no cheap derived reaction hint — the REV-013 C4
situation, which the spec itself half-acknowledges in Q2.

None of this invalidates the approach; all of it is fixable in-spec, most of it cheaply, and the
correct-consistency-boundary command rule is a good foundation to build the fixes on.
**Approve-with-changes.** Findings are ordered by severity; the required questions (Q2, Q4, Q6, and
the events-first / command-always-changes questions) are answered inline and collected below.

---

## Findings

### CE-C1 — Generation is **commands-first**; event storming (and REV-007 Q1) is **events-first**
- **Severity:** Major
- **Location:** §0 (Framing), §5 (skill "Job"), §5 (mock), §9 CE-M1
- **Issue:** §5 instructs the model to walk each aggregate, propose the commands that change it, and
  then the events they emit — aggregate→command→event. Event storming runs the opposite way for a
  reason: **domain events** (past-tense facts) are the least-ambiguous unit and the primary artifact;
  commands and aggregates are discovered *from* them. REV-007 Q1, reviewing this exact deferred layer,
  recommended verbatim: "anchor on events… derive commands from events, make commands optional." Two
  concrete harms follow from the current order. (a) Commands-first invites CRUD generation — and the
  mock proves it: `create_<agg>`/`update_<agg>` → `<agg>_changed`. `<agg>_changed` is not a domain
  event; it names a table write, not a business fact. Because the mock and the seeded-defect corpus
  anchor the eval (A2) and the "substantially right" judgment (A1), this bakes non-domain events into
  the success gate. (b) Events ground to evidence far better than commands do (see CE-C4): an event is
  the fact that realizes an **outcome** (SPEC-001 already models outcomes + `serves` edges) or that
  the narrative reports in past tense — a natural provenance anchor that commands lack.
- **Recommendation:** Reorder §5 to events-first: for each aggregate, first derive the **domain
  events** grounded in the capability's outcomes / narrative facts, then the command(s) that cause each
  event. Keep commands (do not drop them — they are the API seam) but generate them *from* events.
  Rewrite the mock to emit a business-meaningful pair (e.g. an aggregate `lead` yields event
  `lead_qualified` caused by command `qualify_lead`), not `create/update/_changed`, so the eval anchors
  on domain events. This is the SPEC-002 aggregates-first lesson applied to ordering: model the
  least-ambiguous thing first.

### CE-C2 — "A command **changes** an aggregate" is too coarse; a command is a **request that may be rejected**
- **Severity:** Major
- **Location:** §0 (command definition), §5, §8 A4, §6 CE8
- **Issue:** §0 defines a command as "an imperative action that changes an aggregate." In DDD/CQRS a
  command is an imperative *request*; the aggregate root decides whether to accept it. A rejected
  command (invariant violation, guard failure) changes nothing and emits no event — or emits a failure
  fact. Defining commands as always-changing has three effects: it makes an implicit "every command
  emits ≥1 event" feel obligatory (it is not — a reject path emits none); it collapses the
  command(intent) / event(outcome) distinction that is the reason to have both node kinds; and it
  frames the aggregate as a passive mutation target rather than the **decision-maker** that enforces
  invariants (the actual DDD role of the aggregate root, and the reason the consistency boundary
  exists). This is the analog of REV-007 D2 (an invariant that reads as always-true will make the LLM
  fabricate to satisfy it — here, invent a mutation and an event for every command).
- **Recommendation:** Reframe §0: "a command is an imperative **request** to change an aggregate,
  which the aggregate may accept — emitting one or more events — or reject." Do **not** add a hard
  "command emits ≥1 event" validator; instead a *warning* (dual to CE8): a command that emits **no**
  event *anywhere in the model* is a smell (what fact resulted?), while a command that emits ≥1 on some
  path is fine. Keep the emit cardinality 0..n at the model level, but say why 0 is legal (reject
  paths, or query-shaped commands you have chosen not to model as events).

### CE-C3 — A command's emitted events are not constrained to the command's own aggregate (unmodeled saga; REV-007 D5 recurrence)
- **Severity:** Major
- **Location:** §4 (edges `changes`, `emits`, `on`), §6 CE4, §2 N0
- **Issue:** `changes` ties a command to one aggregate (correct). `on` ties an event to one aggregate
  (correct). `emits` ties a command to the events it produces, and CE4 checks only that the emitted
  event *exists*. Nothing requires the emitted event to be `on` the *same* aggregate the command
  `changes`. So `qualify_lead` (`changes` → `lead`) may `emit` `customer_created` (`on` → `customer`)
  and pass CE1–CE8 clean. But a command producing a fact about a *different* aggregate is, by
  definition, a **policy / process-manager / saga** — one aggregate reacting to another — which §N0
  explicitly defers. Allowing it here lets the model encode cross-aggregate reactions as if they were
  direct emissions, silently violating the aggregate-as-transactional-boundary and pre-empting the
  deferred policy layer with an unmodeled shortcut. This is exactly REV-007 D5 against SPEC-002,
  recurring because commands/events moved to SPEC-004 without the boundary rule moving with them.
- **Recommendation:** Add a validator — call it **CE9.emit_boundary (major)**: every event in a
  command's `emits` must be `on` the same aggregate the command `changes`. A cross-aggregate effect is
  a reaction that must wait for the policy layer (N0). This keeps the aggregate boundary honest and
  keeps SPEC-004 inside its own non-goals. It is the deterministic guard that makes N0 a real boundary
  rather than a porous one.

### CE-C4 — CE6 provenance is **circular** (grounds to the element's own capability) and regresses from the anchor shape the codebase already evolved (REV-013 C3 recurrence)
- **Severity:** Major
- **Location:** §3 (`meta.derivedFrom: [{ capability: lead_management }]`), §6 CE6, §8 A4
  (provenanceRate = 1)
- **Issue:** A command `qualify_lead` is *invoked by* capability `lead_management` (the `handles`
  edge), and its proposed provenance is… `{ capability: lead_management }`. That grounding is
  structurally guaranteed — a command belongs to the capability that issues it — so it is a tautology
  that can never fail, and CE6 (plus the A4 `provenanceRate = 1` criterion) measures nothing. This is
  REV-013 C3 verbatim, one layer down. Worse: the codebase has *already fixed* this shape once. BC8 in
  `packages/validation/src/index.ts` was evolved to require a real `anchor` string
  (`derived.some(d => typeof d?.anchor === "string" …)`) precisely because grounding-to-members
  verified nothing — yet SPEC-004 §3/§6 reintroduces the pre-fix `{ capability }` object. The genuine
  provenance question is *why this verb/fact exists*: the narrative language describing the action
  ("reps qualify leads"), or — for an event — the **outcome** it realizes.
- **Recommendation:** Ground commands/events to **boundary/behaviour evidence**, not to the owning
  capability. Reuse the `DomainAnchor` mechanism and mirror the *implemented* BC8 (require an
  `anchor`), not the SPEC-004 draft's `{ capability }` shape. Concretely: an **event** grounds to the
  outcome it fulfils (SPEC-001 outcome node) or the narrative anchor asserting the fact; a **command**
  grounds to the narrative anchor describing the action. Scope CE6 to "carries ≥1 anchor-bearing
  `derivedFrom`," identical to BC8. This also strengthens CE-C1: events-first makes outcome-grounding
  natural.

### CE-C5 — Events caused by **time or external systems** are unmodeled; CE8 false-positives on exactly them
- **Severity:** Major
- **Location:** §0 (event = "past-tense fact that resulted"), §6 CE8 (orphan_event), §2 N4
- **Issue:** The model assumes every event is caused by a command (`emits`), and CE8 flags a
  command-less event as "a fact with no cause." But event storming distinguishes three event origins:
  command-caused (internal), **external** (a payment-gateway callback, a webhook), and **temporal** (a
  scheduler — *Invoice Overdue*, *Trial Expired*, *Subscription Renewed*). The last two are enormously
  common in the vertical businesses VBD targets (solar financing, dental billing, subscriptions), and
  they are legitimately command-less. As written, CE8 will fire on precisely these real domain events,
  and the model has no way to express them at all — this is the REV-013 C5 shape (a validator whose
  metric is wrong and false-positives on legitimate cases, e.g. singleton Finance). It also makes
  "event belongs to exactly one aggregate" too strict for genuine *integration* events that no local
  aggregate owns.
- **Recommendation:** Give an event a lightweight **trigger discriminator** — `command | time |
  external` (default `command`). CE8 then only fires on an event whose trigger is `command` but which
  no command emits (a genuine dangling fact); events marked `time`/`external` are exempt. This costs
  one optional field and one enum, keeps `on` single-aggregate for domain events, and lets the model
  represent the time/external facts that a behaviour model of a real business cannot omit. It also sets
  up the policy layer (N0) cleanly, since time/external triggers are the other half of what policies
  react to.

### CE-C6 — Deferring **all** policies (N0) with no derived reaction hint leaves the behaviour model **inert / island-shaped** (REV-013 C4 recurrence; answers Q2)
- **Severity:** Major (borderline)
- **Location:** §2 N0, §0 ("what other capabilities react to"), §6 CE7/CE8, §7 (review lens), Q2
- **Issue:** In event storming the loop is Command → Aggregate → Event → **Policy** → Command. Policies
  are the wiring that makes events causal *across* aggregates — they are what turns local
  command/event pairs into a flow. SPEC-004 delivers the pairs and defers the wiring (N0), so the
  behaviour model is a set of disconnected per-aggregate verb/fact pairs. §0's own claim — an event is
  "what other capabilities react to" — is exactly the reaction the spec then removes, so the artifact
  asserts a flow it does not show. This is REV-013 C4 ("deferring *every* relationship leaves islands,
  not a map") one layer down, and the spec half-sees it in Q2. Deferring the *typed* policy (the
  authored reaction rule, sagas, process managers) is right — those need human judgment. Deferring even
  a cheap *derived* reaction hint is a real loss, and the data already exists: an event is `on`
  aggregate X, and SPEC-001's `consumes` lists the aggregates a capability needs.
- **Recommendation (Q2 = yes, derive it):** Compute a **read-only, derived** "reacts-to" hint: for
  each event `on` aggregate X, the capabilities that `consume` X are candidate reactors (origin
  `derived`, no typed semantics). Render it as a ghosted "consumed by / reacted to in…" line under the
  event, mirroring REV-013 C4's untyped adjacency. This turns dead-end events into a coarse flow map
  for near-zero cost, feeds the §7 review lens (which already wants to reason about cross-capability
  reactions), and is the honest partial delivery of "events are what others react to." Keep the typed
  policy layer deferred (N0); ship the untyped reaction hint now.

### CE-C7 — Add a **creation-command** coverage smell (stronger than CE7); every aggregate needs a lifecycle start (answers Q4)
- **Severity:** Minor
- **Location:** §6 CE7 (no_command), §2 N4, Q4
- **Issue:** CE7 flags an aggregate with *no* command as under-modeled — reasonable, but coarse. The
  sharper, more useful smell is a lifecycle one: an aggregate must **come into existence** somehow. An
  aggregate that has update/mutate commands but nothing that *creates* it is genuinely under-modeled
  (where do instances originate?). This is a real DDD gap CE7 does not catch — an aggregate with only
  `update_lead` and no `create_lead` passes CE7.
- **Recommendation:** Add **CE10.no_creation (minor)**: every *owned* aggregate should be the target of
  ≥1 command that creates it (or ≥1 creation event, per CE-C5's trigger). This needs a minimal
  lifecycle marker — a boolean `creates: true` on a command, or an inferred convention — which is the
  Q4 answer: **defer full state machines (N4 is right), but capture the one lifecycle bit that makes
  "an aggregate has a beginning" checkable.** Do not model per-state command legality yet; that is a
  state machine and correctly deferred.

### CE-C8 — CE7 will false-positive on **reference-only** aggregates (SPEC-002 `references` interaction)
- **Severity:** Minor
- **Location:** §6 CE7, SPEC-002 §2 N0 / §4 (`references` edge)
- **Issue:** SPEC-002 ships a `references` edge so a shared entity (`Customer`, `Installation`) can be
  *owned* in one capability and *referenced* in others. A reference-only aggregate — one this vertical
  references but whose lifecycle is mastered elsewhere (an externally-owned `Customer`) — legitimately
  has **no local command**. CE7 as written flags it as under-modeled, producing noise on exactly the
  shared entities REV-007 D1 fought to make expressible.
- **Recommendation:** Scope CE7 (and CE-C7's creation smell) to aggregates that are *owned within this
  domain* (targets of an `owns` edge) and exempt aggregates reachable only via `references`. Cheap and
  removes a class of false positives.

### CE-C9 — `handles` (capability → command) is a DDD misnomer; the aggregate handles, the capability **issues**
- **Severity:** Minor
- **Location:** §2 G2, §4 (edge `handles`)
- **Issue:** SPEC-004 mints four permanent IR edge types. `handles` for capability→command inverts
  standard DDD vocabulary: a command is **handled by the aggregate root** (the handler lives on the
  aggregate); the capability **issues / invokes** it (§0 itself says "invoked within a capability").
  The command→aggregate edge (`changes`) is effectively the handled-by relation. REV-007 D9 already
  flagged `handles` as ambiguous in SPEC-002; since these edge names are now being permanently written
  into `@kiln/ir` as a semi-public contract, it is worth getting the verb right rather than carrying the
  ambiguity forward.
- **Recommendation:** Rename the capability→command edge to `issues` (or `invokes`). Reserve
  "handling" for the aggregate — which `changes` already expresses. Nothing else changes.

### CE-C10 — The mock encodes a **CRUD-as-events anti-pattern** that will anchor the eval
- **Severity:** Minor
- **Location:** §5 (`mockGenerateEvents`), §8 A2/A4, §9 CE-M1/CE-M2
- **Issue:** `mockGenerateEvents` produces `create_<agg>`/`update_<agg>` commands emitting a
  `<agg>_changed` event. `<agg>_changed` is a persistence event, not a domain event — it says a row
  was written, not that a business-meaningful thing happened. Because the mock is the offline path that
  the seeded-defect corpus and coverage metrics (A2, A4) are built around, this normalizes non-domain
  events into the exit gate and into the operator's first impression. It is the behaviour-layer analog
  of REV-013 C10 (the mock's degenerate output passing all validators).
- **Recommendation:** Fix in tandem with CE-C1: have the mock emit a single business-shaped pair per
  aggregate (imperative command → past-tense event, e.g. `qualify_lead` → `lead_qualified`) rather than
  CRUD verbs. The mock must still be deterministic and offline; it just should not model the wrong
  thing.

### CE-C11 — Naming enforcement (Q6): keep it in the **review lens**, not a validator; state so explicitly
- **Severity:** Nit
- **Location:** §7 (review lens: "imperative commands, past-tense events"), §6 (validator table), Q6
- **Issue:** Q6 asks whether a validator should enforce imperative-command / past-tense-event naming.
  Deterministic grammatical enforcement is brittle and, critically, the UI is **bilingual** (§7:
  "Generate behaviour / *Verhalten generieren*") — English `-ed`/`-en` heuristics do not generalize to
  German, and imperative detection is unreliable in both. A hard validator here is the REV-013 C5 trap:
  a check whose metric is wrong and that false-positives on legitimate names. REV-007 D9 already ruled
  that naming belongs to the review lens — but asked that the spec *say so explicitly* so it is not
  assumed covered by the deterministic validators.
- **Recommendation (Q6 = review lens, not validator):** Keep naming in the §7 event-model lens; add
  one sentence to §6 stating that imperative/past-tense naming is intentionally an LLM-lens
  responsibility, not a deterministic validator (bilingual + linguistically brittle). One cheap,
  language-agnostic deterministic nudge is defensible if wanted: flag a command whose name equals an
  event name (verb/fact confusion) — but the grammar itself stays in the lens.

---

## Answers to the required questions

**Events-first vs. commands-first (§5).** **Reorder to events-first.** Event storming — and REV-007 Q1,
written for this exact deferred layer — discovers past-tense **events** first (the least-ambiguous
unit and the integration surface other capabilities react to), then the commands that cause them, then
policies. §5 as written is aggregate→command→event, which invites CRUD generation (the mock proves it)
and grounds worse. Generate events grounded in outcomes/narrative, derive commands from them, keep
commands as the API seam. (CE-C1, CE-C4, CE-C10.)

**Is "command always changes" too coarse?** **Yes.** A command is a *request* the aggregate may accept
(emitting events) or **reject** (emitting none). Reframe §0 accordingly, and do not make "command emits
≥1 event" a hard rule — a reject path legitimately emits nothing; a command that emits *nothing
anywhere in the model* is a warning, not a blocker. The aggregate is the decision-maker enforcing
invariants, not a passive mutation target. (CE-C2.)

**Q2 — derive a read-only consumer/reaction hint now?** **Yes, derive it.** With policies deferred
(N0) and no derived reaction hint, the behaviour model is islands, and §0's "events are what others
react to" is asserted but not shown. Compute a read-only "reacts-to" hint (event `on` aggregate X →
capabilities that `consume` X), origin `derived`, no typed semantics. Keep the typed policy layer
deferred; ship the untyped hint. This is the REV-013 C4 answer, one layer down. (CE-C6.)

**Q4 — aggregate lifecycle / state now?** **Defer full state machines (N4 is correct); capture only
the minimal lifecycle bit.** Per-state command legality is a state machine and rightly deferred. But
mark **creation** commands/events, because "every aggregate has a beginning" is a cheap, high-value
coverage check (CE-C7) and is not a state machine. So: no state model, but a creation marker and a
creation-coverage smell. (CE-C7.)

**Q6 — enforce imperative/past-tense naming via a validator?** **No — keep it in the review lens.**
Deterministic grammar enforcement is brittle and, given the DE/EN bilingual UI, unreliable — the wrong
kind of check (REV-013 C5 trap). Leave naming to the §7 lens, but state explicitly in §6 that it is
intentionally not a validator (the REV-007 D9 lesson). An optional language-agnostic nudge (command
name ≠ event name) is acceptable; the grammar is not. (CE-C11.)

---

## Verdict

**Approve-with-changes.** The loop, the reuse, the compose plan, and the correctly-stated
one-command-one-aggregate consistency boundary are the right foundation. Before build, five Majors
should land because they are structural, not cosmetic: reorder generation to **events-first** (CE-C1),
reframe the command as a **request that may be rejected** (CE-C2), add the **emit-boundary** validator
so a command's events stay on its own aggregate and N0 remains a real boundary (CE-C3), fix the
**circular provenance** so CE6 grounds to narrative/outcome evidence and stops regressing from the
already-fixed BC8 (CE-C4), and model **time/external-triggered events** so CE8 stops punishing the most
common events in a real vertical business (CE-C5). CE-C6 (derive the read-only reaction hint) is a
borderline-Major that turns islands into a coarse flow for near-zero cost. The remaining items —
creation-coverage smell (CE-C7), exempting reference-only aggregates (CE-C8), the `handles`→`issues`
rename before the edge is minted permanently (CE-C9), de-CRUD-ing the mock (CE-C10), and stating the
naming-lens boundary (CE-C11) — are cheap and sharpen the layer into something a domain reviewer would
call "substantially right" on the first solar pass (A1). Notably, three of the six Majors are
*recurrences* of findings the panel already made against SPEC-002/003 (REV-007 D5 → CE-C3; REV-013 C3 →
CE-C4; REV-013 C4 → CE-C6), and the codebase has even already fixed one of them (BC8) — so landing them
here is mostly transcribing lessons the project has already learned.
