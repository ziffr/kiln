---
id: REV-023
title: Domain-Modeling (DDD / Process-Manager) Review of SPEC-005
type: review
status: Approved
version: 1.0.0
author: "Claude (Opus 4.8) — domain-modeling lens"
created: 2026-07-10
updated: 2026-07-10
reviews: SPEC-005
lens: domain-modeling
verdict: Approve-with-changes
related: [SPEC-005]
reviewers: [domain-modeling]
---

# REV-023 — Domain-Modeling (DDD / Process-Manager) Review of SPEC-005

## Summary

SPEC-005 adds the **wiring**: the reaction rule `on <event> [if <condition>] then <command>` that
carries a fact on one aggregate into a command on another. As a *mechanism* it is again the cleanest
reuse in the series — one node kind (`policy`), two edges (`when`, `then`), `validatePolicies`, a
grounded-provenance skill, a deterministic mock, in-context UI, a gold-free eval — and, more
importantly, it is **the honest completion of a boundary SPEC-004 deliberately left open**. SPEC-004's
`CE.emit_boundary` validator forbids a command emitting another entity's event; that rule is only
defensible if there is a *sanctioned* cross-boundary mechanism to point at, and SPEC-005 is exactly
that mechanism. The two specs now compose into a clean, honest story: a command changes exactly one
aggregate and emits only that aggregate's events (SPEC-004); crossing to a second aggregate happens
**asynchronously, through a policy, as a request the target aggregate may still reject** (SPEC-005).
That is the transactional-consistency boundary stated correctly, and the reaction chain
`command → emits → event → when → policy → then → command` is a real, walkable derived projection.

Two of the DDD fundamentals are also **right, and worth naming because their predecessors got them
wrong**:

- **Provenance (PL5) is non-circular.** It grounds a policy to a *narrative boundary anchor*
  (`{ anchor: "delivery-after-payment" }`), not to the policy's own `on`/`then` elements — which would
  have been the REV-013 C3 / REV-018 CE-C4 tautology (a policy trivially "grounds" to the event it
  triggers on). Grounding to the business reason the hand-off exists is the correct, `isGroundedAnchor`
  / BC8 / CE6 pattern the codebase already converged on. This is the lesson learned rather than
  re-committed.
- **The stateless rule is a legitimate primitive, not a thin one.** In event storming a *Policy* (the
  purple sticky) **is** precisely a stateless `whenever event → issue command` reaction. A single
  reaction is an honest unit; a chain of them is an emergent workflow — which is how event storming
  models flow *before* process managers are introduced. Deferring stateful sagas (N0) is the right cut.

Judged as a process-manager model, though, the spec has one structural gap that is the same failure
mode SPEC-004 was caught on, one layer up — and a handful of integration/definition gaps that will
bite at build time.

**The one that matters: nothing scopes out the *stateful* reactions, so they will hide in the
plain-text `condition`.** A stateless single-trigger rule structurally cannot express a fan-in
("when *all* inspections have passed"), a count/threshold ("after the 3rd failed payment"), a
negation-over-history ("if not already scheduled"), or a delay/timeout ("30 days after signup"). Those
are process managers (correctly N0). But because the `condition` is free text (N1) and unvalidated, the
model — or the operator — will write `condition: "once every installation for the order is complete"`
and the layer will *look* like it modelled a join it cannot execute. This is REV-018 CE-C3 (the hidden
saga through `emits`) reincarnated as a **hidden saga through `condition`**: the exact boundary N0
draws is porous unless the spec names what a stateless rule may *not* express and asks the review lens
(and optionally a cheap deterministic keyword nudge) to catch it. This is the difference between "a
coherent thin layer" and "a half-model."

The rest are smaller: PL7 (cycle) is under-defined and only implementable over the *joined*
command/event/policy graph; the spec never reconciles the authored policy with SPEC-004's already-
shipped *derived* "reacts-to" hint (they are the same question at two fidelities); the repair allowlist
targets referential dangles (PL2/PL3) but not a policy emitted with `on`/`then` missing entirely (PL1);
and cross-area reactions — the single highest-value signal this layer produces — are treated almost
uniformly when they should be a first-class derived annotation.

None of this invalidates the approach; the boundary story is genuinely well-formed and most fixes are
in-spec and cheap. **Approve-with-changes.** Findings ordered by severity; Q1/Q2/Q6, the term
question, and the stateless-thinness question are answered inline and collected below.

---

## Findings

### PL-C1 — Stateful reactions are not scoped out; they will hide in the plain-text `condition` (hidden saga, one layer up; REV-018 CE-C3 recurrence)
- **Severity:** Major
- **Location:** §0 (Framing, "stateless"), §2 N0/N1, §5 (`condition`), §6 (validators), §7 (review lens)
- **Issue:** A policy triggers `on <one event>` with an optional plain-text `condition`. That is
  structurally a **stateless, single-trigger** rule. A large and common class of real reactions is
  **stateful** and cannot be expressed honestly this way: (a) **fan-in / joins** — "when *all* line
  items are delivered", "once both the permit *and* the financing are approved"; (b) **count /
  threshold** — "after the 3rd failed payment", "on the 2nd no-show"; (c) **negation over history** —
  "if an installation has *not* already been scheduled"; (d) **delay / timeout** — "30 days after
  signup if still unpaid". Each of these is a **process manager** (correctly deferred, N0). The hazard
  is that N1 makes `condition` free text that no validator inspects, so the model or the operator will
  simply *write the stateful logic into the condition string* — `condition: "once every installation
  for the order is complete"` — and the artifact will present a join it cannot execute, which the M5
  codegen event-handler stub will silently emit as a stateless handler that drops the state
  requirement. This is precisely the SPEC-004 emit-boundary problem (a cross-aggregate effect encoded
  as if it were a local one) re-appearing as a cross-*time*/cross-*instance* effect encoded as if it
  were a single-event reaction. Left unaddressed, N0 is a porous boundary, not a real one, and the
  layer is a half-model.
- **Recommendation:** Draw the boundary explicitly, mirroring how CE.emit_boundary made N0 real in
  SPEC-004. (1) Add one sentence to §0/§2 naming what a stateless policy may **not** express (fan-in,
  count/threshold, negation-over-history, delay/timeout) and stating that any such reaction is a
  process manager (N0) to be **flagged, not encoded in `condition`**. (2) Make it a first-class §7
  **review-lens** responsibility: a condition that quantifies over history or instances ("all", "every",
  "each", "after N", "not yet", "still", "within X days") is a saga smell to surface, not a reaction to
  accept. (3) Optionally, a cheap language-agnostic-*ish* deterministic nudge — **PL smell: a
  `condition` containing temporal/quantifier keywords** — flagged minor (accepting REV-018 CE-C11's
  caveat that lexical checks are bilingual-brittle, so keep it a nudge in the lens, not a hard
  validator). This is the honesty gate that decides whether SPEC-005 leaves a coherent layer.

### PL-C2 — PL7 (cycle) is under-defined and only implementable over the *joined* command/event/policy graph
- **Severity:** Major
- **Location:** §6 PL7, §4 (reaction chain), §10 R5
- **Issue:** PL7 flags "the reaction graph has a cycle (A triggers B triggers A)." But the policy layer
  *alone* — nodes `event → policy → command` — is a **forest, never cyclic**: a policy points from an
  event to a command and stops. The loop only closes through SPEC-004's `emits` edge (a reaction
  command emits an event, which triggers another policy). So PL7 is *only* meaningful over the composed
  chain `command → emits → event → when → policy → then → command → emits → …`, and `validatePolicies`
  must therefore read `domain.commands[].emits` (SPEC-004 data), not just `domain.policies`. As written
  it is ambiguous what "A" and "B" are (events? commands? policies?) and on which graph the cycle is
  detected — which makes it under-specified to implement and easy to build as a no-op. Separately, given
  R5 explicitly worries about "infinite loops in generated code," minor may undersell a *genuine*
  unguarded cycle — though because conditions are unevaluated (N1) the validator cannot prove a cycle is
  unguarded, so a heuristic **minor/warning is defensible**; just say why.
- **Recommendation:** Specify PL7 over the **joined graph**: build event→policy (via `when`),
  policy→command (via `then`), and command→event (via SPEC-004 `emits`), then detect cycles exactly as
  `validateV6`/DM does (Tarjan/colour DFS, report the path). State the graph and the `emits` dependency
  in §6. Keep severity minor but add the one-line rationale (conditions are unevaluated, so a cycle is a
  *smell* the reviewer must judge, plus a codegen note per R5). This also makes PL7 testable in the
  seeded-defect eval (A2's "cycle" case).

### PL-C3 — No reconciliation with SPEC-004's already-shipped *derived* "reacts-to" hint (REV-018 CE-C6 / product M3)
- **Severity:** Major
- **Location:** §0, §2 (reuse), §7 (review lens, "events that should trigger a reaction but don't"), §4
- **Issue:** SPEC-004 shipped a **read-only derived** "reacts-to" hint (REV-018 CE-C6 / SPEC-004 product
  M3): for an event `on` aggregate X, the capabilities that `consume` X are candidate reactors, rendered
  as a ghosted line under the event. SPEC-005 now introduces the **authored, typed** version of the same
  relationship. These are two representations of one question — *who reacts to this event* — at two
  fidelities, and the spec never says how they coexist: (a) When an authored policy wires `event → then
  command`, does it *supersede* the derived ghost hint for that pairing (the concrete replaces the
  coarse), the way an authored aggregate supersedes a derived `domain_object` in the compiler? (b) Does
  the presence of an authored policy on an event *satisfy* the §7 "event that should trigger a reaction
  but doesn't" (dangling hand-off) smell, so the lens does not nag about an event that already has a
  reaction? (c) Is the derived hint the *seed* the PolicyModeler starts from (candidate reactors →
  candidate policies)? Without an answer, the UI will show a ghost "reacted to in Delivery" hint next to
  an authored "→ then: Schedule Installation (Delivery)" policy — two overlapping claims about the same
  edge — and the review lens has no defined relationship between the derived candidates and the authored
  reality.
- **Recommendation:** Add a short subsection reconciling the two: the authored policy is the concrete
  realization of the derived reacts-to candidate; where an authored policy exists for an
  `(event, reacting area/capability)` pair, **suppress the derived ghost for that pair** (concrete
  supersedes coarse, the compiler's existing authored-supersedes-derived pattern) and **treat the event
  as non-dangling** for the §7 hand-off smell. Feed the derived candidates to the PolicyModeler as
  seeds. This makes the two layers one coherent flow map instead of two overlapping ones.

### PL-C4 — Repair allowlist targets PL2/PL3 dangles but not a policy with `on`/`then` missing entirely (PL1)
- **Severity:** Major
- **Location:** §5 ("repair once on any blocker or dangling on/then (PL2/PL3)"), §6 PL1
- **Issue:** §5 says repair fires "on any blocker or dangling `on`/`then` (PL2/PL3)." But a policy the
  LLM emits with **no `on` or no `then` at all** is a **PL1.required (major)** finding, not PL2/PL3
  (which are *referential* — the field is present but points at a non-existent event/command). A policy
  missing its trigger or reaction is not a degraded policy; it is a *non-policy* that cannot even be
  composed into the IR (the `when`/`then` edges can't be built). If the repair allowlist is literally
  "PL2/PL3 + blockers," and PL1's `on`/`then` presence is *major* (not blocker, per §6), then the most
  basic malformation — a policy with a missing reaction — will **not** trigger the one repair retry.
  This is REV-019 CE-F2 verbatim ("repair trigger won't fire because the relevant code is major, not
  blocker"), recurring.
- **Recommendation:** Make the §5 repair allowlist explicit and include **PL1 `on`/`then` absence**
  alongside PL2/PL3 dangles (i.e. `PL1.*` for on/then, `PL2.*`, `PL3.*`). Equivalently, keep PL1's
  `on`/`then` *presence* as major (so repair, not a hard block, handles it) but ensure the allowlist
  string names it. Same pattern SPEC-004 landed for `CE2./CE3./CE4.`.

### PL-C5 — Cross-area reactions are the highest-value signal and should be a first-class *derived* annotation, not near-uniform treatment (answers Q6)
- **Severity:** Major (borderline)
- **Location:** §7 ("Cross-entity target shown with its area for orientation"), §6 (validators), Q6
- **Issue:** A policy whose trigger event is `on` an aggregate owned by area X and whose reaction
  command `changes` an aggregate owned by area Y (X ≠ Y) is a **cross-bounded-context integration** —
  a domain event leaving one subdomain and becoming another's trigger. In DDD these are the most
  important reactions in the whole model: they are the system's *integration contracts*, they carry the
  highest coordination/coupling cost, they are where eventual consistency, published language, and
  anti-corruption layers live, and they are exactly what an operator asking "how do my areas talk to
  each other?" needs to see. SPEC-005 currently treats them almost uniformly — a policy is a policy, and
  the crossing is merely "shown with its area for orientation" (§7). Q6 asks whether to flag them; the
  answer from a DDD standpoint is emphatically **yes, and more than orientation**. Uniform treatment
  wastes the single most valuable thing the policy layer produces, and it also under-serves the M5
  codegen shape question (Q4): a cross-area reaction is where you would want an async/published-event
  boundary rather than an in-process call.
- **Recommendation:** Compute a **derived, non-error** annotation `crossesArea: true` on any policy
  whose `on` event's area ≠ `then` command's area (the areas are already known from SPEC-003), and make
  cross-area reactions a distinct **review-lens category** ("integration reactions between areas") and a
  distinct visual affordance (not just the area label). Not a validator error — crossing areas is
  correct and desirable — but a first-class visibility signal. This is the SPEC-003 partition paying a
  dividend at the behaviour layer.

### PL-C6 — Strengthen PL5 to require the *linking* narrative phrase (non-circular already; make it also the anti-over-wiring guard)
- **Severity:** Minor
- **Location:** §3 (`derivedFrom: [{ anchor: "delivery-after-payment" }]`), §6 PL5, §5, §10 R1, A4
- **Issue:** PL5 is correctly non-circular (grounds to a narrative anchor, not to `on`/`then`), and
  that should be affirmed. But there is a free strengthening available. The anchor that best justifies a
  *reaction* is the narrative sentence that asserts the **causal/temporal link between the two entities**
  — "once the invoice is paid we schedule the installation" — not a single-entity theme. The example
  `"delivery-after-payment"` is already this kind of linking phrase; the spec should make it a
  *requirement* rather than an example. Doing so does double duty: it keeps grounding honest **and** it
  is the cleanest guard against over-wiring (R1) — if there is no narrative sentence linking A's event
  to B's command, the reaction should not be minted. Provenance and the anti-spaghetti goal become the
  same check.
- **Recommendation:** In §5, instruct the PolicyModeler to ground each policy in the narrative phrase
  that asserts the hand-off between the two entities (both sides named), and in §6 keep PL5 as
  "carries ≥1 anchor-bearing `derivedFrom`" (identical to CE6/BC8) but note in §5/§10 that the anchor
  must be a *linking* phrase. "No linking narrative ⇒ no policy" is a strong, cheap over-wiring brake.

### PL-C7 — Add a duplicate-reaction smell (PL8)
- **Severity:** Minor
- **Location:** §6 (validator table), §10 R1
- **Issue:** Two policies with the **same `on` and the same `then`** (and no distinguishing
  `condition`, or identical conditions) are redundant — the same reaction wired twice, a small
  contributor to the over-wiring/spaghetti risk (R1) and a likely artifact of a single-call generation
  (§5) that the guardrail counts but does not de-dupe. `validatePolicies` already indexes `on`/`then`
  for PL2/PL3, so the check is nearly free.
- **Recommendation:** Add **PL8.duplicate_reaction (minor)**: flag ≥2 policies sharing `(on, then)` with
  no distinguishing condition. Cheap, deterministic, and prunes a real over-wiring class.

### PL-C8 — State explicitly that a policy may trigger on *any* event trigger-kind (command/time/external) — closing the SPEC-004 loop
- **Severity:** Minor
- **Location:** §0, §5, §6 PL2, §2
- **Issue:** SPEC-004 gave events a `trigger: command | time | external` discriminator (REV-018 CE-C5),
  and REV-018 itself noted "time/external triggers are the other half of what policies react to." A
  policy triggering on a **time** event (*Invoice Overdue → Send Reminder*) or an **external** event (a
  gateway webhook → a command) is one of the most common and valuable reaction shapes in the vertical
  businesses VBD targets. Nothing in SPEC-005 forbids it (PL2 only requires the event to exist), but
  nothing states it either, and the natural reading of "cross-*entity* reaction" might make a reviewer
  or the model assume policies only fire on command-caused domain events. This is the point where the
  time/external events SPEC-004 modelled finally *do* something.
- **Recommendation:** Add one sentence to §0/§5: a policy may trigger on an event of **any** trigger
  kind (command, time, external); time- and external-triggered reactions are first-class and expected.
  This makes SPEC-004's trigger discriminator pay off and completes the behaviour→reaction arc.

### PL-C9 — Term & IR vocabulary: `policy` is DDD-correct-by-convention but overloaded; consider `reaction` for the node type (and note the mock's English-lexical heuristic)
- **Severity:** Nit
- **Location:** §0 (term "policy"), §4 (IR node `policy`, edges `when`/`then`), §5 (mock), §7 (surface
  term "Automations")
- **Issue:** "Policy" is *technically* the right DDD/event-storming word — Brandolini's reactive Policy
  is exactly `whenever event → issue command`. But the word is heavily overloaded (authorization
  policies, governance policies, business-rule/invariant "policies"), and the artifact here is more
  precisely an **event subscription / reactive rule / process-manager step**. Two consequences worth a
  cheap decision *before the node type is minted permanently in `@kiln/ir`* (the REV-018 CE-C9 argument —
  edge/node names are a semi-public contract): (a) the spec has already, correctly, chosen the *surface*
  term **"Automations / Wenn… dann…"** (§7, Q5), so the user is protected regardless; (b) internally,
  `reaction` would be less overloaded than `policy`, matches the spec's own leading prose ("reaction"),
  and leaves the word "policy" free for a later *authored business-rule/invariant* layer (a different
  DDD concept). Edge `then` (policy→command) is fine paired with `when`, though `triggers`/`reacts_with`
  would align with the `issues` verb REV-018 CE-C9 chose for capability→command. Separately, the mock's
  hand-off heuristic (`*_paid`, `*_approved`, `*_qualified`) is **English-lexical** and will not match a
  German domain (`*_bezahlt`) — fine for an offline dev fixture, but say so (REV-018 CE-C11 bilingual
  caveat).
- **Recommendation:** Keep the surface term "Automations." Consider renaming the IR node type
  `policy → reaction` (and optionally `then → reacts_with`, `when → triggers`) before it is written into
  `@kiln/ir`; if `policy` is kept, add a sentence noting it is the event-storming reactive-Policy sense
  and reserving "business rule/invariant" for a later layer. Note in §5 that the mock's suffix heuristic
  is an English dev aid, not a general matcher.

---

## Answers to the required questions

**Q1 — stateless `event→command` now, sagas later (N0)? Is a single stateless rule too thin to be
honest workflow, or a legitimate primitive?**
**A legitimate primitive — confirm N0.** The stateless reaction *is* the event-storming Policy (the
purple sticky): a single honest unit, and a chain of them is an emergent workflow, which is how flow is
modelled before process managers are introduced. It is not too thin. It becomes *dishonest* only when a
**stateful** reaction — fan-in/join, count/threshold, negation-over-history, delay/timeout — is forced
into the single-trigger + free-text-condition shape, at which point the layer claims a join it cannot
execute. So: keep the stateless primitive and defer sagas, **but draw the boundary explicitly** so
stateful reactions are flagged, not smuggled into `condition` (PL-C1). With that, deferring sagas leaves
a *coherent thin layer*; without it, a half-model.

**Q2 — condition: plain text now, or a light structured predicate?**
**Plain text now; do not build a predicate DSL (N1 is correct).** Free text is consistent with the
project's text-as-truth / validators-own-the-objective-checks posture, and a predicate engine is
premature. The single hazard is state-smuggling (PL-C1), addressed by the review lens (and an optional
keyword nudge), **not** by a DSL. A light structured predicate (entity.attribute compare) is a
reasonable *future* step once real conditions are observed — but it does not belong in this spec, and it
would not solve the stateful-reaction problem anyway (that needs a process manager, not a richer
predicate). PL5 grounding stays on the policy; the condition itself remaining ungrounded free text is
acceptable.

**Q6 — cross-area policies: flag/annotate, or treat uniformly?**
**Flag them, first-class (PL-C5).** A reaction crossing a business-area boundary is a
cross-bounded-context integration — the system's integration contract, its highest-coupling seam, and
the most valuable thing the policy layer surfaces. Compute a derived `crossesArea` annotation from the
areas of `on` and `then`, give cross-area reactions a distinct review-lens category and visual
affordance, and let them inform the M5 codegen boundary (async/published event vs in-process call).
Not an error — crossing is desirable — but never uniform.

**Is "policy" the right term?**
**Defensible but overloaded (PL-C9).** It is the correct event-storming word for a reactive rule, so it
is not *wrong*; but it collides with authorization/governance/business-rule senses, and the artifact is
more precisely an event-subscription / reactive rule / process-manager step. The *surface* term
"Automations / Wenn… dann…" is the right call and protects the user. For the permanent IR node type,
`reaction` is a cleaner, less-overloaded choice that also frees "policy" for a later authored
business-rule/invariant layer — worth deciding before the node type is minted.

**Should a reaction fire *any* command, or only a creation / specific command on the target aggregate?**
**Any command — do not restrict to creation.** The reaction issues a command, and a command is a
*request* the target aggregate may accept or **reject** (SPEC-004 CE-C2); it still targets exactly one
aggregate and emits only that aggregate's events (CE.emit_boundary). So the target aggregate's own
invariants remain the guard, and the reaction cannot do anything a direct command could not — the chain
stays honest and composable (any further cross-boundary effect needs *another* policy). Restricting to
creation-only would wrongly exclude the many legitimate update-reactions ("payment failed → suspend
account"). The constraint that *does* matter is soft, and the spec has it: intra-entity reactions
(trigger event and reaction command on the *same* aggregate) are usually redundant with the command's
own emit / the aggregate's own in-transaction cascade — hence PL6 (self_loop) is a well-motivated smell.
So: any command, cross-entity **encouraged** (PL6 nudges), **not required** (intra-entity reactions are
a minor smell, not an error). PL6 and PL7 are the right smells at the right (minor) severity; PL7 just
needs its graph defined (PL-C2).

---

## Verdict

**Approve-with-changes.** The boundary story is genuinely well-formed: SPEC-005 is the sanctioned
cross-aggregate mechanism that makes SPEC-004's `emit_boundary` honest, the stateless rule is the
correct event-storming primitive (not too thin), and PL5 provenance is non-circular — three DDD
fundamentals the layer gets *right*, two of them where predecessors got them wrong. Before build, one
Major is structural and must land: **scope out the stateful reactions** (fan-in/join, count/threshold,
negation-over-history, delay/timeout) so they are flagged rather than smuggled into the free-text
`condition` (PL-C1) — this is the SPEC-004 hidden-saga finding one layer up, and it is what separates a
coherent thin layer from a half-model. Three further Majors sharpen the layer into something buildable
and consistent: **define PL7's cycle over the joined command/event/policy graph** (it is a no-op on the
policy forest alone — it needs SPEC-004 `emits` to close the loop; PL-C2); **reconcile the authored
policy with SPEC-004's derived reacts-to hint** so the UI shows one flow map, not two overlapping claims
(PL-C3); and **extend the repair allowlist to PL1 `on`/`then` absence**, not only PL2/PL3 dangles, or
the most basic malformation never triggers repair (PL-C4, a REV-019 CE-F2 recurrence). PL-C5
(cross-area reactions as a first-class derived annotation — the Q6 answer) is a borderline-Major that
turns the layer's highest-value signal from orientation text into a real integration view. The
remainder are cheap and constructive: require the *linking* narrative phrase for PL5 so provenance
doubles as the over-wiring brake (PL-C6), a duplicate-reaction smell (PL-C7), state that policies may
trigger on time/external events and thereby cash in SPEC-004's trigger discriminator (PL-C8), and settle
the `policy`→`reaction` node-type name before it is minted permanently (PL-C9). Notably, three of the
findings are recurrences the panel has made before — hidden saga (REV-018 CE-C3 → PL-C1), repair-won't-
fire (REV-019 CE-F2 → PL-C4), islands/derived-hint (REV-018 CE-C6 → PL-C3) — so landing them here is
again mostly transcribing lessons the project has already learned.
