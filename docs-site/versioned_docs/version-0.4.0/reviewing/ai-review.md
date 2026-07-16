---
sidebar_position: 2
title: AI Review
---

# AI Review — a second opinion

Beyond the automatic checks, **AI Review** asks an AI to critique your model for **quality** — vague names,
missing pieces, over-wiring, a workflow that never completes. It's a second opinion, always yours to accept,
act on, or reject.

There are two ways in:

- **Per layer** — the **AI review** button in a stage's action bar (next to *Generate*) reviews just that
  layer; its findings appear in the stage's own issues panel. This is the quick, in-context check.
- **Whole model** — the **AI review** card (and the *Review whole model* button) on **Home** open the
  full **closure dashboard** below, which reviews every layer top-down plus the cross-cutting pass.

## The loop

The AI Review dashboard is a **closure dashboard**. It opens with a **one-line summary** of what to do
next (where to start, or "all reviewed — looks clean"), a thin **progress gauge** showing how many
layers are reviewed and how many are flagged, and one headline action:

1. **Review all layers** → runs every reviewer top-to-bottom, read-only — a second opinion on the whole
   model that never changes it. Each layer then shows its **findings**, each with a severity (a *concern*
   vs. a subjective *suggestion*), a message, and a concrete suggestion.
2. For each finding, choose how to close it:
   - **Fix** — apply the suggestion (see [Fixing concerns](fixing-concerns));
   - **Ignore** — accept it for good (see [Ignoring concerns](ignoring-concerns)).

Everything else is a power tool, tucked behind the **Advanced** toggle: reviewing (or re-reviewing) a
**single layer**, the per-layer model/effort labels, and **Auto-fix all** — a review-*and-regenerate*
loop that drives every flagged layer to clean but **changes your model** (see
[Progress & loops](progress-and-loops)). For a quick single-layer check you can also use the **AI review**
button on that layer's own stage.

:::info It's advisory, and it doesn't converge to zero
The AI reviewer is calibrated to *always find something* — a few subjective suggestions is a fine place to
stop. Findings are judgment calls, not a checklist that hits zero. The panel says so, and nudges you when
you've refined a layer enough.
:::

## Only generated layers are reviewable

Until you run **Generate** on a layer, what you see there is a **placeholder** — a rough draft derived
automatically from the layer above, not a model Kiln has actually worked out. Reviewing a placeholder would
just have the AI critique the draft, so the panel **gates it**: a not-yet-generated layer is shown dimmed,
marked **"Placeholder — not generated"** with **"Generate first"**, and has no Review button. Generate it on
its own stage and it becomes reviewable. (**Auto** likewise skips placeholders; if *every* layer is still a
placeholder, it tells you there's nothing to review yet.)

## Cross-cutting root issues

Above the per-layer list sits a **Cross-cutting** section — the whole-model pass. It looks across every
layer at once for a **broken chain**: a capability with no entity, a role that owns nothing, an entity no
command ever touches. These are *root causes* — fixing one at its source often clears several per-layer
symptoms below, so it's the first thing worth checking. Each finding links straight to the element on the
map.

## Where to start — work top-down

Your model is a stack: each layer builds on the one above it, so a finding on a lower layer only makes
sense once the layers above it are sound. The panel reflects that dependency order instead of showing one
flat list:

- Layers are listed **top-down**, and within a layer **concerns** (real problems) sort above optional
  **suggestions**.
- The highest layer with a real problem is marked **Start here** — fix that one first.
- Layers below an unresolved one are **dimmed** with *"Resolve X first"*. That's not just tidiness:
  **Apply** on an upstream layer regenerates the layers beneath it, so fixing a lower layer first can be
  undone the moment you fix the one above. Choose **Review anyway** to look ahead when you want to.
- When applying a layer *will* regenerate the ones below it (Entities and Behaviour share one model doc
  with Automations), the **Apply** button spells it out — naming those layers and counting the open
  findings there that the regeneration resets — so it's never a silent surprise.
- After you apply, each regenerated layer that you'd already reviewed is flagged **"changed upstream —
  re-review"** rather than a bare "not reviewed" — so you can tell at a glance which layers a quick,
  cheap re-check will confirm. Nothing is re-scanned automatically (that would spend tokens); a re-review
  is always yours to trigger, and it clears the flag.

Drive the highest open layer to clean, re-review, and the ones below reappear — usually a shorter list,
because fixing a root cause upstream often removes its knock-on findings.

## Apply vs. Fix

There are two different "make it better" actions, and the difference matters:

- **Apply** (the batch button) feeds your accepted points back and **regenerates the whole layer**. It's
  good for early, sparse layers — but because it rebuilds everything, it can undo earlier fixes and
  **oscillate**. Re-review to confirm it actually helped.
- **Fix** (per finding) applies **one precise edit** and nothing else — it *converges*.

The next pages cover both, and how to tell progress from churn.

## Cost

Each Review, Apply, or Fix that calls the model costs a small amount (shown as a spend estimate). This
feature needs a real model, so it's available when you run your own instance with an API key — not on the
keyless public demo.
