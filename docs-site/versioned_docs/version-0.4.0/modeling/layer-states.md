---
sidebar_position: 0
title: How layers fill in
---

# How layers fill in — mock vs. generated

Kiln's model is a stack of layers — capabilities, areas, entities, behaviour, and so on — each derived
from the ones above it. A common misunderstanding is that describing your business "generates everything"
in one pass. It doesn't, and knowing the real mechanism makes the whole tool easier to read.

## Describing your business does not generate the model

When you write or import your description, Kiln runs an **understand** pass: it mirrors your text back as a
short summary and a list of open questions. That's all. **No capabilities, entities, or any other layer are
produced at this point.** It's a comprehension step, not a generation step.

## Every layer shows a live draft before you generate it

So why does every stage already show *something* when you open it? Because each layer that you haven't
generated yet displays a **live, automatic derivation** of the layer above — a deterministic best-guess
computed on the spot, with no AI involved. It exists so stages are never blank and you can see the shape of
things, but it is **placeholder scaffolding, not model output**.

The real content for a layer is produced only when you open that stage and click **Generate with LLM**
(or, on some layers, **Enrich → Web**). That runs the AI, and its result replaces the draft and is saved.

This gives every layer three states, shown as a dot on the stage rail:

| Dot | State | Meaning |
| --- | --- | --- |
| ○ | **Empty** | Nothing here yet. |
| ◐ | **Draft** | A live, auto-derived placeholder. Not generated — click **Generate** to make it real. |
| ● | **Generated** | The AI produced this layer (or you authored it). This is real content. |

**The shape tells you how far along a layer is; it is never a warning.** A draft (◐) is simply a layer
waiting for you — Kiln shows no findings or problems on a draft, because there is nothing to judge until
the model has actually produced the layer.

## Health is shown only on generated layers

Once a layer is **generated** (●), Kiln checks it and shows its health as a small coloured badge next to
the dot:

- **no badge** — clean; a green ● means "generated and looks good";
- **amber badge** — minor suggestions worth a look;
- **red badge** — concerns you should resolve.

The number on the badge is how many open findings there are. Because health appears only on generated
layers, a coloured badge always means the AI produced something and there's a real point to act on — never
a false alarm about a placeholder.

## Work top to bottom — regenerating resets what's below

Layers depend on the ones above them, so **build in order, from the top**. One consequence matters:
**regenerating a layer resets the layers beneath it back to drafts.** For example, regenerating
Capabilities clears the generated Entities, Behaviour, Roles, and everything downstream — they return to
◐ drafts until you generate them again. Kiln warns you before a regeneration would discard authored work
below (see **[Protecting your fixes](../reviewing/protecting-your-fixes)**). Generating *forward* — the
next layer down — is always safe.
