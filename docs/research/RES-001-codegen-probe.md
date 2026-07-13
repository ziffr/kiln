---
id: RES-001
title: Codegen probe — does the model produce runnable scaffolding, and what's missing?
type: research
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-10
updated: 2026-07-10
related: [SPEC-002, SPEC-003, SPEC-004, REV-017]
---

# RES-001 — Codegen probe

## Question
The whole "Business Compiler" thesis rests on an **unproven bet**: that the model (capabilities →
entities → areas) carries enough structure to project into **runnable code**, and that generation can
be a reliable *one-way scaffolding* pass. Four modelling layers in, this had never been tested
(REV-008 → REV-012 → REV-017 B1, three recurrences). Before building a fourth modelling layer
(SPEC-004), probe it:

1. Does the current model generate anything **useful** as code?
2. What is **missing** for faithful codegen — i.e. what should the next modelling investment add?

## Method
A new pure package **`@kiln/codegen`** — a *deterministic compiler pass* over the model (no LLM; codegen
is a projection, per golden invariant #1 and the feasibility note's one-way-scaffolding stance). It
emits three artifacts and a **gap report**:
- **TypeScript types** — an `interface` per entity (id + attributes + references).
- **OpenAPI 3 sketch** — a CRUD resource per entity, each **tagged by its business area** (SPEC-003).
- **Module map** — `area → capability → entity-file`, i.e. areas as code module seams.
- **`detectGaps`** — what the model cannot yet express.

Run against the solar reference (mock capabilities + entities + areas). 5 unit tests; `npm test` green.

## Findings

**The thesis holds for scaffolding.** From the solar model, deterministically and with zero LLM calls,
the probe produced a coherent projection:
- **8 TypeScript interfaces** (Lead, Customer, Design, Offer, PurchaseOrder, WorkOrder, Invoice,
  ServiceTicket).
- **16 OpenAPI paths** (8 CRUD resources), each tagged by business area.
- **3 area modules** partitioning the 8 capabilities and their entity files — **the SPEC-003 Business
  Areas become the code module seams**, empirically validating that layer's codegen claim.

So the model→scaffold projection is real and clean: the structure we've modelled is enough to generate
a modular API + type skeleton. This is the "generation as one-way scaffolding" outcome the feasibility
note predicted — not a full round-trip, but genuine, useful scaffolding.

**Two gaps — and they name the next investments.**
1. **Entities have no typed attributes.** The mock entities carry no attributes at all; even the LLM
   entities (DM2) carry attribute *names* with no types, so every field projects to `unknown` / a
   bare `string`. Faithful data schemas need a **typed-attributes** model (a small increment on
   SPEC-002 — the same territory as SPEC-004 N1 payloads).
2. **Operations are CRUD-only.** With no commands/events, the API can only offer create/read/update/
   delete — it cannot express domain actions ("Qualify Lead", "Issue Invoice") or the events they
   emit. **This is precisely the SPEC-004 behaviour layer.**

## Conclusion & recommendation
- **The core thesis is de-risked.** Model→code works for scaffolding today; the biggest unproven bet
  moves from "unknown" to "validated for one-way scaffolding" (a full editable round-trip remains
  explicitly out of scope, per ADR-002 / the feasibility note).
- **SPEC-004 is now *empirically* justified.** The product Blocker (REV-017 B1) asked whether the
  behaviour layer is real demand or methodology-completeness. The probe answers it concretely: **the
  single largest thing blocking useful codegen beyond CRUD is the absence of commands/events.** SPEC-004
  is the next codegen-relevant modelling need — driven by the codegen finding, not by completeness.
- **A typed-attributes increment** is the other codegen-relevant gap — smaller than SPEC-004, and it
  makes the generated data schemas faithful. Candidate to pair with, or precede, SPEC-004.

**Recommended next step:** un-shelve **SPEC-004** (build the behaviour layer, already reviewed to
closure) — now with empirical justification — and fold a small **typed-attributes** addition into the
entity model so codegen produces real schemas. The `@kiln/codegen` probe stays as the yardstick: every
new modelling layer should measurably improve what it can generate.
