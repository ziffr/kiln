---
sidebar_position: 6
title: Protecting your fixes
---

# Protecting your fixes

Hand-made changes — a surgical **Fix**, an edited entity field, a moved capability — are stored as
**authored** elements in your model. Understanding where they live tells you when they're safe and when
they're at risk.

## Where authored changes live

Authored changes are part of **`model.json`** — the complete, versionable document holding every layer of
your business. That's the durable source of truth for export and code generation. They **survive a
re-review**, and they're included when you **Export model** or generate code.

They are **not** written into the Business Narrative, and the modeling flow is **one-way, top-down**
(narrative → capabilities → … → agents). So a fresh top-down pass doesn't know about them.

## When a regeneration would discard them

Regenerating a layer **replaces it wholesale**. That means:

- **Generate** on a layer that holds hand-made fixes replaces them;
- editing the **narrative** resets *every* downstream layer;
- **Generate Capabilities** resets everything below it.

## The regeneration guard

To stop this happening silently, Kiln **warns first**. If a Generate (or a narrative edit) would discard
authored fixes, you get:

> This layer has *N* hand-made fix(es). Regenerating replaces the whole layer and discards them. They live
> in `model.json` (⬇ Export model) — the narrative doesn't hold them, so a top-down regenerate loses them.
> Continue?

Cancel and nothing is lost. If you do want to regenerate, **Export model** first to keep a copy.

## Keeping the narrative honest

Because fixes don't flow back into the narrative, the prose can fall behind the model. **Sync narrative**
closes that gap — see [Narrative sync](narrative-sync).

## Resetting the model

There's no single "reset" button, but you can start over in a few ways: **edit the narrative** (clears
every derived layer), **Import model** (replace wholesale), **delete the project** and start a new one, or
**Versions → restore** an earlier snapshot. The regeneration guard applies to the narrative-edit route, so
you won't wipe fixes by accident.
