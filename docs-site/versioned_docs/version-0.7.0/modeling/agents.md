---
sidebar_position: 8
title: Agents
---

# Agents — autonomous helpers

**Why.** Agents describe where software or AI could take over parts of the business, each with a clear
goal. This is forward-looking: it maps the automation opportunities.

**How.** Click **Generate agents**. The stage shows a diagram wiring each agent to the capabilities it
would run, and below it a list of your agents — name, goal, and whether it's designed yet.

**Select an agent** — click it in the diagram or in the list — and its detail opens on the right, with
three tabs:

- **Contract** — what the agent *may* do: the read-only, derived four-quadrant spec (input · tools ·
  output · context).
- **Behaviour** — *how* it decides: the system prompt you author, plus **Review prompt**.
- **Runs** — what it *did*: run it against a task and read the trace, with the run history and compare.

Close the panel with **×** to get the full canvas back.

> **Example.** A "Sales Agent" whose goal is to convert incoming leads into scheduled installations.

## The agent contract (input · tools · output · context)

The **Contract** tab of a selected agent shows a compact, **read-only** spec — the agent's **contract** —
in four quadrants:

- **Input** — the external signals routed to this agent (webhook / schedule / external triggers) plus the
  run task. This is what *wakes* the agent.
- **Tools** — the exact tools the agent can call: the **read** tools that look data up (`list_<entity>` /
  `get_<entity>` / `find_<entity>`), the commands on the entities its capabilities own, the `notify`
  human-in-the-loop router, and any comm actions or external services. A `find_<entity>` tool is listed
  with the fields it can filter on (`find_lead · email, status`). These are the same tool schemas the run
  loop (and the exported runtime) send to the model.
- **Output** — the events the agent's commands emit and the records they change. This is what the agent
  *produces*.
- **Context** — the entities the agent operates and their typed fields, plus any processes it owns.

The contract is a **derived projection** — Kiln computes it from your capabilities, domain, and triggers.
It is **not** something you author or edit; it updates automatically as the model changes (it is marked
**Derived**). It makes explicit the four things every autonomous operator needs pinned down.

### Looking data up

An agent can **read the records it works on**, not just act on them. For every entity its capabilities
own it gets read-only tools:

- `list_<entity>` — list the records (no arguments), to find the one it needs.
- `get_<entity>` — fetch one record by `id`, to check its current state.
- `find_<entity>` — **look records up by field value**, when the agent knows what it's looking for.

**Read access is capability-scoped, exactly like commands.** An agent can only look up the entities its
capabilities own — a Sales Agent that owns Lead and Offer cannot read Invoice. Change an agent's
capabilities and its read tools change with them. Querying is no way around this: `find_<entity>` exists
only for the entities the agent already owns.

**The spine is the single data path.** Reads go to the generated spine's own read endpoints (the same API
the UI and workflows use, behind the same optional `API_TOKEN` bearer as the writes). An agent has **no**
direct access to the database, Odoo, Excel, or any other store — if it isn't exposed by the spine, the
agent cannot see it.

#### Querying by field

"Is this email already a lead?" should be one lookup, not a full table read. `find_<entity>` answers it:

```
find_lead(email: "ada@example.com")   →  GET /leads?email=ada%40example.com
```

**Which fields are filterable?** The entity's own typed attributes — the ones you defined on the
[Entities](./entities.md) stage. A Lead with `email`, `status`, and `source` gets a `find_lead` that
filters on exactly those three, and the model sees them by name, so it knows what it can ask for rather
than guessing. (Fetching by `id` is `get_<entity>`'s job, so `id` isn't repeated here.) An entity with no
attributes gets no `find` tool — there would be nothing to filter by.

Matching is deliberately boring: **exact match only**, and several fields narrow the result (they AND
together). There are no operators, no wildcards, and no sorting — if you need those, model the question
as a command. A field the entity doesn't have is rejected outright rather than silently ignored, so a
typo can never come back as a misleading "no matches".

:::note Large tables are capped
Reads are bounded at **50 records**, whichever tool asks:

- A `list_<entity>` read pulls every row the spine has (there is no pagination), so the runtime hands the
  model at most 50 and *tells* it: the result carries the true `total` and a `truncated` flag, so the
  agent knows there is more rather than assuming it saw everything.
- A `find_<entity>` query is capped by the spine itself, so a filter that happens to match the whole table
  still can't dump it.

This cap is also why querying matters: scanning a `list_` result works at 200 rows and quietly breaks at
200,000 — the record you wanted may simply not be in the first 50. A field lookup asks the store the
question directly, so it stays correct at any size.
:::

## Calling a real vendor — external service credentials

An agent's **external service** tools delegate to a vendor you already pay for (a lead qualifier, a
contract reviewer). Most real vendors need a credential, so a service can declare one:

| Field | What it is |
| --- | --- |
| `credentialEnv` | The **name** of the environment variable holding the credential — e.g. `CRM_API_TOKEN`. |
| `auth` | How to present it: `bearer`, `header`, `basic`, or `none` (the default). |
| `headerName` | For `auth: "header"` — the header the vendor expects, e.g. `X-API-Key`. |

The exported agent calls the vendor **directly** — there is no n8n hop. n8n stays the default orchestrator
for workflows, but it never becomes a hard dependency of an agent's tool call.

:::caution The model carries the NAME; .env carries the value
**Never put a credential value in the model.** `model.json` is meant to be committed to git — it holds the
env var's *name*, and the value goes in the deployed app's `.env` at deploy time. The Studio shows the
declared credential read-only (with the variable name), and the generated `agents/.env.example` lists each
name with the service that needs it, ready for you to fill in.

Kiln rejects a model that would leak a secret:

- a credential embedded in the endpoint (`https://user:pass@…`),
- a token pasted into `credentialEnv` where a variable *name* belongs,
- a credential attached to a plain `http://` endpoint — **a credential always requires TLS** (`localhost`
  is exempt so you can develop against a stub),
- `auth: "header"` with no `headerName`, or an auth scheme with no `credentialEnv` to send.

A declared `credentialEnv` with `auth: "none"` is a warning — the credential would never be sent.
:::

At run time the agent reads the variable from its own environment. **If the variable is missing, the call
fails immediately** and names the variable — it is never sent unauthenticated, because a silent 401 loop
looks like a vendor outage instead of a setup mistake. Credential values are never logged.

The LLM may **suggest** an external service, but attaching a credential to one is always a human decision —
generation never invents a credential.

## Behaviour (the system prompt)

The **Behaviour** tab has an editable **Behaviour (system prompt)** field — the agent's operating instructions:
its role, how it works its tools, when to escalate to a human, and its guardrails. This is what the agent
would actually be told to do.

**An agent must be designed — Kiln will not invent a behaviour for you.** The contract above says *what*
an agent may do; the behaviour says **how it decides**, and only you or a generation grounded in your
narrative knows that: what your terms mean here, when to hand off to a person, what to check first, what
it must never do. Anything Kiln could produce deterministically would only restate the contract — adding
nothing while making an agent nobody designed look designed. So an empty behaviour stays visibly empty:

- **Generate** the agents stage and Kiln writes each agent's behaviour with an LLM, told to reference the
  real model facts (named entities, commands, events) rather than invent any — then review and edit it.
- **Type** to author your own — your text becomes the agent's system prompt. An authored behaviour is an
  authored part of the model: it saves with the project and round-trips through `model.json` and the
  code export (it becomes the agent's `behaviours/<id>.md` in the generated runtime).
- **Leave it empty** and the tab says *not designed yet* (and the agent reads **Not designed** in the list
  and its detail head). Nothing fills the gap for you. On export the
  agent ships a **TBD** `behaviours/<id>.md` that names what to write and points at its
  `definitions/<id>.json` contract, and **the generated runtime refuses to run that agent** — it throws,
  naming the file, rather than starting on a placeholder. An agent holds command authority over your
  records; one that looks designed but isn't is worse than an obvious gap. The Agents stage flags an
  agent with no behaviour in its health findings, so you see it without running a review.

## Review prompt — critique the prompt against its contract

Writing an agent's prompt is easy to get subtly wrong: it's simple to tell an agent to "email the client"
when it has no email tool, or to leave out the escalation path entirely. Click **Review prompt** on an
agent's **Behaviour** tab and Kiln asks the AI to review **that one agent's behaviour prompt against its
derived contract** — the real tools, inputs, outputs and context shown in its **Contract** tab.

It checks five things:

- **Real tools only** — does the prompt tell the agent to use a tool it doesn't actually have? A step that
  names a **fabricated** tool can never run. This is the most common flaw.
- **Inputs honoured** — does the prompt account for the triggers routed to it (what wakes it)?
- **Outputs produced** — does it actually lead to the events it should emit and the records it should
  change?
- **Complete** — does it cover the capabilities the agent owns, or is a job it's responsible for missing?
- **Safe** — are there guardrails and a human **escalation** path for ambiguous, high-stakes or
  irreversible decisions?

Because the critique is grounded in the contract rather than in the prompt alone, its findings name your
real entities, commands, and events — not invented ones.

**You decide what happens to each finding.** They appear in the agent's **Behaviour** tab as **concerns**
(likely wrong) and **suggestions** (could be better), in the same review surface the rest of the model
uses. For each one you can **Apply** it (see below), edit the behaviour text yourself, or **dismiss** (×)
the ones you've considered and accepted. A dismissed finding stays dismissed per agent (dismissing one on
one agent never silences another's), and a re-review is told not to raise it again. An empty list means
the review found nothing — the prompt matches its contract.

### Applying a finding

**Apply** on a finding asks AI for the **smallest edit** to your behaviour that addresses it, and shows
you the result as a **diff** — struck-through text is what it removed, highlighted text is what it added,
and everything unmarked is your own text, untouched. **Accept** writes it; **Reject** discards it and
leaves your behaviour byte-identical. **Apply all** does the whole finding set in one edit — still one
diff, still one decision.

Kiln **never rewrites your prompt behind your back**: it proposes a revision and nothing lands without
your explicit **Accept**. Apply removes the *typing*, not the *deciding* — the behaviour is yours, and an
accepted edit is your text from that moment on, free to edit further. That's also why the edit is
deliberately **minimal** rather than a regeneration: your voice, wording and structure survive, and the
diff stays small enough to actually read.

The revision is held to the agent's **contract**: it can never introduce a tool the agent doesn't have.
If a draft names one, Kiln rejects it and asks again, naming the offender; if it happens twice, you get
no proposal and an explanation instead of a prompt that tells your agent to call something that doesn't
exist.

An applied finding stops being listed once you accept — it's addressed. It is *not* silenced permanently:
whether the edit truly resolved the concern is a judgment only a **re-review** can make, so run **Review
prompt** again when you want that confirmed.

**An agent with no behaviour is refused, not reviewed.** There is nothing to review yet: the only prompt
available would be one derived from the contract, and checking that against the contract is circular — it
passes by construction, rubber-stamping the case that most needs scrutiny. So the review returns a single
honest finding (*no authored behaviour — generate or write it first*) and **costs nothing**: it never
calls the model to tell you a field is empty. That finding has **no Apply** either — there is no prompt
to revise, and Apply is not a back door for designing an agent nobody has designed. Write the behaviour
(or **Generate agents**) first.

This is a **per-agent** review, and it's distinct from the whole-layer **Second opinion** on the Agents
stage: that one reviews the *roster* (are agents missing, too broad, or overlapping?), while this one
reviews *one agent's prompt*. Both can be used. Like every AI call in Kiln, the exact review prompt is
visible — and tunable for the session — under **Prompt & output → Prompt review**.

> **Costs a call.** Each **Review prompt** click is one LLM call on your configured engine, so review the
> agents you care about rather than all of them by reflex. **Apply** (and **Apply all**) is one more call
> each — **Apply all** is one call for the whole set, where applying findings one at a time is one call
> apiece. Both the review and the revision deliberately run on a **stronger model than the Agents stage
> generates with** (a standard-tier model at high effort — a reviewer should not be weaker than what it
> reviews), so they cost more per call than a generation on that stage. Point them somewhere else with the
> **Reviewer** override in **Settings → Engine**.

## Test this agent

Open a selected agent's **Runs** tab, enter a task (or leave it empty to use the
agent's goal), and click **Run test**. Kiln runs a short, bounded agent loop and shows you the **run
trace**:

- the **system prompt** it used (your authored behaviour — an agent with none can't be tested; design it first),
- each **step** — the agent's reasoning turns and the tool calls it makes, with the arguments and the
  result of each, and
- the **final output**, plus step / token / cost totals.

**This is a test/preview loop with mock tool dispatch.** Every tool call is **simulated** — each tool
result is a plausible stand-in, clearly badged **simulated** / **mock mode**, and **nothing hits a real
system**: no records are created, no emails or messages are sent, no external service is called. It's for
seeing how the agent reasons over its tools and for tuning its behaviour before you export and wire it to
real systems. A simulated external call reports whether a real run *would* have authenticated (and with
which variable), so a green test run never implies a real, authenticated vendor call happened.

### Run history

Kiln keeps the **last 5 runs per agent** with the project, so a trace survives navigating away or reloading.
Open **History** in the run panel to list them — newest first, each with its timestamp, model and cost — and
click any one to view its full trace. Older runs drop off once the cap is reached; the cap is deliberate,
because traces are large (every step carries its tool arguments *and* the tool result) and they live in your
browser's storage and ride along in an exported `model.json`.

### Compare two runs — "did my prompt edit help?"

A single trace tells you what the agent did once. **Compare** tells you what *changed*, which is the question
you actually have after editing an agent's behaviour prompt. Click **Compare** to diff two runs — by default
the latest against the one before it, or pick any two from the history. It shows:

- **Deltas** — steps, tokens, cost, and how far apart the two runs were.
- **Tools called** — a set diff: which tools the newer run *added*, which it *dropped*, which both used.
- **Final output** — a word-level diff of what the agent actually concluded.

Crucially, it tells you **what the comparison can and cannot attribute**, before showing you any number:

- **Same model, changed prompt** — your edit is the candidate cause of the differences. This is the clean case.
- **Identical prompt, same model** — whatever differs is the model being nondeterministic, *not* your edit.
  Kiln says so plainly rather than letting you read meaning into noise.
- **Different models** — this is **not a clean prompt A/B**. If the two runs used different models, the
  differences may come from the model swap, so Kiln flags it and does not claim your prompt caused anything.

A run that used **simulated** tools is marked as such, so a mock diff is never mistaken for a real one. The
run history is an inspection record only — it is never part of your model and it is ignored by the code
export.

**Runs on the same engine as generation.** The test loop uses the **same AI engine you configured for the
rest of the model** — Anthropic, or an OpenAI-compatible gateway (OpenRouter / omniroute), using the keys
set on the server. It defaults to the engine for the **Agents** stage and is configurable in
**Settings → Engine** (globally, or per-stage for Agents). The panel shows which engine + model the run
will use. It always runs **server-side** — nothing runs in your browser and no key ever reaches it.

> **Needs an engine.** Any configured engine works. Tool dispatch stays mocked regardless of the engine —
> the test never touches a real system.
