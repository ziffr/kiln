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

## Quick start

**OpenRouter** is the zero-install way to try other models — it's hosted, so you only need a key:

```bash
# in your .env
KILN_OPENROUTER_API_KEY=sk-or-...
```
Restart the service and OpenRouter appears in **Settings → Engine** with 250+ models.

**omniroute** is a self-hosted gateway you run locally (privacy/offline, pooled free tiers). It's an
*optional sidecar*, **not** a Kiln dependency — Kiln just calls it over HTTP. A helper starts it via `npx`
(no global install; MIT-licensed):

```bash
./kiln.sh omniroute:up        # runs omniroute on :20128 (Ctrl-free; ./kiln.sh omniroute:down to stop)
```
Then open its dashboard (`http://localhost:20128`), connect a provider and copy an API key, and add:

```bash
# in your .env
KILN_OMNIROUTE_API_KEY=<key from the omniroute dashboard>
# KILN_OMNIROUTE_BASE_URL defaults to http://localhost:20128/v1
```
Restart the service and pick omniroute in **Settings → Engine**.

## Selecting the engine, model, and effort in Studio

Open **Settings** (bottom of the sidebar). There are two levels:

**Engine & models** sets the provider, model and effort every stage uses unless overridden:
1. **Provider** — pick the engine (shown when more than one is configured). Anthropic is preselected.
2. **Model** — pick a model from that engine. For the gateways you can also choose **"Custom model id…"**
   and type any slug (e.g. `openai/gpt-5-mini` on OpenRouter, or `auto/coding` on omniroute).
3. **Effort** — the "thinking effort" (low → max). Models that don't support it simply ignore it.
4. **Adaptive** (on by default) — on Anthropic, each stage automatically picks a model and effort by how
   hard it is: heavy reasoning (capabilities, business areas, automations, the whole-model review) →
   **Opus · high**; standard stages (behaviour, workflows) → **Sonnet**; light, mechanical stages
   (entities, roles, agents) → **Haiku**. Turn it off to run every stage on the single default model
   above. On the gateways there's no tier equivalent, so they always use the default model.

**Per stage** (click *customize*) lets you override any individual stage — its **provider, model, AND
effort** — independently of the default. Each stage row explains what it produces, and each cell shows the
resolved `(default)` until you change it (so with Adaptive on you'll see e.g. `(default: Opus 4.8)` on
capabilities). For example: keep the adaptive defaults but drop **Entities** to a cheap OpenRouter model in
low effort. It also covers the **Polish layout** and **Visual review** stages — Visual review is a vision
pass, so its provider is locked to Anthropic. All of this is saved with the project.

## The engine choice also carries into the exported app

The engine you pick isn't only used to *generate* the model — if your business has **agents**, the
exported app runs them at runtime, and that runtime honours the **same engines**. The generated
`agents/` runtime picks its provider from a `PROVIDER` env var:

- `anthropic` — `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL` (per-agent model/effort apply here),
- `openrouter` — `OPENROUTER_API_KEY` + `OPENROUTER_MODEL`,
- `omniroute` — `OMNIROUTE_BASE_URL` + `OMNIROUTE_API_KEY` + `OMNIROUTE_MODEL`,
- `openai-compatible` — any other OpenAI-style endpoint (LiteLLM, vLLM, Ollama, Azure OpenAI):
  `OPENAI_BASE_URL` + `OPENAI_API_KEY` + `OPENAI_MODEL`.

**The export is pre-pointed at the engine you built on.** If you generated on omniroute, the exported
`agents/.env.example` leads with `PROVIDER=omniroute` and your chosen model — so an app built precisely
*because* you can't use Anthropic doesn't ship Anthropic-first. Every engine's block is still present, so
switching at deploy time is a one-line `PROVIDER=` change. (Only the Node agent runtime is affected; the
optional Langdock agent runtime is a separate binding.)

## Things to know

- **Spend estimates** are shown only for Anthropic models (Kiln knows their prices). On the gateways the
  estimate reads as n/a — check your provider's dashboard for actual cost.
- **Web research (Enrich from the web)** and the **AI interview** stay on Anthropic even when another
  engine is selected — they use Anthropic-native features. Pasting or writing your narrative works with
  any engine.
- **Structured output** is requested from every engine; if a particular model rejects it, Kiln falls
  back to parsing the model's JSON, so generation still works (just a little less strictly enforced).
- **Per-agent `effort`** (thinking level) applies on Anthropic only; on the OpenAI-compatible gateways
  agents use the model as-is.
