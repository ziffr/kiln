---
id: RES-004
title: DBOS Transact spike — durable long-lived agent state, scheduling & HITL, verified with real code
type: research
status: Draft
version: 0.1.0
author: Claude (Opus 4.8)
created: 2026-07-18
updated: 2026-07-18
supersedes: null
related: [SPEC-014, SPEC-013, SPEC-009, RES-002, RES-003]
---

# RES-004 — DBOS Transact spike

## 1. The question

SPEC-014 (Approved) needs a durable substrate for the agent lane: long-lived state + suspend/resume,
scheduling/timers, and human-in-the-loop — and its decision **D11** recommends *adopting* a lightweight
OSS durable-execution library rather than hand-rolling the `agent_state` table, the SKIP-LOCKED poller,
the effect-ledger, and the `recv`/resume plumbing (the fiddly parts the five-lens review flagged: TA1
lossless resume, TA3 the poller, SEC5/SEC10 the effect fence). The owner's question after a doc read:
**does DBOS Transact (TS) actually have what we need — long-lived state + scheduling — and does it really
work?** This spike answers with **real code against a real Postgres**, not documentation summaries.

## 2. Method

- **Env:** Node 22, PostgreSQL 16 (local cluster), `@dbos-inc/dbos-sdk@4.23.6`, MIT. Embedded library —
  **no separate server, no Postgres extension** (confirmed operationally: DBOS created its own `dbos.*`
  schema on launch against a stock database).
- **Model:** the solar **async Offer Reviewer** agent as a DBOS workflow —
  `step qualifyLead → durable sleep (timer) → recv (human approval) → step issueOffer`.
- **The test that matters (durability):** run the workflow, let `qualifyLead` + the timer complete and
  the workflow enter the approval wait, then **hard-crash the process** (`process.exit`, no graceful
  shutdown). Relaunch a **fresh process**; it must recover the workflow from Postgres, resume at the
  wait **without re-running the completed `qualifyLead` step**, accept a `send()` approval, run
  `issueOffer`, and complete. Each step appends to an **effects ledger file** with its PID so
  re-execution is directly observable across the crash.

## 3. The code (verbatim, the load-bearing parts)

```js
DBOS.setConfig({ name: 'dbos-spike',
  systemDatabaseUrl: 'postgres://dbos:dbos@127.0.0.1:5432/dbos_spike' });

const qualifyLead = DBOS.registerStep(async (leadId) => {
  append(`qualifyLead lead=${leadId} pid=${process.pid} ...`); return 'qualified';
}, { name: 'qualifyLead' });

const issueOffer = DBOS.registerStep(async (leadId, decision) => {
  append(`issueOffer lead=${leadId} decision=${decision} pid=${process.pid} ...`); return 'offer-sent';
}, { name: 'issueOffer' });

const offerReview = DBOS.registerWorkflow(async (leadId) => {
  const q = await qualifyLead(leadId);
  await DBOS.sleepSeconds(2);                              // durable timer ("wait N days")
  const decision = await DBOS.recv('approval', { timeoutSeconds: 300 }); // durable HITL wait
  const r = await issueOffer(leadId, decision);
  return { leadId, qualified: q, decision, offer: r };
}, { name: 'offerReview' });

// PHASE start:  await DBOS.startWorkflow(offerReview, { workflowID: 'offer-42' })('lead-42');
//               ...wait for step1+timer, enter recv... then process.exit(137)  // CRASH
// PHASE resume: await DBOS.launch();                       // recovers pending workflows
//               await DBOS.send('offer-42', 'APPROVED', 'approval');
//               await DBOS.retrieveWorkflow('offer-42').getResult();
```

## 4. Results — PASS

**Run output (two separate processes):**
```
PHASE 1 (start + crash)
  [wf] step1 qualifyLead -> qualified; entering durable sleep (timer)...
  [wf] timer elapsed; awaiting human approval via recv (HITL)...
  [start] >>> simulating CRASH (process.exit) mid-workflow <<<

PHASE 2 (relaunch + recover + approve)   ← fresh process
  [resume] relaunched; DBOS recovering pending workflow offer-42...
  [resume] sending human approval -> DBOS.send(topic=approval)
  [wf] approval received: APPROVED; issuing offer...
  [wf] step2 issueOffer -> offer-sent; workflow complete
  [resume] workflow result: {"leadId":"lead-42","qualified":"qualified","decision":"APPROVED","offer":"offer-sent"}

  EFFECTS LEDGER:
    qualifyLead lead=lead-42 pid=4873 ...   ← original (crashed) process
    issueOffer  lead=lead-42 decision=APPROVED pid=4893 ...   ← new process
  qualifyLead executions: 1  (expect exactly 1 — proves no re-run after crash)
  issueOffer  executions: 1  (expect exactly 1)
  RESULT: PASS
```

**Durable state in Postgres (independent confirmation):**
```
dbos.workflow_status:  offer-42 | SUCCESS | offerReview
dbos.operation_outputs (the memoized, exactly-once step ledger):
   0 qualifyLead   1 DBOS.sleep   2 DBOS.recv   3 DBOS.sleep   4 issueOffer
system tables present: notifications (send/recv), workflow_events (setEvent/getEvent),
                       workflow_schedules (cron), workflow_queue, workflow_inputs
```

The completed `qualifyLead` step ran on the **dead** pid (4873) and was **not** re-executed by the
recovering process (4893) — its output was memoized in `operation_outputs`. The timer and the `recv`
wait survived the crash. This is exactly SPEC-014's suspend/resume + wait_until + wait_for +
request_approval, working, durably, on stock Postgres.

## 5. Mapping to SPEC-014 (what DBOS supplies vs what stays Kiln's)

| SPEC-014 mechanism | DBOS primitive (verified) | Verdict |
|---|---|---|
| Lossless resume (TA1) | Workflow replay + **step memoization** (`operation_outputs`) | **Supplied** — steps return memoized results on replay; no transcript blob needed |
| `wait_until` timer (§4.3/4.4) | `DBOS.sleepSeconds` (durable, in `operation_outputs`) | **Supplied** |
| `wait_for(event)` (§4.3) | `DBOS.recv(topic, {timeoutSeconds})` (durable; `notifications`) | **Supplied** |
| `request_approval` HITL (§4.3) | `recv` + `DBOS.send(wfID, msg, topic)` from a webhook | **Supplied** (their documented HITL pattern) |
| Scheduling / cron (§4.4) | `DBOS.scheduled` (`workflow_schedules`) | **Supplied** (not exercised here; table present) |
| Node poller, not pg_cron (TA3) | DBOS *is* the durable engine; no pg_cron, no extension | **Supplied — resolves TA3 + extension worry** |
| `_events` outbox (§4.1) | DBOS Transactional-Outbox pattern | Supplied (not exercised) |
| Exactly-once state change (SEC5) | Workflow idempotency (`workflowID`) + step memoization | **Supplied for completed steps** (demonstrated) |
| HMAC ingress, taint/command gate, Nango notify, tenant/RLS, activity-view UI, i18n | — | **Stay Kiln's** regardless |

## 6. Honest caveats (what the spike also proved, and its limits)

1. **Workflow-body code re-executes on replay — only *steps* are memoized.** In Phase 2 the workflow's
   `console.log` lines printed *again* (the body replays), while `qualifyLead` did *not* re-run. This is
   the core integration constraint: Kiln's `runAgent` loop must be **restructured into a DBOS workflow
   where every LLM call and every tool call is a `step`**, and the loop body between steps must be
   **deterministic** (no uncheckpointed `Date.now()`/random/IO). That is a real refactor of the generated
   agents runtime, not a drop-in — the D11 spike's chief cost, now concretely sized.
2. **SEC10 stands — the spike does NOT refute it.** It proved exactly-once for a step that *completed
   before* the crash. It does **not** (and cannot) prove exactly-once for a step interrupted *mid-side-
   effect*: DBOS steps are **at-least-once until their completion is checkpointed**, so a crash after an
   external `send`/charge but before the checkpoint re-runs it on recovery. For out-of-DB effects you
   still supply a **provider idempotency key** (DBOS says so explicitly). Adopting DBOS gives the ledger
   machinery and honesty, not a magic exactly-once across the non-transactional boundary — exactly as
   SPEC-014 §4.6/SEC10 states.
3. **Admin-server IPv6 quirk (env, not DBOS):** launch logged `EAFNOSUPPORT ::1:3001` (this container has
   no IPv6 loopback); non-fatal, the workflow ran. In a generated app, disable the admin server or bind
   it to IPv4 — a one-line config note for the exporter.
4. **`recv` implements its timeout via an internal `DBOS.sleep`** (visible as the extra `operation_outputs`
   row) — an implementation detail, harmless, noted for anyone reading the step ledger.
5. **License/footprint confirmed operationally:** MIT; embedded library; stock Postgres, no extension; it
   self-provisions its `dbos.*` schema. Fits Kiln's MIT-stamped generated output and the `postgres`
   `WakeSourceAdapter` source. (Not usable for the SQLite single-container / zero-dep `generateApp` path —
   that keeps the hand-rolled `in-process` degraded source, per the seam.)

## 7. Verdict & recommendation

**DBOS Transact does what SPEC-014 needs for long-lived state + scheduling + HITL — verified with real
code and real durable state, not docs.** It maps almost primitive-for-primitive onto §4.2/4.3/4.4 and
*deletes* the most error-prone hand-rolled pieces (the memoized step ledger IS the effect-ledger; `recv`
IS the durable wait; `sleep` IS the durable timer; workflow recovery IS the resumer — no pg_cron, no
extension). **D11 is confirmed: adopt, don't build, for the `postgres` wake source + durable agent
state.**

Two things adoption does **not** remove, both already honest in SPEC-014: the **out-of-DB double-fire
residual (SEC10)** and the **runtime refactor cost** (structuring `runAgent` as a DBOS workflow with
steps + deterministic body). Neither is a blocker; both are now concretely sized.

**Recommended next steps (still gated by SPEC-014 §0 demand signal — this is a spike, not a build):**
1. Fold this result into SPEC-014 **D11** as a "verified" note (spike evidence, the two sized caveats).
2. When the demand signal lands, scope the `runAgent`→DBOS-workflow refactor: LLM call = step, tool call
   = step, wait tools = `sleep`/`recv`; keep the loop body deterministic. Prototype against the real
   generated agents runtime (this spike used a standalone model of it).
3. Add a `dbos` `WakeSourceAdapter` as the built-in `postgres` source; keep `in-process` (SQLite) and
   `n8n` (opt-in) as the other registered sources — the seam already accommodates this.
4. Hold the invariant-#8 line: DBOS backs the **agent lane** only; the deterministic **workflow lane**
   stays n8n (SPEC-009 boundary). Do not let a durable-execution engine in the door become Kiln's
   workflow engine.

*(Spike artifacts — `spike.mjs`, the effects ledger, the Postgres `dbos.*` tables — live in the session
scratchpad, gitignored; the verbatim output above is the record.)*
