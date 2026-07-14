---
sidebar_position: 4
title: Choosing an AI engine
---

# Choosing an AI engine

Kiln uses an AI model to turn your description into a business model. **Anthropic's Claude is the
default and recommended engine** — it has the strongest support for the structured output and
"thinking effort" Kiln relies on. Because Kiln is open source, you can also point it at other engines.

## Available engines

| Engine | What it is | Set up with |
| --- | --- | --- |
| **Anthropic** (default) | Claude models, direct or via the Langdock gateway | `KILN_ANTHROPIC_API_KEY` (or `KILN_LANGDOCK_API_KEY`) |
| **OpenRouter** | A hosted gateway to 250+ models (Claude, GPT, Gemini, DeepSeek, Llama, …) | `KILN_OPENROUTER_API_KEY` |
| **omniroute** | A self-hosted local proxy you run yourself | `KILN_OMNIROUTE_API_KEY` + `KILN_OMNIROUTE_BASE_URL` |

An engine only appears in Kiln when its key is set **on the server** (in your `.env`) — the key never
reaches the browser. See [`.env.example`](https://github.com/ziffr/kiln/blob/main/.env.example) for the
exact variables. If you only set the Anthropic key, Kiln behaves exactly as before.

## Selecting the engine, model, and effort in Studio

Open **Settings** (bottom of the sidebar) → the **Engine** section:

1. **Provider** — pick the engine (only shown when more than one is configured). Anthropic is preselected.
2. **Model** — pick a model from that engine. For the gateways you can also choose **"Custom model id…"**
   and type any model slug (e.g. `openai/gpt-5-mini` on OpenRouter, or `auto/coding` on omniroute).
3. **Effort** — the "thinking effort" per step (low → max). Models that don't support it simply ignore it.

You can also turn on **"pick a model per step"** to run harder stages (like behaviour) on a stronger
model and lighter stages on a cheaper one. These choices are saved with the project.

## Things to know

- **Spend estimates** are shown only for Anthropic models (Kiln knows their prices). On the gateways the
  estimate reads as n/a — check your provider's dashboard for actual cost.
- **Web research (Enrich from the web)** and the **AI interview** stay on Anthropic even when another
  engine is selected — they use Anthropic-native features. Pasting or writing your narrative works with
  any engine.
- **Structured output** is requested from every engine; if a particular model rejects it, Kiln falls
  back to parsing the model's JSON, so generation still works (just a little less strictly enforced).
