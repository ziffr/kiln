---
id: SPEC-014
title: Agent Runtime Lifecycle — durable long-lived & HITL agents (Postgres), n8n retained for workflows
type: spec
status: Approved
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-18
updated: 2026-07-18
supersedes: null
related: [SPEC-005, SPEC-007, SPEC-008, SPEC-009, SPEC-010, SPEC-012, SPEC-013, ADR-002]
reviewers: [technical-architecture, security-data, product-strategy, extensibility-dx, ux-hitl]
---

# SPEC-014 — Agent Runtime Lifecycle

> **What this delivers (user-facing):** agents that can **wait and then continue** ("remind the customer in
> 3 days," "wait until the offer is signed") and **pause for a human decision** ("approve this before I send
> it") — durable, long-lived, human-in-the-loop agents. Today an agent runs once, in memory, and forgets.
> **How (architecture):** the agent runtime gains its own memory (state), its own way to be woken (a wake
> seam), and its own way to reach a human (reusing SPEC-013's notify) — on **Postgres**, not n8n. n8n stays
> the deterministic **workflow engine** (invariant #8); this spec does not touch that lane. The "no n8n for
> the agent lane" property is an *implementation consequence* of #8, **not** the selling point (REV-039/PS3).

## 0. Scope, demand-signal gate & sequencing

Per the SPEC-005 shelving discipline — held honestly this time (REV-039/PS1):

- **This spec is `Revised`, build-ready-on-the-shelf — it does NOT "ship now."** The whole lane (state +
  wake + HITL) is gated behind **one concrete demand signal** and builds only then. There is no
  "infrastructure Phase A ships ahead of demand"; the earlier v0.2.0 Phase-A/B split is retired (PS1, PS2).
- **The demand signal (defined, PS7):** *a design partner runs the solar **async Offer Reviewer** agent and
  asks for a wait/escalate/approve behaviour that n8n cannot cleanly give them* — e.g. "hold this agent until
  the customer replies, then continue," or "let it pause for my sign-off." Any equivalent partner utterance
  for a real agent-mode process counts. **Kill criterion:** if no partner asks within the next two partner
  cycles, the shelf stays closed and this spec is not built.
- **Sequenced behind SPEC-013 Phase C (PS4).** Durability multiplies the value of *capable* agents; today an
  agent has **one** connector (Spreadsheet) and SPEC-013 Phase C (catalog + grant UI) is itself HELD. This
  spec **must not** build before SPEC-013 Phase C has its own signal and a small connector catalog exists —
  a lifecycle for an agent with a near-empty toolbox is out of order. This ordering is a gate, not an
  assumption.
- **Owner decision — CONFIRMED (2026-07-18, §9/D10):** the owner accepted the reviewers' timing call — fold
  the whole lane behind the demand gate above and sequence it behind SPEC-013 Phase C. SPEC-014 is a
  build-ready shelf design; *when* it is built is now settled (on the signal, after Phase C), not open.

## 0.5 What this is NOT (positioning — REV-039/PS5)

The parts list here (event outbox, per-run state, suspend/resume, timer/event wake, a claim query) is
individually defensible but *in aggregate* resembles a durable-execution engine — the exact thing invariant
#8 forbids Kiln from becoming. The line, stated plainly and to be mirrored in a public docs-site note:

- **This is agent *memory + a pager + an alarm clock*, not a workflow/saga engine.** It gives one agent the
  ability to remember, wait, and escalate. It has **no** exactly-once guarantee, **no** deterministic replay,
  **no** compensation/rollback, **no** multi-actor orchestration. Those are the workflow lane's job (n8n).
- **The SPEC-009 router is the hard boundary (§4.8).** Deterministic / high-volume / exactly-once /
  money-or-compliance-critical work is workflow-mode on n8n. This lane is *only* for judgment /
  branching / HITL / long-lived / low-volume agent work.
- **If the aggregate ever starts to feel like a saga executor, that is the signal to stop, not to add one
  more "bounded" piece.** Reviewers should hold the most conservative reading.

## 1. Problem

An agent can be **modelled** and can now **operate** (SPEC-013 gave it n8n-free tool auth via Nango) — but it
cannot **persist, wait, or escalate**. Concretely, the user-observable gaps:

- **No "wait then continue."** `runAgent` is a bounded, in-memory, 12-step tool loop (`agents.ts`
  `runAnthropic`); each `/run` is a fresh invocation with no memory. An agent cannot "remind in 3 days" or
  "wait until event Z," because it has nowhere to hold its place and nothing to wake it.
- **No durable human-in-the-loop.** It cannot pause for a human decision and resume when the answer arrives.
- **It can only be woken by n8n.** The sole caller of `/run` is an n8n `trigger_*`/`reaction_*` workflow;
  `notify` routes `via: "n8n"` (`agents.ts:1087`); async callbacks return via n8n (`:469–473`). So the agent
  *lifecycle* still depends on n8n as middleware — even though the agent's outbound *reach* is already
  n8n-free (`external`/`connector` tools call vendors directly, `agents.ts:473`; SPEC-013). This spec closes
  that asymmetry, but note (PS3) the asymmetry is the *reason*, not the *value* — the value is the durable/HITL
  behaviour above.

## 2. Goals / Non-goals

**Goals**
- **Durable agent state + suspend/resume** — an agent can `wait_until` / `wait_for(event)` /
  `request_approval` and resume **losslessly** (the full model transcript is the resume unit, §4.2/§4.3).
- **A registered wake seam** — `WakeSourceAdapter` + registry + acceptance probe, mirroring SPEC-010/013, so
  a contributor adds a wake backend (Temporal/Redis/SQS/cloud-scheduler) in **one file, no core edits** (§4.4).
- **Native, safely-authenticated ingress** — external signals wake an agent through a spine route with
  **per-trigger, closed-by-default** authentication (§4.5), never the internal command bearer.
- **Autonomy that is gated and consented** — a state-changing action by an event/ingress-woken ("tainted")
  run passes a human gate unless deliberately and informedly made autonomous (§4.6).
- **The human surfaces to match the new power** — an Agent-runs activity view, a decidable approval contract,
  timeout/escalation, cancel/pause, and a readable decision trace (§4.9). These are **in scope**, not deferred.
- **n8n retained, unchanged, as the workflow engine** (invariant #8).
- **Precise byte-identity** — export is byte-identical when the model has **no agent-mode reaction and no
  native wake target** (the outbox/state/trigger DDL is emitted only when the lane is actually used, §4.1).

**Non-goals**
- **Not** replacing/weakening n8n as the workflow engine; the workflow lane is untouched.
- **Not** exactly-once, deterministic replay, compensation, or a saga executor for agents (§0.5, invariant #8).
- **Not** routing deterministic/high-volume work through agents — the SPEC-009 router is the boundary (§4.8).
- **Not** a visual orchestration/diagram builder. The human surfaces (§4.9) are **status, consent, and
  control** views over `agent_state` — read-and-act on runs, not a flow designer.

## 3. Current shape (reference — verified against code)
- `agents.ts` — `runAgent`→`runAnthropic` bounded in-memory `Anthropic.MessageParam[]` loop (`:492–518`);
  `/run` server (`src/server.ts`); `notify` `via:"n8n"` (`:1087`); the connector write-gate
  `requiresConfirmation` fires **only** for `GATED_KINDS={write,send,delete}` (`:696–699`) — **not** for
  `kind:"command"`. The agents runtime is **HTTP-only to the spine** (`tools.ts` `fetch(SPINE_URL)`+bearer);
  its `package.json` has **no `pg`, no `DATABASE_URL`** (`:663`).
- `spine.ts` — `emit(name,payload)` **logs + optionally POSTs `${N8N_BASE_URL}/on/<name>` unconditionally**
  (`:392–398`); the command route loops `for (const ev of r.emits) await emit(...)` — **no event
  persistence, no policy lookup**. Auth = a **single shared `API_TOKEN`**, **open when unset** (`bearerOk`
  `:421–447`). The pg driver is a checked-in/out `pg.Pool` (`:364`). `postgresAdapter` emits per-aggregate
  DDL; `migratePostgres` diffs domain aggregates only — **no owner** for underscore/lifecycle tables today.
- `app.ts` (standalone `generateApp`) — the only native reaction executor: `runCommand` in-process recursive,
  depth-guarded `< 5`.
- `WorkflowInput` carries `mode: workflow|agent|external` (SPEC-009) — **no** criticality field today.

## 4. Design

### 4.1 The `_events` outbox — spine-owned, gated for byte-identity (TA2, TA5, DX7)
`emit()` gains a durable write to an `_events` table **only in exports where the agent lane is active** —
i.e. the model has ≥1 agent-mode reaction or ≥1 native wake target. When absent, `emit()` is byte-identical
to today (the outbox table, the `AFTER INSERT` trigger, and the write are simply not emitted). The
"**events but zero agents ⇒ byte-identical**" case is an explicit test (§6).

```
_events:  seq bigserial pk, tenant text not null, name text, payload jsonb,
          entity_id text, emitted_at timestamptz default now(), consumed_at timestamptz null
```

- **DDL ownership (TA2):** a new **`lifecycleAdapter`** (an `EngineAdapter`, §4.4) owns `_events`,
  `agent_state`, and the trigger; `migratePostgres` is threaded to diff them like any aggregate. Nothing is
  unowned.
- **n8n unchanged:** `emit()` still POSTs `on/<event>` for workflow/command reactions. The outbox is additive.
- **Routing, corrected (TA5):** policies map `event→command` (`p.then` is a command id) and are served by
  n8n `reaction_*` as today; an **agent** subscribes via its own `wait_for(event)` / an authored agent-mode
  reaction. There is no "policy targets an agent." The outbox `NOTIFY` wakes only agents that are
  `waiting_event` on that name; n8n's `on/<event>` is a separate, unconditional workflow-lane hop. When
  *both* a bound n8n `reaction_*` and a `waiting_event` agent key on the same event, **both** intentionally
  run — the n8n side executes the deterministic command; the agent side resumes its judgment. That is not a
  double-*fire* of one action; it is two distinct subscribers. The spec states this explicitly rather than
  claiming "exactly one engine."
- **Free audit journal**, subject to retention + redaction (§4.9/SEC4).

### 4.2 `agent_state` — lossless resume, generic wake condition, tenant-scoped, spine-written (TA1, TA2, DX4, SEC4)
```
agent_state:  run_id uuid pk, tenant text not null, agent_id text, process_id text null,
              status text,                 -- running | sleeping | waiting_event | waiting_human | done | failed | cancelled
              transcript jsonb,            -- the FULL Anthropic.MessageParam[] — the resume unit (TA1)
              wake_condition jsonb null,   -- { source, ...adapter-owned fields } (DX4)
              wake_at timestamptz null,    -- hot-path scalar, indexed (timer poll); mirrors wake_condition
              decision_log jsonb,          -- ordered {step, kind, tool?, decision?, rationale?, outcome} (UX6)
              tainted boolean default false,-- woken by event/external ingress → untrusted input (SEC2)
              created_at, updated_at timestamptz
```

- **Lossless resume (TA1):** the resume unit is the **full `transcript`** (`Anthropic.MessageParam[]`), not a
  summary — so `tool_use`/`tool_result` pairing is preserved and the model continues exactly where it was.
  The token/PII cost of transcript-in-`jsonb` is acknowledged (retention + redaction, §4.9).
- **HTTP boundary preserved (TA2):** the agents runtime stays **HTTP-only** — it does **not** get a pg driver
  or `DATABASE_URL`. State is read/written **through new authenticated spine routes**
  (`/agent-runs/*`, bearer-gated, `validate.ts`-checked), reusing the command-API discipline. The spine owns
  the table and the connection.
- **Generic wake condition (DX4):** per-source fields live in `wake_condition jsonb` owned by the adapter;
  only `wake_at` is promoted to an indexed scalar for the timer poll. A new wake source adds **no shared
  DDL**.
- **Tenant scoping (SEC4):** `tenant` on every row; the resumer/claim query and the `LISTEN` handler filter by
  it. Note the store's RLS is `USING(true)` today (known gap) — **the agent lane is single-tenant until RLS
  carries a real subject**; this is stated as a precondition, not assumed away.

### 4.3 Suspend / resume tools — sole-in-turn, extensible, with a specified inbound path (TA1, TA7, DX5, SEC3)
Built-in wait tools, each persisting a wake condition and returning (the agent sleeps; no thread blocks):
`wait_until(timestamp)`, `wait_for(event)`, `request_approval(question, options)`.

- **Sole-tool-in-turn (TA1):** a wait tool MUST be the only tool call in its turn. Enforced two ways — the
  behaviour prompt instructs it, and a runtime guard buffers/answers sibling `tool_use`s before suspending so
  the `messages` array is never left malformed (no unanswered `tool_use` → no 400 on resume).
- **Extensible (DX5):** the wait vocabulary is **not** a fixed set — a `WakeSourceAdapter` (§4.4) may declare
  the wait tool(s) it services and the `status`/`wake_condition` it sets; the runtime tool set and AL1's
  resolvable-target list are **derived from the registered sources**.
- **`request_approval` inbound path (TA7, SEC3):** the human is reached over SPEC-013's `notify` channel
  (D7). Their reply re-enters through the spine ingress (§4.5) and resumes the run. The correlation key —
  `resume_token` — **is a bearer capability and is secured** (retracting the earlier "nothing to secure"):
  a **≥128-bit CSPRNG** value, **single-use** (cleared on resume), **time-boxed** (a TTL like `wake_at`), and
  **bound to `{run_id, step, expected_decision}`**; the accepting route verifies it **constant-time** and
  rejects on expiry/reuse. (If, in build, correlation can ride the notify thread id with no token, the
  `resume_token` column is removed entirely so no latent capability exists — decided at build, one way or the
  other, never shipped unspecified.)

### 4.4 The wake seam — a registered `WakeSourceAdapter` (DX1, DX2, DX3, DX6, DX8, TA3, TA4)
Wake is a **first-class registered seam**, byte-for-byte the engines/connectors idiom — not a hardcoded enum.

```ts
// packages/codegen/src/wake/registry.ts
interface WakeSourceAdapter {
  source: WakeSource;                       // descriptor: id, the deployment shape(s) it serves
  applies?(ctx): boolean;
  waitTools(): ToolDef[];                   // the wait primitives this source contributes (DX5)
  emitResumer(ctx): { runtime: string };    // emitted TS: how a due/triggered condition resumes runAgent
}
registerWakeSource(a); getWakeSource(id); registeredWakeSources(); // sorted → deterministic
// built-ins self-register in wake/index.ts
```

- **Auto-pick FROM the registry (DX2, reconciles D6):** the owner still gets no knob — but selection is
  `selectWakeSource(shape)` choosing *from* `registeredWakeSources()`, and a registered third-party source
  declares the shape(s) it serves and participates. Auto-pick is a UX decision; the source **set stays open**.
- **Reconciliation with SPEC-010 (DX6):** wake is adjacent to the engine `react`/`emit` capability but is a
  **distinct registry**, because a wake source pairs a *runtime resumer* with *wait primitives* — neither of
  which the `EngineAdapter` contract expresses. The spec justifies the new registry rather than floating a
  third un-named pattern; naming follows the house idiom (`WakeSourceAdapter`/`registerWakeSource`, DX8).
- **Built-ins:**
  - `postgres` (default, full-stack). **Timer = a Node-side durable poll** (`SELECT … wake_at <= now() FOR
    UPDATE SKIP LOCKED`) on a dedicated worker — **pg_cron is dropped** (TA3: it runs SQL-in-DB, cannot
    invoke a Node LLM loop, and would collapse to this poller anyway while adding a superuser-only extension
    dep for zero gain). Event-wake = the `_events` `NOTIFY` on a **dedicated long-lived `LISTEN` connection**
    (not the checked-in/out `pg.Pool`), resuming `waiting_event` runs; delivery durability is the **table**
    (NOTIFY is only a hint; boot catch-up scans `consumed_at IS NULL` / due `wake_at`).
  - `in-process` (SQLite single-container, degraded). The existing `app.ts` recursive loop for event-wake;
    a best-effort in-memory `setInterval` timer that **does not survive restart** (documented; AL2 flags it).
  - `n8n` (optional, additive). Today's `trigger_*`→`/run` wiring as an opt-in source; never default, never
    required.
- **Acceptance probe (DX3):** register a fourth source (e.g. `redis`) as **one file**; assert **zero
  core-dispatch edits** and **byte-identical export when it is not the selected source** — the extensibility
  gate, exactly like SPEC-010's fake-mysql and SPEC-013's second-connector.

### 4.5 Native external-signal ingress + authentication (SEC1)
External signals reach a **spine route** (`POST /webhook/<path>`), which maps a `TriggersDoc` webhook to a
`runAgent` (via the state routes) — replacing the n8n webhook→HTTP-node→`/run` hop. **It does NOT reuse the
internal command bearer** (that gate is a single shared `API_TOKEN`, open when unset — unusable and
over-broad for third parties):

- **Closed-by-default, per-trigger, per-source verification.** Each trigger declares a `webhookSecretEnv`
  **by name** (invariant #7); the route verifies an **HMAC signature over the raw body**, **constant-time**,
  before admitting the event — mirroring how `N8N_WEBHOOK_TOKEN` already secures the outbound n8n hop. For
  providers that only offer a bearer, mint a **distinct per-trigger token**, never `API_TOKEN`. **No secret
  configured ⇒ the route rejects** (not open).
- A valid signature **admits** the event; it does **not** by itself authorize an autonomous state change —
  that is still subject to §4.6.

### 4.6 Autonomy, taint & the command-write gate (SEC2, SEC5, UX5)
The core threat is *untrusted input → autonomous write*. Closed on three fronts:

- **Taint + gate extension (SEC2).** A run woken from `waiting_event` / external ingress is `tainted=true`
  (it reasoned over attacker-influenceable `payload`). The invocation gate is **extended to the native
  `command` kind** (not only connector `write/send/delete`): any **state-changing command** issued by a
  `tainted` run requires `request_approval` **unless** the grant is explicitly `autonomous` **and** the
  process is marked injection-safe. (Non-tainted, human-initiated runs keep today's behaviour.)
- **Effect-ledger idempotency (SEC5).** Before a `send`/`delete`/`external`/state-changing command, the
  runtime writes a pending effect keyed `{run_id, step, op, arghash}` **in the same transaction** as the
  outcome; on resume, an existing committed key **deterministically short-circuits** the replay. Re-wake
  after a mid-effect crash cannot double-fire an irreversible action — this replaces prompt-suasion with a
  transactional fence.
- **Deliberate autonomy consent (UX5).** Wiring an agent to an autonomous event/timer wake is **not** silent
  codegen: it requires a deliberate, informed consent step (mirroring SPEC-013's "Connect a live account")
  that names the triggering event, the commands the agent may issue unattended, and offers immediate
  pause/disable. Invariant #6 authority now covers the *autonomy to fire*, not just the tools.

### 4.7 Conditional branching lives in the behaviour prompt, with an auditable trace (UX6)
Agent-mode processes (SPEC-009) fold into `behaviours/<id>.md` ("Processes you own"); branching is reasoning
grounded in the process's authored, human-granted commands (invariants #5/#6). To keep it auditable, the
`decision_log` captures a **decision/rationale entry** (the branch taken + the model's stated reason) — not
only tool I/O — and §4.9 projects it as a human-readable timeline.

### 4.8 The determinism boundary — enforceable (TA6)
The SPEC-009 router is the boundary (§0.5). To make it enforceable rather than prose:
- **An authored `determinismCritical` flag on `WorkflowInput`** (or a reused criticality field). **AL4** fires
  when a `determinismCritical` process is routed to agent-mode — now decidable.
- **Idempotency scope stated honestly:** the spine upsert covers **create** commands only; `update`/`send`/
  `delete` re-issue is bounded by the effect ledger (§4.6), not the upsert. The residual is named, not hidden.

### 4.9 Human surfaces — in scope (UX1–UX8, SEC6)
The lane gives agents power to wait and act unsupervised; the matching legibility/consent/control ships with
it:
- **Agent-runs activity view (UX1).** A per-project view projecting `agent_state`: agent, process,
  status (**shape+text, never color-only**), what it waits on, waiting-since, next `wake_at`, with an
  **overdue/stuck** indicator. Not deferred.
- **Approval contract (UX2).** The `request_approval` notification carries: business, agent, the question,
  enumerated options, **rationale + consequence** of each, and a link back to the run; with a concrete reply
  mechanism (distinct action links or a fixed keyword set) that maps to the secured `resume_token` (§4.3).
- **Timeout / reminder / escalation (UX3).** `waiting_human` (and stale `waiting_event`/`sleeping`) have a
  max-wait: re-notify after N, then escalate or auto-fail **with a recorded reason**; stale runs surface as
  overdue in the activity view.
- **Cancel / pause (UX4).** Human write-actions on a run — **cancel** (`sleeping`/`waiting_*` → `cancelled`,
  releasing the timer/listener) and **pause/disable the agent**. "Read-only" refers to the *authoring* stages;
  lifecycle control exists.
- **Readable decision trace (UX6).** The `decision_log` renders as a run timeline (the *why*, not just the
  *what*).
- **Route legibility (UX7).** The activity + Workflows "Run as" views show *why* a process is agent-mode
  ("judgment / HITL / long-lived"), tied to the SPEC-009 classification.
- **Status projection whitelist (SEC6).** The client receives only `{status, wake_at, wake_on_event, step
  count, timestamps, route rationale}` through the authenticated service. **`transcript`, `decision_log`
  detail, `wake_condition`, and `resume_token` are never sent to the browser** (invariant #3; added to the
  secret-never-client-side test).
- **i18n + a11y (UX8).** EN+DE for the seven statuses and the approval notification; shape+text status; aria
  on the new surfaces, per SPEC-013 §4.9.

### 4.10 Validators (additive, pure — AL-series; wording corrected)
- **AL1** a `wait_for(event)`/wake target resolves to a real model event (target list **derived from
  registered wake sources**, DX5).
- **AL2** a timer wake on an `in-process`/SQLite deployment is flagged (won't survive restart).
- **AL3** an agent-mode process whose branches issue a command the agent doesn't own/wasn't granted →
  *fabrication* finding (mirrors SPEC-013 TC4).
- **AL4** a `determinismCritical` process routed to agent-mode → finding (now decidable, §4.8).
- **AL5** *(reworded, SEC8)* **no *authored* write path embeds a secret literal (codegen-time only)** —
  explicitly cross-references the separate **runtime** redaction requirement (§4.9/SEC4); AL5 does not and
  cannot cover runtime-captured secrets.
- **AL6** *(new, SEC2)* `autonomous:true` on an agent that has an event/ingress wake source **and** owns
  state-changing commands → a security finding requiring explicit human sign-off (the autonomy-consent gate,
  §4.6).

## 5. Rollout (demand-gated; no "ships now")
Built as **one lane, only on the §0 signal, only after SPEC-013 Phase C**. Ordered internally as:
1. **Model + seams (pure):** `WakeSourceAdapter` registry + `lifecycleAdapter` (DDL owner) + the probe;
   `agent_state`/`_events` shapes; AL1–AL6; `determinismCritical` on `WorkflowInput`. Byte-identical when the
   lane is unused.
2. **Durable wake end-to-end on solar (the proof):** the `postgres` source — Node timer poll + `LISTEN`
   event-wake + the ingress (HMAC) — wakes the **async Offer Reviewer** on an event and a "remind in N days"
   timer, with lossless transcript resume and the effect ledger. **No n8n in this path.**
3. **HITL + human surfaces:** `request_approval` over notify with the secured resume path; the activity view,
   approval contract, timeout/escalation, cancel/pause, decision trace, i18n. Autonomy-consent gate.

## 6. Testing (to commit)
- **Lossless resume:** a run suspended mid-`wait_for` resumes with the full `transcript`; a wait tool emitted
  alongside sibling tool calls is rejected/buffered (no malformed `messages`).
- **Byte-identity, precise:** export is byte-identical for a model with **events but zero agent-mode
  reactions / zero wake targets** (the `_events`/trigger/state DDL is not emitted); and at zero grants.
- **Extensibility probe (DX3):** a 4th wake source registered in one file → zero core edits, byte-identical
  when not selected.
- **No cross-subscriber confusion:** an event with both an n8n `reaction_*` and a `waiting_event` agent runs
  both intended subscribers; an event with neither writes no outbox row in a lane-inactive export.
- **Ingress auth (SEC1):** a request with a bad/absent HMAC is rejected; a valid signature admits but a
  tainted state-changing command still hits the gate (SEC2).
- **Effect ledger (SEC5):** a re-wake after a simulated mid-effect crash does not double-fire; the committed
  key short-circuits.
- **resume_token (SEC3):** forged/expired/replayed token rejected; single-use enforced.
- **Runtime redaction (SEC4):** `decision_log`/audit never persists a token/credential value; a runtime test
  asserts it (AL5 is codegen-time only).
- **Secret-never-browser (SEC6):** the status projection carries none of `transcript`/`resume_token`/
  `wake_condition`; mirrors the SPEC-013/Nango invariant test.
- AL1–AL6 seeded-defect recall; `LISTEN` boot catch-up recovers events emitted while disconnected.

## 7. Risks & mitigations
- **Muscle drift into a workflow engine (#8).** §0.5 positioning + the SPEC-009 boundary (§4.8) + AL4;
  hold the conservative reading; public "what this is NOT" note.
- **Untrusted-input → autonomous write.** §4.6 taint gate + effect ledger + autonomy consent + AL6.
- **Lossy/malformed resume.** §4.2 full-transcript resume + §4.3 sole-in-turn guard.
- **Ingress exposure.** §4.5 per-trigger HMAC, closed-by-default, distinct from the internal bearer.
- **Data at rest.** Tenant scoping (single-tenant until RLS is real), retention/purge, runtime redaction, a
  browser-projection whitelist (§4.2/4.9).
- **Non-durable timer on SQLite.** Documented + AL2; durable timers require the `postgres` source.
- **Cost/latency per wake.** Agent-mode is low-volume judgment work by construction (§4.8).
- **Extensibility regression.** Averted by the `WakeSourceAdapter` registry + probe (§4.4).

## 8. Decisions
- **D1** — wake sources are a **registered `WakeSourceAdapter` seam**; the built-in default is `postgres`
  (full-stack) / `in-process` (SQLite), `n8n` opt-in. *(Revised from a closed enum, per DX1/DX2.)*
- **D2** — n8n is retained, unchanged, as the workflow engine (owner steer; #8).
- **D3** — no exactly-once for agents; `determinismCritical` work routes to workflow-mode; the boundary is
  enforceable via AL4 (§4.8).
- **D4** — durability lives in the table, not in NOTIFY; **the timer is a Node poll, not pg_cron** (TA3).
- **D5** — the external-signal ingress lives in the spine but uses **per-trigger HMAC**, closed-by-default —
  **not** the internal command bearer (SEC1).
- **D6** — the wake source is **auto-picked by Kiln from the registry**, not a user-facing binding dimension;
  auto-pick does not close the source set (DX2).
- **D7** — `request_approval` reuses SPEC-013's `notify` channel for the human round-trip; the `resume_token`
  correlation key **is a secured capability** (CSPRNG/single-use/TTL/bound) or is removed if correlation can
  ride the notify thread — decided at build, never shipped unspecified (SEC3, retracts "nothing to secure").
- **D8** — agent state is written **through authenticated spine routes**; the agents runtime stays HTTP-only
  (no pg dep). The `lifecycleAdapter` owns `_events`/`agent_state`/trigger DDL (TA2).
- **D9** — the state-change gate covers the **tainted `command` path**, backed by an effect ledger; autonomy
  is a deliberate consent act (SEC2/SEC5/UX5).
- **D10 (owner-confirmed, 2026-07-18)** — *timing*: fold the whole lane behind the demand gate and sequence
  behind SPEC-013 Phase C. The owner accepted the reviewers' recommendation (not overridden, unlike the
  SPEC-013 Nango timing call).
- **D11 (adopt-don't-build — recommended build-time evaluation)** — implement the `postgres` wake source +
  the durable-state/effect-ledger by **adopting a lightweight OSS durable-execution library** rather than
  hand-rolling. Primary candidate **DBOS Transact (TypeScript)** — a *library* (no separate server) on the
  existing Postgres providing durable workflows/queues, exactly-once steps, and crash-safe resume, incl.
  durable AI-agent workflows; it directly owns TA8 (spine-side transactional fence) and SEC10 (the
  dual-write/exactly-once residual) that are error-prone by hand. Alternatives for just the wake/timer layer:
  **Graphile Worker** or **pg-boss** (Postgres `SKIP LOCKED` + `LISTEN/NOTIFY` + cron, MIT). The
  `WakeSourceAdapter` seam (§4.4) makes this an **implementation choice, not an architecture change** — the
  library sits *under* Kiln's `runAgent` as one registered source (invariant #8: Kiln wires it, the library
  is the muscle). Constraints to check in the spike: license must be permissive for anything baked into
  MIT-stamped generated output; the added spine dependency vs the zero-dep `generateApp`; and that the
  library composes with Kiln's generated handlers rather than dictating their structure. **Framework**-level
  agent runtimes (LangGraph interrupt+checkpointer, Mastra suspend/resume) are the HITL *design reference*,
  **not** adopted wholesale — they would own the agent loop and collide with Kiln's runtime + SPEC-013 grants.

## 9. Review & closure

**Panel (REV-037…041):** technical-architecture **Reject**, security-data **Reject**, extensibility-dx
**Reject**, product-strategy **Approve-with-changes**, ux-hitl **Approve-with-changes**. This v0.3.0 revision
addresses every finding; the three Rejecting lenses require **re-review** of their Blockers before `Approved`
(per CONV-001 §5). Disposition of all 30 findings:

| Finding | Disposition |
|---|---|
| **TA1** resume vs in-memory transcript (Blocker) | **Fixed** — full `transcript` is the resume unit; sole-in-turn guard (§4.2/4.3). |
| **TA2** pg coupling + unowned DDL (Blocker) | **Fixed** — state written through spine routes; `lifecycleAdapter` owns DDL; runtime stays HTTP-only (§4.1/4.2, D8). |
| **TA3** pg_cron can't invoke the loop | **Fixed** — dropped; Node `SKIP LOCKED` poll + dedicated `LISTEN` conn (§4.4, D4). |
| **TA4** wake outside the seam / D6 contradiction | **Fixed** — registered `WakeSourceAdapter`; auto-pick from registry (§4.4, D1/D6). |
| **TA5** double-fire under-modelled / byte-identity | **Fixed** — two-subscriber model stated; outbox gated on lane-active (§4.1). |
| **TA6** determinism boundary unenforceable | **Fixed** — authored `determinismCritical` + AL4; idempotency scoped (§4.8). |
| **TA7** approval inbound path unwired | **Fixed** — inbound resume path + secured token (§4.3/4.5). |
| **SEC1** ingress no third-party auth (Blocker) | **Fixed** — per-trigger HMAC by-name, closed-by-default (§4.5, D5). |
| **SEC2** write-gate misses command path (Blocker) | **Fixed** — taint + gate extended to state-changing commands + AL6 (§4.6). |
| **SEC3** resume_token unspecified capability | **Fixed** — secured (CSPRNG/single-use/TTL/bound) or removed (§4.3, D7). |
| **SEC4** at-rest PII/isolation/retention | **Fixed** — tenant scoping (single-tenant until RLS real), retention, runtime redaction (§4.2/4.9). |
| **SEC5** re-wake double-execution | **Fixed** — transactional effect ledger (§4.6). |
| **SEC6** status projection to browser | **Fixed** — whitelist projection + invariant test (§4.9). |
| **SEC7** pg_cron/LISTEN privilege & scope | **Fixed** — pg_cron dropped; `LISTEN`/claim tenant-scoped; channel carries names only (§4.2/4.4). |
| **SEC8** AL5 overclaims | **Fixed** — reworded to authored/codegen-time + runtime cross-ref (§4.10). |
| **DX1** no WakeSourceAdapter/registry (Blocker) | **Fixed** — registry + contract in `wake/` (§4.4). |
| **DX2** auto-pick conflated with closed set | **Fixed** — `selectWakeSource` from registry (§4.4, D6). |
| **DX3** no acceptance probe | **Fixed** — 4th-source one-file probe (§4.4/§6). |
| **DX4** per-source columns → schema fork | **Fixed** — generic `wake_condition jsonb` (§4.2). |
| **DX5** wait tools fixed | **Fixed** — adapter declares wait tools; runtime set derived (§4.3/4.4). |
| **DX6** 4th un-registried pattern | **Fixed** — distinct registry, justified vs `EngineAdapter` (§4.4). |
| **DX7** byte-identity gate ambiguous | **Fixed** — lane-active gate; events-zero-agents test (§4.1/§6). |
| **DX8** naming breaks idiom | **Fixed** — `WakeSourceAdapter`/`registerWakeSource` (§4.4). |
| **UX1** suspended agent invisible (Blocker) | **Fixed** — Agent-runs activity view, in scope (§4.9). |
| **UX2** approval undecidable (Blocker) | **Fixed** — approval contract + reply mechanism (§4.9). |
| **UX3** no timeout/escalation | **Fixed** — max-wait/re-notify/escalate (§4.9). |
| **UX4** no cancel/pause | **Fixed** — cancel + pause/disable actions (§4.9). |
| **UX5** autonomy not consented | **Fixed** — deliberate autonomy-consent gate + AL6 (§4.6/4.9). |
| **UX6** branching unauditable | **Fixed** — `decision_log` rationale + timeline (§4.7/4.9). |
| **UX7** route not legible | **Fixed** — route rationale surfaced (§4.9). |
| **UX8** i18n/a11y | **Fixed** — EN+DE, shape+text, aria (§4.9). |
| **PS1** Phase A ahead of demand (Blocker) | **Accepted (owner-confirmed, D10)** — Phase A retired; whole lane demand-gated (§0). |
| **PS2** Phase A half-built | **Fixed** — folded into one demand-gated build (§0/§5). |
| **PS3** "no n8n" mis-sold | **Fixed** — reframed around durable/HITL value; n8n-free is a consequence (banner/§1). |
| **PS4** ahead of SPEC-013 Phase C | **Accepted (owner-confirmed, D10)** — sequenced behind Phase C (§0). |
| **PS5** aggregate reads as an engine | **Fixed** — §0.5 "what this is NOT" + public note; conservative reading. |
| **PS6** Phase A not minimal | **Fixed** — minimal schema; `resume_token` conditional; substrate = demoed behaviour (§0/§4.2). |
| **PS7** demand signal undefined | **Fixed** — concrete signal + kill criterion (§0). |

### Re-review (v0.3.0 → Approved, 2026-07-18)

All three Rejecting lenses re-reviewed against v0.3.0 to **Approve-with-changes**; **every Blocker closed**
(REV-037/038/040 → v1.1.0). With product-strategy and ux-hitl already at Approve-with-changes and their
items dispositioned above, **all five lenses are Approve-with-changes with no Blocker remaining → `Approved`.**

Four new **non-blocking advisory findings** from the re-review, all **Accepted / deferred to build**:
- **TA8 (Minor)** — the effect-ledger fence must be committed **spine-side** (the runtime is HTTP-only per D8
  and holds no DB transaction); a one-line consistency fix at build. *Accepted.*
- **SEC9 (Minor)** — the `injection-safe` flag that lets an autonomous *tainted* run bypass the gate (§4.6)
  is undefined; define it concretely or drop the bypass. AL6 blunts the risk meanwhile. *Accepted.*
- **SEC10 (Minor)** — out-of-DB effects (`send`/`external`) cannot enlist in the Postgres transaction, so the
  effect ledger converts a double-fire into a possible **silent drop** (dual-write residual); name it in §4.8
  and prefer a provider-side idempotency key where available. *Accepted — a primary driver for D11 (a mature
  durable-execution library owns exactly this).*
- **DX-residual (Nit)** — pin the `lifecycleAdapter` registration + its `applies()` lane-active gate (the
  mechanism enforcing DX7 byte-identity) explicitly at build. *Accepted.*

**Status `Approved` (v1.0.0).** Build remains gated by §0 (demand signal + sequenced behind SPEC-013 Phase C,
D10). The recommended first build step is the **D11 adopt-don't-build spike** (evaluate DBOS Transact /
Graphile Worker as the durable+wake substrate), which retires TA8/SEC10 and the reinvention risk.
