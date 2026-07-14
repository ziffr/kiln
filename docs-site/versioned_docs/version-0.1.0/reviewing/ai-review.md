---
sidebar_position: 2
title: AI Review
---

# AI Review — a second opinion

Beyond the automatic checks, the **AI Review** button (top-right) asks an AI to critique a layer for
**quality** — vague names, missing pieces, over-wiring, a workflow that never completes. It's a second
opinion, always yours to accept, act on, or reject.

## The loop

The AI Review panel is a **closure dashboard**: each layer shows a status and the
**Review → act → re-review** loop.

1. **Review** a layer → the AI returns a list of **findings**, each with a severity (a *concern* vs. a
   subjective *suggestion*), a message, and a concrete suggestion.
2. For each finding, choose how to close it:
   - **Fix** — apply the suggestion (see [Fixing concerns](fixing-concerns));
   - **Ignore** — accept it for good (see [Ignoring concerns](ignoring-concerns)).
3. **Re-review** to confirm — the panel shows you exactly what changed (see
   [Progress & loops](progress-and-loops)).

:::info It's advisory, and it doesn't converge to zero
The AI reviewer is calibrated to *always find something* — a few subjective suggestions is a fine place to
stop. Findings are judgment calls, not a checklist that hits zero. The panel says so, and nudges you when
you've refined a layer enough.
:::

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
