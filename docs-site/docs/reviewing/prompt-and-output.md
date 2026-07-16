---
sidebar_position: 8
title: Prompt & output
---

# Prompt & output

Every modelling stage — Capabilities, Business Areas, Entities, Behaviour, Automations, Roles, Workflows,
Agents — is driven by a call to the AI. The **Prompt & output** panel lets you see exactly what Kiln sends,
tune it for a single session, and inspect what came back — so you can improve your results instead of
guessing.

It's on‑demand: open it from the **Prompt & output** button in the stage's action bar, next to *Generate*
and *Second opinion*. It opens as a drawer on the right and leaves the canvas in place.

## 1. See the prompts

The panel shows the two prompts behind the stage, clearly labelled:

- **Generation** — the instruction Kiln uses when you press *Generate with LLM*.
- **Review** — the instruction the *Second opinion* uses to critique the layer.

These are the real prompts, shown verbatim. Reading them is often enough on its own: it tells you what the
model was asked to do, which explains why a result looks the way it does.

## 2. Tune a prompt for this session

Each prompt sits in an editable box. Change it and the next *Generate* (or *Second opinion*) on that stage
uses your version instead of the default.

The edit is **session only — it is not saved.** The stored prompt is never changed, nothing is written to
your project, and reloading the page restores the default. A **Modified** marker appears while your version
differs from the default, and **Reset** puts it back. Use it to experiment: nudge the wording, run the
stage, and see whether the result improves.

:::note
Because the edit is session‑only, it's a scratchpad, not a setting. If you find a wording you want to keep,
note it down — it won't survive a reload.
:::

## 3. Compare against the last output

Under **Last output**, the panel keeps the **most recent** result for that stage — both the generation and
the review, each overwritten on the next run. Alongside it you'll see which model and engine produced it,
when, and whether a tuned prompt was in effect.

That closes the loop: **view the prompt → tune it → re‑run → compare** the new output to the last one. It's
how you tell whether a change to the prompt actually made things better.

The last output travels with your model: it's kept when you export **model.json** and comes back when you
import it, so you can pick up a comparison later. It's an inspection record only — it never becomes part of
your model, and the code export ignores it entirely.
