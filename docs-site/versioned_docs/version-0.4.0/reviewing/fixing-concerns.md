---
sidebar_position: 3
title: Fixing concerns
---

# Fixing concerns

Every Second-opinion finding offers a way to fix it *for real* — so the concern is gone, not hidden. There are
two, and Kiln shows whichever fits the finding.

## Fix — the convergent one-click fix

When a suggestion is concrete and unambiguous, Kiln shows a green **Fix** button. It applies **exactly
that one change** to the model — add the reaction, type the field, wire the reference, append the workflow
step — with **no full-layer regeneration**. Because only the flagged thing changed, the concern is
genuinely resolved and a re-review won't raise it again. This is the **convergent** path.

Kiln can parse and apply suggestions like:

| Layer | Example suggestion | Applied as |
| --- | --- | --- |
| Automations | "on `offer_accepted` → then `schedule_installation`" | add that reaction |
| Entities | "add `total:money` and `issuedOn:date` to Invoice" | add typed fields |
| Entities | "add a supplier reference to `purchase_order`" | wire the reference |
| Roles / Areas / Agents | "assign Billing to the Finance role" | link the capability |
| Workflows | "append `complete_installation` → `issue_invoice`" | add the steps |

It resolves the names against your model and only offers **Fix** when it lands on exactly one target — so
it never wires the wrong thing. If a suggestion is ambiguous or phrased as prose (a *split*, *merge*, or
*rename*), Kiln falls back to the manual path instead.

## Fix in model — jump to the node

When a suggestion can't be applied automatically, the button reads **Fix in model**. It jumps you to the
exact node with the suggestion in view, and you make the change in the normal editor — add the command,
adjust the role, remove the redundant automation. This is also convergent: you've changed the underlying
model, so the condition is gone.

:::tip Fix, don't re-Apply, to reach closure
The generative **Apply** rebuilds a whole layer and can churn. When you want a concern *closed*, prefer
**Fix** / **Fix in model** (one precise change) over pressing Apply again.
:::

Hand-made fixes are marked *authored* and survive a re-review. To keep them safe across a regeneration,
see [Protecting your fixes](protecting-your-fixes).
