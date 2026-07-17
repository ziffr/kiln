---
sidebar_position: 7
title: Narrative sync
---

# Narrative sync — keep the prose honest

Hand-made fixes land in the model but not in the Business Narrative, so the prose can silently fall behind
what the model actually says. **Sync narrative** reconciles the two — in a reviewed, one-way pass.

## How it works

On the **Business Narrative** stage, **Sync narrative** appears once your model has automations. Click it
and Kiln:

1. reads the model's business rules and the current narrative;
2. proposes plain-language sentences for the rules the narrative **doesn't already state** — in business
   terms, not technical ids (e.g. "When a purchase order is approved, it is automatically sent to the
   supplier");
3. opens an **editable review** — trim, reword, or drop lines;
4. on **Append to narrative**, adds them **without resetting the derived layers**.

That last point matters: unlike a normal narrative edit (which wipes everything downstream), this is a
**reconciling** edit — it brings the narrative up to date *with* the model, so your layers and fixes stay
intact.

:::caution One-way, not lossless
Narrative sync keeps the prose readable and honest. It does **not** promise that regenerating from the
narrative would reproduce these exact rules — turning a precise model change back into prose is inherently
lossy. Treat `model.json` as the durable source of truth (see
[Protecting your fixes](protecting-your-fixes)); the narrative is the human-readable account.
:::
