---
id: SPEC-014
title: Agent Runtime Lifecycle — native wake, durable state & HITL (Postgres), n8n retained for workflows
type: spec
status: In Review
version: 0.2.0
author: Claude (Opus 4.8)
created: 2026-07-18
updated: 2026-07-18
supersedes: null
related: [SPEC-005, SPEC-007, SPEC-008, SPEC-010, SPEC-013, ADR-002]
reviewers: [technical-architecture, security-data, product-strategy, extensibility-dx, ux-hitl]
---

# SPEC-014 — Agent Runtime Lifecycle

> **Owner steer (framing).** This is **not** a move away from n8n. n8n stays the deterministic
> **workflow engine** — the muscle for processes that need exactly-once, ordered, replayable execution
> (invariant #8). What this spec removes is the use of n8n as **agent middleware**: the plumbing that
> merely makes agents *wake, remember, wait, and escalate*. That plumbing gets purpose-built homes —
> **Postgres** for state/scheduling/event-notification — exactly as **SPEC-013** already gave agent
> **auth** a purpose-built home (**Nango**) instead of n8n's credential store. n8n is the engine;
> it should not also be the agent's scheduler, memory, and pager.

## 0. Scope & demand-signal gate

Per the SPEC-005 shelving discipline, scope is tight and staged:
- **Phase A ships now:** the `_events` outbox (one-line spine change) + the `agent_state` table +
  suspend/resume tools — all pure/isomorphic where possible, byte-identical export when no agent or
  trigger is present.
- **Phase B ships on the first agent-mode demand signal:** the **Postgres wake source** wired
  end-to-end (pg_cron timers + `LISTEN`/`NOTIFY` event-wake) on the solar fixture's async agent.
- **Phase C HOLDS** until a partner needs it: native ingress + the `notify`/HITL move off n8n, plus the
  *optional* n8n wake-source adapter kept for owners who already run n8n.

## 1. Problem

After **SPEC-013**, an agent's **tool auth** is n8n-free (Nango-brokered). But an agent's **lifecycle**
is not. Three touchpoints still make the generated agent runtime depend on n8n as middleware:

1. **Agents are woken *by* n8n.** The only thing that calls `POST /run` is an n8n `trigger_*` /
   `reaction_*` workflow (an HTTP-Request node). Remove n8n and nothing wakes an agent
   (`agents.ts:633, 1183`; `triggers.ts` agent target; `targets.ts` reaction workflows).
2. **The `notify` tool routes *through* n8n.** The human-in-the-loop escalation tool is declared
   `via: "n8n"`, wired to n8n comm webhooks (`agents.ts:1087`, `:463` TODO).
3. **Async external-service callbacks return *via* n8n** callback workflows (`agents.ts:469–473`).

And a structural gap underneath all three: **the generated agent runtime is stateless.** `runAgent`
is a bounded, in-memory, 12-step tool-use loop (`agents.ts` `runAnthropic`); each `/run` is a fresh
invocation with no persisted working memory. So even once something *can* wake an agent natively, an
agent cannot **suspend and resume** — it cannot "wait 3 days, then continue," "wait until event Z,"
or "pause for a human decision and pick up where it left off." Those are precisely the stateful
behaviours one is otherwise tempted to borrow from a workflow engine.

Note the asymmetry this spec closes: the agent's **outbound reach** is already n8n-free — a granted
`external`/`connector` tool calls the vendor **directly** ("no n8n hop", `agents.ts:473`; SPEC-013).
It is the agent's **inbound lifecycle** (wake), its **memory** (state), and its **pager** (notify)
that still ride n8n. This spec makes those match.

## 2. Goals / Non-goals

**Goals**
- **Native wake**, three sources, one swappable axis (mirrors SPEC-013's `execution` axis):
  a **timer** (pg_cron), an **event** (`_events` outbox → `LISTEN`/`NOTIFY`), and an **external signal**
  (the runtime's own ingress) — each able to invoke `runAgent` with **no n8n**.
- **Durable agent state** — an `agent_state` row per run: working memory, a step/audit log, and a wake
  condition, so an agent can **suspend and resume** across invocations and across long time gaps.
- **Native `notify`/HITL** — escalate-to-human without n8n; the durable form of SPEC-013's §4.7 SEC4
  invocation gate (suspend on `request_approval`, resume on the human's answer).
- **One-line spine change** — `emit()` also writes the `_events` outbox (durable + an audit journal),
  while **still POSTing n8n unchanged** for workflow-mode reactions (§4.1).
- **Byte-identical export** when no agent and no trigger exist (the SPEC-010/013 regression guarantee).
- **A degraded fallback for SQLite** single-container exports, where pg_cron/`NOTIFY` do not exist
  (§4.4): the standalone app's existing in-process reaction loop.

**Non-goals**
- **Not** replacing or weakening n8n as the **workflow engine.** Workflow-mode processes (SPEC-007) and
  deterministic policy→command reactions (SPEC-005) keep running on n8n, **unchanged**. This spec adds a
  parallel *agent* lane; it does not touch the *workflow* lane.
- **Not** growing Kiln into a workflow engine (invariant #8). The agent runtime is already "the muscle";
  it gains *agent* concerns (memory, wake, escalation) — **not** exactly-once, deterministic replay,
  compensation, or a durable saga executor. Anything needing those is a workflow, by definition.
- **Not** routing deterministic or high-volume processes through agents. The **SPEC-009 workflow-vs-agent
  router remains the boundary** (§4.6); this spec makes the *agent* branch self-sufficient, it does not
  widen it.
- **Not** exactly-once execution for agents. Agents are non-deterministic by construction; "resume"
  re-invokes the model (§4.7). Determinism is the workflow lane's job.
- **Not** a new orchestration UI. Suspend/resume state surfaces as read-only status; authoring stays on
  the existing Agents / Workflows stages.

## 3. Current shape (reference)
- `agents.ts` — `runAgent(id, task)` → `runAnthropic` bounded `for (step < 12)` in-memory loop; `/run`
  Express server (`src/server.ts`); `notify` tool descriptor `via: "n8n"` (`:1087`); connector/external
  tools already call vendors directly (SPEC-013).
- `triggers.ts` — `webhook|schedule → command|workflow|agent|notify`; the `agent` target emits an n8n
  HTTP-Request node POSTing `${agentUrl}/run`.
- `targets.ts` — `n8nAdapter` emits `reaction_*` (policy `on/<event>` webhook → spine command) and
  `process_*` (workflow-mode pipelines). **These stay.**
- `spine.ts` — `src/events.ts` `emit(name,payload)` **logs + optionally POSTs `${N8N_BASE_URL}/on/<name>`**;
  the command route loops `for (const ev of r.emits) await emit(...)` — **no event persistence, no policy
  lookup** in the spine.
- `app.ts` (standalone `generateApp`) — the **only** native reaction executor today: `runCommand` fires
  policies via an **in-process recursive call, depth-guarded at `depth < 5`**. No timers, no ingress, no
  agents in that export.

## 4. Design

### 4.1 The `_events` outbox — one line, non-breaking to n8n
The spine's `emit()` gains a single durable write: **insert every emitted event into an `_events`
table**, then proceed exactly as today (log + POST n8n).

```
_events:  seq bigserial pk, name text, payload jsonb, entity_id text,
          emitted_at timestamptz default now(), consumed_at timestamptz null
```

- **n8n's role is unchanged.** `emit()` still POSTs `on/<event>`; the `reaction_*`/`process_*` workflows
  fire as before. Workflow-mode determinism is untouched.
- **Agents get a native lane.** An `AFTER INSERT` trigger on `_events` issues `pg_notify('kiln_events',
  <name>)`; the agent runtime's `LISTEN` loop (§4.4) resumes the matching suspended agents.
- **Free audit journal.** The outbox is the append-only event history the agent lane otherwise lacked
  (closes the observability gap n8n's visual log used to cover).
- **No double-fire.** Routing is by **target kind at codegen time**: a policy/trigger whose target is a
  *workflow/command* is emitted as an n8n workflow (as today); one whose target is an *agent* is served
  by the native lane. The exporter emits each reaction to exactly one engine, so an event is never
  handled twice.

### 4.2 `agent_state` — durable memory + suspend/resume
Every `runAgent` invocation loads-or-creates a row; every step persists to it. Suspension is a row in a
non-`running` status carrying a wake condition.

```
agent_state:  run_id uuid pk, agent_id text, process_id text null,
              status text,                 -- running | sleeping | waiting_event | waiting_human | done | failed
              working_memory jsonb,        -- variables + a rolling conversation/context summary
              step_log jsonb,              -- ordered {step, tool, input, outcome} — the run's audit trail
              wake_at timestamptz null,    -- timer wake target
              wake_on_event text null,     -- event-name wake target
              resume_token text null,      -- what a human-approval callback presents to resume
              created_at, updated_at timestamptz
```

`runAgent` becomes: **load-or-create → run the bounded loop → persist**. "Always persist a run row"
(even for one-shot invocations) is deliberate — it is the audit journal, cheap, and it is what makes
resume possible. The suspend/resume machinery only *engages* when the agent calls a wait tool (§4.3).

### 4.3 Suspend / resume tools
Three tools, each of which **persists a wake condition and returns** (the agent sleeps; the process
does not block a thread):

- `wait_until(timestamp)` → `status = sleeping`, `wake_at = t`. Resumed by the timer source (§4.4).
- `wait_for(event)` → `status = waiting_event`, `wake_on_event = e`. Resumed by the event source (§4.4).
- `request_approval(question, options)` → `status = waiting_human`, mints a `resume_token`; the human is
  reached over **SPEC-013's existing `notify` channel** (email/Slack — no new HITL surface, D7), and
  their reply resumes the run with the decision in `working_memory`.

`request_approval` is the **durable form of SPEC-013 §4.7 SEC4**: instead of blocking one live run for a
confirmation, the agent *suspends*, freeing the runtime, and resumes when the human answers — the same
consent semantics, now survivable across restarts and long waits. The write/send/delete invocation gate
from SPEC-013 is unchanged and composes with this.

### 4.4 Wake sources — auto-picked, not a user knob (D6)
Three wake sources exist, but Kiln **chooses one on the owner's behalf** from the deployment shape —
it is **not** a binding dimension the user configures. **Default = `postgres` (full-stack) /
`in-process` (SQLite); `n8n` only if the owner deliberately opts in. No n8n on the default path.**

- **`postgres` (default, full-stack).** Timers = **pg_cron** scanning `agent_state.wake_at`
  (or a `wake_jobs` table) and re-invoking due runs. Event-wake = the `_events` `NOTIFY` → a `LISTEN`
  loop in the agent runtime resuming `waiting_event` runs. External signals arrive at a **spine route**
  (`POST /webhook/<path>`, D5 — the spine is already the app's front door and carries the bearer-auth
  gate) mapping a `TriggersDoc` webhook straight to `runAgent` — replacing the n8n
  webhook→HTTP-node→`/run` hop.
- **`in-process` (SQLite single-container, degraded).** pg_cron/`NOTIFY` do not exist on SQLite. Fall
  back to the **existing** `app.ts` depth-guarded recursive reaction loop for event-wake; timers become a
  best-effort in-memory `setInterval` scan of `agent_state` (does **not** survive a restart — documented
  limitation; a durable timer needs Postgres). This keeps the zero-dependency single-container export
  honest about what it can and cannot promise.
- **`n8n` (optional, additive).** For owners who already run n8n: keep today's `trigger_*` → `/run`
  wiring as an opt-in wake source. Never on the default path, never required for OAuth or wake.

Delivery durability: **`NOTIFY` is a wake hint, not the source of truth.** The `_events` /
`agent_state` rows are durable; a resumer claims work with `SELECT … FOR UPDATE SKIP LOCKED` and can
recover missed notifications by scanning `consumed_at IS NULL` / due `wake_at` on boot. So a
disconnected listener loses no events — it catches up from the table.

### 4.5 Conditional branching lives in the generated behaviour prompt
Agent-mode processes (SPEC-009) already fold into `behaviours/<id>.md` as "## Processes you own."
Branching is expressed there as **reasoning** — "if the lead qualifies, issue *Offer*; otherwise issue
*Nurture*" — grounded in the process's authored step/command set. This honours invariant #5 (the model
reasons; the branch commands are the agent's *granted/owned* tools, human-authorized per invariant #6)
and needs **no new machinery** — it is richer generation of text the runtime already consumes.

### 4.6 The determinism boundary (SPEC-009 is the law)
This spec's whole safety rests on **not** using the agent lane where determinism matters. The
workflow-vs-agent router stays the dividing line, stated explicitly:

| Route to… | When | Runs on |
|---|---|---|
| **workflow-mode** | deterministic, high-volume, ordered, exactly-once, money/compliance-critical | **n8n** (unchanged) |
| **agent-mode** | judgment, conditional branching, human-in-the-loop, long-lived/waiting, low-volume | **native agent runtime** (this spec) |

A validator (§4.8) discourages routing a process marked determinism-critical to agent-mode. The default
for anything mechanical remains workflow-mode.

### 4.7 Idempotency & the accepted non-determinism cost
Agents are non-deterministic: a re-woken run may reason differently than the first. Mitigations, not
guarantees:
- **Idempotent commands** — the spine already upserts by stable id (`ON CONFLICT … DO UPDATE`), so a
  re-issued create is not a duplicate row.
- **Side-effect recording** — `step_log` records what was already done; the behaviour prompt instructs
  "check `step_log` before repeating an irreversible action."
- **The SPEC-013 write/send/delete gate** bounds the blast radius of a mis-reasoned repeat.

This is **weaker than a workflow engine's deterministic replay, and deliberately so** — which is exactly
why determinism-critical flows are routed to n8n (§4.6). The residual risk is stated plainly rather than
engineered away, because engineering it away *is* rebuilding n8n (invariant #8).

### 4.8 Validators (additive, pure — AL-series)
**AL1** a `wait_for(event)`/wake-on-event target resolves to a real model event. **AL2** a timer wake on
an `in-process`/SQLite deployment is flagged (won't survive restart). **AL3** an agent-mode process whose
branches issue a command the agent does not own/was not granted → *fabrication* finding (mirrors
SPEC-013 TC4). **AL4** a process marked determinism-critical routed to agent-mode → finding (§4.6).
**AL5** no `_events`/`agent_state` write path carries a secret literal.

## 5. Rollout
- **Phase A — outbox + state + suspend/resume (mostly pure; one spine line).** `_events` table +
  `emit()` write; `agent_state` + load-or-create in `runAgent`; the three wait tools; AL1–AL5. n8n POST
  path untouched. **Byte-identical when no agent/trigger exists.**
- **Phase B — the Postgres wake source, end-to-end on solar.** pg_cron timer + `_events` `LISTEN` loop +
  native ingress; prove it on the fixture's **async Offer Reviewer** agent (woken by an event) and a
  "remind in N days" timer. **No n8n in this path.**
- **Phase C — move `notify`/HITL off n8n + keep the optional n8n wake adapter. HELD** until a partner
  signal. Native `notify` sender (email/Slack, Nango-brokered per SPEC-013 where OAuth is needed);
  `request_approval` resume via a `notify` reply; the `n8n` wake source kept as an opt-in adapter.

## 6. Testing (to commit)
- `agent_state` round-trips through Postgres; `runAgent` resumes a `sleeping`/`waiting_*` row into the
  right step with working memory intact.
- `emit()` writes `_events` **and** the n8n POST is **byte-identical** to the pre-change baseline
  (proves the workflow lane is untouched); byte-identical full export at zero agents/triggers.
- Wake-source dispatch: `postgres` vs `in-process` vs `n8n` selected by binding; **no double-fire**
  (target-kind routing — an agent-targeted policy emits no n8n `reaction_*`, and vice-versa).
- The `in-process`/SQLite degraded path falls back to the existing depth-guarded recursive loop; AL2
  flags the non-durable timer.
- `LISTEN` recovery: an event emitted while the listener is down is caught up from `consumed_at IS NULL`
  on reconnect (durability-via-table, not via NOTIFY).
- AL1–AL5 seeded-defect recall; the SPEC-013 write-gate still fires through a suspended/resumed run.

## 7. Risks & mitigations
- **Muscle drift into a workflow engine (invariant #8).** Bounded: agent concerns only (memory, wake,
  escalation), never exactly-once/replay/sagas; the SPEC-009 boundary (§4.6) + AL4 keep deterministic
  work on n8n.
- **Non-determinism / double-execution.** §4.7 — idempotent commands, `step_log`, the write-gate;
  residual risk accepted and routed around, not hidden.
- **`NOTIFY` is not durable.** §4.4 — the table is the source of truth; NOTIFY only wakes; SKIP-LOCKED
  claim + boot catch-up.
- **pg_cron / extension availability.** Not on every managed Postgres, and absent on SQLite → the
  `in-process` degraded source (§4.4) with documented limits; the `postgres` source documents its
  extension requirements.
- **Cost/latency per wake.** Every resume is an LLM call → agent-mode is for low-volume judgment work
  (§4.6); high-volume stays workflow-mode.
- **Observability.** The `_events` outbox + `agent_state.step_log` are the audit trail replacing n8n's
  visual run log for the agent lane.

## 8. Decisions
- **D1 — default wake source `postgres` (full-stack), `in-process` (SQLite), `n8n` optional.** Mirrors
  SPEC-013's zero-n8n default with an opt-in n8n path for those who have it.
- **D2 — n8n is retained, unchanged, as the workflow engine.** This spec adds an agent lane; it does not
  touch the workflow lane (owner steer; invariant #8).
- **D3 — no exactly-once for agents; determinism-critical work is routed to workflow-mode.** The
  SPEC-009 router is the boundary (§4.6); accepted trade, not a gap to close.
- **D4 — durability lives in the table, not in NOTIFY** (§4.4).
- **D5 — the native external-signal ingress lives in the spine** (owner decision), reusing its existing
  bearer-auth gate rather than opening a second public surface on the agents runtime (§4.4).
- **D6 — the wake source is auto-picked by Kiln, not a user-facing binding dimension** (owner decision).
  The deployment shape selects it (`postgres`/`in-process`); `n8n` is a deliberate opt-in only (§4.4).
- **D7 — `request_approval` reuses SPEC-013's `notify` channel for the human round-trip** (owner
  decision) — one HITL path, no dedicated approval endpoint/token surface to secure (§4.3).

## 9. Review & closure

Draft. Multi-lens review (technical-architecture, security-data, product-strategy, extensibility-dx,
ux-hitl — the SPEC-013 panel) not yet run; status stays `Draft` pending it.

**Owner decisions resolving the initial open questions (2026-07-18):**
- **D6** — the wake source is a Kiln-chosen default, **not** a user-facing binding dimension. Auto-pick
  by deployment shape; n8n is opt-in only.
- **D5** — the native external-signal ingress lives in the **spine**, reusing its bearer-auth gate.
- **D7** — `request_approval` **reuses SPEC-013's `notify` channel** for the human round-trip; no new
  approval surface.

No open questions remain for the author; the doc is ready for the review panel.
