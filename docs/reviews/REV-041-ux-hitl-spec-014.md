---
id: REV-041
title: UX-HITL review of SPEC-014
type: review
status: In Review
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-18
updated: 2026-07-18
reviews: SPEC-014
lens: ux-hitl
verdict: Approve-with-changes
related: [SPEC-014]
---

# REV-041 — SPEC-014, ux-hitl lens

**VERDICT: Approve-with-changes.** The runtime architecture is sound and invariants #5/#6 are honored *in principle* — but the spec builds the machinery for agents to wake, wait, and act on their own while declaring "no new orchestration UI" (§2) and reducing the entire human surface to "read-only status," leaving a suspended agent as invisible work, an approval request no one can decide from, and no way to cancel or pause a run. The lifecycle is new; the legibility, consent, and control surfaces to match it must ship with it, not be foreclosed.

---

## Findings

### [UX1] Blocker — A suspended agent is invisible work with no surface that shows it
`agent_state` carries everything a human needs (`status`, `wake_at`, `wake_on_event`, `process_id`, `updated_at`), but the spec never says **where a human sees it**. §2 promises only "read-only status" and never names a screen; there is no answer to "which agents are waiting, on what, since when." A `waiting_event` run whose event never fires, or a `waiting_human` run no one noticed, sits forever with zero visibility — a silent stuck agent is the default outcome, not an edge case. This is the core failure for this lens: the spec creates durable invisible work and specifies no window into it.
FIX: Specify a per-project **"Agent runs / activity" view** that projects `agent_state` rows — agent, process, status (shape+text), what it is waiting on, waiting-since, next `wake_at` — with an **overdue/stuck indicator** (waiting longer than expected). Make this a Phase-A deliverable alongside the table, not deferred.

### [UX2] Blocker — `request_approval` notification has no defined content; the human can't decide
D7/§4.3 route the approval to a human over SPEC-013's `notify` channel but never specify the **message contract**. To decide, a human needs: which business, which agent, the exact question, the options, *why* it is being asked, and the **consequence** of each choice. None of that is specified, so the "pager" can page with a bare question and no context. The reply→resume loop is also left magic: how does the human *answer* over email/Slack — free text, a keyword, a link? — and how is that parsed back to `working_memory`? An unspecified answer format is a dead-end for async decision-making.
FIX: Define the approval-notification payload (business + agent + question + enumerated options + rationale + consequence + a link back to the run) and a concrete reply mechanism (e.g. distinct action links, or a fixed keyword set), EN+DE. State how a days-later reply maps to `resume_token` → resume.

### [UX3] Major — No timeout, reminder, or escalation for `waiting_human` (or stale `waiting_event`/`sleeping`) — zombie runs
The spec accepts suspension "across long time gaps" but never bounds it. If the human never answers `request_approval`, the run waits **forever**; if a `wait_for(event)` targets an event that will never come, likewise. There is no SLA, no re-page/reminder, no auto-expire, no escalation. The owner steer calls `notify` the agent's "pager," but a pager that pings once and never again is not one.
FIX: Add a max-wait / reminder policy for `waiting_human` (re-notify after N, then escalate or auto-fail with a recorded reason) and surface stale `waiting_event`/`sleeping` runs in the UX1 activity view as overdue. Make the wait bound visible on the run.

### [UX4] Major — The human has no control to cancel or pause a waiting/sleeping run or an unwanted timer
The task's control question — "can a human cancel a 'remind in 3 days' timer they no longer want?" — has no answer in the spec. §2's "read-only status" **explicitly forecloses** any lifecycle control: no cancel-run, no pause-agent, no revoke-autonomy affordance. A human who realizes a sleeping run is wrong (bad reasoning, changed circumstances, a timer set in error) can only wait it out or go edit Postgres by hand.
FIX: Add human write-actions on a run — **cancel** (a `sleeping`/`waiting_*` run → `cancelled`, with the timer/listener released) and **pause/disable the agent** — exposed on the UX1 view. Clarify that "read-only" refers to the *authoring* stages, not to lifecycle control, which must exist.

### [UX5] Major — Making an agent autonomous is not a deliberate, informed act of consent
Event-driven wake + `autonomous:true` means an agent acts unattended when event Z fires. SPEC-013 established that authority is granted through a **deliberate, informed two-step** (grant vs connect). Here, wiring a trigger→agent wake is treated as pure codegen (§4.1/§4.4) with no equivalent consent gate: nothing makes the human affirm "this agent will now issue commands on its own whenever this event fires." Invariant #6 (a human GRANTS authority) is satisfied for *tools* but not for the *autonomy* to fire them unsupervised.
FIX: Require a deliberate consent step when an agent is wired to an autonomous event/timer wake — naming the triggering event, the commands it may issue unattended, and providing an immediate pause/disable — mirroring SPEC-013's "Connect a live account" gate.

### [UX6] Major — An agent's branching decision is prose reasoning the human cannot audit
§4.5 makes conditional branching *reasoning in a prompt* ("if the lead qualifies, issue Offer; otherwise Nurture"). Unlike a workflow diagram, the only trace is `step_log` — but its shape is `{step, tool, input, outcome}`, i.e. **tool calls, not the reasoning that chose the branch**. A human auditing "why did it Nurture instead of Offer?" finds the *action* logged but never the *why*. And `step_log` has no defined human-readable projection — it is raw jsonb. Trust in an autonomous brancher requires a readable record of the decision, not just its effects.
FIX: Have `step_log` capture a decision/rationale entry (the branch taken + the model's stated reason), not only tool I/O, and project it as a human-readable run **timeline/trace** in the UX1 view.

### [UX7] Minor — Why a process is agent-mode vs workflow-mode is not legible where the human meets it
§4.6's determinism-boundary table lives in the spec; the human watching an agent wait in-app has no in-context explanation of *why* this process runs as a judgment agent (and thus can wait/branch/escalate) rather than a deterministic workflow. Without it, agent-mode's looser guarantees read as a defect rather than a deliberate route.
FIX: Surface the route rationale ("agent-mode: judgment / HITL / long-lived") on the agent-run and Workflows "Run as" views, tied to the SPEC-009 classification.

### [UX8] Minor — New statuses and notification text lack the i18n EN+DE and a11y that SPEC-013 §4.9 mandated
SPEC-014 introduces six new statuses (`running`/`sleeping`/`waiting_event`/`waiting_human`/`done`/`failed`) and human-facing approval text, but says nothing about localization or accessibility — while SPEC-013 §4.9 explicitly required shape+text (never color-only) status, aria, and EN+DE. The bilingual app cannot ship English-only status chips or an English-only approval email.
FIX: Require EN+DE labels for the six statuses and the approval notification, shape+text (not color-only) status rendering, and aria on the activity/run surfaces, per SPEC-013 §4.9.

---

## Summary
2 Blocker, 4 Major, 2 Minor. The build direction is right and the data model (`agent_state`, `_events`, `step_log`) already holds nearly everything the human needs — the gap is that SPEC-014 declares the human surfaces out of scope ("no new orchestration UI," "read-only status") at exactly the moment agents gain the power to wait and act unsupervised. The two Blockers (a visible waiting-agent view; a decidable approval contract) and the autonomy-consent + cancel/pause controls must be pulled into scope before Approved.
