---
id: REV-039
title: Product-strategy review of SPEC-014
type: review
status: In Review
version: 1.0.0
author: Claude (Opus 4.8)
created: 2026-07-18
updated: 2026-07-18
reviews: SPEC-014
lens: product-strategy
verdict: Approve-with-changes
related: [SPEC-014]
---

# REV-039 — SPEC-014, product-strategy lens

**VERDICT: Approve-with-changes.** The design is disciplined and the invariant-#8 framing is careful, but Phase A "ships now" is infrastructure built ahead of any demand signal — it violates the spec's own cited SPEC-005 discipline, delivers zero user-visible capability on its own, and is sequenced ahead of SPEC-013's still-held Phase C (the connectors that would give agents anything to be durable *about*). Gate Phase A behind the same signal as B, sharpen the positioning, and hold.

## Findings

**[PS1] Blocker — Phase A "ships now" has no demand signal; it fails the discipline the spec itself invokes.**
§0 cites "the SPEC-005 shelving discipline," but SPEC-005 shelved the *entire* build until a partner demand signal returned, and SPEC-013 justified shipping because "an agent can be modelled but cannot **operate**" — a concrete, user-visible capability gap. SPEC-014 Phase A ships the `_events` outbox, `agent_state`, and three suspend/resume tools with **no partner asking for durable agents** and **no user-visible capability delta** (the actual wake is Phase B; HITL is Phase C). Building the table + state machine + tools now is exactly the "infrastructure ahead of demand" the methodology forbids. The §0 gate is asserted, not earned. FIX: move Phase A behind the *same* first-agent-mode demand signal as Phase B (they are worthless apart anyway — see PS2); until then this is a `Revised`, build-ready-on-the-shelf design like SPEC-005, not a "ships now."

**[PS2] Major — Phase A alone is a half-built capability that does nothing observable.**
Suspend/resume tools that can suspend but whose only shipped resumer is the degraded in-process `setInterval` scan (Phase B brings the real pg_cron/LISTEN wake) means Phase A, shipped alone, lets an agent call `wait_until`/`wait_for`/`request_approval` and then... mostly not reliably wake. Shipping the suspend half without the durable resume half is the worst of both: new surface area, new tables, new validators, and no dependable behaviour a user can see or a partner can validate. FIX: collapse Phase A into Phase B; ship the lane only when it demonstrably wakes an agent end-to-end on solar. A capability the buyer can't observe isn't a release.

**[PS3] Major — the "no n8n for agents" selling point is largely a solution seeking a problem for Kiln's actual buyer.**
The differentiation only exists *relative to a world where the customer runs n8n* — but Kiln's SMB buyer of a generated solar/dental app overwhelmingly will **not** run n8n at all. To them "we removed the n8n dependency for the agent lane" is invisible: they never saw the dependency. The real customer-facing value ("an agent can wait 3 days, then continue," "pause for a human decision") is a genuine feature, but the spec sells it as *plumbing purity* ("match the outbound n8n-free asymmetry," §1) rather than a job the buyer is hiring Kiln to do. That framing is an internal-purity tell. FIX: rewrite §1's motivation around the *user-observable* behaviour (durable long-lived agents + HITL) and name the buyer and the use case; drop "n8n-free" from the headline value — it is an implementation consequence, not a selling point.

**[PS4] Major — sequenced ahead of SPEC-013 Phase C; you are making agents durable before they can do more than one thing.**
SPEC-013 shipped exactly **one** connector (Spreadsheet) and **HELD** Phase C (the full catalog + grant UI) pending a partner signal. An agent today can be granted one connector. Building an elaborate lifecycle/durability lane for agents that still have a near-empty toolbox is out of order: durability multiplies the value of *capable* agents, and agents aren't capable yet. Opportunity cost is real — the connector catalog is the thing that makes the agent lane worth having a lifecycle for. FIX: state the dependency explicitly — SPEC-014 should not ship before SPEC-013 Phase C has a demand signal and at least a small connector catalog; make that ordering a gate in §0, not an unstated assumption.

**[PS5] Major — market/contributor perception risk: this *is* durable-execution machinery, and disclaiming it in prose won't fully hold the line.**
The spec protests invariant #8 six times, but Phase A/B assemble the canonical parts list of a durable-agent/workflow engine: an event outbox, a per-run state machine with a status column, suspend/resume, timer wake (pg_cron), event wake (LISTEN/NOTIFY), a `SELECT … FOR UPDATE SKIP LOCKED` claim, and boot catch-up. Every one is individually defensible, but the *aggregate* is precisely what a reader (contributor, competitor, or the market) will call "Kiln is becoming an agent-orchestration engine" — the exact thing #8 forbids. The SPEC-009 boundary + AL4 are honest guardrails, but they are internal; the positioning risk is external. FIX: add a short, public-facing "what this is NOT" positioning note (docs-site, not just the spec) drawing the line concretely, and hold the review's most conservative reading — if the aggregate starts to *feel* like a saga executor, that is the signal to stop, not to add one more "bounded" piece.

**[PS6] Minor — Phase A is not minimal; it is the nose of the camel with six statuses.**
"Phase A is one spine line" undersells it: `agent_state` carries a six-value status enum, `working_memory`, `step_log`, `wake_at`, `wake_on_event`, `resume_token`; three new tools; five new validators. That is a substantial durable-state substrate presented as a one-liner. Each field is a future pull toward "just a bit more state." FIX: if PS1/PS2 land and Phase A folds into B, state the *minimum* schema that proves the wake end-to-end on solar and defer `resume_token` (Phase C HITL) and any field the fixture doesn't exercise; keep the substrate exactly as wide as the demoed behaviour, no wider.

**[PS7] Minor — no success metric or kill criterion; "demand signal" is undefined here.**
SPEC-013 pointed at a concrete gap ("cannot operate"). SPEC-014 gates B/C on "the first agent-mode demand signal" and "until a partner needs it" but never says what that signal *is* — which partner, which use case, what utterance counts. Without it, the gate is a rubber stamp the author can self-satisfy. FIX: define the trigger concretely (e.g., "a design partner runs the solar async Offer Reviewer and asks for a wait/escalate behaviour n8n can't cleanly give them") and a kill criterion (if no partner asks within N, the shelf stays closed).

## Summary
1 Blocker, 4 Major, 2 Minor. The engineering design is sound and the #8 framing is unusually careful — this review is not about correctness, it's about *timing and positioning*. The single highest-value change: stop treating Phase A as "ships now," fold it into the demand-gated Phase B, sequence behind SPEC-013's connector catalog, and reframe the value around durable long-lived/HITL agents rather than "n8n-free" plumbing.
