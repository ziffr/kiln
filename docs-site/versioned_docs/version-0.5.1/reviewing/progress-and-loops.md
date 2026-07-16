---
sidebar_position: 4
title: Progress & loops
---

# Progress & loops — reading a re-review

A re-review returns a **fresh** list of findings. On its own, "4 findings became 5" tells you nothing —
did the old four get fixed, or come back? Two things help you tell.

## Fix converges; regenerating can churn

A per-finding **[Fix](fixing-concerns)** changes exactly one thing, so a re-review won't raise it again —
it **converges**. **Auto-fix all** (the whole-model, review-*and-regenerate* loop behind the dashboard's
**Advanced** toggle) rebuilds whole layers, so it can fix some findings while **re-breaking** others it
fixed a round or two ago — a layer **oscillates** between two sets of concerns instead of settling.

So when you want a concern *closed*, prefer **Fix** (one precise change) over letting the generative loop
rebuild the layer again — and **[Ignore](ignoring-concerns)** the subjective ones you accept.

## The delta summary

Re-run the **whole-model review** ("Review all layers") and its cross-cutting summary labels what changed
since the previous round, so you can read progress rather than a raw count:

- **✓ resolved** — flagged last time, gone now;
- **↻ still open** — was flagged in the previous round too;
- **✦ new** — surfaced this round (often introduced by a regeneration);
- **↺ recurring** — flagged in an *earlier* round, went away, and is **back**.

**↺ recurring** is the signal that a generative rebuild is going in circles — that's your cue to stop the
loop and **Fix** the specific spots by hand, or **Ignore** what you accept.

:::note Why it loops
The reviewer is a fresh, subjective pass each time, and regeneration rebuilds a layer rather than patching
one spot. Both together mean a model won't naturally settle to zero findings — which is expected, not a
bug. Prefer **Fix** to reach a stable, closed state.
:::
