---
sidebar_position: 3
title: Entities
---

# Entities — the things you keep track of

**Why.** Entities are the records your business keeps — the nouns you store information about. Each has
fields (a name, an amount, a date). This is your data, and it becomes database tables and on-screen forms.

**How.** Click **Generate entities**. You get a diagram of record-boxes joined by their relationships.
Click any box to open it and edit its fields; give each field a plain type — **Text, Number, Yes/No,
Date, Money, or Reference** — so the app knows what kind of information it holds.

> **Example.** Billing owns an **Invoice** with fields amount (Money), due date (Date), and paid (Yes/No).

Editing a field, adding a reference, or accepting an **Enrich** suggestion is kept as an *authored* change
(marked with a ✎) that survives a re-review. See
[Protecting your fixes](../reviewing/protecting-your-fixes) for how authored changes relate to
regeneration.
