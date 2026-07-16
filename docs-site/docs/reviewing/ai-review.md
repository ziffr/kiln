---
sidebar_position: 2
title: Second opinion
---

# Second opinion

Beyond the automatic checks, the **Second opinion** asks an AI to critique your model for **quality** —
vague names, missing pieces, over-wiring, a workflow that never completes. It's exactly that: a second
opinion, always yours to accept, act on, or reject. (The automatic checks catch *structure*; this reads for
*meaning*.)

There are two ways in:

- **Per layer** — the **Second opinion** button in a stage's action bar (next to *Generate*) reviews just
  that layer; its findings appear in the stage's own issues panel. This is the quick, in-context check.
- **Whole model** — the **Second opinion** card (and the *Review whole model* button) on **Home** open the
  full **dashboard** below, which reviews every layer top-down plus the cross-cutting pass.

You can also chain it to generation: **Settings → AI engine → After generating → "Run the Second opinion
automatically"** makes each **Generate** run the review on that layer as soon as it finishes (findings land
in the stage's issues panel). It's scoped to the layer you generated — generating resets the layers below
it to placeholders, so there's nothing valid to review below yet.

**Who reviews.** By default the Second opinion uses the same model that generated each layer (at higher
effort). Under **Settings → AI engine → Reviewer** you can point it at a *different* engine — the
**LLM-as-judge** pattern: e.g. have **Anthropic** review layers you generated on **OpenRouter**. A fresh,
independent (often stronger) model tends to catch more than the one that wrote the model.

## The loop

The Second-opinion dashboard is a **launcher and status board**, not a place to edit findings. It opens with
a **one-line summary** of what to do next (where to start, or "all reviewed — looks clean"), a thin
**progress gauge** showing how many layers are reviewed and how many are flagged, and one headline action:

1. **Review all layers** → runs every reviewer top-to-bottom, read-only — a second opinion on the whole
   model that never changes it. Each layer's row then shows a **status and finding count**.
2. **Click a flagged layer** → the dashboard jumps you to that layer's own stage, where its findings are
   listed in context (next to the map/entities they're about). There you close each one:
   - **Fix** — apply the AI's suggestion;
   - **Ignore** — accept it for good (see [Ignoring concerns](ignoring-concerns));
   - or click the finding to jump to the element and edit it yourself.

Findings live on the stages, not in the dashboard — so there's one place for each thing, in context. The
one exception is the **cross-cutting** section at the top, whose findings span the whole model and belong
to no single stage; those stay in the dashboard.

Everything else is a power tool, tucked behind the **Advanced** toggle: per-layer model/effort labels and
**Auto-fix all** — a review-*and-regenerate* loop that drives every flagged layer to clean but **changes
your model** (see [Progress & loops](progress-and-loops)). For a single-layer check without the dashboard,
each stage also has its own **Second opinion** button.

:::info It's advisory, and it doesn't converge to zero
The reviewer is calibrated to *always find something* — a few subjective suggestions is a fine place to
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

Each Review, Apply, or Fix that calls the model costs a small amount (shown in the session spend). Running
a **single-layer** review shows a quick cost confirmation first — with a *"don't ask again this session"*
option — and the whole-model **Review all layers** confirms up front too. This feature needs a real model,
so it's available when you run your own instance with an API key — not on the keyless public demo.
