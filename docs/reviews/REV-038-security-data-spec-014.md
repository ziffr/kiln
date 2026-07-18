---
id: REV-038
title: Security-data review of SPEC-014
type: review
status: Approved
version: 1.1.0
author: Claude (Opus 4.8)
created: 2026-07-18
updated: 2026-07-18
reviews: SPEC-014
lens: security-data
verdict: Reject → Approve-with-changes (re-reviewed)
related: [SPEC-014]
---

# REV-038 — SPEC-014, security-data lens

**VERDICT: Reject.** The lifecycle design is directionally right and the outbox/state model is sound, but two Blockers make the agent lane unsafe to ship as specified: the native external-signal ingress (D5) has no way for a third party to authenticate, so it is effectively open; and the SPEC-013 write-gate the spec leans on for blast-radius does **not** cover the native `command` path that §4.5 uses for autonomous action — an event-woken agent reasoning over attacker-controlled `_events.payload` can write to the business DB with zero human gate.

Findings below. Two Blockers, three Major, two Minor, one Nit.

---

## [SEC1] Blocker — the `/webhook/<path>` ingress (D5) has no third-party authentication; "reuses the bearer-auth gate" makes it either open or requires sharing the internal token

§4.4/D5 say the native external-signal ingress lives in the spine and "reuses its existing bearer-auth gate." I read that gate in `spine.ts`: `requireAuth` → `bearerOk` compares `Authorization: Bearer <token>` against a **single shared `API_TOKEN`** (`spine.ts:421–432`). That token is the *internal* secret the UI, n8n HTTP nodes, and the agents runtime present. External webhook callers (a form provider, a payment processor, a partner system — the whole point of an external-signal wake) do not and must not hold the internal `API_TOKEN`. So D5 collapses to one of two bad outcomes:

- If the webhook route is placed behind `requireAuth`, external callers **cannot** authenticate → the trigger is unusable unless you hand a third party your internal command-API bearer, which then also unlocks every command/read route (`app.get("/"+res, requireAuth …)`, `app.post(path, requireAuth …)`). That is a catastrophic over-grant.
- If it is exempted (like `/health`), the route is **unauthenticated** → anyone on the internet who learns/guesses `<path>` can inject an `_events` row / wake a suspended agent at will, driving autonomous downstream action (compounds SEC2).

Worse, the gate is **opt-in**: `if (!API_TOKEN) return true` (`spine.ts:423`) — an unset `API_TOKEN` means the ingress is OPEN by default, and the export ships with it unset (boot only `console.warn`s, `:447`). A public agent-wake surface must not inherit a default-open, single-shared-secret gate.

**FIX:** Do not reuse the internal bearer for external ingress. Specify **per-trigger, per-source verification**: an HMAC signature over the raw body keyed by a `webhookSecretEnv` declared by-name on the `TriggersDoc` (invariant #7), verified constant-time before the event is admitted — mirroring how `N8N_WEBHOOK_TOKEN` already secures the outbound n8n hop (`spine.ts:390–397`). For providers that only offer a bearer, mint a **distinct per-trigger token** (not `API_TOKEN`). The ingress must be closed-by-default (reject when no secret is configured, not open). State that a valid signature admits the event but still does **not** authorize an autonomous write (see SEC2).

## [SEC2] Blocker — the SPEC-013 write-gate does not cover the native `command` path; the §4.5 autonomous branch is ungated

§4.7 asserts "**The SPEC-013 write/send/delete gate** bounds the blast radius of a mis-reasoned repeat," and §4.3 says `request_approval` is "the durable form of SPEC-013 §4.7 SEC4." But that gate only guards **connector** ops: `requiresConfirmation(kind, autonomous)` returns true only for `GATED_KINDS = {write, send, delete}` (`agents.ts:696–699`, `runConnector` `:772–782`). The autonomous action §4.5 actually describes is issuing a **command** — "if the lead qualifies, issue *Offer*" — and a command tool is `kind:"command"` (`agents.ts:33`), which POSTs the spine directly (`tools.ts` command path) and is **not** in `GATED_KINDS`. So the primary autonomous write in this spec — an event-woken agent reasoning over attacker-influenceable `_events.payload` and branching into a spine command — passes through **no** confirmation gate at all. The "reading untrusted data + an autonomous write is the core threat" that SEC4 was written for is exactly this path, and it is unguarded here.

Combined with an event wake (SEC1) and `autonomous:true`, this is a prompt-injection → unconfirmed autonomous state-change primitive: a hostile payload in a webhook or an inbound event steers the model into `create/update` commands against the business DB.

**FIX:** Extend the invocation gate to the native `command` kind when the run was woken by an **event/external ingress** (i.e. the reasoning consumed untrusted `payload`), not only connector `write/send/delete`. Introduce a taint notion: a run resumed from `waiting_event`/ingress is "untrusted-input" and any state-changing command it issues requires `request_approval` unless the grant is explicitly `autonomous` **and** the process is marked injection-safe. Add an AL validator: `autonomous:true` on an agent that has an event/ingress wake source AND owns state-changing commands → a security finding requiring explicit human sign-off (mirror AL4's shape).

## [SEC3] Major — `resume_token` is a capability but D7 declares "no token surface to secure," leaving entropy/expiry/scope/single-use unspecified

The `agent_state` schema carries `resume_token text null` — "what a human-approval callback presents to resume" (§4.2/§4.3). Presenting it resumes a run that may then perform writes, so it **is** a bearer capability. Yet D7 claims reusing SPEC-013's notify channel means "no dedicated approval endpoint/token surface to secure." These contradict: a reply that resumes the run must be matched to a run *somehow*, and if that matching key is the `resume_token`, then a surface accepting it exists and is unspecified — no stated entropy (must be ≥128-bit CSPRNG, not a `seq`/uuid-v4-from-time), no expiry, no single-use/one-time semantics, no binding to the specific run+step+decision. As written it is forgeable or replayable: guess/replay a token → resume a suspended autonomous agent → drive its downstream commands.

**FIX:** Either (a) fully own the resume surface: `resume_token` is a ≥128-bit CSPRNG value, single-use (cleared on resume), time-boxed (`wake_at`-style TTL), and bound to `{run_id, step, expected_decision}`; the accepting endpoint verifies it constant-time and rejects on expiry/reuse — and document it as a secured surface (retract the D7 "nothing to secure" claim). Or (b) if the human round-trip truly rides the notify channel with no token (correlation by notify thread id), **remove `resume_token` from the schema** so no latent capability exists. Do not ship the field with no security semantics.

## [SEC4] Major — durable PII/secret at rest in `_events`/`agent_state` with no tenant isolation, retention, or redaction; AL5 only catches codegen-time literals

`_events.payload jsonb`, `agent_state.working_memory jsonb`, and `agent_state.step_log jsonb` persist arbitrary business data indefinitely (`emitted_at`/`created_at`, no purge). Concretely:
- **No isolation.** These new tables land in a store where RLS is `USING(true)` (CLAUDE.md known gap). The event `LISTEN` loop "resumes the matching suspended agents" with no owner/tenant predicate — cross-tenant wake and cross-tenant read of `step_log` are possible in any multi-tenant deployment.
- **No retention / encryption-at-rest posture.** The spec calls the outbox a "free audit journal" but never says how long PII lives there or that it should be encrypted/purged. An append-only journal of every event payload is a standing breach-blast-radius.
- **step_log can capture secrets.** It records `{step, tool, input, outcome}` (§4.2). A connector op's `outcome` is provider data (inbox bodies, sheet rows); a command `input` is business PII; and if `working_memory`/`step_log` ever echoes the `resume_token` or a resolved value it becomes a secret store — directly at odds with SPEC-013 SEC5 ("secret-free audit log"). AL5 ("no write path carries a secret **literal**") is a *codegen-time pure* check and cannot see anything captured at **runtime**, so it gives false assurance here.

**FIX:** (1) State the tenant model: `_events` and `agent_state` carry an owner/tenant column and the resumer/`LISTEN` claim is scoped by it; note RLS `USING(true)` must be replaced before multi-tenant hosting (or restrict the agent lane to single-tenant until then). (2) Specify retention (TTL/purge of `consumed_at`-set events and `done`/`failed` runs) and an encryption-at-rest expectation for the jsonb columns. (3) Require a **runtime redaction** rule for `step_log`/audit (never persist token/credential values, never the `resume_token`) and add a runtime test — AL5 is not sufficient. Make it explicit that step_log inherits SPEC-013 SEC5's secret-free discipline.

## [SEC5] Major — at-least-once re-wake can double-execute an irreversible side effect; the stated mitigations don't cover non-idempotent ops

§4.7 accepts non-determinism but its mitigations are weak against **double execution of side effects**: (a) idempotent-upsert only helps *create-by-stable-id*, not a `send` (email/Slack/notify) or `delete` or an external connector call — those are not idempotent; (b) "the behaviour prompt instructs 'check `step_log` before repeating'" is a **non-binding instruction to a non-deterministic model** — precisely the actor §4.7 admits may "reason differently." The durability design makes this concrete: a resumer claims work `FOR UPDATE SKIP LOCKED` and marks `consumed_at`, but if the process performs the side effect and then crashes **before** committing `consumed_at`/the `step_log` entry, boot catch-up (`consumed_at IS NULL`) re-wakes the run and re-fires the effect. This is a safety issue, not just a quality one — a re-woken "issue refund"/"send notice"/"delete record" runs twice.

**FIX:** For gated/side-effecting ops, require an **effect ledger with an idempotency key** committed in the *same* transaction as the outcome: before performing a `send/delete/external`/state-changing command, write a pending effect keyed by `{run_id, step, op, arghash}`; on resume, an existing committed key short-circuits the replay deterministically (not via prompt suasion). State the ordering guarantee (effect-record commit fences the side effect) rather than delegating it to model behaviour.

## [SEC6] Minor — "suspend/resume surfaces as read-only status" is unspecified for secret-never-in-browser (invariant #3)

Non-goals say resume state "surfaces as read-only status." The spec never says **what** is projected to the client. If that status view serializes `step_log`/`working_memory` (connector outputs, PII) or — worst — the `resume_token`, it pushes a capability and sensitive data to the browser, violating invariant #3. There is currently no redacted projection defined.

**FIX:** Define the status projection explicitly as a whitelist (`status`, `wake_at`, `wake_on_event`, step count, timestamps) served through the authenticated service; `working_memory`, `step_log`, and `resume_token` are **never** sent to the browser. Add it to the secret-never-client-side invariant test alongside the SPEC-013/Nango case.

## [SEC7] Minor — pg_cron / `LISTEN` privilege and fan-out scope unstated

pg_cron cannot itself call the LLM/`runAgent`; it can only run SQL, so timer wake must signal the runtime (a `pg_notify`/`wake_jobs` claim) — the mechanism, and pg_cron's elevated DB privilege, are unspecified (an over-privileged cron role is its own risk surface). Separately, any DB role with a connection can `LISTEN 'kiln_events'` and observe event *names*; and the resumer's "matching suspended agents" has no scoping predicate stated (ties to SEC4's isolation gap).

**FIX:** Specify the least-privilege role pg_cron runs as and the exact signal path from a due `wake_at` to `runAgent`; scope the `LISTEN`/claim query by owner/tenant; note that event names on the channel are visible to any DB role and must not encode PII.

## [SEC8] Nit — AL5's wording overclaims; make the codegen-vs-runtime boundary explicit

AL5 ("no `_events`/`agent_state` write path carries a secret literal") reads as if it guarantees the state tables are secret-free. It is a pure codegen-time validator and only catches **authored literals**; it cannot see runtime-captured secrets/PII (SEC4). Left as-is it invites false confidence.

**FIX:** Reword AL5 to "no *authored* write path embeds a secret literal (codegen-time)" and cross-reference the separate **runtime** redaction requirement added under SEC4/SEC5.

---

### Summary

| Severity | Count | IDs |
|---|---|---|
| Blocker | 2 | SEC1, SEC2 |
| Major | 3 | SEC3, SEC4, SEC5 |
| Minor | 2 | SEC6, SEC7 |
| Nit | 1 | SEC8 |

The spec's framing (n8n stays the workflow engine; agent lane gets purpose-built state) is coherent and the outbox/durability-in-the-table design is good. But on the security-data lens it is **not** shippable as written: the external ingress has no honest third-party auth story (SEC1), and the blast-radius argument rests on a write-gate that does not actually cover the autonomous command path the design uses (SEC2). Resolve both Blockers and the resume_token/at-rest/replay Majors, then re-review.

---

## Re-review (v0.3.0, 2026-07-18)

Re-read SPEC-014 v0.3.0 and re-verified the underlying code claims: `GATED_KINDS={write,send,delete}` still excludes `kind:"command"` (`agents.ts:697`), the command tool POSTs the spine directly (`:454`), `API_TOKEN` is a single shared bearer, open when unset (`spine.ts:421–447`), and the `N8N_WEBHOOK_TOKEN` HMAC-style hop the fix mirrors exists (`spine.ts:390`). The revision's fixes are grounded and implementable.

Per-finding disposition:

- **SEC1 (Blocker) — CLOSED.** §4.5/D5 drop the internal-bearer reuse. The ingress now verifies a per-trigger **HMAC over the raw body**, keyed by a `webhookSecretEnv` declared **by name** (invariant #7), **constant-time**, **closed-by-default** ("no secret configured ⇒ the route rejects"), with a **distinct per-trigger token** (never `API_TOKEN`) for bearer-only providers. It also states a valid signature admits but does not authorize a write (hands off to SEC2). Exactly the fix asked for, plus a §6 test (bad/absent HMAC rejected).
- **SEC2 (Blocker) — CLOSED.** §4.6 adds a `tainted` column set on event/external-ingress wake and **extends the invocation gate to the native `command` kind**: a tainted, state-changing command requires `request_approval` unless the grant is explicitly `autonomous` **and** the process is `injection-safe`. **AL6** (new, §4.10) fires on `autonomous:true` + event/ingress wake + state-changing commands, requiring human sign-off. The ungated autonomous-command path is closed.
- **SEC3 (Major) — CLOSED.** §4.3/D7 retract the "nothing to secure" claim and fully specify `resume_token`: **≥128-bit CSPRNG, single-use (cleared on resume), TTL-boxed, bound to `{run_id, step, expected_decision}`, verified constant-time**, rejected on expiry/reuse — or the column is removed at build if correlation rides the notify thread. Both branches are secure; §6 tests forged/expired/replayed rejection.
- **SEC4 (Major) — CLOSED.** §4.2/4.9 add a `tenant` column with the resumer/`LISTEN`/claim filtered by it, an explicit **single-tenant-until-RLS-is-real precondition** (not assumed away), retention/purge, and a **runtime redaction** rule for `decision_log`/audit with a runtime test — correctly separated from the codegen-time AL5.
- **SEC5 (Major) — CLOSED.** §4.6 replaces prompt-suasion with a **transactional effect ledger** keyed `{run_id, step, op, arghash}`, committed in the same transaction as the outcome; a committed key deterministically short-circuits replay. §6 simulates a mid-effect crash.
- **SEC6 (Minor) — CLOSED.** §4.9/§6 define a status **whitelist** (`status, wake_at, wake_on_event, step count, timestamps, route rationale`); `transcript`/`decision_log` detail/`wake_condition`/`resume_token` are never sent to the browser, added to the secret-never-client-side invariant test.
- **SEC7 (Minor) — CLOSED.** §4.4/D4 drop pg_cron for a Node `SKIP LOCKED` poll; `LISTEN`/claim are tenant-scoped; the channel carries event **names only** (noted as visible to any DB role).
- **SEC8 (Nit) — CLOSED.** §4.10 rewords AL5 to "no *authored* write path embeds a secret literal (codegen-time only)" and cross-references the runtime redaction requirement.

**New / residual findings (non-blocking):**

- **[SEC9] Minor (new)** — the `injection-safe` process flag (§4.6) that lets an autonomous tainted run bypass the command gate is **undefined**: no criteria for who asserts it or what makes a process injection-safe. AL6's human sign-off blunts silent abuse, but the flag needs a definition at build (a self-asserted boolean is a soft bypass). Not a Blocker.
- **[SEC10] Minor (new)** — the effect ledger (§4.6) fences a Postgres transaction, but `send`/`external` effects call **out-of-DB providers** that cannot enlist in that transaction. Committing the pending key *before* the external call converts at-least-once into possible **at-most-once** (crash between key-commit and provider call → effect silently dropped on resume). This is the honest dual-write residual; acceptable for a low-volume judgment lane and strictly better than double-firing, but should be **named** in §4.8's residual list, not left implicit.

**CLOSING VERDICT: Approve-with-changes. Both Blockers (SEC1, SEC2) are CLOSED; all three Majors (SEC3–SEC5) and both Minors and the Nit are CLOSED. No Blockers remain.** Two new Minors (SEC9 injection-safe definition, SEC10 dual-write drop residual) are advisory and do not gate approval — fold them into build. Security-data lens lifts its Reject.
