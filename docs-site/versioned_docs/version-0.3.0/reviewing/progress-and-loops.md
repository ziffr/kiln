---
sidebar_position: 4
title: Progress & loops
---

# Progress & loops — reading a re-review

A re-review returns a **fresh** list of findings. On its own, "4 findings became 5" tells you nothing —
did the old four get fixed, or come back? Kiln answers that by **comparing rounds** and labelling what
changed.

## The delta summary

After a re-review, the layer shows a one-line summary of what changed since the previous round:

- **✓ resolved** — flagged last time, gone now;
- **↻ still open** — was flagged in the previous round too;
- **✦ new** — surfaced this round (often introduced by a regeneration);
- **↺ recurring** — flagged in an *earlier* round, went away, and is **back**.

Resolved items are listed struck-through so you can see what your changes cleared, and each remaining
finding carries its own ↻ / ✦ / ↺ marker.

## The oscillation warning

**↺ recurring** is the important signal. A generative **Apply** rebuilds the whole layer, so it often
fixes the flagged items but re-breaks others it fixed a round or two ago — the layer **oscillates**
between two sets of concerns instead of converging. When Kiln detects this, it drops the soft nudge and
shows an explicit warning:

> ⚠ This layer is going in circles: Apply regenerates the whole layer and re-introduces concerns it fixed
> earlier. Re-applying won't converge here — edit the flagged spots by hand, or stop.

That's your cue to stop pressing **Apply** and instead **[Fix](fixing-concerns)** the specific concerns
(which converges) or **[Ignore](ignoring-concerns)** the ones you accept.

:::note Why it loops
The AI reviewer is a fresh, subjective pass each time, and Apply is *generative* (it rebuilds the layer
rather than patching one spot). Both together mean a layer won't naturally settle to zero findings — which
is expected, not a bug. The delta and the warning make that legible so you know when to stop.
:::
