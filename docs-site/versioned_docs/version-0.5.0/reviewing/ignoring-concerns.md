---
sidebar_position: 5
title: Ignoring concerns
---

# Ignoring concerns — accept it for good

Not every concern needs a fix. Some are deliberate choices, or things you can't address yet. **Ignore**
gives a concern a real terminal state: accept it, and have it stay gone.

## What Ignore does

Click **Ignore** (✕) on a finding and Kiln:

1. **removes it right away** from the current list;
2. **persists** the choice with the project (it survives reloads and regeneration);
3. **tells the reviewer** about it — the accepted concern is fed into the next critique prompt so the
   model stops raising it at the source;
4. **matches it fuzzily** — because the AI rewords concerns from round to round, an accepted concern is
   matched by the node it's about, not its exact wording, so a reworded re-raise stays silenced.

## Restoring

Changed your mind? Each layer shows **"N ignored — restore"** when it has accepted concerns. Restore brings
them back so they can surface again on the next review.

:::tip Fix or Ignore — always one of the two
Between **[Fix](fixing-concerns)** (resolve it) and **Ignore** (accept it), every concern can reach a
clean end state. You never have to leave the loop running just because the reviewer keeps talking.
:::

The same ✕ Ignore also works on the deterministic [findings](findings) shown per stage.
