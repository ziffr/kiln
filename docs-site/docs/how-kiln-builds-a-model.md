---
sidebar_position: 1.5
title: How Kiln builds a model
---

# How Kiln builds a model

Kiln turns a written description of a business into a formal, runnable model. It does this in
**layers** — capabilities, entities, behaviour, roles, and so on. One idea makes the whole tool
click into place:

> **Every layer is built by the same little engine, and each layer reads only the layer directly
> above it.**

Once you see that, nothing about Kiln is mysterious. This page draws it.

## Text is the source of truth; the model is derived

You never draw the model. You write (or paste, or dictate) a **Business Narrative** — a structured,
heading-anchored document with fixed sections (Purpose, Customers, Business Outcomes, Core
Activities). Everything else is *derived* from it. The graph you see on screen is a projection of
that derivation, never the truth itself.

Crucially, **the narrative is the only text Kiln ever reads.** Only the very first layer —
capabilities — consumes it. Every layer after that reads the *previous layer's output*, not the
narrative and not one shared blob.

## Every layer runs the same engine

When you open a stage, this is what happens — the same shape for capabilities, entities, roles,
every layer:

```
  deterministic        LLM           LLM · optional      LLM · optional        you
 ┌──────────────┐  ┌──────────┐   ┌──────────────┐   ┌────────────────┐   ┌──────────┐
 │ Mock scaffold│─▶│ Generate │─▶ │  Enrich  ✨  │─▶ │ Second opinion │─▶ │  Accept  │─▶ next layer
 │   no LLM     │  │  writes  │   │  add detail  │   │   critic  🔍   │   │ you keep │
 └──────────────┘  └──────────┘   └──────────────┘   └────────────────┘   └──────────┘
                        ▲                                     │
                        └─────────────── refine ◀─────────────┘
```

- **Mock scaffold — deterministic, offline, instant.** Before any model runs, the layer is filled
  by a keyword/heuristic surrogate (no key, no network). It reads the layer above and applies fixed
  rules, so a stage is **never blank** — but the content is placeholder scaffolding, not judgment.
  See [Layer states](./modeling/layer-states) for the `○ empty · ◐ mock · ● ready` indicator.
- **Generate — the LLM pass.** Clicking **Generate** on the stage calls the model, which reads the
  same input the mock did and writes real content. The result replaces the mock and becomes the
  layer's truth.
- **Enrich — optional, human-gated.** Some layers (entities, capabilities, roles, agents) offer an
  **✨ Enrich** pass that proposes *missing* detail — attributes a real record would need, child
  entities — either grounded in the model or from live web research, each addition individually
  kept or dropped.
- **Second opinion — optional.** A skeptical LLM **critic** reviews the layer for what's *wrong or
  could be better* (not praise). Its findings feed a **refine loop** back into generation until the
  layer is sound. It proposes; you decide.
- **Accept — you.** Nothing is truth until you keep it. **What you accept becomes the next layer's
  input.**

Generate, Enrich, and Second opinion all call the model; Mock never does. So a layer can be honest
scaffolding, real generated content, enriched, and reviewed — all visible and all editable.

## The layers, and what each one reads

Because each layer reads only its parent, the layers form a dependency tree. This is the exact
read-order (each *reads* is the literal input to that layer's generator):

```
narrative
  └─▶ capabilities        reads narrative → Core Activities
        ├─▶ entities      reads capabilities
        │     └─▶ behaviour            reads entities → commands + events
        │           ├─▶ automations    reads events + commands
        │           └─▶ workflows      reads commands
        ├─▶ areas         reads capabilities
        ├─▶ roles         reads capabilities
        └─▶ agents        reads capabilities
```

Two things worth reading off this tree:

- **Capabilities is the hub** for the *structural* layers — entities, areas, roles, and agents all
  derive straight from it.
- **The behavioural layers sit one level deeper.** Automations and workflows do **not** read
  capabilities — they read *commands and events*, which only exist once the **behaviour** layer has
  run. So they hang off behaviour, not capabilities.

## Build top-down; regenerating a layer resets the ones below it

Because a layer is an input to the layers beneath it, regenerating an upstream layer **invalidates**
everything downstream — Kiln resets those lower layers back to their mock scaffold rather than
leaving stale work built on an input that no longer exists. The mental model is: **build top-down,
and know that regenerating a layer discards the real work beneath it.** (Kiln warns you before it
does.)

## One final check: does the whole thing hang together?

Here's the catch with a layered pipeline: **no single layer ever sees the whole board.** Each is
generated from its parent alone, so every layer can be individually fine while the model as a whole
doesn't cohere — a capability with a screen but no behaviour behind it, an entity nothing touches, a
role that owns nothing.

So before you can export, Kiln runs **one whole-model coherence check** — the only step that reasons
across *all* layers at once:

```
  all layers  ─▶  Holistic coherence check  ─▶  Export
                  ├─ deterministic score  (coverage matrix — free, always runs)
                  └─ LLM whole-model review  (a second opinion on the whole model)
                  gates export 🔒 — nothing exports until it passes
```

- The **deterministic score** builds a coverage matrix — for every capability, does an entity, a
  behaviour, and an owner (role or agent) actually touch it? Any structural break (a chain that
  stops, a dangling reference) is caught here, with no model call.
- The **LLM whole-model review** is the holistic "second opinion" — it judges whether the layers
  tell *one coherent story*, not each in isolation.

Individual players can all be good; this is the check that the *team* plays together. See
[View code](./modeling/view-code) for where the gate lives in the app.

## Why this is the whole picture

That's Kiln, end to end:

1. A structured **narrative** is the one source of truth.
2. **Capabilities** derive from it; every other layer derives from the layer above.
3. Each layer runs the same **engine** — mock scaffold → generate → (enrich) → (second opinion) →
   you accept — and what you accept feeds the next layer.
4. One **holistic coherence check** — deterministic plus LLM — confirms the whole model hangs
   together before it becomes a running app.

Understand those four things and the rest of the documentation is just detail.
