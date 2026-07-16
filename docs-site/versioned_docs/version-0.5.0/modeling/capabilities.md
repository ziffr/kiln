---
sidebar_position: 1
title: Capabilities
---

# Capabilities — the building blocks

**Why.** Capabilities are the major things your business does — its "blocks of work". They are found
first because everything else in the model hangs off them.

**How.** Click **Generate with LLM**. A map of boxes appears, joined by "depends on" lines. Click any box
to read or edit it in the side panel; use **+ Capability** to add one. **Enrich** suggests blocks a
typical business in your industry usually has that yours is missing — you keep only the ones that fit.

**Wiring a dependency.** The lines on the map are a projection — you don't draw them there. To make one
capability depend on another, open it and, under **Depends on** in the side panel, pick the other
capability from the list. This is also how you clear an *"isolated (no relationships)"* hint: open the
flagged capability and pick what it depends on. The picker only offers capabilities that exist, so it can
never leave a broken link.

**The side-panel fields are pickers.** Most fields relate the capability to something else in the model,
so instead of free text they let you pick from what exists: **Depends on** picks a capability,
**Actors** picks a modelled **role**, and **Produces / Consumes** pick an **entity** (Produces/Consumes
also let you type a loose object that isn't a stored entity yet). When a field's values live on another
screen, the picker ends with a **"Manage in …"** link — e.g. Actors → **Roles**, Produces → **Entities** —
so you can jump there, author the missing value in its home screen, and come back without losing your
place. Only **Outcomes** stays free text.

> **Example.** For a solar installer you get boxes like Lead Management, Solution Design, Procurement,
> Installation, and Billing.

Capabilities is the one **review-only** layer: because everything downstream is derived from it,
regenerating it would reset the layers below. You refine capabilities by editing them directly.
