---
id: SPEC-005
title: Policies & Reactions — cross-entity workflow rules
type: spec
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-10
updated: 2026-07-10
supersedes: null
related: [SPEC-001, SPEC-002, SPEC-003, SPEC-004, RES-001, ADR-001, ADR-002, ADR-004, ADR-006, REV-022, REV-023, REV-024, REV-025, REV-026]
reviewers: [product-strategy, domain-modeling, ai-llm-feasibility, technical-architecture, ux-hitl]
---

# SPEC-005 — Policies & Reactions

> **v0.2.0 — reviewed to closure (REV-022…026, all Approve-with-changes; 2 Blockers, ~18 Majors),
> then BUILD DEFERRED by owner decision.** No strategic Blocker this time — the layer is well-received
> (product: "strongest standalone value of the arc"; domain: "the legitimate Policy primitive"). But
> the panel surfaced (a) real **implementation debt** from prior layers — reconcile-not-clear was only
> wired for contexts, and the collapsible-entity disclosure was only half-built — and (b) a product
> meta-note: *five element kinds in, the only real-world validation is one design partner; the
> highest-information move is shipping the whole stack to them, not building layer six.* **Owner
> decision: consolidate & ship first** — clear the debt, harden the five built layers + codegen, and
> get a genuine demand signal from the partner before building policies. This spec is a **reviewed,
> closed, build-ready design on the shelf** (all findings dispositioned in §13); un-shelve when a
> partner demand signal returns.

> **When this happens, do that.** SPEC-004 modelled the events each entity emits and the commands
> that cause them — but strictly *within* one entity (the CE.emit_boundary validator forbids a
> command emitting another entity's event). Real businesses are wired by **cross-entity reactions**:
> *Invoice Paid → Schedule Installation*, *Lead Qualified → Create Opportunity*. SPEC-005 adds the
> **policy** (a.k.a. reaction / process-manager rule): when an event occurs, issue a command —
> possibly on a different entity in a different capability/area. This is the methodology's
> `policy_model`, and it is **empirically the next codegen gap**: `@vbd/codegen` already reports that
> command operations generate but "events trigger no downstream commands" (RES-001 follow-up).

## 0. Framing
A **policy** is a rule `on <event> [if <condition>] then <command>`. It is the sanctioned way to cross
the aggregate consistency boundary (SPEC-004 kept commands single-entity on purpose): the boundary is
crossed *asynchronously by a reaction*, not by a command reaching into another aggregate. A policy is
**stateless** (a routing rule, not an entity) and names an existing event (its trigger) and an
existing command (its reaction). This is the DDD process-manager/saga seam — the thing a future
codegen step turns into an event handler that calls a command.

Reuses the IR spine, skill/validator/review machinery, HITL editing, grounded provenance, and
text-as-truth from SPEC-001–004. It is the layer that makes the behaviour model *flow*.

## 1. Goals
- G1. From the events + commands (+ narrative), derive validated **policies**: `on event → then
  command`, with an optional plain-language `condition`, each crossing or staying within entities.
- G2. Extend the IR with a `policy` node type + `when` (event → policy) and `then` (policy → command)
  edges, authored/derived tagging preserved.
- G3. Deterministic **validators** (`validatePolicies`): required fields, referential integrity (the
  event and command exist), unique/slug ids, provenance, and smells (a policy whose reaction is on the
  same entity as its trigger is usually redundant with a command's own emit; an event that logically
  should trigger a reaction but doesn't).
- G4. An LLM **`PolicyModeler`** skill (server-side, structured outputs, grounded provenance, repair)
  + a deterministic **mock**.
- G5. A **UI**: reactions shown **in-context under the triggering event** in the "What happens" panel
  (no separate view — the SPEC-002/003/004 discipline), business language ("Automations / when… do…"),
  structured-form editing + findings.
- G6. A gold-free **eval** (seeded-defect corpus + coverage + a reaction quality metric) as the gate.
- G7. **Close the codegen gap**: `@vbd/codegen` generates workflow/event-handler stubs (on event →
  call command) from policies — the yardstick advances again.
- G8. Vertical-agnostic; prove on solar + smoke-test dental.

## 2. Non-goals (this spec)
- N0. **Stateful process managers** (a saga that tracks progress across many steps, compensations,
  timeouts) — deferred. A policy here is a single stateless `event → command` rule (Q1).
- N1. **Executable condition expressions** (a DSL/predicate engine) — the `condition` is human-readable
  text only, not evaluated (Q2).
- N2. **Delivery/error semantics** (retries, dead-letter, exactly-once) — a codegen/runtime concern,
  not modelled here.
- N3. **Roles/permissions** on who may trigger — a later `role_model` layer.
- N4. **Code execution** — this produces a *model* + a handler *stub*, not a running workflow.

## 3. Artifact
Extend the domain artifact (SPEC-004) — policies reference its events/commands, so they live with it
in `project.json` (ADR-006). Domain artifact `version` bumps to "0.3":
```yaml
version: "0.3"
aggregates: [...]        # SPEC-002/typed attributes
commands: [...]          # SPEC-004
events: [...]            # SPEC-004
policies:
  - id: on_invoice_paid_schedule_install
    name: Schedule installation once paid
    on: invoice_paid          # trigger event id
    then: schedule_installation  # reaction command id
    condition: "the order includes installation"   # plain text, not evaluated (N1)
    meta: { origin: llm, derivedFrom: [{ anchor: "delivery-after-payment" }] }
```
Required: policy `id/name/on/then`. Ids are stable slugs, namespaced `policy:` in the IR. LLM-authored
policies carry grounded provenance (PL5).

## 4. IR extension
Add node type `policy` and edge types `when` (event → policy) + `then` (policy → command) to `@vbd/ir`
(**union growth** — arch review to confirm clean). Compose: one authored `policy:<id>` node; a `when`
edge `event:<on> → policy:<id>`; a `then` edge `policy:<id> → command:<then>`. `computeBuildHash`
already mixes the domain artifact (its `version` bump distinguishes v0.2 → v0.3). Authored/derived
tagging unchanged; the app already composes the domain IR.

**Cross-entity flow becomes visible:** the derived path `command → emits → event → when → policy →
then → command` is the reaction chain the map/codegen can walk (read-only projection).

## 5. LLM skill — `PolicyModeler`
- **In:** narrative + capabilities + the full behaviour (aggregates, commands, events) + IR.
- **Out (structured):** policies `on event → then command`, each citing boundary evidence (a narrative
  theme), preferring **cross-entity** reactions (the intra-entity ones are usually already a command's
  own emit).
- **Coerce → canonicalize → ground → validate → repair (the SPEC-004 pattern):** snap `on`/`then` to
  real event/command ids (by slug/name), mint a slug id, ground provenance, `validatePolicies`, and
  **repair once** on any blocker or dangling `on`/`then` (PL2/PL3 — a code allowlist, not blocker-only).
- Given the whole behaviour is the input and policies are global (cross-entity), this is a **single
  call** (unlike SPEC-004's per-aggregate fan-out) — over-production is checked by a guardrail + the
  review lens, not by fan-out.
- **Mock (`mockGeneratePolicies`)** — deterministic: a policy per event whose name suggests a handoff
  (e.g. `*_paid`, `*_approved`, `*_qualified`) wired to a plausibly-named command on a *different*
  entity if one exists; else none. Honest, lean, offline.

## 6. Deterministic validators (`validatePolicies`, isomorphic)
Pure over the domain doc, added to `@vbd/validation`:
| Code | Sev | Rule |
|---|---|---|
| PL1.required | blocker/major | policy id (blocker); name/on/then (major) present |
| PL2.trigger | major | `on` references an existing event |
| PL3.reaction | major | `then` references an existing command |
| PL4.slug / PL4.unique | major/blocker | policy ids are stable slugs (major) and unique (blocker) |
| PL5.provenance | major | every llm-origin policy carries grounded boundary evidence |
| PL6.self_loop | minor | `on`'s event and `then`'s command are on the same entity — usually redundant with the command's own emit (a smell, not an error) |
| PL7.cycle | minor | the reaction graph has a cycle (A triggers B triggers A) — a runaway-workflow smell |

PL2/PL3 are the referential-integrity core; PL6/PL7 are workflow smells (warnings).

## 7. Review lens & UI (in-context, business language)
- A **policy review** lens: events that should trigger a reaction but don't (a dangling hand-off),
  reactions that skip a step, and cycles.
- **UI (REV-011/016/021 discipline — no separate view):** under each **event** in the "What happens"
  panel (SPEC-004), show its reactions: *"→ then: Schedule Installation (Delivery)"*. A policy is
  edited as a small form (pick the reaction command, optional condition). Surface term: **"Automations"**
  / **"Wenn… dann…"** (when… then…) — not "policy". Cross-entity target shown with its area for
  orientation. Provenance chips; findings in the shared panel (clickable → the triggering event's
  entity). A **"Generate automations"** button mirrors the others.

## 8. Success criteria (go/no-go)
- A1. From the solar behaviour, `PolicyModeler` produces reactions a domain reviewer calls
  "substantially right" (≤1 review cycle), preferring real cross-entity hand-offs.
- A2. `validatePolicies` deterministic, unit-tested, catches seeded defects (dangling on/then,
  duplicate/non-slug id, cycle) in ≥90% of seeded cases (eval).
- A3. Edit → recompile → IR/views update deterministically; buildHash distinguishes domain v0.2/v0.3.
- A4. Solar coverage: policies grounded (provenanceRate = 1); ≥1 real cross-entity reaction found.
- A5. **Quality:** reactionRecall of the generated policies vs a human-blessed reference set of
  hand-offs; + a guardrail against a policy per event (over-wiring).
- A6. **Codegen advances:** `@vbd/codegen` emits event-handler stubs (on event → call command) and the
  "no reactions" gap is closed.
- A7. Second-domain smoke (dental) + the design partner rates "Automations" worth acting on.

## 9. Milestones
- PL-M0. IR (policy node + when/then edges) + compose + domain schema-version bump + tests.
- PL-M1. `mockGeneratePolicies` + compile + tests.
- PL-M2. `validatePolicies` (PL1–PL7) + tests + seeded-defect eval + reactionRecall metric.
- PL-M3. `PolicyModeler` skill (structured outputs, canonicalize, grounded, repair) + `/api/policies`.
- PL-M4. In-context Automations UI (under each event) + editing + findings + i18n + persistence.
- PL-M5. `@vbd/codegen` workflow/event-handler stubs from policies (close the gap).
- PL-M6. Solar walkthrough + eval go/no-go + dental smoke + partner value check + closure.

## 10. Risks
- R1. **Over-wiring** — a policy for every event balloons into spaghetti. Mitigate: prefer cross-entity
  hand-offs, PL6/PL7 smells, guardrail on policy count, review lens prunes. (Owner: domain/AI review.)
- R2. **Cognitive load** — a fifth concept. Mitigate: in-context under the event, business language
  ("when… then…"), collapsed by default. (Owner: UX review.)
- R3. **Generation determinism / id drift** across event+command spaces. Mitigate: coerce/canonicalize,
  stable slug ids, grounded provenance, repair-once, pinned snapshot. (Owner: AI review.)
- R4. **Scope creep to stateful sagas** (N0). Mitigate: hard non-goal; single stateless rule only.
  (Owner: product review.)
- R5. **Reaction cycles** producing infinite loops in generated code. Mitigate: PL7 cycle smell + a
  codegen note. (Owner: arch review.)

## 11. Open questions (for reviewers)
- Q1. **Stateless rule vs process manager** — single `event→command` now, sagas later (N0)? Confirm.
- Q2. **Condition** — plain text only now, or a light structured predicate (entity/attribute compare)?
- Q3. **Where reactions live in the UI** — under the triggering event (as specced), or under the
  reacting command, or both (bidirectional)?
- Q4. **Codegen shape** — event-handler stubs in what form (per-area module? a central router?)?
- Q5. **Surface term** — "Automations" / "Rules" / "When… then…"? (UX.)
- Q6. **Cross-area policies** — flag/annotate when a reaction crosses a business area (visibility), or
  treat all reactions uniformly?

## 12. Review & closure

Five lenses reviewed v0.1.0 (REV-022…026); all **Approve-with-changes** (2 UX Blockers, ~18 Majors).
**Build deferred** (consolidate & ship first — see the v0.2.0 note); every finding is nonetheless
resolved into the design so it stays build-ready.

### 13. Finding disposition

| Finding | Lens | Sev | Disposition | Where |
|---|---|---|---|---|
| Panel density/disclosure — 5th editable concept at nesting depth 5; REV-021 F1 collapse only half-built | ux F1 | **Blocker** | **Accepted → clear as consolidation debt BEFORE build**: finish collapsible-entity disclosure (one open at a time) | §7, consolidation |
| Reaction hides its cross-entity target (shown only under trigger) | ux F2 | **Blocker** | **Fixed** — bidirectional display (author under trigger, read-only under the reacting command) + a derived reaction edge on the single map + navigable target | §4, §7, Q3 |
| Codegen-named "demand" overstated (hardcoded gap string; userless consumer) | product M1 | Major | **Fixed** — reframed as codegen-*completeness* signal; A7 partner demand is the real test | §0, §8 |
| Reactions leapfrog the typed-attributes gap (schemas still `unknown` for un-typed entities) | product M2 | Major | **Noted** — typed attributes shipped (opt-in per attribute); handler stubs use them when set; hardening pass to seed types on the example | consolidation |
| §8 correctness-heavy; A6 tests emission not usefulness (tautology) | product M3 | Major | **Fixed** — A7 primary + demand-framed; A6 asserts a traceable non-trivial reaction chain | §8 |
| Over-wiring = product-trust risk (confidently-wrong automation map) | product M4 / ai PF-F1 / domain PL-C1 | Major | **Fixed** — precision-over-recall bias, a **hard storm gate** (policies-per-event cap) + a **spurious-rate** metric (not only recall/coverage); mock is the over-wired baseline so mock-green ≠ quality | §5, §8 |
| Stateful reactions (fan-in/threshold/timeout) will hide in plain-text `condition` | domain PL-C1 | Major | **Fixed** — §2 names what a stateless rule may NOT express + a review-lens keyword smell | §2, §7 |
| PL7 cycle is a no-op on the policy-only graph (cycle closes via SPEC-004 `emits`) | domain PL-C2 | Major | **Fixed** — PL7 detects over the JOINED command/event/policy graph (reuse V6 DFS) | §6 |
| No reconciliation with SPEC-004's derived reacts-to hint (authored vs derived same edge) | domain PL-C3 | Major | **Fixed** — an authored policy SUPERSEDES the derived hint for the same (event→command) pair; the reacts-to hint is also honest consolidation debt (dispositioned in SPEC-004, not yet built) | §4, consolidation |
| Repair allowlist misses PL1 (on/then missing entirely) | domain PL-C4 / ai PF-F2 | Major | **Fixed** — repair triggers on PL1/PL2/PL3 (+ blocker) | §5 |
| Cross-area reactions are the highest-value signal, not uniform | domain PL-C5 / ux Q6 | Major | **Fixed** — first-class derived `crossesArea` annotation + a lens category | §4, §7, Q6 |
| Single-call has no conservation law; storm gate is the sole backstop | ai PF-F1 | Major | **Fixed** — see over-wiring row (storm gate + spurious-rate) | §8 |
| Global on/then snap can silently mis-wire to another entity | ai PF-F2 | Major | **Fixed** — snap id-first against entity-prefixed real ids; enumerate ids in the prompt; pass id sets into the skill | §5 |
| POLICY_SCHEMA nested objects need `additionalProperties:false` | ai PF-F3 | Major | **Fixed** — schema spec'd with the fix; on/then/condition strings | §5 |
| PL5 needs a non-circular anchor fallback | ai PF-F4 | Major | **Fixed** — `withAnchor` grounds to the crossed boundary/narrative theme, never on/then | §5, §6 |
| Invalidation: App blanket-clears domain → destroys authored policies (REV-020 M1 unimplemented) | arch M1 | Major | **Accepted → clear as consolidation debt**: reconcile-not-clear for domain/behaviour/policies in the App | §4, consolidation |
| "Generate automations" merge semantics unspecified | arch M2 | Major | **Fixed** — server returns `{ ...domain, policies }`; POST the behaviour doc, never full-replace | §5 |

Minors/Nits (imprecise schema-version lever + migration debt; optional-field coerce; addNode
silent-drop guard; targeted repair prompt; reactionRecall matches the (on,then) edge not name;
cross-entity panel data; rename IR node `policy`→`reaction`; empty states + button sequencing) —
**accepted** into §5/§6/§7 or the PL-phase tickets.

**Status:** UX F2 + all domain/AI/arch Majors **Fixed** into the design; the two "debt" items (ux F1
disclosure, arch M1 reconcile) are **accepted as consolidation work to do NOW** (they affect the
already-shipped layers regardless of SPEC-005). No strategic Blocker. Build is **deferred** pending a
partner demand signal (owner decision). So this spec is **`Revised` — a reviewed, closed, build-ready
design on the shelf**, un-shelved when demand returns.

### Open-question resolutions
- Q1 stateless vs saga → **stateless rule now; sagas deferred** (N0), with §2 naming the limits.
- Q2 condition → **plain text, no DSL** (N1); a keyword smell flags hidden statefulness.
- Q3 where reactions live → **both ends + a derived map edge**; authored once under the trigger,
  projected read-only under the reaction.
- Q4 codegen shape → per-area event-handler stubs (PL-M5), decided at build.
- Q5 surface term → **"Automations" / "Wenn… dann…"**, reusing existing Aktion/Was-passiert terms.
- Q6 cross-area → **flag distinctly** (`crossesArea`), the highest-value least-visible signal.

### 14. Exit gate — built & verified (PL-M0…M5)

Un-shelved and built after the "whole framework" go-ahead. Gold-free harness (`@vbd/eval/policies`):

| Criterion | Result |
|---|---|
| PL defect recall (5 seeded cases) | **1.000** |
| clean-case precision | **1.000** |
| mock crossEntityRate / provenanceRate | **1.0 / 1.0** |
| mock reactionRecall (vs reference) / spuriousRate | **1.0 / 0.0** |
| **A5 quality (over-wiring guardrail)** | precision instrument in place — `spuriousRate` rises on over-wired sets |

Verified live against Sonnet: the PolicyModeler produced **7 sensible cross-entity hand-offs** on the
full solar flow (lead→customer, offer→purchase-order, work-order→invoice, …) — **conservative, not a
policy-per-event** — with only a PL6 self-loop smell flagged. In-context UI shows each reaction under
its trigger event ("⇒ When … → then … (target entity)"); `@vbd/codegen` emits the reaction handlers
(Workflows tab). 156 tests.

**Decision:** engineering **GREEN**; A6/A7 (partner value + second-domain) fold into the live stack the
partner is already using. **SPEC-005 → `Approved`.** Codegen's "no reactions" gap is closed; the
remaining gap now names roles/workflows/agents/blueprints — the next layers.
