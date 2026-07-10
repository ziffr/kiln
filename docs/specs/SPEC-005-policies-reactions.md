---
id: SPEC-005
title: Policies & Reactions — cross-entity workflow rules
type: spec
status: Draft
version: 0.1.0
author: Claude (Opus 4.8)
created: 2026-07-10
updated: 2026-07-10
supersedes: null
related: [SPEC-001, SPEC-002, SPEC-003, SPEC-004, RES-001, ADR-001, ADR-002, ADR-004, ADR-006]
reviewers: [product-strategy, domain-modeling, ai-llm-feasibility, technical-architecture, ux-hitl]
---

# SPEC-005 — Policies & Reactions

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
*(Pending — five independent lenses. Findings + disposition logged here to closure before `Approved`,
per CONVENTIONS §4.)*
