---
sidebar_position: 2
title: Getting started
---

# Getting started

Open the app ([live demo](https://demo.kilnstudio.app) or your own instance) and either **load an
example** or **start a description of your own**. Everything begins with the narrative — your
plain-language account of the business.

## Describe your business — a conversation, not a form

The first stage (**Business Narrative**) is a single dialogue. Write a description of your business in
your own words in the one input — or paste a meeting transcript / notes, or upload a `.txt`/`.md` file.
No headings, no jargon.

Click **Understand** and Kiln reads it back to you: a plain-language **summary** of what it understood, a
sense of how well it understands your business, and the **open questions** still worth answering. From
there:

- **Continue the conversation** hands off to a friendly business analyst who picks up the first open
  question and helps you fill the gaps — your own words carry straight into the chat.
- **Describe again** to start over, or **Edit directly** to hand-edit the structured text (Purpose,
  Customers, Business Outcomes, Core Activities, Constraints) — the text is always the source of truth.

> **Example.** "We are a solar installer. We find customers, design a system for their roof, order the
> parts, install it, and send the invoice."

## Working through the layers

Use the **left rail** to move through the layers in order — it doubles as a progress guide, highlighting
the **recommended next step** with an arrow. Each layer opens with a short, dismissible note explaining
what to do there: **Generate with LLM** builds a fully worked-out version, **Enrich** adds building blocks
typical for your industry, and you can click any item to edit it. You can stop at any point — a half-built
model is still useful.

The **Home screen** (click the flame, top-left) is your project's **mission control** — an overview, not
a repeat of any single layer's screen. It shows, at a glance: the project and its stack; an overall
**state** (in progress · points to address · ready to export); a **status board** of every layer —
done ✓, needs attention (with its open-point count), or not yet built — where each item is clickable to
jump straight in; roll-up cards for **progress, open points, and this session's spend**; and a row of
actions (your recommended next step, view app, export model, projects, settings). A brand-new project
shows a short **welcome** instead, with a one-line explainer and buttons to start a description or load an
example.

## A note on cost

Each **Generate**, **Enrich**, or **AI Review** action asks an AI model to do the work, which costs a
small amount per click (shown as a spend estimate). The Business Narrative summary is one such small
call, made once per project and then cached. Browsing and editing are free. Running your own
instance requires an Anthropic API key; the public demo is keyless and pre-baked.

A running total of this session's **tokens and estimated cost** sits at the bottom of the sidebar (next
to the version); it resets when you reload the page.
