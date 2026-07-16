---
sidebar_position: 1
title: Findings
---

# Findings — the app checking your work

Every layer runs **automatic checks** (deterministic validators). Any gaps or inconsistencies appear as
**findings** in a panel at the top of the screen, and as a small coloured count next to the layer in the
left rail — amber for notes, red for concerns. That rail badge appears only on **generated** layers; a
draft (◐) shows no findings, because there's nothing to judge until the model has produced the layer (see
[How layers fill in](../modeling/layer-states)).

Each finding:

- is labelled by **severity** — *Important* vs. a lighter *Note*;
- tells you **what to do about it**;
- is **click-through** — click it to jump straight to the thing it's about and fix it.

## Two ways to close a finding

Every finding should end in one of two states:

1. **Fixed** — you change the model so the condition no longer holds. The finding stops appearing because
   it's genuinely resolved.
2. **Ignored** — you accept it on purpose. Click **✕** to ignore it; ignored findings stay hidden even
   after you regenerate, for things you can't (or won't) fix.

These validators are structural and objective. For a deeper, quality-oriented second opinion, see
[Second opinion](ai-review).
