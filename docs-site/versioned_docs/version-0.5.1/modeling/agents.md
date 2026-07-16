---
sidebar_position: 8
title: Agents
---

# Agents — autonomous helpers

**Why.** Agents describe where software or AI could take over parts of the business, each with a clear
goal. This is forward-looking: it maps the automation opportunities.

**How.** Click **Generate agents**. Each agent card shows its goal and is wired to the capabilities it
would run.

> **Example.** A "Sales Agent" whose goal is to convert incoming leads into scheduled installations.

## The agent contract (input · tools · output · context)

Beside the behaviour editor, each agent card shows a compact, **read-only** spec — the agent's **contract** —
in four quadrants:

- **Input** — the external signals routed to this agent (webhook / schedule / external triggers) plus the
  run task. This is what *wakes* the agent.
- **Tools** — the exact tools the agent can call: the commands on the entities its capabilities own, the
  `notify` human-in-the-loop router, and any comm actions or external services. These are the same tool
  schemas the run loop (and the exported runtime) send to the model.
- **Output** — the events the agent's commands emit and the records they change. This is what the agent
  *produces*.
- **Context** — the entities the agent operates and their typed fields, plus any processes it owns.

The contract is a **derived projection** — Kiln computes it from your capabilities, domain, and triggers.
It is **not** something you author or edit; it updates automatically as the model changes (it is marked
**Derived**). It makes explicit the four things every autonomous operator needs pinned down.

## Behaviour (the system prompt)

Each agent card has an editable **Behaviour (system prompt)** field — the agent's operating instructions:
its role, how it works its tools, when to escalate to a human, and its guardrails. This is what the agent
would actually be told to do. The system prompt is **grounded in the contract above** — the default
playbook cites the agent's real inputs, tools, outputs, and context, and when Kiln generates the
instructions with an LLM it is told to reference those real model facts (named entities, commands, and
events) rather than invent any.

- Leave it **empty** and Kiln uses a sensible **default playbook**, derived from the agent's goal and
  tools. The default is shown as the placeholder so you can see what it would say.
- **Type** to author your own — your text becomes the agent's system prompt. An edited behaviour is an
  authored part of the model: it saves with the project and round-trips through `model.json` and the
  code export (it becomes the agent's `behaviours/<id>.md` playbook in the generated runtime).

## Test this agent

Click **Test agent** on any agent card to open the run panel, enter a task (or leave it empty to use the
agent's goal), and click **Run test**. Kiln runs a short, bounded agent loop and shows you the **run
trace**:

- the **system prompt** it used (your authored behaviour, or the default playbook),
- each **step** — the agent's reasoning turns and the tool calls it makes, with the arguments and the
  result of each, and
- the **final output**, plus step / token / cost totals.

**This is a test/preview loop with mock tool dispatch.** Every tool call is **simulated** — each tool
result is a plausible stand-in, clearly badged **simulated** / **mock mode**, and **nothing hits a real
system**: no records are created, no emails or messages are sent, no external service is called. It's for
seeing how the agent reasons over its tools and for tuning its behaviour before you export and wire it to
real systems.

The last trace for each agent is kept with the project, so you can reopen the panel and see it again after
navigating away or reloading.

**Runs on the same engine as generation.** The test loop uses the **same AI engine you configured for the
rest of the model** — Anthropic, or an OpenAI-compatible gateway (OpenRouter / omniroute), using the keys
set on the server. It defaults to the engine for the **Agents** stage and is configurable in
**Settings → Engine** (globally, or per-stage for Agents). The panel shows which engine + model the run
will use. It always runs **server-side** — nothing runs in your browser and no key ever reaches it.

> **Needs an engine.** Any configured engine works. Tool dispatch stays mocked regardless of the engine —
> the test never touches a real system.
